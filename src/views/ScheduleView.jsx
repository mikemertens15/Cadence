import { useState, useMemo } from 'react';
import { colors, fonts, courseColor } from '../theme';
import { DAY_NAMES, DAY_NAMES_LONG, getWeek, fmtMinutes, fmtTimeRange, dowIndex, dayRangeLabel } from '../dates';
import { kindLabel } from '../assignments';
import { useSemester } from '../data/SemesterProvider';
import { useSchedule } from '../data/schedule';
import { useIsPhone } from '../useMediaQuery';
import { useNow } from '../useNow';
import { Card, SectionHeading, EmptyState } from '../components/ui';
import { ClassRow, EventRow, BreakCard, classState } from '../components/ClassRow';
import { PrimaryButton } from '../components/Modal';
import { SemesterProgress } from '../components/SemesterProgress';

// The week, two ways. A laptop gets the grid you'd draw on paper — seven
// columns, time running down — because the useful question there is "what does
// my week look like". A phone gets one day at a time, because the useful
// question there is "where am I supposed to be right now".
//
// Both are built per-date rather than per-weekday, because two of the things
// drawn on them only exist on a date: an exam happens once, and a break cancels
// a specific Thursday rather than all of them.

const PX_PER_MIN = 1.05;

export function ScheduleView({ onAddCourse, onOpenAssignment }) {
  const { courses, features } = useSemester();
  const { blocksOn, hasAnything } = useSchedule();
  const phone = useIsPhone();
  const now = useNow();

  // The seven real dates in view, each already resolved to what's on it.
  const week = useMemo(() => {
    const w = getWeek(now);
    return {
      ...w,
      days: w.days.map((d) => ({ ...d, ...blocksOn(d.date) })),
    };
  }, [now, blocksOn]);

  // The week is what this screen is for; the term above it is the context that
  // makes the week mean anything. It sits above the empty states too — a
  // semester that started nine days ago is worth knowing about precisely when
  // there is nothing else on the screen to say so.
  const body = !courses.length ? (
    <EmptyState
      title="No courses yet"
      body="Add your first course — its meeting times fill in this schedule automatically."
      action={<PrimaryButton onClick={onAddCourse}>Add a course</PrimaryButton>}
    />
  ) : !hasAnything ? (
    <EmptyState
      title="Nothing meets yet"
      body="Your courses don't have meeting times set. Open one from Courses and add when it meets."
    />
  ) : phone ? (
    <DayAgenda week={week} now={now} onOpenAssignment={onOpenAssignment} />
  ) : (
    <WeekGrid week={week} now={now} onOpenAssignment={onOpenAssignment} />
  );

  return (
    <>
      {features.termProgress && <SemesterProgress />}
      {body}
    </>
  );
}

/**
 * Lay overlapping blocks out side by side instead of on top of each other.
 *
 * This did not matter much when a day was only ever weekly classes, which by
 * construction don't collide. Exams collide constantly — a midterm is very
 * often scheduled *in* the class period it belongs to — and absolutely
 * positioned blocks at the same coordinates simply hide one another, so the
 * exam you most needed to see was the one that vanished under the lecture.
 *
 * Standard sweep: walk blocks in start order, keep a cluster of things that
 * overlap, give each the lowest column not already taken by something still
 * running, and once the cluster closes divide the width by how many columns it
 * ended up needing. Every block in one cluster gets the same width, so a day
 * reads as an aligned grid rather than a staircase.
 */
function packColumns(blocks) {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || a.end - b.end);
  const out = [];
  let cluster = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    const cols = Math.max(...cluster.map((b) => b.col)) + 1;
    for (const b of cluster) out.push({ ...b, cols });
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const b of sorted) {
    // A block starting after everything before it has finished begins a fresh
    // cluster — nothing earlier can constrain its width.
    if (b.start >= clusterEnd) flush();
    const taken = new Set(cluster.filter((c) => c.end > b.start).map((c) => c.col));
    let col = 0;
    while (taken.has(col)) col += 1;
    cluster.push({ ...b, col });
    clusterEnd = Math.max(clusterEnd, b.end);
  }
  flush();
  return out;
}

// ------------------------------------------------------------------ desktop

