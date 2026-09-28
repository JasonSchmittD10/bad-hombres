"""Draft Vault: every pick since 2021, graded in hindsight -> data/numbers/draft.json.

POINTS are the league's own season: a player's league-scored points over weeks 1..end_week
(1-17), summed from Yahoo's WEEKLY totals: the archived roster points for every week he was
on a roster (they equal Yahoo's weekly totals), Yahoo's weekly stats through the site's
read-only gateway for the rest. Not Yahoo's season totals (the archive's season_points):
those include NFL week 18, which this league never plays, and Yahoo's 2022 and 2023 season
lines leave out stats the weekly lines score (40+ yard bonuses, pick-sixes, DEF return
yards, 2022's lost fumbles). Yahoo won't serve week 18 in a league that ends in week 17, so
the weekly route can only cover the league's own weeks anyway.

The currency is points over replacement (POR), because raw points flatter quarterbacks: in
a 1-QB league the 13th-best QB outscores most running backs, so a late QB "beats" a pick
curve built on raw points without being worth anything to anyone.

  - The POOL for a position: every NFL player Yahoo lists there who scored that season
    (its positional list sorted by season points, paged down to zero), plus everyone in the
    archive. A player counts at every position he was eligible for (Cordarrelle Patterson,
    WR/RB in 2021, is in both).
  - FINISH (WR1, RB12): a drafted player's rank by points at his first-listed position,
    among that pool; ties share the better rank.
  - POR = points minus the replacement player at his position, floored at zero (below
    replacement a player is worth what the waiver wire is: nothing). Replacement = the
    first player past the league's starting lineups: 12 x the starters at the position,
    plus the position's share of the W/R/T flex (from every regular-season flex start in
    the finished seasons), plus one. QB1 RB2 WR2 TE1 K1 DEF1 with the flex going ~73% WR /
    ~25% RB gives QB13 RB28 WR34 TE13 K13 DEF13.
  - EXPECTED for an overall pick = the mean POR of every pick within +/-WINDOW of it in the
    finished seasons, pooled. VALUE = POR - expected.
  - GRADE: a manager's total value as a z-score over the season's twelve totals (population
    SD), in quarter-SD steps from C+ (|z| < 1/8), clamped at A+ and F. The career grade is
    the same ladder applied to a manager's mean z.

The season in progress uses points through its last final week W. Its expected curve is
scaled so the whole draft's expectation equals what it has actually returned: SCALE = the
draft's total POR so far over the curve's total for the same picks. The plain calendar
scale (W / end_week) is kept for the page with the number of managers it would put in the
black: the zero floor pays out more over a short, noisy sample, so early in a season the
calendar flatters nearly everybody. Its points are Yahoo's season-to-date totals when those
equal the weekly sums for every player rostered all season so far (no live week, no missing
stats); otherwise they are rebuilt from weekly totals.

Network: a finished season costs ~300 gateway requests, once. Its drafted players' points
and the pool's points by position are kept in data/numbers/draft.json ("src") and reused
while the archive's draft and rosters for that season are unchanged (a fingerprint);
BH_DRAFT_REFRESH=1 forces a refetch. The season in progress is rebuilt every time: ~30
requests (its positional lists), plus weekly stats if a live week has started.
BH_DRAFT_HTTP_CACHE=<dir> keeps the raw gateway answers on disk (for development). If the
gateway fails, the build fails and the previous draft.json stays as it was.
"""
import hashlib, json, math, os
from collections import Counter, defaultdict

from hn import _common as C

WINDOW = 6
LADDER = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"]
MID = LADDER.index("C+")
STEP = 0.25                    # SD per letter step
POSITIONS = ("QB", "RB", "WR", "TE", "K", "DEF")
PAGE = 25                      # Yahoo's players collection: at most 25 per request
MAX_PAGES = 40                 # per position list; ~10 is the most any season needs
METHOD = 2                     # bump to refetch every cached season
REFRESH = os.environ.get("BH_DRAFT_REFRESH") == "1"


def pos_of(pl):
    return (pl.get("pos") or "?").split(",")[0]


