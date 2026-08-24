import { colors, fonts } from '../theme';
import { usePrograms } from '../data/grades';
import { describeProgram } from '../programs';
import { useIsPhone } from '../useMediaQuery';
import { Card, SectionHeading, SegmentBar, fmtCredits, fmtGpa } from './ui';
import { GhostButton } from './Modal';

// How far through each thing you're doing you are.
//
// The number this exists to produce is not "68 of 128". It's the sentence
// underneath it — the one that says finishing this term puts you past halfway,
// or that you're three semesters out. A bar alone is a fact; a bar with the
// next milestone named is a reason to keep going in week nine, which is the
// week this app is actually for.
//
// One bar became several in 1.0, and the ledger above them is the reason why.
// A student six years in has credits doing four different jobs, and a single
// bar could only ever describe one of them — "169 of 120" is not a sentence
// about a degree, it's a sentence about a denominator that stopped being true.
// The ledger says what the 169 is made of; each bar says how one program is
// going. Credits counting toward two programs are named as such rather than
// left to be discovered as an inconsistency between the two.
//
// Everything here is credits, deliberately. Whether a specific course satisfies
// a specific requirement needs a catalog to answer and is wrong in ways a
// student can't check — DegreeWorks owns that, and being confidently wrong
// about it would be worse than not claiming to know.

export function DegreeProgress({ onSetUp }) {
  const { programs, ledger, configured } = usePrograms();
  const phone = useIsPhone();

  // No programs is the invitation, whether or not credits exist — and when they
  // do, saying so is the better invitation. A ledger of credits with no bars
  // above it and no way to make one is the state this used to fall into: an
  // accurate answer to a question nobody asked.
  if (!configured) {
    return (
      <>
        <SectionHeading>Degree</SectionHeading>
        <Card style={{ padding: phone ? '16px 18px' : '20px 22px' }}>
          <div style={{ font: `400 17px ${fonts.serif}`, color: colors.ink, marginBottom: 5 }}>
            {ledger.total > 0
              ? `${fmtCredits(ledger.total)} credits, and nothing to measure them against`
              : 'Track the whole thing, not just this term'}
          </div>
          <div
            style={{
              font: `400 13px/1.55 ${fonts.sans}`,
              color: colors.muted2,
              marginBottom: 14,
              maxWidth: 460,
            }}
          >
            Tell Cadence what you&rsquo;re working toward and how many credits it takes, and what
            you&rsquo;d already earned before you started here. After that every semester moves the
            bar on its own &mdash; and if there&rsquo;s more than one thing you&rsquo;re working
            toward, each gets its own, sharing the credits that count for both.
            {ledger.total > 0 && ' The courses you already have are applied to the first one you add.'}
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
        {programs.length > 1 ? 'Programs' : 'Degree'}
      </SectionHeading>

      <Ledger ledger={ledger} programs={programs} phone={phone} />

      <div style={{ display: 'grid', gap: 12 }}>
        {programs.map((row) => (
          <ProgramCard key={row.plan.id} row={row} phone={phone} />
        ))}
      </div>

      {/* Credits with nowhere to go. Not an error — this is where the class you
          took because it looked interesting lives, and it should be visible
          rather than quietly missing from every bar on the page. */}
      {ledger.unapplied > 0 && programs.length > 0 && (
        <div style={{ font: `400 11.5px/1.6 ${fonts.sans}`, color: colors.faint, marginTop: 10 }}>
          <span className="cad-nums">{fmtCredits(ledger.unapplied)}</span> credits aren&rsquo;t
          applied to any program. They still count toward your GPA — they just aren&rsquo;t pointed
          at a finish line.
        </div>
      )}
    </>
  );
}

/**
 * What your credits add up to, before any bar interprets them.
 *
 * Drawn only when there is something to reconcile: a single program with
 * everything applied to it is already fully described by its own bar, and a
 * summary above it would just be the same number twice.
 */
function Ledger({ ledger, programs, phone }) {
  if (!ledger.total) return null;
  const worthShowing = programs.length > 1 || ledger.unapplied > 0 || ledger.noCredit > 0;
  if (!worthShowing) return null;

  return (
    <Card style={{ padding: phone ? '14px 16px' : '16px 20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span
          className="cad-nums"
          style={{ font: `600 26px ${fonts.sans}`, color: colors.ink, letterSpacing: '-0.02em' }}
        >
          {fmtCredits(ledger.total)}
        </span>
        <span style={{ font: `500 12.5px ${fonts.sans}`, color: colors.muted2 }}>
          credits, all told
        </span>
        {ledger.inProgress > 0 && (
          <span style={{ font: `500 11.5px ${fonts.sans}`, color: colors.faint, marginLeft: 'auto' }}>
            {fmtCredits(ledger.inProgress)} of them this term
          </span>
        )}
      </div>

      <div
        style={{
          font: `400 11.5px/1.6 ${fonts.sans}`,
          color: colors.muted2,
          marginTop: 8,
        }}
      >
        <span className="cad-nums">{fmtCredits(ledger.applied)}</span> applied to a program
        {ledger.shared > 0 && (
          <>
            , <span className="cad-nums">{fmtCredits(ledger.shared)}</span> of those counting toward
            more than one
          </>
        )}
        {ledger.unapplied > 0 && (
          <>
            {' · '}
            <span className="cad-nums">{fmtCredits(ledger.unapplied)}</span> for interest
          </>
        )}
        {ledger.noCredit > 0 && (
          <>
            {' · '}
            <span className="cad-nums">{fmtCredits(ledger.noCredit)}</span> audited or withdrawn,
            earning nothing
          </>
        )}
        .
        {ledger.shared > 0 && (
          <>
            {' '}
            Shared credits are counted once here and on every bar they belong to, which is why the
            bars add up to more than this number.
          </>
        )}
      </div>
    </Card>
  );
}

function ProgramCard({ row, phone }) {
  const { plan, progress, gpa } = row;
  const { required, earned, inProgress, remaining, pct, pctWithInProgress, semestersLeft, projected } =
    progress;

  const done = plan.status === 'completed';

  return (
    <Card style={{ padding: phone ? '17px 18px' : '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ font: `400 17px ${fonts.serif}`, color: colors.ink }}>
          {plan.name || 'Degree'}
        </span>
        <span style={{ font: `500 11px ${fonts.sans}`, color: colors.faint }}>
          {describeProgram(plan)}
        </span>
      </div>

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

      <div style={{ font: `500 13px/1.55 ${fonts.sans}`, color: colors.ink, marginTop: 13 }}>
        {done
          ? `Finished. ${fmtCredits(earned)} credits, and nothing left to do about it.`
          : milestone({ pct, pctWithInProgress, inProgress, remaining, semestersLeft, required, projected })}
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
        {gpa.gpa != null && (
          <Stat
            label={plan.level === 'graduate' ? 'Graduate GPA' : 'GPA in this'}
            value={fmtGpa(gpa.gpa)}
            note={
              plan.gpa_goal
                ? gpa.gpa >= Number(plan.gpa_goal)
                  ? `above your ${fmtGpa(Number(plan.gpa_goal))} goal`
                  : `goal ${fmtGpa(Number(plan.gpa_goal))}`
                : `over ${fmtCredits(gpa.credits)} credits`
            }
          />
        )}
      </div>
    </Card>
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
      ? 'Finish this term and that is the whole thing. Every credit accounted for.'
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
        return `Finish this term and you cross ${phrase} — ${Math.round(pctWithInProgress)}% of it, ${Math.round(projected)} credits in.`;
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
