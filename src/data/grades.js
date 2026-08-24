import { useMemo } from 'react';
import { useSemester } from './SemesterProvider';
import { dayStr } from '../dates';
import {
  gradeCourse,
  neededOnRemaining,
  gpaFor,
  degreeProgress,
  courseStanding,
  summarizeCredits,
  termGpaPlan,
} from '../grading/engine';
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
 *
 * Cumulative additionally carries the semesters that happened before this app
 * did. Without them "cumulative" means "this one term", which for anyone past
 * their freshman fall is not a number they'd recognise — and is exactly the
 * number a bad midterm makes look catastrophic.
 */
export function useGpa() {
  const { allCourses, activeTerm, priorTerms, categoriesByCourse, assignmentsByCourse, scaleByCourse } =
    useSemester();

  return useMemo(() => {
    // The whole course row travels with the entry, because `grading_basis` and
    // `status` decide whether it belongs in a GPA at all and the engine is the
    // one place that gets to make that call.
    const entries = allCourses.map((course) => {
      const grade = gradeCourse({
        categories: categoriesByCourse.get(course.id) ?? [],
        assignments: assignmentsByCourse.get(course.id) ?? [],
        scale: scaleFor(scaleByCourse.get(course.id)),
      });
      return { ...course, termId: course.term_id, creditHours: course.credit_hours, letter: grade.letter };
    });

    const priors = priorTerms.map((p) => ({ creditHours: p.credit_hours, gpa: p.gpa }));

    return {
      term: gpaFor(entries.filter((e) => e.termId === activeTerm?.id)),
      cumulative: gpaFor(entries, priors),
      hasHistory: priors.length > 0,
    };
  }, [allCourses, activeTerm, priorTerms, categoriesByCourse, assignmentsByCourse, scaleByCourse]);
}

/**
 * Where every credit you have goes, and how far along each program is.
 *
 * The question this replaces is "how far through the degree are you", which had
 * exactly one answer and needed exactly one number. Six years in, that is the
 * wrong shape: there is a degree, possibly a second one, maybe some graduate
 * hours, and a handful of classes taken because they looked interesting — and
 * "169 credits out of 120" describes none of them.
 *
 * Two things come back. `programs` is one entry per thing you're working
 * toward, each with its own bar and its own GPA (a graduate GPA is genuinely
 * its own number, not a contribution to an undergraduate one). `ledger` is the
 * accounting underneath: what your credits add up to, how many are shared
 * between programs, and how many are pointed at nothing.
 *
 * A term's credits count as *earned* once it's over and as *in progress* while
 * you're in it — decided by the term's own end date rather than by whether every
 * course in it has a grade, because a term ends on a date and a straggling
 * professor shouldn't move the bar. Terms that haven't started are left out of
 * both: credits you've registered for are not credits you're carrying.
 */
