#!/usr/bin/env node
/* «Фабрика» — какие карточки портала пустые (14.11.2026, Т. В.: «какие карточки на портале сейчас пустые и почему нет этих данных —
   все карточки появились на основе данных, проверь»). Открывает каждую страницу сборки site/*.html (и 11 разделов razdel.html#…)
   в браузере с живыми файлами хостинга (расшифрованы заранее в каталог, как в test_pulse_browser.js; ключи в браузер не попадают)
   и собирает видимые заглушки: значение «—», «нет данных», «пока нет», «ждём», «готовится», «Данных для диаграммы пока нет».
   Запуск: NODE_PATH=$(npm root -g) node fabrika/tools/ci/empty_cards.js <каталог *.json> > out.json */
'use strict';
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..', '..'), SITE = path.join(ROOT, 'site'), DATA = process.argv[2], BASE = 'http://t14.local/';
const MIME = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', json: 'application/json', woff2: 'font/woff2' };
const SECS = ['sales', 'prod', 'quality', 'supply', 'log', 'online', 'fin', 'items', 'people', 'docs', 'site'];
const SKIP = new Set(['_mock_sales.html', 'index.html', 'chat.html', 'admin.html']);
(async () => {
  const br = await chromium.launch(), out = [];
  const ctx = await br.newContext({ viewport: { width: 1400, height: 1000 } });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.host !== 't14.local') return r.abort();
    // 14.11.2026 (CodeQL js/file-system-race): файл читается один раз, без проверки existsSync перед чтением
    const read = f => { try { return fs.readFileSync(f); } catch (e) { return null; } };
    if (u.pathname.startsWith('/__live/')) { const b = read(path.join(DATA, path.basename(u.pathname))); return b && b.toString('utf8').trim() !== 'null' ? r.fulfill({ body: b, contentType: 'application/json' }) : r.fulfill({ status: 404, body: '' }); }
    if (u.pathname.startsWith('/st/')) return r.fulfill({ status: 404, body: '' });
    const f = path.join(SITE, decodeURIComponent(u.pathname));
    const b = f.startsWith(SITE) ? read(f) : null;   // каталог или нет файла → null
    if (!b) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ body: b, contentType: MIME[f.split('.').pop()] || 'application/octet-stream' });
  });
  await ctx.addInitScript(() => {
    let real;
    Object.defineProperty(window, 'T14Live', { configurable: true, get() { return real; }, set(v) {
      const C = {};
      const get = n => C[n] || (C[n] = fetch('/__live/' + n.replace(/\.bin$/, '.json')).then(r => r.ok ? r.json() : null).catch(() => null).then(d => {
        if (d) try { window.dispatchEvent(new CustomEvent('t14bin', { detail: { name: n, data: d } })); if (n === 'ls.bin') window.dispatchEvent(new CustomEvent('t14live', { detail: d })); } catch (e) { }
        return d; }));
      v.bin = get; v.load = () => get('ls.bin'); v.prefetch = () => { }; v.refresh = () => { }; real = v; } });
  });
  const pages = fs.readdirSync(SITE).filter(f => f.endsWith('.html') && !SKIP.has(f) && f !== 'razdel.html').map(f => f).concat(SECS.map(s => 'razdel.html#' + s));
  const pg = await ctx.newPage(), req = new Set();
  pg.on('request', q => { const u = new URL(q.url()); if (u.pathname.startsWith('/__live/')) req.add(path.basename(u.pathname).replace('.json', '.bin')); });
  for (const p of pages) {
    req.clear();
    try { await pg.goto(BASE + p, { waitUntil: 'load', timeout: 60000 }); } catch (e) { out.push({ page: p, err: String(e).slice(0, 120) }); continue; }
    await pg.waitForTimeout(3500);
    const found = await pg.evaluate(() => {
      const RX = /^(—|–|-)$|нет данных|пока нет|ждём|готовится|данных для диаграммы|нужен доступ|не пришли|нет файла|появится, когда/i;
      const vis = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
      const res = [], seen = new Set();
      for (const e of document.querySelectorAll('body *')) {
        if (e.children.length || !vis(e)) continue;
        const t = (e.textContent || '').trim(); if (!t || t.length > 140 || !RX.test(t)) continue;
        if (e.closest('nav, .pside, .tabbar, header, footer, .ifoot')) continue;
        const card = e.closest('.gl, .card, .tile, .irow, article, li, tr, section, .kpi, .stat') || e.parentElement;
        const ttl = card ? ((card.querySelector('.t, h3, h4, .ititle, th, .lbl, .title') || {}).textContent || '').trim().slice(0, 80) : '';
        const sub = card ? ((card.querySelector('.s, .isub, .sub, small') || {}).textContent || '').trim().slice(0, 140) : '';
        const k = ttl + '|' + t; if (seen.has(k)) continue; seen.add(k);
        res.push({ card: ttl, text: t, sub });
      }
      return res;
    });
    out.push({ page: p, bins: [...req].sort(), empty: found });
  }
  await br.close();
  console.log(JSON.stringify(out, null, 1));
})();
