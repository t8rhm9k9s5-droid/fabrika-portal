#!/usr/bin/env node
/* «Фабрика» — проверка Service Worker'а портала на стенде (20.11.2026, Рекс CG-50: приёмочные проверки).
   Стенд: access_stand.py <каталог> (тестовый пароль и ключи — только стенд). Шаги, между ними сборка меняется командой из аргументов:
     node test_sw_flow.js <каталог> <режим 1> [<режим 2> …]   режимы: plain (кандидат без сжатия), zpack (кандидат со сжатием)
   1) старая сборка: вход (unlock) → время до «вход открыт» и до первой страницы, байты; 2) после каждой пересборки: обновление Service
   Worker'а без нового входа, страницы открываются, текст верный, сколько блоков скачано заново; 3) две вкладки; 4) без сети — сохранённое
   открывается; 5) медленная связь (сервер отдаёт ~1 Мбит/с): вход и первая страница. Итог — «ALL OK» или список ошибок. */
const { chromium } = require('playwright'), fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const D = process.argv[2], OUT = path.join(D, 'out'), PORT = 8125, BASE = 'http://localhost:' + PORT + '/';
const CAND = process.env.T14_CAND || '/home/claude/work/speed2011', REB = process.argv.slice(3), USERS = JSON.parse(fs.readFileSync(path.join(D, 'users.json'), 'utf8')), U = USERS.admin;
const PAGES = ['home.html', 'calls.html', 'sales.html', 'staff.html'].concat((process.env.T14_PAGES || '').split(',').filter(Boolean));   // 21.11.2026: T14_PAGES — ещё страницы (разделы с отдельной картой: fsu/…, library/…)
let RATE = 0, LOG = [], FREE = 0;   // RATE — байт/с на ВЕСЬ канал (общая очередь, Рекс CG-51), FREE — когда канал освободится
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(new URL(q.url, BASE).pathname); if (p === '/') p = '/index.html';
  const f = path.join(OUT, p); if (!f.startsWith(OUT)) { s.writeHead(403); return s.end(); }
  fs.readFile(f, (e, b) => {
    if (e) { s.writeHead(404); return s.end(); }
    LOG.push([p, b.length]);
    s.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.js') ? 'application/javascript' : 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (!RATE) return s.end(b);
    let i = 0; const step = 4096;
    (function tick() {
      if (s.destroyed) return; if (i >= b.length) return s.end();
      const now = Date.now(), at = Math.max(now, FREE); FREE = at + step / RATE * 1000;
      setTimeout(() => { if (s.destroyed) return; s.write(b.subarray(i, i + step)); i += step; tick(); }, at - now);
    })();
  });
}).listen(PORT);
const bad = [], ok = m => console.log('  ✓', m), no = m => { bad.push(m); console.log('  ✗', m); };
const kb = rows => Math.round(rows.reduce((a, r) => a + r[1], 0) / 1024);
async function unlock(pg) {   // устройство человека: личный ключ, k/<id>.bin → ключ сайта (как test_access_groups.js) → Service Worker
  return pg.evaluate(async ({ id, K }) => {
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
    const sw = (await navigator.serviceWorker.ready).active, t0 = performance.now();
    const res = await new Promise(ok => {
      const on = e => { if (e.data && (e.data.type === 'unlocked' || e.data.type === 'error')) { navigator.serviceWorker.removeEventListener('message', on); ok(e.data); } };
      navigator.serviceWorker.addEventListener('message', on); sw.postMessage({ type: 'unlock', raw: new Uint8Array(raw.slice(0, 32)).buffer, sets: j });
    });
    return { res, ms: Math.round(performance.now() - t0) };
  }, U);
}
async function swVer(pg) {
  for (let i = 0; i < 5; i++) { try { return await swVer0(pg); } catch (e) { await pg.waitForLoadState('load').catch(() => {}); await pg.waitForTimeout(500); } }
  return null;
}
async function swVer0(pg) {
  return pg.evaluate(() => new Promise(ok => {
    const sw = navigator.serviceWorker.controller; if (!sw) return ok(null);
    const t = setTimeout(() => ok('нет ответа (старый Service Worker)'), 3000);
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'ver') { clearTimeout(t); ok(e.data); } });
    sw.postMessage({ type: 'ver' });
  }));
}
async function openAll(pg, tag) {
  for (const p of PAGES) {
    const r = await pg.goto(BASE + p, { timeout: 60000 }).catch(e => null);
    const t = r ? ((await pg.content().catch(() => '')) || '') : '';
    if (!r || r.status() !== 200 || !/<html|<body/i.test(t) || /font:16px system-ui;padding:24px">/.test(t)) no(tag + ': ' + p + ' не открылась (' + (r && r.status()) + ') ' + (t.match(/padding:24px">([^<]*)/) || [, ''])[1].slice(0, 120));
  }
}
async function waitNewSw(pg, prevVer) {   // новая сборка: обновление ставится само, без нового входа
  for (let i = 0; i < 30; i++) {
    await pg.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {})).catch(() => {});
    await pg.waitForTimeout(1000);
    await pg.reload({ waitUntil: 'load' }).catch(() => {});
    const ver = await swVer(pg);
    if (ver && ver.v && ver.v !== prevVer) return ver;
    if (i > 25) return ver;
  }
}
(async () => {
  const br = await chromium.launch();
  console.log('1) старая сборка: вход');
  let ctx = await br.newContext(), pg = await ctx.newPage();
  await pg.goto(BASE + 'login.html'); await pg.evaluate(() => navigator.serviceWorker.ready);
  LOG = []; let u = await unlock(pg);
  if (u.res.type !== 'unlocked') no('вход: ' + JSON.stringify(u.res)); else ok('вход открыт за ' + u.ms + ' мс, скачано ' + kb(LOG) + ' КБ');
  await openAll(pg, 'старая'); ok('страницы старой сборки открываются');
  await pg.waitForTimeout(6000);
  let ver = await swVer(pg); console.log('   Service Worker:', JSON.stringify(ver));
  for (let k = 0; k < REB.length; k++) {
    console.log((k + 2) + ') пересборка кандидатом: ' + REB[k]);
    const mode = REB[k]; if (mode !== 'plain' && mode !== 'zpack') throw new Error('режим: plain или zpack');
    const env = Object.assign({}, process.env, { T14_STAND_KEEP: '1', T14_BUILD_ENC: CAND + '/build_enc.py', T14_ENC_TPL: CAND }, mode === 'zpack' ? { FABRIKA_ZPACK: '1' } : {});
    execFileSync('python3', [path.join(__dirname, 'access_stand.py'), D], { stdio: 'pipe', env });
    LOG = [];
    const nv = await waitNewSw(pg, ver && ver.v);
    if (!nv || !nv.v || (ver && nv.v === ver.v)) no('новая версия Service Worker\'а не встала: ' + JSON.stringify(nv)); else ok('встала версия ' + nv.v + ' (распаковка: ' + nv.z + ')');
    ver = nv;
    await openAll(pg, 'после пересборки ' + (k + 1));
    const blobs = LOG.filter(r => r[0].startsWith('/b/'));
    ok('страницы открываются без нового входа; скачано заново блоков: ' + blobs.length + ', ' + kb(LOG) + ' КБ');
  }
  console.log('3) две вкладки');
  const p2 = await ctx.newPage(); await Promise.all([openAll(pg, 'вкладка 1'), openAll(p2, 'вкладка 2')]); ok('две вкладки — без ошибок'); await p2.close();
  console.log('4) без сети');
  await pg.waitForTimeout(25000);   // фоновая докачка
  await ctx.setOffline(true); await openAll(pg, 'без сети'); await ctx.setOffline(false); ok('без сети — проверено');
  await ctx.close();
  console.log('5) медленная связь ~1 Мбит/с, новое устройство');
  RATE = 125000; ctx = await br.newContext(); pg = await ctx.newPage();
  const t0 = Date.now(); await pg.goto(BASE + 'login.html', { timeout: 120000 }); await pg.evaluate(() => navigator.serviceWorker.ready);
  const tLogin = Date.now() - t0; LOG = []; u = await unlock(pg);
  if (u.res.type !== 'unlocked') no('вход на медленной связи: ' + JSON.stringify(u.res));
  const t1 = Date.now(); const rh = await pg.goto(BASE + 'home.html', { timeout: 120000 }).catch(e => { no('главная на медленной связи: ' + e.message.slice(0, 80)); return null; });
  const tHome = Date.now() - t1;
  const body = rh ? ((await pg.content().catch(() => '')) || '') : '';
  if (!rh || rh.status() !== 200 || body.length < 2000 || /font:16px system-ui;padding:24px">/.test(body)) no('главная на медленной связи: статус ' + (rh && rh.status()) + ', ' + body.length + ' байт');
  ok('страница входа ' + tLogin + ' мс; вход ' + u.ms + ' мс (' + kb(LOG) + ' КБ); главная после входа ' + tHome + ' мс');
  if (u.ms > 20000) no('вход дольше 20 с на 1 Мбит/с: ' + u.ms + ' мс');
  await ctx.close(); await br.close(); srv.close();
  console.log(bad.length ? 'ОШИБКИ: ' + bad.length : 'ALL OK'); process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
