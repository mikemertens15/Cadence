import { getWeek } from './dates.js';
import { isGraded, courseStanding } from './grading/engine.js';
import { isEvent } from './assignments.js';

// Where the hours went, and which class should get the next one.
//
// Pure functions over plain rows, for the same reason src/grading/engine.js is:
// the card that recommends a course and the panel that shows the week have to
// agree, and the only way to guarantee that is for both to call this. No React,
// no network, and every number below is reachable from a test.
//
// The thing worth being clear about up front: a standalone study timer knows
// only what you tell it, so all it can ever say is that you spent three hours on
// something. It cannot say that was the wrong three hours. This app already
// knows what's due, what it's worth, where every grade stands and what each
// course still has left to score on — so the question it can answer, and the
// only reason this feature belongs here rather than in a stopwatch app, is
// *which class needs the next hour*.

// ------------------------------------------------------------- the clock

const ms = (t) => {
  const n = new Date(t).getTime();
  return Number.isFinite(n) ? n : null;
};

export const isRunning = (s) => !!s && !!s.started_at && !s.ended_at;
export const isPaused = (s) => isRunning(s) && !!s.paused_at;

/**
 * Time actually spent in a block, in milliseconds.
 *
 * Three states, one expression. A finished block reads to `ended_at`; a paused
 * one reads to `paused_at`, which is what freezes it; a running one reads to
 * now. Finished pauses come off the total either way.
 *
 * Derived rather than stored, which is the whole point of the schema: nothing
 * has to survive in memory for this to stay correct across a sleeping laptop, a
 * killed tab or a second device.
 */
export function focusMs(session, now = new Date()) {
  const start = session?.started_at ? ms(session.started_at) : null;
  if (start == null) return 0;

  const stop = session.ended_at
    ? ms(session.ended_at)
    : session.paused_at
      ? ms(session.paused_at)
      : now.getTime();
  if (stop == null) return 0;

  return Math.max(0, stop - start - (Number(session.paused_ms) || 0));
}

export const focusMinutes = (session, now = new Date()) => focusMs(session, now) / 60000;

// Milliseconds a pause has been open, for folding into paused_ms on resume.
export function openPauseMs(session, now = new Date()) {
  const at = session?.paused_at ? ms(session.paused_at) : null;
  return at == null ? 0 : Math.max(0, now.getTime() - at);
}

// ------------------------------------------------------------ the target
//
// Two hours per credit hour, which is the low end of the two-to-three every
// syllabus prints. The low end on purpose: a target you clear is a target you
// keep looking at, and one that reads "you are four hours down" every Sunday
// evening gets ignored within a fortnight. It's a default, not a claim — the
// column exists precisely so you can say otherwise.
export const MINUTES_PER_CREDIT = 120;

export function targetMinutes(course) {
  const stored = course?.weekly_study_minutes;
  if (stored != null && Number.isFinite(Number(stored))) return Number(stored);
  const credits = Number(course?.credit_hours);
  return Math.round((Number.isFinite(credits) ? credits : 3) * MINUTES_PER_CREDIT);
}

// Whether a course is one you could still study for. Only a withdrawal is out:
// you are not in the class. An audit stays in — no grade to protect, but the
// hours are real and hiding them would under-report the week.
export const isStudyable = (course) => courseStanding(course).why !== 'withdrawn';

// ---------------------------------------------------------------- the week
//
// Monday-first, because the schedule grid is and one convention end to end
// beats converting at every boundary. A week rather than a rolling seven days:
// the question is "am I giving this class its share", and the answer has to
// reset somewhere or every Sunday's binge follows you into Wednesday.

