import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { dayStr } from '../dates';

// One provider for the whole dataset, which is a deliberate departure from
// Tend's hook-per-table arrangement.
//
// Two reasons. First, nothing here is independent: a grade needs categories and
// assignments and the course's credit hours and its scale overrides, all at
// once, and six hooks each opening their own subscription would spend most of
// their time re-fetching each other's dependencies. Second, cumulative GPA is a
// question about every term you've ever taken, so "load only the active term"
// buys nothing — the whole table has to be here anyway.
//
// The dataset is small enough to make that easy: six courses a term, a few
// hundred assignments a year. It all arrives in six queries on sign-in.
//
// Rows travel in database shape (`points_possible`, not `pointsPossible`). The
// grading engine reads them directly, and a translation layer in between would
// only be somewhere for the two to drift apart.

const SemesterContext = createContext(null);

const TERM_KEY = 'cadence.term';

const TABLES = [
  ['terms', 'terms'],
  ['courses', 'courses'],
  ['meetings', 'meetings'],
  ['categories', 'grading_categories'],
  ['assignments', 'assignments'],
  ['scaleOverrides', 'grade_scale_overrides'],
];

const EMPTY = {
  terms: [],
  courses: [],
  meetings: [],
  categories: [],
  assignments: [],
  scaleOverrides: [],
};

export function useSemester() {
  const ctx = useContext(SemesterContext);
  if (!ctx) throw new Error('useSemester must be used inside <SemesterProvider>');
  return ctx;
}

const groupBy = (rows, key) => {
  const map = new Map();
  for (const r of rows) {
    const list = map.get(r[key]);
    if (list) list.push(r);
    else map.set(r[key], [r]);
  }
  return map;
};

