import { useState, useMemo } from 'react';
import { colors, fonts, courseColor } from '../theme';
import { DAY_NAMES, DAY_NAMES_LONG, getWeek, toMinutes, fmtMinutes, fmtTimeRange, dowIndex } from '../dates';
import { useSemester } from '../data/SemesterProvider';
import { useIsPhone } from '../useMediaQuery';
import { useNow } from '../useNow';
import { Card, SectionHeading, EmptyState } from '../components/ui';
import { ClassRow, classState } from '../components/ClassRow';
import { PrimaryButton } from '../components/Modal';

// The week, two ways. A laptop gets the grid you'd draw on paper — seven
// columns, time running down — because the useful question there is "what does
// my week look like". A phone gets one day at a time, because the useful
// question there is "where am I supposed to be right now".

const PX_PER_MIN = 1.05;

export function ScheduleView({ onAddCourse }) {
  const { meetings, courseById, courses } = useSemester();
  const phone = useIsPhone();

  const blocks = useMemo(
    () =>
      meetings
        .map((m) => ({
          id: m.id,
          day: m.day_of_week,
          start: toMinutes(m.start_time),
          end: toMinutes(m.end_time),
          course: courseById.get(m.course_id),
        }))
        .filter((b) => b.course)
        .sort((a, b) => a.start - b.start),
    [meetings, courseById],
  );

  if (!courses.length) {
    return (
      <EmptyState
        title="No courses yet"
        body="Add your first course — its meeting times fill in this schedule automatically."
        action={<PrimaryButton onClick={onAddCourse}>Add a course</PrimaryButton>}
      />
    );
  }

  if (!blocks.length) {
    return (
      <EmptyState
        title="Nothing meets yet"
        body="Your courses don't have meeting times set. Open one from Courses and add when it meets."
      />
    );
  }

  return phone ? <DayAgenda blocks={blocks} /> : <WeekGrid blocks={blocks} />;
}

// ------------------------------------------------------------------ desktop

function WeekGrid({ blocks }) {
  const now = useNow();
  const week = useMemo(() => getWeek(now), [now]);

  // Bound the grid to the day you actually have, rounded out to whole hours —
  // a 9am–3pm schedule shouldn't render midnight to midnight.
  const startHour = Math.floor(Math.min(...blocks.map((b) => b.start)) / 60);
  const endHour = Math.ceil(Math.max(...blocks.map((b) => b.end)) / 60);
  const top = startHour * 60;
  const height = (endHour - startHour) * 60 * PX_PER_MIN;

  // Weekend columns only appear when something meets on them, which for most
  // schedules gives the five weekdays more room.
  const hasWeekend = blocks.some((b) => b.day >= 5);
  const days = week.days.slice(0, hasWeekend ? 7 : 5);

  const hours = [];
  for (let h = startHour; h <= endHour; h++) hours.push(h);

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayIndex = dowIndex(now);
  const nowVisible = nowMinutes >= top && nowMinutes <= endHour * 60 && todayIndex < days.length;

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
                    color: isToday ? colors.accent : colors.muted2,
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

                  {nowVisible && isToday && (
                    <div
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: (nowMinutes - top) * PX_PER_MIN,
                        borderTop: `2px solid ${colors.accent}`,
                        zIndex: 2,
                      }}
                    />
                  )}

                  {blocks
                    .filter((b) => b.day === d.index)
                    .map((b) => {
                      const c = courseColor(b.course.color);
                      const blockHeight = Math.max(22, (b.end - b.start) * PX_PER_MIN - 3);
                      return (
                        <div
                          key={b.id}
                          title={`${b.course.name} · ${fmtTimeRange(b.start, b.end)}`}
                          style={{
                            position: 'absolute',
                            left: 3,
                            right: 3,
                            top: (b.start - top) * PX_PER_MIN,
                            height: blockHeight,
                            background: c.soft,
                            borderLeft: `3px solid ${c.solid}`,
                            borderRadius: 7,
                            padding: '5px 7px',
                            overflow: 'hidden',
                            zIndex: 1,
                          }}
                        >
                          <div
                            style={{
                              font: `600 11.5px ${fonts.sans}`,
                              color: c.solid,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {b.course.code || b.course.name}
                          </div>
                          {blockHeight > 38 && (
                            <div
                              style={{
                                font: `500 10.5px ${fonts.sans}`,
                                color: colors.muted2,
                                marginTop: 2,
                              }}
                            >
                              {fmtMinutes(b.start)}
                              {b.course.location ? ` · ${b.course.location}` : ''}
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
    </>
  );
}

// ------------------------------------------------------------------- phone

function DayAgenda({ blocks }) {
  const now = useNow();
  const today = dowIndex(now);
  const [day, setDay] = useState(today);
  const week = useMemo(() => getWeek(now), [now]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const todays = blocks.filter((b) => b.day === day);
  // Only a day that is actually today can have a 'next' class to count down to.
  const nextId = day === today ? (todays.find((b) => b.start > nowMinutes)?.id ?? null) : null;

  return (
    <>
      <SectionHeading>{day === today ? 'Today' : DAY_NAMES_LONG[day]}</SectionHeading>

      <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
        {DAY_NAMES.map((d, i) => {
          const active = i === day;
          const has = blocks.some((b) => b.day === i);
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
              }}
            >
              <div>{d[0]}</div>
              <div style={{ font: `500 10px ${fonts.sans}`, opacity: 0.85 }}>{week.days[i].num}</div>
              <div
                aria-hidden="true"
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  margin: '3px auto 0',
                  background: has ? (active ? colors.onAccent : colors.faint) : 'transparent',
                }}
              />
            </button>
          );
        })}
      </div>

      {!todays.length ? (
        <EmptyState title="Nothing scheduled" body={`No classes on ${DAY_NAMES_LONG[day]}.`} />
      ) : (
        <>
          <div
            style={{
              font: `500 12px ${fonts.sans}`,
              color: colors.muted2,
              margin: '0 2px 10px',
            }}
          >
            {todays.length} class{todays.length === 1 ? '' : 'es'} ·{' '}
            {fmtMinutes(todays[0].start)} – {fmtMinutes(todays[todays.length - 1].end)}
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            {todays.map((b) => (
              <ClassRow
                key={b.id}
                block={b}
                nowMinutes={nowMinutes}
                state={classState({ block: b, nowMinutes, live: day === today, nextId })}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
