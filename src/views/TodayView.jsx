import { useMemo } from 'react';
import { colors, fonts, courseColor } from '../theme';
import {
  greeting,
  longDate,
  describeDue,
  toMinutes,
  fmtTimeRange,
  fmtDuration,
  dowIndex,
  DAY_NAMES_LONG,
} from '../dates';
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
import { ClassRow, RoomChip, classState } from '../components/ClassRow';
import { PrimaryButton } from '../components/Modal';

// The landing screen answers three questions in the order they get asked:
// where do I need to be, what's coming at me, and how am I doing. Anything that
// isn't one of those belongs on another tab.
//
// "Where do I need to be" gets the most room, because it's the one that's asked
// while walking. It's answered twice on purpose: once as a single glanceable
// card for the class happening now or next, and once as the full day, because a
// five-class Monday is a thing you want to see the shape of.

const DUE_SOON_DAYS = 5;

export function TodayView({ navigate, onAddCourse, onAddAssignment }) {
  const { courses, meetings, assignments, courseById } = useSemester();
  const termGrades = useTermGrades();
  const phone = useIsPhone();
  const now = useNow();

  const today = dowIndex(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const blocksFor = useMemo(() => {
    const byDay = new Map();
    for (const m of meetings) {
      const course = courseById.get(m.course_id);
      if (!course) continue;
      const list = byDay.get(m.day_of_week) ?? [];
      list.push({
        id: m.id,
        day: m.day_of_week,
        start: toMinutes(m.start_time),
        end: toMinutes(m.end_time),
        course,
      });
      byDay.set(m.day_of_week, list);
    }
    for (const list of byDay.values()) list.sort((a, b) => a.start - b.start);
    return byDay;
  }, [meetings, courseById]);

  const todaysClasses = blocksFor.get(today) ?? [];
  const current = todaysClasses.find((b) => nowMinutes >= b.start && nowMinutes <= b.end);
  const next = todaysClasses.find((b) => b.start > nowMinutes);

  // Nothing left today (a Sunday, or 4pm on a Friday) shouldn't be a dead end —
  // the useful answer then is when you're next due somewhere. Scans forward a
  // week so a Sunday evening check shows Monday morning.
  const upcoming = useMemo(() => {
    if (current || next) return null;
    for (let i = 1; i <= 7; i++) {
      const day = (today + i) % 7;
      const list = blocksFor.get(day);
      if (list?.length) {
        return { day, offset: i, blocks: list, label: i === 1 ? 'Tomorrow' : DAY_NAMES_LONG[day] };
      }
    }
    return null;
  }, [current, next, today, blocksFor]);

  // The day the list below shows: today while it still has classes ahead of it,
  // otherwise the next day that does.
  const shown = todaysClasses.length
    ? { blocks: todaysClasses, label: 'Today', live: true }
    : upcoming
      ? { blocks: upcoming.blocks, label: upcoming.label, live: false }
      : null;

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
        <Greeting now={now} phone={phone} />
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
      <Greeting now={now} phone={phone} />

      <NextUp
        current={current}
        next={next}
        upcoming={upcoming}
        nowMinutes={nowMinutes}
        classesToday={todaysClasses.length}
        phone={phone}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: phone ? '1fr' : 'minmax(0, 1.15fr) minmax(0, 1fr)',
          gap: phone ? 24 : 24,
          alignItems: 'start',
          marginTop: 24,
        }}
      >
        <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
          {shown && (
            <section>
              <SectionHeading
                action={
                  <button
                    onClick={() => navigate('schedule')}
                    style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
                  >
                    Full week
                  </button>
                }
              >
                {shown.label === 'Today' ? "Today's classes" : shown.label}
              </SectionHeading>

              <div style={{ display: 'grid', gap: 8 }}>
                {shown.blocks.map((b) => (
                  <ClassRow
                    key={b.id}
                    block={b}
                    nowMinutes={nowMinutes}
                    state={classState({
                      block: b,
                      nowMinutes,
                      live: shown.live,
                      nextId: next?.id ?? null,
                    })}
                  />
                ))}
              </div>
            </section>
          )}

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
                        <div
                          style={{
                            font: `500 11.5px ${fonts.sans}`,
                            color: colors.muted2,
                            marginTop: 2,
                          }}
                        >
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
        </div>

        <section style={{ minWidth: 0 }}>
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

function Greeting({ now, phone }) {
  return (
    <div style={{ marginBottom: phone ? 14 : 20 }}>
      <div style={{ font: `400 ${phone ? 24 : 27}px ${fonts.serif}`, color: colors.ink }}>
        {greeting(now)}
      </div>
      <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 4 }}>
        {longDate(now)}
      </div>
    </div>
  );
}

// The card worth putting above everything else: where you're supposed to be and
// how long you've got. The room is the largest thing on it after the course
// name — this is the card you look at with the phone in one hand, already
// walking, and "AIEB 244" is the part you don't know by heart in week one.
function NextUp({ current, next, upcoming, nowMinutes, classesToday, phone }) {
  const block = current ?? next ?? upcoming?.blocks?.[0] ?? null;

  if (!block) {
    return (
      <HeroCard color={{ solid: colors.accent, soft: colors.chipBg }} label="Classes">
        <div style={{ font: `400 ${phone ? 21 : 24}px ${fonts.serif}`, color: colors.ink }}>
          {classesToday ? "That's it for today" : 'Nothing scheduled'}
        </div>
        <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 5 }}>
          {classesToday
            ? `${classesToday} class${classesToday === 1 ? '' : 'es'} already done.`
            : 'No classes on the books this week.'}
        </div>
      </HeroCard>
    );
  }

  const c = courseColor(block.course.color);
  const live = Boolean(current);
  const label = live
    ? 'In class now'
    : next
      ? `Next · in ${fmtDuration(block.start - nowMinutes)}`
      : `Next class · ${upcoming.label}`;

  return (
    <HeroCard color={c} label={label} room={block.course.location} phone={phone}>
      <div
        style={{
          font: `400 ${phone ? 21 : 24}px ${fonts.serif}`,
          color: colors.ink,
          lineHeight: 1.2,
        }}
      >
        {block.course.name}
      </div>
      <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 6 }}>
        <span style={{ color: c.solid, fontWeight: 600 }}>
          {block.course.code || 'Class'}
        </span>
        {' · '}
        {fmtTimeRange(block.start, block.end)}
        {live ? ` · ${fmtDuration(block.end - nowMinutes)} left` : ''}
      </div>
    </HeroCard>
  );
}

function HeroCard({ color, label, room, children, phone }) {
  return (
    <Card
      style={{
        padding: phone ? '15px 16px' : '18px 20px',
        borderLeft: `4px solid ${color.solid}`,
        background: color.soft,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            font: `600 11px ${fonts.sans}`,
            color: color.solid,
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          {label}
        </span>
        {room && (
          <span style={{ marginLeft: 'auto' }}>
            <RoomChip room={room} solid={color.solid} soft={colors.card} size={phone ? 14 : 15} />
          </span>
        )}
      </div>
      {children}
    </Card>
  );
}
