#!/usr/bin/env python3
"""Check the league's data before it goes live. Every routine runs this before it pushes.

    scripts/check.py                       # everything; exit 1 if anything is wrong
    scripts/check.py --posted KEY [KEY..]  # also require these keys in the post ledger

Each rule below is something that has already gone wrong once, or would put a wrong
number on the site. A failure means DON'T PUSH: fix the data, or report and stop.

    week.json     shape, 6 matchups / 12 managers, bonus never null, no scores before
                  kickoff, nextGame still in the future (hero + footer countdown)
    index.html    a final week with a settled bonus has its BH_AWARD_WINNERS entry
    season.json   12 teams, everyone has played the same number of games, and points
                  for/against agree with the game log in record.json to the cent
    record.json   every recorded week of the current season has 6 games, 12 managers
    voices.json   Wes's record equals his graded locks; one lock / one Game of the Week
                  per week; a lock's quote (the homepage's Wes card) is one short line
    home.json     the homepage's one-liners are one short line each and any 'until' is a
                  real time (scripts/home.py); a note when the week on the board has none
    handles.json  every manager has an entry (blank means "never tag")
    masthead.json the recap, preview and Monday Night Watch each name one of the beat
                  writers, and every story's byline is a writer, a member's full name, or
                  the old house byline (stories from before the masthead)
    story/        every published story has its link-preview card and its hero image
    pages         every section page's og:image points at a card that exists
    header        (note only) every page carries the shared header, and data/stories.json
                  lists the Updates page's stories in order (the header's Booth menu)
    ledger        (--posted) the posts this run claims to have made are recorded
"""
import datetime, json, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEDGER = Path(os.environ.get("BH_POST_STATE", Path.home() / ".bad-hombres-posts.json"))
MANAGERS = {"Jason", "David", "Matt", "Erick", "Chris", "Wes", "Zack", "Adam", "Dylan", "Drew", "Tola", "Hoa"}

fails, notes = [], []
def fail(msg): fails.append(msg)
def note(msg): notes.append(msg)

def load(rel):
    p = ROOT / rel
    try: return json.loads(p.read_text())
    except FileNotFoundError: fail("%s is missing" % rel)
    except json.JSONDecodeError as e: fail("%s is not valid JSON (%s)" % (rel, e))
    return None

def num(v): return isinstance(v, (int, float)) and not isinstance(v, bool)

# ---------------------------------------------------------------- week.json
def check_week(w, winners):
    if w is None: return
    wk, status = w.get("week"), w.get("status")
    if not isinstance(wk, int): fail("week.json: week is %r, not a number" % wk)
    if status not in ("preseason", "live", "final"): fail("week.json: status is %r" % status)
    ms = w.get("matchups") or []
    if len(ms) != 6: fail("week.json: %d matchups, expected 6" % len(ms))
    seen = []
    for i, mu in enumerate(ms, 1):
        for side in ("a", "b"):
            t = mu.get(side) or {}
            if t.get("m") not in MANAGERS: fail("week.json: matchup %d%s manager %r is not a league member" % (i, side, t.get("m")))
            if not t.get("t"): fail("week.json: matchup %d%s has no team name" % (i, side))
            for k in ("s", "p"):
                if not num(t.get(k)): fail("week.json: matchup %d%s %s is %r, not a number" % (i, side, k, t.get(k)))
            seen.append(t.get("m"))
    if len(set(seen)) != 12: fail("week.json: %d distinct managers, expected 12" % len(set(seen)))
    if status == "preseason" and any((mu.get(s) or {}).get("s") for mu in ms for s in ("a", "b")):
        fail("week.json: status is preseason but actual scores are on the board — the week wasn't rolled forward")

    b = w.get("bonus")
    if b is None: fail("week.json: bonus is null — the Bonus Board goes blank (Week 1, Sunday 8pm)")
    elif not isinstance(b, dict): fail("week.json: bonus is %r" % type(b).__name__)
    else:
        for k in ("nm", "cr"):
            if not b.get(k): fail("week.json: bonus has no %s" % k)
        if b.get("week") not in (None, wk): fail("week.json: bonus is for week %s, board is week %s" % (b.get("week"), wk))
        for k in ("actual", "projected"):
            if not isinstance(b.get(k, []), list): fail("week.json: bonus.%s is not a list" % k)
        settled = status == "final" and (b.get("actual") or [])
        if settled and str(wk) not in winners:
            fail("index.html: week %s is final with a settled bonus, but BH_AWARD_WINNERS has no week %s — its Bonus Board card will say \"Being settled\" and the bank won't pay" % (wk, wk))

    g = w.get("nextGame")
    if g is not None:
        try:
            ko = datetime.datetime.fromisoformat(g["kickoff"])
            if ko < datetime.datetime.now(datetime.timezone.utc):
                fail("week.json: nextGame (%s at %s, %s) has already kicked off — the hero and footer count down to nothing" % (g.get("away"), g.get("home"), g["kickoff"]))
        except (KeyError, TypeError, ValueError):
            fail("week.json: nextGame has no usable kickoff: %r" % g)
        if not (ROOT / "assets" / "nfl" / ("%s.png" % str(g.get("away", "")).lower())).exists() or \
           not (ROOT / "assets" / "nfl" / ("%s.png" % str(g.get("home", "")).lower())).exists():
            fail("week.json: nextGame team %s/%s has no logo in assets/nfl/ — check the ESPN abbreviation" % (g.get("away"), g.get("home")))