def elig_of(pl):
    at = {p for p in (pl.get("elig") or []) + (pl.get("pos") or "").split(",") if p in POSITIONS}
    return at or {pos_of(pl)}


def letter(z):
    k = int(math.floor(z / STEP + 0.5))            # nearest quarter-SD step
    return LADDER[max(0, min(len(LADDER) - 1, MID - k))]


def final_weeks(s):
    """Weeks 1..W that are archived (the archive only keeps weeks whose games are final)."""
    have = set(s.get("weeks") or {}) & set(s.get("rosters") or {})
    w = 0
    while str(w + 1) in have:
        w += 1
    return w


def weekly(s):
    """player_key -> {week: pts} from the archived rosters (any team, any slot)."""
    out = defaultdict(dict)
    for w, teams in (s.get("rosters") or {}).items():
        for rows in teams.values():
            for pk, _slot, pts in rows:
                out[pk][int(w)] = pts or 0.0
    return out


def fingerprint(s, weeks):
    """What a finished season's cached points depend on: the draft and the rosters, weeks 1..W."""
    blob = json.dumps([METHOD, s.get("key"), weeks, [(d["pick"], d["p"]) for d in s.get("draft") or []],
                       [(s.get("rosters") or {}).get(str(w)) for w in range(1, weeks + 1)]],
                      sort_keys=True, separators=(",", ":"))
    return hashlib.sha1(blob.encode()).hexdigest()[:16]


# ---------------------------------------------------------------- Yahoo, through the gateway

class Yahoo:
    """scripts/archive.py's gateway client (retries, four requests at a time) and its parser."""

    def __init__(self):
        import archive
        self.parse = archive.parse_players          # raw -> ({pk: info}, {pk: pts})
        self.gw = archive.Gateway(os.environ.get("BH_DRAFT_HTTP_CACHE") or None)

    def get(self, paths, label=None):
        got = self.gw.many(paths, label=label)
        return {p: self.parse(got[p]) for p in paths}


def listed(y, key):
    """Every player on Yahoo's positional lists with positive season points:
    ({pk: season points}, {pk: {positions he's listed at}})."""
    S, at = {}, defaultdict(set)
    start, going = {p: 0 for p in POSITIONS}, list(POSITIONS)
    for _ in range(MAX_PAGES):
        if not going:
            break
        paths = {p: "league/%s/players;position=%s;sort=PTS;sort_type=season;start=%d;count=%d/stats;type=season"
                    % (key, p, start[p], PAGE) for p in going}
        got = y.get(list(paths.values()))
        nxt = []
        for p in going:
            info, pts = got[paths[p]]
            vals = [pts.get(pk) for pk in info]
            for pk in info:
                if (pts.get(pk) or 0) > 0:
                    S[pk] = pts[pk]
                    at[pk].add(p)
            if len(info) == PAGE and vals and all(v is not None and v > 0 for v in vals):
                start[p] += PAGE
                nxt.append(p)
        going = nxt
    if going:
        raise RuntimeError("positional lists still going after %d pages: %s" % (MAX_PAGES, going))
    return S, at


def weekly_totals(y, key, pks, weeks, wk, label=None):
    """{pk: league points over weeks 1..weeks}: the archived roster points for the weeks he was on
    a roster, Yahoo's weekly stats for the rest."""
    tot = {pk: 0.0 for pk in pks}
    need = defaultdict(list)
    for pk in sorted(pks):
        have = wk.get(pk, {})
        for w in range(1, weeks + 1):
            if w in have:
                tot[pk] += have[w]
            else:
                need[w].append(pk)
    paths = {}
    for w in sorted(need):
        ks = need[w]
        for i in range(0, len(ks), PAGE):
            chunk = ks[i:i + PAGE]
            paths["league/%s/players;player_keys=%s/stats;type=week;week=%d" % (key, ",".join(chunk), w)] = chunk
    if paths:
        got = y.get(list(paths), label=label)
        for path, chunk in paths.items():
            pts = got[path][1]
            miss = [pk for pk in chunk if pk not in pts]
            if miss:
                raise RuntimeError("Yahoo sent no weekly points for %s (%s)" % (", ".join(miss[:3]), path))
            for pk in chunk:
                tot[pk] += pts[pk]
    return {pk: round(v, 2) for pk, v in tot.items()}


