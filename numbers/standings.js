// Hard Numbers — Real Standings: the standings with the schedule taken out.
// Data: /data/numbers/standings.json, built by scripts/hn/standings.py.
(function (HN) {
  var CSS = [
    '#hn-standings .st-bar{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin:0 0 16px}',
    '#hn-standings .st-when{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}',
    '#hn-standings .st-early{background:var(--panel-2);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:10px;',
    ' padding:10px 14px;margin:0 0 16px;font-size:13px;line-height:1.5;color:var(--silver)}',
    '#hn-standings .st-early b{color:var(--gold)}',
    '#hn-standings .hn-kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}',
    '#hn-standings .hn-kpi b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#hn-standings .hn-kpi b .hn-face{width:22px;height:22px;margin-right:7px;vertical-align:-3px}',
    '#hn-standings .hn-kpi b.st-tie{white-space:normal;font-size:17px;line-height:1.3}',
    // the shell styles every .hn-kpi span as the small grey label; a tied name is a name, not a label
    '#hn-standings .hn-kpi b.st-tie>span{display:inline-block;white-space:nowrap;margin-right:6px;font-size:inherit;',
    ' font-weight:inherit;letter-spacing:normal;text-transform:none;color:inherit}',
    '#hn-standings .hn-kpi b.st-tie i{font-style:normal;color:var(--muted);margin-right:6px}',
    '#hn-standings .hn-kpi em.st-names{color:#fff;font-weight:700}',
    '#hn-standings .st-main td,#hn-standings .st-main th{padding-left:8px;padding-right:8px}',
    '#hn-standings .st-main th{vertical-align:bottom;line-height:1.35}',
    '@media(max-width:700px){#hn-standings .st-main td.who,#hn-standings .st-main th.st-who{position:sticky;left:0;z-index:1;',
    ' background:var(--panel);box-shadow:6px 0 6px -6px rgba(0,0,0,.8)}}',
    '#hn-standings td.st-rk{color:var(--muted);width:1%;font-variant-numeric:tabular-nums}',
    '#hn-standings .st-sub{color:var(--muted);font-size:11.5px;margin-left:6px;font-weight:600}',
    '#hn-standings .st-mv{font-size:11px;font-weight:800;margin-left:5px}',
    // schedule swap grid
    '#hn-standings .st-swap{border-collapse:separate;border-spacing:3px;font-size:12px;margin:0 auto}',
    '#hn-standings .st-swap th,#hn-standings .st-swap td{border-bottom:0;cursor:default}',
    '#hn-standings .st-swap th{font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);',
    ' padding:4px 2px;text-align:center;white-space:nowrap;vertical-align:bottom}',
    '#hn-standings .st-swap thead .hn-face{display:block;margin:0 auto 4px;width:22px;height:22px}',
    '#hn-standings .st-swap th.st-rh{position:sticky;left:0;z-index:1;background:var(--panel);text-align:left;color:#fff;',
    ' font-size:12.5px;letter-spacing:0;text-transform:none;font-weight:700;padding:2px 8px 2px 0;vertical-align:middle}',
    '#hn-standings .st-swap th.st-rh .hn-face{width:22px;height:22px;margin-right:7px}',
    '#hn-standings .st-swap td{min-width:42px;text-align:center;padding:7px 3px;border-radius:6px;white-space:nowrap;',
    ' font-variant-numeric:tabular-nums;color:var(--silver);background:var(--panel-2)}',
    '#hn-standings .st-swap td.sw-me{box-shadow:inset 0 0 0 2px var(--gold);color:#fff;font-weight:800}',
    '#hn-standings .st-swap td.sw-bt{background:transparent;color:var(--muted);min-width:0;padding-left:8px;text-align:left}',
    '#hn-standings .st-swap td.sw-bt b{color:#fff}',
    '#hn-standings .st-key{display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);margin:10px 0 0}',
    '#hn-standings .st-key i{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-2px;margin-right:5px}',
    // all-time extremes
    '#hn-standings .st-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:16px;margin-top:16px}',
    '#hn-standings .st-two>div{min-width:0}',
    '#hn-standings .st-two h4{margin:0 0 6px;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}',
    '@media(max-width:480px){#hn-standings .st-two .hn-table td{padding-left:5px;padding-right:5px}',
    ' #hn-standings .st-two .hn-face{width:20px;height:20px;margin-right:6px}}',
    // under 360px the faces are what pushes a season list past the screen; the names stay
    '@media(max-width:359px){#hn-standings .st-two .hn-face{display:none}',
    ' #hn-standings .st-two .hn-table td{padding-left:4px;padding-right:4px}}'
  ].join('\n');

  function style() {
    if (document.getElementById('st-style')) return;
    var s = document.createElement('style'); s.id = 'st-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var esc = HN.esc;
  function n(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function wins(r) { return n(r.w) + 0.5 * n(r.t); }
  function rec(r) { return n(r.w) + '-' + n(r.l) + (n(r.t) ? '-' + n(r.t) : ''); }
  function apRec(r) { return n(r.apw) + '-' + n(r.apl) + (n(r.apt) ? '-' + n(r.apt) : ''); }
  function ord(k) { var s = ['th', 'st', 'nd', 'rd'], v = k % 100; return k + (s[(v - 20) % 10] || s[v] || s[0]); }
  function pts(v) { return typeof v === 'number' && isFinite(v) ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; }
  function luckCls(v) { return v > 0.005 ? 'hn-good' : v < -0.005 ? 'hn-bad' : 'hn-mute'; }
  function luck(v) { return '<span class="' + luckCls(v) + '">' + HN.signed(v, 2) + '</span>'; }
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen'];
  function word(k) { return WORDS[k] || String(k); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function wn(v) { return (v % 1 ? v.toFixed(1) : String(v)) + (v === 1 ? ' win' : ' wins'); }
  // "A", "A or B", "A, B or C"
  function either(xs) { return xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' or ' + xs[xs.length - 1]; }
  function same(a, b) { return Math.abs(n(a) - n(b)) < 0.005; } // luck moves in 1/22s, so this is an exact tie
  function nway(k) { var w = word(k); return (/^[aeiou]/.test(w) ? 'an ' : 'a ') + w + '-way tie'; }
  // "on Hoa’s schedule", "on Jason’s, Adam’s or Tola’s schedule", "on any of 8 schedules"
  function onWhose(on) {
    if (on.length > 3) return 'on any of ' + on.length + ' schedules';
    return 'on ' + either(on.map(function (c) { return c + '’s'; })) + ' schedule';
  }

  // one manager, or every manager tied for the card: nobody wins a tie on list order.
  // Up to three tied names share the headline; past that it's their faces, with the names spelled out underneath.
  function kpi(label, whos, sub) {
    whos = whos || [];
    var b, names = '';
    if (!whos.length) b = '<b>—</b>';
    else if (whos.length === 1) b = '<b>' + HN.who(whos[0]) + '</b>';
    else if (whos.length <= 3) {
      b = '<b class="st-tie" title="' + esc('Tied: ' + whos.join(', ')) + '">' + whos.map(function (w, i) {
        return (i ? '<i>&amp;</i>' : '') + '<span>' + HN.who(w) + '</span>';
      }).join('') + '</b>';
    } else {
      b = '<b class="st-tie" title="' + esc('Tied: ' + whos.join(', ')) + '"><span>' + whos.map(HN.face).join('') + '</span></b>';
      names = '<em class="st-names">' + esc(whos.join(', ')) + '</em>';
    }
    return '<div class="hn-kpi"><span>' + esc(label) + '</span>' + b + names + '<em>' + sub + '</em></div>';
  }

  // the biggest single swing the schedule swap finds: someone's record on someone else's schedule.
  // Every manager (and every schedule) that ties for the biggest gain comes back, grouped by manager.
  function bigSwap(sw) {
    var best = null, hits = [];
    if (!sw || !sw.order || !sw.cells) return null;
    for (var i = 0; i < sw.order.length; i++) {
      var row = sw.cells[i] || [], real = row[i];
      if (!real) continue;
      for (var j = 0; j < row.length; j++) {
        if (i === j || !row[j]) continue;
        var d = wins(row[j]) - wins(real);
        if (best === null || d > best) { best = d; hits = []; }
        if (d === best) hits.push({ who: sw.order[i], on: sw.order[j], real: real, alt: row[j] });
      }
    }
    if (best === null) return null;
    var by = [], at = {};
    hits.forEach(function (x) {
      if (!at[x.who]) { at[x.who] = { who: x.who, real: x.real, alt: x.alt, on: [] }; by.push(at[x.who]); }
      at[x.who].on.push(x.on);
    });
    return { d: best, who: by };
  }

  // every row sharing the top (or bottom) luck
  function extreme(rows, dir) {
    var v = rows[0].luck;
    rows.forEach(function (r) { if (dir * (r.luck - v) > 0) v = r.luck; });
    return rows.filter(function (r) { return same(r.luck, v); });
  }

  function luckSub(xs) {
    var h = esc(HN.signed(xs[0].luck, 2)) + (xs.length > 1 ? ' wins apiece · ' : ' wins · ');
    var alike = xs.every(function (r) { return rec(r) === rec(xs[0]) && same(r.xw, xs[0].xw); });
    if (xs.length === 1) return h + rec(xs[0]) + ' on ' + HN.num(xs[0].xw, 2) + ' expected';
    if (alike) return h + (xs.length === 2 ? 'both ' : 'all ') + rec(xs[0]) + ' on ' + HN.num(xs[0].xw, 2) + ' expected';
    if (xs.length === 2) return h + rec(xs[0]) + ' on ' + HN.num(xs[0].xw, 2) + ' and ' + rec(xs[1]) + ' on ' + HN.num(xs[1].xw, 2) + ' expected';
    return h + nway(xs.length);
  }

  function whos(xs) { return xs.map(function (r) { return r.who; }); }

  function kpis(s) {
    var rows = s.rows;
    var lk = extreme(rows, 1), ul = extreme(rows, -1);
    var top = rows.filter(function (r) { return n(r.rank) === 1; });
    if (!top.length) top = [rows[0]];
    var h = '<div class="hn-kpis">';
    h += kpi('Luckiest', whos(lk), luckSub(lk));
    h += kpi('Unluckiest', whos(ul), luckSub(ul));
    var apAlike = top.every(function (r) { return apRec(r) === apRec(top[0]); });
    h += kpi('Best all-play', whos(top), (apAlike ? apRec(top[0]) + ' · ' : '') + HN.pct(top[0].ap) + (top.length > 1 ? ' apiece' : ''));
    var b = bigSwap(s.swap);
    if (b && b.d > 0) {
      var sub;
      if (b.who.length === 1) {
        var x = b.who[0];
        sub = rec(x.real) + ' real · ' + rec(x.alt) + ' ' + esc(onWhose(x.on));
      } else if (b.who.length <= 3) {
        sub = '+' + wn(b.d) + ' apiece · ' + b.who.map(function (x) { return esc(x.who + ' ' + onWhose(x.on)); }).join('; ');
      } else {
        sub = '+' + wn(b.d) + ' apiece · ' + nway(b.who.length);
      }
      h += kpi('Biggest swap', b.who.map(function (x) { return x.who; }), sub);
    } else h += kpi('Biggest swap', null, 'No schedule would have helped anyone');
    return h + '</div>';
  }

  function mainTable(s) {
    var h = '<div class="hn-card"><h3 class="hn-h">The table <small>ranked by all-play</small></h3>';
    h += '<div class="hn-scroll"><table class="hn-table st-main"><thead><tr>' +
      '<th class="n">#</th><th class="st-who">Manager</th><th class="n">Record</th><th class="n">Actual</th><th class="n">All-play</th>' +
      '<th class="n">Exp. W</th><th class="n">Luck</th><th class="n">Lucky<br>W</th><th class="n">Unlucky<br>L</th><th class="n">PF</th>' +
      '</tr></thead><tbody>';
    var cnt = {};
    s.rows.forEach(function (r) { cnt[n(r.rank)] = (cnt[n(r.rank)] || 0) + 1; });
    s.rows.forEach(function (r) {
      var mv = n(r.rank) - n(r.place), m = '';
      if (mv > 0) m = '<span class="st-mv hn-good" title="' + mv + ' spots higher than the all-play rank">+' + mv + '</span>';
      else if (mv < 0) m = '<span class="st-mv hn-bad" title="' + (-mv) + ' spots lower than the all-play rank">−' + (-mv) + '</span>';
      h += '<tr>' +
        '<td class="n st-rk">' + (cnt[n(r.rank)] > 1 ? 'T' : '') + n(r.rank) + '</td>' +
        '<td class="who">' + HN.who(r.who) + '</td>' +
        '<td class="n">' + rec(r) + '</td>' +
        '<td class="n">' + ord(n(r.place)) + m + '</td>' +
        '<td class="n">' + apRec(r) + '<span class="st-sub">' + HN.pct(r.ap) + '</span></td>' +
        '<td class="n">' + HN.num(r.xw, 2) + '</td>' +
        '<td class="n">' + luck(r.luck) + '</td>' +
        '<td class="n">' + n(r.lw) + '</td>' +
        '<td class="n">' + n(r.ul) + '</td>' +
        '<td class="n">' + pts(r.pf) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<p class="hn-note">All-play puts each week’s score up against every other team, not just the one on the schedule; ' +
      'equal all-play rates share a rank (T) and are listed by points for. ' +
      'Expected wins is that all-play win rate times games played; luck is actual wins minus expected wins. ' +
      'Actual is the real regular-season place (record, then points), and the small number is how far it sits above (+) or below (−) the all-play rank. ' +
      'A lucky win came with a score below that week’s median; an unlucky loss came with one above it.</p>';
    return h + '</div>';
  }

  function tint(d) {
    if (!d) return '';
    var a = Math.min(0.14 + 0.09 * Math.abs(d), 0.62).toFixed(2);
    return d > 0 ? 'background:rgba(63,178,107,' + a + ')' : 'background:rgba(255,107,118,' + a + ')';
  }

  function swapGrid(s) {
    var sw = s.swap;
    var h = '<div class="hn-card"><h3 class="hn-h">Schedule swap <small>row’s scores · column’s schedule</small></h3>';
    if (!sw || !sw.order || !sw.order.length) return h + '<p class="hn-empty">No schedules to swap yet.</p></div>';
    var byWho = {};
    s.rows.forEach(function (r) { byWho[r.who] = r; });
    h += '<div class="hn-scroll"><table class="st-swap"><thead><tr><th class="st-rh"></th>';
    sw.order.forEach(function (c) { h += '<th title="' + esc(c) + '’s schedule">' + HN.face(c) + esc(c) + '</th>'; });
    h += '<th title="How many of the other ' + word(sw.order.length - 1) + ' schedules would have given a better record">Better on</th></tr></thead><tbody>';
    sw.order.forEach(function (r, i) {
      var row = sw.cells[i] || [], real = row[i] || { w: 0, l: 0, t: 0 }, rw = wins(real);
      h += '<tr><th class="st-rh" scope="row">' + HN.who(r) + '</th>';
      sw.order.forEach(function (c, j) {
        var x = row[j];
        if (!x) { h += '<td>—</td>'; return; }
        var d = wins(x) - rw;
        var tip = i === j ? r + '’s real record: ' + rec(x) : r + ' on ' + c + '’s schedule: ' + rec(x) + ' (real ' + rec(real) + ')';
        h += '<td' + (i === j ? ' class="sw-me"' : ' style="' + tint(d) + '"') + ' title="' + esc(tip) + '">' + rec(x) + '</td>';
      });
      var bt = byWho[r] ? n(byWho[r].better) : 0;
      h += '<td class="sw-bt"><b>' + bt + '</b> of ' + (sw.order.length - 1) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    h += '<div class="st-key"><span><i style="box-shadow:inset 0 0 0 2px var(--gold)"></i>real record</span>' +
      '<span><i style="background:rgba(63,178,107,.5)"></i>better than it</span>' +
      '<span><i style="background:rgba(255,107,118,.5)"></i>worse than it</span></div>';
    h += '<p class="hn-note">Each cell is the row manager’s record with their own weekly scores played against the column manager’s opponents ' +
      '(in the week that opponent was the row manager, the column manager is the opponent instead). ' +
      'The diagonal is the real record, shading deepens with every win gained or lost, and “Better on” counts the other schedules that would have beaten it.</p>';
    return h + '</div>';
  }

  function allTime(a, d) {
    var partial = !a.cur_final && n(a.cur_weeks) > 0;
    var h = '<div class="hn-card"><h3 class="hn-h">All-time <small>' + esc(a.first) + '–' + esc(a.last) +
      (partial ? ' · ' + esc(d.current) + ' through week ' + n(a.cur_weeks) : '') + '</small></h3>';
    if (!a.rows || !a.rows.length) return h + '<p class="hn-empty">No seasons on file yet.</p></div>';
    // a Seasons column only earns its place once someone has played fewer seasons than the rest
    var ns = a.rows.map(function (r) { return n(r.seasons); });
    var mixed = Math.min.apply(null, ns) !== Math.max.apply(null, ns);
    h += '<div class="hn-scroll"><table class="hn-table st-main"><thead><tr>' +
      '<th class="n">#</th><th class="st-who">Manager</th>' + (mixed ? '<th class="n">Seasons</th>' : '') + '<th class="n">Record</th><th class="n">All-play</th>' +
      '<th class="n">Exp. W</th><th class="n">Luck</th><th class="n">Lucky<br>W</th><th class="n">Unlucky<br>L</th>' +
      '<th class="n">Luckiest<br>year</th><th class="n">Unluckiest<br>year</th></tr></thead><tbody>';
    var cnt = {};
    a.rows.forEach(function (r, i) { r._rk = n(r.rank) || i + 1; cnt[r._rk] = (cnt[r._rk] || 0) + 1; });
    a.rows.forEach(function (r) {
      function yr(x) { return x ? esc(x.y) + ' <span class="' + luckCls(x.luck) + '">' + HN.signed(x.luck, 2) + '</span>' : '<span class="hn-mute">—</span>'; }
      h += '<tr><td class="n st-rk">' + (cnt[r._rk] > 1 ? 'T' : '') + r._rk + '</td><td class="who">' + HN.who(r.who) + '</td>' +
        (mixed ? '<td class="n">' + n(r.seasons) + '</td>' : '') + '<td class="n">' + rec(r) + '</td>' +
        '<td class="n">' + apRec(r) + '<span class="st-sub">' + HN.pct(r.ap, 1) + '</span></td>' +
        '<td class="n">' + HN.num(r.xw, 2) + '</td><td class="n">' + luck(r.luck) + '</td>' +
        '<td class="n">' + n(r.lw) + '</td><td class="n">' + n(r.ul) + '</td>' +
        '<td class="n">' + yr(r.lucky) + '</td><td class="n">' + yr(r.unlucky) + '</td></tr>';
    });
    h += '</tbody></table></div>';
    function list(title, xs) {
      var t = '<div><h4>' + esc(title) + '</h4>';
      if (!xs || !xs.length) return t + '<p class="hn-empty">Needs a finished season.</p></div>';
      t += '<div class="hn-scroll"><table class="hn-table"><tbody>';
      xs.forEach(function (x) {
        t += '<tr><td class="who">' + HN.who(x.who) + '</td><td class="n">' + esc(x.y) + '</td><td class="n">' + luck(x.luck) +
          '</td><td class="n">' + rec(x) + '</td><td class="n hn-mute">' + HN.num(x.xw, 2) + ' exp.</td></tr>';
      });
      return t + '</tbody></table></div></div>';
    }
    h += '<div class="st-two">' + list('Luckiest seasons', a.luckiest) + list('Unluckiest seasons', a.unluckiest) + '</div>';
    h += '<p class="hn-note">Career all-play and record add up every regular-season week' +
      (partial ? ', this season’s included' : '') + '; career luck is the sum of each season’s luck. ' +
      'Luckiest and unluckiest years count finished seasons only, and any season tied with the fifth makes the list too.</p>';
    return h + '</div>';
  }

  function season(s, y, d) {
    if (!s || !s.rows || !s.rows.length || !n(s.weeks)) {
      return '<p class="hn-empty">No ' + esc(y) + ' games are final yet. The table fills in after Week 1.</p>';
    }
    var h = '';
    if (!s.final && n(s.weeks) < 4) {
      var k = n(s.weeks), opp = s.rows.length - 1;
      h += '<p class="st-early"><b>' + cap(word(k)) + ' week' + (k === 1 ? '' : 's') + ' in.</b> That’s ' + (k * opp) +
        ' all-play games apiece — a sample, not a verdict. Luck needs about a month before it means much.</p>';
    }
    return h + kpis(s) + mainTable(s) + swapGrid(s);
  }

  HN.tabs.standings = function (el) {
    style();
    el.innerHTML = '<p class="hn-empty">Loading…</p>';
    HN.data('standings').then(function (d) {
      if (!d || !d.seasons) return HN.fail(el);
      var years = Object.keys(d.seasons).sort(function (a, b) { return b - a; });
      if (!years.length) return HN.fail(el);
      var on = d.seasons[d.current] ? String(d.current) : years[0];
      // the shell resets the hash to #standings, so a picked season rides along in this tab's session instead
      try { var kept = sessionStorage.getItem('hn-st-season'); if (kept && d.seasons[kept]) on = kept; } catch (e) {}
      el.innerHTML = '<p class="hn-intro">Every score, every week, played against every other team instead of the one Yahoo scheduled. ' +
        'What’s left is who’s actually good, and who’s been living off the schedule.</p>' +
        '<div class="st-bar"></div><div class="st-season"></div><div class="st-all"></div>';
      var bar = el.querySelector('.st-bar'), box = el.querySelector('.st-season');
      function when(y) {
        var s = d.seasons[y] || {};
        if (s.final) return 'Final · ' + n(s.weeks) + ' weeks';
        return n(s.weeks) ? 'Through week ' + n(s.weeks) + ' of ' + (n(s.of) || 14) : 'Not started';
      }
      var tag = document.createElement('span'); tag.className = 'st-when';
      function show(y) {
        on = String(y); tag.textContent = when(on); box.innerHTML = season(d.seasons[on], on, d);
        try { sessionStorage.setItem('hn-st-season', on); } catch (e) {}
      }
      bar.appendChild(HN.seg(years, on, show));
      bar.appendChild(tag);
      show(on);
      el.querySelector('.st-all').innerHTML = d.alltime ? allTime(d.alltime, d) : '';
    }).catch(function (e) {
      if (e && window.console) console.error('standings:', e);
      HN.fail(el, 'Real Standings aren’t built yet.');
    });
  };
})(window.HN);
