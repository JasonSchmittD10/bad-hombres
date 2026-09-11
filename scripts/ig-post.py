#!/usr/bin/env python3
"""Post the week's recap carousel or bonus award to @badhombresfantasy, once.

    scripts/ig-post.py check            # token works and belongs to the right account
    scripts/ig-post.py recap            # carousel: Big Dick, Little Bitch, scoreboard, standings
    scripts/ig-post.py award            # single image: the week's bonus winner
    scripts/ig-post.py matchups         # Thursday carousel: slate, six matchups, Wes's lock
    DRY_RUN=1 scripts/ig-post.py recap  # every local check, no call to Instagram
    scripts/ig-post.py matchups --data snapshot.json   # deliberate test against a week snapshot;
                                                       # scheduled tasks never pass --data

Uses the Instagram API with Instagram Login (graph.instagram.com). Instagram
fetches images from public URLs, so the images must already be committed and
deployed: social/week-N/{recap-1..4,award,matchups-1..8}.jpg, with captions
in social/week-N/{recap,award,matchups}.txt. See scripts/UPDATE_WEEK.md, "Posting to Instagram".

Credentials live OUTSIDE the repo in ~/.bad-hombres-ig.env (chmod 600):
    IG_ACCESS_TOKEN=...          long-lived token for @badhombresfantasy
The script refreshes the token when it is more than 30 days old (they last 60)
and writes the new one back to that file.

Skips (exit 0, nothing posted) when the post already went out, the week isn't
final, or the images/captions aren't ready. Exits 1 on an API error. It never
prints the token.
"""
import datetime, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://bad-hombres.vercel.app"
ACCOUNT = "badhombresfantasy"
API = "https://graph.instagram.com/" + os.environ.get("IG_API_VERSION", "v23.0")
ENV = Path(os.environ.get("BH_IG_ENV", Path.home() / ".bad-hombres-ig.env"))
STATE = Path(os.environ.get("BH_POST_STATE", Path.home() / ".bad-hombres-posts.json"))
DRY = os.environ.get("DRY_RUN") == "1"

def skip(why):
    print("skip: " + why); sys.exit(0)

def die(why):
    print("ig-post: " + why, file=sys.stderr); sys.exit(1)

# ---- credentials ----------------------------------------------------------
def load_env():
    if not ENV.exists(): die("no %s — see the Instagram setup in scripts/UPDATE_WEEK.md" % ENV)
    env = dict(re.findall(r"^\s*([A-Z_]+)\s*=\s*(.*?)\s*$", ENV.read_text(), re.M))
    if not env.get("IG_ACCESS_TOKEN"): die("IG_ACCESS_TOKEN missing from %s" % ENV)
    return env

def save_env(env):
    ENV.write_text("".join("%s=%s\n" % kv for kv in env.items()))
    ENV.chmod(0o600)

