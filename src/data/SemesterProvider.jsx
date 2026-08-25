import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthProvider';
import { dayStr } from '../dates';
import { openPauseMs, focusMinutes, MIN_LOGGED_MINUTES } from '../study';

// One provider for the whole dataset, which is a deliberate departure from
// Tend's hook-per-table arrangement.
//
// Two reasons. First, nothing here is independent: a grade needs categories and
// assignments and the course's credit hours and its scale overrides, all at
// once, and six hooks each opening their own subscription would spend most of
// their time re-fetching each other's dependencies. Second, cumulative GPA is a
// question about every term you've ever taken — and, since 0.3, every term you
// took before this app existed — so "load only the active term" buys nothing.
//
// The dataset is small enough to make that easy: six courses a term, a few
// hundred assignments a year. It all arrives in ten queries on sign-in.
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
  ['priorTerms', 'prior_terms'],
  ['degreePlans', 'degree_plan'],
  ['breaks', 'term_breaks'],
  ['creditApplications', 'credit_applications'],
  ['studySessions', 'study_sessions'],
];

const EMPTY = {
  terms: [],
  courses: [],
  meetings: [],
  categories: [],
  assignments: [],
  scaleOverrides: [],
  priorTerms: [],
  degreePlans: [],
  breaks: [],
  creditApplications: [],
  studySessions: [],
};

export function useSemester() {
  const ctx = useContext(SemesterContext);
  if (!ctx) throw new Error('useSemester must be used inside <SemesterProvider>');
  return ctx;
}

