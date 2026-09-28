// Bad Hombres — a read-only window onto Yahoo, for this league's seasons only.
// Vercel serverless function. No dependencies.
//
//   GET /api/yahoo?chain=1            this league's seasons, newest first: [{season, key}]
//   GET /api/yahoo?path=<yahoo path>  Yahoo's JSON for that path, untouched
//
// The local scripts (scripts/archive.py, scripts/sync.py) do the parsing; this only
// fetches, so the Yahoo credentials never leave Vercel.
//
// Locked down on purpose — the token can read anything on Jason's Yahoo account, so a
// path is served only if it is a league/ or team/ resource of one of THIS league's
// seasons. The seasons are found by walking Yahoo's "renew" links back from the current
// league (2026 -> 2025 -> ... -> 2020). Everything else is refused.

import { LEAGUE_KEY, yahoo, merge } from './_yahoo.mjs';

let chainCache = null;          // [{season, key}], per warm instance

async function chain() {
  if (chainCache) return chainCache;
  const out = [];
  let key = LEAGUE_KEY;
  for (let i = 0; i < 20 && key; i++) {
    const m = merge((await yahoo(`/league/${key}`)).fantasy_content.league);
    out.push({ season: Number(m.season), key: m.league_key, name: m.name });
    // "renew" is "<game>_<league>" for the season before, empty for the first one
    key = m.renew ? String(m.renew).replace('_', '.l.') : null;
  }
  chainCache = out;
  return out;
}

const PATH_OK = /^(league|team)\/[0-9a-z]+\.l\.\d+(\.t\.\d+)?(\/[A-Za-z0-9_.;=,\/-]*)?$/;

export default async function handler(req, res) {
  try {
    const seasons = await chain();
    if (req.query?.chain === '1') {
      res.setHeader('Cache-Control', 's-maxage=86400');
      return res.status(200).json(seasons);
    }
    const path = String(req.query?.path || '').replace(/^\/+/, '');
    if (!PATH_OK.test(path) || path.includes('..')) {
      return res.status(400).json({ error: 'only league/ and team/ paths of this league are served' });
    }
    const lk = path.match(/^(?:league|team)\/([0-9a-z]+\.l\.\d+)/)[1];
    const current = seasons[0];
    const known = seasons.find((s) => s.key === lk) || (lk === LEAGUE_KEY ? current : null);
    if (!known) return res.status(403).json({ error: `${lk} isn't one of this league's seasons` });

    const data = await yahoo('/' + path);
    // past seasons don't change; the current one does
    res.setHeader('Cache-Control', known === current ? 's-maxage=30' : 's-maxage=86400');
    return res.status(200).json(data);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: String(err.message || err) });
  }
}
