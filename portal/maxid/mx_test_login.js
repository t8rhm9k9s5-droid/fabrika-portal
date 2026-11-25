// Сквозная проверка страницы входа: «Войти через MAX» на заглушке сервера (Playwright, телефон и ПК)
const { chromium, devices } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const HTML = fs.readFileSync(path.join(__dirname, 'out/public/login.html'), 'utf8');
(async () => {
  const srv = http.createServer((q, r) => { if (q.url.startsWith('/sw.js')) { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end('self.addEventListener("fetch",()=>{})'); } if (/\.(png|ico|webmanifest)/.test(q.url)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(HTML); }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const b = await chromium.launch(); let ok = 0, bad = 0; const T = (n, c) => { if (c) ok++; else { bad++; console.log('ПРОВАЛ:', n); } };
  for (const dev of [devices['iPhone 13'], { viewport: { width: 1280, height: 800 } }]) {
    const ctx = await b.newContext({ ...dev, serviceWorkers: 'allow' }), p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    let reqs = [], ops = [];
    await ctx.route('https://script.google.com/macros/s/REDACTED_4/exec', async rt => {
      const q = JSON.parse(rt.request().postData() || '{}'); ops.push(q.op); let a = { ok: false, error: 'нет' };
      if (q.op === 'mxreq') { const r = { code: String(100000 + reqs.length * 7 + 123456 % 800000), ridh: q.ridh, pub: q.pub, st: 'new' }; reqs.push(r); a = { ok: true, code: r.code, ttl: 1800 }; }
      if (q.op === 'mxget') { const r = reqs.find(x => x.code === q.code && x.ridh === crypto.createHash('sha256').update(q.rid).digest('hex')); a = !r ? { ok: true, st: 'none' } : r.st === 'given' ? { ok: true, st: 'given', box: r.box } : { ok: true, st: r.st, name: r.name || '' }; }
      if (q.op === 'salt') a = { ok: true, salt: '00'.repeat(16), iter: 100000 };
      if (q.op === 'login') a = { ok: false, error: 'неверный логин или пароль' };
      await rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(a) });
    });
    await p.goto(base); await p.waitForSelector('#toMx');
    T('кнопка видна', await p.isVisible('#toMx')); T('раздел скрыт', !(await p.isVisible('#fm')));
    await p.click('#toMx'); await p.waitForSelector('#fm:not([hidden])');
    const code = reqs[0].code; T('код на экране', (await p.textContent('#fmC')) === 'портал ' + code);
    T('формы скрыты', !(await p.isVisible('#fp')) && !(await p.isVisible('#seg')));
    T('открытый ключ 65 байт', Buffer.from(reqs[0].pub, 'base64').length === 65 && /^[0-9a-f]{64}$/.test(reqs[0].ridh));
    T('ссылка на бота', (await p.getAttribute('#fmB', 'href')) === 'https://max.ru/example1');
    const box0 = await p.locator('#fm').boundingBox(), vw = p.viewportSize().width; T('раздел в экране', box0.x >= 0 && box0.x + box0.width <= vw + 1);
    await p.screenshot({ path: path.join(__dirname, 'out', 'login_mx_' + vw + '.png') });
    // перезагрузка страницы посреди ожидания (ушёл в MAX и вернулся) — запрос тот же
    await p.reload(); await p.waitForSelector('#fm:not([hidden])'); T('после перезагрузки код тот же', (await p.textContent('#fmC')) === 'портал ' + code && reqs.length === 1);
    reqs[0].st = 'checked'; reqs[0].name = 'Сотрудник5 Сотрудник5';
    await p.waitForFunction(() => /Бот подтвердил ваш MAX ID — Сотрудник5 Сотрудник5/.test(document.getElementById('fmT').textContent), null, { timeout: 15000 });
    T('статус «бот подтвердил»', true);
    // администратор: тем же кодом, что в «Управлении» (T14Acct._t.sealTo)
    reqs[0].box = await p.evaluate(pub => window.T14Acct._t.sealTo(pub, new TextEncoder().encode(JSON.stringify({ login: 'max140426852', pw: 'Проба-Пароль-42' }))), reqs[0].pub);
    reqs[0].st = 'given';
    await p.waitForFunction(() => document.getElementById('lg').value === 'max140426852', null, { timeout: 15000 });
    T('логин подставлен', true); T('пароль подставлен', (await p.inputValue('#lp')) === 'Проба-Пароль-42');
    await p.waitForFunction(() => /неверный логин или пароль/i.test(document.getElementById('err').textContent), null, { timeout: 30000 }).catch(() => {});
    T('обычный личный вход запущен (salt → login)', ops.includes('salt') && ops.includes('login'));
    T('запрос убран с устройства', await p.evaluate(() => new Promise(r => { const o = indexedDB.open('t14', 1); o.onsuccess = () => { const g = o.result.transaction('kv').objectStore('kv').get('mx'); g.onsuccess = () => r(g.result === undefined); }; })));
    // отмена
    await p.reload(); await p.waitForSelector('#toMx'); await p.click('#toMx'); await p.waitForSelector('#fm:not([hidden])'); await p.click('#fmX');
    T('отмена возвращает форму', (await p.isVisible('#fp')) && !(await p.isVisible('#fm')));
    // отклонён / устарел
    await p.click('#toMx'); await p.waitForSelector('#fm:not([hidden])'); reqs.length = 0;
    await p.waitForFunction(() => /отклонён или устарел/.test(document.getElementById('err').textContent), null, { timeout: 15000 }); T('отклонённый запрос — понятное сообщение', await p.isVisible('#fp'));
    T('ошибок страницы нет', errs.filter(e => !/ServiceWorker|sw\.js/i.test(e)).length === 0); if (errs.length) console.log(errs.slice(0, 3));
    await ctx.close();
  }
  await b.close(); srv.close(); console.log('страница входа, MAX ID: успешно', ok, 'провалов', bad); process.exit(bad ? 1 : 0);
})();
