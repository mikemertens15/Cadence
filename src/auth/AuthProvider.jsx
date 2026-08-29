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

// Where an emailed link should come back to. Supabase only honours this if it
// matches the project's Redirect URLs allow list — an unlisted value is quietly
// swapped for the project's Site URL rather than rejected, which is how every
// link we sent from production ended up pointing at http://localhost:3000.
//
// Two details decide whether the value is honoured:
//
//   The trailing slash. Supabase matches the allow list as a glob in which `/`
//   is a separator, so the usual `https://example.com/**` entry does not match
//   a bare `https://example.com` — `window.location.origin` on its own gets
//   rejected and falls back to the Site URL. Sending the slash matches.
//
//   VITE_SITE_URL. A preview deployment's origin is unpredictable, so a link
//   sent from one has no allow-listed address to return to. Pointing this at
//   the real site sends those links somewhere that exists.
const SITE_URL = (() => {
  const base =
    import.meta.env.VITE_SITE_URL || (typeof window === 'undefined' ? '' : window.location.origin);
  // Nothing to offer: let Supabase fall back to the Site URL on its own.
  if (!base) return undefined;
  return base.endsWith('/') ? base : `${base}/`;
})();

// How close to expiry an access token has to be before it's treated as already
// dead. Thirty seconds: a token with ten left will expire somewhere in the
// middle of the ten reads the app opens with, which fails half of them.
const STALE_MS = 30_000;

const isStale = (s) =>
  typeof s?.expires_at === 'number' && s.expires_at * 1000 - Date.now() < STALE_MS;

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
    let cancelled = false;

    (async () => {
      // getSession() waits for the client to finish parsing any link in the
      // URL, so this resolves with the recovery session already in hand.
      const { data } = await supabase.auth.getSession();
      let sess = data.session ?? null;

      // An access token lives an hour, and a tab that has been shut since last
      // night wakes up holding a dead one. getSession() hands that straight
      // back and starts a refresh in the background — so the ten reads this app
      // opens with went out carrying an expired JWT, came back 401, and landed
      // on "Couldn't load your semester" nearly every morning.
      //
      // Waiting for the refresh here costs one round trip on a cold open and
      // means nothing downstream ever sees a token that has already expired.
      if (isStale(sess)) {
        const { data: fresh, error } = await supabase.auth.refreshSession();
        // A refresh token that the server no longer has — rotated away, or from
        // a project that was reset — is not a loading problem, it's a signed-out
        // one. Saying so sends you to the sign-in screen, which is the thing
        // that actually fixes it, rather than to a data screen that can't load
        // and can't explain why.
        sess = error ? null : (fresh.session ?? null);
      }

      if (!cancelled) {
        setSession(sess);
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      setSession(sess ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Passwordless: emails a one-click link that redirects back here. Doubles as
  // sign-up — Supabase creates the account on first use.
  const signInWithMagicLink = useCallback(async (email) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: (email || '').trim(),
      options: { emailRedirectTo: SITE_URL },
    });
    if (error) throw error;
  }, []);

  // Sign-up with no inbox round-trip. With "Confirm email" off in the project's
  // auth settings, Supabase creates the account and hands back a session in the
  // same response: the person is signed in before they've looked away from the
  // screen, and no mail is sent at all. That's the whole point — an emailed
  // link is a place for a new user to get lost, and the allowance it spends is
  // the scarcest thing this project has.
  //
  // With confirmations still on, the identical call returns a user and a null
  // session and sends a confirmation instead. Reporting which of the two
  // happened lets the screen say the right thing under either setting, so this
  // works before the toggle is flipped as well as after.
  const signUpWithPassword = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email: (email || '').trim(),
      password,
      options: { emailRedirectTo: SITE_URL },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
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
      redirectTo: SITE_URL,
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
    signUpWithPassword,
    sendPasswordReset,
    setPassword,
    endRecovery,
    clearLinkError,
    signOut,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