export function weekBounds(now = new Date()) {
  const start = getWeek(now).monday;
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

// A block belongs to the week it *started* in. A session that runs through
// midnight on Sunday could be split, and splitting it would mean a stored row no
// longer matches the number drawn from it — for the sake of the handful of
// minutes past midnight that nobody is awake for anyway.
export function sessionsIn(sessions = [], { start, end }) {
  const from = start.getTime();
  const to = end.getTime();
  return sessions.filter((s) => {
    const t = ms(s.started_at);
    return t != null && t >= from && t < to;
  });
}

/**
 * The week, per course: what you set out to give it and what it got.
 *
 * `share` is of the time actually logged, not of the target — the imbalance is
 * the point of this panel, and "38% of your week went to one class" is the
 * sentence that makes it visible.
 */
export function weekSummary({ courses = [], sessions = [], now = new Date() } = {}) {
  const bounds = weekBounds(now);
  const inWeek = sessionsIn(sessions, bounds);

  const minutesByCourse = new Map();
  for (const s of inWeek) {
    minutesByCourse.set(s.course_id, (minutesByCourse.get(s.course_id) ?? 0) + focusMinutes(s, now));
  }

  const eligible = courses.filter(isStudyable);
  const logged = eligible.reduce((t, c) => t + (minutesByCourse.get(c.id) ?? 0), 0);

  const rows = eligible.map((course) => {
    const minutes = minutesByCourse.get(course.id) ?? 0;
    const target = targetMinutes(course);
    return {
      course,
      minutes,
      target,
      // Null rather than Infinity when the target is zero — a course you have
      // deliberately set to no target has no percentage, and 0/0 is not 100%.
      pct: target > 0 ? (minutes / target) * 100 : null,
      debt: Math.max(0, target - minutes),
      share: logged > 0 ? (minutes / logged) * 100 : 0,
    };
  });

  rows.sort((a, b) => b.minutes - a.minutes || a.course.name.localeCompare(b.course.name));

  return {
    ...bounds,
    rows,
    sessions: inWeek,
    logged,
    target: rows.reduce((t, r) => t + r.target, 0),
    // Time logged against a course that is no longer in the list (deleted, or
    // withdrawn from mid-term). Reported rather than dropped, so the bars and
    // the total can't quietly disagree.
    unattributed: [...minutesByCourse].reduce(
      (t, [id, m]) => (eligible.some((c) => c.id === id) ? t : t + m),
      0,
    ),
  };
}

// --------------------------------------------------------------- the plan

// How far ahead a deadline still counts as pressure. A week: past that it isn't
// what to do *now*, and everything inside it is something this week's hours can
// still change.
export const HORIZON_DAYS = 7;

// What the three signals are worth, and this is a judgement call rather than a
// derived truth, so it is written where it can be argued with.
//
// Deadlines lead because they are the one with a hard edge — an exam on Thursday
// is not a preference, and no amount of balance across five courses is worth
// walking into it cold. Time debt is next, because it is the actual complaint:
// three hours on one class is only visible against what the others didn't get.
// The grade comes last, and deliberately so — it is the slowest-moving of the
// three and the easiest to read too much into in week three.
export const WEIGHTS = { deadline: 0.4, debt: 0.35, grade: 0.25 };

const clamp01 = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);

/**
 * Where a percentage sits inside its letter band.
 *
 * Not "how far above the cutoff" in raw points, because that is a different
 * amount of safety on a +/- scale (three points) than on a straight one (ten),
 * and a plan that reads every +/- course as an emergency is a plan you stop
 * reading. `position` is 0 at the cutoff and 1 at the top of the band.
 */
export function bandFor(pct, scale = []) {
  if (pct == null || !Number.isFinite(pct) || !scale.length) return null;

  const sorted = [...scale].sort((a, b) => b.min - a.min);
  const i = sorted.findIndex((row) => pct >= row.min);
  if (i === -1) return null;

  const current = sorted[i];
  // The top band has no letter above it; it runs to 100. A course at 96 on a
  // 90-cutoff A is genuinely safe, and that has to be expressible.
  const ceiling = i === 0 ? Math.max(100, pct) : sorted[i - 1].min;
  const width = ceiling - current.min;

  return {
    letter: current.letter,
    min: current.min,
    ceiling,
    width,
    slack: pct - current.min,
    position: width > 0 ? clamp01((pct - current.min) / width) : 1,
  };
}

/**
 * Work that this week's hours could still change, in the order it lands.
 *
 * Graded work is out — it's finished. Ungraded work the course doesn't count is
 * out too; it may still be worth doing, but it cannot be the reason one class
 * outranks another for the grade's sake. An exam already sat is out for the
 * plainest reason of all: there is no studying for a test you have taken.
 * Overdue homework stays, at full urgency, because it is still owed.
 */
