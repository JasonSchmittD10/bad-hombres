// Diagnostic: which Yahoo fantasy endpoints does the current token reach?
// Distinguishes an app-permission problem from a league-access problem.
// Safe to delete once the data path works.

const env = (n) => (process.env[n] || '').replace(/\s+/g, '');

async function token() {
  const r = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization:
        'Basic ' + Buffer.from(`${env('YAHOO_CLIENT_ID')}:${env('YAHOO_CLIENT_SECRET')}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      redirect_uri: env('YAHOO_REDIRECT_URI') || 'https://bad-hombres.vercel.app/api/yahoo-callback',
      refresh_token: env('YAHOO_REFRESH_TOKEN'),
    }),
  });
  const j = await r.json();
  return { ok: r.ok, status: r.status, access: j.access_token, body: j };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const out = {};
  try {
    const t = await token();
    out.tokenRefresh = { ok: t.ok, status: t.status };
    if (!t.access) {
      out.tokenError = t.body;
      return res.status(200).json(out);
    }
    const probes = {
      gameMeta: '/game/nfl',                       // public-ish fantasy data
      myGames: '/users;use_login=1/games',         // proves fantasy scope on this user
      myLeagues: '/users;use_login=1/games;game_codes=nfl/leagues', // which leagues we can see
      theLeague: '/league/nfl.l.97724',            // the one we actually want
    };
    for (const [name, path] of Object.entries(probes)) {
      const r = await fetch(`https://fantasysports.yahooapis.com/fantasy/v2${path}?format=json`, {
        headers: { Authorization: `Bearer ${t.access}` },
      });
      const text = await r.text();
      out[name] = { status: r.status, sample: text.slice(0, 400) };
    }
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ ...out, thrown: String(e.message || e) });
  }
}
