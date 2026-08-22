import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gradeCourse, neededOnRemaining, gpaFor, degreeProgress } from '../src/grading/engine.js';
import { letterFor, gradePoints, PLUS_MINUS_SCALE, scaleFor } from '../src/grading/scale.js';

// The grade is the one number in this app that a person will make decisions on:
// whether to keep studying, whether to drop, whether the A is still live. Every
// expected value below is computed by hand in the comment above it, so a failure
// tells you which rule broke rather than just that a number moved.

const cat = (id, name, weight, drop = 0) => ({
  id,
  name,
  weight_pct: weight,
  drop_lowest_n: drop,
});

const item = (id, categoryId, possible, earned = null, extra = {}) => ({
  id,
  category_id: categoryId,
  points_possible: possible,
  points_earned: earned,
  score_pct: null,
  ...extra,
});

const close = (actual, expected, tol = 1e-9) =>
  assert.ok(
    actual != null && Math.abs(actual - expected) < tol,
    `expected ${expected}, got ${actual}`,
  );

// ---------------------------------------------------------------- basics

test('a course with no graded work has no grade, not a zero', () => {
  const g = gradeCourse({
    categories: [cat('h', 'Homework', 100)],
    assignments: [item('a1', 'h', 100)],
  });
  assert.equal(g.hasGrades, false);
  assert.equal(g.pct, null);
  assert.equal(g.letter, null);
  assert.equal(g.remainingCount, 1);
  assert.equal(g.remainingPossible, 100);
});

test('one graded assignment in one category', () => {
  // 45/50 = 90%
  const g = gradeCourse({
    categories: [cat('h', 'Homework', 100)],
    assignments: [item('a1', 'h', 50, 45)],
  });
  close(g.pct, 90);
  assert.equal(g.letter, 'A');
});

test('a category is total points earned over total points possible', () => {
  // 9/10 on a quiz and 80/100 on an exam in one category:
  // points-based → 89/110 = 80.909…%, not the 85% a mean-of-percentages
  // would give.
  const g = gradeCourse({
    categories: [cat('h', 'Work', 100)],
    assignments: [item('q', 'h', 10, 9), item('e', 'h', 100, 80)],
  });
  close(g.pct, (89 / 110) * 100);
  assert.equal(g.letter, 'B');
});

test('weights re-normalize across only the categories that have grades', () => {
  // Homework 20% at 95%, Final 80% with nothing graded.
  // Counted weight is 20, so the grade is 95% — not 19%.
  const g = gradeCourse({
    categories: [cat('h', 'Homework', 20), cat('f', 'Final', 80)],
    assignments: [item('a1', 'h', 100, 95), item('a2', 'f', 200)],
  });
  close(g.pct, 95);
  assert.equal(g.countedWeight, 20);
  assert.equal(g.letter, 'A');
});

test('two graded categories combine by weight', () => {
  // HW 40% at 100%, Exams 60% at 80% → 0.4(100) + 0.6(80) = 88
  const g = gradeCourse({
    categories: [cat('h', 'Homework', 40), cat('e', 'Exams', 60)],
    assignments: [item('a1', 'h', 50, 50), item('a2', 'e', 100, 80)],
  });
  close(g.pct, 88);
  assert.equal(g.countedWeight, 100);
});

test('a scheme whose weights do not sum to 100 still grades, and reports the sum', () => {
  // 30 + 30 = 60 configured. Both graded, so re-normalizing over 60:
  // (30*80 + 30*90)/60 = 85
  const g = gradeCourse({
    categories: [cat('a', 'A', 30), cat('b', 'B', 30)],
    assignments: [item('a1', 'a', 100, 80), item('a2', 'b', 100, 90)],
  });
  close(g.pct, 85);
  assert.equal(g.weightsSum, 60);
});

// ------------------------------------------------------------ score sources

test('a direct percentage overrides a point score', () => {
  const g = gradeCourse({
    categories: [cat('h', 'Work', 100)],
    assignments: [item('a1', 'h', 100, 50, { score_pct: 87 })],
  });
  close(g.pct, 87);
});

test('a zero-point assignment is never treated as graded', () => {
  // An ungraded 0-pointer must not switch the category on at 0%.
  const g = gradeCourse({
    categories: [cat('h', 'Work', 100)],
    assignments: [item('a1', 'h', 0, 0)],
  });
  assert.equal(g.hasGrades, false);
  assert.equal(g.remainingCount, 0);
});

test('a genuine zero counts as a graded zero', () => {
  const g = gradeCourse({
    categories: [cat('h', 'Work', 100)],
    assignments: [item('a1', 'h', 100, 0), item('a2', 'h', 100, 100)],
  });
  close(g.pct, 50);
});

