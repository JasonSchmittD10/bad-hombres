"""Real Standings: the standings with the schedule taken out.

From data/record.json's regular-season game log, every season 2021-now:
  - actual W-L-T, points for/against, and the actual regular-season place (record, then points,
    which matches Yahoo's seeds for every archived season);
  - ALL-PLAY: each week, a manager's score against all eleven others;
  - expected wins = all-play win pct x games played; LUCK = actual wins (ties 0.5) - expected;
  - lucky wins (won while scoring below that week's median) and unlucky losses (lost above it);
  - SCHEDULE SWAP: row R, column C = R's record against C's schedule (R's weekly scores against
    C's opponents; the week C played R, R plays C instead). The diagonal is R's real record.
  - ALL-TIME: career all-play, career luck (the sum of the seasons), best and worst seasons.
Ties are shown, never broken silently: equal all-play pcts share a rank (listed by points for), and
the luckiest/unluckiest-seasons lists run past five to take every season tied with the fifth.
Luck is always a multiple of 1/22 (wins in halves, all-play in 1/11ths of a game), so values that
match at two decimals are exact ties.
Writes data/numbers/standings.json.
"""
from hn import _common as C

REG_WEEKS = 14  # fallback when a season's archive lacks settings.playoff_start_week


def _reg_weeks(year):
    try:
        st = C.season(year)["settings"]
        return int(st["playoff_start_week"]) - 1
    except Exception:
        return REG_WEEKS


def _res(a, b):
    """1 win, 0 loss, None tie."""
    return None if a == b else (1 if a > b else 0)


