import { useMemo } from 'react';
import { colors, fonts, courseColor } from '../theme';
import { greeting, longDate, describeDue, toMinutes, fmtMinutes, fmtTimeRange, dowIndex } from '../dates';
import { useSemester } from '../data/SemesterProvider';
import { useTermGrades } from '../data/grades';
import { useIsPhone } from '../useMediaQuery';
import { useNow } from '../useNow';
import { isGraded } from '../grading/engine';
import {
  Card,
  SectionHeading,
  EmptyState,
  DuePill,
  CourseDot,
  GradeBadge,
  ProgressBar,
} from '../components/ui';
import { PrimaryButton } from '../components/Modal';

// The landing screen answers three questions in the order they get asked:
// where do I need to be, what's coming at me, and how am I doing. Anything that
// isn't one of those belongs on another tab.

const DUE_SOON_DAYS = 5;

export function TodayView({ navigate, onAddCourse, onAddAssignment }) {
  const { courses, meetings, assignments, courseById } = useSemester();
  const termGrades = useTermGrades();
  const phone = useIsPhone();
  const now = useNow();

  const today = dowIndex(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todaysClasses = useMemo(
    () =>
      meetings
        .filter((m) => m.day_of_week === today)
        .map((m) => ({
          id: m.id,
          start: toMinutes(m.start_time),
          end: toMinutes(m.end_time),
          course: courseById.get(m.course_id),
        }))
        .filter((b) => b.course)
        .sort((a, b) => a.start - b.start),
    [meetings, today, courseById],
  );

  const current = todaysClasses.find((b) => nowMinutes >= b.start && nowMinutes <= b.end);
  const next = todaysClasses.find((b) => b.start > nowMinutes);

  const dueSoon = useMemo(
    () =>
      assignments
        .filter((a) => !isGraded(a) && a.due_at)
        .map((a) => ({ a, due: describeDue(a.due_at, now) }))
        .filter((r) => r.due.daysLeft != null && r.due.daysLeft <= DUE_SOON_DAYS)
        .sort((x, y) => x.due.date - y.due.date),
    [assignments, now],
  );

  if (!courses.length) {
    return (
      <>
        <Greeting now={now} />
        <EmptyState
          title="Let's get your semester in"
          body="Add your courses — name, when they meet, and how they're graded — and this page fills itself in from there."
          action={<PrimaryButton onClick={onAddCourse}>Add your first course</PrimaryButton>}
        />
      </>
    );
  }

  return (
    <>
      <Greeting now={now} />

      <NextUp current={current} next={next} nowMinutes={nowMinutes} classesToday={todaysClasses.length} />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: phone ? '1fr' : 'minmax(0, 1.25fr) minmax(0, 1fr)',
          gap: phone ? 26 : 24,
          alignItems: 'start',
          marginTop: 26,
        }}
      >
        {/* ------------------------------------------------------- due soon */}
        <section>
          <SectionHeading
            action={
              <button
                onClick={() => navigate('work')}
                style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
              >
                All work
              </button>
            }
          >
            Due soon
          </SectionHeading>

          {!dueSoon.length ? (
            <EmptyState
              title="Clear for now"
              body={`Nothing due in the next ${DUE_SOON_DAYS} days.`}
              action={<PrimaryButton onClick={onAddAssignment}>Add an assignment</PrimaryButton>}
            />
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {dueSoon.map(({ a, due }) => {
                const course = courseById.get(a.course_id);
                return (
                  <Card
                    key={a.id}
                    as="button"
                    onClick={() => navigate('work')}
                    style={{
                      padding: '12px 15px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 11,
                      cursor: 'pointer',
                    }}
                  >
                    <CourseDot color={course?.color} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          font: `600 13.5px ${fonts.sans}`,
                          color: colors.ink,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {a.title}
                      </div>
                      <div style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, marginTop: 2 }}>
                        {course?.code || course?.name || 'No course'}
                      </div>
                    </div>
                    <DuePill due={due} />
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        {/* --------------------------------------------------------- grades */}
        <section>
          <SectionHeading
            action={
              <button
                onClick={() => navigate('grades')}
                style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
              >
                Details
              </button>
            }
          >
            Where you stand
          </SectionHeading>

          <div style={{ display: 'grid', gap: 8 }}>
            {termGrades.map(({ course, grade }) => (
              <Card
                key={course.id}
                as="button"
                onClick={() => navigate(`grades/${course.id}`)}
                style={{ padding: '13px 15px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <CourseDot color={course.color} />
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      font: `600 13px ${fonts.sans}`,
                      color: colors.ink,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {course.code || course.name}
                  </span>
                  <GradeBadge pct={grade.pct} letter={grade.letter} size={17} />
                </div>
                {grade.hasGrades && (
                  <div style={{ marginTop: 9 }}>
                    <ProgressBar pct={grade.pct} fill={courseColor(course.color).solid} height={5} />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Greeting({ now }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ font: `400 27px ${fonts.serif}`, color: colors.ink }}>{greeting(now)}</div>
      <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 4 }}>
        {longDate(now)}
      </div>
    </div>
  );
}

// The one card worth putting above everything else: where you're supposed to be,
// and how long you've got. A countdown is the only form of this that answers the
// question without making you do subtraction.
function NextUp({ current, next, nowMinutes, classesToday }) {
  if (current) {
    const c = courseColor(current.course.color);
    const left = current.end - nowMinutes;
    return (
      <HeroCard color={c} label="In class now">
        <div style={{ font: `400 24px ${fonts.serif}`, color: colors.ink }}>{current.course.name}</div>
        <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 5 }}>
          {fmtTimeRange(current.start, current.end)}
          {current.course.location ? ` · ${current.course.location}` : ''} · {formatGap(left)} left
        </div>
      </HeroCard>
    );
  }

  if (next) {
    const c = courseColor(next.course.color);
    const until = next.start - nowMinutes;
    return (
      <HeroCard color={c} label="Next class">
        <div style={{ font: `400 24px ${fonts.serif}`, color: colors.ink }}>{next.course.name}</div>
        <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 5 }}>
          {fmtMinutes(next.start)}
          {next.course.location ? ` · ${next.course.location}` : ''} · in {formatGap(until)}
        </div>
      </HeroCard>
    );
  }

  return (
    <HeroCard color={{ solid: colors.accent, soft: colors.chipBg }} label="Classes">
      <div style={{ font: `400 24px ${fonts.serif}`, color: colors.ink }}>
        {classesToday ? "That's it for today" : 'Nothing scheduled today'}
      </div>
      <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 5 }}>
        {classesToday
          ? `${classesToday} class${classesToday === 1 ? '' : 'es'} already done.`
          : 'No classes meet today.'}
      </div>
    </HeroCard>
  );
}

function HeroCard({ color, label, children }) {
  return (
    <Card style={{ padding: '18px 20px', borderLeft: `4px solid ${color.solid}`, background: color.soft }}>
      <div
        style={{
          font: `600 11px ${fonts.sans}`,
          color: color.solid,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          marginBottom: 7,
        }}
      >
        {label}
      </div>
      {children}
    </Card>
  );
}

// "in 1h 20m" reads faster than "in 80 minutes", and both beat a bare timestamp
// when the question is whether you have time to get coffee.
function formatGap(minutes) {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}
