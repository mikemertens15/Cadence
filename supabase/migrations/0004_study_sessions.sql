-- Cadence 1.1 — where the hours went, and which class should get the next one.
--
-- Two changes, both additive: a table of study blocks, and a weekly target on
-- the course. Same policy shape as everything before it (`user_id = auth.uid()`),
-- because the answer to "may I see this row" is still only ever "is it mine".

-- ------------------------------------------------------------ study blocks
--
-- One row per block of studying, and the important part is that a *running*
-- timer is one of these rows rather than a number counting down in a browser
-- tab.
--
-- A countdown held in memory is one lock screen away from losing an hour: the
-- tab gets frozen, the phone goes in a pocket, the laptop sleeps mid-block, and
-- whatever it was holding is gone. Timestamps don't care. `started_at` with
-- `ended_at` still null *is* the running session, elapsed time is arithmetic on
-- two instants rather than a value someone has to keep alive, and the block you
-- started on the laptop is visibly still running when you pull out your phone.
-- It also means the app can crash mid-block and lose nothing.
--
-- Pausing is stored the same way, as facts rather than as a mode:
--
--   paused_at   non-null while the block is paused. The clock reads to here
--               instead of to now, so a paused timer is frozen rather than
--               secretly still running.
--   paused_ms   pauses that have already finished, added up. Subtracted from
--               the wall clock to get the time actually spent.
--
-- Which is what makes the number honest. A timer left running through dinner
-- inflates the one thing this table exists to measure, and "six hours of deep
-- study" that was really three is worse than no number at all — it's the same
-- mistake as scoring a withdrawal as the 41% you were carrying when you dropped.
create table study_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade default auth.uid(),
  course_id        uuid not null references courses on delete cascade,
  -- What you sat down to do, when you know. Optional, and deliberately
  -- `on delete set null`: deleting an assignment shouldn't delete the evidence
  -- that you spent two hours on it.
  assignment_id    uuid references assignments on delete set null,
  started_at       timestamptz not null default now(),
  -- Null means this is the block running right now. There is at most one.
  ended_at         timestamptz,
  paused_at        timestamptz,
  paused_ms        integer not null default 0 check (paused_ms >= 0),
  -- What you set out to do, kept alongside what happened. A 50 that ran 74 is a
  -- different fact from a 74 you meant to do, and only one of them says your
  -- estimates need adjusting.
  planned_minutes  smallint check (planned_minutes > 0),
  note             text,
  created_at       timestamptz not null default now(),

  check (ended_at is null or ended_at >= started_at),
  -- A finished block is not also paused: stopping folds the open pause into
  -- paused_ms, so every stored row reads the same way.
  check (ended_at is null or paused_at is null)
);

create index study_sessions_user_idx on study_sessions (user_id, started_at desc);
create index study_sessions_course_idx on study_sessions (course_id, started_at desc);

-- One block at a time, enforced where it can't be raced.
--
-- Two devices are the ordinary case for this app — start on the laptop, walk to
-- the library, pull out the phone — and "is anything running" answered by
-- reading local state on each of them independently is exactly how you end up
-- with two open rows and an afternoon counted twice. A partial unique index
-- makes the second insert fail instead, and the client's job becomes closing
-- the first one rather than hoping.
create unique index study_sessions_one_running
  on study_sessions (user_id)
  where ended_at is null;

alter table study_sessions enable row level security;

create policy "own rows" on study_sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table study_sessions;

-- --------------------------------------------------------- a weekly target
--
-- Nullable on purpose, and null is the answer for almost everybody.
--
-- The number that makes the week's bars mean anything is "how long should this
-- class take", and asking five times during setup is five chances to abandon
-- the form. Credit hours already imply it — the advice every syllabus repeats is
-- two to three hours outside class per credit hour — so null means "work it out
-- from the credits" (see MINUTES_PER_CREDIT in src/study.js) and a number here
-- means you disagreed, which is a thing you can only do sensibly after a week of
-- watching the real ones.
--
-- Deliberately a column rather than a table: it is one fact about a course, in
-- the same way `credit_hours` and `grading_basis` are.
alter table courses
  add column weekly_study_minutes smallint check (weekly_study_minutes >= 0);
