import { useState, useMemo } from 'react';
import { colors, tone, fonts, courseColor } from '../theme';
import { describeDue } from '../dates';
import { useSemester } from '../data/SemesterProvider';
import { useIsPhone } from '../useMediaQuery';
import { useNow } from '../useNow';
import { isGraded } from '../grading/engine';
import { Card, SectionHeading, EmptyState, DuePill, CourseDot, fmtPoints } from '../components/ui';
import { PrimaryButton, Chip } from '../components/Modal';
import { ScoreInput } from '../components/AssignmentModal';

// Everything due, across every course, in the order it's coming at you.
//
// The buckets are the point. A flat list sorted by date makes you do the
// arithmetic yourself every time you look at it; "Overdue / Today / This week /
// Later" is the same information already answered.

const BUCKETS = [
  ['overdue', 'Overdue', tone.red],
  ['today', 'Today', null],
  ['soon', 'This week', null],
  ['later', 'Later', null],
  ['none', 'No due date', null],
];

export function WorkView({ onOpen, onAdd }) {
  const { assignments, courses, courseById, setScore, updateAssignment } = useSemester();
  const phone = useIsPhone();
  const now = useNow();

  const [courseFilter, setCourseFilter] = useState('all');
  const [showGraded, setShowGraded] = useState(false);

  const { groups, gradedCount } = useMemo(() => {
    const filtered = assignments.filter(
      (a) => courseFilter === 'all' || a.course_id === courseFilter,
    );

    const graded = filtered.filter((a) => isGraded(a));
    const open = filtered.filter((a) => !isGraded(a));

    const rows = (showGraded ? filtered : open)
      .map((a) => ({ a, due: describeDue(a.due_at, now) }))
      // Undated work sorts last; everything else by when it's actually due.
      .sort((x, y) => {
        if (!x.due.date) return y.due.date ? 1 : 0;
        if (!y.due.date) return -1;
        return x.due.date - y.due.date;
      });

    const map = new Map(BUCKETS.map(([key]) => [key, []]));
    for (const row of rows) {
      // A graded assignment has left the queue — it belongs in its own section,
      // not sitting in "Overdue" because it was turned in late.
      const key = showGraded && isGraded(row.a) ? 'graded' : row.due.type;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return { groups: map, gradedCount: graded.length };
  }, [assignments, courseFilter, showGraded, now]);

  if (!courses.length) {
    return (
      <EmptyState
        title="No courses yet"
        body="Assignments hang off a course, so start there — then everything you add shows up here in due order."
      />
    );
  }

  const total = [...groups.values()].reduce((t, g) => t + g.length, 0);

  return (
    <>
      <SectionHeading
        action={
          !phone && <PrimaryButton onClick={onAdd}>Add assignment</PrimaryButton>
        }
      >
        Work
      </SectionHeading>

      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip active={courseFilter === 'all'} onClick={() => setCourseFilter('all')}>
          All
        </Chip>
        {courses.map((c) => (
          <Chip key={c.id} active={courseFilter === c.id} onClick={() => setCourseFilter(c.id)}>
            {c.code || c.name}
          </Chip>
        ))}
        <button
          onClick={() => setShowGraded((v) => !v)}
          style={{
            marginLeft: 'auto',
            font: `600 12.5px ${fonts.sans}`,
            color: showGraded ? colors.accent : colors.muted2,
          }}
        >
          {showGraded ? 'Hide graded' : `Show graded (${gradedCount})`}
        </button>
      </div>

      {total === 0 ? (
        <EmptyState
          title="Nothing due"
          body={
            gradedCount
              ? 'Everything on the list has come back graded. Enjoy it while it lasts.'
              : 'Add an assignment and it will show up here, sorted by when it lands.'
          }
          action={<PrimaryButton onClick={onAdd}>Add assignment</PrimaryButton>}
        />
      ) : (
        [...BUCKETS, ['graded', 'Graded', null]].map(([key, label, accent]) => {
          const rows = groups.get(key) ?? [];
          if (!rows.length) return null;
          return (
            <section key={key} style={{ marginBottom: 26 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  marginBottom: 9,
                  font: `600 12px ${fonts.sans}`,
                  color: accent ?? colors.muted2,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {label}
                <span style={{ color: colors.faint, fontWeight: 500 }}>{rows.length}</span>
              </div>

              <div style={{ display: 'grid', gap: 8 }}>
                {rows.map(({ a, due }) => (
                  <AssignmentRow
                    key={a.id}
                    assignment={a}
                    due={due}
                    course={courseById.get(a.course_id)}
                    phone={phone}
                    onOpen={() => onOpen(a)}
                    onScore={(v) => setScore(a.id, { pointsEarned: v })}
                    onToggleStatus={() =>
                      updateAssignment(a.id, {
                        status: a.status === 'submitted' ? 'todo' : 'submitted',
                      })
                    }
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function AssignmentRow({ assignment: a, due, course, phone, onOpen, onScore, onToggleStatus }) {
  const graded = isGraded(a);
  const submitted = a.status === 'submitted';
  const c = courseColor(course?.color);

  return (
    <Card
      style={{
        padding: phone ? '12px 13px' : '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {/* Turned-in marker. Deliberately separate from the score: handing work in
          and getting it back are different events, often days apart. */}
      <button
        onClick={onToggleStatus}
        aria-label={submitted ? 'Mark as not submitted' : 'Mark as submitted'}
        aria-pressed={submitted}
        style={{
          width: 19,
          height: 19,
          borderRadius: 7,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: graded || submitted ? colors.accent : 'transparent',
          border: graded || submitted ? 'none' : `2px solid ${colors.inputBorder}`,
        }}
      >
        {(graded || submitted) && (
          <span
            style={{
              width: 8,
              height: 4.5,
              borderLeft: `2px solid ${colors.onAccent}`,
              borderBottom: `2px solid ${colors.onAccent}`,
              transform: 'rotate(-45deg)',
              marginTop: -2,
            }}
          />
        )}
      </button>

      <button onClick={onOpen} style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div
          style={{
            font: `600 14px ${fonts.sans}`,
            color: colors.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {a.title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 3,
            font: `500 11.5px ${fonts.sans}`,
            color: colors.muted2,
          }}
        >
          <CourseDot color={course?.color} size={7} />
          <span style={{ color: c.solid }}>{course?.code || course?.name || 'No course'}</span>
          {!phone && a.points_possible > 0 && (
            <span style={{ color: colors.faint }}>· {fmtPoints(a.points_possible)} pts</span>
          )}
        </div>
      </button>

      {/* Score entry lives on the row itself: logging one is the most frequent
          thing anyone does here, and making it a two-click trip through a modal
          would be the difference between doing it and not. */}
      {a.points_possible > 0 && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <ScoreInput assignment={a} onCommit={onScore} width={phone ? 50 : 60} />
          {/* The "/ 100" is reassurance about what the box means. On a phone the
              row can't afford it, and the placeholder dash carries enough. */}
          {!phone && (
            <span
              className="cad-nums"
              style={{ font: `500 11.5px ${fonts.sans}`, color: colors.faint }}
            >
              /{fmtPoints(a.points_possible)}
            </span>
          )}
        </div>
      )}

      <DuePill due={due} done={graded} />
    </Card>
  );
}
