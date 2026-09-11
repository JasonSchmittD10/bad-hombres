#!/usr/bin/env python3
"""Render the week's Instagram images from the site's own data.

    scripts/social-render.py recap              # -> social/week-N/recap-1..4.jpg
    scripts/social-render.py award              # -> social/week-N/award.jpg
    scripts/social-render.py matchups           # -> social/week-N/matchups-1..8.jpg
    scripts/social-render.py recap --preview DIR   # any week state, written to DIR, marked PREVIEW
    scripts/social-render.py recap --preview DIR --data sample-week.json --season sample-season.json
    scripts/social-render.py matchups --preview DIR --data sample-week.json --voices sample-voices.json

recap  1. Big Dick of the Week (high score)  2. Little Bitch of the Week (low
       score)  3. the final scoreboard  4. standings after the week. Needs
       data/week.json status "final" and data/season.json caught up to that week.
award  the week's bonus: the award art with the winner's illustration stamped
       on it. Needs a settled winner in week.json bonus.actual.
matchups  Thursday's preview: 1. the slate with projections  2-7. one slide per
       matchup, most watchable first — slide 2 is the Game of the Week, scored
       on projected closeness, the all-time series, current rankings and (late
       in the season) stakes; see watchability(). The render prints each
       matchup's score and reason for the caption; the slides don't show it.
       Each matchup slide shows the all-time series from data/history.json.
       8. Pastor Wes's Lock of the Week, if one is open in data/voices.json.
       Last: the standings going in (preseason rankings in week 1) as a bookend.
       Needs a week that hasn't kicked off, and season.json through week N-1.

Every image is 1080x1350 (Instagram's 4:5 portrait) JPEG. Each is built as a
self-contained HTML page — fonts, art and illustrations inlined — and shot
with headless Chrome in a throwaway profile, so it never touches Jason's.
Exits 2 with a reason when the data isn't ready, so a caller can skip.
"""
import base64, html, json, re, subprocess, sys, tempfile, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from bh_league import current_ranks, series, watchability  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1080, 1350
HANDLE = "@badhombresfantasy"

def bail(why):
    print("social-render: " + why, file=sys.stderr); sys.exit(2)

esc = lambda s: html.escape(str(s), quote=True)
fmt = lambda v: "%.2f" % v

def data_uri(path, mime=None):
    p = ROOT / path
    mime = mime or {".svg": "image/svg+xml", ".jpg": "image/jpeg", ".webp": "image/webp",
                    ".otf": "font/otf", ".png": "image/png"}[p.suffix]
    return "data:%s;base64,%s" % (mime, base64.b64encode(p.read_bytes()).decode())

def face(m):
    """The manager's vector illustration, else their photo."""
    for p in ("assets/members/svg/%s.svg" % m, "assets/members/%s.jpg" % m):
        if (ROOT / p).exists(): return data_uri(p)
    bail("no illustration or photo for %s" % m)

def page(inner, preview):
    fonts = "".join('@font-face{font-family:"Gruffy";font-weight:%d;src:url(%s)}' % (w, data_uri("fonts/gruffy-%s.otf" % n))
                    for w, n in ((300, "light"), (700, "bold"), (900, "black")))
    stamp = '<div class="pv">PREVIEW</div>' if preview else ""
    return """<!doctype html><html><head><meta charset="utf-8"><style>%s
*{box-sizing:border-box;margin:0;padding:0}
:root{--red:#c1121f;--ink:#0d0d0f;--panel:#16161a;--line:#2a2a31;--muted:#9aa0aa;--white:#f4f5f7;--gold:#e8b84b}
html,body{width:%dpx;height:%dpx;overflow:hidden;background:var(--ink);color:var(--white);
 font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
.disp{font-family:"Gruffy","Arial Black",Impact,sans-serif;font-weight:900;text-transform:uppercase;line-height:.92}
.frame{position:relative;width:100%%;height:100%%;display:flex;flex-direction:column;padding:56px 64px 48px;
 background:radial-gradient(900px 620px at 50%% -8%%,rgba(193,18,31,.30),transparent 70%%)}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{display:flex;align-items:center;gap:16px}.brand img{height:56px}
.brand span{font-size:30px;letter-spacing:.02em}.brand b{color:var(--red)}
.wk{border:2px solid var(--red);color:#fff;border-radius:999px;padding:10px 24px;font-size:26px;letter-spacing:.06em}
.foot{display:flex;justify-content:space-between;color:var(--muted);font-size:24px;letter-spacing:.04em;margin-top:auto}
.eyebrow{color:var(--red);font-size:26px;letter-spacing:.22em;text-transform:uppercase;font-weight:700}
.pv{position:absolute;top:50%%;left:50%%;transform:translate(-50%%,-50%%) rotate(-24deg);font:900 190px Arial Black,sans-serif;
 color:rgba(255,255,255,.08);letter-spacing:.1em;pointer-events:none;z-index:9}
%s</style></head><body>%s%s</body></html>""" % (fonts, W, H, CSS, inner, stamp)

