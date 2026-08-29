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
import { isGraded, isAwaitingScore } from '../grading/engine';
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
import { ClassRow, EventRow, EventTag, BreakCard, RoomChip, classState } from '../components/ClassRow';
import { PrimaryButton } from '../components/Modal';
import { StudyCard } from '../components/StudyCard';
import { StudyWeek } from '../components/StudyWeek';
import { SemesterStrip } from '../components/SemesterProgress';

// The landing screen answers four questions in the order they get asked: where
// do I need to be, what should I be doing with the next hour, what's coming at
// me, and how am I doing. Anything that isn't one of those belongs on another
// tab.
//
// Since 1.4, two of the four are optional. Not every semester is five classes
// and a timetable, and not everyone wants a study timer — and the half of this
// page that answers a question you never ask is the half you learn to scroll
// past, which costs the other half its place at the top of the screen. What is
// switched off is switched off here rather than rendered and hidden, so the grid
// closes up around it instead of leaving the gap where it used to be.
//
// "Where do I need to be" gets the most room, because it's the one that's asked
// while walking. It's answered twice on purpose: once as a single glanceable
// card for the class happening now or next, and once as the full day, because a
// five-class Monday is a thing you want to see the shape of.
//
// The second question earned its place here in 1.1 rather than getting a tab of
// its own. It is asked at exactly the moment this screen is already open — you
// have twenty minutes, you are deciding what to open — and a study timer parked
// behind a tab is one you start after you have already sat down with the wrong
// class, which is the entire problem it exists to fix.

const DUE_SOON_DAYS = 5;

export function TodayView({ navigate, onAddCourse, onAddAssignment, onOpenAssignment, onStartStudy }) {
  const { courses, assignments, courseById, features } = useSemester();
  const termGrades = useTermGrades();
  const phone = useIsPhone();
  const now = useNow();

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const { blocksOn } = useSchedule();
  const timetable = features.schedule;

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

  /**
   * The block the hero card is about.
   *
   * Chosen here rather than inside NextUp, so the strip underneath can know
   * what the card above it is already showing. The two picking separately is
   * what put the same quiz on the screen twice: the strip checked today's
   * current and next block, and the hero card reaches into tomorrow when today
   * is done — so the night before a quiz, it was the headline *and* the
   * reminder underneath it.
   */
  const heroBlock = timetable ? (current ?? next ?? upcoming?.blocks?.[0] ?? null) : null;

  // Every exam the card above is already showing, whether as the headline or as
  // a tag on the class it happens in. The strip below asks this rather than
  // comparing one id, because an exam can now reach the card two ways and
  // checking only the first is what put the same quiz on screen twice before.
  const heroExamIds = useMemo(() => {
    const ids = new Set();
    if (heroBlock?.event?.id) ids.add(heroBlock.event.id);
    for (const e of heroBlock?.events ?? []) ids.add(e.event.id);
    return ids;
  }, [heroBlock]);

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
        .filter((a) => !isGraded(a) && !isAwaitingScore(a, {}, now) && a.due_at)
        .map((a) => ({ a, due: describeDue(a.due_at, now, { event: isEvent(a.kind) }) }))
        .filter((r) => r.due.daysLeft != null && r.due.daysLeft <= DUE_SOON_DAYS)
        // An exam you already sat isn't "coming up" — it's on the work list
        // waiting for a score, and repeating it here would be the app nagging
        // about something you can't do anything about. Same for homework you
        // already handed in: due-soon is the queue, not the gradebook.
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
        <Greeting now={now} phone={phone} navigate={navigate} showTerm={features.termProgress} />
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
      <Greeting now={now} phone={phone} navigate={navigate} showTerm={features.termProgress} />

      {timetable && (
        <NextUp
          block={heroBlock}
          current={current}
          next={next}
          upcoming={upcoming}
          off={today.off}
          nowMinutes={nowMinutes}
          blocksToday={today.blocks.length}
          phone={phone}
          onOpenEvent={onOpenAssignment}
        />
      )}

      {/* Only worth its space once it's genuinely ahead of you and not already
          the thing filling the card above — whichever day that card reached
          into to find it. When it *is* the card above, the card itself opens
          it, so nothing is lost by dropping the second copy. With no timetable
          there is no card above, and this becomes the only warning there is. */}
      {nextExam && !heroExamIds.has(nextExam.a.id) && (
        <NextExam row={nextExam} course={courseById.get(nextExam.a.course_id)} onOpen={onOpenAssignment} />
      )}

      {/* Directly under where you have to be, because the two are the same
          decision: the gap between classes is the block, and the timetable is
          what decides how long it can be. */}
      {features.study && <StudyCard onChoose={onStartStudy} onOpenAssignment={onOpenAssignment} />}

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
          {timetable && (today.off || shown) && (
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
                    <ClassRow
                      key={b.id}
                      block={b}
                      nowMinutes={nowMinutes}
                      state={state}
                      onOpenEvent={onOpenAssignment}
                    />
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

        <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
        {/* Hours first, grades second, which is the order they can be acted on:
            one of them is a decision about tonight and the other is a
            consequence of six weeks of them. */}
        {features.study && <StudyWeek />}

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
      </div>
    </>
  );
}

// The date, and under it where that date falls in the semester. The strip is
// here rather than anywhere else on the page because this is the block nobody
// reads on purpose — you look at it while the rest loads — and "further through
// than you thought" is exactly the kind of thing that has to arrive uninvited
// or not at all. It opens the schedule, where the full picture lives.
function Greeting({ now, phone, navigate, showTerm = true }) {
  return (
    <div style={{ marginBottom: phone ? 14 : 20 }}>
      <div style={{ font: `400 ${phone ? 24 : 27}px ${fonts.serif}`, color: colors.ink }}>
        {greeting(now)}
      </div>
      <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 4 }}>
        {longDate(now)}
      </div>
      {showTerm && <SemesterStrip onClick={navigate ? () => navigate('schedule') : undefined} />}
    </div>
  );
}

