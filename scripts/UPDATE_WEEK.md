# Updating `data/week.json`

The homepage scoreboard reads this file. Updating a week is one small commit —
never edit `index.html` for scores.

**Why this is manual:** Yahoo's Fantasy API is not available to us (every
endpoint returns `401 additional_authorization_required`, and the app console
offers no permission to grant). Yahoo also returns `429` to server-side requests
from cloud IPs, so no function or GitHub Action can fetch it either. The only
route that works is a real browser on a residential IP, signed in as a league
member — i.e. Jason's Chrome, driven from a Claude session.

## Cadence

One task, `bad-hombres-scoreboard`, fires at 00:20 and 19:20 on Sun/Mon/Tue/Fri and
works out which moment it is. Four of those firings matter; the rest exit doing nothing:

| Run | Fires | Job |
|---|---|---|
| **A** Thursday night | Fri 00:20 | TNF is done — refresh, status `live`, no post |
| **B** Sunday evening | Sun 19:20 | the 1pm/4pm games are done, SNF hasn't kicked off — refresh, then post the afternoon scores to the thread |
| **C** Sunday night | Mon 00:20 | SNF is done, Monday still to play — refresh, then post the in-progress scores |
| **D** Monday night | Tue 00:20 | MNF is done — refresh, status `final`, settle the season layer, no post (the Week Recap task writes and posts at 7am) |

Every run checks `nextGame` and never nulls `bonus`. A run that finds no newly completed
games makes no commit and posts nothing — that is a normal outcome, not a failure.

## Steps

### 1. Read the league pages through Chrome

Use the Claude-in-Chrome tools (Jason is signed in). League 97724:

- Live/completed scores: `https://football.fantasysports.yahoo.com/f1/97724?week=N`
- Standings: `https://football.fantasysports.yahoo.com/f1/97724`

Parsing tip carried over from the old builder, still works: fetch the page,
strip `<script>`/`<style>`, read `innerText`, slice between `Matchups` and
`Recent Transactions`, then for each line equal to `vs` take `lines[i-4]` =
team A, `lines[i-2]` = score A, `lines[i+1]` = score B, `lines[i+3]` = team B.

Do **not** fetch these with `curl` from here — Yahoo 429s datacenter IPs.

### 2. Write `data/week.json`

```jsonc
{
  "week": 1,
  "status": "live",          // "preseason" | "live" | "final"
  "updated": "2026-09-13T23:55:00-04:00",   // ISO, when the scrape ran
  "matchups": [
    { "a": {"m":"Jason","t":"Pull-Out Game Weak","s":118.4,"p":130.2},
      "b": {"m":"Drew","t":"I Stand with Jordon","s":101.7,"p":123.9} }
  ],
  "bonus": {
    "week": 1, "nm": "Josh Allen's Money Shot", "cr": "Highest-scoring QB",
    "actual":    [{"who":"Erick","sub":"Jayden Daniels","val":31.4}],
    "projected": []
  }
}
```

- `m` = manager first name — still the stable key: it selects the profile photo
  and is what the bonus board shows. It is no longer printed on the matchup row.
- `t` = current team name. This is what the scoreboard row displays, so keep it
  current when someone renames their team.
- `s` = actual score, `p` = projected
- `status`: `live` while any game is unplayed, `final` after Monday night
- `bonus.actual` is the top 3 for that week's award, best first — the **live
  leaderboard** while `status` is `live`, the settled result once `final`
- **Never set `bonus` to `null`.** The Bonus Board reads `bonus.actual` and
  `bonus.projected` all week; null blanks it (Week 1, Sunday 8pm). If you can't
  read the leaders, leave the existing object untouched.

### `nextGame` — the homepage hero

```jsonc
"nextGame": {"away":"BUF","home":"MIA","kickoff":"2026-09-17T20:15:00-04:00",
             "label":"Thursday, Sept 17 at 8:15 PM ET","network":"Prime Video"}
```

