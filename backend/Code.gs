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
