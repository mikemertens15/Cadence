// What kind of thing a piece of work is, and the one distinction that matters.
//
// A problem set is due *by* a moment: hand it in at 11:58pm and you're fine, at
// 12:01am you're late. A test happens *at* one — you sit in a room at 2pm for
// fifty minutes, and "late" isn't a state it can be in. That single difference
// decides the wording on the form, which bucket the work list files it under,
// and whether it gets drawn on your schedule.
//
// Everything else is the same for both, which is why this is one column on
// assignments rather than a second table.

export const KINDS = [
  // key, label, short, event?
  ['assignment', 'Assignment', 'HW', false],
  ['quiz', 'Quiz', 'Quiz', true],
  ['test', 'Test', 'Test', true],
  ['final', 'Final', 'Final', true],
  ['project', 'Project', 'Proj', false],
  ['paper', 'Paper', 'Paper', false],
];

export const DEFAULT_KIND = 'assignment';

const BY_KEY = new Map(KINDS.map(([key, label, short, event]) => [key, { key, label, short, event }]));

// Rows written before the column existed carry the default, and a kind removed
// in a later version shouldn't render as blank — both fall back rather than
// throwing at the one moment someone is looking at their grade.
export const kindOf = (kind) => BY_KEY.get(kind) ?? BY_KEY.get(DEFAULT_KIND);

/** Does this thing happen at a time, rather than being due by one? */
export const isEvent = (kind) => kindOf(kind).event;

export const kindLabel = (kind) => kindOf(kind).label;

// How long you're sitting there. Fifty minutes is a class period, which is what
// most quizzes and midterms actually are, and it's a believable block to draw
// when nobody has said otherwise.
export const DEFAULT_EVENT_MINUTES = 50;

export const eventMinutes = (a) => {
  const n = Number(a?.duration_min);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EVENT_MINUTES;
};

// The verb for the date field. "Due" on a final exam is the kind of small wrong
// word that makes an app feel like it was built for something else.
export const dateVerb = (kind) => (isEvent(kind) ? 'When' : 'Due');

// ------------------------------------------------- which bucket work lands in
//
// Picking "Quiz" and then picking "Quizzes" is the same decision twice, and the
// second one is the one you forget — which is how a quiz ends up outside the
// grade entirely. So the kind picks the category, and you only touch it when
// the guess is wrong.
//
// Three sources, in order of how much they actually know:
//
//   1. What you did last time. If the previous two quizzes in this course went
//      into "Exams", the next one does too — even though a "Quizzes" category
//      exists. A choice you made about this course beats any rule about names.
//   2. The category names themselves, matched loosely enough to cope with
//      "HW", "Problem Sets" and "Homework & Labs" all meaning the same thing.
//   3. A course with exactly one category, where there is nothing to guess.
//
// And a fourth answer that matters as much as the other three: *nothing*. A
// course whose syllabus has Exams 60 / Final 40 does not grade homework, and
// the honest thing to do with a problem set in that course is say so, rather
// than filing it somewhere it will quietly dilute an exam average.

// Ordered best-guess first. The weak second entries are there because plenty of
// syllabi run one bucket for everything you sit in a room for — a quiz in a
// course with only "Exams" belongs in Exams, not nowhere.
const NAME_HINTS = {
  assignment: [
    [/homework|\bhw\b|problem\s*sets?|\bpsets?\b|assignments?/i, 3],
    [/\bdaily\b|\bwork\b|\bpractice\b/i, 2],
  ],
  quiz: [
    [/quiz/i, 3],
    [/exams?|tests?/i, 1],
  ],
  test: [
    [/\btests?\b|midterms?|exams?/i, 3],
    [/quiz/i, 1],
  ],
  final: [
    [/final/i, 3],
    [/exams?|tests?/i, 2],
  ],
  project: [
    [/projects?/i, 3],
    [/\blabs?\b|studio/i, 2],
  ],
  paper: [
    [/papers?|essays?|reports?/i, 3],
    [/writing|projects?/i, 1],
  ],
};