The hero reads `week.json`: a countdown to `nextGame.kickoff`, then "Week N is
Live" once it passes, then **"Week N is Complete"** once `status` is `final`,
with `nextGame` as the matchup under it. So when a week goes final (the
scoreboard run D; the Week Recap re-checks), `nextGame` must move to the first
game of NFL week N+1 — from ESPN's schedule, teams by ESPN abbreviation (logos
are `assets/nfl/<abbr>.png`). If it can't be confirmed, set it to `null`: the
hero hides the matchup rather than show a game that's already been played.

Award names and criteria live in `index.html` as `BH_BONUSES` — the scoreboard
and the season awards grid both read it, so don't restate them anywhere else.

### 3. Sanity-check and ship

```bash
python3 -c "import json;d=json.load(open('data/week.json'));print(d['week'],d['status'],len(d['matchups']))"
```

Expect 6 matchups and 12 distinct managers. Then commit and push — Vercel
deploys in about 10 seconds. Verify:

```bash
curl -s https://bad-hombres.vercel.app/data/week.json | head -c 200
```

## Season awards

Once a week's award is settled, record the winner so the flip card on the
homepage stops saying TBD. Winners live in `BH_AWARD_WINNERS` in `index.html`.

---

# Updating `data/season.json` (the Week Recap task)

Drives the **Standings** table and the **Power Lines** chart. Unlike
`week.json` this changes **once a week**, with the Tuesday recap.

```jsonc
{
  "updated": "2026-09-15T09:00:00-04:00",
  "playoffCut": 6,
  "weeklyBonus": 9,
  "teams": [
    {"m":"Drew","t":"I Stand with Jordon","w":1,"l":0,"tie":0,"pf":134.9,"bank":9}
  ],
  "ranks": [
    {"label":"PRE",  "order":["Drew","Wes","..."]},
    {"label":"WK 1", "order":["David","Hoa","..."]}
  ]
}
```

- `teams[].pf` is **season points for** (cumulative). The table divides by games
  played to show Avg per week — don't pre-average it.
- `teams[].pa` is **season points against** (cumulative), from the same Yahoo
  standings page. The site doesn't display it; it feeds Zack's Luck Index in
  `data/voices.json`.
- `teams[].bank` is dollars won from weekly bonuses so far ($9 each).
- `ranks` is **your** power ranking, not the standings — one entry per week,
  appended, `order` listing all 12 manager keys best to worst. Labels must be
  `PRE` or `WK n`; the chart lays out `PRE` through `WK 14` and fills in what
  exists.
- Standings sort themselves: wins (ties count half), then points for. Before any
  games are played they hold the `PRE` order rather than showing an arbitrary
  list.

Validate:

```bash
python3 -c "import json;d=json.load(open('data/season.json'));print(len(d['teams']),[r['label'] for r in d['ranks']])"
```

The playoff cut line sits after 6 — the league takes six teams.

---

# The league record (`data/record.json`)

Every game the league has played, and the source for the Record Book and the
member profiles. **Updated once a week, when the week goes final:**

```bash
scripts/build-history.py add-week     # append the final week in data/week.json, rebuild everything
scripts/build-history.py build        # rebuild without adding (after a hand fix)
```

- `record.json` holds each season's regular-season games by week as
  `[code, score, code, score]`, playoff games, finishes (`place`), champions,
  team names, drafts and brackets. The season being played is named in
  `current`: it has games and team names, but no finishes or champion.
- `add-week` rebuilds `data/history.json` (profiles: career record, averages,
  weekly high scores, weeks atop the standings, best/worst games, blowouts,
  head-to-head, league ranks) and the Record Book's embedded data. Bios, team
  names and tags in `history.json` are hand-written and carried over.
- Safe to re-run. A week already recorded is a no-op; changed scores replace
  the old ones (Yahoo stat corrections); a missing earlier week is refused.
- Who runs it: the scoreboard task's run D (Tue 00:20) once the week is `final`;
  Tuesday's recap re-runs it before writing, since recap comps and the matchup
  previews' all-time series read `history.json`.
