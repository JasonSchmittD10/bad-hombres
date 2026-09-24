// Bad Hombres — Game of the Week pick'em.
// Vercel serverless function. No dependencies (Node 18+ global fetch).
//
//   GET  /api/picks           this week's Game of the Week, the tally, whether picks are
//                             locked, who picked what (only once locked), and the season
//                             leaderboard
//   POST /api/picks           {who, pin, pick} — make or change a pick before kickoff
//
// Storage is a secret GitHub Gist holding one JSON file — free, and on the GitHub
// account the site already uses. Set two env vars in Vercel:
//   PICKS_GIST_ID     the gist's id (the last part of its URL)
//   PICKS_GIST_TOKEN  a classic GitHub token with ONLY the "gist" scope
// Until they're set, GET says so and the page shows "opens soon".
//
// The file, bad-hombres-picks.json:
//   {"pins":  {"<Manager>": "<sha-256 of their PIN>"},
//    "picks": {"<season>": {"<week>": {"<Manager>": "<manager they picked>"}}}}
//
// The game, the lock and the result all come from the site's own data files, so the
// pick'em always agrees with the scoreboard: the recorded Game of the Week
// (data/voices.json "gotw"), kickoff (data/week.json), and the final scores
// (data/record.json). Nothing here is graded by hand.

import { createHash } from 'node:crypto';

const env = (n) => (process.env[n] || '').trim();
const GIST = env('PICKS_GIST_ID');
const TOKEN = env('PICKS_GIST_TOKEN');
const FILE = 'bad-hombres-picks.json';

const MANAGERS = ['Adam', 'Chris', 'David', 'Drew', 'Dylan', 'Erick', 'Hoa', 'Jason', 'Matt', 'Tola', 'Wes', 'Zack'];

const GH = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'bad-hombres-picks',
};

async function loadStore() {
  const r = await fetch(`https://api.github.com/gists/${GIST}`, { headers: GH, cache: 'no-store' });
  if (!r.ok) throw new Error(`storage-${r.status}`);
  const f = ((await r.json()).files || {})[FILE];
  if (!f) return { pins: {}, picks: {} };
  // a big file comes back truncated; fetch the raw copy instead
  const text = f.truncated ? await (await fetch(f.raw_url, { headers: GH })).text() : f.content;
  const d = JSON.parse(text || '{}');
  return { pins: d.pins || {}, picks: d.picks || {} };
}

async function saveStore(d) {
  const r = await fetch(`https://api.github.com/gists/${GIST}`, {
    method: 'PATCH',
    headers: { ...GH, 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: { [FILE]: { content: JSON.stringify(d, null, 1) } } }),
  });
  if (!r.ok) throw new Error(`storage-save-${r.status}`);
}

const pinHash = (who, pin) => createHash('sha256').update(`bad-hombres:${who}:${pin}`).digest('hex');

async function siteData(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = `${proto}://${req.headers.host}`;
  const get = (p) => fetch(`${base}${p}`, { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`site-${p}-${r.status}`);
    return r.json();
  });
  const [week, voices, record] = await Promise.all([
    get('/data/week.json'), get('/data/voices.json'), get('/data/record.json'),
  ]);
  return { week, voices, record };
}

// The week open for picking, its game, and whether it has locked.
function current({ week, voices, record }) {
  const n = week.week;
  const season = String(record.current || new Date().getFullYear());
  const g = (voices.gotw || []).find((x) => x.week === n);
  // picks lock at the week's first kickoff; any score on the board also means it's too late
  const kickoff = week.nextWeek === n && week.nextKickoff ? new Date(week.nextKickoff) : null;
  const locked = week.status !== 'preseason' || (kickoff ? Date.now() >= kickoff.getTime() : true);
  return { n, season, game: g ? { a: g.a, b: g.b, reason: g.reason || '' } : null, lockAt: kickoff ? kickoff.toISOString() : null, locked };
}

