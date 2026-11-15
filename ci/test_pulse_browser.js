#!/usr/bin/env node
/* «Фабрика» — пульс разделов в настоящем браузере (14.11.2026, Т. В.: «внутри разделов нет данных — а данные сами по себе точно есть!»;
   «красная точка у продаж не пропадает после просмотра раздела»). В отличие от test_pulse_live.js — настоящая страница razdel.html со всеми
   скриптами сайта в том порядке, как на хостинге (порядок подключения, ошибки страницы, перерисовка по приходу файлов). Хостинг не трогает:
   T14Live.bin/load отдают уже расшифрованные файлы из каталога (их скачивает test_pulse_live.sh), ключи в браузер не попадают.
   Проверяет: карточки и диаграммы из pulse_expect.json — с числами; ошибок JavaScript на страницах нет; точка тревоги у «Продаж» в меню
   есть до просмотра раздела и гаснет после (если в сборке есть тревога раздела «Продажи»).
   Запуск: NODE_PATH=$(npm root -g) node fabrika/tools/ci/test_pulse_browser.js <каталог с *.json> [--shots <каталог>] → выход 1 при ошибке */
'use strict';
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { console.error('нет playwright (NODE_PATH=$(npm root -g))'); process.exit(2); }
const ROOT = path.resolve(__dirname, '..', '..', '..'), SITE = path.join(ROOT, 'site'), DATA = process.argv[2], BASE = 'http://t14.local/';
const si = process.argv.indexOf('--shots'), SHOTS = si > 0 ? process.argv[si + 1] : null;
if (!DATA || !fs.existsSync(DATA)) { console.error('нужен каталог с расшифрованными файлами хостинга (*.json)'); process.exit(2); }
const EXP = JSON.parse(fs.readFileSync(path.join(__dirname, 'pulse_expect.json'), 'utf8'));
const MIME = { html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', json: 'application/json', woff2: 'font/woff2', webmanifest: 'application/json' };
function titleIs(want, t) { t = (t || '').trim(); return want.split('|').some(w => w.endsWith('*') ? t.indexOf(w.slice(0, -1)) === 0 : t === w); }
function alertsFor(sec) {
  try { const s = fs.readFileSync(path.join(SITE, 'assets', 'alerts_data.js'), 'utf8'), m = /=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(s); return ((JSON.parse(m[1]).items) || []).filter(a => a && a.t && (a.secs || []).includes(sec)).length; } catch (e) { return 0; }
}
(async () => {
  const br = await chromium.launch(), bad = [];
  const ctx = await br.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.host !== 't14.local') return r.abort();                                  // наружу — ничего
    if (u.pathname.startsWith('/__live/')) { const f = path.join(DATA, path.basename(u.pathname)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: 'application/json' }) : r.fulfill({ status: 404, body: '' }); }
    if (u.pathname.startsWith('/st/')) return r.fulfill({ status: 404, body: '' });
    const f = path.join(SITE, decodeURIComponent(u.pathname));
    if (!f.startsWith(SITE)) return r.fulfill({ status: 404, body: '' });
    let body; try { body = fs.readFileSync(f); } catch (e) { return r.fulfill({ status: 404, body: '' }); }   // 14.11 CodeQL: читаем сразу, без гонки existsSync → read
    r.fulfill({ body, contentType: MIME[f.split('.').pop()] || 'application/octet-stream' });
  });
  await ctx.addInitScript(() => {                                                  // настоящий live.js остаётся; подменяются только bin/load
    let real;
    Object.defineProperty(window, 'T14Live', { configurable: true, get() { return real; }, set(v) {
      const C = {};
      const get = n => C[n] || (C[n] = fetch('/__live/' + n.replace(/\.bin$/, '.json')).then(r => r.ok ? r.json() : null).catch(() => null).then(d => {
        if (d) try { window.dispatchEvent(new CustomEvent('t14bin', { detail: { name: n, data: d } })); if (n === 'ls.bin') window.dispatchEvent(new CustomEvent('t14live', { detail: d })); } catch (e) { }
        return d; }));
      v.bin = get; v.load = () => get('ls.bin'); v.prefetch = () => { }; v.refresh = () => { }; real = v; } });
  });
  const pg = await ctx.newPage(), errs = [];
  pg.on('pageerror', e => errs.push(pg.url().split('/').pop() + ': ' + String(e).slice(0, 200)));
  const dot = () => pg.evaluate(() => { const a = document.querySelector('.pside a[data-p="razdel.html#sales"]'); return a ? !!a.querySelector('.al-dot') : null; });
  await pg.goto(BASE + 'home.html'); await pg.waitForTimeout(2500);
  const dot0 = await dot();
  for (const s of Object.keys(EXP.cards)) {
    await pg.goto(BASE + 'razdel.html#' + s); await pg.waitForTimeout(3000);
    const r = await pg.evaluate(() => ({
      K: [...document.querySelectorAll('.pz-k > .gl')].map(e => ({ t: ((e.querySelector('.t') || {}).textContent || '').trim(), v: (((e.querySelector('.v') || {}).firstChild || {}).textContent || '').trim(), s: ((e.querySelector('.s') || {}).textContent || '').trim() })),
      B: [...document.querySelectorAll('.pz-b > .gl')].map(e => ({ h: ((e.querySelector('h3') || {}).textContent || '').trim(), n: e.querySelectorAll('.pz-ch > div, .pz-hb').length, none: !!e.querySelector('.pz-none') }))
    }));
    if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, 'pulse_' + s + '.png') });
    (EXP.cards[s] || []).forEach(t => { const c = r.K.find(x => titleIs(t, x.t)); if (!c) bad.push(s + ': нет карточки «' + t + '»'); else if (c.v === '—') bad.push(s + ': «' + c.t + '» = — (' + c.s + ')'); });
    ((EXP.charts || {})[s] || []).forEach(t => { const c = r.B.find(x => titleIs(t, x.h)); if (!c) bad.push(s + ': нет диаграммы «' + t + '»'); else if (c.none || !c.n) bad.push(s + ': диаграмма «' + c.h + '» пустая'); });
    console.log('  ' + s + ': ' + r.K.map(k => k.t + ' ' + k.v).join(' | ') + ' · диаграммы: ' + r.B.map(b => b.none ? 'пусто' : b.n).join(', '));
    if (s === 'sales') {
      const d1 = await dot();
      if (alertsFor('sales') && d1) bad.push('тревога «Продажи»: точка в меню не погасла на странице раздела');
    }
  }
  await pg.goto(BASE + 'home.html'); await pg.waitForTimeout(2000);
  const dot2 = await dot();
  if (alertsFor('sales')) {
    if (!dot0) bad.push('тревога «Продажи»: до просмотра раздела точки в меню нет');
    if (dot2) bad.push('тревога «Продажи»: точка в меню вернулась после просмотра раздела');
    console.log('  точка тревоги у «Продаж»: до просмотра — ' + (dot0 ? 'есть' : 'нет') + ', после — ' + (dot2 ? 'есть' : 'нет'));
  }
  // Sample the product menu from its first visible frame through the arrival of the KPI cards.
  await pg.setViewportSize({ width: 1584, height: 893 });
  await pg.addInitScript(() => {
    if (location.hash !== '#items') return;
    const first = {}, state = window.productLayout = { measured: 0, maxShift: 0 };
    function sample() {
      for (const heading of document.querySelectorAll('.rz-card h2')) {
        const label = heading.textContent.trim();
        if (label !== 'Каталог' && label !== 'Цены и материалы') continue;
        const box = heading.closest('section').getBoundingClientRect();
        if (!box.height) continue;
        if (!(label in first)) first[label] = box.top;
        state.maxShift = Math.max(state.maxShift, Math.abs(box.top - first[label]));
      }
      state.measured = Object.keys(first).length;
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await pg.reload();
    else await pg.goto(BASE + 'razdel.html#items');
    await pg.waitForSelector('#pzHost .pz-k > .gl');
    await pg.waitForTimeout(2500);
    const state = await pg.evaluate(() => ({ ...window.productLayout, scroll: window.scrollY }));
    if (state.measured !== 2 || state.maxShift > 2 || state.scroll !== 0)
      bad.push('Положение разделов каталога при загрузке: ' + JSON.stringify(state));
  }
  errs.forEach(e => bad.push('ошибка JavaScript: ' + e));
  await br.close();
  console.log(bad.length ? '\nОШИБКИ в браузере:\n  ' + bad.join('\n  ') : 'браузер: ошибок нет — где данные есть, числа и диаграммы показаны');
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error('сбой проверки в браузере: ' + (e && e.stack || e)); process.exit(2); });
