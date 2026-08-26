import { colors, fonts } from '../theme';
import { dayRangeLabel, monthDay, parseDay } from '../dates';
import { useTermProgress } from '../data/term';
import { useIsPhone } from '../useMediaQuery';
import { Card, SectionHeading, Stat } from './ui';

// How far through the semester you are — the one fact about a term that nobody
// can hold in their head.
//
// The percentage is not really the point. The point is the sentence under the
// bar, and the sentence is almost always some version of "further than you
// think": a semester has no landmarks between the first week and finals, so the
// estimate you're carrying was made in September and has never been corrected.
// Finding out in week nine rather than week thirteen is the difference between
// a plan and a scramble.
//
// Two sizes, because it gets asked two ways. On Today it's a line under the
// date — a thing you see rather than read, every time you open the app. On the
// schedule, where you went *because* you were thinking about time, it's the
// whole card: where the breaks fall, which month you're in, how many days you
// still have to show up.

export function SemesterProgress() {
  const t = useTermProgress();
  const phone = useIsPhone();
  if (!t) return null;

  const note = breakNote(t);

  return (
    <>
      <SectionHeading>The semester</SectionHeading>
      <Card style={{ padding: phone ? '17px 18px' : '20px 22px', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ font: `400 17px ${fonts.serif}`, color: colors.ink }}>
            {t.name || 'This term'}
          </span>
          <span style={{ font: `500 11px ${fonts.sans}`, color: colors.faint }}>
            {monthDay(t.start)} &ndash; {monthDay(t.end)}
          </span>
          {t.phase === 'during' && (
            <span
              style={{
                font: `600 11px ${fonts.sans}`,
                color: colors.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginLeft: 'auto',
              }}
            >
              Week {t.week} of {t.totalWeeks}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
          <span
            className="cad-nums"
            style={{ font: `600 32px ${fonts.sans}`, color: colors.ink, letterSpacing: '-0.02em' }}
          >
            {Math.round(t.pct)}%
          </span>
          <span style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2 }}>
            {t.phase === 'during' ? 'of the way through' : t.phase === 'before' ? 'not started yet' : 'finished'}
          </span>
        </div>

        <div style={{ marginTop: 12 }}>
          <TermBar t={t} height={12} />
          <MonthScale months={t.months} />
        </div>

        <div style={{ font: `500 13px/1.55 ${fonts.sans}`, color: colors.ink, marginTop: 14 }}>
          {milestone(t)}
        </div>
        {note && (
          <div style={{ font: `400 11.5px/1.6 ${fonts.sans}`, color: colors.muted2, marginTop: 5 }}>
            {note}
          </div>
        )}

        {t.phase !== 'after' && (
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
            <Stat
              label="Days left"
              value={t.daysLeft}
              note={`of ${t.totalDays} in the term`}
            />
            <Stat
              label="Class days"
              value={t.classDaysLeft}
              note="you still have to show up"
            />
            <Stat
              label="Weeks left"
              value={t.weeksLeft}
              note={t.phase === 'before' ? 'once it starts' : `week ${t.week} of ${t.totalWeeks}`}
            />
            {t.nextBreak && (
              <Stat
                label="Next break"
                value={monthDay(parseDay(t.nextBreak.start_date))}
                note={t.nextBreak.name}
              />
            )}
          </div>
        )}
      </Card>
    </>
  );
}

/**
 * The same fact, one line high.
 *
 * Deliberately not a smaller copy of the card. A card asks to be read; this
 * asks to be glanced at, and everything that would reward a second look — the
 * breaks, the months, the sentence — is left off so the one number lands. It
 * links to the card for the rest.
 */