export function usePrograms() {
  const {
    terms,
    allCourses,
    programs,
    priorTerms,
    programIdsByCourse,
    programIdsByPriorTerm,
    categoriesByCourse,
    assignmentsByCourse,
    scaleByCourse,
  } = useSemester();

  return useMemo(() => {
    const today = dayStr();

    const stateOf = (termId) => {
      const t = terms.find((x) => x.id === termId);
      if (!t) return 'earned';
      if (t.end_date < today) return 'earned';
      if (t.start_date <= today) return 'inProgress';
      return 'future';
    };

    const courseEntries = allCourses.map((course) => ({
      course,
      credits: Number(course.credit_hours) || 0,
      programIds: programIdsByCourse.get(course.id) ?? [],
      state: stateOf(course.term_id),
      earnsCredit: courseStanding(course).earnsCredit,
    }));

    const priorEntries = priorTerms.map((t) => ({
      prior: t,
      credits: Number(t.credit_hours) || 0,
      programIds: programIdsByPriorTerm.get(t.id) ?? [],
      state: 'earned',
      earnsCredit: true,
    }));

    const ledger = summarizeCredits({
      programs,
      entries: [...courseEntries, ...priorEntries],
    });

    // A course's letter is needed for the per-program GPA, and computing it once
    // here beats computing it inside the loop for every program it touches.
    const lettered = courseEntries.map((e) => ({
      ...e,
      entry: {
        ...e.course,
        creditHours: e.course.credit_hours,
        letter: gradeCourse({
          categories: categoriesByCourse.get(e.course.id) ?? [],
          assignments: assignmentsByCourse.get(e.course.id) ?? [],
          scale: scaleFor(scaleByCourse.get(e.course.id)),
        }).letter,
      },
    }));

    const rows = programs.map((plan) => {
      const credits = ledger.byProgram.get(plan.id) ?? { earned: 0, inProgress: 0 };

      const progress = degreeProgress({
        creditsRequired: plan.credits_required,
        // A program's earned total already has its share of the old credits in
        // it, so there is nothing left for `priorCredits` to add — the split
        // that matters here is banked against in-progress.
        priorCredits: 0,
        doneCredits: credits.earned,
        inProgressCredits: credits.inProgress,
      });

      const gpa = gpaFor(
        lettered.filter((e) => e.programIds.includes(plan.id)).map((e) => e.entry),
        priorEntries
          .filter((e) => e.programIds.includes(plan.id))
          .map((e) => ({ creditHours: e.prior.credit_hours, gpa: e.prior.gpa })),
      );

      return { plan, progress, gpa, credits };
    });

    return {
      programs: rows,
      ledger,
      // Null until someone says what they're working toward. The UI uses this to
      // choose between an invitation and a set of bars.
      configured: programs.length > 0,
    };
  }, [
    terms,
    allCourses,
    programs,
    priorTerms,
    programIdsByCourse,
    programIdsByPriorTerm,
    categoriesByCourse,
    assignmentsByCourse,
    scaleByCourse,
  ]);
}

/**
 * "What do I need in each class to finish the term at X?"
 *
 * The per-course solver already answers "what do I need on the work left in
 * *this* course". This is that question asked of the whole term at once, and it
 * chains the two: the engine works out the letter each course needs assuming
 * the others hold, and then — because a letter is a cutoff on that course's own
 * scale — the same bisection solver that powers the course page turns that
 * cutoff into a score on the work actually remaining.
 *
 * So the sentence at the end is "Heat Transfer needs a B, which means 88% on
 * the four assignments left", and both halves of it come from code that is
 * already keeping the live grade honest.
 */
export function useTermGpaPlan(target) {
  const { courses, categoriesByCourse, assignmentsByCourse, scaleByCourse } = useSemester();

  return useMemo(() => {
    const entries = courses.map((course) => {
      const categories = categoriesByCourse.get(course.id) ?? [];
      const assignments = assignmentsByCourse.get(course.id) ?? [];
      const scale = scaleFor(scaleByCourse.get(course.id));
      const grade = gradeCourse({ categories, assignments, scale });
      return {
        ...course,
        creditHours: course.credit_hours,
        letter: grade.letter,
        pct: grade.pct,
        scale,
        categories,
        assignments,
      };
    });

    const plan = termGpaPlan(entries, target);
    const byId = new Map(entries.map((e) => [e.id, e]));

    return {
      ...plan,
      courses: plan.courses.map((row) => {
        const e = byId.get(row.id);
        return {
          ...row,
          course: e,
          currentPct: e?.pct ?? null,
          // Only worth solving when there is a cutoff to aim at. "Already
          // yours" and "out of reach" have nothing left to ask the solver.
          solved:
            row.status === 'reachable' && row.neededPct != null && e
              ? neededOnRemaining(
                  { categories: e.categories, assignments: e.assignments, scale: e.scale },
                  row.neededPct,
                )
              : null,
        };
      }),
    };
  }, [courses, categoriesByCourse, assignmentsByCourse, scaleByCourse, target]);
}
