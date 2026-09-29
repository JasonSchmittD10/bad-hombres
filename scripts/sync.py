#!/usr/bin/env python3
"""Pull the league from Yahoo's API (through the site's own endpoint) into the data files.

    scripts/sync.py week  [--week N] [--dry-run]   # data/week.json: scores, projections, status, bonus
    scripts/sync.py season [--dry-run] [--force]  # data/season.json: records, points, trade counts, bank
    scripts/sync.py next --out FILE               # next week's matchups, for game-of-the-week.py
    scripts/sync.py check                         # is the API answering? (exit 1 if not)
    scripts/sync.py status --week N               # a week's status and games, any week (playoffs too)
    scripts/sync.py standings                     # Yahoo's current standings, rank 1-12

This replaces reading Yahoo's website through Chrome. The routines call it; it never
needs a browser, a signed-in session, or the Mac awake beyond the run itself. The Yahoo
credentials live in Vercel, not here: this calls https://bad-hombres.vercel.app/api/
scoreboard?full=1 (override with BH_API), which talks to Yahoo.

Which week `week` syncs, unless --week says:
  - the week in data/week.json while it's live (finishing it: runs A-D),
  - otherwise Yahoo's current week (rolling forward: Thursday's preview).
It never moves backwards without --week.

What it keeps from the existing file: nextGame / nextWeek / nextKickoff /
nextKickoffLabel (those come from the NFL schedule, not Yahoo), and the note. Once the
week is final (or before it starts), nextWeek / nextKickoff are pointed at the coming
week's first game, taken from nextGame. The bonus
is never set to null; if the API's bonus lists come back empty for the same week and
the file already had leaders, the file's leaders stay.

Refuses — exit 1, nothing written — if the API errors or the answer doesn't have six
matchups between the twelve managers.
"""
import datetime, json, os, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = os.environ.get("BH_API", "https://bad-hombres.vercel.app/api/scoreboard")
MANAGERS = {"Jason", "David", "Matt", "Erick", "Chris", "Wes", "Zack", "Adam", "Dylan", "Drew", "Tola", "Hoa"}
KEEP = ("note", "nextWeek", "nextKickoff", "nextKickoffLabel", "nextGame")

def die(msg): print("sync: " + msg, file=sys.stderr); sys.exit(1)
def load(rel): return json.loads((ROOT / rel).read_text())
def now(): return datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()

def fetch(week=None):
    url = API + "?full=1" + ("&week=%d" % week if week else "")
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"Cache-Control": "no-store"}), timeout=90) as r:
            d = json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        die("the API answered %s: %s" % (e.code, body))
    except Exception as e:
        die("couldn't reach the API (%s): %s" % (url, e))
    if d.get("error"): die("the API reported: %s" % d["error"][:300])
    return d

def valid_matchups(ms, label):
    if len(ms) != 6: die("%s: %d matchups from the API, expected 6" % (label, len(ms)))
    seen = [t.get("m") for mu in ms for t in (mu.get("a") or {}, mu.get("b") or {})]
    stray = [m for m in seen if m not in MANAGERS]
    if stray: die("%s: the API named managers the league doesn't have: %s" % (label, stray))
    if len(set(seen)) != 12: die("%s: %d distinct managers, expected 12" % (label, len(set(seen))))

def side(t, with_score=True):
    out = {"m": t["m"], "t": t.get("t") or ""}
    if with_score: out["s"] = round(float(t.get("s") or 0), 2)
    out["p"] = round(float(t.get("p") or 0), 2)
    return out

def week_cmd(args):
    cur = load("data/week.json")
    forced = "--week" in args
    target = int(args[args.index("--week") + 1]) if forced else (cur["week"] if cur.get("status") == "live" else None)
    d = fetch(target)
    if not forced and target is None and d["week"] < cur.get("week", 0):
        die("Yahoo is on week %s but week.json already has week %s — refusing to move backwards (pass --week)" % (d["week"], cur["week"]))
    valid_matchups(d.get("matchups") or [], "week %s" % d["week"])

    new = {"week": d["week"], "status": d["status"], "updated": now()}
    new["matchups"] = [{"a": side(m["a"]), "b": side(m["b"])} for m in d["matchups"]]
    # the bonus: the API's, but never null and never a regression to empty lists
    b = d.get("bonus") or {}
    old = cur.get("bonus") or {}
    same = old.get("week") == d["week"]
    bonus = {"week": d["week"], "nm": b.get("nm") or (old.get("nm") if same else ""), "cr": b.get("cr") or (old.get("cr") if same else "")}
    for k in ("actual", "projected"):
        bonus[k] = b.get(k) or (old.get(k) if same else None) or []
    new["bonus"] = bonus
    for k in KEEP:
        if k in cur: new[k] = cur[k]
    # the week the countdown and the pick'em lock point at: once this week is final it's the
    # next one, and its first kickoff is the next NFL game on the schedule
    ng = new.get("nextGame") or {}
    upcoming = new["week"] + 1 if new["status"] == "final" else new["week"] if new["status"] == "preseason" else None
    if upcoming and ng.get("kickoff") and datetime.datetime.fromisoformat(ng["kickoff"]) > datetime.datetime.now().astimezone():
        new["nextWeek"], new["nextKickoff"] = upcoming, ng["kickoff"]
        new["nextKickoffLabel"] = (ng.get("label") or new.get("nextKickoffLabel") or "").replace(" at ", " · ")
    new = {k: new[k] for k in ("week", "status", "updated", "note", "matchups", "bonus", "nextWeek", "nextKickoff", "nextKickoffLabel", "nextGame") if k in new}

    moved = "week %s %s -> week %s %s" % (cur.get("week"), cur.get("status"), new["week"], new["status"])
    lead = (bonus["actual"] or [{}])[0]
    print("%s | %s | bonus %s leader %s" % (moved, ", ".join("%s %s-%s %s" % (m["a"]["m"], m["a"]["s"], m["b"]["s"], m["b"]["m"]) for m in new["matchups"]),
                                          bonus.get("nm"), ("%s %s" % (lead.get("who"), lead.get("val"))) if lead else "none"))
    if "--dry-run" in args: print("dry run: nothing written"); return
    (ROOT / "data" / "week.json").write_text(json.dumps(new, indent=1, ensure_ascii=False) + "\n")
    print("wrote data/week.json")