test('assignments with no category sit outside the grade and are counted', () => {
  const g = gradeCourse({
    categories: [cat('h', 'Work', 100)],
    assignments: [item('a1', 'h', 100, 90), item('a2', null, 100, 10)],
  });
  close(g.pct, 90);
  assert.equal(g.uncategorizedCount, 1);
});

// --------------------------------------------------------------- drop lowest

test('drop-lowest removes the worst percentage, not the fewest points', () => {
  // Quizzes: 5/10 (50%), 90/100 (90%), 8/10 (80%), drop 1.
  // By percentage the 50% goes → (90+8)/(100+10) = 89.09…%
  // (By raw points it would have dropped the 8, giving a very different 86.4%.)
  const g = gradeCourse({
    categories: [cat('q', 'Quizzes', 100, 1)],
    assignments: [item('q1', 'q', 10, 5), item('q2', 'q', 100, 90), item('q3', 'q', 10, 8)],
  });
  close(g.pct, (98 / 110) * 100);
  assert.deepEqual(g.categories[0].droppedKeys, ['q1']);
});

test('drop-lowest never empties a category', () => {
  // "Drop your lowest two" with only two quizzes graded: keep the better one
  // rather than blanking the category out of the grade entirely.
  const g = gradeCourse({
    categories: [cat('q', 'Quizzes', 100, 2)],
    assignments: [item('q1', 'q', 100, 60), item('q2', 'q', 100, 90)],
  });
  close(g.pct, 90);
  assert.equal(g.categories[0].droppedKeys.length, 1);
});

// --------------------------------------------------------------- what-if

test('overrides feed the same math as real scores', () => {
  // HW 50% at 100%, Final 50% ungraded. Pretend the final comes back at 70:
  // 0.5(100) + 0.5(70) = 85
  const model = {
    categories: [cat('h', 'Homework', 50), cat('f', 'Final', 50)],
    assignments: [item('a1', 'h', 100, 100), item('a2', 'f', 100)],
  };
  assert.equal(gradeCourse(model).pct, 100); // final not counted yet
  close(gradeCourse({ ...model, overrides: { a2: 70 } }).pct, 85);
});

test('an override can also replace a score that already exists', () => {
  const model = {
    categories: [cat('h', 'Work', 100)],
    assignments: [item('a1', 'h', 100, 60)],
  };
  close(gradeCourse(model).pct, 60);
  close(gradeCourse({ ...model, overrides: { a1: 95 } }).pct, 95);
});

// --------------------------------------------------------------- the solver

test('needed score on remaining work, solved exactly', () => {
  // HW 40% with 90/100 graded; Final 60% worth 200 points, ungraded.
  // Projected at fraction x: 0.4(90) + 0.6(100x) = 36 + 60x
  // Target 90 → 60x = 54 → x = 0.9 → 90.0%
  const r = neededOnRemaining(
    {
      categories: [cat('h', 'Homework', 40), cat('f', 'Final', 60)],
      assignments: [item('a1', 'h', 100, 90), item('a2', 'f', 200)],
    },
    90,
  );
  assert.equal(r.status, 'reachable');
  assert.equal(r.needed, 90);
  close(r.floor, 36); // bomb the final
  close(r.ceiling, 96); // ace the final
});

test('the solver reports a target already locked in', () => {
  // HW 50% at 100%, Final 50% worth 100 ungraded. Target 70.
  // Floor (zero on the final) = 0.5(100) + 0.5(0) = 50 → not locked.
  // Target 40 instead: floor 50 >= 40 → locked, needed 0.
  const model = {
    categories: [cat('h', 'Homework', 50), cat('f', 'Final', 50)],
    assignments: [item('a1', 'h', 100, 100), item('a2', 'f', 100)],
  };
  assert.equal(neededOnRemaining(model, 40).status, 'locked');
  assert.equal(neededOnRemaining(model, 40).needed, 0);
  assert.equal(neededOnRemaining(model, 70).status, 'reachable');
});

test('an unreachable target says how unreachable', () => {
  // HW 50% at 40%, Final 50% ungraded. Ceiling = 0.5(40) + 0.5(100) = 70.
  // Target 90 needs 140% on the final — reported as a stretch number, not a
  // shrug, so you can see the gap.
  const r = neededOnRemaining(
    {
      categories: [cat('h', 'Homework', 50), cat('f', 'Final', 50)],
      assignments: [item('a1', 'h', 100, 40), item('a2', 'f', 100)],
    },
    90,
  );
  assert.equal(r.status, 'stretch');
  assert.equal(r.needed, 140);
  close(r.ceiling, 70);
});

