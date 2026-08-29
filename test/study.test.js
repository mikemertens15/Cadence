import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  focusMs,
  focusMinutes,
  openPauseMs,
  isRunning,
  isPaused,
  targetMinutes,
  weekBounds,
  weekSummary,
  bandFor,
  pressingWork,
  studyPlan,
  blockOptions,
  MINUTES_PER_CREDIT,
  WEIGHTS,
} from '../src/study.js';
import { DEFAULT_SCALE, PLUS_MINUS_SCALE } from '../src/grading/scale.js';

// Two things here are worth being sure about, and they fail in opposite
// directions. The clock has to be honest — a number that flatters you is worse
// than no number, because you'll act on it — and the ranking has to be
// explainable, because it tells someone where to spend an evening. Every
// expected value below is computed by hand in the comment above it.

const MIN = 60000;
const at = (isoMinutesFromBase) => new Date(BASE.getTime() + isoMinutesFromBase * MIN).toISOString();
const BASE = new Date(2026, 8, 16, 9, 0, 0); // a fixed wall-clock moment; weekday asserted below

const course = (id, name, extra = {}) => ({
  id,
  name,
  code: name,
  credit_hours: 3,
  color: 'teal',
  ...extra,
});

const session = (courseId, startMin, extra = {}) => ({
  id: `s-${courseId}-${startMin}`,
  course_id: courseId,
  started_at: at(startMin),
  ended_at: null,
  paused_at: null,
  paused_ms: 0,
  ...extra,
});

// ----------------------------------------------------------------- the clock

test('a running block counts from when it started', () => {
  // started at 9:00, read at 9:37 → 37 minutes
  const s = session('c1', 0);
  assert.equal(focusMinutes(s, new Date(BASE.getTime() + 37 * MIN)), 37);
  assert.equal(isRunning(s), true);
  assert.equal(isPaused(s), false);
});

test('a paused block is frozen at the pause, not still running', () => {
  // started 9:00, paused 9:20, read at 10:30 → 20 minutes, not 90
  const s = session('c1', 0, { paused_at: at(20) });
  assert.equal(focusMinutes(s, new Date(BASE.getTime() + 90 * MIN)), 20);
  assert.equal(isPaused(s), true);
  // and the open pause is 70 minutes, which is what resume folds into paused_ms
  assert.equal(openPauseMs(s, new Date(BASE.getTime() + 90 * MIN)), 70 * MIN);
});

test('finished pauses come off the total', () => {
  // started 9:00, ended 10:00, 12 minutes of it paused → 48 minutes counted
  const s = session('c1', 0, { ended_at: at(60), paused_ms: 12 * MIN });
  assert.equal(focusMinutes(s, new Date(BASE.getTime() + 500 * MIN)), 48);
  assert.equal(isRunning(s), false);
});

test('a finished block reads the same forever, whenever you ask', () => {
  const s = session('c1', 0, { ended_at: at(50) });
  assert.equal(focusMinutes(s, new Date(BASE.getTime() + 51 * MIN)), 50);
  assert.equal(focusMinutes(s, new Date(BASE.getTime() + 100000 * MIN)), 50);
});

test('a clock that would run backwards reads zero instead', () => {
  // Nothing should produce this, but a device whose clock jumped is the one
  // case where it can, and "-4 minutes of study" is not a thing to render.
  const s = session('c1', 0, { paused_ms: 90 * MIN, ended_at: at(60) });
  assert.equal(focusMs(s, BASE), 0);
});

// ---------------------------------------------------------------- the target

test('the weekly target comes off credit hours until you say otherwise', () => {
  // 3 credits × 120 = 360 minutes
  assert.equal(targetMinutes(course('c1', 'Statics')), 3 * MINUTES_PER_CREDIT);
  // 1.5-credit lab → 180
  assert.equal(targetMinutes(course('c2', 'Lab', { credit_hours: 1.5 })), 180);
  // an explicit target wins, including a deliberate zero
  assert.equal(targetMinutes(course('c3', 'Seminar', { weekly_study_minutes: 200 })), 200);
  assert.equal(targetMinutes(course('c4', 'Audit', { weekly_study_minutes: 0 })), 0);
});

// ------------------------------------------------------------------ the week

