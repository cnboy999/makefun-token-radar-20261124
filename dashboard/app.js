// Token Radar radar-2 dashboard. Reads window.RADAR (data.js, written by
// main.ts from the same board.json), renders the board, filters, sorting,
// a per-protocol detail view and the live-token view. No network: every
// byte shown is in data.js. Query params drive deep links for screenshots:
// ?detail=<slug> ?category=<name> ?watchlist=1 ?view=live ?q=<text> ?sort=<key>
(function () {
  'use strict';
  var D = window.RADAR;
  if (!D) return;
  var WL = {};
  (D.watchlist_slugs || []).forEach(function (s) { WL[s] = true; });
  var params = new URLSearchParams(window.location.search);
  var state = {
    q: params.get('q') || '', category: params.get('category') || 'all',
    watch: params.get('watchlist') === '1', tab: params.get('view') === 'live' ? 'live' : 'pre-token',
    sort: params.get('sort') || 'implied', dir: -1, selected: params.get('detail') || null
  };
  var fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function usd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return fmt.format(n);
  }
  function pct(n) { return (n === null || n === undefined || !isFinite(n)) ? 'n/a' : (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function age(d) {
    if (d === null || d === undefined) return 'unknown';
    return d >= 365 ? (d / 365).toFixed(1) + 'y' : Math.max(0, Math.round(d)) + 'd';
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function chains(r) { return (r.chains && r.chains.length) ? r.chains.slice(0, 3).join(', ') : 'an unnamed chain'; }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return D.rows.filter(function (r) {
      if (state.watch && !WL[r.slug]) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var k = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (k === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (k === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (k === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (k === 'likelihood') { av = a.likelihood; bv = b.likelihood; }
      else if (k === 'rank') { av = a.rank; bv = b.rank; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : 1;
    });
  }
  function syncUrl() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('category', state.category);
    if (state.watch) p.set('watchlist', '1');
    if (state.tab === 'live') p.set('view', 'live');
    if (state.sort !== 'implied') p.set('sort', state.sort);
    if (state.selected) p.set('detail', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? window.location.pathname + '?' + s : window.location.pathname);
  }

  function renderTable() {
    var tbody = document.getElementById('rows');
    tbody.textContent = '';
    var list = sorted(filtered());
    document.getElementById('empty').hidden = list.length !== 0;
    document.getElementById('count').textContent = list.length + ' of ' + D.rows.length + ' rows shown';
    var max = D.rows.length ? D.rows[0].implied_value_usd : 1;
    list.forEach(function (r) {
      var tr = document.createElement('tr');
      if (state.selected === r.slug) tr.className = 'sel';
      tr.tabIndex = 0;
      function open() { state.selected = r.slug; syncUrl(); render(); }
      tr.addEventListener('click', open);
      tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      var c0 = el('td', 'num', String(r.rank)); tr.appendChild(c0);
      var c1 = document.createElement('td');
      var nm = el('div', 'name'); nm.appendChild(el('b', null, r.name));
      nm.appendChild(el('span', null, (r.category || 'Other') + ' · ' + chains(r)));
      c1.appendChild(nm); tr.appendChild(c1);
      tr.appendChild(el('td', 'num', usd(r.tvl_usd)));
      var g = el('td', 'num ' + (r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg'), pct(r.change_7d)); tr.appendChild(g);
      tr.appendChild(el('td', 'num', (r.likelihood * 100).toFixed(0) + '%'));
      var c5 = document.createElement('td');
      var bar = el('span', 'bar'); var i = document.createElement('i');
      i.style.width = Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%'; bar.appendChild(i);
      c5.appendChild(bar); c5.appendChild(el('span', 'num', usd(r.implied_value_usd))); tr.appendChild(c5);
      var c6 = document.createElement('td');
      var b = el('span', 'badge ' + (WL[r.slug] ? 'watch' : 'early'), WL[r.slug] ? 'WATCHLIST' : 'EARLY');
      c6.appendChild(b); tr.appendChild(c6);
      tbody.appendChild(tr);
    });
  }
  function renderLive() {
    var tbody = document.getElementById('liverows');
    tbody.textContent = '';
    D.live.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.appendChild(el('td', null, 'live'));
      var c1 = document.createElement('td');
      var nm = el('div', 'name'); nm.appendChild(el('b', null, r.name));
      nm.appendChild(el('span', null, (r.category || 'Other') + ' · ' + chains(r)));
      c1.appendChild(nm); tr.appendChild(c1);
      tr.appendChild(el('td', 'num', usd(r.tvl_usd)));
      tr.appendChild(el('td', 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), pct(r.change_7d)));
      tr.appendChild(el('td', 'num', usd(r.mcap_usd)));
      var c5 = document.createElement('td');
      c5.appendChild(el('span', 'badge live', 'ALREADY TRADES')); tr.appendChild(c5);
      tbody.appendChild(tr);
    });
  }
  function renderDetail() {
    var sec = document.getElementById('detail');
    var body = document.getElementById('detail-body');
    body.textContent = '';
    var row = null;
    D.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
    if (!row) { sec.hidden = true; return; }
    sec.hidden = false;
    document.getElementById('boardsec').hidden = true;
    document.getElementById('livesec').hidden = true;
    body.appendChild(el('span', 'badge ' + (WL[row.slug] ? 'watch' : 'early'), (WL[row.slug] ? 'WATCHLIST · ' : 'EARLY · ') + 'RANK ' + row.rank + ' OF ' + D.board_size));
    body.appendChild(el('h2', null, row.name));
    body.appendChild(el('p', 'sub', (row.category || 'Other') + ' on ' + chains(row) + ' · listed ' + (row.listed_at || 'date unknown') + ' · age ' + age(row.age_days) + ' with no token on record'));
    var kv = el('div', 'kv');
    [['TVL', usd(row.tvl_usd)], ['7-day change', pct(row.change_7d)], ['Token likelihood', (row.likelihood * 100).toFixed(1) + '%'], ['Implied value', usd(row.implied_value_usd)],
     ['Growth multiplier', String(row.growth_multiplier)], ['Maturity multiplier', String(row.maturity_multiplier)], ['Category prior', String(row.category_prior)], ['Chains', String(row.chains.length)]].forEach(function (pair) {
      var d = el('div'); d.appendChild(el('span', null, pair[0])); d.appendChild(el('b', null, pair[1])); kv.appendChild(d);
    });
    body.appendChild(kv);
    body.appendChild(el('p', 'sub', 'Model radar-2: implied = round(TVL × 0.25 × likelihood × growth multiplier × maturity multiplier). Likelihood blends log TVL, the category prior, clamped growth, the 300–700-day age hump and chain breadth. This is an estimate, not a price.'));
    body.appendChild(el('h3', null, 'Farm plan — 8 steps'));
    var ol = el('ol', 'steps');
    (row.farm_steps || []).forEach(function (s) {
      var li = document.createElement('li');
      var at = s.indexOf(' Cost: ');
      li.appendChild(el('b', null, at >= 0 ? s.slice(0, at) : s));
      if (at >= 0) li.appendChild(el('span', 'cost', s.slice(at + 1)));
      ol.appendChild(li);
    });
    body.appendChild(ol);
  }

  function render() {
    document.body.classList.toggle('detail-open', !!state.selected);
    document.getElementById('asof').textContent = 'Snapshot ' + D.as_of;
    document.getElementById('st-watch').textContent = D.watchlist_size + ' / ' + D.watchlist_size;
    document.getElementById('st-board').textContent = String(D.board_size);
    document.getElementById('st-early').textContent = String(D.early_size);
    document.getElementById('st-pre').textContent = String(D.pre_token_count || D.board_size);
    document.getElementById('st-live').textContent = String(D.live_size);
    var sel = document.getElementById('category');
    if (sel.options.length <= 1) {
      Array.from(new Set(D.rows.map(function (r) { return r.category || 'Other'; }))).sort().forEach(function (c) {
        var o = document.createElement('option'); o.value = c; o.textContent = c; sel.appendChild(o);
      });
      sel.value = state.category;
    }
    document.getElementById('q').value = state.q;
    document.getElementById('sort').value = state.sort;
    document.getElementById('watchonly').checked = state.watch;
    document.getElementById('tab-pre').setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
    document.getElementById('boardsec').hidden = state.tab !== 'pre-token' || !!state.selected;
    document.getElementById('livesec').hidden = state.tab !== 'live' || !!state.selected;
    if (state.selected) renderDetail(); else { document.getElementById('detail').hidden = true; }
    if (state.tab === 'pre-token') renderTable(); else renderLive();
  }

  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; syncUrl(); render(); });
  document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; syncUrl(); render(); });
  document.getElementById('sort').addEventListener('change', function (e) { state.sort = e.target.value; syncUrl(); render(); });
  document.getElementById('watchonly').addEventListener('change', function (e) { state.watch = e.target.checked; syncUrl(); render(); });
  document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; state.selected = null; syncUrl(); render(); });
  document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; state.selected = null; syncUrl(); render(); });
  document.getElementById('back').addEventListener('click', function () { state.selected = null; syncUrl(); render(); });
  Array.prototype.forEach.call(document.querySelectorAll('th button[data-sort]'), function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-sort');
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
      syncUrl(); render();
    });
  });
  render();
})();
