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
      var W = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'], now = new Date(Date.now() + 3 * 3600e3), d0 = (now.getUTCDay() + 6) % 7, h = '';
      for (var i = 0; i < 7; i++) {
        var d = new Date(now.getTime() + (i - d0) * 864e5);
        h += '<span class="' + (i === d0 ? 'today' : '') + (i > 4 ? ' off' : '') + '">' + W[i] + '<b>' + d.getUTCDate() + '</b></span>';
      }
      var w = document.createElement('div'); w.className = 'v22-week'; w.setAttribute('aria-hidden', 'true'); w.innerHTML = h;
      sub.parentNode.insertBefore(w, sub.nextSibling);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', v22); else v22();
  setTimeout(v22, 1200);
  window.T14Motion = { scan: scan, v22: v22 };
})();
