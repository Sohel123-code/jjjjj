import { supabase } from './supabase.js';
const normalize = user => user && !user.is_anonymous ? {
  uid: user.id, email: user.email, displayName: user.user_metadata?.full_name || 'Polygon member',
} : null;
// Demo identities belong only to createDemo(). Never replace a failed login.
export const authService = {
  async initialize() { const { error } = await supabase.auth.getSession(); if (error) throw error; },
  subscribe(onChange) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => onChange(normalize(session?.user)));
    return () => subscription.unsubscribe();
  },
  async signIn() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
    if (error) throw error;
  },
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    localStorage.removeItem('polygon-local-uid');
  },
};
