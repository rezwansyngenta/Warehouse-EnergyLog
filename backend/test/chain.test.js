const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./harness');

const rows = [
  { id:'WH-260001', date:'2026-10-09', time:'09:00', recharge:0,    charges:0, balance:9000 },
  { id:'WH-260002', date:'2026-10-09', time:'19:00', recharge:0,    charges:0, balance:8861 }, // same day
  { id:'WH-260003', date:'2026-10-10', time:'09:31', recharge:4500, charges:0, balance:12000 }, // recharge day
  { id:'WH-260004', date:'2026-10-10', time:'19:15', recharge:0,    charges:0, balance:11778 },
];

test('first row is the baseline: consumption 0, cumulative 0', () => {
  const { computeRows } = loadCode();
  const out = computeRows(rows, { plausThreshold: 5000 });
  assert.equal(out[0].consumption, 0);
  assert.equal(out[0].cumulative, 0);
});

test('same-day readings chain correctly and count once each', () => {
  const { computeRows } = loadCode();
  const out = computeRows(rows, { plausThreshold: 5000 });
  assert.equal(out[1].consumption, 139);            // 9000 + 0 - 8861
  assert.equal(out[3].consumption, 222);            // 12000 + 0 - 11778
  assert.equal(out[3].cumulative, 1722);            // 139 + 1361 + 222
});

test('a recharge day uses prev + recharge - balance', () => {
  const { computeRows } = loadCode();
  const out = computeRows(rows, { plausThreshold: 5000 });
  assert.equal(out[2].rechargeDay, true);
  assert.equal(out[2].consumption, 1361);           // 8861 + 4500 - 12000
});

test('out-of-order input is sorted before chaining', () => {
  const { computeRows } = loadCode();
  const shuffled = [rows[3], rows[0], rows[2], rows[1]];
  const out = computeRows(shuffled, { plausThreshold: 5000 });
  assert.deepEqual(out.map(r => r.id), ['WH-260001','WH-260002','WH-260003','WH-260004']);
});

test('a balance that jumps up (pre-top-up entered) is flagged', () => {
  const { computeRows } = loadCode();
  const bad = [rows[0], { ...rows[1], balance: 9500 }]; // balance rose, no recharge
  const out = computeRows(bad, { plausThreshold: 5000 });
  assert.equal(out[1].consumption, -500);
  assert.match(out[1].flag, /negative/i);
});

test('consumption over the plausibility threshold is flagged', () => {
  const { computeRows } = loadCode();
  const big = [rows[0], { ...rows[1], balance: 100 }]; // 9000 - 100 = 8900 > 5000
  const out = computeRows(big, { plausThreshold: 5000 });
  assert.equal(out[1].consumption, 8900);
  assert.match(out[1].flag, /implausible/i);
});
