const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadCode() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
  const sandbox = { console, JSON, Date, Math, String, Number, Array, Object, RegExp, isNaN, parseInt, parseFloat };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'Code.gs' });
  return sandbox;
}
module.exports = { loadCode };
