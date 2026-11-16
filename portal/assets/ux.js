/* «Фабрика» — события интерфейса для тепловых карт и поиска мест, где человек запутался (13.11.2026, Т. В.: «все баги фиксируем, даже
   движение мышкой; копим ошибки, видим, где человек запутался, смотрим тепловые карты; в 9 вечера собираем»).
   Что уходит (st/ux.php, пачкой раз в 20 с и при уходе со страницы, navigator.sendBeacon): страница; где щёлкнули (в % ширины и высоты
   страницы) и по чему (тег, класс, адрес ссылки — без текста); «ярость» — 3+ щелчка в одно место за секунду; «мёртвый» щелчок — не по
   ссылке или кнопке, и за 0,7 с на странице ничего не изменилось; движение мыши — счётчики клеток сетки (2,5 % × 1 %), не траектория;
   «Назад»; хождение по кругу (A → B → A → B); быстрый уход (< 3 с); ошибки JS; время загрузки. Устройство — случайная метка (localStorage
   t14.uxd), вход — первые 8 знаков id. Никаких введённых текстов, содержимого страниц, адресов почты и телефонов. */
(function () {
  'use strict';
  if (!navigator.sendBeacon || /^file:/.test(location.protocol) || window.T14UX) return;
  // 16.11.2026 (вечерний разбор 15.11, ответ Т. В. «да»): автотесты (Playwright/Selenium — navigator.webdriver, HeadlessChrome) не пишем — они давали
  //   сотни «яростных» щелчков по summary, #pdlgX и ссылкам прайса и забивали карту.
  if (navigator.webdriver || /HeadlessChrome|Playwright/.test(navigator.userAgent || '')) return;
  var URL_ = 'st/ux.php', EV = [], MV = new Map(), nEv = 0, nMv = 0;
  function rnd(n) { var s = '', a = 'abcdefghijkmnpqrstuvwxyz23456789'; for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length)); return s; }
  var dev = ''; try { dev = localStorage.getItem('t14.uxd') || ''; if (!/^[a-z0-9]{12}$/.test(dev)) { dev = rnd(12); localStorage.setItem('t14.uxd', dev); } } catch (e) { dev = rnd(12); }
  function usr() { try { var me = JSON.parse(localStorage.getItem('t14.me') || 'null'); return me && me.id ? String(me.id).slice(0, 8) : ''; } catch (e) { return ''; } }
  function pg() { return (location.pathname.split('/').pop() || 'home.html') + (location.hash.length > 1 ? location.hash.split('?')[0].slice(0, 40) : ''); }
  function mvObj() { var ps = []; MV.forEach(function (m, p) { var qs = []; m.forEach(function (v, c) { qs.push(JSON.stringify(c) + ':' + v); }); ps.push(JSON.stringify(p) + ':{' + qs.join(',') + '}'); }); return JSON.parse('{' + ps.join(',') + '}'); }   // формат прежний: {страница: {клетка: число}}, без записи свойств по ключу из адреса
  function now() { return Math.round(Date.now() / 1000); }
  function push(e) { if (nEv > 3000) return; EV.push(e); nEv++; if (EV.length >= 150) flush(); }
  function docW() { return Math.max(document.documentElement.scrollWidth, window.innerWidth || 1); }
  function docH() { return Math.max(document.documentElement.scrollHeight, window.innerHeight || 1); }
  // ---------- просмотры, хождение по кругу, быстрый уход ----------
  var HK = 't14.uxh', cur = '', shown = 0;
  function hist() { try { return JSON.parse(sessionStorage.getItem(HK) || '[]'); } catch (e) { return []; } }
  function leave() { if (cur && shown && Date.now() - shown < 3000) push(['q', now(), cur, Date.now() - shown]); }
  function view() {
    var p = pg(); if (p === cur) return;
    leave();
    var H = hist(), prev = H[H.length - 1] || '';
    if (H.length >= 3 && H[H.length - 2] === p && H[H.length - 3] === prev) push(['l', now(), p, H.slice(-3).join('>') + '>' + p]);
    H.push(p); if (H.length > 12) H = H.slice(-12); try { sessionStorage.setItem(HK, JSON.stringify(H)); } catch (e) { }
    push(['v', now(), p, prev]); cur = p; shown = Date.now();
  }
  // ---------- щелчки: где, по чему, «ярость», «мёртвые» ----------
  var IA = 'a,button,input,select,textarea,summary,label,[role=button],[onclick],[data-popen],[tabindex]';
  function desc(el) {
    if (!el || !el.tagName) return '?';
    var t = el.tagName.toLowerCase(), c = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    var h = el.getAttribute && el.getAttribute('href');
    return t + (el.id ? '#' + el.id : '') + (c ? '.' + c : '') + (h ? '[' + h.slice(0, 60) + ']' : '');
  }
  var last = [], muts = 0;
  try { new MutationObserver(function (m) { muts += m.length; }).observe(document.documentElement, { childList: true, subtree: true, attributes: true }); } catch (e) { }
  document.addEventListener('click', function (e) {
    try {
      var x = Math.round(e.pageX / docW() * 1000) / 10, y = Math.round(e.pageY / docH() * 1000) / 10, tgt = e.target;
      var ia = tgt && tgt.closest ? tgt.closest(IA) : null, el = ia || (tgt && tgt.closest ? tgt.closest('.gl,.pk,.fs,.irow,.igroup,section,li') : null) || tgt;
      var t = Date.now(); last = last.filter(function (c) { return t - c[0] < 1000; });
      var rage = last.filter(function (c) { return Math.abs(c[1] - e.clientX) < 30 && Math.abs(c[2] - e.clientY) < 30; }).length >= 2;
      last.push([t, e.clientX, e.clientY]);
      var p = pg(), d = desc(el), fl = rage ? 'r' : '';
      if (el && el.closest && el.closest('.pback, a.back, button.back')) push(['b', now(), p, (el.getAttribute('href') || 'pback').slice(0, 60)]);
      if (ia) { push(['c', now(), p, x, y, d, fl]); return; }
      var m0 = muts, u0 = location.href;
      setTimeout(function () { push(['c', now(), p, x, y, d, fl + (muts === m0 && location.href === u0 ? 'd' : '')]); }, 700);
    } catch (e2) { }
  }, true);
  // ---------- движение мыши: счётчики клеток (не траектория) ----------
  var mvT = 0;
  document.addEventListener('mousemove', function (e) {
    var t = Date.now(); if (t - mvT < 200 || nMv > 6000) return; mvT = t;
    var p = pg(), c = Math.min(39, Math.floor(e.pageX / docW() * 40)) + '_' + Math.min(99, Math.floor(e.pageY / docH() * 100));
    // 14.11.2026 CodeQL js/remote-property-injection: ключ — из адреса страницы, поэтому Map, а не объект
    var mp = MV.get(p); if (!mp) { mp = new Map(); MV.set(p, mp); }
    mp.set(c, (mp.get(c) || 0) + 1); nMv++;
  }, { passive: true });
  // ---------- ошибки и время загрузки ----------
  window.addEventListener('error', function (e) {
    // 16.11.2026: «Script error.» без файла — чужой скрипт (расширение, встроенный браузер MAX/Telegram); наших файлов не касается, не пишем.
    if (/^Script error\.?$/.test(String(e.message || '')) && !e.filename) return;
    try { push(['e', now(), pg(), String(e.message || 'ошибка').slice(0, 160), String(e.filename || '').split('/').pop().slice(0, 40) + ':' + (e.lineno || 0)]); } catch (e2) { }
  });
  window.addEventListener('unhandledrejection', function (e) { try { push(['e', now(), pg(), ('promise: ' + String((e.reason && e.reason.message) || e.reason || '')).slice(0, 160), '']); } catch (e2) { } });
  window.addEventListener('load', function () {
    setTimeout(function () { try { var n = performance.getEntriesByType('navigation')[0]; push(['n', now(), pg(), Math.round(n ? n.loadEventEnd || n.duration : performance.now())]); } catch (e) { } }, 0);
  });
  // ---------- отправка ----------
  function flush() {
    if (!EV.length && !nMv) return;
    var body = { d: dev, u: usr(), w: window.innerWidth || 0, h: window.innerHeight || 0, p: document.documentElement.getAttribute('data-plat') || '', ev: EV, m: mvObj() };
    var s = JSON.stringify(body);
    if (s.length > 45000) { body.m = Object.create(null); s = JSON.stringify(body); if (s.length > 45000) { body.ev = EV.slice(-150); s = JSON.stringify(body); } }
    try { navigator.sendBeacon(URL_, new Blob([s], { type: 'text/plain' })); } catch (e) { }
    EV = []; MV = new Map(); nMv = 0;
  }
  window.addEventListener('hashchange', view);
  window.addEventListener('pagehide', function () { leave(); cur = ''; flush(); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  setInterval(flush, 20000);
  view();
  window.T14UX = { flush: flush };
})();
