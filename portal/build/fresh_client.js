/* 13.11.2026, Т. В.: «Новые данные на портал внесены в течение суток — до конца суток подсвечены… пока я их не посмотрел, они светятся;
   глобальная папка подсвечивается, внутри — новые отчёты». Вид D (опрос): тёплая заливка без рамки. Список нового — assets/fresh.js (сборка):
   FRESH = {day, items: [{k, r: раздел, href, cat?, file?, t}]}. Просмотрено — на этом устройстве (localStorage), гаснет и в полночь (новый день).
   13.11.2026 23:30, Т. В. (телефон): «зашёл и посмотрел разделы — а они всё равно горят; в части гаснет, в части нет — должно быть единое».
   Причины: (1) один и тот же файл лежал в двух разделах под разными ключами (l-items-…, l-docs-…) — посмотрел в одном, горит в другом;
   (2) раздел гас только после открытия КАЖДОЙ строки внутри. Теперь единое правило для всего портала:
   • «просмотрено» хранится по самому файлу/странице, а не по разделу — погасло в одном месте, погасло везде;
   • открыл раздел (или список категории) — всё новое в нём считается увиденным: пока ты внутри, строки ещё подсвечены (видно, что нового),
     при уходе — гаснут, и раздел в меню гаснет тоже;
   • нажал на подсвеченную ссылку — гаснет сразу. */
(function () {
  var F = window.FRESH; if (!F || !F.items || !F.items.length) return;
  function msk() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); }
  if (F.day !== msk()) return;
  var KEY = 'fx_seen2_' + F.day, seen = {};
  try { seen = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { } }
  var page = (location.pathname.split('/').pop() || 'index.html');
  function norm(h) { h = String(h || ''); if (h.charAt(0) === '#') h = page + h; return decodeURIComponent(h.replace(/^\.\//, '')); }
  function id(x) { return x.file ? 'f:' + x.file : (x.href ? 'h:' + norm(x.href) : 'k:' + x.k); }
  var ITEMS = F.items.filter(function (x) { return x.k.indexOf('lc-') !== 0; });     // lc- — служебные «новое в разделе», свет не держат
  function live() { return ITEMS.filter(function (x) { return !seen[id(x)]; }); }
  var pend = {};
  // 14.11.2026 (ревью Рекса CG-10 п. 10): дата проверялась только при загрузке — вкладка, открытая через полночь, держала подсветку.
  //   Теперь: проверка при каждой перерисовке, таймер на полночь МСК и при возврате к вкладке; после полуночи подсветка снимается.
  var dead = false;
  function expired() {
    if (dead) return true;
    if (F.day === msk()) return false;
    dead = true;
    var A = document.querySelectorAll('.fx-new'); for (var i = 0; i < A.length; i++) A[i].classList.remove('fx-new');
    return true;
  }
  function commit() { var ch = false; for (var k in pend) if (!seen[k]) { seen[k] = 1; ch = true; } pend = {}; if (ch) save(); }
  function visit() {
    commit();
    var here = norm(page + (location.hash || '')), ch = false;
    var cat = page === 'library.html' ? (location.hash || '').slice(1) : '', sec = page === 'razdel.html' ? (location.hash || '').slice(1) : '';
    ITEMS.forEach(function (x) {
      var i = id(x); if (seen[i]) return;
      if (!x.file && x.href && norm(x.href) === here) { seen[i] = 1; ch = true; }                 // открыл саму страницу — погасла сразу
      else if ((cat && x.cat === cat) || (sec && x.r === sec)) pend[i] = 1;                       // открыл раздел/категорию — гаснет при уходе
    });
    if (ch) save();
  }
  window.addEventListener('pagehide', commit);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') commit(); else if (!expired()) soon(); });
  setTimeout(expired, 864e5 - ((Date.now() + 3 * 3600e3) % 864e5) + 1000);          // ближайшая полночь МСК
  var st = document.createElement('style');
  st.textContent = '.fx-new{background-image:linear-gradient(90deg,rgba(255,214,10,.26),rgba(255,214,10,.06))!important;border-radius:inherit}';
  document.head.appendChild(st);
  function mark() {
    if (expired()) return;
    var L = live(), R = {}, H = {}, C = {}, RC = {}, FI = {};
    L.forEach(function (x) { R[x.r] = 1; if (x.href) H[norm(x.href)] = 1; if (x.cat) { C[x.cat] = 1; RC[x.r + '|' + x.cat] = 1; } if (x.file) FI[x.file] = 1; });
    // что сейчас «в ожидании» (открытый раздел/категория) — в меню уже не горит, внутри ещё подсвечено
    var P = {}; L.forEach(function (x) { if (pend[id(x)] && x.r) P[x.r] = (P[x.r] || 0) + 1; });
    var sec = page === 'razdel.html' ? (location.hash || '').slice(1) : '';
    var A = document.querySelectorAll('a[href]');
    for (var i = 0; i < A.length; i++) {
      var a = A[i], h = norm(a.getAttribute('href')), on = false, m = /^razdel\.html#(\w+)$/.exec(h);
      var mc = /^library\.html#(\w+)$/.exec(h);
      if (m) on = !!R[m[1]] && m[1] !== sec;
      else if (H[h]) on = true;
      else if (mc && (sec ? RC[sec + '|' + mc[1]] : C[mc[1]])) on = true;
      else if (FI[a.getAttribute('href')]) on = true;
      else if (page === 'library.html' && a.dataset && a.dataset.t && C[a.dataset.t] && /^#/.test(a.getAttribute('href'))) on = true;
      a.classList.toggle('fx-new', on);
    }
  }
  document.addEventListener('click', function (ev) {
    var a = ev.target && ev.target.closest && ev.target.closest('a[href]'); if (!a || expired()) return;
    var h = norm(a.getAttribute('href')), raw = a.getAttribute('href'), ch = false;
    ITEMS.forEach(function (x) { var i = id(x); if (!seen[i] && ((x.file && x.file === raw) || (!x.file && x.href && norm(x.href) === h))) { seen[i] = 1; ch = true; } });
    if (ch) { save(); setTimeout(mark, 50); }
  }, true);
  visit();
  var t = null;
  function soon() { if (t) return; t = setTimeout(function () { t = null; mark(); }, 120); }
  window.addEventListener('hashchange', function () { visit(); soon(); });
  try { new MutationObserver(soon).observe(document.body, { childList: true, subtree: true }); } catch (e) { }
  soon();
  window.T14Fresh = { live: function () { return live().length; }, commit: commit };
})();