export function SemesterStrip({ onClick }) {
  const t = useTermProgress();
  if (!t) return null;

  const label =
    t.phase === 'before'
      ? t.daysUntilStart === 0
        ? 'Starts today'
        : t.daysUntilStart === 1
          ? 'Starts tomorrow'
          : `Starts in ${t.daysUntilStart} days`
      : t.phase === 'after'
        ? 'Semester over'
        : `Week ${t.week} of ${t.totalWeeks}`;

  return (
    <button
      onClick={onClick}
      aria-label={`${label}, ${Math.round(t.pct)} percent through the semester`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        maxWidth: 420,
        marginTop: 11,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <span
        style={{
          font: `600 11px ${fonts.sans}`,
          color: colors.muted,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span style={{ flex: 1, minWidth: 40 }}>
        <TermBar t={t} height={5} showBreaks={false} />
      </span>
      {t.phase === 'during' && (
        <span
          className="cad-nums"
          style={{ font: `600 11.5px ${fonts.sans}`, color: colors.muted2 }}
        >
          {Math.round(t.pct)}%
        </span>
      )}
    </button>
  );
}

/**
 * The bar itself.
 *
 * Breaks are drawn as gaps punched through the whole length rather than as
 * something only the unspent half has, because a break behind you is why the
 * filled part got long so fast — and the pale notch sitting just ahead of the
 * marker is the most useful thing on the bar in the week before Thanksgiving.
 *
 * The marker is drawn on top of the fill's leading edge rather than relying on
 * it: when today falls inside a break, the notch is painted over exactly the
 * boundary that was doing the job, and the "you are here" line would vanish on
 * the days it's most interesting.
 */
function TermBar({ t, height = 12, showBreaks = true }) {
  const r = height / 2;
  return (
    <div
      style={{
        position: 'relative',
        height,
        borderRadius: r,
        background: colors.track,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: `${t.pct}%`,
          background: colors.accent,
          borderRadius: r,
          transition: 'width 400ms ease',
        }}
      />
      {showBreaks &&
        t.segments.map((s) => (
          <div
            key={s.id}
            title={`${s.name} · ${dayRangeLabel(s.start_date, s.end_date)}`}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${s.left}%`,
              width: `${s.width}%`,
              minWidth: 3,
              background: colors.card,
              opacity: 0.8,
            }}
          />
        ))}
      {t.phase === 'during' && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${t.pct}%`,
            width: 2,
            marginLeft: -1,
            background: colors.accentDark,
          }}
        />
      )}
    </div>
  );
}

// Month marks under the bar. The percentage says how much is gone; these say
// what it's gone *of*, and "we're already into November" lands in a way that
// "68%" does not. Labels too close to the one before are dropped rather than
// overlapped — a crowded scale is one nobody reads.
function MonthScale({ months }) {
  const MIN_GAP = 8; // percent of the bar, which is about one label wide

  const shown = [];
  for (const m of months) {
    const prev = shown[shown.length - 1];
    if (!prev || m.left - prev.left >= MIN_GAP) {
      shown.push(m);
    } else if (shown.length === 1 && prev.left === 0) {
      // A term starting on the 24th gives August three days of bar and no room
      // to name them. The mark to give up is the one at the very start: the
      // beginning of the bar is findable without a label, and the header above
      // already says which day it is.
      shown[0] = m;
    }
  }

  return (
    <div style={{ position: 'relative', height: 14, marginTop: 5 }}>
      {shown.map((m) => (
        <span
          key={m.key}
          style={{
            position: 'absolute',
            // A mark sitting on the very start hangs off the left end rather
            // than being centred on it, so it doesn't sit half outside the card.
            left: `${m.left}%`,
            transform: m.left === 0 ? 'none' : 'translateX(-50%)',
            font: `500 10px ${fonts.sans}`,
            color: colors.faint,
            whiteSpace: 'nowrap',
          }}
        >
          {m.label}
        </span>
      ))}
    </div>
  );
}

/**
 * The sentence under the bar.
 *
 * Every branch names a number you can act on rather than restating the
 * percentage in words, and the quarter marks are called out because they're the
 * ones people already think in — "past halfway" is a thing you say out loud;
 * "53.9% elapsed" is not.
 */
function milestone(t) {
  const days = (n) => `${n} day${n === 1 ? '' : 's'} of class`;

  if (t.phase === 'before') {
    if (t.daysUntilStart === 0) return `Starts today. ${t.totalWeeks} weeks of it, all ahead of you.`;
    if (t.daysUntilStart === 1) return `Starts tomorrow — ${t.totalWeeks} weeks, ${days(t.classDaysLeft)}.`;
    return `Starts in ${t.daysUntilStart} days, and runs ${t.totalWeeks} weeks from there.`;
  }

  if (t.phase === 'after') {
    return `Over. ${t.totalWeeks} weeks, ${t.totalDays} days, done.`;
  }

  if (t.daysLeft === 0) return `The last day of it. ${days(t.classDaysLeft)} left, and that's the lot.`;

  const pct = Math.round(t.pct);
  if (pct >= 90) return `Nearly out. ${days(t.classDaysLeft)} left.`;
  if (pct >= 75) return `Into the last quarter — ${days(t.classDaysLeft)} left, and ${t.daysLeft} days until it's over.`;
  if (pct >= 50) {
    return `Past halfway. There is less of this semester ahead of you than behind, and ${days(t.classDaysLeft)} left in it.`;
  }
  if (pct >= 25) return `Past the first quarter, with ${days(t.classDaysLeft)} still to go.`;
  return `Week ${t.week} of ${t.totalWeeks}. ${days(t.classDaysLeft)} ahead, which is nearly all of them.`;
}

// What the days left are not. A fortnight of the run-in to finals being
// Thanksgiving changes what "23 days" means, and it's the kind of thing that is
// obvious in hindsight and invisible in advance.
function breakNote(t) {
  if (t.phase === 'after' || !t.breakDaysLeft) return null;
  const upcoming = t.segments.filter((s) => !s.past);
  if (!upcoming.length) return null;

  const of = `Of the ${t.daysLeft} days left, ${t.breakDaysLeft}`;
  if (upcoming.length === 1) {
    return `${of} ${t.breakDaysLeft === 1 ? 'is' : 'are'} ${upcoming[0].name}, ${dayRangeLabel(upcoming[0].start_date, upcoming[0].end_date)}.`;
  }
  return `${of} are already days off, across ${upcoming.length} breaks.`;
}
