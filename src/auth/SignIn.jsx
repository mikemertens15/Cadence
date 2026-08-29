import { useState, useEffect } from 'react';
import { colors, shadows, fonts } from '../theme';
import { useAuth } from './AuthProvider';

// Sending mail is the one thing this screen does that costs something finite.
// The auth email allowance is a bucket for the whole project, not per person —
// so an impatient second click doesn't just repeat a request, it spends part of
// the same budget everyone else signing up today is drawing from. Two clicks
// three seconds apart is what actually emptied it.
//
// So a send locks both email buttons briefly, and a refusal locks them for
// longer: there is nothing to gain from re-asking for mail the server has
// already declined to send.
const SEND_COOLDOWN_MS = 60_000;
const LIMIT_COOLDOWN_MS = 15 * 60_000;

// Held in localStorage rather than in state alone, because reloading is the
// obvious thing to try when a page looks stuck, and a reload shouldn't hand
// back a fresh allowance.
const COOL_KEY = 'cadence.mailCooldownUntil';

function readCooldown() {
  try {
    const until = Number(localStorage.getItem(COOL_KEY));
    return Number.isFinite(until) && until > Date.now() ? until : 0;
  } catch {
    return 0; // private browsing throws; the in-session value still applies
  }
}

function writeCooldown(until) {
  try {
    localStorage.setItem(COOL_KEY, String(until));
  } catch {
    /* same — nothing to persist to, nothing to do about it */
  }
}

// The shared allowance comes back as a 429. Its own message — "email rate limit
// exceeded" — reads like an accusation, and the one thing it fails to say is
// that the cap belongs to the app rather than to the person reading it.
const isRateLimited = (err) => err?.status === 429 || err?.code === 'over_email_send_rate_limit';

// A number you can wait out, or one you should go and do something else about.
function waitLabel(ms) {
  const s = Math.ceil(ms / 1000);
  return s > 90 ? `${Math.ceil(s / 60)} min` : `${s}s`;
}

