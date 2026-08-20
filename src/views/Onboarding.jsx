import { useState } from 'react';
import { colors, fonts } from '../theme';
import { Shell, Brand } from '../auth/SignIn';
import { useSemester } from '../data/SemesterProvider';
import { useAuth } from '../auth/AuthProvider';
import { Field, inputStyle, PrimaryButton } from '../components/Modal';

// The very first screen after signing in. The app has no seed data, so this is
// the one moment where an empty database is the expected state rather than a
// bug — and the fastest way through it is to have already guessed the answers.
//
// Only a term is created here. Courses come next, in the real app with its real
// course form, because a wizard that keeps going is a wizard people quit.

// A term guessed from today's date, which is right nearly every time: nobody
// sets this app up in March for the following September.
function guessTerm(now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth(); // 0 = Jan

  if (m <= 4) return { name: `Spring ${y}`, start: `${y}-01-08`, end: `${y}-05-08` };
  if (m <= 6) return { name: `Summer ${y}`, start: `${y}-05-20`, end: `${y}-08-01` };
  return { name: `Fall ${y}`, start: `${y}-08-20`, end: `${y}-12-12` };
}

export function Onboarding() {
  const { createTerm } = useSemester();
  const { signOut } = useAuth();
  const guess = guessTerm();

  const [name, setName] = useState(guess.name);
  const [start, setStart] = useState(guess.start);
  const [end, setEnd] = useState(guess.end);
  const [busy, setBusy] = useState(false);

  const canSave = name.trim() && start && end && end >= start && !busy;

  async function submit(e) {
    e?.preventDefault();
    if (!canSave) return;
    setBusy(true);
    await createTerm({ name, startDate: start, endDate: end });
    setBusy(false);
  }

  return (
    <Shell>
      <Brand />
      <form onSubmit={submit}>
        <div style={{ font: `400 27px ${fonts.serif}`, color: colors.ink, marginBottom: 6 }}>
          Start with a term
        </div>
        <div style={{ font: `400 14px/1.55 ${fonts.sans}`, color: colors.muted2, marginBottom: 24 }}>
          Everything hangs off this — your schedule, what&rsquo;s due, and the GPA for the semester.
          We&rsquo;ve guessed from today&rsquo;s date; change anything that&rsquo;s off.
        </div>

        <Field label="Term">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Fall 2026"
            style={inputStyle}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="First day">
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={inputStyle}
            />
          </Field>
          <Field label="Last day">
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={inputStyle}
            />
          </Field>
        </div>

        {end && start && end < start && (
          <div style={{ font: `500 12.5px ${fonts.sans}`, color: colors.accentDark, marginBottom: 14 }}>
            The last day comes before the first.
          </div>
        )}

        <PrimaryButton
          type="submit"
          onClick={submit}
          disabled={!canSave}
          style={{ width: '100%', padding: 13, fontSize: 14 }}
        >
          {busy ? 'Setting up…' : 'Create term'}
        </PrimaryButton>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <button
            type="button"
            onClick={signOut}
            style={{ font: `600 12.5px ${fonts.sans}`, color: colors.muted }}
          >
            Sign out
          </button>
        </div>
      </form>
    </Shell>
  );
}
