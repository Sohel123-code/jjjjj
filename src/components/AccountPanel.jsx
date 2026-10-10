import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import StudentJoinForm from './StudentJoinForm.jsx';

export default function AccountPanel({ college = false }) {
  const { user, loading, pending, error, signIn, signOut, retry, clearError } = useAuth();
  const [message, setMessage] = useState('');
  const busy = loading || pending;

  if (loading) return <div className="auth-loading" role="status"><span className="auth-spinner"/> Checking your sign-in session…</div>;

  if (user) return <section className="account-panel" aria-label="Your account">
    <div className="account-identity">
      <span className="account-avatar" aria-hidden="true">{(user.displayName || user.email || 'P').slice(0,1).toUpperCase()}</span>
      <div>
        <strong>{user.displayName || 'Polygon member'}</strong>
        <span>{user.email}</span>
      </div>
      <span className="account-badge">Signed in</span>
    </div>
    {college
      ? <p className="account-notice">Your Google account is connected. Use the campus setup below to register your college. A unique College ID will be generated for students to join.</p>
      : <>
        <p className="account-notice">Your Google account is connected. Enter your college's unique ID and student details below to request membership.</p>
        <StudentJoinForm />
      </>}
    {message && <p className="form-status" role="status">{message}</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="text-button sign-out-button" disabled={pending} onClick={async () => { if (await signOut()) { setMessage(''); } }}>{pending ? 'Please wait…' : 'Sign out'}</button>
  </section>;

  return <>
    <p className="account-notice">{college ? "Sign in with the Google account you want to use for college management. A unique College ID will be generated after registration." : "Use your personal Google account to join your campus. You'll need the College ID from your institution."}</p>
    <button className="button google-button" disabled={busy} onClick={() => {setMessage('');signIn();}}><span className="google-g" aria-hidden="true">G</span>{pending ? 'Waiting for Google…' : 'Continue with Google'}{!pending && <span>↗</span>}</button>
    <p className="dialog-help">Google shares your name, email and profile image with Firebase Authentication. Your session lasts for this browser tab.</p>
    {error && <div className="auth-error" role="alert"><p>{error}</p><button className="text-button" onClick={retry} disabled={pending}>Retry connection</button></div>}
  </>;
}
