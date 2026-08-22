import { useMemo, useCallback } from 'react';
import { useSemester } from './SemesterProvider';
import { toMinutes, dowIndex, dayStr } from '../dates';
import { isEvent, eventMinutes } from '../assignments';

// What is on a given day — and it has to be a *day*, not a weekday.
//
// Meetings recur weekly and know nothing about the calendar. Exams happen once,
// on a date. Breaks cancel the first and not the second. Answering "what's on
// Tuesday" therefore needs the actual Tuesday in hand, which is why this takes
// a Date rather than a 0–6 index, and why both the dashboard and the schedule
// go through it instead of each growing its own version of the rule.

const CLASS_PREFIX = 'm';
const EVENT_PREFIX = 'e';

export function useSchedule() {
  const { meetings, courseById, assignments, breakOn } = useSemester();

  // Weekly meetings, bucketed by weekday once rather than filtered per render.
  const byDow = useMemo(() => {
    const map = new Map();
    for (const m of meetings) {
      const course = courseById.get(m.course_id);
      if (!course) continue;
      const list = map.get(m.day_of_week) ?? [];
      list.push({
        id: `${CLASS_PREFIX}:${m.id}`,
        type: 'class',
        day: m.day_of_week,
        start: toMinutes(m.start_time),
        end: toMinutes(m.end_time),
        course,
      });
      map.set(m.day_of_week, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start);
    return map;
  }, [meetings, courseById]);

  // Exams, bucketed by the calendar day they fall on. Only the kinds you sit in
  // a room for: a problem set due at 11:59pm is not a place you have to be, and
  // drawing it as a block at the bottom of every day would bury the ones that
  // are.
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const a of assignments) {
      if (!a.due_at || !isEvent(a.kind)) continue;
      const at = new Date(a.due_at);
      if (Number.isNaN(at.getTime())) continue;

      const start = at.getHours() * 60 + at.getMinutes();
      const day = dayStr(at);
      const list = map.get(day) ?? [];
      list.push({
        id: `${EVENT_PREFIX}:${a.id}`,
        type: 'event',
        day: dowIndex(at),
        start,
        // Clamped so a two-hour final starting at 11pm doesn't draw off the
        // bottom of the grid and take the row height with it.
        end: Math.min(24 * 60 - 1, start + eventMinutes(a)),
        course: courseById.get(a.course_id),
        event: { id: a.id, title: a.title, kind: a.kind },
        assignment: a,
      });
      map.set(day, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.start - b.start);
    return map;
  }, [assignments, courseById]);

  /**
   * Everything on one date, plus the break covering it if there is one.
   *
   * A break empties the class list and nothing else. Professors schedule exams
   * and deadlines over long weekends all the time, and an app that quietly hid
   * one because the university called that week a holiday would be making the
   * more expensive mistake of the two.
   */
  const blocksOn = useCallback(
    (date) => {
      const day = dayStr(date);
      const off = breakOn(day);
      const classes = off ? [] : (byDow.get(dowIndex(date)) ?? []);
      const events = eventsByDay.get(day) ?? [];
      return {
        off,
        blocks: [...classes, ...events].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)),
      };
    },
    [byDow, eventsByDay, breakOn],
  );

  // Is there anything at all to draw? Distinguishes "no meeting times entered
  // yet" from "this particular week happens to be empty", which want different
  // empty states.
  const hasAnything = byDow.size > 0 || eventsByDay.size > 0;

  return { blocksOn, byDow, eventsByDay, hasAnything };
}