- **At season's end** (after the championship), `current` gets finishes: add
  `place`, `champ`, `playoffs`, `bracket` (and `draft`) for the year, then
  remove `current`. That's a once-a-year hand step — the pages treat any season
  without `place` as still in progress.
- The 2021–25 numbers are reproduced exactly from the games (checked when this
  was built): `scripts/build-history.py build --exclude-current --out /tmp/h.json`
  and compare to a pre-2026 `history.json` if the rules ever change.

---

# Updating `data/voices.json` (the Week Recap task)

State for the two recurring voices in `VOICE_GUIDE.md`. Update it **after**
`season.json`. Who does what:

| Step | Owner |
|---|---|
| Grade last week's lock, compute the Luck Index | The scoreboard task's run D (Tue 00:20), once the week is `final` (the Week Recap re-checks it) |
| Write this week's lock | The **Week Preview** task, Thursday, in the preview article — picked from this week's real matchups so it is never stale |
| Record next week's Game of the Week | The **Week Recap** task, before it writes Looking ahead: `scripts/game-of-the-week.py --matchups next.json` (Thursday's Week Preview runs it too, as a fallback — it records only if Tuesday didn't) |

```jsonc
{
  "wes":  {"record":{"w":1,"l":0},
           "locks":[{"week":2,"pick":"Hoa over Tola","result":null}]},
  "zack": {"history":[{"week":1,"index":-4,"paRank":2,"standingsRank":6}]},
  "gotw": [{"week":2,"a":"Tola","b":"Erick","reason":"Projected within 1.4"}]
}
```

**Pastor Wes's Lock of the Week.** Each recap names one pick for next week. On
Tuesday: grade last week's lock (`result` → `"W"` or `"L"`), bump `record`, then
append this week's new lock with `result: null`. The record is quoted in the
recap and should be allowed to be bad — never shade a grade.

**Game of the Week.** Scored by `scripts/bh_league.py` `watchability()` and
recorded once by `scripts/game-of-the-week.py`; after that it's locked and
every post reads it (`VOICE_GUIDE.md`, "One week, one story"). On Tuesday the
input is next week's matchups with Yahoo projections, as
`{"week": N+1, "matchups": [...]}` in the week.json matchup shape. With no
`--matchups` it reads `data/week.json` (Thursday, after the roll-forward).
`--force` re-decides — only before anything about that week is published.

**Luck Index.** `index = paRank − standingsRank`, where `paRank` 1 = most points
scored against (unluckiest) and `standingsRank` uses the site's own sort (wins,
ties half, then points for). Range −11 to +11; negative means the schedule is
doing it to you. Compute it, don't eyeball it:

```bash
python3 - <<'EOF'
import json
t=json.load(open('data/season.json'))['teams']
st=sorted(t,key=lambda x:(-(x['w']+x['tie']/2),-x['pf']))
pa=sorted(t,key=lambda x:-x['pa'])
sr=[x['m'] for x in st].index('Zack')+1; pr=[x['m'] for x in pa].index('Zack')+1
print({"index":pr-sr,"paRank":pr,"standingsRank":sr})
EOF
```

---

# Publishing the weekly recap (the Week Recap task)

The recap is written to `VOICE_GUIDE.md` — the six-beat running order, the
recurring voices, the eight rules — and published with one script, which does
the story page, the Updates card (first) and the homepage feature in one go:

```bash
scripts/publish-story.py spec.json            # refuses if the slug exists
scripts/publish-story.py spec.json --force    # replace a story with that slug
```

The spec shape and the allowed body markup are in the script's header. The
rules that matter:

- **Slug `week-N-recap`.** The Tuesday post is keyed to the slug, so a stable
  slug is what stops the same recap going to the thread twice. The Thursday
  preview publishes the same way as `week-N-preview` (kicker `Week N · The
  Preview`); the Tuesday iMessage post only ever shares a `week-N-recap`, so a
  failed recap can't send the preview to the thread by mistake.
