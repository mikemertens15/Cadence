import { useState, useMemo } from 'react';
import { colors, tone, fonts, courseColor } from '../theme';
import { describeDue } from '../dates';
import { useSemester } from '../data/SemesterProvider';
import { useCourseGrade, useTermGrades, useGpa, EMPTY_OVERRIDES } from '../data/grades';
import { useIsPhone } from '../useMediaQuery';
import { isGraded } from '../grading/engine';
import {
  Card,
  SectionHeading,
  EmptyState,
  GradeBadge,
  ProgressBar,
  CourseDot,
  fmtPct,
  fmtPoints,
  fmtCredits,
  fmtGpa,
} from '../components/ui';
import { PrimaryButton, GhostButton, Chip, inputStyle } from '../components/Modal';
import { ScoreInput } from '../components/AssignmentModal';

// Where the app earns its keep. The list answers "how am I doing"; the detail
// answers the two questions that actually change behaviour — "what happens if
// this next exam goes badly" and "what do I need to still get an A".

export function GradesView({ onOpenCourse, onAddCourse, navigate }) {
  const termGrades = useTermGrades();
  const gpa = useGpa();
  const phone = useIsPhone();

  if (!termGrades.length) {
    return (
      <EmptyState
        title="No courses yet"
        body="Add a course with its grading scheme and your grade appears here the moment you enter a score."
        action={<PrimaryButton onClick={onAddCourse}>Add a course</PrimaryButton>}
      />
    );
  }

  return (
    <>
      <SectionHeading>Grades</SectionHeading>

      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {termGrades.map(({ course, grade }) => (
          <Card
            key={course.id}
            as="button"
            onClick={() => navigate(`grades/${course.id}`)}
            style={{
              padding: phone ? '15px 16px' : '17px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              cursor: 'pointer',
            }}
          >
            <CourseDot color={course.color} size={11} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  font: `600 14.5px ${fonts.sans}`,
                  color: colors.ink,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {course.name}
              </div>
              <div style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted2, marginTop: 3 }}>
                {course.code ? `${course.code} · ` : ''}
                {fmtCredits(course.credit_hours)} cr
                {grade.remainingCount > 0 ? ` · ${grade.remainingCount} left` : ''}
              </div>
              {!phone && grade.hasGrades && (
                <div style={{ marginTop: 9, maxWidth: 260 }}>
                  <ProgressBar pct={grade.pct} fill={courseColor(course.color).solid} />
                </div>
              )}
            </div>
            <GradeBadge pct={grade.pct} letter={grade.letter} size={phone ? 22 : 26} />
          </Card>
        ))}
      </div>

      <GpaPanel gpa={gpa} phone={phone} />

      <div style={{ marginTop: 18 }}>
        <GhostButton onClick={onOpenCourse}>Manage courses</GhostButton>
      </div>
    </>
  );
}

