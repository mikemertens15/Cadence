// Extension-explicit so this module also loads under plain `node --test`,
// which doesn't do Vite's extensionless resolution. The grade math is the part
// most worth testing outside a browser.
import { DEFAULT_SCALE, letterFor, gradePoints } from './scale.js';

// The grade math. Pure functions over plain rows — no React, no Supabase — so
// the numbers a student is going to trust can be tested directly, and so the
// what-if simulator and the needed-score solver run the *same* code path as the
// live grade rather than a parallel approximation of it.
//
// Three rules decide everything below, and they're the ones a professor's
// syllabus states:
//
//   1. A category's percentage is total points earned over total points
//      possible within it — not the mean of the per-assignment percentages.
//      Those agree when every item is worth the same, and where they disagree
//      (a 10-point quiz next to a 100-point exam) points-based is what
//      gradebooks do and what the syllabus means.
//   2. Only categories that contain at least one graded item count toward the
//      overall grade, and their weights re-normalize to fill the gap. In week
//      two, "92% on homework" means your grade is 92% — not 18.4% of a
//      semester you haven't taken yet.
//   3. Drop-lowest is applied to whatever is actually graded right now.

// ---------------------------------------------------------------- primitives

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const sum = (xs, f) => xs.reduce((t, x) => t + f(x), 0);

// Resolve one assignment to the {earned, possible} pair the math needs, or null
// when it has no score yet.
//
// Precedence is override → score_pct → points_earned. `score_pct` is the escape
// hatch for a professor who hands back "87%" with no point total; it wins over
// points_earned because if both are set, the percentage is the later, more
// deliberate entry.
//
// Zero-point rows are treated as ungradeable rather than graded-at-0: they can't
// move a points-based average in either direction, and counting one as "graded"
// would switch a whole category on with no evidence behind it.
function scoreOf(a, override) {
  const possible = num(a.points_possible) ?? 0;
  if (!(possible > 0)) return null;

  if (override != null) return { earned: (override / 100) * possible, possible };

  const pct = num(a.score_pct);
  if (pct != null) return { earned: (pct / 100) * possible, possible };

  const earned = num(a.points_earned);
  if (earned != null) return { earned, possible };

  return null;
}

export const isGraded = (a, overrides = {}) => scoreOf(a, num(overrides[a.id])) != null;

// Drop the N lowest scores in a category, by percentage.
//
// Two decisions worth naming. Dropping by *percentage* rather than by raw points
// is what a student expects — "my worst quiz" means the one you did worst on,
// not the one that happened to be out of fewer points. And at least one score
// always survives: a syllabus that says "drop your lowest two" alongside only
// two graded quizzes would otherwise blank the category out of your grade
// entirely, so your average would lurch the moment a third quiz landed. Keeping
// one is stable, explicable, and converges on the true rule once the term fills
// in — by finals, N is always smaller than the number of items anyway.
function applyDrops(items, dropLowestN) {
  const n = num(dropLowestN) ?? 0;
  if (!(n > 0) || items.length <= 1) return { kept: items, dropped: [] };

  const count = Math.min(Math.floor(n), items.length - 1);
  const ranked = [...items].sort((a, b) => {
    const d = a.earned / a.possible - b.earned / b.possible;
    // Stable tiebreak, so two identical scores don't swap which one is shown as
    // dropped every time the list re-renders.
    return d !== 0 ? d : String(a.key).localeCompare(String(b.key));
  });

  const dropped = ranked.slice(0, count);
  const droppedKeys = new Set(dropped.map((d) => d.key));
  return { kept: items.filter((i) => !droppedKeys.has(i.key)), dropped };
}