def season_cmd(args):
    w = load("data/week.json")
    if w.get("status") != "final" and "--force" not in args:
        die("week %s is %s — standings are settled once a week is final (the scoreboard's run D). Use --force to sync anyway." % (w.get("week"), w.get("status")))
    d = fetch(w.get("week"))
    rows = d.get("standings") or []
    if len(rows) != 12 or {r["m"] for r in rows} != MANAGERS: die("standings: expected the twelve managers, got %s" % [r.get("m") for r in rows])
    s = load("data/season.json")
    by = {t["m"]: t for t in s.get("teams", [])}
    teams = []
    for r in rows:
        t = dict(by.get(r["m"], {"m": r["m"], "bank": 0}))
        t.update({"t": r["t"], "w": int(r["w"]), "l": int(r["l"]), "tie": int(r["tie"]), "pf": r["pf"], "pa": r["pa"]})
        teams.append(t)
    order = [t["m"] for t in s.get("teams", [])]
    teams.sort(key=lambda t: order.index(t["m"]) if t["m"] in order else 99)   # keep the file's order: small diffs
    # the bank is never typed: it's the weekly bonuses won, from the homepage's recorded winners
    sys.path.insert(0, str(ROOT / "scripts"))
    from bh_league import bonus_bank
    bank = bonus_bank(s.get("weeklyBonus") or 9)
    for t in teams: t["bank"] = bank.get(t["m"], 0)
    s["teams"] = teams
    s["trades"] = {m: int(n) for m, n in sorted((d.get("trades") or {}).items())} or s.get("trades", {})
    s["updated"] = now()
    print("standings through week %s: %s | trades: %s | bank: %s" % (w.get("week"), ", ".join("%s %d-%d" % (t["m"], t["w"], t["l"]) for t in teams),
                                                          {m: n for m, n in s["trades"].items() if n} or "none yet",
                                                          {t["m"]: t["bank"] for t in teams if t["bank"]} or "none yet"))
    if "--dry-run" in args: print("dry run: nothing written"); return
    (ROOT / "data" / "season.json").write_text(json.dumps(s, indent=1, ensure_ascii=False) + "\n")
    print("wrote data/season.json")

def next_cmd(args):
    if "--out" not in args: die("usage: sync.py next --out FILE")
    d = fetch(load("data/week.json").get("week"))
    nx = d.get("next")
    if not nx: die("Yahoo has no next week's matchups yet")
    valid_matchups(nx["matchups"], "week %s" % nx["week"])
    out = {"week": nx["week"], "matchups": [{"a": side(m["a"], False), "b": side(m["b"], False)} for m in nx["matchups"]]}
    Path(args[args.index("--out") + 1]).write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print("week %s matchups: %s" % (nx["week"], ", ".join("%s-%s" % (m["a"]["m"], m["b"]["m"]) for m in out["matchups"])))

def check_cmd(args):
    d = fetch()
    valid_matchups(d.get("matchups") or [], "week %s" % d.get("week"))
    print("ok — Yahoo API answering: week %s, %s, 6 matchups" % (d["week"], d["status"]))

def status_cmd(args):
    wk = int(args[args.index("--week") + 1]) if "--week" in args else None
    d = fetch(wk)   # no six-matchup guard: playoff weeks have fewer games
    games = d.get("matchups") or []
    print("week %s: %s, %d game%s" % (d["week"], d["status"], len(games), "" if len(games) == 1 else "s"))
    for m in games: print("  %s %s - %s %s" % (m["a"]["m"], m["a"].get("s"), m["b"].get("s"), m["b"]["m"]))

def standings_cmd(args):
    rows = sorted(fetch().get("standings") or [], key=lambda r: r.get("rank") or 99)
    if len(rows) != 12: die("standings: expected twelve teams, got %d" % len(rows))
    for r in rows: print("%2s  %-6s %d-%d-%d  pf %.2f  pa %.2f  seed %s" % (r["rank"], r["m"], r["w"], r["l"], r["tie"], r["pf"], r["pa"], r.get("seed")))

def main():
    a = sys.argv[1:]
    cmd = {"week": week_cmd, "season": season_cmd, "next": next_cmd, "check": check_cmd,
           "status": status_cmd, "standings": standings_cmd}.get(a[0] if a else "")
    if not cmd: sys.exit(__doc__)
    cmd(a[1:])

if __name__ == "__main__":
    main()
