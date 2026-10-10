import { useState } from 'react';
import CampusScene from './components/CampusScene.jsx';
import Feed from './components/Feed.jsx';
import Modal from './components/Modal.jsx';
import LiveFeed from './components/LiveFeed.jsx';
import CollegeDashboard from './components/CollegeDashboard.jsx';
import { useScrollReveal } from './lib/useScrollReveal.js';
import { useAuth } from './context/AuthContext.jsx';
import { useMembership } from './context/MembershipContext.jsx';

export default function App() {
  const { user, loading } = useAuth();
  const { membership, adminCollege, loading: membershipLoading } = useMembership();
  const [dialog, setDialog] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState('home'); // home | dashboard | feed
  useScrollReveal();

  // Determine which main view to show
  const isAcceptedStudent = membership?.status === 'accepted';
  const isAdmin = !!adminCollege;

  // If user is accepted student and chooses feed view, or auto-redirect
  const showFeed = view === 'feed' && isAcceptedStudent;
  const showDashboard = view === 'dashboard' && isAdmin;

  return (<>

  <a className="skip-link" href="#main">Skip to content</a>
  <div className="scroll-progress" aria-hidden="true"></div>
  <header className="header">
    <a className="brand" href="#" aria-label="Polygon home" onClick={e => { e.preventDefault(); setView('home'); }}>
      <span className="brand-mark"><img src="assets/polygon-brand.png" alt="" /></span>
      <span>polygon<span className="brand-dot">.</span></span>
    </a>

    {showFeed || showDashboard ? (
      <nav className="desktop-nav" aria-label="App navigation">
        <button className="text-button" onClick={() => setView('home')}>Home</button>
        {isAcceptedStudent && <button className={`text-button ${view === 'feed' ? 'nav-active' : ''}`} onClick={() => setView('feed')}>Campus Feed</button>}
        {isAdmin && <button className={`text-button ${view === 'dashboard' ? 'nav-active' : ''}`} onClick={() => setView('dashboard')}>Dashboard</button>}
      </nav>
    ) : (
      <nav className="desktop-nav" aria-label="Main navigation">
        <a href="#how-it-works">How it works</a>
        <a href="#discover">Campus life</a>
        <a href="#safety">Built on trust</a>
      </nav>
    )}

    <div className="nav-actions">
      {isAdmin && view !== 'dashboard' && <button className="text-button college-link" onClick={() => setView('dashboard')}>Dashboard <span>↗</span></button>}
      {isAcceptedStudent && view !== 'feed' && <button className="button button-small button-lime" onClick={() => setView('feed')}>Campus Feed <span>↗</span></button>}
      {!isAdmin && <button className="text-button college-link" onClick={() => setDialog({ type: "college" })}>For colleges <span>↗</span></button>}
      <button className="button button-small button-dark" onClick={() => setDialog({ type: "student" })}>
        {loading || membershipLoading ? 'Connecting…' : user ? 'Your account' : 'Join your campus'} <span>↗</span>
      </button>
      <button className="menu-button" aria-label="Open navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
    </div>
  </header>

  <nav className="mobile-nav" aria-label="Mobile navigation" hidden={!menuOpen} onClick={() => setMenuOpen(false)}>
    <a href="#how-it-works" onClick={() => setView('home')}>How it works</a>
    <a href="#discover" onClick={() => setView('home')}>Campus life</a>
    <a href="#safety" onClick={() => setView('home')}>Built on trust</a>
    {isAcceptedStudent && <button onClick={() => setView('feed')}>Campus Feed ↗</button>}
    {isAdmin && <button onClick={() => setView('dashboard')}>Dashboard ↗</button>}
    <button onClick={() => setDialog({ type: "college" })}>For colleges ↗</button>
  </nav>

  <main id="main">
    {showFeed ? (
      <section className="section" style={{ paddingTop: 40 }}>
        <LiveFeed />
      </section>
    ) : showDashboard ? (
      <section className="section" style={{ paddingTop: 40 }}>
        <CollegeDashboard />
      </section>
    ) : <>
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy"><div className="eyebrow"><span className="status-dot"></span> YOUR CAMPUS. YOUR PEOPLE.</div>
        <h1 id="hero-title">Small world.<br />Stronger<br /><span>connections.</span></h1>
        <p className="hero-description">That missing pair of headphones. A familiar face.<br className="desktop-break" /> A little help, right where you are.<br className="desktop-break" /> Find your people, within your Polygon.</p>
        <div className="hero-actions">
          <button className="button button-dark" onClick={() => setDialog({ type: "student" })}>
            {isAcceptedStudent ? 'Open campus feed' : 'Find your campus'} <span>↗</span>
          </button>
          <a className="button button-outline" href="#discover"><span className="play-icon">▶</span> Take a look around</a>
        </div>
        <div className="hero-assurance"><span className="mini-shield" aria-hidden="true">✓</span> College-verified. Community-first.</div>
      </div>
      <CampusScene onExplore={place => setDialog({ type: "place", place })} />
      <a className="scroll-cue" href="#how-it-works"><span>↓</span> A smaller circle. A bigger sense of belonging.</a>
    </section>
    <div className="principles-strip"><span>Made for the place you belong.</span><div><span>⌖ <b>Campus bounded</b></span><span>♧ <b>People powered</b></span><span>◷ <b>Here for the moment</b></span><span>◇ <b>Private by design</b></span></div></div>
    <section className="section how-section" id="how-it-works">
      <div className="section-heading reveal"><div><div className="eyebrow">01 / A LITTLE WORLD OF YOUR OWN</div><h2>Big campus.<br />Meet your small circle.</h2></div><p>No endless noise. No strangers from everywhere.<br />Just the people who share your everyday places.</p></div>
      <div className="steps">
        <article className="step reveal"><div className="step-visual invite-visual"><div className="invite-ticket"><span className="tiny-label">YOUR WAY IN</span><strong>Campus invite</strong><div className="code-digits"><span>P</span><span>G</span><span>•</span><span>•</span><span>•</span><span>•</span></div><span className="ticket-check">✓ Issued by your college</span></div><span className="visual-orbit">↗</span></div><div className="step-title"><span>01</span><h3>One campus. One invite.</h3></div><p>Your college creates its private community.<br />Join with Google and your college's invite code.</p></article>
        <article className="step reveal"><div className="step-visual zone-visual"><div className="zone-grid"></div><div className="mini-zone"></div><span className="zone-center">⌖</span><span className="zone-tag"><i></i> You're in your zone</span><span className="zone-caption">YOUR LOCATION. YOUR CHOICE.</span></div><div className="step-title"><span>02</span><h3>Find where you belong.</h3></div><p>Choose to check your campus zone.<br />Your exact location stays out of the feed.</p></article>
        <article className="step reveal"><div className="step-visual connect-visual"><div className="message-bubble bubble-one"><span>⌕</span> Anyone seen my headphones?</div><div className="message-bubble bubble-two"><span>↳</span> At the library desk! <b>✦</b></div><div className="message-bubble bubble-three">Small moment. Day made. <span>♡</span></div></div><div className="step-title"><span>03</span><h3>A little help goes a long way.</h3></div><p>Post, spot, and reconnect.<br />Good things happen when your campus shows up.</p></article>
      </div>
    </section>
    <Feed onOpen={setDialog} />
    <section className="section safety-section" id="safety"><div className="safety-illustration reveal"><div className="privacy-orbit orbit-one"></div><div className="privacy-orbit orbit-two"></div><div className="privacy-orbit orbit-three"></div><div className="privacy-core"><svg viewBox="0 0 100 110" fill="none" aria-hidden="true"><path d="M50 8 85 21v30c0 22-16 38-35 49C31 89 15 73 15 51V21L50 8Z" fill="#ecf6bf"/><path d="m34 52 11 11 22-26" stroke="#204638" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/></svg></div><span className="privacy-label label-one">⌖ Your place, not your pinpoint</span><span className="privacy-label label-two">◷ Moments, not a permanent trail</span><span className="privacy-label label-three">♡ A community with boundaries</span><div className="privacy-small">CLOSER TO YOUR PEOPLE.<br />IN CONTROL OF YOUR PRIVACY.</div></div>
      <div className="safety-copy reveal"><div className="eyebrow">03 / A SAFE SPACE, BY DESIGN</div><h2>Good boundaries.<br />Better communities.</h2><p className="section-description">Being nearby shouldn't mean giving everything away. Here's how we're designing Polygon to keep you in control.</p><div className="safety-points"><div><span>⌖</span><div><h3>Your location is your business.</h3><p>Opt in to a zone check. Leave whenever you want.<br />No public pins. No trail of your movements.</p></div></div><div><span>◷</span><div><h3>Useful now. Gone from the feed later.</h3><p>Posts have an expiry. Backups, safety reports and someone else's screenshots may last longer.</p></div></div><div><span>⚑</span><div><h3>Real people. Real accountability.</h3><p>Report a post, block a user, and let campus moderators review. Posting limits help keep spam out.</p></div></div></div><button className="text-button" onClick={() => setDialog({ type: "privacy" })}>Read the privacy approach <span>↗</span></button></div>
    </section>
    <section className="college-section section reveal"><div><div className="eyebrow">FOR THE PEOPLE BEHIND THE CAMPUS</div><h2>Your campus has a place.<br />Give it a Polygon.</h2><p>Set your boundary. Invite your students.<br />Build a more connected campus, one small moment at a time.</p><button className="button button-lime" onClick={() => setDialog({ type: "college" })}>Bring Polygon to your college <span>↗</span></button><span className="college-footnote">A private community, managed by your institution.</span></div><div className="college-art" aria-hidden="true"><div className="college-outline outline-one"></div><div className="college-outline outline-two"></div><div className="college-outline outline-three"></div><span className="college-star">✳</span><div className="college-art-tag"><span className="status-dot"></span> YOUR COMMUNITY, WITHIN A BOUNDARY.</div></div></section>
    <section className="section faq-section"><div className="reveal"><div className="eyebrow">A FEW THINGS YOU MIGHT WONDER</div><h2>A little clarity.</h2></div><div className="faq-list reveal"><details><summary>Can anyone join my campus?<span>+</span></summary><p>Students sign in with personal Google accounts, then use a college invite to request membership. College management must approve them before they can access the campus feed. Google sign-in is connected; invite redemption and approval are still being built.</p></details><details><summary>Do I have to share my location?<span>+</span></summary><p>Location is optional and starts only after you click a location button. A live check runs while its dialog is open and the tab is visible. You can stop it at any time. Without a fresh, accurate reading, your location stays unconfirmed. The local preview does not grant access to a private campus feed.</p></details><details><summary>What happens when a post expires?<span>+</span></summary><p>Our proposed default is 72 hours. After expiry, a post leaves the feed and cannot receive new claims. Database and image cleanup happens separately. Restricted safety evidence may be retained for 30 days; backups and copies made by other people may persist. Final retention terms will be confirmed before launch.</p></details><details><summary>How is returning an item safer?<span>+</span></summary><p>The planned claim flow asks the claimant for a detail that wasn't publicly posted, such as an identifying mark. The finder or a campus moderator reviews it. Arrange the handoff at a designated campus desk and never post a full ID card, password, or device serial number.</p></details></div></section>
    </>}
  </main>
  <footer className="footer"><div><a className="brand" href="#" onClick={e => { e.preventDefault(); setView('home'); }}><span className="brand-mark"><img src="assets/polygon-brand.png" alt="" /></span><span>polygon<span className="brand-dot">.</span></span></a><p>Your community, within a boundary.</p></div><div className="footer-links"><a href="#how-it-works" onClick={() => setView('home')}>How it works</a><button onClick={() => setDialog({ type: "privacy" })}>Privacy approach</button><button onClick={() => setDialog({ type: "college" })}>For colleges ↗</button></div><div className="footer-bottom"><span>© 2026 Polygon · A project by Orion Pax</span><span>Made for a little more belonging. <b>✳</b></span></div></footer>
  <Modal dialog={dialog} onClose={() => setDialog(null)} />
</>);
}