test('the week starts on Monday morning and holds the moment asked about', () => {
  const { start, end } = weekBounds(BASE);
  assert.equal(start.getDay(), 1); // Monday, whatever weekday BASE happens to be
  assert.equal(start.getHours(), 0);
  assert.equal(start.getMinutes(), 0);
  assert.ok(start <= BASE && BASE < end);
  assert.equal(Math.round((end - start) / 86400000), 7);
});

test("last week's blocks are not this week's hours", () => {
  const { start } = weekBounds(BASE);
  const mondayMin = (start.getTime() - BASE.getTime()) / MIN;

  const c1 = course('c1', 'Thermo');
  const sessions = [
    // 60 minutes, one minute after this week began
    session('c1', mondayMin + 1, { ended_at: at(mondayMin + 61) }),
    // 60 minutes, one minute before it did
    session('c1', mondayMin - 61, { ended_at: at(mondayMin - 1) }),
  ];

  const week = weekSummary({ courses: [c1], sessions, now: BASE });
  assert.equal(week.logged, 60);
  assert.equal(week.rows[0].minutes, 60);
});

test('the week says where the hours went, and what each course is owed', () => {
  const { start } = weekBounds(BASE);
  const m = (start.getTime() - BASE.getTime()) / MIN;

  const thermo = course('c1', 'Thermo'); // target 360
  const math = course('c2', 'Math'); // target 360
  const lab = course('c3', 'Lab', { credit_hours: 1 }); // target 120

  const sessions = [
    session('c1', m + 60, { ended_at: at(m + 60 + 180) }), // 180 on Thermo
    session('c2', m + 300, { ended_at: at(m + 300 + 60) }), // 60 on Math
  ];

  const week = weekSummary({ courses: [thermo, math, lab], sessions, now: BASE });

  // 180 + 60 + 0 = 240 logged against 360 + 360 + 120 = 840 targeted
  assert.equal(week.logged, 240);
  assert.equal(week.target, 840);

  // sorted by hours given, most first
  assert.deepEqual(week.rows.map((r) => r.course.id), ['c1', 'c2', 'c3']);

  // Thermo: 180/360 = 50% of target, 180/240 = 75% of the week, 180 owed
  assert.equal(week.rows[0].pct, 50);
  assert.equal(week.rows[0].share, 75);
  assert.equal(week.rows[0].debt, 180);

  // the lab got nothing: 0% of target, 0% of the week, all 120 still owed
  assert.equal(week.rows[2].minutes, 0);
  assert.equal(week.rows[2].pct, 0);
  assert.equal(week.rows[2].share, 0);
  assert.equal(week.rows[2].debt, 120);
});

test('a course with no target has no percentage rather than an infinite one', () => {
  const { start } = weekBounds(BASE);
  const m = (start.getTime() - BASE.getTime()) / MIN;
  const audit = course('c1', 'Audit', { weekly_study_minutes: 0 });

  const week = weekSummary({
    courses: [audit],
    sessions: [session('c1', m + 10, { ended_at: at(m + 70) })],
    now: BASE,
  });

  assert.equal(week.rows[0].minutes, 60);
  assert.equal(week.rows[0].pct, null);
  assert.equal(week.rows[0].debt, 0);
});

test('hours logged against a course that is gone are reported, not swallowed', () => {
  const { start } = weekBounds(BASE);
  const m = (start.getTime() - BASE.getTime()) / MIN;

  const week = weekSummary({
    courses: [course('c1', 'Thermo')],
    sessions: [
      session('c1', m + 10, { ended_at: at(m + 70) }), // 60, attributed
      session('gone', m + 90, { ended_at: at(m + 120) }), // 30, orphaned
    ],
    now: BASE,
  });

  assert.equal(week.logged, 60);
  assert.equal(week.unattributed, 30);
});

test('a withdrawn course is not one you are behind on', () => {
  const week = weekSummary({
    courses: [course('c1', 'Dropped', { status: 'withdrawn' })],
    sessions: [],
    now: BASE,
  });
  assert.equal(week.rows.length, 0);
  assert.equal(week.target, 0);
});

// ------------------------------------------------------------- letter bands

