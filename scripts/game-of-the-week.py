#!/usr/bin/env python3
"""Decide and record the week's Game of the Week — once — in data/voices.json.

    scripts/game-of-the-week.py                         # the week in data/week.json (Thursday)
    scripts/game-of-the-week.py --matchups next.json    # Tuesday: next week's matchups from Yahoo

next.json is {"week": N, "matchups": [...]} in the week.json matchup shape
(a/b with m, t, p). Scoring is bh_league.watchability(): projected closeness,
the all-time series, current rankings, and — weighted up as the season goes
on — playoff-bubble, last-place and top-seed stakes.

The pick is LOCKED once recorded. The Tuesday recap's "Looking ahead", the
Thursday iMessage opener, and the Instagram preview (slide 2 and caption) all
read it from voices.json, so they can't highlight different games. A later
run prints the recorded pick and changes nothing; --force re-decides, and
should only be used before anything about that week has been published.
"""
import json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bh_league import ROOT, current_ranks, watchability  # noqa: E402

def die(msg):
    print("game-of-the-week: " + msg, file=sys.stderr); sys.exit(1)

def main():
    args = sys.argv[1:]
    src = Path(args[args.index("--matchups") + 1]) if "--matchups" in args else ROOT / "data" / "week.json"
    d = json.loads(src.read_text())
    week, ms = d.get("week"), d.get("matchups") or []
    if not week or len(ms) != 6: die("need a week number and 6 matchups in %s" % src)
    teams = [t for mu in ms for t in (mu["a"], mu["b"])]
    if any(not isinstance(t.get("p"), (int, float)) for t in teams): die("every team needs a projection (p)")
    if len({t["m"] for t in teams}) != 12: die("expected 12 distinct managers")

    # --voices is for tests; the scheduled tasks always record into the real file
    vp = Path(args[args.index("--voices") + 1]) if "--voices" in args else ROOT / "data" / "voices.json"
    voices = json.loads(vp.read_text())
    picks = voices.setdefault("gotw", [])
    have = next((g for g in picks if str(g["week"]) == str(week)), None)
    if have and "--force" not in args:
        print("Week %s Game of the Week (already decided): %s vs %s — %s" % (week, have["a"], have["b"], have["reason"]))
        return

    season = json.loads((ROOT / "data" / "season.json").read_text())
    ranks = current_ranks(season)
    scored = sorted(((watchability(week, mu, ranks, season.get("playoffCut", 6)), mu) for mu in ms), key=lambda x: -x[0][0])
    for (score, reason), mu in scored:
        print("  %.3f  %s vs %s — %s" % (score, mu["a"]["m"], mu["b"]["m"], reason))
    (score, reason), mu = scored[0]
    pick = {"week": int(week), "a": mu["a"]["m"], "b": mu["b"]["m"], "reason": reason}
    if have: picks.remove(have)
    picks.append(pick)
    vp.write_text(json.dumps(voices, indent=2, ensure_ascii=False) + "\n")
    print("Week %s Game of the Week: %s vs %s — %s  (recorded in %s)" % (week, pick["a"], pick["b"], reason, vp.name if "--voices" in args else "data/voices.json"))

if __name__ == "__main__":
    main()
