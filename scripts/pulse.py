#!/usr/bin/env python3
"""The pulse: sample Yahoo's live win probability through the week, and keep the Choke Ledger.

    scripts/pulse.py sample        # one sample (launchd runs this every 10 minutes)
    scripts/pulse.py settle [N]    # judge week N's chokes now (sample does it by itself at final)
    scripts/pulse.py show          # print the ledger

Yahoo only reports the win probability right now, so "he was 94% to win at 4:10 on
Sunday" exists only if something wrote it down at 4:10 on Sunday. A launchd job,
com.badhombres.pulse, runs `sample` every 10 minutes; it calls the site's scoreboard in
lite mode (one Yahoo request) and records only while games are live, so off-hours
samples cost one request and write nothing.

data/pulse.json:
  {"season": 2026, "threshold": 0.85,
   "weeks": {"<N>": {"samples": [["<iso>", {"<Manager>": wp, ...}], ...],
                     "peak": {"<Manager>": {"wp", "at", "s", "opp_s"}},
                     "final": {"<Manager>": {"s", "opp", "opp_s", "won"}} }},
   "chokes": [{"week", "who", "opp", "peak", "at", "score_then", "opp_then", "final", "opp_final"}]}

A choke is a manager who lost after being at or above the threshold (85%) at some
point while the games were live. Pre-game odds don't count: losing as a projected
favourite is an upset, not a choke.

This file is written locally; the scoreboard routine commits it with its other data.
"""
import datetime, json, os, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "data" / "pulse.json"
API = os.environ.get("BH_API", "https://bad-hombres.vercel.app/api/scoreboard") + "?lite=1"
THRESHOLD = 0.85
MAX_SAMPLES = 400            # ~66 hours of live games at one per 10 minutes, per week

def now(): return datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()

def load():
    if FILE.exists(): return json.loads(FILE.read_text())
    return {"season": None, "threshold": THRESHOLD, "weeks": {}, "chokes": []}

def save(d): FILE.write_text(json.dumps(d, indent=1, ensure_ascii=False) + "\n")

def fetch():
    with urllib.request.urlopen(urllib.request.Request(API, headers={"Cache-Control": "no-store"}), timeout=60) as r:
        return json.loads(r.read())

def settle(d, wk, ms):
    """Record the week's finals and judge chokes. Safe to run twice."""
    w = d["weeks"].setdefault(str(wk), {"samples": [], "peak": {}, "final": {}})
    for m in ms:
        a, b = m["a"], m["b"]
        for me, op in ((a, b), (b, a)):
            w["final"][me["m"]] = {"s": me.get("s"), "opp": op["m"], "opp_s": op.get("s"), "won": (me.get("s") or 0) > (op.get("s") or 0)}
    d["chokes"] = [c for c in d["chokes"] if c["week"] != wk]
    for who, f in w["final"].items():
        pk = w["peak"].get(who)
        if not f["won"] and pk and pk["wp"] >= d.get("threshold", THRESHOLD):
            d["chokes"].append({"week": wk, "who": who, "opp": f["opp"], "peak": pk["wp"], "at": pk["at"],
                                "score_then": pk.get("s"), "opp_then": pk.get("opp_s"), "final": f["s"], "opp_final": f["opp_s"]})
    d["chokes"].sort(key=lambda c: (c["week"], -c["peak"]))
    w["settled"] = now()

def sample():
    try: j = fetch()
    except Exception as e: print("pulse: couldn't reach the API: %s" % e, file=sys.stderr); sys.exit(1)
    ms, wk, status = j.get("matchups") or [], j.get("week"), j.get("status")
    if not ms: print("pulse: no matchups"); return
    d = load()
    season = datetime.date.today().year if datetime.date.today().month >= 8 else datetime.date.today().year - 1
    if d.get("season") not in (None, season): d = {"season": season, "threshold": THRESHOLD, "weeks": {}, "chokes": []}
    d["season"] = season
    w = d["weeks"].get(str(wk))
    if status == "live":
        w = d["weeks"].setdefault(str(wk), {"samples": [], "peak": {}, "final": {}})
        t = now()
        snap = {}
        for m in ms:
            for me, op in ((m["a"], m["b"]), (m["b"], m["a"])):
                if me.get("wp") is None: continue
                snap[me["m"]] = me["wp"]
                pk = w["peak"].get(me["m"])
                if not pk or me["wp"] > pk["wp"]:
                    w["peak"][me["m"]] = {"wp": me["wp"], "at": t, "s": me.get("s"), "opp_s": op.get("s")}
        w["samples"].append([t, snap])
        w["samples"] = w["samples"][-MAX_SAMPLES:]
        save(d); print("pulse: week %s live, sampled %d teams" % (wk, len(snap)))
    elif status == "final" and w is not None and not w.get("settled"):
        settle(d, wk, ms); save(d)
        print("pulse: week %s final — %d choke(s)" % (wk, len([c for c in d["chokes"] if c["week"] == wk])))
    else:
        print("pulse: week %s %s — nothing to record" % (wk, status))

def main():
    a = sys.argv[1:]
    if not a or a[0] not in ("sample", "settle", "show"): sys.exit(__doc__)
    if a[0] == "sample": return sample()
    d = load()
    if a[0] == "settle":
        j = fetch()
        wk = int(a[1]) if len(a) > 1 else j["week"]
        if wk != j.get("week"): sys.exit("pulse: settle needs the week Yahoo is showing (%s)" % j.get("week"))
        if j.get("status") != "final": sys.exit("pulse: week %s is %s, not final" % (wk, j.get("status")))
        settle(d, wk, j["matchups"]); save(d)
    for c in d.get("chokes", []):
        print("week %s: %s was %d%% to beat %s at %s (%s-%s), lost %s-%s" % (c["week"], c["who"], round(c["peak"] * 100), c["opp"], c["at"], c["score_then"], c["opp_then"], c["final"], c["opp_final"]))
    if not d.get("chokes"): print("no chokes yet")

if __name__ == "__main__":
    main()
