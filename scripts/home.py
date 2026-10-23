#!/usr/bin/env python3
"""The homepage's one-liners: one small set per week, in data/home.json.

    scripts/home.py                                  # this week's lines: set, missing or expired
    scripts/home.py set title "The Beer Mile Bowl"   # the Game of the Week headline
    scripts/home.py set preview "…"                  # the hero line while picks are open
    scripts/home.py set live "…"                     # the hero line once games start
    scripts/home.py set kickoff "…" --tag Paris      # the next-kickoff card
    scripts/home.py set beerMile "…"                 # footers on the On the line cards:
    scripts/home.py set bubble "…"                   #   Beer Mile Watch, The Bubble,
    scripts/home.py set bonus "…"                    #   and the week's bonus
    scripts/home.py clear live

    --week N      a week other than the one in data/week.json
    --until ISO   when the line hides itself (ISO 8601 with a UTC offset). live and kickoff
                  default to data/week.json's nextKickoff, so a line about where the week
                  stands never outlives the next game that could change it.
    --tag WORD    kickoff only: a red label on the card, when where it's played is the story

Every line is optional. A missing or expired line just hides, or the page says something
plain and computed in its place ("Hoa leads by 19.00."), so the homepage never shows a
stale joke. Who writes which line, and when: scripts/UPDATE_WEEK.md, "The homepage".

Same rules as everything the beat writes (VOICE_GUIDE.md): third person, never the
commissioner's voice, short and funny, one number at most, nothing from voice/USED.md.
One or two sentences: 140 characters at most, the title 36.
"""
import datetime, json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FILE = ROOT / "data" / "home.json"
KEYS = ["title", "preview", "live", "kickoff", "beerMile", "bubble", "bonus"]
TIMED = {"live", "kickoff"}          # default --until to the next kickoff
LIMIT = {"title": 36}                # everything else: 140
TAG_LIMIT = 14
NOTE = ("The homepage's one-liners, one set per week (scripts/UPDATE_WEEK.md, 'The homepage'). "
        "Write them with scripts/home.py, never by hand. Every line is optional: a missing or "
        "expired line just hides, so the page never shows a stale joke. Same rules as everything "
        "else the beat writes (VOICE_GUIDE.md): third person, short and funny, one number at most, "
        "nothing from voice/USED.md. title: the Game of the Week headline. preview: the hero line "
        "while picks are open (Thursday). live: the hero line once games start, with an 'until' so "
        "it expires before it goes stale. kickoff: the line on the next-kickoff card, with an "
        "optional 'tag' (where it's played, if that's the story). beerMile, bubble, bonus: the "
        "footers on the On the line cards.")

def die(msg):
    print("home: " + msg, file=sys.stderr); sys.exit(1)

def when(s):
    """An ISO 8601 time with a UTC offset, or None."""
    try: t = datetime.datetime.fromisoformat(str(s))
    except ValueError: return None
    return t if t.tzinfo else None

def now(): return datetime.datetime.now(datetime.timezone.utc)

def tidy(text):
    """One line, curly quotes and apostrophes like the rest of the site."""
    s = re.sub(r"\s+", " ", text).strip()
    s = re.sub(r"(?<=\w)'(?=\w)", "\u2019", s)          # hasn't, Wes's
    s = re.sub(r"(?<=\s)'(?=\d0s)|^'(?=\d0s)", "\u2019", s)  # '90s
    s = re.sub(r"(?<=\w)'(?=\s|[.,;:!?)]|$)", "\u2019", s)    # the Hombres' money
    s = re.sub(r'(^|[\s(\u2014])"', "\\1\u201c", s)
    s = s.replace('"', "\u201d")
    s = re.sub(r"(^|[\s(\u2014])'", "\\1\u2018", s).replace("'", "\u2019")
    return s

def text_of(v): return v.get("text") if isinstance(v, dict) else v

def problems(data):
    """[(fatal, message)] for a data/home.json that the homepage can't use as written.
    scripts/check.py runs this too, so a hand edit can't put a broken line live."""
    out = []
    if not isinstance(data, dict) or not isinstance(data.get("weeks"), dict):
        return [(True, "data/home.json needs a 'weeks' object")]
    for wk, lines in data["weeks"].items():
        where = "data/home.json week %s" % wk
        if not re.fullmatch(r"[1-9]\d?", str(wk)): out.append((True, "%s: the week must be a number" % where)); continue
        if not isinstance(lines, dict): out.append((True, "%s: expected an object of lines" % where)); continue
        for k, v in lines.items():
            if k not in KEYS: out.append((True, "%s: unknown line %r (the homepage reads %s)" % (where, k, ", ".join(KEYS)))); continue
            t = text_of(v)
            if not isinstance(t, str) or not t.strip():
                out.append((True, "%s: %s has no text" % (where, k))); continue
            if "\n" in t or t != t.strip(): out.append((True, "%s: %s must be one trimmed line" % (where, k)))
            if len(t) > LIMIT.get(k, 140): out.append((True, "%s: %s is %d characters, the limit is %d" % (where, k, len(t), LIMIT.get(k, 140))))
            if isinstance(v, dict):
                extra = set(v) - {"text", "until", "tag"}
                if extra: out.append((True, "%s: %s has unknown fields %s" % (where, k, sorted(extra))))
                if "until" in v and not when(v["until"]):
                    out.append((True, "%s: %s until %r isn't an ISO time with a UTC offset" % (where, k, v["until"])))
                if "tag" in v and (k != "kickoff" or not isinstance(v["tag"], str) or len(v["tag"]) > TAG_LIMIT):
                    out.append((True, "%s: only kickoff takes a tag, %d characters at most" % (where, TAG_LIMIT)))
            elif not isinstance(v, str):
                out.append((True, "%s: %s must be text or {text, until}" % (where, k)))
    return out

