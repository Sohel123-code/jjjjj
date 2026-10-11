import { useEffect, useRef, useState } from 'react';
import { useNearbySocket } from '../hooks/useNearbySocket.js';
import { CampusMap } from './CampusMap.jsx';
import { Avatar, Dialog, Icon } from './ZoneUI.jsx';
import { ReportDialog } from './ZoneFeed.jsx';

export function NearbyMap({data,fix,locationState,onVerify,demo=false,api,run,onBlock,navigate}) {
  const [share,setShare]=useState(false);
  const [peer,setPeer]=useState(null);
  const [networkId,setNetworkId]=useState(null);
  const [radiusKm,setRadiusKm]=useState(2);
  const [draft,setDraft]=useState('');
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [editing,setEditing]=useState(null);
  const [expanded,setExpanded]=useState(false);
  const [report,setReport]=useState(null);
  const [deleting,setDeleting]=useState(null);
  const [profile,setProfile]=useState(null);

  const list=useRef();
  const stick=useRef(true);
  const id=useRef(crypto.randomUUID());
  const inputRef=useRef();

  const enabled=true;
  const radiusM=Math.round(radiusKm*1000);
  const effectiveFix=fix||{latitude:data?.zone?.boundary?.centre?.latitude||17.73,longitude:data?.zone?.boundary?.centre?.longitude||83.30,accuracy:10,timestamp:Date.now()};
  const effectiveBoundary={type:'radius',centre:{latitude:effectiveFix.latitude,longitude:effectiveFix.longitude},radiusM};

  const chat=useNearbySocket({zoneId:data.zone.id,fix:effectiveFix,share,networkId,peerId:peer?.id,enabled,demo,me:data.me,boundary:effectiveBoundary});

  const openChatWithPerson=(person)=>{
    setPeer(person);
    setDraft('');
    setEditing(null);
    id.current=crypto.randomUUID();
    setTimeout(()=>{
      const chatEl=document.querySelector('.nearby-conversation');
      chatEl?.scrollIntoView({behavior:'smooth',block:'nearest'});
      inputRef.current?.focus();
    },80);
  };

  const closePeerChat=()=>{
    setPeer(null);
    setDraft('');
    setEditing(null);
    id.current=crypto.randomUUID();
  };

  useEffect(()=>{
    if(stick.current&&list.current) {
      list.current.scrollTop=list.current.scrollHeight;
    }
  },[chat.messages]);

  useEffect(()=>{
    if(!enabled) setShare(false);
  },[enabled]);

  async function send(event){
    event?.preventDefault();
    if(sending||!draft.trim()) return;
    setSending(true);
    setError('');
    try{
      await chat.mutate(editing?'edit':'send',{
        text:draft,
        clientId:id.current,
        ...(editing?{target:editing.id}:{})
      });
      setDraft('');
      setEditing(null);
      id.current=crypto.randomUUID();
      chat.typing(false);
    }catch(e){
      setError(e.message);
    }finally{
      setSending(false);
    }
  }

  const others=chat.people.filter(p=>p.id!==data.me?.publicId&&p.id!==data.me?.id&&(p.distance==null||p.distance<=radiusM));
  const locked=chat.status==='disconnected';

  return (
    <div className="nearby-v2">
      <header className="nearby-heading">
        <div>
          <span className="eyebrow">LIVE RADAR & CHAT</span>
          <h1>Live users nearby.</h1>
          <p>Real-time online users detected within {radiusKm} km. Click any person on the map to start a live 1-on-1 chat.</p>
          <div className="nearby-radius-control">
            <span><b>Radius:</b></span>
            <div className="radius-presets">
              {[0.5, 1, 2, 5, 10, 20].map(km=>(
                <button
                  key={km}
                  type="button"
                  className={radiusKm===km?'active-radius':''}
                  onClick={()=>setRadiusKm(km)}
                >
                  {km} km
                </button>
              ))}
              <input
                type="number"
                min="0.1"
                max="100"
                step="0.5"
                value={radiusKm}
                onChange={e=>setRadiusKm(Math.max(0.1,Number(e.target.value)||1))}
                aria-label="Custom radius in km"
              />
              <span>km</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          <span className="nearby-status is-live">
            <i/>{`Live online · ${others.length+1} users in ${radiusKm}km`}
          </span>
          {navigate && (
            <button
              type="button"
              className="button primary small-button"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px' }}
              onClick={() => navigate('chat')}
              title="Open dedicated Zone Live Chat"
            >
              <Icon name="chat" size={15} /> Zone Live Chat <span style={{ background: '#258c1f', color: '#fff', fontSize: '8px', padding: '1px 5px', borderRadius: '8px', fontWeight: 'bold' }}>LIVE</span>
            </button>
          )}
        </div>
      </header>

      <div className="nearby-map-grid">
        <section className="nearby-map-card card">
          <CampusMap
            boundary={effectiveBoundary}
            fix={effectiveFix}
            people={others}
            me={data.me}
            network={networkId}
            peerId={peer?.id}
            onPerson={openChatWithPerson}
          />
          <div className="nearby-map-caption">
            <span><i/> {radiusKm} km radius from your live location</span>
            <span>{others.length} other online user{others.length===1?'':'s'} nearby · <b>Click any avatar pin to chat live</b></span>
          </div>
        </section>

        <section className="card nearby-people">
          <header>
            <h2>Online in {radiusKm} km</h2>
            <span className="tiny">Active app users ({others.length})</span>
          </header>
          <label className="nearby-sharing">
            <input type="checkbox" checked={share} disabled={!enabled} onChange={e=>setShare(e.target.checked)}/>
            <span>
              <b>Share my live pin</b>
              <small>Share exact GPS pin with other active users inside this {radiusKm} km radius.</small>
            </span>
          </label>
          <div className="nearby-roster">
            {others.length ? (
              others.map(p => (
                <div className={`nearby-person-row ${peer?.id===p.id?'active-peer-row':''}`} key={p.id}>
                  <button className="nearby-person" onClick={()=>openChatWithPerson(p)}>
                    <Avatar value={p.avatar}/>
                    <span>
                      <b>@{p.alias}</b>
                      <small>{p.distance!=null?`${p.distance}m away`:'Inside radius'} · Live online</small>
                    </span>
                    <span className="nearby-badge">{p.distance!=null?`${p.distance}m`:'Online'}</span>
                  </button>
                  <button
                    className={`button small-button ${peer?.id===p.id?'secondary':'primary'} nearby-chat-btn`}
                    title={`Chat live with @${p.alias}`}
                    onClick={()=>openChatWithPerson(p)}
                  >
                    <Icon name="chat" size={13}/> {peer?.id===p.id?'Chatting':'Chat live'}
                  </button>
                </div>
              ))
            ) : (
              <div className="nearby-empty">
                <Icon name="groups" size={34}/>
                <h3>Looking for online users within {radiusKm} km…</h3>
                <p>Your live location is active. Open another tab or wait for other users within {radiusKm} km to appear on the map to start chatting live.</p>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className={`card nearby-conversation ${peer?'is-direct-chat':''} ${expanded?'nearby-expanded':''}`}>
        <header className="nearby-chat-header">
          <div className="nearby-chat-header-info">
            {peer ? (
              <div className="peer-header-badge">
                <Avatar value={peer.avatar}/>
                <div>
                  <span className="eyebrow direct-eyebrow">● LIVE 1-ON-1 CHAT (SOCKET.IO)</span>
                  <h2>@{peer.alias}</h2>
                  <small className="peer-meta">
                    <span className="online-dot"/> Live online {peer.distance!=null?`· ${peer.distance}m away`:''}
                  </small>
                </div>
              </div>
            ) : (
              <div>
                <span className="eyebrow">CAMPUS CHAT</span>
                <h2>{data.zone.name}</h2>
                <small>
                  {chat.status==='connected'||chat.status==='demo'?'Live Socket.io updates · Select any person on the map for 1-on-1 chat':chat.status==='locked'?'Location is off':chat.status==='setup-required'?'Database setup required':chat.status==='disconnected'?'Disconnected':'Connecting…'}
                </small>
              </div>
            )}
          </div>
          <div className="nearby-chat-header-actions">
            {peer && (
              <button className="button secondary small-button" onClick={closePeerChat} title="Close 1-on-1 chat">
                ✕ Close chat
              </button>
            )}
            <button className="icon-button" aria-label={expanded?'Exit full screen':'Expand chat'} onClick={()=>setExpanded(!expanded)}>
              <Icon name={expanded?'close':'arrow'}/>
            </button>
          </div>
        </header>

        {(error||chat.error)&&<p className="error" role="alert">{error||chat.error}</p>}

        <div className="nearby-messages" role="log" aria-label="Nearby conversation" ref={list} onScroll={()=>{
          const e=list.current;
          if(e) stick.current=e.scrollHeight-e.scrollTop-e.clientHeight<80;
        }}>
          {!chat.messages.length && (
            <div className="nearby-empty">
              <Icon name="chat" size={34}/>
              <h3>{peer ? `Start chatting with @${peer.alias}` : 'Campus live chat'}</h3>
              <p>{peer ? `Say hello! Messages sent here are private and delivered live via Socket.io directly to @${peer.alias}.` : 'Select any pin on the map to start a live 1-on-1 chat, or share with everyone on campus.'}</p>
            </div>
          )}
          {chat.messages.map(m => {
            const isOwn = m.authorId===data.me.publicId || m.authorId==='me';
            return (
              <article key={m.id||m.clientId} className={`nearby-message ${isOwn?'own':''}`}>
                <Avatar value={m.avatar} small/>
                <div>
                  <div className="nearby-message-author">
                    <b>@{m.alias}</b>
                    {isOwn && <span className="own-badge">You</span>}
                  </div>
                  <p>{m.text}</p>
                  <footer>
                    <time>{new Date(m.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}{m.editedAt?' · edited':''}</time>
                    <details>
                      <summary aria-label="Message options">•••</summary>
                      <div>
                        {isOwn && (
                          <button onClick={()=>{setEditing(m);setDraft(m.text);inputRef.current?.focus();}}>
                            Edit
                          </button>
                        )}
                        {(isOwn||data.me.role==='admin') && (
                          <button onClick={()=>setDeleting(m)}>
                            Delete
                          </button>
                        )}
                        <button onClick={()=>setReport({id:m.id,type:'nearby'})}>Report</button>
                      </div>
                    </details>
                  </footer>
                </div>
              </article>
            );
          })}
        </div>

        <div className="nearby-typing" aria-live="polite">
          {peer ? (
            chat.people.some(p=>p.id===peer.id&&p.typing) ? `@${peer.alias} is typing…` : ''
          ) : (
            others.filter(p=>p.typing).map(p=>'@'+p.alias).join(', ') + (others.some(p=>p.typing)?' is typing…':'')
          )}
        </div>

        <form onSubmit={send}>
          <div>
            {editing && (
              <span className="tiny editing-notice">
                Editing message <button type="button" onClick={()=>{setEditing(null);setDraft('');}}>Cancel</button>
              </span>
            )}
            <textarea
              ref={inputRef}
              aria-label="Nearby message"
              value={draft}
              disabled={locked}
              onChange={e=>{
                setDraft(e.target.value);
                id.current=crypto.randomUUID();
                chat.typing(true);
              }}
              onKeyDown={e=>{
                if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){
                  e.preventDefault();
                  if(!locked&&!sending&&draft.trim()) send(e);
                }
              }}
              placeholder={
                locked
                  ? 'Verify your location to join the conversation'
                  : peer
                  ? `Message @${peer.alias} live (Enter to send)…`
                  : 'Say something to campus or click a person to chat 1-on-1…'
              }
              maxLength={2000}
              rows={2}
            />
          </div>
          <button className="button primary send-btn" disabled={locked||sending||!draft.trim()}>
            {sending ? 'Sending…' : editing ? 'Save' : 'Send'}
            <Icon name="send" size={17}/>
          </button>
        </form>

        <p className="nearby-chat-foot">
          {peer ? (
            `Direct live conversation with @${peer.alias} over Socket.io. Press Enter to send.`
          ) : (
            'Click on any person located on the map to start an instant 1-on-1 live chat.'
          )}
        </p>
      </section>

      {profile && (
        <Dialog title={'@'+profile.alias} onClose={()=>setProfile(null)}>
          <div className="nearby-profile">
            <Avatar value={profile.avatar}/>
            <h3>@{profile.alias}</h3>
            <p>{[profile.gender,profile.profession].filter(Boolean).join(' · ')||'This member keeps their profile details private.'}</p>
            <div className="dialog-actions">
              <button className="button secondary" onClick={()=>{onBlock(profile.id);setProfile(null);}}>Block</button>
              <button className="button primary" onClick={()=>{openChatWithPerson(profile);setProfile(null);}}>Start a conversation</button>
            </div>
          </div>
        </Dialog>
      )}

      {report && (
        <ReportDialog target={report} onClose={()=>setReport(null)} api={(_,values)=>chat.mutate('report',values)} run={run}/>
      )}

      {deleting && (
        <Dialog title="Delete this message?" onClose={()=>setDeleting(null)}>
          <p>It will be removed from the conversation in real-time for all participants.</p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={()=>setDeleting(null)}>Cancel</button>
            <button className="button primary" onClick={()=>run(async()=>{
              await chat.mutate('delete',{target:deleting.id});
              setDeleting(null);
            },'Message deleted.')}>
              Delete message
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