test('where a grade sits in its band, not how many points clear it is', () => {
  // straight scale: 85 is the middle of B (80–90) → slack 5, position 0.5
  const b = bandFor(85, DEFAULT_SCALE);
  assert.equal(b.letter, 'B');
  assert.equal(b.slack, 5);
  assert.equal(b.position, 0.5);

  // +/- scale: 85 is the middle of B (83–87) → slack 2, still position 0.5.
  // The same 2 points means something different on a 4-point band, which is the
  // entire reason position exists.
  const p = bandFor(85, PLUS_MINUS_SCALE);
  assert.equal(p.letter, 'B');
  assert.equal(p.slack, 2);
  assert.equal(p.position, 0.5);
});

test('the top band runs to 100, so a 96 reads as safe', () => {
  // A is 90+ with nothing above it → band 90–100, 96 is 60% of the way up
  const b = bandFor(96, DEFAULT_SCALE);
  assert.equal(b.letter, 'A');
  assert.equal(b.ceiling, 100);
  assert.ok(Math.abs(b.position - 0.6) < 1e-9);
});

test('sitting exactly on a cutoff is the bottom of the band, not the top', () => {
  const b = bandFor(80, DEFAULT_SCALE);
  assert.equal(b.letter, 'B');
  assert.equal(b.slack, 0);
  assert.equal(b.position, 0);
});

test('no grade yet is not a band', () => {
  assert.equal(bandFor(null, DEFAULT_SCALE), null);
});

// ------------------------------------------------------------ pressing work

const work = (id, dueMinutesFromBase, extra = {}) => ({
  id,
  course_id: 'c1',
  title: id,
  kind: 'assignment',
  due_at: at(dueMinutesFromBase),
  points_possible: 100,
  points_earned: null,
  score_pct: null,
  counts_toward_grade: true,
  ...extra,
});

const DAY = 24 * 60;

test('work inside the week counts, and sooner counts for more', () => {
  const rows = pressingWork([work('a', 1 * DAY), work('b', 6 * DAY)], BASE);
  assert.deepEqual(rows.map((r) => r.assignment.id), ['a', 'b']);
  // 1 day out on a 7-day horizon → 1 − 1/7 = 6/7
  assert.ok(Math.abs(rows[0].urgency - 6 / 7) < 1e-9);
  // 6 days out → 1 − 6/7 = 1/7
  assert.ok(Math.abs(rows[1].urgency - 1 / 7) < 1e-9);
});

test('past the horizon is not what to do tonight', () => {
  assert.equal(pressingWork([work('a', 8 * DAY)], BASE).length, 0);
});

test('graded work, uncounted work and a test you already sat all drop out', () => {
  const rows = pressingWork(
    [
      work('graded', 2 * DAY, { points_earned: 90 }),
      work('not-graded-by-the-course', 2 * DAY, { counts_toward_grade: false }),
      work('exam-already-sat', -1 * DAY, { kind: 'test' }),
      work('handed-in', -1 * DAY, { status: 'submitted' }),
      work('still-owed', -1 * DAY),
    ],
    BASE,
  );
  // Only the overdue problem set survives — and at full urgency, because it is
  // still owed in a way a test you have taken, or homework you have already
  // handed in, can never be.
  assert.deepEqual(rows.map((r) => r.assignment.id), ['still-owed']);
  assert.equal(rows[0].urgency, 1);
});

// -------------------------------------------------------------- the ranking

// A course with everything neutral: no work due, one ungraded item left, and a
// grade sitting mid-band. Anything a test wants to isolate, it changes.
const entry = (id, name, extra = {}) => ({
  course: course(id, name),
  grade: { pct: 85, hasGrades: true, remainingCount: 1, remainingPossible: 100 },
  scale: DEFAULT_SCALE,
  assignments: [],
  ...extra,
});

const weekOf = (perCourseMinutes) => {
  const { start } = weekBounds(BASE);
  const m = (start.getTime() - BASE.getTime()) / MIN;
  return Object.entries(perCourseMinutes)
    .filter(([, mins]) => mins > 0)
    .map(([id, mins], i) => session(id, m + i * 600, { ended_at: at(m + i * 600 + mins) }));
};

