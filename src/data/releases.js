// The release log. Hand-written on purpose: a generated changelog lists
// commits, and what you actually want to read six months later is what changed
// about *using* the thing.
//
// Adding a release: bump `version` in package.json to match the top entry here,
// and write the notes in the same voice — what you can now do, not what was
// refactored to allow it.

export const RELEASES = [
  {
    version: '1.4.2',
    date: '2026-09-01',
    name: 'Putting the syllabus in',
    notes: [
      [
        'fixed',
        'Entering an exam often refused to let you say it was in class. The form opens on today, “in class” can only be offered on a day the class actually meets, and today is not a lecture day four days out of seven — so picking Test in a Mon/Wed/Fri course on a Tuesday handed you a time picker and a length in minutes instead. Picking an exam kind now moves the date to that course’s next class, and switching course moves it to that one’s. A date you typed yourself is never moved.',
      ],
      [
        'fixed',
        'The Today / Tomorrow / Next week buttons set the date and nothing else, so tapping Tomorrow onto a lecture day left an exam sitting on “another time” with a 9 AM box under it, while typing the same date into the field beside them got it right. Both do the same thing now.',
      ],
      [
        'changed',
        'For a quiz, test or final, those three buttons are the next three days that class meets — Wed Sep 2, Fri Sep 4, Mon Sep 7 — with days off already taken out. “Tomorrow” is a real answer for a problem set and almost never one for a midterm, and an in-class quiz is now one tap on the date rather than a trip through a calendar. Assignments keep Today, Tomorrow and Next week.',
      ],
      [
        'added',
        'Add another, next to Add. A syllabus is one course, one kind and eight rows, and closing the form between each of them charged you for the course, the kind, the category and the points every time. This keeps all of it, clears the title and the notes, and counts the title on for you — add “Quiz 1” and the next one is waiting as “Quiz 2”.',
      ],
      [
        'fixed',
        'An exam on a day with both a lecture and a lab defaulted to the later of the two, because it was matching against a due time of 11:59pm that nobody had chosen. It takes the first meeting of the day now; the two time buttons still say which.',
      ],
    ],
  },
  {
    version: '1.4.1',
    date: '2026-08-29',
    name: 'Handed in, waiting on a grade',
    notes: [
      [
        'fixed',
        'Homework you had already handed in still sat in Overdue, in red, and the grades page counted it as work you still had to do — "3 left" when two of those three were sitting in a gradebook. Marking something submitted now files it under Waiting on a grade, the same place an exam you already sat goes, and the course page says so instead of calling it late.',
      ],
      [
        'fixed',
        'The grades page is where you go to type a score in, and the box next to handed-in work was a what-if — it looked like it saved and did not. That box is now the real score, ready for the moment the paper comes back, and you can mark work submitted from the same row so you never have to bounce to the work list first. Future work still has the dashed what-if, so typing 80 on an exam you have not sat cannot invent a grade.',
      ],
      [
        'changed',
        '"What do I need" no longer asks you to score 88% on a paper you already turned in. It aims at the work you can still do, and if everything is in, it tells you what those scores have to come back as. Due soon and the study card stop nagging about work that is already off your desk.',
      ],
    ],
  },
  {
    version: '1.4.0',
    date: '2026-08-29',
    name: 'Only the parts you want',
    notes: [
      [
        'added',
        'Switches for the parts of the app you don\u2019t use. Study sessions, the timetable, degree progress and the semester bar can each be turned off, and there is a \u201cJust grades\u201d button for the case where the answer is all of them \u2014 which is a real way to use this. Five things were competing for the top of Today and four of them were only worth their space to some of the people looking at it, which is how you learn to scroll past the place your grade lives. Nothing is deleted by a switch: hours already logged, meeting times and programs all stay exactly where they are and come back the moment you switch it on again. Settings \u2192 Features.',
      ],
      [
        'changed',
        'A quiz in the class it happens in is no longer a second thing on your Tuesday. It is drawn on the class \u2014 same block, same row, with the exam named on it in the course\u2019s colour \u2014 because a dynamics exam is not a place you go, it is dynamics doing something different. The days that had the most on them were the days this doubled, which is exactly backwards. An exam that genuinely is somewhere else, like an 8am common final in a building you have never been to, still gets its own block.',
      ],
      [
        'changed',
        'Entering an exam stopped asking what time it is. Pick the date, and if the class meets that day it takes the class\u2019s hour and the class\u2019s fifty minutes \u2014 both facts the app has had since you entered the course. \u201cAnother time\u201d is one tap away for the ones that are. Move the class later in the term and the exams marked as in-class move with it, rather than sitting at an hour nobody meets at any more.',
      ],
      [
        'changed',
        'Due times are hours now. No syllabus has ever said 11:47 \u2014 it says midnight, or before class, or five o\u2019clock \u2014 so the minutes half of that picker was a field that existed to be left alone, and on a phone it was two extra taps every single time. Anything already set to something off the hour keeps it exactly as it was.',
      ],
      [
        'added',
        'How many there are going to be. \u201cQuizzes 20%, seven of them, lowest two dropped\u201d is a sentence a syllabus prints, and until now the app could hold the 20% and the two but not the seven \u2014 which is the one that makes the other two mean anything. With it, \u201cwhat do I need on what\u2019s left\u201d counts the four quizzes nobody has written down yet, instead of reporting a term that is nearly settled when a fifth of it hasn\u2019t happened. Leave it blank and nothing changes, except that the forecast now says out loud that it is assuming what you have entered is all of it.',
      ],
      [
        'fixed',
        'A dropped quiz being spent before it was yours. \u201cDrop your lowest two\u201d against two graded quizzes used to keep your better one and call that the category \u2014 a 60 and a 90 reading as 90 in week three. A drop now waits until no score still to come could take it instead: with seven expected it drops none at three graded, one at six, and both at seven. Your grade in a drop category may read lower than it did, and the lower number is the true one. The page says how many drops are still waiting so it isn\u2019t a mystery.',
      ],
      [
        'added',
        'Marks for turning up. A 30% attendance weight earned by in-class work nobody checks for correctness is not a score, and typing \u201c20 out of 20\u201d thirty times is both tedious and a small lie about what was measured. A category can now be graded on turning up: rows in it get Here and Missed instead of a number box, on the work list and the grades page both. And since it is one row per class meeting, the assignment form will make all of them at once \u2014 to the end of term, with the days off already taken out.',
      ],
      [
        'added',
        'Extra credit. Five bonus points on the midterm is an assignment worth zero that you scored five on, which is exactly what a professor adds to the top of the fraction and not to the bottom \u2014 so that is what it now does. It is never the score that gets dropped, either.',
      ],
      [
        'added',
        'A beta channel, under Settings \u2192 Features. An account set to beta sees the things that are finished but not yet switched on for everyone; everybody else sees the app as it was last given the green light. One version of the app either way, and pushing an update is exactly what it was before.',
      ],
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-29',
    name: 'Just come in',
    notes: [
      [
        'added',
        'Sign up with an email and a password, and you are in — no link to go and find, no inbox to switch to, no waiting. Making an account is now the first thing this screen offers rather than something you arrive at by asking for a link and hoping one turns up. The link still exists for a device you have never signed in on, and for the accounts made back when it was the only way in; it has just stopped being the front door, because the front door should not depend on the slowest and least reliable part of the whole arrangement.',
      ],
      [
        'changed',
        'Trying to sign up on an address that already has an account now says so, and points at signing in. It used to be indistinguishable from success — you would be told to check an inbox that was never going to receive anything, because the account you were creating had been there all along.',
      ],
    ],
  },
  {
    version: '1.2.2',
    date: '2026-08-29',
    name: 'One link at a time',
    notes: [
      [
        'fixed',
        'The button that emails you a sign-in link no longer takes a second click. Cadence gets a fixed number of emails an hour, and it is one pot shared by everyone signing in rather than an allowance each — so a link that takes thirty seconds to arrive is very hard not to ask for twice, and the second ask quietly spends somebody else’s turn. Sending one now holds the button for a minute with the wait counting down on it, and holds it longer if the pot is actually empty. When it is empty the app says so in those words, instead of passing along the server’s “email rate limit exceeded”, which reads like an accusation and tells you nothing about what to do next — which is to sign in with your password if you have one, and otherwise to wait for the hour to turn over.',
      ],
    ],
  },
  {
    version: '1.2.1',
    date: '2026-08-28',
    name: 'The link comes back',
    notes: [
      [
        'fixed',
        'A sign-in link that said it had expired the moment you opened it. It hadn’t. It worked — once, silently — and then handed you to an address that only exists on the laptop Cadence was built on, so the account was made and the page you landed on was nothing at all. The sensible thing to do next is go back to the inbox and click the link again, and that is the one thing that genuinely does spend it: the second click is where the expiry message comes from, and by then the link had already done its job. Links now come back to the site you actually opened them from. If this happened to you while signing up, your account is there — ask for a new link and it will let you straight in.',
      ],
    ],
  },
  {
    version: '1.2.0',
    date: '2026-08-26',
    name: 'Further through than you thought',
    notes: [
      [
        'added',
        'A semester has no odometer. It has a first week you remember and a last week that is a long way off, and every week in between looks like the one before it \u2014 so the estimate you\u2019re carrying was made in September and has never once been corrected. Cadence already knows the two dates it takes to correct it. Today now carries a line under the date saying which week of how many this is and how far through you are, and the schedule leads with the whole picture: the bar, the months it crosses, where the breaks fall, and how many days of class are actually left. The one it exists to show you is "past halfway", which arrives a good deal earlier than it feels like it should.',
      ],
      [
        'added',
        'Days you don\u2019t have to show up are counted as such. Class days left counts the days you actually meet \u2014 a Tuesday/Thursday course has a very different number left than a five-day one \u2014 and the days off already entered come back out of it. The week before Thanksgiving, the card says twenty-one days left and then says three of them are Thanksgiving, which is the kind of thing that is obvious in hindsight and invisible in advance.',
      ],
    ],
  },
  {
    version: '1.1.0',
    date: '2026-08-24',
    name: 'Which class needs the next hour',
    notes: [
      [
        'added',
        'Deep study, which is a timer that knows what it’s a timer for. Pick a length, or take the one it suggests, and the block is logged against the class you spent it on. The clock lives in the database rather than in the tab, so a laptop that goes to sleep, a phone that locks, or a browser you close by accident costs you nothing — and a block you start on the laptop is still running when you pull out your phone in the library. Pausing is real: the count stops, and the time you were away never enters the total.',
      ],
      [
        'added',
        'It says which class, and why. Three hours on one course is only a problem because two others got none, and that is a thing Cadence can already see — it knows what’s due, what it’s worth, where every grade stands and what each course still has left to score on. So the card names one class and shows its reasons: exam Thursday, six hours short this week, right on the B cutoff. The reasons are the point. A ranking you can’t see the working of is one you can’t overrule when it’s wrong, and "Another class" opens the whole order with everyone’s reasons attached.',
      ],
      [
        'added',
        'Where the week actually went. Five bars, each against what that class was meant to get — two hours a week per credit hour until you say otherwise, which you can, in hours, on the same panel. It also says the sentence the bars are for when it’s true: 71% of your week went to one class.',
      ],
      [
        'added',
        'Blocks that fit the day you’re actually having. Starting a 90 at 1:20 with a class at 2:00 ends one of two ways and both are bad, so the app offers the 35 that fits and says why it’s a 35. Eight minutes before a lecture it says there isn’t time — and still lets you start one, because skipping the lecture is your call to make and not the app’s.',
      ],
      [
        'fixed',
        'A timer left running through dinner would have been the most misleading number this app is capable of showing, in the same way scoring a withdrawal as the 41% you were carrying would be. Half an hour past the length you set, the block stops taking its own clock at face value and asks which of the two numbers actually happened. A block stopped within a minute of starting is treated as the misclick it is and not logged at all.',
      ],
      [
        'fixed',
        'Opening Cadence and being told it couldn’t load your semester, then having it load perfectly the moment you pressed Try again. Your sign-in lasts an hour, so a tab that has been shut since last night wakes up holding a key that expired while you were asleep — and the app went ahead and used it anyway, for all ten reads, before waiting to be handed the new one. It now waits. And if a read does fail on a dead key, signing in or renewing quietly re-runs it, because the thing that always fixed this was a fresh key the app already had and no reason to go back and use.',
      ],
      [
        'fixed',
        'The same quiz, twice, on the night before it. The banner at the top reaches into tomorrow once today is done, and the exam strip underneath was only checking what was left of today — so a 9am quiz was both the headline and the reminder under it. Now it’s only the headline, and the headline itself opens the quiz: tap it to move the time or fix the name, which is the one thing the little strip was still good for.',
      ],
    ],
  },
  {
    version: '1.0.0',
    date: '2026-08-24',
    name: 'A semester you can actually run',
    notes: [
      [
        'fixed',
        'Homework that nobody grades. Some professors hand out problem sets "for your own benefit" and collect nothing \u2014 you still need the due date, because you still have to do it before Thursday\u2019s lecture stops making sense. The only way to say that used to be leaving the category blank, which is the same state as "I haven\u2019t filed this yet", so the grades page nagged about it in amber forever. Not graded is now a real answer: the points field goes away, the grade ignores it completely, and it still sits in your work list with its date on it.',
      ],
      [
        'added',
        'The kind of work now picks the category. Choosing "Quiz" and then choosing "Quizzes" was the same decision twice, and the second one is the one you skip \u2014 which is how a quiz ends up outside the grade entirely. It goes on what you did last time in that course first, the names on the syllabus second, and it says which underneath so a wrong guess is a wrong guess you can see. A course whose syllabus reads Exams 60 / Final 40 has no home for a problem set, and it now says so rather than guessing at one.',
      ],
      [
        'added',
        'A run of work in one go. "Problem sets due Fridays for fourteen weeks" is one decision and fourteen rows, and typing it fourteen times was the most tedious thing this app had ever asked for. Pick weekly, say how many, and they arrive numbered from wherever your title left off \u2014 type "Problem Set 3" and get 3 through 16. If the syllabus turns out to say Wednesday, the whole batch comes back out in one click.',
      ],
      [
        'added',
        'More than one thing to work toward. A second degree, a master\u2019s, a minor, and the classes taken because they looked interesting are four different denominators \u2014 and "169 credits out of 120" is not a sentence about any of them. Each program gets its own bar, its own credit total and its own GPA, because a graduate GPA is genuinely a separate number and blending it into an undergraduate one reports neither correctly.',
      ],
      [
        'added',
        'Credits that count toward two things at once. Gen eds are the reason: Calculus I is on the mechanical engineering audit and on the second degree\u2019s, one course and one grade advancing two bars. So a course is applied to however many programs it belongs to \u2014 or to none, which is the honest way to record a class taken for interest. Shared credits are counted once in your total and named as shared, rather than left as an inconsistency between two numbers that should have matched.',
      ],
      [
        'added',
        'Pass/fail, audits and withdrawals. A pass/fail lab earns credit and no grade points, an audit earns neither, and a W is not an F \u2014 scoring the 41% you were carrying when you dropped would have been the most misleading number this app was capable of showing. All three now behave, and the GPA note says how many courses are sitting out and why, separately from the ones simply waiting on a grade.',
      ],
      [
        'added',
        'What each class needs for the term to land where you want it. The course page has always answered "what do I need on the work left here"; this is that question asked of five courses at once. Every line assumes the others finish where they stand today \u2014 stated out loud, because a plan that quietly falls apart when one number moves is worse than no plan \u2014 and it chains straight through: Heat Transfer needs a B, which is 88% on the four assignments left.',
      ],
      [
        'added',
        'Your data, in your hands. A full JSON backup of every row, and the gradebook as a CSV with the course and category names spelled out. A year of scores living behind someone else\u2019s login with no way to take a copy was a fine trade for a weekend project and a bad one for the thing you\u2019re running a degree on. Under Settings \u2192 Data.',
      ],
    ],
  },
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
