import { useState } from 'react';
import { colors, tone, fonts, courseColor } from '../theme';
import { fmtDuration } from '../dates';
import { useSemester } from '../data/SemesterProvider';
import { useStudyWeek } from '../data/study';
import { MINUTES_PER_CREDIT } from '../study';
import { Card, SectionHeading, CourseDot, ProgressBar } from './ui';
import { inputStyle } from './Modal';

// Where the week actually went.
//
// This is the half of the feature that fixes the complaint. A timer alone tells
// you that you spent three hours on something; five bars side by side tell you
// those three hours were the reason two other classes got none — which is a
// thing you can only see if all five are drawn against what each was supposed
// to get.
//
// Bars against the target rather than against each other, because "60% of what
// this class needed" survives a week where you studied twice as much as usual
// and a percentage of the total does not.

// Above this share, one class has eaten the week and it's worth saying in a
// sentence rather than leaving to be read off five bars.
const LOPSIDED_SHARE = 50;

export function StudyWeek() {
  const { rows, logged, target, unattributed } = useStudyWeek();
  const [editing, setEditing] = useState(false);

  if (!rows.length) return null;

  const top = rows[0];
  const lopsided = rows.length > 1 && logged > 0 && top.share >= LOPSIDED_SHARE && top.minutes > 0;

  return (
    <section style={{ minWidth: 0 }}>
      <SectionHeading
        action={
          <button
            onClick={() => setEditing((e) => !e)}
            style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
          >
            {editing ? 'Done' : 'Targets'}
          </button>
        }
      >
        This week
      </SectionHeading>

      <Card style={{ padding: '14px 16px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 13 }}>
          <span style={{ font: `500 19px ${fonts.sans}`, color: colors.ink }}>
            {fmtDuration(logged)}
          </span>
          <span style={{ font: `500 12.5px ${fonts.sans}`, color: colors.muted2 }}>
            of {fmtDuration(target)} planned
          </span>
        </div>

        <div style={{ display: 'grid', gap: editing ? 12 : 11 }}>
          {rows.map((row) =>
            editing ? (
              <TargetRow key={row.course.id} row={row} />
            ) : (
              <WeekRow key={row.course.id} row={row} />
            ),
          )}
        </div>

        {/* The sentence the bars are for. Only when it's true — a week that was
            reasonably split doesn't need telling. */}
        {!editing && lopsided && (
          <div
            style={{
              font: `500 12px/1.5 ${fonts.sans}`,
              color: colors.muted,
              marginTop: 13,
              paddingTop: 12,
              borderTop: `1px solid ${colors.divider}`,
            }}
          >
            {Math.round(top.share)}% of your week went to{' '}
            {top.course.code || top.course.name}.
          </div>
        )}

        {/* Hours logged against a course that has since gone. Said out loud so
            the bars and the total can't look like they disagree. */}
        {!editing && unattributed > 0 && (
          <div style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, marginTop: 9 }}>
            {fmtDuration(unattributed)} logged against a course that&rsquo;s no longer here.
          </div>
        )}

        {editing && (
          <div style={{ font: `500 11.5px/1.5 ${fonts.sans}`, color: colors.muted2, marginTop: 13 }}>
            Blank follows the credit hours — {MINUTES_PER_CREDIT / 60} hours a week per credit.
          </div>
        )}
      </Card>
    </section>
  );
}

function WeekRow({ row }) {
  const { course, minutes, target, pct } = row;
  const c = courseColor(course.color);
  const met = target > 0 && minutes >= target;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
        <CourseDot color={course.color} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            font: `600 12.5px ${fonts.sans}`,
            color: colors.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {course.code || course.name}
        </span>
        <span
          style={{
            font: `500 12px ${fonts.mono}`,
            color: minutes > 0 ? colors.muted : colors.faint,
          }}
        >
          {fmtDuration(minutes)}
        </span>
        <span style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, minWidth: 52, textAlign: 'right' }}>
          {target > 0 ? `of ${fmtDuration(target)}` : 'no target'}
        </span>
      </div>
      <ProgressBar pct={pct ?? 0} fill={met ? tone.green : c.solid} height={5} />
    </div>
  );
}

/**
 * The target, editable in hours.
 *
 * Hours because that is the unit anyone thinks in — "six hours a week on
 * Thermo" — while the column stores minutes so a 90-minute lab target doesn't
 * need a fraction. Empty clears it back to the credit-hour default rather than
 * storing a zero, which means something different and specific: no target at
 * all, for a course you have decided not to track.
 */
function TargetRow({ row }) {
  const { updateCourse } = useSemester();
  const { course, target } = row;
  const stored = course.weekly_study_minutes;
  const [value, setValue] = useState(stored == null ? '' : String(stored / 60));

  const commit = () => {
    const text = value.trim();
    if (!text) {
      setValue('');
      if (stored != null) updateCourse(course.id, { weekly_study_minutes: null });
      return;
    }
    const hours = Number(text);
    if (!Number.isFinite(hours) || hours < 0) {
      setValue(stored == null ? '' : String(stored / 60));
      return;
    }
    const minutes = Math.round(hours * 60);
    if (minutes !== stored) updateCourse(course.id, { weekly_study_minutes: minutes });
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <CourseDot color={course.color} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          font: `600 12.5px ${fonts.sans}`,
          color: colors.ink,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {course.code || course.name}
      </span>
      <input
        type="number"
        min="0"
        step="0.5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        placeholder={String(target / 60)}
        aria-label={`Weekly hours for ${course.name}`}
        style={{ ...inputStyle, width: 78, padding: '7px 9px', textAlign: 'right' }}
      />
      <span style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, width: 40 }}>
        h/wk
      </span>
    </div>
  );
}
