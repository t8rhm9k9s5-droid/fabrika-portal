/* 21.11.2026 — загрузчик нового каталога /fsu/. index.html копии вызывает его первым и прячет остальную старую оболочку (plaintext);
   здесь — мета для iPhone (на весь экран, часы поверх), шрифты, стили, данные и приложение. */
(function () {
  var V = window.FSU_NEW_V || '', d = document, h = d.head || d.getElementsByTagName('head')[0];
  function el(t, a) { var e = d.createElement(t); for (var k in a) e.setAttribute(k, a[k]); h.appendChild(e); return e; }
  el('meta', { charset: 'utf-8' });
  el('meta', { name: 'viewport', content: 'width=device-width,initial-scale=1,viewport-fit=cover' });
  el('meta', { name: 'apple-mobile-web-app-capable', content: 'yes' });
  el('meta', { name: 'mobile-web-app-capable', content: 'yes' });
  el('meta', { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' });
  el('meta', { name: 'theme-color', content: '#F3F2EF', media: '(prefers-color-scheme: light)' });
  el('meta', { name: 'theme-color', content: '#171816', media: '(prefers-color-scheme: dark)' });
  var F = '/fsu/f/media/fonts/', st = d.createElement('style');
  st.textContent = '@font-face{font-family:ALSGorizont;src:url(' + F + 'als_gorizont/ALSGorizont2.1-MediumExpanded.woff2) format("woff2");font-display:swap}' +
    '@font-face{font-family:ALSDeparture;src:url(' + F + 'als_departure/ALSDeparture-Regular.woff2) format("woff2");font-display:swap}' +
    '@font-face{font-family:ALSDeparture;font-weight:700;src:url(' + F + 'als_departure/ALSDeparture-Bold.woff2) format("woff2");font-display:swap}' +
    'html,body{background:#F3F2EF}@media (prefers-color-scheme:dark){html,body{background:#171816}}';
  h.appendChild(st);
  el('link', { rel: 'stylesheet', href: '/fsu/n/app.css?v=' + V });
  d.title = 'Каталог — Фабрикант';
  window.FSU_DATA = fetch('/fsu/n/d/idx.json?v=' + V).then(function (r) { if (!r.ok) throw new Error('каталог ' + r.status); return r.json(); });
  window.FSU_LOGO = fetch('/fsu/n/logo.svg?v=' + V).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; });
  function start() {
    var pt = d.querySelector('plaintext'); if (pt) pt.remove();
    var b = d.body || d.documentElement.appendChild(d.createElement('body'));
    b.innerHTML = '<div id="app"><div class="loading">Загружаю каталог…</div></div>';
    var s = d.createElement('script'); s.src = '/fsu/n/app.js?v=' + V; b.appendChild(s);
    // кнопки портала (назад, ИИ) — та же вставка, что у копии; скрипты внутри — пересоздать, иначе не выполнятся
    fetch('/fsu/n/back.html?v=' + V).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      if (!t) return; var w = d.createElement('div'); w.innerHTML = t;
      Array.prototype.slice.call(w.childNodes).forEach(function (n) {
        if (n.nodeName === 'SCRIPT') { var x = d.createElement('script'); x.textContent = n.textContent; b.appendChild(x); }
        else b.appendChild(n);
      });
    }).catch(function () { });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();