test('the class you have not touched outranks the one you have been living in', () => {
  const plan = studyPlan({
    entries: [entry('c1', 'Thermo'), entry('c2', 'Math')],
    // Thermo got three hours this week; Math got none. Both target 360.
    sessions: weekOf({ c1: 180 }),
    now: BASE,
  });

  assert.deepEqual(plan.map((p) => p.course.id), ['c2', 'c1']);

  // Math: debt 360/360 = 1, no deadlines, grade 85 → position 0.5 → 0.5
  //   0.35(1) + 0.25(0.5) = 0.475
  assert.ok(Math.abs(plan[0].score - (WEIGHTS.debt + WEIGHTS.grade * 0.5)) < 1e-9);
  // Thermo: debt 180/360 = 0.5 → 0.35(0.5) + 0.25(0.5) = 0.30
  assert.ok(Math.abs(plan[1].score - (WEIGHTS.debt * 0.5 + WEIGHTS.grade * 0.5)) < 1e-9);
});

test('an exam on Thursday breaks the tie between two equally neglected classes', () => {
  const exam = {
    ...work('midterm', 2 * DAY, { kind: 'test' }),
    course_id: 'c2',
  };

  const plan = studyPlan({
    entries: [entry('c1', 'Thermo'), entry('c2', 'Math', { assignments: [exam] })],
    sessions: [], // neither has had a minute
    now: BASE,
  });

  assert.deepEqual(plan.map((p) => p.course.id), ['c2', 'c1']);

  // Math: the exam is 100 of the 100 points left → share 1, 2 days out → 5/7
  //   0.4(5/7) + 0.35(1) + 0.25(0.5) = 0.285714… + 0.35 + 0.125 = 0.760714…
  assert.ok(Math.abs(plan[0].score - (WEIGHTS.deadline * (5 / 7) + WEIGHTS.debt + WEIGHTS.grade * 0.5)) < 1e-9);
  // and it says why, with the exam first
  assert.equal(plan[0].reasons[0].kind, 'deadline');
  assert.equal(plan[0].reasons[0].assignment.id, 'midterm');
});

test('a big exam outranks a small quiz landing on the same day', () => {
  const quiz = { ...work('quiz', 2 * DAY, { kind: 'quiz', points_possible: 10 }), course_id: 'c1' };
  const exam = { ...work('exam', 2 * DAY, { kind: 'test', points_possible: 190 }), course_id: 'c2' };

  const plan = studyPlan({
    entries: [
      // Both courses have 200 points still to score, so the only difference is
      // how much of it lands on Thursday: 10 points against 190.
      entry('c1', 'Thermo', {
        assignments: [quiz],
        grade: { pct: 85, hasGrades: true, remainingCount: 2, remainingPossible: 200 },
      }),
      entry('c2', 'Math', {
        assignments: [exam],
        grade: { pct: 85, hasGrades: true, remainingCount: 2, remainingPossible: 200 },
      }),
    ],
    sessions: [],
    now: BASE,
  });

  assert.deepEqual(plan.map((p) => p.course.id), ['c2', 'c1']);
  // Thermo's quiz: 10/200 = 0.05 of what's left, at 5/7 urgency → 0.0357…
  assert.ok(Math.abs(plan[1].pressure.deadline - (5 / 7) * 0.05) < 1e-9);
  // Math's exam: 190/200 = 0.95 → 0.678…
  assert.ok(Math.abs(plan[0].pressure.deadline - (5 / 7) * 0.95) < 1e-9);
});

test('a grade an hour cannot move is not a reason to study', () => {
  // Both sit exactly on the B cutoff — the most precarious place there is — but
  // one has nothing left to score on, so the hour cannot help it.
  const onTheEdge = { pct: 80, hasGrades: true, remainingCount: 1, remainingPossible: 100 };
  const settled = { pct: 80, hasGrades: true, remainingCount: 0, remainingPossible: 0 };

  const plan = studyPlan({
    entries: [
      entry('c1', 'Finished', { grade: settled }),
      entry('c2', 'Live', { grade: onTheEdge }),
    ],
    sessions: [],
    now: BASE,
  });

  assert.deepEqual(plan.map((p) => p.course.id), ['c2', 'c1']);
  assert.equal(plan[1].pressure.grade, 0); // nothing left to score on
  assert.equal(plan[0].pressure.grade, 1); // sitting on the cutoff with work left
  assert.ok(plan[1].reasons.some((r) => r.kind === 'settled'));
});

