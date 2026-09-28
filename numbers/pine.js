// Hard Numbers — The Pine: points left on the bench. Renders /data/numbers/pine.json
// (built by scripts/hn/pine.py): a season picker, the season's KPIs, the manager table,
// the season's lineup losses, then the all-time table, the ten worst weeks and the
// playoff games lost from the bench.
(function (HN) {
  var CSS = [
    '#hn-pine .pine-bar{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;margin:0 0 14px}',
    '#hn-pine .pine-cap{color:var(--muted);font-size:12.5px}',
    '#hn-pine .pine-cap b{color:var(--silver);font-weight:700}',
    '#hn-pine .hn-kpi em .hn-face{width:20px;height:20px;margin-right:5px}',
    '#hn-pine .hn-kpi em{line-height:1.7}',
    '#hn-pine .pine-nm{font-style:normal;white-space:nowrap}',
    '#hn-pine .hn-kpi em .pine-nm{color:#fff;font-weight:700}',
    '#hn-pine .hn-table th{white-space:normal;vertical-align:bottom;line-height:1.35}',
    '#hn-pine td.pine-fix{white-space:normal;min-width:230px;max-width:400px;line-height:1.45}',
    '#hn-pine td.pine-fix b{color:#fff;font-weight:700}',
    '#hn-pine td.pine-rk{color:var(--muted);width:1%}',
    '#hn-pine td.pine-wrap{white-space:normal;min-width:150px;line-height:1.45}',
    '#hn-pine .pine-nw{white-space:nowrap}',
    '#hn-pine td.pine-rd{line-height:1.3}',
    '#hn-pine td.pine-rd small{display:block;color:var(--muted);font-size:11.5px}',
    '#hn-pine .pine-tag{display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:800;',
    ' letter-spacing:.08em;text-transform:uppercase;background:rgba(193,18,31,.18);color:#ff8a93;vertical-align:1px}',
    '#hn-pine .pine-sec{font-family:"Arial Black",Impact,sans-serif;text-transform:uppercase;color:var(--muted);font-size:12px;',
    ' letter-spacing:.14em;margin:30px 0 12px;text-align:center}',
    // dead men: the count is a button that opens a row of names under the manager
    '#hn-pine button.pine-dead{background:transparent;border:0;border-radius:3px;color:inherit;font:inherit;font-variant-numeric:tabular-nums;',
    ' padding:0 3px;margin:0 -3px 0 0;cursor:pointer;line-height:inherit;text-decoration:underline dashed;text-underline-offset:3px;',
    ' text-decoration-color:var(--muted)}',
    '#hn-pine button.pine-dead:hover,#hn-pine button.pine-dead.on{color:#fff;text-decoration-color:#fff}',
    '#hn-pine button.pine-dead:focus-visible{outline:2px solid var(--red);outline-offset:2px}',
    '#hn-pine tr.pine-deadrow td{white-space:normal;background:var(--panel-2);padding:8px 10px 10px}',
    '#hn-pine .pine-deadin{position:sticky;left:10px;width:0;min-width:100%;font-size:12.5px;line-height:1.6;color:var(--silver)}',
    '#hn-pine .pine-deadin b{color:#fff;font-weight:700}',
    // lineup losses: a table on wide screens, a stacked list on phones so the fix is readable
    '#hn-pine .pine-lllist{display:none}',
    '@media(max-width:640px){#hn-pine .pine-lltab{display:none}#hn-pine .pine-lllist{display:block}}',
    '#hn-pine .pine-li{padding:11px 0;border-bottom:1px solid var(--line)}',
    '#hn-pine .pine-li:first-child{padding-top:2px}',
    '#hn-pine .pine-li:last-child{border-bottom:0}',
    '#hn-pine .pine-li-h{font-size:13.5px;line-height:1.8;color:var(--silver)}',
    '#hn-pine .pine-li-h .pine-nm{color:#fff;font-weight:700}',
    '#hn-pine .pine-li-h .hn-face{width:20px;height:20px;margin-right:5px}',
    '#hn-pine .pine-li-k{color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;margin-right:8px}',
    '#hn-pine .pine-li-b{font-size:12.5px;line-height:1.55;color:var(--silver);margin-top:2px}',
    '#hn-pine .pine-li-b b{color:#fff;font-weight:700}'
  ].join('\n');

  function css() {
    if (document.getElementById('hn-pine-css')) return;
    var s = document.createElement('style'); s.id = 'hn-pine-css'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var esc = HN.esc;
  function attr(t) { return esc(t).replace(/"/g, '&quot;'); }
  // points and totals: two decimals, thousands separated (1,239.35)
  function score(v) {
    return v == null || isNaN(v) ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // coaching %: the builder rounds it once, exactly, to a tenth of a percent
  function coach(v) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(1) + '%'; }
  // player points: up to two decimals, no trailing zeros, a real minus sign (11.9, 22.66, 0, −0.1)
  function ppts(v) {
    var s = HN.num(v, 2); if (s === '—') return s;
    s = s.indexOf('.') < 0 ? s : s.replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s.replace('-', '−');
  }
  function who(n) { return '<i class="pine-nm">' + HN.who(n || '?') + '</i>'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

  // "QB, 2 WR, 2 RB, TE, W/R/T, K, DEF" from the season's lineup slots
  function lineupText(slots) {
    if (!slots || !slots.length) return 'the league’s starting lineup';
    var order = [], n = {};
    slots.forEach(function (s) { if (!n[s]) { n[s] = 0; order.push(s); } n[s]++; });
    return order.map(function (s) { return (n[s] > 1 ? n[s] + ' ' : '') + s; }).join(', ');
  }

  // everyone tied at the extreme of key (dir 1 = highest, -1 = lowest)
  function leaders(rows, key, dir) {
    var best = null, out = [];
    rows.forEach(function (r) {
      var v = r[key]; if (v == null || isNaN(v)) return;
      if (best == null || (v - best) * dir > 1e-9) { best = v; out = [r]; }
      else if (Math.abs(v - best) <= 1e-9) out.push(r);
    });
    return { v: best, rows: out };
  }
  function names(rows) {
    if (!rows.length) return 'Nobody';
    if (rows.length > 3) return rows.length + ' tied: ' + rows.map(function (r) { return esc(r.who); }).join(', ');
    return rows.map(function (r) { return who(r.who); }).join(' ');
  }
  function kpi(label, value, sub) {
    return '<div class="hn-kpi"><span>' + esc(label) + '</span><b>' + value + '</b><em>' + sub + '</em></div>';
  }

  // the bench moves that would have won a lineup loss
  function fix(ll) {
    var ins = ll.ins || [], outs = ll.outs || [];
    function list(a, bold) {
      var p = a.map(function (x) { return (bold ? '<b>' + esc(x.name) + '</b>' : esc(x.name)) + ' ' + ppts(x.pts); });
      return p.length < 2 ? p.join('') : p.slice(0, -1).join(', ') + ' and ' + p[p.length - 1];
    }
    if (!ll.moves || !ins.length) return '';
    var win = ll.moves_score != null && ll.opp_score != null ? ll.moves_score - ll.opp_score : null;
    var tail = win != null ? ' <span class="hn-mute">(wins by ' + score(win) + ')</span>' : '';
    if (ll.moves === 1) {
      return list(ins, true) + (outs.length ? ' in for ' + list(outs) : ' in an empty slot') + tail;
    }
    return 'Needed ' + (WORDS[ll.moves] || ll.moves) + ' moves: ' + list(ins, true) + ' in' +
      (outs.length ? '; ' + list(outs) + ' out' : '') + tail;
  }

  // lineup losses as a table (wide screens) plus the same games as a stacked list (phones)
  function lossBlock(list, lead) {
    var t = '<div class="pine-lltab"><div class="hn-scroll"><table class="hn-table"><thead><tr>' + lead.head +
      '<th>Manager</th><th class="n">Lost</th><th>To</th><th class="n">Optimal</th><th>The fix</th></tr></thead><tbody>';
    var l = '<div class="pine-lllist">';
    list.forEach(function (ll) {
      var f = fix(ll), lost = score(ll.score) + '–' + score(ll.opp_score);
      t += '<tr>' + lead.cells(ll) +
        '<td class="who">' + who(ll.who) + '</td>' +
        '<td class="n hn-bad">' + lost + '</td>' +
        '<td>' + who(ll.opp) + '</td>' +
        '<td class="n hn-good">' + score(ll.optimal) + '</td>' +
        '<td class="pine-fix">' + (f || '<span class="hn-mute">—</span>') + '</td></tr>';
      l += '<div class="pine-li"><div class="pine-li-h"><span class="pine-li-k">' + lead.label(ll) + '</span>' +
        who(ll.who) + ' lost <span class="hn-bad pine-nw">' + lost + '</span> to ' + who(ll.opp) + '</div>' +
        '<div class="pine-li-b">Optimal <b class="hn-good">' + score(ll.optimal) + '</b>' + (f ? ' · ' + f : '') + '</div></div>';
    });
    return t + '</tbody></table></div></div>' + l + '</div>';
  }

  // one manager's dead men, for the row that opens under that manager
  function deadText(r) {
    return (r.dead_list || []).map(function (d) {
      var what = d.empty ? 'empty ' + esc(d.pos || 'starting') + ' slot' :
        '<b>' + esc(d.name || 'Unknown') + '</b>' + (d.pos ? ' (' + esc(d.pos) + ')' : '') + ' ' + ppts(d.pts);
      return '<span class="pine-nw">Wk ' + esc(d.week) + ':</span> ' + what;
    }).join(' · ');
  }
  function deadCell(r, i) {
    if (r.dead == null) return '—';
    if (!r.dead || !r.dead_list || !r.dead_list.length) return String(r.dead);
    return '<button type="button" class="pine-dead" aria-expanded="false" data-i="' + i + '" aria-label="' +
      attr(r.who + ': ' + plural(r.dead, 'dead man', 'dead men') + '. Show names') + '">' + r.dead + '</button>';
  }
  // tap a dead-men count: open (or close) a row listing them under that manager
  function wireDead(scroller, rows) {
    scroller.addEventListener('click', function (e) {
      var b = e.target;
      if (!b || !b.classList || !b.classList.contains('pine-dead')) return;
      var tr = b.parentNode.parentNode, next = tr.nextElementSibling;
      if (next && next.classList.contains('pine-deadrow')) {
        next.parentNode.removeChild(next);
        b.classList.remove('on'); b.setAttribute('aria-expanded', 'false');
        return;
      }
      var r = rows[+b.getAttribute('data-i')]; if (!r) return;
      var row = document.createElement('tr'), td = document.createElement('td'), box = document.createElement('div');
      row.className = 'pine-deadrow'; td.colSpan = tr.children.length; box.className = 'pine-deadin';
      box.innerHTML = deadText(r);
      // on a phone the table scrolls sideways: keep the names inside the visible width
      if (scroller.scrollWidth > scroller.clientWidth + 1) box.style.minWidth = Math.max(160, scroller.clientWidth - 24) + 'px';
      td.appendChild(box); row.appendChild(td);
      tr.parentNode.insertBefore(row, next);
      b.classList.add('on'); b.setAttribute('aria-expanded', 'true');
    });
  }

  function managerTable(rows, allTime) {
    var most = leaders(rows, 'left', 1).v, lo = leaders(rows, 'coach_pct', -1).v, hi = leaders(rows, 'coach_pct', 1).v;
    var h = '<div class="hn-scroll pine-mt"><table class="hn-table"><thead><tr><th class="n">#</th><th>Manager</th>' +
      '<th class="n">Left on bench</th><th class="n">Per week</th><th class="n">Coaching&nbsp;%</th>' +
      '<th class="n">Lineup losses</th><th class="n">Dead men</th><th class="n">Worst week</th></tr></thead><tbody>';
    rows.forEach(function (r, i) {
      var w = r.worst;
      var wk = w ? score(w.left) + ' <span class="hn-mute">' + (allTime ? esc(w.season) + ' ' : '') + 'Wk ' + esc(w.week) + '</span>' : '—';
      var c = r.coach_pct, cc = c != null && lo !== hi ? (c === lo ? ' hn-bad' : c === hi ? ' hn-good' : '') : '';
      h += '<tr><td class="n pine-rk">' + (i + 1) + '</td><td class="who">' + who(r.who) + '</td>' +
        '<td class="n' + (r.left === most ? ' hn-bad' : '') + '">' + score(r.left) + '</td>' +
        '<td class="n">' + score(r.per_week) + '</td>' +
        '<td class="n' + cc + '">' + coach(c) + '</td>' +
        '<td class="n">' + (r.losses != null ? r.losses : '—') + '</td>' +
        '<td class="n">' + deadCell(r, i) + '</td>' +
        '<td class="n">' + wk + '</td></tr>';
    });
    return h + '</tbody></table></div>';
  }

  // "starters at 0 or less", or how many of them were empty slots
  function deadSub(r) {
    var e = (r.dead_list || []).filter(function (d) { return d.empty; }).length, z = (r.dead || 0) - e;
    if (!e) return 'starters at 0 or less';
    return (z ? z + ' at 0 or less, ' : '') + plural(e, 'empty slot');
  }

  function drawSeason(box, s) {
    var rows = s.managers || [];
    if (!rows.length) {
      box.innerHTML = '<div class="hn-card"><p class="hn-empty">No ' + esc(s.season) +
        ' games are final yet. Nobody has had a chance to bench anybody.</p></div>';
      return;
    }
    var top = leaders(rows, 'left', 1), worst = leaders(rows, 'coach_pct', -1),
      ll = leaders(rows, 'losses', 1), dead = leaders(rows, 'dead', 1);
    var h = '<div class="hn-kpis">';
    h += kpi('Most left on bench', score(top.v), names(top.rows) +
      (top.rows.length === 1 ? ' · ' + score(top.rows[0].per_week) + ' a week' : ''));
    h += kpi('Worst coaching', coach(worst.v), names(worst.rows) +
      (worst.rows.length === 1 ? ' · ' + score(worst.rows[0].actual) + ' of a possible ' + score(worst.rows[0].optimal) : ''));
    h += ll.v ? kpi('Most lineup losses', String(ll.v), names(ll.rows)) :
      kpi('Most lineup losses', '0', 'Nobody has lost one to their own bench yet');
    h += dead.v ? kpi('Most dead men', String(dead.v), names(dead.rows) +
      (dead.rows.length === 1 ? ' · ' + deadSub(dead.rows[0]) : '')) :
      kpi('Most dead men', '0', 'Every starter has scored');
    h += '</div>';

    h += '<div class="hn-card"><h3 class="hn-h">Left on the bench <small>' + esc(s.season) + ' regular season</small></h3>' +
      managerTable(rows, false) +
      '<p class="hn-note">Optimal is the highest-scoring legal lineup each week’s roster could have started (' +
      esc(lineupText(s.lineup)) + '; IR excluded), found by exact search, so dual-position players (RB/WR, QB/TE) land wherever they score most. ' +
      'A starter can’t be benched just to leave the slot empty, so a lone kicker or defense that went negative stays in. ' +
      'Rosters are Yahoo’s end-of-week rosters: a player cut during the week isn’t there, and one added after the Sunday 1 p.m. ET kickoffs can’t be swapped in. ' +
      'Left on bench is optimal minus the points actually started. Coaching % is points started divided by optimal points. ' +
      'A lineup loss is a loss where the optimal lineup beat the opponent’s actual score. ' +
      'Dead men are starters who scored 0 or less, plus starting slots left empty (tap a count for names). ' +
      'Worst week is the most left in one game.</p></div>';

    var losses = s.lineup_losses || [];
    h += '<div class="hn-card"><h3 class="hn-h">Lineup losses <small>' + esc(s.season) + ' · ' +
      plural(losses.length, 'game') + '</small></h3>';
    if (!losses.length) {
      h += '<p class="hn-empty">' + (s.complete ? 'Nobody lost a ' + esc(s.season) + ' game to their own bench.' :
        'Nobody has lost a ' + esc(s.season) + ' game to their own bench yet.') + '</p>';
    } else {
      h += lossBlock(losses, {
        head: '<th class="n">Wk</th>',
        cells: function (x) { return '<td class="n">' + esc(x.week) + '</td>'; },
        label: function (x) { return 'Wk ' + esc(x.week); }
      });
    }
    h += '<p class="hn-note">Lost is the final score. Optimal is what the best lineup from the same roster would have scored. ' +
      'The fix is the fewest bench players who, swapped in with the rest of the lineup reshuffled to fit, clear the opponent’s actual score; ' +
      'the opponent’s lineup stays as it was.</p></div>';
    box.innerHTML = h;
    var mt = box.querySelector('.pine-mt');
    if (mt) wireDead(mt, rows);
  }

  var KNOCKOUT = { 'Quarterfinal': 1, 'Semifinal': 1, 'Final': 1 };

  function drawAll(box, d) {
    var at = d.alltime || {}, rows = at.managers || [], span = at.first && at.last ? (at.first === at.last ? String(at.first) : at.first + '–' + at.last) : '';
    var cur = null;
    (d.seasons || []).forEach(function (s) { if (!cur && s.weeks) cur = s; });   // the newest season with a final game
    var thru = cur && !cur.complete && cur.through ? ' (' + cur.season + ' through Week ' + cur.through + ')' : '';
    var h = '<p class="pine-sec">All time</p>';
    h += '<div class="hn-card"><h3 class="hn-h">Career pine <small>' + (span ? esc(span) + ' · ' : '') + 'regular season</small></h3>';
    h += rows.length ? managerTable(rows, true) : '<p class="hn-empty">No games in the archive yet.</p>';
    h += '<p class="hn-note">Every regular-season game in the Yahoo archive' + (span ? ', ' + esc(span) + esc(thru) : '') +
      '. Same measures as the season table; worst week is the most left in any single game.</p></div>';

    var ww = at.worst_weeks || [];
    h += '<div class="hn-card"><h3 class="hn-h">The ten worst weeks <small>most left in one game</small></h3>';
    if (!ww.length) h += '<p class="hn-empty">No games yet.</p>';
    else {
      h += '<div class="hn-scroll"><table class="hn-table"><thead><tr><th class="n">#</th><th>Manager</th><th>Week</th>' +
        '<th class="n">Left</th><th class="n">Scored</th><th class="n">Optimal</th><th>Result</th><th>Best on the bench</th></tr></thead><tbody>';
      ww.forEach(function (w, i) {
        var res = w.result === 'W' ? '<span class="hn-good">Beat</span> ' + esc(w.opp) + ' anyway' :
          w.result === 'L' ? '<span class="hn-bad">Lost</span> to ' + esc(w.opp) + (w.lineup_loss ? ' <span class="pine-tag">Lineup loss</span>' : '') :
          'Tied ' + esc(w.opp);
        var b = w.benched ? esc(w.benched.name) + ' <span class="hn-mute pine-nw">' + esc(w.benched.pos) + ' · ' + ppts(w.benched.pts) + '</span>' : '—';
        h += '<tr><td class="n pine-rk">' + (i + 1) + '</td><td class="who">' + who(w.who) + '</td>' +
          '<td>' + esc(w.season) + ' · Wk ' + esc(w.week) + '</td>' +
          '<td class="n hn-bad">' + score(w.left) + '</td><td class="n">' + score(w.actual) + '</td>' +
          '<td class="n">' + score(w.optimal) + '</td><td class="pine-wrap">' + res + ' <span class="hn-mute pine-nw">' + score(w.actual) + '–' + score(w.opp_score) + '</span></td>' +
          '<td class="pine-wrap">' + b + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '<p class="hn-note">Left is optimal minus scored, for one regular-season game. Best on the bench is the highest-scoring benched player the optimal lineup would have started.</p></div>';

    var po = at.playoff_losses || [];
    var ko = po.filter(function (x) { return KNOCKOUT[x.round]; }).length;
    h += '<div class="hn-card"><h3 class="hn-h">Playoff games lost from the bench <small>' + plural(po.length, 'game') +
      (ko ? ' · ' + plural(ko, 'knockout') : '') + '</small></h3>';
    if (!po.length) h += '<p class="hn-empty">No playoff game has been lost from the bench yet.</p>';
    else {
      h += lossBlock(po, {
        head: '<th>Game</th>',
        cells: function (x) { return '<td class="pine-rd">' + esc(x.season) + '<small>' + esc(x.round || 'Playoffs') + '</small></td>'; },
        label: function (x) { return esc(x.season) + ' ' + esc(x.round || 'Playoffs'); }
      });
    }
    h += '<p class="hn-note">Championship bracket only. A knockout is a quarterfinal, semifinal or final, where the loss ended the title run; ' +
      'the 3rd- and 5th-place games only settle the order. ' +
      'Same test as a lineup loss: the optimal lineup beats the opponent’s actual score.</p></div>';
    box.innerHTML = h;
  }

  function render(el, d) {
    var seasons = (d && d.seasons) || [];
    if (!seasons.length) { HN.fail(el, 'No seasons in the archive yet, so nothing has been left on any bench.'); return; }
    el.innerHTML = '<p class="hn-intro">Every lineup, graded against the best one the roster could have started. ' +
      'The difference sat on the bench and watched.</p>' +
      '<div class="pine-bar"></div><div class="pine-season"></div><div class="pine-all"></div>';
    var bar = el.querySelector('.pine-bar'), box = el.querySelector('.pine-season');
    var by = {}; seasons.forEach(function (s) { by[s.season] = s; });
    var cap = document.createElement('span'); cap.className = 'pine-cap';
    function show(v) {
      var s = by[v]; if (!s) return;
      var span = s.complete ? 'Weeks 1–' + s.reg_weeks : s.through ? 'Through Week ' + s.through + ' of ' + s.reg_weeks : 'No games final yet';
      cap.innerHTML = esc(span) + (s.league_left != null && (s.managers || []).length ?
        ' · League total <b>' + score(s.league_left) + '</b> left on the bench' : '');
      drawSeason(box, s);
    }
    bar.appendChild(HN.season(seasons.map(function (s) { return { v: s.season, l: String(s.season) }; }), seasons[0].season, show));
    bar.appendChild(cap);
    show(seasons[0].season);
    drawAll(el.querySelector('.pine-all'), d);
  }

  HN.tabs.pine = function (el) {
    css();
    HN.data('pine').then(function (d) {
      try { render(el, d); } catch (e) { HN.fail(el, 'The Pine didn’t load. Try again in a minute.'); if (window.console) console.error(e); }
    }).catch(function () { HN.fail(el, 'The Pine isn’t built yet.'); });
  };
})(window.HN);
