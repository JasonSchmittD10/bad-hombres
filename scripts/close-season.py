#!/usr/bin/env python3
"""Close out a season: draft every payout, then — once Jason confirms — write it all down.

    scripts/close-season.py draft 2026 [--places JAS,DAV,...] [--commish Zack]
    scripts/close-season.py apply 2026

DRAFT reads the rules and the season, and writes data/closeout-<year>.json:
  - prize amounts from the by-laws, section 11.3 (Prize Distribution) — parsed from
    bylaws/index.html, so a change to the rules changes the payouts
  - 1st / 2nd / 3rd from the final places (record.json "place", or --places, best first,
    all twelve manager codes)
  - the season awards the by-laws list, computed from the regular season in record.json
    (weeks 1-14): most points, most points against, most points in a single week, fewest
    points. A tie shares the award and splits the money.
  - the fourteen weekly bonuses from index.html BH_AWARD_WINNERS ("A & B" is a tie)
  - The Commissioner's Award from --commish; it is Jason's call and is never guessed
  It prints the table, checks it against the pot, and leaves "confirmed": false.

APPLY refuses unless the draft is complete (no TBD) and "confirmed" is true — Jason flips
it, or tells a session to. Then it writes the year into history.json's money and awards
(build-history.py re-validates every member's total), sets the final places and champion
in record.json, closes the season there, rebuilds the record book, and puts the champion
at the head of the Hall of Champions ticker on every page.

Money in the ledger has always come from the official payout post. The draft is the
post's first version; nothing is written to the ledger until Jason says it's right.
"""
import html, json, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REGULAR_WEEKS = 14

def die(msg): print("close-season: " + msg, file=sys.stderr); sys.exit(1)
def load(rel): return json.loads((ROOT / rel).read_text())
def save(rel, obj, compact=False):
    (ROOT / rel).write_text(json.dumps(obj, separators=(",", ":")) + "\n" if compact
                            else json.dumps(obj, indent=2, ensure_ascii=False) + "\n")

# ---------------------------------------------------------------- the rules
def bylaws():
    """Section 11.3 of the by-laws, as numbers."""
    t = html.unescape(re.sub(r"<[^>]+>", " ", (ROOT / "bylaws" / "index.html").read_text()))
    t = re.sub(r"\s+", " ", t)
    sec = re.search(r"11\.3 Prize Distribution(.*?)11\.4", t)
    if not sec: die("can't find section 11.3 Prize Distribution in bylaws/index.html")
    s = sec.group(1)
    def money(pat, what):
        m = re.search(pat, s)
        if not m: die("by-laws 11.3: can't find %s" % what)
        return float(m.group(1))
    rules = {
        "places": [money(r"1st Place[^$]*\$(\d+)", "1st Place"),
                   money(r"2nd Place[^$]*\$(\d+)", "2nd Place"),
                   money(r"3rd Place[^$]*\$(\d+)", "3rd Place")],
        "most_points": money(r"Most Points Scored[^$]*\$(\d+)", "Most Points Scored"),
        "most_against": money(r"You Got Dicked[^$]*\$(\d+)", "You Got Dicked"),
        "commish": money(r"Commissioner.s Award[^$]*\$(\d+)", "The Commissioner's Award"),
        "best_week": money(r"Most Points in a Single Week[^$]*\$(\d+)", "Most Points in a Single Week"),
        "fewest": money(r"You Suck[^$]*\$(\d+)", "You Suck"),
        "gm": money(r"GM of the Year[^$]*\$(\d+)", "GM of the Year"),
        "weekly": money(r"Weekly Awards[^$]*\$(\d+)", "the weekly award"),
    }
    buy = re.search(r"Buy-in: \$(\d+) per team", t)
    rules["buy_in"] = float(buy.group(1)) if buy else die("by-laws: can't find the buy-in")
    return rules

# ---------------------------------------------------------------- the season
def regular_season(rec, year):
    weeks = (rec.get("weeks") or {}).get(str(year), [])[:REGULAR_WEEKS]
    if len(weeks) < REGULAR_WEEKS:
        die("record.json has %d regular-season weeks of %s; the close-out needs all %d" % (len(weeks), year, REGULAR_WEEKS))
    pf, pa, games = {}, {}, []
    for i, wk in enumerate(weeks, 1):
        for a, sa, b, sb in wk:
            pf[a] = pf.get(a, 0) + sa; pa[a] = pa.get(a, 0) + sb
            pf[b] = pf.get(b, 0) + sb; pa[b] = pa.get(b, 0) + sa
            games += [(sa, a, i), (sb, b, i)]
    return pf, pa, games

def leaders(d, best):
    top = max(d.values()) if best else min(d.values())
    return sorted(c for c, v in d.items() if abs(v - top) < 0.005), round(top, 2)

