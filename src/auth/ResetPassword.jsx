import { useState } from 'react';
import { colors, shadows, fonts } from '../theme';
import { useAuth } from './AuthProvider';
import { Shell, Brand, inputStyle } from './SignIn';

// Reached only by following a recovery link, which signs you in *and* leaves
// `recovering` set — so this screen sits between that link and the app, and the
// only ways past it are choosing a password or signing out.
export function ResetPassword() {
  const { setPassword, endRecovery, signOut } = useAuth();
  const [password, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= 8 && confirm === password && !busy;

  async function submit(e) {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError('');
    try {
      await setPassword(password);
      endRecovery();
    } catch (err) {
      setError(err?.message || 'Could not set that password. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const hint = error || (tooShort ? 'Use at least 8 characters.' : mismatch ? "Those don't match." : '');

  return (
    <Shell>
      <Brand />
      <form onSubmit={submit}>
        <div style={{ font: `400 27px ${fonts.serif}`, color: colors.ink, marginBottom: 6 }}>
          Choose a new password
        </div>
        <div style={{ font: `400 14px/1.5 ${fonts.sans}`, color: colors.muted2, marginBottom: 22 }}>
          You&rsquo;re signed in from the link. Set a password and you won&rsquo;t need the inbox next time.
        </div>

        <input
          type="password"
          autoFocus
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPass(e.target.value)}
          placeholder="New password"
          style={inputStyle(12)}
        />
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          style={inputStyle(hint ? 8 : 18)}
        />
        {hint && (
          <div
            style={{
              font: `500 12.5px/1.45 ${fonts.sans}`,
              color: colors.accentDark,
              marginBottom: 16,
            }}
          >
            {hint}
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
          {busy ? 'Saving…' : 'Save password'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={signOut}
            style={{ font: `600 13px ${fonts.sans}`, color: colors.muted2 }}
          >
            Sign out instead
          </button>
        </div>
      </form>
    </Shell>
  );
}