function WeekGrid({ week, now, onOpenAssignment }) {
  const all = week.days.flatMap((d) => d.blocks);

  // Bound the grid to the day you actually have, rounded out to whole hours —
  // a 9am–3pm schedule shouldn't render midnight to midnight. A week that is
  // entirely break has nothing to measure, so fall back to a normal school day
  // rather than collapsing to a zero-height grid.
  const startHour = all.length ? Math.floor(Math.min(...all.map((b) => b.start)) / 60) : 8;
  const endHour = all.length ? Math.ceil(Math.max(...all.map((b) => b.end)) / 60) : 17;
  const top = startHour * 60;
  const height = (endHour - startHour) * 60 * PX_PER_MIN;

  // Weekend columns only appear when something is on them, which for most
  // schedules gives the five weekdays more room.
  const hasWeekend = week.days.some((d) => d.index >= 5 && (d.blocks.length || d.off));
  const days = week.days.slice(0, hasWeekend ? 7 : 5);

  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = dowIndex(now);
  const nowVisible = nowMinutes >= top && nowMinutes <= endHour * 60 && todayIndex < days.length;

  // Named once so the legend under the grid and the blocks themselves can't
  // disagree about which weeks are off.
  const offDays = days.filter((d) => d.off);

  return (
    <>
      <SectionHeading>This week</SectionHeading>
      <Card style={{ padding: '16px 18px 20px' }} className="cad-scroll-x">
        <div style={{ display: 'flex', minWidth: hasWeekend ? 760 : 620 }}>
          {/* Hour gutter */}
          <div style={{ width: 54, flexShrink: 0, paddingTop: 30 }}>
            <div style={{ position: 'relative', height }}>
              {hours.map((h) => (
                <div
                  key={h}
                  style={{
                    position: 'absolute',
                    top: (h * 60 - top) * PX_PER_MIN - 7,
                    right: 10,
                    font: `500 11px ${fonts.sans}`,
                    color: colors.faint,
                  }}
                >
                  {fmtMinutes(h * 60)}
                </div>
              ))}
            </div>
          </div>

          {days.map((d) => {
            const isToday = d.index === todayIndex;
            return (
              <div key={d.dow} style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    textAlign: 'center',
                    paddingBottom: 9,
                    font: `600 12px ${fonts.sans}`,
                    color: isToday ? colors.accent : d.off ? colors.faint : colors.muted2,
                  }}
                >
                  {d.dow}{' '}
                  <span style={{ color: isToday ? colors.accent : colors.faint, fontWeight: 500 }}>
                    {d.num}
                  </span>
                </div>

                <div
                  style={{
                    position: 'relative',
                    height,
                    borderLeft: `1px solid ${colors.divider}`,
                    background: isToday ? colors.todayBg : 'transparent',
                  }}
                >
                  {/* Hour rules, drawn per column so they sit under the blocks */}
                  {hours.map((h) => (
                    <div
                      key={h}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: (h * 60 - top) * PX_PER_MIN,
                        borderTop: `1px solid ${colors.divider}`,
                      }}
                    />
                  ))}

                  {/* A day off is drawn as an absence — hatched over the whole
                      column, so the eye reads "nothing here" before it reads
                      any label. */}
                  {d.off && (
                    <div
                      title={d.off.name}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        background: colors.chipBg,
                        backgroundImage: `repeating-linear-gradient(45deg, ${colors.divider} 0 6px, transparent 6px 12px)`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 4,
                        zIndex: 1,
                      }}
                    >
                      <span
                        style={{
                          // Longhand throughout: React warns when a `font`
                          // shorthand and a `lineHeight` are set on the same
                          // element, because one silently resets the other.
                          fontFamily: fonts.sans,
                          fontSize: 10,
                          fontWeight: 600,
                          lineHeight: 1.3,
                          color: colors.muted2,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          textAlign: 'center',
                        }}
                      >
                        {d.off.name}
                      </span>
                    </div>
                  )}

                  {nowVisible && isToday && (
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: (nowMinutes - top) * PX_PER_MIN,
                        borderTop: `2px solid ${colors.accent}`,
                        // Above every block, including exams — the one line
                        // that must never be covered is where you are now.
                        zIndex: 4,
                      }}
                    />
                  )}

                  {packColumns(d.blocks).map((b) => {
                    const c = courseColor(b.course?.color);
                    const event = b.type === 'event';
                    // A class with a test in it is one block, not two — and it
                    // is drawn the way the test used to be drawn, because the
                    // reason exams were filled in rather than tinted has not
                    // changed just because they moved onto the class.
                    const carried = b.events ?? [];
                    const exam = event ? b.event : (carried[0]?.event ?? null);
                    const opens = event ? b.assignment : (carried[0]?.assignment ?? null);
                    const blockHeight = Math.max(22, (b.end - b.start) * PX_PER_MIN - 3);
                    const width = 100 / b.cols;
                    return (
                      <div
                        key={b.id}
                        onClick={
                          opens && onOpenAssignment ? () => onOpenAssignment(opens) : undefined
                        }
                        title={
                          exam
                            ? `${kindLabel(exam.kind)}: ${exam.title}${b.course ? ` · ${b.course.name}` : ''} · ${fmtTimeRange(b.start, b.end)}`
                            : `${b.course.name} · ${fmtTimeRange(b.start, b.end)}`
                        }
                        style={{
                          position: 'absolute',
                          left: `calc(${b.col * width}% + 3px)`,
                          width: `calc(${width}% - 6px)`,
                          top: (b.start - top) * PX_PER_MIN,
                          height: blockHeight,
                          // On a grid of six pastel blocks, the one you must not
                          // miss should be the one that isn't pastel.
                          background: exam ? c.solid : c.soft,
                          borderLeft: `3px solid ${c.solid}`,
                          borderRadius: 7,
                          padding: '5px 7px',
                          overflow: 'hidden',
                          zIndex: exam ? 3 : 2,
                          cursor: opens && onOpenAssignment ? 'pointer' : 'default',
                        }}
                      >
                        <div
                          style={{
                            font: `600 11.5px ${fonts.sans}`,
                            color: exam ? colors.onAccent : c.solid,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {/* The course stays the headline when the exam is in
                              it — you are looking for the block you already know
                              the shape of, and the kind is the line under it. A
                              loose exam has no class to name, so it leads with
                              what it is. */}
                          {event ? kindLabel(exam.kind) : b.course.code || b.course.name}
                        </div>
                        {blockHeight > 38 && (
                          <div
                            style={{
                              font: `500 10.5px ${fonts.sans}`,
                              color: exam ? colors.onAccent : colors.muted2,
                              marginTop: 2,
                              opacity: exam ? 0.85 : 1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {exam
                              ? event
                                ? exam.title
                                : `${kindLabel(exam.kind)} · ${exam.title}`
                              : `${fmtMinutes(b.start)}${b.course.location ? ` · ${b.course.location}` : ''}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {offDays.length > 0 && (
        <div style={{ font: `500 12px ${fonts.sans}`, color: colors.muted2, marginTop: 10 }}>
          {[...new Map(offDays.map((d) => [d.off.id, d.off])).values()]
            .map((b) => `${b.name} · ${dayRangeLabel(b.start_date, b.end_date)}`)
            .join('   ·   ')}
        </div>
      )}
    </>
  );
}

// ------------------------------------------------------------------- phone

function DayAgenda({ week, now, onOpenAssignment }) {
  const today = dowIndex(now);
  const [day, setDay] = useState(today);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const shown = week.days[day];
  // Only a day that is actually today can have a class in progress or a 'next'
  // class to count down to.
  const nextId = day === today ? (shown.blocks.find((b) => b.start > nowMinutes)?.id ?? null) : null;

  return (
    <>
      <SectionHeading>{day === today ? 'Today' : DAY_NAMES_LONG[day]}</SectionHeading>

      <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
        {DAY_NAMES.map((d, i) => {
          const active = i === day;
          const dayData = week.days[i];
          const has = dayData.blocks.length > 0;
          return (
            <button
              key={d}
              onClick={() => setDay(i)}
              aria-pressed={active}
              style={{
                flex: 1,
                padding: '9px 0 7px',
                borderRadius: 12,
                background: active ? colors.accent : colors.card,
                border: `1px solid ${active ? colors.accent : colors.cardBorder}`,
                color: active ? colors.onAccent : i === today ? colors.accent : colors.muted2,
                font: `600 11.5px ${fonts.sans}`,
                opacity: dayData.off && !active ? 0.6 : 1,
              }}
            >
              <div>{d[0]}</div>
              <div style={{ font: `500 10px ${fonts.sans}`, opacity: 0.85 }}>{week.days[i].num}</div>
              {/* A day off gets a hollow marker rather than none at all: "no
                  classes" and "nothing entered" look identical otherwise. */}
              <div
                aria-hidden="true"
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  margin: '3px auto 0',
                  background: has ? (active ? colors.onAccent : colors.faint) : 'transparent',
                  border: !has && dayData.off ? `1px solid ${active ? colors.onAccent : colors.faint}` : 'none',
                }}
              />
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {shown.off && (
          <BreakCard
            name={shown.off.name}
            note={`No classes ${dayRangeLabel(shown.off.start_date, shown.off.end_date)}.`}
          />
        )}

        {!shown.blocks.length && !shown.off ? (
          <EmptyState title="Nothing scheduled" body={`No classes on ${DAY_NAMES_LONG[day]}.`} />
        ) : (
          <>
            {shown.blocks.length > 0 && (
              <div
                style={{
                  font: `500 12px ${fonts.sans}`,
                  color: colors.muted2,
                  margin: '0 2px 2px',
                }}
              >
                {shown.blocks.length} item{shown.blocks.length === 1 ? '' : 's'} ·{' '}
                {fmtMinutes(shown.blocks[0].start)} –{' '}
                {fmtMinutes(shown.blocks[shown.blocks.length - 1].end)}
              </div>
            )}

            {shown.blocks.map((b) => {
              const state = classState({ block: b, nowMinutes, live: day === today, nextId });
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
          </>
        )}
      </div>
    </>
  );
}
