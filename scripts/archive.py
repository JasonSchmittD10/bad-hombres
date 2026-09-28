#!/usr/bin/env python3
"""Archive the league's Yahoo history, one file per season: data/archive/<season>.json.

    scripts/archive.py all [--cache DIR]                    # every season in Yahoo's chain, rebuilt
    scripts/archive.py season 2025 [--cache DIR]            # one season, rebuilt from scratch
    scripts/archive.py season 2026 --weeks 3                # add or refresh week 3, keep the rest
    scripts/archive.py season 2026 --weeks 1-3,5            # ranges and lists both work
    scripts/archive.py verify [2025 ...]                    # re-check the files on disk (no network)

Everything comes through the site's read-only Yahoo gateway,
https://bad-hombres.vercel.app/api/yahoo?path=<yahoo path> (override with BH_YAHOO), so
no Yahoo credentials live here. Requests go at most four at a time and back off on
429/5xx; a 502 carrying Yahoo's own 4xx (a bad week, a team that doesn't exist) is final
and isn't retried. A full season is about 220 requests (12 rosters a week), `all` about
1,100 — a few minutes. --cache DIR keeps the raw answers on disk so a re-run (or a
parser fix) costs nothing; it is never used for the season in progress, whose numbers
still move.

Which weeks: a finished season gets 1..end_week (17, playoffs included). The season in
progress gets 1..current week, but only weeks whose games are all final ("postevent");
a live or future week is skipped with a note, so re-run with --weeks N once it's done.
With --weeks, only those weeks are fetched: their scores and rosters replace what the
file had and every other week is kept. The rest (settings, teams, standings, draft,
transactions, players, season points) is always refetched, because it's a handful of
requests and changes during a live season.

The file (compact JSON, keys in this order):
  {"season", "key",
   "settings": {num_teams, roster_positions [{pos, count}], playoff_start_week,
                num_playoff_teams, num_playoff_consolation_teams, end_week, uses_faab,
                trade_end_date},
   "teams":    {"<team_id>": {"m": <data/record.json code or null>, "name", "key"}},
   "weeks":    {"<N>": [{"a", "as", "ap", "b", "bs", "bp", "po", "cons", "winner"}]},
   "rosters":  {"<N>": {"<team_id>": [[player_key, slot, pts], ...]}},
   "players":  {"<player_key>": {"name", "pos", "elig", "nfl"}},
   "transactions": [{"id", "type", "status", "ts", "faab", "trader", "tradee",
                     "moves": [{"p", "act", "from", "to"}]}],
   "draft":    [{"pick", "round", "team", "p", "cost"}],
   "season_points": {"<player_key>": pts},
   "standings": [{"team", "rank", "seed", "w", "l", "t", "pf", "pa", "moves", "trades"}]}

What to know about the numbers:
  - Team ids are strings everywhere, values included ("a": "4"), so any id can be used
    straight as a key into teams/rosters. Yahoo reshuffles team ids every season (only
    Jason is t.1 every year), so "m" is matched by team NAME against record.json
    teams[season]; the season in progress also falls back to TEAM_IDS in
    api/_league.mjs. A team that matches nothing gets "m": null and is reported.
  - weeks: every matchup of every archived week, playoffs included. "po" is Yahoo's
    is_playoffs (true for the consolation bracket too), "cons" is_consolation. Yahoo
    doesn't mark the title game: week 17 has the Final AND the 3rd-place game, both
    po=true cons=false (the Final is the one between the two week-16 semifinal winners).
    Playoff byes and eliminated teams have no matchup, so weeks 15-17 have 4-6 games.
    "winner" is Yahoo's winner_team_key, null for a tie. ap/bp are the week's
    projections. Yahoo's win probability isn't kept: on a finished game it's a stale
    snapshot, not a result.
  - rosters: all twelve teams every archived week, byes included. Slots are QB RB WR TE
    W/R/T K DEF BN IR; the starters (not BN/IR) add up to the team's score. An empty
    starting slot has no row at all.
  - players: one entry per player seen in a roster, the draft or a transaction.
    player_key carries the season prefix (461.p.33393); the number after ".p." is the
    same player every year. "elig" leaves out IR (that's injury status, not a
    position). "nfl" is the player's NFL team TODAY, even in an old season — Yahoo
    doesn't keep the historical one.
  - transactions: oldest first. "from"/"to" are a team id, "fa" or "waivers". "faab"
    is the winning bid in a FAAB season (2024 on); Yahoo leaves a $0 bid out, so a
    waiver claim without one is recorded as 0. null otherwise. Commissioner entries
    ("commish") carry no players. One 2021 trade is "vetoed".
  - draft: snake drafts, so "cost" is always null.
  - season_points: Yahoo's league-scored season total for every player in "players".
    It is the whole NFL regular season (weeks 1-18) while the league stops at week 17,
    and for the season in progress it's to date, the live week included.
  - standings: Yahoo's table. W-L-T and pf/pa are weeks 1-14 (the regular season).
    After the season "rank" is the final finish: 1-6 the title bracket, 7-12 Yahoo's
    consolation bracket (record.json orders 7-12 by seed instead). moves counts adds,
    trades counts completed trades.

Before writing, every season is checked: each team's starters add up to its score in
every archived game (to within 0.02), all twelve rosters are there each week, the
transactions reproduce the standings' moves and trades per team, and in FAAB seasons
each team's bids plus its remaining balance make $100. Failures are printed; the file is
still written so they can be looked at.
"""
import concurrent.futures as cf
import hashlib, json, os, random, re, sys, threading, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "archive"
GATEWAY = os.environ.get("BH_YAHOO", "https://bad-hombres.vercel.app/api/yahoo")
WORKERS = 4
NON_STARTER = {"BN", "IR"}
TOLERANCE = 0.02


