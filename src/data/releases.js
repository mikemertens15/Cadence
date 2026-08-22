// The release log. Hand-written on purpose: a generated changelog lists
// commits, and what you actually want to read six months later is what changed
// about *using* the thing.
//
// Adding a release: bump `version` in package.json to match the top entry here,
// and write the notes in the same voice — what you can now do, not what was
// refactored to allow it.

export const RELEASES = [
  {
    version: '0.3.0',
    date: '2026-08-21',
    name: 'The rest of the semester',
    notes: [
      [
        'fixed',
        'Opening Cadence on a phone could drop you into "Start with a term", as though the semester you had already built was gone. It never was. A read that failed \u2014 which on a phone means the half-second between waking up and finding a signal \u2014 left the app holding an empty dataset, and an empty dataset is indistinguishable from a new account. It now knows the difference between having no courses and not having been able to find out, and says which one happened.',
      ],
      [
        'added',
        'Tests, quizzes and finals, which are not assignments with a due date. A problem set is due *by* eleven fifty-nine; a midterm happens *at* two, for fifty minutes, in a room. So an exam asks when rather than when it\u2019s due, defaults to a believable hour instead of midnight, and gets drawn on your schedule alongside the classes \u2014 which is where you were going to look for it anyway.',
      ],
      [
        'fixed',
        'An exam you had already sat used to sit in Overdue, in red, as though you\u2019d failed to hand in a test you turned up for and finished. Those now have their own section \u2014 waiting on a grade \u2014 with the score box ready for the moment it lands.',
      ],
      [
        'added',
        'Breaks and days off. Meeting times repeat weekly and have no opinion about the calendar, so until now the app cheerfully told you to be in Bruner 218 on Thanksgiving and counted down to a class nobody was going to. Put the four dates off the academic calendar in once and the whole term behaves: those days empty out, the week grid hatches them over, and "next class" skips to the day you actually go back. Anything with a real date on it still stands, because professors schedule work over a long weekend constantly.',
      ],
      [
        'added',
        'The semesters before this one. Cumulative GPA meant "this one term", which for anyone past their first is not a number they\u2019d recognise as theirs \u2014 and it made one rough midterm look like a catastrophe. Enter the credit hours and GPA from your transcript, either semester by semester or as a single line for the lot, and the cumulative number becomes your real one. It is the same arithmetic a registrar does, so both ways give the identical answer.',
      ],
      [
        'added',
        'Degree progress. Say how many credits you need and it draws where you are \u2014 banked credits solid, this term hatched on the end \u2014 with the next thing worth reaching for spelled out underneath: the term you cross halfway, or how many semesters are left at the load you\u2019re actually carrying. Deliberately credits rather than a requirement audit; DegreeWorks needs a catalog to be right about whether a specific course counts, and being confidently wrong about that is worse than not claiming to know.',
      ],
      [
        'fixed',
        'Two things at the same hour used to be drawn on top of each other in the week grid, so one of them simply vanished. Classes rarely collide; exams collide constantly, because a midterm is usually scheduled in the period it belongs to \u2014 the exam was reliably the one that disappeared. Overlapping blocks now share the column.',
      ],
      [
        'changed',
        'Cadence re-reads your data when you come back to it, and when the network returns. A phone that has been in a pocket since this morning had its live connection killed by the OS hours ago; the socket comes back empty and confident, and the score you logged on your laptop at lunch was nowhere.',
      ],
    ],
  },
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