CSS = """
/* award card: Big Dick / Little Bitch */
.aw{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:0}
.aw .ph{position:relative;width:620px;height:620px;margin:0 0 44px}
.aw .ph img{width:100%;height:100%;border-radius:40px;border:8px solid var(--red);object-fit:cover;display:block;background:#d7d7d7}
.aw .score{position:absolute;right:-56px;bottom:-44px;width:236px;height:236px;border-radius:50%;background:var(--red);
 display:flex;flex-direction:column;align-items:center;justify-content:center;transform:rotate(-8deg);
 box-shadow:0 18px 40px rgba(0,0,0,.55);border:6px solid var(--ink)}
.aw .score b{font-size:62px;line-height:1}.aw .score span{font-size:22px;letter-spacing:.2em;margin-top:6px;font-weight:700}
.aw h1{font-size:118px;letter-spacing:.01em}
.aw h1 small{display:block;font-size:52px;color:var(--muted);letter-spacing:.14em;margin-top:14px;font-weight:700}
.aw .who{margin-top:30px;font-size:40px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.aw .tm{margin-top:8px;font-size:30px;color:var(--muted)}
.lb .ph img{border-color:#3a3a42;filter:grayscale(1) contrast(.92) brightness(.9)}
.lb .score{background:#26262c;color:var(--muted)}.lb .score b{color:#fff}

/* scoreboard */
.sb{flex:1;display:flex;flex-direction:column;justify-content:center;padding:28px 0 20px}
.sb h1{font-size:84px;margin:0 0 28px}.sb h1 em{font-style:normal;color:var(--red)}
.mu{background:var(--panel);border:2px solid var(--line);border-radius:24px;padding:10px 22px;margin-bottom:14px}
.row{display:flex;align-items:center;gap:20px;height:58px}
.row img{width:50px;height:50px;border-radius:50%;object-fit:cover;background:#d7d7d7;flex:none}
.row .nm{flex:1;font-size:31px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.row .pt{font-size:40px;font-variant-numeric:tabular-nums;font-weight:700}
.row.w .nm{color:#fff;font-weight:700}.row.w .pt{color:#fff}
.row.l{opacity:.5}
.row.w img{box-shadow:0 0 0 4px var(--red)}

/* standings */
.stn{flex:1;display:flex;flex-direction:column;justify-content:center;padding:24px 0 16px}
.stn h1{font-size:84px;margin:0 0 30px}.stn h1 em{font-style:normal;color:var(--red)}
.stn .r{display:grid;grid-template-columns:52px 64px 1fr 120px 150px;align-items:center;column-gap:14px}
.stn .r span:nth-child(n+4){text-align:right}
.stn .r{height:66px;padding:0 18px;border-bottom:1px solid var(--line)}
.stn .r:nth-child(odd){background:rgba(255,255,255,.025)}
.stn .rk{font-size:30px;font-weight:700;color:var(--muted);text-align:center}
.stn .r.up .rk{color:#fff}
.stn .r img{width:50px;height:50px;border-radius:50%;object-fit:cover;background:#d7d7d7}
.stn .r.up img{box-shadow:0 0 0 3px var(--red)}
.stn .nm{font-size:29px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stn .r.up .nm{font-weight:700}
.stn .rec{font-size:32px;font-weight:700;font-variant-numeric:tabular-nums}
.stn .pf{font-size:28px;color:var(--muted);font-variant-numeric:tabular-nums}
.stn .cut{position:relative;height:0;border-top:3px dashed var(--red);margin:8px 0}
.stn .cut span{position:absolute;right:0;top:-15px;background:var(--ink);color:var(--red);padding:0 0 0 12px;
 font-size:20px;letter-spacing:.2em;font-weight:700}

/* matchup preview */
.mp{flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center}
.mp .eyebrow{margin-bottom:26px}
.mp .pair{display:flex;justify-content:center;align-items:flex-start;gap:34px;position:relative}
.mp .side{width:430px;display:flex;flex-direction:column;align-items:center}
.mp .side img{width:400px;height:400px;border-radius:36px;border:6px solid var(--line);object-fit:cover;background:#d7d7d7}
.mp .vs{position:absolute;left:50%;top:200px;transform:translate(-50%,-50%);width:120px;height:120px;border-radius:50%;
 background:var(--ink);border:5px solid var(--red);display:flex;align-items:center;justify-content:center;font-size:44px;z-index:2}
.mp .mgr{margin-top:26px;font-size:40px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.mp .tm{margin-top:6px;font-size:28px;color:var(--muted);min-height:68px;line-height:1.2}
.mp .pj{margin-top:12px;font-size:76px}.mp .pj small{display:block;font:700 20px "Segoe UI",Arial,sans-serif;
 color:var(--muted);letter-spacing:.2em;margin-top:8px}
.mp .facts{margin:44px auto 0;display:flex;justify-content:center;gap:18px}
.mp .fact{background:var(--panel);border:2px solid var(--line);border-radius:22px;padding:18px 30px;min-width:300px}
.mp .fact span{display:block;color:var(--muted);font-size:20px;letter-spacing:.2em;font-weight:700;margin-bottom:8px}
.mp .fact b{font-size:32px}
.sb .sub{color:var(--muted);font-size:26px;letter-spacing:.2em;font-weight:700;margin:-14px 0 24px}
.row.fav .nm{color:#fff;font-weight:700}.row.fav .pt{color:#fff}.row.dog{opacity:.62}

/* Game of the Week: prime-time treatment, identical on both sides */
.frame.gotw{background:
  radial-gradient(760px 520px at 50% 40%,rgba(232,184,75,.20),transparent 70%),
  radial-gradient(1100px 760px at 50% -10%,rgba(193,18,31,.55),transparent 72%),
  repeating-linear-gradient(115deg,rgba(255,255,255,.028) 0 2px,transparent 2px 26px),
  var(--ink)}
.frame.gotw::after{content:"";position:absolute;inset:18px;border:3px solid var(--gold);border-radius:34px;
 pointer-events:none;box-shadow:inset 0 0 60px rgba(232,184,75,.12)}
.gw-badge{align-self:center;display:inline-flex;align-items:center;gap:18px;margin:0 auto 30px;padding:14px 34px;
 border-radius:999px;background:var(--gold);color:var(--ink);font-size:34px;letter-spacing:.08em;
 box-shadow:0 12px 34px rgba(232,184,75,.35)}
.gw-badge span{font-size:26px}
.gotw .mp .side img{border-color:var(--gold);box-shadow:0 0 0 6px rgba(232,184,75,.18),0 26px 60px rgba(0,0,0,.55)}
.gotw .mp .vs{border-color:var(--gold);color:var(--gold)}
.gotw .mp .fact{border-color:rgba(232,184,75,.55)}

/* Pastor Wes */
.wl{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.wl img{width:440px;height:440px;border-radius:50%;border:10px solid var(--red);object-fit:cover;background:#d7d7d7;
 box-shadow:0 24px 60px rgba(0,0,0,.6)}
.wl .eyebrow{margin-top:44px}
.wl h1{font-size:96px;margin-top:14px}
.wl .pick{margin-top:40px;background:var(--panel);border:2px solid var(--red);border-radius:26px;padding:26px 44px}
.wl .pick b{display:block;font-size:64px}
.wl .pick span{display:block;margin-top:10px;font-size:28px;color:var(--muted)}
.wl .rec{margin-top:30px;font-size:30px;color:var(--muted);letter-spacing:.08em}
.wl .rec b{color:#fff}

/* bonus award post */
.bn{flex:1;display:flex;flex-direction:column}
.bn .art{position:relative;margin:24px -64px 0;height:620px;overflow:visible}
.bn .art>img{width:100%;height:100%;object-fit:cover;display:block;
 -webkit-mask-image:linear-gradient(180deg,#000 72%,transparent)}
.bn .stamp{position:absolute;left:64px;bottom:-60px;width:270px;height:270px;border-radius:50%;overflow:hidden;
 border:10px solid var(--red);background:#d7d7d7;transform:rotate(-7deg);box-shadow:0 22px 50px rgba(0,0,0,.6)}
.bn .stamp img{width:100%;height:100%;object-fit:cover;display:block}
.bn .purse{position:absolute;right:64px;bottom:-24px;background:var(--red);border-radius:18px;padding:14px 26px;
 font-size:54px;transform:rotate(4deg);box-shadow:0 14px 34px rgba(0,0,0,.5)}
.bn .txt{margin-top:92px}
.bn h1{font-size:84px;margin:12px 0 20px}
.bn .who{font-size:40px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.bn .tm{font-size:30px;color:var(--muted);margin-top:6px}
.bn .stat{margin-top:22px;font-size:32px}.bn .stat b{color:var(--gold)}
"""

