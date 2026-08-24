import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestCategory, suggestPoints, seriesTitles } from '../src/assignments.js';

// Filing work in the right bucket is the one piece of guessing this app does on
// someone's behalf, and a wrong guess is a grade that is quietly wrong. So every
// case below is a rule someone could state out loud about their own syllabus.

const cat = (id, name) => ({ id, name });
const work = (kind, categoryId, extra = {}) => ({
  kind,
  category_id: categoryId,
  points_possible: 100,
  created_at: '2026-08-01',
  ...extra,
});

test('a quiz goes in the quiz category without being asked twice', () => {
  const s = suggestCategory({
    kind: 'quiz',
    categories: [cat('h', 'Homework'), cat('q', 'Quizzes'), cat('f', 'Final')],
  });
  assert.equal(s.categoryId, 'q');
  assert.equal(s.reason, 'name');
});

test('category names are matched loosely enough for a real syllabus', () => {
  const forName = (name, kind) =>
    suggestCategory({ kind, categories: [cat('x', name), cat('other', 'Attendance')] }).categoryId;

  assert.equal(forName('HW', 'assignment'), 'x');
  assert.equal(forName('Problem Sets', 'assignment'), 'x');
  assert.equal(forName('Homework & Labs', 'assignment'), 'x');
  assert.equal(forName('Midterm Exams', 'test'), 'x');
  assert.equal(forName('Final Exam', 'final'), 'x');
  assert.equal(forName('Term Paper', 'paper'), 'x');
});

test('a final prefers the final category over the general exam one', () => {
  const s = suggestCategory({
    kind: 'final',
    categories: [cat('e', 'Exams'), cat('f', 'Final')],
  });
  assert.equal(s.categoryId, 'f');
});

test('a quiz falls back to the exam bucket when that is all there is', () => {
  // Plenty of syllabi run one bucket for everything you sit in a room for.
  const s = suggestCategory({
    kind: 'quiz',
    categories: [cat('h', 'Homework'), cat('e', 'Exams')],
  });
  assert.equal(s.categoryId, 'e');
});

test('what you did last time beats what the category is called', () => {
  // Two quizzes already filed under Exams. The third goes there too, even though
  // a Quizzes category exists — a decision about this course outranks a rule
  // about names.
  const s = suggestCategory({
    kind: 'quiz',
    categories: [cat('q', 'Quizzes'), cat('e', 'Exams')],
    assignments: [work('quiz', 'e'), work('quiz', 'e', { created_at: '2026-08-09' })],
  });
  assert.equal(s.categoryId, 'e');
  assert.equal(s.reason, 'history');
});

test('history means the most recent choice, not the first one', () => {
  const s = suggestCategory({
    kind: 'quiz',
    categories: [cat('q', 'Quizzes'), cat('e', 'Exams')],
    assignments: [
      work('quiz', 'e', { created_at: '2026-08-01' }),
      work('quiz', 'q', { created_at: '2026-09-14' }),
    ],
  });
  assert.equal(s.categoryId, 'q');
});

test('a course with one bucket puts everything in it', () => {
  const s = suggestCategory({ kind: 'paper', categories: [cat('all', 'Everything')] });
  assert.equal(s.categoryId, 'all');
  assert.equal(s.reason, 'only');
});

test('a course that does not grade homework says so, rather than guessing', () => {
  // Heat Transfer: Exams 60, Final 40. The problem sets are for your own
  // benefit. There is no bucket for them because the syllabus has none.
  const s = suggestCategory({
    kind: 'assignment',
    categories: [cat('e', 'Exams'), cat('f', 'Final')],
  });
  assert.equal(s.categoryId, null);
  assert.equal(s.reason, 'ungraded');
});

test('no grading scheme at all is a different answer from "not graded"', () => {
  // Nothing has been set up yet, which is a gap in the data — not a claim that
  // the course grades nothing.
  const s = suggestCategory({ kind: 'assignment', categories: [] });
  assert.equal(s.categoryId, null);
  assert.equal(s.reason, 'no-scheme');
});

test('a kind you have always filed as ungraded stays ungraded', () => {
  const s = suggestCategory({
    kind: 'assignment',
    categories: [cat('e', 'Exams'), cat('h', 'Homework')],
    assignments: [
      work('assignment', null, { counts_toward_grade: false }),
      work('assignment', null, { counts_toward_grade: false }),
    ],
  });
  assert.equal(s.categoryId, null);
  assert.equal(s.reason, 'history-ungraded');
});

test('a category deleted out from under the history is not suggested', () => {
  const s = suggestCategory({
    kind: 'quiz',
    categories: [cat('q', 'Quizzes')],
    assignments: [work('quiz', 'gone-category')],
  });
  assert.equal(s.categoryId, 'q');
  assert.equal(s.reason, 'name');
});

// ------------------------------------------------------------------ points

test('a new quiz is worth what the last quizzes were worth', () => {
  const p = suggestPoints({
    kind: 'quiz',
    categoryId: 'q',
    assignments: [
      work('quiz', 'q', { points_possible: 20 }),
      work('quiz', 'q', { points_possible: 20 }),
    ],
  });
  assert.equal(p, 20);
});

test('one odd makeup exam does not redefine what an exam is worth', () => {
  const p = suggestPoints({
    kind: 'test',
    categoryId: 'e',
    assignments: [
      work('test', 'e', { points_possible: 100 }),
      work('test', 'e', { points_possible: 100 }),
      work('test', 'e', { points_possible: 200 }),
    ],
  });
  assert.equal(p, 100);
});

test('points are not inherited across a boundary that means something', () => {
  // A quiz should not pick up an exam's 150 just because they share a course.
  const p = suggestPoints({
    kind: 'quiz',
    categoryId: 'q',
    assignments: [work('test', 'e', { points_possible: 150 })],
  });
  assert.equal(p, 100);
});

test('a zero-point row is not evidence of anything', () => {
  const p = suggestPoints({
    kind: 'quiz',
    categoryId: 'q',
    assignments: [work('quiz', 'q', { points_possible: 0 })],
    fallback: 100,
  });
  assert.equal(p, 100);
});

// ------------------------------------------------------------- numbering

test('a run of work is numbered from one', () => {
  assert.deepEqual(seriesTitles('Homework', 3), ['Homework 1', 'Homework 2', 'Homework 3']);
});

test('a title that already ends in a number counts on from there', () => {
  // You typed "Problem Set 3" because the next one is 3, not because you wanted
  // "Problem Set 3 1".
  assert.deepEqual(seriesTitles('Problem Set 3', 3), ['Problem Set 3', 'Problem Set 4', 'Problem Set 5']);
});

test('an empty title still produces usable rows', () => {
  assert.deepEqual(seriesTitles('  ', 2), ['Untitled 1', 'Untitled 2']);
});