export function pressingWork(assignments = [], now = new Date(), horizonDays = HORIZON_DAYS) {
  const day = 86400000;
  const out = [];

  for (const a of assignments) {
    if (!a.due_at || a.counts_toward_grade === false || isGraded(a)) continue;
    const at = ms(a.due_at);
    if (at == null) continue;

    const daysOut = (at - now.getTime()) / day;
    if (daysOut > horizonDays) continue;
    if (daysOut < 0 && isEvent(a.kind)) continue;

    out.push({
      assignment: a,
      daysOut,
      // Linear from 0 at the horizon to 1 at the deadline, and pinned at 1 once
      // it's overdue. Nothing subtler is defensible: the difference between
      // three days out and four is not a thing anyone can measure, and a curve
      // would only be inventing precision to look clever.
      urgency: clamp01(1 - Math.max(0, daysOut) / horizonDays),
      points: Number(a.points_possible) || 0,
    });
  }

  return out.sort((x, y) => x.daysOut - y.daysOut);
}

/**
 * Which class should get the next hour, and why.
 *
 * Takes one entry per course — the course row, its computed grade (straight from
 * gradeCourse), its scale and its assignments — plus this term's study sessions.
 * That is the same shape useTermGrades() already produces, so the seam in
 * src/data/study.js is a gather rather than a second opinion about anything.
 *
 * Three signals, each a 0–1 pressure:
 *
 *   debt      how much of this week's target is still owed. The literal
 *             complaint: three hours here means two other classes got none.
 *   deadline  what's due inside the week, weighted by how soon and by how much
 *             of what's *left in this course* it represents. A 200-point exam
 *             on Thursday outranks a ten-point quiz on Thursday, and both
 *             outrank the same exam a month out.
 *   grade     how close the course is to the bottom of its letter band — and
 *             zero when nothing is left to score on, because an hour cannot
 *             move a grade that is already final. Studying is still worth doing
 *             then; it just isn't a reason to pick this class over another.
 *
 * What comes back is a ranking and the reasons behind it, never a bare score.
 * The number is a means of sorting, not a thing to show someone: it looks like
 * a measurement and isn't one. The reasons are what a person can check, and
 * disagree with, and that is the difference between advice and an oracle.
 */
export function studyPlan({ entries = [], sessions = [], now = new Date(), horizonDays = HORIZON_DAYS } = {}) {
  const week = weekSummary({ courses: entries.map((e) => e.course), sessions, now });
  const byCourse = new Map(week.rows.map((r) => [r.course.id, r]));

  const ranked = entries
    .filter((e) => e.course && isStudyable(e.course))
    .map(({ course, grade = {}, scale = [], assignments = [] }) => {
      const row = byCourse.get(course.id) ?? {
        minutes: 0,
        target: targetMinutes(course),
        debt: targetMinutes(course),
      };

      const debt = row.target > 0 ? clamp01(row.debt / row.target) : 0;

      const work = pressingWork(assignments, now, horizonDays);
      // Each item's share of what this course still has left to score. Falling
      // back to its own points when the course reports nothing remaining keeps
      // a single un-filed assignment from reading as zero pressure.
      const pool = Number(grade.remainingPossible) || 0;
      const deadline = clamp01(
        work.reduce((t, w) => t + w.urgency * (pool > 0 ? Math.min(1, w.points / pool) : 1), 0),
      );

      const band = bandFor(grade.pct ?? null, scale);
      const canStillMove = (grade.remainingCount ?? 0) > 0;
      const gradePressure = band && canStillMove ? 1 - band.position : 0;

      const score =
        WEIGHTS.deadline * deadline + WEIGHTS.debt * debt + WEIGHTS.grade * gradePressure;

      return {
        course,
        score,
        minutes: row.minutes,
        target: row.target,
        debtMinutes: row.debt,
        band,
        work,
        pressure: { deadline, debt, grade: gradePressure },
        reasons: reasonsFor({ row, work, band, canStillMove, hasGrades: !!grade.hasGrades }),
      };
    });

  ranked.sort((a, b) => b.score - a.score || a.course.name.localeCompare(b.course.name));
  return ranked;
}

