const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./harness');

test('dateToText passes strings through and formats Dates', () => {
  const { dateToText } = loadCode();
  assert.equal(dateToText('2026-01-05'), '2026-01-05');
  assert.equal(dateToText(new Date(2026, 0, 5)), '2026-01-05');
});

test('timeToText pads hours and minutes', () => {
  const { timeToText } = loadCode();
  assert.equal(timeToText('09:00'), '09:00');
  assert.equal(timeToText(new Date(2026, 0, 5, 9, 5)), '09:05');
});

test('timeToText re-adds the leading zero Sheets strips on paste', () => {
  const { timeToText } = loadCode();
  assert.equal(timeToText('9:32'), '09:32');
  assert.equal(timeToText('9:05'), '09:05');
  assert.equal(timeToText('14:00:00'), '14:00');
  assert.equal(timeToText('nonsense'), 'nonsense'); // left for validation to reject
});

test('rowToObject normalizes a coerced Date cell back to text', () => {
  const { rowToObject } = loadCode();
  const o = rowToObject(['WH-260001', new Date(2026, 0, 5), new Date(2026, 0, 5, 9, 0), 0, '', '', 9000, 0, 'G', '', new Date(2026, 0, 5, 9, 0, 0)]);
  assert.equal(o.date, '2026-01-05');
  assert.equal(o.time, '09:00');
  assert.equal(o.balance, 9000);
});
