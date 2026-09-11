#!/usr/bin/env python3
"""Publish one story to the site: its page, its Updates card, the homepage feature.

    scripts/publish-story.py spec.json            # new story
    scripts/publish-story.py spec.json --force    # replace a story with the same slug

spec.json:
    {
      "slug":    "week-1-recap",                    # [a-z0-9-], becomes /story/<slug>/
      "kicker":  "Week 1 · The Recap",
      "title":   "…",
      "dek":     "…",                               # one sentence; also the card + meta text
      "byline":  "The Bad Hombres beat · Week 1 · Sep 15, 2026",
      "hero":    "assets/members/illus/Chris.jpg",  # repo-relative image
      "heroAlt": "Chris",
      "stats":   [["38.02", "Big Dick"], ["0.00", "Little Bitch"]],   # optional, up to 4
      "body":    "path/to/body.html"                # the article body, see below
    }

The body is an HTML fragment of <p>, <p class="lede">, <h2 class="st-h2">,
<blockquote class="st-q">, <p class="sign">, and inline <b>/<em>/<a>. No <div>:
the page and the iMessage recap post both find the end of the body at its first
</div>, so a div inside it would cut the article short.

Every edit is checked: outside the element being replaced, each file must come
out byte-identical, or nothing is written.
"""
import html, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://bad-hombres.vercel.app"
TEMPLATE = ROOT / "story" / "kicking-off" / "index.html"

def die(msg):
    print("publish-story: " + msg, file=sys.stderr); sys.exit(1)

esc = lambda s: html.escape(s, quote=True)

def swap(text, pattern, repl, what):
    """Replace exactly one match of pattern; die otherwise."""
    new, n = re.subn(pattern, lambda m: repl, text, count=0, flags=re.S)
    if n != 1: die("expected one %s, found %d" % (what, n))
    return new

def swap_span(text, start, end, repl, what):
    """Replace text[start:end]; return the new text and assert the rest is untouched."""
    new = text[:start] + repl + text[end:]
    if new[:start] != text[:start] or new[start + len(repl):] != text[end:]:
        die("%s edit touched content outside its element" % what)
    return new

def load_spec(path):
    spec = json.loads(Path(path).read_text())
    for k in ("slug", "kicker", "title", "dek", "byline", "hero", "heroAlt", "body"):
        if not str(spec.get(k, "")).strip(): die("spec is missing %r" % k)
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", spec["slug"]): die("bad slug %r" % spec["slug"])
    if not (ROOT / spec["hero"]).is_file(): die("hero image not found: %s" % spec["hero"])
    stats = spec.get("stats") or []
    if len(stats) > 4 or any(len(s) != 2 for s in stats): die("stats must be up to four [value, label] pairs")
    body = Path(spec["body"]).read_text().strip()
    if re.search(r"<\s*(div|script|style|iframe)\b", body, re.I): die("body may not contain div, script, style or iframe")
    if not re.search(r"<p\b", body): die("body has no paragraphs")
    spec["bodyHtml"], spec["stats"] = body, stats
    return spec

def cards(updates_html):
    """The Updates cards as (slug, full element, kicker, title, img src, img alt)."""
    out = []
    for m in re.finditer(r'<a class="acard" href="/story/([^/"]+)/">.*?</a>', updates_html, re.S):
        el = m.group(0)
        g = lambda p: (re.search(p, el, re.S) or [None, ""])[1]
        out.append(dict(slug=m.group(1), el=el, start=m.start(), end=m.end(),
                        kicker=g(r'<div class="ac-k">(.*?)</div>'), title=g(r'<h3 class="ac-h">(.*?)</h3>'),
                        src=g(r'<img class="ph-img" src="([^"]*)"'), alt=g(r'<img class="ph-img" src="[^"]*" alt="([^"]*)"')))
    return out

