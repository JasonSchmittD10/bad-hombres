// Hard Numbers — Odds: playoff, bye, No. 1 seed and Beer Mile odds for the season in
// progress, and the what-if machine. The simulation below is a line-for-line port of
// scripts/hn/odds.py: same model, same tiebreakers, same mulberry32 stream from the same
// seed and the same number of seasons, so with nothing picked it lands on the builder's
// numbers exactly (the page checks that, and says so).
(function (HN) {
  var TWO_PI = 2 * Math.PI, METRICS = ['playoffs', 'bye', 'top', 'last'], ALL = METRICS.concat('wins');
  // The machine plays as many seasons as the builder did, so with nothing picked it IS the table
  // above. The cap only matters if a build ever goes much bigger: 40,000 seasons keep the stored
  // scores under 55 MB on a phone (20,000 of this season's 72 games take 22 MB).
  var MAX_SIMS = 40000;
  var CSS = [
    // the odds table: the bar hangs under the number without pushing it off the row's center line
    '#hn-odds .hn-card > .hn-scroll td.n{position:relative}',
    '#hn-odds .od-bar{position:absolute;right:10px;bottom:5px;display:block;height:3px;width:52px;background:var(--line);border-radius:2px;overflow:hidden}',
    '#hn-odds .od-bar b{display:block;height:100%;background:var(--green)}',
    '#hn-odds .od-bar.bm b{background:#ff6b76}',
    '#hn-odds th small{display:block;margin-top:2px;font-size:9.5px;letter-spacing:.1em;color:#ff6b76}',
    '#hn-odds td.bm{color:#fff}',
    '#hn-odds .od-kpi-who{display:flex;align-items:center;font-style:normal}',
    '#hn-odds .od-lede{color:var(--silver);font-size:13.5px;line-height:1.55;margin:0 0 14px}',
    // the machine: one column, then games left and results right from 960 px
    '#hn-odds .wi-grid{display:grid;gap:18px;grid-template-columns:minmax(0,1fr)}',
    '@media(min-width:960px){#hn-odds .wi-grid{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);grid-template-rows:auto 1fr;grid-template-areas:"next res" "more res"}',
    ' #hn-odds .wi-next{grid-area:next}#hn-odds .wi-more{grid-area:more}#hn-odds .wi-res{grid-area:res;align-self:start}}',
    // pinned beside the games only when the window is tall enough to show all of it above the ticker
    '@media(min-width:960px) and (min-height:680px){#hn-odds .wi-res{position:sticky;top:76px}}',
    '#hn-odds .wk{font:800 10.5px "Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin:0 0 8px}',
    '#hn-odds .wk b{color:#fff}',
    '#hn-odds .g{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:3px;background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:3px;margin-bottom:6px}',
    '#hn-odds .g button{background:transparent;border:0;border-radius:9px;color:var(--silver);cursor:pointer;padding:6px 8px;font:700 13px "Segoe UI",sans-serif;display:flex;align-items:center;min-width:0}',
    '#hn-odds .g button:hover{color:#fff}',
    '#hn-odds .g .l{justify-content:flex-start;text-align:left}',
    '#hn-odds .g .r{justify-content:flex-end;text-align:right}',
    '#hn-odds .g .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '#hn-odds .g .pc{flex:none;font-size:11px;color:var(--muted);font-weight:700;margin:0 7px;font-variant-numeric:tabular-nums}',
    '#hn-odds .g .hn-face{flex:none;width:22px;height:22px;margin:0 7px 0 0}',
    '#hn-odds .g .r .hn-face{margin:0 0 0 7px}',
    '#hn-odds .g .m{font:800 10px "Segoe UI",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:6px 9px;justify-content:center;line-height:1.15;text-align:center}',
    '#hn-odds .g button.on{background:var(--red);color:#fff}',
    '#hn-odds .g button.on .pc{color:#ffd6da}',
    '#hn-odds .g .m.on{background:#2a2a31;color:#fff}',
    '#hn-odds details.wi-more{border-top:1px solid var(--line);padding-top:12px}',
    '#hn-odds details.wi-more summary{cursor:pointer;list-style:none;font:800 11.5px "Segoe UI",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#fff;display:flex;align-items:center;gap:8px}',
    '#hn-odds details.wi-more summary::-webkit-details-marker{display:none}',
    '#hn-odds details.wi-more summary:before{content:"\\203A";font-size:18px;line-height:1;color:var(--red);transition:transform .15s}',
    '#hn-odds details.wi-more[open] summary:before{transform:rotate(90deg)}',
    '#hn-odds details.wi-more summary em{font-style:normal;color:var(--gold);letter-spacing:.06em}',
    '#hn-odds .wi-weeks{display:grid;gap:14px;margin-top:14px}',
    '#hn-odds .wi-res{background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:12px 12px 10px;min-width:0;scroll-margin-top:84px}',
    '#hn-odds .wi-top{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 6px}',
    '#hn-odds .wi-status{font-size:12.5px;color:var(--silver);flex:1;min-width:160px}',
    '#hn-odds .wi-status b{color:#fff}',
    '#hn-odds .od-reset{flex:none;background:var(--panel);border:1px solid var(--line);color:var(--muted);border-radius:16px;padding:6px 12px;font:800 11px "Segoe UI",sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}',
    '#hn-odds .od-reset:hover:not([disabled]){color:#fff;border-color:#3a3a44}',
    '#hn-odds .od-reset[disabled]{opacity:.45;cursor:default}',
    '#hn-odds .wi-res .hn-table{font-size:12.5px}',
    '#hn-odds .wi-res .hn-table td,#hn-odds .wi-res .hn-table th{padding:7px 7px}',
    '#hn-odds .wi-res .hn-face{width:20px;height:20px;margin-right:6px}',
    // the change against the table above, only once something is picked
    '#hn-odds .d{display:inline-block;min-width:34px;font-style:normal;font-size:10.5px;margin-left:4px;text-align:right;color:var(--muted)}',
    '@media(max-width:560px){#hn-odds .wi-res .d{display:block;min-width:0;margin:1px 0 0}',
    ' #hn-odds .wi-res .c-top{display:none}#hn-odds .wi-res .hn-table td,#hn-odds .wi-res .hn-table th{padding:7px 5px}',
    ' #hn-odds .wi-res .hn-table th{letter-spacing:.06em}#hn-odds .g button{padding:6px 6px}#hn-odds .g .pc{margin:0 5px}}',
    '@media(max-width:400px){#hn-odds .wi-res .hn-table th{white-space:normal;vertical-align:bottom}#hn-odds .g .m{padding:6px 5px}}',
    // the smallest phones: names over pregame odds on the buttons, and a tighter dock
    '@media(max-width:340px){#hn-odds .g .pc,#hn-odds .ws-v .hn-face{display:none}#hn-odds .wi-strip .ws-go,#hn-odds .wi-strip .od-reset{padding:6px 8px}}',
    // the dock: when the results aren't pinned on screen, a pick anywhere still shows what it did
    '#hn-odds .wi-strip{display:none;align-items:center;gap:6px;position:sticky;bottom:52px;z-index:5;margin:14px -8px 0;padding:7px 7px 7px 12px;background:#26262e;border:1px solid #3a3a44;border-radius:12px;box-shadow:0 -8px 26px rgba(0,0,0,.6);transition:opacity .15s,transform .15s,visibility .15s}',
    '@media not all and (min-width:960px) and (min-height:680px){#hn-odds .wi-strip.on{display:flex}}',
    '#hn-odds .wi-strip.away{opacity:0;visibility:hidden;transform:translateY(10px)}',
    '#hn-odds .ws-l{flex:1;min-width:0}',
    '#hn-odds .ws-k{display:block;font:800 9.5px "Segoe UI",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#hn-odds .ws-v{display:flex;align-items:center;gap:5px;margin-top:2px;font-size:13px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden}',
    '#hn-odds .ws-v .hn-face{flex:none;width:18px;height:18px;margin:0}',
    '#hn-odds .ws-v em{font-style:normal;font-size:11.5px}',
    '#hn-odds .ws-go{flex:none;background:var(--red);border:0;color:#fff;border-radius:16px;padding:7px 11px;font:800 11px "Segoe UI",sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}'
  ].join('\n');

  function style() {
    if (document.getElementById('hn-odds-css')) return;
    var s = document.createElement('style'); s.id = 'hn-odds-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ------------------------------------------------------------- the model (port of odds.py)

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), a | 1);
      t = (t + Math.imul(t ^ (t >>> 7), t | 61)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The builder's file -> the arrays the simulation runs on. Index order is alphabetical,
  // like the builder's sorted(managers), so the last-resort tiebreak matches too.
  function prepare(d) {
    var names = Object.keys(d.model.mu).sort(), idx = {}, i, w, g;
    names.forEach(function (n, k) { idx[n] = k; });
    var played = [], future = [], fweek = [];
    for (w = 1; w <= d.through_week; w++) {
      d.results[w].forEach(function (r) { played.push([idx[r[0]], idx[r[2]], r[1], r[3]]); });
    }
    for (w = d.through_week + 1; w <= d.reg_weeks; w++) {
      d.schedule[w].forEach(function (pr) { future.push([idx[pr[0]], idx[pr[1]]]); fweek.push(w); });
    }
    var T = names.length, F = future.length, R = 2 * played.length, games = [];
    var mu = new Float64Array(T), w0 = new Float64Array(T), p0 = new Float64Array(T);
    var fi = new Int32Array(F), fj = new Int32Array(F), sc = new Float64Array(R + 2 * F);
    for (i = 0; i < T; i++) mu[i] = d.model.mu[names[i]];
    played.forEach(function (x, k) {
      var a = x[0], b = x[1], sa = x[2], sb = x[3];
      p0[a] += sa; p0[b] += sb; sc[2 * k] = sa; sc[2 * k + 1] = sb; games.push([a, b]);
      if (sa > sb) w0[a] += 1; else if (sb > sa) w0[b] += 1; else { w0[a] += 0.5; w0[b] += 0.5; }
    });
    for (g = 0; g < F; g++) { fi[g] = future[g][0]; fj[g] = future[g][1]; games.push(future[g]); }
    return { names: names, idx: idx, played: played, future: future, fweek: fweek, T: T, F: F, R: R,
             mu: mu, sigma: d.model.sigma, w0: w0, p0: p0, fi: fi, fj: fj, games: games, sc: sc,
             w: new Float64Array(T), p: new Float64Array(T), ord: new Int32Array(T),
             seed: d.seed, sims: Math.min(d.sims, MAX_SIMS), playoffs: d.playoff_teams || 6, byes: d.byes || 2, x: null, zs: 0, rnd: null };
  }

  // Every unplayed game of every season takes two uniforms, in schedule order, and turns
  // them into two standard normals (Box-Muller) and so two scores, mu + sigma * z, the
  // left team's first. Picks never change the stream, so the scores are made once, season
  // by season as they're first needed, and kept: a re-run is then just sums and sorting.
  function fill(E, upto) {
    var F = E.F, X = E.x, mu = E.mu, sg = E.sigma, fi = E.fi, fj = E.fj, q, g, n, o, r, th, rnd;
    if (!X || 2 * F * upto > X.length) {
      var nx = new Float64Array(2 * F * Math.max(upto, E.sims));
      if (X) nx.set(X.subarray(0, 2 * F * E.zs));
      E.x = X = nx;
    }
    rnd = E.rnd || (E.rnd = mulberry32(E.seed));
    for (q = E.zs * F, n = upto * F; q < n; q++) {
      r = Math.sqrt(-2 * Math.log(1 - rnd()));
      th = TWO_PI * rnd();
      o = 2 * q; g = q % F;
      X[o] = mu[fi[g]] + sg * (r * Math.cos(th));        // grouped exactly as odds.py does it
      X[o + 1] = mu[fj[g]] + sg * (r * Math.sin(th));
    }
    if (upto > E.zs) E.zs = upto;
  }

  function h2h(grp, games, sc) {
    var inside = {}, hw = {}, hg = {}, hp = {}, g, i, j, si, sj;
    grp.forEach(function (t) { inside[t] = 1; hw[t] = 0; hg[t] = 0; hp[t] = 0; });
    for (g = 0; g < games.length; g++) {
      i = games[g][0]; j = games[g][1];
      if (inside[i] && inside[j]) {
        si = sc[2 * g]; sj = sc[2 * g + 1];
        hg[i]++; hg[j]++; hp[i] += si; hp[j] += sj;
        if (si > sj) hw[i] += 1; else if (sj > si) hw[j] += 1; else { hw[i] += 0.5; hw[j] += 0.5; }
      }
    }
    var rate = {};
    grp.forEach(function (t) { rate[t] = hg[t] ? hw[t] / hg[t] : 0.5; });
    return grp.slice().sort(function (x, y) { return (rate[y] - rate[x]) || (hp[y] - hp[x]) || (x - y); });
  }

  // A tally of seasons played so far. picks: per unplayed game 0 = let it ride, 1 = left team
  // wins, 2 = right team wins.
  function tally(E, picks) {
    var T = E.T, pk = new Int8Array(E.F), g;
    if (picks) for (g = 0; g < E.F; g++) pk[g] = picks[g];
    return { pk: pk, s: 0, po: new Float64Array(T), by: new Float64Array(T), top: new Float64Array(T),
             last: new Float64Array(T), wins: new Float64Array(T) };
  }

  // Plays seasons tl.s .. to-1 into the tally. A picked game keeps its two simulated scores;
  // the higher one goes to the pick.
  function advance(E, tl, to) {
    if (to <= tl.s) return;
    fill(E, to);
    var T = E.T, F = E.F, R = E.R, X = E.x, fi = E.fi, fj = E.fj;
    var w0 = E.w0, p0 = E.p0, w = E.w, p = E.p, sc = E.sc, ord = E.ord, pks = tl.pk, PO = E.playoffs, BY = E.byes;
    var po = tl.po, by = tl.by, top = tl.top, last = tl.last, wins = tl.wins;
    var s, g, t, k, r, e, u, i, j, pk, xi, xj, a, wt, pt, grp, o = 2 * F * tl.s, o0;
    for (s = tl.s; s < to; s++) {
      for (t = 0; t < T; t++) { w[t] = w0[t]; p[t] = p0[t]; }
      o0 = o;
      for (g = 0; g < F; g++, o += 2) {
        i = fi[g]; j = fj[g]; xi = X[o]; xj = X[o + 1]; pk = pks[g];
        if (pk !== 0 && (pk === 1 ? xi < xj : xj < xi)) { a = xi; xi = xj; xj = a; }
        p[i] += xi; p[j] += xj;
        if (xi !== xj) { a = +(xi > xj); w[i] += a; w[j] += 1 - a; }   // no branch on a coin flip
        else if (pk === 1) w[i] += 1; else if (pk === 2) w[j] += 1; else { w[i] += 0.5; w[j] += 0.5; }
      }
      // rank: most wins, then most points; teams go in by index, so a dead heat keeps index order
      for (t = 0; t < T; t++) {
        wt = w[t]; pt = p[t]; k = t;
        while (k > 0) {
          u = ord[k - 1];
          if (wt > w[u] || (wt === w[u] && pt > p[u])) { ord[k] = u; k--; } else break;
        }
        ord[k] = t;
      }
      // still level on wins and points: head-to-head among them (points are continuous, so rare;
      // only then are this season's scores, as picked, laid out game by game for it)
      for (k = 0; k < T - 1; k++) {
        u = ord[k];
        if (w[ord[k + 1]] === w[u] && p[ord[k + 1]] === p[u]) {
          for (g = 0; g < F; g++) {
            xi = X[o0 + 2 * g]; xj = X[o0 + 2 * g + 1]; pk = pks[g];
            if (pk !== 0 && (pk === 1 ? xi < xj : xj < xi)) { a = xi; xi = xj; xj = a; }
            sc[R + 2 * g] = xi; sc[R + 2 * g + 1] = xj;
          }
          e = k + 1;
          while (e < T && w[ord[e]] === w[u] && p[ord[e]] === p[u]) e++;
          grp = h2h(Array.prototype.slice.call(ord, k, e), E.games, sc);
          for (r = 0; r < grp.length; r++) ord[k + r] = grp[r];
          k = e - 1;
        }
      }
      for (r = 0; r < T; r++) {
        t = ord[r];
        if (r < PO) po[t]++;
        if (r < BY) by[t]++;
        wins[t] += w[t];
      }
      top[ord[0]]++; last[ord[T - 1]]++;
    }
    tl.s = to;
  }

  function result(E, tl) {
    var out = {}, n = tl.s, t;
    for (t = 0; t < E.T; t++) out[E.names[t]] = { playoffs: tl.po[t] / n, bye: tl.by[t] / n, top: tl.top[t] / n, last: tl.last[t] / n, wins: tl.wins[t] / n };
    return out;
  }

  // the first `sims` seasons of the stream (all of them by default), with these picks
  function run(E, picks, sims) {
    var tl = tally(E, picks);
    advance(E, tl, sims || E.sims);
    return result(E, tl);
  }

  // standard normal CDF (Abramowitz & Stegun 7.1.26, error under 1.5e-7): a game's pregame odds
  function phi(x) {
    var z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
    var y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
    return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }

  // ------------------------------------------------------------- the file

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function own(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }

  // What's wrong with the file, or '' when it's whole. A partial file gets an empty state
  // that says so, never a table of NaN.
  function problem(d) {
    var NOT = 'The odds aren’t built yet.';
    if (!d || typeof d !== 'object' || !d.model || !d.model.mu || typeof d.model.mu !== 'object' || !d.baseline || typeof d.baseline !== 'object') return NOT;
    var m = d.model, names = Object.keys(m.mu), T = names.length, i, k, w, rows;
    if (T < 4 || T % 2 || !isNum(d.season) || !isNum(d.seed) || !isNum(d.sims) || d.sims < 100 || d.sims > 200000 || d.sims % 1 ||
        !isNum(d.reg_weeks) || d.reg_weeks < 1 || d.reg_weeks % 1 || !isNum(d.through_week) || d.through_week < 0 ||
        d.through_week > d.reg_weeks || d.through_week % 1 || !isNum(m.sigma) || !(m.sigma > 0)) return NOT;
    if (d.playoff_teams != null && !(isNum(d.playoff_teams) && d.playoff_teams >= 1 && d.playoff_teams <= T)) return NOT;
    if (d.byes != null && !(isNum(d.byes) && d.byes >= 0 && d.byes <= (d.playoff_teams || 6))) return NOT;
    for (i = 0; i < T; i++) {
      if (!isNum(m.mu[names[i]]) || !own(d.baseline, names[i])) return NOT;
      for (k = 0; k < ALL.length; k++) if (!isNum(d.baseline[names[i]][ALL[k]])) return NOT;
    }
    function week(pairs) {                       // T/2 games, every manager exactly once
      if (!pairs || !pairs.length || pairs.length !== T / 2) return false;
      var seen = {};
      for (var q = 0; q < pairs.length; q++) {
        var a = pairs[q] && pairs[q][0], b = pairs[q] && pairs[q][1];
        if (!own(m.mu, a) || !own(m.mu, b) || a === b || seen[a] || seen[b]) return false;
        seen[a] = seen[b] = 1;
      }
      return true;
    }
    for (w = 1; w <= d.through_week; w++) {
      rows = own(d.results, w) ? d.results[w] : null;
      if (!rows || !rows.map || !week(rows.map(function (r) { return r ? [r[0], r[2]] : null; })) ||
          rows.some(function (r) { return !isNum(r[1]) || !isNum(r[3]); })) return NOT;
    }
    for (w = d.through_week + 1; w <= d.reg_weeks; w++) {
      if (!own(d.schedule, w) || !d.schedule[w] || !d.schedule[w].map || !week(d.schedule[w])) return 'The schedule isn’t in yet.';
    }
    return '';
  }

  // ------------------------------------------------------------- formatting

  function pc(v) {
    if (v == null || isNaN(v)) return '—';
    if (v <= 0) return '0%';
    if (v >= 1) return '100%';
    if (v < 0.005) return '<1%';
    if (v > 0.995) return '>99%';
    return Math.round(v * 100) + '%';
  }
  function pcCls(v) { return v == null || isNaN(v) || v <= 0 ? ' hn-mute' : ''; }
  function bar(v, cls) {
    var x = v == null || isNaN(v) ? 0 : Math.max(0, Math.min(1, v));
    return '<i class="od-bar' + (cls ? ' ' + cls : '') + '"><b style="width:' + (x * 100).toFixed(1) + '%"></b></i>';
  }
  function num(v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d); }
  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  // [2021, 2025] -> '2021–25'
  function span(h) {
    if (!h || !isNum(h[0]) || !isNum(h[1])) return '';
    return h[0] === h[1] ? String(h[0]) : h[0] + '–' + (Math.floor(h[0] / 100) === Math.floor(h[1] / 100) ? String(h[1]).slice(-2) : h[1]);
  }

  function records(d, names) {
    var rec = {}, w;
    names.forEach(function (n) { rec[n] = { w: 0, l: 0, t: 0, pf: 0 }; });
    for (w = 1; w <= d.through_week; w++) {
      d.results[w].forEach(function (r) {
        var a = rec[r[0]], b = rec[r[2]];
        a.pf += r[1]; b.pf += r[3];
        if (r[1] > r[3]) { a.w++; b.l++; } else if (r[3] > r[1]) { b.w++; a.l++; } else { a.t++; b.t++; }
      });
    }
    return rec;
  }
  function recStr(x) { return x.w + '-' + x.l + (x.t ? '-' + x.t : ''); }
  function weeks(a, b) { return a >= b ? 'Week ' + a + ' is' : 'Weeks ' + a + '–' + b + ' are'; }
  // best playoff odds first; both tables sort the same way, so with nothing picked they match row for row
  function byOdds(S, rec) {
    return function (a, b) {
      return (S[b].playoffs - S[a].playoffs) || (S[b].bye - S[a].bye) || (S[b].top - S[a].top) ||
             (S[b].wins - S[a].wins) || (S[a].last - S[b].last) || (rec[b].pf - rec[a].pf) || (a < b ? -1 : 1);
    };
  }

  // ------------------------------------------------------------- the page

  HN.tabs.odds = function (el) {
    style();
    HN.data('odds').then(function (d) {
      var why = problem(d);
      if (why) HN.fail(el, why); else render(el, d);
    }).catch(function (e) {
      if (e && window.console) console.error(e);
      HN.fail(el, 'The odds aren’t built yet.');
    });
  };
  HN.tabs.odds.engine = { prepare: prepare, run: run, mulberry32: mulberry32, problem: problem };

  function render(el, d) {
    var E = prepare(d), names = E.names, B = d.baseline, m = d.model, rec = records(d, names), T = E.T;
    var left = d.reg_weeks - d.through_week, over = left <= 0, sims = commas(d.sims), yrs = span(m.hist_years);
    var byP = names.slice().sort(byOdds(B, rec));
    function fav(k) { return names.slice().sort(function (a, b) { return (B[b][k] - B[a][k]) || (a < b ? -1 : 1); })[0]; }
    var html = '';

    html += '<p class="hn-intro">' + (over
      ? 'The regular season is done, so the odds are just the standings now. Nothing left to simulate but regret.'
      : 'The rest of the regular season, played out ' + sims + ' times by a computer with no feelings. Who gets in, who gets the week off, and who runs the Beer Mile.') + '</p>';

    // KPIs
    var fp = fav('playoffs'), ft = fav('top'), fl = fav('last');
    html += '<div class="hn-kpis">' +
      kpi('Through', d.through_week ? 'Week ' + d.through_week : 'Preseason',
        over ? 'Regular season’s over' : left + (left === 1 ? ' week' : ' weeks') + ', ' + E.F + ' games to play') +
      (over
        ? kpi('No. 1 seed', '<i class="od-kpi-who">' + HN.who(ft) + '</i>', 'Finished first') +
          kpi('The Beer Mile', '<i class="od-kpi-who">' + HN.who(fl) + '</i>', 'Finished ' + ordinal(T) + '. Lace up.')
        : kpi('Playoff favorite', '<i class="od-kpi-who">' + HN.who(fp) + '</i>', pc(B[fp].playoffs) + ' to make the ' + (E.playoffs === 6 ? 'six' : 'top ' + E.playoffs)) +
          kpi('No. 1 seed favorite', '<i class="od-kpi-who">' + HN.who(ft) + '</i>', pc(B[ft].top) + ' to finish first') +
          kpi('Beer Mile favorite', '<i class="od-kpi-who">' + HN.who(fl) + '</i>', pc(B[fl].last) + ' to finish ' + ordinal(T))) +
      '</div>';

    // the odds table
    html += '<div class="hn-card"><h3 class="hn-h">Playoff odds <small>' + (over ? 'Regular season final' : sims + ' seasons · ' + (d.through_week ? 'through Week ' + d.through_week : 'before Week 1')) + '</small></h3>' +
      '<div class="hn-scroll"><table class="hn-table"><thead><tr><th>Manager</th><th class="n">Record</th>' +
      '<th class="n">Playoffs</th><th class="n">Bye</th><th class="n">No. 1 seed</th>' +
      '<th class="n">Last place<small>The Beer Mile</small></th><th class="n">Proj. wins</th><th class="n">Points</th>' + (over ? '' : '<th class="n">Model avg</th>') + '</tr></thead><tbody>';
    byP.forEach(function (n) {
      var r = rec[n], S = B[n];
      html += '<tr><td class="who">' + HN.who(n) + '</td><td class="n">' + recStr(r) + '</td>' +
        '<td class="n' + pcCls(S.playoffs) + '">' + pc(S.playoffs) + bar(S.playoffs) + '</td>' +
        '<td class="n' + pcCls(S.bye) + '">' + pc(S.bye) + '</td>' +
        '<td class="n' + pcCls(S.top) + '">' + pc(S.top) + '</td>' +
        '<td class="n bm' + pcCls(S.last) + '">' + pc(S.last) + bar(S.last, 'bm') + '</td>' +
        '<td class="n">' + num(S.wins, 1) + '</td><td class="n">' + num(r.pf, 2) + '</td>' +
        (over ? '' : '<td class="n hn-mute">' + num(m.mu[n], 1) + '</td>') + '</tr>';
    });
    html += '</tbody></table></div><p class="hn-note">' + method(d, E, sims, yrs, over) + '</p></div>';

    // the what-if machine
    html += '<div class="hn-card" id="od-wi"><h3 class="hn-h">The what-if machine' + (over ? '' : ' <small>Week ' + (d.through_week + 1) + ' is next</small>') + '</h3>';
    if (over) {
      html += '<p class="hn-empty">No games left to pick. The regular season is in the books.</p></div>';
      el.innerHTML = html;
      return;
    }
    html += '<p class="od-lede">Pick winners and the rest of the season re-runs ' + commas(E.sims) + ' times, right here in the browser. ' +
      'The percentage by each name is the model’s pregame chance.</p>' +
      '<div class="wi-grid"><div class="wi-next"></div><div class="wi-res"></div><details class="wi-more"></details></div>' +
      '<div class="wi-strip"><div class="ws-l"><span class="ws-k"></span><span class="ws-v"></span></div>' +
      '<button type="button" class="ws-go">Odds &uarr;</button><button type="button" class="od-reset">Reset</button></div>' +
      '<p class="hn-note">A picked game keeps its simulated scores, but the higher one goes to the pick, so points still feed the tiebreaker. ' +
      'The +/− is the change from the table above, in percentage points (in wins for the Wins column). <span class="od-proof"></span></p></div>';
    el.innerHTML = html;
    machine(el.querySelector('#od-wi'), d, E, rec);
  }

  function method(d, E, sims, yrs, over) {
    var m = d.model, rule = 'record (a tie is half a win), then total points, then head-to-head record and points among the tied teams';
    if (over) {
      return 'How it works: the regular season is over, so every number above is the final standings, ranked by the by-laws: ' + rule + '. ' +
        'Top ' + E.playoffs + ' made the playoffs, top ' + E.byes + ' got byes, and ' + ordinal(E.T) + ' runs the Beer Mile.';
    }
    var s = 'How it works: each manager’s weekly score is drawn from a bell curve. ';
    if (d.through_week) {
      s += 'It’s centered on their ' + d.season + ' average, pulled toward the league average' +
        (isNum(m.league_mean) ? ' (' + num(m.league_mean, 1) + ')' : '') +
        (isNum(m.k) ? ' as if they’d also played ' + m.k + ' average games' : '') + ', so a hot or cold start can’t run away with it. ';
    } else {
      s += 'Before Week 1 everyone is centered on the ' + (yrs ? yrs + ' ' : 'league’s ') + 'average' +
        (isNum(m.hist_mean) ? ' (' + num(m.hist_mean, 1) + ')' : '') + ', so only the schedule separates them. ';
    }
    s += 'That center is Model avg. The spread is ' + num(m.sigma, 1) + ' points, the typical swing around a manager’s own season average' +
      (yrs ? ' in ' + yrs : ' in past seasons') + (isNum(m.sigma_weeks) ? ' (' + commas(m.sigma_weeks) + ' team-weeks)' : '') + '. ' +
      (d.through_week ? weeks(1, d.through_week) + ' real; ' : '') +
      weeks(d.through_week + 1, d.reg_weeks) + ' played ' + sims + ' times, and a week counts as unplayed until it’s final. ' +
      'Each season is ranked by the by-laws: ' + rule + '. ' +
      'Top ' + E.playoffs + ' make the playoffs, top ' + E.byes + ' get byes, ' + ordinal(E.T) + ' runs the Beer Mile. Proj. wins is the average final win total.';
    return s;
  }

  function kpi(label, val, sub) {
    return '<div class="hn-kpi"><span>' + HN.esc(label) + '</span><b>' + val + '</b><em>' + HN.esc(sub) + '</em></div>';
  }

  function machine(box, d, E, rec) {
    var B = d.baseline, SIMS = E.sims, picks = [], i, gw = {}, next = d.through_week + 1;
    var base = null, bt = tally(E, null), cur = null, lastMs = 0, pending = 0, warmT = 0, started = 0;
    var res = box.querySelector('.wi-res'), strip = box.querySelector('.wi-strip');
    for (i = 0; i < E.F; i++) { picks.push(0); (gw[E.fweek[i]] = gw[E.fweek[i]] || []).push(i); }

    function gameRow(g) {
      var a = E.names[E.fi[g]], b = E.names[E.fj[g]];
      var pa = phi((E.mu[E.fi[g]] - E.mu[E.fj[g]]) / (E.sigma * Math.SQRT2));
      return '<div class="g" data-g="' + g + '">' +
        '<button type="button" class="l" data-v="1" aria-pressed="false" title="' + HN.esc(a) + ' wins">' + HN.face(a) + '<span class="nm">' + HN.esc(a) + '</span><span class="pc">' + pc(pa) + '</span></button>' +
        '<button type="button" class="m on" data-v="0" aria-pressed="true">Let it<br>ride</button>' +
        '<button type="button" class="r" data-v="2" aria-pressed="false" title="' + HN.esc(b) + ' wins"><span class="pc">' + pc(1 - pa) + '</span><span class="nm">' + HN.esc(b) + '</span>' + HN.face(b) + '</button></div>';
    }
    function weekBlock(w) {
      return '<div><p class="wk"><b>Week ' + w + '</b></p>' + (gw[w] || []).map(gameRow).join('') + '</div>';
    }
    box.querySelector('.wi-next').innerHTML = weekBlock(next);
    var later = [];
    for (i = next + 1; i <= d.reg_weeks; i++) if (gw[i]) later.push(i);
    var more = box.querySelector('.wi-more');
    if (later.length) {
      more.innerHTML = '<summary>Every remaining week <span class="hn-mute">(' + later[0] + (later.length > 1 ? '–' + later[later.length - 1] : '') +
        ')</span> <em></em></summary><div class="wi-weeks">' + later.map(weekBlock).join('') + '</div>';
    } else more.parentNode.removeChild(more);

    box.addEventListener('click', function (e) {
      var t = e.target, btn = t.closest ? t.closest('.g button') : null;
      if (btn) {
        var row = btn.parentNode, g = +row.getAttribute('data-g'), v = +btn.getAttribute('data-v');
        if (picks[g] === v && v !== 0) v = 0;          // tap a pick again to let it ride
        picks[g] = v;
        [].forEach.call(row.children, press(function (x) { return +x.getAttribute('data-v') === v; }));
        schedule();
        return;
      }
      if (t.closest && t.closest('.ws-go')) {
        try { res.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (x) { res.scrollIntoView(true); }
        return;
      }
      if (t.closest && t.closest('.od-reset')) {
        picks = picks.map(function () { return 0; });
        [].forEach.call(box.querySelectorAll('.g button'), press(function (x) { return x.getAttribute('data-v') === '0'; }));
        cur = null; paint();
      }
    });

    function press(test) {
      return function (x) { var on = test(x); x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    }
    function count() { var c = 0; for (var k = 0; k < picks.length; k++) if (picks[k]) c++; return c; }

    // The seasons with nothing picked: every pick is measured against them, and they're the
    // check that this is the builder's model. They're played in short slices once the machine
    // is near the screen, so nothing stalls; a pick before they're done finishes them first.
    function warm() {
      warmT = 0;
      if (base) return;
      var t0 = now();
      while (bt.s < SIMS && now() - t0 < 10) advance(E, bt, Math.min(SIMS, bt.s + 250));
      if (bt.s < SIMS) warmT = setTimeout(warm, 0); else settle();
    }
    function start() { if (!started) { started = 1; warmT = setTimeout(warm, 0); } }
    function finish() {
      started = 1;
      if (warmT) { clearTimeout(warmT); warmT = 0; }
      if (!base) { advance(E, bt, SIMS); settle(); }
    }
    function settle() { base = result(E, bt); prove(); }
    function prove() {
      var mx = 0, mw = 0;
      E.names.forEach(function (n) {
        METRICS.forEach(function (k) { mx = Math.max(mx, Math.abs(base[n][k] - B[n][k])); });
        mw = Math.max(mw, Math.abs(base[n].wins - B[n].wins));
      });
      box.setAttribute('data-proof', (100 * mx).toPrecision(3) + ' ' + mw.toPrecision(3));
      box.querySelector('.od-proof').textContent = mx < 1e-9 && mw < 1e-9
        ? 'With nothing picked, the machine plays the same ' + commas(SIMS) + ' seasons as the table above and gets the same numbers, to the last decimal.'
        : 'With nothing picked, the machine’s ' + commas(SIMS) + ' seasons land within ' + (100 * mx).toFixed(2) + ' percentage points of the table above.';
    }

    function schedule() {
      if (pending) return;
      pending = 1;
      setTimeout(function () {
        pending = 0;
        if (count()) { finish(); var s = now(); cur = run(E, picks); lastMs = now() - s; } else cur = null;
        paint();
      }, 0);
    }

    function paint() {
      var c = count(), S = c ? cur : B, box2 = res.querySelector('.hn-scroll'), keep = box2 ? box2.scrollLeft : 0, laterPicks = 0;
      later.forEach(function (w) { gw[w].forEach(function (g) { if (picks[g]) laterPicks++; }); });
      var em = box.querySelector('.wi-more summary em');
      if (em) em.textContent = laterPicks ? laterPicks + ' picked' : '';
      var h = '<div class="wi-top"><span class="wi-status">' + (c
        ? '<b>' + c + (c === 1 ? ' pick' : ' picks') + '.</b> ' + commas(SIMS) + ' seasons re-run in&nbsp;' + Math.max(1, Math.round(lastMs)) + '&nbsp;ms.'
        : '<b>No picks yet.</b> Every game left to chance.') + '</span>' +
        '<button type="button" class="od-reset"' + (c ? '' : ' disabled') + '>Reset</button></div>' +
        '<div class="hn-scroll"><table class="hn-table"><thead><tr><th>Manager</th><th class="n">Playoffs</th><th class="n">Bye</th>' +
        '<th class="n c-top">No. 1</th><th class="n">Beer Mile</th><th class="n">Wins</th></tr></thead><tbody>';
      E.names.slice().sort(byOdds(S, rec)).forEach(function (n) {
        h += '<tr><td class="who">' + HN.who(n) + '</td>' +
          cell(n, 'playoffs', 1) + cell(n, 'bye', 1) + cell(n, 'top', 1, 'c-top') + cell(n, 'last', -1) + cell(n, 'wins', 1) + '</tr>';
      });
      res.innerHTML = h + '</tbody></table></div>';
      if (keep) res.querySelector('.hn-scroll').scrollLeft = keep;
      dock(c);

      // a value, and once something's picked, its change against the no-pick seasons (the table above)
      function cell(n, k, good, extra) {
        var v = S[n][k], wins = k === 'wins', txt = wins ? num(v, 1) : pc(v), dd, on, dl = '';
        if (c) {
          dd = (v - base[n][k]) * (wins ? 1 : 100); on = Math.abs(dd) >= 0.05;
          dl = '<em class="d' + (on ? (dd * good > 0 ? ' hn-good' : ' hn-bad') : '') + '">' + (on ? HN.signed(dd, 1) : '') + '</em>';
        }
        return '<td class="n' + (extra ? ' ' + extra : '') + (wins ? '' : pcCls(v)) + '">' + txt + dl + '</td>';
      }
    }

    // the dock: pick count and the biggest move in playoff odds, a way up to the full table, reset
    function dock(c) {
      strip.classList.toggle('on', c > 0);
      if (!c) return;
      var best = null, bd = 0;
      E.names.forEach(function (n) {
        var dd = (cur[n].playoffs - base[n].playoffs) * 100;
        if (Math.abs(dd) > Math.abs(bd) + 1e-9) { best = n; bd = dd; }
      });
      strip.querySelector('.ws-k').textContent = c + (c === 1 ? ' pick' : ' picks') + ' · playoffs';
      strip.querySelector('.ws-v').innerHTML = best && Math.abs(bd) >= 0.05
        ? HN.face(best) + '<span>' + HN.esc(best) + '</span><span>' + pc(cur[best].playoffs) + '</span><em class="' + (bd > 0 ? 'hn-good' : 'hn-bad') + '">' + HN.signed(bd, 1) + '</em>'
        : '<span class="hn-mute">Nobody’s odds moved.</span>';
    }

    if (window.IntersectionObserver) {
      // the dock steps aside while the results themselves are on screen
      new IntersectionObserver(function (es) {
        strip.classList.toggle('away', es[es.length - 1].intersectionRatio >= 0.5);
      }, { rootMargin: '-70px 0px -100px 0px', threshold: [0, 0.5, 1] }).observe(res);
      new IntersectionObserver(function (es, io) {
        if (es[es.length - 1].isIntersecting) { io.disconnect(); start(); }
      }, { rootMargin: '600px 0px' }).observe(box);
    } else start();
    paint();
  }

  function now() { return window.performance && performance.now ? performance.now() : +new Date(); }
})(window.HN);
