const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./harness');

const HEADER = ['Date', 'Time', 'Recharge', 'Description', 'Remark', 'Balance', 'Charges'];
const row = (d, t, rech, bal, desc) => [d, t, rech, desc === undefined ? 'Balance Check' : desc, '', bal, ''];

test('parses raw seed rows into validated entries', () => {
  const { parseSeedRows } = loadCode();
  const r = parseSeedRows([HEADER, row('2026-08-11', '14:00', '', 32021)]);
  assert.equal(r.bad.length, 0);
  assert.equal(r.good.length, 1);
  assert.deepEqual(r.good[0], {
    date: '2026-08-11', time: '14:00', recharge: 0, charges: 0,
    balance: 32021, description: 'Balance Check', remark: ''
  });
});

test('keeps a recharge amount and never carries a consumption column', () => {
  const { parseSeedRows } = loadCode();
  const r = parseSeedRows([HEADER, row('2026-08-20', '16:15', 40000, 40943)]);
  assert.equal(r.good[0].recharge, 40000);
  assert.equal(r.good[0].balance, 40943);
  assert.equal('consumption' in r.good[0], false);
});

test('accepts real Date/Time values that Sheets coerces on paste', () => {
  const { parseSeedRows } = loadCode();
  const r = parseSeedRows([
    HEADER,
    [new Date(2026, 7, 11), new Date(1899, 11, 30, 14, 5), '', 'Balance Check', '', 32021, ''],
  ]);
  assert.equal(r.good.length, 1);
  assert.equal(r.good[0].date, '2026-08-11');
  assert.equal(r.good[0].time, '14:05');
});

test('reports rows with a missing date/time as bad', () => {
  const { parseSeedRows } = loadCode();
  const r = parseSeedRows([HEADER, row('', '', '', 100)]);
  assert.equal(r.good.length, 0);
  assert.equal(r.bad.length, 1);
  assert.match(r.bad[0], /missing date\/time/);
});

test('reports a non-numeric balance as bad', () => {
  const { parseSeedRows } = loadCode();
  const r = parseSeedRows([HEADER, row('2026-08-11', '14:00', '', 'abc')]);
  assert.equal(r.good.length, 0);
  assert.equal(r.bad.length, 1);
  assert.match(r.bad[0], /balance/);
});

test('ignores blank trailing rows', () => {
  const { parseSeedRows } = loadCode();
  const r = parseSeedRows([HEADER, row('2026-08-11', '14:00', '', 32021), ['', '', '', '', '', '', '']]);
  assert.equal(r.good.length, 1);
  assert.equal(r.bad.length, 0);
});

test('requires a Date, Time and Balance header', () => {
  const { parseSeedRows } = loadCode();
  const r = parseSeedRows([['When', 'Balance'], ['2026-08-11', 32021]]);
  assert.equal(r.good.length, 0);
  assert.equal(r.bad.length, 1);
  assert.match(r.bad[0], /header/);
});
