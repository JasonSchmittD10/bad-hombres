"""The Pine: points left on the bench.

For every team-week in the archive this finds the OPTIMAL lineup, the highest-scoring
legal lineup from that week's roster (IR players excluded), using the season's own
roster_positions and each player's eligibility list. The search is exact: a small
memoized search over (slot, players used), not a greedy fill, so dual-position players
(RB/WR, QB/TE) land where they're worth the most. A starter can't be benched just to
leave his slot empty, so a lone kicker or defense that went negative stays in; a slot
the manager left empty is filled from the bench when that helps.

Rosters are Yahoo's end-of-week rosters. A bench player the team acquired (add, waiver
claim or trade) after that week's Sunday 1:00 p.m. ET kickoff is left out of the optimal
lineup and the fix: by then most of the lineup had played, and the archive has no kickoff
times to say who hadn't. Players cut during the week aren't on the roster at all.

  left            = optimal - actual (actual = the starters' points = the team's score)
  coaching %      = sum(actual) / sum(optimal), rounded once, to a tenth of a percent
  lineup loss     = a loss where the optimal lineup beats the opponent's ACTUAL score
  fewest moves    = the smallest number of bench players swapped in (the rest of the
                    lineup rearranged freely) that would have won it
  dead men        = starters who scored 0 or less, plus starting slots left empty

The headline is the regular season (weeks before settings.playoff_start_week). Playoff
weeks are done separately, championship bracket only (po and not cons).
"""
import datetime
import itertools
from collections import Counter

from hn import _common as C

FLEX = {"RB", "WR", "TE"}
NOT_STARTING = ("BN", "IR")


def lineup_slots(settings):
    out = []
    for rp in settings["roster_positions"]:
        if rp["pos"] not in NOT_STARTING:
            out += [rp["pos"]] * int(rp["count"])
    return out


def fits(elig, slot):
    if slot in elig:
        return True
    return slot == "W/R/T" and bool(FLEX & set(elig))


# --- the NFL calendar: week N's Sunday and its 1:00 p.m. ET kickoff ---------------------

def eastern(day, hour):
    """A US Eastern wall-clock hour on `day` as a Unix timestamp (daylight time runs from
    the second Sunday of March to the first Sunday of November)."""
    mar = datetime.date(day.year, 3, 8)
    mar += datetime.timedelta(days=(6 - mar.weekday()) % 7)
    nov = datetime.date(day.year, 11, 1)
    nov += datetime.timedelta(days=(6 - nov.weekday()) % 7)
    off = -4 if mar <= day < nov else -5
    tz = datetime.timezone(datetime.timedelta(hours=off))
    return int(datetime.datetime(day.year, day.month, day.day, hour, tzinfo=tz).timestamp())


def week_sunday(year, week):
    """The regular season opens the Thursday after Labor Day, so week 1's Sunday is six
    days after Labor Day, and every week after that is seven more."""
    labor = datetime.date(int(year), 9, 1)
    labor += datetime.timedelta(days=(7 - labor.weekday()) % 7)
    return labor + datetime.timedelta(days=6 + 7 * (int(week) - 1))


def acquisitions(s):
    """(team_id, player_key) -> the times that team acquired the player: adds, waiver
    claims and trades that went through."""
    out = {}
    for t in s.get("transactions") or []:
        if t.get("status") != "successful" or t.get("ts") is None:
            continue
        for m in t.get("moves") or []:
            to = str(m.get("to"))
            if m.get("act") in ("add", "trade") and to not in ("fa", "waivers", "None"):
                out.setdefault((to, m.get("p")), []).append(int(t["ts"]))
    return out


def late_pickup(acq, year, week, tid, pk):
    """True when this team's last pickup of the player, up to the Wednesday after the week
    (Yahoo's end-of-week roster), came after the week's Sunday 1:00 p.m. ET kickoff."""
    sunday = week_sunday(year, week)
    cut = eastern(sunday, 13)
    horizon = eastern(sunday + datetime.timedelta(days=3), 12)
    ts = [x for x in acq.get((str(tid), pk), ()) if x < horizon]
    return bool(ts) and max(ts) > cut


# --- the lineup search -------------------------------------------------------------------

