import { colors, tone, fonts, courseColor } from '../theme';

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

export function EmptyState({ title, body, action }) {
  return (
    <Card style={{ padding: '38px 26px', textAlign: 'center' }}>
      <div style={{ font: `400 19px ${fonts.serif}`, color: colors.ink, marginBottom: 7 }}>
        {title}
      </div>
      <div
        style={{
          font: `400 13.5px/1.55 ${fonts.sans}`,
          color: colors.muted2,
          maxWidth: 380,
          margin: '0 auto',
        }}
      >
        {body}
      </div>
      {action && <div style={{ marginTop: 18 }}>{action}</div>}
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
