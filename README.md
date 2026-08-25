# Cadence

What class is next, what's due, and where your grade actually stands.

A single-user PWA for running a semester: courses and their meeting times, the
work and exams coming at you, and a grading engine that answers the only two
questions that change behaviour — *what happens if this next exam goes badly*,
and *what do I need to still get an A*. Plus the two questions a semester at a
time can't answer on its own: what your GPA actually is, and how far through the
degree you've got.

And, since 1.1, the question you ask five times a week with the app already open:
*which of these five classes should get the next hour* — answered from the work,
the deadlines and the grades it is already keeping, rather than from a stopwatch
that knows none of them.

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

Other scripts: `npm test` (grade math and the study plan), `npm run lint`,
`npm run build`.

The schema lives in [`supabase/migrations/`](supabase/migrations/) — `0001_init.sql`
for the core tables, `0002_exams_history_breaks.sql` for exams, past semesters,
the degree goal and days off, `0003_programs_practice_work_and_basis.sql`
for work that isn't graded, how a course is scored, and the several things a
person is actually working toward, and `0004_study_sessions.sql` for the hours
you put in and how many of them each class was meant to get.
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

## Work that isn't graded, and the difference from work that isn't filed

Some homework is just homework: handed out "for your own benefit", collected by
nobody, graded by nobody. You still want the due date, because you still have to
do it before Thursday's lecture stops making sense.

Until 1.0 the only way to say that was to leave the category blank — which is
the same state as *I haven't got round to filing this yet*, and that state is
worth nagging about, because it silently costs you a grade. Two different facts,
one representation, and the app warned about both forever.

`assignments.counts_toward_grade` is the difference. False means the course does
not grade this, and the grade engine drops the row entirely: not averaged, not
counted as work remaining, not projected over by the solver. Blank-category with
the flag still true means what it always meant.

## The kind of work picks the category

Choosing "Quiz" and then choosing "Quizzes" is the same decision twice, and the
second one is the one you skip — which is how a quiz ends up outside the grade
entirely. `suggestCategory()` in [`src/assignments.js`](src/assignments.js) makes
that second choice, from three sources in order of how much they actually know:

1. **What you did last time.** If the previous two quizzes in this course went
   into "Exams", the next one does too, even though a "Quizzes" category exists.
   A decision about this course beats any rule about names.
2. **The names on the syllabus,** matched loosely enough that HW, Problem Sets
   and "Homework & Labs" all land in the same place.
3. **A course with one bucket,** where there is nothing to guess.

And a fourth answer that matters as much: *nothing*. A syllabus reading Exams 60
/ Final 40 has no home for a problem set, and the honest response is to enter it
as not graded rather than file it somewhere it will dilute an exam average. The
form says which of the four happened, because a guess nobody can see is a guess
nobody can correct.

## Exams are not assignments

A problem set is due *by* a moment — hand it in at 11:58pm and you're fine. A
test happens *at* one: you sit in a room at 2pm for fifty minutes, and "late"
isn't a state it can be in.

That single difference is the whole of `assignments.kind`, and it decides four
things: the date field says *when* rather than *due*, it defaults to a
believable hour instead of midnight, the thing gets drawn on the schedule grid,
and once it's behind you it files under "waiting on a grade" rather than sitting
in Overdue in red implying you failed to hand in a test you turned up for.

Everything else about the two is identical — both are worth points, both live in
a weighted category, both feed the same grade — which is why it's a column and
not a second table. See [`src/assignments.js`](src/assignments.js).

## History, and the several things you're working toward

Cumulative GPA is a lie until the semesters before this app are in it, and
re-entering four years of assignments is a thing nobody will do. It isn't
needed: a finished semester is completely described by its credit hours and the
GPA it earned, which is exactly what a registrar multiplies together. So
`prior_terms` takes one row per past semester — or one lump row for everything
before you started tracking. Both produce the identical cumulative GPA; the
choice is only about how much detail you want back out.

Degree progress is credits toward a total and deliberately nothing more.
Whether a specific course satisfies a specific requirement needs a catalog to
answer, changes by catalog year, and is wrong in ways a student can't check —
DegreeWorks owns that problem, and being confidently wrong about it would be
worse than not claiming to know. Credits are the part everyone can state from
memory, and enough to draw a bar that moves twice a year. Banked credits and the
ones you're currently sitting in are drawn as separate segments, because rolling
them together would quietly inflate the number every January and August.

What 1.0 changes is *how many* totals there are. `degree_plan` was one row per
user, and six years in that is the wrong shape: there's a degree, often a second
one, sometimes graduate hours, and a handful of classes taken because they
looked interesting. "169 credits out of 120" is not a sentence about any of
them — it's a sentence about a denominator that stopped being true.

