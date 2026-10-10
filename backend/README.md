# Backend — Google Sheet + Apps Script

JSON API for the Daily Electricity Log Book.

- **Source of truth:** one Google Sheet with `Log`, `Audit`, `Config` tabs.
- **Server:** a **container-bound** Apps Script project (`Code.gs`) deployed as a Web App.
- **Access:** reads are **open**; writes require **one shared PIN**.
- **Derived values** (`Consumption`, `Cumulative`, `Recharge Day`, `Flag`) are computed on
  every read and never stored.

Plan: `C:\Users\s1408765\.opencode\plan\daily-electricity-logbook-backend-plan.md`
Spec: `C:\Users\s1408765\.opencode\plan\daily-electricity-logbook-design.md` (Backend section).

## Local tests

Pure logic (consumption chain, validation, Row ID, PIN rate-limiting, hex helper) is
dependency-free and runs under Node 18+:

```
node --test "backend/test/*.test.js"
```

## First-time setup (browser only — no clasp, no Node needed for the server)

1. **Create the Sheet.** New Google Sheet named `Daily Electricity Log Book`.
   Tabs, exact names: `Log`, `Audit`, `Config`.
   **File → Settings → Time zone → Asia/Dhaka.**
2. **Create the script.** **Extensions → Apps Script**. Rename the project.
   **Project Settings → Time zone → Asia/Dhaka.**
3. **Paste the code.** Replace the default `Code.gs` with `backend/Code.gs` from this repo.
   (Optional: **Project Settings → Show `appsscript.json`** and paste `backend/appsscript.json`.)
4. **Run `setup`.** In the editor pick the `setup` function → **Run**. Authorise when asked.
   This writes the `Config` defaults, adds the `Log` / `Audit` headers if missing, forces
   the `Log` `Date`/`Time`/`Updated At` columns to **plain text** (so Sheets never coerces
   them into real dates), and installs the daily `dailyBackup` trigger.
5. **Set the PIN.** Edit `setPin` to call it with the warehouse PIN, e.g.
   `function setPin_(){ setPin('4821'); }` → **Run**. The PIN itself is never stored; only a
   salted SHA-256 hash goes into Script Properties.
6. **Deploy.** **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, authorise, and copy the **`/exec` URL**.
7. **Verify transport.** Open `backend/probe.html` in Chrome, paste the `/exec` URL.
   Expect:
   ```
   GET  ping  {"ok":true,"version":1}
   POST ping  {"ok":true,"pong":true}
   GET  rows  {"ok":true,"version":1,"guardName":"Guard","timezone":"Asia/Dhaka","plausThreshold":5000,"rows":[]}
   ```
   If the `POST ping` line reads `FAIL`, the `text/plain` transport is blocked — stop and
   report it (fallback: JSONP GET for reads + POST-then-confirm for writes).
8. **Verify Sheet I/O.** In the editor **Run → `testSheetIo`** and read the Execution log:
   it must print `append ok …`, `readback ok …`, `chain ok true`, `date-move recompute ok true`,
   `audit rows written: 3`, and leave the `Log` and `Audit` tabs clean.
9. **Wire the front end.** Put the `/exec` URL into the front-end config as a single constant
   (front-end wiring is its own task/plan).

## API

- `GET ?action=ping` → `{ok:true, version}`
- `GET ?action=rows` → `{ok:true, version, guardName, timezone, plausThreshold, rows:[…]}`
  (rows carry the derived `consumption`, `cumulative`, `rechargeDay`, `flag`).
- `POST` with a JSON body sent as **`text/plain`**, where the body is
  `{action:"add"|"edit", pin, …}`:
  - `add` — `{action:"add", pin, date?, time?, recharge, balance, description, remark, charges}`
  - `edit` — `{action:"edit", pin, id, date?, time?, recharge, balance, description, remark, charges}`
- Every response is HTTP 200 with `{ok:true,…}` or `{ok:false, error:"…"}`.
- A wrong PIN is rate-limited: after `RateLimitMax` (5) failures within `RateLimitWindow`
  (10 min), writes are refused for `RateLimitLockout` (10 min).

## Changing the backend later

Paste the new `backend/Code.gs` into the editor, then **Deploy → Manage deployments → edit →
Version: New version → Deploy**. The `/exec` URL stays the same.

## Secrets

`PinSalt` and `PinHash` (+ the rate-limit `RLState`) live in **Script Properties** only.
They are never written to the Sheet and never committed to the repo.
