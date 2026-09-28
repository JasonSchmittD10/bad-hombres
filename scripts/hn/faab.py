"""FAAB Receipts: every waiver and free-agent pickup, what it cost, what it returned.

For every season in the archive:
  - pickups: every successful add (waivers or free agency) with the manager, the player,
    the week he joined, the bid (FAAB since 2024; free agents cost $0 then, and 2021-23
    has no prices at all), the weeks he stayed, the points he scored in that team's
    starting lineup while he stayed (through the drop, or the end of the season), and a
    state: "open" = still on that roster at the last archived week of an unfinished season,
    "post" = claimed after the season's last week (his week is clamped to that week).
  - managers: pickups, FAAB spent (every winning bid, the way Yahoo's balance counts it),
    pend (the part of it on pickups that haven't played yet), started points from pickups,
    $ per started point (FAAB spent on pickups that have played / their started points),
    best pickup, worst spend, and big (how many of his $10+ bids have played).
  - away: The One That Got Away. One row per player who was dropped and then scored the
    most started points for other teams that same season, counted from his first cut;
    every manager who cut him is named, with the week.

Only games that counted are counted, the same rule as The Pine and Trade Court: every
regular-season week, plus the playoff bracket. Consolation games and playoff byes (which
the league ignores) score nothing here.

Which week a transaction belongs to: Yahoo turns the fantasy week over overnight Monday into
Tuesday. The archive brackets the moment between Monday 8:21 p.m. and Tuesday 3:11 a.m.
Eastern (no move in 2021-26 falls in between), and Yahoo's batch jobs run just after
midnight Pacific (queued drops and trades clear around 3:1x a.m. Eastern on Tuesday,
waivers on Wednesday), so the clock turns at 00:00 Pacific on Tuesday. Week 2 starts the Tuesday
before the earliest pickup that first shows up on a week-2 roster, or, before any week-2
roster exists, the Tuesday eight days after Labor Day (the NFL kicks off the Thursday
after it). Every later week starts seven days on. A week that ran long (2021's Tuesday
games) pushes the next rollover to the following midnight. The builder checks the clock
against every pickup whose first roster week is certain, every drop (a player can't be
dropped in a week and still be on that week's roster), and the NFL calendar.
"""
from bisect import bisect_right
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone

from hn import _common as C

WORST_MIN_BID = 10          # a "worst spend" has to have cost real money
TOP_AWAY = 10
STARTER_SLOTS_EXCLUDE = ("BN", "IR")
PICK_COLS = ["m", "p", "pos", "w", "src", "bid", "from", "to", "pts", "starts", "st"]
OFF_ROSTER = ("fa", "waivers", None)


def _sunday(y, m, n):
    """The nth Sunday of a month."""
    d = date(y, m, 1)
    return d + timedelta(days=(6 - d.weekday()) % 7 + 7 * (n - 1))


def _pt(ts):
    """An instant (epoch seconds) as US Pacific wall-clock time (US daylight-saving rules)."""
    u = datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
    dst = (datetime.combine(_sunday(u.year, 3, 2), time(10)) <= u
           < datetime.combine(_sunday(u.year, 11, 1), time(9)))
    return u - timedelta(hours=7 if dst else 8)


def _midnight(d):
    """Epoch seconds of 00:00 US Pacific on date d."""
    dst = _sunday(d.year, 3, 2) < d <= _sunday(d.year, 11, 1)
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp()) + (7 if dst else 8) * 3600


def _tuesday(ts):
    """The date of the latest Tuesday (Pacific) on or before ts."""
    d = _pt(ts).date()
    return d - timedelta(days=(d.weekday() - 1) % 7)


def _calendar_week2(year):
    """Week 2's Tuesday by the NFL calendar: eight days after Labor Day (September's first Monday)."""
    d = date(int(year), 9, 1)
    return d + timedelta(days=(0 - d.weekday()) % 7 + 8)


