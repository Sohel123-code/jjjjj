import { useEffect, useRef, useState } from 'react';
import { validateCollege, validateInvite } from '../lib/validation.js';
import ItemArtwork from './ItemArtwork.jsx';

export default function Modal({ dialog, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!dialog) return;
    const element = ref.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [dialog]);
  if (!dialog) return null;
  return <dialog ref={ref} aria-labelledby="dialog-title" onCancel={onClose} onClick={event => {
    if (event.target !== ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
  }}><button className="dialog-close" aria-label="Close dialog" onClick={onClose}>×</button><DialogContent key={`${dialog.type}-${dialog.post?.id || ''}`} dialog={dialog} /></dialog>;
}

function Intro({ eyebrow, title, children }) {
  return <><div className="dialog-eyebrow">{eyebrow}</div><h2 className="dialog-title" id="dialog-title">{title}</h2>{children && <p className="dialog-description">{children}</p>}</>;
}
const PreviewNotice = () => <p className="preview-notice">Homepage preview · Firebase isn’t connected yet. No account is created, no location is requested, and form entries aren’t saved or sent.</p>;

function DialogContent({ dialog }) {
  const [status, setStatus] = useState('');
  const [zoneType, setZoneType] = useState('radius');
  const [mode, setMode] = useState('join');
  if (dialog.type === 'student') return <>
    <Intro eyebrow="YOUR PEOPLE ARE RIGHT HERE" title={mode === 'join' ? 'Find your Polygon.' : 'Welcome back.'}>Your college invite connects you to your campus. Google sign-in keeps your account yours.</Intro>
    <div className="auth-tabs"><button className={mode === 'join' ? 'active' : ''} onClick={() => {setMode('join');setStatus('');}} aria-pressed={mode === 'join'}>Join your campus</button><button className={mode === 'login' ? 'active' : ''} onClick={() => {setMode('login');setStatus('');}} aria-pressed={mode === 'login'}>Log in</button></div>
    <PreviewNotice/>
    <form className="dialog-form" onSubmit={event => {
      event.preventDefault();
      if (mode === 'join') { const error = validateInvite(new FormData(event.currentTarget).get('code')); if (error) {setStatus(error);return;} }
      setStatus(mode === 'join' ? 'Code format looks good. When Firebase is connected, Google sign-in will run first, then the server will validate the code and your college membership. This code has not been verified.' : 'Google login will be available after Firebase is connected. Returning students will use their existing approved campus membership.');
    }}>
      {mode === 'join' && <label className="field">College invite code<input name="code" placeholder="Enter your college’s code" autoComplete="off" minLength={6} maxLength={40} required spellCheck="false"/></label>}
      <button className="button google-button" type="submit"><span className="google-g" aria-hidden="true">G</span> Preview Google {mode === 'join' ? 'sign-up' : 'login'} <span>↗</span></button>
    </form><p className="dialog-help">{mode === 'join' ? 'No code? Ask your college’s Polygon administrator.' : 'Location access and membership verification are separate from sign-in.'}</p>{status && <p className="form-status" role="status">{status}</p>}
  </>;
  if (dialog.type === 'college') return <>
    <Intro eyebrow="BUILT AROUND YOUR CAMPUS" title="Give your campus a Polygon.">Start with your institution and its boundary. Verified management will control invitations and moderation.</Intro><PreviewNotice/>
    <form className="dialog-form" onSubmit={event => {
      event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const error=validateCollege(values);
      setStatus(error || `Setup preview ready for ${values.name.trim()}: ${values.zoneType === 'radius' ? `a ${Number(values.radius).toLocaleString()} m radius` : 'a polygon boundary'}, centred at ${Number(values.latitude)}, ${Number(values.longitude)}. Next: Google sign-in → management verification → server-created college ID and private invite code. Nothing has been registered or saved.`);
    }}>
      <label className="field">College name<input name="name" placeholder="Your institution" required maxLength={120}/></label>
      <label className="field">Institutional email<input name="email" type="email" placeholder="admin@yourcollege.edu" required maxLength={254}/></label>
      <div className="field-row"><label className="field">Campus latitude<input name="latitude" type="number" min="-90" max="90" step="any" placeholder="17.1234" required/></label><label className="field">Campus longitude<input name="longitude" type="number" min="-180" max="180" step="any" placeholder="83.1234" required/></label></div>
      <label className="field">Zone boundary<select name="zoneType" value={zoneType} onChange={e=>{setZoneType(e.target.value);setStatus('');}}><option value="radius">Circle (centre + radius)</option><option value="polygon">Polygon (boundary vertices)</option></select></label>
      {zoneType === 'radius' ? <label className="field">Radius in metres<input name="radius" type="number" min="50" max="10000" defaultValue="500" required/></label> : <label className="field">Closed polygon · [longitude, latitude] pairs<textarea name="vertices" placeholder="[[83.12,17.12],[83.13,17.12],[83.13,17.13],[83.12,17.12]]" required/><small>Use 3–100 corners and repeat the first pair at the end. This preview checks coordinates and intersecting edges.</small></label>}
      <button className="button button-dark" type="submit">Review campus setup <span>↗</span></button>
    </form>{status && <p className="form-status" role="status">{status}</p>}
  </>;
  if (dialog.type === 'privacy') return <><Intro eyebrow="THE PRIVACY APPROACH · PROPOSED POLICY" title="Close by. In control."/><div className="privacy-text"><p><strong>Location is a choice.</strong> This homepage never asks for location. In the app, we plan to ask only after explaining the zone check. A short-lived membership check records your zone status, not a history of exact coordinates.</p><p><strong>Campus membership isn’t live tracking.</strong> Sign-in and college approval establish membership. A separate, opt-in location estimate unlocks the zone feed. Location can be inaccurate or spoofed; we won’t call it proof of physical presence.</p><p><strong>Leaving means leaving.</strong> Disable location or leave the zone to stop new zone activity. Your account and existing return claims remain manageable. If accuracy is poor, retry or ask a campus desk for help.</p><p><strong>Expiry has limits.</strong> Proposed default: posts leave the feed after 72 hours. Backend cleanup removes post records and images separately. Restricted report evidence may remain for 30 days. Backups, screenshots and third-party copies may persist.</p><p><strong>Safety belongs in the design.</strong> Reports go to college moderators. Blocking limits interactions. Server-side rate limits reduce spam. Only authorised moderators can access the review queue.</p><p>These are implementation commitments for the next phase, not active protections on this demonstration feed. Final retention periods will be confirmed before launch.</p></div></>;
  if (dialog.type === 'claim') return <><Intro eyebrow="A BETTER WAY BACK · PLANNED FLOW" title="Find a match. Prove it’s yours.">A found-item post should start a safe return, not a race to claim someone else’s belongings.</Intro><ol className="dialog-steps"><li><div><strong>Look for a likely match.</strong><p>Compare item category, approximate campus place and the time it went missing.</p></div></li><li><div><strong>Keep one detail between you.</strong><p>The finder holds back an identifying detail. The claimant describes it in a private claim, away from the feed.</p></div></li><li><div><strong>Let the finder verify.</strong><p>The finder or a campus moderator checks the detail. No automatic approval based on a photo match.</p></div></li><li><div><strong>Meet at a trusted campus desk.</strong><p>Arrange a safe handoff. Both people confirm the return and mark the post reunited.</p></div></li></ol><p className="preview-notice">This flow will be implemented with authenticated, private claims in Firebase. Don’t post ID numbers or sensitive identifying details publicly.</p></>;
  if (dialog.type === 'place') return <><Intro eyebrow="EXPLORE THE DEMO CAMPUS" title={dialog.place === 'library' ? 'The central library.' : 'The student commons.'}>{dialog.place === 'library' ? 'Late-night study sessions, shared notes, and the occasional forgotten pair of headphones.' : 'A familiar meeting place. A coffee between classes. A good place to help someone find what they lost.'}</Intro><ol className="dialog-steps"><li><div><strong>A place label, not a person’s location.</strong><p>Posts use coarse campus landmarks. Individual live locations never appear on the campus model.</p></div></li><li><div><strong>Your college defines the real boundary.</strong><p>This campus is illustrative. College management will supply the actual latitude, longitude and zone shape.</p></div></li></ol></>;
  if (dialog.type === 'item') return <><Intro eyebrow="ILLUSTRATIVE POST · DEMO CAMPUS" title={dialog.post.title}/><div className="modal-artwork"><ItemArtwork item={dialog.post.id}/></div><p className="dialog-description">{dialog.post.description} {dialog.post.status === 'reunited' ? 'In the planned app, both people confirm the return before a post is marked reunited.' : 'The full app will let verified campus members share a sighting or submit a private ownership claim.'}</p><p className="preview-notice">This is sample content. It isn’t a real missing item and cannot accept claims.</p></>;
  return <><Intro eyebrow="COMMUNITY SAFETY · PREVIEW" title="Look out for your circle.">Safety options for “{dialog.post?.title}”</Intro><PreviewNotice/><form className="dialog-form" onSubmit={event=>{event.preventDefault();setStatus('Report preview complete. In the live app, this will create a private case for your college moderators. No report was sent.');}}><label className="field">What’s wrong with this post?<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option><option>Scam or fraudulent claim</option><option>Harassment or harmful content</option><option>Personal information exposed</option><option>Spam or unrelated content</option></select></label><label className="field">Additional context (optional)<textarea name="context" placeholder="Tell the moderators what to review" maxLength={500}/></label><button className="button button-dark" type="submit">Preview report <span>⚑</span></button><button className="button button-outline" type="button" onClick={()=>setStatus('Block preview: in the live app, this author will be hidden from your feed and unable to start new interactions with you. No user has been blocked here.')}>Preview block user</button></form>{status && <p className="form-status" role="status">{status}</p>}</>;
}
