"""Odds: playoff, bye, No. 1 seed and last-place (Beer Mile) odds for the season in
progress, from a Monte Carlo of the rest of the regular season.

The model, in full (numbers/odds.js runs a line-for-line port of it in the browser):
  - Every manager's weekly score is Normal(mu, sigma).
  - mu shrinks the manager's average this season toward the league-wide one:
    mu = (n*mean + K*league_mean) / (n + K), n = games played, K = 4. Before Week 1 is
    final everyone gets the 2021-25 regular-season average.
  - sigma is the pooled within-manager weekly SD: every 2021-25 regular-season score
    minus that manager's average for that season, squared, summed, over (N - groups).
  - Played weeks are real (data/record.json). Every week not final is unplayed, the one
    in progress included.
  - Ranking (by-laws XIII): wins (a tie is half a win), then total points, then
    head-to-head win rate among the tied teams, then head-to-head points among them;
    anything still level falls to alphabetical order. Top six make the playoffs, top two
    get the byes, twelfth is last place and does the punishment (the Beer Mile).
  - One seeded mulberry32 stream drives it. Each unplayed game takes two uniforms in
    schedule order (Box-Muller: first normal to the left team, second to the right), so
    the browser, given the same seed and the same number of seasons, replays the same
    seasons. The baseline is written to six decimals, which is exact for 20,000 seasons
    (every count over 20,000 has at most five, every win total over it at most six), so
    the browser's no-pick run can be checked against it to the last digit.

The schedule: played weeks' pairs come from record.json; unplayed weeks from the Yahoo
gateway (league/<key>/scoreboard;week=N, one week per call; Yahoo refuses the multi-week
list before games are played). The whole schedule is kept in data/numbers/odds.json and
reused on the next build, so the gateway is only asked once a season, or again if the
cached copy stops agreeing with record.json. BH_ODDS_REFRESH=1 forces a refetch.
"""
import json, math, os, time, urllib.parse, urllib.request

from hn import _common as c

K = 4                 # games of league average mixed into each manager's mean
SIMS = 20000
SEED = 97724          # the league id; any fixed number would do
BYES = 2              # by-laws 12.2
TWO_PI = 2 * math.pi
M32 = 0xFFFFFFFF
GATEWAY = os.environ.get("BH_YAHOO", "https://bad-hombres.vercel.app/api/yahoo")


# ---------------------------------------------------------------- the random stream

def mulberry32(seed):
    """The same generator as numbers/odds.js: returns rnd() -> [0, 1)."""
    st = [seed & M32]
    def rnd():
        a = st[0] = (st[0] + 0x6D2B79F5) & M32
        t = ((a ^ (a >> 15)) * (a | 1)) & M32
        t = ((t + (((t ^ (t >> 7)) * (t | 61)) & M32)) & M32) ^ t
        return (t ^ (t >> 14)) / 4294967296.0
    return rnd


# ---------------------------------------------------------------- the ranking

def rank(w, p, games, scores):
    """Team indexes, first to last. w/p: wins and points per team. games: [(i, j)] for every
    game of the season, played and simulated, with scores[2g], scores[2g+1] their scores."""
    order = sorted(range(len(w)), key=lambda i: (-w[i], -p[i], i))
    out, k = [], 0
    while k < len(order):
        e = k + 1
        while e < len(order) and w[order[e]] == w[order[k]] and p[order[e]] == p[order[k]]:
            e += 1
        grp = order[k:e]
        if len(grp) > 1:
            grp = h2h(grp, games, scores)
        out.extend(grp)
        k = e
    return out


def h2h(grp, games, scores):
    """Tied on wins and points: head-to-head win rate among the group, then head-to-head
    points, then alphabetical (the index)."""
    inside = set(grp)
    hw = {i: 0.0 for i in grp}; hg = {i: 0 for i in grp}; hp = {i: 0.0 for i in grp}
    for g, (i, j) in enumerate(games):
        if i in inside and j in inside:
            si, sj = scores[2 * g], scores[2 * g + 1]
            hg[i] += 1; hg[j] += 1; hp[i] += si; hp[j] += sj
            if si > sj: hw[i] += 1
            elif sj > si: hw[j] += 1
            else: hw[i] += 0.5; hw[j] += 0.5
    rate = {i: (hw[i] / hg[i] if hg[i] else 0.5) for i in grp}
    return sorted(grp, key=lambda i: (-rate[i], -hp[i], i))


