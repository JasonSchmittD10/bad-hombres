"""Trade Court: every trade in league history, re-judged by what the players did afterwards.

For each successful trade, each side is credited with what the players it received scored
in its own starting lineup (slot not BN/IR), in every week they sat on the new roster from
the week the trade took effect through the end of that season. A player who was cut and
later picked back up counts again once he's back; if a later trade brings him back to the
same team, that stint belongs to that trade instead. Only games that counted are totaled:
every regular-season week, plus the team's own championship-bracket games in the playoff
weeks (consolation games and playoff byes don't count). The side whose incoming players
started for more points wins; the margin is the difference. A trade in the current season
with fewer than PENDING_WEEKS archived weeks since it took effect is pending.

When a move took effect comes from the week-by-week rosters, not the timestamp (Yahoo's
weekly rosters are end-of-week snapshots). Each player's moves that season (trades, adds,
drops) are lined up, in order, against the rosters he shows up on week by week: a move takes
effect in the first week whose roster reflects it. A move that a later one undid inside the
same week never shows up (the player was flipped or cut before he played for them).

Writes data/numbers/trades.json:
  {through:{season,week}, seasons:[...], current, pending_weeks, deadline:{season:"YYYY-MM-DD"},
   playoffs:{season:[first_week, last_week]},
   trades:[{id, season, week, date, status:"final"|"pending", weeks, winner:0|1|null, margin,
            sides:[{who, reg, po, started, total, players:[{name, pos, arrived, wks, starts,
                    reg, po, started, total, stints:[[from_wk, to_wk, "cut"|"traded"|"gone"|null]],
                    left:"cut"|"traded"|null}]}]}],
   vetoed:[{id, season, date, sides:[{who, players:[{name,pos}]}]}],
   ledger:{"all"|season:[{who, trades, won, lost, tied, pending, pin, pout, net}]},
   idle:{"all"|season:[names who never traded]},
   kpis:{"all"|season:{count, judged, pending, vetoed, lopsided, active, best, worst, proposer}}}
"""
from datetime import datetime, timezone, timedelta

from hn import _common as C

try:
    from zoneinfo import ZoneInfo
    ET = ZoneInfo("America/New_York")
except Exception:                                  # no tz database: Eastern standard time
    ET = timezone(timedelta(hours=-5))

PENDING_WEEKS = 3
NOT_STARTED = ("BN", "IR")


def _date(ts):
    return datetime.fromtimestamp(ts, ET).strftime("%Y-%m-%d")


def _team(x):
    """A move's from/to: a team id string, or None for free agents and waivers."""
    return None if x is None or str(x) in ("fa", "waivers") else str(x)


