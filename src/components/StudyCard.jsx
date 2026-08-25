import { useState } from 'react';
import { colors, tone, fonts, courseColor } from '../theme';
import { describeDue, fmtDuration, fmtMinutes } from '../dates';
import { isEvent } from '../assignments';
import { useSemester } from '../data/SemesterProvider';
import { useStudyPlan, useRunningStudy, useBlockOptions } from '../data/study';
import { useNow } from '../useNow';
import { focusMinutes, isPaused } from '../study';
import { Card, CourseDot, DuePill, ProgressBar } from './ui';
import { PrimaryButton, GhostButton, Chip } from './Modal';

// The one card that answers "what should I be doing right now".
//
// Two states, and they are genuinely different questions. Idle, it names a
// course and says why that one — a recommendation with its reasons attached,
// because a ranking nobody can see the reasoning behind is a ranking nobody can
// overrule when it's wrong. Running, it gets out of the way: a clock, what
// you're on, and the two buttons that end it.

// How far past its planned length a block runs before the card stops taking the
// clock at face value. Half an hour: a 50 that ran 58 is a good session, and a
// 50 that ran 95 is a laptop somebody walked away from — and the whole panel is
// worthless the moment it starts flattering you.
const OVERRUN_GRACE = 30;

export function StudyCard({ onChoose, onOpenAssignment }) {
  const running = useRunningStudy();
  return running ? (
    <RunningBlock running={running} onOpenAssignment={onOpenAssignment} />
  ) : (
    <NextBlock onChoose={onChoose} />
  );
}

// ------------------------------------------------------------------ running

