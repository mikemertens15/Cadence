import { useMemo } from 'react';
import { useSemester } from './SemesterProvider';
import { gradeCourse, neededOnRemaining, gpaFor } from '../grading/engine';
import { scaleFor } from '../grading/scale';

// The seam between the pure grade math and the app's data. Everything here just
// gathers the right rows and hands them to src/grading/engine.js — no math of
// its own, so there's exactly one implementation of what a grade is.

// Shared frozen default, so `useCourseGrade(id)` with no overrides keeps a
// stable identity across renders.
export const EMPTY_OVERRIDES = Object.freeze({});

/**
 * Everything the grade UI needs for one course.
 *
 * `overrides` drives the what-if simulator (assignment id → hypothetical
 * percentage). Callers must memoize it — an object literal would be a new
 * identity every render and defeat the memo below.
 */
export function useCourseGrade(courseId, overrides = EMPTY_OVERRIDES) {
  const { categoriesByCourse, assignmentsByCourse, scaleByCourse } = useSemester();

  return useMemo(() => {
    const categories = categoriesByCourse.get(courseId) ?? [];
    const assignments = assignmentsByCourse.get(courseId) ?? [];
    const scale = scaleFor(scaleByCourse.get(courseId));

    return {
      // Note what is deliberately *not* re-exported here: `categories`.
      // gradeCourse already returns a categories array — the computed one,
      // carrying each category's average, its dropped scores and what's still
      // outstanding. Spreading the raw rows back over the top would silently
      // replace it with data that has none of that.
      ...gradeCourse({ categories, assignments, overrides, scale }),
      scale,
      assignments,
      solve: (target) => neededOnRemaining({ categories, assignments, overrides, scale }, target),
    };
  }, [courseId, categoriesByCourse, assignmentsByCourse, scaleByCourse, overrides]);
}

// Current standing in every course of the term in view, in the same order the
// course list uses.
export function useTermGrades() {
  const { courses, categoriesByCourse, assignmentsByCourse, scaleByCourse } = useSemester();

  return useMemo(
    () =>
      courses.map((course) => {
        const scale = scaleFor(scaleByCourse.get(course.id));
        const grade = gradeCourse({
          categories: categoriesByCourse.get(course.id) ?? [],
          assignments: assignmentsByCourse.get(course.id) ?? [],
          scale,
        });
        return { course, grade, scale };
      }),
    [courses, categoriesByCourse, assignmentsByCourse, scaleByCourse],
  );
}

/**
 * Term and cumulative GPA.
 *
 * Both are computed from *current* standing, not from a final grade someone
 * typed in — mid-semester the honest answer to "what's my GPA" is "what it
 * would be if the term ended today", and that's the number worth watching.
 * Courses with no graded work yet are left out rather than counted as zero.
 */
export function useGpa() {
  const { allCourses, activeTerm, categoriesByCourse, assignmentsByCourse, scaleByCourse } =
    useSemester();

  return useMemo(() => {
    const entries = allCourses.map((course) => {
      const grade = gradeCourse({
        categories: categoriesByCourse.get(course.id) ?? [],
        assignments: assignmentsByCourse.get(course.id) ?? [],
        scale: scaleFor(scaleByCourse.get(course.id)),
      });
      return { termId: course.term_id, creditHours: course.credit_hours, letter: grade.letter };
    });

    return {
      term: gpaFor(entries.filter((e) => e.termId === activeTerm?.id)),
      cumulative: gpaFor(entries),
    };
  }, [allCourses, activeTerm, categoriesByCourse, assignmentsByCourse, scaleByCourse]);
}
