/* Tests for preview/api.js - the row mapping and write-error wording the screens rely on.
   Run from the repo root:  node --test "preview/test/*.test.js"  */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadApi() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'api.js'), 'utf8');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox;
}
const api = loadApi();

test('parseDay turns a YYYY-MM-DD string into a local date with no timezone drift', () => {
  const d = api.parseDay('2026-08-11');
  assert.strictEqual(d.getFullYear(), 2026);
  assert.strictEqual(d.getMonth(), 7);
  assert.strictEqual(d.getDate(), 11);
  assert.strictEqual(d.getHours(), 0);
});

test('parseDay rejects anything that is not a plain date', () => {
  assert.strictEqual(api.parseDay('11.08.26'), null);
  assert.strictEqual(api.parseDay(''), null);
  assert.strictEqual(api.parseDay(undefined), null);
});

test('mapRows marks a recharge day as recharge and a server flag as check', () => {
  const rows = api.mapRows([
    { id: 'WH-260001', date: '2026-08-11', time: '14:00', recharge: 0, balance: 32021, consumption: 0, cumulative: 0, rechargeDay: false, flag: '' },
    { id: 'WH-260002', date: '2026-08-20', time: '16:15', recharge: 40000, balance: 40943, consumption: 0, cumulative: 0, rechargeDay: true, flag: '' },
    { id: 'WH-260003', date: '2026-08-25', time: '09:25', recharge: 0, balance: 27446, consumption: -123, cumulative: -123, rechargeDay: false, flag: 'negative consumption' }
  ]);
  assert.deepStrictEqual(rows.map(r => r.flag), ['', 'recharge', 'check']);
});

test('mapRows keeps server numbers and fills empty text with an em dash', () => {
  const [r] = api.mapRows([{ id: 'WH-260001', date: '2026-08-11', time: '14:00', recharge: '1200', balance: '32021', consumption: '80', cumulative: '80', rechargeDay: false, flag: '', description: '', remark: null, enteredBy: 'Guard' }]);
  assert.strictEqual(r.recharge, 1200);
  assert.strictEqual(r.balance, 32021);
  assert.strictEqual(r.consumption, 80);
  assert.strictEqual(r.cumulative, 80);
  assert.strictEqual(r.description, '—');
  assert.strictEqual(r.remark, '—');
  assert.strictEqual(r.enteredBy, 'Guard');
});

test('mapRows drops rows whose date cannot be parsed', () => {
  assert.strictEqual(api.mapRows([{ id: 'x', date: 'nonsense' }]).length, 0);
  assert.strictEqual(api.mapRows(null).length, 0);
  assert.strictEqual(api.mapRows(undefined).length, 0);
});

test('saveError explains the common write failures in plain words', () => {
  assert.match(api.saveError({ ok: false, error: 'bad pin' }), /Wrong PIN/);
  assert.match(api.saveError({ ok: false, error: 'not found' }), /reload/);
  assert.strictEqual(api.saveError({ ok: false, error: 'Save cancelled.' }), 'Save cancelled.');
  assert.match(api.saveError({ ok: false, error: 'network' }), /Not saved/);
});

test('dhakaNow returns a date on the Asia/Dhaka clock', () => {
  const d = api.dhakaNow();
  assert.ok(d && !isNaN(d.getTime()), 'dhakaNow returns a valid date');
  const wall = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  assert.strictEqual([d.getFullYear(), d.getMonth() + 1, d.getDate()].map(n => String(n).padStart(2, '0')).join('-'), wall);
});
