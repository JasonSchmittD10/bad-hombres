#!/usr/bin/env python3
"""Write the site header into every page, the same markup everywhere.

    scripts/header.py           # write it (also moves pages off the old header)
    scripts/header.py check     # exit 1 if any page's header differs from the one below

The header is the block between <!-- bh:header --> and <!-- /bh:header -->: the bar,
the Week N crawl, four menus, the Make your pick button, the phone tab bar and the More
sheet. It's only the skeleton: assets/js/nav.js fills it from the data files (and marks
the page's own section), and assets/css/nav.css styles it, so a new week never touches
the pages. Change the markup here, run this, and every page gets it.

A page on the old header (the flat seven-link nav, the drawer, and the Hall of Champions
strip fixed at the bottom) has all three swapped out the first time this runs. Every page
also gets nav.css in its <head> and nav.js before </body>. Outside those edits each file
must come out byte-identical, or nothing is written.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
START, END = "<!-- bh:header -->", "<!-- /bh:header -->"
CSS = '<link rel="stylesheet" href="/assets/css/nav.css">'
JS = '<script src="/assets/js/nav.js" defer></script>'

def die(msg):
    print("header: " + msg, file=sys.stderr); sys.exit(1)

def svg(paths):
    return '<svg viewBox="0 0 24 24" aria-hidden="true">%s</svg>' % paths

CHEV = svg('<path d="m6 9 6 6 6-6"/>')
# Tabler "target-arrow" (MIT): an arrow into the target, not a bullseye
PICK = svg('<path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0"/><path d="M12 7a5 5 0 1 0 5 5"/>'
           '<path d="M13 3.055a9 9 0 1 0 7.941 7.945"/><path d="M15 6v3h3l3-3h-3V3z"/><path d="M15 9l-3 3"/>')
TAB_ICONS = {  # Lucide (ISC)
    "season": '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    "booth": '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    "hombres": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    "records": '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    "more": '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
}
MENUS = [("season", "Season", "/"), ("booth", "The Booth", "/updates/"),
         ("hombres", "The Hombres", "/members/"), ("records", "Record Book", "/record/")]
TABS = [("season", "Season", "/"), ("booth", "Booth", "/updates/"), ("hombres", "Hombres", "/members/"), ("records", "Records", "/record/")]

def block():
    items = "".join(
        '<div class="bhn-item" data-k="%s"><div class="bhn-pill"><a class="bhn-top" href="%s">%s</a>'
        '<button class="bhn-tog" type="button" aria-expanded="false" aria-controls="bhn-p-%s" aria-label="%s menu">%s</button></div>'
        '<div class="bhn-panel" id="bhn-p-%s"><div class="bhn-in"><p class="bhn-load">Loading…</p></div></div></div>\n  '
        % (k, href, label, k, label, CHEV, k) for k, label, href in MENUS).rstrip()
    tabs = "".join('<a class="bhn-tab" data-k="%s" href="%s">%s%s</a>' % (k, href, svg(TAB_ICONS[k]), label) for k, label, href in TABS)
    return "\n".join([
        START,
        '<header class="bhn" id="bhn">',
        '<div class="bhn-bar"><div class="bhn-in">',
        ' <a class="bhn-brand" href="/" aria-label="Bad Hombres home"><img src="/assets/logo.webp" alt="" width="64" height="48">'
        '<span class="bhn-wm">BAD <b>HOMBRES</b></span></a>',
        ' <nav class="bhn-nav" aria-label="Main">',
        '  ' + items,
        ' </nav>',
        ' <a class="bhn-pick" id="bhnPick" href="/picks/">%s<span class="l">Pick’em</span><span class="s">Pick’em</span>'
        '<span class="bhn-pick-k"></span></a>' % PICK,
        '</div></div>',
        '<div class="bhn-crawl"><div class="bhn-in">',
        ' <a class="bhn-wk" id="bhnWk" href="/">This Week</a>',
        ' <div class="bhn-track"><div class="bhn-run" id="bhnRun"></div></div>',
        ' <button class="bhn-wkbtn" id="bhnWkBtn" type="button" aria-expanded="false" aria-controls="bhnDrop" aria-label="Everything this week">'
        '<span class="bhn-one" id="bhnOne"></span><span class="bhn-cnt" id="bhnCnt"></span>%s</button>' % CHEV,
        '</div></div>',
        '<div class="bhn-drop" id="bhnDrop"></div>',
        '</header>',
        '<div class="bhn-scrim" id="bhnScrim"></div>',
        '<nav class="bhn-tabs" aria-label="Sections">%s<button class="bhn-tab" id="bhnMoreBtn" data-k="more" type="button" '
        'aria-expanded="false" aria-controls="bhnSheet">%sMore</button></nav>' % (tabs, svg(TAB_ICONS["more"])),
        '<div class="bhn-sheet" id="bhnSheet" role="dialog" aria-label="More"></div>',
        END,
    ])

OLD_HEADER = re.compile(r"<header><div class=\"wrap hbar\">.*?</header>", re.S)
OLD_STRIP = re.compile(r'<section id="champions" class="champ-ticker-sec">.*?</section>\n?', re.S)
OLD_DRAWER = re.compile(r"<script>\s*\(function\(\)\{\s*var t=document\.getElementById\('navToggle'\).*?</script>\n?", re.S)
OUR = re.compile(re.escape(START) + r".*?" + re.escape(END), re.S)

def pages():
    for p in sorted(ROOT.rglob("index.html")):
        rel = p.relative_to(ROOT)
        if rel.parts[0] in (".git", "bad-hombres-site 3", "voice", "social"): continue
        s = p.read_text()
        if START in s or OLD_HEADER.search(s): yield p, s

def write(s, rel):
    new, B = s, block()
    if START in new:
        if len(OUR.findall(new)) != 1: die("%s: more than one header block" % rel)
        new = OUR.sub(lambda m: B, new)
    else:
        if len(OLD_HEADER.findall(new)) != 1: die("%s: expected one old header" % rel)
        new = OLD_HEADER.sub(lambda m: B, new)
        if len(OLD_STRIP.findall(new)) > 1: die("%s: more than one Hall of Champions strip" % rel)
        new = OLD_STRIP.sub("", new)
        if len(OLD_DRAWER.findall(new)) > 1: die("%s: more than one drawer script" % rel)
        new = OLD_DRAWER.sub("", new)
    if CSS not in new:
        if new.count("</head>") != 1: die("%s: expected one </head>" % rel)
        new = new.replace("</head>", CSS + "\n</head>")
    if JS not in new:
        if new.count("</body>") != 1: die("%s: expected one </body>" % rel)
        new = new.replace("</body>", JS + "\n</body>")
    # nothing but the header, the strip, the drawer script and the two tags may change
    strip = lambda t: OLD_DRAWER.sub("", OLD_STRIP.sub("", OUR.sub("", OLD_HEADER.sub("", t)))).replace(CSS + "\n", "").replace(JS + "\n", "")
    if strip(new) != strip(s): die("%s: an edit touched something outside the header" % rel)
    return new

def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "write"
    found = list(pages())
    if not found: die("no pages found")
    if mode == "check":
        B, bad = block(), []
        for p, s in found:
            m = OUR.search(s)
            if not m or m.group(0) != B or CSS not in s or JS not in s: bad.append(str(p.relative_to(ROOT)))
        if bad: die("these pages don't carry the current header (run scripts/header.py): " + ", ".join(bad))
        print("header: %d pages, all current" % len(found)); return
    if mode != "write": die("usage: header.py [check]")
    changed = 0
    for p, s in found:
        new = write(s, p.relative_to(ROOT))
        if new != s: p.write_text(new); changed += 1
    print("header: %d pages, %d rewritten" % (len(found), changed))

if __name__ == "__main__":
    main()
