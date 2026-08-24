import { useState } from 'react';
import { colors, tone, fonts } from '../theme';
import { useSemester } from '../data/SemesterProvider';
import { usePrograms } from '../data/grades';
import {
  PROGRAM_KINDS,
  PROGRAM_LEVELS,
  PROGRAM_STATUSES,
  CREDIT_PRESETS,
  describeProgram,
} from '../programs';
import { Field, Chip, inputStyle, PrimaryButton, GhostButton } from './Modal';
import { fmtCredits, fmtGpa } from './ui';

// What you're working toward, and what you'd already done before this app
// existed. Two lists, and they're the reason a cumulative GPA is true and a
// progress bar is possible.
//
// Programs are a list because a single row was the assumption 1.0 exists to
// remove. Six years in there is a degree, often a second one, sometimes some
// graduate hours, and a handful of classes that were simply interesting — four
// different denominators, and "169 credits out of 120" describes none of them.
//
// The past-semesters list is deliberately not a transcript. Re-entering four
// years of assignments is a thing nobody will do, and it isn't needed — a
// finished semester is completely described by its credit hours and the GPA it
// earned, which is exactly what a registrar multiplies together. What each row
// *does* now carry is which programs those credits counted toward, because the
// answer is often "both": Calculus I from 2018 is on the mechanical engineering
// audit and on the second degree's, one course and one grade advancing two bars.