- **Body markup:** `<p class="lede">` first, then `<p>`, `<h2 class="st-h2">`
  for the six section heads, `<blockquote class="st-q">` for one pull quote,
  `<p class="sign">` for Chatnerdness, inline `<b>/<em>/<a>`. **No `<div>`** —
  the script refuses it, because the iMessage post finds the end of the body
  at the first `</div>`.
- **The lede is the post.** The Tuesday iMessage post is the story's opening
  paragraphs, taken until they pass 160 characters, plus a link. Write the
  opening scene so it works on its own.
- **Hero:** `assets/members/svg/<Manager>.svg` for whoever the lead story
  is about — vector, so it's sharp at any size (photo at
  `assets/members/<Manager>.jpg` if a new member has no illustration yet).
  The award art is 220px, too small for a hero.
- **Stats:** up to four tiles. Use Big Dick, Little Bitch and the bonus.
- **Link preview:** the script renders `story/<slug>/og.jpg` (1200×630: hero,
  kicker, headline) and points the page's `og:image` at it, so the recap link
  in the thread shows a card. The site-wide card is `/og.jpg`
  (`scripts/social-render.py og`). Keep preview tags right after `<title>` —
  link previewers only read the top of the page.

Check it before you commit:

```bash
DRY_RUN=1 scripts/league-post.sh recap    # the exact text the thread will get
```

---

# Scraping a week's bonus leaders

Worked example (Week 1, highest-scoring QB). Run in Jason's Chrome on the
league origin — same-origin `fetch` carries the session, so you can pull all
twelve team pages without twelve navigations:

```js
for (var i = 1; i <= 12; i++) {
  var h = await fetch('/f1/97724/' + i + '?week=1', {credentials:'include'}).then(r => r.text());
  var d = new DOMParser().parseFromString(h, 'text/html');
  var t = d.querySelector('#statTable0');           // starters; #statTable1 is the bench
  ...
}
```

Two traps, both real:

- **Column indices shift between teams.** Your own team page has an `Edit`
  column that other teams' pages don't, and rows carry one more `<td>` than the
  header has `<th>`. Read the header, then offset by
  `td.length - cols.length`. Never hardcode a column number.
- **Player names run together** with the note/forecast links
  (`Jaxson DartVideo ForecastPlayer Note NYG - QB ...`). Take the text of the
  row's `a[href*="/players/"]` instead of the cell.

Write the result into `week.json` as `bonus.projected` (and `bonus.actual` once
games are played), best first, `who` = manager key, `sub` = the player.

---

# Posting to the league iMessage thread

Thread: **Bad Hombres Fantasy 2026** — chat id `any;+;chat797144106140278556`, 12 people.

```bash
DRY_RUN=1 scripts/league-post.sh recap     # see it, send nothing
scripts/league-post.sh recap               # send it
```

Kinds: `opener` (Thursday: the topper and a link to the preview article — nothing else),
`afternoon` (Sunday 7:30pm, topper + scores), `progress` (Sunday night scores),
`recap` (Tuesday, article intro + link), `bonus` (Tuesday, the Instagram award card and
nothing else — no list, no link).

**Always refresh `week.json` from Yahoo before posting.** Every kind reads the
committed data — posting on stale data is the main way this goes wrong.

## Guards (in code, not instructions)

- `opener` refuses if week.json still has actual scores (the week was not rolled
  forward), if `BH_TOPPER` is empty (the write-up is the post), or if
  `story/week-N-preview/` has not been published (there is no link to send).
- `progress` refuses when no live scores exist yet.
- `bonus` refuses unless status is `final`, a winner exists, and
  `social/week-N/award.jpg` has been rendered — the card IS the post.
- Every post is keyed (`kind-wN`, recap keyed to the article slug) in
  `~/.bad-hombres-posts.json`, so nothing goes out twice.
