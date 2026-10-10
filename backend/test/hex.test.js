const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./harness');

test('hex_ hex-encodes a byte list, two chars per byte', () => {
  const { hex_ } = loadCode();
  assert.equal(hex_([0, 15, 255]), '000fff');
});

test('hex_ handles signed bytes from Utilities.computeDigest', () => {
  const { hex_ } = loadCode();
  assert.equal(hex_([-1, 16]), 'ff10');
});
