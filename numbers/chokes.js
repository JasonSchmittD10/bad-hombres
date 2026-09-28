// Hard Numbers — the Choke Ledger: managers who lost after Yahoo had them 85% or better to win,
// with points on the board. No build step: everything is read live from the pulse (api/pulse.mjs),
// which writes down Yahoo's win probability for every matchup every few minutes, from a week's
// first points until the week goes final.
//
//   /api/pulse?season=Y          the season: {season, threshold, updated, chokes: [...], weeks: [{week, samples, settled}]}
//   /api/pulse?season=Y&week=N   one week: {pairs, samples: [[iso, {name: wp}, {name: score}]], peak, final}
//
// Pre-game odds don't count. The pulse records every matchup as soon as anyone in the league has
// a point, so a matchup nobody has played yet goes in at Yahoo's projection, and the server's
// peaks and ledger count those readings. This tab doesn't: a manager's peak is his best reading
// with a point on the board in his own matchup (livePeak). The server's peak is the best of ALL
// readings, so its ledger can only hold extras — entries whose peak reading was 0–0 — and those
// are re-judged here from the week's readings (judge). A tie counts as a loss, as on the server
// (won = s > opp_s): 85% was the chance to win.
//
// Charts are the homepage's sweat charts (/assets/js/sweat.js, BHSweat.chart), fed the weeks this
// tab loads itself — with ?season=, so the server skips its Yahoo lookup and old seasons still work.
window.HN = window.HN || { tabs: {} };
(function (HN) {
  // the pulse's first reading: Sunday night of Week 3, 2026, partway through the late game.
  // That week's Thursday and Sunday-afternoon games were never recorded.
  var START = { season: 2026, week: 3, at: '2026-09-28T00:45:29Z' };
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var NS = 'http://www.w3.org/2000/svg';

  var CSS =
    '#hn-chokes .ck-bar{display:flex;justify-content:center;margin:0 0 16px}' +
    '#hn-chokes .ck-bar:empty{display:none}' +
    '#hn-chokes .ck-list{display:grid;gap:12px}' +
    '#hn-chokes .ck-item{background:var(--panel-2);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-width:0}' +
    '#hn-chokes .ck-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}' +
    '#hn-chokes .ck-top>.hn-face{width:42px;height:42px;margin:0;flex:none}' +
    '#hn-chokes .ck-title{flex:1 1 170px;min-width:0}' +
    '#hn-chokes .ck-title h4{margin:0;font:900 17px/1.3 "Arial Black",Impact,sans-serif;color:#fff}' +
    '#hn-chokes .ck-title h4 b{color:#ff6b76}' +
    '#hn-chokes .ck-title h4 .hn-face{width:20px;height:20px;margin:-3px 5px 0 2px}' +
    '#hn-chokes .ck-title small{display:block;margin-top:4px;font:800 10.5px "Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}' +
    '#hn-chokes .ck-facts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px 14px;margin-top:14px}' +
    '#hn-chokes .ck-f{border-left:2px solid var(--line);padding-left:10px;min-width:0}' +
    '#hn-chokes .ck-f span{display:block;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}' +
    '#hn-chokes .ck-f b{display:block;margin-top:4px;color:#fff;font-size:14.5px;font-variant-numeric:tabular-nums}' +
    '#hn-chokes .ck-f em{display:block;margin-top:2px;font-style:normal;font-size:12px;color:var(--silver)}' +
    '#hn-chokes .ck-f.ck-lost{border-left-color:#ff6b76}' +
    '#hn-chokes .ck-tog,#hn-chokes .ck-retry{flex:none;background:transparent;border:1px solid #3a3a44;color:var(--silver);border-radius:16px;padding:6px 12px;' +
    'font:800 11px "Segoe UI",sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;white-space:nowrap}' +
    '#hn-chokes .ck-tog:hover,#hn-chokes .ck-retry:hover{color:#fff;border-color:#5a5a66}' +
    '#hn-chokes .ck-tog[aria-expanded="true"]{background:var(--red);border-color:var(--red);color:#fff}' +
    '#hn-chokes .ck-retry{margin:6px 0 0 6px;padding:4px 11px}' +
    '#hn-chokes .ck-chart{margin-top:12px}' +
    '#hn-chokes .ck-chart[hidden]{display:none}' +
    // the peak dot can sit on the chart's edge; let it show whole
    '#hn-chokes .sw-svg{height:170px;overflow:visible}' +
    '#hn-chokes .ck-thr{stroke:#ff6b76;stroke-width:1;stroke-dasharray:5 4;opacity:.7}' +
    '#hn-chokes .ck-dot{stroke:var(--gold);stroke-width:11;stroke-linecap:round;fill:none}' +
    '#hn-chokes .ck-dot2{stroke:var(--ink);stroke-width:4;stroke-linecap:round;fill:none}' +
    '#hn-chokes .ck-key{display:flex;flex-wrap:wrap;gap:4px 16px;margin:2px 0 0;font-size:11px;color:var(--muted)}' +
    '#hn-chokes .ck-key i{display:inline-block;vertical-align:middle;margin:-2px 6px 0 0}' +
    '#hn-chokes .ck-key .k-thr{width:18px;border-top:1px dashed #ff6b76}' +
    '#hn-chokes .ck-key .k-dot{width:11px;height:11px;border-radius:50%;background:var(--ink);border:3.5px solid var(--gold);box-sizing:border-box}' +
    // the empty ledger
    '#hn-chokes .ck-clean{display:flex;align-items:center;gap:16px;padding:4px 2px}' +
    '#hn-chokes .ck-zero{flex:none;width:62px;height:62px;border-radius:50%;border:2px solid var(--line);display:flex;align-items:center;' +
    'justify-content:center;font:900 26px "Arial Black",Impact,sans-serif;color:var(--green)}' +
    '#hn-chokes .ck-clean p{margin:0;color:var(--silver);font-size:14px;line-height:1.55;min-width:0}' +
    '#hn-chokes .ck-clean p b{color:#fff}' +
    '#hn-chokes .ck-out{margin:12px 0 0;color:var(--silver);font-size:13px;line-height:1.5}' +
    '#hn-chokes .ck-out b{color:#fff}' +
    // ranked rows (On the Hook, Biggest Leads Blown)
    '#hn-chokes .ck-lead{margin:0 0 10px;color:var(--silver);font-size:13.5px;line-height:1.5}' +
    '#hn-chokes .ck-row{display:grid;grid-template-columns:var(--ck-cols);gap:10px;align-items:center;padding:9px 4px;' +
    'border-top:1px solid var(--line);font-size:13.5px;color:var(--silver);min-width:0}' +
    '#hn-chokes .ck-row>*,#hn-chokes .ck-ds>*{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '#hn-chokes .ck-hd{padding-top:0;border-top:0;font-size:10.5px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}' +
    '#hn-chokes .ck-r{text-align:right}' +
    '#hn-chokes .ck-rk{color:var(--muted);font-weight:800;font-variant-numeric:tabular-nums}' +
    '#hn-chokes .ck-who{color:#fff;font-weight:700}' +
    '#hn-chokes .ck-who em{font-style:normal;font-weight:600;color:var(--muted);margin-left:2px}' +
    '#hn-chokes .ck-pk{text-align:right;font:900 16px "Arial Black",Impact,sans-serif;color:#fff}' +
    '#hn-chokes .ck-d,#hn-chokes .ck-wk{font-variant-numeric:tabular-nums}' +
    '#hn-chokes .ck-wkd{display:none}' +
    '#hn-chokes .ck-l{display:none;font-style:normal;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-right:6px}' +
    '#hn-chokes .ck-b{text-align:right;overflow:visible}' +
    '#hn-chokes .ck-ast{color:var(--gold);font-weight:800;margin-left:2px}' +
    '#hn-chokes .ck-tie{font-style:normal;color:var(--muted);margin-left:5px}' +
    '#hn-chokes .ck-rowchart{margin:0;padding:2px 4px 14px}' +
    '#hn-chokes .ck-foot{color:var(--muted);font-size:12px;line-height:1.5;margin:10px 4px 0}' +
    '#hn-chokes .ck-wait{color:var(--muted);font-size:13px;padding:10px 4px}' +
    '#hn-chokes .ck-ds{display:contents}' +
    // below 780px the ranked grids don't fit their numbers: each row turns into wrapped lines,
    // name and peak first, the details (.ck-ds) under them
    '@media(max-width:780px){' +
    '#hn-chokes .ck-row.ck-hd{display:none}' +
    '#hn-chokes .ck-hd+.ck-row{border-top:0}' +
    '#hn-chokes .ck-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 12px}' +
    '#hn-chokes .ck-rk{order:0;flex:none;width:18px}' +
    '#hn-chokes .ck-who{order:1;flex:1 1 0}' +
    '#hn-chokes .ck-pk{order:2;flex:none}' +
    '#hn-chokes .ck-ds{order:4;flex:1 1 100%;display:flex;flex-wrap:wrap;align-items:center;gap:3px 14px;white-space:normal}' +
    '#hn-chokes .ck-ranked .ck-ds{padding-left:30px}' +
    '#hn-chokes .ck-ds>*{white-space:nowrap}' +
    '#hn-chokes .ck-ds .ck-b{margin-left:auto}' +
    '#hn-chokes .ck-d{font-size:12.5px}' +
    '#hn-chokes .ck-ds .ck-now{order:-1;font:inherit;font-size:12.5px;font-weight:700;text-align:left}' +
    '#hn-chokes .ck-l{display:inline}' +
    '#hn-chokes .ck-wk{display:none}' +
    '#hn-chokes .ck-ds .ck-wkd{display:inline}' +
    '}' +
    '@media(max-width:640px){#hn-chokes .ck-facts{grid-template-columns:minmax(0,1fr)}}' +
    '@media(max-width:360px){' +
    '#hn-chokes .ck-row>.ck-who{white-space:normal}' +
    '#hn-chokes .ck-ranked .ck-ds{padding-left:0}' +
    '#hn-chokes .ck-title{flex-basis:120px}' +
    '}';

  function style() {
    if (document.getElementById('hn-chokes-css')) return;
    var s = document.createElement('style'); s.id = 'hn-chokes-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  // ---- small formatters ----
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function pc(v) { return isNum(v) ? Math.round(v * 100) + '%' : '—'; }
  function score(a, b) { return isNum(a) && isNum(b) ? a.toFixed(2) + '–' + b.toFixed(2) : '—'; }
  function margin(a, b, up, down, even) {
    if (!isNum(a) || !isNum(b)) return '';
    var m = Math.round((a - b) * 100) / 100;
    return m > 0 ? up + ' ' + m.toFixed(2) : m < 0 ? down + ' ' + (-m).toFixed(2) : even;
  }
  // "Sunday 4:12 PM ET" (short: "Sun 4:12 PM"); a reading after midnight belongs to the night before
  var fmt;
  function when(iso, short) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '—';
    if (!fmt) fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true });
    var p = {};
    fmt.formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var ampm = /p/i.test(p.dayPeriod || '') ? 'PM' : 'AM';
    var late = ampm === 'AM' && Number(p.hour) % 12 < 5, day = p.weekday || '';
    if (late && DAYS.indexOf(day) >= 0) day = DAYS[(DAYS.indexOf(day) + 6) % 7];
    if (short) day = day.slice(0, 3);
    return day + (late ? (short ? ' night ' : ' night, ') : ' ') + p.hour + ':' + p.minute + ' ' + ampm + (short ? '' : ' ET');
  }
  function sameTime(a, b) {
    var x = a ? new Date(a).getTime() : NaN, y = b ? new Date(b).getTime() : NaN;
    return isFinite(x) && x === y;
  }
  function weeksWord(n) { return n + (n === 1 ? ' week' : ' weeks'); }
  function andList(a) { return a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function weekList(ns) { return (ns.length === 1 ? 'Week ' : 'Weeks ') + andList(ns.map(String)); }
  function copy(o, x) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in x) r[k] = x[k]; return r; }
  function byPeak(a, b) { return b.peak - a.peak || b.week - a.week || (a.who < b.who ? -1 : a.who > b.who ? 1 : 0); }
  // a peak at the record's very first reading: that week was picked up late, so he may have been higher before it
  function early(yr, wk, at) { return yr === START.season && wk === START.week && sameTime(at, START.at); }

  // ---- data ----
  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' answered ' + r.status);
      return r.json();
    }).then(function (j) {
      if (!j || typeof j !== 'object') throw new Error(url + ' answered nothing');
      return j;
    });
  }
  // the chart script; the ledger works without it, only the charts don't
  var sweatP;
  function sweatReady() {
    if (window.BHSweat) return Promise.resolve(window.BHSweat);
    if (!sweatP) sweatP = new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = '/assets/js/sweat.js';
      s.onload = function () { if (window.BHSweat) ok(window.BHSweat); else { sweatP = null; no(new Error('sweat.js has no BHSweat')); } };
      s.onerror = function () { sweatP = null; if (s.parentNode) s.parentNode.removeChild(s); no(new Error('sweat.js didn’t load')); };
      document.head.appendChild(s);
    });
    return sweatP;
  }
  // one week's readings, fetched once per page and shared by the hook, the charts and the rankings.
  // A failure isn't kept, so asking again retries.
  var weekP = {};
  function loadWeek(yr, n, fresh) {
    var k = yr + ':' + n;
    if (fresh) delete weekP[k];
    if (!weekP[k]) {
      var p = weekP[k] = getJSON('/api/pulse?season=' + yr + '&week=' + n);
      p.then(null, function () { if (weekP[k] === p) delete weekP[k]; });
    }
    return weekP[k];
  }
  // several weeks, three at a time; resolves {week: data, or null if it couldn't be read}, never rejects
  function loadWeeks(yr, ns) {
    var out = {}, i = 0, busy = 0;
    return new Promise(function (done) {
      function next() {
        if (i >= ns.length && !busy) { done(out); return; }
        while (busy < 3 && i < ns.length) one(ns[i++]);
      }
      function one(n) {
        busy++;
        loadWeek(yr, n).then(function (w) { out[n] = w; }, function () { out[n] = null; }).then(function () { busy--; next(); });
      }
      next();
    });
  }

  // ---- peaks ----
  function oppsOf(wk) {
    var o = {}, f = wk.final || {};
    (wk.pairs || []).forEach(function (p) { if (p && p.length === 2 && p[0] && p[1]) { o[p[0]] = p[1]; o[p[1]] = p[0]; } });
    Object.keys(f).forEach(function (m) { if (!o[m] && f[m] && f[m].opp) o[m] = f[m].opp; });
    return o;
  }
  // His best reading with a point on the board in his matchup: {wp, at, s, o}, or null. A 0–0 reading is
  // Yahoo's pre-game projection, so it doesn't count; a reading with no scores at all does (the three
  // imported from before the server kept scores, all taken during Sunday night's game in Week 3, 2026).
  // Equal readings go to the earlier one, as on the server.
  function livePeak(wk, who, opp) {
    var best = null;
    ((wk && wk.samples) || []).forEach(function (r) {
      if (!r || !r[1] || !isNum(r[1][who])) return;
      var sc = r[2] || {}, s = sc[who], o = opp ? sc[opp] : undefined;
      if (s === 0 && o === 0) return;
      if (!best || r[1][who] > best.wp) best = { wp: r[1][who], at: r[0], s: isNum(s) ? s : null, o: isNum(o) ? o : null };
    });
    // those imported readings carry no scores, but the server's peak for them does
    var pk = best && wk.peak && wk.peak[who];
    if (pk && best.s == null && sameTime(best.at, pk.at) && isNum(pk.s) && isNum(pk.opp_s)) { best.s = pk.s; best.o = pk.opp_s; }
    return best;
  }
  // the server's ledger, minus anyone whose 85% was only ever a projection: an entry whose peak reading
  // was 0–0 is re-judged on the week's live readings. Resolves {list, out}; never rejects.
  function preGame(c) { return c.score_then === 0 && c.opp_then === 0; }
  function judge(v, raw) {
    var sus = raw.filter(preGame), wks = [];
    if (!sus.length) return Promise.resolve({ list: raw, out: [] });
    sus.forEach(function (c) { if (wks.indexOf(c.week) < 0) wks.push(c.week); });
    return loadWeeks(v.yr, wks).then(function (got) {
      var list = [], out = [];
      raw.forEach(function (c) {
        if (!preGame(c)) { list.push(c); return; }
        var wk = got[c.week], lp = wk ? livePeak(wk, c.who, c.opp) : null;
        if (!wk) list.push(copy(c, { unchecked: true }));
        else if (lp && lp.wp >= v.thr) list.push(copy(c, { peak: lp.wp, at: lp.at, score_then: lp.s, opp_then: lp.o }));
        else out.push(c);
      });
      return { list: list, out: out };
    });
  }

  // ---- the chart: BHSweat's, plus the choke line and the peak reading ----
  // sweat.js spaces readings evenly, and the pulse keeps reading through Friday, Saturday and the
  // small hours, so the chart gets only the readings where something in this matchup moved (plus the
  // peak and the latest): a flat stretch is drawn once instead of filling half the chart. No value changes.
  function moving(wk, a, b, keepAt) {
    var last = null, out = [], end = null;
    (wk.samples || []).forEach(function (r) {
      if (!r || !r[1] || typeof r[1][a] !== 'number') return;
      var sc = r[2] || {}, sig = r[1][a] + '|' + sc[a] + '|' + sc[b];
      if (sig !== last || sameTime(r[0], keepAt)) out.push(r);
      last = sig; end = r;
    });
    if (end && out[out.length - 1] !== end) out.push(end);
    return copy(wk, { samples: out });
  }
  function drawChart(v, box, sp, fresh) {
    sp.drawn = true;
    box.innerHTML = '<div class="sw-empty">Loading the chart…</div>';
    Promise.all([sweatReady(), loadWeek(v.yr, sp.week, fresh)]).then(function (x) {
      var wk = moving(x[1], sp.who, sp.opp, sp.at);
      x[0].chart(box, wk, sp.who, sp.opp, { since: 'in Week ' + START.week + ' of ' + START.season });
      mark(box, wk, sp, v.thr);
    }).then(null, function (err) {
      sp.drawn = false;                                   // opening it again tries again
      if (window.console) console.error('chokes chart:', err);
      box.innerHTML = '<div class="sw-empty">The chart couldn’t be loaded.<button type="button" class="ck-retry" data-retry="chart">Try again</button></div>';
    });
  }
  function mark(box, wk, sp, thr) {
    var svg = box.querySelector('svg.sw-svg'), hit = svg && svg.querySelector('.sw-hit');
    if (!hit) return;
    // the plot area, read off the chart itself: y(p) = top + (1 - p) * height
    var L = Number(hit.getAttribute('x')), T = Number(hit.getAttribute('y')),
      iw = Number(hit.getAttribute('width')), ih = Number(hit.getAttribute('height'));
    if (!(iw > 0 && ih > 0)) return;
    function y(p) { return (T + (1 - p) * ih).toFixed(1); }
    function add(tag, at) {
      var e = document.createElementNS(NS, tag);
      for (var k in at) e.setAttribute(k, at[k]);
      svg.insertBefore(e, hit);
    }
    add('line', { x1: L, x2: L + iw, y1: y(thr), y2: y(thr), 'class': 'ck-thr', 'vector-effect': 'non-scaling-stroke' });
    // a day with a reading or two leaves its label on top of the next day's: keep the later one
    // (the labels stretch with the chart, so their width in chart units never changes)
    var dl = svg.querySelectorAll('text.sw-dl');
    for (var j = 0; j + 1 < dl.length; j++) {
      if (Number(dl[j + 1].getAttribute('x')) - Number(dl[j].getAttribute('x')) < 34) dl[j].style.display = 'none';
    }
    // the peak: the reading the page quotes, among the same readings sweat.js plots
    var ps = (wk.samples || []).filter(function (s) { return s && s[1] && typeof s[1][sp.who] === 'number'; }), i = -1;
    if (ps.length > 1) ps.forEach(function (s, j) { if (i < 0 && sameTime(s[0], sp.at)) i = j; });
    if (i >= 0) {
      var x = (L + i * iw / (ps.length - 1)).toFixed(1), py = y(ps[i][1][sp.who]);
      // zero-length strokes with round caps: dots that stay round in the stretched chart
      add('path', { d: 'M' + x + ' ' + py + 'l0 0', 'class': 'ck-dot', 'vector-effect': 'non-scaling-stroke' });
      add('path', { d: 'M' + x + ' ' + py + 'l0 0', 'class': 'ck-dot2', 'vector-effect': 'non-scaling-stroke' });
    }
    var key = document.createElement('p'); key.className = 'ck-key';
    key.innerHTML = '<span><i class="k-thr"></i>' + pc(thr) + ', the choke line</span>' +
      (i >= 0 ? '<span><i class="k-dot"></i>' + HN.esc(sp.who) + '’s peak, ' + pc(ps[i][1][sp.who]) + '</span>' : '');
    box.appendChild(key);
  }

  // ---- markup ----
  function kpi(label, val, sub, id) {
    return '<div class="hn-kpi"' + (id ? ' id="' + id + '"' : '') + '><span>' + HN.esc(label) + '</span><b>' + HN.esc(val) + '</b><em>' + HN.esc(sub) + '</em></div>';
  }
  function setKpi(v, id, val, sub) {
    var k = v.body.querySelector('#' + id);
    if (!k) return;
    k.querySelector('b').textContent = val;
    k.querySelector('em').textContent = sub;
  }
  function tog(i, open, labels) {
    return '<button type="button" class="ck-tog" data-i="' + i + '" data-l="' + HN.esc(labels.join('|')) + '" aria-controls="ck-chart-' + i + '" aria-expanded="' + open + '">' +
      HN.esc(labels[open ? 1 : 0]) + '</button>';
  }
  function box(i, open, cls) {
    return '<div class="ck-chart' + (cls ? ' ' + cls : '') + '" id="ck-chart-' + i + '" data-i="' + i + '"' + (open ? '' : ' hidden') + '></div>';
  }
  function star() {
    return '<p class="ck-foot"><b class="ck-ast">*</b> The record’s first reading (' + HN.esc(when(START.at)) + ') — the peak may have been higher before the pulse started.</p>';
  }
  // a list of rows on one grid: cols = [{l: header label, w: grid track, c: header class}], rows = row markup.
  // Below 780px the grid turns into wrapped lines: name, peak and button first, the details (.ck-ds) under them.
  function rowList(cols, rows, ranked) {
    var grid = cols.map(function (c) { return c.w; }).join(' ');
    var hd = '<div class="ck-row ck-hd">' + cols.map(function (c) { return '<span class="' + (c.c || '') + '">' + HN.esc(c.l) + '</span>'; }).join('') + '</div>';
    return '<div class="ck-rows' + (ranked ? ' ck-ranked' : '') + '" style="--ck-cols:' + grid + '">' + hd + rows.join('') + '</div>';
  }
  function cell(cls, html, label) { return '<span class="' + cls + '">' + (label ? '<i class="ck-l">' + HN.esc(label) + '</i>' : '') + html + '</span>'; }

  function introHTML(thr) {
    return '<p class="hn-intro">A choke is a loss after Yahoo had the manager at ' + pc(thr) + ' or better, with points on the board. ' +
      'Pre-game odds don’t count — nobody chokes on a projection.</p>';
  }
  function method(v, updated) {
    var T = pc(v.thr);
    return 'How it’s kept: every few minutes from a week’s first points until it goes final, the site writes down Yahoo’s win probability ' +
      'for every matchup. A manager’s peak is the best reading once that matchup had a point on the board. Peak at ' + T + ' or better, lose, ' +
      'and it goes in the ledger when the week goes final. A tie counts as a loss here: ' + T + ' was the chance to win. ' +
      'A stretch with no readings is simply missing, peak and all. The record starts ' + HN.esc(when(START.at)) + ' in Week ' + START.week +
      ' of ' + START.season + ', during the late game; that week’s earlier games went unrecorded.' +
      (updated ? ' Last update: ' + HN.esc(when(updated)) + '.' : '');
  }
  function cleanSheet(v) {
    var n = v.settled.length, live = v.live, T = pc(v.thr), msg;
    var first = v.yr === START.season && live === START.week;
    if (!n && live == null) msg = '<b>Clean sheet.</b> Nothing on the record' +
      (v.current ? ' yet. The pulse starts taking readings when a week’s first game kicks off.' : ' for ' + v.yr + '.');
    else if (!n) msg = '<b>Clean sheet.</b> Nobody has choked yet. Week ' + live + ' is the first week on trial' +
      (first ? ', recorded from Sunday night on,' : '') + ' and the verdict comes when its last game goes final.';
    else msg = '<b>Clean sheet.</b> Nobody has choked yet — ' + weeksWord(n) + ' judged, and everyone who got to ' + T + ' closed it out.' +
      (live != null ? ' Week ' + live + ' is on trial now.' : '');
    return '<div class="ck-clean"><div class="ck-zero">0</div><p>' + msg + '</p></div>';
  }
  function chokeCard(v, c, i, open) {
    var fin = margin(c.final, c.opp_final, 'won by', 'lost by', 'tied');
    var then = c.unchecked ? 'before anyone in that matchup scored; that week couldn’t be re-checked' :
      isNum(c.score_then) && isNum(c.opp_then) ? margin(c.score_then, c.opp_then, 'up', 'down', 'tied') : 'score not recorded at that reading';
    return '<article class="ck-item">' +
      '<div class="ck-top">' + HN.face(c.who) +
      '<div class="ck-title"><h4>' + HN.esc(c.who) + ' was <b>' + pc(c.peak) + '</b> to beat ' + HN.face(c.opp) + HN.esc(c.opp) + '</h4>' +
      '<small>Week ' + c.week + ' · ' + v.yr + '</small></div>' +
      (open ? '' : tog(i, false, ['Show the chart', 'Hide the chart'])) +
      '</div>' +
      '<div class="ck-facts">' +
      '<div class="ck-f"><span>Peaked</span><b>' + HN.esc(when(c.at)) + '</b>' +
      (early(v.yr, c.week, c.at) ? '<em>the record’s first reading; the peak may have been higher earlier</em>' : '') + '</div>' +
      '<div class="ck-f"><span>Score then</span><b>' + score(c.score_then, c.opp_then) + '</b><em>' + then + '</em></div>' +
      '<div class="ck-f ck-lost"><span>Final</span><b>' + score(c.final, c.opp_final) + '</b>' + (fin ? '<em>' + fin + '</em>' : '') + '</div>' +
      '</div>' + box(i, open) + '</article>';
  }

  // ---- the tab ----
  var active = null, current = null;      // the view on screen; the season being played (from the first answer)

  HN.tabs.chokes = function (el) {
    style();
    if (!el.getAttribute('data-ck')) {
      el.setAttribute('data-ck', '1');
      el.addEventListener('click', function (e) { click(el, e); });
    }
    boot(el);
  };

  function boot(el) {
    current = null;
    el.innerHTML = '<div class="ck-intro">' + introHTML(0.85) + '</div><div class="ck-bar"></div><div class="ck-body"></div>';
    sweatReady().then(null, function () {});      // start fetching the chart script now
    show(el, null);
  }

  // one season on screen; yr null = the one being played
  function show(el, yr) {
    if (active && active.io) active.io.disconnect();
    var body = el.querySelector('.ck-body');
    var v = active = { el: el, body: body, current: yr == null, specs: [], thr: 0.85 };
    body.innerHTML = '<p class="hn-empty">Loading…</p>';
    getJSON('/api/pulse' + (yr == null ? '' : '?season=' + yr)).then(function (d) {
      if (v !== active) return;
      if (!(Number(d.season) > 0)) throw new Error('the pulse named no season');
      if (yr == null) { current = Number(d.season); seasons(el); }
      render(v, d);
    }).then(null, function (err) {
      if (v !== active) return;
      if (window.console) console.error('chokes:', err);
      body.innerHTML = '<div class="hn-card"><p class="hn-empty">The ledger can’t be read right now.' +
        '<button type="button" class="ck-retry" data-retry="' + (yr == null ? 'all' : 'season') + '" data-y="' + (yr || '') + '">Try again</button></p></div>';
    });
  }
  // the season switch, once there's more than one season on the record
  function seasons(el) {
    var bar = el.querySelector('.ck-bar'), ys = [];
    if (!bar) return;
    bar.innerHTML = '';
    if (!(current > START.season)) return;
    for (var y = current; y >= START.season; y--) ys.push(String(y));
    bar.appendChild(HN.seg(ys, String(current), function (y) { y = Number(y); show(el, y === current ? null : y); }));
  }

  function click(el, e) {
    var b = e.target && e.target.closest ? e.target.closest('button') : null, v = active;
    if (!b || !el.contains(b)) return;
    var r = b.getAttribute('data-retry');
    if (r === 'all') { boot(el); return; }
    if (!v) return;
    if (b.classList.contains('ck-tog')) { toggle(v, b); return; }
    if (r === 'season') { show(el, Number(b.getAttribute('data-y')) || null); return; }
    if (r === 'chart') {
      var bx = b.closest('.ck-chart'), sp = bx && v.specs[Number(bx.getAttribute('data-i'))];
      if (sp) drawChart(v, bx, sp, true);
      return;
    }
    if (r === 'hook') { loadHook(v, true); return; }
    if (r === 'blown') { v.blownP = null; loadBlown(v); }
  }
  function toggle(v, b) {
    var i = b.getAttribute('data-i'), bx = v.body.querySelector('.ck-chart[data-i="' + i + '"]'), sp = v.specs[Number(i)];
    if (!bx || !sp) return;
    var open = bx.hidden, l = (b.getAttribute('data-l') || 'Chart|Hide').split('|');
    bx.hidden = !open;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    b.textContent = l[open ? 1 : 0];
    if (open && !sp.drawn) drawChart(v, bx, sp);
  }

  function render(v, d) {
    var thr = v.thr = isNum(d.threshold) && d.threshold > 0 && d.threshold < 1 ? d.threshold : 0.85, T = pc(thr);
    v.yr = Number(d.season);
    var wl = (d.weeks || []).filter(function (w) { return w && isNum(w.week); }).sort(function (a, b) { return a.week - b.week; });
    v.settled = wl.filter(function (w) { return w.settled; }).map(function (w) { return w.week; });
    var pending = wl.filter(function (w) { return !w.settled; });
    // only the season being played has a week on trial; an old week left unjudged just never got a verdict
    var live = v.live = v.current && pending.length ? pending[pending.length - 1].week : null, n = v.settled.length;
    var reads = wl.reduce(function (t, w) { return t + (isNum(w.samples) ? w.samples : 0); }, 0);
    var raw = (d.chokes || []).filter(function (c) { return c && c.who && c.opp && isNum(c.week) && isNum(c.peak); });
    var ib = v.el.querySelector('.ck-intro');
    if (ib) ib.innerHTML = introHTML(thr);

    var h = '<div class="hn-kpis">' +
      kpi('Chokes', '…', 'checking the ledger', 'ck-k-n') +
      kpi('Weeks judged', String(n), n ? (live != null ? 'Week ' + live + ' still being played' : 'since Week ' + v.settled[0]) :
        (live != null ? 'first verdict: Week ' + live : 'none yet')) +
      kpi('Readings', reads.toLocaleString('en-US'), 'every few minutes, kickoff to final') +
      kpi('Biggest lead blown', '…', n ? 'reading the weeks' : 'waiting on a verdict', 'ck-k-b') +
      '</div>';

    h += '<section class="hn-card"><h3 class="hn-h ck-led-h">The Ledger <small>' + v.yr + '</small></h3>' +
      '<div class="ck-led"><p class="ck-wait">Checking the ledger…</p></div>' +
      '<p class="hn-note">' + method(v, d.updated) + '</p></section>';

    if (live != null) {
      h += '<section class="hn-card"><h3 class="hn-h">On the Hook <small>Week ' + live + ' · still being played</small></h3>' +
        '<div class="ck-hook"><p class="ck-wait">Reading Week ' + live + '…</p></div>' +
        '<p class="hn-note">Everyone who has reached ' + T + ' this week with points on the board, closest to blowing it first. ' +
        'Lose from here and it goes in the ledger. “Now” is the latest reading.</p></section>';
    }
    h += '<section class="hn-card ck-blown-card"><h3 class="hn-h">Biggest Leads Blown <small>' + v.yr + ' · top 10</small></h3>' +
      '<div class="ck-blown">' + (n ? '<p class="ck-wait">Reading the judged weeks…</p>' :
        '<p class="hn-empty">Nothing to rank yet. This fills in once a week is judged' + (live != null ? ', starting with Week ' + live : '') + '.</p>') + '</div>' +
      '<p class="hn-note">Every manager who lost a judged week, ranked by their best reading with points on the board — chokes and near-misses alike. ' +
      'Red cleared ' + T + ' and is in the ledger. Grey never got past 50%: never the favorite, so there was no lead to blow.</p></section>';
    v.body.innerHTML = h;

    v.ledgerP = judge(v, raw);
    v.ledgerP.then(function (res) {
      if (v !== active) return;
      v.ledger = res.list;
      drawLedger(v, res);
      kpiChokes(v);
      kpiBlown(v);
    }).then(null, function (err) {
      if (v !== active) return;
      if (window.console) console.error('chokes ledger:', err);
      var host = v.body.querySelector('.ck-led');
      if (host) host.innerHTML = '<p class="hn-empty">The ledger couldn’t be drawn.<button type="button" class="ck-retry" data-retry="season" data-y="' +
        (v.current ? '' : v.yr) + '">Try again</button></p>';
      setKpi(v, 'ck-k-n', '—', 'couldn’t be read');
      setKpi(v, 'ck-k-b', '—', 'couldn’t be read');
    });
    if (live != null) loadHook(v);
    watch(v);
  }

  function drawLedger(v, res) {
    var host = v.body.querySelector('.ck-led'), sm = v.body.querySelector('.ck-led-h small');
    if (!host) return;
    var list = res.list.slice().sort(function (a, b) { return b.week - a.week || b.peak - a.peak; });
    var open = list.length <= 3, draw = [], h;
    if (sm) sm.textContent = v.yr + (list.length > 1 ? ' · newest first' : '');
    if (list.length) {
      h = '<div class="ck-list">' + list.map(function (c) {
        var i = v.specs.push({ week: c.week, who: c.who, opp: c.opp, at: c.at }) - 1;
        if (open) draw.push(i);
        return chokeCard(v, c, i, open);
      }).join('') + '</div>';
    } else h = cleanSheet(v);
    if (res.out.length) {
      h += '<p class="ck-out">Not counted: ' + andList(res.out.map(function (c) { return '<b>' + HN.esc(c.who) + '</b> in Week ' + c.week; })) + '. ' +
        (res.out.length === 1 ? 'He' : 'Each') + ' only reached ' + pc(v.thr) + ' on Yahoo’s pre-game projection, before anyone in ' +
        (res.out.length === 1 ? 'his' : 'the') + ' matchup had scored.</p>';
    }
    var unread = [];
    list.forEach(function (c) { if (c.unchecked && unread.indexOf(c.week) < 0) unread.push(c.week); });
    if (unread.length) {
      h += '<p class="ck-foot">' + weekList(unread.sort(function (a, b) { return a - b; })) + ' couldn’t be read, so ' +
        'an entry that peaked before anyone scored stands unchecked.<button type="button" class="ck-retry" data-retry="season" data-y="' +
        (v.current ? '' : v.yr) + '">Try again</button></p>';
    }
    host.innerHTML = h;
    draw.forEach(function (i) {
      var bx = host.querySelector('.ck-chart[data-i="' + i + '"]');
      if (bx) drawChart(v, bx, v.specs[i]);
    });
  }
  function kpiChokes(v) {
    var n = v.ledger.length, T = pc(v.thr);
    setKpi(v, 'ck-k-n', String(n), n ? 'lost from ' + T + ' or better' : 'the bar is ' + T);
  }
  // the biggest lead blown: with a choke on the books it's the ledger's top entry (nobody below the bar
  // can beat it), so no week needs reading; without one it comes from the rankings, read right away
  function kpiBlown(v) {
    if (!v.ledger) return;
    var top = v.ledger.slice().sort(byPeak)[0];
    if (top) { setKpi(v, 'ck-k-b', pc(top.peak), top.who + ' vs ' + top.opp + ', Week ' + top.week); return; }
    if (!v.settled.length) { setKpi(v, 'ck-k-b', 'None yet', 'no week judged yet'); return; }
    if (!v.blown) { setKpi(v, 'ck-k-b', '…', 'reading the weeks'); loadBlown(v); return; }
    var b = v.blown, t = b.rows[0], part = b.missing.length ? '; ' + weekList(b.missing) + ' unread' : '';
    if (b.missing.length === v.settled.length) setKpi(v, 'ck-k-b', '—', 'the weeks can’t be read right now');
    else if (t && t.peak > 0.5) setKpi(v, 'ck-k-b', pc(t.peak), t.who + ' vs ' + t.opp + ', Week ' + t.week + part);
    else setKpi(v, 'ck-k-b', 'None', 'no loser was ever favored' + part);
  }

  // ---- On the Hook: this week, everyone past the bar ----
  function loadHook(v, fresh) {
    var host = v.body.querySelector('.ck-hook');
    if (!host) return;
    host.innerHTML = '<p class="ck-wait">Reading Week ' + v.live + '…</p>';
    loadWeek(v.yr, v.live, fresh).then(function (wk) {
      if (v === active) hook(v, host, wk);
    }).then(null, function (err) {
      if (v !== active) return;
      if (window.console) console.error('chokes hook:', err);
      host.innerHTML = '<p class="hn-empty">Week ' + v.live + ' can’t be read right now.<button type="button" class="ck-retry" data-retry="hook">Try again</button></p>';
    });
  }
  function hook(v, host, wk) {
    var n = v.live, thr = v.thr, smp = wk.samples || [], opp = oppsOf(wk), stars = false;
    if (!smp.length) { host.innerHTML = '<p class="hn-empty">No readings yet this week.</p>'; return; }
    function latest(name) {           // the latest reading with odds for name, and the latest with both scores
      var wp = null, s = null, o = null;
      for (var j = smp.length - 1; j >= 0 && (wp == null || s == null); j--) {
        var r = smp[j] || [];
        if (wp == null && r[1] && isNum(r[1][name])) wp = r[1][name];
        if (s == null && r[2] && isNum(r[2][name]) && isNum(r[2][opp[name]])) { s = r[2][name]; o = r[2][opp[name]]; }
      }
      return { wp: wp, s: s, o: o };
    }
    var rows = [];
    Object.keys(opp).forEach(function (m) {
      var p = livePeak(wk, m, opp[m]);
      if (!p || !(p.wp >= thr)) return;
      var l = latest(m);
      rows.push({ who: m, opp: opp[m], peak: p.wp, at: p.at, now: l.wp, s: l.s, o: l.o });
    });
    rows.sort(function (a, b) { return (isNum(a.now) ? a.now : 1) - (isNum(b.now) ? b.now : 1) || b.peak - a.peak || (a.who < b.who ? -1 : 1); });
    if (!rows.length) {
      host.innerHTML = '<p class="hn-empty">Nobody has reached ' + pc(thr) + ' yet this week with points on the board. Plenty of time to get there and blow it.</p>';
      return;
    }
    host.innerHTML = rowList([
      { l: 'Manager', w: 'minmax(0,1.6fr)' }, { l: 'Peak', w: '52px', c: 'ck-r' }, { l: 'Peaked', w: 'minmax(0,1.1fr)' },
      { l: 'Now', w: '52px', c: 'ck-r' }, { l: 'Score now', w: 'minmax(0,1fr)' }, { l: '', w: '72px' }
    ], rows.map(function (r) {
      var i = v.specs.push({ week: n, who: r.who, opp: r.opp, at: r.at }) - 1, e = early(v.yr, n, r.at);
      if (e) stars = true;
      return '<div class="ck-row">' +
        cell('ck-who', HN.who(r.who) + ' <em>vs ' + HN.esc(r.opp) + '</em>') +
        cell('ck-pk', pc(r.peak), 'Peak') +
        '<span class="ck-ds">' +
        cell('ck-d', HN.esc(when(r.at, true)) + (e ? '<b class="ck-ast">*</b>' : ''), 'Peaked') +
        cell('ck-pk ck-now' + (isNum(r.now) && r.now < 0.5 ? ' hn-bad' : ''), pc(r.now), 'Now') +
        cell('ck-d', score(r.s, r.o), 'Score') +
        cell('ck-b', tog(i, false, ['Chart', 'Hide'])) +
        '</span>' +
        '</div>' + box(i, false, 'ck-rowchart');
    })) + (stars ? star() : '');
  }

  // ---- Biggest Leads Blown: every loser of every judged week ----
  // The weeks load when the card comes near the screen (or right away when the stat box needs them),
  // three at a time: a full week of readings runs to a few hundred KB.
  function watch(v) {
    if (!v.settled.length) return;
    var sec = v.body.querySelector('.ck-blown-card');
    if (!sec || !window.IntersectionObserver) { loadBlown(v); return; }
    var io = v.io = new IntersectionObserver(function (es) {
      for (var j = 0; j < es.length; j++) {
        if (es[j].isIntersecting) { io.disconnect(); if (v === active) loadBlown(v); return; }
      }
    }, { rootMargin: '400px 0px' });
    io.observe(sec);
  }
  function loadBlown(v) {
    if (v.blownP || !v.settled.length) return;
    var host = v.body.querySelector('.ck-blown');
    if (host) host.innerHTML = '<p class="ck-wait">Reading the judged weeks…</p>';
    v.blownP = Promise.all([v.ledgerP, loadWeeks(v.yr, v.settled)]).then(function (x) {
      if (v !== active) return;
      v.blown = blownRows(v, x[0].list, x[1]);
      drawBlown(v);
      kpiBlown(v);
    }).then(null, function (err) {
      if (v !== active) return;
      if (window.console) console.error('chokes blown:', err);
      v.blownP = null;
      if (host) host.innerHTML = '<p class="hn-empty">The judged weeks couldn’t be read.<button type="button" class="ck-retry" data-retry="blown">Try again</button></p>';
      if (!(v.ledger && v.ledger.length)) setKpi(v, 'ck-k-b', '—', 'couldn’t be read');
    });
  }
  // a week that can't be read still shows its chokes, from the ledger (they carry everything a row needs)
  function blownRows(v, ledger, got) {
    var rows = [], missing = [];
    v.settled.forEach(function (n) {
      var wk = got[n];
      if (!wk) {
        missing.push(n);
        ledger.forEach(function (c) {
          if (c.week === n) rows.push({ week: n, who: c.who, opp: c.opp, peak: c.peak, at: c.at, s: c.score_then, o: c.opp_then, fs: c.final, fo: c.opp_final });
        });
        return;
      }
      var fin = wk.final || {}, opp = oppsOf(wk);
      Object.keys(fin).forEach(function (m) {
        var f = fin[m], o = f && (f.opp || opp[m]);
        if (!f || !o) return;
        // a loss or a tie, judged as the server judges it
        var lost = typeof f.won === 'boolean' ? !f.won : isNum(f.s) && isNum(f.opp_s) && f.s <= f.opp_s;
        var lp = lost ? livePeak(wk, m, o) : null;
        if (lp) rows.push({ week: n, who: m, opp: o, peak: lp.wp, at: lp.at, s: lp.s, o: lp.o, fs: f.s, fo: f.opp_s });
      });
    });
    rows.sort(byPeak);
    return { rows: rows.slice(0, 10), missing: missing };
  }
  function drawBlown(v) {
    var host = v.body.querySelector('.ck-blown');
    if (!host) return;
    var b = v.blown, rows = b.rows, thr = v.thr, stars = false;
    var foot = b.missing.length ? '<p class="ck-foot">' + weekList(b.missing) + ' couldn’t be read, so only ' + (b.missing.length === 1 ? 'its' : 'their') +
      ' chokes are here.<button type="button" class="ck-retry" data-retry="blown">Try again</button></p>' : '';
    if (!rows.length) {
      host.innerHTML = '<p class="hn-empty">' + (b.missing.length === v.settled.length ? 'The judged weeks can’t be read right now.' :
        'No loser has a reading on the record.') + '</p>' + foot;
      return;
    }
    var lead = rows[0].peak > 0.5 ? '' : '<p class="ck-lead">No loser has been the favorite yet with points on the board. Here’s how close each one got.</p>';
    host.innerHTML = lead + rowList([
      { l: '', w: '22px' }, { l: 'Manager', w: 'minmax(0,1.5fr)' }, { l: 'Wk', w: '30px', c: 'ck-r' }, { l: 'Peak', w: '52px', c: 'ck-r' },
      { l: 'Peaked', w: 'minmax(0,1.1fr)' }, { l: 'Score then', w: 'minmax(0,1fr)' }, { l: 'Final', w: 'minmax(0,1.15fr)' }, { l: '', w: '72px' }
    ], rows.map(function (r, j) {
      var i = v.specs.push({ week: r.week, who: r.who, opp: r.opp, at: r.at }) - 1, e = early(v.yr, r.week, r.at);
      if (e) stars = true;
      var tone = r.peak >= thr ? ' hn-bad' : r.peak <= 0.5 ? ' hn-mute' : '';
      var tie = isNum(r.fs) && r.fs === r.fo ? '<i class="ck-tie">tie</i>' : '';
      return '<div class="ck-row">' +
        cell('ck-rk', String(j + 1)) +
        cell('ck-who', HN.who(r.who) + ' <em>vs ' + HN.esc(r.opp) + '</em>') +
        cell('ck-wk ck-r', String(r.week)) +
        cell('ck-pk' + tone, pc(r.peak), 'Peak') +
        '<span class="ck-ds">' +
        cell('ck-d ck-wkd', String(r.week), 'Wk') +
        cell('ck-d', HN.esc(when(r.at, true)) + (e ? '<b class="ck-ast">*</b>' : ''), 'Peaked') +
        cell('ck-d', score(r.s, r.o), 'Then') +
        cell('ck-d', '<span class="hn-bad">' + score(r.fs, r.fo) + '</span>' + tie, 'Final') +
        cell('ck-b', tog(i, false, ['Chart', 'Hide'])) +
        '</span>' +
        '</div>' + box(i, false, 'ck-rowchart');
    }), true) + (stars ? star() : '') + foot;
  }
})(window.HN);
