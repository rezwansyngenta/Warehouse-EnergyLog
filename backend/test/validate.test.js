const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./harness');
const NOW = { date: '2026-10-11', time: '08:05' };

test('a minimal valid entry defaults recharge/charges to 0 and stamps now', () => {
  const { validateEntry } = loadCode();
  const r = validateEntry({ balance: 9000 }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.value.date, '2026-10-11');
  assert.equal(r.value.time, '08:05');
  assert.equal(r.value.recharge, 0);
  assert.equal(r.value.charges, 0);
  assert.equal(r.value.balance, 9000);
});

test('a missing balance is rejected', () => {
  const { validateEntry } = loadCode();
  const r = validateEntry({ recharge: 500 }, NOW);
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('balance'));
});

test('a non-numeric balance is rejected', () => {
  const { validateEntry } = loadCode();
  assert.equal(validateEntry({ balance: 'abc' }, NOW).ok, false);
});

test('a non-ISO date is rejected', () => {
  const { validateEntry } = loadCode();
  assert.equal(validateEntry({ balance: 1, date: '10.10.26' }, NOW).ok, false);
});

test('non-JSON input is rejected by parseBody', () => {
  const { parseBody } = loadCode();
  assert.equal(parseBody('not json').ok, false);
  assert.equal(parseBody('{"action":"add"}').ok, true);
});

test('an impossible time is rejected', () => {
  const { validateEntry } = loadCode();
  assert.equal(validateEntry({ balance: 1, time: '25:99' }, NOW).ok, false);
});

test('an out-of-range month is rejected', () => {
  const { validateEntry } = loadCode();
  assert.equal(validateEntry({ balance: 1, date: '2026-13-01' }, NOW).ok, false);
});
