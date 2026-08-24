-- Cadence 1.0 — work that isn't graded, courses that aren't scored the usual
-- way, and a degree that was never really one degree.
--
-- Five changes, all additive except one dropped constraint. Same policy shape
-- as everything before it (`user_id = auth.uid()`), because the answer to "may
-- I see this row" is still only ever "is it mine".

-- --------------------------------------------------- 1. work that isn't graded
--
-- Some homework is just homework. A professor hands out problem sets "for your
-- own benefit", collects nothing and grades nothing — and you still want the
-- due date, because you still have to do it before Thursday's lecture makes no
-- sense.
--
-- Until now the only way to say that was to leave the category blank, which is
-- the same state as "I haven't got round to filing this yet" — so the app
-- warned about it on the grades page, in amber, forever. Those are different
-- facts and only one of them is a problem. This column is the difference:
--
--   counts_toward_grade = true,  category null  → you still have to file it
--   counts_toward_grade = false                 → nothing to file; it is not graded
--
-- Defaults true so every row that already exists keeps behaving exactly as it
-- did. Nothing here changes a grade that has already been computed.
alter table assignments
  add column counts_toward_grade boolean not null default true;

-- ------------------------------------------------------ 2. bulk-entered work
--
-- "Homework 1 through 14, due every Friday" is one decision and fourteen rows.
-- Stamping the batch with a shared id costs one column and buys the only thing
-- you need afterwards: deleting the fourteen you just created when the syllabus
-- turns out to say Wednesday.
--
-- Deliberately not a foreign key to a `series` table. There is nothing to store
-- about a series beyond "these were typed at the same moment" — every row is a
-- real, independently editable assignment from the moment it exists, and a
-- parent row would only invite a UI that pretends otherwise.
alter table assignments
  add column series_id uuid;

create index assignments_series_idx on assignments (series_id) where series_id is not null;

-- ------------------------------------------------ 3. how a course is scored
--
-- Three of these exist and only one of them is what the app has assumed.
--
--   graded     the normal case: a letter, and it moves your GPA
--   pass_fail  credits if you pass, and no grade points either way — so it
--              advances the degree and is invisible to the GPA
--   audit      you sit in the room. No credit, no grade, no GPA.
--
-- Status is the other axis, and it is not the same question. A withdrawal is
-- not a bad grade — a W earns no credit and no grade points, and counting the
-- 41% you had when you dropped would be the single most misleading number this
-- app could show. An incomplete has no grade *yet*: it is left out the same way
-- a course with no graded work is, rather than being scored on a partial term.
alter table courses
  add column grading_basis text not null default 'graded'
    check (grading_basis in ('graded', 'pass_fail', 'audit'));

alter table courses
  add column status text not null default 'enrolled'
    check (status in ('enrolled', 'withdrawn', 'incomplete'));

-- ------------------------------------------------------------- 4. programs
--
-- `degree_plan` was one row per user, and that is the assumption this release
-- exists to remove. A second bachelor's, a master's on top of it, a minor, and
-- the classes you took because they looked interesting are four different
-- denominators — and "169 credits out of 120" is not a sentence about any of
-- them.
--
-- The unique constraint is the whole change. Everything else is the small
-- amount of shape a list needs that a single row didn't: what kind of thing it
-- is, whether you're still working on it, and what order to draw them in.
alter table degree_plan drop constraint degree_plan_user_id_key;

alter table degree_plan
  add column kind text not null default 'degree'
    check (kind in ('degree', 'minor', 'certificate', 'concentration'));

-- Undergraduate and graduate credits are not interchangeable and, at most
-- institutions, are not even averaged together — a graduate GPA is its own
-- number on its own transcript line. Keeping the level on the program is what
-- lets the app show them apart instead of blending a 3.9 master's into a
-- bachelor's and reporting neither.
alter table degree_plan
  add column level text not null default 'undergraduate'
    check (level in ('undergraduate', 'graduate'));

alter table degree_plan
  add column status text not null default 'active'
    check (status in ('active', 'completed', 'planned'));

alter table degree_plan add column position smallint not null default 0;

create index degree_plan_user_idx on degree_plan (user_id, position);

-- ------------------------------------------- 5. which credits count where
--
-- The reason this is a join table and not a `plan_id` column on courses: gen
-- eds. Calculus I counts toward the mechanical engineering degree *and* toward
-- the second one, English Composition counts toward both, and a single column
-- would force you to pick one and quietly under-count the other.
--
-- So a course is applied to zero, one, or several programs:
--
--   zero      taken for interest. Real credits, real grade, real GPA — just not
--             pointed at anything with a finish line.
--   one       the ordinary case.
--   several   a shared course. It advances both bars, and the app says so
--             rather than letting the program totals silently exceed the number
--             of credits you have actually taken.
--
-- Prior terms hang off the same table because they have the same problem: the
-- lump row that holds Calculus I from 2018 counts toward both degrees too. A
-- row's GPA weight is counted exactly once no matter how many programs it is
-- applied to — sharing is a fact about the degree audit, not about arithmetic.
--
-- One table with two nullable parents rather than two near-identical tables:
-- every query, policy and cleanup path here is the same for both, and the check
-- constraint makes "exactly one parent" a thing the database enforces instead
-- of a thing the client remembers.
create table credit_applications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users on delete cascade default auth.uid(),
  plan_id        uuid not null references degree_plan on delete cascade,
  course_id      uuid references courses on delete cascade,
  prior_term_id  uuid references prior_terms on delete cascade,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(course_id, prior_term_id) = 1)
);

-- Partial uniques rather than one `unique (plan_id, course_id, prior_term_id)`:
-- in a plain unique index nulls don't collide, so that version would happily
-- accept the same course applied to the same program a dozen times.
create unique index credit_applications_course_idx
  on credit_applications (plan_id, course_id) where course_id is not null;
create unique index credit_applications_prior_idx
  on credit_applications (plan_id, prior_term_id) where prior_term_id is not null;

create index credit_applications_plan_idx on credit_applications (plan_id);

-- Backfill: whatever single plan already exists gets every course and every
-- prior term, which is precisely what the app was doing when there could only
-- be one. Without this the upgrade would silently reset a degree bar to zero on
-- the first load, and the correct-looking number would be the wrong one.
insert into credit_applications (user_id, plan_id, course_id)
select c.user_id, p.id, c.id
from courses c
join degree_plan p on p.user_id = c.user_id;

insert into credit_applications (user_id, plan_id, prior_term_id)
select t.user_id, p.id, t.id
from prior_terms t
join degree_plan p on p.user_id = t.user_id;

-- ---------------------------------------------------------------- plumbing

alter table credit_applications enable row level security;

create policy "own rows" on credit_applications
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table credit_applications;
