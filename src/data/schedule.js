import { useMemo, useCallback } from 'react';
import { useSemester } from './SemesterProvider';
import { toMinutes, dowIndex, dayStr } from '../dates';
import { isEvent, eventSlot } from '../assignments';

// What is on a given day — and it has to be a *day*, not a weekday.
//
// Meetings recur weekly and know nothing about the calendar. Exams happen once,
// on a date. Breaks cancel the first and not the second. Answering "what's on
// Tuesday" therefore needs the actual Tuesday in hand, which is why this takes
// a Date rather than a 0–6 index, and why both the dashboard and the schedule
// go through it instead of each growing its own version of the rule.
//
// Since 1.4 it answers a second question the same way: whether the thing is an
// item on the day at all, or a note on something already there. A dynamics exam
// in the dynamics class is not a sixth thing on a five-class Tuesday — it is the
// dynamics block, doing something different — and drawing it as its own row put
// two entries on the screen for one place you have to be. So an exam that sits
// inside a meeting is carried *on* that meeting's block, and only the exams that
// genuinely are somewhere else (an 8am Saturday final in another building) get a
// block of their own.

const CLASS_PREFIX = 'm';
const EVENT_PREFIX = 'e';

export function useSchedule() {
  const { meetings, meetingsByCourse, courseById, assignments, breakOn } = useSemester();

  // Weekly meetings, bucketed by weekday once rather than filtered per render.
  const byDow = useMemo(() => {
    const map = new Map();
    for (const m of meetings) {
      const course = courseById.get(m.course_id);
      if (!course) continue;
      const list = map.get(m.day_of_week) ?? [];
      list.push({
        id: `${CLASS_PREFIX}:${m.id}`,
        // What an exam attaches to. The block id can't serve: it carries a
        // prefix, and matching on a string one side of the app builds and the
        // other takes apart is the sort of coupling that survives exactly until
        // someone changes the prefix.
        meetingId: m.id,
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

  /**
   * Exams, bucketed by the calendar day they fall on.
   *
   * Only the kinds you sit in a room for: a problem set due at 11:59pm is not a
   * place you have to be, and drawing it as a block at the bottom of every day
   * would bury the ones that are.
   *
   * Each one is built as a full block *and* tagged with the meeting it belongs
   * inside, if any. Both, rather than one or the other, because the same exam
   * has to be able to render either way: attached on an ordinary Tuesday, and
   * standing on its own when the class it was attached to isn't running — the
   * week was cancelled, or the meeting has since been deleted. An exam that can
   * only be drawn one way is an exam that disappears the day that way stops
   * applying.
   */
  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const a of assignments) {
      if (!a.due_at || !isEvent(a.kind)) continue;
      const at = new Date(a.due_at);
      if (Number.isNaN(at.getTime())) continue;

      const slot = eventSlot(a, meetingsByCourse.get(a.course_id) ?? []);
      const day = dayStr(at);
      const list = map.get(day) ?? [];
      list.push({
        meetingId: slot.meeting?.id ?? null,
        block: {
          id: `${EVENT_PREFIX}:${a.id}`,
          type: 'event',
          day: dowIndex(at),
          start: slot.start,
          // Clamped so a two-hour final starting at 11pm doesn't draw off the
          // bottom of the grid and take the row height with it.
          end: Math.min(24 * 60 - 1, slot.end),
          course: courseById.get(a.course_id),
          event: { id: a.id, title: a.title, kind: a.kind },
          assignment: a,
        },
      });
      map.set(day, list);
    }
    return map;
  }, [assignments, meetingsByCourse, courseById]);

  /**
   * Everything on one date, plus the break covering it if there is one.
   *
   * A break empties the class list and nothing else. Professors schedule exams
   * and deadlines over long weekends all the time, and an app that quietly hid
   * one because the university called that week a holiday would be making the
   * more expensive mistake of the two — which is exactly why an exam whose class
   * has been cancelled out from under it is promoted to a block of its own here
   * rather than going down with it.
   */
  const blocksOn = useCallback(
    (date) => {
      const day = dayStr(date);
      const off = breakOn(day);
      const onThisDay = eventsByDay.get(day) ?? [];

      const classes = off ? [] : (byDow.get(dowIndex(date)) ?? []);
      const live = new Set(classes.map((c) => c.meetingId));

      const attached = new Map();
      const loose = [];
      for (const e of onThisDay) {
        if (e.meetingId && live.has(e.meetingId)) {
          const list = attached.get(e.meetingId) ?? [];
          list.push(e.block);
          attached.set(e.meetingId, list);
        } else {
          loose.push(e.block);
        }
      }

      const withEvents = classes.map((c) => {
        const events = attached.get(c.meetingId);
        return events?.length ? { ...c, events } : c;
      });

      return {
        off,
        blocks: [...withEvents, ...loose].sort(
          (a, b) => a.start - b.start || a.id.localeCompare(b.id),
        ),
        // Everything happening today that is an exam, however it is drawn.
        // "Is there a test today" has one answer, and it should not depend on
        // whether the test is a row or a badge on a row.
        events: onThisDay.map((e) => e.block),
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
