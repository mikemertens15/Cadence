// Date and time helpers. Two conventions run through the whole app and are
// worth stating once, here, where they're implemented:
//
//   * Weeks are Monday-first, and a weekday index is 0 = Mon … 6 = Sun. That
//     matches the `meetings.day_of_week` column, so a meeting row drops
//     straight into a grid column with no conversion.
//   * Class times are wall-clock times with no date (`time` columns), carried
//     around as minutes since midnight. Comparing 09:30 to 14:00 is then just
//     comparing two integers.
//
// Assignment due dates are the exception: they're real timestamps, because
// "11:59pm Friday" is a moment, not a wall-clock time.

const DOWS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DOWS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DAY_NAMES = DOWS;
export const DAY_NAMES_LONG = DOWS_LONG;

// JS getDay() is Sunday-first; everything here is Monday-first.
export const dowIndex = (d = new Date()) => (d.getDay() + 6) % 7;

// The current Mon–Sun week plus today's column index.
export function getWeek(now = new Date()) {
  const todayIndex = dowIndex(now);
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - todayIndex);

  const days = DOWS.map((dow, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { dow, date: d, num: d.getDate(), index: i };
  });

  return { monday, days, todayIndex };
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// ---------------------------------------------------------------- date-only

// Parse a date-only 'YYYY-MM-DD' string (how Postgres `date` columns arrive) as
// local midnight — `new Date('2026-08-14')` would parse as UTC and can render
// as the previous day in western timezones.
export function parseDay(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// A date as 'YYYY-MM-DD' in local time, for date columns and date inputs.
export function dayStr(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(dayString, n) {
  const d = parseDay(dayString);
  d.setDate(d.getDate() + n);
  return dayStr(d);
}

// Whole days from today until d (negative = that many days ago).
export function daysUntil(d, now = new Date()) {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86400000);
}

export const monthDay = (d) => `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
export const monthShort = (d) => MONTHS_SHORT[d.getMonth()];
export const shortDay = (d) => DOWS[dowIndex(d)];
export const longDate = (d) => `${DOWS_LONG[dowIndex(d)]}, ${MONTHS_LONG[d.getMonth()]} ${d.getDate()}`;

// "August 17 – 23" when both ends share a month, otherwise "Aug 31 – Sep 6".
export function weekRangeLabel(days) {
  const start = days[0].date;
  const end = days[6].date;
  if (start.getMonth() === end.getMonth()) {
    return `${MONTHS_LONG[start.getMonth()]} ${start.getDate()} – ${end.getDate()}`;
  }
  return `${monthDay(start)} – ${monthDay(end)}`;
}

// ------------------------------------------------------------- wall-clock

// '14:30:00' (or '14:30') → 870. Postgres `time` columns arrive with seconds.
export function toMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
}

// 870 → '14:30:00', the shape a `time` column wants back.
export function toTimeStr(minutes) {
  const p = (n) => String(n).padStart(2, '0');
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${p(Math.floor(m / 60))}:${p(m % 60)}:00`;
}

// 870 → '2:30 PM'. Minutes are dropped when they're zero: "2 PM" reads faster
// than "2:00 PM" in a dense grid, and the schedule is full of on-the-hour slots.
export function fmtMinutes(minutes, { padMinutes = false } = {}) {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  if (mm === 0 && !padMinutes) return `${h12} ${suffix}`;
  return `${h12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

export const fmtTimeRange = (startMin, endMin) =>
  `${fmtMinutes(startMin)} – ${fmtMinutes(endMin)}`;

// ------------------------------------------------------------- timestamps

// An ISO timestamp → the 'YYYY-MM-DDTHH:mm' shape <input type="datetime-local">
// requires, in local time. Feeding it a raw ISO string would either be rejected
// or silently shift by the UTC offset.
export function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// The reverse: a datetime-local value is local wall time, and `new Date()`
// parses it as such, so toISOString() carries the right instant to Postgres.
export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// The default due time for a quick-add: tonight's 11:59pm on the chosen day.
// Almost every assignment is due at end of day, and making that the default is
// the difference between a two-tap add and a fight with a time picker.
export function endOfDay(dayString) {
  const d = parseDay(dayString);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

// A given hour on a given day, as an instant. The exam counterpart to
// endOfDay: work is due at the end of a day, but a test happens partway
// through one, and 9am is the hour most of them start.
export function atTime(dayString, hour, minute = 0) {
  const d = parseDay(dayString);
  if (!d) return null;
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// How a piece of work's date reads in a list. Everything downstream — the
// colour of the pill, which bucket it sorts into — is derived from this one
// function, so a row can never show "Tomorrow" in an "Overdue" group.
//
// `event` flips the meaning of "past". Something due by 11:59pm and not handed
// in is overdue and wants a red pill. A test you sat on Tuesday is not overdue
// — it's done, and what you're waiting on is the score. Calling that "3d late"
// would be both wrong and, on the morning of a bad week, quietly demoralising.
export function describeDue(dueAt, now = new Date(), { event = false } = {}) {
  if (!dueAt) {
    return { date: null, daysLeft: null, type: 'none', label: event ? 'No date set' : 'No due date' };
  }

  const date = new Date(dueAt);
  if (Number.isNaN(date.getTime())) {
    return { date: null, daysLeft: null, type: 'none', label: event ? 'No date set' : 'No due date' };
  }

  const daysLeft = daysUntil(date, now);
  const time = fmtMinutes(date.getHours() * 60 + date.getMinutes());

  // Past the actual moment, not just the calendar day: something due at 5pm is
  // late at 5:01pm, and calling it "Today" until midnight would be a lie.
  if (date < now) {
    if (event) {
      const label =
        daysLeft === 0 ? 'Earlier today' : daysLeft === -1 ? 'Yesterday' : `${-daysLeft}d ago`;
      return { date, daysLeft, type: 'past', label };
    }
    const label =
      daysLeft === 0 ? `Late — was ${time}` : daysLeft === -1 ? 'Yesterday' : `${-daysLeft}d late`;
    return { date, daysLeft, type: 'overdue', label };
  }
  if (daysLeft === 0) return { date, daysLeft, type: 'today', label: `Today ${time}` };
  if (daysLeft === 1) return { date, daysLeft, type: 'soon', label: `Tomorrow ${time}` };
  if (daysLeft < 7) return { date, daysLeft, type: 'soon', label: `${shortDay(date)} ${time}` };
  return { date, daysLeft, type: 'later', label: monthDay(date) };
}

// ------------------------------------------------------------- date ranges

// A break as it reads on a settings row: "Nov 26" for one day off, "Nov 24 – 28"
// within a month, "Nov 30 – Dec 4" across one.
export function dayRangeLabel(startDay, endDay) {
  const a = parseDay(startDay);
  const b = parseDay(endDay);
  if (!a || !b) return '';
  if (startDay === endDay) return monthDay(a);
  if (a.getMonth() === b.getMonth()) return `${monthDay(a)} – ${b.getDate()}`;
  return `${monthDay(a)} – ${monthDay(b)}`;
}

// Whole days a range covers, inclusive of both ends — "4 days off" on a break row.
export const dayRangeLength = (startDay, endDay) => {
  const a = parseDay(startDay);
  const b = parseDay(endDay);
  if (!a || !b) return 0;
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
};

// "1h 20m" reads faster than "80 minutes", and both beat a bare timestamp when
// the question is whether there's time to get coffee before the next class.
export function fmtDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