def die(msg): print("archive: " + msg, file=sys.stderr); sys.exit(1)
def note(msg): print(msg, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- the gateway

class Permanent(Exception):
    """Yahoo said no (bad week, missing team): retrying won't help."""


class Gateway:
    def __init__(self, cache=None):
        self.cache = Path(cache) if cache else None
        if self.cache: self.cache.mkdir(parents=True, exist_ok=True)
        self.calls = 0
        self.lock = threading.Lock()

    def _cache_file(self, ypath):
        slug = re.sub(r"[^A-Za-z0-9]+", "_", ypath)[:80]
        return self.cache / ("%s_%s.json" % (slug, hashlib.sha1(ypath.encode()).hexdigest()[:10]))

    def get(self, ypath, use_cache=True):
        cf_ = self._cache_file(ypath) if (self.cache and use_cache) else None
        if cf_ and cf_.exists():
            return json.loads(cf_.read_text())
        url = GATEWAY + "?path=" + urllib.parse.quote(ypath, safe="")
        delay, last = 2.0, ""
        for attempt in range(8):
            try:
                req = urllib.request.Request(url, headers={"Cache-Control": "no-store", "User-Agent": "bh-archive"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    body = r.read()
                data = json.loads(body)
                if isinstance(data, dict) and data.get("error"):
                    raise ValueError(str(data["error"])[:200])
                with self.lock: self.calls += 1
                if cf_: cf_.write_bytes(body)
                return data
            except urllib.error.HTTPError as e:
                text = e.read().decode("utf-8", "replace")[:400]
                with self.lock: self.calls += 1
                if re.search(r"yahoo-4(0\d|1\d)\b", text) or e.code in (400, 403, 404):
                    raise Permanent("%s: %s %s" % (ypath, e.code, text[:200]))
                last = "HTTP %s %s" % (e.code, text[:160])
            except Exception as e:   # timeouts, resets, a half-read body
                last = repr(e)[:200]
            time.sleep(delay + random.random())
            delay = min(delay * 2, 60)
        raise RuntimeError("gave up on %s after 8 tries: %s" % (ypath, last))

    def many(self, paths, use_cache=True, label=None):
        out, done = {}, 0
        with cf.ThreadPoolExecutor(WORKERS) as ex:
            futs = {ex.submit(self.get, p, use_cache): p for p in paths}
            for f in cf.as_completed(futs):
                out[futs[f]] = f.result()
                done += 1
                if label and (done % 48 == 0 or done == len(paths)):
                    note("  %s: %d/%d" % (label, done, len(paths)))
        return out

    def chain(self):
        url = GATEWAY + "?chain=1"
        for attempt in range(5):
            try:
                with urllib.request.urlopen(url, timeout=60) as r:
                    return json.loads(r.read())
            except Exception as e:
                last = e
                time.sleep(2 ** attempt)
        die("couldn't read the season chain: %s" % last)


# ---------------------------------------------------------------- the Yahoo maze

def flat(node):
    """{"0":{..},"1":{..},"count":n} -> [..] in index order; lists pass through."""
    if not node:
        return []
    if isinstance(node, list):
        return node
    return [node[k] for k in sorted((k for k in node if str(k).isdigit()), key=int)]


def merge(node):
    """An array of fragments (lists nest) -> one dict. Dicts pass through."""
    if not node:
        return {}
    if isinstance(node, dict):
        return node
    out = {}
    for part in node:
        if isinstance(part, list):
            out.update(merge(part))
        elif isinstance(part, dict):
            out.update(part)
    return out


def _num(v, d=None):
    try:
        return float(v)
    except (TypeError, ValueError):
        return d


def _int(v, d=None):
    try:
        return int(v)
    except (TypeError, ValueError):
        return d


def _pts(v):
    return round(_num(v, 0.0), 2)


def _tid(team_key):
    """'461.l.186206.t.4' -> '4'"""
    if not team_key or ".t." not in str(team_key):
        return None
    return str(team_key).rsplit(".t.", 1)[1]


def _norm(name):
    s = str(name or "").replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    return re.sub(r"\s+", " ", s).strip().lower()


def _pid(player_key):
    try:
        return int(str(player_key).rsplit(".p.", 1)[1])
    except (IndexError, ValueError):
        return 0


def _league(raw):
    lg = raw["fantasy_content"]["league"]
    return merge(lg[0]), merge(lg[1:])


def _player_info(p):
    """A merged Yahoo player dict -> the archive's {name, pos, elig, nfl}."""
    name = p.get("name")
    name = name.get("full") if isinstance(name, dict) else name
    elig = [merge(e).get("position") for e in flat(p.get("eligible_positions"))]
    return {"name": name, "pos": p.get("display_position"),
            "elig": [e for e in elig if e and e != "IR"],
            "nfl": (p.get("editorial_team_abbr") or "").upper() or None}


# ---------------------------------------------------------------- parsers

def parse_settings(raw):
    meta, body = _league(raw)
    s = merge(body.get("settings"))
    pos = []
    for rp in flat(s.get("roster_positions")):
        r = merge(rp).get("roster_position") or merge(rp)
        pos.append({"pos": r.get("position"), "count": _int(r.get("count"), 0)})
    return {
        "settings": {
            "num_teams": _int(meta.get("num_teams")),
            "roster_positions": pos,
            "playoff_start_week": _int(s.get("playoff_start_week")),
            "num_playoff_teams": _int(s.get("num_playoff_teams")),
            "num_playoff_consolation_teams": _int(s.get("num_playoff_consolation_teams")),
            "end_week": _int(meta.get("end_week")),
            "uses_faab": bool(_int(s.get("uses_faab"), 0)),
            "trade_end_date": s.get("trade_end_date"),
        },
        "season": _int(meta.get("season")),
        "current_week": _int(meta.get("current_week")),
        "is_finished": bool(_int(meta.get("is_finished"), 0)),   # absent while in progress
    }


def parse_scoreboard(raw):
    """-> ({"N": [matchup]}, {"N": set(statuses)}, {team_id: name}). Multi-week answers are
    split by each matchup's own week."""
    _meta, body = _league(raw)
    sb = merge(body.get("scoreboard"))
    mnode = sb.get("matchups") or merge(sb.get("0")).get("matchups")
    weeks, status, names = {}, {}, {}
    for m in flat(mnode):
        mu = merge(m).get("matchup") or {}
        tnode = mu.get("teams") or merge(mu.get("0")).get("teams")
        teams = []
        for e in flat(tnode):
            t = merge(merge(e).get("team") or e)
            tid = str(t.get("team_id"))
            names[tid] = t.get("name")
            teams.append({"id": tid, "key": t.get("team_key"),
                          "pts": _pts(merge(t.get("team_points")).get("total")),
                          "proj": _pts(merge(t.get("team_projected_points")).get("total"))})
        if len(teams) != 2:
            continue
        a, b = teams
        wk = str(_int(mu.get("week")) or _int(sb.get("week")))
        wkey = mu.get("winner_team_key")
        tied = bool(_int(mu.get("is_tied"), 0))
        winner = None if tied else (a["id"] if wkey == a["key"] else b["id"] if wkey == b["key"] else None)
        weeks.setdefault(wk, []).append({
            "a": a["id"], "as": a["pts"], "ap": a["proj"],
            "b": b["id"], "bs": b["pts"], "bp": b["proj"],
            "po": str(mu.get("is_playoffs")) == "1",
            "cons": str(mu.get("is_consolation")) == "1",
            "winner": winner,
        })
        status.setdefault(wk, set()).add(mu.get("status"))
    return weeks, status, names


def parse_roster(raw):
    """team/<key>.t.<n>/roster;week=N/players/stats;type=week;week=N
    -> (team_id, team name, week, [[player_key, slot, pts]], {player_key: info})."""
    team = merge(raw["fantasy_content"]["team"])
    roster = merge(team.get("roster"))
    rows, info = [], {}
    for entry in flat(merge(roster.get("0")).get("players")):
        p = merge(merge(entry).get("player"))
        pk = p.get("player_key")
        slot = merge(p.get("selected_position")).get("position")
        rows.append([pk, slot, _pts(merge(p.get("player_points")).get("total"))])
        info[pk] = _player_info(p)
    return str(team.get("team_id")), team.get("name"), _int(roster.get("week")), rows, info


def parse_transactions(raw):
    """-> (rows as Yahoo sent them, number of raw items in the page, {player_key: info})."""
    _meta, body = _league(raw)
    items = flat(body.get("transactions"))
    out, info = [], {}
    for item in items:
        t = merge(item.get("transaction") if isinstance(item, dict) else item)
        if t.get("type") is None:            # ghost ids: failed claims, withdrawn offers
            continue
        moves = []
        for pn in flat(t.get("players")):
            pl = pn.get("player") if isinstance(pn, dict) else pn
            meta = merge(pl[0]) if pl else {}
            td = merge(pl[1:]).get("transaction_data") if pl else None
            td = td[0] if isinstance(td, list) and td else (td if isinstance(td, dict) else {})
            st, dt = td.get("source_type"), td.get("destination_type")
            side = lambda typ, key: _tid(key) if typ == "team" else ("fa" if typ == "freeagents" else typ)
            pk = meta.get("player_key")
            moves.append({"p": pk, "act": td.get("type"),
                          "from": side(st, td.get("source_team_key")),
                          "to": side(dt, td.get("destination_team_key"))})
            if pk:
                info.setdefault(pk, _player_info(meta))
        row = {"id": _int(t.get("transaction_id")), "type": t.get("type"), "status": t.get("status"),
               "ts": _int(t.get("timestamp")), "faab": _int(t.get("faab_bid")),
               "trader": _tid(t.get("trader_team_key")), "tradee": _tid(t.get("tradee_team_key")),
               "moves": moves}
        picks = []
        for pn in flat(t.get("picks")):      # never seen in this league; kept if it ever happens
            pk_ = merge(pn.get("pick", pn) if isinstance(pn, dict) else pn)
            picks.append({"round": _int(pk_.get("round")), "from": _tid(pk_.get("source_team_key")),
                          "to": _tid(pk_.get("destination_team_key")),
                          "original": _tid(pk_.get("original_team_key"))})
        if picks:
            row["picks"] = picks
        out.append(row)
    return out, len(items), info


def parse_draft(raw):
    """draftresults/players/stats;type=season -> (picks, {player_key: info}, {player_key: pts})."""
    _meta, body = _league(raw)
    picks, info, pts = [], {}, {}
    for item in flat(body.get("draft_results")):
        r = item.get("draft_result", item)
        pk = r.get("player_key")
        emb = flat(merge(r.get("0")).get("players")) if isinstance(r.get("0"), dict) else []
        if emb:
            p = merge(merge(emb[0]).get("player"))
            info[pk] = _player_info(p)
            tot = merge(p.get("player_points")).get("total")
            if tot is not None:
                pts[pk] = _pts(tot)
        picks.append({"pick": _int(r.get("pick")), "round": _int(r.get("round")),
                      "team": _tid(r.get("team_key")), "p": pk, "cost": _int(r.get("cost"))})
    picks.sort(key=lambda x: x["pick"] or 0)
    return picks, info, pts


def parse_players(raw):
    """league/<key>/players;player_keys=.../stats;type=season -> ({pk: info}, {pk: pts})."""
    _meta, body = _league(raw)
    info, pts = {}, {}
    for e in flat(body.get("players")):
        p = merge(e.get("player") if isinstance(e, dict) else e)
        pk = p.get("player_key")
        if not pk:
            continue
        info[pk] = _player_info(p)
        tot = merge(p.get("player_points")).get("total")
        if tot is not None:
            pts[pk] = _pts(tot)
    return info, pts


def parse_standings(raw):
    """-> [{team, rank, seed, w, l, t, pf, pa, moves, trades}] by rank, {team_id: (name, key, faab_balance)}."""
    _meta, body = _league(raw)
    rows, teams = [], {}
    for e in flat(merge(body.get("standings")).get("teams")):
        t = merge(merge(e).get("team") if isinstance(e, dict) else e)
        ts = merge(t.get("team_standings"))
        o = merge(ts.get("outcome_totals"))
        tid = str(t.get("team_id"))
        teams[tid] = (t.get("name"), t.get("team_key"), _int(t.get("faab_balance")))
        rows.append({"team": tid, "rank": _int(ts.get("rank")), "seed": _int(ts.get("playoff_seed")),
                     "w": _int(o.get("wins"), 0), "l": _int(o.get("losses"), 0), "t": _int(o.get("ties"), 0),
                     "pf": _pts(ts.get("points_for")), "pa": _pts(ts.get("points_against")),
                     "moves": _int(t.get("number_of_moves"), 0), "trades": _int(t.get("number_of_trades"), 0)})
    rows.sort(key=lambda r: (r["rank"] is None, r["rank"] or 0, int(r["team"])))
    return rows, teams


# ---------------------------------------------------------------- managers

def team_ids_now():
    """TEAM_IDS from the site's API code (api/_league.mjs, or api/scoreboard.mjs where it
    used to live) — the current season only: {team_id: first name}."""
    for name in ("_league.mjs", "scoreboard.mjs"):
        try:
            src = (ROOT / "api" / name).read_text()
        except OSError:
            continue
        m = re.search(r"TEAM_IDS\s*=\s*\{([^}]*)\}", src)
        if m:
            return {k: v for k, v in re.findall(r"(\d+)\s*:\s*['\"]([^'\"]+)['\"]", m.group(1))}
    note("archive: couldn't find TEAM_IDS in api/; the current season maps by team name only")
    return {}


def map_teams(record, season, names, current):
    """{team_id: name} -> ({team_id: code}, [unmapped "id name"], [conflicts])."""
    by_name = {_norm(nm): code for code, nm in (record.get("teams", {}).get(str(season)) or {}).items()}
    by_first = {first: code for code, first in record.get("managers", {}).items()}
    by_id = {tid: by_first.get(first) for tid, first in team_ids_now().items()} if current else {}
    codes, unmapped, conflicts = {}, [], []
    for tid, nm in names.items():
        c = by_name.get(_norm(nm))
        if current and by_id.get(tid):
            if c and c != by_id[tid]:
                conflicts.append("t.%s %r: name says %s, TEAM_IDS says %s" % (tid, nm, c, by_id[tid]))
            c = c or by_id[tid]
        codes[tid] = c
        if not c:
            unmapped.append("t.%s %s" % (tid, nm))
    return codes, unmapped, conflicts


# ---------------------------------------------------------------- one season

def weeks_arg(s):
    out = set()
    for part in str(s).split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            out.update(range(int(a), int(b) + 1))
        else:
            out.add(int(part))
    return sorted(out)


def fetch_scoreboard(gw, key, want, use_cache):
    """Every matchup of the wanted weeks. One multi-week call (;week=1,2,...,17) when Yahoo
    takes it; it refuses some lists ("no scoreboard available for week 2,3"), so any week
    the answer lacks is fetched on its own."""
    weeks, status, names = {}, {}, {}
    def add(raw):
        w, s, n = parse_scoreboard(raw)
        for k in w:
            if k in weeks:
                continue
            weeks[k], status[k] = w[k], s[k]
        names.update(n)
    if len(want) > 1:
        add(gw.get("league/%s/scoreboard;week=%s" % (key, ",".join(map(str, want))), use_cache))
    missing = ["league/%s/scoreboard;week=%d" % (key, w) for w in want if str(w) not in weeks]
    for raw in gw.many(missing, use_cache).values():
        add(raw)
    return weeks, status, names


def fetch_transactions(gw, key, use_cache):
    rows, info, start = [], {}, 0
    while True:
        raw = gw.get("league/%s/transactions;start=%d;count=200" % (key, start), use_cache)
        page, n, inf = parse_transactions(raw)
        rows.extend(page)
        info.update(inf)
        if n < 200:
            break
        start += 200
    seen, out = set(), []
    for r in rows:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        out.append(r)
    out.sort(key=lambda r: (r["ts"] or 0, r["id"] or 0))
    return out, info


def build_season(gw, record, season, key, current, weeks=None):
    use_cache = not current
    path = OUT / ("%d.json" % season)
    old = json.loads(path.read_text()) if (weeks and path.exists()) else None
    if old and old.get("key") != key:
        die("%s holds %s, not %s" % (path, old.get("key"), key))

    base = gw.many(["league/%s/settings" % key, "league/%s/standings" % key,
                    "league/%s/draftresults/players/stats;type=season" % key], use_cache)
    st = parse_settings(base["league/%s/settings" % key])
    settings = st["settings"]
    end = settings["end_week"] or 17
    last = end if st["is_finished"] or not current else min(end, st["current_week"] or end)
    want = weeks or list(range(1, last + 1))
    notes = []
    too_late = [w for w in want if w < 1 or w > last]
    if too_late:
        notes.append("weeks %s aren't played yet (Yahoo is on week %s) — skipped" % (too_late, st["current_week"]))
    want = [w for w in want if 1 <= w <= last]

    standings, st_teams = parse_standings(base["league/%s/standings" % key])
    sb_weeks, sb_status, sb_names = fetch_scoreboard(gw, key, want, use_cache)
    final = []
    for w in want:
        stat = sb_status.get(str(w))
        if stat == {"postevent"}:
            final.append(w)
        elif not stat:
            notes.append("week %d: Yahoo returned no scoreboard — skipped" % w)
        else:
            notes.append("week %d is %s, not final — skipped" % (w, "/".join(sorted(map(str, stat)))))

    # rosters: every team, every final week (byes and eliminated teams included)
    tids = sorted(st_teams, key=int)
    rpaths = {(w, t): "team/%s.t.%s/roster;week=%d/players/stats;type=week;week=%d" % (key, t, w, w)
              for w in final for t in tids}
    raws = gw.many(list(rpaths.values()), use_cache, label="%d rosters" % season) if rpaths else {}
    rosters, roster_info, roster_names = {}, {}, {}
    for (w, t), p in sorted(rpaths.items()):
        tid, tname, rw, rows, info = parse_roster(raws[p])
        if tid != t or (rw is not None and rw != w):
            notes.append("roster %s asked for t.%s week %d, got t.%s week %s" % (p, t, w, tid, rw))
        rosters.setdefault(str(w), {})[t] = rows
        roster_info.update(info)      # later weeks overwrite: latest eligibility/team wins
        roster_names[t] = tname

    txs, tx_info = fetch_transactions(gw, key, use_cache)
    picks, draft_info, points = parse_draft(base["league/%s/draftresults/players/stats;type=season" % key])

    # teams and managers
    names = {t: v[0] for t, v in st_teams.items()}
    for src, label in ((sb_names, "scoreboard"), (roster_names, "rosters")):
        for t, nm in src.items():
            if t in names and _norm(nm) != _norm(names[t]):
                notes.append("t.%s is %r in the standings but %r in the %s" % (t, names[t], nm, label))
    codes, unmapped, conflicts = map_teams(record, season, names, current)
    notes += ["team-id conflict: " + c for c in conflicts]
    teams = {t: {"m": codes.get(t), "name": st_teams[t][0], "key": st_teams[t][1]} for t in tids}

    # merge with the file on disk when only some weeks were asked for
    wk_out = dict(old.get("weeks", {})) if old else {}
    ro_out = dict(old.get("rosters", {})) if old else {}
    for w in final:
        wk_out[str(w)] = sb_weeks.get(str(w), [])
        ro_out[str(w)] = rosters.get(str(w), {})
    wk_out = {k: wk_out[k] for k in sorted(wk_out, key=int)}
    ro_out = {k: {t: ro_out[k][t] for t in sorted(ro_out[k], key=int)} for k in sorted(ro_out, key=int)}

    players = dict(old.get("players", {})) if old else {}
    needed = set()
    for wk in ro_out.values():
        for rows in wk.values():
            needed.update(r[0] for r in rows)
    needed.update(p["p"] for p in picks if p["p"])
    for t in txs:
        needed.update(m["p"] for m in t["moves"] if m["p"])
    for pk, inf in roster_info.items():
        players[pk] = inf
    for src in (draft_info, tx_info):
        for pk, inf in src.items():
            if pk not in players:
                players[pk] = inf
    # season points (and anything missing about the player) in batches of 25 —
    # Yahoo silently cuts players;player_keys= at 25
    rest = sorted((pk for pk in set(players) | needed if pk not in points), key=_pid)
    batches = [rest[i:i + 25] for i in range(0, len(rest), 25)]
    bpaths = ["league/%s/players;player_keys=%s/stats;type=season" % (key, ",".join(b)) for b in batches]
    for p, raw in (gw.many(bpaths, use_cache, label="%d season points" % season) if bpaths else {}).items():
        inf, pts = parse_players(raw)
        points.update(pts)
        for pk, i in inf.items():
            cur = players.get(pk)
            if cur is None:
                players[pk] = i
            elif not cur.get("elig") and i.get("elig"):
                cur["elig"] = i["elig"]
    missing_pts = sorted(pk for pk in set(players) | needed if pk not in points)
    if missing_pts:
        notes.append("no season points for %d players: %s" % (len(missing_pts), missing_pts[:8]))
    missing_info = sorted(pk for pk in needed if pk not in players)
    if missing_info:
        notes.append("no player info for %s" % missing_info[:8])

    # FAAB: Yahoo leaves $0 bids out, so a waiver claim without one is a $0 claim
    for t in txs:
        if t["faab"] is None and settings["uses_faab"] and any(
                m["act"] == "add" and m["from"] == "waivers" for m in t["moves"]):
            t["faab"] = 0
    if settings["uses_faab"]:
        spent = {}
        for t in txs:
            if t["status"] == "successful" and t["faab"]:
                for m in t["moves"]:
                    if m["act"] == "add" and m["to"] in st_teams:
                        spent[m["to"]] = spent.get(m["to"], 0) + t["faab"]
        for tid, (_n, _k, bal) in st_teams.items():
            if bal is not None and bal + spent.get(tid, 0) != 100:
                notes.append("FAAB t.%s: balance %s + bids %s != 100" % (tid, bal, spent.get(tid, 0)))

    tx_out = []
    for t in txs:
        row = {"id": t["id"], "type": t["type"], "status": t["status"], "ts": t["ts"], "faab": t["faab"],
               "trader": t["trader"], "tradee": t["tradee"], "moves": t["moves"]}
        if t.get("picks"):
            row["picks"] = t["picks"]
        tx_out.append(row)

    order = lambda d: {k: d[k] for k in sorted(d, key=_pid)}
    arc = {
        "season": season, "key": key, "settings": settings, "teams": teams,
        "weeks": wk_out, "rosters": ro_out, "players": order(players),
        "transactions": tx_out, "draft": picks,
        "season_points": order({pk: points[pk] for pk in points if pk in players or pk in needed}),
        "standings": standings,
    }
    return arc, {"final": final, "notes": notes, "unmapped": unmapped}


# ---------------------------------------------------------------- the checks

def verify(arc):
    """-> (report dict, [problems])."""
    probs = []
    n = arc["settings"].get("num_teams") or 12
    teams = set(arc["teams"])
    checked = mism = 0
    if set(arc["weeks"]) != set(arc["rosters"]):
        probs.append("weeks %s but rosters %s" % (sorted(arc["weeks"], key=int), sorted(arc["rosters"], key=int)))
    for wk, ms in arc["weeks"].items():
        ro = arc["rosters"].get(wk, {})
        if set(ro) != teams:
            probs.append("week %s: rosters for %d of %d teams" % (wk, len(set(ro) & teams), n))
        for m in ms:
            for s in "ab":
                rows = ro.get(m[s])
                checked += 1
                if rows is None:
                    mism += 1
                    probs.append("week %s: no roster for t.%s" % (wk, m[s]))
                    continue
                tot = round(sum(p for _k, slot, p in rows if slot not in NON_STARTER), 2)
                if abs(tot - m[s + "s"]) > TOLERANCE:
                    mism += 1
                    probs.append("week %s t.%s: starters %.2f vs score %.2f" % (wk, m[s], tot, m[s + "s"]))
    # every player referenced has an entry; drafted + transacted players have season points
    pl, sp = arc["players"], arc["season_points"]
    ref = {r[0] for wk in arc["rosters"].values() for rows in wk.values() for r in rows}
    drafted = {p["p"] for p in arc["draft"]}
    moved = {m["p"] for t in arc["transactions"] for m in t["moves"]}
    lost = sorted((ref | drafted | moved) - set(pl), key=_pid)
    if lost:
        probs.append("%d players referenced but not in players: %s" % (len(lost), lost[:6]))
    nopts = sorted((drafted | moved) - set(sp), key=_pid)
    if nopts:
        probs.append("%d drafted/transacted players without season points: %s" % (len(nopts), nopts[:6]))
    # transactions reproduce the standings' moves and trades
    moves, trades = {}, {}
    for t in arc["transactions"]:
        if t["status"] != "successful":
            continue
        if t["type"] in ("add", "add/drop"):
            for m in t["moves"]:
                if m["act"] == "add" and m["to"] in teams:
                    moves[m["to"]] = moves.get(m["to"], 0) + 1
        elif t["type"] == "trade":
            for tid in (t["trader"], t["tradee"]):
                trades[tid] = trades.get(tid, 0) + 1
    for r in arc["standings"]:
        if moves.get(r["team"], 0) != r["moves"] or trades.get(r["team"], 0) != r["trades"]:
            probs.append("t.%s: standings moves/trades %d/%d, transactions %d/%d" % (
                r["team"], r["moves"], r["trades"], moves.get(r["team"], 0), trades.get(r["team"], 0)))
    if len(arc["draft"]) and len({p["pick"] for p in arc["draft"]}) != len(arc["draft"]):
        probs.append("duplicate draft picks")
    unm = ["t.%s %s" % (t, v["name"]) for t, v in arc["teams"].items() if not v["m"]]
    rep = {"season": arc["season"], "weeks": len(arc["weeks"]),
           "team_weeks": sum(len(v) for v in arc["rosters"].values()),
           "scores_checked": checked, "score_mismatches": mism,
           "transactions": len(arc["transactions"]), "draft_picks": len(arc["draft"]),
           "players": len(pl), "season_points": len(sp), "unmapped": unm}
    return rep, probs


def show(rep, probs):
    print("%d: %d weeks, %d team-weeks, starters vs score %d/%d match (%d mismatches), "
          "%d transactions, %d picks, %d players, %d season points, unmapped: %s" % (
              rep["season"], rep["weeks"], rep["team_weeks"], rep["scores_checked"] - rep["score_mismatches"],
              rep["scores_checked"], rep["score_mismatches"], rep["transactions"], rep["draft_picks"],
              rep["players"], rep["season_points"], ", ".join(rep["unmapped"]) or "none"))
    for p in probs[:25]:
        print("  ! " + p)
    if len(probs) > 25:
        print("  ! ... and %d more" % (len(probs) - 25))


def write(arc):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / ("%d.json" % arc["season"])
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(arc, separators=(",", ":"), ensure_ascii=False) + "\n")
    tmp.replace(path)
    return path


# ---------------------------------------------------------------- commands

def opt(args, name, default=None):
    return args[args.index(name) + 1] if name in args and args.index(name) + 1 < len(args) else default


def run(seasons, weeks, cache):
    record = json.loads((ROOT / "data" / "record.json").read_text())
    gw = Gateway(cache)
    chain = sorted(gw.chain(), key=lambda s: -int(s["season"]))
    if not chain:
        die("the gateway returned no seasons")
    current = int(chain[0]["season"])
    keys = {int(s["season"]): s["key"] for s in chain}
    todo = seasons or sorted(keys)
    bad = [s for s in todo if s not in keys]
    if bad:
        die("not in Yahoo's chain for this league: %s (have %s)" % (bad, sorted(keys)))
    failed = False
    for season in todo:
        t0, c0 = time.time(), gw.calls
        note("%d (%s)%s ..." % (season, keys[season], " — in progress" if season == current else ""))
        arc, info = build_season(gw, record, season, keys[season], season == current, weeks)
        rep, probs = verify(arc)
        path = write(arc)
        for n in info["notes"]:
            note("  - " + n)
        show(rep, probs)
        print("  wrote %s (%s bytes; %d requests, %.0fs)" % (
            path.relative_to(ROOT), format(path.stat().st_size, ","), gw.calls - c0, time.time() - t0))
        failed = failed or bool(probs)
    return 1 if failed else 0


def main():
    a = sys.argv[1:]
    cmd = a[0] if a else ""
    cache = opt(a, "--cache")
    if cmd == "all":
        sys.exit(run(None, None, cache))
    if cmd == "season":
        if len(a) < 2 or not a[1].isdigit():
            die("which season? e.g. archive.py season 2025")
        wk = opt(a, "--weeks")
        sys.exit(run([int(a[1])], weeks_arg(wk) if wk else None, cache))
    if cmd == "verify":
        years = [int(x) for x in a[1:] if x.isdigit()] or sorted(int(p.stem) for p in OUT.glob("*.json"))
        bad = 0
        for y in years:
            p = OUT / ("%d.json" % y)
            if not p.exists():
                print("%d: no file" % y); bad = 1; continue
            rep, probs = verify(json.loads(p.read_text()))
            show(rep, probs)
            bad = bad or bool(probs)
        sys.exit(1 if bad else 0)
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
