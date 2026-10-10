const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./harness');

test('formatRowId pads the per-year sequence', () => {
  const { formatRowId } = loadCode();
  assert.equal(formatRowId(2026, 1), 'WH-260001');
  assert.equal(formatRowId(2026, 1234), 'WH-261234');
});

test('parseRowId round-trips and rejects junk', () => {
  const { parseRowId } = loadCode();
  assert.deepEqual(parseRowId('WH-260001'), { year: 2026, seq: 1 });
  assert.equal(parseRowId('nope'), null);
});
