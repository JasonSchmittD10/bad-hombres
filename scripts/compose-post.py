#!/usr/bin/env python3
"""Compose a league-thread post from the site's own data.

    scripts/compose-post.py opener|progress|recap|bonus

Writes the message to stdout and, for `bonus`, prints the attachment path on
stderr as "ATTACH:<path>". Exits non-zero when there is nothing worth posting
so the caller can skip silently rather than send something wrong.
"""
import json, os, re, sys, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://bad-hombres.vercel.app"

def load(name):
    p = ROOT / "data" / name
    if not p.exists(): sys.exit("missing data/%s" % name)
    return json.loads(p.read_text())

def bail(why):
    print(why, file=sys.stderr); sys.exit(2)

def fmt(v):
    return ("%.2f" % v) if isinstance(v, (int, float)) else str(v)

def opener():
    w = load("week.json")
    ms = w.get("matchups") or []
    if not ms: bail("no matchups")
    # Only announce a week that has not been played. If any actual score is on
    # the board these are last week's fixtures and posting them would be wrong.
    if any((m["a"].get("s") or 0) or (m["b"].get("s") or 0) for m in ms):
        bail("week.json still holds a played week - refresh before posting an opener")
    lines = ["\U0001F3C8 WEEK %s IS UP" % w.get("week"), ""]
    for m in ms:
        a, b = m["a"], m["b"]
        lines.append("%s  vs  %s" % (a["t"], b["t"]))
    when = w.get("nextKickoffLabel") if w.get("nextWeek") == w.get("week") else None
    if when: lines += ["", "First game: %s" % when]
    lines += ["", "%s/" % SITE]
    return "\n".join(lines)

def progress():
    w = load("week.json")
    ms = w.get("matchups") or []
    if not ms: bail("no matchups")
    if not any((m["a"].get("s") or 0) or (m["b"].get("s") or 0) for m in ms):
        bail("no live scores yet")
    lines = ["SUNDAY NIGHT \u2014 WEEK %s" % w.get("week"), ""]
    for m in ms:
        a, b = m["a"], m["b"]
        # no column padding: iMessage renders proportionally, so it never lines up
        first, second = (a, b) if (a.get("s") or 0) >= (b.get("s") or 0) else (b, a)
        lines.append("%s %s \u2014 %s %s" % (first["t"], fmt(first.get("s")),
                                              second["t"], fmt(second.get("s"))))
    lines += ["", "Monday night still to play. %s/" % SITE]
    return "\n".join(lines)

def latest_story():
    html = (ROOT / "index.html").read_text()
    m = re.search(r'<a class="feature" href="(/story/[^"]+/)"', html)
    if not m: bail("no featured story on the homepage")
    slug = m.group(1)
    page = ROOT / slug.strip("/") / "index.html"
    if not page.exists(): bail("featured story file missing: %s" % slug)
    body = page.read_text()
    t = re.search(r'<h1 class="st-h1">(.*?)</h1>', body, re.S)
    # the lede paragraph, else the first paragraph of the body
    strip = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s)).strip()
    body_m = re.search(r'<div class="st-body">(.*?)</div>', body, re.S)
    paras = [strip(x) for x in re.findall(r'<p[^>]*>(.*?)</p>', body_m.group(1) if body_m else body, re.S)]
    paras = [x for x in paras if x]
    if not paras: bail("could not find an intro paragraph in %s" % slug)
    # a one-line lede makes a thin post, so keep taking paragraphs until it
    # actually says something
    intro, i = paras[0], 1
    while len(intro) < 160 and i < len(paras):
        intro += "\n\n" + paras[i]; i += 1
    return slug, strip(t.group(1)) if t else "", intro

def recap():
    slug, title, intro = latest_story()
    parts = []
    if title: parts.append(title.upper())
    parts += ["", intro, "", "Read the rest: %s%s" % (SITE, slug)]
    return "\n".join(parts)

def bonus():
    w = load("week.json")
    if w.get("status") != "final": bail("week is not final yet")
    b = w.get("bonus") or {}
    winners = b.get("actual") or []
    if not winners: bail("bonus not settled")
    top = winners[0]
    wk = b.get("week") or w.get("week")
    art = ROOT / "assets" / "awards" / ("wk%s.jpg" % wk)
    lines = ["🏆 WEEK %s BONUS — %s" % (wk, (b.get("nm") or "").upper()), ""]
    lines.append("%s takes the $9." % top.get("who"))
    if top.get("sub"): lines.append("(%s — %s)" % (top["sub"], fmt(top.get("val"))))
    if len(winners) > 1:
        lines.append("")
        for i, r in enumerate(winners[1:3], start=2):
            lines.append("%d. %s %s" % (i, r.get("who"), fmt(r.get("val"))))
    lines += ["", "%s/" % SITE]
    if art.exists(): print("ATTACH:%s" % art, file=sys.stderr)
    return "\n".join(lines)

KIND = {"opener": opener, "progress": progress, "recap": recap, "bonus": bonus}
if __name__ == "__main__":
    if len(sys.argv) != 2 or sys.argv[1] not in KIND:
        sys.exit("usage: compose-post.py %s" % "|".join(KIND))
    print(KIND[sys.argv[1]]())
