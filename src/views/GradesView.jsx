import { useState, useMemo } from 'react';
import { colors, tone, fonts, courseColor } from '../theme';
import { describeDue } from '../dates';
import { isEvent } from '../assignments';
import { useSemester } from '../data/SemesterProvider';
import { useCourseGrade, useTermGrades, useGpa, useTermGpaPlan, EMPTY_OVERRIDES } from '../data/grades';
import { courseTag } from '../courses';
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
  KindTag,
} from '../components/ui';
import { PrimaryButton, GhostButton, Chip, inputStyle } from '../components/Modal';
import { DegreeProgress } from '../components/DegreeProgress';
import { ScoreInput, PresentSwitch } from '../components/AssignmentModal';

// Where the app earns its keep. The list answers "how am I doing"; the detail
// answers the two questions that actually change behaviour — "what happens if
// this next exam goes badly" and "what do I need to still get an A".

export function GradesView({ onOpenCourse, onAddCourse, onOpenDegree, navigate }) {
  const termGrades = useTermGrades();
  const gpa = useGpa();
  const phone = useIsPhone();
  const { features } = useSemester();

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
                {/* A pass/fail lab or a course you withdrew from is still a
                    course with work in it — but its grade means something
                    different, and a row that doesn't say so is a row that
                    quietly misleads. */}
                {courseTag(course) && (
                  <span style={{ color: colors.faint }}> · {courseTag(course)}</span>
                )}
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

      <GpaPanel gpa={gpa} phone={phone} degree={features.degree} />

      <div style={{ marginTop: 26 }}>
        <TermTarget phone={phone} navigate={navigate} />
      </div>

      {features.degree && (
        <div style={{ marginTop: 26 }}>
          <DegreeProgress onSetUp={onOpenDegree} />
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <GhostButton onClick={onOpenCourse}>Manage courses</GhostButton>
      </div>
    </>
  );
}

// Two tiles, or one.
//
// Cumulative is a claim about every semester you have taken, and the rows that
// make it true — the ones from before this app — live behind the degree switch.
// With that switch off there is nothing for it to be cumulative *over*, so it
// would be this term's number printed twice under two different words, which is
// worse than not printing it.
function GpaPanel({ gpa, phone, degree = true }) {
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
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: !degree
            ? 'minmax(0, 220px)'
            : phone
              ? '1fr 1fr'
              : 'repeat(2, minmax(0, 220px))',
          gap: 10,
        }}
      >
        {tile(
          'This term',
          gpa.term,
          gpa.term.credits ? `${fmtCredits(gpa.term.credits)} credits counted` : 'No graded work yet',
        )}
        {degree &&
          tile(
            'Cumulative',
            gpa.cumulative,
            gpa.cumulative.priorCredits
              ? `${fmtCredits(gpa.cumulative.credits)} credits, ${fmtCredits(gpa.cumulative.priorCredits)} from before`
              : gpa.cumulative.credits
                ? `${fmtCredits(gpa.cumulative.credits)} credits counted`
                : 'Across every term',
          )}
      </div>
      {/* A GPA computed from courses that aren't finished is a projection, and
          saying so is the difference between a useful number and a wrong one. */}
      <div style={{ font: `400 11.5px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 9 }}>
        Based on where each course stands right now, on a straight 4.0 scale.
        {degree && gpa.cumulative.ungraded > 0 &&
          ` ${gpa.cumulative.ungraded} course${gpa.cumulative.ungraded === 1 ? '' : 's'} with no graded work yet ${gpa.cumulative.ungraded === 1 ? 'is' : 'are'} left out.`}
        {/* Said separately from the ungraded count on purpose: one is waiting
            for a number and the other is never getting one. */}
        {degree && gpa.cumulative.excluded > 0 &&
          ` ${gpa.cumulative.excluded} pass/fail, audited or withdrawn ${gpa.cumulative.excluded === 1 ? 'course carries' : 'courses carry'} no grade points at all.`}
      </div>
      {/* Until history is in, "cumulative" is a word this app has not earned —
          it means one semester, and for anyone past their first that is a
          number they would not recognise as theirs. */}
      {degree && !gpa.hasHistory && (
        <div style={{ font: `400 11.5px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 5 }}>
          Cumulative only covers terms tracked here. Add the semesters that came before it under
          Settings &rarr; Degree and it becomes your real one.
        </div>
      )}
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
                  ? cat.remainingCount + cat.unenteredCount > 0
                    ? `${cat.remainingCount + cat.unenteredCount} coming · not counted yet`
                    : 'Nothing here yet'
                  : `${fmtPoints(cat.earned)} / ${fmtPoints(cat.possible)} pts` +
                    (cat.droppedKeys.length ? ` · ${cat.droppedKeys.length} dropped` : '') +
                    (cat.remainingCount > 0 ? ` · ${cat.remainingCount} left` : '') +
                    (cat.unenteredCount > 0 ? ` · ${cat.unenteredCount} not entered` : '')}
              </div>

              {/* A drop the syllabus grants that hasn't been spent yet. Said out
                  loud because it is the one thing that makes this category read
                  lower than a student expects — and "where did my dropped quiz
                  go" is a much worse question than the sentence that answers it
                  before it gets asked. */}
              {cat.dropsHeld > 0 && cat.gradedCount > 0 && (
                <div style={{ font: `400 11.5px/1.45 ${fonts.sans}`, color: colors.faint, marginTop: 3 }}>
                  <span className="cad-nums">
                    {cat.droppedKeys.length} of {cat.dropLowestN}
                  </span>{' '}
                  drops applied so far &mdash; the rest land as the category fills in.
                </div>
              )}
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
      case 'reachable': {
        // Two numbers, because they are two different kinds of left. Rows you
        // have entered and not scored are work you can see; rows the syllabus
        // promises and nobody has typed in are work you can't — and the average
        // below is over both, so both have to be said.
        const left = solved.remainingCount + solved.unenteredCount;
        return {
          headline: `${fmtPct(solved.needed)} average`,
          body:
            `on the ${left} piece${left === 1 ? '' : 's'} of work left` +
            (solved.unenteredCount > 0
              ? ` — ${solved.remainingCount} entered, ${solved.unenteredCount} still to come.`
              : ` (${fmtPoints(solved.remainingPossible)} points).`),
          tone: colors.ink,
        };
      }
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

        {/* What every number above is standing on.
            A category that never said how many items it would have is a
            category the forecast has to assume is finished, and assuming that
            silently is how an app tells you a term is settled in week nine. It
            is not a warning — "homework, however many he sets" is most syllabi —
            so it is said once, quietly, where the number it qualifies is. */}
        {solved.unstated.length > 0 && solved.status !== 'no-remaining' && (
          <div style={{ font: `400 11.5px/1.55 ${fonts.sans}`, color: colors.faint, marginTop: 10 }}>
            Assumes what&rsquo;s entered is all of it for{' '}
            {solved.unstated.map((c) => c.name).join(', ')}. If you know how many there&rsquo;ll be,
            say so in the course and this gets sharper.
          </div>
        )}

        {/* The two ends of the range. Between them is every grade still
            available to you, which is usually the thing worth knowing. */}
        {solved.remainingCount + solved.unenteredCount > 0 && (
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
      if (a.counts_toward_grade === false) continue;
      if (a.category_id && map.has(a.category_id)) map.get(a.category_id).push(a);
    }
    for (const list of map.values()) {
      list.sort((x, y) => String(x.due_at ?? '9').localeCompare(String(y.due_at ?? '9')));
    }
    return map;
  }, [grade.categories, grade.assignments]);

  // Work this course doesn't grade. Listed rather than hidden — it's real work
  // with a real date, and leaving it off the one page that shows everything for
  // this course would make the page quietly incomplete. Below the graded
  // categories, without score boxes, because there is nothing to type in.
  const notCounted = useMemo(
    () =>
      grade.assignments
        .filter((a) => a.counts_toward_grade === false)
        .sort((x, y) => String(x.due_at ?? '9').localeCompare(String(y.due_at ?? '9'))),
    [grade.assignments],
  );

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
                <span style={{ textTransform: 'none', letterSpacing: 0, color: colors.faint, fontWeight: 500 }}>
                  {cat.creditBasis === 'completion' ? ' · present or missed' : ''}
                  {cat.dropLowestN > 0 ? ` · drops ${cat.dropLowestN} lowest` : ''}
                  {cat.unenteredCount > 0
                    ? ` · ${cat.unenteredCount} more expected`
                    : ''}
                </span>
              </div>

              {rows.map((a, i) => (
                <AssignmentScoreRow
                  key={a.id}
                  assignment={a}
                  first={i === 0}
                  dropped={dropped.has(a.id)}
                  completion={cat.creditBasis === 'completion'}
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

        {notCounted.length > 0 && (
          <Card style={{ padding: phone ? '4px 14px' : '6px 20px' }}>
            <div
              style={{
                padding: '12px 0 10px',
                font: `600 11.5px ${fonts.sans}`,
                color: colors.muted,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Not graded
              <span style={{ textTransform: 'none', letterSpacing: 0, color: colors.faint, fontWeight: 500 }}>
                {' '}
                · {notCounted.length} item{notCounted.length === 1 ? '' : 's'}, no effect on the
                grade above
              </span>
            </div>

            {notCounted.map((a, i) => (
              <button
                key={a.id}
                onClick={() => onOpen(a)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '11px 0',
                  borderTop: i === 0 ? 'none' : `1px solid ${colors.divider}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ font: `600 13.5px ${fonts.sans}`, color: colors.muted3 }}>
                    {a.title}
                  </span>
                  <KindTag kind={a.kind} />
                </div>
                <div style={{ font: `400 11px ${fonts.sans}`, color: colors.faint, marginTop: 2 }}>
                  {a.due_at
                    ? describeDue(a.due_at, undefined, { event: isEvent(a.kind) }).label
                    : 'No due date'}
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>
    </section>
  );
}

/**
 * "What do I need in each class to finish the term at 3.5?"
 *
 * The course page answers this one course at a time; a term GPA is produced by
 * five courses at once and there are many combinations of letters that reach it.
 * Rather than invent one and present it as the plan, every line is solved on the
 * same stated assumption — everything else lands where it stands today — which
 * makes each one independently true instead of a set that collapses the moment
 * one number moves.
 *
 * The second half of each line is the part that makes it actionable: a letter is
 * a cutoff on that course's own scale, so the same solver that runs the course
 * page turns "needs a B" into "88% on the four assignments left".
 */
function TermTarget({ phone, navigate }) {
  const { primaryProgram } = useSemester();
  const [target, setTarget] = useState(() => {
    const goal = Number(primaryProgram?.gpa_goal);
    return Number.isFinite(goal) && goal > 0 ? goal : 3.5;
  });
  const plan = useTermGpaPlan(target);

  // Nothing to say about a term with no courses that carry grade points — an
  // all-pass/fail semester has no GPA to aim at.
  if (!plan.courses.length) return null;

  return (
    <>
      <SectionHeading>Finishing this term at</SectionHeading>
      <Card style={{ padding: phone ? '16px 16px' : '18px 20px' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          {[4, 3.7, 3.5, 3, 2].map((t) => (
            <Chip key={t} active={Math.abs(target - t) < 0.001} onClick={() => setTarget(t)}>
              {t.toFixed(1)}
            </Chip>
          ))}
          <input
            type="number"
            min="0"
            max="4"
            step="0.1"
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            aria-label="Custom term GPA target"
            style={{ ...inputStyle, width: 78, textAlign: 'right', padding: '9px 10px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
          <span
            className="cad-nums"
            style={{
              font: `600 26px ${fonts.sans}`,
              color: plan.met ? tone.green : colors.ink,
              letterSpacing: '-0.02em',
            }}
          >
            {fmtGpa(plan.gpa)}
          </span>
          <span style={{ font: `400 13px ${fonts.sans}`, color: colors.muted2 }}>
            {plan.gpa == null
              ? 'no graded work in the term yet'
              : plan.met
                ? `where the term stands — already past ${fmtGpa(target)}`
                : `where the term stands, over ${fmtCredits(plan.credits)} credits`}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 2, marginTop: 14 }}>
          {plan.courses.map((row) => (
            <TargetRow key={row.id} row={row} navigate={navigate} />
          ))}
        </div>

        <div style={{ font: `400 11px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 12 }}>
          Each line assumes every other course finishes where it stands now. They&rsquo;re true one
          at a time, not all at once — improve two of them and both get easier.
          {plan.excluded > 0 &&
            ` ${plan.excluded} course${plan.excluded === 1 ? '' : 's'} left out: pass/fail, audited or withdrawn work carries no grade points.`}
        </div>
      </Card>
    </>
  );
}

function TargetRow({ row, navigate }) {
  const { course } = row;

  const detail = () => {
    if (row.status === 'locked') return { text: 'Nothing needed here', color: tone.green };
    if (row.status === 'impossible')
      return { text: 'No grade here reaches it alone', color: tone.red };

    const letter = `Needs ${/^[AEIOU]/i.test(row.neededLetter ?? '') ? 'an' : 'a'} ${row.neededLetter}`;
    const s = row.solved;
    if (!s) return { text: letter, color: colors.ink };
    if (s.status === 'locked') return { text: `${letter} — already banked`, color: tone.green };
    if (s.status === 'no-remaining')
      return { text: `${letter} — nothing left that could change it`, color: tone.amberText };
    if (s.status === 'impossible' || s.status === 'stretch')
      return { text: `${letter} — out of reach now`, color: tone.red };
    return {
      text: `${letter} — ${fmtPct(s.needed)} on the ${s.remainingCount} left`,
      color: colors.ink,
    };
  };

  const d = detail();

  return (
    <button
      onClick={() => navigate(`grades/${row.id}`)}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 0',
      }}
    >
      <CourseDot color={course?.color} size={8} />
      <span
        style={{
          font: `600 13px ${fonts.sans}`,
          color: colors.ink,
          flex: 1,
          minWidth: 0,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {course?.code || course?.name}
      </span>
      <span style={{ font: `500 11px ${fonts.sans}`, color: colors.faint, flexShrink: 0 }}>
        {row.currentLetter ?? '—'}
      </span>
      <span
        style={{ font: `600 12px ${fonts.sans}`, color: d.color, flexShrink: 0, textAlign: 'right' }}
      >
        {d.text}
      </span>
    </button>
  );
}

function AssignmentScoreRow({
  assignment: a,
  first,
  dropped,
  completion,
  whatIf,
  setWhatIf,
  onScore,
  onOpen,
  phone,
}) {
  const graded = isGraded(a);
  const possible = Number(a.points_possible) || 0;
  // Graded work borrows the event dialect, which never says "late". Once a
  // score is in, whether the thing was handed in past its deadline is history
  // the gradebook has already priced in — "6d late" beside a 46/50 reads as an
  // outstanding problem rather than a date.
  const due = describeDue(a.due_at, undefined, { event: isEvent(a.kind) || graded });

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
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
          </span>
          <KindTag kind={a.kind} />
        </div>
        <div style={{ font: `400 11px ${fonts.sans}`, color: colors.faint, marginTop: 2 }}>
          {dropped ? 'Dropped — lowest score' : due.type === 'none' ? 'No due date' : due.label}
        </div>
      </button>

      {completion ? (
        <PresentSwitch
          assignment={a}
          graded={graded}
          possible={possible}
          onScore={onScore}
        />
      ) : graded ? (
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

