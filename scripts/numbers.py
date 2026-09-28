#!/usr/bin/env python3
"""Build the Hard Numbers page's data: one JSON file per tab, from the Yahoo archive.

    scripts/numbers.py              # every tab
    scripts/numbers.py pine odds    # just these

Each tab is a module in scripts/hn/<tab>.py with a build() that reads the archive
(data/archive/<season>.json), data/record.json and friends through scripts/hn/_common.py,
writes data/numbers/<tab>.json, and returns a one-line summary. The page's tab module,
numbers/<tab>.js, renders that file. The scoreboard routine runs this after each week
goes final (run D), once the archive has the week.
"""
import importlib, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

def main():
    want = sys.argv[1:]
    tabs = sorted(p.stem for p in (ROOT / "scripts" / "hn").glob("*.py") if not p.stem.startswith("_"))
    if want:
        unknown = [w for w in want if w not in tabs]
        if unknown: sys.exit("numbers: no tab module for %s (have: %s)" % (", ".join(unknown), ", ".join(tabs)))
        tabs = want
    failed = 0
    for t in tabs:
        try:
            print("%-10s %s" % (t, importlib.import_module("hn." + t).build() or "ok"))
        except Exception as e:
            failed += 1
            print("%-10s FAILED: %s" % (t, e), file=sys.stderr)
    if failed: sys.exit(1)

if __name__ == "__main__":
    main()