def _median(xs):
    xs = sorted(xs)
    n = len(xs)
    return xs[n // 2] if n % 2 else (xs[n // 2 - 1] + xs[n // 2]) / 2.0


def _wins(w, t):
    return w + 0.5 * t


def _shared_ranks(rows, key):
    """rank = 1 + how many rows have a strictly higher key: ties share a rank (1, 1, 3...)."""
    for r in rows:
        r["rank"] = 1 + sum(1 for x in rows if key(x) > key(r) + 1e-9)


def _cut(seasons, n=5):
    """the first n, plus every season tied (at two decimals) with the nth."""
    if len(seasons) <= n:
        return list(seasons)
    edge = seasons[n - 1]["luck"]
    return [s for i, s in enumerate(seasons) if i < n or s["luck"] == edge]


def _years(yrs, pick):
    """the season(s) with a manager's best or worst luck; tied years are all named."""
    if not yrs:
        return None
    v = pick(s["luck"] for s in yrs)
    return dict(y=", ".join(s["y"] for s in yrs if s["luck"] == v), luck=v)


def _season(games, names):
    """games: list of weeks, each [[codeA, scoreA, codeB, scoreB], ...]."""
    weeks = []  # per week: {code: (score, opp_code)}
    for wk in games:
        d = {}
        for a, sa, b, sb in wk:
            d[a] = (float(sa), b)
            d[b] = (float(sb), a)
        if d:
            weeks.append(d)
    codes = sorted({c for d in weeks for c in d})
    st = {c: dict(w=0, l=0, t=0, pf=0.0, pa=0.0, g=0, apw=0, apl=0, apt=0, lw=0, ul=0) for c in codes}
    for d in weeks:
        med = _median([s for s, _ in d.values()])
        for c, (s, o) in d.items():
            x = st[c]
            os_ = d[o][0]
            x["g"] += 1
            x["pf"] += s
            x["pa"] += os_
            r = _res(s, os_)
            if r is None: x["t"] += 1
            elif r: x["w"] += 1
            else: x["l"] += 1
            if r == 1 and s < med: x["lw"] += 1
            if r == 0 and s > med: x["ul"] += 1
            for c2, (s2, _) in d.items():
                if c2 == c: continue
                r2 = _res(s, s2)
                if r2 is None: x["apt"] += 1
                elif r2: x["apw"] += 1
                else: x["apl"] += 1
    rows = []
    for c in codes:
        x = st[c]
        apg = x["apw"] + x["apl"] + x["apt"]
        ap = _wins(x["apw"], x["apt"]) / apg if apg else 0.0
        xw = ap * x["g"]
        rows.append(dict(
            who=names.get(c, c), code=c, g=x["g"], w=x["w"], l=x["l"], t=x["t"],
            pf=C.r2(x["pf"]), pa=C.r2(x["pa"]),
            apw=x["apw"], apl=x["apl"], apt=x["apt"], ap=round(ap, 4),
            xw=round(xw, 2), luck=round(_wins(x["w"], x["t"]) - xw, 2),
            lw=x["lw"], ul=x["ul"], _pf=x["pf"], _xw=xw, _ap=ap))
    # actual place: win pct, then points for (matches Yahoo's seeds, 2021-2025)
    for i, r in enumerate(sorted(rows, key=lambda r: (-_wins(r["w"], r["t"]) / max(r["g"], 1), -r["_pf"]))):
        r["place"] = i + 1
    # all-play rank: all-play pct; equal pcts share the rank and are listed by points for
    rows.sort(key=lambda r: (-r["_ap"], -r["_pf"]))
    _shared_ranks(rows, lambda r: r["_ap"])

    # schedule swap, ordered by the actual standings so the diagonal reads top-down
    order = [r["code"] for r in sorted(rows, key=lambda r: r["place"])]
    cells = []
    for R in order:
        line = []
        for Cc in order:
            w = l = t = 0
            for d in weeks:
                if R not in d or Cc not in d: continue
                s = d[R][0]
                opp = d[Cc][1]
                if opp == R: opp = Cc  # C played R that week: R gets C instead
                if R == Cc: opp = d[R][1]
                r = _res(s, d[opp][0])
                if r is None: t += 1
                elif r: w += 1
                else: l += 1
            line.append(dict(w=w, l=l, t=t))
        cells.append(line)
    # how many of the other schedules would have given R a better record
    for i, R in enumerate(order):
        real = cells[i][i]
        rw = _wins(real["w"], real["t"])
        better = sum(1 for j, c in enumerate(cells[i]) if j != i and _wins(c["w"], c["t"]) > rw)
        worse = sum(1 for j, c in enumerate(cells[i]) if j != i and _wins(c["w"], c["t"]) < rw)
        r = next(x for x in rows if x["code"] == R)
        r["better"], r["worse"] = better, worse
    swap = dict(order=[names.get(c, c) for c in order], cells=cells)
    return rows, swap, len(weeks)


def build():
    rec = C.record()
    names = rec["managers"]
    years = [str(y) for y in rec["years"]]
    current = str(rec.get("current") or years[-1])
    seasons = {}
    career = {}
    for y in years:
        games = rec["weeks"].get(y) or []
        rows, swap, nweeks = _season(games, names)
        full = _reg_weeks(y)
        final = nweeks >= full
        for r in rows:
            k = career.setdefault(r["code"], dict(who=r["who"], seasons=0, g=0, w=0, l=0, t=0, pf=0.0,
                                                  apw=0, apl=0, apt=0, xw=0.0, lw=0, ul=0, yrs=[]))
            k["seasons"] += 1
            for f in ("g", "w", "l", "t", "apw", "apl", "apt", "lw", "ul"):
                k[f] += r[f]
            k["pf"] += r["_pf"]
            k["xw"] += r["_xw"]
            if final:
                k["yrs"].append(dict(y=y, luck=r["luck"], w=r["w"], l=r["l"], t=r["t"], xw=r["xw"]))
        for r in rows:
            r.pop("_pf"); r.pop("_xw"); r.pop("_ap"); r.pop("code")
        seasons[y] = dict(weeks=nweeks, of=full, final=final, rows=rows, swap=swap)

    rows = []
    all_seasons = []
    for code, k in career.items():
        apg = k["apw"] + k["apl"] + k["apt"]
        ap = _wins(k["apw"], k["apt"]) / apg if apg else 0.0
        yrs = k.pop("yrs")
        for s in yrs:
            all_seasons.append(dict(who=k["who"], **s))
        rows.append(dict(
            who=k["who"], seasons=k["seasons"], g=k["g"], w=k["w"], l=k["l"], t=k["t"], pf=C.r2(k["pf"]),
            apw=k["apw"], apl=k["apl"], apt=k["apt"], ap=round(ap, 4), xw=round(k["xw"], 2),
            luck=round(_wins(k["w"], k["t"]) - k["xw"], 2), lw=k["lw"], ul=k["ul"],
            lucky=_years(yrs, max), unlucky=_years(yrs, min), _ap=ap, _pf=k["pf"]))
    rows.sort(key=lambda r: (-r["_ap"], -r["_pf"]))
    _shared_ranks(rows, lambda r: r["_ap"])
    for r in rows:
        r.pop("_ap"); r.pop("_pf")
    # tied seasons sit in year order, then by name, so the lists never depend on dict order
    luckiest = _cut(sorted(all_seasons, key=lambda s: (-s["luck"], s["y"], s["who"])))
    unluckiest = _cut(sorted(all_seasons, key=lambda s: (s["luck"], s["y"], s["who"])))
    cur = seasons.get(current) or {}
    played = [y for y in years if seasons[y]["weeks"]]
    alltime = dict(
        rows=rows,
        luckiest=luckiest,
        unluckiest=unluckiest,
        first=played[0] if played else years[0], last=played[-1] if played else years[-1],
        cur_weeks=cur.get("weeks", 0), cur_final=bool(cur.get("final")),
        complete=[y for y in years if seasons[y]["final"]])
    C.write("standings", dict(current=current, seasons=seasons, alltime=alltime))
    cs = seasons.get(current)
    lead = ""
    if cs and cs["rows"]:
        top = [r for r in cs["rows"] if r["rank"] == 1]
        lead = "; %s all-play %s %s (%.0f%%)" % (
            current, "leader" if len(top) == 1 else "co-leaders",
            " & ".join(r["who"] for r in top), top[0]["ap"] * 100)
    return "%d seasons, %d managers, %s through week %d%s" % (
        len(seasons), len(rows), current, cs["weeks"] if cs else 0, lead)
