import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { authService } from '../lib/supabaseAuth.js';
const authErrorMessage = error => error?.message || 'Could not sign in. Please retry.';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe;
    setLoading(true);
    setError('');
    authService.initialize().then(() => {
      if (cancelled) return;
      unsubscribe = authService.subscribe(currentUser => {
        if (cancelled) return;
        setUser(currentUser);
        setLoading(false);
      }, failure => {
        if (cancelled) return;
        console.error('Supabase Auth state error:', failure);
        setError(authErrorMessage(failure));
        setLoading(false);
      });
    }).catch(failure => {
      if (!cancelled) {
        console.error('Supabase Auth init error:', failure);
        setError(authErrorMessage(failure));
        setLoading(false);
      }
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, [attempt]);

  async function perform(action) {
    setPending(true);
    setError('');
    try { await action(); return true; }
    catch (failure) {
      console.error('Supabase Auth action error:', failure);
      if (mounted.current) setError(authErrorMessage(failure));
      return false;
    }
    finally { if (mounted.current) setPending(false); }
  }
  const value = {
    user, loading, pending, error,
    signIn: () => perform(() => authService.signIn()),
    signOut: () => perform(() => authService.signOut()),
    retry: () => setAttempt(value => value + 1),
    clearError: () => setError(''),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