So programs are a list, and `credit_applications` says which credits count
toward which. It's a join table rather than a `plan_id` column for one reason:
**gen eds**. Calculus I is on the mechanical engineering audit *and* the second
degree's, and a single column would force you to pick one and under-count the
other. A course is applied to zero programs (taken for interest), one (the
ordinary case), or several (shared).

Shared credits are the thing worth being explicit about. They advance both bars
and are counted **once** in your total, which means the program totals
deliberately sum to more than the number of credits you have taken. That is
correct, and it is reported as `shared` rather than left to be discovered as two
numbers that should have matched and don't. A row's GPA weight is likewise
counted exactly once no matter how many programs it's applied to — sharing is a
fact about a degree audit, not about arithmetic.

## How a course is scored

Three cases, and only one of them was ever assumed: `graded` (a letter, and it
moves your GPA), `pass_fail` (credit if you pass, no grade points either way),
and `audit` (you sit in the room; the registrar does not). `status` is a separate
axis — `withdrawn` earns neither credit nor grade points, and `incomplete` has no
grade *yet*, so it sits out the same way a course with no graded work does.

A W is not an F. Scoring the 41% you were carrying when you dropped would be the
single most misleading number this app could show, which is why `courseStanding()`
in the engine is the one place that decides — asked from all three directions,
the GPA, the degree bar and the credit ledger, so they cannot disagree.

## What each class needs, for the term as a whole

The per-course solver answers "what do I need on the work left *here*". A term
GPA is produced by five courses at once, and many combinations of letters reach
any given target — so rather than pick one and present it as *the* plan,
`termGpaPlan()` solves each course on the same stated assumption: **everything
else lands where it stands today**. Each line is then independently checkable,
instead of a set that collapses the moment one number moves.

The two halves chain. A letter is a cutoff on that course's own scale, so the
needed letter goes straight back into `neededOnRemaining()` as a target — which
is how "Heat Transfer needs a B" becomes "88% on the four assignments left",
with both halves computed by the code already keeping the live grade honest.

## Which class needs the next hour

A study timer on its own is a stopwatch with a label. It can tell you that you
spent three hours on something; the one thing it cannot tell you is that those
were the wrong three hours — which is the actual failure, and the reason this
belongs here rather than in a stopwatch app. Cadence already knows what's due,
what it's worth, where every grade stands and what each course has left to score
on, so the question it can answer is *which class*.

[`src/study.js`](src/study.js) answers it the same way the grading engine works:
pure functions over plain rows, tested against hand-computed values, so the card
that recommends a course and the panel that draws the week cannot disagree.
Three signals, each a 0–1 pressure, combined with weights written down in the
file where they can be argued with:

- **Time debt** — how much of this week's target is still owed. The literal
  complaint: three hours here is only a problem because two other classes got
  none.
- **Deadline pressure** — what's due inside a week, weighted by how soon *and*
  by how much of what's left in that course it represents. A 190-point exam on
  Thursday outranks a 10-point quiz on Thursday, and both outrank the same exam
  a month out.
- **Grade risk** — how close the course is to the bottom of its letter band,
  measured as a position in the band rather than as raw points clear, because
  two points of headroom means something different on a +/- scale than on a
  straight one. Zero when nothing is left to score on: an hour cannot move a
  grade that is already final, so it isn't a reason to pick that class.

What comes out is a ranking and the reasons behind it, never a bare score. The
number sorts; it isn't a measurement, and showing it would invite being read as
one. The reasons are the part a person can check and overrule, which is the
difference between advice and an oracle — the same reason the category
suggestion says which of its three sources it used.

Deadlines lead the weighting because they're the signal with a hard edge, and
debt is close behind because it's the complaint being fixed. A class you've
given nothing to all week can still outrank one with an exam tomorrow that
already had its six hours — that is not a bug, it's the whole point.

## Deep study, and why the timer is a row

A running block is a row in `study_sessions` with `ended_at` still null, not a
countdown in a browser tab. Nothing about the number is held in memory: elapsed
time is `started_at` subtracted from now, so a sleeping laptop, a locked phone,
a killed tab and a crash all cost nothing, and a block started on the laptop is
visibly still running on the phone. Pausing is stored the same way, as facts
rather than as a mode — `paused_at` while it's open, `paused_ms` once it closes.

At most one block runs at a time, and that is a partial unique index rather than
a rule the client keeps. Two devices each deciding for themselves whether
anything is running is exactly how an afternoon gets counted twice.