def _week_clock(year, obs, last_week, end_week):
    """obs: [(ts, week)] for adds whose first roster week is certain.
    Returns (week_of(ts), adds it puts in the wrong week, whether week 2 matches the calendar)."""
    cal = _calendar_week2(year)
    later = [(ts, w) for ts, w in obs if w >= 2]
    if later:
        ts0, w0 = min(later)
        week2 = _tuesday(ts0) - timedelta(weeks=w0 - 2)
    else:
        week2 = cal           # no week-2 roster archived yet: go by the calendar
    rolls = []                # rolls[i] = when week i+2 starts
    for w in range(2, max(end_week, last_week) + 2):
        b = _midnight(week2 + timedelta(weeks=w - 2))
        late = [ts for ts, ow in obs if ow < w and ts >= b]
        if late:              # the week ran long: it ends at the next midnight after its last add
            b = _midnight(_pt(max(late)).date() + timedelta(days=1))
        rolls.append(max(b, rolls[-1]) if rolls else b)

    def week_of(ts):
        return 1 + bisect_right(rolls, ts)

    bad = sum(1 for ts, w in obs if week_of(ts) != w)
    return week_of, bad, week2 == cal


def _stints(weeks):
    out = []
    for w in sorted(weeks):
        if out and w == out[-1][1] + 1:
            out[-1][1] = w
        else:
            out.append([w, w])
    return out


def _pos(info):
    return (info.get("pos") or "").replace(",", "/")


