# Backend — Google Sheet + Apps Script

JSON API for the Daily Electricity Log Book. Source of truth: a Google Sheet
(`Log`, `Audit`, `Config` tabs). Served by a container-bound Apps Script Web App:
**open reads**, **PIN-gated writes**.

Full deployment runbook is written in Task 7. Plan: `../.opencode/plan/daily-electricity-logbook-backend-plan.md`
(see the repo-adjacent `.opencode/plan/` docs).

## Local tests

Pure logic (consumption chain, validation, Row ID, PIN rate-limiting) is dependency-free
and runs under Node:

```
node --test backend/test
```
