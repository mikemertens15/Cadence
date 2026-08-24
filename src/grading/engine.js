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
  // Work the course doesn't grade at all: the problem sets a professor hands out
  // "for your own benefit" and never collects. Held separately from the
  // uncategorized pile because the two look identical from here and mean
  // opposite things — one is a gap in the data worth nagging about, the other is
  // a fact about the course and nothing to fix.
  const notCounted = [];

  for (const a of assignments) {
    if (a.counts_toward_grade === false) {
      notCounted.push(a);
      continue;
    }

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
    notCountedCount: notCounted.length,
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
    if (a.counts_toward_grade === false) continue;
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
      a.counts_toward_grade !== false &&
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

// ------------------------------------------------- what a course actually earns

/**
 * Whether a course produces credit, grade points, both, or neither.
 *
 * One place decides this because it is asked from three directions — the GPA,
 * the degree bar, and the credit ledger — and three copies of the rule would be
 * three chances for your transcript and your progress bar to disagree.
 *
 * The rules, and none of them are this app's invention:
 *
 *   graded, enrolled   credit and grade points. The ordinary case.
 *   pass_fail          credit, no grade points. Passing a pass/fail course
 *                      advances the degree and leaves the GPA untouched, which
 *                      is the entire reason anyone takes one.
 *   audit              neither. You were in the room; the registrar was not.
 *   withdrawn          neither. A W is not an F — scoring the 41% you were
 *                      carrying when you dropped would be the most misleading
 *                      number this app is capable of showing.
 *   incomplete         credit pending, no grade points yet. Left out of the GPA
 *                      the same way an ungraded course is, because that is what
 *                      it is: a grade that has not arrived.
 *
 * Reads the database column names, with the defaults applied here rather than at
 * every call site — rows written before 0003 have neither column.
 */
export function courseStanding(course = {}) {
  const basis = course.grading_basis ?? 'graded';
  const status = course.status ?? 'enrolled';

  if (status === 'withdrawn') return { earnsCredit: false, earnsGradePoints: false, why: 'withdrawn' };
  if (basis === 'audit') return { earnsCredit: false, earnsGradePoints: false, why: 'audit' };
  if (basis === 'pass_fail') return { earnsCredit: true, earnsGradePoints: false, why: 'pass_fail' };
  if (status === 'incomplete') return { earnsCredit: true, earnsGradePoints: false, why: 'incomplete' };
  return { earnsCredit: true, earnsGradePoints: true, why: null };
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
  let excluded = 0;

  for (const e of entries) {
    const hours = num(e.creditHours) ?? 0;

    // A pass/fail lab, an audited seminar and a course you withdrew from are
    // not courses "with no grade yet" — they will never have one, and lumping
    // them in with the ungraded pile would have the UI promising a number that
    // is never coming. Counted apart so it can say which is which.
    if (!courseStanding(e).earnsGradePoints) {
      excluded += 1;
      continue;
    }

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
    excluded,
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

// ----------------------------------------------------------- credit ledger

/**
 * Where every credit you have taken actually goes.
 *
 * The question this answers is the one a single degree total cannot: you have
 * 169 credits and the degree takes 120, and the interesting part is not the
 * 49 — it's that 120 of them are the engineering degree, 31 are a second one,
 * 12 are graduate hours and six were a class about film noir.
 *
 * Credits can belong to more than one program and usually some belong to none:
 *
 *   shared     Calculus I counts toward both degrees. It is one course, one
 *              grade and three credits, and it advances two bars. The program
 *              totals therefore sum to *more* than `total`, which is correct
 *              and is exactly why `shared` is reported rather than left for
 *              someone to discover as an inconsistency.
 *   unapplied  the classes you took because they looked interesting. Real
 *              credits with a real grade in the real GPA — just not pointed at
 *              anything with a finish line.
 *
 * `entries` are pre-shaped by the app layer:
 *   { credits, programIds, state: 'earned' | 'inProgress' | 'future', earnsCredit }
 */
export function summarizeCredits({ entries = [], programs = [] } = {}) {
  const byProgram = new Map(programs.map((p) => [p.id, { earned: 0, inProgress: 0 }]));

  let earned = 0;
  let inProgress = 0;
  let applied = 0;
  let unapplied = 0;
  let shared = 0;
  // Audited and withdrawn hours. Not credits — but they were real semesters of
  // your life, and a ledger that silently omits them invites the question "why
  // doesn't this match my transcript".
  let noCredit = 0;

  for (const e of entries) {
    const credits = Math.max(0, num(e.credits) ?? 0);
    if (!(credits > 0)) continue;

    // Registered-for is not carrying: a term that hasn't started counts toward
    // nothing yet, the same rule the degree bar has always used.
    const state = e.state === 'inProgress' ? 'inProgress' : e.state === 'future' ? 'future' : 'earned';
    if (state === 'future') continue;

    if (e.earnsCredit === false) {
      noCredit += credits;
      continue;
    }

    // Ids pointing at a program that no longer exists are dropped rather than
    // counted into a bar nothing draws.
    const ids = [...new Set(e.programIds ?? [])].filter((id) => byProgram.has(id));

    if (state === 'earned') earned += credits;
    else inProgress += credits;

    if (!ids.length) {
      unapplied += credits;
      continue;
    }

    applied += credits;
    if (ids.length > 1) shared += credits;
    for (const id of ids) byProgram.get(id)[state] += credits;
  }

  return {
    total: earned + inProgress,
    earned,
    inProgress,
    applied,
    unapplied,
    shared,
    noCredit,
    byProgram,
  };
}

// ------------------------------------------------------- the term as a whole

// The lowest letter on a given scale worth at least `points` grade points. On a
// straight scale that's "B" for 3; on a plus/minus scale it's "B-", which is a
// materially easier target and the one a student should be told about.
function lowestLetterWorth(points, scale) {
  let best = null;
  for (const row of scale) {
    const gp = gradePoints(row.letter);
    if (gp == null || gp < points) continue;
    if (!best || row.min < best.min) best = row;
  }
  return best;
}

/**
 * "I need a 3.5 this term — what does that mean for each class?"
 *
 * The per-course solver answers "what do I need on the work left in *this*
 * course". This is the question one level up, and it is genuinely a different
 * one: a term GPA is a single number produced by five courses at once, and
 * there are many combinations of letters that reach it.
 *
 * Rather than pick one combination and present it as *the* answer, each course
 * is solved on the same honest assumption: **everything else lands where it
 * stands today**. That makes each line independently checkable — "if the others
 * hold, Heat Transfer has to be a B" — instead of a plan that quietly falls
 * apart the moment one number moves.
 *
 * Only courses that produce grade points are in it. A pass/fail lab cannot help
 * or hurt a GPA target, and listing it with a required letter would be inventing
 * a requirement that does not exist.
 *
 * `entries`: { id, creditHours, letter, scale, ...course row }
 */
export function termGpaPlan(entries = [], targetGpa) {
  const target = num(targetGpa);
  const counted = entries.filter(
    (e) => courseStanding(e).earnsGradePoints && (num(e.creditHours) ?? 0) > 0,
  );

  const standing = gpaFor(counted);
  const base = {
    target,
    gpa: standing.gpa,
    credits: standing.credits,
    counted: counted.length,
    excluded: entries.length - counted.length,
    met: standing.gpa != null && target != null && standing.gpa >= target,
  };

  if (target == null || !counted.length) return { ...base, courses: [] };

  const courses = counted.map((e) => {
    const hours = num(e.creditHours) ?? 0;
    const scale = e.scale ?? DEFAULT_SCALE;

    // Everything except this course, held exactly where it is. Courses with no
    // letter yet contribute to neither side — they aren't evidence in either
    // direction, and counting them as zero would manufacture a crisis in week
    // three.
    let otherPoints = 0;
    let otherCredits = 0;
    for (const o of counted) {
      if (o === e) continue;
      const gp = gradePoints(o.letter);
      const oh = num(o.creditHours) ?? 0;
      if (gp == null || oh <= 0) continue;
      otherPoints += gp * oh;
      otherCredits += oh;
    }

    // (otherPoints + gp·hours) / (otherCredits + hours) ≥ target
    const exact = (target * (otherCredits + hours) - otherPoints) / hours;

    const row = {
      id: e.id,
      creditHours: hours,
      currentLetter: e.letter ?? null,
      exactPoints: exact,
    };

    if (exact <= 0) return { ...row, status: 'locked', neededPoints: 0, neededLetter: null, neededPct: null };

    // Grade points come in whole steps — there is no 3.4 to earn — so the real
    // requirement is the next whole one up. The epsilon is for the exact-3.0
    // case arriving as 3.0000000000000004 and demanding an A.
    const neededPoints = Math.ceil(exact - 1e-9);
    if (neededPoints > 4) {
      return { ...row, status: 'impossible', neededPoints, neededLetter: null, neededPct: null };
    }

    const letterRow = lowestLetterWorth(neededPoints, scale);
    return {
      ...row,
      status: 'reachable',
      neededPoints,
      neededLetter: letterRow?.letter ?? null,
      // The percentage that letter starts at — the number that hands straight
      // to the per-course solver as its target.
      neededPct: letterRow?.min ?? null,
    };
  });

  return { ...base, courses };
}
