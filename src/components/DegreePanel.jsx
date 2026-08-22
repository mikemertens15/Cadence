import { useState } from 'react';
import { colors, tone, fonts } from '../theme';
import { useSemester } from '../data/SemesterProvider';
import { useDegreeProgress } from '../data/grades';
import { Field, inputStyle, PrimaryButton, GhostButton } from './Modal';
import { fmtCredits, fmtGpa } from './ui';

// The two things that make a cumulative GPA true and a progress bar possible:
// what the degree takes, and what you'd already done before this app existed.
//
// The past-semesters list is deliberately not a transcript. Re-entering four
// years of assignments is a thing nobody will do, and it isn't needed — a
// finished semester is completely described by its credit hours and the GPA it
// earned, which is exactly what a registrar multiplies together. One row per
// semester if you have the breakdown, or one lump row ("Before Cadence, 45
// credits, 3.31") if all you remember is the number on your transcript. Both
// produce the identical cumulative GPA, so the choice is only about how much
// detail you want back out.

export function DegreePanel() {
  const { priorTerms, degreePlan, createPriorTerm, deletePriorTerm, saveDegreePlan } = useSemester();
  const progress = useDegreeProgress();

  const [name, setName] = useState(degreePlan?.name ?? '');
  const [required, setRequired] = useState(String(degreePlan?.credits_required ?? 120));
  const [goal, setGoal] = useState(degreePlan?.gpa_goal == null ? '' : String(degreePlan.gpa_goal));
  const [planNote, setPlanNote] = useState('');

  const [adding, setAdding] = useState(false);
  const [pName, setPName] = useState('');
  const [pCredits, setPCredits] = useState('');
  const [pGpa, setPGpa] = useState('');
  const [busy, setBusy] = useState(false);

  const requiredNum = Number(required);
  const goalNum = goal.trim() === '' ? null : Number(goal);
  const planOk =
    Number.isFinite(requiredNum) &&
    requiredNum > 0 &&
    (goalNum == null || (Number.isFinite(goalNum) && goalNum >= 0 && goalNum <= 5));

  const creditsNum = Number(pCredits);
  const gpaNum = Number(pGpa);
  const priorOk =
    pName.trim() &&
    Number.isFinite(creditsNum) &&
    creditsNum > 0 &&
    Number.isFinite(gpaNum) &&
    gpaNum >= 0 &&
    gpaNum <= 5;

  async function savePlan() {
    if (!planOk || busy) return;
    setBusy(true);
    await saveDegreePlan({ name, creditsRequired: requiredNum, gpaGoal: goalNum });
    setPlanNote('Saved.');
    setBusy(false);
  }

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
      <Field label="Degree" hint="optional">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setPlanNote('');
          }}
          placeholder="B.S. Mechanical Engineering"
          style={inputStyle}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Credits to graduate">
          <input
            type="number"
            min="1"
            step="1"
            value={required}
            onChange={(e) => {
              setRequired(e.target.value);
              setPlanNote('');
            }}
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
            onChange={(e) => {
              setGoal(e.target.value);
              setPlanNote('');
            }}
            placeholder="3.5"
            style={{ ...inputStyle, textAlign: 'right' }}
          />
        </Field>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <PrimaryButton onClick={savePlan} disabled={!planOk || busy}>
          {busy ? 'Saving…' : 'Save'}
        </PrimaryButton>
        {planNote && (
          <span style={{ font: `500 12px ${fonts.sans}`, color: colors.accentDark }}>{planNote}</span>
        )}
        {progress.configured && (
          <span style={{ marginLeft: 'auto', font: `500 11.5px ${fonts.sans}`, color: colors.faint }}>
            {fmtCredits(progress.earned)} / {fmtCredits(progress.required)} earned
          </span>
        )}
      </div>

      <div style={{ height: 1, background: colors.divider, margin: '20px 0 16px' }} />

      {/* ------------------------------------------------------ past terms */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ font: `400 17px ${fonts.serif}`, color: colors.ink }}>Before Cadence</div>
        <div style={{ font: `400 12px/1.5 ${fonts.sans}`, color: colors.muted2, marginTop: 3 }}>
          Credit hours and the GPA they earned. One row per semester, or one row for the whole lot
          — the cumulative number comes out the same either way.
        </div>
      </div>

      {priorTerms.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {priorTerms.map((t) => (
            <div
              key={t.id}
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
          ))}
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