# ---- api -------------------------------------------------------------------
def call(method, path, token, **params):
    params["access_token"] = token
    data = urllib.parse.urlencode(params).encode()
    if method == "GET":
        req = urllib.request.Request("%s/%s?%s" % (API, path, data.decode()))
    else:
        req = urllib.request.Request("%s/%s" % (API, path), data=data, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        try: msg = json.loads(body)["error"]["message"]
        except Exception: msg = body[:300]
        die("%s %s failed (%s): %s" % (method, path, e.code, msg))

def maybe_refresh(env):
    """Long-lived tokens last 60 days; refresh at 30 so a quiet month can't kill it."""
    issued = env.get("IG_TOKEN_ISSUED")
    age = (datetime.date.today() - datetime.date.fromisoformat(issued)).days if issued else 999
    if age < 30: return env["IG_ACCESS_TOKEN"]
    q = urllib.parse.urlencode({"grant_type": "ig_refresh_token", "access_token": env["IG_ACCESS_TOKEN"]})
    try:
        with urllib.request.urlopen("https://graph.instagram.com/refresh_access_token?" + q, timeout=60) as r:
            tok = json.loads(r.read())["access_token"]
    except Exception as e:
        # an old-but-valid token still works; say so and carry on
        print("warning: token refresh failed (%s); using the existing token" % type(e).__name__, file=sys.stderr)
        return env["IG_ACCESS_TOKEN"]
    env["IG_ACCESS_TOKEN"], env["IG_TOKEN_ISSUED"] = tok, datetime.date.today().isoformat()
    save_env(env); print("refreshed the Instagram token")
    return tok

def whoami(token):
    me = call("GET", "me", token, fields="user_id,username")
    if me.get("username", "").lower() != ACCOUNT:
        die("token belongs to @%s, not @%s — refusing to post" % (me.get("username"), ACCOUNT))
    return me["user_id"]

def wait_ready(cid, token):
    for _ in range(40):
        st = call("GET", cid, token, fields="status_code").get("status_code")
        if st == "FINISHED": return
        if st in ("ERROR", "EXPIRED"): die("media container %s is %s" % (cid, st))
        time.sleep(3)
    die("media container %s never finished processing" % cid)

# ---- the post --------------------------------------------------------------
def material(kind, data=None):
    w = json.loads((Path(data) if data else ROOT / "data" / "week.json").read_text())
    week = w.get("week")
    d = ROOT / "social" / ("week-%s" % week)
    if kind == "matchups":
        # a preview only makes sense before kickoff — after it, the projections are stale
        teams = [t for mu in w.get("matchups") or [] for t in (mu["a"], mu["b"])]
        if w.get("status") != "preseason" or any(t.get("s") for t in teams):
            skip("week %s has already kicked off — too late for a preview" % week)
        imgs = sorted(d.glob("matchups-*.jpg"), key=lambda p: int(re.search(r"(\d+)", p.stem).group(1)))
        if len(imgs) < 7: skip("matchup preview not rendered yet (%d of at least 7 slides)" % len(imgs))
        if len(imgs) > 10: die("%d slides; an Instagram carousel holds 10" % len(imgs))
    else:
        if w.get("status") != "final": skip("week %s is not final yet" % week)
        names = ["recap-%d.jpg" % i for i in range(1, 5)] if kind == "recap" else ["award.jpg"]
        imgs = [d / n for n in names]
        missing = [str(p.relative_to(ROOT)) for p in imgs if not p.exists()]
        if missing: skip("not rendered yet: %s" % ", ".join(missing))
    cap_path = d / ("%s.txt" % kind)
    if not cap_path.exists(): skip("no caption at %s" % cap_path.relative_to(ROOT))
    caption = cap_path.read_text().strip()
    if not caption: skip("caption is empty")
    if len(caption) > 2200: die("caption is %d characters; Instagram allows 2200" % len(caption))
    if len(re.findall(r"#\w", caption)) > 30: die("caption has more than 30 hashtags")
    return week, imgs, caption

def check_live(imgs):
    """Instagram fetches these itself, so they must be deployed — and be these exact files."""
    urls = []
    for p in imgs:
        url = "%s/%s" % (SITE, p.relative_to(ROOT).as_posix())
        try:
            with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=30) as r:
                ctype, size = r.headers.get("Content-Type", ""), int(r.headers.get("Content-Length") or -1)
        except urllib.error.HTTPError as e:
            skip("%s is not live yet (%s) — commit, push and let Vercel deploy first" % (url, e.code))
        if "image/jpeg" not in ctype: die("%s is %s, not a JPEG" % (url, ctype))
        if size != p.stat().st_size: skip("%s is live but differs from the local file — deploy still in progress?" % url)
        urls.append(url)
    return urls

def main():
    argv = sys.argv[1:]
    data = argv[argv.index("--data") + 1] if "--data" in argv else None
    kind = argv[0] if argv else ""
    if kind not in ("check", "recap", "award", "matchups"): sys.exit(__doc__)

    if kind == "check":
        env = load_env(); tok = maybe_refresh(env)
        print("ok: token works for @%s (user %s)" % (ACCOUNT, whoami(tok))); return

    week, imgs, caption = material(kind, data)
    if data: print("TEST: week state from %s, not data/week.json" % data)
    key = "ig-%s-w%s" % (kind, week)
    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    if key in state: skip("already posted [%s] at %s" % (key, state[key]))
    urls = check_live(imgs)

    print("=== %s, week %s: %d image(s) ===" % (kind, week, len(urls)))
    for u in urls: print("  " + u)
    print("--- caption (%d chars) ---\n%s\n---" % (len(caption), caption))
    if DRY:
        print("DRY_RUN: nothing sent to Instagram"); return

    env = load_env(); tok = maybe_refresh(env)
    uid = whoami(tok)
    if len(urls) == 1:
        cid = call("POST", "%s/media" % uid, tok, image_url=urls[0], caption=caption)["id"]
    else:
        kids = []
        for u in urls:
            k = call("POST", "%s/media" % uid, tok, image_url=u, is_carousel_item="true")["id"]
            wait_ready(k, tok); kids.append(k)
        cid = call("POST", "%s/media" % uid, tok, media_type="CAROUSEL", children=",".join(kids), caption=caption)["id"]
    wait_ready(cid, tok)
    mid = call("POST", "%s/media_publish" % uid, tok, creation_id=cid)["id"]

    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    state[key] = datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()
    STATE.write_text(json.dumps(state, indent=1))
    link = call("GET", mid, tok, fields="permalink").get("permalink", "")
    print("posted [%s] %s" % (key, link))

if __name__ == "__main__":
    main()