def weekly_winners(codes_by_name):
    s = (ROOT / "index.html").read_text()
    m = re.search(r"window\.BH_AWARD_WINNERS=\{(.*?)\};", s)
    if not m: die("index.html: BH_AWARD_WINNERS not found")
    out = {}
    for wk, who in re.findall(r"(\d+)\s*:\s*\{\s*who\s*:\s*\"([^\"]+)\"", m.group(1)):
        names = [n.strip() for n in who.split("&")]
        unknown = [n for n in names if n not in codes_by_name]
        if unknown: die("BH_AWARD_WINNERS week %s: %s isn't a manager" % (wk, unknown))
        out[int(wk)] = [codes_by_name[n] for n in names]
    names = dict(re.findall(r"\{w:\s*(\d+),.*?nm:\"([^\"]+)\"", s))
    return out, {int(k): v for k, v in names.items()}

# ---------------------------------------------------------------- draft
def draft(year, places_arg, commish):
    rules, rec, hist = bylaws(), load("data/record.json"), load("data/history.json")
    M = rec["managers"]; code = {n: c for c, n in M.items()}
    if str(year) in (hist.get("money", {}).get("buyIns") or {}):
        die("history.json already has %s in the money ledger — it's closed" % year)

    places = places_arg or (rec.get("place") or {}).get(str(year))
    if not places: die("no final places for %s: pass --places with all twelve codes, best first" % year)
    if sorted(places) != sorted(M): die("--places must list each of the twelve codes once: %s" % sorted(M))

    pf, pa, games = regular_season(rec, year)
    awards = []
    def add(t, name, who, amount, **k):
        awards.append(dict({"year": year, "type": t, "name": name, "who": who, "amount": amount}, **k))
    for i, amt in enumerate(rules["places"]):
        add("place", ["1st Place", "2nd Place", "3rd Place"][i], [places[i]], amt, place=i + 1)

    w, v = leaders(pf, True);  add("season", "Most Points Scored (regular season)", w, rules["most_points"], stat=v)
    w, v = leaders(pa, True);  add("season", "You Got Dicked (most points against)", w, rules["most_against"], stat=v)
    top = max(g[0] for g in games)
    add("season", "Most Points in a Single Week", sorted({g[1] for g in games if abs(g[0] - top) < 0.005}),
        rules["best_week"], stat=round(top, 2), weeks=sorted({g[2] for g in games if abs(g[0] - top) < 0.005}))
    w, v = leaders(pf, False); add("season", "You Suck (fewest points)", w, rules["fewest"], stat=v)
    trades = (load("data/season.json").get("trades") or {})
    if trades and max(trades.values()) > 0:
        w, v = leaders({code[m]: n for m, n in trades.items()}, True)
        add("season", "GM of the Year (most trades)", w, rules["gm"], stat=v)
    else:
        add("season", "GM of the Year (most trades)", ["TBD"], rules["gm"])   # nobody traded: Jason's call
    if commish:
        if commish not in code: die("--commish %r isn't a manager" % commish)
        add("season", "The Commissioner's Award", [code[commish]], rules["commish"])
    else:
        add("season", "The Commissioner's Award", ["TBD"], rules["commish"])

    wins, names = weekly_winners(code)
    for wk in range(1, REGULAR_WEEKS + 1):
        add("weekly", names.get(wk, "Week %d bonus" % wk), wins.get(wk, ["TBD"]), rules["weekly"], week=wk)

    pot = rules["buy_in"] * len(M)
    total = round(sum(a["amount"] for a in awards), 2)
    per = {c: 0.0 for c in M}
    for a in awards:
        for c in a["who"]:
            if c in per: per[c] += a["amount"] / len(a["who"])
    tbd = [a["name"] for a in awards if "TBD" in a["who"]]
    out = {"year": year, "confirmed": False, "places": places, "buyIn": rules["buy_in"], "pot": pot,
           "total": total, "awards": awards, "byMember": {c: round(v, 2) for c, v in per.items()},
           "tbd": tbd, "note": "Draft from the by-laws (11.3) and the season's data. Nothing is in the ledger "
                               "until this says \"confirmed\": true and close-season.py apply runs."}
    save("data/closeout-%s.json" % year, out)

    print("%s close-out DRAFT — data/closeout-%s.json\n" % (year, year))
    for a in awards:
        who = " & ".join(M.get(c, c) for c in a["who"])
        extra = (" (%s)" % a["stat"]) if "stat" in a else (" (wk %d)" % a["week"]) if a["type"] == "weekly" else ""
        print("  %-44s %-18s $%s%s" % (a["name"][:44], who, ("%g" % a["amount"]), extra))
    print("\n  paid out $%.2f of a $%.2f pot%s" % (total, pot, "" if abs(total - pot) < 0.01 else
          "  <-- does NOT match the pot (by-laws 11.3 adds up to $%.2f)" % total))
    print("\n  by member: " + ", ".join("%s $%.2f" % (M[c], v) for c, v in sorted(per.items(), key=lambda x: -x[1]) if v))
    if tbd: print("\n  STILL TBD: " + ", ".join(tbd) + " — the draft can't be applied until these are filled")
    print("\nNext: Jason checks it, then set \"confirmed\": true and run  scripts/close-season.py apply %s" % year)

