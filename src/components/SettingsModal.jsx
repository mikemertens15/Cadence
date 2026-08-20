import { useState } from 'react';
import { colors, tone, fonts } from '../theme';
import { parseDay, monthDay } from '../dates';
import { useTheme } from '../useTheme';
import { useAuth } from '../auth/AuthProvider';
import { useSemester } from '../data/SemesterProvider';
import { ModalShell, Field, Chip, inputStyle, PrimaryButton, GhostButton } from './Modal';

// Everything that isn't day-to-day: which term you're looking at, how the app
// looks, and the account behind it. One modal rather than a settings tab —
// none of it is visited often enough to earn a permanent slot in the nav.
export function SettingsModal({ onClose, phone, startOn = 'terms' }) {
  const { mode, setMode } = useTheme();
  const { session, setPassword, signOut } = useAuth();
  const { terms, activeTerm, setTermId, createTerm, deleteTerm } = useSemester();

  const [tab, setTab] = useState(startOn);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [password, setPass] = useState('');
  const [passNote, setPassNote] = useState('');
  const [busy, setBusy] = useState(false);

  const canAddTerm = name.trim() && start && end && end >= start && !busy;

  async function addTerm() {
    if (!canAddTerm) return;
    setBusy(true);
    await createTerm({ name, startDate: start, endDate: end });
    setName('');
    setStart('');
    setEnd('');
    setAdding(false);
    setBusy(false);
  }

  async function savePassword() {
    if (password.length < 8 || busy) return;
    setBusy(true);
    try {
      await setPassword(password);
      setPassNote('Saved. You can sign in with it from now on.');
      setPass('');
    } catch (err) {
      setPassNote(err?.message || 'Could not save that password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title="Settings"
      onClose={onClose}
      phone={phone}
      footer={<GhostButton onClick={onClose} style={{ marginLeft: 'auto' }}>Done</GhostButton>}
    >
      <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
        <Chip active={tab === 'terms'} onClick={() => setTab('terms')}>
          Terms
        </Chip>
        <Chip active={tab === 'look'} onClick={() => setTab('look')}>
          Appearance
        </Chip>
        <Chip active={tab === 'account'} onClick={() => setTab('account')}>
          Account
        </Chip>
      </div>

      {tab === 'terms' && (
        <>
          <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
            {terms.map((t) => {
              const active = t.id === activeTerm?.id;
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 14px',
                    borderRadius: 13,
                    background: active ? colors.chipBg : colors.inputBg,
                    border: `1px solid ${active ? colors.selected : colors.cardBorder}`,
                  }}
                >
                  <button onClick={() => setTermId(t.id)} style={{ flex: 1, textAlign: 'left' }}>
                    <div style={{ font: `600 13px ${fonts.sans}`, color: colors.ink }}>{t.name}</div>
                    <div style={{ font: `500 11px ${fonts.sans}`, color: colors.muted2, marginTop: 2 }}>
                      {monthDay(parseDay(t.start_date))} – {monthDay(parseDay(t.end_date))}
                      {active ? ' · showing' : ''}
                    </div>
                  </button>
                  {/* Deleting a term takes its courses, assignments and scores
                      with it, so this asks twice. */}
                  <button
                    onClick={async () => {
                      if (confirmDelete === t.id) {
                        await deleteTerm(t.id);
                        setConfirmDelete(null);
                      } else {
                        setConfirmDelete(t.id);
                      }
                    }}
                    style={{ font: `600 11.5px ${fonts.sans}`, color: tone.red }}
                  >
                    {confirmDelete === t.id ? 'Delete everything?' : 'Delete'}
                  </button>
                </div>
              );
            })}
          </div>

          {adding ? (
            <>
              <Field label="Term name">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Spring 2027"
                  style={inputStyle}
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="First day">
                  <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Last day">
                  <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} style={inputStyle} />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <PrimaryButton onClick={addTerm} disabled={!canAddTerm}>
                  {busy ? 'Adding…' : 'Add term'}
                </PrimaryButton>
                <GhostButton onClick={() => setAdding(false)}>Cancel</GhostButton>
              </div>
            </>
          ) : (
            <button
              onClick={() => setAdding(true)}
              style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
            >
              + New term
            </button>
          )}
        </>
      )}

      {tab === 'look' && (
        <Field label="Theme" hint="System follows your phone or laptop">
          <div style={{ display: 'flex', gap: 7 }}>
            {['system', 'light', 'dark'].map((m) => (
              <Chip key={m} active={mode === m} onClick={() => setMode(m)}>
                {m[0].toUpperCase() + m.slice(1)}
              </Chip>
            ))}
          </div>
        </Field>
      )}

      {tab === 'account' && (
        <>
          <div
            style={{
              font: `500 13px ${fonts.sans}`,
              color: colors.muted3,
              background: colors.inputBg,
              border: `1px solid ${colors.cardBorder}`,
              borderRadius: 12,
              padding: '11px 13px',
              marginBottom: 18,
            }}
          >
            {session?.user?.email}
          </div>

          <Field label="Set a password" hint="at least 8 characters">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPass(e.target.value);
                setPassNote('');
              }}
              placeholder="••••••••"
              style={inputStyle}
            />
          </Field>
          {passNote && (
            <div style={{ font: `500 12px ${fonts.sans}`, color: colors.accentDark, marginBottom: 14 }}>
              {passNote}
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <PrimaryButton onClick={savePassword} disabled={password.length < 8 || busy}>
              {busy ? 'Saving…' : 'Save password'}
            </PrimaryButton>
            <button
              onClick={signOut}
              style={{ marginLeft: 'auto', font: `600 12.5px ${fonts.sans}`, color: tone.red }}
            >
              Sign out
            </button>
          </div>

          <div style={{ font: `400 11px ${fonts.sans}`, color: colors.faint, marginTop: 22 }}>
            Cadence {__APP_VERSION__} · {__APP_COMMIT__}
          </div>
        </>
      )}
    </ModalShell>
  );
}
