// Letter grades and grade points.
//
// The default is Tennessee Tech's straight 10-point scale. A course can store
// its own cutoffs (grade_scale_overrides) when a professor grades on +/-, but
// the default is deliberately the plain one rather than a "smart" guess.

export const DEFAULT_SCALE = [
  { letter: 'A', min: 90 },
  { letter: 'B', min: 80 },
  { letter: 'C', min: 70 },
  { letter: 'D', min: 60 },
  { letter: 'F', min: 0 },
];

// Offered as one click in the per-course scale editor, since "my professor does
// +/-" is the only reason most people will ever open it.
export const PLUS_MINUS_SCALE = [
  { letter: 'A', min: 93 },
  { letter: 'A-', min: 90 },
  { letter: 'B+', min: 87 },
  { letter: 'B', min: 83 },
  { letter: 'B-', min: 80 },
  { letter: 'C+', min: 77 },
  { letter: 'C', min: 73 },
  { letter: 'C-', min: 70 },
  { letter: 'D+', min: 67 },
  { letter: 'D', min: 63 },
  { letter: 'D-', min: 60 },
  { letter: 'F', min: 0 },
];

// Highest cutoff first, which is the order `letterFor` scans in. Rows arriving
// from the database are in whatever order Postgres returned them.
const byCutoffDesc = (a, b) => b.min - a.min;

export const sortScale = (scale) => [...scale].sort(byCutoffDesc);

// The letter a percentage earns. Returns null for null (no graded work yet)
// rather than "F", which would be an actively misleading thing to show a
// student in week one.
export function letterFor(pct, scale = DEFAULT_SCALE) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const sorted = sortScale(scale);
  for (const row of sorted) {
    if (pct >= row.min) return row.letter;
  }
  // Only reachable if the scale has no 0-floor row; the lowest letter is still
  // the honest answer.
  return sorted[sorted.length - 1]?.letter ?? null;
}

// Turn stored override rows into a scale, falling back to the default when a
// course has none. Rows with a non-numeric cutoff are dropped rather than
// poisoning the comparison chain with NaN.
export function scaleFor(overrideRows) {
  if (!overrideRows?.length) return DEFAULT_SCALE;
  const rows = overrideRows
    .map((r) => ({ letter: r.letter, min: Number(r.min_pct) }))
    .filter((r) => r.letter && Number.isFinite(r.min));
  return rows.length ? sortScale(rows) : DEFAULT_SCALE;
}

// Tennessee Tech's GPA is a straight 4.0 with no +/- weighting, so 'A-' and 'A'
// are both worth 4.0 — the modifier only ever affects which letter you see, not
// what it's worth. Reading the first character is the whole rule.
const POINTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export function gradePoints(letter) {
  if (!letter) return null;
  return POINTS[letter[0].toUpperCase()] ?? null;
}
