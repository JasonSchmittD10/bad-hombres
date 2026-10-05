// Bad Hombres — the pulse: Yahoo's live win probability over time, and the Choke Ledger.
// Vercel serverless function. No dependencies.
//
//   POST /api/pulse               take a sample now (the Mac pings this every 5 minutes)
//   POST /api/pulse?settle=N      judge week N's chokes now (sampling does it on its own)
//   GET  /api/pulse               the season: the Choke Ledger and which weeks have charts
//   GET  /api/pulse?week=N        week N's chart data: every sample, every matchup
//
// Yahoo only ever reports the odds right now, so the chart exists only because something
// wrote the odds down every few minutes. Samples are recorded only while the week is live
// (scores on the board, not final); off-hours pings cost one Yahoo call and write nothing.
// Stored in the league's gist as bad-hombres-pulse-<season>.json:
//   {season, threshold, updated,
//    weeks: {"<N>": {pairs: [[a, b], ...], samples: [[iso, {m: wp}, {m: score}], ...],
//                    peak: {m: {wp, at, s, opp_s}}, final: {m: {s, opp, opp_s, won}}, settled}},
//    chokes: [{week, who, opp, peak, at, score_then, opp_then, final, opp_final}]}
// A choke: lost after being at or above the threshold (85%) while the games were live —
// in that matchup, once somebody had scored; pre-game odds never count.

import { getScoreboard } from './_league.mjs';
import { storageReady, readFile, writeFile } from './_gist.mjs';

const THRESHOLD = 0.85;
const MIN_GAP_MS = 4 * 60 * 1000;      // pings closer together than this are ignored
const file = (season) => `bad-hombres-pulse-${season}.json`;

const statusOf = (ms) => {
  const any = ms.some((m) => (m.a.s ?? 0) > 0 || (m.b.s ?? 0) > 0);
  const done = ms.length > 0 && ms.every((m) => m.status === 'postevent');
  return done ? 'final' : any ? 'live' : 'preseason';
};

const blank = (season) => ({ season, threshold: THRESHOLD, updated: null, weeks: {}, chokes: [] });
const weekOf = (doc, n) => (doc.weeks[String(n)] ||= { pairs: [], samples: [], peak: {}, final: {} });

function settle(doc, n, ms) {
  const w = weekOf(doc, n);
  for (const m of ms) {
    for (const [me, op] of [[m.a, m.b], [m.b, m.a]]) {
      w.final[me.m] = { s: me.s, opp: op.m, opp_s: op.s, won: (me.s ?? 0) > (op.s ?? 0) };
    }
  }
  doc.chokes = doc.chokes.filter((c) => c.week !== n);
  for (const [who, f] of Object.entries(w.final)) {
    const pk = w.peak[who];
    const live = pk && ((pk.s ?? 0) > 0 || (pk.opp_s ?? 0) > 0);   // older peaks may be pre-game
    if (!f.won && live && pk.wp >= (doc.threshold ?? THRESHOLD)) {
      doc.chokes.push({ week: n, who, opp: f.opp, peak: pk.wp, at: pk.at, score_then: pk.s, opp_then: pk.opp_s, final: f.s, opp_final: f.opp_s });
    }
  }
  doc.chokes.sort((x, y) => x.week - y.week || y.peak - x.peak);
  w.settled = new Date().toISOString();
}

function record(doc, n, ms, at) {
  const w = weekOf(doc, n);
  w.pairs = ms.map((m) => [m.a.m, m.b.m]);
  const wp = {}, sc = {};
  for (const m of ms) {
    for (const [me, op] of [[m.a, m.b], [m.b, m.a]]) {
      if (me.wp == null) continue;
      wp[me.m] = me.wp; sc[me.m] = me.s;
      // a matchup nobody has scored in yet is still pre-game odds: charted, never a peak
      if (!((me.s ?? 0) > 0 || (op.s ?? 0) > 0)) continue;
      const pk = w.peak[me.m];
      if (!pk || me.wp > pk.wp) w.peak[me.m] = { wp: me.wp, at, s: me.s, opp_s: op.s };
    }
  }
  // a reading identical to the last one (Friday, Saturday, overnight) adds nothing to the chart
  const prev = w.samples[w.samples.length - 1];
  if (prev && JSON.stringify(prev[1]) === JSON.stringify(wp) && JSON.stringify(prev[2]) === JSON.stringify(sc)) return false;
  w.samples.push([at, wp, sc]);
  return true;
}