def award_winners():
    s = (ROOT / "index.html").read_text()
    m = re.search(r"window\.BH_AWARD_WINNERS=\{(.*?)\};", s)
    if not m: fail("index.html: BH_AWARD_WINNERS not found"); return {}
    return {k: True for k in re.findall(r"(\d+)\s*:\s*\{", m.group(1))}

# ---------------------------------------------------------------- season + record
def check_season(season, rec):
    if season is None or rec is None: return
    teams = season.get("teams") or []
    sys.path.insert(0, str(ROOT / "scripts"))
    from bh_league import bonus_bank
    bank = bonus_bank(season.get("weeklyBonus") or 9)
    for t in teams:
        if t.get("bank", 0) != bank.get(t.get("m"), 0):
            fail("season.json: %s's bank is $%s but the recorded bonus winners say $%s — run ./scripts/sync.py season" % (
                t.get("m"), t.get("bank", 0), bank.get(t.get("m"), 0)))
    done = len((rec.get("weeks") or {}).get(str(rec.get("current")), []))
    labels = {r.get("label") for r in season.get("ranks", [])}
    if done and "WK %d" % done not in labels:
        fail("season.json: no Power Lines ranking for Week %d — run ./scripts/power.py" % done)
    # the archive and every Hard Numbers tab must be through the last recorded week too
    if done:
        cur = str(rec.get("current"))
        try:
            arch = json.loads((ROOT / "data" / "archive" / ("%s.json" % cur)).read_text())
            if str(done) not in arch.get("weeks", {}):
                fail("data/archive/%s.json has no Week %d — run ./scripts/archive.py season %s --weeks %d" % (cur, done, cur, done))
        except FileNotFoundError:
            fail("no data/archive/%s.json — run ./scripts/archive.py season %s" % (cur, cur))
        stale = []
        for tab, through in (("standings", lambda d: (d.get("seasons") or {}).get(cur, {}).get("weeks")),
                             ("odds", lambda d: d.get("through_week")),
                             ("pine", lambda d: next((x.get("through") for x in d.get("seasons", []) if str(x.get("season")) == cur), None))):
            try: got = through(json.loads((ROOT / "data" / "numbers" / ("%s.json" % tab)).read_text()))
            except FileNotFoundError: got = None
            if got is not None and int(got) < done: stale.append("%s (through Week %s)" % (tab, got))
        for tab in ("draft", "faab", "trades"):
            f = ROOT / "data" / "numbers" / ("%s.json" % tab)
            if f.exists() and f.stat().st_mtime < (ROOT / "data" / "archive" / ("%s.json" % cur)).stat().st_mtime - 1:
                stale.append("%s (older than the archive)" % tab)
        if stale:
            fail("Hard Numbers are behind Week %d: %s — run ./scripts/numbers.py" % (done, ", ".join(stale)))
    if len(teams) != 12: fail("season.json: %d teams, expected 12" % len(teams))
    if {t.get("m") for t in teams} != MANAGERS: fail("season.json: teams aren't exactly the 12 league members")
    played = {t.get("m"): t.get("w", 0) + t.get("l", 0) + t.get("tie", 0) for t in teams}
    if len(set(played.values())) > 1:
        fail("season.json: managers have played different numbers of games: %s" % played)

    tr = season.get("trades")
    if tr is not None:
        if set(tr) != MANAGERS: fail("season.json: trades should list exactly the 12 managers")
        bad = {m: n for m, n in tr.items() if not isinstance(n, int) or n < 0}
        if bad: fail("season.json: trade counts must be whole numbers: %s" % bad)

    cur = str(rec.get("current") or "")
    weeks = (rec.get("weeks") or {}).get(cur, [])
    M = rec.get("managers") or {}
    for i, wk in enumerate(weeks, 1):
        if len(wk) != 6: fail("record.json: %s week %d has %d games, expected 6" % (cur, i, len(wk)))
        if len({g[0] for g in wk} | {g[2] for g in wk}) != 12: fail("record.json: %s week %d doesn't have 12 distinct managers" % (cur, i))
    if not cur or not weeks: return
    # season.json is settled once a week goes final, and so is the game log — they must agree
    if played and list(played.values())[0] != len(weeks):
        note("season.json shows %d games played; record.json has %d weeks of %s (fine mid-week, wrong after a final run)" % (list(played.values())[0], len(weeks), cur))
        return
    pf, pa = {}, {}
    for wk in weeks:
        for a, sa, b, sb in wk:
            pf[M[a]] = pf.get(M[a], 0) + sa; pa[M[a]] = pa.get(M[a], 0) + sb
            pf[M[b]] = pf.get(M[b], 0) + sb; pa[M[b]] = pa.get(M[b], 0) + sa
    for t in teams:
        m = t.get("m")
        if m in pf and abs(t.get("pf", 0) - pf[m]) > 0.011:
            fail("season.json: %s points for %.2f, game log says %.2f" % (m, t.get("pf", 0), pf[m]))
        if m in pa and "pa" in t and abs(t["pa"] - pa[m]) > 0.011:
            fail("season.json: %s points against %.2f, game log says %.2f" % (m, t["pa"], pa[m]))

