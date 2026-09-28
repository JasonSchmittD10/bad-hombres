// Hard Numbers — Trade Court: every trade in league history, re-judged by what the players
// did for their new team. Data: /data/numbers/trades.json, built by scripts/hn/trades.py.
(function (HN) {
  var CSS = [
    '#hn-trades .tc-ctl{display:flex;align-items:center;justify-content:center;gap:10px;flex-wrap:wrap;margin:0 0 16px}',
    '#hn-trades .hn-kpis{grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}',
    '#hn-trades .hn-kpi b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#hn-trades .hn-kpi b .hn-face{width:22px;height:22px;margin-right:7px;vertical-align:-3px}',
    '#hn-trades .hn-kpi em .hn-face{width:18px;height:18px;margin-right:5px;vertical-align:-4px}',
    '#hn-trades .tc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:14px;margin-bottom:16px;align-items:start}',
    '#hn-trades .tc-grid .hn-card{margin:0;min-width:0}',
    '#hn-trades .tc-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px;font-size:11px;font-weight:800;',
    ' letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}',
    '#hn-trades .tc-tag{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}',
    '#hn-trades .tc-tag i{font-style:normal;border:1px solid var(--line);border-radius:10px;padding:2px 8px;font-size:10px;letter-spacing:.1em}',
    '#hn-trades .tc-tag i.tc-pend{color:var(--gold);border-color:rgba(232,184,75,.45)}',
    '#hn-trades .tc-tag i.tc-top1{color:#fff;background:var(--red);border-color:var(--red)}',
    '#hn-trades .tc-tag i.tc-vet{color:#ff6b76;border-color:rgba(255,107,118,.45)}',
    '#hn-trades .tc-deal{margin:0 0 12px;font-size:14px;line-height:1.6;color:var(--silver);overflow-wrap:anywhere}',
    '#hn-trades .tc-side{display:block}',
    '#hn-trades .tc-side+.tc-side{margin-top:5px}',
    '#hn-trades .tc-deal .tc-who{color:#fff;font-weight:800;white-space:nowrap}',
    '#hn-trades .tc-deal .hn-face{width:22px;height:22px;margin-right:6px}',
    '#hn-trades .tc-deal .tc-v{color:var(--silver);font-weight:400}',
    '#hn-trades .tc-deal .tc-p{color:#fff;white-space:nowrap}',
    '#hn-trades .tc-split{display:flex;height:10px;border-radius:6px;overflow:hidden;background:var(--panel-2);gap:2px}',
    '#hn-trades .tc-split i{display:block;height:100%;background:#3a3a44;min-width:2px}',
    '#hn-trades .tc-split i.tc-win{background:var(--red)}',
    '#hn-trades .tc-card.tc-pending .tc-split i.tc-win{background:var(--gold)}',
    '#hn-trades .tc-nums{display:flex;justify-content:space-between;gap:10px;margin:7px 0 0;font-size:12.5px;color:var(--muted)}',
    '#hn-trades .tc-nums b{font-variant-numeric:tabular-nums;color:var(--silver);font-size:14px}',
    '#hn-trades .tc-nums .tc-w b{color:#fff}',
    '#hn-trades .tc-nums span:last-child{text-align:right}',
    '#hn-trades .tc-verdict{margin:10px 0 0;font-size:13.5px;color:var(--silver)}',
    '#hn-trades .tc-verdict b{color:#fff}',
    '#hn-trades .tc-card.tc-pending .tc-verdict{color:var(--gold)}',
    '#hn-trades details.tc-ev{margin:10px 0 0;border-top:1px solid var(--line);padding-top:8px}',
    '#hn-trades details.tc-ev summary{cursor:pointer;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}',
    '#hn-trades details.tc-ev summary:hover{color:#fff}',
    '#hn-trades .tc-evs{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:10px}',
    '#hn-trades .tc-evs>div{min-width:0}',
    '#hn-trades .tc-evh{font-size:12.5px;font-weight:800;color:#fff;margin:0 0 4px}',
    '#hn-trades .tc-evh .hn-face{width:20px;height:20px;margin-right:6px}',
    '#hn-trades .tc-t{font-size:12.5px}',
    '#hn-trades .tc-t th,#hn-trades .tc-t td{padding:6px 5px}',
    '#hn-trades .tc-t th{letter-spacing:.06em}',
    '#hn-trades .tc-t td.tc-pl{color:#fff;white-space:normal;min-width:110px;padding-left:0}',
    '#hn-trades .tc-t td.tc-pl small{display:block;color:var(--muted);font-size:11px;font-weight:600}',
    '#hn-trades .tc-t tfoot td{border-top:1px solid var(--line);border-bottom:0;color:#fff;font-weight:800}',
    '#hn-trades .tc-t tfoot td:first-child{padding-left:0}',
    '#hn-trades .tc-sub{margin:4px 0 0;font-size:11.5px;color:var(--muted)}',
    '#hn-trades .tc-veto{border-style:dashed}',
    '#hn-trades .tc-veto .tc-verdict{color:var(--muted)}',
    '#hn-trades .tc-led th:first-child,#hn-trades .tc-led td.who{position:sticky;left:0;z-index:1;background:var(--panel)}',
    '#hn-trades .tc-led tbody tr:hover td.who{background:var(--panel-2)}',
    '#hn-trades .tc-led td.tc-net{font-weight:800}',
    '#hn-trades .tc-method p{margin:0 0 6px}',
    '@media (max-width:520px){#hn-trades .tc-grid .hn-card{padding:14px 13px}',
    ' #hn-trades .tc-t{font-size:12px}#hn-trades .tc-t th{font-size:9.5px;letter-spacing:.02em}',
    ' #hn-trades .tc-t th,#hn-trades .tc-t td{padding:6px 3px}#hn-trades .tc-t td.tc-pl{min-width:92px;padding-left:0}',
    ' #hn-trades .tc-led th,#hn-trades .tc-led td{padding-left:8px;padding-right:8px}}',
    '@media (max-width:440px){#hn-trades .tc-ctl .hn-seg button{padding:6px 7px;letter-spacing:.03em}}',
    '@media (max-width:340px){#hn-trades .tc-t td.tc-pl{min-width:0}#hn-trades .tc-t th,#hn-trades .tc-t td{padding:6px 2px}',
    ' #hn-trades .tc-ctl .hn-seg button{padding:6px 5px;letter-spacing:0}}'
  ].join('\n');

  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  // "2025-09-12" -> "Sep 12" (the date string is already Eastern time; no Date() parsing)
  function md(d) { var p = String(d || '').split('-'); return p.length === 3 ? MON[+p[1] - 1] + ' ' + (+p[2]) : ''; }
  // points to Yahoo's precision (2 decimals), so every total, margin and net adds up on the page
  function pts(v) { return HN.num(v == null ? 0 : v, 2); }
  function net(v) { return HN.signed(v == null ? 0 : v, 2); }
  function plural(k, one, many) { return k + ' ' + (k === 1 ? one : many); }
  function word(k) { return WORDS[k] || String(k); }
  function pname(pl) { return (pl && pl.name ? pl.name : 'Unknown player') + (pl && pl.pos === 'DEF' ? ' DEF' : ''); }
  // today's date in Eastern time, "YYYY-MM-DD" (compares as a string against the deadline)
  function today() {
    try { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); } catch (e) {
      var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    }
  }

  // one line per side: "<face> Chris gets Ja'Marr Chase, Lamar Jackson"
  function deal(sides, verb) {
    return sides.map(function (sd) {
      var ps = (sd.players || []).map(function (pl) { return '<span class="tc-p">' + HN.esc(pname(pl)) + '</span>'; });
      return '<span class="tc-side"><span class="tc-who">' + HN.who(sd.who) + ' <span class="tc-v">' + verb + '</span></span> ' +
        (ps.length ? ps.join(', ') : 'nothing') + '</span>';
    }).join('');
  }

  // his time on the new roster: "from Wk 9 · cut after Wk 10 · re-added Wk 13 · cut after Wk 14"
  function path(pl) {
    var st = pl.stints || [], out = [];
    if (!st.length) return pl.left === 'traded' ? 'flipped before he played for them'
      : pl.left === 'cut' ? 'cut before he played for them' : 'not on the new roster in a finished week yet';
    st.forEach(function (s, i) {
      out.push((i ? 're-added Wk\u00a0' : 'from Wk\u00a0') + s[0]);
      if (s[2]) out.push((s[2] === 'traded' ? 'traded away' : s[2] === 'cut' ? 'cut' : 'gone') + ' after Wk\u00a0' + s[1]);
    });
    return out.join(' · ');
  }

  function evidence(sd) {
    var rows = (sd.players || []).map(function (pl) {
      var bits = [pl.pos || '', path(pl)].filter(Boolean);
      return '<tr><td class="tc-pl">' + HN.esc(pname(pl)) + '<small>' + HN.esc(bits.join(' · ')) + '</small></td>' +
        '<td class="n">' + (pl.wks || 0) + '</td><td class="n">' + (pl.starts || 0) + '</td>' +
        '<td class="n">' + pts(pl.started) + '</td><td class="n">' + pts(pl.total) + '</td></tr>';
    }).join('');
    return '<div><p class="tc-evh">' + HN.who(sd.who) + ' got</p><div class="hn-scroll"><table class="hn-table tc-t">' +
      '<thead><tr><th>Player</th><th class="n">Wks</th><th class="n">Starts</th><th class="n">Started</th><th class="n">Rostered</th></tr></thead>' +
      '<tbody>' + rows + '</tbody><tfoot><tr><td>Total</td><td class="n"></td><td class="n"></td><td class="n">' + pts(sd.started) +
      '</td><td class="n">' + pts(sd.total) + '</td></tr></tfoot></table></div>' +
      '<p class="tc-sub">Started: ' + pts(sd.reg) + ' regular season · ' + pts(sd.po) + ' playoffs</p></div>';
  }

  function verdict(t, D) {
    var a = t.sides[0], b = t.sides[1];
    if (t.status === 'pending') {
      var need = D.pending_weeks || 3;
      if (t.week == null) return 'Pending. No finished week of evidence yet.';
      return 'Pending: ' + plural(t.weeks || 0, 'week', 'weeks') + ' of evidence. Verdict after Week ' + (t.week + need - 1) + '.';
    }
    if (t.winner == null) return (a.started || 0) === 0 && (b.started || 0) === 0
      ? 'Neither side started anybody it got. No ruling.' : 'Dead even. No ruling.';
    return 'The court finds for <b>' + HN.esc(t.sides[t.winner].who) + '</b>, by ' + pts(t.margin) + '.';
  }

  function card(t, D, topId) {
    var a = t.sides[0], b = t.sides[1], sa = Math.max(0, a.started || 0), sb = Math.max(0, b.started || 0);
    var pa = sa + sb > 0 ? sa / (sa + sb) * 100 : 50, lead = sa > sb ? 0 : sb > sa ? 1 : -1;
    var pend = t.status === 'pending';
    var tags = (topId && t.id === topId ? '<i class="tc-top1">Most lopsided</i>' : '') + (pend ? '<i class="tc-pend">Pending</i>' : '');
    return '<article class="hn-card tc-card' + (pend ? ' tc-pending' : '') + '">' +
      '<div class="tc-top"><span>' + t.season + (t.week ? ' · Week ' + t.week : '') + ' · ' + HN.esc(md(t.date)) + '</span>' +
      (tags ? '<span class="tc-tag">' + tags + '</span>' : '') + '</div>' +
      '<p class="tc-deal">' + deal(t.sides, 'gets') + '</p>' +
      '<div class="tc-split" role="img" aria-label="' + HN.esc(a.who + ' ' + pts(sa) + ', ' + b.who + ' ' + pts(sb) + ' started points') + '">' +
      '<i' + (lead === 0 ? ' class="tc-win"' : '') + ' style="width:' + pa.toFixed(1) + '%"></i>' +
      '<i' + (lead === 1 ? ' class="tc-win"' : '') + ' style="width:' + (100 - pa).toFixed(1) + '%"></i></div>' +
      '<div class="tc-nums"><span' + (lead === 0 ? ' class="tc-w"' : '') + '>' + HN.esc(a.who) + ' <b>' + pts(sa) + '</b></span>' +
      '<span' + (lead === 1 ? ' class="tc-w"' : '') + '><b>' + pts(sb) + '</b> ' + HN.esc(b.who) + '</span></div>' +
      '<p class="tc-verdict">' + verdict(t, D) + '</p>' +
      '<details class="tc-ev"><summary>The evidence</summary><div class="tc-evs">' + evidence(a) + evidence(b) + '</div></details>' +
      '</article>';
  }

  function vetoCard(v) {
    return '<article class="hn-card tc-card tc-veto"><div class="tc-top"><span>' + v.season + ' · ' + HN.esc(md(v.date)) +
      '</span><span class="tc-tag"><i class="tc-vet">Vetoed</i></span></div>' +
      '<p class="tc-deal">' + deal(v.sides || [], 'would have gotten') + '</p>' +
      '<p class="tc-verdict">The league blocked it. Never happened, never judged.</p></article>';
  }

  function kpi(label, value, sub) {
    return '<div class="hn-kpi"><span>' + label + '</span><b>' + value + '</b>' + (sub ? '<em>' + sub + '</em>' : '') + '</div>';
  }

  function kpis(k, key, D) {
    var yrs = D.seasons || [], out = [];
    var span = key === 'all' ? (yrs.length ? yrs[0] + '–' + yrs[yrs.length - 1] : '') : '';
    var sub = [];
    if (k.pending) sub.push(k.pending + ' pending');
    if (k.vetoed) sub.push('plus ' + k.vetoed + ' vetoed');
    if (!sub.length) sub.push(span || 'all judged');
    out.push(kpi('Trades', String(k.count || 0), HN.esc(sub.join(' · '))));
    if (k.lopsided) out.push(kpi('Most lopsided', '+' + pts(k.lopsided.margin),
      HN.face(k.lopsided.winner) + HN.esc(k.lopsided.winner + ' over ' + k.lopsided.loser + ', ' + k.lopsided.season)));
    if (k.active) out.push(k.active.names.length === 1
      ? kpi('Most active', HN.who(k.active.names[0]), plural(k.active.count, 'trade', 'trades'))
      : kpi('Most active', k.active.names.length + '-way tie', HN.esc(plural(k.active.count, 'trade', 'trades') + ' each: ' + k.active.names.join(', '))));
    if (k.best) out.push(kpi('Best trader', HN.who(k.best.who), HN.esc(net(k.best.net) + ' net')));
    if (k.worst) out.push(kpi('Worst trader', HN.who(k.worst.who), HN.esc(net(k.worst.net) + ' net')));
    if (k.proposer) out.push(kpi('Proposers', k.proposer.won + '–' + k.proposer.lost + (k.proposer.tied ? '–' + k.proposer.tied : ''),
      (k.proposer.tied ? 'W–L–T' : 'W–L') + ' for the side that made the offer'));
    return '<div class="hn-kpis">' + out.join('') + '</div>';
  }

  // Net right after the name, so it's on screen on a phone without scrolling the table
  function ledger(rows, idle, key) {
    if (!rows || !rows.length) return '';
    var tied = rows.some(function (r) { return r.tied; }), pend = rows.some(function (r) { return r.pending; });
    var head = '<tr><th>Manager</th><th class="n">Net</th><th class="n">Trades</th><th class="n">' + (tied ? 'W–L–T' : 'W–L') + '</th>' +
      (pend ? '<th class="n">Pending</th>' : '') + '<th class="n">Pts in</th><th class="n">Pts out</th></tr>';
    var body = rows.map(function (r) {
      var judged = r.trades > (r.pending || 0);
      var cls = r.net > 0.005 ? 'hn-good' : r.net < -0.005 ? 'hn-bad' : 'hn-mute';
      var rec = (r.won || 0) + '–' + (r.lost || 0) + (tied ? '–' + (r.tied || 0) : '');
      return '<tr><td class="who">' + HN.who(r.who) + '</td>' +
        (judged ? '<td class="n tc-net ' + cls + '">' + HN.esc(net(r.net)) + '</td>' : '<td class="n hn-mute">—</td>') +
        '<td class="n">' + r.trades + '</td><td class="n">' + (judged ? rec : '—') + '</td>' +
        (pend ? '<td class="n">' + (r.pending || 0) + '</td>' : '') +
        (judged ? '<td class="n">' + pts(r.pin) + '</td><td class="n">' + pts(r.pout) + '</td>'
          : '<td class="n hn-mute">—</td><td class="n hn-mute">—</td>') + '</tr>';
    }).join('');
    var never = idle && idle.length ? '<p class="hn-note">Never made a trade' + (key === 'all' ? '' : ' in ' + HN.esc(key)) + ': ' +
      HN.esc(idle.join(', ')) + '.</p>' : '';
    return '<div class="hn-card"><h3 class="hn-h">The ledger <small>' + (key === 'all' ? 'all seasons' : HN.esc(key)) + '</small></h3>' +
      '<div class="hn-scroll"><table class="hn-table tc-led"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>' + never + '</div>';
  }

  // the method, with the rule's numbers taken from the data
  function method(D) {
    var po = D.playoffs || {}, spans = {}, need = D.pending_weeks || 3, vet = D.vetoed || [];
    Object.keys(po).forEach(function (y) { if (po[y] && po[y].length === 2) spans[po[y][0] + '–' + po[y][1]] = 1; });
    var one = Object.keys(spans), weeks = one.length === 1 ? 'Weeks ' + one[0] : 'the playoff weeks';
    var vyrs = vet.map(function (v) { return v.season; }).filter(function (y, i, a) { return a.indexOf(y) === i; });
    var vnote = !vet.length ? '' : vet.length === 1 ? ' The one vetoed trade, in ' + vyrs[0] + ', is listed and never judged.'
      : ' The ' + word(vet.length) + ' vetoed trades (' + vyrs.join(', ') + ') are listed and never judged.';
    return '<div class="hn-note tc-method">' +
      '<p><b>Started points:</b> what each player a side received scored in that side’s starting lineup (bench and IR don’t count), in every week he sat on the new roster from the week the trade took effect to the end of that season. Cut and picked back up by the same team, he counts again once he’s back; brought back by a later trade, he counts for that trade instead.</p>' +
      '<p><b>Only games that counted:</b> every regular-season week, plus the team’s own championship-bracket games in ' + weeks + '; consolation games and playoff byes are skipped. The evidence splits the two.</p>' +
      '<p><b>Verdict:</b> the side whose incoming players started for more points wins, by the difference. A trade this season with fewer than ' + word(need) + ' finished weeks behind it is pending.</p>' +
      '<p><b>When a trade took effect</b> comes from the weekly rosters, not the timestamp: the first week the player shows up on the new roster. Yahoo’s rosters are end-of-week snapshots, so Wks and Rostered count that whole week, even when his game came before the trade went through.</p>' +
      '<p><b>Rostered:</b> all his points on the new roster over the same weeks, started or not. <b>Ledger:</b> Pts in is what a manager’s incoming players started for him, Pts out is what his outgoing players started for the other guy, Net is the difference; pending trades are left out.</p>' +
      '<p><b>Proposers:</b> judged trades won, lost and even for the side that sent the offer.' + vnote + '</p></div>';
  }

  HN.tabs.trades = function (el) {
    if (!document.getElementById('hn-trades-css')) {
      var st = document.createElement('style'); st.id = 'hn-trades-css'; st.textContent = CSS; document.head.appendChild(st);
    }
    HN.data('trades').then(function (D) {
      var season = 'all', sort = 'new';
      var trades = D.trades || [], vetoed = D.vetoed || [], yrs = (D.seasons || []).slice().reverse();
      el.innerHTML = '<p class="hn-intro">Every trade since ' + HN.esc(String((D.seasons || [])[0] || '')) +
        ', re-tried on the only evidence that matters: points scored in the new owner’s starting lineup. No appeals.</p>' +
        '<div class="tc-ctl"></div><div class="tc-body"></div>' + method(D);
      var ctl = el.querySelector('.tc-ctl'), body = el.querySelector('.tc-body');
      ctl.appendChild(HN.seg([{ v: 'all', l: 'All' }].concat(yrs.map(String)), season, function (v) { season = String(v); draw(); }));
      ctl.appendChild(HN.seg([{ v: 'new', l: 'Newest' }, { v: 'old', l: 'Oldest' }, { v: 'big', l: 'Most lopsided' }], sort, function (v) { sort = v; draw(); }));

      function draw() {
        var list = trades.filter(function (t) { return season === 'all' || String(t.season) === season; });
        var vs = vetoed.filter(function (v) { return season === 'all' || String(v.season) === season; });
        if (!list.length && !vs.length) {
          var dl = D.deadline && D.deadline[season], cur = season === String(D.current), open = dl && dl >= today();
          body.innerHTML = '<div class="hn-card"><p class="hn-empty">' + (!cur
            ? 'No trades in ' + HN.esc(season) + '. The court had the year off.'
            : 'The ' + HN.esc(season) + ' docket is empty. ' + (!dl ? 'Nobody has traded anybody.'
              : open ? 'Nobody has traded anybody yet. The deadline is ' + HN.esc(md(dl)) + '.'
              : 'Nobody traded anybody, and the deadline came and went on ' + HN.esc(md(dl)) + '.')) + '</p></div>';
          return;
        }
        // trades and vetoed deals in one docket: by date (then Yahoo's transaction number) for
        // Newest/Oldest, vetoed last for Most lopsided
        var seq = function (x) { return +String(x.id || '').split('-')[1] || 0; };
        var items = list.map(function (t, i) { return { d: t.date, n: seq(t), i: i, t: t }; })
          .concat(vs.map(function (v, i) { return { d: v.date, n: seq(v), i: list.length + i, v: v }; }));
        if (sort === 'big') items.sort(function (x, y) {
          var rx = x.v ? 2 : x.t.status === 'pending' ? 1 : 0, ry = y.v ? 2 : y.t.status === 'pending' ? 1 : 0;
          return rx - ry || (rx === 0 ? (y.t.margin || 0) - (x.t.margin || 0) : 0) || x.i - y.i;
        });
        else {
          items.sort(function (x, y) { return x.d < y.d ? 1 : x.d > y.d ? -1 : (y.n - x.n) || (x.i - y.i); });
          if (sort === 'old') items.reverse();
        }
        var k = (D.kpis || {})[season] || {}, topId = k.lopsided ? k.lopsided.id : null;
        body.innerHTML = kpis(k, season, D) +
          '<div class="tc-grid">' + items.map(function (it) { return it.v ? vetoCard(it.v) : card(it.t, D, topId); }).join('') + '</div>' +
          ledger((D.ledger || {})[season], (D.idle || {})[season], season);
      }
      draw();
    }).catch(function () { HN.fail(el, 'The trade numbers aren’t built yet.'); });
  };
})(window.HN);
