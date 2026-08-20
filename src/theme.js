// Design tokens. Every value is a CSS custom property reference rather than a
// literal, so the same `colors.ink` works in both skins — the palettes live in
// index.css and the browser resolves whichever `data-mode` is on <html>.

export const colors = {
  bg: 'var(--c-bg)',
  card: 'var(--c-card)',
  cardBorder: 'var(--c-card-border)',
  navBar: 'var(--c-nav-bar)',
  accent: 'var(--c-accent)',
  accentDark: 'var(--c-accent-dark)',
  onAccent: 'var(--c-on-accent)',
  ink: 'var(--c-ink)',
  muted: 'var(--c-muted)',
  muted2: 'var(--c-muted2)',
  muted3: 'var(--c-muted3)',
  faint: 'var(--c-faint)',
  divider: 'var(--c-divider)',
  chipBg: 'var(--c-chip-bg)',
  inputBg: 'var(--c-input-bg)',
  inputBorder: 'var(--c-input-border)',
  track: 'var(--c-track)',
  selected: 'var(--c-selected)',
  todayBg: 'var(--c-today-bg)',
};

// Status tones: overdue, due soon, on track, submitted-but-ungraded.
export const tone = {
  red: 'var(--t-red)',
  amber: 'var(--t-amber)',
  amberText: 'var(--t-amber-text)',
  green: 'var(--t-green)',
  blue: 'var(--t-blue)',
};

export const heroGradient = 'var(--g-hero)';

export const shadows = {
  accent: 'var(--s-accent)',
  modal: 'var(--s-modal)',
  backdrop: 'var(--s-backdrop)',
};

export const fonts = {
  sans: "'Inter', system-ui, sans-serif",
  serif: "'Fraunces', Georgia, serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
};

// Course colours. The database stores the key ('teal'), never a hex value, so a
// course picked in light mode still looks right in dark mode — each key resolves
// to a different literal in each skin. Adding one means adding a pair of custom
// properties to both blocks in index.css.
export const COURSE_COLORS = [
  'teal',
  'indigo',
  'plum',
  'clay',
  'moss',
  'amber',
  'slate',
  'rose',
];

export const DEFAULT_COURSE_COLOR = 'teal';

// `solid` is the dot, rule and text colour; `soft` is the tinted background it
// sits on. Unknown keys (a colour removed after courses already used it) fall
// back rather than resolving to an undefined var and rendering transparent.
export function courseColor(key) {
  const k = COURSE_COLORS.includes(key) ? key : DEFAULT_COURSE_COLOR;
  return { solid: `var(--k-${k})`, soft: `var(--k-${k}-soft)` };
}