def frame(week, body, cls=""):
    return ('<div class="frame %s"><div class="top"><div class="brand"><img src="%s" alt="">'
            '<span class="disp">BAD <b>HOMBRES</b></span></div><div class="wk disp">WEEK %s</div></div>'
            '%s<div class="foot"><span>%s</span><span>bad-hombres.vercel.app</span></div></div>') % (
        cls, data_uri("assets/logo.webp"), esc(week), body, HANDLE)

def award_card(week, t, title, sub, loser=False):
    return frame(week, (
        '<div class="aw%s"><div class="ph"><img src="%s" alt="">'
        '<div class="score disp"><b>%s</b><span>PTS</span></div></div>'
        '<h1 class="disp">%s<small>%s</small></h1><div class="who">%s</div><div class="tm">%s</div></div>') % (
        " lb" if loser else "", face(t["m"]), fmt(t["s"]), esc(title), esc(sub), esc(t["m"]), esc(t["t"])))

def scoreboard(week, ms):
    rows = ""
    for mu in ms:
        a, b = mu["a"], mu["b"]
        hi, lo = (a, b) if a["s"] >= b["s"] else (b, a)
        tie = a["s"] == b["s"]
        rows += '<div class="mu">' + "".join(
            '<div class="row %s"><img src="%s" alt=""><span class="nm">%s</span><span class="pt">%s</span></div>' % (
                "" if tie else cls, face(t["m"]), esc(t["t"]), fmt(t["s"])) for t, cls in ((hi, "w"), (lo, "l"))) + "</div>"
    return frame(week, '<div class="sb"><h1 class="disp">Week %s <em>Final</em></h1>%s</div>' % (esc(week), rows))

