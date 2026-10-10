import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { validateInvite } from '../lib/validation.js';

export default function AccountPanel({ college = false }) {
  const { user, loading, pending, error, signIn, signOut, retry, clearError } = useAuth();
  const [mode, setMode] = useState('join');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const busy = loading || pending;
  const switchMode = next => { setMode(next); setMessage(''); clearError(); };

  if (loading) return <div className="auth-loading" role="status"><span className="auth-spinner"/> Checking your sign-in session…</div>;

  if (user) return <section className="account-panel" aria-label="Your account">
    <div className="account-identity"><span className="account-avatar" aria-hidden="true">{(user.displayName || user.email || 'P').slice(0,1).toUpperCase()}</span><div><strong>{user.displayName || 'Polygon member'}</strong><span>{user.email}</span></div><span className="account-badge">Signed in</span></div>
    <p className="account-notice">{college ? 'Your Google account is connected. Management verification and college registration are the next step; this account has no administrator permissions yet.' : 'Your Google account is connected. Campus membership requires a college invite and approval from management.'}</p>
    {!college && <form className="dialog-form" onSubmit={event => {
      event.preventDefault();
      const failure = validateInvite(code);
      setMessage(failure || 'The code format is valid, but college joining is not available yet. No invite has been verified or submitted. When registration opens, management must approve your request before you can access the campus feed.');
    }}>
      <label className="field">College invite code<input value={code} onChange={event => {setCode(event.target.value);setMessage('');}} placeholder="Enter the code from your college" autoComplete="off" required minLength={6} maxLength={40} spellCheck="false" disabled={pending}/></label>
      <button className="button button-outline" type="submit" disabled={pending}>Check code format <span>↗</span></button>
      <p className="dialog-help">Membership requests are not open yet. Code checks stay in this dialog and do not grant access.</p>
    </form>}
    {message && <p className="form-status" role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="text-button sign-out-button" disabled={pending} onClick={async () => { if (await signOut()) {setCode('');setMessage('');} }}>{pending ? 'Please wait…' : 'Sign out'}</button>
  </section>;

  return <>
    {!college && <div className="auth-tabs"><button className={mode === 'join' ? 'active' : ''} onClick={() => switchMode('join')} aria-pressed={mode === 'join'} disabled={pending}>Join your campus</button><button className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')} aria-pressed={mode === 'login'} disabled={pending}>Log in</button></div>}
    <p className="account-notice">{college ? 'Sign in with the Google account you want to use for college management. Institutional verification will be required before you can manage a campus.' : mode === 'join' ? 'Use your personal Google account. Your college will approve your membership after you submit its invite code. College joining is not open yet.' : 'Sign in to your Polygon account. Google sign-in is available; campus membership and the private feed are still being built.'}</p>
    <button className="button google-button" disabled={busy} onClick={() => {setMessage('');signIn();}}><span className="google-g" aria-hidden="true">G</span>{pending ? 'Waiting for Google…' : 'Continue with Google'}{!pending && <span>↗</span>}</button>
    <p className="dialog-help">Google shares your name, email and profile image with Firebase Authentication. Your session lasts for this browser tab. Polygon doesn’t request location or enable Analytics during sign-in.</p>
    {error && <div className="auth-error" role="alert"><p>{error}</p><button className="text-button" onClick={retry} disabled={pending}>Retry connection</button></div>}
  </>;
}
