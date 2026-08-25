import { useMemo } from 'react';
import { useSemester } from './SemesterProvider';
import { useSchedule } from './schedule';
import { useTermGrades } from './grades';
import { useNow } from '../useNow';
import { weekSummary, studyPlan, blockOptions, targetMinutes } from '../study';

// The seam between the study math and the app's data, in the same shape as
// grades.js and for the same reason: everything here gathers rows and hands
// them to src/study.js, so there is exactly one implementation of what an hour
// is worth and which class is owed one.

/**
 * This week, per course.
 *
 * Ticks on the minute, so a block running right now grows its own bar rather
 * than sitting at whatever it was when the page loaded.
 */
export function useStudyWeek() {
  const { courses, studySessions } = useSemester();
  const now = useNow();

  return useMemo(
    () => weekSummary({ courses, sessions: studySessions, now }),
    [courses, studySessions, now],
  );
}

/**
 * Which class should get the next hour, and why.
 *
 * The entries are useTermGrades() — course, computed grade, scale — with the
 * course's assignments joined on. That reuse is the point: the ranking's view
 * of a grade is the same object the grades page draws, so the two can't tell
 * you different things about the same course.
 */
export function useStudyPlan() {
  const { studySessions, assignmentsByCourse } = useSemester();
  const termGrades = useTermGrades();
  const now = useNow();

  return useMemo(() => {
    const entries = termGrades.map(({ course, grade, scale }) => ({
      course,
      grade,
      scale,
      assignments: assignmentsByCourse.get(course.id) ?? [],
    }));
    return studyPlan({ entries, sessions: studySessions, now });
  }, [termGrades, assignmentsByCourse, studySessions, now]);
}

/**
 * The block running right now, with the things it points at resolved.
 *
 * Deliberately carries no clock: elapsed time is read by whatever draws it,
 * against its own tick. A hook that ticked here would re-render every consumer
 * once a second for the sake of the one component showing a countdown.
 */
export function useRunningStudy() {
  const { runningSession, courseById, allAssignments } = useSemester();

  return useMemo(() => {
    if (!runningSession) return null;
    return {
      session: runningSession,
      course: courseById.get(runningSession.course_id) ?? null,
      assignment: runningSession.assignment_id
        ? (allAssignments.find((a) => a.id === runningSession.assignment_id) ?? null)
        : null,
    };
  }, [runningSession, courseById, allAssignments]);
}

/**
 * How long a block can be before you have to be somewhere.
 *
 * "Somewhere" is a class or an exam — the two things on the schedule you sit in
 * a room for. Work due at 11:59pm is not a place to be and doesn't shorten
 * anything; the deadline's job is to decide *which* course, which it does in
 * the ranking above.
 */
export function useBlockOptions() {
  const { blocksOn } = useSchedule();
  const now = useNow();

  return useMemo(() => {
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const { blocks } = blocksOn(now);
    const next = blocks.find((b) => b.start > nowMinutes) ?? null;
    return {
      ...blockOptions({ nowMinutes, nextStartMinutes: next?.start ?? null }),
      next,
    };
  }, [blocksOn, now]);
}

// The weekly target a course is working to, whether it was typed in or worked
// out from the credits. One import for the two screens that show it.
export { targetMinutes };