def standings(week, season, names, title=None):
    """Same order as the site: wins (ties count half), then points for. Before any
    game is played there's nothing to sort, so it shows the latest power rankings
    with no record or points — never a table of 0-0s."""
    played = any(t["w"] + t["l"] + t.get("tie", 0) for t in season["teams"])
    if played:
        ts = sorted(season["teams"], key=lambda t: (-(t["w"] + t.get("tie", 0) * .5), -t.get("pf", 0)))
    else:
        by_m = {t["m"]: t for t in season["teams"]}
        ts = [by_m[m] for m in sorted(by_m, key=lambda m: current_ranks(season)[m])]
    cut = season.get("playoffCut", 6)
    rows = ""
    for i, t in enumerate(ts):
        rec = "%d-%d" % (t["w"], t["l"]) + ("-%d" % t["tie"] if t.get("tie") else "")
        nums = '<span class="rec">%s</span><span class="pf">%s</span>' % (rec, fmt(t.get("pf", 0))) if played else "<span></span><span></span>"
        rows += ('<div class="r%s"><span class="rk">%d</span><img src="%s" alt=""><span class="nm">%s</span>%s</div>') % (
            " up" if i < cut else "", i + 1, face(t["m"]), esc(names.get(t["m"], t["t"])), nums)
        if i == cut - 1: rows += '<div class="cut"><span>PLAYOFFS</span></div>'
    title = title or 'Standings After <em>Week %s</em>' % esc(week)
    return frame(week, '<div class="stn"><h1 class="disp">%s</h1>%s</div>' % (title, rows))

