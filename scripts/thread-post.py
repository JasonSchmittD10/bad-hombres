#!/usr/bin/env python3
"""Post a whole article to the league thread: one iMessage per section, no link.

    scripts/thread-post.py preview            # this week's preview article (Thursday)
    scripts/thread-post.py recap              # last week's recap article, then the standings
                                              # image and the bonus image (Tuesday)
    scripts/thread-post.py text <key> <file>  # one written message, once (the Monday Night Watch)
    DRY_RUN=1 scripts/thread-post.py recap    # print every part, send nothing

Jason's ruling (Oct 2026): the thread gets the full piece, broken up so it reads like
texts — the intro, then each section under its header — and no website link (iMessage
doesn't build link previews for scripted messages, so links just look bad). The recap
is followed by two pictures: the standings (social/week-N/recap-4.jpg) and the week's
bonus card (social/week-N/award.jpg).

Once only: every part is recorded in the post ledger (~/.bad-hombres-posts.json) as it
goes, so a rerun after a failure sends only what's missing, and a finished post is
recorded under the same keys the old posts used (opener-wN, recap-/story/…/, bonus-wN),
so nothing goes out twice. Exits 0 with "skip:" when there's nothing to send.
"""
import datetime, html, json, os, re, subprocess, sys, tempfile, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = Path(os.environ.get("BH_POST_STATE", Path.home() / ".bad-hombres-posts.json"))
DRY = os.environ.get("DRY_RUN") == "1"

def skip(why): print("skip: " + why); sys.exit(0)
def die(why): print("thread-post: " + why, file=sys.stderr); sys.exit(1)
def state(): return json.loads(STATE.read_text()) if STATE.exists() else {}
def now(): return datetime.datetime.now().astimezone().replace(microsecond=0).isoformat()

def mark(*keys):
    if DRY: return
    s = state()
    for k in keys: s[k] = now()
    STATE.write_text(json.dumps(s, indent=1))

def text(frag):
    """Plain text for a text message: tags out, a <br> kept as a line break."""
    frag = re.sub(r"<br\s*/?>", "\n", frag)
    return "\n".join(html.unescape(re.sub(r"[ \t\r\n]+", " ", re.sub(r"<[^>]+>", "", line))).strip() for line in frag.split("\n")).strip()

def article(slug):
    """[(header or None, [paragraphs])] — the intro, then one part per <h2>."""
    page = ROOT / "story" / slug / "index.html"
    if not page.exists(): skip("no article at story/%s/ — publish it first" % slug)
    s = page.read_text()
    title = text((re.search(r'<h1 class="st-h1">(.*?)</h1>', s, re.S) or [None, ""])[1])
    body = re.search(r'<div class="st-body">(.*?)</div>', s, re.S)
    if not body: die("story/%s has no body" % slug)
    parts, head, paras = [], None, []
    for tag, inner in re.findall(r'<(h2|p|blockquote)[^>]*>(.*?)</\1>', body.group(1), re.S):
        if tag == "h2":
            parts.append((head, paras)); head, paras = text(inner), []
        elif text(inner):
            paras.append(text(inner))
    parts.append((head, paras))
    parts = [(h, p) for h, p in parts if p]
    if not parts: die("story/%s has no paragraphs" % slug)
    return title, parts

def messages(kicker, title, parts):
    """The intro carries the kicker and the headline; every other part leads with its header."""
    out = []
    for i, (head, paras) in enumerate(parts):
        top = ["%s: %s" % (kicker.upper(), title)] if i == 0 else ([head.upper()] if head else [])
        out.append("\n\n".join(top + paras))
    if any(len(m) > 6000 for m in out): die("a section is over 6,000 characters — too long for one text")
    return out

def send(kind, payload):
    """One text (kind 'text') or one picture (kind 'image'), through imessage-post.sh."""
    if DRY:
        print("─── %s ───" % ("IMAGE " + str(payload) if kind == "image" else "TEXT (%d chars)" % len(payload)))
        if kind == "text": print(payload)
        return
    with tempfile.TemporaryDirectory() as d:
        msg = Path(d) / "msg.txt"
        msg.write_text(payload if kind == "text" else "")
        cmd = [str(ROOT / "scripts" / "imessage-post.sh"), str(msg)] + ([str(payload)] if kind == "image" else [])
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode: die("imessage-post.sh failed: %s" % (r.stderr or r.stdout).strip()[:300])
    time.sleep(2)                                  # keep the texts in order on the other end

def run(key, parts, also=()):
    """parts: [(kind, payload)]. Sends what isn't recorded yet, then records key (+ also)."""
    s = state()
    if key in s: skip("already posted [%s] at %s" % (key, s[key]))
    print("=== %s: %d part(s)%s ===" % (key, len(parts), " — DRY RUN, nothing sent" if DRY else ""))
    for i, (kind, payload) in enumerate(parts, 1):
        pk = "%s#%d" % (key, i)
        if pk in state(): print("part %d already sent" % i); continue
        send(kind, payload); mark(pk)
    mark(key, *also)
    if not DRY: print("posted [%s]" % key)

def week():
    return json.loads((ROOT / "data" / "week.json").read_text())

def main():
    a = sys.argv[1:]
    kind = a[0] if a else ""
    if kind == "preview":
        w = week(); n = w["week"]
        if w.get("status") != "preseason": skip("week %s has kicked off — too late for the preview" % n)
        title, parts = article("week-%s-preview" % n)
        run("opener-w%s" % n, [("text", m) for m in messages("Week %s Preview" % n, title, parts)])
    elif kind == "recap":
        w = week(); n = w["week"]
        if w.get("status") != "final": skip("week %s isn't final" % n)
        title, parts = article("week-%s-recap" % n)
        msgs = [("text", m) for m in messages("Week %s Recap" % n, title, parts)]
        d = ROOT / "social" / ("week-%s" % n)
        for img, what in (("recap-4.jpg", "the standings"), ("award.jpg", "the bonus card")):
            if not (d / img).exists(): skip("%s isn't rendered (social/week-%s/%s) — run social-render.py first" % (what, n, img))
            msgs.append(("image", d / img))
        run("recap-/story/week-%s-recap/" % n, msgs, also=("bonus-w%s" % n,))
    elif kind == "text":
        if len(a) < 3: sys.exit("usage: thread-post.py text <key> <file>")
        body = Path(a[2]).read_text().strip()
        if not body: die("the message file is empty")
        run(a[1], [("text", body)])
    else:
        sys.exit(__doc__)

if __name__ == "__main__":
    main()
