import { useMemo } from 'react';
import { colors, fonts, courseColor } from '../theme';
import {
  greeting,
  longDate,
  describeDue,
  fmtTimeRange,
  fmtDuration,
  DAY_NAMES_LONG,
  dowIndex,
  dayRangeLabel,
} from '../dates';
import { isEvent, kindLabel } from '../assignments';
import { useSemester } from '../data/SemesterProvider';
import { useSchedule } from '../data/schedule';
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
  KindTag,
} from '../components/ui';
import { ClassRow, EventRow, BreakCard, RoomChip, classState } from '../components/ClassRow';
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

export function TodayView({ navigate, onAddCourse, onAddAssignment, onOpenAssignment }) {
  const { courses, assignments, courseById } = useSemester();
  const termGrades = useTermGrades();
  const phone = useIsPhone();
  const now = useNow();

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const { blocksOn } = useSchedule();

  // Today, as a date rather than a weekday — a break is a range on the calendar
  // and can only be checked against a real day.
  const today = useMemo(() => blocksOn(now), [blocksOn, now]);

  const current = today.blocks.find((b) => nowMinutes >= b.start && nowMinutes <= b.end);
  const next = today.blocks.find((b) => b.start > nowMinutes);

  // Nothing left today (a Sunday, a break, or 4pm on a Friday) shouldn't be a
  // dead end — the useful answer then is when you're next due somewhere. Scans
  // forward a week, skipping the days a break has emptied, so a Wednesday during
  // Thanksgiving points at the Monday you actually go back.
  const upcoming = useMemo(() => {
    if (current || next) return null;
    for (let i = 1; i <= 8; i++) {
      const date = new Date(now);
      date.setDate(now.getDate() + i);
      const { blocks } = blocksOn(date);
      if (blocks.length) {
        return {
          date,
          offset: i,
          blocks,
          label: i === 1 ? 'Tomorrow' : DAY_NAMES_LONG[dowIndex(date)],
        };
      }
    }
    return null;
  }, [current, next, now, blocksOn]);

  // The day the list below shows: today while it still has anything on it,
  // otherwise the next day that does.
  const shown = today.blocks.length
    ? { blocks: today.blocks, label: 'Today', live: true }
    : upcoming
      ? { blocks: upcoming.blocks, label: upcoming.label, live: false }
      : null;

  const dueSoon = useMemo(
    () =>
      assignments
        .filter((a) => !isGraded(a) && a.due_at)
        .map((a) => ({ a, due: describeDue(a.due_at, now, { event: isEvent(a.kind) }) }))
        .filter((r) => r.due.daysLeft != null && r.due.daysLeft <= DUE_SOON_DAYS)
        // An exam you already sat isn't "coming up" — it's on the work list
        // waiting for a score, and repeating it here would be the app nagging
        // about something you can't do anything about.
        .filter((r) => r.due.type !== 'past')
        .sort((x, y) => x.due.date - y.due.date),
    [assignments, now],
  );

  // The next exam, however far out, because "when is the next test" is a
  // different question from "what's due this week" and the answer is worth
  // seeing before it lands inside the five-day window.
  const nextExam = useMemo(() => {
    const rows = assignments
      .filter((a) => isEvent(a.kind) && a.due_at && !isGraded(a))
      .map((a) => ({ a, due: describeDue(a.due_at, now, { event: true }) }))
      .filter((r) => r.due.date && r.due.type !== 'past')
      .sort((x, y) => x.due.date - y.due.date);
    return rows[0] ?? null;
  }, [assignments, now]);

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
        off={today.off}
        nowMinutes={nowMinutes}
        blocksToday={today.blocks.length}
        phone={phone}
      />

      {/* Only worth its space once it's genuinely ahead of you and not already
          the thing filling the card above. */}
      {nextExam && nextExam.a.id !== current?.event?.id && nextExam.a.id !== next?.event?.id && (
        <NextExam row={nextExam} course={courseById.get(nextExam.a.course_id)} onOpen={onOpenAssignment} />
      )}

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
          {/* One panel, whichever day it's about. On a break it stays on today
              and says why the day is empty — jumping the heading straight to
              "Monday" would answer a question nobody asked and hide the one
              they did. */}
          {(today.off || shown) && (
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
                {today.off ? 'Today' : shown.label === 'Today' ? 'On today' : shown.label}
              </SectionHeading>

              <div style={{ display: 'grid', gap: 8 }}>
                {today.off && (
                  <BreakCard
                    name={today.off.name}
                    note={`No classes ${dayRangeLabel(today.off.start_date, today.off.end_date)}.`}
                  />
                )}
                {(today.off ? today.blocks : shown.blocks).map((b) => {
                  const state = classState({
                    block: b,
                    nowMinutes,
                    live: today.off ? true : shown.live,
                    nextId: next?.id ?? null,
                  });
                  return b.type === 'event' ? (
                    <EventRow
                      key={b.id}
                      block={b}
                      nowMinutes={nowMinutes}
                      state={state}
                      onOpen={onOpenAssignment ? () => onOpenAssignment(b.assignment) : undefined}
                    />
                  ) : (
                    <ClassRow key={b.id} block={b} nowMinutes={nowMinutes} state={state} />
                  );
                })}
              </div>

              {/* A break with genuinely nothing on it still has one useful
                  thing to say, which is when it ends. */}
              {today.off && !today.blocks.length && upcoming && (
                <div style={{ font: `500 12px ${fonts.sans}`, color: colors.muted2, marginTop: 10, textAlign: 'center' }}>
                  Back to it {upcoming.label.toLowerCase()}.
                </div>
              )}
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
function NextUp({ current, next, upcoming, off, nowMinutes, blocksToday, phone }) {
  const block = current ?? next ?? upcoming?.blocks?.[0] ?? null;

  if (!block) {
    return (
      <HeroCard color={{ solid: colors.accent, soft: colors.chipBg }} label={off ? 'Day off' : 'Classes'}>
        <div style={{ font: `400 ${phone ? 21 : 24}px ${fonts.serif}`, color: colors.ink }}>
          {off ? off.name : blocksToday ? "That's it for today" : 'Nothing scheduled'}
        </div>
        <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 5 }}>
          {off
            ? 'Nothing on today. Go and do something else.'
            : blocksToday
              ? `${blocksToday} class${blocksToday === 1 ? '' : 'es'} already done.`
              : 'No classes on the books this week.'}
        </div>
      </HeroCard>
    );
  }

  const c = courseColor(block.course?.color);
  const live = Boolean(current);
  const event = block.type === 'event';

  // An exam says so in the label, because "Next · in 40m" over a course code is
  // the one case where knowing *what* it is matters more than knowing when.
  const label = live
    ? event
      ? `${kindLabel(block.event.kind)} in progress`
      : 'In class now'
    : next
      ? `${event ? kindLabel(block.event.kind) : 'Next'} · in ${fmtDuration(block.start - nowMinutes)}`
      : `Next ${event ? kindLabel(block.event.kind).toLowerCase() : 'class'} · ${upcoming.label}`;

  return (
    <HeroCard color={c} label={label} room={block.course?.location} phone={phone}>
      <div
        style={{
          font: `400 ${phone ? 21 : 24}px ${fonts.serif}`,
          color: colors.ink,
          lineHeight: 1.2,
        }}
      >
        {event ? block.event.title : block.course.name}
      </div>
      <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 6 }}>
        <span style={{ color: c.solid, fontWeight: 600 }}>
          {block.course?.code || block.course?.name || 'Class'}
        </span>
        {' · '}
        {fmtTimeRange(block.start, block.end)}
        {live ? ` · ${fmtDuration(block.end - nowMinutes)} left` : ''}
      </div>
    </HeroCard>
  );
}

/**
 * The next exam, whenever it is.
 *
 * Separate from "due soon" on purpose. A five-day window is the right horizon
 * for homework and the wrong one for a final — the whole value of knowing about
 * an exam is knowing early, and a strip that appears three weeks out is the
 * difference between planning around it and discovering it.
 */
function NextExam({ row, course, onOpen }) {
  const c = courseColor(course?.color);
  const { a, due } = row;
  const soon = due.daysLeft != null && due.daysLeft <= 7;

  return (
    <Card
      as={onOpen ? 'button' : 'div'}
      onClick={onOpen ? () => onOpen(a) : undefined}
      style={{
        marginTop: 10,
        padding: '11px 15px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderLeft: `4px solid ${c.solid}`,
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <KindTag kind={a.kind} color={course?.color} />
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
        {a.title}
        <span style={{ color: colors.muted2, fontWeight: 500 }}>
          {course ? ` · ${course.code || course.name}` : ''}
        </span>
      </span>
      <span
        style={{
          font: `600 11.5px ${fonts.sans}`,
          color: soon ? c.solid : colors.muted2,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {due.daysLeft === 0 ? due.label : due.daysLeft === 1 ? 'Tomorrow' : `${due.daysLeft} days`}
      </span>
    </Card>
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
