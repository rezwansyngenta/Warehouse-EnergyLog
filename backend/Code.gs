// ---- API entry points ----

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function version_() { return Number(readConfig().SheetVersion) || 1; }

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || 'rows';
    if (action === 'ping') return json_({ ok: true, version: version_() });
    if (action !== 'rows') return json_({ ok: false, error: 'unknown action' });
    const cfg = readConfig();
    const plaus = Number(cfg.PlausThreshold) || 0;
    return json_({ ok: true, version: version_(),
      guardName: cfg.GuardName || '', timezone: cfg.Timezone || 'Asia/Dhaka',
      plausThreshold: plaus, rows: computeRows(readLogRows(), { plausThreshold: plaus }) });
  } catch (err) { return fail_(err); }
}

function doPost(e) {
  try {
    const parsed = parseBody(e && e.postData && e.postData.contents);
    if (!parsed.ok) return json_({ ok: false, error: parsed.error });
    const body = parsed.value || {};
    if (body.action === 'ping') return json_({ ok: true, pong: true });
    if (body.action !== 'add' && body.action !== 'edit') return json_({ ok: false, error: 'unknown action' });

    const cfg = readConfig();
    const enteredBy = cfg.GuardName || 'Guard';
    const v = validateEntry(body, todayDhaka());
    if (!v.ok) return json_({ ok: false, error: 'invalid entry: ' + v.errors.join(',') });
    const plaus = Number(cfg.PlausThreshold) || 0;

    if (body.action === 'add') {
      const row = appendLogRow(v.value, enteredBy);
      return json_({ ok: true, row: findRow_(row.id, plaus) });
    }
    const id = String(body.id || '');
    if (!parseRowId(id)) return json_({ ok: false, error: 'invalid id' });
    if (!updateLogRow(id, v.value, enteredBy)) return json_({ ok: false, error: 'not found' });
    return json_({ ok: true, row: findRow_(id, plaus) });
  } catch (err) { return fail_(err); }
}

function findRow_(id, plaus) {
  const all = computeRows(readLogRows(), { plausThreshold: plaus });
  return all.filter(function (r) { return r.id === id; })[0];
}

function fail_(err) {
  try {
    MailApp.sendEmail(Session.getEffectiveUser().getEmail(),
      'Log Book backend error', String((err && err.stack) || err));
  } catch (e) {}
  return json_({ ok: false, error: 'server error' });
}

// ---- Setup & backup ----

function setup() {
  const cfg = sheet('Config');
  if (cfg.getLastRow() === 0) cfg.appendRow(['Key', 'Value']);
  const defaults = [
    ['GuardName', 'Guard'],
    ['Timezone', 'Asia/Dhaka'],
    ['PlausThreshold', 5000],
    ['SheetVersion', 1]
  ];
  const existing = readConfig();
  defaults.forEach(function (row) { if (existing[row[0]] === undefined) cfg.appendRow(row); });

  const log = sheet('Log');
  ensureHeader_(log, LOG_COLUMNS);
  log.getRange('B2:C').setNumberFormat('@');   // Date, Time must stay text (no timezone drift)
  log.getRange('K2:K').setNumberFormat('@');   // Updated At stays text
  const audit = sheet('Audit');
  ensureHeader_(audit, AUDIT_COLUMNS);

  const has = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'dailyBackup'; });
  if (!has) ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(2).create();
}

function dailyBackup() {
  const ss = SpreadsheetApp.getActive();
  const it = DriveApp.getFoldersByName('LogBookBackups');
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder('LogBookBackups');
  const stamp = Utilities.formatDate(new Date(), 'Asia/Dhaka', 'yyyy-MM-dd_HHmm');
  DriveApp.getFileById(ss.getId()).makeCopy(ss.getName() + ' ' + stamp, folder);
  const files = folder.getFiles();
  const list = [];
  while (files.hasNext()) list.push(files.next());
  list.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
  for (let i = 30; i < list.length; i++) list[i].setTrashed(true);
}

