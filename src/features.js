// Which parts of the app are switched on, and which parts exist yet.
//
// Two different questions that both end up as a boolean, kept apart because
// they're answered by different people:
//
//   FEATURES  what *you* want to see. A study timer is not clutter to someone
//             using it and is nothing but clutter to someone who isn't, and
//             there is no version of this app that is right for both unless
//             it can be turned off.
//
//   BETA      what has been finished but not yet turned on for everyone. One
//             bundle, deployed the way it always was; the account's channel
//             decides whether the new thing is in it.
//
// Both are read through the same `features` object the provider hands out, so a
// component never has to know which of the two reasons it's hidden for.

// ------------------------------------------------------------- what's on

/**
 * The switchable parts, in the order they're offered.
 *
 * `default: true` on all of them on purpose. Someone arriving at a new app has
 * no basis for choosing, so they get everything and turn off what they don't
 * use — the opposite arrangement hides features behind a screen nobody visits
 * and calls that a decision.
 *
 * `needs` is the honest bit. Turning off the timetable does not just hide a
 * tab: Today's whole "where do I need to be" half comes from meeting times, and
 * an app that hid the tab and left the card would look broken. So a feature
 * names what depends on it, and the panel says so before you flip it.
 */
export const FEATURES = [
  {
    key: 'schedule',
    label: 'Timetable',
    blurb: 'When your classes meet, the week grid, and the class-next card on Today.',
    default: true,
    off: 'Today stops leading with where you have to be, and the Schedule tab goes away.',
  },
  {
    key: 'study',
    label: 'Deep study',
    blurb: 'The timer, which class needs the next hour, and where the week went.',
    default: true,
    off: 'Hours already logged are kept, and come back if you switch this on again.',
  },
  {
    key: 'degree',
    label: 'Degree progress',
    blurb: 'Programs, credits toward them, past semesters and cumulative GPA.',
    default: true,
    off: 'Grades still work — you just stop being told how the whole degree is going.',
  },
  {
    key: 'termProgress',
    label: 'Semester progress',
    blurb: 'How far through the term you are, on Today and on the schedule.',
    default: true,
    off: 'Nothing else changes.',
  },
];

const BY_KEY = new Map(FEATURES.map((f) => [f.key, f]));

export const featureOf = (key) => BY_KEY.get(key) ?? null;

/**
 * A preset, because "I only want to track my grades" is a real answer and four
 * switches is a worse way to say it than one button.
 *
 * Stated as the features left *on*, so adding a feature later doesn't silently
 * join a preset that predates it.
 */
export const PRESETS = [
  { key: 'everything', label: 'Everything', on: FEATURES.map((f) => f.key) },
  { key: 'grades', label: 'Just grades', on: [] },
  { key: 'noTimer', label: 'No study timer', on: ['schedule', 'degree', 'termProgress'] },
];

/** The stored patch (only the keys that disagree) resolved against the defaults. */
export function resolveFeatures(stored) {
  const out = {};
  for (const f of FEATURES) {
    const v = stored?.[f.key];
    out[f.key] = typeof v === 'boolean' ? v : f.default;
  }
  return out;
}

/** Which preset, if any, describes the current set exactly. */
export function presetFor(features) {
  return (
    PRESETS.find((p) => FEATURES.every((f) => features[f.key] === p.on.includes(f.key)))?.key ?? null
  );
}

// ----------------------------------------------------------- what's finished

/**
 * Work that is done, deployed, and not yet turned on for everyone.
 *
 * A key in here is visible only to accounts on the `beta` channel. Giving the
 * green light is **deleting the line** — no migration, no second deploy path,
 * no build flag. Push updates exactly the way you always did; the channel is
 * what decides whether the new thing is in the app you pushed.
 *
 * What belongs in here: a whole new surface. A panel, a tab, an extra control,
 * a new kind of thing you can create — something with an edge you can draw
 * around, where hiding it leaves the app it was before rather than a half of
 * one.
 *
 * What does not: a rewrite of something that already exists. Gating "the due
 * time is now an hour instead of a time picker" means shipping and maintaining
 * both pickers, and two code paths through the same form is a far more
 * expensive way to be careful than reading the diff was. Those ship to
 * everyone, and the safety net for them is the one that has always applied —
 * every migration additive, so a client that has never heard of a column reads
 * rows written by one that has.
 *
 * The value is the phrase used in the settings panel, so a tester knows what
 * they're looking at without being handed a changelog.
 */
export const BETA = {
  'grades.scheme': 'How many, and marks for turning up',
};

export const BETA_KEYS = Object.keys(BETA);

/**
 * The channel a stored preference resolves to.
 *
 * Anything that isn't the word `beta` is stable, including the absence of a
 * row — a preference nobody has ever set should not opt anyone into unfinished
 * work.
 */
export const channelOf = (stored) => (stored === 'beta' ? 'beta' : 'stable');

/**
 * Is this capability visible on this channel?
 *
 * A key that isn't in BETA is released, which is what makes the green light a
 * deletion. The default is *visible*, so the failure mode of forgetting to
 * clean a key up is that everyone sees a finished feature — not that a shipped
 * one silently disappears.
 */
export const inChannel = (key, channel) => !(key in BETA) || channel === 'beta';
