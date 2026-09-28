// The league's matchups, as the site shapes them: team_id -> manager, and the scoreboard
// reader. Shared by /api/scoreboard (the homepage) and /api/pulse (the win-probability
// history). Files starting with "_" aren't routes on Vercel.

import { LEAGUE_KEY, yahoo, flat, merge } from './_yahoo.mjs';

export const numOr = (v, d = null) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

/* ---------------- League + scoreboard ---------------- */

// Manager first names, keyed by however Yahoo reports the nickname.
export const MANAGERS = {
  jason: 'Jason', david: 'David', matt: 'Matt', erick: 'Erick', chris: 'Chris',
  wes: 'Wes', zack: 'Zack', adam: 'Adam', dylan: 'Dylan', drew: 'Drew',
  tola: 'Tola', hoa: 'Hoa',
};

// Yahoo team_id -> manager for THIS season (2026). Yahoo reshuffles team ids every season
// (only t.1 = Jason has held), so this must be re-checked when a new season starts —
// scripts/archive.py maps past seasons by team name instead. Unlike nicknames
// (several are handles: "dylang", "aschmitty32", "DAYUMbro", "zek") and team names.
export const TEAM_IDS = {
  1: 'Jason', 2: 'Tola', 3: 'Hoa', 4: 'David', 5: 'Dylan', 6: 'Drew',
  7: 'Chris', 8: 'Erick', 9: 'Wes', 10: 'Matt', 11: 'Zack', 12: 'Adam',
};

export function managerName(team) {
  const byId = TEAM_IDS[Number(team.team_id)];
  if (byId) return byId;
  const mgrs = flat(team.managers).map((m) => merge(m).manager || merge(m));
  const nick = (mgrs[0] && (mgrs[0].nickname || mgrs[0].name)) || '';
  const first = String(nick).trim().split(/\s+/)[0].toLowerCase();
  return MANAGERS[first] || String(nick).trim().split(/\s+/)[0] || 'Unknown';
}

export function teamShape(team) {
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

export async function getScoreboard(week) {
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