async function sample(force) {
  const sb = await getScoreboard();
  const season = Number(sb.meta.season);
  const doc = (await readFile(file(season))) || blank(season);
  const now = new Date();
  if (!force && doc.updated && now - new Date(doc.updated) < MIN_GAP_MS) return { skipped: 'too soon', week: sb.week };

  let changed = false;
  const status = statusOf(sb.matchups);
  // record() still tracks peaks, but only an actual change is written (and counts as a reading)
  if (status === 'live') { const before = JSON.stringify(doc.weeks[String(sb.week)]?.peak || {}); changed = record(doc, sb.week, sb.matchups, now.toISOString()) || before !== JSON.stringify(doc.weeks[String(sb.week)].peak); }

  // settle every sampled week that has finished — this one, or one Yahoo has moved past
  for (const [k, w] of Object.entries(doc.weeks)) {
    const n = Number(k);
    if (w.settled) continue;
    const ms = n === sb.week ? sb.matchups : (await getScoreboard(n)).matchups;
    if (statusOf(ms) === 'final') { settle(doc, n, ms); changed = true; }
  }
  // write only when something was recorded: off-hours pings leave the gist alone
  if (changed) { doc.updated = now.toISOString(); await writeFile(file(season), doc, false); }
  return { week: sb.week, status, recorded: changed, chokes: doc.chokes.length };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!storageReady()) return res.status(503).json({ error: 'storage-not-connected' });
  try {
    if (req.method === 'POST') {
      const settleWeek = parseInt(req.query?.settle, 10);
      if (Number.isFinite(settleWeek)) {
        const sb = await getScoreboard(settleWeek);
        const season = Number(sb.meta.season);
        const doc = (await readFile(file(season))) || blank(season);
        if (statusOf(sb.matchups) !== 'final') return res.status(409).json({ error: `week ${settleWeek} isn't final` });
        if (!doc.weeks[String(settleWeek)]) return res.status(200).json({ week: settleWeek, note: 'no samples for this week — nothing to judge', chokes: doc.chokes.filter((c) => c.week === settleWeek) });
        settle(doc, settleWeek, sb.matchups);
        await writeFile(file(season), doc, false);
        return res.status(200).json({ week: settleWeek, chokes: doc.chokes.filter((c) => c.week === settleWeek) });
      }
      // one-time import of samples taken before the server did the sampling (Week 3, 2026):
      // accepted only for a week the server has no samples for, so it can't overwrite anything
      if (req.query?.seed === '1') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
        const n = Number(body.week);
        const sb = await getScoreboard();
        const season = Number(sb.meta.season);
        const doc = (await readFile(file(season))) || blank(season);
        if (!Number.isFinite(n) || !Array.isArray(body.samples)) return res.status(400).json({ error: 'need {week, samples}' });
        if ((doc.weeks[String(n)] || {}).samples?.length) return res.status(409).json({ error: `week ${n} already has samples` });
        const w = weekOf(doc, n);
        w.pairs = n === sb.week ? sb.matchups.map((m) => [m.a.m, m.b.m]) : [];
        w.samples = body.samples.filter((x) => Array.isArray(x) && typeof x[0] === 'string').map((x) => [x[0], x[1] || {}, x[2] || {}]);
        w.peak = body.peak || {};
        doc.updated = new Date().toISOString();
        await writeFile(file(season), doc, false);
        return res.status(200).json({ week: n, seeded: w.samples.length });
      }
      return res.status(200).json(await sample(false));
    }
    if (req.method !== 'GET') return res.status(405).json({ error: 'method' });

    const season = Number(req.query?.season) || Number((await getScoreboard()).meta.season);
    const doc = (await readFile(file(season))) || blank(season);
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    const n = parseInt(req.query?.week, 10);
    if (Number.isFinite(n)) {
      const w = doc.weeks[String(n)] || { pairs: [], samples: [], peak: {}, final: {} };
      return res.status(200).json({ season, week: n, threshold: doc.threshold, ...w, chokes: doc.chokes.filter((c) => c.week === n) });
    }
    return res.status(200).json({
      season, threshold: doc.threshold, updated: doc.updated, chokes: doc.chokes,
      weeks: Object.entries(doc.weeks).map(([k, w]) => ({ week: Number(k), samples: w.samples.length, settled: Boolean(w.settled) })),
    });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
