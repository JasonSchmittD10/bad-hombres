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
