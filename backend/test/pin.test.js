const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { loadCode } = require('./harness');

const sha256Hex = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const CFG = { maxFailures: 5, windowMs: 600000, lockoutMs: 600000 };
const EMPTY = { failures: 0, firstFailureMs: 0, lockedUntilMs: 0 };

test('pinDigest mixes salt before pin, deterministically', () => {
  const { pinDigest } = loadCode();
  assert.equal(pinDigest('salt', '1234', sha256Hex), sha256Hex('salt1234'));
});

test('the 5th failure inside the window locks writes', () => {
  const { registerFailure, isBlocked } = loadCode();
  let s = EMPTY;
  for (let i = 0; i < 5; i++) s = registerFailure(s, 1000, CFG);
  assert.equal(isBlocked(s, 1000), true);
  assert.equal(isBlocked(s, 1000 + CFG.lockoutMs + 1), false);
});

test('failures spread beyond the window reset the count', () => {
  const { registerFailure, isBlocked } = loadCode();
  let s = EMPTY;
  s = registerFailure(s, 0, CFG);
  s = registerFailure(s, CFG.windowMs + 1, CFG);
  assert.equal(s.failures, 1);
  assert.equal(isBlocked(s, CFG.windowMs + 1), false);
});

test('a success clears the state', () => {
  const { registerSuccess } = loadCode();
  assert.deepEqual(registerSuccess(), EMPTY);
});
