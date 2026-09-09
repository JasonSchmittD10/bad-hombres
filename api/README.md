# `/api/scoreboard` — live Yahoo data

Powers the Weekly Scoreboard + Bonus Board on the homepage. Runs as a Vercel
serverless function. **No secrets live in this repo** — they go in Vercel's
environment variables.

If the function is missing or erroring, the homepage silently falls back to the
static Week 1 projections baked into `index.html`. The site never breaks.

## One-time setup

### 1. Register a Yahoo app

Go to <https://developer.yahoo.com/apps/create/> and fill in:

| Field | Value |
|---|---|
| **Application Name** | `Bad Hombres Scoreboard` |
| **Description** | (blank is fine) |
| **Homepage URL** | `https://bad-hombres.vercel.app` |
| **Redirect URI(s)** | `https://bad-hombres.vercel.app/` |
| **OAuth Client Type** | **Confidential Client** |
| **API Permissions** | leave **both boxes unchecked** |

Two things that differ from most guides online:

- **`oob` no longer works.** Yahoo used to accept the literal string `oob`
  for desktop-style apps; the form now rejects it with *"Invalid URI."* Use a
  real https URL you control. Any page on the site works — we just read the
  `code` out of the address bar in step 2, so nothing needs to handle it.
- **There is no "Fantasy Sports" checkbox any more.** The only options listed
  are *OpenID Connect Permissions* and *TW Auction*, and neither is what we
  want. Leave them unchecked — Fantasy read access comes with the token.

Sign in with the Yahoo account that is **in league 97724**. The API only
returns a private league to a member of it.

Click **Create App**. Yahoo shows you a **Client ID** and **Client Secret**.

### 2. Get a refresh token

Open this URL in a browser (paste in your client ID) and approve the prompt:

```
https://api.login.yahoo.com/oauth2/request_auth?client_id=YOUR_CLIENT_ID&redirect_uri=https://bad-hombres.vercel.app/&response_type=code&language=en-us
```

Yahoo bounces you back to the homepage with `?code=...` on the end of the URL.
Copy that code straight out of the address bar — the page itself ignores it.

Trade the code for tokens (the `redirect_uri` must match exactly):

```bash
curl -X POST https://api.login.yahoo.com/oauth2/get_token \
  -u 'YOUR_CLIENT_ID:YOUR_CLIENT_SECRET' \
  -d grant_type=authorization_code \
  -d redirect_uri=https://bad-hombres.vercel.app/ \
  -d code=THE_CODE_FROM_THE_ADDRESS_BAR
```

Keep `refresh_token` from the response. It does not expire with normal use;
the function trades it for a fresh access token on demand. The `code` is
single-use and dies in a few minutes, so do this part promptly.

### 3. Set the env vars in Vercel

Project → Settings → Environment Variables (Production + Preview):

| Name | Value |
|---|---|
| `YAHOO_CLIENT_ID` | from step 1 |
| `YAHOO_CLIENT_SECRET` | from step 1 |
| `YAHOO_REFRESH_TOKEN` | from step 2 |
| `YAHOO_LEAGUE_ID` | `97724` (optional — this is the default) |
| `YAHOO_REDIRECT_URI` | only if you registered something other than `https://bad-hombres.vercel.app/` |

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
- If the API returns 401/403 once credentials are in, the likely cause is the
  missing Fantasy permission checkbox described in step 1. Yahoo's console has
  changed here and the behaviour is not something this repo can verify ahead of
  time. `curl` the endpoint and read `error` — it passes Yahoo's status through.