function GpaPanel({ gpa, phone }) {
  const tile = (label, value, note) => (
    <Card style={{ padding: '16px 18px' }}>
      <div style={{ font: `600 11px ${fonts.sans}`, color: colors.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        className="cad-nums"
        style={{ font: `600 30px ${fonts.sans}`, color: colors.ink, margin: '6px 0 3px', letterSpacing: '-0.02em' }}
      >
        {fmtGpa(value.gpa)}
      </div>
      <div style={{ font: `400 11.5px ${fonts.sans}`, color: colors.faint }}>{note}</div>
    </Card>
  );

  return (
    <>
      <SectionHeading>GPA</SectionHeading>
      <div style={{ display: 'grid', gridTemplateColumns: phone ? '1fr 1fr' : 'repeat(2, minmax(0, 220px))', gap: 10 }}>
        {tile(
          'This term',
          gpa.term,
          gpa.term.credits ? `${fmtCredits(gpa.term.credits)} credits counted` : 'No graded work yet',
        )}
        {tile(
          'Cumulative',
          gpa.cumulative,
          gpa.cumulative.credits ? `${fmtCredits(gpa.cumulative.credits)} credits counted` : 'Across every term',
        )}
      </div>
      {/* A GPA computed from courses that aren't finished is a projection, and
          saying so is the difference between a useful number and a wrong one. */}
      <div style={{ font: `400 11.5px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 9 }}>
        Based on where each course stands right now, on a straight 4.0 scale.
        {gpa.cumulative.ungraded > 0 &&
          ` ${gpa.cumulative.ungraded} course${gpa.cumulative.ungraded === 1 ? '' : 's'} with no graded work yet ${gpa.cumulative.ungraded === 1 ? 'is' : 'are'} left out.`}
      </div>
    </>
  );
}

// ------------------------------------------------------------------- detail

export function CourseGradeView({ courseId, onEditCourse, onOpenAssignment, navigate }) {
  const { courseById, setScore } = useSemester();
  const phone = useIsPhone();

  // What-ifs are held as the raw text of a *points* score, keyed by assignment —
  // the same units as a real score, because switching units between the grade
  // you got and the grade you're imagining would be a small cruelty. Keeping the
  // typed string here rather than in the input means "Clear what-ifs" actually
  // empties the boxes instead of leaving stale text behind a cleared override.
  const [whatIf, setWhatIf] = useState({});
  const [target, setTarget] = useState(90);

  const real = useCourseGrade(courseId);

  // Points → percent, which is what the engine speaks. Half-typed and nonsense
  // entries are simply skipped, so the projection stays live as you type without
  // ever flickering through a garbage value.
  const overrides = useMemo(() => {
    const out = {};
    for (const a of real.assignments) {
      const raw = whatIf[a.id];
      if (raw == null || String(raw).trim() === '') continue;
      const points = Number(raw);
      const possible = Number(a.points_possible) || 0;
      if (!Number.isFinite(points) || possible <= 0) continue;
      out[a.id] = (points / possible) * 100;
    }
    // A stable identity while nothing is being simulated, so the memo inside
    // useCourseGrade isn't invalidated on every render.
    return Object.keys(out).length ? out : EMPTY_OVERRIDES;
  }, [whatIf, real.assignments]);

  const simulating = overrides !== EMPTY_OVERRIDES;
  const sim = useCourseGrade(courseId, overrides);
  const solved = useMemo(() => sim.solve(target), [sim, target]);

  const course = courseById.get(courseId);

  if (!course) {
    return (
      <EmptyState
        title="Course not found"
        body="It may have been deleted on another device."
        action={<PrimaryButton onClick={() => navigate('grades')}>Back to grades</PrimaryButton>}
      />
    );
  }

  const c = courseColor(course.color);

  return (
    <>
      <button
        onClick={() => navigate('grades')}
        style={{ font: `600 12.5px ${fonts.sans}`, color: colors.muted2, marginBottom: 14 }}
      >
        ← Grades
      </button>

      {/* --------------------------------------------------------- headline */}
      <Card style={{ padding: phone ? '18px 18px' : '22px 24px', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
              <CourseDot color={course.color} size={11} />
              <span style={{ font: `400 22px ${fonts.serif}`, color: colors.ink }}>{course.name}</span>
            </div>
            <div style={{ font: `500 12px ${fonts.sans}`, color: colors.muted2, marginTop: 5 }}>
              {[course.code, course.instructor, `${fmtCredits(course.credit_hours)} credits`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <GradeBadge
              pct={simulating ? sim.pct : real.pct}
              letter={simulating ? sim.letter : real.letter}
              size={phone ? 30 : 36}
              muted={simulating}
            />
            {simulating && (
              <div style={{ font: `600 11px ${fonts.sans}`, color: colors.muted, marginTop: 4 }}>
                simulated · really {fmtPct(real.pct)}
              </div>
            )}
          </div>
        </div>

        {real.hasGrades && (
          <div style={{ marginTop: 14 }}>
            <ProgressBar pct={simulating ? sim.pct : real.pct} fill={c.solid} height={7} />
          </div>
        )}

        <Warnings grade={real} onEdit={onEditCourse} />
      </Card>

      {!real.categories.length ? (
        <EmptyState
          title="No grading scheme yet"
          body="Add the categories from the syllabus — Homework 20%, Exams 50%, and so on — and this course starts producing a grade."
          action={<PrimaryButton onClick={onEditCourse}>Set up grading</PrimaryButton>}
        />
      ) : (
        <>
          <Breakdown grade={simulating ? sim : real} color={c} phone={phone} />

          <Solver
            solved={solved}
            target={target}
            setTarget={setTarget}
            scale={real.scale}
            phone={phone}
          />

          <Assignments
            grade={real}
            whatIf={whatIf}
            setWhatIf={setWhatIf}
            clearWhatIf={() => setWhatIf({})}
            simulating={simulating}
            onScore={(id, v) => setScore(id, { pointsEarned: v })}
            onOpen={onOpenAssignment}
            phone={phone}
          />
        </>
      )}
    </>
  );
}

function Warnings({ grade, onEdit }) {
  const items = [];
  if (grade.categories.length && Math.abs(grade.weightsSum - 100) > 0.01) {
    items.push(
      `Category weights add to ${Math.round(grade.weightsSum * 100) / 100}%, not 100%. The grade below re-normalizes, but the scheme is probably missing something.`,
    );
  }
  if (grade.uncategorizedCount > 0) {
    items.push(
      `${grade.uncategorizedCount} assignment${grade.uncategorizedCount === 1 ? " isn't" : "s aren't"} in a category, so ${grade.uncategorizedCount === 1 ? "it doesn't" : "they don't"} count toward this grade.`,
    );
  }
  if (!items.length) return null;

  return (
    <div style={{ marginTop: 14, display: 'grid', gap: 7 }}>
      {items.map((text) => (
        <div
          key={text}
          style={{
            font: `500 12px/1.5 ${fonts.sans}`,
            color: tone.amberText,
            background: colors.inputBg,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: 11,
            padding: '9px 12px',
          }}
        >
          {text}{' '}
          <button onClick={onEdit} style={{ font: `600 12px ${fonts.sans}`, color: colors.accent }}>
            Fix
          </button>
        </div>
      ))}
    </div>
  );
}

function Breakdown({ grade, color, phone }) {
  return (
    <section style={{ marginBottom: 20 }}>
      <SectionHeading>Breakdown</SectionHeading>
      <Card style={{ padding: phone ? '6px 14px' : '8px 20px' }}>
        {grade.categories.map((cat, i) => (
          <div
            key={cat.id}
            style={{
              padding: '13px 0',
              borderTop: i === 0 ? 'none' : `1px solid ${colors.divider}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ font: `600 13.5px ${fonts.sans}`, color: colors.ink }}>{cat.name}</span>
                <span className="cad-nums" style={{ font: `500 11.5px ${fonts.sans}`, color: colors.muted }}>
                  {Math.round(cat.weight * 100) / 100}%
                </span>
              </div>
              <div style={{ font: `400 11.5px ${fonts.sans}`, color: colors.faint, marginTop: 3 }}>
                {cat.gradedCount === 0
                  ? cat.remainingCount > 0
                    ? `${cat.remainingCount} coming · not counted yet`
                    : 'Nothing here yet'
                  : `${fmtPoints(cat.earned)} / ${fmtPoints(cat.possible)} pts` +
                    (cat.droppedKeys.length
                      ? ` · ${cat.droppedKeys.length} dropped`
                      : '') +
                    (cat.remainingCount > 0 ? ` · ${cat.remainingCount} left` : '')}
              </div>
              {cat.pct != null && (
                <div style={{ marginTop: 8, maxWidth: 220 }}>
                  <ProgressBar pct={cat.pct} fill={color.solid} height={5} />
                </div>
              )}
            </div>
            <span
              className="cad-nums"
              style={{
                font: `600 15px ${fonts.sans}`,
                color: cat.pct == null ? colors.faint : colors.ink,
                flexShrink: 0,
              }}
            >
              {cat.pct == null ? '—' : fmtPct(cat.pct)}
            </span>
          </div>
        ))}
      </Card>
    </section>
  );
}

