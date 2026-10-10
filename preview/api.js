/* Shared data layer for the Chittagong warehouse log book.
   Loaded by guard.html and dashboard.html. This file holds the API URL and the read/write
   calls and nothing else - no secret, no readings. Reads and writes are open: the server
   keeps no PIN and no login (see backend/Code.gs). */

const API_BASE = 'https://script.google.com/macros/s/AKfycbxFHUx-SZkpYzx01qde1qMfjcPlyqrDCNO4OcBM2vhKobrmY0a_9-dpCNZsgZW7O-5Tjw/exec';

/* GET ?action=rows -> { ok, version, guardName, timezone, plausThreshold, rows }.
   Consumption, cumulative and flags arrive calculated - the screens never recompute them. */
async function apiRows() {
  const res = await fetch(API_BASE + '?action=rows', { redirect: 'follow' });
  let body = null;
  try { body = await res.json(); } catch (e) { /* fall through to the error below */ }
  if (!body || body.ok !== true) throw new Error((body && body.error) || 'Could not read the log');
  return body;
}

/* POST a JSON body as text/plain (skips the CORS preflight). Always resolves with the
   parsed body - the caller checks .ok. Never auto-retried: a write that fails is
   "unknown" until the guard looks at the log (design X3). */
async function apiPost(payload) {
  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (e) {
    return { ok: false, error: 'network' };
  }
}

/* Message shown to the person when a write is refused. */
function saveError(res) {
  const e = String((res && res.error) || '');
  if (e === 'not found') return 'That reading was not found - reload and try again.';
  return 'Not saved - ' + (e || 'check the connection and try again.');
}

/* ---------- row mapping: server rows -> the shape the screens render ---------- */
function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

function mapRows(rows) {
  return (rows || []).map(r => ({
    id: r.id,
    date: parseDay(r.date),
    time: r.time,
    recharge: Number(r.recharge) || 0,
    charges: Number(r.charges) || 0,
    balance: Number(r.balance) || 0,
    consumption: Number(r.consumption) || 0,
    cumulative: Number(r.cumulative) || 0,
    description: r.description || '—',
    remark: r.remark || '—',
    flag: r.rechargeDay ? 'recharge' : (r.flag ? 'check' : ''),
    enteredBy: r.enteredBy || '',
    editedBy: r.editedBy || '',
    updatedAt: r.updatedAt || ''
  })).filter(r => r.date);
}

/* The server runs on Asia/Dhaka. Mirror its clock so the date/time shown before a save
   match what the server will store. */
function dhakaNow() {
  try { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })); }
  catch (e) { return new Date(); }
}