def season_points(s, weeks, is_done, cached, yref):
    """(points {pk: pts over weeks 1..W} for the drafted players, pool {pos: [pts, best first]}, how, fingerprint)."""
    drafted = sorted({d["p"] for d in s.get("draft") or []})
    fp = fingerprint(s, weeks) if is_done else None
    if is_done and cached and cached.get("fp") == fp and not REFRESH:
        t = cached.get("t") or {}
        if all(pk in t for pk in drafted):
            return {pk: t[pk] for pk in drafted}, {p: list(v) for p, v in (cached.get("pool") or {}).items()}, "weekly", fp
    if not yref:
        yref.append(Yahoo())
    y = yref[0]
    wk = weekly(s)
    S, at = listed(y, s["key"])
    for pk, pl in (s.get("players") or {}).items():
        at[pk] |= elig_of(pl)
    for pk in drafted:
        if pk not in at:
            at[pk] = {"?"}
    everyone = sorted(at)
    how = "weekly"
    if is_done:
        pts = weekly_totals(y, s["key"], everyone, weeks, wk, label="draft %s weekly" % s["season"])
    else:
        # Yahoo's to-date totals are exactly weeks 1..W when they match the weekly sums of every
        # player rostered all season so far: no live week in them and no stats left out.
        full = [pk for pk in everyone if all(w in wk.get(pk, {}) for w in range(1, weeks + 1))]
        def ok(pk):
            ws = sum(wk[pk][w] for w in range(1, weeks + 1))
            return abs(S[pk] - ws) <= 0.05 if pk in S else ws <= 0
        if len(full) >= 50 and all(ok(pk) for pk in full):
            how = "totals"
            pts = {pk: S[pk] for pk in everyone if pk in S}
            rest = [pk for pk in everyone if pk not in S]
            pts.update(weekly_totals(y, s["key"], rest, weeks, wk))
        else:
            how = "rebuilt"
            pts = weekly_totals(y, s["key"], everyone, weeks, wk, label="draft %s weekly" % s["season"])
    pool = {p: sorted((pts[pk] for pk in everyone if p in at[pk]), reverse=True) for p in POSITIONS}
    return {pk: pts[pk] for pk in drafted}, pool, how, fp


# ---------------------------------------------------------------- the method

def flex_share(done):
    c = Counter()
    for s in done:
        po = int(s["settings"].get("playoff_start_week") or 15)
        for w, teams in s["rosters"].items():
            if int(w) >= po:
                continue
            for rows in teams.values():
                for pk, slot, _pts in rows:
                    if slot == "W/R/T":
                        c[pos_of(s["players"].get(pk) or {})] += 1
    n = sum(c.values()) or 1
    return {p: c[p] / n for p in c}


def repl_ranks(s, flex):
    nt = int(s["settings"].get("num_teams") or 12)
    slots = {r["pos"]: int(r["count"]) for r in s["settings"].get("roster_positions") or []}
    nflex = slots.get("W/R/T", 0)
    return {p: nt * slots.get(p, 0) + int(round(nt * nflex * flex.get(p, 0))) + 1 for p in POSITIONS}


def cached_src():
    try:
        old = json.loads((C.OUT / "draft.json").read_text())
    except (OSError, ValueError):
        return {}
    src = old.get("src") or {}
    return (src.get("seasons") or {}) if src.get("v") == METHOD else {}


def r1(x):
    return None if x is None else round(float(x), 1)


