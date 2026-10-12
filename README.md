# Warehouse Energy Log Book

Digital successor to the paper daily electricity log book at the Syngenta Chittagong
warehouse: a guard phone app and a management dashboard, backed by a Google Sheet.

## Layout

| Path | What |
| --- | --- |
| `backend/` | Google Apps Script JSON API + deployment runbook ([`backend/README.md`](backend/README.md)) |
| `data/logbook-seed.csv` | Historical readings (Aug 11 – Oct 10 2026) for one-off import |
| `tools/export_xlsx.py` | Regenerates the seed CSV from the monthly workbook |
| `preview/` | Guard app + management dashboard, served on GitHub Pages and wired to the Sheet API |

## Quick start

See [`backend/README.md`](backend/README.md): create the Sheet, paste `backend/Code.gs`
into the Apps Script editor, run `setup`, deploy as a Web App, then load the history with
`importSeed`. Reads and writes are open — there is no PIN to set.

## Status

- **Backend:** implemented; 40 local tests green (`node --test "backend/test/*.test.js" "preview/test/*.test.js"`). Live Web App deployed and reachable (reads and writes open — the PIN gate was removed).
- **Front end:** guard app and dashboard are wired to the live API and verified in a browser from the Pages origin against **live data** — all 69 historical readings imported via `importSeed` (total consumption ৳201,998, 8 recharge days, 0 negatives). Recharge entries carry no consumption, so daily and monthly totals match the warehouse workbook.