// The weighted roll-up shared by the live grade and every projection.
function summarize(categories, itemsByCat) {
  let weightedSum = 0;
  let countedWeight = 0;

  const cats = categories.map((c) => {
    const weight = num(c.weight_pct) ?? 0;
    const items = itemsByCat.get(c.id) ?? [];
    const { kept, dropped } = applyDrops(items, c.drop_lowest_n);

    const earned = sum(kept, (i) => i.earned);
    const possible = sum(kept, (i) => i.possible);
    const pct = possible > 0 ? (earned / possible) * 100 : null;

    if (pct != null) {
      weightedSum += weight * pct;
      countedWeight += weight;
    }

    return {
      id: c.id,
      name: c.name,
      weight,
      dropLowestN: num(c.drop_lowest_n) ?? 0,
      pct,
      earned,
      possible,
      gradedCount: items.length,
      droppedKeys: dropped.map((d) => d.key),
    };
  });

  // Rule 2: divide by the weight actually in play, not by 100.
  const pct = countedWeight > 0 ? weightedSum / countedWeight : null;
  return { pct, cats, countedWeight };
}

// --------------------------------------------------------------- live grade

/**
 * The current standing in one course.
 *
 * `overrides` maps assignment id → hypothetical percentage (0–100), which is
 * how the what-if simulator works: it doesn't have its own math, it just calls
 * this with a few pretend scores in hand.
 */
export function gradeCourse({ categories = [], assignments = [], overrides = {}, scale = DEFAULT_SCALE }) {
  const known = new Set(categories.map((c) => c.id));

  const itemsByCat = new Map();
  const remainingByCat = new Map();
  // Assignments with no category (or one that was deleted out from under them)
  // can't be weighted, so they sit outside the grade — surfaced as a count so
  // the UI can say so rather than silently dropping them.
  const uncategorized = [];

  for (const a of assignments) {
    const inCategory = a.category_id && known.has(a.category_id);
    const score = scoreOf(a, num(overrides[a.id]));

    if (!inCategory) {
      uncategorized.push(a);
      continue;
    }
    if (score) {
      const list = itemsByCat.get(a.category_id) ?? [];
      list.push({ key: a.id, ...score });
      itemsByCat.set(a.category_id, list);
    } else {
      const possible = num(a.points_possible) ?? 0;
      if (possible > 0) {
        const list = remainingByCat.get(a.category_id) ?? [];
        list.push({ key: a.id, possible });
        remainingByCat.set(a.category_id, list);
      }
    }
  }

  const { pct, cats, countedWeight } = summarize(categories, itemsByCat);

  const categoriesOut = cats.map((c) => {
    const remaining = remainingByCat.get(c.id) ?? [];
    return {
      ...c,
      remainingCount: remaining.length,
      remainingPossible: sum(remaining, (r) => r.possible),
    };
  });

  return {
    hasGrades: pct != null,
    pct,
    letter: letterFor(pct, scale),
    categories: categoriesOut,
    countedWeight,
    // Sum of every configured weight, so the UI can flag a scheme that doesn't
    // add to 100 — a typo here quietly skews the whole term.
    weightsSum: sum(categories, (c) => num(c.weight_pct) ?? 0),
    uncategorizedCount: uncategorized.length,
    remainingCount: sum(categoriesOut, (c) => c.remainingCount),
    remainingPossible: sum(categoriesOut, (c) => c.remainingPossible),
  };
}

// ---------------------------------------------------------------- forecasting

// The overall percentage if every still-ungraded assignment came back at the
// same fraction `frac` (1 = 100%). Runs the real summarize(), so drop-lowest
// rules and weight re-normalization apply to the projected term exactly as they
// will to the real one.
function projectAt({ categories, assignments, overrides, frac }) {
  const known = new Set(categories.map((c) => c.id));
  const itemsByCat = new Map();

  for (const a of assignments) {
    if (!a.category_id || !known.has(a.category_id)) continue;

    const possible = num(a.points_possible) ?? 0;
    if (!(possible > 0)) continue;

    const score = scoreOf(a, num(overrides[a.id]));
    const item = score
      ? { key: a.id, ...score }
      : { key: a.id, earned: frac * possible, possible };

    const list = itemsByCat.get(a.category_id) ?? [];
    list.push(item);
    itemsByCat.set(a.category_id, list);
  }

  return summarize(categories, itemsByCat).pct;
}

