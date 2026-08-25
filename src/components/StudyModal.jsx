import { useState, useMemo } from 'react';
import { colors, fonts, courseColor } from '../theme';
import { describeDue, fmtDuration, fmtMinutes } from '../dates';
import { isEvent } from '../assignments';
import { isGraded } from '../grading/engine';
import { useSemester } from '../data/SemesterProvider';
import { useStudyPlan, useBlockOptions } from '../data/study';
import { useNow } from '../useNow';
import { CourseDot, DuePill } from './ui';
import { ModalShell, Field, Chip, inputStyle, phoneInputStyle, PrimaryButton, GhostButton } from './Modal';

// Overriding the recommendation.
//
// The card names one course; this is where you say "no, Statics" — and it shows
// the whole ranking rather than a bare list of five, because the reason the
// other four lost is the thing that makes disagreeing with the order an
// informed decision instead of a coin toss. The recommendation is a suggestion
// with its working shown, and this is the screen that shows the working.

export function StudyModal({ defaultCourseId, onClose, phone }) {
  const { assignmentsByCourse, startStudy } = useSemester();
  const plan = useStudyPlan();
  const { options, recommended, next } = useBlockOptions();
  const now = useNow();

  const [courseId, setCourseId] = useState(defaultCourseId ?? plan[0]?.course.id ?? null);
  // Null is a real answer — "an hour on Thermo" is a perfectly good plan and
  // demanding a specific assignment for it would just get one picked at random.
  const [assignmentId, setAssignmentId] = useState(null);
  const [minutes, setMinutes] = useState(recommended ?? 50);
  const [busy, setBusy] = useState(false);

  // Work you could actually sit down to: ungraded, dated first, in the order it
  // lands. A graded assignment is finished, and offering it here would be the
  // app suggesting you study for something that already has a score.
  const work = useMemo(() => {
    const rows = (assignmentsByCourse.get(courseId) ?? []).filter((a) => !isGraded(a));
    return rows.sort((a, b) => {
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at) - new Date(b.due_at);
    });
  }, [assignmentsByCourse, courseId]);

  const start = async () => {
    if (!courseId) return;
    setBusy(true);
    await startStudy({ courseId, assignmentId, plannedMinutes: minutes });
    setBusy(false);
    onClose();
  };

  return (
    <ModalShell
      title="Start a block"
      onClose={onClose}
      phone={phone}
      width={520}
      footer={
        <>
          <GhostButton onClick={onClose} style={{ marginLeft: 'auto' }}>
            Cancel
          </GhostButton>
          <PrimaryButton onClick={start} disabled={!courseId || busy}>
            {busy ? 'Starting…' : minutes ? `Start ${fmtDuration(minutes)}` : 'Start'}
          </PrimaryButton>
        </>
      }
    >
      <Field label="Class" hint="in the order they need the time">
        <div style={{ display: 'grid', gap: 7 }}>
          {plan.map((entry) => (
            <CourseOption
              key={entry.course.id}
              entry={entry}
              now={now}
              selected={entry.course.id === courseId}
              onSelect={() => {
                setCourseId(entry.course.id);
                setAssignmentId(null);
              }}
            />
          ))}
        </div>
      </Field>

      <Field label="On" hint="optional">
        <select
          value={assignmentId ?? ''}
          onChange={(e) => setAssignmentId(e.target.value || null)}
          style={phone ? phoneInputStyle : inputStyle}
        >
          <option value="">Nothing in particular</option>
          {work.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="How long"
        hint={
          next
            ? `${next.course?.code || next.course?.name || 'Next up'} at ${fmtMinutes(next.start)}`
            : undefined
        }
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {options.map((o) => (
            <Chip
              key={o.minutes}
              active={minutes === o.minutes}
              onClick={() => setMinutes(o.minutes)}
              // Not disabled, just marked. The app knows about the 2pm class; it
              // doesn't know you've decided to skip it.
              style={o.fits ? undefined : { opacity: 0.5 }}
            >
              {fmtDuration(o.minutes)}
              {o.kind === 'until-next' ? ' · till class' : ''}
            </Chip>
          ))}
          <Chip active={minutes === null} onClick={() => setMinutes(null)}>
            Open ended
          </Chip>
        </div>
      </Field>
    </ModalShell>
  );
}

function CourseOption({ entry, selected, onSelect, now }) {
  const c = courseColor(entry.course.color);
  const soonest = entry.work[0];
  const due = soonest
    ? describeDue(soonest.assignment.due_at, now, { event: isEvent(soonest.assignment.kind) })
    : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        padding: '10px 12px',
        borderRadius: 12,
        background: selected ? c.soft : colors.inputBg,
        border: `1px solid ${selected ? c.solid : colors.inputBorder}`,
        cursor: 'pointer',
      }}
    >
      <CourseDot color={entry.course.color} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            font: `600 13px ${fonts.sans}`,
            color: colors.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {entry.course.code || entry.course.name}
        </span>
        <span style={{ display: 'block', font: `500 11.5px ${fonts.sans}`, color: colors.muted2, marginTop: 2 }}>
          {entry.minutes > 0 ? fmtDuration(entry.minutes) : 'nothing'} of{' '}
          {entry.target > 0 ? fmtDuration(entry.target) : 'no target'} this week
        </span>
      </span>
      {due && <DuePill due={due} />}
    </button>
  );
}
