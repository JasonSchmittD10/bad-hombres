#!/usr/bin/env python3
"""Write data/stories.json: every story on the Updates page, newest first, for the header's
Booth menu and Week card. publish-story.py runs this after every story; run it by hand only
if you edited the Updates page yourself.

    scripts/stories.py            # rebuild data/stories.json (and any missing thumbnails)
    scripts/stories.py --force    # also redraw every thumbnail

Each entry:
    {"slug": "week-6-recap", "type": "recap", "week": 6, "kicker": "Week 6 · The Recap",
     "title": "…", "dek": "…", "img": "/assets/stories/week-6-recap.jpg",
     "thumb": "/assets/stories/thumb/week-6-recap.jpg"}

type is recap / preview (from the "Week N · The Recap/Preview" kicker) or feature.
img is the story's hero when it's a file (null when the page inlines it). thumb is a
480x300 JPEG in assets/stories/thumb/, drawn from the hero, so the menus never pull a
600 KB hero to fill a 96px slot. SVG heroes (the member illustrations) need no thumbnail;
the header shows the SVG itself. Thumbnails need Pillow; without it the manifest is
still written and the header falls back to img.
"""
import base64, html, io, json, re, sys
from pathlib import Path

# scripts/numbers.py shadows the standard library's numbers module, which Pillow needs
# (through decimal), so this folder comes off the import path before Pillow loads
sys.path = [p for p in sys.path if Path(p or ".").resolve() != Path(__file__).resolve().parent]
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "stories.json"
THUMBS = ROOT / "assets" / "stories" / "thumb"
SIZE = (480, 300)

def die(msg):
    print("stories: " + msg, file=sys.stderr); sys.exit(1)

def text(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()

def cards(updates_html):
    """The Updates cards in page order — the same markup publish-story.py writes."""
    out = []
    for m in re.finditer(r'<a class="acard" href="/story/([^/"]+)/">(.*?)</a>', updates_html, re.S):
        el = m.group(2)
        g = lambda p: (re.search(p, el, re.S) or [None, ""])[1]
        out.append(dict(slug=m.group(1), kicker=text(g(r'<div class="ac-k">(.*?)</div>')),
                        title=text(g(r'<h3 class="ac-h">(.*?)</h3>')), dek=text(g(r'<p class="ac-d">(.*?)</p>'))))
    return out

def hero(slug):
    p = ROOT / "story" / slug / "index.html"
    if not p.exists(): return None
    m = re.search(r'<div class="st-hero"><img[^>]*src="([^"]+)"', p.read_text())
    return m.group(1) if m else None

def thumb(slug, src, force):
    """Draw assets/stories/thumb/<slug>.jpg from the hero; return its URL, or None."""
    if not src or src.endswith(".svg"): return None
    try:
        from PIL import Image
    except ImportError:
        return None
    out = THUMBS / (slug + ".jpg")
    url = "/" + out.relative_to(ROOT).as_posix()
    inline = src.startswith("data:")
    f = None if inline else ROOT / src.lstrip("/")
    if f is not None and not f.is_file(): return None
    # keep a thumbnail unless asked to redraw, or its hero file has changed since
    if out.exists() and not force and (inline or f.stat().st_mtime <= out.stat().st_mtime):
        return url
    im = Image.open(io.BytesIO(base64.b64decode(src.split(",", 1)[1])) if inline else f).convert("RGB")
    # cover-crop to 16:10 from the centre, then shrink
    w, h = im.size
    tw, th = SIZE
    if w * th > h * tw:
        nw = h * tw // th; im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = w * th // tw; im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im = im.resize(SIZE, Image.LANCZOS)
    THUMBS.mkdir(parents=True, exist_ok=True)
    im.save(out, "JPEG", quality=74, optimize=True, progressive=True)
    return url

def main():
    force = "--force" in sys.argv
    upd = (ROOT / "updates" / "index.html").read_text()
    found = cards(upd)
    if not found: die("no story cards on the Updates page")
    stories = []
    for c in found:
        m = re.match(r"Week (\d+) · The (Recap|Preview)\b", c["kicker"])
        src = hero(c["slug"])
        stories.append({
            "slug": c["slug"],
            "type": m.group(2).lower() if m else "feature",
            "week": int(m.group(1)) if m else None,
            "kicker": c["kicker"], "title": c["title"], "dek": c["dek"],
            "img": src if src and not src.startswith("data:") else None,
            "thumb": thumb(c["slug"], src, force),
        })
    doc = {"note": "Every story on the Updates page, newest first, for the header's Booth menu and Week card. "
                   "Written by scripts/stories.py (publish-story.py runs it).",
           "stories": stories}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    print("stories.json: %d stories (%d recaps, %d previews, %d features), %d thumbnails" % (
        len(stories), sum(s["type"] == "recap" for s in stories), sum(s["type"] == "preview" for s in stories),
        sum(s["type"] == "feature" for s in stories), sum(1 for s in stories if s["thumb"])))

if __name__ == "__main__":
    main()
