import { useState } from 'react';
import { colors, fonts, courseColor } from '../theme';
import { dayStr, addDays, endOfDay, toLocalInput, fromLocalInput } from '../dates';
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
  const [due, setDue] = useState(() =>
    assignment ? toLocalInput(assignment.due_at) : toLocalInput(endOfDay(dayStr())),
  );
  const [categoryId, setCategoryId] = useState(assignment?.category_id ?? '');
  const [points, setPoints] = useState(String(assignment?.points_possible ?? 100));
  const [notes, setNotes] = useState(assignment?.notes ?? '');
  const [expanded, setExpanded] = useState(!phone || editing);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const cats = categoriesByCourse.get(courseId) ?? [];
  const canSave = title.trim() && courseId && !busy;

  // Quick date chips beat a calendar for the three dates that cover almost
  // everything, and they land on 11:59pm, which is when work is actually due.
  const setDay = (offset) => setDue(toLocalInput(endOfDay(addDays(dayStr(), offset))));

  async function save() {
    if (!canSave) return;
    setBusy(true);

    const fields = {
      title: title.trim(),
      due_at: fromLocalInput(due),
      category_id: categoryId || null,
      points_possible: Number(points) || 0,
      notes: notes.trim() || null,
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
      title={editing ? 'Edit assignment' : 'New assignment'}
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
          placeholder="Problem Set 4"
          style={input}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
          }}
        />
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

      <Field label="Due">
        <div style={{ display: 'flex', gap: 7, marginBottom: 9, flexWrap: 'wrap' }}>
          <Chip onClick={() => setDay(0)}>Today</Chip>
          <Chip onClick={() => setDay(1)}>Tomorrow</Chip>
          <Chip onClick={() => setDay(7)}>Next week</Chip>
          <Chip onClick={() => setDue('')}>No date</Chip>
        </div>
        <input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          style={input}
        />
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
