#!/usr/bin/env python3
"""The pulse, from the Mac's side: ping the site to sample Yahoo's live win probability.

    scripts/pulse.py sample       # take a sample (launchd runs this every 5 minutes)
    scripts/pulse.py settle N     # judge week N's chokes now, then pull the ledger
    scripts/pulse.py pull         # write the Choke Ledger into data/chokes.json
    scripts/pulse.py show         # print the ledger
    scripts/pulse.py seed         # one-time: send samples taken locally to the server

The site does the work: POST https://bad-hombres.vercel.app/api/pulse reads Yahoo and
stores the sample in the league's gist, so the charts on the site update without a
deploy. This script only knocks on the door. A launchd job, com.badhombres.pulse, runs
`sample` every 5 minutes; outside live games the server records nothing.

data/chokes.json is a committed copy of the ledger — {season, threshold, chokes, weeks
(the weeks judged)} — written by `pull`/`settle`, and committed by the scoreboard
routine's run D. The live version is always GET /api/pulse.
"""
import json, os, sys, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = os.environ.get("BH_PULSE", "https://bad-hombres.vercel.app/api/pulse")
LEDGER = ROOT / "data" / "chokes.json"
LOCAL = ROOT / "data" / "pulse.json"          # samples from before the server sampled (gitignored)

def call(method="GET", query="", body=None):
    data = json.dumps(body).encode() if body is not None else (b"" if method == "POST" else None)
    req = urllib.request.Request(API + query, data=data, method=method,
                                 headers={"Content-Type": "application/json", "Cache-Control": "no-store"})
    try:
        with urllib.request.urlopen(req, timeout=90) as r: return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit("pulse: the site answered %s: %s" % (e.code, e.read().decode("utf-8", "replace")[:300]))
    except Exception as e:
        sys.exit("pulse: couldn't reach the site: %s" % e)

def pull():
    d = call("GET", "?t=%d" % os.getpid())
    led = {"season": d["season"], "threshold": d["threshold"], "chokes": d["chokes"],
           "weeks": sorted(w["week"] for w in d["weeks"] if w["settled"])}
    old = json.loads(LEDGER.read_text()) if LEDGER.exists() else None
    if old != led: LEDGER.write_text(json.dumps(led, indent=1, ensure_ascii=False) + "\n")
    return led

def show(led):
    for c in led["chokes"]:
        print("week %s: %s was %d%% to beat %s (%s-%s at %s), lost %s-%s" % (
            c["week"], c["who"], round(c["peak"] * 100), c["opp"], c["score_then"], c["opp_then"], c["at"], c["final"], c["opp_final"]))
    if not led["chokes"]: print("no chokes yet (weeks judged: %s)" % (led["weeks"] or "none"))

def main():
    a = sys.argv[1:]
    cmd = a[0] if a else ""
    if cmd == "sample":
        r = call("POST"); print("pulse:", json.dumps(r))
    elif cmd == "settle":
        if len(a) < 2: sys.exit("usage: pulse.py settle N")
        r = call("POST", "?settle=%d" % int(a[1])); print("pulse:", json.dumps(r)[:300]); show(pull())
    elif cmd == "pull":
        show(pull())
    elif cmd == "show":
        d = call("GET"); show({"chokes": d["chokes"], "weeks": [w["week"] for w in d["weeks"] if w["settled"]]})
    elif cmd == "seed":
        if not LOCAL.exists(): sys.exit("pulse: no local samples to send")
        d = json.loads(LOCAL.read_text())
        for k, w in d.get("weeks", {}).items():
            r = call("POST", "?seed=1", {"week": int(k), "samples": w.get("samples", []), "peak": w.get("peak", {})})
            print("pulse: week %s -> %s" % (k, json.dumps(r)))
    else:
        sys.exit(__doc__)

if __name__ == "__main__":
    main()
