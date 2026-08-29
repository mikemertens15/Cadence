import { useState, useMemo } from 'react';
import { colors, tone, fonts, courseColor } from '../theme';
import {
  dayStr,
  addDays,
  toLocalInput,
  fromLocalInput,
  parseDay,
  monthDay,
  fmtMinutes,
  fmtTimeRange,
  toMinutes,
  dowIndex,
  HOUR_OPTIONS,
  END_OF_DAY,
  isOffHour,
  labelForTime,
  dayPart,
  timePart,
} from '../dates';
import {
  KINDS,
  DEFAULT_KIND,
  isEvent,
  kindLabel,
  DEFAULT_EVENT_MINUTES,
  meetsOn,
  suggestCategory,
  suggestPoints,
  seriesTitles,
} from '../assignments';
import { useSemester } from '../data/SemesterProvider';
import {
  ModalShell,
  Field,
  Chip,
  inputStyle,
  phoneInputStyle,
  PrimaryButton,
  GhostButton,
  DeleteButton,
} from './Modal';

// Add or edit one assignment.
//
// The mobile case sets the shape: standing outside a lecture hall with a
// syllabus open, wanting "Problem Set 4, Diff Eq, Friday" recorded before the
// next class starts. So course, due date and points all arrive pre-filled, the
// title is the only required field, and everything optional collapses behind
// "More".
//
// The kind picker sits second because it changes the rest of the form. A
// problem set is due *by* 11:59pm; a midterm happens *at* 2pm for fifty
// minutes. Same row in the database, but "Due" over a date field is the wrong
// word on an exam, and defaulting an exam to midnight is the wrong time — so
// the label, the quick-pick chips and the default hour all follow from it.
//
// Two things about time changed in 1.4, both of them subtraction.
//
// **The minutes are gone.** No syllabus has ever said 11:47. It says midnight,
// or before class, or five o'clock — so the minute half of a time picker was a
// field that existed to be left alone, and on a phone it was two extra taps and
// a scroll wheel every single time. An hour is the whole vocabulary. A time
// already stored off the hour keeps its own entry in the list rather than being
// snapped, because quietly moving a deadline somebody set is a worse failure
// than an odd-looking dropdown.
//
// **An exam in class doesn't ask when.** A dynamics exam is the dynamics class
// doing something different on a Tuesday, and the hour is a fact the app has had
// since the course was entered. So when the class meets that day it offers the
// meeting, and the answer is one tap rather than a time and a duration. The rest
// — a common final at 8am on a Saturday in a building you have never been to —
// is what "another time" is still there for.
//
// Since 1.0 the kind decides one more thing, and it's the one that was costing
// the most: **which category the work goes in**. Picking "Quiz" and then picking
// "Quizzes" is the same decision twice, and the second one is the one you skip —
// which is how a quiz ends up outside the grade entirely. See suggestCategory()
// in src/assignments.js for what it looks at and in what order.
//
// The other half of that is the answer "none of them". A course whose syllabus
// reads Exams 60 / Final 40 does not grade homework, and the problem sets it
// hands out are still work you have to do on a date you need to know. Those get
// entered as not graded — a real state, said out loud in the form, rather than
// an empty category field that the grades page then nags about forever.

const REMEMBERED_COURSE = 'cadence.lastCourse';

// The select's value for "this isn't graded", which has to be distinguishable
// from the empty string — that already means "I haven't filed it yet", and the
// entire point is that those two are different answers.
const NOT_GRADED = '\u0000not-graded';

const MAX_REPEAT = 60;

// A stable identity for "this course has no meeting times". `?? []` would be a
// fresh array on every render, and two of the memos below take it as a
// dependency — which would make them run every render and stop being memos.
const NO_MEETINGS = [];

