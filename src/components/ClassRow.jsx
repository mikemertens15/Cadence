import { colors, fonts, courseColor } from '../theme';
import { fmtMinutes, fmtDuration } from '../dates';
import { Card } from './ui';

// One class, as it appears on Today and on the phone's day agenda.
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
      {/* 68px fits the widest label the rail can hold — "12:00 PM". At 58 it
          wrapped onto two lines and knocked the whole row out of alignment. */}
      <div style={{ width: 68, flexShrink: 0, textAlign: 'right' }}>
        <div
          className="cad-nums"
          style={{ font: `600 13.5px ${fonts.sans}`, color: done ? colors.muted : colors.ink, whiteSpace: 'nowrap' }}
        >
          {fmtMinutes(block.start, { padMinutes: true })}
        </div>
        <div
          className="cad-nums"
          style={{ font: `500 11px ${fonts.sans}`, color: colors.faint, marginTop: 2, whiteSpace: 'nowrap' }}
        >
          {fmtMinutes(block.end, { padMinutes: true })}
        </div>
      </div>

      <div style={{ width: 1, background: colors.divider, flexShrink: 0 }} />

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