def solve(players, slots, max_moves=None):
    """Best lineup. players: [{pts (int hundredths), elig, starter}].
    Maximizes (slots filled, points), optionally with at most max_moves non-starters.
    Returns (filled, points, [player indexes])."""
    # Exact pruning: two players with the same eligibility (and, when moves are
    # limited, the same starter/bench status) are interchangeable, so only the top N
    # of such a group can matter, N = the number of slots that group can fill.
    groups = {}
    for i, p in enumerate(players):
        key = (tuple(sorted(p["elig"])), p["starter"] if max_moves is not None else None)
        groups.setdefault(key, []).append(i)
    keep = []
    for (elig, _), idx in groups.items():
        room = sum(1 for s in slots if fits(elig, s))
        idx.sort(key=lambda i: -players[i]["pts"])
        keep += idx[:room]
    keep.sort()
    cand = [[j for j in keep if fits(players[j]["elig"], s)] for s in slots]
    n = len(slots)
    memo = {}

    def go(i, used, moves):
        if i == n:
            return (0, 0, ())
        k = (i, used, moves)
        if k in memo:
            return memo[k]
        f, p, pick = go(i + 1, used, moves)          # leave the slot empty
        best = (f, p, pick)
        for j in cand[i]:
            if used >> j & 1:
                continue
            m = moves
            if max_moves is not None and not players[j]["starter"]:
                if m >= max_moves:
                    continue
                m += 1
            f, p, pick = go(i + 1, used | 1 << j, m)
            c = (f + 1, p + players[j]["pts"], (j,) + pick)
            if (c[0], c[1]) > (best[0], best[1]):
                best = c
        memo[k] = best
        return best

    f, p, pick = go(0, 0, 0)
    return f, p, list(pick)


def best(players, slots, max_moves=None):
    """The optimal lineup: the starters plus any mix of bench players (at most max_moves of
    them), where everyone in play fills every slot he can. Returns (points, [indexes]).

    When the starters fill every slot, that's just solve(): the best full lineup. When the
    manager left a slot empty, filling it isn't compulsory (a bench kicker at -3 needn't
    come in), so every subset of the bench is tried; rosters carry six or so bench players,
    so that's a few hundred small searches, for a handful of team-weeks a season."""
    starters = [i for i, p in enumerate(players) if p["starter"]]
    if len(starters) >= len(slots):
        _, pts, pick = solve(players, slots, max_moves)
        return pts, pick
    bench = [i for i, p in enumerate(players) if not p["starter"]]
    top = len(bench) if max_moves is None else min(max_moves, len(bench))
    out = None
    for k in range(top + 1):
        for extra in itertools.combinations(bench, k):
            pool = starters + list(extra)
            _, pts, pick = solve([players[i] for i in pool], slots)
            if out is None or pts > out[0]:       # ties keep the fewer bench players
                out = (pts, sorted(pool[j] for j in pick))
    return out


def hund(x):
    return int(round(float(x or 0) * 100))


def team_week(s, week, tid, slots, acq):
    """One team's week: actual, optimal, the players in play, the optimal pick, the
    starting slots left empty, and how many late pickups were left out."""
    rows = s["rosters"].get(str(week), {}).get(str(tid)) or []
    players, late = [], 0
    for pk, slot, pts in rows:
        if slot == "IR":
            continue
        starter = slot not in NOT_STARTING
        if not starter and late_pickup(acq, s["season"], week, tid, pk):
            late += 1
            continue
        info = s["players"].get(pk) or {}
        players.append({
            "key": pk, "name": info.get("name") or "Unknown", "pos": info.get("pos") or "",
            "elig": info.get("elig") or ([slot] if starter else []),
            "slot": slot, "pts": hund(pts), "starter": starter,
        })
    actual = sum(p["pts"] for p in players if p["starter"])
    optimal, pick = best(players, slots)
    filled = Counter(p["slot"] for p in players if p["starter"])
    empty = []
    for pos, need in Counter(slots).items():
        empty += [pos] * max(0, need - filled.get(pos, 0))
    return {"players": players, "actual": actual, "optimal": optimal, "pick": pick,
            "empty": sorted(empty, key=slots.index), "late": late}


def pl(p):
    return {"name": p["name"], "pos": p["pos"], "pts": p["pts"] / 100.0}


def diff_lineup(tw, pick):
    """Bench players the lineup `pick` brings in, and the starters it sits."""
    P = tw["players"]
    chosen = set(pick)
    ins = sorted((P[j] for j in chosen if not P[j]["starter"]), key=lambda p: -p["pts"])
    outs = sorted((p for j, p in enumerate(P) if p["starter"] and j not in chosen), key=lambda p: p["pts"])
    return [pl(p) for p in ins], [pl(p) for p in outs]


def lineup_loss(tw, opp_score, slots):
    """For a loss the optimal lineup would have won: the fewest bench moves that win it."""
    for k in range(1, len(slots) + 1):
        pts, pick = best(tw["players"], slots, max_moves=k)
        if pts > opp_score:
            ins, outs = diff_lineup(tw, pick)
            return {"moves": len(ins), "moves_score": C.r2(pts / 100.0), "ins": ins, "outs": outs}
    return {"moves": None, "moves_score": None, "ins": [], "outs": []}


