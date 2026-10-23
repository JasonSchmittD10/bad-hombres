// The site header: the bar, the Week N crawl under it, four menus (Season, The Booth,
// The Hombres, Record Book) and the Make your pick button; on phones a rotating crawl,
// a tab bar and a More sheet. Every page carries the same markup (scripts/header.py writes
// it); this fills it from the data files, so the weekly routines never have to touch it.
//
// Reads: data/week.json, voices.json, numbers/odds.json, record.json, stories.json (the crawl,
// the button), then season.json and history.json (the menus, once the page is idle).
// Nothing here may break a page: a file that fails to load just leaves its piece out.
(function () {
  'use strict';
  var H = document.getElementById('bhn');
  if (!H) return;

  // ---------- kept by hand: not in any data file ----------
  // The Contract: last-place punishments still owed. Take a line out when someone pays up.
  var OWED = [
    { who: 'Wes', what: 'the 9/9/9', year: 2025 },
    { who: 'Dylan', what: 'the chicken run', year: 2022 }
  ];
  // 2020 was played on ESPN, before the game log starts. Champions show the team names the
  // league knows them by, which for 2021 and 2022 aren't the names Yahoo has on file.
  var CHAMP_2020 = { code: 'ERI', team: 'King in the North' };
  var CHAMP_TEAM = { '2021': '#NotMyLenovoCenter', '2022': 'Mighty Marvin Power Rangers' };

  // ---------- small helpers ----------
  var $ = function (id) { return document.getElementById(id); };
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  var ICON = {
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
    dollar: '<line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
    beer: '<path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.72.5-2.5.5a2.5 2.5 0 0 1 0-5c.78 0 1.57.5 2.5.5S9.44 2 11 2s2 1.5 3 1.5 1.72-.5 2.5-.5a2.5 2.5 0 0 1 0 5c-.78 0-1.5-.5-2.5-.5Z"/><path d="M5 8v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    list: '<line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/>',
    calendar: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    swords: '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" x2="19" y1="19" y2="13"/><line x1="16" x2="20" y1="16" y2="20"/><line x1="19" x2="21" y1="21" y2="19"/><polyline points="14.5 6.5 18 3 21 3 21 6 17.5 9.5"/><line x1="5" x2="9" y1="14" y2="18"/><line x1="7" x2="4" y1="17" y2="20"/><line x1="3" x2="5" y1="19" y2="21"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="16" x2="14" y1="3" y2="21"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    // Tabler "target-arrow" (MIT): an arrow into the target, not a bullseye
    pick: '<path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0"/><path d="M12 7a5 5 0 1 0 5 5"/><path d="M13 3.055a9 9 0 1 0 7.941 7.945"/><path d="M15 6v3h3l3-3h-3V3z"/><path d="M15 9l-3 3"/>'
  };
  function ic(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICON[k] || '') + '</svg>'; }
  function av(n, cls) {
    return '<img class="bhn-av' + (cls ? ' ' + cls : '') + '" src="/assets/members/thumb/' + encodeURIComponent(n) +
      '.jpg" alt="" loading="lazy" decoding="async">';
  }
  function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function pct(p) { var r = Math.round(p * 100); return p > 0 && r < 1 ? '<1%' : r + '%'; }
  function usd(v) {
    var a = Math.abs(v), c = Math.round(a * 100) % 100 !== 0;
    return '$' + a.toLocaleString('en-US', { minimumFractionDigits: c ? 2 : 0, maximumFractionDigits: c ? 2 : 0 });
  }
  function signed(v) { return (v > 0 ? '+' : v < 0 ? '\u2212' : '') + usd(v); }
  function three(p) { return p.toFixed(3).replace(/^0/, ''); }
  var WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen'];
  function word(n) { return WORDS[n] || String(n); }
  function profile(n) { return '/members/profile/?m=' + encodeURIComponent(n); }

  // times: the league runs on Eastern
  var TZ = 'America/New_York';
  function etDay(d) { return d.toLocaleDateString('en-US', { timeZone: TZ }); }
  function etTime(d) { return d.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }); }
  function etDow(d) { return d.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' }); }
  function isToday(d) { return etDay(d) === etDay(new Date()); }
  function clock(ms) {
    if (ms <= 0) return '00:00:00';
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600),
      m = Math.floor(s % 3600 / 60), x = s % 60, p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d ? d + 'd ' + h + 'h' : p(h) + ':' + p(m) + ':' + p(x);
  }

  // ---------- data ----------
  var D = {}, wait = {};
  var FILES = {
    week: '/data/week.json', voices: '/data/voices.json', odds: '/data/numbers/odds.json',
    record: '/data/record.json', stories: '/data/stories.json', season: '/data/season.json',
    history: '/data/history.json'
  };
  function need(keys) {
    return Promise.all(keys.map(function (k) {
      if (!wait[k]) wait[k] = fetch(FILES[k], { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (j) { D[k] = j; return j; });
      return wait[k];
    }));
  }
  function safe(fn) { try { return fn(); } catch (e) { if (window.console) console.warn('header:', e); } }

  function season() { return String((D.record && D.record.current) || new Date().getFullYear()); }
  function nameOf(code) { return (D.record && D.record.managers && D.record.managers[code]) || code; }
  function codeOf(name) {
    var M = (D.record && D.record.managers) || {};
    for (var c in M) if (M[c] === name) return c;
    return null;
  }
  function stories() { return (D.stories && D.stories.stories) || []; }
  function story(slug) { return stories().filter(function (s) { return s.slug === slug; })[0] || null; }
  function art(s) { return s ? (s.thumb || s.img) : null; }

  // the standings, the way the homepage sorts them
  function table() {
    var t = ((D.season && D.season.teams) || []).slice();
    t.forEach(function (x) { var g = x.w + x.l + (x.tie || 0); x.pct = g ? (x.w + (x.tie || 0) / 2) / g : 0; });
    t.sort(function (a, b) { return b.pct - a.pct || b.pf - a.pf; });
    t.forEach(function (x, i) { x.rank = i + 1; });
    return t;
  }
  function rec(x) { return x.w + '-' + x.l + (x.tie ? '-' + x.tie : ''); }

  // one week of this season's game log: the high, the low, and every game by name
  function weekLog(w) {
    var W = D.record && D.record.weeks && D.record.weeks[season()];
    var g = W && W[w - 1];
    if (!g || !g.length) return null;
    var all = [];
    g.forEach(function (x) { all.push({ n: nameOf(x[0]), v: x[1], o: nameOf(x[2]) }, { n: nameOf(x[2]), v: x[3], o: nameOf(x[0]) }); });
    all.sort(function (a, b) { return b.v - a.v; });
    return { hi: all[0], lo: all[all.length - 1], games: g };
  }
  function weeksPlayed() {
    var W = D.record && D.record.weeks && D.record.weeks[season()];
    return W ? W.length : 0;
  }
  function lockFor(w) {
    var L = (D.voices && D.voices.wes && D.voices.wes.locks) || [];
    return L.filter(function (x) { return x.week === w; })[0] || null;
  }
  function gotwFor(w) {
    var G = (D.voices && D.voices.gotw) || [];
    return G.filter(function (x) { return x.week === w; })[0] || null;
  }
  function why(g) { return g && g.reason && !/^projected/i.test(g.reason) ? g.reason : ''; }
  function matchup(name) {
    var ms = (D.week && D.week.matchups) || [];
    for (var i = 0; i < ms.length; i++) {
      if (ms[i].a.m === name) return { me: ms[i].a, them: ms[i].b };
      if (ms[i].b.m === name) return { me: ms[i].b, them: ms[i].a };
    }
    return null;
  }

  // The week open for picking, the same rule as /api/picks: once a week is final, picking
  // rolls to the next one as soon as its Game of the Week is named; picks lock at the week's
  // first kickoff, and any score on the board means it's too late.
  function pickState() {
    var w = D.week;
    if (!w) return null;
    var G = (D.voices && D.voices.gotw) || [];
    var rolled = w.status === 'final' && G.some(function (x) { return x.week === w.week + 1; });
    var n = rolled ? w.week + 1 : w.week;
    var next = w.nextGame && w.nextGame.kickoff ? new Date(w.nextGame.kickoff) : null;
    var at = w.nextWeek === n && w.nextKickoff ? new Date(w.nextKickoff) : (rolled || w.status === 'preseason') ? next : null;
    var started = rolled ? false : w.status !== 'preseason';
    return {
      n: n, rolled: rolled, game: gotwFor(n), at: at,
      locked: started || (at ? Date.now() >= at.getTime() : true),
      live: !rolled && w.status === 'live', final: !rolled && w.status === 'final'
    };
  }
  var PS = null;

  // ---------- where am I ----------
  var path = location.pathname.replace(/index\.html$/, '');
  var HERE = path === '/' || path.indexOf('/numbers/') === 0 ? 'season'
    : path.indexOf('/updates/') === 0 || path.indexOf('/story/') === 0 ? 'booth'
    : path.indexOf('/members/') === 0 ? 'hombres'
    : path.indexOf('/record/') === 0 || path.indexOf('/bylaws/') === 0 ? 'records' : '';
  safe(function () {
    [].forEach.call(H.querySelectorAll('.bhn-item'), function (it) { it.classList.toggle('here', it.getAttribute('data-k') === HERE); });
    [].forEach.call(document.querySelectorAll('.bhn-tab[data-k]'), function (t) {
      var on = t.getAttribute('data-k') === HERE;
      t.classList.toggle('on', on);
      if (on) t.setAttribute('aria-current', 'page');
    });
    if (path.indexOf('/picks/') === 0) $('bhnPick').classList.add('here');
  });

  // ---------- the button ----------
  // the button counts down to the week's first kickoff, when picks lock (tick() keeps it running)
  function renderPick() {
    var a = $('bhnPick'); if (!a) return;
    var P = PS, l = 'Pick\u2019em', s = 'Pick\u2019em', k = a.querySelector('.bhn-pick-k');
    k.removeAttribute('data-cd'); k.textContent = ''; a.removeAttribute('title');
    if (P && P.game && !P.locked && P.at) {
      l = 'Make your pick'; s = 'Pick';
      k.setAttribute('data-cd', '');
      k.textContent = clock(P.at.getTime() - Date.now());
      a.title = 'Call ' + P.game.a + ' vs ' + P.game.b + ' before ' + (isToday(P.at) ? '' : etDow(P.at) + ' ') + etTime(P.at) + ' ET';
    } else if (P && P.game) {
      l = 'See the picks'; s = 'Picks';
    }
    a.querySelector('.l').textContent = l;
    a.querySelector('.s').textContent = s;
  }

  // ---------- the crawl ----------
  function crawlItems() {
    var P = PS, w = D.week, out = [];
    if (!P || !w) return out;
    var pv = story('week-' + P.n + '-preview');

    if (!P.locked && P.at) {
      var soon = P.at.getTime() - Date.now() < 864e5;
      out.push({
        k: 'Picks lock', c: 'gold', href: '/picks/',
        v: (isToday(P.at) ? '' : etDow(P.at) + ' ') + esc(etTime(P.at)) + ' ET' + (soon ? ' \u00b7 <span class="cd" data-cd></span>' : ''),
        dv: (isToday(P.at) ? 'Tonight, ' : etDow(P.at) + ', ') + esc(etTime(P.at)) + ' ET' +
          (w.nextGame && w.nextGame.away ? ' \u00b7 ' + esc(w.nextGame.away + ' at ' + w.nextGame.home) : ''),
        ds: soon ? '<span class="cd" data-cd></span> to call the Game of the Week' : 'Call the Game of the Week before kickoff',
        pick: true
      });
    } else if (P.live || (P.locked && P.at && !P.final)) {
      // live, or past kickoff before the data catches up
      out.push({ k: 'Live', c: 'red', href: '/#season', v: 'Week ' + w.week + (P.live ? ' scores are moving' : ' is under way'), ds: 'The scoreboard updates all weekend' });
    } else if (P.final) {
      out.push({ k: 'Final', href: '/#season', v: 'Week ' + w.week + ' is in the books' });
    }

    if (P.game) {
      var g = P.game, r = why(g), m = matchup(g.a), v, ds = '';
      if ((P.live || P.final) && m && m.them.m === g.b) {
        v = esc(g.a) + ' ' + m.me.s.toFixed(2) + ' \u2013 ' + m.them.s.toFixed(2) + ' ' + esc(g.b);
      } else {
        v = esc(g.a) + ' vs ' + esc(g.b) + (r ? ', the ' + esc(r) : '');
        if (m && m.them.m === g.b && m.me.p) ds = 'Projected ' + m.me.p.toFixed(2) + ' \u2013 ' + m.them.p.toFixed(2);
      }
      out.push({ k: 'Game of the Week', href: '/picks/', v: v, ds: ds, avs: [g.a, g.b] });
    }

    var o = D.odds && String(D.odds.season) === season() && D.odds.baseline;
    if (o) {
      var bm = Object.keys(o).map(function (n) { return { n: n, p: o[n].last || 0 }; })
        .sort(function (a, b) { return b.p - a.p; }).slice(0, 4).filter(function (x) { return x.p > 0; });
      if (bm.length) out.push({
        k: 'Beer Mile Watch', c: 'red', href: '/numbers/#odds',
        v: bm.map(function (x) { return esc(x.n) + ' ' + pct(x.p); }).join(' \u00b7 '),
        ds: 'Odds of finishing 12th, from ' + (D.odds.sims ? D.odds.sims.toLocaleString('en-US') + ' ' : '') + 'simulated seasons'
      });
    }

    var lk = lockFor(P.n), wr = D.voices && D.voices.wes && D.voices.wes.record;
    if (lk) out.push({
      k: 'Wes\u2019s Lock', href: pv ? '/story/' + pv.slug + '/' : null,
      v: esc(lk.pick) + (lk.result ? ' \u00b7 ' + esc(lk.result) : '') + (wr ? ' (' + wr.w + '-' + wr.l + ')' : ''),
      ds: wr ? 'Pastor Wes is ' + wr.w + '-' + wr.l + ' on locks this year' : ''
    });

    if (OWED.length) out.push({
      k: 'Still Owed', c: 'red', href: '/bylaws/',
      v: OWED.map(function (x) { return esc(x.who) + ': ' + esc(x.what); }).join(' \u00b7 '),
      ds: 'Skip it and you\u2019re banished. Allegedly.'
    });

    var L = weeksPlayed(), lg = L && weekLog(L);
    if (lg) {
      var rc = story('week-' + L + '-recap');
      out.push({
        k: 'Week ' + L, href: rc ? '/story/' + rc.slug + '/' : '/record/#seasons',
        v: 'Big Dick: ' + esc(lg.hi.n) + ', ' + lg.hi.v.toFixed(2) + ' \u00b7 Little Bitch: ' + esc(lg.lo.n) + ', ' + lg.lo.v.toFixed(2),
        ds: rc ? '<span class="go">Read the recap \u2192</span>' : ''
      });
    }
    return out;
  }

  var ITEMS = [], CRAWL = '', rot = 0, rotT = 0, SEP = '<span class="bhn-sep" aria-hidden="true"></span>';
  function itemHtml(x) {
    var inner = '<span class="k' + (x.c ? ' bhn-k-' + x.c : '') + '">' + esc(x.k) + '</span><span class="v">' + x.v + '</span>';
    return x.href ? '<a class="bhn-it" href="' + x.href + '">' + inner + '</a>' : '<span class="bhn-it">' + inner + '</span>';
  }
  function renderCrawl() {
    var P = PS;
    $('bhnWk').textContent = P ? 'Week ' + P.n : 'This Week';
    ITEMS = crawlItems();
    CRAWL = ITEMS.map(itemHtml).join(SEP);
    fitCrawl();
    // phones: one at a time, and the whole list in the drop-down
    $('bhnDrop').innerHTML = ITEMS.map(function (x) {
      var go = /class="go"/.test(x.ds || ''), tag = x.href ? 'a' : 'div';
      return '<' + tag + ' class="bhn-dr"' + (x.href ? ' href="' + x.href + '"' : '') + '><span class="top"><span class="k' + (x.c ? ' bhn-k-' + x.c : '') + '">' + esc(x.k) + '</span>' +
        (x.avs ? '<span class="avs">' + x.avs.map(function (n) { return av(n); }).join('') + '</span>' : '') + '</span>' +
        '<span class="v">' + (x.dv || x.v) + '</span>' + (x.ds ? '<span class="s' + (go ? ' go' : '') + '">' + x.ds.replace(/<span class="go">(.*?)<\/span>/, '$1') + '</span>' : '') +
        (x.pick ? '<span class="bhn-btn">' + ic('pick') + 'Make your pick</span>' : '') + '</' + tag + '>';
    }).join('');
    rot = Math.min(rot, Math.max(0, ITEMS.length - 1));
    showOne(false);
    tick();
  }
  function showOne(fade) {
    var one = $('bhnOne'), x = ITEMS[rot];
    if (!x) { one.innerHTML = ''; $('bhnCnt').textContent = ''; return; }
    var put = function () {
      one.innerHTML = '<span class="k' + (x.c ? ' bhn-k-' + x.c : '') + '">' + esc(x.k) + '</span><span class="v">' + x.v + '</span>';
      $('bhnCnt').textContent = (rot + 1) + '/' + ITEMS.length;
      one.classList.remove('fade');
      tick();
    };
    if (fade) { one.classList.add('fade'); setTimeout(put, 250); } else put();
  }
  var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function rotate() {
    clearInterval(rotT);
    if (still) return;
    rotT = setInterval(function () {
      if (document.hidden || H.classList.contains('drop-open') || ITEMS.length < 2) return;
      rot = (rot + 1) % ITEMS.length;
      showOne(true);
    }, 4500);
  }
  // the desktop crawl only moves when it doesn't fit: then it runs twice, back to back,
  // and slides one lap (half its width) on a loop
  function fitCrawl() {
    var run = $('bhnRun'), tr = run.parentNode;
    run.classList.remove('go');
    run.innerHTML = CRAWL;
    if (!tr.clientWidth || still || run.scrollWidth <= tr.clientWidth - 24) { tick(); return; }
    run.innerHTML = CRAWL + SEP + '<span data-copy aria-hidden="true" style="display:contents">' + CRAWL + SEP + '</span>';
    [].forEach.call(run.querySelectorAll('[data-copy] a'), function (a) { a.tabIndex = -1; });
    run.style.setProperty('--bhn-dur', Math.round(run.scrollWidth / 2 / 42) + 's');
    run.classList.add('go');
    tick();
  }
  // the lock countdown, everywhere it shows
  var cdT = 0;
  function tick() {
    var P = PS;
    if (!P || !P.at || P.locked) return;
    var ms = P.at.getTime() - Date.now();
    if (ms <= 0) { PS = pickState(); renderPick(); renderCrawl(); renderMore(); return; }
    [].forEach.call(document.querySelectorAll('[data-cd]'), function (n) { n.textContent = clock(ms); });
  }

  // ---------- menus ----------
  var BUILT = {};
  function panel(k) { return $('bhn-p-' + k).querySelector('.bhn-in'); }
  function linkList(head, rows) {
    return '<div class="bhn-links-col">' + (head ? '<span class="bhn-eb">' + esc(head) + '</span>' : '') + '<div class="bhn-links">' + rows.map(function (r) {
      var on = r.on ? ' on' : '';
      return '<a class="bhn-link' + on + '" href="' + r.href + '"' + (r.on ? ' aria-current="page"' : '') + '><span class="bhn-ib">' + ic(r.ic) +
        '</span><span><span class="bhn-lt">' + esc(r.t) + '</span><span class="bhn-ls">' + esc(r.s) + '</span></span></a>';
    }).join('') + '</div></div>';
  }

  // Season: the links (Hard Numbers is one of them), the standings card, the week card
  var wcW = 0;
  function buildSeason() {
    var T = table(), b = D.week && D.week.bonus, amt = D.season && D.season.weeklyBonus;
    var html = '<div class="bhn-grid bhn-g-season">' + linkList('', [
      { ic: 'chart', t: 'This Week', s: 'Scoreboard + Game of the Week', href: '/#season', on: path === '/' },
      { ic: 'trend', t: 'Power Lines', s: 'The rise & fall, week to week', href: '/#power-lines' },
      { ic: 'dollar', t: 'Bonus Board', s: b && b.nm ? b.nm + (amt ? ' \u00b7 $' + amt : '') : 'Every weekly bonus', href: '/#bonus-board' },
      { ic: 'beer', t: 'Beer Mile Watch', s: 'The bottom four, ranked by dread', href: '/numbers/#odds' },
      { ic: 'hash', t: 'Hard Numbers', s: '7 desks: The Pine, Choke Ledger, Odds\u2026', href: '/numbers/', on: path === '/numbers/' }
    ]);
    if (T.length) {
      var row = function (x) {
        return '<a class="bhn-sr' + (x.rank === T.length ? ' last' : '') + '" href="' + profile(x.m) + '"><span class="rk">' + x.rank + '</span>' + av(x.m) +
          '<span class="nm">' + esc(x.m) + '</span><span class="rc">' + rec(x) + '</span></a>';
      };
      html += '<div class="bhn-card"><div class="bhn-ch"><a class="bhn-ct" href="/#standings">Standings</a><a class="bhn-more" href="/#standings">Full table \u2192</a></div>' +
        T.slice(0, 4).map(row).join('') + '<div class="bhn-pool"><span>BEER MILE POOL</span></div>' + T.slice(-4).map(row).join('') + '</div>';
    }
    html += '<div class="bhn-wkc" id="bhnWkc"></div></div>';
    panel('season').innerHTML = html;
    wcW = weeksPlayed();
    weekCard();
  }
  function weekCard() {
    var el = $('bhnWkc'); if (!el) return;
    var L = weeksPlayed(), w = wcW, lg = w && weekLog(w);
    if (!lg) { el.style.display = 'none'; return; }
    var rc = story('week-' + w + '-recap'), pv = story('week-' + w + '-preview'), pic = art(rc) || art(pv);
    var g = gotwFor(w), lk = lockFor(w), gl = '';
    if (g) lg.games.forEach(function (x) {
      var a = nameOf(x[0]), b = nameOf(x[2]);
      if ((a === g.a && b === g.b) || (a === g.b && b === g.a)) {
        var aw = x[1] >= x[3];
        gl = esc(aw ? a : b) + ' over ' + esc(aw ? b : a) + ', ' + Math.max(x[1], x[3]).toFixed(2) + '\u2013' + Math.min(x[1], x[3]).toFixed(2);
      }
    });
    el.innerHTML = '<div class="bhn-wkh"><button class="bhn-arw" type="button" data-wk="-1" aria-label="Previous week"' + (w <= 1 ? ' disabled' : '') + '>' + ic('left') +
      '</button><b>Week ' + w + ' \u00b7 Final</b><button class="bhn-arw" type="button" data-wk="1" aria-label="Next week"' + (w >= L ? ' disabled' : '') + '>' + ic('right') + '</button></div>' +
      (pic ? '<img class="bhn-art' + (/\.svg$/.test(pic) ? ' svg' : '') + '" src="' + pic + '" alt="" loading="lazy">' : '') +
      (rc ? '<a class="bhn-wkt" href="/story/' + rc.slug + '/">' + esc(rc.title) + '</a>' : '<span class="bhn-wkt">Week ' + w + '</span>') +
      '<div class="bhn-aw">' + [['Big Dick', 'gold', lg.hi], ['Little Bitch', 'red', lg.lo]].map(function (a) {
        return '<a class="bhn-awb ' + a[1] + '" href="' + profile(a[2].n) + '">' + av(a[2].n) + '<span><span class="l bhn-k-' + a[1] + '">' + a[0] + '</span><span class="v">' +
          esc(a[2].n) + ' \u00b7 ' + a[2].v.toFixed(2) + '</span></span></a>';
      }).join('') + '</div>' +
      (gl ? '<div class="bhn-kv"><span class="l">Game of the Week</span><span>' + gl + '</span></div>' : '') +
      (lk ? '<div class="bhn-kv"><span class="l">Wes\u2019s Lock</span><span>' + esc(lk.pick) + (lk.result ? ' \u00b7 ' + esc(lk.result) : '') + '</span></div>' : '') +
      (rc ? '<a class="bhn-more" href="/story/' + rc.slug + '/">Week ' + w + ' recap \u2192</a>' : '<a class="bhn-more" href="/record/#seasons">Week ' + w + ' in the Record Book \u2192</a>');
    [].forEach.call(el.querySelectorAll('[data-wk]'), function (bt) {
      bt.onclick = function () { wcW = Math.max(1, Math.min(L, wcW + Number(bt.getAttribute('data-wk')))); weekCard(); };
    });
  }

  // The Booth: the types, the newest story up big, the next four on the shelf
  function buildBooth() {
    var S = stories(), n = S.length;
    var nR = S.filter(function (s) { return s.type === 'recap'; }).length, nF = S.filter(function (s) { return s.type === 'feature'; }).length;
    var html = '<div class="bhn-grid bhn-g-booth">' + linkList('The Booth', [
      { ic: 'mic', t: 'All Stories', s: n ? n + ' recaps, previews & features' : 'Every recap and story', href: '/updates/', on: path === '/updates/' },
      { ic: 'list', t: 'Recaps', s: nR ? word(nR) + ' week' + (nR === 1 ? '' : 's') + ', ' + word(nR).toLowerCase() + ' autops' + (nR === 1 ? 'y' : 'ies') : 'Every week, after Monday night', href: '/updates/#recaps' },
      { ic: 'calendar', t: 'Previews', s: 'Every matchup, before kickoff', href: '/updates/#previews' },
      { ic: 'book', t: 'Features', s: nF ? word(nF) + ' long read' + (nF === 1 ? '' : 's') : 'The long reads', href: '/updates/#features' }
    ]);
    var top = S[0];
    if (top) {
      var g = top.type === 'preview' && gotwFor(top.week), T = table(), pic;
      if (g) {
        var side = function (nm, cls) {
          var t = T.filter(function (x) { return x.m === nm; })[0], m = top.week === (D.week && D.week.week) && matchup(nm);
          return '<span class="sd ' + cls + '">' + av(nm) + '<b>' + esc(nm) + '</b><span>' + (t ? ord(t.rank) : '') +
            (m && m.me.p ? ' \u00b7 proj. ' + m.me.p.toFixed(2) : '') + '</span></span>';
        };
        pic = '<span class="bhn-vs"><span class="lab">GAME OF THE WEEK</span>' + side(g.a, 'a') + '<span class="x">VS</span>' +
          (why(g) ? '<span class="why">The ' + esc(why(g)) + '</span>' : '') + side(g.b, 'b') + '</span>';
      } else {
        var a = art(top);
        pic = a ? '<img class="img' + (/\.svg$/.test(a) ? ' svg' : '') + '" src="' + a + '" alt="" loading="lazy">' : '';
      }
      html += '<a class="bhn-feat" href="/story/' + top.slug + '/">' + pic + '<span class="k">' + esc(top.kicker) + '</span><span class="t">' + esc(top.title) +
        '</span><span class="d">' + esc(top.dek) + '</span><span class="bhn-more">Read the ' + (top.type === 'feature' ? 'story' : top.type) + ' \u2192</span></a>';
      html += '<div><div class="bhn-shelf-h"><span class="bhn-eb">Latest</span><a class="bhn-more" href="/updates/">All ' + n + ' stories \u2192</a></div>' +
        S.slice(1, 5).map(function (s) {
          var a = art(s);
          return '<a class="bhn-story" href="/story/' + s.slug + '/">' + (a ? '<img' + (/\.svg$/.test(a) ? ' class="svg"' : '') + ' src="' + a + '" alt="" loading="lazy">' : '') +
            '<span><span class="k">' + esc(s.kicker) + '</span><span class="t">' + esc(s.title) + '</span></span></a>';
        }).join('') + '</div>';
    }
    panel('booth').innerHTML = html + '</div>';
  }

  // The Hombres: all twelve in standings order, and Tecmo's card for whoever you're on
  var SEL = null;
  function hombres() {
    var T = table(), hist = D.history || {}, prof = hist.profiles || {}, mon = (hist.money && hist.money.members) || {};
    var odds = (D.odds && String(D.odds.season) === season() && D.odds.baseline) || {};
    var champs = champions();
    return T.map(function (x) {
      var c = codeOf(x.m), p = prof[c] || null;
      return {
        m: x.m, c: c, t: x.t, rank: x.rank, w: x.w, l: x.l, tie: x.tie, bank: x.bank, pool: x.rank > T.length - 4,
        p: p, money: mon[c] || null, odds: odds[x.m] || null,
        rings: champs.filter(function (k) { return k.c === c; }).length
      };
    });
  }
  function buildHombres() {
    panel('hombres').innerHTML = '<div class="bhn-hh"><span class="bhn-eb">The Hombres \u00b7 Faces of the Franchise</span>' +
      '<div class="r"><a href="/record/#h2h">Head-to-Head \u2192</a><a href="/record/#awards">Lifetime Money \u2192</a></div></div>' +
      '<div class="bhn-hb"><div class="bhn-roster" id="bhnRoster"></div><div class="bhn-tec" id="bhnTec" aria-live="polite"></div></div>';
    var me = (document.cookie.match(/(?:^|; )bh_who=([^;]*)/) || [])[1];
    me = me ? decodeURIComponent(me) : '';
    var R = hombres();
    SEL = R.some(function (x) { return x.m === me; }) ? me : (PS && PS.game ? PS.game.a : R[0] && R[0].m);
    roster();
  }
  function roster() {
    var R = hombres();
    $('bhnRoster').innerHTML = R.map(function (x) {
      return '<a class="bhn-tile' + (x.pool ? ' pool' : '') + (x.m === SEL ? ' sel' : '') + '" href="' + profile(x.m) + '" data-m="' + esc(x.m) + '">' +
        '<span class="rk">' + x.rank + '</span><span class="cur" aria-hidden="true"></span>' +
        (x.pool ? '<svg class="bm" viewBox="0 0 24 24" aria-label="Beer Mile pool">' + ICON.beer + '</svg>' : '') +
        av(x.m) + '<span class="n">' + esc(x.m) + '</span><span class="tm">' + esc(x.t) + '</span><span class="st">' + rec(x) + '</span></a>';
    }).join('');
    [].forEach.call($('bhnRoster').querySelectorAll('.bhn-tile'), function (t) {
      var pick = function () {
        SEL = t.getAttribute('data-m');
        [].forEach.call($('bhnRoster').querySelectorAll('.bhn-tile'), function (x) { x.classList.toggle('sel', x === t); });
        tecmo();
      };
      t.addEventListener('mouseenter', pick);
      t.addEventListener('focus', pick);
    });
    tecmo();
  }
  function tecmo() {
    var x = hombres().filter(function (r) { return r.m === SEL; })[0], el = $('bhnTec');
    if (!x || !el) return;
    var p = x.p, mo = x.money, o = x.odds, mu = matchup(x.m), wk = D.week, G = wk && gotwFor(wk.week), tw = '';
    if (mu) {
      var big = G && ((G.a === x.m && G.b === mu.them.m) || (G.b === x.m && G.a === mu.them.m));
      var nums = wk.status === 'preseason' ? (mu.me.p ? 'proj. ' + mu.me.p.toFixed(2) + ' \u2013 ' + mu.them.p.toFixed(2) : '')
        : mu.me.s.toFixed(2) + ' \u2013 ' + mu.them.s.toFixed(2) + (wk.status === 'final' ? (mu.me.s > mu.them.s ? ', a W' : mu.me.s < mu.them.s ? ', an L' : ', a tie') : '');
      tw = 'vs ' + esc(mu.them.m) + (big ? ' \u00b7 the ' + esc(why(G) || 'Game of the Week') : '') + (nums ? ' \u00b7 ' + nums : '');
    }
    var bars = '';
    if (o) bars = [['Playoff odds', o.playoffs, 'var(--green)', pct(o.playoffs)], ['Beer Mile danger', o.last, 'var(--red)', pct(o.last) + (o.last >= 0.02 ? ' \u00b7 1 in ' + Math.round(1 / o.last) : '')]]
      .map(function (b) {
        return '<div class="bhn-bar2"><span class="row"><span class="l"' + (b[0] === 'Beer Mile danger' ? ' style="color:var(--bhn-redt)"' : ' style="color:var(--green)"') + '>' + b[0] +
          '</span><b>' + b[3] + '</b></span><span class="trk"><i style="width:' + Math.max(2, Math.round(b[1] * 100)) + '%;background:' + b[2] + '"></i></span></div>';
      }).join('');
    el.innerHTML = '<div class="hd">' + av(x.m, x.rings ? 'ring' : '') + '<div><div class="nm">' + esc(x.m) + '</div><div class="tm">' + esc(x.t) + '</div><div class="bhn-pills">' +
      (x.rings ? '<span class="bhn-pl gold">' + x.rings + '\u00d7 champ</span>' : '') + '<span class="bhn-pl' + (x.pool ? ' red' : '') + '">' + ord(x.rank) + ' \u00b7 ' + rec(x) + '</span></div></div></div>' +
      '<div class="bhn-stx">' +
      (p ? '<div><span class="l">All-time</span><span class="v">' + p.w + '-' + p.l + '</span></div><div><span class="l">Win %</span><span class="v">' + three(p.pct) + '</span></div>' : '') +
      '<div><span class="l">Season bank</span><span class="v">' + usd(x.bank || 0) + '</span></div>' +
      (mo ? '<div><span class="l">Lifetime</span><span class="v ' + (mo.net > 0 ? 'pos' : mo.net < 0 ? 'neg' : '') + '">' + signed(mo.net) + '</span></div>' : '') + '</div>' +
      bars + (tw ? '<div class="bhn-tw"><span class="l">This week</span><span class="v">' + tw + '</span></div>' : '') +
      (mo && mo.line ? '<p class="bhn-q">\u201c' + esc(mo.line) + '\u201d</p>' : '') +
      '<div class="lk"><a href="' + profile(x.m) + '">Full profile \u2192</a><a href="/record/#h2h">Head-to-head \u2192</a></div>';
  }

  // Record Book: the deep links, the Hall of Champions left to right, four records
  function champions() {
    var r = D.record || {}, out = [{ y: '2020', c: CHAMP_2020.code, team: CHAMP_2020.team }];
    Object.keys(r.champ || {}).sort().forEach(function (y) {
      var c = r.champ[y];
      out.push({ y: y, c: c, team: CHAMP_TEAM[y] || (r.teams && r.teams[y] && r.teams[y][c]) || '' });
    });
    return out;
  }
  function buildRecords() {
    var hist = D.history || {}, prof = hist.profiles || {}, mon = hist.money || {}, C = champions();
    var codes = Object.keys(prof), best = null, hi = null, lo = null, rich = null;
    codes.forEach(function (c) {
      var p = prof[c];
      if (!best || p.pct > best.p.pct) best = { c: c, p: p };
      if (p.high && (!hi || p.high.v > hi.v)) hi = { c: c, v: p.high.v, y: p.high.y, o: p.high.opp };
      if (p.low && (!lo || p.low.v < lo.v)) lo = { c: c, v: p.low.v, y: p.low.y, o: p.low.opp };
    });
    Object.keys(mon.members || {}).forEach(function (c) { var m = mon.members[c]; if (!rich || m.net > rich.m.net) rich = { c: c, m: m }; });
    var ringsOf = function (c) { return C.filter(function (k) { return k.c === c; }).length; };
    var html = '<div class="bhn-grid bhn-g-rec">' + linkList('Record Book', [
      { ic: 'list', t: 'All-Time Standings', s: best ? nameOf(best.c) + '\u2019s on top.' + (ringsOf(best.c) ? '' : ' Zero rings.') : 'Every season, one table', href: '/record/', on: path === '/record/' },
      { ic: 'swords', t: 'Head-to-Head', s: 'Every rivalry since 2021', href: '/record/#h2h' },
      { ic: 'star', t: 'Records', s: 'Highs, lows & blowouts', href: '/record/#records' },
      { ic: 'calendar', t: 'Year by Year', s: 'Every season, every bracket', href: '/record/#seasons' },
      { ic: 'dollar', t: 'Awards & Money', s: mon.paidOut ? usd(Math.round(mon.paidOut)) + ' paid out since 2020' : 'Who got paid, for what', href: '/record/#awards' },
      { ic: 'file', t: 'By-Laws', s: 'The Contract, and who still owes', href: '/bylaws/', on: path === '/bylaws/' }
    ]);
    var last = C[C.length - 1], T = table(), cur = season(), defend = '';
    if (last && String(Number(last.y) + 1) === cur) {
      var two = C.length > 1 && C[C.length - 2].c === last.c, t = T.filter(function (x) { return x.m === nameOf(last.c); })[0];
      defend = (two ? 'Three-peat watch: ' : 'Defending: ') + nameOf(last.c) + (t ? ' is ' + rec(t) : '');
    }
    html += '<div><div class="bhn-rbh"><span class="bhn-eb">Hall of Champions \u00b7 ' + C[0].y + ' \u2192 ' + cur + '</span><a class="bhn-more" href="/record/#seasons">Every season \u2192</a></div>' +
      '<div class="bhn-hoc">' + C.map(function (k, i) {
        var tag = k.y === '2020' ? 'ESPN ERA' : i === C.length - 1 ? 'REIGNING' : '';
        return '<a class="bhn-champ' + (tag === 'REIGNING' ? ' reign' : '') + '" href="' + (k.y === '2020' ? profile(nameOf(k.c)) : '/record/#seasons-' + k.y) + '"><span class="y">' + k.y + '</span>' + av(nameOf(k.c)) +
          '<span class="n">' + esc(nameOf(k.c)) + '</span><span class="tm">' + esc(k.team) + '</span>' + (tag ? '<span class="tag">' + tag + '</span>' : '') + '</a>';
      }).join('') + (C.some(function (k) { return k.y === cur; }) ? '' :
        '<span class="bhn-champ next"><span class="y">' + cur + '</span><span class="q">?</span><span class="n">TBD</span><span class="tm">' + esc(defend || 'Week 17 decides it') + '</span></span>') + '</div>';
    var card = function (l, v, cls, c, s, href) {
      return '<a class="bhn-rec" href="' + href + '">' + av(nameOf(c)) + '<span><span class="l">' + l + '</span><span class="v ' + cls + '">' + v + '</span><span class="s">' + esc(nameOf(c)) + ' \u00b7 ' + s + '</span></span></a>';
    };
    var recs = [];
    if (hi) recs.push(card('Highest score ever', hi.v.toFixed(2), '', hi.c, 'vs ' + esc(hi.o) + ', ' + hi.y, '/record/#records'));
    if (lo) recs.push(card('Lowest score ever', lo.v.toFixed(2), 'red', lo.c, 'vs ' + esc(lo.o) + ', ' + lo.y, '/record/#records'));
    if (best) recs.push(card('Best win %, all-time', three(best.p.pct), '', best.c, best.p.w + '-' + best.p.l + (ringsOf(best.c) ? '' : '. Zero rings.'), '/record/'));
    if (rich) recs.push(card('Lifetime money', signed(rich.m.net), 'pos', rich.c, (rich.m.share ? Math.round(rich.m.share) + '% of every dollar' : 'all-time net'), '/record/#awards'));
    if (recs.length) html += '<div class="bhn-rbh"><span class="bhn-eb">Records</span><a class="bhn-more" href="/record/#records">All records \u2192</a></div><div class="bhn-recs">' + recs.join('') + '</div>';
    panel('records').innerHTML = html + '</div></div>';
  }

  var NEEDS = {
    season: ['week', 'season', 'record', 'voices', 'stories'],
    booth: ['stories', 'voices', 'week', 'season', 'record'],
    hombres: ['season', 'history', 'odds', 'record', 'week', 'voices'],
    records: ['record', 'history', 'season']
  };
  var BUILD = { season: buildSeason, booth: buildBooth, hombres: buildHombres, records: buildRecords };
  function ensure(k) {
    if (BUILT[k]) return BUILT[k];
    return (BUILT[k] = need(NEEDS[k]).then(function () { safe(BUILD[k]); }));
  }

  // open and close: hover with a little intent on a mouse, the chevron (or a first tap
  // on touch) everywhere else; Escape, the scrim or leaving closes
  var items = [].slice.call(H.querySelectorAll('.bhn-item')), open = null, tOpen = 0, tClose = 0;
  var noHover = window.matchMedia && matchMedia('(hover: none)').matches;
  function show(it) {
    if (open === it) return;
    if (open) hide(open);
    open = it;
    it.classList.add('open');
    it.querySelector('.bhn-tog').setAttribute('aria-expanded', 'true');
    document.body.classList.add('bhn-open');
    ensure(it.getAttribute('data-k'));
  }
  function hide(it) {
    it.classList.remove('open');
    it.querySelector('.bhn-tog').setAttribute('aria-expanded', 'false');
    if (open === it) { open = null; document.body.classList.remove('bhn-open'); }
  }
  items.forEach(function (it) {
    it.addEventListener('pointerenter', function (e) {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(tClose); clearTimeout(tOpen);
      tOpen = setTimeout(function () { show(it); }, open ? 0 : 110);
    });
    it.addEventListener('pointerleave', function (e) {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(tOpen);
      tClose = setTimeout(function () { if (open === it) hide(it); }, 240);
    });
    it.querySelector('.bhn-tog').addEventListener('click', function () { if (open === it) hide(it); else show(it); });
    it.querySelector('.bhn-top').addEventListener('click', function (e) {
      if (noHover && open !== it) { e.preventDefault(); show(it); }
    });
    // tabbing out of a menu closes it (a click on a menu's empty space doesn't)
    it.addEventListener('focusout', function (e) { if (open === it && e.relatedTarget && !it.contains(e.relatedTarget)) hide(it); });
  });
  $('bhnScrim').addEventListener('click', function () { if (open) hide(open); drop(false); more(false); });
  // picking a link in a menu, the drop-down or the More sheet folds it away as it takes you
  // there, which matters when the link is somewhere on this same page
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (open && a.closest('.bhn-panel')) { clearTimeout(tOpen); hide(open); a.blur(); }
    if (a.closest('#bhnDrop')) drop(false);
    if (a.closest('#bhnSheet')) more(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (open) { var t = open.querySelector('.bhn-tog'); hide(open); t.focus(); }
    drop(false); more(false);
  });

  // phones: the Week drop-down and the More sheet
  function drop(on) {
    var b = $('bhnWkBtn'); if (!b) return;
    if (on === undefined) on = !H.classList.contains('drop-open');
    if (on) more(false);
    H.classList.toggle('drop-open', on);
    document.body.classList.toggle('bhn-dropped', on);
    b.setAttribute('aria-expanded', String(on));
  }
  $('bhnWkBtn').addEventListener('click', function () { drop(); });
  function more(on) {
    var s = $('bhnSheet'), b = $('bhnMoreBtn'); if (!s || !b) return;
    if (on === undefined) on = !s.classList.contains('open');
    if (on) drop(false);
    s.classList.toggle('open', on);
    b.classList.toggle('on', on || b.getAttribute('data-k') === HERE);
    [].forEach.call(document.querySelectorAll('.bhn-tab[data-k]'), function (t) {
      if (t !== b) t.classList.toggle('on', !on && t.getAttribute('data-k') === HERE);
    });
    document.body.classList.toggle('bhn-more', on);
    document.body.classList.toggle('bhn-lock', on);
    b.setAttribute('aria-expanded', String(on));
    if (on) { var x = s.querySelector('.bhn-x'); if (x) x.focus(); }
  }
  $('bhnMoreBtn').addEventListener('click', function () { more(); });
  function renderMore() {
    var P = PS, s = $('bhnSheet');
    var pk = P && P.game ? (!P.locked && P.at ? ['Make your pick', esc(P.game.a) + ' vs ' + esc(P.game.b) + ' \u00b7 locks ' + (isToday(P.at) ? '' : etDow(P.at) + ' ') + esc(etTime(P.at)) + ' ET']
      : ['See the picks', esc(P.game.a) + ' vs ' + esc(P.game.b)]) : ['Pick\u2019em', 'Call the Game of the Week'];
    var grp = function (h, rows) {
      return '<div class="bhn-grp"><span>' + h + '</span>' + rows.map(function (r) {
        return '<a class="bhn-mr" href="' + r[3] + '"><span class="bhn-ib">' + ic(r[0]) + '</span><div><b>' + esc(r[1]) + (r[4] ? '<span class="bdg">' + r[4] + '</span>' : '') +
          '</b><small>' + esc(r[2]) + '</small></div>' + ic('right') + '</a>';
      }).join('') + '</div>';
    };
    s.innerHTML = '<div class="bhn-sh-h"><div><b>More</b><button class="bhn-x" type="button" aria-label="Close">' + ic('x') + '</button></div></div>' +
      '<a class="bhn-pk" href="/picks/">' + ic('pick') + '<div><b>' + pk[0] + '</b><span>' + pk[1] + '</span></div>' + ic('right') + '</a>' +
      grp('SEASON', [['chart', 'Hard Numbers', '7 desks: The Pine, Choke Ledger, Odds\u2026', '/numbers/'], ['trend', 'Power Lines', 'The rise & fall, week to week', '/#power-lines'],
        ['dollar', 'Bonus Board', 'Every weekly bonus', '/#bonus-board'], ['beer', 'Beer Mile Watch', 'The bottom four, ranked by dread', '/#stakes']]) +
      grp('HISTORY', [['swords', 'Head-to-Head', 'Every rivalry since 2021', '/record/#h2h'], ['dollar', 'Awards & Money', 'Who got paid, for what', '/record/#awards'],
        ['calendar', 'Year by Year', 'Every season, every bracket', '/record/#seasons'],
        ['file', 'By-Laws', 'The Contract, and who still owes', '/bylaws/', OWED.length ? OWED.length + ' still owed' : '']]);
    s.querySelector('.bhn-x').onclick = function () { more(false); $('bhnMoreBtn').focus(); };
  }

  // ---------- go ----------
  safe(renderMore);
  need(['week', 'voices', 'odds', 'record', 'stories']).then(function () {
    PS = safe(pickState) || null;
    safe(renderPick); safe(renderCrawl); safe(renderMore); rotate();
    clearInterval(cdT); cdT = setInterval(function () { safe(tick); }, 1000);
    // build the menus while the page is idle, so the first hover is instant (phones have no
    // menus, so they skip the extra files; a menu still builds the moment it's opened)
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 600); };
    if (!window.matchMedia || matchMedia('(min-width: 1024px)').matches)
      idle(function () { ['season', 'booth', 'hombres', 'records'].forEach(ensure); });
  });
  var rT = 0;
  window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(function () { safe(fitCrawl); }, 200); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) safe(tick); });
})();
