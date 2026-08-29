// One definition of the app's destinations, read by both the desktop top bar
// and the phone tab bar so they can't drift apart.
//
// Five views, all of them earning a permanent slot on a phone — this app is
// small on purpose, and a "More" menu would only ever hide one of them.
//
// Four, for someone who has turned the timetable off. A tab that leads to a
// screen explaining that the thing it is for is switched off is worse than no
// tab: it takes up a fifth of the bar to say nothing. `needs` is the feature a
// destination cannot exist without, and null for the ones that always can.

export const NAV_ITEMS = [
  // key, label, glyph, the feature it needs
  ['today', 'Today', '◆', null],
  ['schedule', 'Schedule', '▦', 'schedule'],
  ['work', 'Work', '✓', null],
  ['grades', 'Grades', '%', null],
  ['courses', 'Courses', '☰', null],
];

/**
 * The destinations this account actually has.
 *
 * `navAvailable` is the guard for a route arriving from somewhere the nav
 * doesn't control — a bookmark, a back button, the hash left in the bar from
 * before the switch was flipped. `NAV_FALLBACK` is where those land.
 */
export const navItemsFor = (features) =>
  NAV_ITEMS.filter(([, , , needs]) => !needs || features?.[needs] !== false);

export const navAvailable = (route, features) => {
  const section = navSection(route);
  const item = NAV_ITEMS.find(([k]) => k === section);
  // A section nobody lists — 'releases' — isn't gated by anything; it just
  // isn't in the tab bar.
  if (!item) return true;
  return !item[3] || features?.[item[3]] !== false;
};

export const NAV_FALLBACK = 'today';

export const navLabel = (key) => NAV_ITEMS.find(([k]) => k === key)?.[1] ?? null;

// A route may carry one segment of detail ('grades/<id>'); the nav highlights
// the section it belongs to.
export const navSection = (route) => (route || '').split('/')[0];
