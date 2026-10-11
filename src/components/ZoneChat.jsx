import { useEffect, useRef, useState } from 'react';
import { useNearbySocket } from '../hooks/useNearbySocket.js';
import { Avatar, Dialog, Icon } from './ZoneUI.jsx';
import { ReportDialog } from './ZoneFeed.jsx';

export function ZoneChat({ data, zoneId, liveFix, api, run, demo = false, onBlock, onReport, navigate }) {
  const [activeTab, setActiveTab] = useState('zone'); // 'zone' or 'peers'
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null);

  const messagesEndRef = useRef(null);
  const stickToBottom = useRef(true);
  const messageInputRef = useRef(null);
  const clientIdRef = useRef(crypto.randomUUID());

  const currentZoneId = zoneId || data?.zone?.id || 'campus-live';
  const effectiveFix = liveFix || {
    latitude: data?.zone?.boundary?.centre?.latitude || 17.73,
    longitude: data?.zone?.boundary?.centre?.longitude || 83.30,
    accuracy: 10,
    timestamp: Date.now()
  };
  const effectiveBoundary = data?.zone?.boundary || {
    type: 'radius',
    centre: { latitude: effectiveFix.latitude, longitude: effectiveFix.longitude },
    radiusM: 2000
  };

  const peerId = selectedPeer?.id || null;

  // Use the Socket.io hook connected to this particular zone
  const chat = useNearbySocket({
    zoneId: currentZoneId,
    fix: effectiveFix,
    share: true,
    networkId: null,
    peerId,
    enabled: true,
    demo,
    me: data.me,
    boundary: effectiveBoundary
  });

  // Filter other online members in this zone
  const others = (chat.people || []).filter(
    p => p.id !== data?.me?.publicId && p.id !== data?.me?.id
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (stickToBottom.current && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [chat.messages]);

  const handleScroll = e => {
    const el = e.currentTarget;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const openPeerChat = peer => {
    setSelectedPeer(peer);
    setActiveTab('peers');
    setDraft('');
    setEditing(null);
    clientIdRef.current = crypto.randomUUID();
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 100);
  };

  const switchToZoneChat = () => {
    setSelectedPeer(null);
    setActiveTab('zone');
    setDraft('');
    setEditing(null);
    clientIdRef.current = crypto.randomUUID();
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 100);
  };

  async function handleSend(e) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setError('');

    try {
      if (editing) {
        await chat.mutate('edit', {
          target: editing.id || editing.clientId,
          text
        });
        setEditing(null);
      } else {
        await chat.mutate('send', {
          text,
          clientId: clientIdRef.current
        });
        clientIdRef.current = crypto.randomUUID();
      }
      setDraft('');
      chat.typing(false);
    } catch (err) {
      setError(err.message || 'Failed to send message. Please retry.');
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(msg) {
    try {
      await chat.mutate('delete', { target: msg.id || msg.clientId });
      setDeleting(null);
    } catch (err) {
      setError(err.message || 'Could not delete message.');
    }
  }

  const addQuickEmoji = emoji => {
    setDraft(prev => prev + emoji);
    messageInputRef.current?.focus();
    chat.typing(true);
  };

  const isConnected = chat.status === 'connected' || chat.status === 'demo';
  const zoneName = data?.zone?.name || 'Campus Live Zone';

  // Find typing peers
  const typingPeers = selectedPeer
    ? chat.people.filter(p => p.id === selectedPeer.id && p.typing)
    : others.filter(p => p.typing);

  return (
    <div className={`zone-chat-root ${fullscreen ? 'zone-chat-fullscreen' : ''}`}>
      {/* ── Section Title ── */}
      <div className="section-title">
        <div>
          <span className="eyebrow">
            <span className="online-dot pulsing" /> LIVE SOCKET.IO · ZONE CHAT
          </span>
          <h1>
            {zoneName} Live Chat.<span className="title-star">💬</span>
          </h1>
          <p>
            Real-time public discussion and direct peer messaging for everyone inside this particular zone.
          </p>
        </div>
        <div className="zone-chat-header-actions">
          {navigate && (
            <button
              type="button"
              className="button secondary small-button"
              onClick={() => navigate('nearby')}
              title="Open Nearby radar map"
            >
              <Icon name="pin" size={16} /> Open Radar Map
            </button>
          )}
          <button
            type="button"
            className="icon-button"
            onClick={() => setFullscreen(!fullscreen)}
            aria-label={fullscreen ? 'Exit fullscreen chat' : 'Fullscreen chat'}
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen chat'}
          >
            <Icon name={fullscreen ? 'close' : 'arrow'} size={18} />
          </button>
        </div>
      </div>

      {/* ── Main Chat Shell ── */}
      <div className="card zone-chat-shell">
        {/* ── Top Bar with Channel Selector ── */}
        <header className="zone-chat-topbar">
          <div className="zone-chat-top-info">
            <span className="zone-chat-icon">
              {selectedPeer ? <Avatar value={selectedPeer.avatar} /> : '⬡'}
            </span>
            <div>
              <div className="zone-chat-title-row">
                <h2>
                  {selectedPeer ? `@${selectedPeer.alias}` : `#general · ${zoneName}`}
                </h2>
                <span className={`zone-chat-pill ${isConnected ? 'live' : 'offline'}`}>
                  <span className="status-dot" />
                  {isConnected ? 'Socket.io Live' : 'Connecting…'}
                </span>
              </div>
              <small className="zone-chat-subtitle">
                {selectedPeer ? (
                  <>
                    1-on-1 Private Live Chat · {selectedPeer.distance != null ? `${selectedPeer.distance}m away` : 'Inside zone'}
                  </>
                ) : (
                  <>
                    Public Zone Stream · {others.length + 1} online {others.length === 0 ? 'user' : 'users'} in zone radius
                  </>
                )}
              </small>
            </div>
          </div>

          <div className="zone-chat-nav-tabs">
            <button
              type="button"
              className={`zone-chat-tab ${!selectedPeer ? 'active' : ''}`}
              onClick={switchToZoneChat}
              title="Public conversation with everyone in this zone"
            >
              <Icon name="chat" size={15} /> Zone Channel
            </button>
            <button
              type="button"
              className={`zone-chat-tab ${selectedPeer || activeTab === 'peers' ? 'active' : ''}`}
              onClick={() => {
                setActiveTab('peers');
                if (!selectedPeer && others.length > 0) setSelectedPeer(others[0]);
              }}
              title="Direct messages with real-time online members"
            >
              <Icon name="groups" size={15} /> Direct 1-on-1 ({others.length})
            </button>
          </div>
        </header>

        {/* ── Active Members Ribbon (Quick 1-on-1 selection) ── */}
        <div className="zone-chat-roster-ribbon">
          <span className="roster-ribbon-label">
            <Icon name="pin" size={13} /> Real-time users in zone ({others.length + 1}):
          </span>
          <div className="roster-ribbon-items">
            <button
              type="button"
              className={`roster-pill ${!selectedPeer ? 'active' : ''}`}
              onClick={switchToZoneChat}
              title="Public chat with everyone in zone"
            >
              <span className="roster-pill-avatar">📢</span>
              <span>All in Zone</span>
            </button>
            {others.map(p => (
              <button
                key={p.id}
                type="button"
                className={`roster-pill ${selectedPeer?.id === p.id ? 'active' : ''}`}
                onClick={() => openPeerChat(p)}
                title={`Chat directly with @${p.alias} (${p.distance != null ? `${p.distance}m away` : 'online'})`}
              >
                <Avatar value={p.avatar} small />
                <span>@{p.alias}</span>
                {p.distance != null && <small>{p.distance}m</small>}
              </button>
            ))}
            {others.length === 0 && (
              <span style={{ fontSize: '11px', color: 'var(--muted)', padding: '0 8px', fontStyle: 'italic' }}>
                You are currently the only online user in this zone. Open another tab to test 1-on-1 messaging!
              </span>
            )}
          </div>
        </div>

        {/* ── Error Banner ── */}
        {(error || chat.error) && (
          <div className="error zone-chat-error" role="alert">
            <span>{error || chat.error}</span>
            <button type="button" className="text-button" onClick={() => setError('')}>
              ✕ Dismiss
            </button>
          </div>
        )}

        {/* ── Message Stream ── */}
        <div className="zone-chat-stream" role="log" aria-label="Zone messages stream" onScroll={handleScroll}>
          {/* Welcome Card */}
          <div className="zone-chat-welcome-card">
            <div className="welcome-card-badge">
              <Icon name="shield" size={16} /> Fenced Zone Verified
            </div>
            <h3>
              {selectedPeer ? `Private 1-on-1 Chat with @${selectedPeer.alias}` : `Welcome to the ${zoneName} Live Chat`}
            </h3>
            <p>
              {selectedPeer
                ? `Messages sent here are delivered directly and privately to @${selectedPeer.alias} in real time over Socket.io.`
                : `This stream broadcasts live via Socket.io to all members sharing this zone ID (${currentZoneId}). Share announcements, ask questions, or coordinate with people in your radius.`}
            </p>
          </div>

          {/* Date pill */}
          <div className="zone-chat-date-pill">Today · Live Stream</div>

          {/* Messages list */}
          {!chat.messages.length ? (
            <div className="zone-chat-empty-state">
              <Icon name="chat" size={38} />
              <h4>{selectedPeer ? `Start chatting with @${selectedPeer.alias}` : 'No messages yet'}</h4>
              <p>
                {selectedPeer
                  ? `Say hello to @${selectedPeer.alias}! They are active and inside your zone radius.`
                  : 'Be the first to say hello to everyone in this zone!'}
              </p>
            </div>
          ) : (
            chat.messages.map(m => {
              const myId = data?.me?.publicId || data?.me?.id || 'me';
              const isMine = m.authorId === myId || m.authorId === 'me';

              return (
                <div key={m.id || m.clientId} className={`zone-msg-row ${isMine ? 'mine' : ''}`}>
                  {!isMine && <Avatar value={m.avatar || '🦊'} small />}
                  <div className="zone-msg-wrap">
                    {!isMine && (
                      <span className="zone-msg-author">
                        <b>@{m.alias || 'Member'}</b>
                      </span>
                    )}
                    <div className="zone-msg-bubble">
                      <p>{m.text}</p>
                      <div className="zone-msg-meta">
                        <time>
                          {new Date(m.createdAt || Date.now()).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                          {m.editedAt ? ' · edited' : ''}
                        </time>
                        {isMine && <span className="zone-msg-tick">✓✓</span>}
                        <details className="zone-msg-options">
                          <summary aria-label="Message actions">•••</summary>
                          <div className="zone-msg-popover">
                            {isMine && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(m);
                                  setDraft(m.text);
                                  messageInputRef.current?.focus();
                                }}
                              >
                                ✏️ Edit
                              </button>
                            )}
                            {(isMine || data?.me?.role === 'admin') && (
                              <button
                                type="button"
                                className="danger-text"
                                onClick={() => setDeleting(m)}
                              >
                                🗑 Delete
                              </button>
                            )}
                            {!isMine && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openPeerChat({ id: m.authorId, alias: m.alias, avatar: m.avatar })}
                                >
                                  💬 Message privately
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReportTarget({ id: m.id || m.clientId, type: 'chat-message' })}
                                >
                                  🚩 Report
                                </button>
                                {onBlock && (
                                  <button
                                    type="button"
                                    className="danger-text"
                                    onClick={() => onBlock(m.authorId)}
                                  >
                                    🚫 Block member
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Typing Indicator */}
          <div className="zone-chat-typing-bar" aria-live="polite">
            {typingPeers.length > 0 && (
              <div className="typing-pill">
                <span className="typing-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  {typingPeers.map(p => `@${p.alias}`).join(', ')} {typingPeers.length === 1 ? 'is' : 'are'} typing…
                </span>
              </div>
            )}
          </div>

          <div ref={messagesEndRef} />
        </div>

        {/* ── Quick Reactions Strip ── */}
        <div className="zone-chat-quick-actions">
          <div className="quick-emoji-list">
            {['👋', '🙌', '📍', '💻', '☕', '🎒', '👍', '🔥'].map(emoji => (
              <button
                key={emoji}
                type="button"
                className="quick-emoji-btn"
                onClick={() => addQuickEmoji(emoji)}
                title={`Add ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
          <span className="zone-chat-privacy-hint">
            <Icon name="shield" size={13} /> Only users inside this zone can see messages
          </span>
        </div>

        {/* ── Compose Box ── */}
        <form className="zone-chat-compose" onSubmit={handleSend}>
          {editing && (
            <div className="zone-chat-edit-notice">
              <span>
                <b>Editing message:</b> &ldquo;{editing.text?.slice(0, 50)}{editing.text?.length > 50 ? '…' : ''}&rdquo;
              </span>
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setEditing(null);
                  setDraft('');
                }}
              >
                Cancel edit
              </button>
            </div>
          )}

          <div className="zone-chat-input-row">
            <Avatar value={data?.me?.avatar || '🦊'} small />
            <textarea
              ref={messageInputRef}
              rows={1}
              value={draft}
              placeholder={
                selectedPeer
                  ? `Message @${selectedPeer.alias} privately…`
                  : `Message everyone in ${zoneName}… (Press Enter to send)`
              }
              aria-label="Zone chat message input"
              maxLength={2000}
              onChange={e => {
                setDraft(e.target.value);
                chat.typing(true);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (draft.trim() && !sending) {
                    handleSend(e);
                  }
                }
              }}
            />
            <button
              type="submit"
              className="zone-send-button"
              disabled={sending || !draft.trim()}
              aria-label="Send message"
              title="Send message"
            >
              <Icon name="send" size={19} />
            </button>
          </div>
          <div className="zone-chat-compose-foot">
            <small>
              <b>Enter</b> to send · <b>Shift + Enter</b> for new line · Live Socket.io geofence channel
            </small>
          </div>
        </form>
      </div>

      {/* ── Delete Confirmation Dialog ── */}
      {deleting && (
        <Dialog title="Delete message" onClose={() => setDeleting(null)}>
          <p>Are you sure you want to delete this message? It will be removed in real time for everyone in the zone.</p>
          <div className="dialog-actions" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button type="button" className="button secondary" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="button primary danger-button"
              onClick={() => handleDeleteMessage(deleting)}
            >
              Delete permanently
            </button>
          </div>
        </Dialog>
      )}

      {/* ── Report Dialog ── */}
      {reportTarget && (
        <ReportDialog
          target={reportTarget}
          api={api}
          run={run}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
