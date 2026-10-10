const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode } = require('./harness');

const CSV = path.join(__dirname, '..', '..', 'data', 'logbook-seed.csv');

function readCsv(file) {
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
}

test('the committed seed CSV parses cleanly and reproduces the real totals', () => {
  const { parseSeedRows, computeRows, formatRowId } = loadCode();
  const parsed = parseSeedRows(readCsv(CSV));

  assert.deepEqual(parsed.bad, []);
  assert.equal(parsed.good.length, 69);

  const withIds = parsed.good.map((v, i) => Object.assign({}, v, { id: formatRowId(2026, i + 1) }));
  const rows = computeRows(withIds, { plausThreshold: 5000 });

  assert.equal(rows.reduce((s, r) => s + r.consumption, 0), 251871);
  assert.equal(rows.filter((r) => r.recharge > 0).length, 8);
  assert.equal(rows.filter((r) => r.consumption < 0).length, 0);
  assert.equal(rows.filter((r) => r.flag).length, 9);
});
