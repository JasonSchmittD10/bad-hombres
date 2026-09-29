// Player projections for the Bonus Board. Yahoo's API has none (every per-player variant
// answers 400), so they come from Sleeper's free public projections — projected STATS,
// scored here with the league's own Yahoo scoring, so a projected kicker or QB is worth
// what the league would pay him, not what Sleeper's default scoring says.
//
//   getProjections(season, week) -> Map: "<name>|<TEAM>" and "<name>" -> {pts, rec}
//                                   plus "DEF|<TEAM>" for team defenses
//
// Checked against Yahoo: Sleeper's ACTUAL Week 3 2026 stats, scored here, match the league's
// own points for every RB, WR, TE and kicker, and QBs and defenses once the bonus stats below
// were added. Not projected by Sleeper: 40+ yard passing TDs (a point each) and a defense's
// 4th-down stops and three-and-outs (averaged in, below).
// Anything unreachable degrades to an empty map: the board just shows no projections.

const POS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'];
const TTL = 10 * 60 * 1000;
const cache = {};

export const normName = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, '')
    .replace(/[^a-z]/g, '');

// Yahoo and Sleeper spell a few teams differently
const TEAM = { JAC: 'JAX', WSH: 'WAS', LA: 'LAR', LVR: 'LV', OAK: 'LV', SD: 'LAC', STL: 'LAR' };
export const normTeam = (t) => { const u = String(t || '').toUpperCase(); return TEAM[u] || u; };

// The league's Yahoo stat modifiers (league/470.l.97724/settings), in Sleeper's stat names
const n = (s, k) => Number(s[k]) || 0;
function offense(s) {
  return n(s, 'pass_yd') * 0.04 + n(s, 'pass_td') * 4 + n(s, 'pass_int') * -2 + n(s, 'pass_int_td') * -2 +
    n(s, 'pass_cmp_40p') * 1 + n(s, 'pass_td_40p') * 1 +
    n(s, 'rush_yd') * 0.1 + n(s, 'rush_td') * 6 + n(s, 'rush_40p') * 2 +
    n(s, 'rec') * 1 + n(s, 'rec_yd') * 0.1 + n(s, 'rec_td') * 6 + n(s, 'rec_40p') * 2 +
    (n(s, 'pass_2pt') + n(s, 'rush_2pt') + n(s, 'rec_2pt')) * 2 +
    (n(s, 'kr_td') + n(s, 'pr_td')) * 6 +
    n(s, 'fum_lost') * -2;
}
function kicker(s) {
  return n(s, 'fgm_yds') * 0.1 + n(s, 'xpm') * 1 + n(s, 'xpmiss') * -2 +
    (n(s, 'fgmiss_0_19') + n(s, 'fgmiss_20_29') + n(s, 'fgmiss_30_39') + n(s, 'fgmiss_40_49')) * -1;
}
const DEF_STOPS_AVG = 1.34;
function defense(s) {
  const pa = n(s, 'pts_allow');
  const tier = pa <= 0 ? 15 : pa < 7 ? 10 : pa < 14 ? 7 : pa < 21 ? 4 : pa < 28 ? 0 : pa < 35 ? -1 : -4;
  // Sleeper projects neither 4th-down stops nor three-and-outs (half a point each here), so a
  // projection gets the 2026 average of the two, 1.34 points a game (weeks 1-3, all 32 defenses)
  const stops = ('def_3_and_out' in s || 'def_4_and_stop' in s)
    ? (n(s, 'def_3_and_out') + n(s, 'def_4_and_stop')) * 0.5 : DEF_STOPS_AVG;
  return n(s, 'sack') * 1 + n(s, 'int') * 2 + (n(s, 'fum_rec') + n(s, 'def_st_fum_rec')) * 2 + n(s, 'safe') * 2 +
    (n(s, 'def_td') + n(s, 'def_st_td') + n(s, 'def_kr_td') + n(s, 'def_pr_td')) * 6 +
    n(s, 'blk_kick') * 2 + tier + stops;
}

// the league's points for a stat line (also used to check this scoring against Yahoo's)
export const scoreStats = (pos, s) => (pos === 'K' ? kicker(s) : pos === 'DEF' ? defense(s) : offense(s));

export async function getProjections(season, week) {
  const key = `${season}-${week}`;
  const hit = cache[key];
  if (hit && Date.now() - hit.at < TTL) return hit.map;
  const map = new Map();
  try {
    const qs = POS.map((p) => `position[]=${p}`).join('&');
    const r = await fetch(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${qs}`,
      { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`sleeper ${r.status}`);
    const seen = {};
    for (const x of await r.json()) {
      const s = x.stats || {}, pl = x.player || {}, pos = (pl.fantasy_positions || [])[0] || pl.position;
      if (!s.gp) continue;                                    // on a bye, or not expected to play
      const team = normTeam(x.team || pl.team);
      const pts = scoreStats(pos, s);
      const v = { pts: Math.round(pts * 100) / 100, rec: Math.round(n(s, 'rec') * 10) / 10 };
      if (pos === 'DEF') { map.set(`DEF|${team}`, v); continue; }
      const nm = normName(`${pl.first_name} ${pl.last_name}`);
      map.set(`${nm}|${team}`, v);
      seen[nm] = (seen[nm] || 0) + 1;
      map.set(nm, seen[nm] === 1 ? v : null);                 // a name two players share isn't a key
    }
  } catch (_) { /* no projections: the board shows none */ }
  cache[key] = { at: Date.now(), map };
  return map;
}

// A Yahoo roster player -> its projection, or null
export function projectionFor(map, p) {
  const team = normTeam(p.nflTeam);
  if (p.pos === 'DEF' || p.slot === 'DEF') return map.get(`DEF|${team}`) || null;
  const nm = normName(p.name);
  return map.get(`${nm}|${team}`) || map.get(nm) || null;
}