def load():
    try: data = json.loads(FILE.read_text())
    except FileNotFoundError: data = {"note": NOTE, "weeks": {}}
    except json.JSONDecodeError as e: die("data/home.json is not valid JSON (%s)" % e)
    bad = [m for fatal, m in problems(data) if fatal]
    if bad: die("fix data/home.json first:\n  " + "\n  ".join(bad))
    return data

def dump(data):
    """Pretty, but one line per homepage line, so a week's diff reads like copy."""
    js = lambda v: json.dumps(v, ensure_ascii=False)
    out = ["{", '  "note": %s,' % js(data.get("note") or NOTE), '  "weeks": {']
    wks = sorted(data["weeks"], key=int)
    for i, wk in enumerate(wks):
        lines = data["weeks"][wk]
        keys = [k for k in KEYS if k in lines]
        out.append("    %s: {" % js(str(wk)))
        out += ["      %s: %s%s" % (js(k), js(lines[k]), "," if j < len(keys) - 1 else "") for j, k in enumerate(keys)]
        out.append("    }" + ("," if i < len(wks) - 1 else ""))
    out += ["  }", "}"]
    FILE.write_text("\n".join(out) + "\n")

def week_file():
    return json.loads((ROOT / "data" / "week.json").read_text())

def opt(args, name):
    if name not in args: return None
    i = args.index(name)
    if i + 1 >= len(args): die("%s needs a value" % name)
    v = args[i + 1]; del args[i:i + 2]
    return v

def show(data, wk):
    lines = data["weeks"].get(str(wk), {})
    print("Week %s homepage lines (data/home.json):" % wk)
    for k in KEYS:
        v = lines.get(k)
        if v is None: print("  %-9s —" % k); continue
        state = ""
        if isinstance(v, dict) and v.get("until"):
            u = when(v["until"])
            state = "  [%s %s]" % ("EXPIRED" if u and u <= now() else "until", v["until"])
        if isinstance(v, dict) and v.get("tag"): state += "  [tag %s]" % v["tag"]
        print("  %-9s %s%s" % (k, text_of(v), state))

def main():
    args = sys.argv[1:]
    wk = opt(args, "--week")
    until, tag = opt(args, "--until"), opt(args, "--tag")
    w = week_file()
    wk = int(wk) if wk else w.get("week")
    if not isinstance(wk, int) or wk < 1: die("no week: pass --week N")
    data = load()

    if not args:
        show(data, wk); return
    cmd = args[0]
    if cmd == "clear" and len(args) == 2:
        k = args[1]
        lines = data["weeks"].get(str(wk), {})
        if k not in lines: print("home: week %s has no %s line" % (wk, k)); return
        del lines[k]
        if not lines: del data["weeks"][str(wk)]
        dump(data); print("week %s: %s cleared" % (wk, k)); return
    if cmd != "set" or len(args) != 3: die("usage: home.py [set KEY \"line\" [--until ISO] [--tag WORD] | clear KEY] [--week N]")

    k, text = args[1], tidy(args[2])
    if k not in KEYS: die("unknown line %r — the homepage reads %s" % (k, ", ".join(KEYS)))
    if not text: die("the line is empty")
    if len(text) > LIMIT.get(k, 140): die("%s is %d characters; keep it to %d" % (k, len(text), LIMIT.get(k, 140)))
    if tag is not None and k != "kickoff": die("only the kickoff line takes a --tag")
    if tag is not None and not (0 < len(tag.strip()) <= TAG_LIMIT): die("the tag is a word or two, %d characters at most" % TAG_LIMIT)
    if k in TIMED and until is None:
        if str(w.get("week")) != str(wk): die("%s needs --until when it's not data/week.json's week" % k)
        until = w.get("nextKickoff") or (w.get("nextGame") or {}).get("kickoff")
        if not until: die("data/week.json has no next kickoff — pass --until")
    if until is not None:
        u = when(until)
        if not u: die("--until %r isn't an ISO time with a UTC offset (2026-10-25T13:00:00-04:00)" % until)
        if u <= now(): die("--until %s is already past — the line would never show" % until)
    v = {"text": text} if (until or tag) else text
    if until: v["until"] = until
    if tag: v["tag"] = tag.strip()
    data["weeks"].setdefault(str(wk), {})[k] = v
    dump(data)
    print("week %s %s: %s%s%s" % (wk, k, text, "  (until %s)" % until if until else "", "  [%s]" % tag.strip() if tag else ""))

if __name__ == "__main__":
    main()