/**
 * "What do I need on everything left to finish with an X?"
 *
 * Solved by bisection rather than algebra. The closed form looks tractable until
 * drop-lowest enters it: which assignments get dropped depends on the very score
 * you're solving for, so the relationship between "score on remaining work" and
 * "final grade" is piecewise, with a kink at every point a projected score
 * crosses a real one. It is, however, monotonic — scoring higher on the work
 * ahead can never lower your final grade — and monotonic is all bisection needs.
 * Fifty iterations pin it to well under a thousandth of a percent, and each one
 * costs a single pass over the assignment list.
 *
 * Returns the needed average as a percentage, along with the two numbers that
 * frame it: where you land if you bomb everything left, and where you land if
 * you ace it.
 */
export function neededOnRemaining(
  { categories = [], assignments = [], overrides = {}, scale = DEFAULT_SCALE },
  targetPct,
) {
  const target = num(targetPct);
  const known = new Set(categories.map((c) => c.id));

  const remaining = assignments.filter(
    (a) =>
      a.category_id &&
      known.has(a.category_id) &&
      (num(a.points_possible) ?? 0) > 0 &&
      scoreOf(a, num(overrides[a.id])) == null,
  );

  const at = (frac) => projectAt({ categories, assignments, overrides, frac });
  const floor = at(0); // bomb everything left
  const ceiling = at(1); // ace everything left
  const base = {
    target,
    floor,
    ceiling,
    floorLetter: letterFor(floor, scale),
    ceilingLetter: letterFor(ceiling, scale),
    remainingCount: remaining.length,
    remainingPossible: sum(remaining, (a) => num(a.points_possible) ?? 0),
  };

  if (target == null) return { ...base, status: 'no-target', needed: null };

  // Nothing left to score on: the grade is what it is.
  if (!remaining.length) {
    return {
      ...base,
      status: 'no-remaining',
      needed: null,
      met: floor != null && floor >= target,
    };
  }

  // Already there even if every remaining assignment scores zero.
  if (floor != null && floor >= target) return { ...base, status: 'locked', needed: 0 };

  // Search past 100% so an out-of-reach target reports *how* out of reach it is
  // ("you'd need 118%") instead of a bare "impossible" — that number is what
  // tells you whether to chase the A or protect the B.
  const MAX = 3;
  if (at(MAX) < target) return { ...base, status: 'impossible', needed: null };

  let lo = 0;
  let hi = MAX;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= target) hi = mid;
    else lo = mid;
  }

  // Round *up*: this is a minimum, and a needed 89.97 reported as 89.9 would be
  // a wrong answer in the one direction that costs you the grade.
  //
  // The epsilon absorbs bisection's own error. `hi` converges from above, so an
  // exact answer of 90 arrives as 90.000000000000003 — and a bare ceil would
  // turn that into "you need 90.1%", which is both wrong and maddening.
  const needed = Math.ceil(hi * 1000 - 1e-6) / 10;

  return {
    ...base,
    status: needed <= 100 ? 'reachable' : 'stretch',
    needed,
  };
}

// ------------------------------------------------------------------ GPA

/**
 * Weighted GPA across courses.
 *
 * Each entry is { creditHours, letter }; courses with no letter yet (no graded
 * work) are skipped rather than counted as zero, and reported back as `ungraded`
 * so the UI can say what the number is missing.
 *
 * `priors` are semesters that happened before this app did — { creditHours, gpa }
 * straight off a transcript. They enter the same weighted average as everything
 * else, because that is exactly what a registrar does: quality points over
 * attempted hours, no matter which term they came from. Without them a
 * "cumulative" GPA built from one tracked semester is not cumulative at all, and
 * a sophomore's real 3.2 would read as whatever this term happens to be doing.
 *
 * They're kept separate in the return value rather than folded in silently, so
 * the UI can show its work — "3.31 over 74 credits, 45 of them from before".
 */
