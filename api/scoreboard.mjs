// Bad Hombres — live Yahoo scoreboard + weekly bonus board.
// Vercel serverless function. No dependencies (Node 18+ global fetch).
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, YAHOO_REFRESH_TOKEN
// Optional:
//   YAHOO_LEAGUE_ID (defaults to 97724)
//
// Secrets never live in this repo. See api/README.md for setup.

// Env values are pasted by hand into a dashboard, where line wrapping loves to
// smuggle in newlines. None of these values legitimately contain whitespace.
const env = (name) => (process.env[name] || '').replace(/\s+/g, '');

const LEAGUE_ID = env('YAHOO_LEAGUE_ID') || '97724';
const LEAGUE_KEY = `nfl.l.${LEAGUE_ID}`;
const Y = 'https://fantasysports.yahooapis.com/fantasy/v2';

/* ---------------- Yahoo auth ---------------- */

let tokenCache = { token: null, exp: 0 };

async function accessToken() {
  if (tokenCache.token && Date.now() < tokenCache.exp) return tokenCache.token;
  const id = env('YAHOO_CLIENT_ID'),
        secret = env('YAHOO_CLIENT_SECRET'),
        refresh = env('YAHOO_REFRESH_TOKEN');
  if (!id || !secret || !refresh) throw new Error('missing-yahoo-env');

  const res = await fetch('https://api.login.yahoo.com/oauth2/get_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      // Must match the Redirect URI registered on the Yahoo app. Yahoo no
      // longer accepts the old 'oob' value, so this defaults to the site.
      redirect_uri: env('YAHOO_REDIRECT_URI') || 'https://bad-hombres.vercel.app/',
      refresh_token: refresh,
    }),
  });
  if (!res.ok) throw new Error(`yahoo-token-${res.status}`);
  const j = await res.json();
  tokenCache = { token: j.access_token, exp: Date.now() + (j.expires_in - 120) * 1000 };
  return tokenCache.token;
}

async function yahoo(path) {
  const t = await accessToken();
  const res = await fetch(`${Y}${path}${path.includes('?') ? '&' : '?'}format=json`, {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) throw new Error(`yahoo-${res.status}-${path}`);
  return res.json();
}

/* ---------------- Yahoo JSON is a maze ----------------
   Collections arrive as {0:{...},1:{...},count:n} and each element is often
   an array of partial objects. flat() turns any of that into a plain array,
   merge() squashes the array-of-fragments into one object.               */

function flat(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node;
  const out = [];
  for (const k of Object.keys(node)) {
    if (k === 'count') continue;
    if (/^\d+$/.test(k)) out.push(node[k]);
  }
  return out;
}

function merge(node) {
  if (!node) return {};
  if (!Array.isArray(node)) return node;
  const out = {};
  for (const part of node) {
    if (!part || typeof part !== 'object') continue;
    if (Array.isArray(part)) Object.assign(out, merge(part));
    else Object.assign(out, part);
  }
  return out;
}

const numOr = (v, d = null) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

/* ---------------- League + scoreboard ---------------- */

// Manager first names, keyed by however Yahoo reports the nickname.
const MANAGERS = {
  jason: 'Jason', david: 'David', matt: 'Matt', erick: 'Erick', chris: 'Chris',
  wes: 'Wes', zack: 'Zack', adam: 'Adam', dylan: 'Dylan', drew: 'Drew',
  tola: 'Tola', hoa: 'Hoa',
};

function managerName(team) {
  const mgrs = flat(team.managers).map((m) => merge(m).manager || merge(m));
  const nick = (mgrs[0] && (mgrs[0].nickname || mgrs[0].name)) || '';
  const first = String(nick).trim().split(/\s+/)[0].toLowerCase();
  return MANAGERS[first] || String(nick).trim().split(/\s+/)[0] || 'Unknown';
}

function teamShape(team) {
  const t = merge(team);
  const pts = merge(t.team_points), proj = merge(t.team_projected_points);
  return {
    key: t.team_key,
    m: managerName(t),
    t: t.name,
    s: numOr(pts.total),
    p: numOr(proj.total),
  };
}

async function getScoreboard(week) {
  const j = await yahoo(`/league/${LEAGUE_KEY}/scoreboard${week ? `;week=${week}` : ''}`);
  const league = j.fantasy_content.league;
  const meta = merge(league[0]);
  const sb = merge(league[1]).scoreboard;
  const wk = Number(merge(sb).week || meta.current_week);
  const matchups = flat(merge(sb).matchups || merge(merge(sb)['0']))
    .map((m) => merge(merge(m).matchup))
    .filter((m) => m && m.teams)
    .map((m) => {
      const [a, b] = flat(m.teams).map(teamShape);
      return { a, b, status: m.status };
    });
  return { week: wk, meta, matchups };
}

/* ---------------- Rosters with per-player weekly stats ---------------- */

async function getRosters(week) {
  const j = await yahoo(
    `/league/${LEAGUE_KEY}/teams/roster;week=${week}/players/stats;type=week;week=${week}`
  );
  const teams = flat(merge(j.fantasy_content.league[1]).teams);
  return teams.map((entry) => {
    const t = merge(entry).team;
    const base = teamShape(t);
    const rosterNode = merge(flat(t).find((x) => x && x.roster)) .roster;
    const players = flat(merge(rosterNode).players).map((p) => {
      const pl = merge(merge(p).player);
      const sel = merge(pl.selected_position);
      const pts = merge(pl.player_points), proj = merge(pl.player_projected_points);
      const stats = {};
      for (const s of flat(merge(pl.player_stats).stats)) {
        const st = merge(s).stat;
        if (st) stats[String(st.stat_id)] = numOr(st.value, 0);
      }
      return {
        name: merge(pl.name).full,
        pos: pl.display_position,
        slot: sel.position,
        nflTeam: pl.editorial_team_abbr,
        pts: numOr(pts.total, 0),
        proj: numOr(proj.total, 0),
        stats,
      };
    });
    return { ...base, players };
  });
}

/* ---------------- ESPN enrichment (no auth): kickoff day + rookies ---------------- */

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z]/g, '');