# ---------------------------------------------------------------- voices
def check_voices(v):
    if v is None: return
    wes = v.get("wes") or {}
    locks = wes.get("locks") or []
    rec = wes.get("record") or {}
    w = sum(1 for l in locks if l.get("result") == "W"); l_ = sum(1 for l in locks if l.get("result") == "L")
    if (rec.get("w"), rec.get("l")) != (w, l_):
        fail("voices.json: Wes's record is %s-%s but his graded locks say %d-%d" % (rec.get("w"), rec.get("l"), w, l_))
    wks = [l.get("week") for l in locks]
    if len(wks) != len(set(wks)): fail("voices.json: more than one Wes lock for the same week: %s" % wks)
    for l in locks:
        if not re.fullmatch(r"(\w+) over (\w+)", l.get("pick", "")) or \
           any(n not in MANAGERS for n in re.findall(r"\w+", l.get("pick", "")) if n != "over"):
            fail("voices.json: Wes's week %s pick %r isn't '<Manager> over <Manager>'" % (l.get("week"), l.get("pick")))
        q = l.get("quote")
        if q is not None and (not isinstance(q, str) or not q.strip() or "\n" in q or len(q) > 120 or q[:1] in "\"'\u201c\u2018"):
            fail("voices.json: Wes's week %s quote must be one line of 120 characters at most, without its own quote marks (the homepage adds them): %r" % (l.get("week"), q))
    g = [x.get("week") for x in v.get("gotw") or []]
    if len(g) != len(set(g)): fail("voices.json: more than one Game of the Week for the same week: %s" % g)

# ---------------------------------------------------------------- homepage lines
def check_home(h, w):
    if h is None: return
    sys.path.insert(0, str(ROOT / "scripts"))
    from home import problems
    for fatal, msg in problems(h):
        (fail if fatal else note)(msg + " — rewrite it with scripts/home.py")
    wk = (w or {}).get("week")
    if wk and not ((h.get("weeks") or {}).get(str(wk))):
        note("data/home.json has no lines for week %s — the homepage shows its plain fallbacks (scripts/UPDATE_WEEK.md, 'The homepage')" % wk)

# ---------------------------------------------------------------- handles, stories
def check_handles(h):
    if h is None: return
    missing = MANAGERS - set((h.get("handles") or {}).keys())
    if missing: fail("handles.json: no entry for %s (use \"\" for never-tag)" % ", ".join(sorted(missing)))

