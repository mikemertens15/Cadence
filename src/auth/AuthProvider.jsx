import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Tracks the Supabase auth session and exposes the four actions the app needs:
// password sign-in for everyday use, a magic link for the first visit or a new
// device, a reset for a forgotten password, and sign-out.
//
// Carried over from Tend almost unchanged — the recovery-hash handling below is
// subtle enough that reimplementing it from scratch would only be a chance to
// get it wrong again.
const AuthContext = createContext(null);

// A recovery link lands back here as a URL hash. supabase-js strips that hash as
// soon as it processes it, so we read it once at module load — before the client
// finishes initializing — and keep what we learned.
//
//   success: #access_token=…&type=recovery
//   failure: #error=access_denied&error_code=otp_expired&error_description=…
const initialHash = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '');
const initialParams = new URLSearchParams(initialHash);
const CAME_FROM_RECOVERY = initialParams.get('type') === 'recovery';
const INITIAL_LINK_ERROR = initialParams.get('error_description') || '';

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  // True while the user is coming in from a "reset your password" email. The
  // link signs them in, so without this flag they'd sail straight past the
  // screen that lets them choose a new password.
  const [recovering, setRecovering] = useState(CAME_FROM_RECOVERY);
  // Set when the emailed link was expired or already used, so the sign-in
  // screen can say why instead of silently doing nothing.
  const [linkError, setLinkError] = useState(INITIAL_LINK_ERROR);

  useEffect(() => {
    // getSession() waits for the client to finish parsing any link in the URL,
    // so this resolves with the recovery session already in hand.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Passwordless: emails a one-click link that redirects back here. Doubles as
  // sign-up — Supabase creates the account on first use.
  const signInWithMagicLink = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: (email || '').trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const signInWithPassword = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: (email || '').trim(),
      password,
    });
    if (error) throw error;
  }, []);

  // Emails a recovery link. Following it returns here with `recovering` set,
  // which routes to the "choose a new password" screen.
  const sendPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail((email || '').trim(), {
      redirectTo: window.location.origin,
    });
    if (error) throw error;
  }, []);

  // Attach a password to the signed-in account — used by the reset screen and
  // by the account panel in Settings.
  const setPassword = useCallback(async (password) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  // Leave recovery mode once a new password is chosen (or the user backs out).
  const endRecovery = useCallback(() => setRecovering(false), []);
  const clearLinkError = useCallback(() => setLinkError(''), []);

  const signOut = useCallback(async () => {
    setRecovering(false);
    await supabase.auth.signOut();
  }, []);

  const value = {
    session,
    loading,
    recovering,
    linkError,
    signInWithMagicLink,
    signInWithPassword,
    sendPasswordReset,
    setPassword,
    endRecovery,
    clearLinkError,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