export function gpaFor(entries = [], priors = []) {
  let points = 0;
  let credits = 0;
  let counted = 0;
  let ungraded = 0;

  for (const e of entries) {
    const hours = num(e.creditHours) ?? 0;
    const gp = gradePoints(e.letter);
    if (gp == null || hours <= 0) {
      ungraded += 1;
      continue;
    }
    points += gp * hours;
    credits += hours;
    counted += 1;
  }

  const live = { gpa: credits > 0 ? points / credits : null, credits, counted };

  let priorPoints = 0;
  let priorCredits = 0;
  for (const p of priors) {
    const hours = num(p.creditHours) ?? 0;
    const gpa = num(p.gpa);
    // A zero-credit line carries no weight and a missing GPA has nothing to
    // weight, so neither can move the average — skipping beats contributing 0.
    if (gpa == null || hours <= 0) continue;
    priorPoints += gpa * hours;
    priorCredits += hours;
  }

  const totalPoints = points + priorPoints;
  const totalCredits = credits + priorCredits;

  return {
    gpa: totalCredits > 0 ? totalPoints / totalCredits : null,
    credits: totalCredits,
    counted,
    ungraded,
    priorCredits,
    // What the tracked semesters alone say, which is the honest answer to "how
    // is it going *now*" once history is in the mix and barely moves.
    live,
  };
}

// -------------------------------------------------------------- the degree

// A typical full-time load, used only to turn "42 credits left" into "about
// three more semesters". Stated once here rather than inline so the assumption
// behind that sentence is findable.
export const TYPICAL_LOAD = 15;

/**
 * How far through a degree you are, in credits.
 *
 * Deliberately a credit count and nothing else. A real audit asks whether *this*
 * course satisfies *that* requirement, which needs a catalog, changes by
 * catalog year, and is wrong in ways a student can't check — DegreeWorks exists
 * and this isn't it. Credits toward a total is the part everyone already knows
 * off the top of their head, and it's enough to draw a bar that moves twice a
 * year.
 *
 * The three-way split is the point. Credits you've banked are yours; credits
 * you're sitting in right now are not, and rolling them together would quietly
 * inflate the number every January and August. `pctWithInProgress` is where the
 * bar reaches if this term finishes — the motivating number, kept visibly
 * separate from the earned one.
 */
export function degreeProgress({
  creditsRequired = 120,
  priorCredits = 0,
  doneCredits = 0,
  inProgressCredits = 0,
} = {}) {
  const required = Math.max(0, num(creditsRequired) ?? 0);
  const prior = Math.max(0, num(priorCredits) ?? 0);
  const done = Math.max(0, num(doneCredits) ?? 0);
  const inProgress = Math.max(0, num(inProgressCredits) ?? 0);

  const earned = prior + done;
  const projected = earned + inProgress;
  const remaining = Math.max(0, required - projected);

  const pct = required > 0 ? Math.min(100, (earned / required) * 100) : null;
  const pctWithInProgress = required > 0 ? Math.min(100, (projected / required) * 100) : null;

  // Estimated from what you're actually carrying this term when there is one —
  // a 12-credit student shouldn't be told they'll finish on someone else's
  // schedule. Rounded up, because two-and-a-bit semesters is three semesters.
  const load = inProgress > 0 ? inProgress : TYPICAL_LOAD;
  const semestersLeft = remaining > 0 ? Math.ceil(remaining / load) : 0;

  return {
    required,
    prior,
    done,
    earned,
    inProgress,
    projected,
    remaining,
    pct,
    pctWithInProgress,
    semestersLeft,
    // The bar has three segments and they have to add to the whole, so the
    // widths are computed here rather than three times in the markup.
    share: required > 0
      ? {
          earned: Math.min(100, (earned / required) * 100),
          inProgress: Math.min(100 - Math.min(100, (earned / required) * 100), (inProgress / required) * 100),
        }
      : { earned: 0, inProgress: 0 },
  };
}
