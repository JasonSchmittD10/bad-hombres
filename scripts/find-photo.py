#!/usr/bin/env python3
"""Find a public-domain photo for a story's hero, and save it.

    scripts/find-photo.py "bunk bed"                    # list candidates
    scripts/find-photo.py "bunk bed" --n 20             # more of them
    scripts/find-photo.py --get <url> assets/stories/week-8-preview.jpg

Searching tries Openverse first (license=cc0,pdm) with a short timeout, then
Wikimedia Commons, which answers when Openverse doesn't (Openverse's search
504'd three weeks running in Oct 2026). Only CC0 and public-domain files are
listed: Commons results are filtered on their LicenseShortName, so a CC BY or
CC BY-SA file never shows up. Every line prints the source, license, width,
title, the image URL to pass to --get, and the page to look at.

--get downloads the image, converts it to JPEG and resizes it to 1600px wide
(never upscaled) with macOS sips. LOOK AT IT before publishing — the script
checks the license, not the picture (VOICE_GUIDE.md, "Article art").
"""
import json, shutil, subprocess, sys, tempfile, urllib.parse, urllib.request
from pathlib import Path

UA = "BadHombresLeague/1.0 (https://bad-hombres.vercel.app)"
WIDTH = 1600

def die(msg):
    print("find-photo: " + msg, file=sys.stderr); sys.exit(1)

def fetch(url, timeout):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def openverse(q, n):
    url = "https://api.openverse.org/v1/images/?" + urllib.parse.urlencode(
        {"q": q, "license": "cc0,pdm", "page_size": n})
    d = json.loads(fetch(url, 20))
    return [("openverse", r["license"].upper(), r.get("width") or 0, r["title"],
             r["url"], r.get("foreign_landing_url") or "") for r in d["results"]]

def public_domain(lic):
    lic = (lic or "").lower()
    return lic.startswith("cc0") or "public domain" in lic or lic == "pdm"

def commons(q, n):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search",
        "gsrnamespace": 6, "gsrsearch": q + " filetype:bitmap", "gsrlimit": 50,
        "prop": "imageinfo", "iiprop": "url|size|extmetadata|mime",
        "iiextmetadatafilter": "LicenseShortName"})
    d = json.loads(fetch(url, 30))
    pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
    out = []
    for p in pages:
        i = p["imageinfo"][0]
        lic = i.get("extmetadata", {}).get("LicenseShortName", {}).get("value")
        if public_domain(lic) and i.get("mime") in ("image/jpeg", "image/png"):
            out.append(("commons", lic, i["width"], p["title"].replace("File:", ""),
                        i["url"], i["descriptionurl"]))
    return out[:n]

def search(q, n):
    try:
        rows = openverse(q, n)
        if rows: return rows
        print("find-photo: Openverse found nothing; trying Wikimedia Commons", file=sys.stderr)
    except Exception as e:
        print("find-photo: Openverse failed (%s); trying Wikimedia Commons" % e, file=sys.stderr)
    try:
        return commons(q, n)
    except Exception as e:
        die("Wikimedia Commons failed too (%s)" % e)

def get(url, out):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / ("src" + Path(urllib.parse.urlparse(url).path).suffix.lower())
        src.write_bytes(fetch(url, 60))
        jpg = Path(tmp) / "out.jpg"
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "82",
                        str(src), "--out", str(jpg)], check=True, capture_output=True)
        w = int(subprocess.run(["sips", "-g", "pixelWidth", str(jpg)], check=True,
                               capture_output=True, text=True).stdout.split()[-1])
        if w > WIDTH:
            subprocess.run(["sips", "--resampleWidth", str(WIDTH), str(jpg)],
                           check=True, capture_output=True)
        shutil.copy(jpg, out)
    print("saved %s (%d KB)" % (out, out.stat().st_size // 1024))

if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) == 3 and a[0] == "--get":
        get(a[1], a[2]); sys.exit()
    if not a or a[0].startswith("--"):
        die(__doc__.strip().split("\n\n")[1])
    n = int(a[a.index("--n") + 1]) if "--n" in a else 10
    rows = search(a[0], n)
    if not rows: die("no CC0 or public-domain results for %r — try another object" % a[0])
    for src, lic, w, title, url, page in rows:
        print("%-9s %-14s %5s  %s\n          %s\n          %s" % (src, lic, w, title[:70], url, page))
