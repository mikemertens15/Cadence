// How a course is scored, and whether you're still in it.
//
// The app used to assume one answer to both — every course graded on a letter,
// every course finished. Neither holds for the classes people take once they're
// past the required ones: the seminar you audit because it looked interesting,
// the pass/fail lab, the class you dropped in week four.
//
// These are two independent axes and conflating them would be the usual mistake.
// "Withdrawn" is not a grading basis; a withdrawn pass/fail course is a real
// combination. What they share is that both can stop a course from producing
// grade points, credit, or either — see courseStanding() in grading/engine.js,
// which is the one place that decides.

export const GRADING_BASES = [
  // key, label, what it does to the two numbers that matter
  ['graded', 'Graded', 'A letter, and it moves your GPA'],
  ['pass_fail', 'Pass / fail', 'Credit if you pass — no grade points either way'],
  ['audit', 'Audit', 'You sit in. No credit, no grade'],
];

export const COURSE_STATUSES = [
  ['enrolled', 'Enrolled', null],
  ['withdrawn', 'Withdrawn', 'A W earns no credit and no grade points'],
  ['incomplete', 'Incomplete', 'No grade yet — left out until there is one'],
];

const BASIS = new Map(GRADING_BASES.map(([key, label, note]) => [key, { key, label, note }]));
const STATUS = new Map(COURSE_STATUSES.map(([key, label, note]) => [key, { key, label, note }]));

// Rows written before these columns existed carry the defaults, and a value
// retired in a later version shouldn't render blank on the one screen someone
// is checking their GPA on.
export const basisOf = (key) => BASIS.get(key) ?? BASIS.get('graded');
export const statusOf = (key) => STATUS.get(key) ?? STATUS.get('enrolled');

export const basisLabel = (key) => basisOf(key).label;
export const statusLabel = (key) => statusOf(key).label;

/** Is this the ordinary case — graded, enrolled, nothing to explain? */
export const isPlainCourse = (course) =>
  (course?.grading_basis ?? 'graded') === 'graded' && (course?.status ?? 'enrolled') === 'enrolled';

// The short badge a course carries in a list when it isn't the ordinary case.
// Null for the ordinary case, because a tag on every row is a tag nobody reads.
export function courseTag(course) {
  const status = course?.status ?? 'enrolled';
  if (status === 'withdrawn') return 'W';
  if (status === 'incomplete') return 'INC';
  const basis = course?.grading_basis ?? 'graded';
  if (basis === 'pass_fail') return 'P/F';
  if (basis === 'audit') return 'Audit';
  return null;
}