// The needed-score solver. The number it produces is the whole reason to build
// this instead of using a spreadsheet.
function Solver({ solved, target, setTarget, scale, phone }) {
  // Offer the cutoffs this course actually grades on, biggest first, skipping F
  // — nobody sets "what do I need for an F" as a goal.
  const targets = useMemo(
    () => scale.filter((r) => r.min > 0).slice(0, 5),
    [scale],
  );

  const message = () => {
    switch (solved.status) {
      case 'locked':
        return {
          headline: 'Already yours',
          body: `Even a zero on everything left holds ${fmtPct(solved.floor)}. This one is banked.`,
          tone: tone.green,
        };
      case 'reachable':
        return {
          headline: `${fmtPct(solved.needed)} average`,
          body: `on the ${solved.remainingCount} assignment${solved.remainingCount === 1 ? '' : 's'} left (${fmtPoints(solved.remainingPossible)} points).`,
          tone: colors.ink,
        };
      case 'stretch':
        return {
          headline: `${fmtPct(solved.needed)} average`,
          body: `— more than full marks. Acing everything left reaches ${fmtPct(solved.ceiling)} (${solved.ceilingLetter}).`,
          tone: tone.amberText,
        };
      case 'impossible':
        return {
          headline: 'Out of reach',
          body: `Perfect scores on everything left top out at ${fmtPct(solved.ceiling)} (${solved.ceilingLetter}).`,
          tone: tone.red,
        };
      case 'no-remaining':
        return solved.met
          ? { headline: 'Made it', body: 'Nothing left to grade.', tone: tone.green }
          : {
              headline: 'Nothing left',
              body: `No ungraded work remains, so this course finishes at ${fmtPct(solved.floor)}.`,
              tone: tone.red,
            };
      default:
        return { headline: '—', body: '', tone: colors.ink };
    }
  };

  const m = message();

  return (
    <section style={{ marginBottom: 20 }}>
      <SectionHeading>What do I need?</SectionHeading>
      <Card style={{ padding: phone ? '16px 16px' : '18px 20px' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ font: `600 12px ${fonts.sans}`, color: colors.muted2, marginRight: 3 }}>
            To finish with
          </span>
          {targets.map((row) => (
            <Chip key={row.letter} active={Math.abs(target - row.min) < 0.01} onClick={() => setTarget(row.min)}>
              {row.letter} ({row.min}%)
            </Chip>
          ))}
          <input
            type="number"
            min="0"
            max="100"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            aria-label="Custom target percentage"
            style={{ ...inputStyle, width: 78, textAlign: 'right', padding: '9px 10px' }}
          />
        </div>

        <div
          className="cad-nums"
          style={{ font: `600 26px ${fonts.sans}`, color: m.tone, letterSpacing: '-0.02em' }}
        >
          {m.headline}
        </div>
        <div style={{ font: `400 13.5px/1.55 ${fonts.sans}`, color: colors.muted2, marginTop: 5 }}>
          {m.body}
        </div>

        {/* The two ends of the range. Between them is every grade still
            available to you, which is usually the thing worth knowing. */}
        {solved.remainingCount > 0 && (
          <div
            style={{
              display: 'flex',
              gap: phone ? 16 : 28,
              marginTop: 16,
              paddingTop: 14,
              borderTop: `1px solid ${colors.divider}`,
            }}
          >
            <Endpoint label="Zero on everything left" pct={solved.floor} letter={solved.floorLetter} />
            <Endpoint label="Full marks on everything left" pct={solved.ceiling} letter={solved.ceilingLetter} />
          </div>
        )}
      </Card>
    </section>
  );
}

