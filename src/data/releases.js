// The release log. Hand-written on purpose: a generated changelog lists
// commits, and what you actually want to read six months later is what changed
// about *using* the thing.
//
// Adding a release: bump `version` in package.json to match the top entry here,
// and write the notes in the same voice — what you can now do, not what was
// refactored to allow it.

export const RELEASES = [
  {
    version: '0.2.0',
    date: '2026-08-20',
    name: 'Out the door',
    notes: [
      [
        'added',
        'Today shows the whole day now, not just the next class. On a Monday that runs nine to three across four buildings, seeing only "next up" meant leaving the page to find out what came after it — which is the one thing you can\'t be bothered to do while walking.',
      ],
      [
        'added',
        'Rooms got loud. BRUN 107 and AIEB 244 are the strings you genuinely don\'t know in week one, and they were set in small grey text at the end of a time range. They\'re now chips in their own right, set in the mono face so the fixed widths make one room code easy to tell from another at a glance.',
      ],
      [
        'added',
        'Run out of classes for the day and it shows you the next day that has any, rather than "nothing scheduled". A Sunday evening check now answers the question you were actually asking, which is what Monday morning looks like.',
      ],
      [
        'changed',
        'Start and end times moved into a fixed rail down the left, so a day reads as one aligned column instead of times buried mid-sentence. Whatever is happening now is tinted and counting down; whatever has finished is dimmed.',
      ],
      [
        'fixed',
        'Focusing any input on an iPhone zoomed the whole page in and left it there. Every field in the app was sized for a dense desktop table, and iOS zooms anything under 16px — so tapping a score box panned you into a corner of a form with no way back out except pinching.',
      ],
      ['fixed', '"12:00 PM" wrapped onto two lines in the schedule and knocked the row out of alignment. Only noon did it, which is why it survived the first pass.'],
      ['changed', 'Empty states shrank on phones. "Nothing due" was taking 350 pixels of an 812-pixel screen and pushing your actual schedule below the fold.'],
      [
        'added',
        'Cadence is on the web, and installs to a home screen from there. Add to Home Screen and it opens without browser chrome, which is the difference between a site you visit and something you check between classes.',
      ],
      ['added', 'This release log, and the version chip that opens it.'],
    ],
  },
  {
    version: '0.1.0',
    date: '2026-08-16',
    name: 'Syllabus week',
    notes: [
      [
        'added',
        'Courses, in one form. Name, when it meets, where, how many credits, and the weights off the syllabus — all at once, with everything already filled in with something sensible. A course you set up halfway is a course that can\'t produce a grade, and the surest way to end up with one is to ask for it across three screens.',
      ],
      ['added', 'The week, drawn to scale on a laptop and one day at a time on a phone. Meeting times entered once fill it in; there is nothing else to keep in step.'],
      ['added', 'Assignments with due dates, sorted into overdue, today, this week and later — so the list has already done the arithmetic you would otherwise do every time you looked at it.'],
      [
        'added',
        'A grade that means what your syllabus means. Categories are weighted, points are totalled within them rather than averaged, drop-lowest rules apply, and only categories you actually have marks in are counted — so 92% on homework in week two reads as 92%, not as 18% of a semester you haven\'t taken.',
      ],
      [
        'added',
        'What-if. Type a score you haven\'t got yet into any ungraded assignment and watch the whole thing move. Hypotheticals are dashed and greyed so a grade you imagined never looks like one you earned, and one button clears them all.',
      ],
      [
        'added',
        'What do I need. Pick the grade you want and it solves for the average you need across everything left, taking drop-lowest into account. It also tells you where you land if you bomb the rest and where you land if you ace it — between those two is every grade still available to you, which is usually the thing worth knowing.',
      ],
      ['added', 'Term and cumulative GPA on a straight 4.0 scale, worked out from where each course stands right now. Courses you have no marks in yet are left out rather than counted as zero.'],
      ['added', 'Everything syncs live between your phone and your laptop, and the grade maths has 27 tests behind it with the arithmetic written out by hand in each one.'],
    ],
  },
];

export const CURRENT = RELEASES[0];

// Build stamps injected by vite.config.js. Guarded so the module still imports
// under plain node (the grade tests) where the defines don't exist.
export const BUILD = {
  version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : CURRENT.version,
  commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev',
  builtAt: typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : null,
};
