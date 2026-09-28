// Hard Numbers — helpers every tab module shares. Load the tab's data with HN.data(),
// build markup with the helpers, and style it with the .hn-* classes in index.html.
window.HN = window.HN || { tabs: {} };
(function (HN) {
  HN.esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
  // a manager's illustrated face, by first name
  HN.face = function (name) { return '<img class="hn-face" src="/assets/members/svg/' + encodeURIComponent(name) + '.svg" alt="" loading="lazy">'; };
  HN.who = function (name) { return HN.face(name) + HN.esc(name); };
  HN.num = function (v, d) { return v == null || isNaN(v) ? '—' : Number(v).toFixed(d == null ? 2 : d); };
  HN.pct = function (v, d) { return v == null || isNaN(v) ? '—' : (v * 100).toFixed(d == null ? 0 : d) + '%'; };
  HN.signed = function (v, d) { if (v == null || isNaN(v)) return '—'; var s = Number(v).toFixed(d == null ? 1 : d); return (v > 0 ? '+' : v < 0 ? '−' : '') + s.replace('-', ''); };
  HN.money = function (v) { return v == null ? '—' : '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }); };
  // fetch /data/numbers/<name>.json once per page
  var cache = {};
  HN.data = function (name) {
    if (!cache[name]) cache[name] = fetch('/data/numbers/' + name + '.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); });
    return cache[name];
  };
  HN.fail = function (el, why) { el.innerHTML = '<p class="hn-empty">' + HN.esc(why || 'These numbers aren’t built yet.') + '</p>'; };
  // a segmented control: HN.seg(['2026','2025'], '2026', function(v){...}) -> element
  HN.seg = function (opts, on, pick) {
    var w = document.createElement('div'); w.className = 'hn-seg';
    opts.forEach(function (o) {
      var v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
      var b = document.createElement('button'); b.type = 'button'; b.textContent = l; if (String(v) === String(on)) b.className = 'on';
      b.onclick = function () { [].forEach.call(w.children, function (x) { x.className = x === b ? 'on' : ''; }); pick(v); };
      w.appendChild(b);
    });
    return w;
  };
  // the season picker: a quiet dropdown that sits at the far right of a tab's bar.
  // HN.season([{v:2026,l:'2026'}, 2025, ...], 2026, function(v){...}) -> element
  HN.season = function (opts, on, pick) {
    var w = document.createElement('label'); w.className = 'hn-season';
    var sel = document.createElement('select'); sel.setAttribute('aria-label', 'Season');
    opts.forEach(function (o) {
      var v = typeof o === 'object' ? o.v : o, l = typeof o === 'object' ? o.l : o;
      var op = document.createElement('option'); op.value = String(v); op.textContent = l;
      if (String(v) === String(on)) op.selected = true;
      sel.appendChild(op);
    });
    sel.onchange = function () { pick(sel.value); };
    w.innerHTML = '<span>Season</span>'; w.appendChild(sel);
    return w;
  };
})(window.HN);