// Email + password is the everyday path (no inbox round-trip); the magic link
// covers the first visit, a new device, and anyone who never set a password.
export function SignIn() {
  const { signInWithMagicLink, signInWithPassword, sendPasswordReset, linkError, clearLinkError } =
    useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState(null); // null | 'link' | 'reset'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [coolUntil, setCoolUntil] = useState(readCooldown);

  // Tick once a second while a countdown is running, and only then — the last
  // tick stops the interval and re-renders with the buttons live again.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (coolUntil <= Date.now()) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      if (coolUntil <= Date.now()) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [coolUntil]);

  const coolLeft = Math.max(0, coolUntil - Date.now());
  const cooling = coolLeft > 0;
  const noMail = busy || cooling || !email.trim();

  const canSubmit = email.trim() && password && !busy;
  // An expired or already-used email link reports itself in the URL; show that
  // once, then let normal form errors take over.
  const notice = error || linkError;

  async function submit(e) {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    clearLinkError();
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setError(
        /invalid/i.test(err?.message || '')
          ? "That didn't match. Reset it below, or use an email link if you never set one."
          : err?.message || 'Something went wrong. Try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  function startCooldown(ms) {
    const until = Date.now() + ms;
    writeCooldown(until);
    setCoolUntil(until);
  }

  // Both email paths behave identically apart from which mail goes out.
  async function mail(kind) {
    if (noMail) return;
    setBusy(true);
    setError('');
    clearLinkError();
    try {
      await (kind === 'reset' ? sendPasswordReset(email) : signInWithMagicLink(email));
      startCooldown(SEND_COOLDOWN_MS);
      setSent(kind);
    } catch (err) {
      if (isRateLimited(err)) {
        startCooldown(LIMIT_COOLDOWN_MS);
        setError(
          'Cadence has sent as much mail as it\u2019s allowed to this hour \u2014 that\u2019s a limit on the app, ' +
            'not on you, and nothing you do here will hurry it. If you already have a password, ' +
            'sign in with it above; otherwise the link will go out once the hour turns over.',
        );
      } else {
        setError(err?.message || 'Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Brand />
      {sent ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: `400 26px ${fonts.serif}`, color: colors.ink, marginBottom: 10 }}>
            Check your inbox
          </div>
          <div style={{ font: `400 14px/1.5 ${fonts.sans}`, color: colors.muted2, marginBottom: 22 }}>
            We sent {sent === 'reset' ? 'a link to reset your password' : 'a sign-in link'} to{' '}
            <b style={{ color: colors.ink }}>{email}</b>. Open it on this device to continue.
          </div>
          <button
            onClick={() => setSent(null)}
            style={{ font: `600 13px ${fonts.sans}`, color: colors.accent }}
          >
            Back to sign in
          </button>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div style={{ font: `400 27px ${fonts.serif}`, color: colors.ink, marginBottom: 6 }}>
            Where things stand
          </div>
          <div style={{ font: `400 14px/1.5 ${fonts.sans}`, color: colors.muted2, marginBottom: 22 }}>
            Your classes, what&rsquo;s due, and the grade you actually have.
          </div>

          <Field label="Email">
            <input
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@tntech.edu"
              style={inputStyle(18)}
            />
          </Field>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 8,
            }}
          >
            <label style={{ font: `600 12px ${fonts.sans}`, color: colors.muted2 }}>Password</label>
            <button
              type="button"
              onClick={() => mail('reset')}
              disabled={noMail}
              title={
                cooling
                  ? `Another email can go out in ${waitLabel(coolLeft)}`
                  : email.trim()
                    ? 'Email a reset link'
                    : 'Enter your email first'
              }
              style={{
                font: `600 12px ${fonts.sans}`,
                color: colors.accent,
                opacity: noMail ? 0.5 : 1,
                cursor: noMail ? 'default' : 'pointer',
              }}
            >
              Forgot password?
            </button>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={inputStyle(notice ? 8 : 18)}
          />
          {notice && (
            <div
              style={{
                font: `500 12.5px/1.45 ${fonts.sans}`,
                color: colors.accentDark,
                marginBottom: 16,
              }}
            >
              {notice}
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: 22,
              background: colors.accent,
              color: colors.onAccent,
              font: `600 14px ${fonts.sans}`,
              boxShadow: shadows.accent,
              opacity: canSubmit ? 1 : 0.6,
              cursor: canSubmit ? 'pointer' : 'default',
            }}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 18 }}>
            <div style={{ font: `400 12.5px ${fonts.sans}`, color: colors.muted, marginBottom: 6 }}>
              First time here, or no password yet?
            </div>
            <button
              type="button"
              onClick={() => mail('link')}
              disabled={noMail}
              style={{
                font: `600 13px ${fonts.sans}`,
                color: colors.accent,
                opacity: noMail ? 0.6 : 1,
                cursor: noMail ? 'default' : 'pointer',
              }}
            >
              {/* The countdown is the whole point: a disabled button with no
                  reason on it is the thing that gets clicked ten more times. */}
              {cooling ? `Another link in ${waitLabel(coolLeft)}` : 'Email me a sign-in link'}
            </button>
          </div>
        </form>
      )}
    </Shell>
  );
}

function Field({ label, children }) {
  return (
    <>
      <label
        style={{
          font: `600 12px ${fonts.sans}`,
          color: colors.muted2,
          display: 'block',
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {children}
    </>
  );
}

export function inputStyle(marginBottom) {
  return {
    width: '100%',
    border: `1px solid ${colors.inputBorder}`,
    background: colors.inputBg,
    borderRadius: 12,
    padding: '12px 14px',
    font: `500 14px ${fonts.sans}`,
    color: colors.ink,
    outline: 'none',
    marginBottom,
  };
}

// Centered card on the paper background — shared by SignIn, ResetPassword and
// the first-run setup flow.
export function Shell({ children, width = 420 }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: colors.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width,
          maxWidth: '100%',
          background: colors.card,
          border: `1px solid ${colors.cardBorder}`,
          borderRadius: 22,
          padding: '34px 34px 36px',
          boxShadow: shadows.modal,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 26 }}>
      <Mark />
      <div style={{ font: `400 25px ${fonts.serif}`, color: colors.ink, lineHeight: 1 }}>Cadence</div>
    </div>
  );
}

// The three rising beats from the app icon.
export function Mark({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill={colors.accent} />
      <g fill={colors.onAccent}>
        <rect x="14" y="36" width="9" height="14" rx="4.5" />
        <rect x="27.5" y="27" width="9" height="23" rx="4.5" />
        <rect x="41" y="14" width="9" height="36" rx="4.5" />
      </g>
    </svg>
  );
}