export function DegreePanel() {
  const {
    programs,
    priorTerms,
    programIdsByPriorTerm,
    createProgram,
    updateProgram,
    deleteProgram,
    createPriorTerm,
    deletePriorTerm,
    setPriorTermPrograms,
  } = useSemester();
  const { programs: rows, ledger } = usePrograms();

  const [editing, setEditing] = useState(null); // program id, or 'new'
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [adding, setAdding] = useState(false);
  const [pName, setPName] = useState('');
  const [pCredits, setPCredits] = useState('');
  const [pGpa, setPGpa] = useState('');
  const [busy, setBusy] = useState(false);

  const creditsNum = Number(pCredits);
  const gpaNum = Number(pGpa);
  const priorOk =
    pName.trim() &&
    Number.isFinite(creditsNum) &&
    creditsNum > 0 &&
    Number.isFinite(gpaNum) &&
    gpaNum >= 0 &&
    gpaNum <= 5;

  async function addPrior() {
    if (!priorOk || busy) return;
    setBusy(true);
    await createPriorTerm({ name: pName, creditHours: creditsNum, gpa: gpaNum });
    setPName('');
    setPCredits('');
    setPGpa('');
    setAdding(false);
    setBusy(false);
  }

  return (
    <>
      <SectionTitle
        title="Programs"
        hint="each with its own finish line"
        action={
          editing !== 'new' && (
            <TinyButton onClick={() => setEditing('new')}>+ Add a program</TinyButton>
          )
        }
      />

      {rows.length === 0 && editing !== 'new' && (
        <div style={{ font: `400 12.5px/1.6 ${fonts.sans}`, color: colors.muted2, marginBottom: 14 }}>
          Say what you&rsquo;re working toward and how many credits it takes, and every semester
          moves the bar on its own. Add a second one for a double major, a master&rsquo;s, or a
          minor &mdash; a course can count toward more than one.
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
        {rows.map(({ plan, progress, gpa, credits }) =>
          editing === plan.id ? (
            <ProgramForm
              key={plan.id}
              plan={plan}
              onCancel={() => setEditing(null)}
              onSave={async (fields) => {
                await updateProgram(plan.id, {
                  name: fields.name?.trim() || null,
                  kind: fields.kind,
                  level: fields.level,
                  credits_required: fields.creditsRequired,
                  gpa_goal: fields.gpaGoal,
                  status: fields.status,
                });
                setEditing(null);
              }}
            />
          ) : (
            <div
              key={plan.id}
              style={{
                padding: '12px 14px',
                borderRadius: 13,
                background: colors.inputBg,
                border: `1px solid ${colors.cardBorder}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: `600 13px ${fonts.sans}`, color: colors.ink }}>
                    {plan.name || 'Untitled program'}
                  </div>
                  <div
                    className="cad-nums"
                    style={{ font: `500 11px ${fonts.sans}`, color: colors.muted2, marginTop: 2 }}
                  >
                    {describeProgram(plan)} · {fmtCredits(progress.earned)} of{' '}
                    {fmtCredits(progress.required)} credits
                    {credits.inProgress > 0 ? ` · +${fmtCredits(credits.inProgress)} now` : ''}
                    {gpa.gpa != null ? ` · ${fmtGpa(gpa.gpa)} GPA` : ''}
                  </div>
                </div>
                <TinyButton onClick={() => setEditing(plan.id)}>Edit</TinyButton>
                {/* Deleting a program leaves every course and grade alone — it
                    only forgets which finish line they were pointed at. Says so,
                    because "delete degree" reads like it might do more. */}
                <button
                  onClick={async () => {
                    if (confirmDelete === plan.id) {
                      await deleteProgram(plan.id);
                      setConfirmDelete(null);
                    } else {
                      setConfirmDelete(plan.id);
                    }
                  }}
                  style={{ font: `600 11.5px ${fonts.sans}`, color: tone.red }}
                >
                  {confirmDelete === plan.id ? 'Remove it?' : 'Remove'}
                </button>
              </div>
              {confirmDelete === plan.id && (
                <div style={{ font: `400 11px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 6 }}>
                  Your courses, grades and GPA are untouched. Only the bar goes away.
                </div>
              )}
            </div>
          ),
        )}
      </div>

      {editing === 'new' && (
        <ProgramForm
          onCancel={() => setEditing(null)}
          onSave={async (fields) => {
            await createProgram({
              name: fields.name,
              kind: fields.kind,
              level: fields.level,
              creditsRequired: fields.creditsRequired,
              gpaGoal: fields.gpaGoal,
              status: fields.status,
            });
            setEditing(null);
          }}
        />
      )}

      {/* The whole point of the release, in one line: what your credits add up
          to, and what they're doing. Only worth drawing once there is more than
          one thing they could be doing. */}
      {ledger.total > 0 && programs.length > 0 && (
        <div
          style={{
            font: `400 11.5px/1.6 ${fonts.sans}`,
            color: colors.muted2,
            background: colors.chipBg,
            borderRadius: 12,
            padding: '10px 13px',
            marginBottom: 4,
          }}
        >
          <span className="cad-nums">{fmtCredits(ledger.total)}</span> credits in total
          {ledger.shared > 0 && (
            <>
              , <span className="cad-nums">{fmtCredits(ledger.shared)}</span> of them counting
              toward more than one program
            </>
          )}
          {ledger.unapplied > 0 && (
            <>
              , <span className="cad-nums">{fmtCredits(ledger.unapplied)}</span> not applied to
              anything
            </>
          )}
          .
        </div>
      )}

      <div style={{ height: 1, background: colors.divider, margin: '20px 0 16px' }} />

      {/* ------------------------------------------------------ past terms */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ font: `400 17px ${fonts.serif}`, color: colors.ink }}>Before Cadence</div>
        <div style={{ font: `400 12px/1.5 ${fonts.sans}`, color: colors.muted2, marginTop: 3 }}>
          Credit hours and the GPA they earned. One row per semester, or one row for the whole lot
          — the cumulative number comes out the same either way. Split it into two rows when part
          of it counted toward something different.
        </div>
      </div>

      {priorTerms.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {priorTerms.map((t) => {
            const applied = programIdsByPriorTerm.get(t.id) ?? [];
            return (
              <div
                key={t.id}
                style={{
                  padding: '11px 13px',
                  borderRadius: 12,
                  background: colors.inputBg,
                  border: `1px solid ${colors.cardBorder}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `600 13px ${fonts.sans}`, color: colors.ink }}>{t.name}</div>
                    <div
                      className="cad-nums"
                      style={{ font: `500 11px ${fonts.sans}`, color: colors.muted2, marginTop: 2 }}
                    >
                      {fmtCredits(t.credit_hours)} credits · {fmtGpa(Number(t.gpa))} GPA
                    </div>
                  </div>
                  <button
                    onClick={() => deletePriorTerm(t.id)}
                    style={{ font: `600 11.5px ${fonts.sans}`, color: tone.red }}
                  >
                    Remove
                  </button>
                </div>

                {programs.length > 0 && (
                  <ProgramPicker
                    programs={programs}
                    selected={applied}
                    onChange={(ids) => setPriorTermPrograms(t.id, ids)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {adding ? (
        <>
          <Field label="What was it?">
            <input
              autoFocus
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              placeholder="Everything before Fall 2026"
              style={inputStyle}
            />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Credit hours">
              <input
                type="number"
                min="0"
                step="0.5"
                value={pCredits}
                onChange={(e) => setPCredits(e.target.value)}
                placeholder="45"
                style={{ ...inputStyle, textAlign: 'right' }}
              />
            </Field>
            <Field label="GPA">
              <input
                type="number"
                min="0"
                max="4"
                step="0.01"
                value={pGpa}
                onChange={(e) => setPGpa(e.target.value)}
                placeholder="3.31"
                style={{ ...inputStyle, textAlign: 'right' }}
              />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <PrimaryButton onClick={addPrior} disabled={!priorOk || busy}>
              {busy ? 'Adding…' : 'Add'}
            </PrimaryButton>
            <GhostButton onClick={() => setAdding(false)}>Cancel</GhostButton>
          </div>
        </>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
        >
          + Add past credits
        </button>
      )}
    </>
  );
}

/**
 * Which programs a lump of credits counts toward.
 *
 * Multi-select and deliberately so — the alternative is picking one, and gen
 * eds are the counter-example that breaks it: Calculus I is on both degrees'
 * audits, and a single choice would have to under-count one of them. Nothing
 * selected is a real answer too: credits taken for interest.
 */
export function ProgramPicker({ programs, selected, onChange, label = 'Counts toward' }) {
  const toggle = (id) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div style={{ marginTop: 9 }}>
      <div style={{ font: `600 10.5px ${fonts.sans}`, color: colors.faint, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {programs.map((p) => (
          <Chip key={p.id} active={selected.includes(p.id)} onClick={() => toggle(p.id)}>
            {p.name || 'Untitled'}
          </Chip>
        ))}
        {!selected.length && (
          <span style={{ font: `400 11px ${fonts.sans}`, color: colors.faint, alignSelf: 'center' }}>
            nothing — taken for interest
          </span>
        )}
      </div>
    </div>
  );
}

function ProgramForm({ plan, onSave, onCancel }) {
  const [name, setName] = useState(plan?.name ?? '');
  const [kind, setKind] = useState(plan?.kind ?? 'degree');
  const [level, setLevel] = useState(plan?.level ?? 'undergraduate');
  const [status, setStatus] = useState(plan?.status ?? 'active');
  const [credits, setCredits] = useState(String(plan?.credits_required ?? 120));
  const [goal, setGoal] = useState(plan?.gpa_goal == null ? '' : String(plan.gpa_goal));
  const [busy, setBusy] = useState(false);

  const creditsNum = Number(credits);
  const goalNum = goal.trim() === '' ? null : Number(goal);
  const ok =
    Number.isFinite(creditsNum) &&
    creditsNum > 0 &&
    (goalNum == null || (Number.isFinite(goalNum) && goalNum >= 0 && goalNum <= 5));

  return (
    <div
      style={{
        padding: '14px 15px',
        borderRadius: 14,
        background: colors.inputBg,
        border: `1px solid ${colors.selected}`,
        marginBottom: 14,
      }}
    >
      <Field label="Name">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="B.S. Mechanical Engineering"
          style={inputStyle}
        />
      </Field>

      <Field label="What kind">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PROGRAM_KINDS.map(([key, label]) => (
            <Chip
              key={key}
              active={kind === key}
              onClick={() => {
                setKind(key);
                // The credit total is the one field where the kind genuinely
                // changes the answer — a certificate is not a 120-credit thing.
                setCredits(String(CREDIT_PRESETS[key]?.[0] ?? creditsNum));
              }}
            >
              {label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Level" hint="graduate credits are their own GPA">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PROGRAM_LEVELS.map(([key, label]) => (
            <Chip key={key} active={level === key} onClick={() => setLevel(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Credits to finish">
          <input
            type="number"
            min="1"
            step="1"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            style={{ ...inputStyle, textAlign: 'right' }}
          />
        </Field>
        <Field label="GPA goal" hint="optional">
          <input
            type="number"
            min="0"
            max="4"
            step="0.1"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="3.5"
            style={{ ...inputStyle, textAlign: 'right' }}
          />
        </Field>
      </div>

      <Field label="Where it stands">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {PROGRAM_STATUSES.map(([key, label]) => (
            <Chip key={key} active={status === key} onClick={() => setStatus(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', gap: 8 }}>
        <PrimaryButton
          onClick={async () => {
            if (!ok || busy) return;
            setBusy(true);
            await onSave({ name, kind, level, status, creditsRequired: creditsNum, gpaGoal: goalNum });
            setBusy(false);
          }}
          disabled={!ok || busy}
        >
          {busy ? 'Saving…' : plan ? 'Save' : 'Add program'}
        </PrimaryButton>
        <GhostButton onClick={onCancel}>Cancel</GhostButton>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- bits

function SectionTitle({ title, hint, action }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ font: `400 17px ${fonts.serif}`, color: colors.ink }}>{title}</span>
        {hint && <span style={{ font: `400 11.5px ${fonts.sans}`, color: colors.faint }}>{hint}</span>}
      </div>
      {action}
    </div>
  );
}

function TinyButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ font: `600 12px ${fonts.sans}`, color: colors.accent }}
    >
      {children}
    </button>
  );
}