def build():
    allseasons = C.seasons()
    end = {s["season"]: int(s["settings"].get("end_week") or 17) for s in allseasons}
    done = [s for s in allseasons if final_weeks(s) >= end[s["season"]]]
    done_years = {s["season"] for s in done}
    if not done:
        C.write("draft", {"seasons": [], "alltime": None})
        return "no finished seasons in the archive"
    flex = flex_share(done)
    old = cached_src()
    yref, src, fetched = [], {}, []

    # pass 1: points, pool, replacement and POR for every pick of every season
    prepared = []
    for s in allseasons:
        year = s["season"]
        is_done = year in done_years
        W = end[year] if is_done else final_weeks(s)
        rr = repl_ranks(s, flex)
        if W:
            n0 = yref[0].gw.calls if yref else 0
            pts, pool, how, fp = season_points(s, W, is_done, old.get(str(year)), yref)
            if yref and yref[0].gw.calls > n0:
                fetched.append("%s: %d requests" % (year, yref[0].gw.calls - n0))
            if is_done:
                src[str(year)] = {"fp": fp, "t": {pk: C.r2(v) for pk, v in sorted(pts.items())},
                                  "pool": {p: [C.r2(v) for v in pool[p]] for p in POSITIONS}}
        else:
            pts, pool, how = {}, {}, "none"
        repl = {p: (pool[p][rr[p] - 1] if len(pool.get(p) or []) >= rr[p] else (pool[p][-1] if pool.get(p) else 0.0))
                for p in POSITIONS} if pool else {}
        picks = []
        for d in s.get("draft") or []:
            pl = s["players"].get(d["p"]) or {}
            pos = pos_of(pl)
            v = pts.get(d["p"])
            known = v is not None and pos in repl
            picks.append({"n": d["pick"], "r": d["round"], "m": C.manager(s, d["team"]),
                          "p": pl.get("name") or d["p"], "pos": pos,
                          "pr": 1 + sum(1 for x in pool[pos] if x > v) if known else None,
                          "pts": v, "por": max(0.0, v - repl[pos]) if known else None})
        prepared.append((s, is_done, W, how, rr, repl, picks, pool))

    # the expected curve: mean POR within +/-WINDOW picks, finished seasons pooled
    by = defaultdict(list)
    for s, is_done, _W, _h, _rr, _repl, picks, _pool in prepared:
        if is_done:
            for p in picks:
                if p["por"] is not None:
                    by[p["n"]].append(p["por"])
    npicks = max(by) if by else 0
    curve = {}
    for n in range(1, npicks + 1):
        vals = [x for q in range(max(1, n - WINDOW), min(npicks, n + WINDOW) + 1) for x in by.get(q, [])]
        curve[n] = sum(vals) / len(vals) if vals else None

    out_seasons, every, zs, byyear, vsum = [], [], defaultdict(list), defaultdict(dict), defaultdict(float)
    for s, is_done, W, how, rr, repl, picks, _pool in prepared:
        year = s["season"]
        scale = 1.0 if is_done else None
        cal = black = None
        if not is_done and W:
            got = [(p["por"], curve.get(p["n"])) for p in picks if p["por"] is not None and curve.get(p["n"]) is not None]
            den = sum(x for _, x in got)
            scale = sum(v for v, _ in got) / den if den else None
            cal = W / float(end[year])
        for p in picks:
            x = curve.get(p["n"])
            p["x"] = x * scale if (x is not None and scale is not None) else None
            p["v"] = p["por"] - p["x"] if (p["x"] is not None and p["por"] is not None) else None
        slots = {p["n"]: p["m"] for p in picks if p["r"] == 1}
        graded = [p for p in picks if p["v"] is not None]
        grades = []
        if graded and len(graded) == len(picks):
            tot, mine = defaultdict(float), defaultdict(list)
            for p in picks:
                tot[p["m"]] += p["v"]
                mine[p["m"]].append(p)
            vals = list(tot.values())
            mu = sum(vals) / len(vals)
            sd = math.sqrt(sum((v - mu) ** 2 for v in vals) / len(vals))
            for m, v in tot.items():
                z = (v - mu) / sd if sd else 0.0
                ps = mine[m]
                best = max(ps, key=lambda p: (p["v"], p["pts"] or 0))
                worst = min(ps, key=lambda p: (p["v"], p["pts"] or 0))
                grades.append({"m": m, "g": letter(z), "z": z, "v": v, "best": best["n"], "worst": worst["n"]})
                if is_done:
                    zs[m].append(z)
                    byyear[m][str(year)] = letter(z)
                    vsum[m] += v
            grades.sort(key=lambda g: -g["v"])
            if cal is not None:
                black = sum(1 for m in mine if sum(p["por"] - curve[p["n"]] * cal for p in mine[m]) > 0)
        if is_done:
            every += [dict(p, y=year) for p in graded]
        steals = sorted((p for p in graded if p["v"] > 0), key=lambda p: (-p["v"], -(p["pts"] or 0)))
        busts = sorted((p for p in graded if p["v"] < 0), key=lambda p: (p["v"], p["pts"] or 0))
        out_seasons.append({
            "year": year, "done": is_done, "weeks": W, "end": end[year], "how": how,
            "scale": C.r2(scale), "cal": C.r2(cal), "black": black,
            "repl": {p: {"rank": rr[p], "pts": C.r2(repl[p])} for p in POSITIONS if p in repl},
            "slots": [slots.get(i) for i in range(1, 13)] if len(slots) == 12 else [],
            "picks": [pub(p) for p in picks],
            "grades": [{"m": g["m"], "g": g["g"], "z": C.r2(g["z"]), "v": r1(g["v"]), "best": g["best"], "worst": g["worst"]}
                       for g in grades],
            "steals": [p["n"] for p in steals[:3]],
            "busts": [p["n"] for p in busts[:3]],
        })

    # all-time: finished seasons only
    best = sorted(every, key=lambda p: (-p["v"], -(p["pts"] or 0)))
    worst = sorted(every, key=lambda p: (p["v"], p["pts"] or 0))
    mgrs = [{"m": m, "g": letter(sum(z) / len(z)), "z": C.r2(sum(z) / len(z)), "n": len(z), "v": r1(vsum[m]),
             "years": byyear[m]} for m, z in zs.items()]
    mgrs.sort(key=lambda g: -g["z"])
    fin = sorted(ss["year"] for ss in out_seasons if ss["done"])
    # why raw points won't do: how many running backs outscored the replacement QB (latest finished season)
    qbrb = None
    for s, is_done, _W, _h, rr, repl, _picks, pool in sorted(prepared, key=lambda x: -x[0]["season"]):
        if is_done and pool.get("RB") and "QB" in repl:
            qbrb = {"y": s["season"], "rank": rr["QB"], "above": sum(1 for x in pool["RB"] if x > repl["QB"])}
            break

    data = {
        "window": WINDOW, "step": STEP,
        "flex": {p: C.r2(v) for p, v in sorted(flex.items(), key=lambda x: -x[1])},
        "curve": [C.r2(curve.get(n)) for n in range(1, npicks + 1)],
        "finished": [fin[0], fin[-1]] if fin else [],
        "qbrb": qbrb,
        "seasons": sorted(out_seasons, key=lambda ss: -ss["year"]),
        "alltime": {"best": [dict(pub(p), y=p["y"]) for p in best[:10]],
                    "worst": [dict(pub(p), y=p["y"]) for p in worst[:10]],
                    "managers": mgrs},
        # not for the page: the finished seasons' network-built inputs, reused by the next build
        "src": {"v": METHOD, "seasons": src},
    }
    C.write("draft", data)
    cur = [ss for ss in out_seasons if not ss["done"]]
    tail = ""
    if cur:
        c = cur[0]
        tail = "; %s so far through week %s (%s)" % (c["year"], c["weeks"], {
            "totals": "Yahoo's to-date totals", "rebuilt": "rebuilt from weekly totals",
            "none": "nothing final yet"}.get(c["how"], c["how"]))
    return "%d seasons, %d picks graded, best ever %s %s (%+.1f)%s; gateway: %s" % (
        len(out_seasons), sum(len([p for p in ss["picks"] if p["v"] is not None]) for ss in out_seasons),
        best[0]["y"] if best else "-", best[0]["p"] if best else "-", best[0]["v"] if best else 0, tail,
        ", ".join(fetched) or "nothing fetched")


def pub(p):
    """A pick as the page gets it: points and POR to the hundredth, value to the tenth it's shown at."""
    return {"n": p["n"], "r": p["r"], "m": p["m"], "p": p["p"], "pos": p["pos"], "pr": p["pr"],
            "pts": C.r2(p["pts"]), "por": C.r2(p["por"]), "x": C.r2(p.get("x")), "v": r1(p.get("v"))}