def slate(week, ms):
    rows = ""
    for mu in ms:
        a, b = mu["a"], mu["b"]
        fav, dog = (a, b) if a["p"] >= b["p"] else (b, a)
        rows += '<div class="mu">' + "".join(
            '<div class="row %s"><img src="%s" alt=""><span class="nm">%s</span><span class="pt">%s</span></div>' % (
                cls, face(t["m"]), esc(t["t"]), fmt(t["p"])) for t, cls in ((fav, "fav"), (dog, "dog"))) + "</div>"
    return frame(week, '<div class="sb"><h1 class="disp">Week %s <em>Preview</em></h1><div class="sub">PROJECTED POINTS</div>%s</div>' % (
        esc(week), rows))

def matchup(week, mu, label, gotw=False):
    a, b = mu["a"], mu["b"]
    def side(t):
        # both sides framed the same: nobody has won anything yet
        return ('<div class="side"><img src="%s" alt=""><div class="mgr">%s</div><div class="tm">%s</div>'
                '<div class="pj disp">%s<small>PROJECTED</small></div></div>') % (
            face(t["m"]), esc(t["m"]), esc(t["t"]), fmt(t["p"]))
    facts = '<div class="fact"><span>ALL-TIME SERIES</span><b>%s</b></div>' % esc(series(a["m"], b["m"]))
    head = ('<div class="gw-badge disp"><span>&#9733;</span>%s<span>&#9733;</span></div>' % esc(label)) if gotw \
        else '<div class="eyebrow">%s</div>' % esc(label)
    return frame(week, ('<div class="mp">%s<div class="pair">%s<div class="vs disp">VS</div>%s</div>'
                        '<div class="facts">%s</div></div>') % (head, side(a), side(b), facts), "gotw" if gotw else "")

def wes_lock(week, lock, record, ms):
    teams = {t["m"]: t["t"] for mu in ms for t in (mu["a"], mu["b"])}
    names = re.findall(r"[A-Z][a-z]+", lock["pick"])
    sub = " over ".join(teams[n] for n in names if n in teams) if len(names) == 2 else ""
    return frame(week, ('<div class="wl"><img src="%s" alt=""><div class="eyebrow">Pastor Wes\u2019s</div>'
                        '<h1 class="disp">Lock of the Week</h1><div class="pick"><b class="disp">%s</b>%s</div>'
                        '<div class="rec">SEASON RECORD <b>%d-%d</b></div></div>') % (
        face("Wes"), esc(lock["pick"]), ('<span>%s</span>' % esc(sub)) if sub else "", record["w"], record["l"]))

def bonus_card(week, b, t):
    art = "assets/awards/hd/wk%s.jpg" % week
    if not (ROOT / art).exists(): bail("no 1080px award art at %s" % art)
    top = b["actual"][0]
    stat = ('<div class="stat">%s · <b>%s</b></div>' % (esc(top["sub"]), fmt(top["val"]) if isinstance(top.get("val"), (int, float)) else esc(top.get("val", "")))) if top.get("sub") else ""
    return frame(week, (
        '<div class="bn"><div class="art"><img src="%s" alt=""><div class="stamp"><img src="%s" alt=""></div>'
        '<div class="purse disp">$9</div></div><div class="txt"><div class="eyebrow">Week %s Bonus</div>'
        '<h1 class="disp">%s</h1><div class="who">%s</div><div class="tm">%s</div>%s</div></div>') % (
        data_uri(art), face(top["who"]), esc(week), esc(b.get("nm", "")), esc(top["who"]), esc(t), stat))

