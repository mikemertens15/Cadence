import { parseDay, dayStr, addDays, daysUntil, dowIndex, monthShort } from './dates.js';

// How far through the semester you are.
//
// This exists because the answer is genuinely hard to feel. A semester has no
// odometer — it has a first day you remember and a last day that is a long way
// off, and between them every week looks like the one before it. So you carry
// around a guess, the guess is always "earlier than it really is", and the week
// you correct it is the week you find out the thing you were going to start
// soon has four weeks left rather than ten.
//
// Everything here is derived from two dates already in the database, which is
// the whole appeal: there is nothing to keep up to date, and a bar that moves
// on its own is one you can trust on the morning you'd rather not look at it.
//
// Days are counted on the calendar rather than off a millisecond span. Two
// weekends a year are 25 hours long, and "13.96 weeks left" is not a sentence.

const MS_DAY = 86400000;
const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

// A course with no meetings entered still has class days — the fallback is
// Monday to Friday, which is wrong for nobody in a way that matters and right
// for almost everybody.
const DEFAULT_MEETING_DAYS = [0, 1, 2, 3, 4];

/**
 * The term in view, measured.
 *
 * @param term         a `terms` row (start_date, end_date)
 * @param now          the moment to measure from
 * @param breaks       `term_breaks` rows for this term
 * @param meetingDays  Set of Monday-first weekday indices you have class on
 * @returns null when there's nothing to measure, otherwise the numbers below
 */
export function termProgress(term, { now = new Date(), breaks = [], meetingDays } = {}) {
  if (!term?.start_date || !term?.end_date) return null;

  const start = parseDay(term.start_date);
  const end = parseDay(term.end_date);
  if (!start || !end || end < start) return null;

  const today = dayStr(now);
  const totalDays = Math.round((end - start) / MS_DAY) + 1;

  // The bar is measured against the term as one continuous stretch, from the
  // first moment of the first day to the last of the last, so the marker
  // creeps through the afternoon instead of sitting still until midnight.
  const span = end.getTime() + MS_DAY - start.getTime();
  const pct = clamp(((now.getTime() - start.getTime()) / span) * 100);

  const phase = today < term.start_date ? 'before' : today > term.end_date ? 'after' : 'during';

  // Argument order reads backwards but is deliberate: `daysUntil(now, start)`
  // is days from the start until now, which is the elapsed count, and negating
  // the other direction would hand back -0 on day one.
  const elapsedDays = daysUntil(now, start);
  // Clamped to the term's own length, so a card looked at in August doesn't
  // claim 119 days left of a 110-day semester. Before it starts, all of it is
  // left; that is the honest number and the one every other figure agrees with.
  const daysLeft = Math.min(totalDays, Math.max(0, daysUntil(end, now)));
  const daysUntilStart = Math.max(0, daysUntil(start, now));

  // Weeks are numbered the way a syllabus numbers them: week 1 is the calendar
  // week the term starts in, whether that week is five days long or one. A term
  // beginning on a Thursday has a week 1 that is two days of class, and every
  // student in it still calls those two days week 1.
  const monday = new Date(start);
  monday.setDate(start.getDate() - dowIndex(start));
  const totalWeeks = Math.floor(daysUntil(end, monday) / 7) + 1;
  const week = Math.max(1, Math.min(totalWeeks, Math.floor(daysUntil(now, monday) / 7) + 1));

  // What's left, day by day. A hundred-odd iterations once per render of a
  // memoised hook, against the alternative of arithmetic that has to be right
  // about breaks landing on weekends.
  const days = meetingDays?.size ? meetingDays : new Set(DEFAULT_MEETING_DAYS);
  const from = phase === 'before' ? term.start_date : today;
  let classDaysLeft = 0;
  let breakDaysLeft = 0;
  if (phase !== 'after') {
    for (let d = from; d <= term.end_date; d = addDays(d, 1)) {
      if (breaks.some((b) => b.start_date <= d && d <= b.end_date)) {
        breakDaysLeft += 1;
        continue;
      }
      if (days.has(dowIndex(parseDay(d)))) classDaysLeft += 1;
    }
  }

  // Where a day sits along the bar, 0–100. Day-granular on purpose: a break
  // drawn on the same scale as the marker is a break the marker slides into on
  // the right morning.
  const at = (dayString) => clamp((daysUntil(parseDay(dayString), start) / totalDays) * 100);

  const segments = breaks
    .filter((b) => b.end_date >= term.start_date && b.start_date <= term.end_date)
    .map((b) => {
      // Clipped to the term: a break entered a day either side of it is a typo
      // worth surviving, not one worth drawing off the end of the bar.
      const s = b.start_date < term.start_date ? term.start_date : b.start_date;
      const e = b.end_date > term.end_date ? term.end_date : b.end_date;
      const left = at(s);
      return {
        id: b.id,
        name: b.name,
        start_date: s,
        end_date: e,
        left,
        width: Math.min(100 - left, ((daysUntil(parseDay(e), parseDay(s)) + 1) / totalDays) * 100),
        past: e < today,
      };
    })
    .sort((a, b) => a.left - b.left);

  const nextBreak = segments.find((s) => !s.past) ?? null;

  // Month marks under the bar. The percentage says how much is gone; these say
  // what it's gone *of* — "we're already into November" lands in a way that
  // "68%" does not.
  const months = [];
  for (let m = new Date(start.getFullYear(), start.getMonth(), 1); m <= end; m.setMonth(m.getMonth() + 1)) {
    const first = m < start ? start : new Date(m);
    months.push({ key: `${first.getFullYear()}-${first.getMonth()}`, label: monthShort(first), left: at(dayStr(first)) });
  }

  return {
    name: term.name || null,
    phase,
    start,
    end,
    pct,
    totalDays,
    elapsedDays,
    daysLeft,
    daysUntilStart,
    week,
    totalWeeks,
    weeksLeft: Math.ceil(daysLeft / 7),
    classDaysLeft,
    breakDaysLeft,
    segments,
    nextBreak,
    months,
  };
}