def games(s, lo, hi, playoff):
    """(week, team_id, opp_id, score, opp_score) for each team in each matchup in [lo, hi]."""
    out = []
    for w in sorted(s.get("weeks", {}), key=int):
        wk = int(w)
        if wk < lo or wk > hi:
            continue
        for m in s["weeks"][w]:
            if playoff and not (m.get("po") and not m.get("cons")):
                continue
            if not playoff and (m.get("po") or m.get("cons")):
                continue
            a, b = str(m["a"]), str(m["b"])
            out.append((wk, a, b, hund(m.get("as")), hund(m.get("bs")), m.get("winner")))
            out.append((wk, b, a, hund(m.get("bs")), hund(m.get("as")), m.get("winner")))
    return out


def round_names(s):
    """(week, team_id) -> round name for championship-bracket games, for the league's
    six-team, three-week bracket; anything else is just "Playoffs"."""
    st = s["settings"]
    lo = int(st.get("playoff_start_week") or 15)
    out = {}
    six = int(st.get("num_playoff_teams") or 0) == 6 and int(st.get("end_week") or 0) == lo + 2
    lost, won = {}, {}
    for wk in (lo, lo + 1, lo + 2):
        for m in s.get("weeks", {}).get(str(wk), []):
            if not (m.get("po") and not m.get("cons")):
                continue
            a, b, win = str(m["a"]), str(m["b"]), str(m.get("winner"))
            name = "Playoffs"
            if six and wk == lo:
                name = "Quarterfinal"
            elif six and wk == lo + 1:
                name = "5th-place game" if a in lost.get(lo, set()) and b in lost.get(lo, set()) else "Semifinal"
            elif six and wk == lo + 2:
                semis_won = won.get(lo + 1, set())
                semis_lost = lost.get(lo + 1, set())
                if a in semis_won and b in semis_won:
                    name = "Final"
                elif a in semis_lost and b in semis_lost:
                    name = "3rd-place game"
            out[(wk, a)] = out[(wk, b)] = name
            if name != "5th-place game":
                won.setdefault(wk, set()).add(win)
                lost.setdefault(wk, set()).update({a, b} - {win})
            else:
                lost.setdefault(wk, set())
    return out


def blank(who):
    return {"who": who, "games": 0, "actual": 0, "optimal": 0, "losses": 0, "dead": 0,
            "dead_list": [], "worst": None}


def coach_pct(actual, optimal):
    """sum(actual) / sum(optimal) as a percent, rounded half up to one decimal, exactly
    (both sums are whole hundredths of a point)."""
    if optimal <= 0:
        return None
    return (2000 * actual + optimal) // (2 * optimal) / 10.0


def finish(row):
    g = row["games"]
    out = {
        "who": row["who"], "games": g,
        "left": C.r2((row["optimal"] - row["actual"]) / 100.0),
        "actual": C.r2(row["actual"] / 100.0), "optimal": C.r2(row["optimal"] / 100.0),
        "coach_pct": coach_pct(row["actual"], row["optimal"]),
        "per_week": C.r2((row["optimal"] - row["actual"]) / 100.0 / g) if g else None,
        "losses": row["losses"], "dead": row["dead"], "worst": row["worst"],
    }
    if "dead_list" in row:
        out["dead_list"] = row["dead_list"]
    if "seasons" in row:
        out["seasons"] = len(row["seasons"])
    return out


def run_games(s, gl, slots, nm, cache, per, losses, weeks_out, acq, dead=True, rounds=None):
    for wk, tid, oid, sc, osc, winner in gl:
        key = (wk, tid)
        if key not in cache:
            cache[key] = team_week(s, wk, tid, slots, acq)
        tw = cache[key]
        who = nm(tid)
        opp = nm(oid)
        row = per.setdefault(who, blank(who))
        # the archive's score is the truth; the roster sum matches it for every team-week
        actual, optimal = tw["actual"], tw["optimal"]
        left = optimal - actual
        row["games"] += 1
        row["actual"] += actual
        row["optimal"] += optimal
        result = "W" if winner == tid else ("L" if winner == oid else "T")
        ins, _ = diff_lineup(tw, tw["pick"])
        wrow = {"season": int(s["season"]), "week": wk, "who": who, "opp": opp,
                "left": C.r2(left / 100.0), "actual": C.r2(actual / 100.0), "optimal": C.r2(optimal / 100.0),
                "opp_score": C.r2(osc / 100.0), "result": result, "benched": ins[0] if ins else None}
        weeks_out.append(wrow)
        if row["worst"] is None or left > hund(row["worst"]["left"]):
            row["worst"] = {"season": wrow["season"], "week": wk, "left": wrow["left"],
                            "actual": wrow["actual"], "optimal": wrow["optimal"]}
        if dead:
            for p in tw["players"]:
                if p["starter"] and p["pts"] <= 0:
                    row["dead"] += 1
                    row["dead_list"].append({"week": wk, "name": p["name"], "pos": p["pos"], "pts": p["pts"] / 100.0})
            for pos in tw["empty"]:
                row["dead"] += 1
                row["dead_list"].append({"week": wk, "empty": True, "pos": pos, "pts": 0.0})
        if result == "L" and optimal > osc:
            row["losses"] += 1
            wrow["lineup_loss"] = True
            ll = {"season": int(s["season"]), "week": wk, "who": who, "opp": opp,
                  "score": C.r2(actual / 100.0), "opp_score": C.r2(osc / 100.0),
                  "optimal": C.r2(optimal / 100.0), "margin": C.r2((osc - actual) / 100.0)}
            if rounds is not None:
                ll["round"] = rounds.get((wk, tid), "Playoffs")
            ll.update(lineup_loss(tw, osc, slots))
            losses.append(ll)


