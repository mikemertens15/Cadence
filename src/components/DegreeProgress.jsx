import { colors, fonts } from '../theme';
import { useDegreeProgress, useGpa } from '../data/grades';
import { useIsPhone } from '../useMediaQuery';
import { Card, SectionHeading, SegmentBar, fmtCredits, fmtGpa } from './ui';
import { GhostButton } from './Modal';

// How far through the degree you are.
//
// The number this exists to produce is not "68 of 128". It's the sentence
// underneath it — the one that says finishing this term puts you past halfway,
// or that you're three semesters out. A bar alone is a fact; a bar with the
// next milestone named is a reason to keep going in week nine, which is the
// week this app is actually for.
//
// Everything here is credits, deliberately. Whether a specific course satisfies
// a specific requirement needs a catalog to answer and is wrong in ways a
// student can't check — DegreeWorks owns that, and being confidently wrong
// about it would be worse than not claiming to know.

export function DegreeProgress({ onSetUp }) {
  const progress = useDegreeProgress();
  const gpa = useGpa();
  const phone = useIsPhone();

  if (!progress.configured && progress.earned === 0 && progress.inProgress === 0) {
    return (
      <>
        <SectionHeading>Degree</SectionHeading>
        <Card style={{ padding: phone ? '16px 18px' : '20px 22px' }}>
          <div style={{ font: `400 17px ${fonts.serif}`, color: colors.ink, marginBottom: 5 }}>
            Track the whole thing, not just this term
          </div>
          <div
            style={{
              font: `400 13px/1.55 ${fonts.sans}`,
              color: colors.muted2,
              marginBottom: 14,
              maxWidth: 460,
            }}
          >
            Tell Cadence how many credits your degree takes and what you&rsquo;d already earned
            before you started here. Two numbers, once — after that every semester moves the bar
            on its own.
          </div>
          <GhostButton
            onClick={onSetUp}
            style={{ background: colors.chipBg, color: colors.accent, padding: '10px 16px' }}
          >
            Set up my degree
          </GhostButton>
        </Card>
      </>
    );
  }

  const { required, earned, inProgress, projected, remaining, pct, pctWithInProgress, semestersLeft } =
    progress;

  return (
    <>
      <SectionHeading
        action={
          <button
            onClick={onSetUp}
            style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
          >
            Edit
          </button>
        }
      >
        {progress.plan?.name || 'Degree'}
      </SectionHeading>

      <Card style={{ padding: phone ? '17px 18px' : '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span
            className="cad-nums"
            style={{ font: `600 32px ${fonts.sans}`, color: colors.ink, letterSpacing: '-0.02em' }}
          >
            {Math.round(pct)}%
          </span>
          <span style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2 }}>
            {fmtCredits(earned)} of {fmtCredits(required)} credits
          </span>
          {inProgress > 0 && (
            <span style={{ font: `500 12px ${fonts.sans}`, color: colors.faint, marginLeft: 'auto' }}>
              +{fmtCredits(inProgress)} in progress
            </span>
          )}
        </div>

        <div style={{ marginTop: 12 }}>
          <SegmentBar share={progress.share} height={11} />
        </div>

        <div
          style={{
            font: `500 13px/1.55 ${fonts.sans}`,
            color: colors.ink,
            marginTop: 13,
          }}
        >
          {milestone({ pct, pctWithInProgress, inProgress, remaining, semestersLeft, required, projected })}
        </div>

        <div
          style={{
            display: 'flex',
            gap: phone ? 14 : 26,
            marginTop: 14,
            paddingTop: 13,
            borderTop: `1px solid ${colors.divider}`,
            flexWrap: 'wrap',
          }}
        >
          <Stat label="Earned" value={fmtCredits(earned)} note="credits banked" />
          {inProgress > 0 && (
            <Stat label="This term" value={fmtCredits(inProgress)} note="if it all sticks" />
          )}
          <Stat
            label="Left after this"
            value={fmtCredits(remaining)}
            note={semestersLeft ? `~${semestersLeft} semester${semestersLeft === 1 ? '' : 's'}` : 'nothing left'}
          />
          {gpa.cumulative.gpa != null && (
            <Stat
              label="Cumulative GPA"
              value={fmtGpa(gpa.cumulative.gpa)}
              note={
                progress.plan?.gpa_goal
                  ? gpa.cumulative.gpa >= Number(progress.plan.gpa_goal)
                    ? `above your ${fmtGpa(Number(progress.plan.gpa_goal))} goal`
                    : `goal ${fmtGpa(Number(progress.plan.gpa_goal))}`
                  : `over ${fmtCredits(gpa.cumulative.credits)} credits`
              }
            />
          )}
        </div>
      </Card>
    </>
  );
}

function Stat({ label, value, note }) {
  return (
    <div style={{ minWidth: 88 }}>
      <div
        style={{
          font: `600 10.5px ${fonts.sans}`,
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </div>
      <div
        className="cad-nums"
        style={{ font: `600 19px ${fonts.sans}`, color: colors.ink, margin: '3px 0 2px' }}
      >
        {value}
      </div>
      <div style={{ font: `400 11px ${fonts.sans}`, color: colors.faint }}>{note}</div>
    </div>
  );
}

/**
 * The sentence under the bar.
 *
 * Ordered by how motivating each one is at the moment it's true, and every
 * branch names something that actually happens rather than restating the
 * percentage in words. The quarter marks are called out because they're the
 * ones people already think in — "halfway through" is a thing you tell someone
 * at Christmas; "53.9% complete" is not.
 */
function milestone({ pct, pctWithInProgress, inProgress, remaining, semestersLeft, required, projected }) {
  if (remaining <= 0) {
    return inProgress > 0
      ? 'Finish this term and that is the whole degree. Every credit accounted for.'
      : 'That is the whole thing. Every credit accounted for.';
  }

  // The crossings worth naming, and only while this term is the one that does
  // it — "you'll pass halfway eventually" is not news.
  const MARKS = [
    [75, 'the home stretch'],
    [50, 'halfway'],
    [25, 'a quarter of the way'],
  ];
  if (inProgress > 0) {
    for (const [mark, phrase] of MARKS) {
      if (pct < mark && pctWithInProgress >= mark) {
        return `Finish this term and you cross ${phrase} — ${Math.round(pctWithInProgress)}% of the degree, ${Math.round(projected)} credits in.`;
      }
    }
  }

  if (pct >= 87.5) {
    return `${Math.round(required - projected)} credits after this term. You can see the end of it from here.`;
  }
  if (inProgress > 0) {
    return `This term takes you to ${Math.round(pctWithInProgress)}%, with ${Math.round(remaining)} credits left — about ${semestersLeft} more semester${semestersLeft === 1 ? '' : 's'}.`;
  }
  return `${Math.round(remaining)} credits to go, or about ${semestersLeft} more semester${semestersLeft === 1 ? '' : 's'} at a normal load.`;
}
