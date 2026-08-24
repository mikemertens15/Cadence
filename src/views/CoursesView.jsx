import { useMemo } from 'react';
import { colors, fonts, courseColor } from '../theme';
import { DAY_NAMES, toMinutes, fmtMinutes, parseDay, monthDay } from '../dates';
import { useSemester } from '../data/SemesterProvider';
import { useIsPhone } from '../useMediaQuery';
import { Card, SectionHeading, EmptyState, CourseDot, fmtCredits } from '../components/ui';
import { courseTag } from '../courses';
import { PrimaryButton, GhostButton } from '../components/Modal';

// The setup tab: what you're taking, when it meets, how each one is graded.
// Everything here is editable, but nothing here needs looking at week to week —
// which is exactly why it isn't on the dashboard.

export function CoursesView({ onAddCourse, onEditCourse, onManageTerms }) {
  const { courses, activeTerm, meetingsByCourse, categoriesByCourse, assignmentsByCourse } =
    useSemester();
  const phone = useIsPhone();

  const totalCredits = useMemo(
    () => courses.reduce((t, c) => t + (Number(c.credit_hours) || 0), 0),
    [courses],
  );

  return (
    <>
      <SectionHeading action={<PrimaryButton onClick={onAddCourse}>Add course</PrimaryButton>}>
        Courses
      </SectionHeading>

      {activeTerm && (
        <Card style={{ padding: '14px 18px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `600 13.5px ${fonts.sans}`, color: colors.ink }}>{activeTerm.name}</div>
            <div style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, marginTop: 3 }}>
              {monthDay(parseDay(activeTerm.start_date))} – {monthDay(parseDay(activeTerm.end_date))} ·{' '}
              {courses.length} course{courses.length === 1 ? '' : 's'} · {fmtCredits(totalCredits)} credits
            </div>
          </div>
          <GhostButton onClick={onManageTerms}>Terms</GhostButton>
        </Card>
      )}

      {!courses.length ? (
        <EmptyState
          title="Nothing here yet"
          body="Add a course with its meeting times and grading scheme. That one form is all the setup this app needs."
          action={<PrimaryButton onClick={onAddCourse}>Add your first course</PrimaryButton>}
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {courses.map((course) => {
            const c = courseColor(course.color);
            const cats = categoriesByCourse.get(course.id) ?? [];
            const count = (assignmentsByCourse.get(course.id) ?? []).length;

            return (
              <Card
                key={course.id}
                as="button"
                onClick={() => onEditCourse(course)}
                style={{ padding: phone ? '15px 16px' : '17px 20px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ paddingTop: 4 }}>
                    <CourseDot color={course.color} size={11} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ font: `600 14.5px ${fonts.sans}`, color: colors.ink }}>
                      {course.name}
                    </div>
                    <div style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, marginTop: 3 }}>
                      {[
                        course.code,
                        course.instructor,
                        `${fmtCredits(course.credit_hours)} cr`,
                        course.location,
                        // Only when it isn't the ordinary case: a P/F lab or a
                        // course you withdrew from behaves differently in every
                        // number on the page, and the list is where you'd look
                        // to find out which one it was.
                        courseTag(course),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>

                    <div style={{ font: `500 11.5px ${fonts.sans}`, color: c.solid, marginTop: 8 }}>
                      {meetingSummary(meetingsByCourse.get(course.id) ?? [])}
                    </div>

                    <div style={{ font: `400 11.5px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 5 }}>
                      {cats.length
                        ? cats.map((k) => `${k.name} ${Math.round(Number(k.weight_pct))}%`).join(' · ')
                        : 'No grading scheme yet — this course can’t produce a grade'}
                    </div>
                    <div style={{ font: `400 11.5px ${fonts.sans}`, color: colors.faint, marginTop: 4 }}>
                      {count} assignment{count === 1 ? '' : 's'}
                    </div>
                  </div>
                  <span style={{ font: `600 12px ${fonts.sans}`, color: colors.accent, flexShrink: 0 }}>
                    Edit
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

// "MWF 9 AM · T 2 PM" — meeting rows collapsed back into the shorthand a
// student would use out loud, grouped by the time they share.
function meetingSummary(meetings) {
  if (!meetings.length) return 'No meeting times set';

  const groups = new Map();
  for (const m of meetings) {
    const key = `${m.start_time}|${m.end_time}`;
    const g = groups.get(key) ?? { days: [], start: toMinutes(m.start_time) };
    g.days.push(m.day_of_week);
    groups.set(key, g);
  }

  return [...groups.values()]
    .sort((a, b) => a.start - b.start)
    .map((g) => {
      const days = [...new Set(g.days)].sort((a, b) => a - b).map((d) => shortDayLetter(d)).join('');
      return `${days} ${fmtMinutes(g.start)}`;
    })
    .join(' · ');
}

// M T W R F S U — the single-letter form timetables have used forever, with R
// for Thursday and U for Sunday so nothing collides.
const LETTERS = ['M', 'T', 'W', 'R', 'F', 'S', 'U'];
const shortDayLetter = (day) => LETTERS[day] ?? DAY_NAMES[day]?.[0] ?? '?';
