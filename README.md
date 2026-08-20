# Cadence

What class is next, what's due, and where your grade actually stands.

A single-user PWA for running a semester: courses and their meeting times, an
assignment list that sorts itself by what's coming, and a grading engine that
answers the only two questions that change behaviour — *what happens if this
next exam goes badly*, and *what do I need to still get an A*.

Desktop is for setup and bulk entry; the phone is for the ten-second "log this
score between classes" moment.

## Stack

React 19 + Vite + Supabase (Postgres + Auth), plain JSX, no UI framework, no
state library. Same shape as [Tend](../Tend), and the auth flow is lifted from
it near-verbatim.

## Running it

```bash
npm install
```

Copy the Supabase project URL and publishable key into `.env.local`:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
```

```bash
npm run dev
```

Other scripts: `npm test` (grade math), `npm run lint`, `npm run build`.

The schema lives in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
Every table is behind RLS with one policy shape — `user_id = auth.uid()` — so
the publishable key in the browser bundle can't reach anyone else's rows.

## How the grade is computed

All of it lives in [`src/grading/engine.js`](src/grading/engine.js), as pure
functions over plain rows — no React, no network. That's what makes it testable,
and it's why the what-if simulator and the needed-score solver run the *same*
code as the live grade rather than a parallel approximation that can drift.

Three rules decide everything:

1. **A category's percentage is points earned over points possible** within it —
   not the mean of the per-assignment percentages. Those agree when every item
   is worth the same; where they disagree (a 10-point quiz beside a 100-point
   exam), points-based is what the syllabus means.
2. **Only categories with at least one graded item count**, and their weights
   re-normalize to fill the gap. In week two, 92% on homework means your grade
   is 92% — not 18.4% of a semester you haven't taken yet.
3. **Drop-lowest applies to whatever is graded right now**, by percentage rather
   than raw points, and never empties a category — see the comment on
   `applyDrops` for why keeping one score is the stable choice.

The **needed-score solver** bisects rather than solving algebraically. The closed
form looks tractable until drop-lowest enters it: which assignments get dropped
depends on the score you're solving for, so the curve is piecewise. It is
monotonic, though, and that's all bisection needs.

GPA is a straight 4.0 scale with no +/- weighting (Tennessee Tech's actual
scale), computed from where each course stands *now* — courses with no graded
work are left out rather than counted as zero.

`npm test` covers all of this with hand-computed expected values; each test
carries the arithmetic in a comment above it.

## Layout

```
src/
  grading/       engine.js (the math), scale.js (letters + grade points)
  data/          SemesterProvider.jsx (all six tables), grades.js (engine ↔ app)
  auth/          Supabase session, sign-in, password reset
  views/         TodayView, ScheduleView, WorkView, GradesView, CoursesView
  components/    modals, nav, shared UI
  theme.js       tokens → CSS custom properties in index.css
```

Two deliberate departures from Tend worth knowing about:

- **One data provider, not a hook per table.** Nothing here is independent — a
  grade needs categories, assignments, credit hours and scale overrides at once
  — and cumulative GPA is a question about every term, so "load only the active
  term" would buy nothing.
- **Rows travel in database shape** (`points_possible`, not `pointsPossible`).
  The engine reads them directly; a translation layer would only be somewhere
  for the two to drift apart.

## Not built yet

Phase 3, deliberately left out:

- CSV export of grades
- Push notifications (in-app due-soon badges cover the MVP)
- Calendar overlay of assignments onto the schedule grid

Drop-lowest was specified as Phase 3 but is implemented — it's part of what
makes the grade correct, so it belongs in the engine rather than bolted on.
