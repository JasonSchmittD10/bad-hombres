// Hard Numbers — Draft Vault: every pick since 2021, graded in hindsight.
// Data: /data/numbers/draft.json (scripts/hn/draft.py).
(function (HN) {
  var CSS = [
    '#hn-draft .dv-bar{display:flex;justify-content:center;margin:0 0 18px}',
    '@media(max-width:420px){#hn-draft .dv-bar .hn-seg button{padding:6px 7px;letter-spacing:.02em}}',
    '@media(max-width:340px){#hn-draft .dv-bar .hn-seg button{padding:6px 5px;letter-spacing:0}}',
    '#hn-draft .dv-so{display:block;text-align:center;color:var(--gold);font-size:12.5px;font-weight:700;margin:-6px 0 16px}',
    '#hn-draft .dv-kpi b{font-size:17px;line-height:1.25;overflow-wrap:anywhere}',
    '#hn-draft .dv-kpi b .hn-face{width:22px;height:22px;margin-right:6px}',
    '#hn-draft .dv-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 16px}',
    '@media(max-width:1000px){#hn-draft .dv-two{grid-template-columns:minmax(0,1fr)}}',
    '#hn-draft .dv-g{display:inline-block;min-width:36px;text-align:center;padding:3px 7px;border-radius:7px;',
    ' font:900 13px "Arial Black",Impact,sans-serif;letter-spacing:.02em}',
    '#hn-draft .dv-gA{background:rgba(63,178,107,.22);color:#6fe09a}',
    '#hn-draft .dv-gB{background:rgba(63,178,107,.09);color:#bfe8cd}',
    '#hn-draft .dv-gC{background:#26262d;color:var(--silver)}',
    '#hn-draft .dv-gD{background:rgba(255,107,118,.1);color:#ffb3b9}',
    '#hn-draft .dv-gF{background:rgba(255,107,118,.24);color:#ff8a93}',
    '#hn-draft .dv-yrs .dv-g{min-width:30px;font-size:11.5px;padding:2px 5px}',
    '#hn-draft .hn-table small{display:block;color:var(--muted);font-size:11px;line-height:1.3;margin-top:1px}',
    '#hn-draft .hn-table td{vertical-align:middle}',
    '#hn-draft .dv-msub{display:none}',
    '#hn-draft .dv-msub .hn-face{width:15px;height:15px;margin:-2px 4px 0 0}',
    '@media(max-width:520px){#hn-draft .dv-mcol{display:none}#hn-draft .dv-msub{display:inline}',
    ' #hn-draft .hn-table th,#hn-draft .hn-table td{padding-left:7px;padding-right:7px}}',
    '@media(max-width:520px){#hn-draft .hn-kpis{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}',
    ' #hn-draft .dv-kpi b{font-size:15px}#hn-draft .dv-kpi{padding:11px 12px}}',
    '#hn-draft .dv-pl{color:#fff;font-weight:700}',
    '#hn-draft .dv-board{border-collapse:separate;border-spacing:3px;table-layout:fixed;width:100%;min-width:920px}',
    '@media(max-width:900px){#hn-draft .dv-board{min-width:1040px}}',
    '#hn-draft .dv-board th{font:800 10.5px "Segoe UI",sans-serif;letter-spacing:.04em;color:var(--silver);padding:2px 2px 6px;',
    ' text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}',
    '#hn-draft .dv-board th .hn-face{display:block;margin:0 auto 4px;width:26px;height:26px}',
    '#hn-draft .dv-board th.dv-rd{width:34px}',
    '#hn-draft .dv-board td{padding:5px 6px 4px;border-radius:6px;background:var(--panel-2);overflow:hidden;cursor:default}',
    '#hn-draft .dv-board td[data-n]{cursor:pointer}',
    '#hn-draft .dv-board td.dv-on{box-shadow:inset 0 0 0 2px var(--gold)}',
    '#hn-draft .dv-board td b{display:block;font-size:11.5px;line-height:1.3;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#hn-draft .dv-board td i{display:flex;justify-content:space-between;gap:4px;font-style:normal;font-size:10.5px;line-height:1.35;',
    ' color:rgba(255,255,255,.72);font-variant-numeric:tabular-nums;white-space:nowrap}',
    '#hn-draft .dv-board td.dv-rd{background:none;color:var(--muted);font:800 10.5px "Segoe UI",sans-serif;text-align:center;',
    ' vertical-align:middle;padding:0}',
    '#hn-draft .dv-legend{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);margin:0 0 8px}',
    '#hn-draft .dv-legend span{display:inline-block;width:46px;height:10px;border-radius:3px}',
    '#hn-draft .dv-pick{color:var(--silver);margin:0 0 10px;min-height:1.55em}',
    '#hn-draft .dv-pick .hn-face{width:16px;height:16px;margin:-2px 5px 0 0}',
    '#hn-draft .dv-note b{color:var(--silver);font-weight:700}'
  ].join('\n');

  function css() {
    if (document.getElementById('dv-css')) return;
    var st = document.createElement('style'); st.id = 'dv-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  var e = HN.esc;
  var MUTE = '<span class="hn-mute">—</span>';
  function f1(v) { return HN.num(v, 1).replace('-', '−'); }
  function val(v) {
    if (v == null || isNaN(v)) return MUTE;
    return '<span class="' + (v > 0 ? 'hn-good' : v < 0 ? 'hn-bad' : 'hn-mute') + '">' + HN.signed(v, 1) + '</span>';
  }
  function who(m) { return m ? HN.who(m) : MUTE; }
  function face(m) { return m ? HN.face(m) : ''; }
  function slot(n) { var p = (n - 1) % 12 + 1; return (p < 10 ? '0' : '') + p; }
  function rp(p) { return (p.r || '?') + '.' + (p.n ? slot(p.n) : '??'); }       // 3.05 = round 3, 5th pick
  function fin(p) { return e(p.pos || '') + (p.pr ? p.pr : ''); }                 // WR1
  function grade(g) { return g ? '<span class="dv-g dv-g' + e(g.charAt(0)) + '">' + e(g) + '</span>' : MUTE; }
  function ordinal(n) {
    var t = n % 100, u = n % 10;
    return n + (t > 10 && t < 14 ? 'th' : u === 1 ? 'st' : u === 2 ? 'nd' : u === 3 ? 'rd' : 'th');
  }
  function words(name) {
    return String(name || '').split(/\s+/).filter(function (w) { return w && !/^(jr\.?|sr\.?|ii|iii|iv|v)$/i.test(w); });
  }
  function last(name) { var t = words(name); return t.length < 2 ? t.join(' ') : t.slice(1).join(' '); }
  function tint(v, scale) {
    if (v == null || isNaN(v) || !scale) return '';
    var a = Math.min(1, Math.abs(v) / scale);
    a = (0.08 + 0.6 * Math.pow(a, 0.75)).toFixed(3);
    return v >= 0 ? 'rgba(46,160,90,' + a + ')' : 'rgba(205,45,60,' + a + ')';
  }

  HN.tabs.draft = function (el) {
    css();
    HN.data('draft').then(function (d) {
      if (!d || !d.seasons || !d.seasons.length) return HN.fail(el, 'No drafts in the archive yet.');
      try { render(el, d); } catch (err) {
        if (window.console) console.error('draft tab', err);
        HN.fail(el, 'The Draft Vault didn’t render.');
      }
    }, function () { HN.fail(el); });
  };

  function render(el, d) {
    var seasons = d.seasons, on = null, i;
    for (i = 0; i < seasons.length; i++) if (seasons[i].done || seasons[i].weeks >= 4) { on = seasons[i]; break; }
    if (!on) on = seasons[0];
    el.innerHTML =
      '<p class="hn-intro">Every pick since ' + e(seasons[seasons.length - 1].year) + ', re-graded with the one thing nobody had on draft night: the answers. The busts get a permanent record.</p>' +
      '<div class="dv-bar"></div><div class="dv-season"></div><div class="dv-all"></div>';
    var bar = el.querySelector('.dv-bar'), box = el.querySelector('.dv-season');
    bar.appendChild(HN.seg(seasons.map(function (s) { return { v: s.year, l: s.done ? String(s.year) : s.year + ' so far' }; }), on.year, function (y) {
      for (var j = 0; j < seasons.length; j++) if (String(seasons[j].year) === String(y)) season(box, seasons[j], d);
    }));
    season(box, on, d);
    alltime(el.querySelector('.dv-all'), d);
  }

  function soFar(s) {
    if (!s.weeks) return e(s.year) + ': no week is final yet. Until one is, every draft is an A in its owner’s head.';
    var h = e(s.year) + ' so far: ' + s.weeks + ' week' + (s.weeks === 1 ? '' : 's') + ' in. ';
    if (s.weeks < 6) return h + 'Grades this early are mostly noise with a letter on it.';
    if (s.weeks < 12) return h + 'The letters are starting to mean something.';
    return h + 'Late enough that most of these letters are going to stick.';
  }

  function season(box, s, d) {
    var byN = {}, i, picks = s.picks || [];
    for (i = 0; i < picks.length; i++) byN[picks[i].n] = picks[i];
    var h = '', live = !s.done;
    if (live) h += '<span class="dv-so">' + soFar(s) + '</span>';
    if (!picks.length) { box.innerHTML = h + '<div class="hn-card"><p class="hn-empty">No draft on file for ' + e(s.year) + '.</p></div>'; return; }

    var g = s.grades || [];
    if (g.length) {
      var top = g[0], bot = g[g.length - 1], st = byN[(s.steals || [])[0]], bu = byN[(s.busts || [])[0]];
      h += '<div class="hn-kpis">' +
        kpi('Best draft', who(top.m), grade(top.g) + ' · ' + HN.signed(top.v, 1) + ' value') +
        kpi('Worst draft', who(bot.m), grade(bot.g) + ' · ' + HN.signed(bot.v, 1) + ' value') +
        (st ? kpi('Biggest steal', e(st.p), e(st.m || '—') + ' at ' + rp(st) + ' · ' + HN.signed(st.v, 1)) : '') +
        (bu ? kpi('Biggest bust', e(bu.p), e(bu.m || '—') + ' at ' + rp(bu) + ' · ' + HN.signed(bu.v, 1)) : '') +
        '</div>';

      h += '<div class="hn-card"><h3 class="hn-h">Report cards <small>' + e(s.year) + (live ? ' so far' : '') + '</small></h3>' +
        '<div class="hn-scroll"><table class="hn-table"><thead><tr><th>Manager</th><th>Grade</th><th class="n">Value</th>' +
        '<th>Best pick</th><th>Worst pick</th></tr></thead><tbody>';
      g.forEach(function (r) {
        h += '<tr><td class="who">' + who(r.m) + '</td><td>' + grade(r.g) + '</td><td class="n">' + val(r.v) + '</td>' +
          '<td>' + pickCell(byN[r.best]) + '</td><td>' + pickCell(byN[r.worst]) + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
    }

    h += board(s, byN);

    if (g.length) {
      h += '<div class="dv-two">' + list('Steals', s.steals, byN, 'Beat the slot by the most', 'Nothing beat its slot yet.') +
        list('Busts', s.busts, byN, 'Short of the slot by the most', 'Nothing has missed its slot yet.') + '</div>';
    }
    h += seasonNote(s, d);
    box.innerHTML = h;
    inspect(box, s, byN);
  }

  function kpi(label, big, sub) {
    return '<div class="hn-kpi dv-kpi"><span>' + e(label) + '</span><b>' + big + '</b><em>' + sub + '</em></div>';
  }

  function pickCell(p) {
    if (!p) return MUTE;
    return '<span class="dv-pl">' + e(p.p || '—') + '</span> ' + val(p.v) + '<small>' + rp(p) + ' · ' + fin(p) + '</small>';
  }

  // player, then "2021 · 3.05 · WR1"; on phones the manager column folds into that line
  function plCell(p, year) {
    return '<span class="dv-pl">' + e(p.p || '—') + '</span><small>' +
      (p.m ? '<span class="dv-msub">' + face(p.m) + e(p.m) + ' · </span>' : '') +
      (year ? e(p.y) + ' · ' : '') + rp(p) + ' · ' + fin(p) + '</small>';
  }

  function board(s, byN) {
    var picks = s.picks, i;
    var vals = picks.map(function (p) { return Math.abs(p.v || 0); }).sort(function (a, b) { return a - b; });
    var scale = vals.length ? vals[Math.floor(vals.length * 0.95)] || vals[vals.length - 1] : 0;
    var rounds = 0, seen = {};
    for (i = 0; i < picks.length; i++) {
      rounds = Math.max(rounds, picks[i].r || 0);
      var ln = last(picks[i].p).toLowerCase(), ini = (words(picks[i].p)[0] || '').charAt(0).toLowerCase();
      seen[ln] = seen[ln] || {}; seen[ln][ini] = (seen[ln][ini] || 0) + 1;
    }
    // last names only; a last name two picks share gets the first initial back, when the initial tells them apart
    function label(p) {
      var l = last(p.p), t = words(p.p), k = seen[l.toLowerCase()] || {}, ini = (t[0] || '').charAt(0), n = 0;
      for (var x in k) if (k.hasOwnProperty(x)) n++;
      return n > 1 && t.length > 1 && k[ini.toLowerCase()] === 1 ? ini + '. ' + l : l;
    }
    var h = '<div class="hn-card"><h3 class="hn-h">The board <small>' + e(s.year) + ' · ' + rounds + ' rounds, snake</small></h3>' +
      (scale ? '<div class="dv-legend">Each square: the pick, his finish at his position and his points' + (s.done ? '' : ' so far') + '. ' +
      '<span style="background:linear-gradient(90deg,' + tint(-scale, scale) + ',' + tint(-0.001, scale) + ')"></span>short of the slot ' +
      '<span style="background:linear-gradient(90deg,' + tint(0.001, scale) + ',' + tint(scale, scale) + ')"></span>beat the slot</div>'
        : '<div class="dv-legend">Just the picks for now. The colors and points arrive when Week 1 goes final.</div>') +
      '<p class="hn-note dv-pick">Tap a square for the whole pick.</p>' +
      '<div class="hn-scroll"><table class="dv-board"><thead><tr><th class="dv-rd"></th>';
    var cols = s.slots && s.slots.length === 12 ? s.slots : null;
    for (i = 0; i < 12; i++) h += '<th>' + (cols && cols[i] ? face(cols[i]) + e(cols[i]) : 'Slot ' + (i + 1)) + '</th>';
    h += '</tr></thead><tbody>';
    for (var r = 1; r <= rounds; r++) {
      h += '<tr><td class="dv-rd">R' + r + '<br>' + (r % 2 ? '→' : '←') + '</td>';
      for (var c = 1; c <= 12; c++) {
        var n = (r - 1) * 12 + (r % 2 ? c : 13 - c), p = byN[n];
        if (!p) { h += '<td></td>'; continue; }
        var bg = tint(p.v, scale);
        h += '<td data-n="' + p.n + '" title="' + e(tipText(p, s)) + '"' + (bg ? ' style="background:' + bg + '"' : '') + '><b>' + e(label(p)) + '</b>' +
          '<i><span>' + fin(p) + '</span><span>' + (p.pts != null ? f1(p.pts) : '—') + '</span></i></td>';
      }
      h += '</tr>';
    }
    return h + '</tbody></table></div></div>';
  }

  function tipText(p, s) {
    return rp(p) + ' (#' + (p.n || '?') + ') ' + (p.m || '—') + ': ' + (p.p || '—') + ', ' + (p.pos || '') + (p.pr || '') +
      (p.pts != null ? ', ' + f1(p.pts) + ' pts' + (s.done ? '' : ' so far') : '') + (p.v != null ? ', value ' + HN.signed(p.v, 1) : '');
  }

  // tap (or click) a square: the whole pick goes in the line under the legend
  function inspect(box, s, byN) {
    var tb = box.querySelector('.dv-board'), cap = box.querySelector('.dv-pick'), was = null;
    if (!tb || !cap) return;
    tb.addEventListener('click', function (ev) {
      var td = ev.target.closest ? ev.target.closest('td[data-n]') : null, p = td && byN[td.getAttribute('data-n')];
      if (!p) return;
      if (was) was.className = was.className.replace(/\s*dv-on/, '');
      td.className += ' dv-on'; was = td;
      cap.innerHTML = '<b class="dv-pl">' + rp(p) + '</b> (pick ' + (p.n || '?') + ') · ' + who(p.m) + ': <span class="dv-pl">' + e(p.p || '—') + '</span>, ' +
        fin(p) + (p.pts != null ? ' · ' + f1(p.pts) + ' pts' + (s.done ? '' : ' so far') : '') +
        (p.v != null ? ' · value ' + val(p.v) : '');
    });
  }

  function list(title, ns, byN, sub, none) {
    var h = '<div class="hn-card"><h3 class="hn-h">' + e(title) + ' <small>' + e(sub) + '</small></h3>';
    var rows = (ns || []).map(function (n) { return byN[n]; }).filter(Boolean);
    if (!rows.length) return h + '<p class="hn-empty">' + e(none) + '</p></div>';
    h += '<div class="hn-scroll"><table class="hn-table"><thead><tr><th class="dv-mcol">Manager</th><th>Player</th>' +
      '<th class="n">Pts</th><th class="n">Value</th></tr></thead><tbody>';
    rows.forEach(function (p) {
      h += '<tr><td class="who dv-mcol">' + who(p.m) + '</td><td>' + plCell(p) + '</td>' +
        '<td class="n">' + f1(p.pts) + '</td><td class="n">' + val(p.v) + '</td></tr>';
    });
    return h + '</tbody></table></div></div>';
  }

  function seasonNote(s, d) {
    var r = s.repl || {}, parts = [];
    ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(function (p) {
      if (r[p] && r[p].pts != null) parts.push(p + r[p].rank + ' ' + f1(r[p].pts));
    });
    var h = '<p class="hn-note dv-note">';
    if (parts.length) h += '<b>' + e(s.year) + ' replacement level' + (s.done ? '' : ' so far') + ':</b> ' + e(parts.join(' · ')) + '. ';
    if (!s.done && s.weeks) {
      h += '<b>So far:</b> points are through Week ' + e(s.weeks) + '.';
      if (s.scale != null) {
        h += ' Each pick’s expectation is the full-season curve scaled to ' + HN.pct(s.scale, 0) +
          ', the share of it this whole draft has actually returned, so value is measured against the rest of the league.';
      }
      var n = (s.grades || []).length;
      if (s.black != null && n) {
        h += ' Scaled by the calendar instead (' + e(s.weeks) + ' of ' + e(s.end) + ' weeks), ' +
          (s.black === n ? 'all ' + n + ' managers' : s.black === 0 ? 'none of the ' + n + ' managers' : s.black + ' of ' + n + ' managers') +
          ' would be in the black' + (s.black >= n - 1 ? ', which is why it isn’t.' : '.');
      }
    }
    return h + '</p>';
  }

  function alltime(box, d) {
    var a = d.alltime, fin0 = d.finished && d.finished.length ? d.finished : null;
    if (!a || !fin0) { box.innerHTML = ''; return; }
    var span = fin0[0] === fin0[1] ? String(fin0[0]) : fin0[0] + '–' + fin0[1];
    var h = '<h3 class="hn-h" style="margin:26px 0 14px">All-time <small>' + e(span) + ', finished seasons only</small></h3>';
    h += '<div class="dv-two">' + ever('Best picks ever', a.best) + ever('Worst picks ever', a.worst) + '</div>';

    var years = [];
    for (var y = fin0[0]; y <= fin0[1]; y++) years.push(String(y));
    h += '<div class="hn-card"><h3 class="hn-h">Career draft grades <small>average z-score, same ladder</small></h3>';
    if (!a.managers || !a.managers.length) h += '<p class="hn-empty">No finished seasons to grade yet.</p>';
    else {
      h += '<div class="hn-scroll"><table class="hn-table"><thead><tr><th>Manager</th><th>Career</th>' +
        years.map(function (y) { return '<th>' + e(y) + '</th>'; }).join('') + '<th class="n">Total value</th></tr></thead><tbody>';
      a.managers.forEach(function (m) {
        h += '<tr><td class="who">' + who(m.m) + '</td><td>' + grade(m.g) + '</td>' +
          years.map(function (y) { return '<td class="dv-yrs">' + grade((m.years || {})[y]) + '</td>'; }).join('') +
          '<td class="n">' + val(m.v) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    h += method(d, span);
    box.innerHTML = h;
  }

  function method(d, span) {
    var fs = null, cur = null, i;
    for (i = 0; i < d.seasons.length; i++) {
      if (d.seasons[i].done && !fs) fs = d.seasons[i];
      if (!d.seasons[i].done && !cur) cur = d.seasons[i];
    }
    var r = (fs && fs.repl) || {}, ranks = [];
    ['QB', 'RB', 'WR', 'TE', 'K', 'DEF'].forEach(function (p) { if (r[p]) ranks.push(p + r[p].rank); });
    var q = d.qbrb;
    return '<p class="hn-note dv-note"><b>How it’s graded.</b> ' +
      '<b>Pts</b> are a player’s league-scored points over the league’s own season' + (fs ? ', weeks 1–' + e(fs.weeks) : '') +
      ', added up from Yahoo’s weekly totals. Not Yahoo’s season totals: those count NFL week 18, which this league doesn’t play, and in some years leave out part of the scoring. ' +
      '<b>Finish</b> (WR1, RB12) is his rank by those points at his position among every NFL player who scored that season; a player eligible at two positions counts at both. ' +
      'Raw points would make every late quarterback a steal' +
      (q && q.above != null && q.rank ? ' (in ' + e(q.y) + ' the ' + ordinal(q.rank) + '-best QB outscored ' +
        (q.above ? 'all but ' + e(q.above) + ' running back' + (q.above === 1 ? '' : 's') : 'every running back') + ')' : '') +
      ', so picks are judged on <b>points over replacement</b>: points minus the first player past the league’s starting lineups at that position, never below zero. ' +
      'That replacement player is one per team for each starting slot at the position, plus its share of the flex (' + flexText(d.flex) + ' of flex starts in ' + e(span) + ' regular seasons), plus one' +
      (ranks.length ? ': ' + e(ranks.join(', ')) : '') + '. ' +
      '<b>Expected</b> for a pick is the average points over replacement of every pick within ' + e(d.window) + ' spots of it, ' + e(span) + ' pooled. ' +
      '<b>Value</b> is points over replacement minus expected. ' +
      '<b>Grade</b> is a z-score: a manager’s total value against all twelve totals that season; within an eighth of a standard deviation of average is a C+, and every further quarter of a standard deviation moves one step, up to A+ or down to F. ' +
      '<b>Career</b> puts each manager’s average z-score across finished seasons on the same ladder.' +
      (cur ? ' ' + e(cur.year) + ' joins the all-time section when it’s over.' : '') + '</p>';
  }

  function flexText(fl) {
    var out = [];
    for (var k in fl) if (fl.hasOwnProperty(k) && fl[k] >= 0.005) out.push(k + ' ' + HN.pct(fl[k], 0));
    return e(out.join(', '));
  }

  function ever(title, rows) {
    var h = '<div class="hn-card"><h3 class="hn-h">' + e(title) + '</h3>';
    if (!rows || !rows.length) return h + '<p class="hn-empty">Nothing finished to rank yet.</p></div>';
    h += '<div class="hn-scroll"><table class="hn-table"><thead><tr><th class="dv-mcol">Manager</th><th>Player</th>' +
      '<th class="n">Pts</th><th class="n">Value</th></tr></thead><tbody>';
    rows.forEach(function (p) {
      h += '<tr><td class="who dv-mcol">' + who(p.m) + '</td><td>' + plCell(p, true) + '</td>' +
        '<td class="n">' + f1(p.pts) + '</td><td class="n">' + val(p.v) + '</td></tr>';
    });
    return h + '</tbody></table></div></div>';
  }
})(window.HN);
