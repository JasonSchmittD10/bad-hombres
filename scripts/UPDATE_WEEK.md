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

Once at the end of each game day: after Thursday night, after Sunday night,
after Monday night. Monday's run closes the week out.

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
- `bonus.actual` is the top 3 for that week's award, best first

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

# Updating `data/season.json` (weekly recap task)

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

# Updating `data/voices.json` (weekly recap task)

State for the two recurring voices in `VOICE_GUIDE.md`. Update it **after**
`season.json`, in the same Tuesday pass.

```jsonc
{
  "wes":  {"record":{"w":1,"l":0},
           "locks":[{"week":2,"pick":"Hoa over Tola","result":null}]},
  "zack": {"history":[{"week":1,"index":-4,"paRank":2,"standingsRank":6}]}
}
```

**Pastor Wes's Lock of the Week.** Each recap names one pick for next week. On
Tuesday: grade last week's lock (`result` → `"W"` or `"L"`), bump `record`, then
append this week's new lock with `result: null`. The record is quoted in the
recap and should be allowed to be bad — never shade a grade.

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

Kinds: `opener` (Thursday matchups), `progress` (Sunday night scores),
`recap` (Tuesday, article intro + link), `bonus` (Tuesday, winner + award art).

**Always refresh `week.json` from Yahoo before posting.** Every kind reads the
committed data — posting on stale data is the main way this goes wrong.

## Guards (in code, not instructions)

- `opener` refuses if week.json still has actual scores — that means the week
  was not rolled forward.
- `progress` refuses when no live scores exist yet.
- `bonus` refuses unless status is `final` and a winner exists.
- Every post is keyed (`kind-wN`, recap keyed to the article slug) in
  `~/.bad-hombres-posts.json`, so nothing goes out twice.
- A skip exits 0. **Never edit a script to bypass a guard** — the guard firing
  means the data is not ready, and twelve people see whatever gets sent.

Group threads need AppleScript; the iMessage MCP only addresses individuals.
Requires Messages running and signed in on Jason's Mac — same constraint as
the Yahoo scrape, so none of this can run in the cloud.
