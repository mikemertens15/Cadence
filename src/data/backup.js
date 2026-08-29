import { BUILD } from './releases';

// Getting your data back out.
//
// A year of scores lives in a Postgres database behind someone else's login,
// and until now there was no way to hold a copy of it. That is a fine trade for
// a weekend project and a bad one for the app you're going to run a degree on,
// so 1.0 can hand back everything it knows in two shapes:
//
//   JSON  every row of every table, exactly as stored. Restorable, diffable,
//         and readable by something that isn't this app in five years.
//   CSV   the gradebook, flattened — one row per piece of work, with the course
//         and category names spelled out rather than left as uuids. This is the
//         one you open in a spreadsheet when a professor's number and Cadence's
//         number disagree and you want to see every score at once.
//
// Neither is a substitute for the other, which is why both exist: JSON keeps
// nothing back and is unreadable; CSV is readable and throws away structure.

const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * Everything, as stored.
 *
 * Rows go out in database shape for the same reason they travel that way
 * through the app: a translation on the way out would be one more thing to
 * disagree with the schema, and this file's whole job is to be exactly what is
 * in there.
 */
export function toBackupJson(rows) {
  return JSON.stringify(
    {
      app: 'cadence',
      version: BUILD.version,
      exported_at: new Date().toISOString(),
      // Named so a future importer can tell a 0.3 backup (no programs, no
      // grading basis) from a 1.0 one without guessing from the shape. 4 adds
      // study_sessions and the weekly target on a course; 5 adds user_prefs,
      // how many items a category expects and how it is scored, and whether an
      // exam happens at its class's time.
      schema: 5,
      tables: rows,
    },
    null,
    2,
  );
}

// RFC 4180: quote anything containing a comma, quote or newline, and double any
// quotes inside. Excel will happily corrupt a course name like `Statics, Dyn`
// without this.
function cell(value) {
  if (value == null) return '';
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

const csv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n');

const COLUMNS = [
  'Term',
  'Course',
  'Code',
  'Credit hours',
  'Category',
  'Weight %',
  'Kind',
  'Title',
  'Due',
  'Points possible',
  'Points earned',
  'Score %',
  'Counts toward grade',
  'Status',
];

/**
 * The gradebook as a spreadsheet.
 *
 * Every assignment, including the ones that don't count — with a column saying
 * so. Leaving them out would make the export disagree with the app, and the
 * moment you're exporting is the moment you're reconciling two numbers that
 * already disagree.
 */
export function toGradesCsv({ terms = [], courses = [], categories = [], assignments = [] }) {
  const termById = new Map(terms.map((t) => [t.id, t]));
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const catById = new Map(categories.map((c) => [c.id, c]));

  const rows = [...assignments].sort((a, b) => {
    const ca = courseById.get(a.course_id)?.name ?? '';
    const cb = courseById.get(b.course_id)?.name ?? '';
    return ca.localeCompare(cb) || String(a.due_at ?? '9').localeCompare(String(b.due_at ?? '9'));
  });

  const body = rows.map((a) => {
    const course = courseById.get(a.course_id);
    const category = a.category_id ? catById.get(a.category_id) : null;
    const possible = Number(a.points_possible);
    const earned = a.points_earned == null ? null : Number(a.points_earned);

    // The percentage is computed here rather than left to a spreadsheet formula
    // so the file reads the same everywhere, and it follows the engine's rule:
    // an explicit score_pct wins over points.
    const pct =
      a.score_pct != null
        ? Number(a.score_pct)
        : earned != null && possible > 0
          ? (earned / possible) * 100
          : null;

    return [
      termById.get(course?.term_id)?.name ?? '',
      course?.name ?? '',
      course?.code ?? '',
      course?.credit_hours ?? '',
      category?.name ?? '',
      category?.weight_pct ?? '',
      a.kind ?? 'assignment',
      a.title,
      a.due_at ?? '',
      possible,
      earned ?? '',
      pct == null ? '' : Math.round(pct * 100) / 100,
      a.counts_toward_grade === false ? 'no' : 'yes',
      a.status ?? '',
    ];
  });

  return csv([COLUMNS, ...body]);
}

/**
 * Hand a file to the browser.
 *
 * The object URL is revoked on the next tick rather than immediately: Safari
 * hasn't finished reading the blob when click() returns, and revoking it there
 * produces a download that silently fails on exactly one browser.
 */
export function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const backupFilename = () => `cadence-backup-${stamp()}.json`;
export const gradesFilename = () => `cadence-grades-${stamp()}.csv`;