test('with nothing left to grade, the answer is the grade you have', () => {
  const model = { categories: [cat('h', 'Homework', 100)], assignments: [item('a1', 'h', 100, 70)] };

  const missed = neededOnRemaining(model, 90);
  assert.equal(missed.status, 'no-remaining');
  assert.equal(missed.needed, null);
  assert.equal(missed.met, false);

  const made = neededOnRemaining(model, 70);
  assert.equal(made.status, 'no-remaining');
  assert.equal(made.met, true);
});

test('a target out of reach even at a perfect score is impossible', () => {
  // Homework 90% is worth 90 of the 100 weight and is fully graded at 50%.
  // The 10%-weight final can contribute at most 10 → ceiling 0.9(50) + 0.1(100)
  // = 55, and even the 300% the solver searches to only reaches 75. Nothing
  // gets this to 90.
  const r = neededOnRemaining(
    {
      categories: [cat('h', 'Homework', 90), cat('f', 'Final', 10)],
      assignments: [item('a1', 'h', 100, 50), item('a2', 'f', 100)],
    },
    90,
  );
  assert.equal(r.status, 'impossible');
  assert.equal(r.needed, null);
  close(r.ceiling, 55);
});

test('the solver respects drop-lowest — the reason it bisects', () => {
  // Quizzes 100%, drop lowest 1. Graded: 50/100. Remaining: two 100-pointers.
  //
  // At x below 50% the graded 50 survives and one projected score is dropped:
  //   kept = {50, 100x} → (50 + 100x) / 200
  // At x above 50% the graded 50 is the one dropped:
  //   kept = {100x, 100x} → 100x
  // Target 80 lands in the second regime → x = 0.8 → 80.0%
  const r = neededOnRemaining(
    {
      categories: [cat('q', 'Quizzes', 100, 1)],
      assignments: [item('q1', 'q', 100, 50), item('q2', 'q', 100), item('q3', 'q', 100)],
    },
    80,
  );
  assert.equal(r.status, 'reachable');
  assert.equal(r.needed, 80);
});

test('the solver rounds up, never down', () => {
  // HW 30% at 100%, Final 70% ungraded. Target 85:
  // 30 + 70x = 85 → x = 55/70 = 0.785714… → 78.6% (not 78.5)
  const r = neededOnRemaining(
    {
      categories: [cat('h', 'Homework', 30), cat('f', 'Final', 70)],
      assignments: [item('a1', 'h', 100, 100), item('a2', 'f', 100)],
    },
    85,
  );
  assert.equal(r.needed, 78.6);
});

// ------------------------------------------------------------------- scales

test('the default scale is straight ten-point cutoffs', () => {
  assert.equal(letterFor(90), 'A');
  assert.equal(letterFor(89.99), 'B');
  assert.equal(letterFor(60), 'D');
  assert.equal(letterFor(59.9), 'F');
  assert.equal(letterFor(null), null);
});

test('a per-course override can grade on plus/minus', () => {
  assert.equal(letterFor(91, PLUS_MINUS_SCALE), 'A-');
  assert.equal(letterFor(93, PLUS_MINUS_SCALE), 'A');
  assert.equal(letterFor(87.5, PLUS_MINUS_SCALE), 'B+');
});

test('stored override rows become a scale, in any row order', () => {
  const scale = scaleFor([
    { letter: 'B', min_pct: 80 },
    { letter: 'F', min_pct: 0 },
    { letter: 'A', min_pct: 88 },
  ]);
  assert.equal(letterFor(89, scale), 'A');
  assert.equal(letterFor(85, scale), 'B');
  assert.equal(letterFor(20, scale), 'F');
  // No rows at all falls back to the default rather than grading everything F.
  assert.equal(letterFor(95, scaleFor([])), 'A');
});

// --------------------------------------------------------------------- GPA

test('GPA is credit-weighted on a straight 4.0 scale', () => {
  // A in 4 credits, B in 3, C in 3 → (16 + 9 + 6) / 10 = 3.1
  const r = gpaFor([
    { creditHours: 4, letter: 'A' },
    { creditHours: 3, letter: 'B' },
    { creditHours: 3, letter: 'C' },
  ]);
  close(r.gpa, 3.1);
  assert.equal(r.credits, 10);
  assert.equal(r.counted, 3);
});

test('plus/minus letters carry no GPA weight', () => {
  assert.equal(gradePoints('A-'), 4);
  assert.equal(gradePoints('B+'), 3);
  assert.equal(gradePoints('F'), 0);
});

test('courses with no grade yet are left out of GPA, not counted as zero', () => {
  const r = gpaFor([
    { creditHours: 3, letter: 'A' },
    { creditHours: 3, letter: null },
  ]);
  close(r.gpa, 4);
  assert.equal(r.credits, 3);
  assert.equal(r.ungraded, 1);
});