- A skip exits 0. **Never edit a script to bypass a guard** — the guard firing
  means the data is not ready, and twelve people see whatever gets sent.

Group threads need AppleScript; the iMessage MCP only addresses individuals.
Requires Messages running and signed in on Jason's Mac — same constraint as
the Yahoo scrape, so none of this can run in the cloud.

---

# Posting to Instagram

Account: **[@badhombresfantasy](https://www.instagram.com/badhombresfantasy/)** — public.
Three posts a week: two on Tuesday after the recap is published, one on Thursday before
kickoff.

| Post | Images | Caption | Posted by |
|---|---|---|---|
| Recap carousel | `social/week-N/recap-1..4.jpg` — results, Big Dick, Little Bitch, standings | `social/week-N/recap.txt` | `bad-hombres-week-recap`, Tue 7am |
| Bonus award | `social/week-N/award.jpg` — award art + winner's illustration | `social/week-N/award.txt` | `bad-hombres-week-recap`, Tue 7am |
| Matchup preview | `social/week-N/matchups-1..9.jpg` — slate, Game of the Week, five more matchups, Wes's lock, standings | `social/week-N/matchups.txt` | `bad-hombres-week-preview`, Thu noon |

Each day is one task, end to end. **Week Recap** (Tue 7am) settles the week, publishes the
recap, drafts both Instagram posts from it, then posts: group chat first (the recap link,
then the award card), then the carousel, then the bonus award. **Week Preview** (Thu noon)
rolls the week forward, picks Wes's lock, publishes the preview article, then posts the
opener and the matchup carousel. Rules for the captions are in `VOICE_GUIDE.md`,
"Instagram"; art rules are in "Article art".

```bash
scripts/social-render.py recap                 # images from data/week.json (must be final)
scripts/social-render.py award
scripts/social-render.py matchups              # Thursday, before kickoff only
scripts/social-render.py recap --preview DIR   # any state, to DIR, watermarked PREVIEW
DRY_RUN=1 scripts/ig-post.py recap             # every check, nothing sent
scripts/ig-post.py recap                       # post it
scripts/ig-post.py check                       # token works, right account
```

Images are 1080×1350 JPEG (Instagram's 4:5 portrait), built as self-contained
HTML and shot with headless Chrome in a throwaway profile. The award art comes
from `assets/awards/hd/wkN.jpg` (1080px; the 220px site versions are too small).

## Guards (in code)

- The render refuses unless the week is `final`, and refuses a tie for high or
  low score — those get decided by hand.
- The post refuses unless the token belongs to **@badhombresfantasy**.
- Instagram fetches the images from the live site, so the post refuses until
  every URL is deployed **and byte-identical to the local file** — a
  half-finished Vercel deploy can't post the wrong picture.
- The matchup preview refuses (render and post) once any score is on the
  board — after kickoff the projections are stale.
- Captions over 2,200 characters or 30 hashtags are refused (Instagram would
  reject them anyway).
- Tags only the members a post is about, from `data/handles.json`: the recap
  carousel tags Big Dick and Little Bitch of the Week, the award tags the
  winner, the matchup preview tags nobody. A member with no handle isn't
  tagged. Captions may not tag anyone themselves.
- Keyed `ig-recap-wN` / `ig-award-wN` / `ig-matchups-wN` in `~/.bad-hombres-posts.json`.
  **Check the key landed after posting** — in Week 2 the recap and award went out but were
  never recorded, which left them one rerun away from posting twice. Nothing
  posts twice. A skip exits 0.

## One-time setup (Jason)

Instagram only allows automated posting through Meta's official API, which
needs an app and a token. Meta's console labels drift; the path is roughly:

1. **Instagram app → Settings → Account type and tools → Switch to professional
   account** (Creator or Business). Personal accounts can't use the API.
2. **[developers.facebook.com](https://developers.facebook.com/apps) → Create
   app** → use case *Manage messaging & content on Instagram* (the "Instagram
   API"). The app can stay in Development mode — it only ever posts to your
   own account, so no App Review is needed.
3. **Make the account a tester — required in Development mode**, or the
   authorize screen fails with *"Insufficient Developer Role"*:
   - App dashboard → **App roles → Roles → Add People → Instagram Tester** →
     `badhombresfantasy`.
   - Signed in **as @badhombresfantasy**, accept it at
     [instagram.com/accounts/manage_access](https://www.instagram.com/accounts/manage_access/)
     → *Tester Invites* (or in the app: *Settings → Website permissions →
     Apps and websites*).
4. In the app: **Instagram → API setup with Instagram login → Generate access
   tokens → Add account**, and log in as @badhombresfantasy. The authorize
   screen uses whichever Instagram account the browser is signed into — if
   that's a personal account it fails the same way, so use a private window.
   The permissions needed are `instagram_business_basic` and
   `instagram_business_content_publish`.
5. Copy the generated token and save it **outside the repo** — this prompts
   for it so it never lands in your shell history:

   ```bash
   read -rs "t?Paste token: " && printf 'IG_ACCESS_TOKEN=%s\nIG_TOKEN_ISSUED=%s\n' "$t" "$(date +%F)" > ~/.bad-hombres-ig.env && chmod 600 ~/.bad-hombres-ig.env && unset t
   ```

6. `scripts/ig-post.py check` should print `ok: token works for @badhombresfantasy`.
7. Set the profile's bio link to https://bad-hombres.vercel.app — captions say
   "link in bio".

Tokens last 60 days. `ig-post.py` refreshes it automatically once it's 30
days old, so as long as it posts at least monthly it never expires. If it
does lapse (a long off-season), repeat steps 4–5.

---

# The group-chat export

Chatnerdness and any quoted line come from `~/Documents/bad-hombres-chat/bad-hombres-full-2021-2026.tsv`
(columns: date, SENDER, text). The Week Recap task checks every week whether it covers the
week just played, and writes the recap without Chatnerdness when it doesn't.

It refreshes itself: a launchd job, `com.badhombres.chat-export`, runs
`~/Documents/bad-hombres-chat/refresh.sh` every **Tuesday at 6:00am**, an hour before the
recap. The wrapper dumps to a temp file and only replaces the export if the new one has rows
and isn't smaller, so a failed run never wipes a good export. Every run appends a line to
`~/Documents/bad-hombres-chat/refresh.log`.

Reading `~/Library/Messages/chat.db` needs **Full Disk Access for `/bin/zsh`** (System
Settings → Privacy & Security → Full Disk Access → + → ⌘⇧G `/bin/zsh`). Without it the log
says `REFUSED ... 0 lines` and the old export stays. Claude's own sessions can't refresh it
either way. To run it by hand from a Terminal that has access:

```bash
~/Documents/bad-hombres-chat/refresh.sh
```

The chat is an accent, never a dependency (`VOICE_GUIDE.md`, "The group chat is an accent,
not a source"). A missing sign-off is a footnote; an invented quote is a firing.

---

# Before every push: `scripts/check.py`

```bash
scripts/check.py                               # exit 1 and print FAIL lines if anything is wrong
scripts/check.py --posted opener-w3 ig-matchups-w3   # also require those ledger keys
```

Every routine runs it right before pushing and refuses to push on a FAIL. It checks the
things that have actually gone wrong: a null bonus, a countdown pointing at a game already
played, a settled week with no Bonus Board winner, standings that disagree with the game
log, Wes's record drifting from his graded locks, a missing handle entry, a story without
its art, and posts that went out but never made the ledger.

# Tied weekly bonus

If two or more managers tie for a weekly bonus, **they all win it and the $9 splits
evenly** (Jason's ruling, Sept 2026). Record every tied manager in `bonus.actual` at the
same value, note the split in the report, and enter the award in the money ledger with all
of them in `who` — the ledger already splits a shared award evenly. Ties for Big Dick or
Little Bitch of the Week still stop the recap carousel and wait for Jason.