/**
 * The category a new piece of work should go in, and why.
 *
 * `reason` is not decoration — the form says it out loud. "Cadence thinks this
 * isn't graded" is a claim that has to be checkable by the person reading it,
 * because the one thing worse than making them pick a category every time is
 * picking the wrong one on their behalf and never mentioning it.
 *
 * Returns { categoryId: null, reason: 'ungraded' } when the course has a real
 * grading scheme that has no room for this kind of work — which is the whole
 * point — and 'no-scheme' when there are simply no categories yet, which is a
 * different thing and not a claim about grading at all.
 */
export function suggestCategory({ kind, categories = [], assignments = [] }) {
  if (!categories.length) return { categoryId: null, reason: 'no-scheme' };

  const live = new Set(categories.map((c) => c.id));

  // 1. What this course did with the last thing of this kind. Newest first, and
  //    only rows that still point at a category that exists.
  const previous = assignments
    .filter((a) => a.kind === kind && a.category_id && live.has(a.category_id))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
  if (previous.length) return { categoryId: previous[0].category_id, reason: 'history' };

  // A kind that has only ever been filed as not-graded in this course is a
  // settled question too — don't re-offer a category it has always been kept
  // out of.
  const alwaysUngraded =
    assignments.some((a) => a.kind === kind) &&
    assignments.filter((a) => a.kind === kind).every((a) => a.counts_toward_grade === false);
  if (alwaysUngraded) return { categoryId: null, reason: 'history-ungraded' };

  // 2. The names on the syllabus.
  const hints = NAME_HINTS[kind] ?? [];
  let best = null;
  for (const c of categories) {
    for (const [pattern, score] of hints) {
      if (pattern.test(c.name) && (!best || score > best.score)) best = { id: c.id, score };
    }
  }
  if (best) return { categoryId: best.id, reason: 'name' };

  // 3. One bucket for the whole course — there is nothing left to be wrong
  //    about.
  if (categories.length === 1) return { categoryId: categories[0].id, reason: 'only' };

  // The scheme exists and has no home for this. That is a fact about the
  // course, not a gap in the data.
  return { categoryId: null, reason: 'ungraded' };
}

/**
 * What this thing is probably worth.
 *
 * Every quiz in a course is out of the same twenty points, and typing 100 →
 * clear → 20 fourteen times is exactly the sort of thing the app is for. Looks
 * at the same category first (a quiz should not inherit an exam's 150), then at
 * the same kind, and gives up rather than guessing across a boundary that means
 * something.
 */
export function suggestPoints({ kind, categoryId, assignments = [], fallback = 100 }) {
  const usable = assignments.filter((a) => Number(a.points_possible) > 0);
  const pools = [
    categoryId ? usable.filter((a) => a.category_id === categoryId) : [],
    usable.filter((a) => a.kind === kind),
  ];

  for (const pool of pools) {
    if (!pool.length) continue;
    // The most common value, not the most recent: one 200-point makeup exam
    // shouldn't redefine what an exam is worth for the rest of the term.
    const counts = new Map();
    for (const a of pool) {
      const v = Number(a.points_possible);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const [value] = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0])[0];
    return value;
  }

  return fallback;
}

/**
 * Numbering a run of work.
 *
 * "Homework" typed once becomes Homework 1 … Homework 14. A title that already
 * ends in a number is a starting point rather than a thing to append to, so
 * entering "Problem Set 3" and asking for four gives you 3, 4, 5, 6 — which is
 * what you meant, and what you'd have typed.
 */
export function seriesTitles(title, count) {
  const base = (title ?? '').trim() || 'Untitled';
  const match = base.match(/^(.*?)(\d+)\s*$/);

  if (match) {
    const [, prefix, start] = match;
    const from = Number(start);
    return Array.from({ length: count }, (_, i) => `${prefix.trimEnd()} ${from + i}`);
  }

  return Array.from({ length: count }, (_, i) => `${base} ${i + 1}`);
}
