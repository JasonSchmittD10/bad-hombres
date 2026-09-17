#!/usr/bin/env python3
"""Keep the league record current: one game log in, every derived view out.

    scripts/build-history.py add-week                    # append the final week in data/week.json, then build
    scripts/build-history.py add-week --from FILE --season 2026   # same, from a saved week.json (backfill)
    scripts/build-history.py build                       # rebuild history.json + the Record Book page
    scripts/build-history.py build --exclude-current --out FILE   # completed seasons only (regression check)

data/record.json is the source of truth: every regular-season game of every
season as [code, score, code, score] by week, plus playoff games, finishes,
champions, team names, drafts and brackets. A season still being played is
named in "current" and has games and team names but no finishes or champion.

From it this builds:
  data/history.json   member profiles — career record, scoring, weekly high
                      scores, weeks atop the standings, best/worst games,
                      biggest blowout, season table, playoffs, head-to-head
                      and league ranks. Hand-written fields (name, full, bio,
                      team, tags, medals) are carried over untouched.
  record/index.html   the Record Book's embedded DATA, which the page turns
                      into the ledger, head-to-head explorer and records.

Rules (reproduce the 2021-25 numbers the profiles launched with, exactly):
  record, win %, averages, weekly highs, weeks #1   regular season only
  high / low / blowout / head-to-head               regular season + playoffs
  weeks #1        after each week, sorted by wins (ties half) then points for
  ranks           1 = best (points against: lowest is best); ties keep the
                  order of the "managers" table
  season finish   from "place"; the in-progress season shows none
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REC, HIST, PAGE = ROOT / "data" / "record.json", ROOT / "data" / "history.json", ROOT / "record" / "index.html"
EDITORIAL = ("name", "full", "bio", "team", "tags", "medals")

def die(msg):
    print("build-history: " + msg, file=sys.stderr); sys.exit(1)

def load(p): return json.loads(Path(p).read_text())

# ---------------------------------------------------------------- the rules
def compute(D):
    M, ORDER = D["managers"], D["order"]
    years = [str(y) for y in D["years"]]
    done = [y for y in years if y in D.get("place", {})]
    reg = {c: [] for c in ORDER}                  # (year, week, score, opp, opp score)
    po = {c: [] for c in ORDER}
    for y in years:
        for wi, wk in enumerate(D["weeks"].get(y, [])):
            for a, sa, b, sb in wk:
                reg[a].append((y, wi, sa, b, sb)); reg[b].append((y, wi, sb, a, sa))
        for a, sa, b, sb, lab in D.get("playoffs", {}).get(y, []):
            po[a].append((y, lab, sa, b, sb)); po[b].append((y, lab, sb, a, sa))

    # weekly high scores and weeks atop the standings, per manager
    highs = {c: 0 for c in ORDER}; tops = {c: 0 for c in ORDER}
    for y in years:
        rec = {c: [0.0, 0.0] for c in ORDER}
        for wk in D["weeks"].get(y, []):
            best = max(max(g[1], g[3]) for g in wk)
            for a, sa, b, sb in wk:
                if sa == best: highs[a] += 1
                if sb == best: highs[b] += 1
                rec[a][1] += sa; rec[b][1] += sb
                if sa > sb: rec[a][0] += 1
                elif sb > sa: rec[b][0] += 1
                else: rec[a][0] += .5; rec[b][0] += .5
            tops[sorted(ORDER, key=lambda c: (-rec[c][0], -rec[c][1]))[0]] += 1

    prof = {}
    for c in ORDER:
        G, P = reg[c], po[c]; A = G + P
        if not G: die("no regular-season games for %s" % c)
        w = sum(g[2] > g[4] for g in G); l = sum(g[2] < g[4] for g in G); t = len(G) - w - l
        p = {"w": w, "l": l, "t": t, "g": len(G), "pct": round((w + .5 * t) / len(G), 3),
             "avg": round(sum(g[2] for g in G) / len(G), 2), "avgPa": round(sum(g[4] for g in G) / len(G), 2),
             "highs": highs[c], "weeksTop": tops[c]}
        hi, lo = max(A, key=lambda g: g[2]), min(A, key=lambda g: g[2])
        p["high"] = {"v": hi[2], "y": int(hi[0]), "opp": M[hi[3]]}
        p["low"] = {"v": lo[2], "y": int(lo[0]), "opp": M[lo[3]]}
        wins = [g for g in A if g[2] > g[4]]
        b = max(wins, key=lambda g: g[2] - g[4]) if wins else None
        p["blowout"] = {"v": round(b[2] - b[4], 2), "y": int(b[0]), "opp": M[b[3]]} if b else None
        seasons = []
        for y in reversed(years):
            Gy = [g for g in G if g[0] == y]
            if not Gy: continue
            row = {"y": int(y), "w": sum(g[2] > g[4] for g in Gy), "l": sum(g[2] < g[4] for g in Gy),
                   "t": sum(g[2] == g[4] for g in Gy), "avg": round(sum(g[2] for g in Gy) / len(Gy), 2),
                   "pa": round(sum(g[4] for g in Gy) / len(Gy), 2), "finish": None, "po": None}
            if y in done:
                f = D["place"][y].index(c) + 1
                row["finish"], row["po"] = f, f <= 6
            seasons.append(row)
        p["season"] = seasons
        p["playoff"] = {"app": len({g[0] for g in P}), "w": sum(g[2] > g[4] for g in P), "l": sum(g[2] < g[4] for g in P),
                        "avg": round(sum(g[2] for g in P) / len(P), 2) if P else 0,
                        "high": {"v": max(g[2] for g in P)} if P else None, "low": {"v": min(g[2] for g in P)} if P else None,
                        "trophies": {str(k): sum(D["place"][y].index(c) + 1 == k for y in done) for k in (1, 2, 3)}}
        vs = {}
        for g in A:
            v = vs.setdefault(M[g[3]], {"w": 0, "l": 0, "t": 0})
            v["w" if g[2] > g[4] else "l" if g[2] < g[4] else "t"] += 1
        p["vs"] = {k: vs[k] for k in sorted(vs)}
        prof[c] = p

    better = {"pct": lambda p: p["pct"], "highs": lambda p: p["highs"], "weeksTop": lambda p: p["weeksTop"],
              "avg": lambda p: p["avg"], "avgPa": lambda p: -p["avgPa"], "high": lambda p: p["high"]["v"],
              "low": lambda p: p["low"]["v"], "blowout": lambda p: p["blowout"]["v"] if p["blowout"] else float("-inf")}
    # ties keep the order of the managers table (Jason, Tola, Drew, David, …) — the order
    # the launch ranks used; not D["order"], which is a different ordering
    tie_order = list(M)
    for c in ORDER: prof[c]["rank"] = {}
    for k, f in better.items():
        for i, c in enumerate(sorted(tie_order, key=lambda c: -f(prof[c]))):
            prof[c]["rank"][k] = i + 1
    return done, prof

def history(D, old):
    done, prof = compute(D)
    out = {"years": done, "managers": D["managers"], "fullNames": D["fullNames"],
           "order": old.get("order", sorted(D["order"])), "current": D.get("current")}
    out["profiles"] = {}
    for c in (old.get("order") or sorted(D["order"])):
        keep = {k: v for k, v in old.get("profiles", {}).get(c, {}).items() if k in EDITORIAL}
        p = dict(prof[c]); p.update(keep)
        # field order as the profiles launched with
        out["profiles"][c] = {k: p[k] for k in ("name", "w", "l", "t", "g", "pct", "avg", "avgPa", "highs", "weeksTop",
                                                 "high", "low", "blowout", "season", "playoff", "vs", "rank")
                              if k in p} | {k: p[k] for k in ("bio", "team", "tags", "full", "medals") if k in p}
    return out

# ---------------------------------------------------------------- outputs
def write_page(D):
    s = PAGE.read_text()
    i = s.index("const DATA = ") + len("const DATA = ")
    j = s.index(";\nconst D = DATA;", i)
    new = s[:i] + json.dumps(D, separators=(",", ":")) + s[j:]
    if new != s: PAGE.write_text(new)
    return new != s

def build(D, exclude_current=False, out=None):
    if exclude_current and D.get("current"):
        cur = D["current"]
        D = json.loads(json.dumps(D))
        D["years"] = [y for y in D["years"] if str(y) != cur]
        for key in ("weeks", "teams"): D[key].pop(cur, None)
        D.pop("current")
    old = load(HIST) if HIST.exists() else {}
    H = history(D, old)
    text = json.dumps(H, indent=2, ensure_ascii=False) + "\n"
    target = Path(out) if out else HIST
    target.write_text(text)
    if not out:
        changed = write_page(D)
        print("history.json rebuilt; Record Book page %s" % ("updated" if changed else "unchanged"))
    return H

def add_week(D, src, season):
    w = load(src)
    if w.get("status") != "final": die("week %s in %s is not final (status %r)" % (w.get("week"), src, w.get("status")))
    cur = D.get("current") or season
    if not cur: die("no season in progress in record.json — pass --season YYYY to start one")
    if D.get("current") and season and season != D["current"]: die("record.json is tracking %s, not %s" % (D["current"], season))
    if cur in D.get("place", {}): die("season %s is already finished in record.json" % cur)
    code = {name: c for c, name in D["managers"].items()}
    n = int(w["week"]); ms = w.get("matchups") or []
    if len(ms) != 6: die("expected 6 matchups, found %d" % len(ms))
    games, teams = [], {}
    for mu in ms:
        a, b = mu["a"], mu["b"]
        for t in (a, b):
            if t["m"] not in code: die("unknown manager %r" % t["m"])
            if not isinstance(t.get("s"), (int, float)): die("missing score for %s" % t["m"])
            teams[code[t["m"]]] = t["t"]
        games.append([code[a["m"]], round(float(a["s"]), 2), code[b["m"]], round(float(b["s"]), 2)])
    if len({g[0] for g in games} | {g[2] for g in games}) != 12: die("expected 12 distinct managers")

    D["current"] = cur
    if int(cur) not in D["years"] and cur not in [str(y) for y in D["years"]]: D["years"].append(int(cur))
    weeks = D["weeks"].setdefault(cur, [])
    if len(weeks) >= n:
        if weeks[n - 1] == games: print("week %d of %s is already recorded — nothing to add" % (n, cur)); return False
        print("week %d of %s was recorded with different scores — replacing (stat corrections)" % (n, cur))
        weeks[n - 1] = games
    elif len(weeks) == n - 1:
        weeks.append(games); print("added week %d of %s" % (n, cur))
    else:
        die("record.json has %d weeks of %s; can't add week %d without the ones before it" % (len(weeks), cur, n))
    D.setdefault("teams", {}).setdefault(cur, {}).update(teams)
    return True

def main():
    a = sys.argv[1:]
    cmd = a[0] if a else ""
    opt = lambda k: a[a.index(k) + 1] if k in a else None
    if not REC.exists(): die("no %s" % REC)
    D = load(REC)
    if cmd == "build":
        build(D, "--exclude-current" in a, opt("--out"))
    elif cmd == "add-week":
        if add_week(D, opt("--from") or ROOT / "data" / "week.json", opt("--season")):
            REC.write_text(json.dumps(D, separators=(",", ":")) + "\n")
        build(D)
    else:
        sys.exit(__doc__)

if __name__ == "__main__":
    main()