test('scores still out are not a reason to study, and are not called settled', () => {
  const waiting = {
    pct: 80,
    hasGrades: true,
    remainingCount: 0,
    remainingPossible: 0,
    pendingCount: 2,
    pendingPossible: 200,
  };

  const plan = studyPlan({
    entries: [entry('c1', 'Waiting', { grade: waiting })],
    sessions: [],
    now: BASE,
  });

  assert.equal(plan[0].pressure.grade, 0);
  assert.ok(plan[0].reasons.some((r) => r.kind === 'waiting'));
  assert.ok(!plan[0].reasons.some((r) => r.kind === 'settled'));
});

test('a course with no grades yet says so rather than being ranked as an A', () => {
  const plan = studyPlan({
    entries: [
      entry('c1', 'Week One', {
        grade: { pct: null, hasGrades: false, remainingCount: 4, remainingPossible: 400 },
      }),
    ],
    sessions: [],
    now: BASE,
  });

  assert.equal(plan[0].pressure.grade, 0);
  assert.ok(plan[0].reasons.some((r) => r.kind === 'no-grades'));
});

test('the reasons are the ones a person would give', () => {
  const exam = { ...work('midterm', 1 * DAY, { kind: 'test' }), course_id: 'c1' };
  const plan = studyPlan({
    entries: [entry('c1', 'Thermo', { assignments: [exam] })],
    sessions: [],
    now: BASE,
  });

  const kinds = plan[0].reasons.map((r) => r.kind);
  // exam tomorrow, six hours owed, nothing given to it yet
  assert.deepEqual(kinds, ['deadline', 'debt', 'untouched']);
  assert.equal(plan[0].reasons[1].minutes, 360);
});

test('a met target is said as met, not as a shortfall of zero', () => {
  const plan = studyPlan({
    entries: [entry('c1', 'Thermo')],
    sessions: weekOf({ c1: 400 }), // target is 360
    now: BASE,
  });

  const debt = plan[0].reasons.find((r) => r.kind === 'debt');
  const met = plan[0].reasons.find((r) => r.kind === 'met');
  assert.equal(debt, undefined);
  assert.equal(met.minutes, 400);
  assert.equal(plan[0].pressure.debt, 0);
});

test('a withdrawn course is not offered as somewhere to spend the evening', () => {
  const plan = studyPlan({
    entries: [
      { ...entry('c1', 'Dropped'), course: course('c1', 'Dropped', { status: 'withdrawn' }) },
      entry('c2', 'Math'),
    ],
    sessions: [],
    now: BASE,
  });
  assert.deepEqual(plan.map((p) => p.course.id), ['c2']);
});

// ------------------------------------------------------------ block lengths

test('with nothing next, the default block is offered and everything fits', () => {
  const { room, options, recommended } = blockOptions({ nowMinutes: 13 * 60 });
  assert.equal(room, null);
  assert.equal(recommended, 50);
  assert.ok(options.every((o) => o.fits));
});

test('a class at 2:00 rules out the 90 you were about to start at 1:20', () => {
  // 40 minutes to 2:00, less the 5-minute walk → 35 of room
  const { room, options, recommended } = blockOptions({
    nowMinutes: 13 * 60 + 20,
    nextStartMinutes: 14 * 60,
  });

  assert.equal(room, 35);
  assert.equal(recommended, 35); // the gap itself, offered because no preset fills it
  assert.deepEqual(
    options.map((o) => [o.minutes, o.fits]),
    [
      [25, true],
      [35, true],
      [50, false],
      [90, false],
    ],
  );
  assert.equal(options.find((o) => o.minutes === 35).kind, 'until-next');
});

test('when a preset exactly fills the gap it is not offered twice', () => {
  // 55 minutes out, less the buffer → exactly 50
  const { options, recommended } = blockOptions({ nowMinutes: 600, nextStartMinutes: 655 });
  assert.equal(recommended, 50);
  assert.equal(options.filter((o) => o.minutes === 50).length, 1);
});

test('eight minutes before class there is no honest block to recommend', () => {
  const { room, recommended, options } = blockOptions({ nowMinutes: 600, nextStartMinutes: 608 });
  assert.equal(room, 3);
  assert.equal(recommended, null);
  // The presets still come back — "I know, I'm skipping it" is a decision a
  // person is allowed to make — they are simply all marked as not fitting.
  assert.ok(options.every((o) => !o.fits));
});
