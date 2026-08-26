import { test } from 'node:test';
import assert from 'node:assert/strict';

import { termProgress } from '../src/term.js';

// The thing worth testing here is the counting, not the phrasing. Every number
// on the card is a day count off a calendar — which is exactly the arithmetic
// that goes wrong at the ends of a range, on the days a break starts, and in
// March, when a week is 167 hours long and a millisecond span quietly disagrees
// with the calendar about how many days have passed.

// Mon 24 Aug 2026 – Fri 11 Dec 2026: sixteen weeks, which is a normal fall.
const TERM = { start_date: '2026-08-24', end_date: '2026-12-11' };
const BREAKS = [
  { id: 'a', name: 'Fall Break', start_date: '2026-10-12', end_date: '2026-10-13' },
  { id: 'b', name: 'Thanksgiving', start_date: '2026-11-25', end_date: '2026-11-27' },
];
// Monday, Wednesday, Friday.
const MWF = new Set([0, 2, 4]);

const at = (m, d, h = 12) => new Date(2026, m - 1, d, h);

test('the first day is the start of it, not part of the way in', () => {
  const t = termProgress(TERM, { now: at(8, 24, 0) });
  assert.equal(t.phase, 'during');
  assert.equal(t.pct, 0);
  assert.equal(t.week, 1);
  assert.equal(t.totalWeeks, 16);
  assert.equal(t.elapsedDays, 0);
  assert.equal(t.totalDays, 110);
});

test('the last day is not yet over', () => {
  const t = termProgress(TERM, { now: at(12, 11, 12) });
  assert.equal(t.phase, 'during');
  assert.equal(t.daysLeft, 0);
  assert.equal(t.week, 16);
  assert.ok(t.pct > 99 && t.pct < 100, `expected just short of 100, got ${t.pct}`);
});

test('the day after is over, and pinned at 100', () => {
  const t = termProgress(TERM, { now: at(12, 12) });
  assert.equal(t.phase, 'after');
  assert.equal(t.pct, 100);
  assert.equal(t.daysLeft, 0);
  assert.equal(t.classDaysLeft, 0);
});

test('before it starts, nothing has elapsed and the countdown is to day one', () => {
  const t = termProgress(TERM, { now: at(8, 14) });
  assert.equal(t.phase, 'before');
  assert.equal(t.pct, 0);
  assert.equal(t.daysUntilStart, 10);
});

// Week 1 is the calendar week the term starts in, however much of it there is —
// a term beginning on a Thursday has a two-day week 1, and everyone in it still
// calls those two days week 1.
test('weeks are numbered from the calendar week the term starts in', () => {
  const thursdayStart = { start_date: '2026-08-27', end_date: '2026-12-11' };
  assert.equal(termProgress(thursdayStart, { now: at(8, 28) }).week, 1);
  // The Monday after is week 2, three days later.
  assert.equal(termProgress(thursdayStart, { now: at(8, 31) }).week, 2);
});

test('halfway through is halfway along the bar', () => {
  // Day 55 of 110, at midnight: exactly half the span is behind.
  const t = termProgress(TERM, { now: at(10, 18, 0) });
  assert.equal(Math.round(t.pct), 50);
});

test('class days count the days you actually meet, not every weekday', () => {
  const from = at(12, 7); // Mon 7 Dec — the last week, Mon/Wed/Fri to the 11th.
  assert.equal(termProgress(TERM, { now: from, meetingDays: MWF }).classDaysLeft, 3);
  // Same week, five days for a course that meets daily.
  assert.equal(termProgress(TERM, { now: from, meetingDays: new Set([0, 1, 2, 3, 4]) }).classDaysLeft, 5);
});

test('a break takes its days back off the count', () => {
  const opts = { now: at(11, 23), meetingDays: MWF };
  const without = termProgress(TERM, opts).classDaysLeft;
  const withBreak = termProgress(TERM, { ...opts, breaks: BREAKS }).classDaysLeft;
  // Thanksgiving is Wed 25 – Fri 27: two MWF days gone, the Thursday never counted.
  assert.equal(without - withBreak, 2);
});

test('days off ahead are counted as calendar days, and only the ones ahead', () => {
  const t = termProgress(TERM, { now: at(11, 23), breaks: BREAKS });
  assert.equal(t.breakDaysLeft, 3);
  assert.equal(t.nextBreak.name, 'Thanksgiving');
  // Fall break is behind you by then, and says so.
  assert.equal(t.segments.find((s) => s.name === 'Fall Break').past, true);
});

test('a break is drawn where it falls, on the same scale as the marker', () => {
  const t = termProgress(TERM, { now: at(9, 1), breaks: BREAKS });
  const fall = t.segments[0];
  // Day 49 of 110, two days long.
  assert.equal(Math.round(fall.left * 110) / 100, 49);
  assert.equal(Math.round(fall.width * 110) / 100, 2);
});

test('a break entered past the end of term is clipped rather than drawn off the bar', () => {
  const t = termProgress(TERM, {
    now: at(9, 1),
    breaks: [{ id: 'c', name: 'Winter', start_date: '2026-12-09', end_date: '2027-01-15' }],
  });
  const seg = t.segments[0];
  assert.equal(seg.end_date, '2026-12-11');
  assert.ok(seg.left + seg.width <= 100.0001);
});

test('a spring term crossing the clock change still counts whole days', () => {
  // US DST begins 8 Mar 2026. A span in milliseconds is an hour short here.
  const spring = { start_date: '2026-01-12', end_date: '2026-05-01' };
  const t = termProgress(spring, { now: at(3, 9) });
  assert.equal(t.elapsedDays, 56);
  assert.equal(t.daysLeft, 53);
  assert.equal(t.totalDays, 110);
});

test('months are marked from the term start, not the first of that month', () => {
  const t = termProgress(TERM, { now: at(9, 1) });
  assert.deepEqual(t.months.map((m) => m.label), ['Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  assert.equal(t.months[0].left, 0);
});

test('nothing to measure is null rather than a card full of NaN', () => {
  assert.equal(termProgress(null, {}), null);
  assert.equal(termProgress({ start_date: '2026-08-24' }, {}), null);
  assert.equal(termProgress({ start_date: '2026-12-11', end_date: '2026-08-24' }, {}), null);
});

test('a term not yet started has all of itself left, not more', () => {
  const t = termProgress(TERM, { now: at(8, 14) });
  assert.equal(t.daysLeft, t.totalDays);
  assert.equal(t.weeksLeft, 16);
});
