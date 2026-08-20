-- Cadence — initial schema.
--
-- Single user, one row-owner column, one policy shape: `user_id = auth.uid()`.
-- Tend needed household membership joins to answer "may I see this row"; here
-- the answer is always "is it mine", so every policy is the same three words
-- and there is nothing to get subtly wrong.
--
-- user_id defaults to auth.uid() so inserts never have to send it, and the
-- WITH CHECK clause means a client that sends someone else's id is rejected
-- rather than quietly writing a row it can't read back.

create table terms (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  name        text not null,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now()
);

create table courses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users on delete cascade default auth.uid(),
  term_id       uuid not null references terms on delete cascade,
  name          text not null,
  code          text,
  instructor    text,
  -- Numeric, not integer: labs and one-off seminars are worth 0.5 or 1.5.
  credit_hours  numeric(4, 2) not null default 3,
  color         text not null default 'teal',
  location      text,
  created_at    timestamptz not null default now()
);

-- One row per weekly meeting slot. A class that meets MWF is three rows, which
-- keeps "what's on Wednesday" a plain filter instead of a bitmask decode.
create table meetings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade default auth.uid(),
  course_id    uuid not null references courses on delete cascade,
  -- 0 = Monday … 6 = Sunday. Monday-first because the schedule grid is, and a
  -- single convention end to end beats converting at every boundary.
  day_of_week  smallint not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  check (end_time > start_time)
);

create table grading_categories (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade default auth.uid(),
  course_id      uuid not null references courses on delete cascade,
  name           text not null,
  weight_pct     numeric(6, 3) not null check (weight_pct >= 0),
  -- "Drop your lowest two quizzes." 0 = keep everything.
  drop_lowest_n  smallint not null default 0 check (drop_lowest_n >= 0),
  position       smallint not null default 0,
  created_at     timestamptz not null default now()
);

-- Grades live on the assignment rather than in a separate scores table: an
-- assignment has exactly one score, so a second table would only ever hold a
-- 1:1 row and make every grade query a join.
--
-- Ungraded means no score yet (points_earned and score_pct both null) — those
-- rows are exactly the pool the forecaster projects over.
create table assignments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users on delete cascade default auth.uid(),
  course_id        uuid not null references courses on delete cascade,
  category_id      uuid references grading_categories on delete set null,
  title            text not null,
  due_at           timestamptz,
  points_possible  numeric(8, 2) not null default 100 check (points_possible >= 0),
  points_earned    numeric(8, 2),
  -- Escape hatch for a professor who hands back "87%" with no point total.
  -- When set it wins over points_earned; see src/grading/engine.js.
  score_pct        numeric(6, 3),
  status           text not null default 'todo'
                     check (status in ('todo', 'doing', 'submitted', 'graded')),
  notes            text,
  created_at       timestamptz not null default now()
);

-- Only written when a course departs from the straight 90/80/70/60 default —
-- a +/- professor, or a curve. Absent rows mean "use the default scale".
create table grade_scale_overrides (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade default auth.uid(),
  course_id  uuid not null references courses on delete cascade,
  letter     text not null,
  min_pct    numeric(6, 3) not null,
  unique (course_id, letter)
);

-- Indexes follow the app's actual reads: everything is fetched per term or per
-- course, and assignments are additionally sorted and filtered by due date.
create index terms_user_idx on terms (user_id, start_date desc);
create index courses_term_idx on courses (term_id);
create index meetings_course_idx on meetings (course_id);
create index grading_categories_course_idx on grading_categories (course_id, position);
create index assignments_course_idx on assignments (course_id);
create index assignments_due_idx on assignments (user_id, due_at);

alter table terms enable row level security;
alter table courses enable row level security;
alter table meetings enable row level security;
alter table grading_categories enable row level security;
alter table assignments enable row level security;
alter table grade_scale_overrides enable row level security;

-- `to authenticated` keeps the anon role out entirely: without it the policy is
-- still evaluated for anonymous requests, where auth.uid() is null and every
-- comparison is null — safe, but it burns a planner pass on every table for
-- traffic that should never have been let in the door.
create policy "own rows" on terms
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on courses
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on meetings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on grading_categories
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on assignments
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows" on grade_scale_overrides
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime is what makes "log a score on your phone between classes, see it on
-- the laptop that night" work without a refresh. Changes are still filtered by
-- the policies above, so the socket only ever carries your own rows.
alter publication supabase_realtime add table terms;
alter publication supabase_realtime add table courses;
alter publication supabase_realtime add table meetings;
alter publication supabase_realtime add table grading_categories;
alter publication supabase_realtime add table assignments;
alter publication supabase_realtime add table grade_scale_overrides;
