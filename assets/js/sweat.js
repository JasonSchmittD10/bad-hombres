// The sweat chart: one matchup's live win probability over the week, ESPN-style.
// Used by the homepage (tap a matchup) and the Hard Numbers Choke Ledger.
//
//   BHSweat.load(week, fresh)               -> Promise of /api/pulse?week=N (cached per page; fresh refetches)
//   BHSweat.chart(el, weekData, a, b, opts) -> draws a vs b into el (a on top)
//
// weekData is /api/pulse?week=N: {samples: [[iso, {name: wp}, {name: score}], ...], final: {...}}.
// The x axis is the sample sequence, not the clock — samples only exist while games are
// live, so Thursday night, Sunday and Monday sit side by side with a day marker between.
(function () {
  var cache = {};
  function esc(t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function etParts(iso) {
    var d = new Date(iso);
    var s = d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
    var day = d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
    // games after midnight still belong to the night before
    var hr = Number(d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
    if (hr < 5) day = DAYS[(DAYS.indexOf(day) + 6) % 7];
    return { label: s, day: day };
  }

  function load(week, fresh) {
    if (fresh) delete cache[week];
    if (!cache[week]) cache[week] = fetch('/api/pulse?week=' + week, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
    return cache[week];
  }

  function chart(el, wk, a, b, opts) {
    opts = opts || {};
    var pts = (wk.samples || []).filter(function (s) { return s[1] && typeof s[1][a] === 'number'; });
    if (pts.length < 2) {
      el.innerHTML = '<div class="sw-empty">' + (pts.length ? 'One reading so far — the line starts with the next one.' :
        'No chart for this one — the pulse only records while games are live' + (opts.since ? ', and it started ' + esc(opts.since) : '') + '.') + '</div>';
      return;
    }
    var W = 600, H = 200, L = 8, R = 8, T = 14, B = 26, iw = W - L - R, ih = H - T - B;
    var x = function (i) { return L + (pts.length === 1 ? iw / 2 : i * iw / (pts.length - 1)); };
    var y = function (p) { return T + (1 - p) * ih; };
    var line = pts.map(function (s, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(s[1][a]).toFixed(1); }).join(' ');
    var area = line + ' L' + x(pts.length - 1).toFixed(1) + ' ' + y(0.5) + ' L' + x(0).toFixed(1) + ' ' + y(0.5) + ' Z';
    // day markers where the evening changes
    var marks = '', last = null;
    pts.forEach(function (s, i) {
      var d = etParts(s[0]).day;
      if (d !== last) {
        if (last !== null) marks += '<line x1="' + x(i).toFixed(1) + '" y1="' + T + '" x2="' + x(i).toFixed(1) + '" y2="' + (T + ih) + '" class="sw-day"/>';
        marks += '<text x="' + (x(i) + 4).toFixed(1) + '" y="' + (H - 8) + '" class="sw-dl">' + d + '</text>';
        last = d;
      }
    });
    var end = pts[pts.length - 1][1][a], ap = Math.round(end * 100);
    var fin = wk.final && wk.final[a];
    var endA = fin ? (fin.won ? 100 : 0) : ap;
    el.innerHTML =
      '<div class="sw">' +
      '<div class="sw-top"><b>' + esc(a) + '</b><span class="' + (endA >= 50 ? 'sw-up' : '') + '">' + endA + '%</span></div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" class="sw-svg" preserveAspectRatio="none" role="img" aria-label="' + esc(a) + ' win probability over the week">' +
      '<line x1="' + L + '" y1="' + y(0.5) + '" x2="' + (W - R) + '" y2="' + y(0.5) + '" class="sw-mid"/>' +
      '<text x="' + (W - R) + '" y="' + (y(0.5) - 4) + '" class="sw-ml" text-anchor="end">50</text>' +
      marks +
      '<path d="' + area + '" class="sw-area"/>' +
      '<path d="' + line + '" class="sw-line"/>' +
      '<line class="sw-cur" x1="0" y1="' + T + '" x2="0" y2="' + (T + ih) + '" style="display:none"/>' +
      '<circle class="sw-dot" r="4" style="display:none"/>' +
      '<rect x="' + L + '" y="' + T + '" width="' + iw + '" height="' + ih + '" class="sw-hit"/>' +
      '</svg>' +
      '<div class="sw-bot"><b>' + esc(b) + '</b><span class="' + (endA < 50 ? 'sw-up' : '') + '">' + (100 - endA) + '%</span></div>' +
      '<div class="sw-tip" style="display:none"></div>' +
      '</div>';
    var svg = el.querySelector('svg'), hit = el.querySelector('.sw-hit'), cur = el.querySelector('.sw-cur'), dot = el.querySelector('.sw-dot'), tip = el.querySelector('.sw-tip');
    function at(evt) {
      var r = svg.getBoundingClientRect(), cx = (evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left;
      var i = Math.max(0, Math.min(pts.length - 1, Math.round(((cx / r.width) * W - L) / iw * (pts.length - 1))));
      var s = pts[i], p = s[1][a], sc = s[2] || {};
      cur.setAttribute('x1', x(i)); cur.setAttribute('x2', x(i)); cur.style.display = '';
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p)); dot.style.display = '';
      tip.style.display = '';
      tip.innerHTML = esc(etParts(s[0]).label) + ' · <b>' + esc(a) + ' ' + Math.round(p * 100) + '%</b>' +
        (typeof sc[a] === 'number' && typeof sc[b] === 'number' ? ' · ' + sc[a].toFixed(2) + '–' + sc[b].toFixed(2) : '');
    }
    function off() { cur.style.display = 'none'; dot.style.display = 'none'; tip.style.display = 'none'; }
    hit.addEventListener('mousemove', at); hit.addEventListener('touchstart', at, { passive: true }); hit.addEventListener('touchmove', at, { passive: true });
    hit.addEventListener('mouseleave', off);
  }

  // styles live here so every page that includes the script gets them
  var css = '.sw{position:relative;margin-top:6px}' +
    '.sw-top,.sw-bot{display:flex;justify-content:space-between;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}' +
    '.sw-top b,.sw-bot b{color:var(--silver)}.sw-up{color:#fff}' +
    '.sw-svg{display:block;width:100%;height:150px;margin:4px 0}' +
    '.sw-mid{stroke:#3a3a44;stroke-width:1}.sw-ml{fill:#5e6470;font:700 10px "Segoe UI",sans-serif}' +
    '.sw-day{stroke:#2a2a31;stroke-width:1;stroke-dasharray:3 3}.sw-dl{fill:#5e6470;font:800 10px "Segoe UI",sans-serif;letter-spacing:.08em;text-transform:uppercase}' +
    '.sw-area{fill:rgba(193,18,31,.14)}.sw-line{fill:none;stroke:var(--red);stroke-width:2.2;stroke-linejoin:round}' +
    '.sw-cur{stroke:#fff;stroke-width:1;opacity:.5}.sw-dot{fill:#fff;stroke:var(--red);stroke-width:2}.sw-hit{fill:transparent;cursor:crosshair}' +
    '.sw-tip{position:absolute;left:0;right:0;top:-2px;text-align:center;font-size:11px;color:var(--silver);pointer-events:none}.sw-tip b{color:#fff}' +
    '.sw-empty{color:var(--muted);font-size:12px;text-align:center;padding:14px 6px}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  window.BHSweat = { load: load, chart: chart };
})();