let scheduleCache = {};       // week -> {TEAMABBR: 'Mon'|'Thu'|...}
let rookieCache = { at: 0, set: null };

async function getKickoffDays(week) {
  if (scheduleCache[week]) return scheduleCache[week];
  const res = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}`
  );
  if (!res.ok) return (scheduleCache[week] = {});
  const j = await res.json();
  const map = {};
  for (const ev of j.events || []) {
    const day = new Date(ev.date).toLocaleDateString('en-US', {
      weekday: 'short',
      timeZone: 'America/New_York',
    });
    for (const c of ev.competitions?.[0]?.competitors || []) {
      const abbr = c.team?.abbreviation;
      if (abbr) map[abbr.toUpperCase()] = day;
    }
  }
  return (scheduleCache[week] = map);
}

async function getRookies() {
  if (rookieCache.set && Date.now() - rookieCache.at < 12 * 3600 * 1000) return rookieCache.set;
  const set = new Set();
  try {
    const teamsRes = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams?limit=32'
    );
    const teamsJson = await teamsRes.json();
    const ids = (teamsJson.sports?.[0]?.leagues?.[0]?.teams || []).map((t) => t.team.id);
    const rosters = await Promise.all(
      ids.map((id) =>
        fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${id}/roster`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      )
    );
    for (const r of rosters) {
      for (const grp of r?.athletes || []) {
        for (const a of grp.items || grp || []) {
          if (a?.experience && Number(a.experience.years) === 0) set.add(norm(a.displayName));
        }
      }
    }
  } catch (_) { /* rookie bonus degrades to empty rather than failing the page */ }
  rookieCache = { at: Date.now(), set };
  return set;
}

/* ---------------- Bonus math ----------------
   Yahoo stat ids used: 11 = receptions.                                  */

const BONUS = {
  1:  { nm: "Josh Allen's Money Shot", cr: 'Highest-scoring QB' },
  2:  { nm: 'Raw-Dogged',              cr: 'Biggest blowout (largest margin of victory)' },
  3:  { nm: 'Kittle Dick Energy',      cr: 'Lowest-scoring starting TE' },
  4:  { nm: "Hoa's Foot Fetish",       cr: 'Highest-scoring kicker' },
  5:  { nm: 'Massive Cuck',            cr: 'Loses their matchup by the most points' },
  6:  { nm: 'Catch My Load',           cr: 'Most receptions by one player' },
  7:  { nm: 'Adam of the Week',        cr: 'Lowest point total overall' },
  8:  { nm: 'Popped Your Cherry',      cr: 'Highest-scoring rookie' },
  9:  { nm: "Size Doesn't Matter",     cr: 'Smallest margin in a win' },
  10: { nm: "Sackin' Off",             cr: 'Highest-scoring D/ST' },
  11: { nm: 'Happy Ending',            cr: 'Highest Monday-night score' },
  12: { nm: 'Mr. Big Dick',            cr: 'Highest individual player score' },
  13: { nm: 'Sewp 7.0',                cr: 'Highest-scoring team to still take an L' },
  14: { nm: "Dambro's Daddy",          cr: 'Biggest no-show (largest projected-vs-actual miss)' },
};

const top3 = (rows, dir = 'desc') =>
  rows
    .filter((r) => r && Number.isFinite(r.val))
    .sort((a, b) => (dir === 'desc' ? b.val - a.val : a.val - b.val))
    .slice(0, 3);

