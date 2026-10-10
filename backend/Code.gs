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