class Season:
    def __init__(self, s, names):
        self.s = s
        self.names = names
        self.year = int(s["season"])
        st = s["settings"]
        self.po_start = int(st.get("playoff_start_week") or 15)
        self.end = int(st.get("end_week") or 17)
        # final weeks: in both the scoreboard and the rosters
        self.weeks = sorted(int(w) for w in s.get("rosters", {}) if str(w) in s.get("weeks", {}))
        self.last = self.weeks[-1] if self.weeks else 0
        self.complete = self.last >= self.end
        # roster lookup: (week, team) -> {player_key: (slot, pts)}; (week, player) -> team
        self.ros, self.where = {}, {}
        for w, teams in s.get("rosters", {}).items():
            for t, rows in teams.items():
                self.ros[(int(w), str(t))] = {r[0]: (r[1], float(r[2] or 0)) for r in rows}
                for r in rows: self.where[(int(w), r[0])] = str(t)
        # games that counted: every regular-season week; in the playoffs, only the
        # team's own championship-bracket games (no consolation, no byes)
        self.bracket = {}
        for w, games in s.get("weeks", {}).items():
            w = int(w)
            if w < self.po_start: continue
            for g in games:
                if g.get("po") and not g.get("cons"):
                    self.bracket.setdefault(w, set()).update((str(g["a"]), str(g["b"])))
        self.unexplained = 0
        self.moves = self._align()

    def _align(self):
        """player_key -> his successful moves this season, in order, each with the week it took
        effect (wk: the first archived week whose roster reflects it; None = not yet) and whether
        that roster actually showed it (seen: False = a later move undid it inside the week)."""
        moves = {}
        for i, tx in enumerate(self.s.get("transactions", [])):
            if tx.get("status") != "successful": continue
            for m in tx.get("moves", []):
                moves.setdefault(m.get("p"), []).append({"tx": i, "trade": tx.get("type") == "trade",
                                                         "frm": _team(m.get("from")), "to": _team(m.get("to")),
                                                         "wk": None, "seen": False})
        for p, ms in moves.items():
            k = -1                                       # moves applied so far: ms[:k+1]
            for w in self.weeks:
                cur = ms[0]["frm"] if k < 0 else ms[k]["to"]
                here = self.where.get((w, p))
                if here == cur: continue
                j = next((j for j in range(k + 1, len(ms)) if ms[j]["to"] == here), None)
                if j is None:                            # roster and log disagree: wait for them to agree
                    self.unexplained += 1
                    continue
                for q in range(k + 1, j + 1): ms[q]["wk"] = w
                ms[j]["seen"] = True
                k = j
        return moves

    def on(self, p, t, w):
        return p in self.ros.get((w, str(t)), {})

    def counted(self, t, w):
        """'reg', 'po' or None: did team t's week-w lineup count for anything?"""
        if w < self.po_start: return "reg"
        return "po" if str(t) in self.bracket.get(w, ()) else None

    def who(self, t):
        code = (self.s.get("teams", {}).get(str(t)) or {}).get("m")
        return self.names.get(code) or code or "Team %s" % t

    def pname(self, p):
        inf = self.s.get("players", {}).get(p) or {}
        return inf.get("name") or "Unknown player", inf.get("pos") or ""

    def haul(self, p, i, to):
        """What player p, sent to team `to` by transaction #i, did for his new team.
        Returns (row with raw floats, the week the move took effect or None)."""
        name, pos = self.pname(p)
        row = {"name": name, "pos": pos, "arrived": None, "wks": 0, "starts": 0,
               "reg": 0.0, "po": 0.0, "started": 0.0, "total": 0.0, "stints": [], "left": None}
        ms = self.moves.get(p, [])
        j = next((j for j, m in enumerate(ms) if m["tx"] == i and m["to"] == to), None)
        if j is None or ms[j]["wk"] is None:
            return row, None                             # not on the new roster in a finished week yet
        start, later = ms[j]["wk"], ms[j + 1:]
        # a later trade that brings him back to this team takes over from there
        stop = next((m["wk"] for m in later if m["trade"] and m["to"] == to and m["wk"] is not None), None)
        weeks = [w for w in self.weeks if w >= start and (stop is None or w < stop) and self.on(p, to, w)]
        idx = {w: n for n, w in enumerate(self.weeks)}
        for w in weeks:                                  # stints: runs of consecutive weeks on the roster
            if row["stints"] and idx[w] == idx[row["stints"][-1][1]] + 1: row["stints"][-1][1] = w
            else: row["stints"].append([w, w])
        for st in row["stints"]:                         # how each stint ended (None: still there)
            nxt = self.weeks[idx[st[1]] + 1] if idx[st[1]] + 1 < len(self.weeks) else None
            m = None if nxt is None else next((m for m in later if m["frm"] == to and m["wk"] == nxt), None)
            st.append(None if nxt is None else ("traded" if m["trade"] else "cut") if m else "gone")
        if not row["stints"]:                            # gone inside the week he arrived
            m = next((m for m in later if m["frm"] == to and m["wk"] is not None), None)
            row["left"] = ("traded" if m["trade"] else "cut") if m else None
        for w in weeks:
            kind = self.counted(to, w)
            if not kind: continue
            slot, pts = self.ros[(w, to)][p]
            row["wks"] += 1
            row["total"] += pts
            if slot not in NOT_STARTED:
                row["starts"] += 1
                row[kind] += pts
        row["started"] = row["reg"] + row["po"]
        row["arrived"] = row["stints"][0][0] if row["stints"] else None
        return row, start


def _judge_season(S):
    out, vetoed = [], []
    for i, tx in enumerate(S.s.get("transactions", [])):
        if tx.get("type") != "trade": continue
        a, b = str(tx.get("trader")), str(tx.get("tradee"))
        if tx.get("status") == "vetoed":
            vetoed.append({"id": "%d-%s" % (S.year, tx["id"]), "season": S.year, "date": _date(tx["ts"]), "sides": [
                {"who": S.who(t), "players": [dict(zip(("name", "pos"), S.pname(m["p"])))
                                              for m in tx.get("moves", []) if _team(m.get("to")) == t]}
                for t in (a, b)]})
            continue
        if tx.get("status") != "successful": continue    # anything else never happened
        sides, took = [], []
        for t in (a, b):
            players = []
            for m in tx.get("moves", []):
                if _team(m.get("to")) != t: continue
                row, wk = S.haul(m.get("p"), i, t)
                players.append(row)
                if wk is not None: took.append(wk)
            sides.append({"who": S.who(t), "players": players,
                          "reg": sum(pl["reg"] for pl in players), "po": sum(pl["po"] for pl in players),
                          "started": sum(pl["started"] for pl in players), "total": sum(pl["total"] for pl in players)})
        week = min(took) if took else None
        evidence = len([w for w in S.weeks if w >= week]) if week is not None else 0
        status = "pending" if (not S.complete and evidence < PENDING_WEEKS) else "final"
        diff = sides[0]["started"] - sides[1]["started"]
        winner = None if abs(diff) < 0.005 else (0 if diff > 0 else 1)
        for sd in sides:
            for row in [sd] + sd["players"]:
                for k in ("reg", "po", "started", "total"): row[k] = C.r2(row[k])
        out.append({"id": "%d-%s" % (S.year, tx["id"]), "season": S.year, "week": week,
                    "date": _date(tx["ts"]), "status": status, "weeks": evidence,
                    "winner": winner, "margin": C.r2(abs(diff)), "sides": sides})
    return out, vetoed


