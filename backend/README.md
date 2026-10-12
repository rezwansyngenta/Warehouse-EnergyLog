# Backend — Google Sheet + Apps Script

JSON API for the Daily Electricity Log Book.

- **Source of truth:** one Google Sheet with `Log`, `Audit`, `Config` tabs.
- **Server:** a **container-bound** Apps Script project (`Code.gs`) deployed as a Web App.
- **Access:** reads and writes are **open** — no PIN, no login (the earlier PIN gate was removed).
- **Derived values** (`Consumption`, `Cumulative`, `Recharge Day`, `Flag`) are computed on
  every read and never stored.

Plan: `C:\Users\s1408765\.opencode\plan\daily-electricity-logbook-backend-plan.md`
Spec: `C:\Users\s1408765\.opencode\plan\daily-electricity-logbook-design.md` (Backend section).

## Local tests

Pure logic (consumption chain, validation, Row ID, seed import) is
dependency-free and runs under Node 18+. The front-end mapping layer in `preview/api.js`
is covered the same way:

```
node --test "backend/test/*.test.js" "preview/test/*.test.js"
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
5. **Deploy.** **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - **Deploy**, authorise, and copy the **`/exec` URL**.
6. **Verify transport.** Open `backend/probe.html` in Chrome, paste the `/exec` URL.
   Expect:
   ```
   GET  ping  {"ok":true,"version":1}
   POST ping  {"ok":true,"pong":true}
   GET  rows  {"ok":true,"version":1,"guardName":"Guard","timezone":"Asia/Dhaka","plausThreshold":5000,"rows":[]}
   ```
   If the `POST ping` line reads `FAIL`, the `text/plain` transport is blocked — stop and
   report it (fallback: JSONP GET for reads + POST-then-confirm for writes).
7. **Verify Sheet I/O.** In the editor **Run → `testSheetIo`** and read the Execution log:
   it must print `append ok …`, `readback ok …`, `chain ok true`, `date-move recompute ok true`,
   `audit rows written: 3`, and leave the `Log` and `Audit` tabs clean.
8. **Wire the front end.** Put the `/exec` URL into the front-end config as a single constant
   (front-end wiring is its own task/plan).

## Load the historical log (one-off, browser only)

`data/logbook-seed.csv` holds the **Aug 11 – Oct 10 2026** readings transcribed from the
paper log book. It keeps only the raw columns the guard writes; `Consumption` and
`Cumulative` are recomputed on every read and are therefore **never** seeded. Regenerate
the CSV from the monthly workbook with:

```
python tools/export_xlsx.py "Last 3 Month Log Book.xlsx"
```

1. In the Sheet add a temporary tab named exactly `Seed`.
2. Open `data/logbook-seed.csv`, copy everything (header row included) and paste into `Seed!A1`.
   Sheets may coerce `Date`/`Time` into real dates/times — the importer normalises them **provided**
   both time zones are `Asia/Dhaka` (steps 1–2). To avoid the coercion entirely, select `Seed!B:C`
   and set **Format → Number → Plain text** before pasting.
3. In the Apps Script editor **Run → `importSeed`**, then read the Execution log:
   `importSeed: added 69, skipped 0, invalid 0`.
4. Check the `Log` tab: 69 rows with `Row ID` `WH-260001`… and `Entered By` = `Imported`;
   the `Audit` tab has 69 `create` rows.
5. Delete the `Seed` tab.

**If a row comes back `invalid …: time`:** Sheets stripped the leading zero on that
paste — `09:32` became `9:32`. The importer now normalises this, but the *current* `Seed`
tab data was already read once. Just re-run `importSeed` after pasting the fixed
`Code.gs`: it is idempotent, so rows already in `Log` (28 here) are skipped and the rest
complete the set — expect `added 41, skipped 28, invalid 0` the second time.

The import is **idempotent** — re-running skips any row whose `Date`+`Time`+`Balance`
is already in `Log`.

### Expected result

- 69 readings, 8 recharge rows, total consumption **BDT 201,998**, no negative days.
- A recharge row carries **no consumption of its own** (the paper log leaves that cell blank):
  it records the top-up and the meter balance shown after it. Every normal entry is charged
  the drop since the previous entry - which may be a recharge row, whose balance already
  includes the top-up. Month/YTD consumption is therefore the sum of the daily values.
- 5 rows trip the placeholder `PlausThreshold` of 5000: `08-15, 09-01, 09-15, 09-24, 10-01`.
  These are genuine large gaps in the paper data (mostly on or just after recharge days),
  **not** computation errors. Raise `PlausThreshold` in `Config` to ~8000–10000 once real
  usage is confirmed.

## API

- `GET ?action=ping` → `{ok:true, version}`
- `GET ?action=rows` → `{ok:true, version, guardName, timezone, plausThreshold, rows:[…]}`
  (rows carry the derived `consumption`, `cumulative`, `rechargeDay`, `flag`; a recharge row
  has `consumption: 0` and no flag).
- `POST` with a JSON body sent as **`text/plain`**, where the body is
  `{action:"add"|"edit", …}`:
  - `add` — `{action:"add", date?, time?, recharge, balance, description, remark, charges}`
  - `edit` — `{action:"edit", id, date?, time?, recharge, balance, description, remark, charges}`
- Every response is HTTP 200 with `{ok:true,…}` or `{ok:false, error:"…"}`.
  There is no locking: any visitor is free to add or edit (safety net is the `Audit` tab
  and the daily backup).

## Changing the backend later

Paste the new `backend/Code.gs` into the editor, then **Deploy → Manage deployments → edit →
Version: New version → Deploy**. The `/exec` URL stays the same.

## Script Properties

The per-year Row ID counters (`counter_YY`) live in **Script Properties** only. The former
`PinSalt`/`PinHash`/`RLState` entries are vestigial — the PIN gate was removed, and nothing
reads or writes them anymore. Nothing goes into the repo besides code.
