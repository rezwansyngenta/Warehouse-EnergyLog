# Warehouse Energy Log Book

Digital successor to the paper daily electricity log book at the Syngenta Chittagong
warehouse: a guard phone app and a management dashboard, backed by a Google Sheet.

## Layout

| Path | What |
| --- | --- |
| `backend/` | Google Apps Script JSON API + deployment runbook ([`backend/README.md`](backend/README.md)) |
| `data/logbook-seed.csv` | Historical readings (Aug 11 – Oct 10 2026) for one-off import |
| `tools/export_xlsx.py` | Regenerates the seed CSV from the monthly workbook |
| `preview/` | Static design prototypes (guard + dashboard) |

## Quick start

See [`backend/README.md`](backend/README.md): create the Sheet, paste `backend/Code.gs`
into the Apps Script editor, run `setup` and `setPin`, deploy as a Web App, then load the
history with `importSeed`.

## Status

- **Backend:** implemented; 32 local tests green (`node --test "backend/test/*.test.js"`).
  Google-side setup and live verification pending.
- **Front end:** static prototypes only; not yet wired to the API.
