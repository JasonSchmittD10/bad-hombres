// Hard Numbers — FAAB Receipts: every pickup off the wire, what it cost, what it returned.
// Data: /data/numbers/faab.json, built by scripts/hn/faab.py.
(function (HN) {
  var CSS = [
    '#hn-faab .fb-bar{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;margin:0 0 16px}',
    '#hn-faab .fb-when{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}',
    '#hn-faab .fb-flag{background:var(--panel-2);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:10px;',
    ' padding:10px 14px;margin:0 0 16px;font-size:13px;line-height:1.5;color:var(--silver)}',
    '#hn-faab .fb-flag b{color:var(--gold)}',
    '#hn-faab .hn-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}',
    '@media(max-width:760px){#hn-faab .hn-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}',
    '#hn-faab .hn-kpi b{line-height:1.2;overflow-wrap:anywhere}',
    '#hn-faab .hn-kpi b .hn-face{width:22px;height:22px;margin-right:7px;vertical-align:-3px}',
    '#hn-faab .hn-kpi b .fb-faces{display:inline-block;margin-right:14px;white-space:nowrap}',
    '#hn-faab .hn-kpi b .fb-faces .hn-face{margin-right:-7px;box-shadow:0 0 0 2px var(--panel)}',
    '#hn-faab .hn-table td,#hn-faab .hn-table th{padding-left:8px;padding-right:8px}',
    '#hn-faab td.fb-rk{color:var(--muted);width:1%;font-variant-numeric:tabular-nums}',
    '#hn-faab .fb-pl{color:#fff;font-weight:700}',
    '#hn-faab .fb-pos{color:var(--muted);font-size:11px;font-weight:800;letter-spacing:.06em;margin-left:6px}',
    '#hn-faab .fb-sub{color:var(--muted);font-size:11.5px;font-weight:600;margin-left:6px}',
    '#hn-faab .fb-led tbody tr{cursor:pointer}',
    '#hn-faab .fb-led tbody tr:hover td,#hn-faab .fb-led tbody tr:focus-within td{background:var(--panel-2)}',
    '#hn-faab .fb-led tbody tr.on td{background:var(--panel-2);box-shadow:inset 0 -1px 0 var(--gold)}',
    '#hn-faab .fb-pick{background:none;border:0;margin:0;padding:2px 4px 2px 0;color:inherit;font:inherit;cursor:pointer;',
    ' display:inline-flex;align-items:center;text-align:left;border-radius:6px}',
    '#hn-faab .fb-pick:focus:not(:focus-visible){outline:none}',
    '#hn-faab .fb-pick:focus-visible{outline:2px solid var(--gold);outline-offset:2px}',
    '#hn-faab td.fb-wrap{white-space:normal;min-width:150px}',
    '#hn-faab .fb-chip{display:inline-block;white-space:nowrap;margin:2px 12px 2px 0;color:var(--silver)}',
    '#hn-faab .fb-chip .hn-face{width:20px;height:20px;margin-right:6px}',
    '#hn-faab .fb-chip b{color:#fff}',
    '#hn-faab .fb-x{background:var(--panel-2);border:1px solid var(--line);color:var(--silver);border-radius:16px;padding:5px 11px;',
    ' font:800 11px "Segoe UI",sans-serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}',
    '#hn-faab .fb-x:hover{color:#fff;border-color:#3a3a44}',
    '#hn-faab .fb-x:focus-visible{outline:2px solid var(--gold);outline-offset:2px}',
    '#hn-faab .fb-rec{scroll-margin-top:76px}',
    '#hn-faab .fb-who .hn-face{width:22px;height:22px;margin-right:7px}',
    '#hn-faab .fb-line{color:var(--silver);font-size:13px;margin:-4px 0 12px;line-height:1.5}',
    '#hn-faab .fb-line b{color:#fff}'
  ].join('\n');

  function style() {
    if (document.getElementById('fb-style')) return;
    var s = document.createElement('style'); s.id = 'fb-style'; s.textContent = CSS;
    document.head.appendChild(s);
  }

  var esc = HN.esc;
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function pts(v) { return num(v) == null ? '—' : HN.num(v, 1); }
  function usd(v) { return num(v) == null ? '—' : '$' + v; }
  function plural(k, one, many) { return k + ' ' + (k === 1 ? one : (many || one + 's')); }
  function mute(t) { return '<span class="hn-mute">' + t + '</span>'; }
  var WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

  // pickups arrive as arrays; the file names the columns
  function unpack(cols, rows) {
    return (rows || []).map(function (r) {
      var o = {}; for (var i = 0; i < cols.length; i++) o[cols[i]] = r[i]; return o;
    });
  }
  function played(p) { return num(p.pts) != null; }

  function player(p) {
    return '<span class="fb-pl">' + esc(p.p) + '</span>' + (p.pos ? '<span class="fb-pos">' + esc(p.pos) + '</span>' : '');
  }
  function price(p) {
    return p.src === 'fa' ? mute('FA') : usd(p.bid);
  }
  function perPoint(p) {
    if (!played(p)) return mute('—');
    if (!p.bid) return mute('free');
    if (p.pts <= 0) return '<span class="hn-bad">no return</span>';
    return '$' + (p.bid / p.pts).toFixed(2);
  }
  function weeks(p) {
    if (p.st === 'post') return mute('After the season');
    if (!played(p)) return 'Wk ' + esc(p.w) + ' ' + mute('· hasn’t played');
    if (num(p.from) == null) return 'Wk ' + esc(p.w) + ' ' + mute('· gone same week');
    if (p.st === 'open') return 'Wk ' + esc(p.from) + '–now';
    return 'Wk ' + esc(p.from) + (p.to !== p.from ? '–' + esc(p.to) : '');
  }
  function ptsCell(p) {
    if (!played(p)) return mute('—');
    return p.pts > 0 ? pts(p.pts) : mute(pts(p.pts));
  }
  function chip(name, tail) {
    return '<span class="fb-chip">' + HN.face(name) + '<b>' + esc(name) + '</b> ' + mute(tail) + '</span>';
  }

  function kpis(s, P) {
    var h = '<div class="hn-kpis">';
    var best = s.top.length ? P[s.top[0]] : null;
    if (best && best.pts > 0) {
      h += '<div class="hn-kpi"><span>Best pickup</span><b>' + esc(best.p) + '</b><em>' + esc(best.m) + ' · ' + pts(best.pts) +
        ' started pts' + (s.faab ? ' · ' + (best.src === 'fa' ? 'free agent' : usd(best.bid)) : '') + '</em></div>';
    } else {
      h += '<div class="hn-kpi"><span>Best pickup</span><b>—</b><em>No pickup has started a game yet.</em></div>';
    }
    if (s.faab) {
      if (s.worst.length) {
        var w = P[s.worst[0]];
        h += '<div class="hn-kpi"><span>' + (s.worst.length === 1 ? 'Only $' + esc(s.minBid) + '+ bid' : 'Worst spend') + '</span><b>' + esc(w.p) +
          '</b><em>' + esc(w.m) + ' · ' + usd(w.bid) + ' for ' + pts(w.pts) + ' started pts</em></div>';
      } else {
        h += '<div class="hn-kpi"><span>Worst spend</span><b>—</b><em>No bid of $' + esc(s.minBid) + '+ has played yet.</em></div>';
      }
    } else {
      // no bids that year, so no worst spend: the manager who got the most out of the wire instead
      var lead = s.managers.filter(function (m) { return m.done && m.pts > 0; })
        .sort(function (a, b) { return b.pts - a.pts; })[0];
      h += '<div class="hn-kpi"><span>Biggest haul</span>' + (lead
        ? '<b>' + HN.who(lead.m) + '</b><em>' + pts(lead.pts) + ' started pts from ' + plural(lead.n, 'pickup') + '</em>'
        : '<b>—</b><em>No pickup has started a game yet.</em>') + '</div>';
    }
    var a = s.active || {}, who = a.who || [];
    if (who.length === 1) {
      var mine = s.managers.filter(function (m) { return m.m === who[0]; })[0] || {};
      h += '<div class="hn-kpi"><span>Most active</span><b>' + HN.who(who[0]) + '</b><em>' + plural(a.n, 'pickup') +
        (s.faab ? ' · ' + usd(mine.spent) + ' spent' : '') + '</em></div>';
    } else if (who.length === 2) {
      h += '<div class="hn-kpi"><span>Most active</span><b>' + who.map(HN.who).join(' ') + '</b><em>' + plural(a.n, 'pickup') + ' apiece</em></div>';
    } else if (who.length > 2) {
      h += '<div class="hn-kpi"><span>Most active</span><b><span class="fb-faces">' + who.map(HN.face).join('') + '</span>' + who.length +
        '-way tie</b><em>' + who.map(esc).join(', ') + ' · ' + plural(a.n, 'pickup') + ' apiece</em></div>';
    } else {
      h += '<div class="hn-kpi"><span>Most active</span><b>—</b><em>Nobody has touched the wire yet.</em></div>';
    }
    var claims = P.filter(function (p) { return p.src === 'waivers'; }).length;
    h += '<div class="hn-kpi"><span>The wire</span><b>' + plural(P.length, 'pickup') + '</b><em>' +
      (s.faab ? usd(s.spent) + ' of FAAB spent' + (s.pend > 0 ? ', ' + usd(s.pend) + ' of it on pickups yet to play' : ', league-wide')
        : plural(claims, 'waiver claim') + ', ' + plural(P.length - claims, 'free agent')) + '</em></div>';
    return h + '</div>';
  }

  function ledger(s, P, on) {
    function key(m) { return m.done ? m.pts : -1e9; }
    var rows = s.managers.slice().sort(function (a, b) { return (key(b) - key(a)) || (b.n - a.n) || (a.m < b.m ? -1 : 1); });
    var top = rows.length && rows[0].done ? rows[0].pts : null;
    var h = '<div class="hn-card"><h3 class="hn-h">The ledger <small>pickups by manager</small>' +
      '<small class="hn-right">tap a row for the receipts</small></h3>' +
      '<div class="hn-scroll"><table class="hn-table fb-led"><thead><tr><th>Manager</th><th class="n">Pickups</th>' +
      (s.faab ? '<th class="n">Spent</th>' : '') + '<th class="n">Started pts</th>' + (s.faab ? '<th class="n">$/pt</th>' : '') +
      '<th>Best pickup</th></tr></thead><tbody>';
    rows.forEach(function (m) {
      var b = num(m.best) != null ? P[m.best] : null;
      h += '<tr data-m="' + esc(m.m) + '"' + (m.m === on ? ' class="on"' : '') + '><td class="who">' +
        '<button type="button" class="fb-pick" data-m="' + esc(m.m) + '" aria-pressed="' + (m.m === on) + '">' + HN.who(m.m) + '</button></td>' +
        '<td class="n">' + (m.n || mute('0')) + '</td>';
      if (s.faab) {
        h += '<td class="n">' + usd(m.spent) + (m.pend > 0 ? '<span class="fb-sub">incl. ' + usd(m.pend) + ' pending</span>' : '') + '</td>';
      }
      h += '<td class="n' + (top > 0 && m.done && m.pts === top ? ' hn-gold' : '') + '">' + (m.done ? pts(m.pts) : mute('—')) + '</td>';
      if (s.faab) {
        var paid = (m.spent || 0) - (m.pend || 0);
        h += '<td class="n">' + (!m.done ? mute('—')
          : num(m.ppt) != null ? (m.ppt > 0 ? '$' + m.ppt.toFixed(2) : mute('free'))
          : paid > 0 ? '<span class="hn-bad">no return</span>' : mute('—')) + '</td>';
      }
      h += '<td>' + (b ? player(b) + '<span class="fb-sub">' + pts(b.pts) + '</span>' : mute('—')) + '</td></tr>';
    });
    return h + '</tbody></table></div><p class="hn-note">Started pts: what a manager’s pickups scored in that manager’s starting lineup, in games that counted, while still on the roster. ' +
      (s.faab ? '$/pt: FAAB spent on pickups that have played, divided by their started points. ' +
        (s.pend > 0 ? 'Spent counts every winning bid, the way Yahoo’s balance does; pending is money on pickups that haven’t played yet.' : '') : '') +
      '</p></div>';
  }

  function receipts(s, P, st) {
    var list, head, h;
    var idx = P.map(function (p, i) { return i; });
    // pickups that haven't played: the biggest bids first
    var pend = idx.filter(function (i) { return !played(P[i]); })
      .sort(function (a, b) { return ((P[b].bid || 0) - (P[a].bid || 0)) || (a - b); });
    if (st.who) {
      list = idx.filter(function (i) { return P[i].m === st.who; });
      list.sort(function (a, b) { return byPts(P, a, b); });
      head = '<h3 class="hn-h fb-who">' + HN.who(st.who) + '’s receipts <small>' + plural(list.length, 'pickup') + '</small>' +
        '<button type="button" class="fb-x hn-right" data-clear="1">All managers ×</button></h3>';
      var m = s.managers.filter(function (x) { return x.m === st.who; })[0];
      if (m && s.faab && num(m.worst) != null) {
        var w = P[m.worst];
        head += '<p class="fb-line">' + (m.big === 1 ? 'His only $' + esc(s.minBid) + '+ bid' + (s.final ? '' : ' to play so far') : 'Worst spend') +
          ': <b>' + esc(w.p) + '</b>, ' + usd(w.bid) + ' for ' + pts(w.pts) + ' started pts.</p>';
      }
    } else {
      var all = s.top.concat(pend);
      var dflt = s.top.length ? s.top.slice(0, 10) : pend.slice(0, 10);
      list = st.all ? all : dflt;
      head = '<h3 class="hn-h">' + (st.all ? 'Every pickup' : s.top.length ? 'Top pickups' : 'Pickups so far') +
        ' <small>' + (s.top.length ? 'by started points' : 'none has played yet') + '</small>' +
        (all.length > dflt.length ? '<button type="button" class="fb-x hn-right" data-all="1">' +
          (st.all ? (s.top.length ? 'Top 10' : 'First 10') : 'All ' + all.length) + '</button>' : '') + '</h3>';
    }
    h = '<div class="hn-card fb-rec">' + head;
    if (!list.length) {
      return h + '<p class="hn-empty">' + (st.who ? esc(st.who) + ' hasn’t picked anybody up.' : 'No pickups yet.') + '</p></div>';
    }
    h += '<div class="hn-scroll"><table class="hn-table"><thead><tr><th>#</th><th>Player</th>' + (st.who ? '' : '<th>Manager</th>') +
      (s.faab ? '<th class="n">Price</th>' : '') + '<th>Weeks</th><th class="n">Starts</th><th class="n">Started pts</th>' +
      (s.faab ? '<th class="n">$/pt</th>' : '') + '</tr></thead><tbody>';
    var open = false;
    list.forEach(function (i, k) {
      var p = P[i];
      if (p.st === 'open') open = true;
      h += '<tr><td class="fb-rk">' + (k + 1) + '</td><td>' + player(p) + '</td>' + (st.who ? '' : '<td class="who">' + HN.who(p.m) + '</td>') +
        (s.faab ? '<td class="n">' + price(p) + '</td>' : '') + '<td>' + weeks(p) + '</td><td class="n">' + (num(p.starts) || 0) + '</td>' +
        '<td class="n">' + ptsCell(p) + '</td>' + (s.faab ? '<td class="n">' + perPoint(p) + '</td>' : '') + '</tr>';
    });
    return h + '</tbody></table></div><p class="hn-note">Weeks: from the week the player was added until the drop, the trade or the end of the season' +
      (open ? '; “now” means still on the roster' : '') + '. ' +
      (s.faab ? 'Price: the winning FAAB bid; FA means a free agent, who costs nothing.' : '') + '</p></div>';
  }
  function byPts(P, a, b) {
    var x = num(P[a].pts), y = num(P[b].pts);
    if (x == null && y == null) return ((P[b].bid || 0) - (P[a].bid || 0)) || (a - b);
    if (x == null) return 1;
    if (y == null) return -1;
    return (y - x) || (a - b);
  }

  function worstCard(s, P) {
    var h = '<div class="hn-card"><h3 class="hn-h">Worst spends <small>bids of $' + esc(s.minBid) + ' or more</small></h3>';
    if (!s.worst.length) return h + '<p class="hn-empty">No bid of $' + esc(s.minBid) + ' or more has played a game yet.</p></div>';
    h += '<div class="hn-scroll"><table class="hn-table"><thead><tr><th>#</th><th>Player</th><th>Manager</th><th class="n">Bid</th>' +
      '<th>Weeks</th><th class="n">Started pts</th><th class="n">$/pt</th></tr></thead><tbody>';
    s.worst.slice(0, 8).forEach(function (i, k) {
      var p = P[i];
      h += '<tr><td class="fb-rk">' + (k + 1) + '</td><td>' + player(p) + '</td><td class="who">' + HN.who(p.m) + '</td>' +
        '<td class="n">' + usd(p.bid) + '</td><td>' + weeks(p) + '</td><td class="n">' + ptsCell(p) + '</td><td class="n">' + perPoint(p) + '</td></tr>';
    });
    return h + '</tbody></table></div><p class="hn-note">Ranked by started points per FAAB dollar, fewest first. Bids that haven’t played yet aren’t ranked.</p></div>';
  }

  function awayCard(s) {
    var a = s.away || [];
    var h = '<div class="hn-card"><h3 class="hn-h">The One That Got Away <small>dropped, then started elsewhere</small></h3>';
    if (!a.length) return h + '<p class="hn-empty">Nobody’s cut has scored a point for anyone else yet.</p></div>';
    h += '<div class="hn-scroll"><table class="hn-table"><thead><tr><th>#</th><th>Player</th><th>Dropped by</th>' +
      '<th class="n">Started pts after</th><th>For</th></tr></thead><tbody>';
    a.forEach(function (x, k) {
      h += '<tr><td class="fb-rk">' + (k + 1) + '</td><td>' + player(x) + '</td><td class="fb-wrap">' +
        (x.by || []).map(function (b) { return chip(b[0], 'wk ' + esc(b[1])); }).join('') + '</td>' +
        '<td class="n' + (k === 0 ? ' hn-gold' : '') + '">' + pts(x.pts) + '</td><td class="fb-wrap">' +
        (x['for'] || []).map(function (f) { return chip(f[0], pts(f[1])); }).join('') + '</td></tr>';
    });
    return h + '</tbody></table></div><p class="hn-note">From the week a player was first cut that season, everything the player scored in ' +
      'other teams’ starting lineups. One row per player: everyone who cut them is named, with the week of the cut.</p></div>';
  }

  function season(s, y, st) {
    if (!s) return '<p class="hn-empty">No ' + esc(y) + ' season on file.</p>';
    var P = s.P;
    var h = '';
    if (!s.faab) {
      h += '<p class="fb-flag"><b>No FAAB in ' + esc(y) + '.</b> ' +
        (s.firstFaab ? 'The league didn’t bid on players until ' + esc(s.firstFaab) + '; claims' : 'Claims') +
        ' went by waiver priority, so these receipts have points but no prices.</p>';
    } else if (!s.final) {
      var k = num(s.through) || 0, pend = P.filter(function (p) { return !played(p); }).length;
      if (!k) {
        h += '<p class="fb-flag"><b>Week 1 isn’t final.</b> ' +
          (pend ? plural(pend, 'pickup is', 'pickups are') + ' in; they score once it is.' : 'Nothing has scored yet.') + '</p>';
      } else {
        h += '<p class="fb-flag"><b>' + (WORDS[k] || k) + ' week' + (k === 1 ? '' : 's') + ' in.</b> ' +
          (pend ? plural(pend, 'pickup has', 'pickups have') + ' been made since Week ' + k + ' ended; they score once Week ' + (k + 1) + ' is final.'
            : 'Everything here is through Week ' + k + '.') + '</p>';
      }
    }
    if (!P.length) return h + '<p class="hn-empty">No pickups in ' + esc(y) + ' yet.</p>';
    return h + kpis(s, P) + ledger(s, P, st.who) + receipts(s, P, st) + (s.faab ? worstCard(s, P) : '') + awayCard(s) +
      '<p class="hn-note">Started points count only the starting lineup in games that counted: every regular-season week and the playoff bracket. ' +
      'Bench weeks, consolation games and playoff byes are worth nothing. A pickup belongs to the week the player joined; ' +
      'Yahoo turns the week over overnight, Monday into Tuesday.</p>';
  }

  HN.tabs.faab = function (el) {
    style();
    el.innerHTML = '<p class="hn-empty">Loading…</p>';
    HN.data('faab').then(function (d) {
      if (!d || !d.seasons) return HN.fail(el);
      var years = Object.keys(d.seasons).sort(function (a, b) { return b - a; });
      if (!years.length) return HN.fail(el);
      var firstFaab = years.filter(function (y) { return d.seasons[y].faab; }).sort()[0] || null;
      years.forEach(function (y) {
        var s = d.seasons[y];
        s.P = unpack(d.cols || [], s.pickups);
        s.top = s.top || []; s.worst = s.worst || []; s.managers = s.managers || [];
        s.managers.forEach(function (m) {
          if (num(m.done) == null) m.done = s.P.filter(function (p) { return p.m === m.m && played(p); }).length;
        });
        s.minBid = d.min_bid == null ? 10 : d.min_bid;
        s.firstFaab = firstFaab;
      });
      var on = d.seasons[d.current] ? String(d.current) : years[0];
      var st = { who: null, all: false };
      el.innerHTML = '<p class="hn-intro">Every waiver claim and free-agent add since ' + esc(years[years.length - 1]) +
        ', with the receipt: what it cost and what it put in a starting lineup. ' +
        'Bench points, consolation games and playoff byes count for nothing, same as they did at the time.</p>' +
        '<div class="fb-bar"></div><div class="fb-season"></div>';
      var bar = el.querySelector('.fb-bar'), box = el.querySelector('.fb-season');
      var tag = document.createElement('span'); tag.className = 'fb-when';
      function when(y) {
        var s = d.seasons[y] || {};
        if (s.final) return 'Final · ' + plural(s.P.length, 'pickup');
        return num(s.through) ? 'Through week ' + s.through : 'Week 1 not final';
      }
      // redraw, then put keyboard focus back on the control that caused it
      function draw(focus) {
        box.innerHTML = season(d.seasons[on], on, st);
        if (!focus) return;
        var hit = null;
        [].forEach.call(box.querySelectorAll(focus.sel), function (b) {
          if (!focus.m || b.getAttribute('data-m') === focus.m) hit = hit || b;
        });
        if (hit) { try { hit.focus({ preventScroll: true }); } catch (e) { hit.focus(); } }
      }
      function show(y) { on = String(y); st.who = null; st.all = false; tag.textContent = when(on); draw(); }
      box.addEventListener('click', function (e) {
        var t = e.target, was = st.who;
        if (t.closest('[data-clear]')) { st.who = null; draw({ sel: '.fb-pick', m: was }); return; }
        if (t.closest('[data-all]')) { st.all = !st.all; draw({ sel: '[data-all]' }); return; }
        var tr = t.closest('.fb-led tbody tr');
        if (tr) pick(tr.getAttribute('data-m'), !!t.closest('.fb-pick'));
      });
      function pick(m, fromButton) {
        st.who = st.who === m ? null : m;
        draw(fromButton ? { sel: '.fb-pick', m: m } : null);
        var r = box.querySelector('.fb-rec');
        if (st.who && r && r.scrollIntoView) {
          // land below the sticky site header, not under it
          var hd = document.querySelector('header');
          r.style.scrollMarginTop = ((hd ? hd.offsetHeight : 64) + 12) + 'px';
          r.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      bar.appendChild(HN.seg(years, on, show));
      bar.appendChild(tag);
      show(on);
    }).catch(function (e) {
      if (e && window.console) console.error('faab:', e);
      HN.fail(el, 'FAAB Receipts aren’t built yet.');
    });
  };
})(window.HN);