def check_masthead(m, history):
    if m is None: return
    writers = [w.get("name") for w in m.get("writers") or []]
    if not writers or not all(writers) or len(writers) != len(set(writers)):
        fail("masthead.json: writers must be named, and named once each: %s" % writers); return
    for post in ("recap", "preview", "watch"):
        if (m.get("posts") or {}).get(post) not in writers:
            fail("masthead.json: the %s's writer %r isn't on the masthead" % (post, (m.get("posts") or {}).get(post)))
    members = list(((history or {}).get("fullNames") or {}).values())
    for page in sorted((ROOT / "story").glob("*/index.html")):
        by = re.search(r'<b>From the Booth</b><span>(.*?)</span>', page.read_text(), re.S)
        who = by.group(1).split(" · ")[0].strip() if by else ""
        if who and who != "The Bad Hombres beat" and who not in writers + members:
            fail("story/%s: byline %r is neither a beat writer nor a member" % (page.parent.name, who))

def check_stories():
    for page in sorted((ROOT / "story").glob("*/index.html")):
        slug = page.parent.name
        s = page.read_text()
        if not (page.parent / "og.jpg").exists(): fail("story/%s: no og.jpg link-preview card" % slug)
        m = re.search(r'<div class="st-hero"><img[^>]*src="([^"]+)"', s)
        if not m: fail("story/%s: no hero image" % slug)
        elif not m.group(1).startswith("data:") and not (ROOT / m.group(1).lstrip("/")).exists():
            fail("story/%s: hero %s doesn't exist" % (slug, m.group(1)))

def check_page_cards():
    for rel in ("", "updates", "members", "members/profile", "record", "bylaws", "picks", "numbers"):
        page = ROOT / rel / "index.html"
        m = re.search(r'<meta property="og:image" content="https://bad-hombres\.vercel\.app/([^"]+)"', page.read_text())
        if not m: fail("%s: no og:image" % (rel or "home")); continue
        if not (ROOT / m.group(1)).exists(): fail("%s: its link-preview card %s doesn't exist" % (rel or "home", m.group(1)))

def check_header():
    """Notes, never failures: a stale header or story list looks wrong but puts no wrong number up."""
    stale = []
    for p in sorted(ROOT.rglob("index.html")):
        rel = p.relative_to(ROOT)
        if rel.parts[0] in (".git", "bad-hombres-site 3", "voice", "social"): continue
        s = p.read_text()
        if '<header><div class="wrap hbar">' in s or ("<!-- bh:header -->" in s and "/assets/js/nav.js" not in s):
            stale.append(str(rel))
    if stale: note("old or incomplete header on %s — run scripts/header.py" % ", ".join(stale))
    try:
        listed = [x["slug"] for x in json.loads((ROOT / "data" / "stories.json").read_text())["stories"]]
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        note("data/stories.json is missing or unreadable — run scripts/stories.py"); return
    cards = re.findall(r'<a class="acard" href="/story/([^/"]+)/">', (ROOT / "updates" / "index.html").read_text())
    if cards != listed: note("data/stories.json doesn't match the Updates page — run scripts/stories.py")

def check_ledger(keys):
    try: s = json.loads(LEDGER.read_text())
    except (FileNotFoundError, json.JSONDecodeError): fail("ledger %s is missing or unreadable" % LEDGER); return
    for k in keys:
        if k not in s: fail("ledger: %s is NOT recorded — if it posted, a rerun will post it again" % k)

def main():
    args = sys.argv[1:]
    posted = args[args.index("--posted") + 1:] if "--posted" in args else []
    winners = award_winners()
    check_week(load("data/week.json"), winners)
    check_season(load("data/season.json"), load("data/record.json"))
    check_voices(load("data/voices.json"))
    check_home(load("data/home.json"), load("data/week.json"))
    check_handles(load("data/handles.json"))
    check_masthead(load("data/masthead.json"), load("data/history.json"))
    check_stories()
    check_page_cards()
    check_header()
    if posted: check_ledger(posted)
    for n in notes: print("note: " + n)
    if fails:
        for f in fails: print("FAIL: " + f)
        print("\n%d problem(s). Do not push until they're fixed." % len(fails))
        sys.exit(1)
    print("ok — week.json, season.json, record.json, voices.json, home.json, handles.json, masthead.json, stories%s" % (", ledger" if posted else ""))

if __name__ == "__main__":
    main()