// ------------------------------------------------- prior semesters

test('prior semesters join the same weighted average', () => {
  // Tracked: one 3-credit A = 12 quality points over 3 credits.
  // Prior:   45 credits at 3.2 = 144 quality points.
  // Together: 156 / 48 = 3.25
  const g = gpaFor([{ creditHours: 3, letter: 'A' }], [{ creditHours: 45, gpa: 3.2 }]);
  close(g.gpa, 3.25);
  close(g.credits, 48);
  close(g.priorCredits, 45);
});

test('the tracked-only GPA survives alongside the combined one', () => {
  // The whole point of keeping `live` separate: this term is a 4.0 even though
  // the cumulative it feeds is dragged to 2.4 by what came before.
  const g = gpaFor([{ creditHours: 3, letter: 'A' }], [{ creditHours: 12, gpa: 2.0 }]);
  close(g.live.gpa, 4);
  close(g.live.credits, 3);
  close(g.gpa, (12 + 24) / 15);
});

test('a lump prior row and its per-semester breakdown give the same GPA', () => {
  // 15 cr at 3.0 (45 pts) + 15 cr at 3.6 (54 pts) = 99 / 30 = 3.3, which is
  // exactly one 30-credit row at 3.3. This is the promise the settings panel
  // makes when it says "one row or many, it comes out the same".
  const split = gpaFor([], [
    { creditHours: 15, gpa: 3.0 },
    { creditHours: 15, gpa: 3.6 },
  ]);
  const lump = gpaFor([], [{ creditHours: 30, gpa: 3.3 }]);
  close(split.gpa, 3.3);
  close(lump.gpa, 3.3);
});

test('prior rows with no credits or no GPA cannot move the average', () => {
  const g = gpaFor([{ creditHours: 3, letter: 'B' }], [
    { creditHours: 0, gpa: 4 },
    { creditHours: 10, gpa: null },
  ]);
  close(g.gpa, 3);
  close(g.priorCredits, 0);
});

test('with no tracked courses the cumulative GPA is the transcript', () => {
  const g = gpaFor([], [{ creditHours: 62, gpa: 3.47 }]);
  close(g.gpa, 3.47);
  assert.equal(g.counted, 0);
});

// ------------------------------------------------------ degree progress

test('degree progress separates banked credits from this term', () => {
  // 45 prior + 15 finished = 60 earned of 128 = 46.875%
  // plus 16 in progress → 76 projected = 59.375%
  const d = degreeProgress({
    creditsRequired: 128,
    priorCredits: 45,
    doneCredits: 15,
    inProgressCredits: 16,
  });
  close(d.earned, 60);
  close(d.projected, 76);
  close(d.pct, 46.875);
  close(d.pctWithInProgress, 59.375);
  close(d.remaining, 52);
});

test('semesters left is estimated from the load you are actually carrying', () => {
  // 40 credits left at the 12 you're taking = 3.33… → 4 semesters, rounded up
  // because two-and-a-bit semesters is three.
  const light = degreeProgress({
    creditsRequired: 100,
    priorCredits: 48,
    doneCredits: 0,
    inProgressCredits: 12,
  });
  assert.equal(light.remaining, 40);
  assert.equal(light.semestersLeft, 4);

  // With nothing in progress there's no personal load to read, so it falls back
  // to a normal one: 40 / 15 → 3.
  const idle = degreeProgress({ creditsRequired: 100, priorCredits: 60, doneCredits: 0 });
  assert.equal(idle.semestersLeft, 3);
});

test('a finished degree has nothing remaining and no semesters left', () => {
  const d = degreeProgress({ creditsRequired: 120, priorCredits: 120 });
  close(d.pct, 100);
  assert.equal(d.remaining, 0);
  assert.equal(d.semestersLeft, 0);
});

test('overshooting the requirement caps the bar rather than passing 100%', () => {
  // Extra credits are real and worth counting in `earned`, but a bar that fills
  // past its own track is a rendering bug, not a triumph.
  const d = degreeProgress({ creditsRequired: 120, priorCredits: 132 });
  close(d.earned, 132);
  close(d.pct, 100);
  close(d.share.earned, 100);
  close(d.share.inProgress, 0);
});

test('the two bar segments never sum past the whole', () => {
  // 110 earned of 120 leaves room for 10; a 16-credit term must not draw 16.
  const d = degreeProgress({ creditsRequired: 120, priorCredits: 110, inProgressCredits: 16 });
  assert.ok(d.share.earned + d.share.inProgress <= 100 + 1e-9);
});