// Debt smaller than this is noise — nobody needs telling they are eleven minutes
// short — and phrasing it as a shortfall would make a met target look like a
// failure.
const DEBT_FLOOR_MINUTES = 20;

// How far down its letter band a course has to sit before the grade is worth
// naming as a reason. A third: comfortably inside the band is not news.
const AT_RISK_POSITION = 0.35;

/**
 * Which facts explain this course's position, as data rather than as sentences.
 *
 * The *selection* lives here so a ranking and its explanation come out of one
 * pass and cannot drift apart. The *wording* deliberately doesn't: dates are
 * phrased by describeDue and durations by fmtDuration, exactly as everywhere
 * else in the app, and a second vocabulary for the same facts would be a second
 * place for them to disagree.
 */
function reasonsFor({ row, work, band, canStillMove, hasGrades }) {
  const out = [];

  if (work.length) out.push({ kind: 'deadline', assignment: work[0].assignment, more: work.length - 1 });

  if (row.debt >= DEBT_FLOOR_MINUTES) out.push({ kind: 'debt', minutes: row.debt });
  else if (row.target > 0 && row.minutes >= row.target) out.push({ kind: 'met', minutes: row.minutes });

  if (band && canStillMove && band.position < AT_RISK_POSITION) {
    out.push({ kind: 'grade', letter: band.letter, slack: band.slack });
  } else if (!hasGrades) {
    out.push({ kind: 'no-grades' });
  } else if (!canStillMove) {
    out.push({ kind: 'settled' });
  }

  if (!row.minutes) out.push({ kind: 'untouched' });

  return out;
}

// --------------------------------------------------- how long a block can be

// Deep work, not pomodoro. Fifty is the default because it is the length of the
// class you already sit through, and ninety is there because some things don't
// start until you're forty minutes in. Twenty-five stays for the gap between
// classes, which is a real slot and the alternative use of it is a phone.
export const PRESETS = [25, 50, 90];
export const DEFAULT_BLOCK = 50;

// Time to pack up and walk. Nobody stands up the instant a timer ends, and a
// block that technically fits with zero to spare is one you leave a lecture
// early for.
export const BUFFER_MINUTES = 5;

// Below this it isn't a study block, it's a queue.
export const MIN_BLOCK = 15;

// And below this it isn't a block at all. Starting one and stopping it eight
// seconds later is a misclick, and storing it would put rows reading "0 min"
// into the one panel whose entire value is being readable at a glance.
export const MIN_LOGGED_MINUTES = 1;

/**
 * What will actually fit before you have to be somewhere.
 *
 * The app knows the timetable, so it can stop you starting a 90 at 1:20 when
 * there's a class at 2:00 — which otherwise ends one of two ways, and both of
 * them are bad: an abandoned block that logs nothing, or a lecture missed for a
 * countdown.
 *
 * It suggests; it does not forbid. Every preset comes back, with `fits` saying
 * which ones do, because "I know, I'm skipping it" is a decision a person is
 * allowed to make and an app that greys out the button is just wrong more
 * confidently. When the gap doesn't match a preset, the gap itself is offered.
 */
export function blockOptions({ nowMinutes = 0, nextStartMinutes = null, presets = PRESETS } = {}) {
  const room =
    nextStartMinutes == null ? null : Math.floor(nextStartMinutes - nowMinutes - BUFFER_MINUTES);

  const options = presets.map((minutes) => ({
    minutes,
    kind: 'preset',
    fits: room == null || minutes <= room,
  }));

  // The bespoke one, when the gap is worth using and isn't already on offer.
  if (room != null && room >= MIN_BLOCK && !presets.includes(room)) {
    options.push({ minutes: room, kind: 'until-next', fits: true });
  }
  options.sort((a, b) => a.minutes - b.minutes);

  const fitting = options.filter((o) => o.fits);
  const recommended =
    room == null
      ? DEFAULT_BLOCK
      : fitting.length
        ? // The longest block that fits, since the whole point is depth.
          fitting[fitting.length - 1].minutes
        : // Nothing fits: there is no honest recommendation, and the card says
          // so rather than proposing a block that runs into a lecture.
          null;

  return { room, options, recommended };
}
