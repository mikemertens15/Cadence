import { colors, fonts, courseColor } from '../theme';
import { fmtMinutes, fmtDuration } from '../dates';
import { kindLabel } from '../assignments';
import { Card } from './ui';

// The rows a day is made of: classes, the exams sitting between them, and the
// card that says a day has been cancelled out from under both.
//
// The layout is built around the two things you actually need while walking
// across campus: when, and where. The time sits in a fixed left rail so a whole
// day lines up into a readable column, and the room is a chip in its own right
// rather than grey text tacked onto the end of a time range — in a first week,
// "BRUN 107" is the single most valuable string on the screen, and it's the one
// you're least likely to have memorised.
//
// Room codes are set in the mono face on purpose: they're codes, not prose, and
// the fixed widths make "AIEB 130" and "LSC 1201" easy to tell apart at a glance.

export function RoomChip({ room, solid, soft, size = 12 }) {
  if (!room) return null;
  return (
    <span
      style={{
        font: `600 ${size}px ${fonts.mono}`,
        color: solid,
        background: soft,
        padding: '4px 8px',
        borderRadius: 7,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        letterSpacing: '-0.02em',
      }}
    >
      {room}
    </span>
  );
}

// 'now' | 'next' | 'done' | 'later'. Only a day that is actually today can have
// a class in progress, so the caller passes `live` rather than this guessing.
export function classState({ block, nowMinutes, live, nextId }) {
  if (!live) return 'later';
  if (nowMinutes >= block.start && nowMinutes <= block.end) return 'now';
  if (block.id === nextId) return 'next';
  if (nowMinutes > block.end) return 'done';
  return 'later';
}

// The left rail, shared so a class at 9 and an exam at 10 line up to the pixel.
//
// 68px fits the widest label the rail can hold — "12:00 PM". At 58 it wrapped
// onto two lines and knocked the whole row out of alignment.
function Rail({ start, end, done }) {
  return (
    <>
      <div style={{ width: 68, flexShrink: 0, textAlign: 'right' }}>
        <div
          className="cad-nums"
          style={{ font: `600 13.5px ${fonts.sans}`, color: done ? colors.muted : colors.ink, whiteSpace: 'nowrap' }}
        >
          {fmtMinutes(start, { padMinutes: true })}
        </div>
        <div
          className="cad-nums"
          style={{ font: `500 11px ${fonts.sans}`, color: colors.faint, marginTop: 2, whiteSpace: 'nowrap' }}
        >
          {fmtMinutes(end, { padMinutes: true })}
        </div>
      </div>

      <div style={{ width: 1, background: colors.divider, flexShrink: 0 }} />
    </>
  );
}

export function ClassRow({ block, state = 'later', nowMinutes }) {
  const c = courseColor(block.course.color);
  const done = state === 'done';
  const now = state === 'now';
  const next = state === 'next';

  // The status line only earns its space when there's something time-sensitive
  // to say. A class at 3pm doesn't need a countdown at 9am.
  const status = now
    ? `${fmtDuration(block.end - nowMinutes)} left`
    : next
      ? `in ${fmtDuration(block.start - nowMinutes)}`
      : null;

  return (
    <Card
      style={{
        padding: '12px 14px',
        display: 'flex',
        gap: 12,
        alignItems: 'stretch',
        borderLeft: `4px solid ${now || next ? c.solid : 'transparent'}`,
        background: now ? c.soft : colors.card,
        opacity: done ? 0.5 : 1,
      }}
    >
      <Rail start={block.start} end={block.end} done={done} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              font: `600 13.5px ${fonts.sans}`,
              color: c.solid,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {block.course.code || block.course.name}
          </span>
          <span style={{ marginLeft: 'auto' }}>
            <RoomChip room={block.course.location} solid={c.solid} soft={c.soft} />
          </span>
        </div>

        <div
          style={{
            font: `500 12px ${fonts.sans}`,
            color: colors.muted2,
            marginTop: 3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {block.course.name}
        </div>

        {status && (
          <div style={{ font: `600 11px ${fonts.sans}`, color: c.solid, marginTop: 5 }}>
            {now ? 'NOW · ' : ''}
            {status}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * An exam, in the same rail as the classes around it.
 *
 * It gets a heavier border and the kind spelled out because it is categorically
 * not another lecture — the thing you want on a Tuesday morning is to see at a
 * glance that the 2pm block is a midterm and not the class that usually sits
 * there. Tapping it opens the same editor as everywhere else, so a score can be
 * logged the moment you walk out.
 */
export function EventRow({ block, state = 'later', nowMinutes, onOpen }) {
  const c = courseColor(block.course?.color);
  const done = state === 'done';
  const now = state === 'now';
  const next = state === 'next';

  const status = now
    ? `${fmtDuration(block.end - nowMinutes)} left`
    : next
      ? `in ${fmtDuration(block.start - nowMinutes)}`
      : null;

  return (
    <Card
      as={onOpen ? 'button' : 'div'}
      onClick={onOpen}
      style={{
        padding: '12px 14px',
        display: 'flex',
        gap: 12,
        alignItems: 'stretch',
        // Solid on both edges rather than the classes' single left rule: an
        // exam should not be findable only by reading it.
        border: `1px solid ${c.solid}`,
        borderLeft: `4px solid ${c.solid}`,
        background: now ? c.soft : colors.card,
        opacity: done ? 0.55 : 1,
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      <Rail start={block.start} end={block.end} done={done} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              font: `600 10px ${fonts.sans}`,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: colors.onAccent,
              background: c.solid,
              padding: '3px 7px',
              borderRadius: 6,
              flexShrink: 0,
            }}
          >
            {kindLabel(block.event.kind)}
          </span>
          <span
            style={{
              font: `600 13.5px ${fonts.sans}`,
              color: colors.ink,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {block.event.title}
          </span>
        </div>

        <div
          style={{
            font: `500 12px ${fonts.sans}`,
            color: colors.muted2,
            marginTop: 3,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {block.course?.name ?? 'No course'}
        </div>

        {status && (
          <div style={{ font: `600 11px ${fonts.sans}`, color: c.solid, marginTop: 5 }}>
            {now ? 'NOW · ' : ''}
            {status}
          </div>
        )}
      </div>
    </Card>
  );
}

/**
 * A day the university has taken off you.
 *
 * Shown in place of the class list rather than above it, because the whole
 * point is that there is nothing to be anywhere for. Anything with a real date
 * on it still renders underneath — a break cancels recurring classes, not the
 * paper due Monday.
 */
export function BreakCard({ name, note }) {
  return (
    <Card
      style={{
        padding: '16px 18px',
        background: colors.chipBg,
        border: `1px dashed ${colors.inputBorder}`,
        textAlign: 'center',
      }}
    >
      <div style={{ font: `400 17px ${fonts.serif}`, color: colors.ink }}>{name}</div>
      <div style={{ font: `500 12px ${fonts.sans}`, color: colors.muted2, marginTop: 4 }}>
        {note ?? 'No classes today.'}
      </div>
    </Card>
  );
}
