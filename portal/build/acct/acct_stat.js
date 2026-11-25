/* 26.11.2026, Т. В.: «счётчик ставь», «ошибки на телефонах — устанавливай». Свой счётчик посещений и журнал ошибок устройства:
   страница с устройства — не чаще раза в 30 минут; ошибок — не больше трёх за открытие страницы. Данные — в служебной таблице под 1c@ (сводка — «Управление»). */
(function (G) {
  'use strict';
  var A = G.T14Acct; if (!A || !A.api || !A.inApp || !A.inApp()) return;
  function page() { return (location.pathname.split('/').pop() || 'home.html').replace(/\.html$/, '').replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 40) || 'home'; }
  function dev() { var u = navigator.userAgent; return /iPhone|iPad|iPod/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : 'компьютер'; }
  function send(op, o) { try { o.tok = A.tok() || ''; o.page = page(); o.dev = dev(); o.ver = String((G.T14_VERSION || {}).v || ''); A.api(op, o).catch(function () { /* нет связи — не страшно */ }); } catch (e) { /* счётчик не мешает странице */ } }
  try {
    var k = 't14.vs.' + page(), t = +localStorage.getItem(k) || 0;
    if (Date.now() - t > 18e5) { localStorage.setItem(k, String(Date.now())); setTimeout(function () { send('vshit', {}); }, 2500); }
  } catch (e) { /* без памяти браузера — без счётчика */ }
  var n = 0, seen = {};
  function err(msg, src, line) {
    msg = String(msg || '').slice(0, 300);
    if (!msg || seen[msg] || n >= 3 || /^Script error\.?$/.test(msg) || /ResizeObserver loop/.test(msg)) return;
    seen[msg] = 1; n++; send('vserr', { msg: msg, src: String(src || '').split('/').pop().split('?')[0].slice(0, 80), line: +line || 0 });
  }
  G.addEventListener('error', function (e) { if (e && e.message) err(e.message, e.filename, e.lineno); });
  G.addEventListener('unhandledrejection', function (e) { var r = e && e.reason; err('Promise: ' + String((r && r.message) || r), '', 0); });
})(window);
