// One definition of the app's destinations, read by both the desktop top bar
// and the phone tab bar so they can't drift apart.
//
// Five views, all of them earning a permanent slot on a phone — this app is
// small on purpose, and a "More" menu would only ever hide one of them.

export const NAV_ITEMS = [
  ['today', 'Today', '◆'],
  ['schedule', 'Schedule', '▦'],
  ['work', 'Work', '✓'],
  ['grades', 'Grades', '%'],
  ['courses', 'Courses', '☰'],
];

export const navLabel = (key) => NAV_ITEMS.find(([k]) => k === key)?.[1] ?? null;

// A route may carry one segment of detail ('grades/<id>'); the nav highlights
// the section it belongs to.
export const navSection = (route) => (route || '').split('/')[0];
