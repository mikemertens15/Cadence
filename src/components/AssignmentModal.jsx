import { useState } from 'react';
import { colors, fonts, courseColor } from '../theme';
import { dayStr, addDays, endOfDay, atTime, toLocalInput, fromLocalInput } from '../dates';
import { KINDS, DEFAULT_KIND, isEvent, kindLabel, DEFAULT_EVENT_MINUTES } from '../assignments';
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
// "More". Category and points can be filled in later from the grades table,
// which is where they actually matter.
//
// The kind picker sits second because it changes the rest of the form. A
// problem set is due *by* 11:59pm; a midterm happens *at* 2pm for fifty
// minutes. Same row in the database, but "Due" over a date field is the wrong
// word on an exam, and defaulting an exam to midnight is the wrong time — so
// the label, the quick-pick chips and the default hour all follow from it.

const REMEMBERED_COURSE = 'cadence.lastCourse';

export function AssignmentModal({ assignment, defaultCourseId, onClose, phone }) {
  const {
    courses,
    categoriesByCourse,
    createAssignment,
    updateAssignment,
    deleteAssignment,
  } = useSemester();

  const editing = Boolean(assignment);
  const input = phone ? phoneInputStyle : inputStyle;

  // Most people add several assignments for one course in a sitting, so the
  // course you picked last time is the best guess for this time.
  const [courseId, setCourseId] = useState(
    () =>
      assignment?.course_id ??
      defaultCourseId ??
      remembered(courses) ??
      courses[0]?.id ??
      '',
  );
  const [title, setTitle] = useState(assignment?.title ?? '');
  const [kind, setKind] = useState(assignment?.kind ?? DEFAULT_KIND);
  const [due, setDue] = useState(() =>
    assignment ? toLocalInput(assignment.due_at) : toLocalInput(endOfDay(dayStr())),
  );
  const [duration, setDuration] = useState(
    String(assignment?.duration_min ?? DEFAULT_EVENT_MINUTES),
  );
  const [categoryId, setCategoryId] = useState(assignment?.category_id ?? '');
  const [points, setPoints] = useState(String(assignment?.points_possible ?? 100));
  const [notes, setNotes] = useState(assignment?.notes ?? '');
  const [expanded, setExpanded] = useState(!phone || editing);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cats = categoriesByCourse.get(courseId) ?? [];
  const event = isEvent(kind);
  const canSave = title.trim() && courseId && !busy;

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
    if (!due) return;
    const [day, time] = due.split('T');
    const nowEvent = isEvent(next);
    if (time === '23:59' && nowEvent) setDue(toLocalInput(atTime(day, 9, 0)));
    else if (time === '09:00' && !nowEvent) setDue(toLocalInput(endOfDay(day)));
  };

  async function save() {
    if (!canSave) return;
    setBusy(true);

    const fields = {
      title: title.trim(),
      due_at: fromLocalInput(due),
      category_id: categoryId || null,
      points_possible: Number(points) || 0,
      notes: notes.trim() || null,
      kind,
      // Only the kinds drawn on a schedule have a length. Clearing it on the
      // others means switching a mistyped "Final" back to "Assignment" doesn't
      // leave a stray fifty minutes on a row nothing will ever read it from.
      duration_min: event ? Number(duration) || DEFAULT_EVENT_MINUTES : null,
    };

    if (editing) {
      await updateAssignment(assignment.id, { ...fields, course_id: courseId });
    } else {
      try {
        localStorage.setItem(REMEMBERED_COURSE, courseId);
      } catch {
        // Remembering is a convenience, not a requirement.
      }
      await createAssignment({
        courseId,
        categoryId: fields.category_id,
        title: fields.title,
        dueAt: fields.due_at,
        pointsPossible: fields.points_possible,
        notes: fields.notes,
        kind: fields.kind,
        durationMin: fields.duration_min,
      });
    }

    setBusy(false);
    onClose();
  }

  async function remove() {
    setBusy(true);
    await deleteAssignment(assignment.id);
    setBusy(false);
    onClose();
  }

  return (
    <ModalShell
      title={editing ? `Edit ${kindLabel(kind).toLowerCase()}` : `New ${kindLabel(kind).toLowerCase()}`}
      onClose={onClose}
      phone={phone}
      footer={
        <>
          {editing && (
            <DeleteButton onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
              {confirmDelete ? 'Really delete?' : 'Delete'}
            </DeleteButton>
          )}
          <GhostButton onClick={onClose} style={{ marginLeft: editing ? 0 : 'auto' }}>
            Cancel
          </GhostButton>
          <PrimaryButton onClick={save} disabled={!canSave}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Add'}
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
                onClick={() => {
                  setCourseId(c.id);
                  // Categories belong to a course, so a leftover selection from
                  // the previous one would be meaningless.
                  setCategoryId('');
                }}
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 12 }}>
            <Field label="Category" hint={cats.length ? 'optional' : 'none set up'}>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                style={input}
                disabled={!cats.length}
              >
                <option value="">Not counted</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Out of">
              <input
                type="number"
                min="0"
                step="0.5"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                style={{ ...input, textAlign: 'right' }}
              />
            </Field>
          </div>

          {/* An assignment outside every category is invisible to the grade.
              Say so here rather than letting someone wonder why their average
              didn't move. */}
          {!categoryId && cats.length > 0 && (
            <div
              style={{
                font: `400 11.5px/1.5 ${fonts.sans}`,
                color: colors.faint,
                marginTop: -8,
                marginBottom: 16,
              }}
            >
              Without a category this won&rsquo;t count toward your grade. You can set it later.
            </div>
          )}

          <Field label="Notes" hint="optional">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Chapters 4–5, show work"
              style={{ ...input, resize: 'vertical' }}
            />
          </Field>
        </>
      )}
    </ModalShell>
  );
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