// ---- Pure logic (no Apps Script globals: Node-testable via test/harness.js) ----

function sortRows(rows) {
  return rows.slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.time !== b.time) return a.time < b.time ? -1 : 1;
    return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
  });
}

function computeRows(rows, cfg) {
  const thr = (cfg && cfg.plausThreshold) || 0;
  const sorted = sortRows(rows);
  let cumulative = 0;
  return sorted.map(function (r, i) {
    const recharge = Number(r.recharge) || 0;
    const balance = Number(r.balance) || 0;
    let consumption = 0;
    if (i > 0) consumption = (Number(sorted[i - 1].balance) || 0) + recharge - balance;
    cumulative += consumption;
    let flag = '';
    if (consumption < 0) flag = 'negative consumption';
    else if (thr > 0 && consumption > thr) flag = 'implausible jump';
    return Object.assign({}, r, {
      recharge: recharge, balance: balance,
      consumption: consumption, cumulative: cumulative,
      rechargeDay: recharge > 0, flag: flag
    });
  });
}

function parseBody(contents) {
  try { return { ok: true, value: JSON.parse(contents) }; }
  catch (e) { return { ok: false, error: 'invalid JSON body' }; }
}

function isIsoDate_(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
  const mo = Number(String(s).slice(5, 7));
  const da = Number(String(s).slice(8, 10));
  return mo >= 1 && mo <= 12 && da >= 1 && da <= 31;
}

function validateEntry(input, now) {
  const errors = [];
  const num = function (v, def) {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    return isNaN(n) ? NaN : n;
  };
  const balance = num(input.balance, NaN);
  if (isNaN(balance)) errors.push('balance');
  const recharge = num(input.recharge, 0);
  if (isNaN(recharge) || recharge < 0) errors.push('recharge');
  const charges = num(input.charges, 0);
  if (isNaN(charges) || charges < 0) errors.push('charges');
  const date = input.date || now.date;
  if (!isIsoDate_(date)) errors.push('date');
  const time = input.time || now.time;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push('time');
  if (errors.length) return { ok: false, errors: errors };
  return { ok: true, value: {
    date: date, time: time, recharge: recharge, charges: charges, balance: balance,
    description: String(input.description || ''), remark: String(input.remark || '')
  }};
}

function formatRowId(year, seq) {
  return 'WH-' + String(year).slice(-2) + String(seq).padStart(4, '0');
}

function parseRowId(id) {
  const m = /^WH-(\d{2})(\d{4})$/.exec(String(id || ''));
  if (!m) return null;
  return { year: 2000 + Number(m[1]), seq: Number(m[2]) };
}

// Parses a 2-D `Seed` sheet (header row + data rows) into validated entries.
// Pure (no Apps Script globals) so it is Node-testable. Blank trailing rows are
// ignored; rows with a missing/invalid Date, Time or Balance are listed in `bad`.
// Accepts raw Sheet values (real Dates/Times included) via dateToText/timeToText.
function parseSeedRows(values) {
  const out = { good: [], bad: [] };
  if (!values || !values.length) return out;
  const head = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const idx = function (n) { return head.indexOf(n); };
  const iDate = idx('date'), iTime = idx('time'), iRech = idx('recharge'),
        iDesc = idx('description'), iRem = idx('remark'), iBal = idx('balance'), iChg = idx('charges');
  if (iDate < 0 || iTime < 0 || iBal < 0) {
    out.bad.push('header must contain Date, Time and Balance');
    return out;
  }
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const blank = row.every(function (c) { return c === '' || c === null || c === undefined; });
    if (blank) continue;
    const input = {
      date: dateToText(row[iDate]), time: timeToText(row[iTime]),
      recharge: iRech >= 0 ? (row[iRech] || 0) : 0,
      description: iDesc >= 0 ? String(row[iDesc] || '') : '',
      remark: iRem >= 0 ? String(row[iRem] || '') : '',
      balance: row[iBal],
      charges: iChg >= 0 ? (row[iChg] || 0) : 0
    };
    if (!input.date || !input.time) { out.bad.push('row ' + (i + 1) + ': missing date/time'); continue; }
    const v = validateEntry(input, {});
    if (!v.ok) { out.bad.push('row ' + (i + 1) + ': ' + v.errors.join(',')); continue; }
    out.good.push(v.value);
  }
  return out;
}

