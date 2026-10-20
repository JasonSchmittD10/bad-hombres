#!/usr/bin/env python3
"""The facts for Sunday night's Monday Night Watch: what's decided, what's left, who needs what.

    scripts/mnf-watch.py            # prints the brief for the writer
    scripts/mnf-watch.py --json     # the same, as JSON

Reads https://bad-hombres.vercel.app/api/scoreboard?full=1 (override with BH_API): the live
scores, and for every team the starters whose NFL game hasn't finished, with Yahoo's points
so far and a projection (Sleeper's, scored with league scoring). The post itself is written
by the scoreboard routine's run C in the voice the VOICE_GUIDE assigns, then sent with
scripts/thread-post.py text mnf-wN <file>.

"Decided" means neither side has a starter left. "Needs" is the trailing side's deficit;
"has left" is what its remaining starters are projected for. Projections are a guide, not a
promise — the brief says so and the post should too.
"""
import json, os, sys, urllib.request

API = os.environ.get("BH_API", "https://bad-hombres.vercel.app/api/scoreboard")

def fetch():
    req = urllib.request.Request(API + "?full=1", headers={"Cache-Control": "no-store"})
    with urllib.request.urlopen(req, timeout=120) as r: d = json.loads(r.read())
    if d.get("error"): sys.exit("mnf-watch: the API reported: %s" % d["error"])
    if "left" not in d: sys.exit("mnf-watch: the API has no 'left' (deployed before the Monday watch?)")
    return d

def brief(d):
    left = d["left"]
    rows = []
    for m in d["matchups"]:
        a, b = m["a"], m["b"]
        lead, trail = (a, b) if (a.get("s") or 0) >= (b.get("s") or 0) else (b, a)
        la, lt = left.get(lead["m"], []), left.get(trail["m"], [])
        pj = lambda ps: round(sum((p.get("proj") or 0) for p in ps), 1)
        rows.append({
            "lead": lead["m"], "lead_team": lead.get("t"), "lead_score": lead.get("s"),
            "trail": trail["m"], "trail_team": trail.get("t"), "trail_score": trail.get("s"),
            "margin": round((lead.get("s") or 0) - (trail.get("s") or 0), 2),
            "lead_left": [{"name": p["name"], "nfl": p["nfl"], "day": (p.get("game") or {}).get("day"), "proj": p.get("proj")} for p in la],
            "trail_left": [{"name": p["name"], "nfl": p["nfl"], "day": (p.get("game") or {}).get("day"), "proj": p.get("proj")} for p in lt],
            "lead_left_proj": pj(la), "trail_left_proj": pj(lt),
            "decided": not la and not lt,
        })
    rows.sort(key=lambda r: (r["decided"], r["margin"]))
    return {"week": d["week"], "status": d["status"], "matchups": rows}

def show(b):
    print("WEEK %s — the Monday Night Watch brief (%s)" % (b["week"], b["status"]))
    for r in b["matchups"]:
        head = "%s %.2f, %s %.2f (by %.2f)" % (r["lead"], r["lead_score"] or 0, r["trail"], r["trail_score"] or 0, r["margin"])
        if r["decided"]:
            print("\nDECIDED  %s — %s wins" % (head, r["lead"])); continue
        print("\nLIVE     %s" % head)
        for side, who, ps, tot in (("lead", r["lead"], r["lead_left"], r["lead_left_proj"]), ("trail", r["trail"], r["trail_left"], r["trail_left_proj"])):
            names = ", ".join("%s (%s, %s, proj %s)" % (p["name"], p["nfl"], p["day"], p["proj"] if p["proj"] is not None else "?") for p in ps) or "nobody"
            print("   %-5s %s has left: %s — projected %.1f" % (side, who, names, tot))
        need = r["margin"] - r["lead_left_proj"]
        print("   %s needs %.2f more than %s's remaining players score (on projections: %s)" % (
            r["trail"], r["margin"], r["lead"], "within reach" if r["trail_left_proj"] >= need else "a long shot"))
    print("\nProjections are a guide. Write the post from this; don't paste it.")

if __name__ == "__main__":
    b = brief(fetch())
    print(json.dumps(b, indent=1)) if "--json" in sys.argv else show(b)