function Endpoint({ label, pct, letter }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ font: `400 11px/1.4 ${fonts.sans}`, color: colors.faint, marginBottom: 4 }}>
        {label}
      </div>
      <div className="cad-nums" style={{ font: `600 15px ${fonts.sans}`, color: colors.muted3 }}>
        {fmtPct(pct)}{' '}
        <span style={{ color: colors.muted, fontWeight: 500 }}>{letter ?? ''}</span>
      </div>
    </div>
  );
}

// Every assignment in the course, grouped by category, with two ways to put a
// number in: the real score, and — for anything ungraded — a hypothetical one.
function Assignments({ grade, whatIf, setWhatIf, clearWhatIf, simulating, onScore, onOpen, phone }) {
  const byCategory = useMemo(() => {
    const map = new Map(grade.categories.map((c) => [c.id, []]));
    for (const a of grade.assignments) {
      if (a.category_id && map.has(a.category_id)) map.get(a.category_id).push(a);
    }
    for (const list of map.values()) {
      list.sort((x, y) => String(x.due_at ?? '9').localeCompare(String(y.due_at ?? '9')));
    }
    return map;
  }, [grade.categories, grade.assignments]);

  return (
    <section>
      <SectionHeading
        action={
          simulating && (
            <button
              onClick={clearWhatIf}
              style={{ font: `600 12.5px ${fonts.sans}`, color: colors.accent }}
            >
              Clear what-ifs
            </button>
          )
        }
      >
        Assignments
      </SectionHeading>

      <div style={{ display: 'grid', gap: 14 }}>
        {grade.categories.map((cat) => {
          const rows = byCategory.get(cat.id) ?? [];
          if (!rows.length) return null;
          const dropped = new Set(cat.droppedKeys);

          return (
            <Card key={cat.id} style={{ padding: phone ? '4px 14px' : '6px 20px' }}>
              <div
                style={{
                  padding: '12px 0 10px',
                  font: `600 11.5px ${fonts.sans}`,
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {cat.name}
                {cat.dropLowestN > 0 && (
                  <span style={{ textTransform: 'none', letterSpacing: 0, color: colors.faint, fontWeight: 500 }}>
                    {' '}
                    · drops {cat.dropLowestN} lowest
                  </span>
                )}
              </div>

              {rows.map((a, i) => (
                <AssignmentScoreRow
                  key={a.id}
                  assignment={a}
                  first={i === 0}
                  dropped={dropped.has(a.id)}
                  whatIf={whatIf[a.id] ?? ''}
                  setWhatIf={setWhatIf}
                  onScore={onScore}
                  onOpen={onOpen}
                  phone={phone}
                />
              ))}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function AssignmentScoreRow({ assignment: a, first, dropped, whatIf, setWhatIf, onScore, onOpen, phone }) {
  const graded = isGraded(a);
  const possible = Number(a.points_possible) || 0;
  const due = describeDue(a.due_at);

  return (
    <div
      style={{
        padding: '11px 0',
        borderTop: first ? 'none' : `1px solid ${colors.divider}`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: dropped ? 0.5 : 1,
      }}
    >
      <button onClick={() => onOpen(a)} style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div
          style={{
            font: `600 13.5px ${fonts.sans}`,
            color: colors.ink,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textDecoration: dropped ? 'line-through' : 'none',
          }}
        >
          {a.title}
        </div>
        <div style={{ font: `400 11px ${fonts.sans}`, color: colors.faint, marginTop: 2 }}>
          {dropped ? 'Dropped — lowest score' : due.type === 'none' ? 'No due date' : due.label}
        </div>
      </button>

      {graded ? (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <ScoreInput assignment={a} onCommit={(v) => onScore(a.id, v)} width={phone ? 52 : 58} />
          <span className="cad-nums" style={{ font: `500 11.5px ${fonts.sans}`, color: colors.faint }}>
            /{fmtPoints(possible)}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexShrink: 0 }}>
          <input
            value={whatIf}
            onChange={(e) => setWhatIf((w) => ({ ...w, [a.id]: e.target.value }))}
            inputMode="decimal"
            placeholder="what if"
            aria-label={`Hypothetical score for ${a.title}`}
            className="cad-nums"
            style={{
              width: phone ? 66 : 74,
              // Dashed, so a hypothetical never looks like something you earned.
              border: `1px dashed ${whatIf ? colors.accent : colors.inputBorder}`,
              background: 'transparent',
              borderRadius: 9,
              padding: '7px 9px',
              font: `600 13px ${fonts.sans}`,
              color: whatIf ? colors.accent : colors.muted2,
              outline: 'none',
              textAlign: 'right',
            }}
          />
          <span className="cad-nums" style={{ font: `500 11.5px ${fonts.sans}`, color: colors.faint }}>
            /{fmtPoints(possible)}
          </span>
        </div>
      )}
    </div>
  );
}