// ---- Apps Script glue (Sheet I/O). No globals are touched at load time. ----

const LOG_COLUMNS = ['Row ID','Date','Time','Recharge','Description','Remark','Balance','Charges','Entered By','Edited By','Updated At'];
const AUDIT_COLUMNS = ['Timestamp','Row ID','Action','Changed By','Before','After'];

function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

// Guarantee row 1 is the header row. Every reader assumes it (`slice(1)`, loops start at
// index 1), so a sheet holding data but no header would silently drop its first row.
// Repair it here rather than trust that setup() ran before anything was written.
function ensureHeader_(sh, cols) {
  const head = sh.getRange(1, 1, 1, cols.length).getValues()[0];
  if (JSON.stringify(head) === JSON.stringify(cols)) return;
  if (sh.getLastRow() === 0) { sh.appendRow(cols); return; }
  sh.insertRowBefore(1);
  sh.getRange(1, 1, 1, cols.length).setValues([cols]);
}

function readConfig() {
  const out = {};
  const values = sheet('Config').getDataRange().getValues();
  for (let i = 1; i < values.length; i++) if (values[i][0]) out[values[i][0]] = values[i][1];
  return out;
}

function pad2(n) { const s = String(n); return s.length === 1 ? '0' + s : s; }

function dateToText(v) {
  if (!(v instanceof Date)) return v;
  return v.getFullYear() + '-' + pad2(v.getMonth() + 1) + '-' + pad2(v.getDate());
}

function timeToText(v) {
  if (!(v instanceof Date)) return v;
  return pad2(v.getHours()) + ':' + pad2(v.getMinutes());
}

function rowToObject(r) {
  return { id:r[0], date:dateToText(r[1]), time:timeToText(r[2]), recharge:Number(r[3])||0, description:r[4], remark:r[5],
           balance:Number(r[6])||0, charges:Number(r[7])||0, enteredBy:r[8], editedBy:r[9],
           updatedAt:(r[10] instanceof Date) ? r[10].toISOString() : r[10] };
}
function objectToRow(o) {
  return [o.id,o.date,o.time,o.recharge,o.description,o.remark,o.balance,o.charges,o.enteredBy,o.editedBy,o.updatedAt];
}
function readLogRows() {
  const values = sheet('Log').getDataRange().getValues();
  return values.slice(1).filter(function (r) { return r[0]; }).map(rowToObject);
}

// One-shot import of the historical log from a `Seed` tab (see data/logbook-seed.csv).
// Idempotent: a row is skipped when Date+Time+Balance already exist in `Log`, so the
// function can be re-run safely. Entries go through appendLogRow, so each gets a Row ID,
// an Audit row (Action=create) and Entered By="Imported".
function importSeed() {
  const sh = SpreadsheetApp.getActive().getSheetByName('Seed');
  if (!sh) throw new Error("No 'Seed' tab. Create a tab named exactly Seed and paste data/logbook-seed.csv into it (row 1 = headers).");
  const parsed = parseSeedRows(sh.getDataRange().getValues());
  const seen = {};
  readLogRows().forEach(function (r) { seen[r.date + '|' + r.time + '|' + r.balance] = true; });
  let added = 0, skipped = 0;
  parsed.good.forEach(function (v) {
    const key = v.date + '|' + v.time + '|' + v.balance;
    if (seen[key]) { skipped++; return; }
    appendLogRow(v, 'Imported');
    seen[key] = true;
    added++;
  });
  const msg = 'importSeed: added ' + added + ', skipped ' + skipped +
    ', invalid ' + parsed.bad.length + (parsed.bad.length ? ' -- ' + parsed.bad.join('; ') : '');
  Logger.log(msg);
  return msg;
}

