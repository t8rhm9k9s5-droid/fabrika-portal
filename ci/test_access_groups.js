#!/usr/bin/env node
/* «Фабрика» — стенд доступа по группам (15.11.2026; tasks/access_launch.md, этап 6). Стенд собирает access_stand.py.
   Для каждого тестового человека: новое устройство → личный ключ на устройство → k/<id>.bin (ключ сайта + ключи наборов групп) →
   Service Worker сохраняет сайт → открываем страницы. Своя группа и общие разделы открываются, чужой раздел не расшифровывается
   (страница «Этот раздел открыт только своей группе», на устройстве его блоков нет).
   Запуск: NODE_PATH=$(npm root -g) node test_access_groups.js <каталог стенда> → «ALL OK». */
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const D = process.argv[2], OUT = path.join(D, 'out'), BASE = 'http://localhost:8124/';
const USERS = JSON.parse(fs.readFileSync(path.join(D, 'users.json'), 'utf8'));
// что должен видеть каждый (access_map.json: implies admin → auto, prod, sales)
const EXPECT = {
  sales: { open: ['home.html', 'calls.html', 'sales.html', 'stock.html'], closed: ['staff.html', 'transport.html', 'plan.html'] },
  prod: { open: ['home.html', 'calls.html', 'staff.html', 'stock.html'], closed: ['sales.html', 'transport.html', 'plan.html'] },
  auto: { open: ['home.html', 'calls.html', 'transport.html'], closed: ['sales.html', 'staff.html', 'stock.html', 'plan.html'] },
  admin: { open: ['home.html', 'calls.html', 'sales.html', 'staff.html', 'stock.html', 'transport.html', 'plan.html'], closed: [] },
  none: { open: ['home.html', 'calls.html'], closed: ['sales.html', 'staff.html', 'stock.html', 'transport.html', 'plan.html'] },
};
(async () => {
  const http = require('http');
  const srv = http.createServer((q, s) => {
    let p = decodeURIComponent(new URL(q.url, BASE).pathname); if (p === '/') p = '/index.html';
    const f = path.join(OUT, p); if (!f.startsWith(OUT)) { s.writeHead(403); return s.end(); }
    fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); }
      s.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream' }); s.end(b); });
  }).listen(8124);
  const br = await chromium.launch(), bad = [];
  for (const [who, u] of Object.entries(USERS)) {
    const ctx = await br.newContext(), pg = await ctx.newPage();
    await pg.goto(BASE + 'login.html'); await pg.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || navigator.serviceWorker.ready, null, { timeout: 15000 });
    await pg.evaluate(() => navigator.serviceWorker.ready);
    // устройство человека: личный ключ и id (как после входа), дальше — тот же разбор k/<id>.bin, что в acct_core.js (takeKr)
    const got = await pg.evaluate(async ({ id, K }) => {
      const S = crypto.subtle, hex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
      const db = await new Promise((ok, bad) => { const r = indexedDB.open('t14', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(r.result); r.onerror = () => bad(r.error); });
      const put = (k, v) => new Promise((ok, bad) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = () => bad(t.error); });
      const uk = await S.importKey('raw', hex(K), 'AES-GCM', false, ['encrypt', 'decrypt']);
      const buf = await (await fetch('k/' + id + '.bin', { cache: 'no-cache' })).arrayBuffer();
      const raw = new Uint8Array(await S.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf, 0, 12), additionalData: new TextEncoder().encode('fabrika-kr') }, uk, new Uint8Array(buf, 12)));
      const key = await S.importKey('raw', raw.slice(0, 32), 'AES-GCM', false, ['decrypt']), sets = {};
      const j = raw.length > 32 ? JSON.parse(new TextDecoder().decode(raw.slice(32))) : {};
      for (const s in j) sets[s] = await S.importKey('raw', hex(j[s]), 'AES-GCM', false, ['decrypt']);
      await put('uk', uk); await put('uid', id); await put('key', key); await put('sets', sets);
      const sw = (await navigator.serviceWorker.ready).active;
      const res = await new Promise(ok => { navigator.serviceWorker.addEventListener('message', e => { if (e.data && (e.data.type === 'unlocked' || e.data.type === 'error')) ok(e.data); }); sw.postMessage({ type: 'unlock' }); });
      return { sets: Object.keys(j), res };
    }, u);
    if (got.res.type !== 'unlocked') { bad.push(who + ': сайт не сохранился — ' + JSON.stringify(got.res)); await ctx.close(); continue; }
    const ex = EXPECT[who], seen = { open: [], closed: [] };
    for (const p of ex.open.concat(ex.closed)) {
      const r = await pg.goto(BASE + p); const t = (await pg.textContent('body').catch(() => '')) || '';
      const isOpen = r.status() === 200 && !/открыт только своей группе/.test(t);
      (isOpen ? seen.open : seen.closed).push(p);
      if (ex.open.includes(p) && !isOpen) bad.push(who + ': не открылся свой/общий раздел ' + p + ' (' + r.status() + ')');
      if (ex.closed.includes(p) && isOpen) bad.push(who + ': ОТКРЫЛСЯ чужой раздел ' + p);
    }
    // напрямую: блок чужой страницы ключом сайта не расшифровывается
    console.log(who.padEnd(6), 'наборы:', got.sets.join(', ') || '—', '| открыто:', seen.open.join(' '), '| закрыто:', seen.closed.join(' ') || '—');
    await ctx.close();
  }
  await br.close(); srv.close();
  console.log(bad.length ? 'FAIL\n' + bad.join('\n') : 'ALL OK'); process.exit(bad.length ? 1 : 0);
})();
