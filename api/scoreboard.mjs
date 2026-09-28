// Bad Hombres — live Yahoo scoreboard + weekly bonus board.
// Vercel serverless function. No dependencies (Node 18+ global fetch).
//
// Required env vars (set in Vercel → Settings → Environment Variables):
//   YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, YAHOO_REFRESH_TOKEN
// Optional:
//   YAHOO_LEAGUE_ID (defaults to 97724)
//
// Secrets never live in this repo. See api/README.md for setup.

import { env, LEAGUE_ID, LEAGUE_KEY, yahoo, flat, merge } from './_yahoo.mjs';


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

// Yahoo team_id -> manager. Stable for the life of the league, unlike nicknames
// (several are handles: "dylang", "aschmitty32", "DAYUMbro", "zek") and team names.
const TEAM_IDS = {
  1: 'Jason', 2: 'Tola', 3: 'Hoa', 4: 'David', 5: 'Dylan', 6: 'Drew',
  7: 'Chris', 8: 'Erick', 9: 'Wes', 10: 'Matt', 11: 'Zack', 12: 'Adam',
};

function managerName(team) {
  const byId = TEAM_IDS[Number(team.team_id)];
  if (byId) return byId;
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
    // Yahoo's live chance this team wins the matchup, 0-1 (the homepage's tug-of-war)
    wp: t.win_probability == null ? null : Math.round(numOr(t.win_probability, 0) * 100) / 100,
  };
}

async function getScoreboard(week) {
  const j = await yahoo(`/league/${LEAGUE_KEY}/scoreboard${week ? `;week=${week}` : ''}`);
  const league = j.fantasy_content.league;
  const meta = merge(league[0]);
  const sb = merge(league[1]).scoreboard;
  const wk = Number(merge(sb).week || meta.current_week);
  // Yahoo nests these deeper than it looks: scoreboard -> "0" -> matchups -> "n" -> matchup,
  // and each matchup -> "0" -> teams -> "n" -> {team: [...]}. Checked against a real
  // response (Week 3, 2026) — the first time the API ever answered.
  const sbn = merge(sb);
  const mnode = sbn.matchups || merge(sbn['0'] || {}).matchups;
  const matchups = flat(mnode)
    .map((m) => merge(m).matchup)
    .filter(Boolean)
    .map((mu) => {
      const teamsNode = mu.teams || merge(mu['0'] || {}).teams;
      const [a, b] = flat(teamsNode).map((e) => teamShape(merge(e).team || e));
      return { a, b, status: mu.status };
    })
    .filter((m) => m.a && m.b);
  return { week: wk, meta, matchups };
}

/* ---------------- Rosters with per-player weekly stats ---------------- */

async function getRosters(week, matchups) {
  // Yahoo only returns player stats per team: the league-wide roster call silently drops
  // the /players/stats part. Twelve calls in parallel, one per team.
  const one = async (id) => {
    const j = await yahoo(`/team/${LEAGUE_KEY}.t.${id}/roster;week=${week}/players/stats;type=week;week=${week}`);
    const t = merge(j.fantasy_content.team);
    const players = flat(merge(merge(t.roster)['0'] || {}).players).map((entry) => {
      const pl = merge(merge(entry).player);
      const sel = merge(pl.selected_position);
      const stats = {};
      for (const x of flat(merge(pl.player_stats).stats)) {
        const st = merge(x).stat;
        if (st) stats[String(st.stat_id)] = numOr(st.value, 0);
      }
      return {
        name: merge(pl.name).full,
        pos: pl.display_position,
        slot: sel.position,
        nflTeam: pl.editorial_team_abbr,
        pts: numOr(merge(pl.player_points).total, 0),
        // Yahoo's API has no per-player projections (every variant returns 400); only
        // team projections exist, on the scoreboard.
        proj: null,
        stats,
      };
    });
    // the scoreboard carries each team's points and projection
    const mu = (matchups || []).flatMap((m) => [m.a, m.b]).find((x) => String(x.key) === String(t.team_key));
    return { key: t.team_key, m: managerName(t), t: t.name, s: mu ? mu.s : null, p: mu ? mu.p : null, players };
  };
  return Promise.all(Object.keys(TEAM_IDS).map(one));
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
    .slice(0, 3)
    .map((r) => ({ who: r.who, sub: r.sub, val: Math.round(r.val * 100) / 100 }));

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

  // Awards judged on single players can't be projected: Yahoo's API has no per-player
  // projections. Team and matchup awards project from the scoreboard's team projections.
  const PLAYER_AWARDS = new Set([1, 3, 4, 6, 8, 10, 11, 12]);
  const build = async (mode) => {
    if (mode === 'projected' && PLAYER_AWARDS.has(week)) return [];
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

/* ---------------- Standings and trade counts ---------------- */

async function getStandings() {
  const j = await yahoo(`/league/${LEAGUE_KEY}/standings`);
  const teams = flat(merge(merge(j.fantasy_content.league[1]).standings).teams);
  return teams.map((entry) => {
    const t = merge(merge(entry).team || entry);
    const ts = merge(t.team_standings), o = merge(ts.outcome_totals);
    return {
      m: managerName(t), t: t.name,
      w: numOr(o.wins, 0), l: numOr(o.losses, 0), tie: numOr(o.ties, 0),
      pf: Math.round(numOr(ts.points_for, 0) * 100) / 100, pa: Math.round(numOr(ts.points_against, 0) * 100) / 100,
      rank: numOr(ts.rank), seed: numOr(ts.playoff_seed),
      trades: numOr(t.number_of_trades, 0), moves: numOr(t.number_of_moves, 0),
    };
  });
}

/* ---------------- Handler ---------------- */

export default async function handler(req, res) {
  try {
    const qWeek = parseInt(req.query?.week, 10);
    const sb = await getScoreboard(Number.isFinite(qWeek) ? qWeek : undefined);
    const week = sb.week;

    // ?lite=1 — scores and live win probability only, one Yahoo call (the pulse sampler)
    if (req.query?.lite === '1') {
      const any = sb.matchups.some((m) => (m.a.s ?? 0) > 0 || (m.b.s ?? 0) > 0);
      const done = sb.matchups.length > 0 && sb.matchups.every((m) => m.status === 'postevent');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ week, status: done ? 'final' : any ? 'live' : 'preseason', updated: new Date().toISOString(), matchups: sb.matchups });
    }

    let teams = [];
    try { teams = await getRosters(week, sb.matchups); } catch (_) { /* bonus degrades, matchups still render */ }

    const bonus = teams.length
      ? await computeBonus(week, sb.matchups, teams, getKickoffDays(week), getRookies())
      : null;

    const anyScores = sb.matchups.some((m) => (m.a.s ?? 0) > 0 || (m.b.s ?? 0) > 0);
    const allFinal = sb.matchups.length > 0 && sb.matchups.every((m) => m.status === 'postevent');
    const status = allFinal ? 'final' : anyScores ? 'live' : 'preseason';

    const out = { week, status, updated: new Date().toISOString(), matchups: sb.matchups, bonus };

    // ?full=1 — everything the scheduled routines write into the site's data files:
    // standings, trade counts, and next week's matchups with projections.
    if (req.query?.full === '1') {
      const [standings, next] = await Promise.all([
        getStandings(),
        getScoreboard(week + 1).catch(() => null),
      ]);
      out.standings = standings;
      out.trades = Object.fromEntries(standings.map((r) => [r.m, r.trades]));
      out.next = next && next.matchups.length ? { week: next.week, matchups: next.matchups } : null;
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(out);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json(out);
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(502).json({ error: String(err.message || err) });
  }
}
