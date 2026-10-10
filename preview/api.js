/* Shared data layer for the Chittagong warehouse log book.
   Loaded by guard.html and dashboard.html. This file holds the API URL and the write
   gate and nothing else - no secret, no readings. Reads are open; every write needs the
   warehouse PIN, which the server checks (see backend/Code.gs). */

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

/* ---------- PIN gate: asked on the first write, remembered for the browser session ---------- */
const PIN_KEY = 'logbook-pin';
const storedPin = () => { try { return sessionStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } };
const rememberPin = p => { try { p ? sessionStorage.setItem(PIN_KEY, p) : sessionStorage.removeItem(PIN_KEY); } catch (e) {} };

function pinStyleOnce() {
  if (document.getElementById('pin-style')) return;
  const s = document.createElement('style');
  s.id = 'pin-style';
  s.textContent = [
    '.pinwrap{position:fixed;inset:0;z-index:120;display:grid;place-items:center;background:rgba(0,0,0,.45);padding:20px}',
    '.pinform{width:min(360px,100%);background:var(--surface,#fff);color:var(--text,#111);border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.4)}',
    '.pinform h2{font-size:16px;font-weight:700;margin:0 0 4px}',
    '.pinform p{font-size:12.5px;line-height:1.45;color:var(--text-2,#666);margin:0 0 14px}',
    '.pinform input{width:100%;box-sizing:border-box;font:inherit;font-size:17px;letter-spacing:.12em;padding:12px 14px;border-radius:12px;border:1px solid var(--sep,#ccc);background:var(--bg,#f5f5f7);color:inherit}',
    '.pinform input:focus{outline:none;border-color:var(--brand,#019934);box-shadow:0 0 0 3px rgba(127,222,68,.3)}',
    '.pinrow{display:flex;gap:8px;margin-top:14px}',
    '.pinrow button{flex:1;font:inherit;font-size:14px;font-weight:600;padding:12px;border-radius:12px;cursor:pointer;border:1px solid var(--sep,#ccc);background:transparent;color:inherit}',
    '.pinrow .pinok{background:var(--brand,#019934);border-color:transparent;color:#fff}'
  ].join('');
  document.head.appendChild(s);
}

function pinDialog(message) {
  return new Promise(resolve => {
    pinStyleOnce();
    const wrap = document.createElement('div');
    wrap.className = 'pinwrap';
    wrap.innerHTML =
      '<form class="pinform">' +
        '<h2>Warehouse PIN</h2>' +
        '<p></p>' +
        '<input type="password" inputmode="numeric" autocomplete="off" aria-label="Warehouse PIN">' +
        '<div class="pinrow">' +
          '<button type="button" class="pincancel">Cancel</button>' +
          '<button type="submit" class="pinok">Unlock</button>' +
        '</div>' +
      '</form>';
    wrap.querySelector('p').textContent = message || 'Enter the PIN to save a change.';
    const input = wrap.querySelector('input');
    let done = false;
    const finish = value => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      resolve(value);
    };
    const onKey = e => { if (e.key === 'Escape') finish(''); };
    wrap.querySelector('form').addEventListener('submit', e => { e.preventDefault(); finish(input.value.trim()); });
    wrap.querySelector('.pincancel').addEventListener('click', () => finish(''));
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) finish(''); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    input.focus();
  });
}

/* Attach the PIN and run a write. Asks for the PIN on the first write of the session and
   re-asks once if the server says 'bad pin'. Returns the server body. */
async function apiWrite(payload) {
  let pin = storedPin();
  if (!pin) {
    pin = await pinDialog();
    if (!pin) return { ok: false, error: 'Save cancelled.' };
    rememberPin(pin);
  }
  let body = await apiPost(Object.assign({}, payload, { pin: pin }));
  if (!body.ok && body.error === 'bad pin') {
    rememberPin('');
    pin = await pinDialog('That PIN was not accepted, or saving is paused after too many wrong attempts. Nothing was saved.');
    if (!pin) return { ok: false, error: 'Save cancelled.' };
    rememberPin(pin);
    body = await apiPost(Object.assign({}, payload, { pin: pin }));
  }
  return body;
}

/* Message shown to the person when a write is refused. */
function saveError(res) {
  const e = String((res && res.error) || '');
  if (e === 'bad pin') return 'Wrong PIN - nothing was saved.';
  if (e === 'not found') return 'That reading was not found - reload and try again.';
  if (e === 'Save cancelled.') return e;
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
