-- Cadence 0.3 — exams, the terms that came before this one, and days off.
--
-- Four changes, all additive. Same policy shape as 0001 (`user_id = auth.uid()`)
-- because the answer to "may I see this row" is still only ever "is it mine".

-- ---------------------------------------------------------------- 1. exams
--
-- An exam is not an assignment with a due date. A problem set is due *by* a
-- moment — hand it in at 11:58pm and you're fine. A test happens *at* one: you
-- sit in a room at 2pm for fifty minutes, and there is nothing to be late for.
--
-- Everything else about the two is identical — both are worth points, both live
-- in a weighted category, both feed the same grade — so this is a column on
-- `assignments` rather than a second table that would need every query, every
-- category join and the whole grading engine duplicated alongside it.
--
--   assignment / project / paper  — due by a deadline
--   quiz / test / final           — happen at a time, and get drawn on your schedule
alter table assignments
  add column kind text not null default 'assignment'
    check (kind in ('assignment', 'quiz', 'test', 'final', 'project', 'paper'));

-- How long you're sitting there, for the kinds that put a block on the grid.
-- Null means "use the sensible default" rather than zero, so an exam entered in
-- a hurry still draws at a believable size instead of a hairline.
alter table assignments
  add column duration_min smallint check (duration_min > 0);

-- ------------------------------------------------------- 2. prior semesters
--
-- Cumulative GPA is a lie until the semesters before this app are in it. Typing
-- every past assignment back in is not a thing anyone will do, and it isn't
-- needed: a finished semester is fully described by its credit hours and the
-- GPA it earned. One row per past term, or one lump row for everything before
-- you started tracking — both work, and the math doesn't care which you chose.
create table prior_terms (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  name          text not null,
  credit_hours  numeric(6, 2) not null check (credit_hours >= 0),
  -- Stored to three places because a transcript GPA is given to two and
  -- rounding it again on the way in would shift the cumulative number.
  gpa           numeric(4, 3) not null check (gpa >= 0 and gpa <= 5),
  position      smallint not null default 0,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------------------------- 3. the degree
--
-- One row per user — the unique constraint is the whole enforcement. Deliberately
-- not a course-by-course requirement tree: that's DegreeWorks' job, it needs a
-- catalog to be right, and being subtly wrong about whether a course counts is
-- worse than not claiming to know. A credit total and a GPA goal are the two
-- numbers you can state from memory, and they're enough to draw a bar that
-- moves every semester.
create table degree_plan (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade default auth.uid(),
  name              text,
  credits_required  numeric(6, 2) not null default 120 check (credits_required > 0),
  gpa_goal          numeric(4, 3) check (gpa_goal >= 0 and gpa_goal <= 5),
  created_at        timestamptz not null default now(),
  unique (user_id)
);

-- ------------------------------------------------------------ 4. days off
--
-- Meeting rows are weekly and have no opinion about the calendar, so without
-- this the app cheerfully tells you to be in Bruner 218 on Thanksgiving. A break
-- is a date range that cancels the recurring meetings inside it — and only
-- those. Anything with a real date on it (an exam, something due) still stands:
-- professors schedule work over a long weekend all the time, and quietly hiding
-- it would be the more expensive mistake.
--
-- A single day off is a row where the two dates are equal.
create table term_breaks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  term_id     uuid not null references terms on delete cascade,
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

-- ---------------------------------------------------------------- plumbing

create index prior_terms_user_idx on prior_terms (user_id, position);
create index term_breaks_term_idx on term_breaks (term_id, start_date);

alter table prior_terms enable row level security;
alter table degree_plan enable row level security;
alter table term_breaks enable row level security;

create policy "own rows" on prior_terms
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on degree_plan
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on term_breaks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table prior_terms;
alter publication supabase_realtime add table degree_plan;
alter publication supabase_realtime add table term_breaks;