# ---------------------------------------------------------------- apply
TICK_SVG = None
def ticker(rec):
    """The Hall of Champions strip, newest first, written from record.json."""
    M, full, teams = rec["managers"], rec["fullNames"], rec["teams"]
    items = [(y, full[c], teams[y][c]) for y, c in sorted(rec["champ"].items(), reverse=True)]
    items.append(("2020", "Erick DeLeon", "King in the North"))   # before the game log began
    spans = []
    for i, (y, who, team) in enumerate(items):
        reign = i == 0
        spans.append('<span class="tk%s">%s<b>%s</b> <span class="mgr-n">%s</span> <span class="team-n">%s</span>%s</span>' % (
            " reign" if reign else "", TICK_SVG, y, html.escape(who), html.escape(team),
            ' <span class="team-n">·</span> <span class="mgr-n">Reigning</span>' if reign else ""))
    return "".join(spans) * 2        # twice, so the strip scrolls without a seam

def apply(year):
    global TICK_SVG
    path = ROOT / "data" / ("closeout-%s.json" % year)
    if not path.exists(): die("no draft at data/closeout-%s.json — run draft first" % year)
    d = json.loads(path.read_text())
    if d.get("tbd") or any("TBD" in a["who"] for a in d["awards"]): die("the draft still has TBD awards: %s" % d.get("tbd"))
    if d.get("confirmed") is not True: die("the draft isn't confirmed — Jason sets \"confirmed\": true once the payouts are right")

    rec, hist = load("data/record.json"), load("data/history.json")
    y = str(year)
    if y in hist["money"]["buyIns"]: die("%s is already in the money ledger" % year)

    # the money ledger: every award, then each member's year, gross, paid and net
    hist["awards"] += d["awards"]
    m = hist["money"]
    m["buyIns"][y] = d["buyIn"]; m["through"] = year
    m["paidOut"] = round(m["paidOut"] + d["total"], 2)
    for c, v in d["byMember"].items():
        mem = m["members"].setdefault(c, {"gross": 0, "paid": 0, "net": 0, "byYear": {}})
        if v: mem["byYear"][y] = v
        mem["gross"] = round(mem["gross"] + v, 2)
        mem["paid"] = round(mem["paid"] + d["buyIn"], 2)
        mem["net"] = round(mem["gross"] - mem["paid"], 2)
    save("data/history.json", hist)

    # the record book: final places, the champion, and the season is no longer "current"
    rec.setdefault("place", {})[y] = d["places"]
    rec.setdefault("champ", {})[y] = d["places"][0]
    if str(rec.get("current")) == y: rec.pop("current")
    save("data/record.json", rec, compact=True)
    r = subprocess.run([str(ROOT / "scripts" / "build-history.py"), "build"], capture_output=True, text=True)
    if r.returncode: die("build-history refused the ledger:\n" + r.stderr)

    # the Hall of Champions strip on every page
    pages = [p for p in ROOT.rglob("index.html") if ".git" not in p.parts and "bad-hombres-site 3" not in str(p)]
    changed = 0
    for p in pages:
        s = p.read_text()
        # the track holds only <span>s, so its own </div> ends it, whatever wraps it
        m2 = re.search(r'<div class="ticker-track">(.*?)</div>', s, re.S)
        if not m2: continue
        if TICK_SVG is None:
            TICK_SVG = re.search(r'<span class="tk[^"]*">(<svg.*?</svg>)', m2.group(1), re.S).group(1)
        p.write_text(s[:m2.start(1)] + ticker(rec) + s[m2.end(1):]); changed += 1
    # the Record Book and profile cards list the champions and the reigning champ's numbers
    subprocess.run([str(ROOT / "scripts" / "social-render.py"), "og-pages"], capture_output=True, text=True)
    print("closed %s: %d awards and $%.2f in the ledger, %s champion, record book rebuilt, ticker updated on %d pages"
          % (year, len(d["awards"]), d["total"], rec["fullNames"][d["places"][0]], changed))

def main():
    a = sys.argv[1:]
    if len(a) < 2 or a[0] not in ("draft", "apply") or not a[1].isdigit(): sys.exit(__doc__)
    opt = lambda k: a[a.index(k) + 1] if k in a else None
    if a[0] == "draft":
        draft(int(a[1]), opt("--places").split(",") if opt("--places") else None, opt("--commish"))
    else:
        apply(int(a[1]))

if __name__ == "__main__":
    main()
