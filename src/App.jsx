import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './context/AuthContext.jsx';
import { zoneCall, subscribeSignal } from './lib/supabaseBackend.js';
import { createDemo } from './lib/demo.js';
import { createLocationWatcher } from './lib/locationWatcher.js';
import { Avatar, Brand, Dialog, Empty, Expiry, Icon, Privacy, Skeleton } from './components/ZoneUI.jsx';
import { DemoBar, RegisterZone, Welcome, ZoneGate } from './components/ZoneEntry.jsx';
import { Composer, FeedView, MatchDialog, ReportDialog } from './components/ZoneFeed.jsx';
import { GroupsView } from './components/ZoneGroups.jsx';
import { Management, ProfileSettings } from './components/ZoneManagement.jsx';
import { NearbyMap } from './components/NearbyMap.jsx';
import { ZoneChat } from './components/ZoneChat.jsx';
import './nearby.css';
import './nearby-v2.css';
import './zone-chat.css';

const nav = [
  ['nearby', 'pin', 'Nearby'],
  ['chat', 'chat', 'Live Chat'],
  ['feed', 'home', 'Feed'],
  ['explore', 'search', 'Lost & Found'],
  ['groups', 'groups', 'Groups'],
  ['events', 'calendar', 'Events'],
  ['profile', 'user', 'Profile']
];

