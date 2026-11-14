#!/usr/bin/env node
/* «Фабрика» — лёгкая версия портала в Telegram (14.11.2026, Т. В.: «мини-приложение пишет об ошибке запуска в тг и не входит» → опрос «Лёгкая
   версия в Telegram»). Браузер как Telegram на iPhone: нет Service Worker, есть мост TelegramWebviewProxy, ширина телефона. Стенд — копия
   файлов пульса, зашифрованная ТЕСТОВЫМ ключом из тестового пароля (ci/lite_fixture.py), данные — зашифрованные файлы хостинга.
   Проверяет: вход → пульс 11 разделов без «—» в продажах/производстве/складе, карточка открывает отчёт во внешнем браузере,
   второй запуск — сразу пульс. Запуск: NODE_PATH=$(npm root -g) node ci/test_lite_tg.js <стенд> <каталог для снимков> → «ALL OK». */
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const SITE = process.argv[2], SHOTS = process.argv[3], BASE = 'http://localhost:8123/';
(async () => {
  const br = await chromium.launch(), bad = [];
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.host !== 'localhost:8123') return r.abort();
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html'; const f = path.join(SITE, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); });
  await ctx.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;                     // как WKWebView в Telegram
    window.__tg = []; window.TelegramWebviewProxy = { postEvent: (t, d) => window.__tg.push([t, d]) };
  });
  const pg = await ctx.newPage(), errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto(BASE + '#tgWebAppData=x&tgWebAppPlatform=ios'); await pg.waitForTimeout(800);
  const st0 = await pg.evaluate(() => ({ sw: 'serviceWorker' in navigator, err: document.getElementById('err').textContent, tgl: !document.getElementById('tgl').hidden }));
  if (st0.sw) bad.push('Service Worker не убран в тесте'); if (st0.err) bad.push('ошибка на входе: ' + st0.err); if (!st0.tgl) bad.push('нет подсказки про лёгкую версию');
  await pg.screenshot({ path: path.join(SHOTS, 'lite_0_login.png') });
  await pg.fill('#pw', 'test-lite-1411'); await pg.click('#fs .go'); await pg.waitForTimeout(3500);
  const st1 = await pg.evaluate(() => ({ lite: !document.getElementById('lite').hidden, tabs: document.querySelectorAll('.lt-n button').length,
    cards: [...document.querySelectorAll('#lt-p .pz-k > .gl')].map(e => [(e.querySelector('.t') || {}).textContent, ((e.querySelector('.v') || {}).firstChild || {}).textContent]), err: document.getElementById('err').textContent, tg: window.__tg.map(x => x[0]) }));
  console.log('после входа:', JSON.stringify(st1).slice(0, 700));
  if (!st1.lite) bad.push('лёгкий режим не открылся: ' + st1.err); if (st1.tabs !== 11) bad.push('вкладок ' + st1.tabs);
  if (!st1.cards.length || st1.cards.filter(c => (c[1] || '').trim() === '—').length > 1) bad.push('карточки продаж: ' + JSON.stringify(st1.cards));
  await pg.screenshot({ path: path.join(SHOTS, 'lite_1_sales.png'), fullPage: true });
  for (const s of ['prod', 'supply']) {
    await pg.click('.lt-n button[data-s="' + s + '"]'); await pg.waitForTimeout(1500);
    const c = await pg.evaluate(() => [...document.querySelectorAll('#lt-p .pz-k > .gl')].map(e => [(e.querySelector('.t') || {}).textContent, ((e.querySelector('.v') || {}).firstChild || {}).textContent]));
    console.log(s + ':', JSON.stringify(c)); if (c.filter(x => (x[1] || '').trim() === '—').length > 0) bad.push(s + ': есть «—» ' + JSON.stringify(c));
    await pg.screenshot({ path: path.join(SHOTS, 'lite_2_' + s + '.png'), fullPage: true });
  }
  await pg.click('#lt-p .pz-k > a.gl'); await pg.waitForTimeout(300);
  const lk = await pg.evaluate(() => window.__tg.filter(x => x[0] === 'web_app_open_link').map(x => x[1]));
  console.log('ссылка карточки:', JSON.stringify(lk)); if (!lk.length || !/staff\.html|omts|stock/.test(lk[0])) bad.push('карточка не открыла отчёт во внешнем браузере');
  // повторный запуск: ключ запомнен — сразу пульс, без пароля
  const pg2 = await ctx.newPage(); pg2.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg2.goto(BASE + '#tgWebAppData=x&tgWebAppPlatform=ios'); await pg2.waitForTimeout(3500);
  const st2 = await pg2.evaluate(() => ({ lite: !document.getElementById('lite').hidden, sel: (document.querySelector('.lt-n button[aria-selected="true"]') || {}).dataset }));
  console.log('второй запуск:', JSON.stringify(st2)); if (!st2.lite) bad.push('второй запуск снова просит пароль');
  errs.forEach(e => bad.push('ошибка JS: ' + e));
  await br.close();
  console.log(bad.length ? 'ОШИБКИ:\n  ' + bad.join('\n  ') : 'ALL OK');
  process.exit(bad.length ? 1 : 0);
})();
