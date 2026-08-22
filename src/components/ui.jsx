import { colors, tone, fonts, courseColor } from '../theme';
import { kindOf, DEFAULT_KIND } from '../assignments';
import { useIsPhone } from '../useMediaQuery';

// Shared surfaces and small pieces of vocabulary. Anything that appears in more
// than one view lives here so the app reads as one thing.

export function Card({ as: Tag = 'div', children, style, ...rest }) {
  return (
    <Tag
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        background: colors.card,
        border: `1px solid ${colors.cardBorder}`,
        borderRadius: 18,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({ children, action }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        marginBottom: 12,
      }}
    >
      <h2 style={{ font: `400 20px ${fonts.serif}`, color: colors.ink, margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}

// A course's colour as a dot — the smallest way to say which class a row
// belongs to without spending a line of text on it.
export function CourseDot({ color, size = 9 }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: courseColor(color).solid,
        flexShrink: 0,
        display: 'inline-block',
      }}
    />
  );
}

export function CourseChip({ course, onClick }) {
  if (!course) return null;
  const c = courseColor(course.color);
  return (
    <span
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: c.soft,
        color: c.solid,
        font: `600 11.5px ${fonts.sans}`,
        padding: '4px 10px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {course.code || course.name}
    </span>
  );
}

// Due-date pill. The text comes from dates.describeDue, so a pill can never
// disagree with the group it's sorted into; only the emphasis is decided here.
export function DuePill({ due, done }) {
  const style = (bg, color) => ({
    font: `600 11px ${fonts.sans}`,
    background: bg,
    color,
    padding: '4px 10px',
    borderRadius: 20,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  });

  if (done) return <span style={style('transparent', tone.green)}>Graded</span>;
  if (due.type === 'overdue') return <span style={style(tone.red, '#fff')}>{due.label}</span>;
  // An exam you've already taken. Not late, not done — the ball is in the
  // professor's court, and a red pill would say the opposite. "Taken" rather
  // than "Sat", which next to a date reads as Saturday.
  if (due.type === 'past') return <span style={style(colors.chipBg, tone.blue)}>Taken · {due.label}</span>;
  if (due.type === 'today') return <span style={style(colors.selected, colors.ink)}>{due.label}</span>;
  if (due.type === 'none') return <span style={style(colors.chipBg, colors.muted)}>No date</span>;
  return <span style={style(colors.chipBg, colors.muted2)}>{due.label}</span>;
}

export function ProgressBar({ pct, height = 6, fill = colors.accent }) {
  return (
    <div style={{ height, borderRadius: 5, background: colors.track, overflow: 'hidden' }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, pct ?? 0))}%`,
          height: '100%',
          background: fill,
          borderRadius: 5,
          transition: 'width 220ms ease',
        }}
      />
    </div>
  );
}

// One percentage with its letter. `muted` is for a hypothetical (what-if)
// number, so a simulated grade never looks like the real one.
export function GradeBadge({ pct, letter, size = 30, muted = false }) {
  if (pct == null) {
    return (
      <span style={{ font: `500 ${size * 0.45}px ${fonts.sans}`, color: colors.faint }}>
        No grade yet
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 7 }}>
      <span
        className="cad-nums"
        style={{
          font: `600 ${size}px ${fonts.sans}`,
          color: muted ? colors.muted2 : colors.ink,
          letterSpacing: '-0.02em',
        }}
      >
        {fmtPct(pct)}
      </span>
      {letter && (
        <span
          style={{
            font: `600 ${Math.round(size * 0.5)}px ${fonts.sans}`,
            color: muted ? colors.muted : colors.accent,
          }}
        >
          {letter}
        </span>
      )}
    </span>
  );
}

// What kind of thing a row is, when that isn't obvious from the title. Shown
// only for the kinds that behave differently — an "Assignment" tag on an
// assignment is a word that earns nothing, and a list where every row carries a
// badge is a list where none of them are read.
export function KindTag({ kind, color }) {
  const k = kindOf(kind);
  if (k.key === DEFAULT_KIND) return null;
  const c = courseColor(color);
  return (
    <span
      style={{
        font: `600 10px ${fonts.sans}`,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: k.event ? c.solid : colors.muted,
        background: k.event ? c.soft : colors.chipBg,
        padding: '3px 7px',
        borderRadius: 6,
        flexShrink: 0,
        whiteSpace: 'nowrap',
      }}
    >
      {k.label}
    </span>
  );
}

// A bar in two parts: what's banked, and what this term adds to it. They're
// drawn as separate segments rather than one blended total because the
// difference between "I have 60 credits" and "I will have 76 if this term goes
// through" is the whole reason to look at it.
export function SegmentBar({ share, height = 10, fill = colors.accent, soft = colors.selected }) {
  return (
    <div style={{ height, borderRadius: 6, background: colors.track, overflow: 'hidden', display: 'flex' }}>
      <div
        style={{
          width: `${Math.max(0, Math.min(100, share.earned))}%`,
          background: fill,
          transition: 'width 260ms ease',
        }}
      />
      {/* Hatched rather than a flat lighter shade, so "not yours yet" reads as
          provisional even to someone who can't tell the two tints apart. The
          opacity lives on the element because `fill` is a CSS custom property —
          there is no alpha to append to `var(--c-accent)`. */}
      <div
        style={{
          width: `${Math.max(0, Math.min(100, share.inProgress))}%`,
          background: soft,
          backgroundImage: `repeating-linear-gradient(45deg, ${fill} 0 3px, transparent 3px 7px)`,
          opacity: 0.5,
          transition: 'width 260ms ease',
        }}
      />
    </div>
  );
}

export function EmptyState({ title, body, action }) {
  // An empty state is an absence, and on a phone it shouldn't cost more screen
  // than the content it stands in for — "nothing due" was taking 350px of an
  // 812px screen and pushing the actual schedule below the fold.
  const phone = useIsPhone();
  return (
    <Card style={{ padding: phone ? '22px 18px' : '38px 26px', textAlign: 'center' }}>
      <div
        style={{
          font: `400 ${phone ? 17 : 19}px ${fonts.serif}`,
          color: colors.ink,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div
        style={{
          font: `400 ${phone ? 12.5 : 13.5}px/1.5 ${fonts.sans}`,
          color: colors.muted2,
          maxWidth: 380,
          margin: '0 auto',
        }}
      >
        {body}
      </div>
      {action && <div style={{ marginTop: phone ? 13 : 18 }}>{action}</div>}
    </Card>
  );
}

// One decimal place. Enough to see a grade move when a score lands, not so much
// that it implies a precision the syllabus doesn't have.
export const fmtPct = (n) => (n == null ? '—' : `${(Math.round(n * 10) / 10).toFixed(1)}%`);

// Credit hours print as "3" but "1.5" when they need to.
export const fmtCredits = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
};

export const fmtPoints = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
};

export const fmtGpa = (n) => (n == null ? '—' : n.toFixed(2));