// The card worth putting above everything else: where you're supposed to be and
// how long you've got. The room is the largest thing on it after the course
// name — this is the card you look at with the phone in one hand, already
// walking, and "AIEB 244" is the part you don't know by heart in week one.
function NextUp({ block, current, next, upcoming, off, nowMinutes, blocksToday, phone, onOpenEvent }) {
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

  // A quiz inside the class it belongs to reaches this card as a tag on the
  // class rather than as the block itself, and the label has to know: "In class
  // now" over a row carrying a midterm is technically true and exactly the wrong
  // emphasis. So the kind is read from whichever of the two it arrived as.
  const events = block.events ?? [];
  const kind = event ? block.event.kind : (events[0]?.event.kind ?? null);

  // An exam says so in the label, because "Next · in 40m" over a course code is
  // the one case where knowing *what* it is matters more than knowing when.
  const label = live
    ? kind
      ? `${kindLabel(kind)} in progress`
      : 'In class now'
    : next
      ? `${kind ? kindLabel(kind) : 'Next'} · in ${fmtDuration(block.start - nowMinutes)}`
      : `Next ${kind ? kindLabel(kind).toLowerCase() : 'class'} · ${upcoming.label}`;

  // An exam or quiz on this card is a row you might want to change — the time
  // moved, the name was a guess, it's worth more than you thought — and before
  // 1.1 the only way in was a second strip underneath saying the same thing.
  // The headline opens it instead. A class with exactly one exam in it opens
  // that exam too; a class with two goes through the tags, because a card that
  // opens one of two things you can both see is a card that opens the wrong one
  // half the time.
  const only = !event && events.length === 1 ? events[0].assignment : null;
  const target = event ? block.assignment : only;
  const open = target && onOpenEvent ? () => onOpenEvent(target) : null;

  return (
    <HeroCard color={c} label={label} room={block.course?.location} phone={phone} onClick={open}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            font: `400 ${phone ? 21 : 24}px ${fonts.serif}`,
            color: colors.ink,
            lineHeight: 1.2,
          }}
        >
          {event ? block.event.title : block.course.name}
        </div>
        {/* The whole card is the target; this is only what says so. */}
        {open && (
          <span
            aria-hidden="true"
            style={{ font: `400 ${phone ? 19 : 21}px ${fonts.serif}`, color: c.solid, flexShrink: 0 }}
          >
            &rsaquo;
          </span>
        )}
      </div>
      <div style={{ font: `500 13px ${fonts.sans}`, color: colors.muted2, marginTop: 6 }}>
        <span style={{ color: c.solid, fontWeight: 600 }}>
          {block.course?.code || block.course?.name || 'Class'}
        </span>
        {' · '}
        {fmtTimeRange(block.start, block.end)}
        {live ? ` · ${fmtDuration(block.end - nowMinutes)} left` : ''}
      </div>

      {/* Named, not just labelled: "Quiz · in 40m" over a course code doesn't
          say which quiz, and by week ten there have been six.

          The tags only take their own click when the card hasn't already taken
          it. A single exam makes the whole card a button and the tag inside it
          decoration — a button inside a button is invalid markup and behaves
          differently in every browser that has to guess what it meant. */}
      {events.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
          {events.map((e) => (
            <EventTag
              key={e.id}
              event={e.event}
              color={c}
              onClick={!open && onOpenEvent ? () => onOpenEvent(e.assignment) : undefined}
            />
          ))}
        </div>
      )}
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

function HeroCard({ color, label, room, children, phone, onClick }) {
  return (
    <Card
      as={onClick ? 'button' : 'div'}
      onClick={onClick ?? undefined}
      style={{
        padding: phone ? '15px 16px' : '18px 20px',
        borderLeft: `4px solid ${color.solid}`,
        background: color.soft,
        cursor: onClick ? 'pointer' : 'default',
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
