import { useState, useMemo } from 'react';
import { colors, tone, fonts, courseColor } from '../theme';
import { dayStr, addDays, endOfDay, atTime, toLocalInput, fromLocalInput, parseDay, monthDay } from '../dates';
import {
  KINDS,
  DEFAULT_KIND,
  isEvent,
  kindLabel,
  DEFAULT_EVENT_MINUTES,
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

export function AssignmentModal({ assignment, defaultCourseId, onClose, phone }) {
  const {
    courses,
    categoriesByCourse,
    assignmentsByCourse,
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

  const [due, setDue] = useState(() =>
    assignment ? toLocalInput(assignment.due_at) : toLocalInput(endOfDay(dayStr())),
  );
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
        }),
    ),
  );
  const [notes, setNotes] = useState(assignment?.notes ?? '');
  const [repeat, setRepeat] = useState(false);
  const [times, setTimes] = useState('14');
  const [expanded, setExpanded] = useState(!phone || editing);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cats = categoriesByCourse.get(courseId) ?? [];
  const course = courses.find((c) => c.id === courseId);
  const event = isEvent(kind);
  const canSave = title.trim() && courseId && !busy;

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
  const repeating = repeat && !editing && Boolean(due) && count > 1;

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
    if (!touchedPoints) {
      setPoints(String(suggestPoints({ kind: nextKind, categoryId: s.categoryId, assignments: nextWork })));
    }
  }

  // Quick date chips beat a calendar for the three dates that cover almost
  // everything. Work lands on 11:59pm, which is when work is actually due; an
  // exam lands at 9am, because nobody sits a final at midnight and an hour you
  // have to clear is worse than one you have to confirm.
  const setDay = (offset) => {
    const day = addDays(dayStr(), offset);
    setDue(toLocalInput(event ? atTime(day, 9, 0) : endOfDay(day)));
  };

  /**
   * Switching kind re-times the date, but only the part of it nobody chose.
   *
   * Picking "Final" on a row still sitting at the untouched 11:59pm should move
   * to a believable exam hour; picking it on a row where someone already typed
   * 2:00pm should leave that alone. The test is whether the current time is
   * exactly one of the two defaults — anything else is a deliberate answer.
   */
  const changeKind = (next) => {
    setKind(next);
    applySuggestion(next, courseId);

    if (!due) return;
    const [day, time] = due.split('T');
    const nowEvent = isEvent(next);
    if (time === '23:59' && nowEvent) setDue(toLocalInput(atTime(day, 9, 0)));
    else if (time === '09:00' && !nowEvent) setDue(toLocalInput(endOfDay(day)));
  };

  const changeCourse = (next) => {
    setCourseId(next);
    // Categories belong to a course, so a choice made against the previous
    // one's scheme is not a choice about this one — it's a stale id.
    setTouchedCategory(false);
    applySuggestion(kind, next, { force: true });
  };

  // Every date in the run, so the form can show where it ends before you commit
  // to fourteen rows.
  const dates = useMemo(() => {
    if (!due) return [];
    const [day, time] = due.split('T');
    return Array.from({ length: repeating ? count : 1 }, (_, i) => `${addDays(day, i * 7)}T${time}`);
  }, [due, repeating, count]);

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
      durationMin: event ? Number(duration) || DEFAULT_EVENT_MINUTES : null,
      countsTowardGrade: graded,
    };

    if (editing) {
      await updateAssignment(assignment.id, {
        course_id: courseId,
        category_id: fields.categoryId,
        title: fields.title,
        due_at: fromLocalInput(due),
        points_possible: fields.pointsPossible,
        notes: fields.notes,
        kind,
        duration_min: fields.durationMin,
        counts_toward_grade: graded,
      });
    } else {
      try {
        localStorage.setItem(REMEMBERED_COURSE, courseId);
      } catch {
        // Remembering is a convenience, not a requirement.
      }

      if (repeating) {
        const titles = seriesTitles(fields.title, count);
        await createAssignments(
          titles.map((t, i) => ({ ...fields, title: t, dueAt: fromLocalInput(dates[i]) })),
        );
      } else {
        await createAssignment({ ...fields, dueAt: fromLocalInput(due) });
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
          <Chip onClick={() => setDay(0)}>Today</Chip>
          <Chip onClick={() => setDay(1)}>Tomorrow</Chip>
          <Chip onClick={() => setDay(7)}>Next week</Chip>
          <Chip onClick={() => setDue('')}>No date</Chip>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="datetime-local"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            style={{ ...input, flex: 1, minWidth: 0 }}
          />
          {/* Only an event has a length, and only because the schedule has to
              draw it as a block of some height. */}
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
      </Field>

      {/* ------------------------------------------------------- the run
          A syllabus that says "problem sets due Fridays" is one decision and
          fourteen rows, and typing it out fourteen times is the most tedious
          thing this app has ever asked anyone to do. Hidden while editing,
          because a series is a thing you create rather than a property a row
          has, and hidden without a date, because fourteen undated copies of the
          same row help nobody. */}
      {!editing && due && (
        <Field label="Repeat" hint="every week, from that date">
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip active={!repeat} onClick={() => setRepeat(false)}>
              Just once
            </Chip>
            <Chip active={repeat} onClick={() => setRepeat(true)}>
              Weekly
            </Chip>
            {repeat && (
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
              {count} rows &mdash; {seriesTitles(title.trim() || 'Untitled', count)[0]} through{' '}
              {seriesTitles(title.trim() || 'Untitled', count)[count - 1]}, ending{' '}
              {monthDay(parseDay(dates[count - 1].split('T')[0]))}. Breaks aren&rsquo;t skipped: work
              set over a long weekend is still due.
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