# ---------------------------------------------------------------- the simulation

def simulate(names, played, future, mu, sigma, sims, seed, picks=None, playoff_teams=6):
    """names: managers (index order = alphabetical). played: [(i, j, si, sj)] real games.
    future: [(i, j)] unplayed games in schedule order. mu: per index. picks: per future
    game 0 = let it ride, 1 = left team wins, 2 = right team wins (a picked game keeps its
    two simulated scores, the higher one going to the pick). -> per name
    {playoffs, bye, top, last, wins} as fractions / average final wins."""
    T = len(names)
    w0, p0 = [0.0] * T, [0.0] * T
    games = [(i, j) for i, j, _, _ in played] + list(future)
    real = []
    for i, j, si, sj in played:
        p0[i] += si; p0[j] += sj; real += [si, sj]
        if si > sj: w0[i] += 1
        elif sj > si: w0[j] += 1
        else: w0[i] += 0.5; w0[j] += 0.5
    picks = picks or [0] * len(future)
    rnd = mulberry32(seed)
    log, sqrt, cos, sin = math.log, math.sqrt, math.cos, math.sin
    po, by, top, last, wins = [0] * T, [0] * T, [0] * T, [0] * T, [0.0] * T
    for _ in range(sims):
        w, p, sc = w0[:], p0[:], real[:]
        for g, (i, j) in enumerate(future):
            r = sqrt(-2.0 * log(1.0 - rnd()))
            th = TWO_PI * rnd()
            xi = mu[i] + sigma * (r * cos(th))      # grouped exactly as odds.js does it
            xj = mu[j] + sigma * (r * sin(th))
            pk = picks[g]
            if (pk == 1 and xi < xj) or (pk == 2 and xj < xi):
                xi, xj = xj, xi
            p[i] += xi; p[j] += xj; sc += [xi, xj]
            if xi > xj or (xi == xj and pk == 1): w[i] += 1
            elif xj > xi or (xi == xj and pk == 2): w[j] += 1
            else: w[i] += 0.5; w[j] += 0.5
        order = rank(w, p, games, sc)
        for r_, t in enumerate(order):
            if r_ < playoff_teams: po[t] += 1
            if r_ < BYES: by[t] += 1
            wins[t] += w[t]
        top[order[0]] += 1
        last[order[-1]] += 1
    return {names[t]: {"playoffs": round(po[t] / sims, 6), "bye": round(by[t] / sims, 6),
                       "top": round(top[t] / sims, 6), "last": round(last[t] / sims, 6),
                       "wins": round(wins[t] / sims, 6)} for t in range(T)}


# ---------------------------------------------------------------- inputs

def history(before):
    """sigma: pooled within-manager-season SD of the regular-season weekly scores of every
    archived season before `before`. Also their average (the league mean before Week 1),
    how many team-weeks went in, and the first and last season used."""
    ss = df = total = n = 0
    years = []
    for s in c.seasons():
        if s["season"] >= before:
            continue
        years.append(s["season"])
        last_reg = (s["settings"].get("playoff_start_week") or 15) - 1
        per = {}
        for wk, games in s["weeks"].items():
            if int(wk) > last_reg:
                continue
            for g in games:
                if g.get("po"):
                    continue
                per.setdefault(g["a"], []).append(g["as"])
                per.setdefault(g["b"], []).append(g["bs"])
        for xs in per.values():
            m = sum(xs) / len(xs)
            ss += sum((x - m) ** 2 for x in xs)
            df += len(xs) - 1
            total += sum(xs); n += len(xs)
    return math.sqrt(ss / df), total / n, n, [min(years), max(years)]


def fetch_week(key, week):
    ypath = "league/%s/scoreboard;week=%d" % (key, week)
    url = GATEWAY + "?path=" + urllib.parse.quote(ypath, safe="")
    last = ""
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"Cache-Control": "no-store", "User-Agent": "bh-numbers-odds"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:          # timeouts, a 502 from a Yahoo hiccup
            last = repr(e)[:160]
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError("gateway gave up on week %d: %s" % (week, last))


def fetch_schedule(season_json, weeks):
    """{week: [[a, b], ...]} by first name, straight from Yahoo's scoreboard."""
    import archive                                   # scripts/archive.py: the Yahoo parser
    out = {}
    for wk in weeks:
        got, _status, _names = archive.parse_scoreboard(fetch_week(season_json["key"], wk))
        rows = [g for g in got.get(str(wk), []) if not g.get("po")]
        out[str(wk)] = [[c.manager(season_json, g["a"]), c.manager(season_json, g["b"])] for g in rows]
    return out