// A client-side id, used only to stamp a batch of assignments as one series.
// Postgres would happily generate it, but the whole batch needs the *same* one
// and a default would give each row its own.
const newId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

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

  /**
   * The token, and not just who it belongs to.
   *
   * Every read below is keyed on this rather than on `userId`, because a token
   * is the thing a read can fail on and the user id is not. A refresh — or a
   * sign-in straight after a refresh that failed — issues a brand new access
   * token while the id stays byte-for-byte the same, so a provider watching
   * only the id has no reason to re-run the reads that just died on the old
   * one. That is exactly what left "Couldn't load your semester" sitting on
   * screen with a working token already in hand, waiting for someone to press
   * Try again: the app had everything it needed and no trigger to use it.
   */
  const accessToken = session?.access_token ?? null;

  const [rows, setRows] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Whether a read has ever come back clean for this user. The distinction
  // between "you have no terms" and "we could not find out whether you have any
  // terms" is the whole difference between showing someone their semester and
  // showing them a first-run wizard over the top of it — see the gate in App.
  const [loaded, setLoaded] = useState(false);
  // The same fact as `loaded`, kept where an effect can read it without taking
  // it as a dependency and re-running itself the moment it flips.
  const everLoaded = useRef(false);
  const [termId, setTermIdState] = useState(() => {
    try {
      return localStorage.getItem(TERM_KEY);
    } catch {
      return null;
    }
  });

  const fetchAll = useCallback(async () => {
    // No token is not the same as no data, but it is the same as nothing to
    // read: a signed-out client can only produce 401s.
    if (!userId || !accessToken) {
      setRows(EMPTY);
      setLoaded(false);
      // Signing out un-loads the app: the next sign-in is a first read again,
      // and it gets the splash rather than a flash of "couldn't load" while the
      // rows are on their way.
      everLoaded.current = false;
      setLoading(false);
      return;
    }

    // RLS already scopes every one of these to this user; the queries don't
    // need a where clause and couldn't widen the result if they had one.
    let results;
    try {
      results = await Promise.all(TABLES.map(([, table]) => supabase.from(table).select('*')));
    } catch (err) {
      // supabase-js normally folds a dead connection into `error` rather than
      // rejecting, but a phone waking up with no signal can throw before the
      // request is even built, and an unhandled rejection here would leave the
      // app stuck on the splash forever.
      setError(err?.message || 'Could not reach Cadence.');
      setLoading(false);
      return;
    }

    const failed = results.find((r) => r.error);
    if (failed) {
      // Deliberately does *not* clear `rows`. A failed refresh on a phone coming
      // out of a pocket is the common case, and blanking the dataset would turn
      // a moment of no signal into an app that says you have no courses — which
      // then routes to "create your first term". Keep what we had, say what went
      // wrong, and let the next refetch heal it.
      setError(failed.error.message);
      setLoading(false);
      return;
    }

    setError('');
    setRows(Object.fromEntries(TABLES.map(([key], i) => [key, results[i].data ?? []])));
    setLoaded(true);
    everLoaded.current = true;
    setLoading(false);
  }, [userId, accessToken]);

  useEffect(() => {
    // Only a first read blocks the app on the splash screen. Now that a token
    // refresh re-runs this — roughly hourly, and that is the point — blanking
    // the whole app to re-read rows already on screen would trade a silent
    // background refetch for a flash of the loading screen every hour.
    if (!everLoaded.current) setLoading(true);
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

  // Re-read when the app comes back to the foreground, or when the network
  // returns.
  //
  // This is what realtime cannot do for you. A phone that has been in a pocket
  // since this morning had its websocket killed by the OS hours ago, and no
  // amount of subscription will deliver what changed in the meantime — the
  // socket comes back empty and confident. Every native app you trust re-reads
  // on resume for exactly this reason, and it doubles as the recovery path for
  // a load that failed while there was no signal.
  useEffect(() => {
    if (!userId) return;

    const onResume = () => {
      if (document.visibilityState === 'visible') fetchAll();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('online', fetchAll);
    window.addEventListener('focus', onResume);

    return () => {
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('online', fetchAll);
      window.removeEventListener('focus', onResume);
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

  // Past semesters, newest first. `position` is the hand-orderable field; the
  // created-at fallback keeps rows added in one sitting in the order they were
  // typed rather than shuffling on every refetch.
  const priorTerms = useMemo(
    () =>
      [...rows.priorTerms].sort(
        (a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)),
      ),
    [rows.priorTerms],
  );

  const priorCredits = useMemo(
    () => priorTerms.reduce((t, p) => t + (Number(p.credit_hours) || 0), 0),
    [priorTerms],
  );

  /**
   * What you're working toward — a list since 1.0, and that is the point.
   *
   * A second degree, a master's on top of it and a minor are three different
   * denominators, and the single row this used to be could only ever describe
   * one of them. `primaryProgram` is what a new course is applied to by default:
   * the first active one, so the ordinary case stays a thing you never touch.
   */
  const programs = useMemo(
    () =>
      [...rows.degreePlans].sort(
        (a, b) => a.position - b.position || String(a.created_at).localeCompare(String(b.created_at)),
      ),
    [rows.degreePlans],
  );

  const primaryProgram = useMemo(
    () => programs.find((p) => p.status === 'active') ?? programs[0] ?? null,
    [programs],
  );

  // course id → the programs it counts toward, and the same for prior terms.
  // Both sides are needed: the course list draws its chips from the first, and
  // the ledger walks every credit source through the second.
  const programIdsByCourse = useMemo(() => {
    const map = new Map();
    for (const r of rows.creditApplications) {
      if (!r.course_id) continue;
      const list = map.get(r.course_id);
      if (list) list.push(r.plan_id);
      else map.set(r.course_id, [r.plan_id]);
    }
    return map;
  }, [rows.creditApplications]);

  const programIdsByPriorTerm = useMemo(() => {
    const map = new Map();
    for (const r of rows.creditApplications) {
      if (!r.prior_term_id) continue;
      const list = map.get(r.prior_term_id);
      if (list) list.push(r.plan_id);
      else map.set(r.prior_term_id, [r.plan_id]);
    }
    return map;
  }, [rows.creditApplications]);

  const breaks = useMemo(() => {
    const list = activeTerm ? rows.breaks.filter((b) => b.term_id === activeTerm.id) : [];
    return list.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
  }, [rows.breaks, activeTerm]);

  /**
   * The break covering a given day, or null.
   *
   * Date columns arrive as 'YYYY-MM-DD' and that format sorts lexicographically,
   * so a string comparison is the whole test — no parsing, and no chance of the
   * timezone bug that eats the first or last day of a break when a date is
   * parsed as UTC midnight and rendered somewhere west of it.
   */
  const breakOn = useCallback(
    (day) => breaks.find((b) => b.start_date <= day && day <= b.end_date) ?? null,
    [breaks],
  );

  // Study blocks for the term in view. Same reasoning as `assignments`: last
  // spring's hours have no business in this week's bars.
  const studySessions = useMemo(
    () => rows.studySessions.filter((s) => courseIds.has(s.course_id)),
    [rows.studySessions, courseIds],
  );

  /**
   * The block running right now, if there is one.
   *
   * There is at most one, and that is a partial unique index in the schema
   * rather than a rule this file keeps — two devices each deciding for
   * themselves whether anything is running is exactly how an afternoon gets
   * counted twice.
   *
   * Searched across every term rather than the one in view: a timer left
   * running has to be findable from wherever you are, or it becomes a row
   * nothing in the app can stop.
   */
  const runningSession = useMemo(
    () => rows.studySessions.find((s) => !s.ended_at) ?? null,
    [rows.studySessions],
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
    async ({
      termId: term,
      name,
      code,
      instructor,
      creditHours,
      color,
      location,
      gradingBasis,
      status,
      meetings: mtgs = [],
      categories: cats = [],
      programIds,
    }) => {
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
          grading_basis: gradingBasis ?? 'graded',
          status: status ?? 'enrolled',
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

      // Which degree this counts toward, defaulted by the caller to whichever
      // one you're mainly doing. An explicit empty list is a real answer — it
      // means a class taken for interest — so it is honoured rather than
      // treated as "nothing supplied, use the default".
      const applied = programIds ?? (primaryProgram ? [primaryProgram.id] : []);
      if (applied.length) {
        await supabase
          .from('credit_applications')
          .insert(applied.map((planId) => ({ plan_id: planId, course_id: course.id })));
      }

      await fetchAll();
      return course;
    },
    [fetchAll, primaryProgram],
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

  // One shape for both the single insert and the bulk one, so a fourteen-week
  // batch cannot drift from what a hand-typed row looks like.
  const assignmentRow = ({
    courseId,
    categoryId,
    title,
    dueAt,
    pointsPossible,
    notes,
    kind,
    durationMin,
    countsTowardGrade,
    seriesId,
  }) => ({
    course_id: courseId,
    category_id: categoryId ?? null,
    title: title?.trim() || 'Untitled',
    due_at: dueAt ?? null,
    points_possible: pointsPossible ?? 100,
    notes: notes?.trim() || null,
    kind: kind ?? 'assignment',
    duration_min: durationMin ?? null,
    counts_toward_grade: countsTowardGrade !== false,
    series_id: seriesId ?? null,
  });

  const createAssignment = useCallback(
    (fields) => run(supabase.from('assignments').insert(assignmentRow(fields)).select().single()),
    [run],
  );

  /**
   * A whole run of work in one insert.
   *
   * "Homework 1 through 14, due every Friday" is one decision, and typing it out
   * fourteen times is the single most tedious thing this app has ever asked
   * anyone to do. They are ordinary assignments from the moment they exist —
   * the shared `series_id` only exists so the batch can be un-made when the
   * syllabus turns out to say Wednesday.
   *
   * One statement rather than fourteen: a partial failure halfway through a loop
   * would leave a mess nobody could see the shape of, and the refetch afterwards
   * would flicker through seven of them.
   */
  const createAssignments = useCallback(
    (items) => {
      if (!items?.length) return null;
      const seriesId = items.length > 1 ? newId() : null;
      return run(
        supabase
          .from('assignments')
          .insert(items.map((it) => assignmentRow({ ...it, seriesId })))
          .select(),
      );
    },
    [run],
  );

  const deleteSeries = useCallback(
    (seriesId) => run(supabase.from('assignments').delete().eq('series_id', seriesId)),
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

  // ------------------------------------------------------ history & degree

  const createPriorTerm = useCallback(
    async ({ name, creditHours, gpa, programIds }) => {
      const created = await run(
        supabase
          .from('prior_terms')
          .insert({
            name: name.trim() || 'Earlier',
            credit_hours: creditHours,
            gpa,
            position: rows.priorTerms.length,
          })
          .select()
          .single(),
      );

      // Old credits count toward the degree by default, because that is what
      // they were for. The exception — the semester of a major you changed out
      // of — is a second row, which is also how you'd have to say it if the
      // GPAs differ.
      const applied = programIds ?? (primaryProgram ? [primaryProgram.id] : []);
      if (created && applied.length) {
        await supabase
          .from('credit_applications')
          .insert(applied.map((planId) => ({ plan_id: planId, prior_term_id: created.id })));
        await fetchAll();
      }
      return created;
    },
    [run, fetchAll, rows.priorTerms.length, primaryProgram],
  );

  const updatePriorTerm = useCallback(
    (id, patch) => {
      patchLocal('priorTerms', id, patch);
      return run(supabase.from('prior_terms').update(patch).eq('id', id));
    },
    [run, patchLocal],
  );

  const deletePriorTerm = useCallback(
    (id) => {
      dropLocal('priorTerms', id);
      return run(supabase.from('prior_terms').delete().eq('id', id));
    },
    [run, dropLocal],
  );

  /**
   * Add a program.
   *
   * A plain insert since 1.0 — the unique-on-user constraint that made this an
   * upsert is gone, because "at most one degree" was the assumption the release
   * exists to remove.
   *
   * New programs land at the end of the list rather than sorted by anything:
   * the order these are drawn in is "the one you're mainly doing, then the
   * others", and only the person doing them knows which that is.
   */
  const createProgram = useCallback(
    async ({ name, kind, level, creditsRequired, gpaGoal, status }) => {
      const first = rows.degreePlans.length === 0;

      const created = await run(
        supabase
          .from('degree_plan')
          .insert({
            name: name?.trim() || null,
            kind: kind ?? 'degree',
            level: level ?? 'undergraduate',
            credits_required: creditsRequired,
            gpa_goal: gpaGoal ?? null,
            status: status ?? 'active',
            position: rows.degreePlans.length,
          })
          .select()
          .single(),
      );

      // The *first* program inherits everything you've already got, because
      // with one program "all of it counts toward this" is what the app has
      // always meant — and a brand-new bar reading 0% next to four years of
      // credits is both wrong and the sort of wrong that makes you stop
      // trusting the number.
      //
      // Only the first. Adding a master's later must not claim every
      // undergraduate course as its own; from the second one on, you say which.
      if (created && first) {
        const links = [
          ...rows.courses.map((c) => ({ plan_id: created.id, course_id: c.id })),
          ...rows.priorTerms.map((t) => ({ plan_id: created.id, prior_term_id: t.id })),
        ];
        if (links.length) {
          await supabase.from('credit_applications').insert(links);
          await fetchAll();
        }
      }

      return created;
    },
    [run, fetchAll, rows.degreePlans.length, rows.courses, rows.priorTerms],
  );

  const updateProgram = useCallback(
    (id, patch) => {
      patchLocal('degreePlans', id, patch);
      return run(supabase.from('degree_plan').update(patch).eq('id', id));
    },
    [run, patchLocal],
  );

  // Cascades to the credit_applications rows pointing at it, which is right:
  // those rows say "this course counts toward that program", and without the
  // program there is no claim left to make. The courses themselves are
  // untouched — deleting a degree has never been a reason to lose a semester.
  const deleteProgram = useCallback(
    (id) => {
      dropLocal('degreePlans', id);
      return run(supabase.from('degree_plan').delete().eq('id', id));
    },
    [run, dropLocal],
  );

  /**
   * Which programs a course (or a lump of prior credits) counts toward.
   *
   * Replaced wholesale rather than diffed. Nothing references these rows — they
   * *are* the reference — so there is nothing a delete could orphan, and a
   * course is applied to two programs at the most.
   */
  const setCreditApplications = useCallback(
    async (key, id, planIds) => {
      const column = key === 'course' ? 'course_id' : 'prior_term_id';
      await supabase.from('credit_applications').delete().eq(column, id);

      const ids = [...new Set(planIds ?? [])];
      if (ids.length) {
        await supabase
          .from('credit_applications')
          .insert(ids.map((planId) => ({ plan_id: planId, [column]: id })));
      }
      await fetchAll();
    },
    [fetchAll],
  );

  const setCoursePrograms = useCallback(
    (courseId, planIds) => setCreditApplications('course', courseId, planIds),
    [setCreditApplications],
  );

  const setPriorTermPrograms = useCallback(
    (priorTermId, planIds) => setCreditApplications('prior', priorTermId, planIds),
    [setCreditApplications],
  );

  const createBreak = useCallback(
    ({ termId: term, name, startDate, endDate }) =>
      run(
        supabase
          .from('term_breaks')
          .insert({
            term_id: term,
            name: name.trim() || 'Day off',
            start_date: startDate,
            end_date: endDate,
          })
          .select()
          .single(),
      ),
    [run],
  );

  const updateBreak = useCallback(
    (id, patch) => {
      patchLocal('breaks', id, patch);
      return run(supabase.from('term_breaks').update(patch).eq('id', id));
    },
    [run, patchLocal],
  );

  const deleteBreak = useCallback(
    (id) => {
      dropLocal('breaks', id);
      return run(supabase.from('term_breaks').delete().eq('id', id));
    },
    [run, dropLocal],
  );

  // ------------------------------------------------------------ study blocks
  //
  // Every one of these writes timestamps from *this device's* clock rather than
  // letting Postgres default them to now(). One clock end to end: elapsed time
  // is read here by subtracting `started_at` from the browser's own now, and a
  // start stamped by a server running a few seconds ahead would make a timer
  // that opens at 00:04, or worse, at minus three.

  // The shape of a finished block, wherever it's finished from.
  const closedRow = (s, now) => ({
    ended_at: now.toISOString(),
    // An open pause is folded in on the way out, so a stored row never carries
    // both an end and a pause, and every finished block reads the same way.
    paused_at: null,
    paused_ms: (Number(s.paused_ms) || 0) + openPauseMs(s, now),
  });

  const startStudy = useCallback(
    async ({ courseId, assignmentId = null, plannedMinutes = null }) => {
      const now = new Date();

      // A block still open when another starts was forgotten rather than
      // stopped. Close it first: the schema only permits one, and the honest
      // reading of a forgotten block is that it ended when you moved on.
      const open = rows.studySessions.find((s) => !s.ended_at);
      if (open) {
        const patch = closedRow(open, now);
        patchLocal('studySessions', open.id, patch);
        await supabase.from('study_sessions').update(patch).eq('id', open.id);
      }

      return run(
        supabase
          .from('study_sessions')
          .insert({
            course_id: courseId,
            assignment_id: assignmentId,
            started_at: now.toISOString(),
            planned_minutes: plannedMinutes,
          })
          .select()
          .single(),
      );
    },
    [rows.studySessions, run, patchLocal],
  );

  const pauseStudy = useCallback(
    (id) => {
      const s = rows.studySessions.find((r) => r.id === id);
      if (!s || s.ended_at || s.paused_at) return null;
      const patch = { paused_at: new Date().toISOString() };
      patchLocal('studySessions', id, patch);
      return run(supabase.from('study_sessions').update(patch).eq('id', id));
    },
    [rows.studySessions, run, patchLocal],
  );

  const resumeStudy = useCallback(
    (id) => {
      const s = rows.studySessions.find((r) => r.id === id);
      if (!s || s.ended_at || !s.paused_at) return null;
      const patch = {
        paused_at: null,
        paused_ms: (Number(s.paused_ms) || 0) + openPauseMs(s, new Date()),
      };
      patchLocal('studySessions', id, patch);
      return run(supabase.from('study_sessions').update(patch).eq('id', id));
    },
    [rows.studySessions, run, patchLocal],
  );

  // Throwing away a block that didn't happen. The bars are only worth reading if
  // a wrong one can be taken back out.
  const deleteStudySession = useCallback(
    (id) => {
      dropLocal('studySessions', id);
      return run(supabase.from('study_sessions').delete().eq('id', id));
    },
    [run, dropLocal],
  );

  /**
   * End a block.
   *
   * `keepMinutes` is the honest exit from a timer left running through dinner.
   * The block ends where it should have — started_at plus the time you actually
   * spent, plus whatever was paused — rather than banking three hours of an
   * empty room. Clamped to what really elapsed, so it can only ever record
   * *less* than the clock, never more.
   */
  const stopStudy = useCallback(
    (id, { keepMinutes = null } = {}) => {
      const s = rows.studySessions.find((r) => r.id === id);
      if (!s || s.ended_at) return null;

      const now = new Date();

      // Started and stopped again within the minute: a misclick, not a session.
      // Dropped rather than stored, because a row reading "0 min" is noise in
      // the one panel that has to be readable at a glance.
      if (focusMinutes(s, now) < MIN_LOGGED_MINUTES) return deleteStudySession(id);

      const patch = closedRow(s, now);

      if (keepMinutes != null) {
        const keep = Math.max(0, Math.min(keepMinutes, focusMinutes(s, now)));
        patch.ended_at = new Date(
          new Date(s.started_at).getTime() + keep * 60000 + patch.paused_ms,
        ).toISOString();
      }

      patchLocal('studySessions', id, patch);
      return run(supabase.from('study_sessions').update(patch).eq('id', id));
    },
    [rows.studySessions, run, patchLocal, deleteStudySession],
  );

  const value = {
    loading,
    loaded,
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
    priorTerms,
    priorCredits,
    programs,
    primaryProgram,
    programIdsByCourse,
    programIdsByPriorTerm,
    breaks,
    breakOn,
    studySessions,
    runningSession,
    // The raw tables, for the one caller that wants exactly what is stored
    // rather than anything derived: the backup. Deliberately last and
    // deliberately named — everything else in here is shaped for a screen.
    rawRows: rows,
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
    createAssignments,
    updateAssignment,
    deleteAssignment,
    deleteSeries,
    setScore,
    createPriorTerm,
    updatePriorTerm,
    deletePriorTerm,
    createProgram,
    updateProgram,
    deleteProgram,
    setCoursePrograms,
    setPriorTermPrograms,
    createBreak,
    updateBreak,
    deleteBreak,
    startStudy,
    pauseStudy,
    resumeStudy,
    stopStudy,
    deleteStudySession,
    refresh: fetchAll,
  };

  return <SemesterContext.Provider value={value}>{children}</SemesterContext.Provider>;
}