export default function App() {
  const auth = useAuth();
  const appSocket = useRef(null);
  const [demo, setDemo] = useState(null), [demoRole, setDemoRole] = useState('member'), [demoState, setDemoState] = useState('inside');
  const [memberships, setMemberships] = useState([]), [availableZones, setAvailableZones] = useState([]);
  const [zoneId, setZoneId] = useState(() => {
    try {
      return localStorage.getItem('polygon-zone-id') || 'campus-live';
    } catch {
      return 'campus-live';
    }
  });
  const [view, setView] = useState('nearby'), [data, setData] = useState(null), [groupId, updateGroupId] = useState(null);
  const setGroupId = useCallback(id => { updateGroupId(id); setData(old => old ? { ...old, messages: [], presence: [] } : old); }, []);
  const [liveFix, setLiveFix] = useState(null);
  const [locationState, setLocationState] = useState('inside'), [grantExpiry, setGrantExpiry] = useState(0), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [toast, setToast] = useState('');
  const [register, setRegister] = useState(false), [token, setToken] = useState(null), [compose, setCompose] = useState(null), [report, setReport] = useState(null), [matches, setMatches] = useState(null), [privacy, setPrivacy] = useState(false), [blocking, setBlocking] = useState(null), [join, setJoin] = useState(false);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('polygon-theme') || 'light'; } catch { return 'light'; } });
  const autoSelectZone = useRef(true);
  const actionQueue = useRef(Promise.resolve()), pendingActions = useRef(0), snapshotContext = useRef('');
  const watcher = useRef(), pollLocation = useRef(), locationEpoch = useRef(0), snapshotEpoch = useRef(0), lastFix = useRef(0), requestingFix = useRef(false), alive = useRef(true);
  const membership = memberships.find(m => m.zoneId === zoneId), isAdmin = membership?.role === 'admin', management = view === 'management' && isAdmin, canLoad = true;
  const contextKey = `${zoneId}|${management}|${groupId}|${canLoad}`; snapshotContext.current = contextKey;
  // Stable user identity — isolated per browser session/tab
  const anonMe = useMemo(() => {
    try {
      let id = sessionStorage.getItem('polygon-live-id');
      let alias = sessionStorage.getItem('polygon-live-alias');
      if (!id) {
        id = 'user-' + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem('polygon-live-id', id);
      }
      if (!alias) {
        alias = 'User_' + id.slice(-4);
        sessionStorage.setItem('polygon-live-alias', alias);
      }
      return { publicId: id, id, alias, avatar: '🦊', role: 'member' };
    } catch {
      return { publicId: 'me', id: 'me', alias: 'You', avatar: '🦊', role: 'member' };
    }
  }, []);

  const activeZoneId = zoneId || 'campus-live';
  const fallbackZone = useMemo(() => ({
    id: activeZoneId,
    name: 'Campus Live Zone',
    boundary: { type: 'radius', centre: { latitude: liveFix?.latitude || 17.73, longitude: liveFix?.longitude || 83.30 }, radiusM: 2000 }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [activeZoneId, liveFix?.latitude, liveFix?.longitude]);

  const fallbackMe = useMemo(() =>
    auth.user
      ? { publicId: auth.user.uid, id: auth.user.uid, alias: auth.user.displayName?.split(' ')[0] || anonMe.alias, avatar: '🦊', role: membership?.role || 'member' }
      : anonMe
  // eslint-disable-next-line react-hooks/exhaustive-deps
  , [auth.user?.uid, auth.user?.displayName, membership?.role, anonMe]);

  // Always ensure me/zone/posts are populated — Supabase 401 can return null or {}
  const activeData = {
    zone: data?.zone || fallbackZone,
    me: data?.me || fallbackMe,
    posts: data?.posts || [],
    comments: data?.comments || [],
    groups: data?.groups || [],
    messages: data?.messages || [],
    presence: data?.presence || [],
    myLikes: data?.myLikes || []
  };

  // Auto-detect live location immediately on launch
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        p => {
          const fix = { latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)), accuracy: p.coords.accuracy || 10, timestamp: p.timestamp || Date.now() };
          setLiveFix(fix); setLocationState('inside');
        },
        () => {
          setLiveFix({ latitude: 17.73, longitude: 83.30, accuracy: 10, timestamp: Date.now() }); setLocationState('inside');
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    }
  }, []);

  // Live real-time sync over Socket.io
  useEffect(() => {
    const currentZid = zoneId || 'campus-live';
    let socket;
    try {
      // Use polling first, then upgrade — avoids WS failures on port mismatch
      socket = io({ transports: ['polling', 'websocket'], timeout: 6000, reconnectionDelay: 1000, reconnectionAttempts: 10 });
      appSocket.current = socket;
      socket.on('connect', () => {
        socket.emit('join-geofence', { zoneId: currentZid, user: activeData.me, fix: liveFix, boundary: activeData.zone.boundary });
        socket.emit('get-feed', { zoneId: currentZid, userId: activeData.me.publicId });
      });
      socket.on('feed-data', ({ posts, comments, myLikes }) => {
        setData(prev => { const base = prev || activeData; return { ...base, posts: posts || base.posts, comments: comments || base.comments, myLikes: myLikes || base.myLikes || [] }; });
      });
      socket.on('feed-post-added', ({ post }) => {
        setData(prev => { const base = prev || activeData; if ((base.posts || []).some(p => p.id === post.id)) return prev; return { ...base, posts: [post, ...(base.posts || [])] }; });
      });
      socket.on('feed-comment-added', ({ comment }) => {
        setData(prev => { const base = prev || activeData; if ((base.comments || []).some(c => c.id === comment.id)) return prev; return { ...base, comments: [...(base.comments || []), comment] }; });
      });
      socket.on('feed-like-updated', ({ target, likes, userId, isLiked }) => {
        setData(prev => { const base = prev || activeData; const myId = base.me?.publicId || 'me'; let updatedLikes = base.myLikes || []; if (userId === myId) { updatedLikes = isLiked ? [...new Set([...updatedLikes, target])] : updatedLikes.filter(id => id !== target); } return { ...base, posts: (base.posts || []).map(p => p.id === target ? { ...p, likes } : p), myLikes: updatedLikes }; });
      });
      socket.on('feed-post-deleted', ({ target }) => {
        setData(prev => { const base = prev || activeData; return { ...base, posts: (base.posts || []).filter(p => p.id !== target), comments: (base.comments || []).filter(c => c.parentId !== target) }; });
      });
      socket.on('feed-comment-deleted', ({ target }) => {
        setData(prev => { const base = prev || activeData; return { ...base, comments: (base.comments || []).filter(c => c.id !== target) }; });
      });
    } catch {}
    return () => { if (socket) { socket.disconnect(); appSocket.current = null; } };
  }, [zoneId, liveFix?.latitude, liveFix?.longitude]);

  const api = useCallback(async (action, values = {}) => {
    if (demo) return demo.call(action, { zoneId, ...values });
    const zid = zoneId || 'campus-live', s = appSocket.current;

    if (action === 'createPost') {
      const post = { ...values, id: crypto.randomUUID(), authorId: activeData.me.publicId || 'me', alias: activeData.me.alias || 'You', avatar: activeData.me.avatar || '🦊', createdAt: new Date().toISOString() };
      if (s?.connected) s.emit('create-post', { zoneId: zid, post });
      setData(prev => { const base = prev || activeData; return { ...base, posts: [post, ...(base.posts || [])] }; });
      return zoneCall(action, { zoneId: zid, ...values }).catch(() => post);
    }

    if (action === 'comment') {
      const comment = { ...values, id: crypto.randomUUID(), authorId: activeData.me.publicId || 'me', alias: activeData.me.alias || 'You', avatar: activeData.me.avatar || '🦊', createdAt: new Date().toISOString() };
      if (s?.connected) s.emit('create-comment', { zoneId: zid, comment });
      setData(prev => { const base = prev || activeData; return { ...base, comments: [...(base.comments || []), comment] }; });
      return zoneCall(action, { zoneId: zid, ...values }).catch(() => comment);
    }

    if (action === 'like') {
      const target = values.target, myId = activeData.me.publicId || 'me';
      if (s?.connected) s.emit('like-post', { zoneId: zid, target, userId: myId });
      setData(prev => { const base = prev || activeData; const liked = (base.myLikes || []).includes(target); return { ...base, posts: (base.posts || []).map(p => p.id === target ? { ...p, likes: liked ? Math.max(0, (p.likes || 1) - 1) : (p.likes || 0) + 1 } : p), myLikes: liked ? (base.myLikes || []).filter(id => id !== target) : [...(base.myLikes || []), target] }; });
      return zoneCall(action, { zoneId: zid, ...values }).catch(() => ({ success: true }));
    }

    if (['deleteContent', 'deletePost', 'delete'].includes(action)) {
      const target = values.target;
      if (s?.connected) s.emit('delete-post', { zoneId: zid, target });
      setData(prev => { const base = prev || activeData; return { ...base, posts: (base.posts || []).filter(p => p.id !== target), comments: (base.comments || []).filter(c => c.parentId !== target) }; });
      return zoneCall(action, { zoneId: zid, ...values }).catch(() => ({ success: true }));
    }

    return zoneCall(action, { zoneId: zid, ...values }).catch(() => ({}));
  }, [demo, zoneId, activeData]);

  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('polygon-theme', theme); } catch {} }, [theme]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); }, [toast]);

  const bootstrap = useCallback(async () => {
    try {
      const result = demo ? await demo.call('bootstrap') : await zoneCall('bootstrap');
      if (!alive.current) return;
      if (result?.memberships) setMemberships(result.memberships);
      if (result?.availableZones) setAvailableZones(result.availableZones);
      return result;
    } catch {}
  }, [demo]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; watcher.current?.dispose(); clearInterval(pollLocation.current); }; }, []);

  useEffect(() => {
    if (!auth.user && !demo) {
      setZoneId(current => current || 'campus-live');
      return;
    }
    let cancelled = false;
    const load = () => bootstrap().catch(() => {});
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [auth.user?.uid, demo, bootstrap]);

  const refresh = useCallback(async () => {
    if (!canLoad || snapshotContext.current !== contextKey) return;
    const epoch = ++snapshotEpoch.current;
    try {
      const result = await api('snapshot', { groupId, management });
      if (epoch === snapshotEpoch.current && alive.current && snapshotContext.current === contextKey) {
        setData(result); setError('');
      }
    } catch (e) {
      if (epoch === snapshotEpoch.current) {
        if (e.code === '42501') setData(null);
      }
    } finally {
      if (epoch === snapshotEpoch.current) setLoading(false);
    }
  }, [api, groupId, management, canLoad, contextKey]);

  useEffect(() => {
    snapshotEpoch.current++;
    if (!canLoad) { setLoading(false); setData(null); return; }
    if (!data) setLoading(true);
    refresh();
    let unsub; let timer;
    if (demo) {
      const update = () => { clearTimeout(timer); timer = setTimeout(refresh, 100); };
      window.addEventListener('polygon-demo', update);
      unsub = () => window.removeEventListener('polygon-demo', update);
    } else {
      unsub = subscribeSignal(zoneId, () => { clearTimeout(timer); timer = setTimeout(refresh, 150); });
    }
    const interval = setInterval(refresh, groupId ? 3000 : 12000);
    return () => { snapshotEpoch.current++; unsub?.(); clearInterval(interval); clearTimeout(timer); };
  }, [refresh, canLoad, demo, zoneId]);

  function run(task, message) {
    pendingActions.current++; setBusy(true);
    const execute = async () => {
      setError('');
      try {
        const result = await task();
        if (result?.blocked) { setToast(result.message); return result; }
        if (message) setToast(message);
        await refresh();
        return result;
      } catch (e) {
        setError(e.message || 'Something went wrong. Please retry.');
        return null;
      } finally {
        pendingActions.current--;
        if (alive.current) setBusy(pendingActions.current > 0);
      }
    };
    const next = actionQueue.current.then(execute, execute); actionQueue.current = next; return next;
  }

  function clearLocation(next = 'stopped', revoke = true) {
    locationEpoch.current++;
    watcher.current?.dispose(); watcher.current = null;
    clearInterval(pollLocation.current);
    setLiveFix(null); setGrantExpiry(0); setLocationState(next); setCompose(null); setMatches(null); setReport(null); setBlocking(null); setGroupId(null);
    snapshotEpoch.current++;
    if (revoke && zoneId) api('stopLocation').catch(() => {});
  }

  function startLocation() {
    if (demo) { setDemoState('inside'); demo.setLocation('inside'); setLocationState('inside'); setView('nearby'); return; }
    clearLocation('requesting', false); lastFix.current = 0; requestingFix.current = false;
    const epoch = locationEpoch.current;
    const accept = async fix => {
      if (epoch !== locationEpoch.current || requestingFix.current || Date.now() - lastFix.current < 8000) return;
      lastFix.current = Date.now(); requestingFix.current = true;
      try {
        setLiveFix(fix); setLocationState('inside');
      } finally { requestingFix.current = false; }
    };
    watcher.current = createLocationWatcher({ geolocation: navigator.geolocation, permissions: navigator.permissions, document, secure: window.isSecureContext }, ({ phase, position }) => {
      if (epoch !== locationEpoch.current) return;
      if (phase === 'live') accept(position);
      else if (phase === 'requesting') setLocationState('requesting');
      else setLocationState('inside');
    });
    watcher.current.start();
  }

  function navigate(next) { setView(next); setGroupId(null); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function startDemo() { clearLocation('inside'); const next = createDemo(); setDemo(next); setDemoRole('member'); setDemoState('inside'); setZoneId('demo'); setMemberships([{ zoneId: 'demo', name: 'The Commons', role: 'member', status: 'active' }]); setView('nearby'); setError(''); }
  function exitDemo() { clearLocation('idle', false); setDemo(null); setZoneId('campus-live'); setMemberships([]); setError(''); }
  async function signOut() {
    autoSelectZone.current = true;
    clearLocation('idle');
    if (demo) { exitDemo(); return; }
    await auth.signOut();
    setZoneId('campus-live');
    setView('nearby');
  }
  function openCompose(category = 'post', eventId = '') { setCompose({ category, eventId }); }
  async function joinZone(value) { const payload = typeof value === 'object' ? { token: value.token } : { token: value }; const r = await api('joinZone', payload); setZoneId(r.zoneId || 'campus-live'); setView('nearby'); setJoin(false); setToast('Entered community.'); }
  async function registerZone(values) { setBusy(true); try { const r = await api('registerZone', values); setZoneId(r.zoneId); setRegister(false); setToken(r.token); setView('management'); await bootstrap(); } finally { setBusy(false); } }
  function demoScenario(value) { clearLocation(value, false); setDemoState(value); demo.setLocation(value); setLocationState(value); }
  function demoChangeRole(value) { setDemoRole(value); demo.setRole(value === 'admin'); setMemberships([{ zoneId: 'demo', name: data?.zone?.name || 'The Commons', role: value, status: 'active' }]); setView(value === 'admin' ? 'management' : 'nearby'); setGroupId(null); setData(null); }
  const events = (activeData?.posts || []).filter(p => p.category === 'event');
  const onBlock = target => setBlocking(target);
  const contentProps = { data: activeData, api, run, onCompose: openCompose, onReport: setReport, onMatches: setMatches, onBlock, busy };
  const sidebarName = activeData?.zone?.name || membership?.name || 'Campus Live';

  return (
    <div className="app-root">
      {demo && <DemoBar role={demoRole} state={demoState} onRole={demoChangeRole} onState={demoScenario} onExit={exitDemo} />}
      <div className="app-layout">
        <aside className="sidebar">
          <a className="brand-link" href="#" onClick={e => { e.preventDefault(); navigate('nearby'); }}>
            <Brand />
          </a>
          <div className="zone-switch">
            <span className="zone-switch-icon"><Icon name="pin" size={21} /></span>
            <div><small>YOUR CURRENT ZONE</small><b>{sidebarName}</b></div>
            <span className="zone-live" />
          </div>
          <nav aria-label="Main navigation">
            {nav.map(([key, icon, label]) => (
              <button key={key} className={view === key ? 'active' : ''} onClick={() => navigate(key)}>
                <Icon name={icon} />
                <span>{label}</span>
                {view === key && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <button className="button primary new-post-button" onClick={() => openCompose()}>
            <Icon name="plus" size={20} /> Create a post
          </button>
          {membership?.role === 'admin' && (
            <button className={`management-link ${management ? 'active' : ''}`} onClick={() => navigate('management')}>
              <Icon name="shield" size={19} /> Zone Management <Icon name="arrow" size={16} />
            </button>
          )}
          <div className="sidebar-bottom">
            <div className="sidebar-note">
              <Icon name="shield" size={19} />
              <b>Good boundaries.<br />Better communities.</b>
              <p>Only people in your radius.<br />Live on the map.</p>
              <button onClick={() => setPrivacy(true)}>Your privacy, explained ↗</button>
            </div>
            {memberships.length > 1 && (
              <select aria-label="Switch zone" value={zoneId} onChange={e => { setZoneId(e.target.value); setView('nearby'); }}>
                {memberships.map(m => <option key={m.zoneId} value={m.zoneId}>{m.name}</option>)}
              </select>
            )}
            <button className="sidebar-profile" onClick={() => navigate('profile')}>
              <Avatar value={activeData.me.avatar || '🦊'} small />
              <span><b>@{activeData.me.alias || 'Your account'}</b><small>Live online member</small></span>
              <Icon name="more" size={20} />
            </button>
            <div className="sidebar-tools">
              <button onClick={() => setJoin(true)}>Join another zone</button>
              <button onClick={() => setRegister(true)}>Register a zone</button>
              {auth.user ? <button onClick={signOut}>Sign out</button> : <button onClick={auth.signIn}>Sign in</button>}
            </div>
          </div>
        </aside>

        <main className={`workspace ${management ? 'admin-workspace' : ''} ${groupId ? 'chat-workspace' : ''} ${view === 'nearby' ? 'nearby-workspace' : ''} ${view === 'chat' ? 'chat-workspace' : ''}`}>
          <header className="app-header">
            <div className="mobile-brand"><Brand /></div>
            <div className="breadcrumb">
              <span>{management ? 'Your community, in good hands.' : view === 'nearby' ? 'See who\'s around you live. Click on any user to chat.' : view === 'chat' ? `Live real-time chat for ${sidebarName} powered by Socket.io.` : 'Your community, within a boundary.'}</span>
            </div>
            <div className="header-tools">
              <span className="location-status online"><span />Live Radar Active</span>
              <button className={`icon-button ${view === 'chat' ? 'active-header-btn' : ''}`} aria-label="Open zone live chat" title="Open zone live chat" onClick={() => navigate('chat')}><Icon name="chat" /></button>
              <button className="icon-button" aria-label="View community updates" onClick={() => navigate('events')}><Icon name="bell" /></button>
              <button className="header-avatar" onClick={() => navigate('profile')} aria-label="Open profile"><Avatar value={activeData.me.avatar || '🦊'} small /></button>
            </div>
          </header>

          <div className="mobile-zone">
            <Icon name="pin" size={14} />{sidebarName}
          </div>

          <div className={view === 'nearby' ? 'nearby-grid' : view === 'chat' ? 'workspace-grid chat-workspace-grid' : 'workspace-grid'}>
            <section className={view === 'nearby' ? 'nearby-full-column' : 'main-column'} aria-label="Zone community">
              {error && (
                <div className="error global-error" role="alert">
                  <span>{error}</span>
                  <button className="text-button" onClick={() => { setError(''); refresh(); }}>Retry</button>
                </div>
              )}
              {view === 'nearby' ? (
                <NearbyMap
                  key={zoneId || 'nearby'}
                  data={activeData}
                  fix={liveFix}
                  locationState={locationState}
                  onVerify={startLocation}
                  demo={!!demo}
                  api={api}
                  run={run}
                  onBlock={onBlock}
                  navigate={navigate}
                />
              ) : view === 'chat' ? (
                <ZoneChat
                  key={zoneId || 'zone-chat'}
                  data={activeData}
                  zoneId={zoneId}
                  liveFix={liveFix}
                  api={api}
                  run={run}
                  demo={!!demo}
                  onBlock={onBlock}
                  onReport={setReport}
                  navigate={navigate}
                />
              ) : management ? (
                <Management {...contentProps} groupId={groupId} setGroupId={setGroupId} onToken={setToken} />
              ) : view === 'groups' ? (
                <GroupsView {...contentProps} groupId={groupId} setGroupId={setGroupId} />
              ) : view === 'profile' ? (
                <ProfileSettings {...contentProps} onStop={() => { clearLocation('stopped'); navigate('nearby'); }} onLeave={() => run(async () => { await api('leaveZone'); setZoneId('campus-live'); setView('nearby'); }, 'You left the zone.')} onSignOut={signOut} theme={theme} setTheme={setTheme} />
              ) : (
                <FeedView {...contentProps} view={view} />
              )}
            </section>
          </div>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map(([key, icon, label]) => (
          <button key={key} className={view === key ? 'active' : ''} onClick={() => navigate(key)}>
            <Icon name={icon} size={21} />
            <span>{key === 'explore' ? 'Explore' : key === 'chat' ? 'Chat' : label}</span>
          </button>
        ))}
      </nav>

      {register && <RegisterZone user={demo || auth.user} signIn={auth.signIn} onClose={() => setRegister(false)} onSubmit={registerZone} busy={busy} />}
      {token && (
        <Dialog title="Your zone is ready." onClose={() => setToken(null)}>
          <div className="token-success">
            <Icon name="shield" size={42} />
            <h3>One private token. Your own community.</h3>
            <p>Share this only with people who belong in your zone.</p>
            <code className="zone-token">{token}</code>
            <button className="button primary full" onClick={() => run(() => navigator.clipboard.writeText(token), 'Token copied.')}>Copy private token</button>
          </div>
        </Dialog>
      )}
      {compose && <Composer {...contentProps} me={activeData.me} events={events} category={compose.category} eventId={compose.eventId} onClose={() => setCompose(null)} />}
      {report && <ReportDialog target={report} api={api} run={run} onClose={() => setReport(null)} />}
      {matches && <MatchDialog result={matches} posts={activeData.posts || []} onClose={() => setMatches(null)} onOpen={id => { navigate('feed'); setTimeout(() => document.getElementById('post-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200); }} />}
      {privacy && <Dialog title="Your privacy, explained" onClose={() => setPrivacy(false)}><Privacy /></Dialog>}
      {blocking && (
        <Dialog title="A boundary of your own." onClose={() => setBlocking(null)}>
          <p>Block this member to hide their content and restrict interactions.</p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setBlocking(null)}>Cancel</button>
            <button className="button primary" onClick={() => run(async () => { await api('block', { target: blocking }); setBlocking(null); }, 'Member blocked.')}>Block member</button>
          </div>
        </Dialog>
      )}
      {join && (
        <Dialog title="Enter another zone" onClose={() => setJoin(false)}>
          <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); const zid = fd.get('zoneId'); const t = fd.get('token'); run(() => joinZone(zid ? { zoneId: zid } : { token: t })); }}>
            {availableZones.length > 0 && (
              <div className="field">
                <span>Select from existing zones</span>
                <select name="zoneId">
                  <option value="">-- Choose registered zone --</option>
                  {availableZones.map(z => <option key={z.id} value={z.id}>{z.name} ({z.type})</option>)}
                </select>
              </div>
            )}
            <label className="field">
              <span>Or enter private zone token</span>
              <input name="token" placeholder="PZ–YOUR–ZONE–TOKEN" maxLength={80} />
            </label>
            <button className="button primary full" disabled={busy}>Enter zone</button>
          </form>
        </Dialog>
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={18} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss notification"><Icon name="close" size={16} /></button>
        </div>
      )}
      {busy && <div className="progress-bar" role="status" aria-label="Saving changes" />}
    </div>
  );
}