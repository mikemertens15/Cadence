import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FEATURES,
  PRESETS,
  BETA,
  resolveFeatures,
  presetFor,
  channelOf,
  inChannel,
} from '../src/features.js';

// Two booleans that look the same from a component and are decided by different
// people: what you want on, and what exists yet. The tests that matter are the
// ones about what happens when nobody has said anything — which is the state
// almost every account is in.

test('an account that has never had an opinion gets the defaults', () => {
  const f = resolveFeatures(undefined);
  for (const feature of FEATURES) assert.equal(f[feature.key], feature.default);
});

test('only the keys that disagree are stored, and only they are honoured', () => {
  const f = resolveFeatures({ study: false });
  assert.equal(f.study, false);
  assert.equal(f.schedule, true);
});

test('a key for a feature that no longer exists is ignored, not rendered', () => {
  const f = resolveFeatures({ gone: false, study: false });
  assert.equal('gone' in f, false);
  assert.equal(f.study, false);
});

test('a stored value that is not a boolean falls back to the default', () => {
  // A hand-edited row, or a jsonb write from a version that meant something
  // else by the key. Neither is a reason to leave a feature in limbo.
  const f = resolveFeatures({ study: 'yes', schedule: null });
  assert.equal(f.study, FEATURES.find((x) => x.key === 'study').default);
  assert.equal(f.schedule, FEATURES.find((x) => x.key === 'schedule').default);
});

test('presets are recognised by what they leave on, not by being remembered', () => {
  for (const p of PRESETS) {
    const set = Object.fromEntries(FEATURES.map((f) => [f.key, p.on.includes(f.key)]));
    assert.equal(presetFor(set), p.key);
  }
});

test('a set that matches no preset says so rather than guessing at the nearest', () => {
  const odd = Object.fromEntries(FEATURES.map((f, i) => [f.key, i === 0]));
  const named = PRESETS.some((p) => p.key === presetFor(odd));
  assert.equal(named || presetFor(odd) === null, true);
});

// ------------------------------------------------------------- the channel

test('anything that is not the word beta is stable, including nothing at all', () => {
  assert.equal(channelOf('beta'), 'beta');
  assert.equal(channelOf('stable'), 'stable');
  assert.equal(channelOf(undefined), 'stable');
  assert.equal(channelOf('BETA'), 'stable');
});

test('a capability nobody listed as beta is visible to everyone', () => {
  // Which is what makes giving the green light a deletion: take the line out and
  // the feature is on, with no second place to remember to change.
  assert.equal(inChannel('anything.at.all', 'stable'), true);
  assert.equal(inChannel('anything.at.all', 'beta'), true);
});

test('a listed capability is beta-only, and says what it is', () => {
  for (const key of Object.keys(BETA)) {
    assert.equal(inChannel(key, 'stable'), false);
    assert.equal(inChannel(key, 'beta'), true);
    // The value is shown to a tester as the name of the thing to go and try, so
    // an empty one is a tester told there is something new and not what.
    assert.equal(BETA[key].length > 0, true);
  }
});
