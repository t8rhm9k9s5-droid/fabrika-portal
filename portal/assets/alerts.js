/* «Фабрика» — тревоги портала (13.11.2026, Т. В.: «35 % мощности этой недели попало в следующую — это прям very bad, emergency call для всего
   портала, должно загораться; от стилистики портала не отходим — как это сделал бы iPhone, iPad или macOS»).
   Данные — window.T14_ALERTS (assets/alerts_data.js ← build/gen_alerts.py; там же пороги). Как в iOS:
   • «Критично» — карточка-уведомление вверху КАЖДОЙ страницы (стекло с красным оттенком, значок «!», мягкое красное свечение),
     красная точка на значке раздела в меню, на главной («Разделы») и в карте разделов, красная рамка у карточки пульса этой темы;
   • «Внимание» — то же оранжевым, но карточка — только на главной и в своём разделе.
   «×» прячет карточку до завтра (только в этом браузере); рамка у карточки пульса — пока условие держится; точка у значка раздела гаснет,
   когда раздел открыт (до завтра или до новой цифры тревоги — 14.11.2026, см. paint). Строка тревоги стоит первой
   в «Требует внимания» на главной (home_frag.html). Экономный режим и «уменьшить движение» — без анимации. */
(function () {
  var D = window.T14_ALERTS || {}, L = (D.items || []).filter(function (a) { return a && a.t; });
  window.T14Alerts = { items: L, secOf: secOf };
  if (!L.length) return;
  var page = (location.pathname.split('/').pop() || 'index.html');
  var DOMOF = { 'sales.html': 'sales', 'staff.html': 'prod', 'omts.html': 'supply', 'stock.html': 'supply', 'stores.html': 'supply', 'products.html': 'items',
    'library.html': 'docs', 'docs.html': 'docs', 'archive.html': 'docs', 'calls.html': 'people', 'plan.html': 'site', 'index.html': 'site', 'utils.html': 'site', 'transport.html': 'log' };
  function secOf() { return page === 'razdel.html' ? decodeURIComponent(location.hash.slice(1)) : DOMOF[page] || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function day() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function hidden(id) { try { return (JSON.parse(localStorage.getItem('t14.alhide') || '{}') || {})[id] === day(); } catch (e) { return false; } }
  function hide(id) { try { var H = JSON.parse(localStorage.getItem('t14.alhide') || '{}') || {}; H[id] = day(); localStorage.setItem('t14.alhide', JSON.stringify(H)); } catch (e) { } }
  function when() {
    var b = D.built ? new Date(D.built + 'Z') : null; if (!b || isNaN(b)) return '';
    var t = new Date(), same = b.toDateString() === t.toDateString();
    return same ? 'сегодня' : ('0' + b.getDate()).slice(-2) + '.' + ('0' + (b.getMonth() + 1)).slice(-2);
  }
  var TRI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.27 3.98a2 2 0 0 1 3.46 0l8.02 13.9A2 2 0 0 1 20.02 20.9H3.98a2 2 0 0 1-1.73-3.02z" fill="currentColor"/>' +
    '<path d="M12 9.2v4.7" stroke="var(--al-c)" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="17.1" r="1.3" fill="var(--al-c)"/></svg>';
  var XBTN = '<button class="al-x" type="button" aria-label="Скрыть до завтра" title="Скрыть до завтра"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>';
  function forHere(a) {
    if (a.lvl === 'crit' || page === 'home.html') return true;
    return (a.secs || []).indexOf(secOf()) >= 0 || String(a.href || '').split('#')[0] === page;
  }
  // ---------- карточка-уведомление ----------
  function card(a) {
    var lv = a.lvl === 'crit' ? 'Критично' : 'Внимание';
    return '<div class="al-n al-' + a.lvl + '" data-id="' + esc(a.id) + '" role="' + (a.lvl === 'crit' ? 'alert' : 'status') + '">' +
      '<a class="al-card gl" href="' + esc(a.href) + '" title="' + esc(a.s + (a.rule ? ' · Порог: ' + a.rule : '')) + '">' +
      '<span class="al-ic">' + TRI + '</span>' +
      '<span class="al-b"><span class="al-h"><b>' + lv + '</b><span>' + esc(a.cat) + '</span><time>' + esc(when()) + '</time></span>' +
      '<span class="al-t">' + esc(a.t) + '</span><span class="al-s">' + esc(a.s) + '</span>' +
      (a.rule ? '<span class="al-r">Порог: ' + esc(a.rule) + '</span>' : '') + '</span>' +
      '<span class="al-v">' + esc(a.v) + '<i></i></span></a>' +
      XBTN + '</div>';
  }
  function host() {
    if (page === 'plan.html') return null;                                     // карта во весь экран — только точки в меню
    var sub = document.getElementById('fhSub');                               // главная: сразу под датой и погодой
    if (sub && sub.parentNode) return { p: sub.parentNode, before: sub.nextSibling };
    var m = document.querySelector('main.ios') || document.querySelector('main') || document.querySelector('.ios');
    if (m) return { p: m, before: m.firstChild };
    var top = document.querySelector('.ptop');
    return top ? { p: top.parentNode, before: top.nextSibling, loose: true } : null;
  }
  // главная (13.11.2026, Т. В.): тревоги — плитками справа от «Пульса фабрики», шириной в плитку раздела; план продаж уже в «Пульсе» — не дублируем
  function tiles(box) {
    // 13.11.2026 23:30, Т. В.: «на компьютере алерт закрывается крестиком, на телефоне — нет; должно быть одинаково» — «×» и у плиток на главной
    var V = L.filter(function (a) { return a.kpi !== 'plan' && !hidden(a.id); }), top = document.getElementById('fhTop');
    var k = V.map(function (a) { return a.id; }).join('|');
    if (box.getAttribute('data-k') === k && box.childElementCount === V.length) return;
    box.setAttribute('data-k', k);
    box.innerHTML = V.map(function (a) {
      return '<div class="al-tile gl al-' + a.lvl + '" data-id="' + esc(a.id) + '"><a class="at-a" href="' + esc(a.href) + '" title="' + esc(a.s + (a.rule ? ' · Порог: ' + a.rule : '')) + '">' +
        '<span class="at-h"><span class="al-ic">' + TRI + '</span><span class="at-c"><b>' + (a.lvl === 'crit' ? 'Критично' : 'Внимание') + '</b>' + esc(a.cat) + '</span></span>' +
        '<span class="at-v">' + esc(a.v) + '</span><span class="at-t">' + esc(a.short || a.t) + '</span></a>' + XBTN + '</div>';
    }).join('');
    [].forEach.call(box.querySelectorAll('.al-x'), function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); hide(b.closest('.al-tile').getAttribute('data-id')); tiles(box); });
    });
    if (top) { top.classList.remove('al-n0', 'al-n1', 'al-n2', 'al-n3'); top.classList.add('al-n' + Math.min(3, V.length)); }
  }
  function mount() {
    var fa = document.getElementById('fhAl');
    if (fa) { tiles(fa); var o0 = document.getElementById('t14al'); if (o0) o0.remove(); return; }
    var V = L.filter(function (a) { return forHere(a) && !hidden(a.id); });
    var old = document.getElementById('t14al');
    if (!V.length) { if (old) old.remove(); return; }
    if (old && old.isConnected && old.getAttribute('data-k') === V.map(function (a) { return a.id; }).join('|')) return;
    var H = host(); if (!H) return;
    var box = old || document.createElement('section');
    box.id = 't14al'; box.className = 't14al' + (H.loose ? ' loose' : ''); box.setAttribute('aria-label', 'Тревоги портала');
    box.setAttribute('data-k', V.map(function (a) { return a.id; }).join('|'));
    box.innerHTML = V.map(card).join('');
    if (!box.isConnected) H.p.insertBefore(box, H.before);
    [].forEach.call(box.querySelectorAll('.al-x'), function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault(); var n = b.closest('.al-n'); hide(n.getAttribute('data-id'));
        n.classList.add('al-out'); setTimeout(function () { n.remove(); if (!box.querySelector('.al-n')) box.remove(); }, 320);
      });
    });
  }
  // ---------- значки разделов (меню, «Разделы» на главной, карта разделов) и карточки пульса ----------
  // 14.11.2026, Т. В.: «красная точка у продаж не пропадает после просмотра раздела» — точка у значка раздела = «есть непросмотренная
  //   тревога», как значок на iPhone: открыл раздел (razdel.html#… или его страницу) — точка гаснет до конца дня; загорается снова, если
  //   тревога новая или изменилась её цифра (35 % → 40 %), и на следующий день, если условие держится. Карточка тревоги («×» — до завтра)
  //   и красная рамка у карточки пульса в самом разделе остаются, пока условие держится. Отметка — только в этом браузере (t14.alseen).
  function sk(a) { return a.id + '|' + (a.v == null ? '' : a.v); }
  function seenMap() { try { return JSON.parse(localStorage.getItem('t14.alseen') || '{}') || {}; } catch (e) { return {}; } }
  function markSeen() {
    var s = secOf(); if (!s || document.visibilityState === 'hidden') return;
    var S = seenMap(), d = day(), ch = false;
    L.forEach(function (a) { if ((a.secs || []).indexOf(s) >= 0 && S[sk(a)] !== d) { S[sk(a)] = d; ch = true; } });
    if (!ch) return;
    Object.keys(S).forEach(function (k) { if (S[k] !== d) delete S[k]; });   // вчерашние отметки не копим
    try { localStorage.setItem('t14.alseen', JSON.stringify(S)); } catch (e) { }
  }
  function paint() {
    var by = {}, all = {}, S = seenMap(), d = day();
    L.forEach(function (a) {
      (a.secs || []).forEach(function (s) { all[s] = 1; });
      if (S[sk(a)] === d) return;                                             // просмотрена сегодня — точки нет
      (a.secs || []).forEach(function (s) { var x = by[s] || (by[s] = { n: 0, lvl: 'warn', a: a }); x.n++; if (a.lvl === 'crit') { x.lvl = 'crit'; x.a = a; } });
    });
    Object.keys(all).forEach(function (s) {
      var x = by[s];
      [].forEach.call(document.querySelectorAll('a[href="razdel.html#' + s + '"], a[data-p="razdel.html#' + s + '"]'), function (el) {
        var on = el.classList.contains('al-on-crit') ? 'crit' : el.classList.contains('al-on-warn') ? 'warn' : '';
        if (x && on === x.lvl) return;
        if (on) { el.classList.remove('al-on-crit', 'al-on-warn'); [].forEach.call(el.querySelectorAll('.al-dot'), function (o) { o.remove(); }); }
        if (!x) return;
        el.classList.add('al-on-' + x.lvl);
        // 13.11.2026, Т. В.: «огромные счётчики-значки не нужны» — без кружков с цифрами; меню: тонкая цветная точка у названия, плитки — рамка, карта разделов — строка
        // 13.11.2026, Т. В.: «значок — не справа от текста, а у иконки, в углу» — маленькая точка в левом верхнем углу иконки раздела (меню и «Разделы»)
        // 13.11.2026 23:30, Т. В. (телефон): в листе «Разделы» текст тревоги сжимал «Продажи» в столбик — везде только точка у иконки, без текста
        var ic = el.querySelector('.pi, .fs-i, .itile, .rz-i');
        var d = document.createElement('i'); d.className = 'al-dot al-ic-dot al-' + x.lvl; d.title = x.a.t;
        if (ic) ic.appendChild(d); else { d.className = 'al-dot al-lead al-' + x.lvl; var bt = el.querySelector('b, .ititle, .pt') || el; bt.insertBefore(d, bt.firstChild); }
      });
    });
    L.forEach(function (a) {
      if (!a.card) return;
      var el = document.querySelector('.pz-k a[href="' + a.card + '"]');   // одна карточка на тревогу — первая по этой теме
      [el].forEach(function (el) {
        if (!el || el.querySelector('.al-pill')) return;
        el.classList.add('al-on-' + a.lvl);
        var p = document.createElement('span'); p.className = 'al-pill al-' + a.lvl; p.textContent = a.t;
        var bar = el.querySelector('.bar'); el.insertBefore(p, bar || null);
      });
    });
  }
  var busy = false;
  function run() { if (busy) return; busy = true; try { markSeen(); mount(); paint(); } catch (e) { } busy = false; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  window.addEventListener('hashchange', function () { setTimeout(run, 30); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') run(); });
  // страницы дорисовывают меню, «Разделы» и пульс позже (данные с хостинга) — досматриваем первые полминуты и при перерисовках
  var k = 0, iv = setInterval(function () { run(); if (++k > 30) clearInterval(iv); }, 1000);
  try { new MutationObserver(function () { clearTimeout(run.t); run.t = setTimeout(run, 120); }).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
})();
