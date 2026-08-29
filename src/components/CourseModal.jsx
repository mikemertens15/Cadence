import { useState, useMemo } from 'react';
import { colors, tone, fonts, COURSE_COLORS, courseColor } from '../theme';
import { DAY_NAMES } from '../dates';
import { DEFAULT_SCALE, PLUS_MINUS_SCALE, scaleFor } from '../grading/scale';
import { GRADING_BASES, COURSE_STATUSES, basisOf, statusOf } from '../courses';
import { useSemester } from '../data/SemesterProvider';
import { ProgramPicker } from './DegreePanel';
import {
  ModalShell,
  Field,
  Chip,
  inputStyle,
  PrimaryButton,
  GhostButton,
  DeleteButton,
} from './Modal';

// Creating a course is the first real thing anyone does in this app, and the
// thing most likely to be abandoned halfway — so it asks for everything at once
// (identity, when it meets, how it's graded) with every field already carrying a
// usable default. You can open this and press Save without typing anything but
// a name, and get a course that actually produces a grade.
//
// The alternative — a bare course form, then a separate screen for meetings,
// then another for categories — leaves people with courses that can't be graded
// and no obvious sign of what's missing.

// A four-part scheme covers most syllabi and, more importantly, shows the shape
// of the thing: named buckets, weights, adding to 100.
//
// `expected` is how many items the syllabus says the bucket will hold, and it is
// blank in every preset on purpose: a made-up count is worse than none, because
// the whole value of the number is that it came off a syllabus. `basis` is how
// the professor scores it — points, or the fact you were there.
const blank = (name, weight, drop = 0) => ({ name, weight, drop, expected: '', basis: 'score' });

const DEFAULT_SCHEME = [
  blank('Homework', 20),
  blank('Quizzes', 15),
  blank('Midterm', 25),
  blank('Final', 40),
];

const PRESETS = [
  ['Four-part', DEFAULT_SCHEME],
  [
    'Two exams',
    [blank('Homework', 30), blank('Exam 1', 20), blank('Exam 2', 20), blank('Final', 30)],
  ],
  ['One bucket', [blank('Everything', 100)]],
  // The shape the release exists for: a weight earned by turning up, and a
  // number of class days to earn it over. Offered as a preset because it is the
  // one scheme people don't think to look for a way to express.
  [
    'With attendance',
    [
      blank('Homework', 20),
      blank('Exams', 50),
      { name: 'Attendance', weight: 30, drop: 0, expected: '', basis: 'completion' },
    ],
  ],
];

// Existing meeting rows collapse back into the blocks this form edits: three
// MWF rows at 9:00 are one block with three days ticked, which is how a person
// thinks about it and how they typed it in the first place.
function toBlocks(meetings) {
  const groups = new Map();
  for (const m of meetings) {
    const key = `${m.start_time}|${m.end_time}`;
    const g = groups.get(key) ?? { days: [], start: m.start_time.slice(0, 5), end: m.end_time.slice(0, 5) };
    g.days.push(m.day_of_week);
    groups.set(key, g);
  }
  const blocks = [...groups.values()].map((g) => ({ ...g, days: g.days.sort((a, b) => a - b) }));
  return blocks.length ? blocks : [newBlock()];
}

const newBlock = () => ({ days: [], start: '09:00', end: '09:50' });