export function AssignmentModal({ assignment, defaultCourseId, onClose, phone }) {
  const {
    courses,
    activeTerm,
    categoriesByCourse,
    assignmentsByCourse,
    meetingsByCourse,
    breakOn,
    createAssignment,
    createAssignments,
    updateAssignment,
    deleteAssignment,
    deleteSeries,
  } = useSemester();

  const editing = Boolean(assignment);
  const input = phone ? phoneInputStyle : inputStyle;

  // Resolved once, before any state, because four initializers need the same
  // answer and `remembered()` reads localStorage — three calls would be three
  // reads racing to agree with each other.
  //
  // Most people add several assignments for one course in a sitting, so the
  // course you picked last time is the best guess for this time.
  const startCourse =
    assignment?.course_id ?? defaultCourseId ?? remembered(courses) ?? courses[0]?.id ?? '';
  const startKind = assignment?.kind ?? DEFAULT_KIND;

  const [courseId, setCourseId] = useState(startCourse);
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [kind, setKind] = useState(startKind);

  // What the app worked out on its own, kept around because the form says it
  // out loud. A guess nobody can see is a guess nobody can correct.
  const [suggestion, setSuggestion] = useState(() =>
    suggestCategory({
      kind: startKind,
      categories: categoriesByCourse.get(startCourse) ?? [],
      assignments: assignmentsByCourse.get(startCourse) ?? [],
    }),
  );

  // Two flags, not one. Touching the category is a statement about this piece of
  // work that the kind picker must stop overriding; touching the points is a
  // separate one. Conflating them meant switching Quiz → Test after typing "25"
  // either kept the wrong points or threw away the right category.
  const [touchedCategory, setTouchedCategory] = useState(false);
  const [touchedPoints, setTouchedPoints] = useState(false);

  // The date and the hour, held apart. They are two separate questions now that
  // the second one has twenty-five answers instead of fourteen hundred, and a
  // combined datetime-local string was only ever being split and rejoined at
  // every point either half was touched.
  const [day, setDay] = useState(() =>
    assignment ? dayPart(toLocalInput(assignment.due_at)) : dayStr(),
  );
  const [time, setTime] = useState(() =>
    assignment ? timePart(toLocalInput(assignment.due_at)) || END_OF_DAY : END_OF_DAY,
  );
  // An exam that happens whenever the class does. True by default for a new
  // event on a day the course meets — which is nearly all of them — and read
  // off the row when editing one.
  const [atClass, setAtClass] = useState(() => assignment?.at_class_time === true);
  const [duration, setDuration] = useState(
    String(assignment?.duration_min ?? DEFAULT_EVENT_MINUTES),
  );
  const [categoryId, setCategoryId] = useState(
    () => assignment?.category_id ?? (assignment ? '' : (suggestion.categoryId ?? '')),
  );
  const [graded, setGraded] = useState(() =>
    assignment ? assignment.counts_toward_grade !== false : !isUngradedReason(suggestion.reason),
  );
  const [points, setPoints] = useState(() =>
    String(
      assignment?.points_possible ??
        suggestPoints({
          kind: startKind,
          categoryId: suggestion.categoryId,
          assignments: assignmentsByCourse.get(startCourse) ?? [],
          fallback:
            (categoriesByCourse.get(startCourse) ?? []).find((c) => c.id === suggestion.categoryId)
              ?.credit_basis === 'completion'
              ? 1
              : 100,
        }),
    ),
  );
  const [notes, setNotes] = useState(assignment?.notes ?? '');
  // 'once' | 'weekly' | 'classes'. A string rather than a boolean since 1.4,
  // because the third one — one row per class meeting, to the end of term — is
  // what a thirty-percent attendance weight is made of.
  const [repeat, setRepeat] = useState('once');
  const [times, setTimes] = useState('14');
  const [expanded, setExpanded] = useState(!phone || editing);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cats = categoriesByCourse.get(courseId) ?? [];
  const course = courses.find((c) => c.id === courseId);
  const event = isEvent(kind);
  const canSave = title.trim() && courseId && !busy;

  const courseMeetings = meetingsByCourse.get(courseId) ?? NO_MEETINGS;

  // The meetings of this course on the chosen day, earliest first. Null when it
  // doesn't meet — which is what decides whether the form asks for an hour at
  // all, and what "In class" is even offered against.
  const slots = useMemo(() => meetsOn(courseMeetings, day), [courseMeetings, day]);

  // Which of them, when a course has a lecture in the morning and a lab in the
  // afternoon. The nearest to the hour already on the row, so an exam moved from
  // one to the other stays where it was put.
  const slot = useMemo(() => {
    if (!slots?.length) return null;
    const want = toMinutes(time || '00:00');
    return slots.reduce((best, m) =>
      Math.abs(toMinutes(m.start_time) - want) < Math.abs(toMinutes(best.start_time) - want) ? m : best,
    );
  }, [slots, time]);

  // In class is a claim that needs a class. A date moved to a day the course
  // doesn't meet un-makes it rather than leaving a flag pointing at nothing.
  const inClass = event && atClass && Boolean(slot);

  // The hour that actually gets stored. An in-class exam takes the class's,
  // which is the entire point of the flag — the row still carries a real instant
  // so everything that sorts by it or counts days to it is untouched.
  const stamp = inClass ? slot.start_time.slice(0, 5) : time;
  const minutes = inClass
    ? toMinutes(slot.end_time) - toMinutes(slot.start_time)
    : Number(duration) || DEFAULT_EVENT_MINUTES;

  // The rest of the batch this row was created with, if any. Only ever within
  // one course — a series is fourteen weeks of one class.
  const siblings = useMemo(
    () =>
      assignment?.series_id
        ? (assignmentsByCourse.get(courseId) ?? []).filter((a) => a.series_id === assignment.series_id)
        : [],
    [assignment?.series_id, assignmentsByCourse, courseId],
  );

  const count = Math.max(1, Math.min(MAX_REPEAT, Math.floor(Number(times)) || 1));

  /**
   * Re-derive what this work is worth and where it goes.
   *
   * Called when the kind or the course changes — never on a plain re-render, and
   * never over a choice someone has made by hand. Picking "Quiz" should move the
   * category; having already picked a category should stop it.
   */
  function applySuggestion(nextKind, nextCourseId, { force = false } = {}) {
    const nextCats = categoriesByCourse.get(nextCourseId) ?? [];
    const nextWork = assignmentsByCourse.get(nextCourseId) ?? [];
    const s = suggestCategory({ kind: nextKind, categories: nextCats, assignments: nextWork });
    setSuggestion(s);

    if (force || !touchedCategory) {
      setCategoryId(s.categoryId ?? '');
      setGraded(!isUngradedReason(s.reason));
    }
    if (!touchedPoints) setPoints(String(pointsFor(s.categoryId, nextCats, nextWork, nextKind)));
  }

  /**
   * What this is probably worth, with one exception the fallback has to know
   * about.
   *
   * A category graded on turning up has no natural point value — nothing was
   * measured — so what it wants is one point each and a count. Falling back to
   * 100 there produces "0 or 100" toggles and a category whose numbers look
   * like scores, which is exactly the impression the completion basis exists to
   * remove.
   */
  function pointsFor(cid, list, work, forKind = kind) {
    const completion = list.find((c) => c.id === cid)?.credit_basis === 'completion';
    return suggestPoints({
      kind: forKind,
      categoryId: cid,
      assignments: work,
      fallback: completion ? 1 : 100,
    });
  }

  // Quick date chips beat a calendar for the three dates that cover almost
  // everything.
  const pickDay = (offset) => setDay(addDays(dayStr(), offset));

  /**
   * Switching kind re-times the row, but only the part of it nobody chose.
   *
   * Picking "Final" on a row still sitting at the untouched 11:59pm should stop
   * being an end-of-day deadline; picking it on a row where someone already
   * chose 2pm should leave that alone. The test is whether the hour is still one
   * of the two defaults — anything else is a deliberate answer.
   *
   * An exam on a day the class meets goes straight to "in class", which is the
   * whole point: the common case now asks for nothing beyond a date.
   */
  const changeKind = (next) => {
    setKind(next);
    applySuggestion(next, courseId);

    const nowEvent = isEvent(next);
    if (!nowEvent) {
      setAtClass(false);
      if (time === '09:00') setTime(END_OF_DAY);
      return;
    }
    if (meetsOn(courseMeetings, day)) setAtClass(true);
    else if (time === END_OF_DAY) setTime('09:00');
  };

  const changeCourse = (next) => {
    setCourseId(next);
    // Categories belong to a course, so a choice made against the previous
    // one's scheme is not a choice about this one — it's a stale id.
    setTouchedCategory(false);
    applySuggestion(kind, next, { force: true });
    // And a meeting belongs to a course too: "in class" against the timetable
    // of the course you just switched away from is not a statement about this
    // one either.
    if (isEvent(kind)) setAtClass(Boolean(meetsOn(meetingsByCourse.get(next) ?? [], day)));
  };

  /**
   * Every date in the run, so the form can show where it ends before you commit
   * to fourteen rows.
   *
   * Three shapes, and the third is the one attendance needs. "Weekly" is a
   * syllabus that says problem sets are due Fridays. "Every class" is a
   * professor who takes a mark for turning up: it walks the timetable to the end
   * of term, one row per meeting, skipping the days a break has already
   * cancelled — because there is no class on Thanksgiving and therefore nothing
   * to turn up to. It takes each meeting's own start time, so a course that
   * meets at 9 on Monday and 2 on Friday lands each row where it belongs.
   */
  const dates = useMemo(() => {
    if (!day) return [];
    if (repeat === 'weekly' && !editing) {
      return Array.from({ length: count }, (_, i) => `${addDays(day, i * 7)}T${stamp}`);
    }
    if (repeat === 'classes' && !editing && courseMeetings.length) {
      const last = activeTerm?.end_date ?? addDays(day, 7 * 16);
      const byDow = new Map();
      for (const m of courseMeetings) {
        const at = toMinutes(m.start_time);
        if (!byDow.has(m.day_of_week) || at < byDow.get(m.day_of_week)) byDow.set(m.day_of_week, at);
      }
      const out = [];
      for (let d = day; d <= last && out.length < MAX_REPEAT; d = addDays(d, 1)) {
        const at = byDow.get(dowIndex(parseDay(d)));
        if (at == null || breakOn(d)) continue;
        const h = String(Math.floor(at / 60)).padStart(2, '0');
        const mm = String(at % 60).padStart(2, '0');
        out.push(`${d}T${h}:${mm}`);
      }
      // No meetings between here and the end of term — a date past the last
      // week, or a course that only meets on days already given over to a
      // break. Falls through to the single row rather than saving nothing,
      // because "Add" pressed on a filled-in form has to add something.
      if (out.length) return out;
    }
    return [`${day}T${stamp}`];
  }, [day, stamp, repeat, count, editing, courseMeetings, activeTerm, breakOn]);

  const repeating = !editing && Boolean(day) && dates.length > 1;

  async function save() {
    if (!canSave) return;
    setBusy(true);

    const fields = {
      courseId,
      categoryId: graded ? categoryId || null : null,
      title: title.trim(),
      pointsPossible: Number(points) || 0,
      notes: notes.trim() || null,
      kind,
      // Only the kinds drawn on a schedule have a length. Clearing it on the
      // others means switching a mistyped "Final" back to "Assignment" doesn't
      // leave a stray fifty minutes on a row nothing will ever read it from.
      durationMin: event ? minutes : null,
      countsTowardGrade: graded,
      atClassTime: inClass,
    };

    if (editing) {
      await updateAssignment(assignment.id, {
        course_id: courseId,
        category_id: fields.categoryId,
        title: fields.title,
        due_at: day ? fromLocalInput(dates[0]) : null,
        points_possible: fields.pointsPossible,
        notes: fields.notes,
        kind,
        duration_min: fields.durationMin,
        counts_toward_grade: graded,
        at_class_time: inClass,
      });
    } else {
      try {
        localStorage.setItem(REMEMBERED_COURSE, courseId);
      } catch {
        // Remembering is a convenience, not a requirement.
      }

      if (repeating) {
        const titles = seriesTitles(fields.title, dates.length);
        await createAssignments(
          titles.map((t, i) => ({ ...fields, title: t, dueAt: fromLocalInput(dates[i]) })),
        );
      } else {
        await createAssignment({ ...fields, dueAt: day ? fromLocalInput(dates[0]) : null });
      }
    }

    setBusy(false);
    onClose();
  }

  async function remove(whole) {
    setBusy(true);
    if (whole) await deleteSeries(assignment.series_id);
    else await deleteAssignment(assignment.id);
    setBusy(false);
    onClose();
  }

  const heading = editing
    ? `Edit ${kindLabel(kind).toLowerCase()}`
    : repeating
      ? `New ${kindLabel(kind).toLowerCase()}s`
      : `New ${kindLabel(kind).toLowerCase()}`;

  return (
    <ModalShell
      title={heading}
      onClose={onClose}
      phone={phone}
      footer={
        <>
          {editing && (
            <DeleteButton onClick={() => (confirmDelete ? remove(false) : setConfirmDelete(true))}>
              {confirmDelete ? 'Really delete?' : 'Delete'}
            </DeleteButton>
          )}
          <GhostButton onClick={onClose} style={{ marginLeft: editing ? 0 : 'auto' }}>
            Cancel
          </GhostButton>
          <PrimaryButton onClick={save} disabled={!canSave}>
            {busy ? 'Saving\u2026' : editing ? 'Save' : repeating ? `Add ${count}` : 'Add'}
          </PrimaryButton>
        </>
      }
    >
      <Field label="What is it?">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={event ? 'Exam 2' : 'Problem Set 4'}
          style={input}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
      </Field>

      <Field label="Kind">
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {KINDS.map(([key, label]) => (
            <Chip key={key} active={kind === key} onClick={() => changeKind(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Course">
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {courses.map((c) => {
            const active = c.id === courseId;
            const col = courseColor(c.color);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => changeCourse(c.id)}
                style={{
                  padding: '9px 13px',
                  borderRadius: 12,
                  font: `600 12.5px ${fonts.sans}`,
                  background: active ? col.soft : colors.inputBg,
                  color: active ? col.solid : colors.muted2,
                  border: `1px solid ${active ? col.solid : colors.cardBorder}`,
                }}
              >
                {c.code || c.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field
        label={event ? 'When is it?' : 'Due'}
        hint={event ? 'goes on your schedule' : undefined}
      >
        <div style={{ display: 'flex', gap: 7, marginBottom: 9, flexWrap: 'wrap' }}>
          <Chip onClick={() => pickDay(0)}>Today</Chip>
          <Chip onClick={() => pickDay(1)}>Tomorrow</Chip>
          <Chip onClick={() => pickDay(7)}>Next week</Chip>
          <Chip onClick={() => setDay('')}>No date</Chip>
        </div>

        <input
          type="date"
          value={day}
          onChange={(e) => {
            setDay(e.target.value);
            // A date on a day the class meets is an in-class exam by default,
            // and a date on a day it doesn't cannot be one at all.
            if (event) setAtClass(Boolean(meetsOn(courseMeetings, e.target.value)));
          }}
          style={{ ...input, width: '100%' }}
        />

        {/* An exam on a day the class meets asks nothing else. The hour, the
            room and the fifty minutes are all already in the timetable, and
            asking for them again is asking someone to re-type what they told
            the app in week one. */}
        {event && day && slots?.length > 0 && (
          <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip active={atClass} onClick={() => setAtClass(true)}>
              In class
            </Chip>
            <Chip active={!atClass} onClick={() => setAtClass(false)}>
              Another time
            </Chip>
            {inClass && slots.length === 1 && (
              <span style={{ font: `500 12px ${fonts.sans}`, color: colors.muted2 }}>
                {fmtTimeRange(toMinutes(slot.start_time), toMinutes(slot.end_time))}
              </span>
            )}
          </div>
        )}

        {/* Which meeting, for a course with a lecture in the morning and a lab
            after lunch. Only ever drawn when there genuinely are two. */}
        {inClass && slots.length > 1 && (
          <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
            {slots.map((m) => (
              <Chip
                key={m.id}
                active={m.id === slot.id}
                onClick={() => setTime(m.start_time.slice(0, 5))}
              >
                {fmtMinutes(toMinutes(m.start_time))}
              </Chip>
            ))}
          </div>
        )}

        {day && !inClass && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 9 }}>
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              aria-label={event ? 'What time it starts' : 'What time it is due'}
              style={{ ...input, flex: 1, minWidth: 0 }}
            >
              {/* A time typed in before this app only offered hours keeps its
                  own entry, rather than being quietly rounded to one. */}
              {isOffHour(time) && <option value={time}>{labelForTime(time)}</option>}
              {HOUR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            {/* Only an event has a length, and only because the schedule has to
                draw it as a block of some height. An in-class one takes the
                class's, so the field isn't there to be answered. */}
            {event && (
              <>
                <input
                  type="number"
                  min="5"
                  step="5"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  aria-label="How long it lasts, in minutes"
                  style={{ ...input, width: 74, textAlign: 'right' }}
                />
                <span style={{ font: `500 12px ${fonts.sans}`, color: colors.muted2 }}>min</span>
              </>
            )}
          </div>
        )}
      </Field>

      {/* ------------------------------------------------------- the run
          A syllabus that says "problem sets due Fridays" is one decision and
          fourteen rows, and typing it out fourteen times is the most tedious
          thing this app has ever asked anyone to do. Hidden while editing,
          because a series is a thing you create rather than a property a row
          has, and hidden without a date, because fourteen undated copies of the
          same row help nobody. */}
      {!editing && day && (
        <Field label="Repeat" hint="from that date onward">
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip active={repeat === 'once'} onClick={() => setRepeat('once')}>
              Just once
            </Chip>
            <Chip active={repeat === 'weekly'} onClick={() => setRepeat('weekly')}>
              Weekly
            </Chip>
            {/* One row per class, to the end of term. A thirty-percent
                attendance weight is thirty-odd rows that all say the same
                thing, and typing them out is the single most tedious thing this
                app could ask for — so it reads them off the timetable instead. */}
            {courseMeetings.length > 0 && (
              <Chip active={repeat === 'classes'} onClick={() => setRepeat('classes')}>
                Every class
              </Chip>
            )}
            {repeat === 'weekly' && (
              <>
                <input
                  type="number"
                  min="2"
                  max={MAX_REPEAT}
                  value={times}
                  onChange={(e) => setTimes(e.target.value)}
                  aria-label="How many weeks"
                  style={{ ...input, width: 70, textAlign: 'right' }}
                />
                <span style={{ font: `500 12px ${fonts.sans}`, color: colors.muted2 }}>weeks</span>
              </>
            )}
          </div>

          {repeating && (
            <div
              style={{
                font: `400 11.5px/1.5 ${fonts.sans}`,
                color: colors.faint,
                marginTop: 8,
              }}
            >
              {dates.length} rows &mdash; {seriesTitles(title.trim() || 'Untitled', dates.length)[0]}{' '}
              through {seriesTitles(title.trim() || 'Untitled', dates.length)[dates.length - 1]},
              ending {monthDay(parseDay(dayPart(dates[dates.length - 1])))}.{' '}
              {repeat === 'classes'
                ? 'One per meeting, with days off already taken out.'
                : 'Breaks aren\u2019t skipped: work set over a long weekend is still due.'}
            </div>
          )}
        </Field>
      )}

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
        >
          + Points, category, notes
        </button>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: graded ? '1fr 110px' : '1fr', gap: 12 }}>
            <Field label="Counts as" hint={cats.length ? undefined : 'no scheme set up'}>
              <select
                value={graded ? categoryId : NOT_GRADED}
                onChange={(e) => {
                  const v = e.target.value;
                  setTouchedCategory(true);
                  setGraded(v !== NOT_GRADED);
                  setCategoryId(v === NOT_GRADED ? '' : v);
                  if (!touchedPoints && v && v !== NOT_GRADED) {
                    setPoints(String(pointsFor(v, cats, assignmentsByCourse.get(courseId) ?? [])));
                  }
                }}
                style={input}
              >
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="">{cats.length ? 'Decide later' : 'Not filed'}</option>
                <option value={NOT_GRADED}>Not graded</option>
              </select>
            </Field>

            {/* Points on something nobody scores is a field with no meaning, so
                it goes away rather than sitting there at 100 implying otherwise. */}
            {graded && (
              <Field label="Out of">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={points}
                  onChange={(e) => {
                    setPoints(e.target.value);
                    setTouchedPoints(true);
                  }}
                  style={{ ...input, textAlign: 'right' }}
                />
              </Field>
            )}
          </div>

          <GradingNote
            graded={graded}
            categoryId={categoryId}
            cats={cats}
            course={course}
            suggestion={suggestion}
            touched={touchedCategory}
            onFile={() => {
              setTouchedCategory(true);
              setGraded(true);
              setCategoryId(cats[0]?.id ?? '');
            }}
          />

          <Field label="Notes" hint="optional">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Chapters 4\u20135, show work"
              style={{ ...input, resize: 'vertical' }}
            />
          </Field>
        </>
      )}

      {/* Fourteen rows created in one action should be removable in one action.
          Offered only from a row that is actually part of a batch, and only
          after the ordinary Delete has been considered — this is the bigger of
          the two and shouldn't be the easier one to hit. */}
      {editing && siblings.length > 1 && (
        <div style={{ marginTop: 4 }}>
          <button
            type="button"
            onClick={() => remove(true)}
            style={{ font: `600 12px ${fonts.sans}`, color: tone.red }}
          >
            Delete all {siblings.length} in this series
          </button>
        </div>
      )}
    </ModalShell>
  );
}

const isUngradedReason = (reason) => reason === 'ungraded' || reason === 'history-ungraded';

/**
 * The sentence under the category picker.
 *
 * There are three things worth saying here and they are easy to confuse, so
 * each one names the state it is about:
 *
 *   not graded          this is deliberate, and here is why we thought so
 *   no category yet     this *is* a gap, and it will cost you a grade
 *   filed automatically small, and only when a guess was actually made, so the
 *                       guess is checkable rather than invisible
 */
function GradingNote({ graded, categoryId, cats, course, suggestion, touched, onFile }) {
  const box = (color, children) => (
    <div
      style={{
        font: `400 11.5px/1.55 ${fonts.sans}`,
        color,
        background: colors.inputBg,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: 11,
        padding: '9px 12px',
        marginTop: -8,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );

  if (!graded) {
    const named = course?.code || course?.name;
    return box(
      colors.muted2,
      <>
        Still on your list with its due date &mdash; it just doesn&rsquo;t touch your grade.
        {!touched && suggestion.reason === 'ungraded' && named && (
          <>
            {' '}
            {named} is graded on {cats.map((c) => c.name).join(', ')}, and none of those is a home
            for this.
          </>
        )}
        {cats.length > 0 && (
          <>
            {' '}
            <button
              type="button"
              onClick={onFile}
              style={{ font: `600 11.5px ${fonts.sans}`, color: colors.accent }}
            >
              It is graded
            </button>
          </>
        )}
      </>,
    );
  }

  // An assignment outside every category is invisible to the grade. Say so here
  // rather than letting someone wonder why their average didn't move.
  if (!categoryId && cats.length > 0) {
    return box(
      tone.amberText,
      <>Without a category this won&rsquo;t count toward your grade. You can set it later.</>,
    );
  }

  if (!touched && categoryId && (suggestion.reason === 'history' || suggestion.reason === 'name')) {
    const name = cats.find((c) => c.id === categoryId)?.name;
    return (
      <div
        style={{
          font: `400 11.5px/1.5 ${fonts.sans}`,
          color: colors.faint,
          marginTop: -8,
          marginBottom: 16,
        }}
      >
        {suggestion.reason === 'history'
          ? `Filed under ${name}, same as the last one in this course.`
          : `Filed under ${name}.`}
      </div>
    );
  }

  return null;
}

function remembered(courses) {
  try {
    const id = localStorage.getItem(REMEMBERED_COURSE);
    return courses.some((c) => c.id === id) ? id : null;
  } catch {
    return null;
  }
}

// Small inline score editor, used by the grades table and the work list. Holds
// its own draft so a half-typed "9" in a 95 never briefly becomes the score, and
// commits on blur or Enter.
export function ScoreInput({ assignment, onCommit, width = 62 }) {
  const [draft, setDraft] = useState(
    assignment.points_earned == null ? '' : String(assignment.points_earned),
  );
  const [focused, setFocused] = useState(false);

  // While the field isn't being edited, the row's real value wins — a realtime
  // update from another device should show up here too.
  const shown = focused
    ? draft
    : assignment.points_earned == null
      ? ''
      : String(assignment.points_earned);

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    const current = assignment.points_earned == null ? null : Number(assignment.points_earned);
    if (next === current || (next != null && !Number.isFinite(next))) return;
    onCommit(next);
  };

  return (
    <input
      value={shown}
      onFocus={() => {
        setFocused(true);
        setDraft(assignment.points_earned == null ? '' : String(assignment.points_earned));
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(assignment.points_earned == null ? '' : String(assignment.points_earned));
          e.currentTarget.blur();
        }
      }}
      inputMode="decimal"
      placeholder="—"
      aria-label={`Score for ${assignment.title}`}
      className="cad-nums"
      style={{
        width,
        border: `1px solid ${colors.inputBorder}`,
        background: colors.inputBg,
        borderRadius: 9,
        padding: '7px 9px',
        font: `600 13px ${fonts.sans}`,
        color: colors.ink,
        outline: 'none',
        textAlign: 'right',
      }}
    />
  );
}

/**
 * Present or missed, for the work that is graded on having been there.
 *
 * A thirty-percent attendance weight is thirty rows of in-class activities that
 * nobody marks for correctness, and typing "20 out of 20" thirty times is both
 * tedious and a small lie about what was measured — nothing was. So it writes
 * full marks or a zero, which is the same arithmetic the professor is doing, and
 * asks the question the professor actually asked.
 *
 * Three states, not two. Blank is "hasn't happened yet" and is the one an
 * ungraded row starts in; a missed class is a real zero and has to be
 * distinguishable from a Thursday that hasn't come round yet, or the category
 * would count absences you haven't taken.
 */
export function PresentSwitch({ assignment: a, graded, possible, onScore }) {
  const earned = Number(a.points_earned);
  const here = graded && earned > 0;
  const missed = graded && earned <= 0;

  const button = (label, active, tint, onClick) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '6px 11px',
        borderRadius: 9,
        font: `600 11.5px ${fonts.sans}`,
        background: active ? tint : colors.inputBg,
        color: active ? colors.onAccent : colors.muted2,
        border: `1px solid ${active ? tint : colors.inputBorder}`,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
      {/* Tapping the state it is already in clears it, which is the only way
          back to "hasn't happened yet" — and the state you want the moment you
          mark the wrong Thursday. */}
      {button('Here', here, colors.accent, () => onScore(a.id, here ? null : possible || 1))}
      {button('Missed', missed, tone.red, () => onScore(a.id, missed ? null : 0))}
    </div>
  );
}
