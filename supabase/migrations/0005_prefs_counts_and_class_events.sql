-- Cadence 1.4 — turning parts of the app off, exams that happen in class, and
-- the two things a syllabus says about a category that the schema couldn't hold.
--
-- Four changes, all additive. Same policy shape as everything before it
-- (`user_id = auth.uid()`), because the answer to "may I see this row" is still
-- only ever "is it mine".

-- ------------------------------------------------- 1. what you want switched on
--
-- Five people are now using this, and they are not running the same semester.
-- One of them wants a study timer, one wants the timetable, and one genuinely
-- only wants to know what his grade is — and every part of the app that isn't
-- the part you came for is a row on a screen you have to read past.
--
-- So the parts are switchable, and the switches live here rather than in
-- localStorage for the same reason the term choice doesn't: turning the study
-- timer off on the laptop and finding it still on the phone is worse than not
-- offering the switch at all.
--
--   features   { "study": false, "degree": false } — a key is present only when
--              it disagrees with the default. Defaults live in src/features.js,
--              where a new feature is one line rather than a migration, and a
--              feature that stops existing leaves a key nobody reads instead of
--              a column nobody drops.
--
--   channel    'beta' sees work that is finished but not yet turned on for
--              everyone; 'stable' sees the app as it was last given the green
--              light. One bundle either way — the channel decides what that
--              bundle shows you, so pushing an update is exactly what it was
--              before. See src/features.js for the list and how a feature
--              graduates.
--
-- One row per user, and the primary key is the whole enforcement.
create table user_prefs (
  user_id     uuid primary key references auth.users on delete cascade default auth.uid(),
  channel     text not null default 'stable' check (channel in ('stable', 'beta')),
  features    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------ 2. exams that happen in class
--
-- A dynamics exam is not a thing you go somewhere new for. It is the dynamics
-- class, on a Tuesday, doing something different — same room, same hour, same
-- fifty minutes — and being asked to type that hour in is being asked for a
-- fact the app has had since you entered the course.
--
-- True means "whenever this class meets that day". The time still lands in
-- `due_at` (so every reader that sorts by it, or asks how many days away it is,
-- keeps working untouched) and is re-stamped from the meeting whenever the
-- meeting moves — see setMeetings in src/data/SemesterProvider.jsx. The flag is
-- what makes that re-stamp possible: without it, an 8am class moving to 9am
-- leaves the midterm sitting at 8 with nothing to say it should have followed.
--
-- False is still a real answer, and not a rare one: a common final sat in a
-- different building at 8am on a Saturday has nothing to do with when the class
-- meets.
alter table assignments
  add column at_class_time boolean not null default false;

-- ------------------------------------------- 3. how many of these there will be
--
-- "Quizzes 20%, seven of them, lowest two dropped" is a sentence a syllabus
-- actually prints, and until now the app could hold the 20% and the two but not
-- the seven — which is the one that makes the other two mean anything.
--
-- Without it, two things are wrong in the same direction, both flattering:
--
--   Drops. Two quizzes graded and "drop the lowest two" means the app keeps
--   your best one and calls that the category. The rule that fixes it needs the
--   total: a drop is only *yours* once no quiz still to come can absorb it, so
--   with seven expected and three graded the app applies none of them, and with
--   six graded it applies one. See applyDrops in src/grading/engine.js.
--
--   Forecasts. "What do I need on the work that's left" answers over the rows
--   you have entered, and four quizzes nobody has written down are four rows
--   the solver thinks don't exist — so it reports a term that is nearly settled
--   when a fifth of it hasn't happened.
--
-- Null means the syllabus didn't say, which is the honest answer for a
-- homework category that is "10%, however many I set". The app then says the
-- forecast assumes what's entered is all of it, rather than quietly implying it
-- knows better.
alter table grading_categories
  add column expected_count smallint check (expected_count > 0);

-- ------------------------------------------------ 4. marks for turning up
--
-- A 30% attendance weight, earned by in-class activities that nobody marks for
-- correctness. You were there, you handed the thing in, you get the points —
-- and entering "20 out of 20" thirty times is both tedious and a lie about what
-- was measured, because nothing was.
--
--   score       the ordinary case. A number out of a number.
--   completion  there or not. The app scores it full marks or zero and offers a
--               switch instead of a number field, which is what the professor
--               is actually recording.
--
-- Deliberately on the category and not the assignment: this is a fact about how
-- the professor grades that bucket, stated once on the syllabus, and putting it
-- on each row would be asking the same question thirty times.
alter table grading_categories
  add column credit_basis text not null default 'score'
    check (credit_basis in ('score', 'completion'));

-- ---------------------------------------------------------------- plumbing

alter table user_prefs enable row level security;

create policy "own rows" on user_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table user_prefs;
