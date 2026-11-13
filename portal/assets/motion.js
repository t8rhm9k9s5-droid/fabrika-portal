/* «Фабрика» — движение по образцу «Dashboard V22» (13.11.2026, Т. В. выбрал опросом: «цифры набегают», «узкая панель с иконками»,
   «столбики-капсулы»; без бликов и без постоянной анимации — «курите блики»). Только при открытии страницы, один раз:
   • числа в карточках (пульс главной и разделов, «Пульс фабрики») считаются от 0 до значения за 0,6 с;
   • полоски и столбики вырастают (класс html.t14-intro на 2,5 с — CSS в glass.css);
   • узкая панель (ноутбуки 701–1279 px): подсказка с названием раздела при наведении на иконку.
   «Экономный режим» (data-fx=lite) и «уменьшить движение» — без анимации, сразу итоговые значения. */
(function () {
  'use strict';
  if (window.T14Motion) return;
  var root = document.documentElement;
  var calm = root.getAttribute('data-fx') === 'lite' || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var T0 = Date.now(), WINDOW = 2500;
  if (!calm) { root.classList.add('t14-intro'); setTimeout(function () { root.classList.remove('t14-intro'); }, WINDOW); }
  // ---------- числа ----------
  var SEL = '.pz-k .v, .fhome .pk-v, .fhome .fb-v, .fhome .at-v';
  var NUM = /^(\s*[−-]?)(\d{1,3}(?:[\s  ]\d{3})*|\d+)(?:([.,])(\d+))?/;
  function fmt(v, dec, sep, grp) {
    var s = Math.abs(v).toFixed(dec), p = s.split('.'), i = p[0];
    if (grp) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, grp);
    return i + (dec ? sep + p[1] : '');
  }
  function count(el) {
    if (el.__cu) return; el.__cu = 1;
    var tn = el.firstChild; while (tn && tn.nodeType !== 3) tn = tn.nextSibling;
    if (!tn) return;
    var m = NUM.exec(tn.nodeValue); if (!m) return;
    var lead = m[1], digits = m[2], dec = m[4] ? m[4].length : 0, sep = m[3] || ',';
    var grpM = /[\s  ]/.exec(digits), grp = grpM ? grpM[0] : (digits.length > 4 ? ' ' : '');
    var target = parseFloat(digits.replace(/[\s  ]/g, '') + (dec ? '.' + m[4] : ''));
    if (!isFinite(target) || target === 0) return;
    var tail = tn.nodeValue.slice(m[0].length), full = tn.nodeValue, t0 = performance.now(), D = 600, last = null;
    function frame(now) {
      if (last !== null && tn.nodeValue !== last) return;                       // страница сама переписала число — не мешаем
      var k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      last = k < 1 ? lead + fmt(target * e, dec, sep, grp) + tail : full;
      tn.nodeValue = last;
      if (k < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
  function scan() {
    if (calm || Date.now() - T0 > WINDOW) return;
    [].forEach.call(document.querySelectorAll(SEL), function (el) {
      var r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > (innerHeight || 800)) { el.__cu = 1; return; }
      count(el);
    });
  }
  var mo = null, tm = null;
  function soon() { clearTimeout(tm); tm = setTimeout(scan, 30); }
  function start() {
    scan();
    try { mo = new MutationObserver(soon); mo.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) { }
    setTimeout(function () { if (mo) mo.disconnect(); }, WINDOW + 200);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  window.addEventListener('hashchange', function () {                        // раздел сменился без перезагрузки — короткое вступление ещё раз
    if (calm) return; T0 = Date.now(); root.classList.add('t14-intro'); setTimeout(function () { root.classList.remove('t14-intro'); }, WINDOW); start();
  });
  // ---------- подсказки узкой панели ----------
  var tip = null;
  function rail() { return window.matchMedia && matchMedia('(min-width:701px) and (max-width:1279px)').matches; }
  document.addEventListener('mouseover', function (e) {
    var a = e.target && e.target.closest && e.target.closest('.pside .pnav'); if (!a || !rail()) { if (tip) tip.style.opacity = '0'; return; }
    var t = (a.querySelector('.pt') || a).textContent.trim(); if (!t) return;
    if (!tip) { tip = document.createElement('div'); tip.className = 't14-tip'; document.body.appendChild(tip); }
    var r = a.getBoundingClientRect(); tip.textContent = t; tip.style.top = Math.round(r.top + r.height / 2) + 'px'; tip.style.left = Math.round(r.right + 10) + 'px'; tip.style.opacity = '1';
  });
  document.addEventListener('scroll', function () { if (tip) tip.style.opacity = '0'; }, true);
  // ---------- оформление «V22» (14.11.2026, Т. В.: «визуал по видео — я посмотрю»): неделя-календарь и акцент в «Пульсе» ----------
  function v22() {
    if (root.getAttribute('data-skin') !== 'v22') return;
    var p = document.querySelector('.fhome .fh-ban .fb-h p');
    if (p && !p.querySelector('em')) p.innerHTML = p.innerHTML.replace('один организм', 'один <em>организм</em>');
    var sub = document.getElementById('fhSub');
    if (sub && !document.querySelector('.v22-week')) {
      var w = document.createElement('div'); w.className = 'v22-week'; w.setAttribute('role', 'group'); w.setAttribute('aria-label', 'Неделя — нажмите на день');
      sub.parentNode.insertBefore(w, sub.nextSibling); week(w, 0);
      // 14.11.2026: смахнуть влево/вправо — соседняя неделя
      var x0 = null;
      w.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      w.addEventListener('touchend', function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) week(w, (+w.getAttribute('data-off') || 0) + (dx > 0 ? -1 : 1)); }, { passive: true });
    }
  }
  // ---------- неделя и «День» (14.11.2026, Т. В.: «дата сверху не переключает — что было вчера?!») ----------
  var WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'], MN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  var WF = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  function mskToday() { return new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); }
  function shift(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function week(w, off) {
    var td = mskToday(), d = new Date(td + 'T12:00:00Z'), d0 = (d.getUTCDay() + 6) % 7, mon = shift(td, -d0 + off * 7), h = '', sel = w.getAttribute('data-sel') || '';
    for (var i = 0; i < 7; i++) {
      var iso = shift(mon, i), cl = (iso === td ? 'today' : '') + (i > 4 ? ' off' : '') + (iso === sel && iso !== td ? ' sel' : '') + (iso > td ? ' fut' : '');
      h += '<button type="button" class="' + cl + '" data-d="' + iso + '" aria-label="' + iso.split('-').reverse().join('.') + '">' + WD[i] + '<b>' + (+iso.slice(8)) + '</b></button>';
    }
    w.innerHTML = h; w.setAttribute('data-off', off);
    if (off) { var m1 = new Date(mon + 'T12:00:00Z'); w.setAttribute('data-wk', (off < 0 ? '‹ ' : '') + m1.getUTCDate() + ' ' + MN[m1.getUTCMonth()].slice(0, 3) + (off > 0 ? ' ›' : '')); } else w.removeAttribute('data-wk');
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('.v22-week button[data-d]'); if (!b) return;
    var w = b.parentNode; w.setAttribute('data-sel', b.getAttribute('data-d'));
    [].forEach.call(w.children, function (x) { x.classList.toggle('sel', x === b && !x.classList.contains('today')); });
    dayOpen(b.getAttribute('data-d'));
  });
  function liveBin(nm) {
    return new Promise(function (ok) {
      if (!window.T14Live || !T14Live.bin) return ok(null);
      var t = setTimeout(function () { ok(null); }, 5000);
      try { T14Live.bin(nm).then(function (d) { clearTimeout(t); ok(d || null); }, function () { clearTimeout(t); ok(null); }); } catch (e) { clearTimeout(t); ok(null); }
    });
  }
  function mln(v) { return (v / 1e6).toFixed(v >= 1e7 ? 1 : 2).replace('.', ',') + ' млн ₽'; }
  function num(v) { return Math.round(v).toLocaleString('ru-RU'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var DS = null;
  function dayOpen(iso) {
    var UI = window.T14UI; if (!UI || !UI.sheet) return;
    if (DS && DS.close) try { DS.close(); } catch (e) { }
    var td = mskToday(), dt = new Date(iso + 'T12:00:00Z');
    var t = (iso === td ? 'Сегодня, ' : iso === shift(td, -1) ? 'Вчера, ' : iso === shift(td, 1) ? 'Завтра, ' : '') + dt.getUTCDate() + ' ' + MN[dt.getUTCMonth()];
    var s = DS = UI.sheet(t.charAt(0).toUpperCase() + t.slice(1), WF[dt.getUTCDay()]);
    var nav = document.createElement('div'); nav.className = 'v22-dnav';
    nav.innerHTML = '<button type="button" data-n="-1">‹ ' + (+shift(iso, -1).slice(8)) + ' ' + MN[new Date(shift(iso, -1) + 'T12:00:00Z').getUTCMonth()].slice(0, 3) + '</button><button type="button" data-n="1">' + (+shift(iso, 1).slice(8)) + ' ' + MN[new Date(shift(iso, 1) + 'T12:00:00Z').getUTCMonth()].slice(0, 3) + ' ›</button>';
    nav.addEventListener('click', function (e) { var b = e.target.closest('button[data-n]'); if (b) dayOpen(shift(iso, +b.getAttribute('data-n'))); });
    var box = document.createElement('div'); box.className = 'v22-day'; box.innerHTML = '<p class="ifoot">Загружаю данные дня…</p>';
    s.body.appendChild(nav); s.body.appendChild(box);
    var X = (window.T14_DAYS || {})[iso] || {};
    Promise.all([liveBin('sales.bin'), liveBin('pf.bin')]).then(function (r) {
      var S = r[0], P = r[1], rows = [];
      var sd = S && S.sday && S.sday.days && S.sday.days[iso];
      if (sd && sd.types && sd.types.tot && sd.types.tot[1] > 0) rows.push(['Продажи 1С', mln(sd.types.tot[1]), num(sd.types.tot[0]) + ' шт за день', 'sales.html#s-s1c']);
      var ops = S && S.ops ? S.ops.filter(function (o) { return o.k !== 'net'; }) : null;
      if (ops && ops.length && iso <= td) rows.push(['Вечерние отчёты офисов', ops.filter(function (o) { return o.rep && o.rep[iso]; }).length + ' из ' + ops.length, 'сдали отчёт за день', 'sales.html#s-prom']);
      var gl = P && P.galv, gd = gl && gl.d ? gl.d.filter(function (x) { return String(x[0]) === iso || String(x[0]) === String(+iso.slice(8)); })[0] : null;
      if (gd && gd[1] > 0) rows.push(['Гальваника', num(gd[1]) + ' траверс', 'норма ' + (gl.norm || 165) + ' в сутки', 'staff.html#s-galv']);
      if (X.ship) rows.push(['Отгрузка по графику', mln(X.ship[1]), num(X.ship[0]) + ' шт · клиентов: ' + X.ship[2], 'sales.html#ship']);
      (X.meet || []).forEach(function (m) { rows.push([m[0], '', 'совещание · задач ' + m[1] + (m[2] ? ' · открыто ' + m[2] : ' · все закрыты'), 'poruch.html']); });
      if (X.itogi) rows.push(['Итоги дня', 'PDF', 'что сделано, выводы, решения', X.itogi, 1]);
      var h = rows.length ? '<div class="igroup">' + rows.map(function (r) {
        return '<a class="irow" href="' + esc(r[3]) + '"' + (r[4] ? ' target="_blank" rel="noopener"' : '') + '><span class="ic"><span class="ibody"><span class="ititle">' + esc(r[0]) + '</span><span class="isub">' + esc(r[2]) + '</span></span>' + (r[1] ? '<span class="v22-dv">' + esc(r[1]) + '</span>' : '') + '<span class="ichev"></span></span></a>';
      }).join('') + '</div>' : '';
      var docs = X.docs || [];
      if (docs.length) h += '<p class="ihdr">Документы за день · ' + docs.length + '</p><div class="igroup">' + docs.slice(0, 8).map(function (d) {
        return '<a class="irow" href="' + esc(d[1]) + '" target="_blank" rel="noopener"><span class="ic"><span class="ibody"><span class="ititle">' + esc(d[0]) + '</span></span><span class="ichev"></span></span></a>';
      }).join('') + (docs.length > 8 ? '<a class="irow" href="library.html"><span class="ic"><span class="ibody"><span class="ititle">Ещё ' + (docs.length - 8) + ' — в «Документах»</span></span><span class="ichev"></span></span></a>' : '') + '</div>';
      if (!h) h = '<p class="ifoot">' + (iso > td ? 'День ещё не наступил — плана на этот день на портале нет.' : 'За этот день данных на портале нет (выходной или отчёты не приходили).') + '</p>';
      box.innerHTML = h;
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', v22); else v22();
  setTimeout(v22, 1200);
  // ---------- «плюсы iOS» в установленном приложении (14.11.2026, Т. В.: «нет всех плюсов iOS») ----------
  // В Safari эти жесты есть сами; в приложении с экрана «Домой» — нет: смахнуть от левого края → назад; потянуть вниз в самом верху → обновить.
  (function () {
    var standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    if (!standalone || !('ontouchstart' in window)) return;
    var page = (location.pathname.split('/').pop() || 'index.html');
    if (/^(index|plan)\.html$/.test(page)) return;                                   // модель и карта — свои жесты
    function on() { return root.getAttribute('data-skin') === 'v22'; }
    function blocked(t) { return t && t.closest && t.closest('.tabpanel:not([hidden]),.isheet,.viewer,.vw,.lightbox,.leaflet-container,canvas,input,textarea,select,[contenteditable],.v22-week'); }
    var edge = null, ptr = null, sx = 0, sy = 0, mode = '', dx = 0, dy = 0;
    function mk(cls) { var d = document.createElement('div'); d.className = cls; document.body.appendChild(d); return d; }
    document.addEventListener('touchstart', function (e) {
      mode = ''; if (!on() || e.touches.length !== 1 || blocked(e.target)) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = dy = 0;
      if (sx < 22) mode = 'edge'; else if ((window.scrollY || document.documentElement.scrollTop) <= 0) mode = 'ptr';
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!mode) return; dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
      if (mode === 'edge') {
        if (Math.abs(dy) > 60) { mode = ''; if (edge) edge.style.opacity = '0'; return; }
        edge = edge || mk('v22-edge'); var k = Math.max(0, Math.min(1, dx / 90)); edge.style.opacity = String(k); edge.style.transform = 'translateX(' + Math.min(60, dx / 2) + 'px)';
      } else if (mode === 'ptr') {
        if (dy < 0 || Math.abs(dx) > 40) { mode = ''; if (ptr) ptr.style.opacity = '0'; return; }
        ptr = ptr || mk('v22-ptr'); var q = Math.max(0, Math.min(1, dy / 110)); ptr.style.opacity = String(q); ptr.style.transform = 'translateY(' + Math.min(70, dy / 2) + 'px) rotate(' + Math.round(dy * 2) + 'deg)';
      }
    }, { passive: true });
    document.addEventListener('touchend', function () {
      if (mode === 'edge') { if (edge) edge.style.opacity = '0'; if (dx > 90) { if (history.length > 1) history.back(); else location.href = 'home.html'; } }
      else if (mode === 'ptr') { if (dy > 110 && ptr) { ptr.classList.add('go'); ptr.style.opacity = '1'; setTimeout(function () { location.reload(); }, 150); } else if (ptr) ptr.style.opacity = '0'; }
      mode = '';
    }, { passive: true });
  })();
  window.T14Motion = { scan: scan, v22: v22, day: dayOpen };
})();
