import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  describeDue,
  dayRangeLabel,
  dayRangeLength,
  atTime,
  toLocalInput,
  HOUR_OPTIONS,
  END_OF_DAY,
  isOffHour,
  labelForTime,
  withTime,
  dayPart,
  timePart,
} from '../src/dates.js';

// The one distinction worth testing here: something due *by* a moment versus
// something that happens *at* one. Everything downstream reads `type` — which
// bucket the work list files a row under, what colour the pill is — so getting
// this wrong shows a red "3d late" badge on a midterm you sat and passed.

// Fixed so these don't drift with the calendar. Local time on purpose: the
// whole point of describeDue is that it answers in the reader's timezone.
const NOW = new Date(2026, 9, 8, 12, 0, 0); // Thu 8 Oct 2026, noon
const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

test('work not handed in is overdue', () => {
  const due = describeDue(at(2026, 10, 6, 14), NOW);
  assert.equal(due.type, 'overdue');
  assert.equal(due.label, '2d late');
});

test('an exam already sat is past, not late', () => {
  const due = describeDue(at(2026, 10, 6, 14), NOW, { event: true });
  assert.equal(due.type, 'past');
  assert.equal(due.label, '2d ago');
});

test('homework handed in is past, not late', () => {
  const due = describeDue(at(2026, 10, 6, 14), NOW, { submitted: true });
  assert.equal(due.type, 'past');
  assert.equal(due.label, '2d ago');
});

test('the two agree about everything still ahead', () => {
  const when = at(2026, 10, 9, 14);
  const work = describeDue(when, NOW);
  const exam = describeDue(when, NOW, { event: true });
  assert.equal(work.type, 'soon');
  assert.equal(exam.type, 'soon');
  assert.equal(work.label, exam.label);
});

test('something due earlier today is late; an exam earlier today is done', () => {
  const when = at(2026, 10, 8, 9);
  assert.equal(describeDue(when, NOW).label, 'Late — was 9 AM');
  assert.equal(describeDue(when, NOW, { event: true }).label, 'Earlier today');
});

test('a missing date says so in the right dialect', () => {
  assert.equal(describeDue(null, NOW).label, 'No due date');
  assert.equal(describeDue(null, NOW, { event: true }).label, 'No date set');
  assert.equal(describeDue(null, NOW).type, 'none');
});

test('later today is still ahead of you', () => {
  const due = describeDue(at(2026, 10, 8, 23, 59), NOW);
  assert.equal(due.type, 'today');
  assert.equal(due.daysLeft, 0);
});

// ----------------------------------------------------------- break ranges

test('a one-day break reads as a single date', () => {
  assert.equal(dayRangeLabel('2026-11-26', '2026-11-26'), 'Nov 26');
  assert.equal(dayRangeLength('2026-11-26', '2026-11-26'), 1);
});

test('a break inside one month drops the second month name', () => {
  assert.equal(dayRangeLabel('2026-11-24', '2026-11-28'), 'Nov 24 – 28');
  // Inclusive of both ends — a Tue–Sat break is five days off, not four.
  assert.equal(dayRangeLength('2026-11-24', '2026-11-28'), 5);
});

test('a break spanning months names both', () => {
  assert.equal(dayRangeLabel('2026-11-30', '2026-12-04'), 'Nov 30 – Dec 4');
});

// ------------------------------------------------------------- exam times

test('an exam time is local wall time, not a UTC shift', () => {
  // The bug this guards: building the instant through a UTC parse renders a 9am
  // exam as 4am (or the previous evening) west of Greenwich.
  assert.equal(toLocalInput(atTime('2026-10-14', 9, 0)), '2026-10-14T09:00');
  assert.equal(toLocalInput(atTime('2026-01-01', 14, 30)), '2026-01-01T14:30');
});

// ------------------------------------------------------------- hours, not times

test('the hours offered are end-of-day and then every one of them', () => {
  assert.equal(HOUR_OPTIONS[0].value, END_OF_DAY);
  assert.equal(HOUR_OPTIONS.length, 25);
  assert.deepEqual(
    HOUR_OPTIONS.slice(1, 4).map((o) => o.label),
    ['12 AM', '1 AM', '2 AM'],
  );
});

test('end of day is 11:59pm and not midnight, which is a different day', () => {
  // Work "due midnight Friday" filed at 00:00 is overdue for all of Friday.
  assert.equal(END_OF_DAY, '23:59');
});

test('a time that is not on the hour is kept rather than snapped to one', () => {
  assert.equal(isOffHour('11:30'), true);
  assert.equal(isOffHour('09:00'), false);
  assert.equal(isOffHour(END_OF_DAY), false);
  assert.equal(isOffHour(''), false);
  assert.equal(labelForTime('11:30'), '11:30 AM');
});

test('a day and an hour join and come apart again', () => {
  assert.equal(withTime('2026-10-08', '09:00'), '2026-10-08T09:00');
  assert.equal(withTime('2026-10-08', ''), `2026-10-08T${END_OF_DAY}`);
  assert.equal(withTime('', '09:00'), '');
  assert.equal(dayPart('2026-10-08T09:00'), '2026-10-08');
  assert.equal(timePart('2026-10-08T09:00'), '09:00');
  assert.equal(timePart(''), '');
});

test('a stored timestamp comes back as the two halves the form edits', () => {
  const iso = atTime('2026-10-08', 14, 0);
  assert.equal(dayPart(toLocalInput(iso)), '2026-10-08');
  assert.equal(timePart(toLocalInput(iso)), '14:00');
});