export function CourseModal({ course, onClose, phone }) {
  const {
    activeTerm,
    features,
    categoriesByCourse,
    meetingsByCourse,
    scaleByCourse,
    programs,
    primaryProgram,
    programIdsByCourse,
    createCourse,
    updateCourse,
    deleteCourse,
    setMeetings,
    setCategories,
    setScale,
    setCoursePrograms,
  } = useSemester();

  const editing = Boolean(course);
  const existingCats = course ? (categoriesByCourse.get(course.id) ?? []) : [];
  const existingScale = course ? scaleByCourse.get(course.id) : null;

  const [name, setName] = useState(course?.name ?? '');
  const [code, setCode] = useState(course?.code ?? '');
  const [instructor, setInstructor] = useState(course?.instructor ?? '');
  const [location, setLocation] = useState(course?.location ?? '');
  const [credits, setCredits] = useState(String(course?.credit_hours ?? 3));
  const [color, setColor] = useState(course?.color ?? COURSE_COLORS[0]);
  const [basis, setBasis] = useState(course?.grading_basis ?? 'graded');
  const [status, setStatus] = useState(course?.status ?? 'enrolled');
  // A new course counts toward whatever you're mainly doing, because that is
  // the true answer for nearly all of them. The exceptions — the graduate
  // course, the one taken for interest — are two taps, and they are the only
  // ones worth asking about.
  const [planIds, setPlanIds] = useState(() =>
    course ? (programIdsByCourse.get(course.id) ?? []) : primaryProgram ? [primaryProgram.id] : [],
  );
  const [blocks, setBlocks] = useState(() => toBlocks(course ? (meetingsByCourse.get(course.id) ?? []) : []));
  const [cats, setCats] = useState(() =>
    editing
      ? existingCats.map((c) => ({
          id: c.id,
          name: c.name,
          weight: Number(c.weight_pct),
          drop: c.drop_lowest_n ?? 0,
          // Empty string rather than null, because this is an input's value and
          // React would otherwise switch it from uncontrolled to controlled the
          // first time somebody types a digit into it.
          expected: c.expected_count == null ? '' : String(c.expected_count),
          basis: c.credit_basis === 'completion' ? 'completion' : 'score',
        }))
      : DEFAULT_SCHEME.map((c) => ({ ...c })),
  );
  const [scaleKind, setScaleKind] = useState(() => {
    if (!existingScale?.length) return 'straight';
    const current = scaleFor(existingScale);
    const same =
      current.length === PLUS_MINUS_SCALE.length &&
      current.every((r, i) => r.letter === PLUS_MINUS_SCALE[i].letter && r.min === PLUS_MINUS_SCALE[i].min);
    return same ? 'plusminus' : 'custom';
  });
  const [customScale, setCustomScale] = useState(() =>
    existingScale?.length ? scaleFor(existingScale) : DEFAULT_SCALE,
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const weightTotal = useMemo(
    () => cats.reduce((t, c) => t + (Number(c.weight) || 0), 0),
    [cats],
  );
  const weightsOk = Math.abs(weightTotal - 100) < 0.01;
  const canSave = name.trim() && !busy;

  // How many of each, and marks for turning up. Behind the beta channel until
  // it has had a semester pointed at it — see BETA in src/features.js. Nothing
  // stored is gated: a course whose categories carry counts still grades on them
  // for everyone, because the engine reads the columns regardless. This decides
  // only whether the questions are asked.
  const richScheme = features.has('grades.scheme');

  // Somebody who has turned the timetable off is not going to be asked when the
  // class meets — it is the longest section on this form and it feeds a screen
  // they don't have. Their existing meeting rows are left exactly alone rather
  // than saved back from a form that stopped showing them: an editor you can't
  // see is not an editor you meant to submit.
  const askMeetings = features.schedule;

  const patchCat = (i, patch) => setCats((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const patchBlock = (i, patch) => setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  const toggleDay = (i, day) =>
    setBlocks((bs) =>
      bs.map((b, j) =>
        j === i
          ? { ...b, days: b.days.includes(day) ? b.days.filter((d) => d !== day) : [...b.days, day].sort((x, y) => x - y) }
          : b,
      ),
    );

  // Blocks are the editing shape; the database wants one row per day.
  const expandMeetings = () =>
    blocks.flatMap((b) =>
      b.days.map((day) => ({ day, start: b.start, end: b.end })),
    );

  async function save() {
    if (!canSave) return;
    setBusy(true);

    const cleanCats = cats
      .filter((c) => c.name.trim())
      .map((c) => ({
        ...c,
        weight: Number(c.weight) || 0,
        drop: Number(c.drop) || 0,
        expected: Number(c.expected) > 0 ? Number(c.expected) : null,
      }));
    const scaleRows =
      scaleKind === 'straight' ? [] : scaleKind === 'plusminus' ? PLUS_MINUS_SCALE : customScale;

    const fields = {
      name,
      code,
      instructor,
      location,
      creditHours: Number(credits) || 0,
      color,
    };

    if (editing) {
      await updateCourse(course.id, {
        name: fields.name.trim(),
        code: fields.code.trim() || null,
        instructor: fields.instructor.trim() || null,
        location: fields.location.trim() || null,
        credit_hours: fields.creditHours,
        color: fields.color,
        grading_basis: basis,
        status,
      });
      if (askMeetings) await setMeetings(course.id, expandMeetings());
      await setCategories(course.id, cleanCats);
      await setScale(course.id, scaleRows);
      await setCoursePrograms(course.id, planIds);
    } else {
      const created = await createCourse({
        termId: activeTerm.id,
        ...fields,
        gradingBasis: basis,
        status,
        meetings: askMeetings ? expandMeetings() : [],
        categories: cleanCats,
        programIds: planIds,
      });
      if (created && scaleRows.length) await setScale(created.id, scaleRows);
    }

    setBusy(false);
    onClose();
  }

  async function remove() {
    setBusy(true);
    await deleteCourse(course.id);
    setBusy(false);
    onClose();
  }

  return (
    <ModalShell
      title={editing ? 'Edit course' : 'New course'}
      onClose={onClose}
      phone={phone}
      width={560}
      footer={
        <>
          {editing && (
            <DeleteButton onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
              {confirmDelete ? 'Really delete?' : 'Delete'}
            </DeleteButton>
          )}
          <GhostButton onClick={onClose} style={{ marginLeft: editing ? 0 : 'auto' }}>
            Cancel
          </GhostButton>
          <PrimaryButton onClick={save} disabled={!canSave}>
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Add course'}
          </PrimaryButton>
        </>
      }
    >
      <Field label="Course name">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Differential Equations"
          style={inputStyle}
        />
      </Field>

      <Row>
        <Field label="Code" hint="optional">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="MATH 3120"
            style={inputStyle}
          />
        </Field>
        <Field label="Credit hours">
          <input
            type="number"
            min="0"
            step="0.5"
            value={credits}
            onChange={(e) => setCredits(e.target.value)}
            style={inputStyle}
          />
        </Field>
      </Row>

      <Row>
        <Field label="Instructor" hint="optional">
          <input
            value={instructor}
            onChange={(e) => setInstructor(e.target.value)}
            placeholder="Dr. Ramirez"
            style={inputStyle}
          />
        </Field>
        <Field label="Room" hint="optional">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Bruner 218"
            style={inputStyle}
          />
        </Field>
      </Row>

      <Field label="Colour">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {COURSE_COLORS.map((key) => {
            const c = courseColor(key);
            const active = color === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setColor(key)}
                aria-label={key}
                aria-pressed={active}
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  background: c.solid,
                  outline: active ? `2px solid ${colors.ink}` : 'none',
                  outlineOffset: 2,
                }}
              />
            );
          })}
        </div>
      </Field>

      <Divider />

      {/* ------------------------------------------------- basis and status */}
      <SectionTitle title="How it counts" hint="most courses are the first option of each" />

      <Field label="Grading">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {GRADING_BASES.map(([key, label]) => (
            <Chip key={key} active={basis === key} onClick={() => setBasis(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field label="Where it stands">
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {COURSE_STATUSES.map(([key, label]) => (
            <Chip key={key} active={status === key} onClick={() => setStatus(key)}>
              {label}
            </Chip>
          ))}
        </div>
      </Field>

      {/* Only when it isn't the ordinary case. A line explaining that a graded,
          enrolled course produces a grade is a line nobody needs. */}
      {(basisOf(basis).note && basis !== 'graded') || statusOf(status).note ? (
        <div
          style={{
            font: `400 11.5px/1.55 ${fonts.sans}`,
            color: colors.muted2,
            background: colors.inputBg,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: 11,
            padding: '9px 12px',
            marginTop: -8,
            marginBottom: 16,
          }}
        >
          {[basis !== 'graded' ? basisOf(basis).note : null, statusOf(status).note]
            .filter(Boolean)
            .join('. ')}
          .
        </div>
      ) : null}

      {programs.length > 0 && (
        <ProgramPicker
          programs={programs}
          selected={planIds}
          onChange={setPlanIds}
          label="Counts toward"
        />
      )}

      {askMeetings && <Divider />}

      {/* ---------------------------------------------------------- meetings */}
      {askMeetings && (
        <SectionTitle
          title="When it meets"
          hint="Fills in your weekly schedule"
          action={
            <TinyButton onClick={() => setBlocks((bs) => [...bs, newBlock()])}>
              + Add a time
            </TinyButton>
          }
        />
      )}

      {askMeetings && blocks.map((b, i) => (
        <div
          key={i}
          style={{
            background: colors.inputBg,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: 14,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
            {DAY_NAMES.map((d, day) => (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i, day)}
                aria-pressed={b.days.includes(day)}
                style={{
                  width: 38,
                  padding: '7px 0',
                  borderRadius: 9,
                  font: `600 11.5px ${fonts.sans}`,
                  background: b.days.includes(day) ? colors.accent : colors.card,
                  color: b.days.includes(day) ? colors.onAccent : colors.muted2,
                  border: `1px solid ${b.days.includes(day) ? colors.accent : colors.inputBorder}`,
                }}
              >
                {d[0]}
                {d === 'Thu' || d === 'Sun' ? d[1] : ''}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="time"
              value={b.start}
              onChange={(e) => patchBlock(i, { start: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
            <span style={{ color: colors.muted, font: `400 13px ${fonts.sans}` }}>to</span>
            <input
              type="time"
              value={b.end}
              onChange={(e) => patchBlock(i, { end: e.target.value })}
              style={{ ...inputStyle, flex: 1 }}
            />
            {blocks.length > 1 && (
              <button
                type="button"
                onClick={() => setBlocks((bs) => bs.filter((_, j) => j !== i))}
                aria-label="Remove this time"
                style={{ color: colors.muted, fontSize: 18, padding: '0 4px' }}
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}

      <Divider />

      {/* ---------------------------------------------------------- grading */}
      <SectionTitle
        title="How it's graded"
        hint="Straight off the syllabus"
        action={
          <TinyButton onClick={() => setCats((cs) => [...cs, blank('', 0)])}>+ Category</TinyButton>
        }
      />

      {!editing && (
        <div style={{ display: 'flex', gap: 7, marginBottom: 12, flexWrap: 'wrap' }}>
          {PRESETS.filter(
            ([, scheme]) => richScheme || !scheme.some((c) => c.basis === 'completion'),
          ).map(([label, scheme]) => (
            <Chip key={label} onClick={() => setCats(scheme.map((c) => ({ ...c })))}>
              {label}
            </Chip>
          ))}
        </div>
      )}

      {/* A card per category rather than a row in a table.
          The table was four inputs across, and it was already tight enough on a
          phone that the name field held about six characters. "Seven of them,
          lowest two dropped" needs two more answers than it had room for, and
          the honest way to find that room is to stop pretending a syllabus fits
          on one line. */}
      {cats.map((c, i) => (
        <div
          key={c.id ?? i}
          style={{
            background: colors.inputBg,
            border: `1px solid ${colors.cardBorder}`,
            borderRadius: 14,
            padding: 12,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              value={c.name}
              onChange={(e) => patchCat(i, { name: e.target.value })}
              placeholder="Labs"
              aria-label="Category name"
              style={{ ...inputStyle, flex: 1, minWidth: 0, background: colors.card }}
            />
            <button
              type="button"
              onClick={() => setCats((cs) => cs.filter((_, j) => j !== i))}
              aria-label={`Remove ${c.name || 'category'}`}
              style={{ color: colors.muted, fontSize: 18, padding: '0 2px' }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: richScheme ? '1fr 1fr 1fr' : '1fr 1fr',
              gap: 8,
            }}
          >
            <NumberField
              label="Weight"
              suffix="%"
              value={c.weight}
              onChange={(v) => patchCat(i, { weight: v })}
              max="100"
            />
            {/* Blank is a real answer and the common one: "homework is 10%,
                however many he sets". It is what the forecast then says it is
                assuming, rather than a number the app invented. */}
            {richScheme && (
              <NumberField
                label="How many"
                hint="if the syllabus says"
                value={c.expected}
                onChange={(v) => patchCat(i, { expected: v })}
                placeholder="—"
              />
            )}
            <NumberField
              label="Drop lowest"
              value={c.drop}
              onChange={(v) => patchCat(i, { drop: v })}
            />
          </div>

          {richScheme && (
            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
              <Chip active={c.basis !== 'completion'} onClick={() => patchCat(i, { basis: 'score' })}>
                Scored
              </Chip>
              <Chip
                active={c.basis === 'completion'}
                onClick={() => patchCat(i, { basis: 'completion' })}
              >
                Just turn up
              </Chip>
            </div>
          )}

          {richScheme && c.basis === 'completion' && (
            <div style={{ font: `400 11.5px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 8 }}>
              Marked present or missed instead of scored &mdash; for the in-class work nobody
              checks for correctness.
            </div>
          )}

          {richScheme && Number(c.drop) > 0 && !(Number(c.expected) > 0) && (
            <div style={{ font: `400 11.5px/1.5 ${fonts.sans}`, color: colors.faint, marginTop: 8 }}>
              Without a count, a drop is spent on the worst score so far &mdash; which flatters
              this category until the term fills in. Say how many there&rsquo;ll be and it waits.
            </div>
          )}
        </div>
      ))}

      {/* A scheme that doesn't total 100 still grades — the engine re-normalizes
          — but it almost always means a typo, so say so without blocking. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginTop: 4,
          font: `600 12.5px ${fonts.sans}`,
          color: weightsOk ? colors.muted2 : tone.amberText,
        }}
      >
        <span>Weights total</span>
        <span className="cad-nums">
          {Math.round(weightTotal * 100) / 100}%{weightsOk ? '' : ' — should be 100'}
        </span>
      </div>

      <Divider />

      {/* ------------------------------------------------------------ scale */}
      <SectionTitle title="Grading scale" hint="Tech's default is straight" />
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: scaleKind === 'custom' ? 12 : 0 }}>
        <Chip active={scaleKind === 'straight'} onClick={() => setScaleKind('straight')}>
          90 / 80 / 70 / 60
        </Chip>
        <Chip active={scaleKind === 'plusminus'} onClick={() => setScaleKind('plusminus')}>
          Plus / minus
        </Chip>
        <Chip
          active={scaleKind === 'custom'}
          onClick={() => {
            setCustomScale((s) => (s?.length ? s : DEFAULT_SCALE));
            setScaleKind('custom');
          }}
        >
          Custom
        </Chip>
      </div>

      {scaleKind === 'custom' && (
        <>
          {customScale.map((row, i) => (
            <div
              key={i}
              style={{ display: 'grid', gridTemplateColumns: '1fr 90px 24px', gap: 8, marginBottom: 8 }}
            >
              <input
                value={row.letter}
                onChange={(e) =>
                  setCustomScale((s) => s.map((r, j) => (j === i ? { ...r, letter: e.target.value } : r)))
                }
                placeholder="A"
                style={inputStyle}
              />
              <input
                type="number"
                value={row.min}
                onChange={(e) =>
                  setCustomScale((s) =>
                    s.map((r, j) => (j === i ? { ...r, min: Number(e.target.value) } : r)),
                  )
                }
                style={{ ...inputStyle, textAlign: 'right' }}
              />
              <button
                type="button"
                onClick={() => setCustomScale((s) => s.filter((_, j) => j !== i))}
                aria-label={`Remove ${row.letter}`}
                style={{ color: colors.muted, fontSize: 18 }}
              >
                ×
              </button>
            </div>
          ))}
          <TinyButton onClick={() => setCustomScale((s) => [...s, { letter: '', min: 0 }])}>
            + Cutoff
          </TinyButton>
        </>
      )}
    </ModalShell>
  );
}

// -------------------------------------------------------------------- bits

function Row({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>;
}

function Divider() {
  return <div style={{ height: 1, background: colors.divider, margin: '18px 0' }} />;
}

function SectionTitle({ title, hint, action }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap' }}>
        <span style={{ font: `400 17px ${fonts.serif}`, color: colors.ink }}>{title}</span>
        {hint && <span style={{ font: `400 11.5px ${fonts.sans}`, color: colors.faint }}>{hint}</span>}
      </div>
      {action}
    </div>
  );
}

function TinyButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ font: `600 12px ${fonts.sans}`, color: colors.accent }}
    >
      {children}
    </button>
  );
}

function MiniLabel({ children, title }) {
  return (
    <span title={title} style={{ font: `600 11px ${fonts.sans}`, color: colors.faint }}>
      {children}
    </span>
  );
}

// A small labelled number, for the three questions a category answers about
// itself. Labelled rather than placeheld: "20 / 7 / 2" in a row of bare boxes is
// unreadable a week later, and a syllabus is exactly the thing you come back to
// a week later.
function NumberField({ label, hint, value, onChange, suffix, placeholder, max }) {
  return (
    <label style={{ display: 'block', minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginBottom: 4 }}>
        <MiniLabel>{label}</MiniLabel>
        {hint && (
          <span style={{ font: `400 10px ${fonts.sans}`, color: colors.faint, opacity: 0.8 }}>
            {hint}
          </span>
        )}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <input
          type="number"
          min="0"
          max={max}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{ ...inputStyle, background: colors.card, textAlign: 'right', minWidth: 0 }}
        />
        {suffix && (
          <span style={{ font: `500 12px ${fonts.sans}`, color: colors.muted2 }}>{suffix}</span>
        )}
      </span>
    </label>
  );
}