def check_week(wk, pairs, managers):
    seen = [n for pr in pairs for n in pr]
    if len(pairs) != len(managers) // 2 or sorted(seen) != sorted(managers):
        raise ValueError("week %s schedule is off: %s" % (wk, pairs))


def cached_schedule(season):
    try:
        old = json.loads((c.OUT / "odds.json").read_text())
    except (OSError, ValueError):
        return {}
    return (old.get("schedule") or {}) if old.get("season") == season else {}


# ---------------------------------------------------------------- build

def build():
    rec = c.record()
    season = int(rec["current"])
    sj = c.season(season)
    st = sj["settings"]
    reg_weeks = (st.get("playoff_start_week") or 15) - 1
    playoff_teams = st.get("num_playoff_teams") or 6
    code2name = c.names()
    managers = sorted(code2name.values())            # index order = alphabetical
    idx = {n: i for i, n in enumerate(managers)}

    # results: every final week this season, from the Record Book's game log
    results = {}
    for w, games in enumerate(rec["weeks"].get(str(season), []), 1):
        results[str(w)] = [[code2name[a], c.r2(sa), code2name[b], c.r2(sb)] for a, sa, b, sb in games]
    through = len(results)
    for w, rows in results.items():
        check_week(w, [[r[0], r[2]] for r in rows], managers)

    # schedule: played weeks from the results, the rest from the cache or Yahoo
    schedule = {w: [[r[0], r[2]] for r in rows] for w, rows in results.items()}
    cache = {} if os.environ.get("BH_ODDS_REFRESH") else cached_schedule(season)
    agrees = all(sorted(map(sorted, cache.get(w) or [])) == sorted(map(sorted, schedule[w])) for w in schedule)
    need = [w for w in range(through + 1, reg_weeks + 1)]
    source = "cached" if need else "all played"
    if agrees and all(str(w) in cache for w in need):
        for w in need: schedule[str(w)] = cache[str(w)]
    elif need:
        schedule.update(fetch_schedule(sj, need))
        source = "fetched from Yahoo"
    for w in need:
        check_week(w, schedule[str(w)], managers)

    # model
    sigma, hist_mean, hist_n, hist_years = history(season)
    scores = {n: [] for n in managers}
    for rows in results.values():
        for a, sa, b, sb in rows:
            scores[a].append(sa); scores[b].append(sb)
    allx = [x for xs in scores.values() for x in xs]
    league_mean = sum(allx) / len(allx) if allx else hist_mean
    n = {m: len(scores[m]) for m in managers}
    # rounded before the run: the browser replays exactly these numbers from the JSON
    mu = {m: round((sum(scores[m]) + K * league_mean) / (n[m] + K), 4) for m in managers}
    sigma, league_mean, hist_mean = round(sigma, 4), round(league_mean, 4), round(hist_mean, 4)

    # baseline
    played = [(idx[a], idx[b], sa, sb) for w in sorted(results, key=int) for a, sa, b, sb in results[w]]
    future = [(idx[a], idx[b]) for w in need for a, b in schedule[str(w)]]
    t0 = time.time()
    base = simulate(managers, played, future, [mu[m] for m in managers], sigma, SIMS, SEED,
                    playoff_teams=playoff_teams)
    took = time.time() - t0

    c.write("odds", {
        "season": season,
        "through_week": through,
        "reg_weeks": reg_weeks,
        "playoff_teams": playoff_teams,
        "byes": BYES,
        "sims": SIMS,
        "seed": SEED,
        "model": {"k": K, "sigma": sigma, "sigma_weeks": hist_n, "hist_years": hist_years,
                  "league_mean": league_mean, "hist_mean": hist_mean, "mu": mu, "n": n},
        "schedule": {w: schedule[w] for w in sorted(schedule, key=int)},
        "results": results,
        "baseline": base,
    })
    fav = max(managers, key=lambda m: base[m]["last"])
    return "through week %d, %d sims in %.1fs, sigma %.2f, schedule %s; Beer Mile favorite %s %.0f%%" % (
        through, SIMS, took, sigma, source, fav, 100 * base[fav]["last"])