// Who won each graded Game of the Week, straight from the game log.
function results({ voices, record }, season) {
  const M = record.managers || {};
  const weeks = (record.weeks || {})[season] || [];
  const out = {};
  for (const g of voices.gotw || []) {
    const wk = weeks[g.week - 1];
    if (!wk) continue;                               // not final yet
    for (const [a, sa, b, sb] of wk) {
      const na = M[a], nb = M[b];
      if ((na === g.a && nb === g.b) || (na === g.b && nb === g.a)) {
        out[g.week] = sa === sb ? 'tie' : (sa > sb ? na : nb);
      }
    }
  }
  return out;
}

function board(data, cur, store) {
  const res = results(data, cur.season);
  const byWeek = (store.picks || {})[cur.season] || {};
  const table = Object.fromEntries(MANAGERS.map((m) => [m, { who: m, w: 0, l: 0, t: 0 }]));
  for (const [w, winner] of Object.entries(res)) {
    for (const [who, pick] of Object.entries(byWeek[w] || {})) {
      if (!table[who]) continue;
      if (winner === 'tie') table[who].t++;
      else if (pick === winner) table[who].w++;
      else table[who].l++;
    }
  }
  const leaderboard = Object.values(table)
    .filter((r) => r.w + r.l + r.t > 0)
    .sort((x, y) => y.w - x.w || x.l - y.l || x.who.localeCompare(y.who));
  return { thisWeek: byWeek[cur.n] || {}, leaderboard, graded: res };
}

async function read(req, store) {
  const data = await siteData(req);
  const cur = current(data);
  const { thisWeek, leaderboard, graded } = board(data, cur, store || await loadStore());
  const counts = {};
  if (cur.game) for (const side of [cur.game.a, cur.game.b]) counts[side] = Object.values(thisWeek).filter((p) => p === side).length;
  return {
    week: cur.n, game: cur.game, lockAt: cur.lockAt, locked: cur.locked,
    counts, total: Object.keys(thisWeek).length,
    picked: Object.keys(thisWeek).sort(),                // who has picked, never what — until the lock
    picks: cur.locked ? thisWeek : null,
    leaderboard, graded, members: MANAGERS,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!GIST || !TOKEN) return res.status(503).json({ error: 'storage-not-connected' });
  try {
    if (req.method === 'GET') return res.status(200).json(await read(req));
    if (req.method !== 'POST') return res.status(405).json({ error: 'method' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const who = String(body.who || ''), pin = String(body.pin || ''), pick = String(body.pick || '');
    if (!MANAGERS.includes(who)) return res.status(400).json({ error: 'Pick your name from the list.' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'Your PIN is four digits.' });

    const data = await siteData(req);
    const cur = current(data);
    if (!cur.game) return res.status(409).json({ error: "This week's Game of the Week isn't set yet." });
    if (cur.locked) return res.status(409).json({ error: 'Picks are locked — the week has kicked off.' });
    if (![cur.game.a, cur.game.b].includes(pick)) return res.status(400).json({ error: 'Pick one of the two teams in the game.' });

    // A manager's first pick sets their PIN; after that it has to match.
    const h = pinHash(who, pin);
    let store = await loadStore();
    const saved = store.pins[who];
    if (saved && saved !== h) return res.status(403).json({ error: `That isn't ${who}'s PIN.` });

    // Read, change, write — then read back. Twelve people rarely pick in the same second,
    // but if two saves cross, the loser's pick won't be there and we write it again.
    for (let attempt = 0; attempt < 3; attempt++) {
      store.pins[who] = h;
      const season = (store.picks[cur.season] = store.picks[cur.season] || {});
      (season[cur.n] = season[cur.n] || {})[who] = pick;
      await saveStore(store);
      store = await loadStore();
      if ((((store.picks[cur.season] || {})[cur.n]) || {})[who] === pick) break;
    }
    return res.status(200).json({ ok: true, firstPick: !saved, ...(await read(req, store)) });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
