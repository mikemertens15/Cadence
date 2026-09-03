// PostgREST's 401 when the Bearer token is dead. The message varies by
// gateway and signing key ("JWT expired", "JWSError JWSInvalidSignature",
// PGRST301), but they are the same fact: this request's key is not one the
// server will honour, and a refresh is the thing that produces a new one.

const JWT_MSG = /jwt|jwserror|invalid token|invalid jwt|unauthorized/i;

export function isJwtError(err) {
  if (!err) return false;
  if (err.status === 401) return true;
  const code = String(err.code ?? '');
  if (code === 'PGRST301' || code === '401') return true;
  const msg = String(err.message ?? '');
  // A rejected refresh token is a signed-out problem, not a retry-with-a-new-
  // access-token one. Matching "expired" alone would catch it.
  if (/refresh token/i.test(msg)) return false;
  return JWT_MSG.test(msg) || /expired/i.test(msg);
}
