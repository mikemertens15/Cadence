import { useState } from 'react';
import { colors, tone, fonts } from '../theme';
import { dayRangeLabel, dayRangeLength } from '../dates';
import { useSemester } from '../data/SemesterProvider';
import { Field, Chip, inputStyle, PrimaryButton, GhostButton } from './Modal';

// Days the university takes back.
//
// Meeting rows are weekly and have no opinion about the calendar, so without
// this the app cheerfully tells you to be in Bruner 218 on Thanksgiving — and
// the "next class" countdown on the dashboard counts down to a room nobody is
// in. Entering the four or five dates off the academic calendar once, in
// September, fixes the whole term.
//
// A break empties the recurring classes inside it and nothing else. Anything
// with a real date — an exam, a paper due Monday — still stands: professors
// schedule work over a long weekend constantly, and quietly hiding it would be
// the more expensive mistake of the two.

// The ones nearly every US semester has, so the common case is a tap and two
// dates rather than typing "Thanksgiving Break" from scratch.
const COMMON = ['Fall Break', 'Thanksgiving Break', 'Spring Break', 'Labor Day', 'Reading Day'];

export function BreaksPanel({ term }) {
  const { breaks, createBreak, deleteBreak } = useSemester();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);

  // A single day off is the same row with both ends equal, so filling only the
  // first date is a complete answer rather than a half-finished form.
  const effectiveEnd = end || start;
  const canAdd = name.trim() && start && effectiveEnd >= start && !busy;

  async function add() {
    if (!canAdd) return;
    setBusy(true);
    await createBreak({ termId: term.id, name, startDate: start, endDate: effectiveEnd });
    setName('');
    setStart('');
    setEnd('');
    setAdding(false);
    setBusy(false);
  }

  return (
    <>
      <div style={{ marginBottom: 10 }}>
        <div style={{ font: `400 17px ${fonts.serif}`, color: colors.ink }}>Days off</div>
        <div style={{ font: `400 12px/1.5 ${fonts.sans}`, color: colors.muted2, marginTop: 3 }}>
          Breaks and holidays in {term.name}. Classes stop on these days; anything with a due date
          still counts.
        </div>
      </div>

      {breaks.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {breaks.map((b) => {
            const days = dayRangeLength(b.start_date, b.end_date);
            return (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '11px 13px',
                  borderRadius: 12,
                  background: colors.inputBg,
                  border: `1px solid ${colors.cardBorder}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: `600 13px ${fonts.sans}`, color: colors.ink }}>{b.name}</div>
                  <div style={{ font: `500 11px ${fonts.sans}`, color: colors.muted2, marginTop: 2 }}>
                    {dayRangeLabel(b.start_date, b.end_date)}
                    {days > 1 ? ` · ${days} days` : ''}
                  </div>
                </div>
                <button
                  onClick={() => deleteBreak(b.id)}
                  style={{ font: `600 11.5px ${fonts.sans}`, color: tone.red }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <>
          <Field label="What is it?">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Thanksgiving Break"
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {COMMON.map((label) => (
                <Chip key={label} active={name === label} onClick={() => setName(label)}>
                  {label}
                </Chip>
              ))}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="First day off">
              <input
                type="date"
                value={start}
                min={term.start_date}
                max={term.end_date}
                onChange={(e) => setStart(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="Last day off" hint="same day if blank">
              <input
                type="date"
                value={end}
                min={start || term.start_date}
                max={term.end_date}
                onChange={(e) => setEnd(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </div>

          {start && end && end < start && (
            <div style={{ font: `500 12.5px ${fonts.sans}`, color: colors.accentDark, marginBottom: 14 }}>
              The last day comes before the first.
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <PrimaryButton onClick={add} disabled={!canAdd}>
              {busy ? 'Adding…' : 'Add day off'}
            </PrimaryButton>
            <GhostButton onClick={() => setAdding(false)}>Cancel</GhostButton>
          </div>
        </>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
        >
          + Add a break or day off
        </button>
      )}
    </>
  );
}