// Every starter across all rosters, flattened, with its owner attached.
function starters(teams, pick) {
  const out = [];
  for (const t of teams)
    for (const p of t.players)
      if (p.slot && p.slot !== 'BN' && p.slot !== 'IR' && pick(p))
        out.push({ who: t.m, sub: p.name, p });
  return out;
}

async function computeBonus(week, matchups, teams, kickoffDays, rookies) {
  const val = (r, mode) => (mode === 'projected' ? r.p.proj : r.p.pts);
  const teamVal = (t, mode) => (mode === 'projected' ? t.p : t.s);

  const build = async (mode) => {
    switch (week) {
      case 1:
        return top3(starters(teams, (p) => p.pos === 'QB').map((r) => ({ ...r, val: val(r, mode) })));
      case 2:
        return top3(matchups.map((m) => {
          const av = teamVal(m.a, mode), bv = teamVal(m.b, mode);
          const w = av >= bv ? m.a : m.b, l = av >= bv ? m.b : m.a;
          return { who: w.m, sub: `over ${l.m}`, val: Math.abs(av - bv) };
        }));
      case 3:
        return top3(
          starters(teams, (p) => p.slot === 'TE').map((r) => ({ ...r, val: val(r, mode) })),
          'asc'
        );
      case 4:
        return top3(starters(teams, (p) => p.pos === 'K').map((r) => ({ ...r, val: val(r, mode) })));
      case 5:
        return top3(matchups.map((m) => {
          const av = teamVal(m.a, mode), bv = teamVal(m.b, mode);
          const l = av >= bv ? m.b : m.a, w = av >= bv ? m.a : m.b;
          return { who: l.m, sub: `to ${w.m}`, val: Math.abs(av - bv) };
        }));
      case 6:
        return top3(
          starters(teams, () => true).map((r) => ({ ...r, val: r.p.stats['11'] ?? 0 }))
        );
      case 7:
        return top3(teams.map((t) => ({ who: t.m, sub: t.t, val: teamVal(t, mode) })), 'asc');
      case 8: {
        const rk = await rookies;
        return top3(
          starters(teams, (p) => rk.has(norm(p.name))).map((r) => ({ ...r, val: val(r, mode) }))
        );
      }
      case 9:
        return top3(matchups.map((m) => {
          const av = teamVal(m.a, mode), bv = teamVal(m.b, mode);
          const w = av >= bv ? m.a : m.b, l = av >= bv ? m.b : m.a;
          return { who: w.m, sub: `over ${l.m}`, val: Math.abs(av - bv) };
        }), 'asc');
      case 10:
        return top3(
          starters(teams, (p) => p.pos === 'DEF' || p.slot === 'DEF').map((r) => ({ ...r, val: val(r, mode) }))
        );
      case 11: {
        const days = await kickoffDays;
        return top3(teams.map((t) => ({
          who: t.m,
          sub: 'Monday starters',
          val: t.players
            .filter((p) => p.slot && p.slot !== 'BN' && p.slot !== 'IR')
            .filter((p) => days[String(p.nflTeam || '').toUpperCase()] === 'Mon')
            .reduce((s, p) => s + (mode === 'projected' ? p.proj : p.pts), 0),
        })));
      }
      case 12:
        return top3(starters(teams, () => true).map((r) => ({ ...r, val: val(r, mode) })));
      case 13:
        return top3(matchups.map((m) => {
          const av = teamVal(m.a, mode), bv = teamVal(m.b, mode);
          const l = av >= bv ? m.b : m.a, w = av >= bv ? m.a : m.b;
          return { who: l.m, sub: `lost to ${w.m}`, val: Math.min(av, bv) };
        }));
      case 14:
        return top3(teams.map((t) => ({
          who: t.m, sub: `proj ${(t.p ?? 0).toFixed(1)}`, val: (t.p ?? 0) - (t.s ?? 0),
        })));
      default:
        return [];
    }
  };

  return { week, ...BONUS[week], actual: await build('actual'), projected: await build('projected') };
}

/* ---------------- Handler ---------------- */

export default async function handler(req, res) {
  try {
    const qWeek = parseInt(req.query?.week, 10);
    const sb = await getScoreboard(Number.isFinite(qWeek) ? qWeek : undefined);
    const week = sb.week;

    let teams = [];
    try { teams = await getRosters(week); } catch (_) { /* bonus degrades, matchups still render */ }

    const bonus = teams.length
      ? await computeBonus(week, sb.matchups, teams, getKickoffDays(week), getRookies())
      : null;

    const anyScores = sb.matchups.some((m) => (m.a.s ?? 0) > 0 || (m.b.s ?? 0) > 0);
    const allFinal = sb.matchups.length > 0 && sb.matchups.every((m) => m.status === 'postevent');
    const status = allFinal ? 'final' : anyScores ? 'live' : 'preseason';

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      week, status, updated: new Date().toISOString(), matchups: sb.matchups, bonus,
    });
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String(err.message || err) });
  }
}