The one thing that would make this whole feature worthless is a number that
flatters you. Six hours of "deep study" that were really three is worse than no
number at all, because you'd act on it — the same class of mistake as scoring a
withdrawal as the 41% you were carrying when you dropped. So a pause genuinely
stops the clock, half an hour past its planned length the block stops taking its
own clock at face value and asks which of the two numbers really happened, and a
block stopped within a minute of starting is treated as the misclick it is.

Block lengths come from the timetable, because the app has it. Starting a 90 at
1:20 with a class at 2:00 ends either in an abandoned block or a missed lecture,
so it offers the 35 that fits and says why it's a 35. Eight minutes before a
lecture it says there isn't time — and still lets you start one, since skipping
the lecture is a decision you're allowed to make and an app that greys out the
button is only wrong more confidently.

The weekly target defaults to two hours per credit hour — the low end of the two
to three every syllabus prints, deliberately, because a target you clear is one
you keep looking at and one that says you're four hours down every Sunday gets
ignored inside a fortnight. `courses.weekly_study_minutes` is null for almost
everyone; it exists so you can disagree after a week of watching the real
numbers.

## Getting your data back out

A year of scores living behind someone else's login with no way to take a copy
is a fine trade for a weekend project and a bad one for the thing you're running
a degree on. [`src/data/backup.js`](src/data/backup.js) offers two formats
because they fail in opposite directions: the JSON keeps everything and is
unreadable; the CSV is readable and throws away structure. Neither is the
"advanced" one hidden behind a disclosure.

## Days off

Meeting rows are weekly and have no opinion about the calendar, so without
`term_breaks` the app cheerfully tells you to be in Bruner 218 on Thanksgiving
and counts down to a class nobody is going to.

A break empties the recurring classes inside it and nothing else. Anything with
a real date — an exam, a paper due Monday — still stands: professors schedule
work over a long weekend all the time, and quietly hiding it would be the more
expensive mistake of the two. Both the dashboard and the schedule go through
[`src/data/schedule.js`](src/data/schedule.js), which is why they can't disagree
about what's on a given day.

## Loading, and the difference between empty and unknown

An empty dataset and a failed read look identical from the UI, and conflating
them is what put a first-run wizard in front of people who already had a
semester in the app: a phone waking up without a signal read nothing, and
"nothing" routed to "create your first term".

So `SemesterProvider` tracks whether a read has ever come back clean, a failed
read leaves the existing rows alone rather than blanking them, and the onboarding
screen is reachable only after a read that actually succeeded. It also re-reads
on foreground and on `online` — realtime can't help here, because a socket the
OS killed while the phone was in a pocket comes back empty and confident.

## Layout

```
src/
  grading/       engine.js (the math), scale.js (letters + grade points)
  data/          SemesterProvider.jsx (all eleven tables), grades.js (engine ↔ app),
                 schedule.js (what's on a given date), study.js (hours ↔ app),
                 backup.js (getting it out)
  auth/          Supabase session, sign-in, password reset
  views/         TodayView, ScheduleView, WorkView, GradesView, CoursesView
  components/    modals, nav, shared UI
  assignments.js what kind of thing a piece of work is, and where it's filed
  courses.js     how a course is scored, and whether you're still in it
  programs.js    what you're working toward, of which there is rarely one
  study.js       where the hours went, and which class needs the next one
  theme.js       tokens → CSS custom properties in index.css
```

Two deliberate departures from Tend worth knowing about:

- **One data provider, not a hook per table.** Nothing here is independent — a
  grade needs categories, assignments, credit hours and scale overrides at once
  — and cumulative GPA is a question about every term you've ever taken, so
  "load only the active term" would buy nothing.
- **Rows travel in database shape** (`points_possible`, not `pointsPossible`).
  The engine reads them directly; a translation layer would only be somewhere
  for the two to drift apart.

## Not built yet

- Push notifications (in-app due-soon badges cover the MVP)
- Offline editing. The service worker gets the shell open without a signal;
  queuing writes and reconciling them against realtime is a much bigger promise
  than this app needs to make.
- Recurring breaks, and importing an academic calendar. Four dates typed once a
  semester is not the problem worth solving next.
- Study history past the current week. Every block is stored, so the rows are
  there — what's missing is the screen, and "how did October go" is a question
  worth answering only once there's an October to answer it about.

Drop-lowest was specified as Phase 3 but is implemented — it's part of what
makes the grade correct, so it belongs in the engine rather than bolted on. The
calendar overlay of dated work onto the schedule grid was also on this list and
now exists, for exams — the kinds you actually have to be somewhere for.