def _ledger(trades, everyone):
    rows = {}
    for tr in trades:
        for i, sd in enumerate(tr["sides"]):
            r = rows.setdefault(sd["who"], {"who": sd["who"], "trades": 0, "won": 0, "lost": 0, "tied": 0,
                                            "pending": 0, "pin": 0.0, "pout": 0.0, "net": 0.0})
            r["trades"] += 1
            if tr["status"] == "pending":
                r["pending"] += 1
                continue
            mine, theirs = sd["started"], tr["sides"][1 - i]["started"]
            r["pin"] += mine; r["pout"] += theirs; r["net"] += mine - theirs
            if tr["winner"] is None: r["tied"] += 1
            elif tr["winner"] == i: r["won"] += 1
            else: r["lost"] += 1
    for r in rows.values():
        for k in ("pin", "pout", "net"): r[k] = C.r2(r[k])
    out = sorted(rows.values(), key=lambda r: (-r["net"], -r["trades"], r["who"]))
    idle = sorted(n for n in everyone if n not in rows)
    return out, idle


def _kpis(trades, vetoed, ledger):
    judged = [t for t in trades if t["status"] == "final"]
    k = {"count": len(trades), "judged": len(judged), "pending": len(trades) - len(judged),
         "vetoed": len(vetoed), "lopsided": None, "active": None, "best": None, "worst": None,
         "proposer": None}
    decided = [t for t in judged if t["winner"] is not None]
    if decided:
        t = max(decided, key=lambda t: (t["margin"], t["id"]))
        k["lopsided"] = {"id": t["id"], "season": t["season"], "margin": t["margin"],
                         "winner": t["sides"][t["winner"]]["who"], "loser": t["sides"][1 - t["winner"]]["who"]}
    if judged:
        won = sum(1 for t in decided if t["winner"] == 0)
        k["proposer"] = {"won": won, "lost": len(decided) - won, "tied": len(judged) - len(decided)}
    if ledger:
        top = max(r["trades"] for r in ledger)
        k["active"] = {"names": sorted(r["who"] for r in ledger if r["trades"] == top), "count": top}
        scored = [r for r in ledger if r["trades"] > r["pending"]]
        if scored:
            b, w = scored[0], scored[-1]
            k["best"] = {"who": b["who"], "net": b["net"]}
            if len(scored) > 1: k["worst"] = {"who": w["who"], "net": w["net"]}
    return k


def build():
    rec = C.record()
    names = C.names()
    all_trades, all_vetoed, seasons, deadline, playoffs = [], [], [], {}, {}
    through, unexplained = None, 0
    archive = C.seasons()
    for s in archive:
        S = Season(s, names)
        seasons.append(S.year)
        deadline[str(S.year)] = s["settings"].get("trade_end_date")
        playoffs[str(S.year)] = [S.po_start, S.end]
        tr, ve = _judge_season(S)
        all_trades += tr; all_vetoed += ve
        unexplained += S.unexplained
        through = {"season": S.year, "week": S.last}
    # people in the league each season (for the "never traded" line)
    members = {}
    for s in archive:
        members[str(s["season"])] = sorted({names.get(t.get("m"), t.get("m")) for t in s["teams"].values()})
    members["all"] = sorted({n for v in members.values() for n in v})

    ledger, idle, kpis = {}, {}, {}
    for key in ["all"] + [str(y) for y in seasons]:
        tr = all_trades if key == "all" else [t for t in all_trades if str(t["season"]) == key]
        ve = all_vetoed if key == "all" else [v for v in all_vetoed if str(v["season"]) == key]
        ledger[key], idle[key] = _ledger(tr, members.get(key, []))
        kpis[key] = _kpis(tr, ve, ledger[key])

    # newest first
    all_trades.sort(key=lambda t: (t["date"], t["season"], int(t["id"].split("-")[1])), reverse=True)
    data = {"through": through, "current": str(rec.get("current") or seasons[-1]), "seasons": seasons,
            "pending_weeks": PENDING_WEEKS, "deadline": deadline, "playoffs": playoffs,
            "trades": all_trades, "vetoed": all_vetoed, "ledger": ledger, "idle": idle, "kpis": kpis}
    C.write("trades", data)
    k = kpis["all"]
    lop = k["lopsided"] or {}
    back = sorted({t["id"] for t in all_trades for sd in t["sides"] for p in sd["players"] if len(p["stints"]) > 1})
    return ("%d trades judged, %d pending, %d vetoed; most lopsided %s over %s by %s (%s); most active %s (%s); "
            "re-added players counted in %s; %d roster/log mismatches") % (
        k["judged"], k["pending"], k["vetoed"], lop.get("winner"), lop.get("loser"), lop.get("margin"),
        lop.get("season"), "/".join((k["active"] or {}).get("names", [])), (k["active"] or {}).get("count"),
        ", ".join(back) or "none", unexplained)
