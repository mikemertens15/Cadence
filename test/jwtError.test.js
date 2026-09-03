import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isJwtError } from '../src/auth/jwtError.js';

test('PostgREST JWT expired is a retryable token error', () => {
  assert.equal(isJwtError({ message: 'JWT expired', code: 'PGRST301' }), true);
  assert.equal(isJwtError({ message: 'JWT expired' }), true);
  assert.equal(isJwtError({ status: 401 }), true);
});

test('signing-key and JWS failures are the same class of error', () => {
  assert.equal(isJwtError({ message: 'JWSError JWSInvalidSignature' }), true);
  assert.equal(isJwtError({ message: 'Invalid JWT' }), true);
  assert.equal(isJwtError({ code: '401' }), true);
});

test('a dead refresh token is not something a retry will fix', () => {
  assert.equal(isJwtError({ message: 'Invalid Refresh Token: Refresh Token Not Found' }), false);
  assert.equal(isJwtError({ message: 'refresh_token_already_used' }), false);
});

test('ordinary load failures are left alone', () => {
  assert.equal(isJwtError(null), false);
  assert.equal(isJwtError({ message: 'Could not reach Cadence.' }), false);
  assert.equal(isJwtError({ message: 'relation "user_prefs" does not exist', code: '42P01' }), false);
});
