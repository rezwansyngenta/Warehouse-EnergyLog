const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./harness');

// Minimal in-memory stand-in for a Sheet, enough for ensureHeader_.
function fakeSheet(rows) {
  const grid = rows.map(r => r.slice());
  return {
    _grid: grid,
    getLastRow() { return grid.length; },
    appendRow(r) { grid.push(r.slice()); },
    insertRowBefore(n) { grid.splice(n - 1, 0, []); },
    getRange(r0, c0, nr, nc) {
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const src = grid[r0 - 1 + i] || [];
            const row = [];
            for (let j = 0; j < nc; j++) row.push(src[c0 - 1 + j] === undefined ? '' : src[c0 - 1 + j]);
            out.push(row);
          }
          return out;
        },
        setValues(vals) {
          for (let i = 0; i < nr; i++) {
            const tr = r0 - 1 + i;
            while (grid.length <= tr) grid.push([]);
            const row = grid[tr].slice();
            for (let j = 0; j < nc; j++) row[c0 - 1 + j] = vals[i][j];
            grid[tr] = row;
          }
        },
        setNumberFormat() {},
      };
    },
  };
}

const LOG = ['Row ID', 'Date', 'Time', 'Recharge', 'Description', 'Remark', 'Balance', 'Charges', 'Entered By', 'Edited By', 'Updated At'];
const DATA = ['WH-260001', '2026-01-05', '09:00', 0, 'x', '', 9000, 0, 'test', '', ''];

test('writes a header into an empty sheet', () => {
  const { ensureHeader_ } = loadCode();
  const sh = fakeSheet([]);
  ensureHeader_(sh, LOG);
  assert.deepEqual(sh._grid[0], LOG);
  assert.equal(sh.getLastRow(), 1);
});

test('inserts a header above existing data instead of leaving row 1 as data', () => {
  const { ensureHeader_ } = loadCode();
  const sh = fakeSheet([DATA]);
  ensureHeader_(sh, LOG);
  assert.deepEqual(sh._grid[0], LOG);
  assert.deepEqual(sh._grid[1], DATA);
  assert.equal(sh.getLastRow(), 2);
});

test('is a no-op when the header already matches', () => {
  const { ensureHeader_ } = loadCode();
  const sh = fakeSheet([LOG, DATA]);
  ensureHeader_(sh, LOG);
  assert.equal(sh.getLastRow(), 2);
  assert.deepEqual(sh._grid[0], LOG);
  assert.deepEqual(sh._grid[1], DATA);
});