def shoot(html_text, out):
    """Headless Chrome -> PNG -> JPEG, exactly W x H."""
    if not Path(CHROME).exists(): bail("Google Chrome not found at %s" % CHROME)
    with tempfile.TemporaryDirectory() as tmp:
        src, png = Path(tmp) / "card.html", Path(tmp) / "card.png"
        src.write_text(html_text)
        # Chrome writes the screenshot and then often never exits (its updater
        # keeps the process alive), so wait for the file, not the process.
        proc = subprocess.Popen([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                                 "--no-default-browser-check", "--disable-background-networking",
                                 "--disable-component-update", "--user-data-dir=" + str(Path(tmp) / "profile"),
                                 "--force-device-scale-factor=1", "--window-size=%d,%d" % (W, H),
                                 "--virtual-time-budget=4000", "--screenshot=" + str(png), src.as_uri()],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            last, t0 = -1, time.time()
            while time.time() - t0 < 90:
                size = png.stat().st_size if png.exists() else -1
                if size > 0 and size == last: break          # written and no longer growing
                if proc.poll() is not None and size <= 0: bail("Chrome exited without a screenshot")
                last = size; time.sleep(0.5)
            else:
                bail("Chrome did not produce a screenshot within 90s")
        finally:
            proc.terminate()
            try: proc.wait(5)
            except subprocess.TimeoutExpired: proc.kill()
        dims = subprocess.run(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(png)], capture_output=True, text=True).stdout
        if "pixelWidth: %d" % W not in dims or "pixelHeight: %d" % H not in dims:
            bail("screenshot came out the wrong size:\n" + dims)
        out.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "90", str(png), "--out", str(out)],
                       check=True, capture_output=True)
    print("wrote %s (%d KB)" % (out.relative_to(ROOT) if out.is_relative_to(ROOT) else out, out.stat().st_size // 1024))

def main():
    args = sys.argv[1:]
    kind = args[0] if args else ""
    if kind not in ("recap", "award", "matchups"): sys.exit(__doc__)
    preview = "--preview" in args
    # --data lets a preview run against a sample week instead of the live file
    src = Path(args[args.index("--data") + 1]) if "--data" in args else ROOT / "data" / "week.json"
    w = json.loads(src.read_text())
    week = w.get("week")
    out_dir = Path(args[args.index("--preview") + 1]).resolve() if preview else ROOT / "social" / ("week-%s" % week)
    ms = w.get("matchups") or []
    if len(ms) != 6: bail("expected 6 matchups, found %d" % len(ms))
    teams = [t for mu in ms for t in (mu["a"], mu["b"])]
    if kind == "matchups":
        # a preview of a week that has started would be announcing stale projections
        if any(t.get("s") for t in teams): bail("week %s has already kicked off — no preview" % week)
        if any(not isinstance(t.get("p"), (int, float)) for t in teams): bail("a projection is missing")
        sp = Path(args[args.index("--season") + 1]) if "--season" in args else ROOT / "data" / "season.json"
        season = json.loads(sp.read_text())
        ranks = current_ranks(season)
        vp = Path(args[args.index("--voices") + 1]) if "--voices" in args else ROOT / "data" / "voices.json"
        voices = json.loads(vp.read_text())
        lock = next((l for l in voices["wes"]["locks"] if str(l["week"]) == str(week) and l.get("result") is None), None)
        pair = lambda mu: {mu["a"]["m"], mu["b"]["m"]}
        # Slide 2 is the RECORDED Game of the Week (scripts/game-of-the-week.py), never
        # re-picked here — the recap and the Thursday opener already named it.
        # Everything is checked before any file is touched, so a refusal leaves no partial set.
        gotw = next((g for g in voices.get("gotw", []) if str(g["week"]) == str(week)), None)
        if not gotw: bail("no Game of the Week recorded for week %s — run scripts/game-of-the-week.py first" % week)
        first = [mu for mu in ms if pair(mu) == {gotw["a"], gotw["b"]}]
        if not first: bail("recorded Game of the Week (%s vs %s) isn't one of this week's matchups" % (gotw["a"], gotw["b"]))
        if lock:
            picked = set(re.findall(r"[A-Z][a-z]+", lock["pick"]))
            if not any(pair(mu) == picked for mu in ms):
                bail("Wes's lock %r isn't one of this week's matchups" % lock["pick"])
        behind = [t["m"] for t in season["teams"] if t["w"] + t["l"] + t.get("tie", 0) != int(week) - 1]
        if behind: bail("season.json isn't updated through week %d (%s) — the closing standings slide would be stale" % (int(week) - 1, ", ".join(behind)))
        for old in out_dir.glob("matchups-*.jpg"): old.unlink()   # never leave a stale slide behind
        shoot(page(slate(week, ms), preview), out_dir / "matchups-1.jpg")
        rest = sorted((mu for mu in ms if mu is not first[0]),
                      key=lambda mu: -watchability(week, mu, ranks, season.get("playoffCut", 6))[0])
        print("  Game of the Week: %s vs %s — %s" % (gotw["a"], gotw["b"], gotw["reason"]))
        for i, mu in enumerate(first + rest):
            label = "Game of the Week" if i == 0 else "Matchup %d of 6" % (i + 1)
            shoot(page(matchup(week, mu, label, gotw=(i == 0)), preview), out_dir / ("matchups-%d.jpg" % (i + 2)))
        n = 8
        if lock:
            shoot(page(wes_lock(week, lock, voices["wes"]["record"], ms), preview), out_dir / "matchups-8.jpg"); n = 9
        # the bookend: where everyone stands going in
        title = "Preseason <em>Rankings</em>" if int(week) == 1 else "Standings Entering <em>Week %s</em>" % esc(week)
        shoot(page(standings(week, season, {t["m"]: t["t"] for t in teams}, title), preview), out_dir / ("matchups-%d.jpg" % n))
        return

    if not preview and w.get("status") != "final": bail("week %s is not final yet" % week)
    if any(not isinstance(t.get("s"), (int, float)) for t in teams): bail("a score is missing")

    if kind == "recap":
        ranked = sorted(teams, key=lambda t: t["s"])
        lo, hi = ranked[0], ranked[-1]
        if ranked[-1]["s"] == ranked[-2]["s"]: bail("tie for the high score — decide Big Dick by hand")
        if ranked[0]["s"] == ranked[1]["s"]: bail("tie for the low score — decide Little Bitch by hand")
        # standings must already include this week, or slide 4 shows last week's table;
        # checked before rendering anything so a refusal never leaves a partial set
        sp = Path(args[args.index("--season") + 1]) if "--season" in args else ROOT / "data" / "season.json"
        season = json.loads(sp.read_text())
        if len(season.get("teams") or []) != 12: bail("season.json should have 12 teams")
        behind = [t["m"] for t in season["teams"] if t["w"] + t["l"] + t.get("tie", 0) != int(week)]
        if behind: bail("season.json is not updated through week %s (%s) — settle standings first" % (week, ", ".join(behind)))
        shoot(page(award_card(week, hi, "Big Dick", "of the Week"), preview), out_dir / "recap-1.jpg")
        shoot(page(award_card(week, lo, "Little Bitch", "of the Week", loser=True), preview), out_dir / "recap-2.jpg")
        shoot(page(scoreboard(week, ms), preview), out_dir / "recap-3.jpg")
        shoot(page(standings(week, season, {t["m"]: t["t"] for t in teams}), preview), out_dir / "recap-4.jpg")
    else:
        b = w.get("bonus") or {}
        if not (b.get("actual") or []): bail("week %s bonus is not settled" % week)
        if str(b.get("week", week)) != str(week): bail("bonus is for week %s, not %s" % (b.get("week"), week))
        who = b["actual"][0]["who"]
        team = next((t["t"] for t in teams if t["m"] == who), None)
        if team is None: bail("bonus winner %r is not in this week's matchups" % who)
        shoot(page(bonus_card(week, b, team), preview), out_dir / "award.jpg")

if __name__ == "__main__":
    main()
