import { useEffect, useRef, useState } from 'react';
import CollegeSetup from './CollegeSetup.jsx';
import ItemArtwork from './ItemArtwork.jsx';
import AccountPanel from './AccountPanel.jsx';

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
const PreviewNotice = () => <p className="preview-notice">Feature preview · This form does not save or send entries. Google sign-in is connected separately; college registration, membership approval and moderation are not active yet.</p>;

function DialogContent({ dialog }) {
  const [status, setStatus] = useState('');
  if (dialog.type === 'student') return <>
    <Intro eyebrow="YOUR PEOPLE ARE RIGHT HERE" title="Find your Polygon.">Your Google account is your identity. Your college’s approval is your way into the community.</Intro>
    <AccountPanel/>
  </>;
  if (dialog.type === 'college') return <>
    <Intro eyebrow="BUILT AROUND YOUR CAMPUS" title="Give your campus a Polygon.">Capture your campus location, set its boundary, and try a live zone check.</Intro>
    <AccountPanel college/><CollegeSetup/>
  </>;
  if (dialog.type === 'privacy') return <><Intro eyebrow="THE PRIVACY APPROACH · PROPOSED POLICY" title="Close by. In control."/><div className="privacy-text"><p><strong>Location is a choice.</strong> Location starts only when you choose to capture a campus centre or start a live zone check. Student readings stay in memory, with no history or upload to Firebase. A captured campus boundary stays in this page until you clear it or reload.</p><p><strong>Campus membership isn’t live tracking.</strong> Sign-in and college approval establish membership. The opt-in live check shows an inside, outside or uncertain estimate. The local preview does not unlock campus access; approved membership and server verification are still pending. Location can be inaccurate or spoofed; we won’t call it proof of physical presence.</p><p><strong>Leaving means leaving.</strong> Stop the live check at any time. Tracking also stops when you close its dialog, sign out of the student panel, hide the tab, or revoke permission. Old readings lose their status after 30 seconds. Returning to the tab requires starting again.</p><p><strong>Expiry has limits.</strong> Proposed default: posts leave the feed after 72 hours. Backend cleanup removes post records and images separately. Restricted report evidence may remain for 30 days. Backups, screenshots and third-party copies may persist.</p><p><strong>Safety belongs in the design.</strong> Reports go to college moderators. Blocking limits interactions. Server-side rate limits reduce spam. Only authorised moderators can access the review queue.</p><p>Local location controls are implemented. Feed retention, moderation and server access controls remain implementation commitments for the next phase. Final retention periods will be confirmed before launch.</p></div></>;
  if (dialog.type === 'claim') return <><Intro eyebrow="A BETTER WAY BACK · PLANNED FLOW" title="Find a match. Prove it’s yours.">A found-item post should start a safe return, not a race to claim someone else’s belongings.</Intro><ol className="dialog-steps"><li><div><strong>Look for a likely match.</strong><p>Compare item category, approximate campus place and the time it went missing.</p></div></li><li><div><strong>Keep one detail between you.</strong><p>The finder holds back an identifying detail. The claimant describes it in a private claim, away from the feed.</p></div></li><li><div><strong>Let the finder verify.</strong><p>The finder or a campus moderator checks the detail. No automatic approval based on a photo match.</p></div></li><li><div><strong>Meet at a trusted campus desk.</strong><p>Arrange a safe handoff. Both people confirm the return and mark the post reunited.</p></div></li></ol><p className="preview-notice">This flow will be implemented with authenticated, private claims in Firebase. Don’t post ID numbers or sensitive identifying details publicly.</p></>;
  if (dialog.type === 'place') return <><Intro eyebrow="EXPLORE THE DEMO CAMPUS" title={dialog.place === 'library' ? 'The central library.' : 'The student commons.'}>{dialog.place === 'library' ? 'Late-night study sessions, shared notes, and the occasional forgotten pair of headphones.' : 'A familiar meeting place. A coffee between classes. A good place to help someone find what they lost.'}</Intro><ol className="dialog-steps"><li><div><strong>A place label, not a person’s location.</strong><p>Posts use coarse campus landmarks. Individual live locations never appear on the campus model.</p></div></li><li><div><strong>Your college defines the real boundary.</strong><p>This campus is illustrative. College management captures the centre from live location, then defines the radius or polygon.</p></div></li></ol></>;
  if (dialog.type === 'item') return <><Intro eyebrow="ILLUSTRATIVE POST · DEMO CAMPUS" title={dialog.post.title}/><div className="modal-artwork"><ItemArtwork item={dialog.post.id}/></div><p className="dialog-description">{dialog.post.description} {dialog.post.status === 'reunited' ? 'In the planned app, both people confirm the return before a post is marked reunited.' : 'The full app will let verified campus members share a sighting or submit a private ownership claim.'}</p><p className="preview-notice">This is sample content. It isn’t a real missing item and cannot accept claims.</p></>;
  return <><Intro eyebrow="COMMUNITY SAFETY · PREVIEW" title="Look out for your circle.">Safety options for “{dialog.post?.title}”</Intro><PreviewNotice/><form className="dialog-form" onSubmit={event=>{event.preventDefault();setStatus('Report preview complete. In the live app, this will create a private case for your college moderators. No report was sent.');}}><label className="field">What’s wrong with this post?<select name="reason" required defaultValue=""><option value="" disabled>Select a reason</option><option>Scam or fraudulent claim</option><option>Harassment or harmful content</option><option>Personal information exposed</option><option>Spam or unrelated content</option></select></label><label className="field">Additional context (optional)<textarea name="context" placeholder="Tell the moderators what to review" maxLength={500}/></label><button className="button button-dark" type="submit">Preview report <span>⚑</span></button><button className="button button-outline" type="button" onClick={()=>setStatus('Block preview: in the live app, this author will be hidden from your feed and unable to start new interactions with you. No user has been blocked here.')}>Preview block user</button></form>{status && <p className="form-status" role="status">{status}</p>}</>;
}