function RunningBlock({ running, onOpenAssignment }) {
  const { pauseStudy, resumeStudy, stopStudy } = useSemester();
  const { next } = useBlockOptions();
  // A second, because a clock that moves in minute steps looks broken.
  const now = useNow(1000);

  const { session, course, assignment } = running;
  const c = courseColor(course?.color);
  const paused = isPaused(session);

  const elapsed = focusMinutes(session, now);
  const planned = session.planned_minutes ?? null;
  const over = planned == null ? 0 : elapsed - planned;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Something you have to be at, close enough that it's worth saying so
  // mid-block. The app knows the timetable; the whole point is not to find out
  // you missed a lecture by looking up from a countdown.
  const untilNext = next ? next.start - nowMinutes : null;
  const encroaching = untilNext != null && untilNext <= (planned == null ? 15 : Math.max(15, planned - elapsed));

  return (
    <Card style={{ padding: '16px 18px 15px', marginTop: 16, borderColor: paused ? colors.cardBorder : c.solid }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <CourseDot color={course?.color} />
        <span style={{ font: `600 13px ${fonts.sans}`, color: colors.ink }}>
          {course?.code || course?.name || 'Study'}
        </span>
        <span style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2 }}>
          {paused ? 'Paused' : 'Deep study'}
        </span>
        <span style={{ marginLeft: 'auto', font: `500 11.5px ${fonts.sans}`, color: colors.muted2 }}>
          {planned ? `${planned} min block` : 'Open block'}
        </span>
      </div>

      <div
        style={{
          font: `500 44px/1 ${fonts.mono}`,
          // A paused clock is drawn as stopped, not as running-but-quiet.
          color: paused ? colors.muted2 : colors.ink,
          letterSpacing: '-0.02em',
          marginBottom: 12,
        }}
      >
        {clock(elapsed)}
      </div>

      {planned != null && (
        <div style={{ marginBottom: 12 }}>
          <ProgressBar
            pct={(elapsed / planned) * 100}
            fill={over > 0 ? tone.amber : c.solid}
            height={5}
          />
        </div>
      )}

      {assignment && (
        <button
          onClick={onOpenAssignment ? () => onOpenAssignment(assignment) : undefined}
          style={{
            font: `500 12px ${fonts.sans}`,
            color: colors.muted,
            marginBottom: 12,
            display: 'block',
            textAlign: 'left',
            cursor: onOpenAssignment ? 'pointer' : 'default',
          }}
        >
          On: {assignment.title}
        </button>
      )}

      {encroaching && (
        <div style={{ font: `500 12px ${fonts.sans}`, color: tone.amberText, marginBottom: 12 }}>
          {next.course?.code || next.course?.name || 'Next up'} at {fmtMinutes(next.start)} —{' '}
          {fmtDuration(untilNext)} away.
        </div>
      )}

      {/* Past the grace period the card stops assuming the clock is the truth.
          One of these two numbers is what actually happened, and the person who
          was there is the only one who knows which — so it asks rather than
          banking the larger one and calling it deep work. */}
      {over >= OVERRUN_GRACE ? (
        <div style={{ display: 'grid', gap: 9 }}>
          <div style={{ font: `500 12px/1.5 ${fonts.sans}`, color: colors.muted }}>
            Still going? This block passed its {planned} minutes {fmtDuration(over)} ago.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <GhostButton onClick={() => stopStudy(session.id, { keepMinutes: planned })}>
              Stop, keep {fmtDuration(planned)}
            </GhostButton>
            <GhostButton onClick={() => stopStudy(session.id)}>
              Stop, keep {fmtDuration(elapsed)}
            </GhostButton>
            {!paused && <GhostButton onClick={() => pauseStudy(session.id)}>Pause</GhostButton>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {paused ? (
            <PrimaryButton onClick={() => resumeStudy(session.id)}>Resume</PrimaryButton>
          ) : (
            <GhostButton onClick={() => pauseStudy(session.id)}>Pause</GhostButton>
          )}
          <GhostButton onClick={() => stopStudy(session.id)}>Stop</GhostButton>
          {over > 0 && (
            <span style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, marginLeft: 'auto' }}>
              {fmtDuration(over)} over
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

// mm:ss under an hour, h:mm:ss over it. Seconds stay visible the whole way: they
// are what makes a running clock look like it's running.
function clock(minutes) {
  const total = Math.max(0, Math.floor(minutes * 60));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// --------------------------------------------------------------------- idle

function NextBlock({ onChoose }) {
  const plan = useStudyPlan();
  const { startStudy } = useSemester();
  const { room, options, recommended, next } = useBlockOptions();
  const now = useNow();
  const [busy, setBusy] = useState(false);

  const top = plan[0];
  if (!top) return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const start = async (minutes) => {
    setBusy(true);
    await startStudy({ courseId: top.course.id, plannedMinutes: minutes });
    setBusy(false);
  };

  // Lengths worth putting on the card next to the recommended one: the ones that
  // fit and aren't already the primary button.
  const alternatives = options.filter((o) => o.fits && o.minutes !== recommended);

  return (
    <Card style={{ padding: '15px 18px 16px', marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginBottom: 9 }}>
        <span style={{ font: `600 11.5px ${fonts.sans}`, color: colors.muted2, letterSpacing: '0.04em' }}>
          DEEP STUDY
        </span>
        <button
          onClick={onChoose}
          style={{ marginLeft: 'auto', font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
        >
          Another class
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
        <CourseDot color={top.course.color} size={10} />
        <span style={{ font: `400 20px ${fonts.serif}`, color: colors.ink }}>
          {top.course.code || top.course.name}
        </span>
      </div>

      <Reasons entry={top} now={now} />

      {/* Why this length, when the timetable is what decided it. Said out loud
          because a 35-minute button with no explanation looks like a bug. */}
      {next && room != null && (
        <div style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, marginTop: 9 }}>
          {next.course?.code || next.course?.name || 'Next up'} at {fmtMinutes(next.start)} —{' '}
          {recommended == null
            ? `only ${fmtDuration(Math.max(0, next.start - nowMinutes))} away.`
            : `${fmtDuration(room)} free.`}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 13 }}>
        {recommended != null ? (
          <>
            <PrimaryButton onClick={() => start(recommended)} disabled={busy}>
              {busy ? 'Starting…' : `Start ${fmtDuration(recommended)}`}
            </PrimaryButton>
            {alternatives.map((o) => (
              <Chip key={o.minutes} onClick={() => start(o.minutes)}>
                {fmtDuration(o.minutes)}
              </Chip>
            ))}
          </>
        ) : (
          // Nothing fits before you have to be somewhere. The app says so and
          // still lets you start one, because "I know, I'm skipping it" is a
          // decision you're allowed to make.
          <>
            <GhostButton onClick={() => start(25)}>Start 25 min anyway</GhostButton>
            <span style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2 }}>
              or wait it out
            </span>
          </>
        )}
      </div>
    </Card>
  );
}

/**
 * Why this course and not one of the other four.
 *
 * Every phrase here comes from the vocabulary the rest of the app already uses —
 * describeDue for a date, fmtDuration for an amount of time — so a reason on
 * this card and the same fact on the work list can't end up worded as two
 * different things.
 */
function Reasons({ entry, now }) {
  const parts = entry.reasons
    .map((r, i) => {
      switch (r.kind) {
        case 'deadline': {
          const a = r.assignment;
          const due = describeDue(a.due_at, now, { event: isEvent(a.kind) });
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <DuePill due={due} />
              <span style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.title}
              </span>
              {r.more > 0 && <span style={{ color: colors.muted2 }}>+{r.more}</span>}
            </span>
          );
        }
        case 'debt':
          return <span key={i}>{fmtDuration(r.minutes)} short this week</span>;
        case 'met':
          return <span key={i}>this week&rsquo;s {fmtDuration(r.minutes)} already in</span>;
        case 'grade':
          // "B by 0.0 points" is a true sentence that reads as a rounding bug.
          // Sitting on the cutoff is the thing worth saying, so say that.
          return r.slack < 0.05 ? (
            <span key={i}>right on the {r.letter} cutoff</span>
          ) : (
            <span key={i}>
              {r.letter} by {r.slack.toFixed(1)} points
            </span>
          );
        case 'no-grades':
          return <span key={i}>nothing graded yet</span>;
        case 'settled':
          return <span key={i}>nothing left to score</span>;
        case 'untouched':
          return <span key={i}>untouched this week</span>;
        default:
          return null;
      }
    })
    .filter(Boolean);

  if (!parts.length) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        font: `500 12.5px ${fonts.sans}`,
        color: colors.muted,
      }}
    >
      {parts.map((part, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <span style={{ color: colors.faint }}>·</span>}
          {part}
        </span>
      ))}
    </div>
  );
}
