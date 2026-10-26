/* The homepage — the Jumbotron. Every module draws itself from the data files and the
   live APIs, so a new week never touches index.html (scripts/UPDATE_WEEK.md, "The homepage").

     data/week.json          the week, its status, scores, projections, bonus leaders and the
                             next kickoff (the scoreboard task, scripts/sync.py)
     /api/scoreboard         the same, live from Yahoo, plus each side's win probability
     /api/pulse?week=N       win probability over the week (the Game of the Week pulse)
     /api/picks              the pick'em tally once picks lock
     data/voices.json        the Game of the Week, Pastor Wes's lock and its pull quote,
                             Zack's Luck Index
     data/season.json        standings, Power Lines ranks, trades, bank
     data/numbers/odds.json  playoff and Beer Mile odds
     data/record.json        every game: standings movement, the best single week
     data/history.json       series, career records, rings, money lines
     data/stories.json       The Booth (the lead story is the static <a class="feature">,
                             written by scripts/publish-story.py)
     data/home.json          the week's one-liners (scripts/home.py); a missing or expired
                             line just hides
     BH_BONUSES, BH_AWARD_WINNERS, BH_SEASON_AWARDS — inline in index.html

   The hero follows the week: picks open (status "preseason") -> live -> final. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  if (!$('hero') || !window.fetch) return;

  var FILES = {
    week: '/data/week.json', voices: '/data/voices.json', season: '/data/season.json',
    odds: '/data/numbers/odds.json', record: '/data/record.json', history: '/data/history.json',
    stories: '/data/stories.json', home: '/data/home.json'
  };
  var D = {}, S = { mode: null, chosen: false, charts: false, bonusMode: null, bbView: 'weekly', focus: null, plOpen: false };
  var BONUSES = window.BH_BONUSES || [], WINNERS = window.BH_AWARD_WINNERS || {}, RACES = window.BH_SEASON_AWARDS || [];
  var TZ = 'America/New_York';
  // the Power Lines palette, by data/season.json team order (scripts/social-render.py keeps a copy)
  var COLORS = ['#e8b84b', '#3fb26b', '#5aa9e6', '#c1121f', '#b07de0', '#f0803c',
    '#4ecdc4', '#ef6f8e', '#8ea1b8', '#d4d94a', '#7c86e0', '#e0724d'];
  var NFL = { ARI: 'Cardinals', ATL: 'Falcons', BAL: 'Ravens', BUF: 'Bills', CAR: 'Panthers', CHI: 'Bears',
    CIN: 'Bengals', CLE: 'Browns', DAL: 'Cowboys', DEN: 'Broncos', DET: 'Lions', GB: 'Packers', HOU: 'Texans',
    IND: 'Colts', JAX: 'Jaguars', KC: 'Chiefs', LV: 'Raiders', LAC: 'Chargers', LAR: 'Rams', MIA: 'Dolphins',
    MIN: 'Vikings', NE: 'Patriots', NO: 'Saints', NYG: 'Giants', NYJ: 'Jets', PHI: 'Eagles', PIT: 'Steelers',
    SF: '49ers', SEA: 'Seahawks', TB: 'Buccaneers', TEN: 'Titans', WSH: 'Commanders' };

  /* ------------------------------------------------------------------ helpers */
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  function n2(v) { return (v == null || isNaN(v)) ? '—' : Number(v).toFixed(2); }
  // 20,000 simulated seasons prove nothing at the extremes: never print 0% or 100%
  function pct(p) { return typeof p !== 'number' ? '–' : p < 0.005 ? '<1%' : p >= 0.995 ? '>99%' : Math.round(p * 100) + '%'; }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function money(v) { v = Number(v) || 0; return '$' + (v % 1 ? v.toFixed(2) : String(v)); }
  function rec(t) { return t.w + '-' + t.l + (t.tie ? '-' + t.tie : ''); }
  function enc(m) { return encodeURIComponent(m); }
  function profile(m) { return '/members/profile/?m=' + enc(m); }
  function photo(m) { return '/assets/members/thumb/' + enc(m) + '.jpg'; }
  function cut(m) { return '/assets/members/cutout/' + enc(m) + '.svg'; }
  function av(m, cls) {
    return '<img class="av' + (cls ? ' ' + cls : '') + '" src="' + photo(m) + '" alt="" loading="lazy" ' +
      'onerror="this.onerror=null;this.src=\'/assets/icon.png\'">';
  }
  function avs(list, cls) { return '<span class="avs">' + list.map(function (m) { return av(m, cls); }).join('') + '</span>'; }
  function tile(m, color, cls) {
    return '<span class="tile ' + color + (cls ? ' ' + cls : '') + '"><img src="' + cut(m) + '" alt="' + esc(m) + '" loading="lazy" ' +
      'onerror="this.onerror=null;this.src=\'' + photo(m) + '\';this.className=\'ph\'"></span>';
  }
  function chip(txt, cls) { return '<span class="chip' + (cls ? ' ' + cls : '') + '">' + esc(txt) + '</span>'; }
  function et(iso, opts) { opts.timeZone = TZ; return new Date(iso).toLocaleString('en-US', opts); }
  function clockT(iso) { return et(iso, { hour: 'numeric', minute: '2-digit' }); }
  function dayT(iso) { return et(iso, { weekday: 'short' }); }
  function longDay(iso) { return et(iso, { weekday: 'short', month: 'short', day: 'numeric' }); }
  function get(u) {
    return fetch(u, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }).catch(function () { return null; });
  }
  function names(pair) { return String(pair || '').split(/\s*&\s*|\s*,\s*|\s+and\s+/).filter(Boolean); }

  /* ------------------------------------------------------------------ the week */
  function wk() { return D.live || D.week || {}; }
  function N() { return Number(wk().week) || 1; }
  function status() { return wk().status || 'preseason'; }
  function state() { var s = status(); return s === 'final' ? 'final' : s === 'live' ? 'live' : 'preview'; }
  function gotwOf(n) { return ((D.voices && D.voices.gotw) || []).filter(function (g) { return g.week === n; })[0] || null; }
  function lines(n) { var h = D.home && D.home.weeks; return (h && h[String(n)]) || {}; }
  // a one-liner: a string, or {text, until} that hides once until passes
  function line(n, key) {
    var v = lines(n)[key]; if (!v) return '';
    if (typeof v === 'string') return v;
    if (v.until && new Date(v.until) <= new Date()) return '';
    return v.text || '';
  }
  function matchups() { return wk().matchups || []; }
  function findMu(a, b) {
    var ms = matchups(), i, m;
    for (i = 0; i < ms.length; i++) {
      m = ms[i];
      if (m.a.m === a && m.b.m === b) return { a: m.a, b: m.b };
      if (m.a.m === b && m.b.m === a) return { a: m.b, b: m.a };
    }
    return null;
  }
  function featured() {
    // the recorded Game of the Week; before one exists, the closest projected game
    var g = gotwOf(N()), mu = g && findMu(g.a, g.b);
    if (mu) return { g: g, mu: mu };
    var ms = matchups().slice().sort(function (x, y) { return Math.abs(x.a.p - x.b.p) - Math.abs(y.a.p - y.b.p); });
    return ms.length ? { g: null, mu: { a: ms[0].a, b: ms[0].b } } : null;
  }
  // the formula's stakes labels (scripts/bh_league.py watchability) read as headlines; anything
  // else — a rivalry, a streak, a hand-picked storyline — is a dek, under "A vs. B"
  var STAKES = { 'beer mile bowl': 'The Beer Mile Bowl', 'first place on the line': 'First Place on the Line',
    'the playoff line': 'The Playoff Line', 'top of the table': 'Top of the Table' };
  function stakesTitle(g) { return g && g.reason ? STAKES[g.reason.toLowerCase()] || '' : ''; }
  function gTitle(g, mu) { return line(N(), 'title') || stakesTitle(g) || mu.a.m + ' vs. ' + mu.b.m; }
  function reasonDek(g) {
    return g && g.reason && !stakesTitle(g) && !/projected|within/i.test(g.reason) ? 'Why it’s the Game of the Week: ' + g.reason.replace(/\.$/, '') + '.' : '';
  }

  /* ------------------------------------------------------------------ league tables */
  function teams() { return (D.season && D.season.teams) || []; }
  function ordered() {
    var ts = teams().slice(), pre = (D.season && D.season.ranks && D.season.ranks[0] && D.season.ranks[0].order) || [];
    if (!ts.some(function (t) { return t.w + t.l + (t.tie || 0) > 0; }))
      return ts.sort(function (a, b) { return pre.indexOf(a.m) - pre.indexOf(b.m); });
    return ts.sort(function (a, b) { var d = (b.w + (b.tie || 0) / 2) - (a.w + (a.tie || 0) / 2); return d || (b.pf || 0) - (a.pf || 0); });
  }
  function team(m) { return teams().filter(function (t) { return t.m === m; })[0] || null; }
  function rankOf(m) { var o = ordered(), i; for (i = 0; i < o.length; i++) if (o[i].m === m) return i + 1; return null; }
  function oddsOn() {
    var o = D.odds;
    return !!(o && o.baseline && o.through_week >= 1 && o.through_week < (o.reg_weeks || 14) &&
      (!D.record || String(o.season) === String(D.record.current || o.season)));
  }
  function odds(m) { return (oddsOn() && D.odds.baseline[m]) || null; }
  function code(m) { var h = (D.history && D.history.managers) || {}, k; for (k in h) if (h[k] === m) return k; return null; }
  function prof(m) { var c = code(m); return (c && D.history && D.history.profiles && D.history.profiles[c]) || null; }
  function rings(m) {
    var c = code(m), n = 0;
    ((D.history && D.history.awards) || []).forEach(function (a) { if (a.type === 'place' && a.place === 1 && (a.who || []).indexOf(c) >= 0) n++; });
    return n;
  }
  function vs(a, b) { var p = prof(a); return (p && p.vs && p.vs[b]) || null; }
  function series(a, b, long) {
    var r = vs(a, b); if (!r || !(r.w + r.l + (r.t || 0))) return 'First meeting';
    var t = r.t ? '-' + r.t : '';
    if (r.w === r.l) return 'Series tied ' + r.w + '-' + r.l + t;
    return (r.w > r.l ? a + ' leads ' + (long ? 'the series ' : '') + r.w + '-' + r.l : b + ' leads ' + (long ? 'the series ' : '') + r.l + '-' + r.w) + t;
  }
  function chipsFor(m, mirror) {
    var out = [], r = rankOf(m), t = team(m), o = odds(m), k = rings(m), extra = '';
    if (r && t) out.push(chip(ord(r) + ' · ' + rec(t)));
    if (o && o.last >= 0.15) extra = chip('Beer Mile ' + pct(o.last), 'red');
    else if (k) extra = chip(k + '× Champ', 'gold');
    else if (o && o.playoffs >= 0.5) extra = chip('Playoffs ' + pct(o.playoffs), 'green');
    if (extra) out.push(extra);
    return (mirror ? out.reverse() : out).join('');
  }
  // the standings as they stood after an earlier week, from the game log
  function tableAfter(k) {
    var r = D.record; if (!r || !r.weeks) return null;
    var y = String(r.current || ''), games = (r.weeks[y] || []).slice(0, k), M = r.managers || {}, t = {};
    games.forEach(function (g) {
      g.forEach(function (x) {
        var a = M[x[0]] || x[0], b = M[x[2]] || x[2];
        [a, b].forEach(function (m) { t[m] = t[m] || { m: m, w: 0, l: 0, tie: 0, pf: 0 }; });
        t[a].pf += x[1]; t[b].pf += x[3];
        if (x[1] > x[3]) { t[a].w++; t[b].l++; } else if (x[1] < x[3]) { t[b].w++; t[a].l++; } else { t[a].tie++; t[b].tie++; }
      });
    });
    return Object.keys(t).map(function (m) { return t[m]; })
      .sort(function (a, b) { var d = (b.w + b.tie / 2) - (a.w + a.tie / 2); return d || b.pf - a.pf; })
      .map(function (x) { return x.m; });
  }
  function weeksDone() { var r = D.record; return (r && r.weeks && (r.weeks[String(r.current)] || []).length) || 0; }

  /* ------------------------------------------------------------------ countdowns */
  function cdHTML(iso, units) {
    return '<div class="cd" data-hcd="' + esc(iso) + '" data-units="' + units + '">' + units.split(',').map(function (u) {
      return '<div class="cd-u"><b data-u="' + u + '">--</b><span>' + { d: 'Days', h: 'Hrs', m: 'Min', s: 'Sec' }[u] + '</span></div>';
    }).join('') + '</div>';
  }
  function tick() {
    [].forEach.call(document.querySelectorAll('[data-hcd]'), function (el) {
      var ms = new Date(el.getAttribute('data-hcd')) - new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
      if (ms < 0) ms = 0;
      var v = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
      if (el.getAttribute('data-units').indexOf('d') < 0) v.h += v.d * 24;
      [].forEach.call(el.querySelectorAll('[data-u]'), function (b) { b.textContent = p(v[b.getAttribute('data-u')]); });
    });
  }
  setInterval(tick, 1000);

  /* ================================================================== THE HERO */
  // the projection beside a live score is where the team is headed now: the API's lp, its
  // points so far plus what its starters still to play are projected for. Before kickoff and
  // once the week is final it's Yahoo's pre-game projection, p.
  function projOf(t) { return status() === 'live' && t.lp != null ? t.lp : t.p; }
  function projTxt(t, word, done) { return status() === 'live' && t.togo === 0 ? done : word + ' ' + n2(projOf(t)); }
  function side(t, other, lead, color, cls, big, sub) {
    return '<a class="fo-side ' + cls + (lead ? ' lead' : '') + '" href="' + profile(t.m) + '">' + tile(t.m, color) +
      '<span class="fo-info"><span class="fo-name">' + esc(t.m) + '</span><span class="fo-team">' + esc(t.t) + '</span>' +
      '<span class="fo-score">' + big + '</span><span class="fo-proj">' + sub + '</span>' +
      '<span class="fo-chips">' + chipsFor(t.m, cls === 'b') + '</span></span></a>';
  }
  function wpHTML(a, b, label) {
    var aw = a.wp, bw = b.wp; if (typeof aw !== 'number' || typeof bw !== 'number') return '';
    var ap = Math.round(aw * 100), bp = 100 - ap, fa = ap >= bp;
    return '<div class="wp">' +
      '<div class="wp-l"><span class="' + (fa ? 'fav' : '') + '"><i class="dot ' + (fa ? 'red' : 'silver') + '"></i>' + esc(a.m) + ' <em>' + ap + '%</em></span>' +
      '<span class="wp-cap">' + label + '</span>' +
      '<span class="' + (fa ? '' : 'fav') + '"><em>' + bp + '%</em> ' + esc(b.m) + '<i class="dot ' + (fa ? 'silver' : 'red') + '"></i></span></div>' +
      '<div class="wp-bar' + (fa ? '' : ' flip') + '"><i style="width:' + ap + '%"></i><s></s></div></div>';
  }
  function wesCard(n, graded) {
    var w = (D.voices && D.voices.wes) || {}, locks = (w.locks || []).slice().sort(function (x, y) { return x.week - y.week; });
    var L = locks.filter(function (l) { return l.week === n; })[0], r = w.record || { w: 0, l: 0 };
    if (!L) {
      // the week has rolled over but the Thursday preview hasn't picked yet
      if (graded || !locks.length) return '';
      var due = locks.filter(function (l) { return l.week < n; }).slice(-5).map(function (l) {
        var c = l.result === 'W' ? 'w' : l.result === 'L' ? 'l' : 'p';
        return '<span class="lk"><i class="lk-' + c + '">' + (l.result || '?') + '</i><small>Wk ' + l.week + '</small></span>';
      }).join('') + '<span class="lk"><i class="lk-p">?</i><small>Wk ' + n + '</small></span>';
      return '<div class="side-card wes"><div class="sc-t"><span class="k gold">Pastor Wes’s Lock</span><b class="wes-rec">' + r.w + '–' + r.l + '</b></div>' +
        '<div class="wes-body"><h3 class="wes-pick">Coming Thursday</h3><p class="wes-fact">He’s still up the mountain with it.</p></div><div class="lks">' + due + '</div></div>';
    }
    var m = /^(\w+) over (\w+)$/.exec(L.pick || ''), fact = '';
    if (m && !graded) { var s = vs(m[1], m[2]); if (s && s.w + s.l) fact = m[1] + ' is ' + s.w + '-' + s.l + (s.t ? '-' + s.t : '') + ' against ' + m[2] + '.'; }
    var dots = locks.filter(function (l) { return l.week <= n; }).slice(-6).map(function (l) {
      var c = l.result === 'W' ? 'w' : l.result === 'L' ? 'l' : 'p';
      return '<span class="lk"><i class="lk-' + c + '">' + (l.result || '?') + '</i><small>Wk ' + l.week + '</small></span>';
    }).join('');
    if (graded) {
      return '<div class="side-card wes graded"><div class="sc-t"><span class="k gold">Pastor Wes’s Lock</span></div>' +
        '<div class="wes-g"><b>' + esc(L.pick) + '</b>' + (L.result ? chip(L.result, L.result === 'W' ? 'green' : 'red') : '') +
        '<span class="wes-rec">' + r.w + '–' + r.l + '</span></div></div>';
    }
    return '<div class="side-card wes"><div class="sc-t"><span class="k gold">Pastor Wes’s Lock</span><b class="wes-rec">' + r.w + '–' + r.l + '</b></div>' +
      '<div class="wes-body"><h3 class="wes-pick">' + esc(L.pick) + '</h3>' + (fact ? '<p class="wes-fact">' + esc(fact) + '</p>' : '') +
      (L.quote ? '<p class="wes-q">“' + esc(L.quote) + '”</p>' : '') + '</div><div class="lks">' + dots + '</div></div>';
  }
  function teamsHTML(g) {
    if (!g || !NFL[g.away] || !NFL[g.home]) return '';
    return '<div class="nfl"><img src="/assets/nfl/' + g.away.toLowerCase() + '.png" alt="" width="34" height="34"><b>' + NFL[g.away] +
      '</b><span>at</span><b>' + NFL[g.home] + '</b><img src="/assets/nfl/' + g.home.toLowerCase() + '.png" alt="" width="34" height="34"></div>';
  }
  function nextGame() { var g = wk().nextGame || (D.week && D.week.nextGame); return g && new Date(g.kickoff) > new Date() ? g : null; }
  function kickCard() {
    var g = nextGame(); if (!g) return '';
    var kl = lines(N()).kickoff, tag = kl && typeof kl === 'object' && kl.tag && line(N(), 'kickoff') ? kl.tag : '', txt = line(N(), 'kickoff');
    return '<div class="side-card kick"><div class="sc-t"><span class="k">Next kickoff</span>' + (tag ? chip(tag, 'dark-red') : '') + '</div>' +
      teamsHTML(g) + cdHTML(g.kickoff, 'd,h,m,s') +
      '<div class="kick-m">' + esc(longDay(g.kickoff) + ' · ' + clockT(g.kickoff) + ' ET' + (g.network ? ' · ' + g.network : '')) + '</div>' +
      (txt ? '<p class="kick-l">' + esc(txt) + '</p>' : '') + '</div>';
  }
  function pickCard(f) {
    var p = D.picks, txt = 'Locked at kickoff. No take-backs.';
    if (p && p.counts && f && p.week === N()) {
      var a = p.counts[f.mu.a.m] || 0, b = p.counts[f.mu.b.m] || 0;
      if (a + b) txt = a + ' took ' + f.mu.a.m + ', ' + b + ' took ' + f.mu.b.m + '.';
    }
    return '<a class="side-card pick" href="/picks/"><span class="pick-t"><span class="k">Pick’em · Locked</span><span class="pick-x">' + esc(txt) + '</span></span>' +
      '<span class="pill">See the picks <i>→</i></span></a>';
  }

  function heroLive(f) {
    var a = f.mu.a, b = f.mu.b, n = N(), lead = a.s === b.s ? null : (a.s > b.s ? 'a' : 'b');
    var dek = line(n, 'live');
    if (!dek) dek = lead ? (lead === 'a' ? a.m : b.m) + ' leads by ' + n2(Math.abs(a.s - b.s)) + '.' : (a.s ? 'Dead even at ' + n2(a.s) + '.' : 'Nobody has scored yet.');
    var upd = wk().updated ? 'Updated ' + dayT(wk().updated) + ' ' + clockT(wk().updated) + ' ET' : '';
    var main = '<article class="gotw panel">' +
      '<div class="g-top"><span class="g-k"><i class="dot red pulse-dot"></i><b class="red">Live</b><span>Week ' + n + '<span class="g-kx"> · ' + (f.g ? 'Game of the Week' : 'Featured matchup') + '</span></span></span><span class="g-upd">' + esc(upd) + '</span></div>' +
      '<h1 class="g-title">' + esc(gTitle(f.g, f.mu)) + '</h1><p class="g-dek">' + esc(dek) + '</p>' +
      '<div class="fo">' + side(a, b, lead === 'a', lead === 'b' ? 'silver' : 'red', 'a', n2(a.s), projTxt(a, 'Projected', 'All played')) +
      '<span class="fo-vs">vs</span>' + side(b, a, lead === 'b', lead === 'b' ? 'red' : 'silver', 'b', n2(b.s), projTxt(b, 'Projected', 'All played')) + '</div>' +
      wpHTML(a, b, 'Win probability') + '<div class="pulse" id="pulse"></div></article>';
    var sideH = kickCard() + wesCard(n) + pickCard(f);
    return [main, sideH];
  }
  function heroPreview(f) {
    var a = f.mu.a, b = f.mu.b, n = N(), lead = a.p === b.p ? null : (a.p > b.p ? 'a' : 'b');
    var story = storyFor('preview', n), dek = line(n, 'preview') || (story && story.dek) || reasonDek(f.g);
    var lock = wk().nextKickoff || (wk().nextGame && wk().nextGame.kickoff);
    var lockTxt = lock ? 'Locks ' + dayT(lock) + ' at ' + clockT(lock) + ' ET' : '';
    var main = '<article class="gotw panel is-preview">' +
      '<div class="g-top"><span class="g-k"><i class="dot gold"></i><b class="gold">Picks open</b><span>Week ' + n + '<span class="g-kx"> · ' + (f.g ? 'Game of the Week' : 'Featured matchup') + '</span></span></span><span class="g-upd">' + esc(lockTxt) + '</span></div>' +
      '<h1 class="g-title">' + esc(gTitle(f.g, f.mu)) + '</h1>' + (dek ? '<p class="g-dek">' + esc(dek) + '</p>' : '') +
      '<div class="fo">' + side(a, b, lead === 'a', lead === 'b' ? 'silver' : 'red', 'a', n2(a.p), 'Projected') +
      '<span class="fo-vs">vs</span>' + side(b, a, lead === 'b', lead === 'b' ? 'red' : 'silver', 'b', n2(b.p), 'Projected') + '</div>' +
      wpHTML(a, b, 'Pregame win probability') +
      (f.g ? '<div class="callit"><div class="callit-t"><span class="k gold">Pick’em · Game of the Week</span><h3>Who wins it?</h3><p>Picks lock at the week’s first kickoff. No take-backs.</p></div>' +
        '<div class="callit-b"><a class="pill big" href="/picks/">' + av(a.m) + esc(a.m) + '</a><a class="pill big" href="/picks/">' + av(b.m) + esc(b.m) + '</a></div></div>' : '') +
      '</article>';
    var g = wk().nextGame, lockCard = lock ? '<div class="side-card lock"><span class="k">Picks lock at kickoff</span>' +
      (g && NFL[g.away] ? '<h3>' + NFL[g.away] + ' at ' + NFL[g.home] + '</h3><div class="lock-m">' + esc(longDay(g.kickoff) + ' · ' + clockT(g.kickoff) + ' ET' + (g.network ? ' · ' + g.network : '')) + '</div>' : '') +
      cdHTML(lock, new Date(lock) - new Date() > 864e5 ? 'd,h,m' : 'h,m,s') +
      '<div class="lock-f"><a class="pill" href="/picks/">Make your pick <i>→</i></a>' +
      (D.picks && D.picks.week === n && D.picks.total ? '<span>' + D.picks.total + ' of 12 have picked</span>' : '') + '</div></div>' : '';
    var prev = story ? '<a class="side-card prev" href="/story/' + esc(story.slug) + '/">' + storyArt(story, 'mini') +
      '<span class="prev-t"><span class="k red">' + esc(story.kicker) + '</span><b>' + esc(story.title) + '</b><span class="go">Read the preview <i>→</i></span></span></a>' : '';
    return [main, lockCard + prev + wesCard(n)];
  }
  function heroFinal() {
    var n = N(), ms = matchups(), all = [];
    ms.forEach(function (m) { all.push(m.a, m.b); });
    var hi = Math.max.apply(null, all.map(function (t) { return t.s; })), lo = Math.min.apply(null, all.map(function (t) { return t.s; }));
    var big = all.filter(function (t) { return t.s === hi; }), low = all.filter(function (t) { return t.s === lo; });
    var story = storyFor('recap', n);
    var main = story
      ? '<a class="gotw panel recap" href="/story/' + esc(story.slug) + '/">' + (story.img ? '<span class="recap-art">' + storyArt(story) + '</span>' : '') +
        '<span class="recap-t"><span class="g-k">' + chip('Final', 'dim') + '<b class="red">' + esc(story.kicker) + '</b></span>' +
        '<span class="g-title">' + esc(story.title) + '</span><span class="g-dek">' + esc(story.dek || '') + '</span>' +
        '<span class="recap-a"><span class="pill">Read the recap <i>→</i></span><span class="recap-d">Week ' + n + ' is final</span></span></span></a>'
      : '<article class="gotw panel recap no-art"><span class="recap-t"><span class="g-k">' + chip('Final', 'dim') + '<b class="red">Week ' + n + '</b></span>' +
        '<span class="g-title">Week ' + n + ' is in the books</span><span class="g-dek">The recap lands Tuesday morning. The scores are below.</span>' +
        '<span class="recap-a"><a class="pill" href="#scoreboard">See the scores <i>→</i></a></span></span></article>';
    function award(k, kc, who, sub, color, art) {
      var pic = art ? '<img class="award-art" src="' + esc(art) + '" alt="" loading="lazy">' : tile(who[0], color);
      return '<div class="side-card award"><span class="award-pic">' + pic + '</span><span class="award-t"><span class="k ' + kc + '">' + esc(k) + '</span>' +
        '<b>' + esc(who.join(' & ')) + '</b><small>' + esc(sub) + '</small></span></div>';
    }
    var out = '<div class="awards-k k">The awards · Week ' + n + '</div>';
    if (all.length) {
      out += award('Big Dick', 'gold', big.map(function (t) { return t.m; }), n2(hi) + ', the week’s best', 'gold');
      out += award('Little Bitch', 'red', low.map(function (t) { return t.m; }), n2(lo) + ', the week’s worst', 'red');
    }
    var bw = WINNERS[n], bb = BONUSES.filter(function (x) { return x.w === n; })[0];
    if (bw && bb) { var who = names(bw.who); out += award(bb.nm + ' · $9' + (who.length > 1 ? ', split' : ''), 'gold', who, bw.sub || '', '', bb.img); }
    out += wesCard(n, true);
    var ng = gotwOf(n + 1);
    if (ng) out += '<a class="side-card next" href="/picks/"><span class="next-t"><span class="k red">Next · Week ' + (n + 1) + '</span><b>' +
      esc(ng.a + ' vs ' + ng.b) + '</b><small>Picks are open</small></span><i>→</i></a>';
    return [main, out];
  }
  function renderHero() {
    var st = state(), f = featured(), h = $('hero'), parts;
    if (st === 'final') parts = heroFinal();
    else if (!f) return;
    else parts = st === 'live' ? heroLive(f) : heroPreview(f);
    h.className = 'hero is-' + st;
    $('heroMain').innerHTML = parts[0];
    $('heroSide').innerHTML = parts[1];
    tick();
    if (st === 'live') drawPulse();
  }

  /* ---- the pulse: the Game of the Week's win probability across the week's game windows */
  var WIN = { 'THU': [20, 24.6], 'SAT': [12, 24.6], 'SUN AM': [9, 13], '1 PM': [13, 16.4], '4 PM': [16.4, 20.2], 'SNF': [20.2, 24.6], 'MNF': [20, 24.6] };
  var ORDER = ['THU', 'SAT', 'SUN AM', '1 PM', '4 PM', 'SNF', 'MNF'];
  function where(iso) {
    var d = new Date(iso);
    var day = d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short' });
    var hr = Number(d.toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false })) % 24 +
      Number(d.toLocaleString('en-US', { timeZone: TZ, minute: 'numeric' })) / 60;
    var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    if (hr < 5) { day = DAYS[(DAYS.indexOf(day) + 6) % 7]; hr += 24; }   // after midnight belongs to the night before
    var w = day === 'Thu' ? 'THU' : day === 'Sat' ? 'SAT' : day === 'Mon' ? 'MNF' : day === 'Sun' ?
      (hr < 13 ? 'SUN AM' : hr < 16.4 ? '1 PM' : hr < 20.2 ? '4 PM' : 'SNF') : null;   // Fri, Tue, Wed: between windows
    if (!w) return { w: null, day: day };
    var r = WIN[w];
    return { w: w, f: Math.max(0, Math.min(1, (hr - r[0]) / (r[1] - r[0]))) };
  }
  function drawPulse() {
    var box = $('pulse'), f = featured(); if (!box || !f) return;
    var p = D.pulse, a = f.mu.a.m, b = f.mu.b.m;
    var samples = ((p && p.samples) || []).filter(function (s) { return s[1] && typeof s[1][a] === 'number'; });
    var cols = ['THU', '1 PM', '4 PM', 'SNF', 'MNF'], g = D.week && D.week.nextGame;
    var pos = samples.map(function (s) { return where(s[0]); });
    if (pos.some(function (x) { return x.w === 'SAT'; })) cols.splice(1, 0, 'SAT');
    if (pos.some(function (x) { return x.w === 'SUN AM'; }) || (g && where(g.kickoff).w === 'SUN AM')) cols.splice(cols.indexOf('1 PM'), 0, 'SUN AM');
    var W = 1000, H = 160, T = 10, ih = H - 20, cw = W / cols.length;
    var y = function (v) { return +(T + (1 - v) * ih).toFixed(1); };
    // each reading's x: inside its window, or parked at the end of the last window it followed
    // a reading between windows (Friday, overnight) parks at the end of the window it followed
    var park = function (x) { return Math.max(cw, Math.ceil(x / cw - 1e-6) * cw); };
    var pts = [], last = 0;
    samples.forEach(function (s, i) {
      var q = pos[i], x;
      if (q.w && cols.indexOf(q.w) >= 0) x = cols.indexOf(q.w) * cw + q.f * cw;
      else x = park(last);
      x = Math.max(x, last); last = x;
      pts.push([x, s[1][a]]);
    });
    var now = where(new Date().toISOString()), nx;
    if (now.w && cols.indexOf(now.w) >= 0) nx = cols.indexOf(now.w) * cw + now.f * cw;
    else nx = Math.min(W, park(last));
    nx = Math.max(nx, last);
    var cur = pts.length ? pts[pts.length - 1][1] : (typeof f.mu.a.wp === 'number' ? f.mu.a.wp : null);
    var head = '<div class="pulse-h"><span class="k">Win-probability pulse</span><span>' + esc(a) + '’s chances, Thursday night to Monday night</span></div>';
    if (cur == null) { box.innerHTML = head + (D.pulseTried ? '<div class="pulse-empty">The pulse starts with the first points of the week.</div>' : '<div class="pulse-c wait"></div>'); return; }
    var d = '', i;
    if (pts.length) { d = 'M0 ' + y(pts[0][1]); for (i = 0; i < pts.length; i++) d += ' H' + pts[i][0].toFixed(1) + ' V' + y(pts[i][1]); d += ' H' + nx.toFixed(1); }
    else d = 'M0 ' + y(cur) + ' H' + nx.toFixed(1);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<rect x="0" y="0" width="' + nx.toFixed(1) + '" height="' + H + '" class="pl-played"/>' +
      [0.25, 0.75].map(function (v) { return '<line x1="0" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" class="pl-grid"/>'; }).join('') +
      cols.map(function (c, k) { return k ? '<line x1="' + (k * cw).toFixed(1) + '" x2="' + (k * cw).toFixed(1) + '" y1="0" y2="' + H + '" class="pl-col"/>' : ''; }).join('') +
      '<line x1="0" x2="' + W + '" y1="' + y(0.5) + '" y2="' + y(0.5) + '" class="pl-mid"/>' +
      '<path d="' + d + ' V' + y(0) + ' H0 Z" class="pl-area"/><path d="' + d + '" class="pl-line"/>' +
      (nx < W ? '<line x1="' + nx.toFixed(1) + '" x2="' + W + '" y1="' + y(cur) + '" y2="' + y(cur) + '" class="pl-ahead"/>' : '') +
      '<line x1="' + nx.toFixed(1) + '" x2="' + nx.toFixed(1) + '" y1="0" y2="' + H + '" class="pl-now"/></svg>';
    var lp = (nx / W * 100).toFixed(2), tp = (y(cur) / H * 100).toFixed(2), cp = Math.round(cur * 100);
    box.innerHTML = head + '<div class="pulse-c">' + svg +
      '<span class="pl-dot" style="left:' + lp + '%;top:' + tp + '%"></span>' +
      '<span class="pl-nowl' + (nx > W * 0.82 ? ' left' : '') + '" style="left:' + lp + '%">Now · ' + cp + '%</span>' +
      '<span class="pl-fav top">' + esc(a) + ' favored</span><span class="pl-fav bot">' + esc(b) + ' favored</span><span class="pl-50">50%</span></div>' +
      '<div class="pulse-x" style="grid-template-columns:repeat(' + cols.length + ',1fr)">' +
      cols.map(function (c, k) { return '<span' + ((k + 1) * cw <= nx + 0.5 ? ' class="done"' : '') + '>' + c + '</span>'; }).join('') + '</div>';
  }

  /* ================================================================== SCOREBOARD */
  function sbMode() { if (!S.chosen) S.mode = status() === 'preseason' ? 'projected' : 'actual'; return S.mode; }
  function muCard(m, isG) {
    var st = status(), mode = sbMode(), actual = mode === 'actual', started = st !== 'preseason';
    var a = m.a, b = m.b, ap = actual ? (started ? a.s : null) : projOf(a), bp = actual ? (started ? b.s : null) : projOf(b);
    var lead = ap == null || ap === bp ? null : ap > bp ? 'a' : 'b';
    var any = (a.s || 0) + (b.s || 0) > 0, tag;
    if (isG) tag = chip('Game of the Week', 'red');
    else if (st === 'final') tag = chip('Final', 'dim');
    else if (st === 'live') tag = any ? '<span class="chip"><i class="dot red"></i>Live</span>' :
      chip(/^(Thu|Fri|Sat)$/.test(dayT(new Date().toISOString())) ? 'Kicks off Sunday' : 'No points yet', 'dim');
    else tag = '';
    function row(t, k) {
      var big = actual ? (started ? n2(t.s) : '—') : n2(projOf(t));
      var small = actual ? projTxt(t, 'proj', 'all played') : (started ? 'actual ' + n2(t.s) : 'projected');
      var cls = lead === k ? ' lead' : ((actual ? t.s : projOf(t)) > 0 ? '' : ' zero');
      return '<a class="mu-row' + cls + '" href="' + profile(t.m) + '">' + av(t.m) + '<span class="mu-nm"><b>' + esc(t.m) + '</b><small>' + esc(t.t) + '</small></span>' +
        '<span class="mu-pts"><b>' + big + '</b><small>' + small + '</small></span></a>';
    }
    var wp = st !== 'final' ? wpHTML(a, b, 'Win prob') : '';
    var key = a.m + '|' + b.m;
    return '<article class="mu' + (isG ? ' is-gotw' : '') + (S.charts ? ' open' : '') + '" data-k="' + esc(key) + '" tabindex="0" role="button" aria-expanded="' + S.charts + '">' +
      '<div class="mu-top">' + tag + '<span class="mu-ser">' + esc(series(a.m, b.m, isG)) + '</span></div>' +
      row(a, 'a') + '<div class="mu-div"></div>' + row(b, 'b') + wp + '<div class="mu-chart"></div></article>';
  }
  function renderScoreboard() {
    var ms = matchups(), f = featured(), st = status(), w = wk();
    $('sbWeek').textContent = N();
    var s = $('sbStatus');
    s.innerHTML = st === 'live' ? '<i class="dot red"></i>Live' + (w.updated ? ' · updated ' + esc(clockT(w.updated)) + ' ET' : '') :
      st === 'final' ? 'Final' : 'Projections · picks lock at kickoff';
    syncSeg('sbSeg', sbMode());
    if (!ms.length) { $('sbGrid').innerHTML = '<p class="empty">No matchups posted yet.</p>'; return; }
    var g = f && f.g ? f.mu : null, first = [], rest = [];
    ms.forEach(function (m) { (g && (m.a.m === g.a.m || m.b.m === g.a.m) ? first : rest).push(m); });
    $('sbGrid').innerHTML = first.concat(rest).map(function (m, i) { return muCard(first.length && i === 0 ? { a: g.a, b: g.b } : m, !!(first.length && i === 0)); }).join('');
    drawCharts(false);
  }
  function drawCharts(fresh) {
    if (!window.BHSweat || !S.charts) return;
    [].forEach.call(document.querySelectorAll('#sbGrid .mu.open'), function (card) {
      var k = card.getAttribute('data-k').split('|'), box = card.querySelector('.mu-chart');
      BHSweat.load(N(), fresh).then(function (d) { BHSweat.chart(box, d, k[0], k[1], { since: 'in Week 3' }); })
        .catch(function () { box.innerHTML = '<div class="sw-empty">The chart isn’t available right now.</div>'; });
    });
  }
  function toggleCharts() {
    S.charts = !S.charts;
    [].forEach.call(document.querySelectorAll('#sbGrid .mu'), function (c) {
      c.classList.toggle('open', S.charts); c.setAttribute('aria-expanded', S.charts);
      if (!S.charts) c.querySelector('.mu-chart').innerHTML = '';
    });
    drawCharts(false);
  }
  function syncSeg(id, v) {
    [].forEach.call(document.querySelectorAll('#' + id + ' button'), function (b) {
      var on = b.getAttribute('data-v') === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    });
  }

  /* ================================================================== ON THE LINE */
  function track(p, color, scale) {
    var w = Math.max(4, Math.min(100, (p || 0) / (scale || 0.6) * 100));
    return '<span class="trk"><i class="' + color + '" style="width:' + w.toFixed(1) + '%"></i></span>';
  }
  function oddsRow(m, sub, p, color, rk, dim) {
    return '<a class="o-row' + (dim ? ' dim' : '') + '" href="' + profile(m) + '">' + (rk ? '<span class="o-rk">' + rk + '</span>' : '') + av(m) +
      '<span class="o-nm"><b>' + esc(m) + '</b><small>' + esc(sub) + '</small></span>' + track(p, color) + '<span class="o-p">' + pct(p) + '</span></a>';
  }
  function renderStakes() {
    var n = N(), st = state(), o = ordered(), out = '', live = st !== 'final';
    var foot = function (k) { var t = live ? line(n, k) : ''; return t ? '<p class="stk-f">' + esc(t) + '</p>' : ''; };
    // Beer Mile Watch: the four likeliest to finish last
    if (oddsOn()) {
      var bl = Object.keys(D.odds.baseline).map(function (m) { return { m: m, p: D.odds.baseline[m].last }; })
        .sort(function (x, y) { return y.p - x.p; }).slice(0, 4);
      var bmFoot = foot('beerMile');
      if (!bmFoot && live) {   // two of them playing each other is the story, if nobody wrote one
        var four = bl.map(function (x) { return x.m; }), meet = matchups().filter(function (m) { return four.indexOf(m.a.m) >= 0 && four.indexOf(m.b.m) >= 0; })[0];
        if (meet) bmFoot = '<p class="stk-f">' + esc(meet.a.m + ' and ' + meet.b.m + ' play each other this week.') + '</p>';
      }
      out += '<div class="stk panel" id="beer-mile"><span class="k red">Beer Mile Watch</span><h3>Somebody’s running.</h3>' +
        '<p class="stk-s">Odds of finishing 12th, through Week ' + D.odds.through_week + '. Last place runs the Beer Mile.</p><div class="stk-rows">' +
        bl.map(function (x) { var t = team(x.m); return oddsRow(x.m, (t ? rec(t) + ' · ' : '') + ord(rankOf(x.m)), x.p, 'red'); }).join('') + '</div>' + bmFoot + '</div>';
      // The Bubble: the two spots above the line and the two below it
      var cutN = (D.season && D.season.playoffCut) || 6, bub = o.slice(cutN - 2, cutN + 2);
      out += '<div class="stk panel"><span class="k gold">The Bubble</span><h3>' + (cutN === 6 ? 'Six' : cutN) + ' get in.</h3>' +
        '<p class="stk-s">Playoff odds on both sides of the line.</p><div class="stk-rows">' +
        bub.map(function (t, i) {
          var r = cutN - 2 + i + 1, od = D.odds.baseline[t.m] || {}, inn = r <= cutN;
          return (r === cutN + 1 ? '<div class="cutline"><span>Playoff line</span></div>' : '') + oddsRow(t.m, rec(t), od.playoffs, inn ? 'green' : 'muted', r, !inn);
        }).join('') + '</div>' + foot('bubble') + '</div>';
    } else {
      out += '<div class="stk panel"><span class="k red">Beer Mile Watch</span><h3>Somebody’s running.</h3><p class="stk-s">The odds post after Week 1.</p></div>' +
        '<div class="stk panel"><span class="k gold">The Bubble</span><h3>Six get in.</h3><p class="stk-s">The odds post after Week 1.</p></div>';
    }
    out += bonusCard(n, foot('bonus'));
    $('stakesRow').innerHTML = out;
    syncSeg('bnSeg', S.bonusMode);
  }
  function bonusCard(n, footer) {
    var b = BONUSES.filter(function (x) { return x.w === n; })[0], w = wk(), bo = w.bonus || {};
    if (!b) return '<div class="stk panel"><span class="k gold">Weekly bonus</span><h3>No bonus this week.</h3></div>';
    var settled = status() === 'final' && WINNERS[n];
    var act = bo.actual || [], pro = bo.projected || [];
    // a live leaderboard of zeros is just who hasn't played yet: lead with the projections until someone scores
    if (!S.bonusMode) S.bonusMode = act.some(function (r) { return r.val > 0; }) || !pro.length ? 'actual' : 'projected';
    var mode = S.bonusMode, list = (mode === 'actual' ? act : pro).slice(0, 3), body;
    if (settled) {
      var who = names(WINNERS[n].who);
      body = '<div class="stk-sub"><span class="k">Won it</span></div><div class="b-rows"><div class="b-row top">' + avs(who) +
        '<span class="o-nm"><b>' + esc(who.join(' & ')) + '</b><small>' + esc(WINNERS[n].sub || '') + '</small></span>' + chip(who.length > 1 ? money(+(9 / who.length).toFixed(2)) + ' each' : '$9', 'green') + '</div></div>';
    } else {
      body = '<div class="stk-sub"><span class="k">' + (mode === 'actual' ? 'Leading it' : 'Projected to win it') + '</span>' +
        '<span class="seg mini" id="bnSeg"><button type="button" data-v="projected">Projected</button><button type="button" data-v="actual">Actual</button></span></div>' +
        '<div class="b-rows">' + (list.length ? list.map(function (r, i) {
          return '<div class="b-row' + (i ? '' : ' top') + '"><span class="o-rk">' + (i + 1) + '</span>' + av(names(r.who)[0]) +
            '<span class="o-nm"><b>' + esc(r.who) + '</b><small>' + esc(r.sub || '') + '</small></span><span class="o-p">' + n2(r.val) + '</span></div>';
        }).join('') : '<p class="stk-s">' + (mode === 'actual' ? 'Leaders post once Week ' + n + ' has points on the board.' :
          'No projections for this one: Yahoo doesn’t project single players.') + '</p>') + '</div>';
    }
    return '<div class="stk panel bonus"><div class="b-top"><img src="' + esc(b.img) + '" alt="" loading="lazy">' +
      '<span><span class="k gold">Week ' + n + ' bonus · $9</span><h3>' + esc(b.nm) + '</h3><span class="stk-s">' + esc(b.cr) + '</span></span></div>' +
      body + footer + '</div>';
  }

  /* ================================================================== STANDINGS + POWER LINES */
  function renderStandings() {
    var o = ordered(); if (!o.length) return;
    var cut = (D.season && D.season.playoffCut) || 6, on = oddsOn(), done = weeksDone();
    var prev = done > 1 ? tableAfter(done - 1) : null, beer = null;
    if (on) Object.keys(D.odds.baseline).forEach(function (m) { if (!beer || D.odds.baseline[m].last > D.odds.baseline[beer].last) beer = m; });
    var rows = o.map(function (t, i) {
      var mv = prev ? prev.indexOf(t.m) - i : 0, od = on ? (D.odds.baseline[t.m] || {}) : null;
      var move = !prev || prev.indexOf(t.m) < 0 ? '' : mv > 0 ? '<span class="mv up">' + mv + '</span>' : mv < 0 ? '<span class="mv dn">' + (-mv) + '</span>' : '<span class="mv">–</span>';
      var tr = '<tr class="' + (i < cut ? 'in' : 'out') + (t.m === beer ? ' beer' : '') + '"><td class="rk">' + (i + 1) + '</td><td class="mvc">' + move + '</td>' +
        '<td class="tm"><a href="' + profile(t.m) + '">' + av(t.m) + '<span><b>' + esc(t.t) + '</b><small>' + esc(t.m) + '</small></span>' +
        (t.m === beer ? chip('Beer Mile spot', 'red') : '') + '</a></td><td class="num wl">' + rec(t) + '</td><td class="num pf">' + n2(t.pf) + '</td>' +
        (on ? '<td class="po"><span class="trk sm"><i class="' + (od.playoffs >= 0.5 ? 'green' : 'muted') + '" style="width:' + Math.max(3, Math.round((od.playoffs || 0) * 100)) + '%"></i></span><b>' + pct(od.playoffs) + '</b></td>' +
          '<td class="num last' + ((od.last || 0) >= 0.2 ? ' hot' : '') + '">' + pct(od.last) + '</td>' : '') +
        '<td class="num bank' + (t.bank ? ' paid' : '') + '">' + (t.bank ? money(t.bank) : '—') + '</td></tr>';
      if (i === cut - 1) tr += '<tr class="cut"><td colspan="' + (on ? 8 : 6) + '"><div class="cutline"><span>Playoff line · top two get byes</span></div></td></tr>';
      return tr;
    }).join('');
    $('stTable').innerHTML = '<table class="st"><thead><tr><th>#</th><th class="mvc"></th><th class="tm">Team</th><th class="num wl">W-L</th><th class="num pf">PF</th>' +
      (on ? '<th class="po">Playoffs</th><th class="num last">Last</th>' : '') + '<th class="num bank">Bank</th></tr></thead><tbody>' + rows + '</tbody></table>';
    var note = $('stNote');
    if (note) note.textContent = on ? 'Through Week ' + D.odds.through_week + ' · odds from ' + Number(D.odds.sims || 20000).toLocaleString() + ' simulated seasons' : 'Wins, then points for';
  }
  function moves() {
    var R = (D.season && D.season.ranks) || [], i, j;
    var wks = R.filter(function (r) { return /^WK/.test(r.label); });
    if (wks.length < 2) return {};
    var now = wks[wks.length - 1], from = wks.slice(-5, -1), up = null, dn = null;
    now.order.forEach(function (m, r) {
      var rn = r + 1;
      from.forEach(function (w) {
        var ri = w.order.indexOf(m) + 1; if (!ri) return;
        if (ri - rn > 0 && (!up || ri - rn > up.d || (ri - rn === up.d && ri > up.from))) up = { m: m, d: ri - rn, from: ri, to: rn, wk: w.label.replace('WK ', '') };
        if (rn - ri > 0 && (!dn || rn - ri > dn.d || (rn - ri === dn.d && rn > dn.to))) dn = { m: m, d: rn - ri, from: ri, to: rn, wk: w.label.replace('WK ', '') };
      });
    });
    return { up: up, dn: dn };
  }
  function colorOf(m) { var ts = teams(), i; for (i = 0; i < ts.length; i++) if (ts[i].m === m) return COLORS[i % COLORS.length]; return '#9aa0aa'; }
  function renderPower() {
    var R = (D.season && D.season.ranks) || []; if (!R.length) return;
    var mv = moves(), hi = {};
    if (mv.up) hi[mv.up.m] = '#3fb26b';
    if (mv.dn) hi[mv.dn.m] = '#e5383b';
    if (S.focus) { hi = {}; hi[S.focus] = colorOf(S.focus); }
    var labels = R.map(function (r) { return r.label; });
    var M = R[0].order, wide = ($('pwChart').clientWidth || 470) > 640, W = wide ? 960 : 560, H = wide ? 520 : 640, L = 30, Rr = 52, T = 18, B = 34, iw = W - L - Rr, ih = H - T - B;
    var x = function (i) { return +(L + i * iw / (labels.length - 1)).toFixed(1); };
    var y = function (r) { return +(T + (r - 1) * ih / 11).toFixed(1); };
    var last = R.length - 1;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="pw-svg" role="img" aria-label="Power rank by week">';
    labels.forEach(function (l, i) { s += '<line x1="' + x(i) + '" x2="' + x(i) + '" y1="' + (T - 8) + '" y2="' + (H - B + 6) + '" class="pw-col"/>' +
      '<text x="' + x(i) + '" y="' + (H - 10) + '" class="pw-x' + (i === last ? ' now' : '') + '">' + (l === 'PRE' ? 'PRE' : l.replace('WK ', '')) + '</text>'; });
    var cy = ((y(6) + y(7)) / 2).toFixed(1);
    s += '<line x1="' + (L - 8) + '" x2="' + (x(last) + 8) + '" y1="' + cy + '" y2="' + cy + '" class="pw-cut"/>';
    for (var r = 1; r <= 12; r++) s += '<text x="' + (L - 14) + '" y="' + (y(r) + 4) + '" class="pw-y' + (r === 12 ? ' last' : '') + '">' + r + '</text>';
    var order = M.filter(function (m) { return !hi[m]; }).concat(Object.keys(hi));
    order.forEach(function (m) {
      var pts = R.map(function (rk, i) { return x(i) + ',' + y(rk.order.indexOf(m) + 1); }).join(' ');
      s += '<polyline points="' + pts + '" class="pw-l' + (hi[m] ? ' hi' : '') + (S.focus && !hi[m] ? ' fade' : '') + '" data-m="' + esc(m) + '"' + (hi[m] ? ' style="stroke:' + hi[m] + '"' : '') + '/>';
      if (hi[m]) R.forEach(function (rk, i) { s += '<circle cx="' + x(i) + '" cy="' + y(rk.order.indexOf(m) + 1) + '" r="4.5" class="pw-pt" style="stroke:' + hi[m] + '"/>'; });
    });
    s += '<defs><clipPath id="pwc"><circle r="12" cx="0" cy="0"/></clipPath></defs>';
    R[last].order.forEach(function (m, i) {
      var cx = x(last) + 24, yy = y(i + 1);
      s += '<g class="pw-av' + (hi[m] ? ' hi' : '') + '" data-m="' + esc(m) + '" transform="translate(' + cx + ',' + yy + ')"><title>' + esc(m) + '</title>' +
        '<image href="' + photo(m) + '" x="-12" y="-12" width="24" height="24" clip-path="url(#pwc)"/>' +
        '<circle r="12.5" class="pw-ring"' + (hi[m] ? ' style="stroke:' + hi[m] + '"' : '') + '/></g>';
    });
    s += '</svg>';
    $('pwChart').innerHTML = s;
    var leg = '';
    if (S.focus) leg = '<button type="button" class="leg on" data-m="' + esc(S.focus) + '"><i style="background:' + colorOf(S.focus) + '"></i><b>' + esc(S.focus) + '</b><span>' + ord(R[last].order.indexOf(S.focus) + 1) + ' this week · tap again to reset</span></button>';
    else {
      if (mv.up) leg += '<button type="button" class="leg" data-m="' + esc(mv.up.m) + '"><span class="tri up"></span><b>' + esc(mv.up.m) + '</b><span>' + ord(mv.up.from) + ' to ' + ord(mv.up.to) + ' since Week ' + mv.up.wk + '</span></button>';
      if (mv.dn) leg += '<button type="button" class="leg" data-m="' + esc(mv.dn.m) + '"><span class="tri dn"></span><b>' + esc(mv.dn.m) + '</b><span>' + ord(mv.dn.from) + ' to ' + ord(mv.dn.to) + ' since Week ' + mv.dn.wk + '</span></button>';
    }
    $('pwLegend').innerHTML = leg;
  }

  /* ================================================================== BONUS BOARD */
  function renderBonusBoard() {
    var n = N(), st = status(), w = wk(), bo = w.bonus || {};
    syncSeg('bbSeg', S.bbView);
    $('bbWeekly').hidden = S.bbView !== 'weekly'; $('bbSeason').hidden = S.bbView !== 'season';
    $('bbNote').textContent = S.bbView === 'weekly' ? '$9 a week, fourteen weeks' : 'Six season-long bonuses, settled after Week 14';
    $('bbWeekly').innerHTML = BONUSES.map(function (b) {
      var win = WINNERS[b.w], cur = b.w === n && !win, up = !win && st === 'final' && b.w === n + 1,
        cls = win ? 'past' : cur && st !== 'preseason' ? 'live' : cur || up ? 'next' : b.w < n ? 'pending' : 'future';
      var who = '', top = '';
      if (win) {
        var ws = names(win.who); top = '<span class="aw-paid">' + (ws.length > 1 ? money(+(9 / ws.length).toFixed(2)) + ' each' : '$9 paid') + '</span>';
        who = '<span class="aw-win">' + avs(ws) + '<span><b>' + esc(win.who) + '</b><small>' + esc(win.sub || '') + '</small></span></span>';
      } else if (cur) {
        var scored = (bo.actual || []).some(function (r) { return r.val > 0; });
        var l = scored ? { r: bo.actual[0], t: '' } : (bo.projected && bo.projected[0]) ? { r: bo.projected[0], t: 'projected · ' } : (bo.actual && bo.actual[0]) ? { r: bo.actual[0], t: '' } : null;
        top = st === 'final' ? chip('Settling', 'dim') : chip(st === 'live' ? 'Live' : 'This week', 'red');
        who = l ? '<span class="aw-win">' + avs([names(l.r.who)[0]]) + '<span><b>' + esc(l.r.who) + '</b><small>' + esc(l.t + n2(l.r.val)) + '</small></span></span>' : '<span class="aw-open">Up for grabs</span>';
      } else {
        if (up) top = chip('Up next', 'red');
        who = '<span class="aw-open">' + (b.w < n ? 'Being settled' : 'Up for grabs') + '</span>';
      }
      return '<div class="aw ' + cls + '"><img class="aw-art" src="' + esc(b.img) + '" alt="" loading="lazy">' +
        '<span class="aw-wk"><span>Week ' + b.w + '</span>' + top + '</span><b class="aw-nm">' + esc(b.nm) + '</b><span class="aw-cr">' + esc(b.cr) + '</span>' + who + '</div>';
    }).join('');
    if (S.bbView === 'season') renderRaces();
  }
  function renderRaces() {
    var ts = teams();
    function top(src, dir) { return ts.filter(function (t) { return typeof t[src] === 'number'; }).map(function (t) { return { who: t.m, val: t[src] }; })
      .sort(function (a, b) { return dir === 'asc' ? a.val - b.val : b.val - a.val; }).slice(0, 3); }
    function best() {
      var r = D.record; if (!r || !r.weeks) return [];
      var out = [], M = r.managers || {};
      (r.weeks[String(r.current)] || []).forEach(function (g, i) { g.forEach(function (x) { out.push({ who: M[x[0]] || x[0], val: x[1], wk: i + 1 }); out.push({ who: M[x[2]] || x[2], val: x[3], wk: i + 1 }); }); });
      return out.sort(function (a, b) { return b.val - a.val; }).slice(0, 3);
    }
    function trades() { var t = (D.season && D.season.trades) || {}; return Object.keys(t).filter(function (m) { return t[m] > 0; }).map(function (m) { return { who: m, val: t[m] }; }).sort(function (a, b) { return b.val - a.val; }).slice(0, 3); }
    $('bbSeason').innerHTML = RACES.map(function (a) {
      var rows = a.note ? null : a.src === 'week' ? best() : a.src === 'trades' ? trades() : top(a.src, a.dir), body;
      if (!rows) body = '<div class="rc-row top">' + av('Jason') + '<span class="o-nm"><b>' + esc(a.note) + '</b><small>Announced after Week 14</small></span></div>';
      else if (!rows.length) body = '<p class="stk-s">' + esc(a.empty || 'Nothing settled yet.') + '</p>';
      else body = rows.map(function (r, i) {
        var v = a.src === 'trades' ? r.val + (r.val === 1 ? ' trade' : ' trades') : n2(r.val) + (r.wk ? ' · Wk ' + r.wk : '');
        return '<div class="rc-row' + (i ? '' : ' top') + '"><span class="o-rk">' + (i + 1) + '</span>' + av(r.who) + '<b class="rc-who">' + esc(r.who) + '</b><span class="o-p">' + esc(v) + '</span></div>';
      }).join('');
      return '<div class="race panel"><div class="rc-top"><b>' + esc(a.nm) + '</b><span>$' + a.amt + '</span></div><p class="rc-cr">' + esc(a.cr) + '</p>' + body + '</div>';
    }).join('');
  }

  /* ================================================================== THE HOMBRES */
  function renderHombres() {
    var o = ordered(); if (!o.length) return;
    var money = (D.history && D.history.money && D.history.money.members) || {};
    $('hmGrid').innerHTML = o.map(function (t, i) {
      var c = code(t.m), p = prof(t.m), k = rings(t.m), mm = money[c] || {};
      var ml = mm.line || (typeof mm.net === 'number' ? (mm.net >= 0 ? 'Up ' : 'Down ') + money2(Math.abs(mm.net)) + ' lifetime, buy-ins included.' : '');
      return '<a class="hb" href="' + profile(t.m) + '"><span class="hb-art">' + tile(t.m, 'silver', 'sq') +
        (ml ? '<span class="hb-ml"><span class="k gold">Money line</span>' + esc(ml) + '</span>' : '') + '</span>' +
        '<span class="hb-nm"><b>' + esc(t.m) + '</b><span' + (i === o.length - 1 ? ' class="red"' : '') + '>' + ord(i + 1) + '</span></span>' +
        '<span class="hb-tm">' + esc(t.t) + '</span><span class="hb-st">' + chip(rec(t)) + (k ? chip(k + (k > 1 ? ' rings' : ' ring'), 'gold') : '') +
        (p ? '<small>Career ' + p.w + '-' + p.l + (p.t ? '-' + p.t : '') + '</small>' : '') + '</span></a>';
    }).join('');
  }
  function money2(v) { return '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 }); }

  /* ================================================================== THE BOOTH */
  function stories() { return (D.stories && D.stories.stories) || []; }
  function storyFor(type, n) { return stories().filter(function (s) { return s.type === type && s.week === n; })[0] || null; }
  function storyArt(s, cls) {
    var m = /\/assets\/members\/svg\/([^/.]+)\.svg$/.exec(s.img || '');
    if (m) return tile(decodeURIComponent(m[1]), 'red', cls);
    var src = (cls === 'mini' && s.thumb) ? s.thumb : (s.img || s.thumb);
    return src ? '<span class="tile photo' + (cls ? ' ' + cls : '') + '"><img src="' + esc(src) + '" alt="" loading="lazy"></span>' : '';
  }
  function renderBooth() {
    var feat = document.querySelector('a.feature'), slug = feat && (/\/story\/([^/]+)\//.exec(feat.getAttribute('href')) || [])[1];
    if (feat) {
      var img = feat.querySelector('.feat-img img'), m = img && /\/assets\/members\/svg\/([^/.]+)\.svg$/.exec(img.getAttribute('src'));
      if (m && !feat.querySelector('.feat-img').classList.contains('illo')) { feat.querySelector('.feat-img').classList.add('illo'); img.src = cut(decodeURIComponent(m[1])); }
      var s0 = stories().filter(function (s) { return s.slug === slug; })[0], cta = feat.querySelector('.feat-cta');
      if (s0 && !feat.querySelector('.feat-k')) feat.querySelector('.feat-body').insertAdjacentHTML('afterbegin', '<div class="feat-k">' + esc(s0.kicker) + '</div>');
      if (cta && s0) cta.innerHTML = (s0.type === 'recap' ? 'Read the recap' : s0.type === 'preview' ? 'Read the preview' : 'Read the story') + ' <i>→</i>';
    }
    var more = stories().filter(function (s) { return s.slug !== slug; }).slice(0, 3);
    if (stories().length) $('boothAll').innerHTML = 'All ' + stories().length + ' stories <i>→</i>';
    $('boothList').innerHTML = '<span class="k">More from the Booth</span>' + more.map(function (s) {
      return '<a class="bl" href="/story/' + esc(s.slug) + '/">' + storyArt(s, 'mini') + '<span><small>' + esc(s.kicker) + '</small><b>' + esc(s.title) + '</b></span></a>';
    }).join('');
    var z = ((D.voices && D.voices.zack && D.voices.zack.history) || []).slice().sort(function (a, b) { return a.week - b.week; });
    if (!z.length) { $('luck').hidden = true; return; }
    var cur = z[z.length - 1], W = 170, H = 70, lo = Math.min(-8, Math.min.apply(null, z.map(function (r) { return r.index; }))), hi2 = Math.max(2, Math.max.apply(null, z.map(function (r) { return r.index; })));
    var X = function (i) { return +(6 + i * (W - 12) / Math.max(1, z.length - 1)).toFixed(1); }, Y = function (v) { return +(8 + (1 - (v - lo) / (hi2 - lo)) * (H - 16)).toFixed(1); };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><line x1="0" x2="' + W + '" y1="' + Y(0) + '" y2="' + Y(0) + '" class="lk-zero"/>' +
      '<polyline points="' + z.map(function (r, i) { return X(i) + ',' + Y(r.index); }).join(' ') + '" class="lk-line"/>' +
      z.map(function (r, i) { return '<circle cx="' + X(i) + '" cy="' + Y(r.index) + '" r="' + (i === z.length - 1 ? 5 : 3) + '" class="lk-pt' + (i === z.length - 1 ? ' now' : '') + '"/>'; }).join('') + '</svg>';
    $('luck').innerHTML = '<span class="luck-t"><span class="k gold">Zack’s Luck Index</span><span class="luck-n"><b>' + (cur.index > 0 ? '+' : cur.index < 0 ? '−' : '') + Math.abs(cur.index) +
      '</b><small>after Week ' + cur.week + '</small></span><span class="stk-s">Negative means the schedule is doing it to him.</span></span>' +
      '<span class="luck-c">' + svg + '<small>Wk ' + z[0].week + ' → Wk ' + cur.week + '</small></span>';
  }

  /* ================================================================== WIRING */
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.error(e); } }
  // phones start with the Power Lines chart folded; desktop, or a link to #power-lines, opens it
  function setPower(open) {
    var b = $('pwToggle'); S.plOpen = open; $('power-lines').classList.toggle('open', open);
    if (b) { b.setAttribute('aria-expanded', open); b.firstChild.textContent = open ? 'Hide the chart ' : 'See the chart '; b.lastChild.textContent = open ? '↑' : '↓'; }
  }
  // the sections fill in after the data loads, so a link from another page (/#bonus-board)
  // lands short; go to the anchor again once the page has its height, unless they've moved
  var moved = false;
  ['wheel', 'touchmove', 'keydown'].forEach(function (ev) { window.addEventListener(ev, function () { moved = true; }, { passive: true, once: true }); });
  function toHash() {
    var id = location.hash.slice(1), el = id && document.getElementById(id);
    if (el && !moved) el.scrollIntoView();
  }
  window.addEventListener('hashchange', function () { if (location.hash === '#power-lines') setPower(true); });
  function renderAll() {
    safe(renderHero); safe(renderScoreboard); safe(renderStakes); safe(renderStandings); safe(renderPower);
    safe(renderBonusBoard); safe(renderHombres); safe(renderBooth);
  }
  document.addEventListener('click', function (e) {
    var t = e.target, b;
    if ((b = t.closest('#sbSeg button'))) { S.mode = b.getAttribute('data-v'); S.chosen = true; safe(renderScoreboard); return; }
    if ((b = t.closest('#bnSeg button'))) { S.bonusMode = b.getAttribute('data-v'); safe(renderStakes); return; }
    if ((b = t.closest('#bbSeg button'))) { S.bbView = b.getAttribute('data-v'); safe(renderBonusBoard); return; }
    if ((b = t.closest('#pwLegend .leg, #pwChart .pw-av'))) { var m = b.getAttribute('data-m'); S.focus = S.focus === m ? null : m; safe(renderPower); return; }
    if ((b = t.closest('#pwToggle'))) { setPower(!S.plOpen); return; }
    var card = t.closest('#sbGrid .mu');
    if (card && !t.closest('a') && !t.closest('.mu-chart')) toggleCharts();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var c = e.target.closest && e.target.closest('#sbGrid .mu');
    if (c && e.target === c) { e.preventDefault(); toggleCharts(); }
  });

  function useLive(api) {
    var f = D.week;
    var ok = api && api.matchups && api.matchups.length && (!f || api.week >= f.week);
    if (!ok) return false;
    // the committed file keeps the leaders when the API didn't compute any, and the next kickoff
    var has = function (b) { return b && ((b.actual && b.actual.length) || (b.projected && b.projected.length)); };
    if (f && f.week === api.week) { if (!has(api.bonus)) api.bonus = f.bonus; api.nextGame = api.nextGame || f.nextGame; api.nextKickoff = api.nextKickoff || f.nextKickoff; }
    // Yahoo rolls to the next week midweek, before Thursday's sync: the settled file's nextGame
    // is already that week's opener (run D moves it), which is also when its picks lock
    else if (f && f.status === 'final' && api.week === f.week + 1 && f.nextGame && new Date(f.nextGame.kickoff) > new Date()) {
      api.nextGame = api.nextGame || f.nextGame; api.nextKickoff = api.nextKickoff || f.nextGame.kickoff;
    }
    D.live = api; return true;
  }
  function refresh(first) {
    return get('/api/scoreboard').then(function (api) {
      if (useLive(api)) { safe(renderHero); safe(renderScoreboard); safe(renderStakes); safe(renderBonusBoard); if (!first) drawCharts(true); }
      if (state() === 'live') return get('/api/pulse?week=' + N()).then(function (p) { D.pulseTried = true; if (p) D.pulse = p; safe(drawPulse); });
    });
  }
  Promise.all(Object.keys(FILES).map(function (k) { return get(FILES[k]).then(function (v) { D[k] = v; }); })).then(function () {
    renderAll();
    var mq = window.matchMedia ? window.matchMedia('(max-width: 699px)') : null;
    if ((mq && !mq.matches) || location.hash === '#power-lines') setPower(true);
    toHash();
    refresh(true).then(function () {
      toHash();
      if (state() !== 'final') get('/api/picks').then(function (p) { if (p && p.week) { D.picks = p; safe(renderHero); } });
    });
    setInterval(function () { if (status() === 'live') refresh(false); }, 90000);
    var rz = null, lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      clearTimeout(rz); rz = setTimeout(function () { if (window.innerWidth !== lastW) { lastW = window.innerWidth; safe(renderPower); safe(drawPulse); } }, 200);
    });
  });
})();
