"""League logic shared by the post scripts — one definition, so every post agrees.

The Game of the Week is scored here and recorded once (scripts/game-of-the-week.py);
nothing else should pick its own.
"""
import json, re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REGULAR_SEASON = 14

def award_winners():
    """The weekly bonus winners recorded on the homepage (index.html BH_AWARD_WINNERS):
    {week: [manager, ...]} — more than one manager when the award was tied."""
    s = (ROOT / "index.html").read_text()
    m = re.search(r"window\.BH_AWARD_WINNERS=\{(.*?)\};", s)
    if not m: raise SystemExit("index.html: BH_AWARD_WINNERS not found")
    out = {}
    for wk, who in re.findall(r'(\d+)\s*:\s*\{\s*who\s*:\s*"([^"]*)"', m.group(1)):
        out[int(wk)] = [x.strip() for x in re.split(r"\s*(?:&|,|\band\b)\s*", who) if x.strip()]
    return out

def bonus_bank(amount=9):
    """Dollars each manager has won from weekly bonuses, from the recorded winners.
    A tied award splits the pot evenly (Jason's ruling, Sept 2026)."""
    bank = {}
    for wk, who in award_winners().items():
        for m in who: bank[m] = round(bank.get(m, 0) + amount / len(who), 2)
    return {m: (int(v) if v == int(v) else v) for m, v in bank.items()}

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

def _odds():
    """data/numbers/odds.json baseline {manager: {playoffs, last, ...}}, or {} before it exists."""
    try: return json.loads((ROOT / "data" / "numbers" / "odds.json").read_text()).get("baseline") or {}
    except (FileNotFoundError, ValueError): return {}

def _streak(a, b):
    """The longest current head-to-head run: (winner, games) — e.g. Erick has won all 7."""
    h = json.loads((ROOT / "data" / "history.json").read_text())
    code = {v: k for k, v in h["managers"].items()}
    rec = h["profiles"].get(code.get(a, ""), {}).get("vs", {}).get(b) or {}
    w, l = rec.get("w", 0), rec.get("l", 0)
    if w and not l: return a, w
    if l and not w: return b, l
    return None, 0

def recent_gotw(week, back=3):
    """Managers in the last few recorded Games of the Week, most recent first."""
    v = json.loads((ROOT / "data" / "voices.json").read_text())
    past = sorted((g for g in v.get("gotw", []) if int(g["week"]) < int(week)), key=lambda g: -int(g["week"]))
    return [m for g in past[:back] for m in (g["a"], g["b"])]

def watchability(week, mu, ranks, cut=6, n=12):
    """How much a matchup deserves Game of the Week, and why. Jason's ruling (Oct 2026):
    standings and storylines, not projected closeness — first vs second matters, and late in
    the year so does last vs second-to-last, because last place runs the Beer Mile.

    stakes   the biggest of: first place on the line (both at or near the top), the Beer
             Mile bowl (both likely to finish last, from the Hard Numbers odds), the playoff
             line (both near the cut, odds near a coin flip). Counts from Week 2 and grows.
    rivalry  an even, well-worn series — or a one-sided streak someone wants to end
    quality  both teams high in the standings
    close    projected margin — a tiebreaker now, not the reason
    fresh    a penalty for managers who were in the last three Games of the Week, so it
             doesn't keep landing on the same teams
    """
    a, b = mu["a"], mu["b"]
    A, B = a["m"], b["m"]
    ra, rb = ranks.get(A, n), ranks.get(B, n)
    odds = _odds()
    oa, ob = odds.get(A, {}), odds.get(B, {})
    top = lambda r: max(0.0, (5 - r) / 4)                                    # ranks 1-4
    races = {"First place on the line": (top(ra) * top(rb)) ** .5 * (1.15 if {ra, rb} == {1, 2} else 1)}
    if oa and ob:
        # both likely to finish last: the punishment game
        races["Beer Mile bowl"] = min(1.0, 2.2 * (oa.get("last", 0) * ob.get("last", 0)) ** .5 + .25 * ((ra >= n - 1) and (rb >= n - 3)))
        coin = lambda o: max(0.0, 1 - abs(o.get("playoffs", 0) - .5) * 2)   # 1 at 50%, 0 at 0 or 100
        races["The playoff line"] = (coin(oa) * coin(ob)) ** .5
    else:
        bottom = lambda r: max(0.0, (r - (n - 3)) / 3)
        bubble = lambda r: max(0.0, 1 - abs(r - (cut + .5)) / 3)
        races["Beer Mile bowl"] = (bottom(ra) * bottom(rb)) ** .5
        races["The playoff line"] = (bubble(ra) * bubble(rb)) ** .5
    race, stakes = max(races.items(), key=lambda kv: kv[1])
    ramp = 0.0 if int(week) <= 1 else min(1.0, .45 + .55 * (int(week) - 2) / (REGULAR_SEASON - 2))

    w, l, t = series_rec(A, B); g = w + l + t
    even = (1 - abs(w - l) / g) * min(g / 8, 1) if g else 0.0
    who, run = _streak(A, B)
    streak = min(1.0, run / 7) if run >= 4 else 0.0
    rivalry = max(even, streak)
    quality = 1 - ((ra + rb) / 2 - 1) / (n - 1)
    close = max(0.0, 1 - abs(a["p"] - b["p"]) / 30)
    seen = recent_gotw(week)
    fresh = -.18 * sum(1 for m in (A, B) if m in seen[:2]) - .08 * sum(1 for m in (A, B) if m in seen[2:])

    parts = {"stakes": .70 * ramp * stakes, "rivalry": .30 * rivalry, "quality": .20 * quality, "close": .12 * close}
    why = max(parts, key=parts.get)
    reason = {"stakes": race,
              "rivalry": ("%s has won all %d" % (who, run)) if streak >= even else "Rivalry · %s" % series(A, B),
              "quality": "Top of the table",
              "close": "Projected within %.1f" % abs(a["p"] - b["p"])}[why]
    return sum(parts.values()) + fresh, reason
