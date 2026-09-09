# `/api/scoreboard` — live Yahoo data

Powers the Weekly Scoreboard + Bonus Board on the homepage. Runs as a Vercel
serverless function. **No secrets live in this repo** — they go in Vercel's
environment variables.

If the function is missing or erroring, the homepage silently falls back to the
static Week 1 projections baked into `index.html`. The site never breaks.

## One-time setup

### 1. Register a Yahoo app

1. Go to <https://developer.yahoo.com/apps/create/>
2. **Application Name:** `Bad Hombres Scoreboard`
3. **Redirect URI (OAuth Callback Domain):** `oob`
4. **API Permissions:** check **Fantasy Sports**, `Read` is enough
5. Create it. You get a **Client ID** and **Client Secret**.

Sign in with the Yahoo account that is **in league 97724** — the API only
returns a private league to a member of it.

### 2. Get a refresh token

Open this in a browser (substitute your client ID), approve, and copy the code
Yahoo shows on screen:

```
https://api.login.yahoo.com/oauth2/request_auth?client_id=YOUR_CLIENT_ID&redirect_uri=oob&response_type=code&language=en-us
```

Trade that code for tokens:

```bash
curl -X POST https://api.login.yahoo.com/oauth2/get_token \
  -u 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' \
  -d grant_type=authorization_code \
  -d redirect_uri=oob \
  -d code=THE_CODE_FROM_THE_PAGE
```

Keep `refresh_token` from the response. It does not expire with normal use;
the function trades it for a fresh access token on demand.

### 3. Set the env vars in Vercel

Project → Settings → Environment Variables (Production + Preview):

| Name | Value |
|---|---|
| `YAHOO_CLIENT_ID` | from step 1 |
| `YAHOO_CLIENT_SECRET` | from step 1 |
| `YAHOO_REFRESH_TOKEN` | from step 2 |
| `YAHOO_LEAGUE_ID` | `97724` (optional — this is the default) |

Redeploy after adding them. Check it with:

```bash
curl -s https://bad-hombres.vercel.app/api/scoreboard | head -c 400
```

## What it returns

```jsonc
{
  "week": 1,
  "status": "preseason" | "live" | "final",
  "updated": "2026-09-09T20:31:00.000Z",
  "matchups": [{ "a": {"m":"Jason","t":"Pull-Out Game Weak","s":88.4,"p":130.2}, "b": {…} }],
  "bonus": {
    "week": 1, "nm": "Josh Allen's Money Shot", "cr": "Highest-scoring QB",
    "actual":    [{"who":"Erick","sub":"Jayden Daniels","val":31.4}, …],
    "projected": [ … ]
  }
}
```

`s` = actual score, `p` = projected. Cached 60s at the edge; the page re-polls
every 90s.

## Bonus math

The 14 weekly bonuses are computed in `computeBonus()`. Most come straight from
Yahoo team/player data. Two need outside help, both from ESPN's public API (no
key required):

- **Week 8, Popped Your Cherry** — rookies are found via ESPN team rosters
  (`experience.years === 0`), matched to Yahoo players by normalized name.
- **Week 11, Happy Ending** — Monday starters are found by mapping each player's
  NFL team to that week's ESPN schedule and keeping the `Mon` games.

Both degrade to an empty leaderboard rather than failing the whole response.

## Known limits

- Name-matching Yahoo → ESPN can miss on suffixes or nicknames. If a rookie
  looks absent in Week 8, that's the first place to look.
- Yahoo's JSON uses numeric-keyed pseudo-arrays; `flat()` / `merge()` normalize
  it. If Yahoo changes shape, those two are what break.
- **This has not been run against live Yahoo yet** — it needs the credentials
  above. Expect one round of fixes on first contact.
