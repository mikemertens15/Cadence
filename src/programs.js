// What you're working toward, of which there is rarely exactly one.
//
// A single credit total was the assumption this vocabulary exists to replace.
// Someone six years into a degree has taken classes for a major they finished,
// a second one they added, a couple of graduate hours, and two or three that
// were simply interesting — and "169 credits out of 120" is not a sentence
// about any of those. Each program has its own denominator, and some of the
// same credits count toward more than one of them.

export const PROGRAM_KINDS = [
  ['degree', 'Degree'],
  ['minor', 'Minor'],
  ['certificate', 'Certificate'],
  ['concentration', 'Concentration'],
];

export const PROGRAM_LEVELS = [
  ['undergraduate', 'Undergraduate'],
  ['graduate', 'Graduate'],
];

export const PROGRAM_STATUSES = [
  ['active', 'In progress'],
  ['completed', 'Finished'],
  ['planned', 'Planned'],
];

const KIND = new Map(PROGRAM_KINDS);
const LEVEL = new Map(PROGRAM_LEVELS);
const STATUS = new Map(PROGRAM_STATUSES);

export const programKindLabel = (k) => KIND.get(k) ?? 'Degree';
export const programLevelLabel = (l) => LEVEL.get(l) ?? 'Undergraduate';
export const programStatusLabel = (s) => STATUS.get(s) ?? 'In progress';

// Typical totals, offered as one tap in the form. Not enforced — plenty of
// engineering degrees are 128 and plenty of certificates are 9.
export const CREDIT_PRESETS = {
  degree: [120, 128, 30, 36],
  minor: [18, 21],
  certificate: [12, 15],
  concentration: [15, 18],
};

/**
 * The line under a program's name.
 *
 * Graduate is called out because a graduate GPA is genuinely a separate number
 * on a separate transcript line, and a 3.9 master's blended into a bachelor's
 * would report neither one correctly.
 */
export function describeProgram(plan) {
  const bits = [programKindLabel(plan?.kind)];
  if ((plan?.level ?? 'undergraduate') === 'graduate') bits.unshift('Graduate');
  if ((plan?.status ?? 'active') !== 'active') bits.push(programStatusLabel(plan?.status).toLowerCase());
  return bits.join(' · ');
}