def build_page(spec, related):
    page = TEMPLATE.read_text()
    t, d, url = esc(spec["title"]), esc(spec["dek"]), "%s/story/%s/" % (SITE, spec["slug"])
    page = swap(page, r"<title>.*?</title>", "<title>%s — Bad Hombres</title>" % t, "title")
    page = swap(page, r'<meta name="description" content="[^"]*">', '<meta name="description" content="%s">' % d, "meta description")
    for prop in ("og:title", "twitter:title"):
        attr = "property" if prop.startswith("og") else "name"
        page = swap(page, r'<meta %s="%s" content="[^"]*">' % (attr, prop), '<meta %s="%s" content="%s — Bad Hombres">' % (attr, prop, t), prop)
    for prop in ("og:description", "twitter:description"):
        attr = "property" if prop.startswith("og") else "name"
        page = swap(page, r'<meta %s="%s" content="[^"]*">' % (attr, prop), '<meta %s="%s" content="%s">' % (attr, prop, d), prop)
    page = swap(page, r'<meta property="og:url" content="[^"]*">', '<meta property="og:url" content="%s">' % url, "og:url")
    # a story belongs to Updates, not the season hub
    page = swap(page, r'<a href="/" class="active">2026 Season</a><a href="/updates/" class="">Updates</a>',
                '<a href="/" class="">2026 Season</a><a href="/updates/" class="active">Updates</a>', "nav")
    hero = '<div class="st-hero"><img class="ph-img" src="/%s" alt="%s" loading="lazy"></div>' % (esc(spec["hero"]), esc(spec["heroAlt"]))
    page = swap(page, r'<div class="st-hero">.*?</div>', hero, "hero")
    page = swap(page, r'<div class="st-kicker">.*?</div>', '<div class="st-kicker">%s</div>' % esc(spec["kicker"]), "kicker")
    page = swap(page, r'<h1 class="st-h1">.*?</h1>', '<h1 class="st-h1">%s</h1>' % t, "headline")
    page = swap(page, r'<p class="st-dek">.*?</p>', '<p class="st-dek">%s</p>' % d, "dek")
    page = swap(page, r'<b>From the Booth</b><span>.*?</span>', '<b>From the Booth</b><span>%s</span>' % esc(spec["byline"]), "byline")
    tiles = "".join('<div class="ast"><b>%s</b><span>%s</span></div>' % (esc(v), esc(l)) for v, l in spec["stats"])
    page = swap(page, r'\s*<div class="asts">.*?</div></div>', ("\n  <div class=\"asts\">%s</div>" % tiles) if tiles else "", "stat tiles")
    i = page.index('<div class="st-body">') + len('<div class="st-body">')
    page = swap_span(page, i, page.index("</div>", i), spec["bodyHtml"], "body")
    page = swap(page, r'<a class="st-back" href="[^"]*">', '<a class="st-back" href="/updates/">', "back link")
    rels = "".join(
        '<a class="rel" href="/story/%s/"><div class="rel-ph"><img class="ph-img" src="%s" alt="%s" loading="lazy"></div>'
        '<div><div class="rel-k">%s</div><div class="rel-h">%s</div></div></a>' % (c["slug"], c["src"], c["alt"], c["kicker"], c["title"])
        for c in related)
    page = swap(page, r'<div class="rels">.*?</a></div></div>', '<div class="rels">%s</div></div>' % rels, "related stories")
    return page

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    if len(args) != 1: die("usage: publish-story.py spec.json [--force]")
    spec = load_spec(args[0])
    slug = spec["slug"]
    page_path = ROOT / "story" / slug / "index.html"
    if page_path.exists() and not force: die("story/%s already exists (use --force to replace it)" % slug)

    upd_path, home_path = ROOT / "updates" / "index.html", ROOT / "index.html"
    upd, home = upd_path.read_text(), home_path.read_text()

    # Updates: drop any old card for this slug, then put the new one first
    existing = cards(upd)
    for c in [c for c in existing if c["slug"] == slug]:
        upd = swap_span(upd, c["start"], c["end"], "", "old Updates card")
    card = ('<a class="acard" href="/story/%s/"><div class="ph"><img class="ph-img" src="/%s" alt="%s" loading="lazy"></div>'
            '<div class="ac-b"><div class="ac-k">%s</div><h3 class="ac-h">%s</h3><p class="ac-d">%s</p>'
            '<span class="ac-r">Read the story →</span></div></a>') % (
        slug, esc(spec["hero"]), esc(spec["heroAlt"]), esc(spec["kicker"]), esc(spec["title"]), esc(spec["dek"]))
    anchor = '<div class="acards">'
    if upd.count(anchor) != 1: die("Updates card grid not found")
    at = upd.index(anchor) + len(anchor)
    upd = swap_span(upd, at, at, card, "Updates card")

    # Homepage: the single featured story
    m = re.search(r'<a class="feature" href="[^"]*">.*?</a>', home, re.S)
    if not m or len(re.findall(r'<a class="feature" ', home)) != 1: die("expected one homepage feature")
    feat = ('<a class="feature" href="/story/%s/"><div class="feat-img"><img src="/%s" alt="%s" loading="lazy"></div>'
            '<div class="feat-body"><h3 class="feat-h">%s</h3><p class="feat-d">%s</p></div></a>') % (
        slug, esc(spec["hero"]), esc(spec["heroAlt"]), esc(spec["title"]), esc(spec["dek"]))
    home = swap_span(home, m.start(), m.end(), feat, "homepage feature")

    related = [c for c in existing if c["slug"] != slug][:2]
    page = build_page(spec, related)

    page_path.parent.mkdir(parents=True, exist_ok=True)
    page_path.write_text(page); upd_path.write_text(upd); home_path.write_text(home)
    print("published /story/%s/  (page %d KB; Updates card first; homepage feature set)" % (slug, len(page) // 1024))

if __name__ == "__main__":
    main()
