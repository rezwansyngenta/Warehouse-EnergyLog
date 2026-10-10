function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, probe: 'get' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true, probe: 'post',
      type: e.postData && e.postData.type,
      got: e.postData && e.postData.contents
    }))
    .setMimeType(ContentService.MimeType.JSON);
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('date');
  const time = input.time || now.time;
  if (!/^\d{2}:\d{2}$/.test(time)) errors.push('time');
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

function pinDigest(salt, pin, sha256Hex) {
  return sha256Hex(String(salt) + String(pin));
}

function registerFailure(state, nowMs, cfg) {
  const s = state || { failures: 0, firstFailureMs: 0, lockedUntilMs: 0 };
  if (isBlocked(s, nowMs)) return s;
  let failures, firstFailureMs;
  if (!s.firstFailureMs || nowMs - s.firstFailureMs > cfg.windowMs) {
    failures = 1; firstFailureMs = nowMs;
  } else {
    failures = s.failures + 1; firstFailureMs = s.firstFailureMs;
  }
  let lockedUntilMs = s.lockedUntilMs;
  if (failures >= cfg.maxFailures) {
    lockedUntilMs = nowMs + cfg.lockoutMs; failures = 0; firstFailureMs = 0;
  }
  return { failures: failures, firstFailureMs: firstFailureMs, lockedUntilMs: lockedUntilMs };
}

function registerSuccess() { return { failures: 0, firstFailureMs: 0, lockedUntilMs: 0 }; }

function isBlocked(state, nowMs) {
  return !!state && state.lockedUntilMs > nowMs;
}

// ---- Apps Script glue (Sheet I/O). No globals are touched at load time. ----

const LOG_COLUMNS = ['Row ID','Date','Time','Recharge','Description','Remark','Balance','Charges','Entered By','Edited By','Updated At'];

function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

function readConfig() {
  const out = {};
  const values = sheet('Config').getDataRange().getValues();
  for (let i = 1; i < values.length; i++) if (values[i][0]) out[values[i][0]] = values[i][1];
  return out;
}

function readSecret(key) { return PropertiesService.getScriptProperties().getProperty(key); }
function writeSecret(key, val) { PropertiesService.getScriptProperties().setProperty(key, val); }

function rowToObject(r) {
  return { id:r[0], date:r[1], time:r[2], recharge:Number(r[3])||0, description:r[4], remark:r[5],
           balance:Number(r[6])||0, charges:Number(r[7])||0, enteredBy:r[8], editedBy:r[9], updatedAt:r[10] };
}
function objectToRow(o) {
  return [o.id,o.date,o.time,o.recharge,o.description,o.remark,o.balance,o.charges,o.enteredBy,o.editedBy,o.updatedAt];
}
function readLogRows() {
  const values = sheet('Log').getDataRange().getValues();
  return values.slice(1).filter(function (r) { return r[0]; }).map(rowToObject);
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