function todayDhaka() {
  const tz = 'Asia/Dhaka';
  return {
    date: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd'),
    time: Utilities.formatDate(new Date(), tz, 'HH:mm')
  };
}

function nextRowId_(year) {
  const props = PropertiesService.getScriptProperties();
  const key = 'counter_' + String(year).slice(-2);
  const next = (Number(props.getProperty(key)) || 0) + 1;
  props.setProperty(key, String(next));
  return formatRowId(year, next);
}

function appendLogRow(value, enteredBy) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const id = nextRowId_(Number(value.date.slice(0, 4)));
    const row = {
      id: id, date: value.date, time: value.time,
      recharge: value.recharge, description: value.description, remark: value.remark,
      balance: value.balance, charges: value.charges,
      enteredBy: enteredBy || '', editedBy: '', updatedAt: new Date().toISOString()
    };
    sheet('Log').appendRow(objectToRow(row));
    writeAudit('create', id, enteredBy || '', null, row);
    return row;
  } finally {
    lock.releaseLock();
  }
}

function updateLogRow(id, value, editedBy) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet('Log');
    const values = sh.getDataRange().getValues();
    let idx = -1;
    for (let i = 1; i < values.length; i++) if (values[i][0] === id) { idx = i + 1; break; }
    if (idx < 0) return null;
    const before = rowToObject(values[idx - 1]);
    const after = {
      id: id, date: value.date, time: value.time,
      recharge: value.recharge, description: value.description, remark: value.remark,
      balance: value.balance, charges: value.charges,
      enteredBy: before.enteredBy, editedBy: editedBy || before.editedBy || '',
      updatedAt: new Date().toISOString()
    };
    sh.getRange(idx, 1, 1, LOG_COLUMNS.length).setValues([objectToRow(after)]);
    writeAudit('edit', id, editedBy || '', before, after);
    return after;
  } finally {
    lock.releaseLock();
  }
}

function writeAudit(action, id, by, before, after) {
  sheet('Audit').appendRow([new Date(), id, action, by, JSON.stringify(before), JSON.stringify(after)]);
}

function deleteLogRow(id) {
  const sh = sheet('Log');
  const values = sh.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) { sh.deleteRow(i + 1); return true; }
  }
  return false;
}

function testSheetIo() {
  const auditSh = sheet('Audit');
  const auditBase = auditSh.getLastRow();
  const tz = todayDhaka();
  const ra = appendLogRow(validateEntry({ date:'2026-01-05', time:'09:00', balance:9000 }, tz).value, 'test');
  const rb = appendLogRow(validateEntry({ date:'2026-01-06', time:'09:00', balance:8861 }, tz).value, 'test');
  Logger.log('append ok ' + ra.id + ' ' + rb.id);
  Logger.log('readback ok ' + readLogRows().length);
  const bb = computeRows(readLogRows(), { plausThreshold:5000 }).filter(function (r) { return r.id === rb.id; })[0];
  Logger.log('chain ok ' + (bb.consumption === 139));
  updateLogRow(rb.id, validateEntry({ date:'2026-01-04', time:'09:00', balance:8861 }, tz).value, 'test');
  const aa = computeRows(readLogRows(), { plausThreshold:5000 }).filter(function (r) { return r.id === ra.id; })[0];
  Logger.log('date-move recompute ok ' + (aa.consumption === -139));
  Logger.log('audit rows written: ' + (auditSh.getLastRow() - auditBase));
  deleteLogRow(ra.id);
  deleteLogRow(rb.id);
  while (auditSh.getLastRow() > auditBase) auditSh.deleteRow(auditSh.getLastRow());
}