def build():
    codes = C.names()
    out_seasons = []
    career = {}
    all_weeks = []
    playoff_losses = []
    total_tw = 0
    late_total = 0
    for s in C.seasons():
        year = int(s["season"])
        st = s["settings"]
        slots = lineup_slots(st)
        po_start = int(st.get("playoff_start_week") or 15)
        end = int(st.get("end_week") or 17)
        teams = s.get("teams", {})
        acq = acquisitions(s)

        def nm(tid, teams=teams):
            code = (teams.get(str(tid)) or {}).get("m")
            return codes.get(code, code) or "Unknown"

        cache = {}
        per, losses, weeks = {}, [], []
        run_games(s, games(s, 1, po_start - 1, False), slots, nm, cache, per, losses, weeks, acq)
        ppo, plosses, pweeks = {}, [], []
        run_games(s, games(s, po_start, end, True), slots, nm, cache, ppo, plosses, pweeks, acq, dead=False,
                  rounds=round_names(s))
        total_tw += len(weeks) + len(pweeks)
        late_total += sum(tw["late"] for tw in cache.values())
        reg_weeks = sorted({w["week"] for w in weeks})

        rows = [finish(r) for r in per.values()]
        rows.sort(key=lambda r: (-(r["left"] or 0), r["who"]))
        losses.sort(key=lambda x: (x["week"], x["who"]))
        prows = [finish(r) for r in ppo.values()]
        prows.sort(key=lambda r: (-(r["left"] or 0), r["who"]))
        for x in plosses:
            playoff_losses.append(x)

        out_seasons.append({
            "season": year,
            "lineup": slots,
            "weeks": len(reg_weeks),
            "through": reg_weeks[-1] if reg_weeks else None,
            "reg_weeks": po_start - 1,
            "complete": len(reg_weeks) >= po_start - 1,
            "managers": rows,
            "lineup_losses": losses,
            "league_left": C.r2(sum(r["optimal"] - r["actual"] for r in per.values()) / 100.0),
            "playoffs": {"managers": prows, "lineup_losses": sorted(plosses, key=lambda x: (x["week"], x["who"]))},
        })
        all_weeks += weeks
        for r in per.values():
            c = career.setdefault(r["who"], {"who": r["who"], "games": 0, "actual": 0, "optimal": 0,
                                             "losses": 0, "dead": 0, "worst": None, "seasons": set()})
            c["games"] += r["games"]
            c["actual"] += r["actual"]
            c["optimal"] += r["optimal"]
            c["losses"] += r["losses"]
            c["dead"] += r["dead"]
            c["seasons"].add(year)
            if r["worst"] and (c["worst"] is None or hund(r["worst"]["left"]) > hund(c["worst"]["left"])):
                c["worst"] = r["worst"]

    at = [finish(c) for c in career.values()]
    at.sort(key=lambda r: (-(r["left"] or 0), r["who"]))
    worst = sorted(all_weeks, key=lambda w: (-hund(w["left"]), w["season"], w["week"], w["who"]))[:10]
    out_seasons.sort(key=lambda x: -x["season"])
    played = [x["season"] for x in out_seasons if x["weeks"]]   # a season with no final game isn't in the span
    data = {
        "seasons": out_seasons,
        "alltime": {
            "first": min(played) if played else None,
            "last": max(played) if played else None,
            "managers": at,
            "worst_weeks": worst,
            "playoff_losses": sorted(playoff_losses, key=lambda x: (-x["season"], x["week"], x["who"])),
        },
    }
    C.write("pine", data)
    tl = sum(len(x["lineup_losses"]) for x in out_seasons)
    top = at[0] if at else None
    return "%d team-weeks, %d seasons, %d lineup losses (+%d playoff), %d late pickups left out; career pine leader %s %.2f" % (
        total_tw, len(out_seasons), tl, len(playoff_losses), late_total,
        top["who"] if top else "-", top["left"] if top else 0)
