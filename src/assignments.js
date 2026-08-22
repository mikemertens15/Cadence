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
