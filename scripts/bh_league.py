"""League logic shared by the post scripts — one definition, so every post agrees.

The Game of the Week is scored here and recorded once (scripts/game-of-the-week.py);
nothing else should pick its own.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REGULAR_SEASON = 14

def series_rec(a, b):
    """All-time head-to-head from data/history.json: (a's wins, a's losses, ties)."""
    h = json.loads((ROOT / "data" / "history.json").read_text())
    code = {v: k for k, v in h["managers"].items()}
    rec = h["profiles"].get(code.get(a, ""), {}).get("vs", {}).get(b) or {}
    return rec.get("w", 0), rec.get("l", 0), rec.get("t", 0)

def series(a, b):
    """The all-time series as a sentence."""
    w, l, t = series_rec(a, b)
    if w + l + t == 0: return "First meeting"
    tail = "-%d" % t if t else ""
    if w == l: return "Tied %d-%d%s" % (w, l, tail)
    return "%s leads %d-%d%s" % (a if w > l else b, max(w, l), min(w, l), tail)

def current_ranks(season):
    """1 = best. Standings once games are played (the site's sort), power ranks before."""
    ts = season["teams"]
    if any(t["w"] + t["l"] + t.get("tie", 0) for t in ts):
        order = [t["m"] for t in sorted(ts, key=lambda t: (-(t["w"] + t.get("tie", 0) * .5), -t.get("pf", 0)))]
    else:
        order = (season.get("ranks") or [{}])[-1].get("order") or [t["m"] for t in ts]
    return {m: i + 1 for i, m in enumerate(order)}

def watchability(week, mu, ranks, cut=6, n=12):
    """How much a matchup deserves Game of the Week, and why. Four parts, each 0-1:

    close    projected margin (0 at 30+ points apart)
    rivalry  how even the all-time series is, scaled by how often they've met
    quality  how high both teams sit in the current rankings
    stakes   both on the playoff bubble, both fighting over last (weighted up:
             last place carries the punishment), or both fighting for the top
             seed — scaled by how late in the season it is, so it barely counts
             in week 1 and dominates by week 14
    """
    a, b = mu["a"], mu["b"]
    close = max(0.0, 1 - abs(a["p"] - b["p"]) / 30)
    w, l, t = series_rec(a["m"], b["m"]); g = w + l + t
    rivalry = (1 - abs(w - l) / g) * min(g / 8, 1) if g else 0.0
    ra, rb = ranks.get(a["m"], n), ranks.get(b["m"], n)
    quality = 1 - ((ra + rb) / 2 - 1) / (n - 1)
    bubble = lambda r: max(0.0, 1 - abs(r - (cut + .5)) / 3)       # ranks either side of the cut line
    bottom = lambda r: max(0.0, (r - (n - 3)) / 3)                  # the last three
    top = lambda r: max(0.0, (4 - r) / 3)                           # the top three
    races = {"Playoff bubble": (bubble(ra) * bubble(rb)) ** .5,
             # last place carries the league's punishment, so it outweighs the other races
             "Last-place battle": min(1.0, 1.2 * (bottom(ra) * bottom(rb)) ** .5),
             "Fight for the top seed": (top(ra) * top(rb)) ** .5}
    race, stakes = max(races.items(), key=lambda kv: kv[1])
    late = min(max((int(week) - 1) / (REGULAR_SEASON - 1), 0.0), 1.0)
    parts = {"close": .35 * close, "rivalry": .25 * rivalry, "quality": .20 * quality, "stakes": .60 * late * stakes}
    why = max(parts, key=parts.get)
    reason = {"close": "Projected within %.1f" % abs(a["p"] - b["p"]),
              "rivalry": "Rivalry · %s" % series(a["m"], b["m"]),
              "quality": "Top of the table",
              "stakes": race}[why]
    return sum(parts.values()), reason
