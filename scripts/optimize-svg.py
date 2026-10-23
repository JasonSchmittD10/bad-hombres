#!/usr/bin/env python3
"""Slim member illustration SVGs for the site, keeping them fully editable.

    scripts/optimize-svg.py assets/incoming/*.svg      # -> assets/members/svg/<Name>.svg
                                                       #  + assets/members/cutout/<Name>.svg
    scripts/optimize-svg.py --cutouts                  # rebuild every cutout from assets/members/svg/

Rounds path coordinates to 0.1 unit (these are drawn on a ~1300-unit canvas,
so that is invisible) and drops the line breaks between elements. Colours,
shapes and structure are left exactly as drawn, so a file can still be opened
in Figma or Illustrator and recoloured.

Every illustration also gets a cutout: the same drawing without its grey
background square, so the homepage can sit the face on a red, silver or gold
tile (the Game of the Week face-off, Big Dick / Little Bitch, the Hombres
grid). The faces are filled white, so they read on any of those.

Refuses anything it wasn't written for — embedded images, scripts, or
elements other than <svg>/<path>/<rect> — rather than guessing.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "members" / "svg"
NUM = re.compile(r"-?(?:\d+\.\d+|\d+\.|\.\d+|\d+)(?:e-?\d+)?", re.I)

def fmt(m):
    v = round(float(m.group(0)), 1)
    s = ("%.1f" % v).rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s

def slim_d(m):
    d = NUM.sub(fmt, m.group(1))
    # a leading-zero decimal after another number still needs its separator;
    # keep spaces, just collapse runs of them
    return 'd="%s"' % re.sub(r"\s+", " ", d).strip()

CUT = ROOT / "assets" / "members" / "cutout"
BG = re.compile(r'<rect width="(\d+(?:\.\d+)?)" height="\1" fill="#D7D7D7"/>', re.I)

def cutout(name, svg):
    """The illustration without its full-canvas grey background square."""
    out, n = BG.subn("", svg, count=1)
    if not n: sys.exit("%s: no grey background square to cut out — check the drawing" % name)
    CUT.mkdir(parents=True, exist_ok=True)
    (CUT / (name + ".svg")).write_text(out)

def main(paths):
    if paths == ["--cutouts"]:
        for p in sorted(OUT.glob("*.svg")): cutout(p.stem, p.read_text())
        print("cutouts: %d written to %s" % (len(list(OUT.glob("*.svg"))), CUT.relative_to(ROOT)))
        return
    if not paths: sys.exit(__doc__)
    OUT.mkdir(parents=True, exist_ok=True)
    total_in = total_out = 0
    for p in map(Path, paths):
        src = p.read_text()
        tags = set(re.findall(r"<([a-zA-Z]+)", src))
        if not tags <= {"svg", "path", "rect"}:
            sys.exit("%s: unexpected elements %s — not touching it" % (p.name, sorted(tags - {"svg", "path", "rect"})))
        if re.search(r"<script|href=|data:", src, re.I):
            sys.exit("%s: has scripts or external/embedded content — not touching it" % p.name)
        out = re.sub(r'd="([^"]*)"', slim_d, src)
        out = re.sub(r">\s+<", "><", out).strip() + "\n"
        name = p.stem[:1].upper() + p.stem[1:]
        (OUT / (name + ".svg")).write_text(out)
        cutout(name, out)
        total_in += len(src); total_out += len(out)
        print("%-10s %6.1f KB -> %5.1f KB" % (name, len(src) / 1024, len(out) / 1024))
    print("total      %6.1f KB -> %5.1f KB  (%s)" % (total_in / 1024, total_out / 1024, OUT.relative_to(ROOT)))

if __name__ == "__main__":
    main(sys.argv[1:])
