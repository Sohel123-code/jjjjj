import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { nearbyCall, attestNetwork } from '../lib/nearby.js';
import { subscribeSignal } from '../lib/supabaseBackend.js';

// Real-time location and 1-on-1 live chat over Socket.io
export function useNearbySocket({
  zoneId,
  fix,
  share,
  networkId = null,
  peerId = null,
  enabled = true,
  demo = false,
  me = null,
  boundary = null
}) {
  const [snapshot, setSnapshot] = useState({ people: [], messages: [], networks: [] });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('connected');
  const [networkStatus, setNetworkStatus] = useState('');

  const socketRef = useRef(null);
  const epoch = useRef(0);
  const pending = useRef(false);
  const lastTyping = useRef(0);
  const request = useRef(0);
  const activePeer = useRef(peerId);
  activePeer.current = peerId;

  // Optional background refresh via Supabase RPC (won't clobber live socket state on error)
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const current = epoch.current, sequence = ++request.current;
    try {
      const next = await nearbyCall('snapshot', { zoneId, networkId, peerId });
      if (current === epoch.current && sequence === request.current && next) {
        setSnapshot(prev => ({
          people: (next.people && next.people.length > 0) ? next.people : prev.people,
          messages: (next.messages && next.messages.length > 0) ? next.messages : prev.messages,
          networks: next.networks || prev.networks
        }));
      }
    } catch {
      // Ignored: Socket.io handles live users and messages seamlessly
    }
  }, [enabled, zoneId, networkId, peerId]);

  // Main lifecycle effect for Socket.io
  useEffect(() => {
    epoch.current++;
    setError('');

    if (!enabled) {
      setStatus('locked');
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    let socket;
    if (typeof window !== 'undefined' && typeof window.location !== 'undefined') {
      try {
        socket = io({
          transports: ['polling', 'websocket'],  // polling first avoids WS-closed errors
          autoConnect: true,
          reconnectionAttempts: 10,
          reconnectionDelay: 1000,
          timeout: 6000
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          setStatus('connected');
          setError('');
          socket.emit('join-geofence', {
            zoneId: zoneId || 'campus-live',
            user: me || { id: 'me', alias: 'You', avatar: '🦊' },
            fix,
            boundary
          });
        });

        socket.on('geofence-users', users => {
          setSnapshot(prev => ({
            ...prev,
            people: users || []
          }));
        });

        socket.on('private-message', msg => {
          setSnapshot(prev => {
            const isRelevant = activePeer.current && 
              (msg.peerId === activePeer.current || msg.authorId === activePeer.current);
            if (!isRelevant) return prev;
            if (prev.messages.some(m => m.id === msg.id || (m.clientId && m.clientId === msg.clientId))) return prev;
            return {
              ...prev,
              messages: [...prev.messages, msg]
            };
          });
        });

        socket.on('private-history', ({ peerId: pId, messages }) => {
          if (activePeer.current === pId) {
            setSnapshot(prev => ({
              ...prev,
              messages: messages || []
            }));
          }
        });

        socket.on('zone-message', msg => {
          if (!activePeer.current) {
            setSnapshot(prev => {
              if (prev.messages.some(m => m.id === msg.id || (m.clientId && m.clientId === msg.clientId))) return prev;
              return {
                ...prev,
                messages: [...prev.messages, msg]
              };
            });
          }
        });

        socket.on('zone-history', msgs => {
          if (!activePeer.current) {
            setSnapshot(prev => ({
              ...prev,
              messages: prev.messages.length ? prev.messages : (msgs || [])
            }));
          }
        });

        socket.on('typing', ({ from, isTyping }) => {
          setSnapshot(prev => ({
            ...prev,
            people: prev.people.map(p => p.id === from ? { ...p, typing: isTyping } : p)
          }));
        });

        socket.on('message-deleted', ({ targetId }) => {
          setSnapshot(prev => ({
            ...prev,
            messages: prev.messages.filter(m => m.id !== targetId && m.clientId !== targetId)
          }));
        });

        socket.on('message-edited', ({ targetId, text, editedAt }) => {
          setSnapshot(prev => ({
            ...prev,
            messages: prev.messages.map(m => (m.id === targetId || m.clientId === targetId) ? { ...m, text, editedAt } : m)
          }));
        });
      } catch {
        // Socket error handled gracefully
      }
    }

    refresh();
    let debounce;
    const unsubscribe = subscribeSignal(zoneId, () => {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, 200);
    });

    return () => {
      epoch.current++;
      request.current++;
      unsubscribe?.();
      clearTimeout(debounce);
      if (socket) {
        socket.disconnect();
        socketRef.current = null;
      }
    };
  }, [zoneId, networkId, peerId, enabled, demo, refresh]);

  // Peer conversation load on select or switch back to zone public chat
  useEffect(() => {
    if (enabled && peerId && socketRef.current?.connected) {
      socketRef.current.emit('get-private-history', {
        peerId,
        myId: me?.publicId || me?.id || 'me'
      });
    } else if (enabled && !peerId && socketRef.current?.connected) {
      socketRef.current.emit('get-zone-history', {
        zoneId: zoneId || 'campus-live'
      });
    }
  }, [peerId, enabled, zoneId, me?.publicId, me?.id]);

  // Real-time location presence
  useEffect(() => {
    if (!enabled || !fix || demo) return;

    if (socketRef.current?.connected) {
      socketRef.current.emit('join-geofence', {
        zoneId: zoneId || 'campus-live',
        user: me || { id: 'me', alias: 'You', avatar: '🦊' },
        fix,
        boundary
      });
    }

    nearbyCall('presence', { zoneId, fix, share }).catch(() => {});
  }, [zoneId, fix?.latitude, fix?.longitude, boundary?.radiusM, share, enabled, demo]);

  // LAN Gateway verify
  useEffect(() => {
    if (!enabled || demo || !import.meta.env.VITE_LAN_GATEWAY_URL) return;
    let cancelled = false;
    const verify = () => attestNetwork(zoneId).then(r => {
      if (!cancelled) setNetworkStatus('Connected to ' + r.name);
    }).catch(() => {
      if (!cancelled) setNetworkStatus('Campus network not detected');
    });
    verify();
    const timer = setInterval(verify, 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled, zoneId, demo]);

  // Instant messaging mutations
  async function mutate(action, values) {
    if (pending.current) throw Error('Your previous message is still sending.');
    pending.current = true;

    try {
      if (action === 'send') {
        const text = values.text?.trim();
        if (!text) return;
        const clientId = values.clientId || crypto.randomUUID();
        const sender = me || { id: 'me', alias: 'You', avatar: '🦊' };
        const myId = sender.publicId || sender.id || 'me';

        const newMsg = {
          id: clientId,
          clientId,
          authorId: myId,
          peerId: peerId || null,
          alias: sender.alias || 'You',
          avatar: sender.avatar || '🦊',
          text,
          createdAt: new Date().toISOString()
        };

        // Optimistically add to UI state
        setSnapshot(prev => {
          if (prev.messages.some(m => m.id === clientId || m.clientId === clientId)) return prev;
          return { ...prev, messages: [...prev.messages, newMsg] };
        });

        // Broadcast live via Socket.io
        if (socketRef.current?.connected) {
          if (peerId) {
            socketRef.current.emit('private-message', {
              to: peerId,
              text,
              clientId,
              sender: {
                id: myId,
                alias: sender.alias || 'You',
                avatar: sender.avatar || '🦊'
              },
              zoneId: zoneId || 'campus-live'
            });
          } else {
            socketRef.current.emit('zone-message', {
              zoneId: zoneId || 'campus-live',
              text,
              clientId,
              sender: {
                id: myId,
                alias: sender.alias || 'You',
                avatar: sender.avatar || '🦊'
              }
            });
          }
        }

        // Background sync to DB if available
        nearbyCall(action, { zoneId, networkId, peerId, ...values }).catch(() => {});
        return newMsg;
      }

      if (action === 'delete') {
        const target = values.target;
        if (socketRef.current?.connected) {
          socketRef.current.emit('delete-message', {
            targetId: target,
            peerId,
            myId: me?.publicId || me?.id || 'me',
            zoneId: zoneId || 'campus-live'
          });
        }
        setSnapshot(prev => ({
          ...prev,
          messages: prev.messages.filter(m => m.id !== target && m.clientId !== target)
        }));
        nearbyCall(action, { zoneId, networkId, peerId, ...values }).catch(() => {});
        return { success: true };
      }

      if (action === 'edit') {
        const target = values.target;
        const text = values.text?.trim();
        const editedAt = new Date().toISOString();
        if (socketRef.current?.connected) {
          socketRef.current.emit('edit-message', {
            targetId: target,
            text,
            peerId,
            myId: me?.publicId || me?.id || 'me',
            zoneId: zoneId || 'campus-live'
          });
        }
        setSnapshot(prev => ({
          ...prev,
          messages: prev.messages.map(m => (m.id === target || m.clientId === target) ? { ...m, text, editedAt } : m)
        }));
        nearbyCall(action, { zoneId, networkId, peerId, ...values }).catch(() => {});
        return { success: true };
      }

      return nearbyCall(action, { zoneId, networkId, peerId, ...values }).catch(() => ({}));
    } finally {
      pending.current = false;
    }
  }

  function typing(value) {
    if (!enabled || Date.now() - lastTyping.current < 1500) return;
    lastTyping.current = Date.now();
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing', {
        to: peerId,
        zoneId: zoneId || 'campus-live',
        isTyping: value,
        from: me?.publicId || me?.id || 'me'
      });
    }
  }

  return { ...snapshot, error, status, networkStatus, refresh, mutate, typing };
}