export function SemesterProvider({ children }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [termId, setTermIdState] = useState(() => {
    try {
      return localStorage.getItem(TERM_KEY);
    } catch {
      return null;
    }
  });

  const fetchAll = useCallback(async () => {
    if (!userId) {
      setRows(EMPTY);
      setLoading(false);
      return;
    }
    // RLS already scopes every one of these to this user; the queries don't
    // need a where clause and couldn't widen the result if they had one.
    const results = await Promise.all(TABLES.map(([, table]) => supabase.from(table).select('*')));

    const failed = results.find((r) => r.error);
    if (failed) {
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setError('');
    setRows(Object.fromEntries(TABLES.map(([key], i) => [key, results[i].data ?? []])));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  // Live sync across devices. Every table funnels into one debounced refetch:
  // saving a course writes a course row, four category rows and three meeting
  // rows, and without the debounce that single action would trigger eight
  // round-trips to re-read the same state.
  const refetchTimer = useRef(null);
  useEffect(() => {
    if (!userId) return;

    const bump = () => {
      clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(fetchAll, 150);
    };

    let channel = supabase.channel(`cadence:${userId}`);
    for (const [, table] of TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        bump,
      );
    }
    channel.subscribe();

    return () => {
      clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchAll]);

  // Optimistic local edits, so entering a score feels instant instead of
  // waiting out a round-trip. The write still happens; if it fails we re-read
  // and the optimistic version disappears.
  const patchLocal = useCallback((key, id, patch) => {
    setRows((r) => ({ ...r, [key]: r[key].map((row) => (row.id === id ? { ...row, ...patch } : row)) }));
  }, []);

  const dropLocal = useCallback((key, id) => {
    setRows((r) => ({ ...r, [key]: r[key].filter((row) => row.id !== id) }));
  }, []);

  // ------------------------------------------------------------- derived

  const terms = useMemo(
    () => [...rows.terms].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date))),
    [rows.terms],
  );

  // The term to open on: the stored choice if it still exists, otherwise the
  // one today falls inside, otherwise the most recent. A student opening the
  // app mid-semester should never have to pick.
  const activeTerm = useMemo(() => {
    if (!terms.length) return null;
    const stored = terms.find((t) => t.id === termId);
    if (stored) return stored;
    const today = dayStr();
    return terms.find((t) => t.start_date <= today && t.end_date >= today) ?? terms[0];
  }, [terms, termId]);

  const setTermId = useCallback((id) => {
    try {
      localStorage.setItem(TERM_KEY, id);
    } catch {
      // Not being able to remember the choice shouldn't stop it applying now.
    }
    setTermIdState(id);
  }, []);

  const courses = useMemo(() => {
    const list = activeTerm ? rows.courses.filter((c) => c.term_id === activeTerm.id) : [];
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [rows.courses, activeTerm]);

  const courseIds = useMemo(() => new Set(courses.map((c) => c.id)), [courses]);
  const courseById = useMemo(() => new Map(rows.courses.map((c) => [c.id, c])), [rows.courses]);

  const meetingsByCourse = useMemo(() => groupBy(rows.meetings, 'course_id'), [rows.meetings]);
  const categoriesByCourse = useMemo(() => {
    const map = groupBy(rows.categories, 'course_id');
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [rows.categories]);
  const assignmentsByCourse = useMemo(() => groupBy(rows.assignments, 'course_id'), [rows.assignments]);
  const scaleByCourse = useMemo(() => groupBy(rows.scaleOverrides, 'course_id'), [rows.scaleOverrides]);

  // Assignments for the term in view, which is what every list in the app shows
  // — an old term's homework has no business in "due this week".
  const assignments = useMemo(
    () => rows.assignments.filter((a) => courseIds.has(a.course_id)),
    [rows.assignments, courseIds],
  );

  const meetings = useMemo(
    () => rows.meetings.filter((m) => courseIds.has(m.course_id)),
    [rows.meetings, courseIds],
  );

  // ------------------------------------------------------------- mutators

  // Every write goes through here: run it, refetch on success, surface the
  // message on failure. Without the refetch a new row would have no id locally
  // until realtime happened to deliver it.
  const run = useCallback(
    async (thenable) => {
      const { data, error: err } = await thenable;
      if (err) {
        setError(err.message);
        await fetchAll();
        return null;
      }
      setError('');
      await fetchAll();
      return data;
    },
    [fetchAll],
  );

  const createTerm = useCallback(
    async ({ name, startDate, endDate }) => {
      const data = await run(
        supabase
          .from('terms')
          .insert({ name: name.trim(), start_date: startDate, end_date: endDate })
          .select()
          .single(),
      );
      if (data) setTermId(data.id);
      return data;
    },
    [run, setTermId],
  );

  const updateTerm = useCallback(
    (id, patch) => run(supabase.from('terms').update(patch).eq('id', id)),
    [run],
  );

  const deleteTerm = useCallback(
    (id) => run(supabase.from('terms').delete().eq('id', id)),
    [run],
  );

  /**
   * Create a course together with its meeting times and grading scheme.
   *
   * One call rather than three screens: the setup flow asks for all of it at
   * once because a course without a grading scheme can't produce a grade, and
   * a half-built course is the thing most likely to be abandoned.
   */
  const createCourse = useCallback(
    async ({ termId: term, name, code, instructor, creditHours, color, location, meetings: mtgs = [], categories: cats = [] }) => {
      const { data: course, error: err } = await supabase
        .from('courses')
        .insert({
          term_id: term,
          name: name.trim(),
          code: code?.trim() || null,
          instructor: instructor?.trim() || null,
          credit_hours: creditHours,
          color,
          location: location?.trim() || null,
        })
        .select()
        .single();

      if (err) {
        setError(err.message);
        return null;
      }

      // Children are inserted after the parent exists, so a failure here leaves
      // a real course you can finish editing rather than nothing at all.
      if (mtgs.length) {
        await supabase.from('meetings').insert(
          mtgs.map((m) => ({
            course_id: course.id,
            day_of_week: m.day,
            start_time: m.start,
            end_time: m.end,
          })),
        );
      }
      if (cats.length) {
        await supabase.from('grading_categories').insert(
          cats.map((c, i) => ({
            course_id: course.id,
            name: c.name.trim(),
            weight_pct: c.weight,
            drop_lowest_n: c.drop ?? 0,
            position: i,
          })),
        );
      }

      await fetchAll();
      return course;
    },
    [fetchAll],
  );

  const updateCourse = useCallback(
    (id, patch) => {
      patchLocal('courses', id, patch);
      return run(supabase.from('courses').update(patch).eq('id', id));
    },
    [run, patchLocal],
  );

  const deleteCourse = useCallback(
    (id) => {
      dropLocal('courses', id);
      return run(supabase.from('courses').delete().eq('id', id));
    },
    [run, dropLocal],
  );

  // Meetings are replaced wholesale. They carry no references from anywhere
  // else, so there's nothing a delete could orphan, and diffing seven rows
  // would be more code than it saves.
  const setMeetings = useCallback(
    async (courseId, mtgs) => {
      await supabase.from('meetings').delete().eq('course_id', courseId);
      if (mtgs.length) {
        await supabase.from('meetings').insert(
          mtgs.map((m) => ({
            course_id: courseId,
            day_of_week: m.day,
            start_time: m.start,
            end_time: m.end,
          })),
        );
      }
      await fetchAll();
    },
    [fetchAll],
  );

  /**
   * Save a course's grading scheme.
   *
   * Categories are diffed rather than replaced, unlike meetings: assignments
   * point at them, and `on delete set null` means a delete-and-reinsert would
   * silently unhook every graded assignment in the course from its category —
   * turning a rename of "Homework" into a wiped-out grade.
   */
  const setCategories = useCallback(
    async (courseId, cats) => {
      const existing = categoriesByCourse.get(courseId) ?? [];
      const keptIds = new Set(cats.filter((c) => c.id).map((c) => c.id));

      const removed = existing.filter((c) => !keptIds.has(c.id));
      if (removed.length) {
        await supabase
          .from('grading_categories')
          .delete()
          .in('id', removed.map((c) => c.id));
      }

      for (const [i, c] of cats.entries()) {
        const payload = {
          name: c.name.trim(),
          weight_pct: c.weight,
          drop_lowest_n: c.drop ?? 0,
          position: i,
        };
        if (c.id) await supabase.from('grading_categories').update(payload).eq('id', c.id);
        else await supabase.from('grading_categories').insert({ course_id: courseId, ...payload });
      }

      await fetchAll();
    },
    [categoriesByCourse, fetchAll],
  );

  // A course's letter cutoffs. Passing an empty list clears the override, which
  // puts the course back on the default straight scale.
  const setScale = useCallback(
    async (courseId, scale) => {
      await supabase.from('grade_scale_overrides').delete().eq('course_id', courseId);
      if (scale?.length) {
        await supabase.from('grade_scale_overrides').insert(
          scale.map((s) => ({ course_id: courseId, letter: s.letter, min_pct: s.min })),
        );
      }
      await fetchAll();
    },
    [fetchAll],
  );

  const createAssignment = useCallback(
    ({ courseId, categoryId, title, dueAt, pointsPossible, notes }) =>
      run(
        supabase
          .from('assignments')
          .insert({
            course_id: courseId,
            category_id: categoryId ?? null,
            title: title.trim() || 'Untitled',
            due_at: dueAt ?? null,
            points_possible: pointsPossible ?? 100,
            notes: notes?.trim() || null,
          })
          .select()
          .single(),
      ),
    [run],
  );

  const updateAssignment = useCallback(
    (id, patch) => {
      patchLocal('assignments', id, patch);
      return run(supabase.from('assignments').update(patch).eq('id', id));
    },
    [run, patchLocal],
  );

  const deleteAssignment = useCallback(
    (id) => {
      dropLocal('assignments', id);
      return run(supabase.from('assignments').delete().eq('id', id));
    },
    [run, dropLocal],
  );

  /**
   * Record (or clear) a score.
   *
   * Status follows the score rather than being tracked separately: entering one
   * means it came back graded, and clearing one puts the assignment back in the
   * pile of work still ahead of you. Keeping the two in sync by hand is exactly
   * the sort of bookkeeping this app exists to remove.
   */
  const setScore = useCallback(
    (id, { pointsEarned = null, scorePct = null } = {}) => {
      const scored = pointsEarned != null || scorePct != null;
      const patch = {
        points_earned: pointsEarned,
        score_pct: scorePct,
        status: scored ? 'graded' : 'todo',
      };
      patchLocal('assignments', id, patch);
      return run(supabase.from('assignments').update(patch).eq('id', id));
    },
    [run, patchLocal],
  );

  const value = {
    loading,
    error,
    terms,
    activeTerm,
    setTermId,
    courses,
    courseById,
    meetings,
    assignments,
    allAssignments: rows.assignments,
    allCourses: rows.courses,
    meetingsByCourse,
    categoriesByCourse,
    assignmentsByCourse,
    scaleByCourse,
    createTerm,
    updateTerm,
    deleteTerm,
    createCourse,
    updateCourse,
    deleteCourse,
    setMeetings,
    setCategories,
    setScale,
    createAssignment,
    updateAssignment,
    deleteAssignment,
    setScore,
    refresh: fetchAll,
  };

  return <SemesterContext.Provider value={value}>{children}</SemesterContext.Provider>;
}
