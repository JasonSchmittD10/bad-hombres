#!/usr/bin/env python3
"""The Power Lines: the homepage's week-by-week power ranking, data/season.json "ranks".

    scripts/power.py              # rank through the last final week in data/record.json, write "WK N"
    scripts/power.py --week 3     # (re)write one week
    scripts/power.py --dry-run    # print it, write nothing

The ranking is a formula, so it can't be skipped or argued with: every team's weekly score
is played against all eleven others (all-play), and the last three weeks count double, so
it moves with form without forgetting September. Ties go to points for. One entry per
week, {"label": "WK N", "order": [first name, ...]} — rerunning a week replaces its entry.
The "PRE" entry (the preseason ranking) is hand-written and never touched.

Run by the scoreboard routine's run D, after build-history.py add-week.
"""
import json, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RECENT, WEIGHT = 3, 2

def ranking(weeks, names, through):
    """weeks: record.json weeks[season] (list of weeks of [a, as, b, bs]); through: 1-based week."""
    won, games, pf = {}, {}, {}
    for i, wk in enumerate(weeks[:through]):
        w = WEIGHT if i >= through - RECENT else 1
        scores = [(g[0], g[1]) for g in wk] + [(g[2], g[3]) for g in wk]
        for m, s in scores:
            beat = sum(1 for o, t in scores if o != m and t < s) + 0.5 * sum(1 for o, t in scores if o != m and t == s)
            won[m] = won.get(m, 0) + w * beat
            games[m] = games.get(m, 0) + w * (len(scores) - 1)
            pf[m] = pf.get(m, 0) + s
    order = sorted(won, key=lambda m: (-won[m] / games[m], -pf[m]))
    return [names[m] for m in order]

def main():
    a = sys.argv[1:]
    rec = json.loads((ROOT / "data" / "record.json").read_text())
    season = rec["current"]
    weeks = rec["weeks"].get(season) or []
    if not weeks: sys.exit("power: no %s games in data/record.json yet" % season)
    n = int(a[a.index("--week") + 1]) if "--week" in a else len(weeks)
    if not 1 <= n <= len(weeks): sys.exit("power: week %d isn't in data/record.json (it has %d)" % (n, len(weeks)))
    order = ranking(weeks, rec["managers"], n)
    if len(order) != 12: sys.exit("power: ranked %d managers, expected 12" % len(order))
    label = "WK %d" % n
    print("%s: %s" % (label, ", ".join("%d %s" % (i + 1, m) for i, m in enumerate(order))))
    if "--dry-run" in a: print("dry run: nothing written"); return
    path = ROOT / "data" / "season.json"
    s = json.loads(path.read_text())
    ranks = [r for r in s.get("ranks", []) if r.get("label") != label]
    ranks.append({"label": label, "order": order})
    key = lambda r: -1 if r["label"] == "PRE" else int(r["label"].split()[-1]) if r["label"].startswith("WK ") else 99
    s["ranks"] = sorted(ranks, key=key)
    path.write_text(json.dumps(s, indent=1, ensure_ascii=False) + "\n")
    print("wrote data/season.json ranks")

if __name__ == "__main__":
    main()
