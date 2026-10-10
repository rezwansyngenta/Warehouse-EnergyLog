#!/usr/bin/env python3
"""Regenerate data/logbook-seed.csv from the monthly log-book workbook.

Usage:
    python tools/export_xlsx.py ["path/to/Last 3 Month Log Book.xlsx"]

Reads every sheet (one per month), keeps ONLY the raw columns the guard writes
(Date, Time, Recharge Amount, Decription, Balance) and drops the derived
"Daily Consumption" column - the backend recomputes consumption/cumulative on
every read, so it must never be seeded. Output matches the `Seed` tab layout
that backend/Code.gs `importSeed()` expects.
"""
import csv
import datetime
import os
import sys

import openpyxl

DEFAULT_SRC = (
    r"C:\Users\s1408765\OneDrive - Syngenta\Work\Khuchra Kaaj\App Making"
    r"\Daily Electricity Bill Conspumption\Last 3 Month Log Book.xlsx"
)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "logbook-seed.csv")
HEADER = ["Date", "Time", "Recharge", "Description", "Remark", "Balance", "Charges"]


def cell_date(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.strftime("%Y-%m-%d")
    return str(v)[:10] if v else ""


def cell_time(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.strftime("%H:%M")
    return str(v)[:5] if v else ""


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC
    wb = openpyxl.load_workbook(src, data_only=True)
    rows = []
    for ws in wb.worksheets:
        for r in list(ws.iter_rows(values_only=True))[1:]:
            r = (list(r) + [None] * 6)[:6]
            date, time, recharge, desc, balance = r[0], r[1], r[2], r[3], r[4]
            if date is None and balance is None:
                continue  # blank trailing row
            rows.append([
                cell_date(date),
                cell_time(time),
                int(recharge) if recharge else "",
                desc or "",
                "",
                int(balance) if balance is not None else "",
                "",
            ])
    rows.sort(key=lambda x: (x[0], x[1]))

    out = os.path.normpath(OUT)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(HEADER)
        w.writerows(rows)
    print("wrote %d rows -> %s" % (len(rows), out))


if __name__ == "__main__":
    main()