def build_season(s, names):
    year = str(s["season"])
    tname = lambda t: names.get((s["teams"].get(str(t)) or {}).get("m"), "?")
    players = s.get("players") or {}
    settings = s.get("settings") or {}
    faab_on = bool(settings.get("uses_faab"))
    rweeks = sorted(int(w) for w in (s.get("rosters") or {}))
    last_week = rweeks[-1] if rweeks else 0
    end_week = int(settings.get("end_week") or 17)
    final = last_week >= end_week

    # games that counted: every regular-season game and the playoff bracket, not consolation
    counted = set()
    for w, games in (s.get("weeks") or {}).items():
        for g in games:
            if g.get("cons"):
                continue
            counted.add((int(w), str(g["a"])))
            counted.add((int(w), str(g["b"])))

    # who had whom, each archived week, and what he scored in the lineup
    on = defaultdict(dict)            # (team, player) -> {week: started pts or None (bench)}
    for w in rweeks:
        for t, rows in s["rosters"][str(w)].items():
            for key, slot, pts in rows:
                started = slot not in STARTER_SLOTS_EXCLUDE and (w, str(t)) in counted
                on[(str(t), key)][w] = float(pts or 0) if started else None

    # every way a player joins a roster, in order, and every way he leaves one
    ins = defaultdict(list)           # (team, player) -> [(ts, kind, pickup index or None)]
    outs = defaultdict(list)          # (team, player) -> [ts he was dropped or traded away]
    for pk in s.get("draft") or []:
        if pk.get("p"):
            ins[(str(pk["team"]), pk["p"])].append((0, "draft", None))
    adds, drops = [], []
    for tx in s.get("transactions") or []:
        if tx.get("status") != "successful":
            continue
        for mv in tx.get("moves") or []:
            if not mv.get("p"):
                continue
            if mv["act"] == "add" and mv.get("to") not in OFF_ROSTER:
                i = len(adds)
                adds.append({"t": str(mv["to"]), "p": mv["p"], "ts": tx["ts"],
                             "src": "waivers" if mv.get("from") == "waivers" else "fa",
                             "faab": tx.get("faab")})
                ins[(str(mv["to"]), mv["p"])].append((tx["ts"], "add", i))
            elif mv["act"] == "trade" and mv.get("to") not in OFF_ROSTER:
                ins[(str(mv["to"]), mv["p"])].append((tx["ts"], "trade", None))
                if mv.get("from") not in OFF_ROSTER:
                    outs[(str(mv["from"]), mv["p"])].append(tx["ts"])
            elif mv["act"] == "drop" and mv.get("from") not in OFF_ROSTER:
                drops.append({"t": str(mv["from"]), "p": mv["p"], "ts": tx["ts"]})
                outs[(str(mv["from"]), mv["p"])].append(tx["ts"])

    # the week clock, checked against every pickup that lines up one-to-one with a roster stint
    obs = []
    for k, ev in ins.items():
        st = _stints(on.get(k, {}))
        if len(st) == len(ev):
            obs += [(e[0], sp[0]) for e, sp in zip(sorted(ev, key=lambda e: e[0]), st) if e[1] == "add"]
    week_of, clock_bad, calendar_ok = _week_clock(year, obs, last_week, end_week)

    # and against every drop: dropped in week w means gone from that team's week-w roster
    # (unless the team took him back later that same week)
    drop_bad = 0
    for d in drops:
        w = week_of(d["ts"])
        if w in on.get((d["t"], d["p"]), {}) and not any(
                e[0] > d["ts"] and week_of(e[0]) == w for e in ins.get((d["t"], d["p"]), [])):
            drop_bad += 1

    # hand each rostered week to the latest way in that came before it
    held = defaultdict(list)          # pickup index -> [(week, started pts or None)]
    orphan = 0
    for k, wk in on.items():
        ev = sorted(((1 if e[1] == "draft" else max(1, week_of(e[0])), e[0], e[2]) for e in ins.get(k, [])),
                    key=lambda e: (e[0], e[1]))
        for w, pts in wk.items():
            owner = [e for e in ev if e[0] <= w]
            if not owner:
                orphan += 1
                continue
            if owner[-1][2] is not None:
                held[owner[-1][2]].append((w, pts))

    pickups = []
    first_bad = 0
    for i, a in enumerate(adds):
        w = max(1, week_of(a["ts"]))
        h = sorted(held.get(i, []))
        pending = w > last_week and not final
        pts = None if pending else C.r2(sum(p for _, p in h if p is not None))
        starts = sum(1 for _, p in h if p is not None)
        if h and h[0][0] != w:
            first_bad += 1
        bid = a["faab"] if a["faab"] is not None else (0 if faab_on else None)
        gone = any(ts > a["ts"] for ts in outs.get((a["t"], a["p"]), []))
        if final and w > end_week:
            state = "post"            # claimed after the last game: nothing left to play
        elif not final and not gone and h and h[-1][0] == last_week:
            state = "open"            # still on that roster
        else:
            state = ""
        info = players.get(a["p"]) or {}
        pickups.append([tname(a["t"]), info.get("name") or "Unknown player", _pos(info),
                        min(w, end_week), a["src"], bid, h[0][0] if h else None, h[-1][0] if h else None,
                        pts, starts, state])

    def ppd(pk):                      # started points per FAAB dollar
        return pk[8] / pk[5]

    scored = [i for i, pk in enumerate(pickups) if pk[8] is not None]
    top = sorted(scored, key=lambda i: (-pickups[i][8], pickups[i][5] or 0, pickups[i][3]))
    worst = sorted([i for i in scored if (pickups[i][5] or 0) >= WORST_MIN_BID],
                   key=lambda i: (ppd(pickups[i]), -pickups[i][5]))

    # per manager; $/pt only counts money on pickups that have played
    mgrs = []
    for t in sorted(s["teams"], key=int):
        who = tname(t)
        mine = [i for i, pk in enumerate(pickups) if pk[0] == who]
        done = [i for i in mine if pickups[i][8] is not None]
        spent = sum(pickups[i][5] or 0 for i in mine) if faab_on else None
        paid = sum(pickups[i][5] or 0 for i in done) if faab_on else None
        pts = C.r2(sum(pickups[i][8] for i in done))
        best = next((i for i in top if pickups[i][0] == who), None)
        bad = [i for i in worst if pickups[i][0] == who]
        mgrs.append({"m": who, "n": len(mine), "done": len(done), "spent": spent,
                     "pend": spent - paid if faab_on else None, "pts": pts,
                     "ppt": C.r2(paid / pts) if faab_on and pts > 0 else None,
                     "best": best if best is not None and pickups[best][8] > 0 else None,
                     "worst": bad[0] if bad else None, "big": len(bad)})
    most = max([m["n"] for m in mgrs] or [0])
    active = sorted(m["m"] for m in mgrs if m["n"] == most and most > 0)

    # The One That Got Away: one row per player, from his first cut that season, everything he
    # scored in other teams' lineups; every manager who cut him (first cut each) is named
    first_drop = {}
    for d in sorted(drops, key=lambda d: d["ts"]):
        first_drop.setdefault((d["t"], d["p"]), d["ts"])
    cuts = defaultdict(list)          # player -> [(ts, team)]
    for (t, p), ts in first_drop.items():
        if week_of(ts) <= end_week:   # a cut after the last game let nothing get away
            cuts[p].append((ts, t))
    away = []
    for p, cs in cuts.items():
        cs.sort()
        ts0, t0 = cs[0]
        w0 = max(1, week_of(ts0))
        per = defaultdict(float)
        for (u, q), wk in on.items():
            if q != p or u == t0:
                continue
            for w, pts in wk.items():
                if w >= w0 and pts is not None:
                    per[tname(u)] += pts
        tot = sum(per.values())
        if tot <= 0:
            continue
        info = players.get(p) or {}
        away.append({"p": info.get("name") or "Unknown player", "pos": _pos(info), "pts": C.r2(tot),
                     "by": [[tname(t), max(1, week_of(ts))] for ts, t in cs],
                     "for": [[u, C.r2(v)] for u, v in sorted(per.items(), key=lambda x: -x[1]) if C.r2(v) != 0]})
    away.sort(key=lambda a: (-a["pts"], a["by"][0][1], a["p"]))

    spent = sum(pk[5] or 0 for pk in pickups) if faab_on else None
    out = {"faab": faab_on, "final": final, "through": last_week, "end": end_week,
           "pickups": pickups, "top": top, "worst": worst,
           "managers": mgrs, "active": {"who": active, "n": most},
           "spent": spent, "pend": sum(pk[5] or 0 for pk in pickups if pk[8] is None) if faab_on else None,
           "away": away[:TOP_AWAY]}
    check = {"clock_obs": len(obs), "clock_bad": clock_bad, "first_week_bad": first_bad,
             "orphan_weeks": orphan, "drops": len(drops), "drop_bad": drop_bad, "calendar_ok": calendar_ok}
    return year, out, check


def build():
    names = C.names()
    seasons, problems, n, nobs, ndrops = {}, [], 0, 0, 0
    for s in C.seasons():
        year, out, chk = build_season(s, names)
        seasons[year] = out
        n += len(out["pickups"])
        nobs += chk["clock_obs"]
        ndrops += chk["drops"]
        if chk["clock_bad"] or chk["first_week_bad"] or chk["drop_bad"]:
            problems.append("%s: week clock off on %d of %d adds and %d of %d drops, first week off on %d" %
                            (year, chk["clock_bad"], chk["clock_obs"], chk["drop_bad"], chk["drops"],
                             chk["first_week_bad"]))
        if not chk["calendar_ok"]:
            problems.append("%s: week 2 doesn't start eight days after Labor Day" % year)
    C.write("faab", {"cols": PICK_COLS, "min_bid": WORST_MIN_BID,
                     "current": max(seasons, key=int) if seasons else None,
                     "seasons": seasons})
    msg = "%d pickups across %d seasons; clock checked on %d adds and %d drops" % (n, len(seasons), nobs, ndrops)
    return msg + ("; CHECK " + "; ".join(problems) if problems else "")
