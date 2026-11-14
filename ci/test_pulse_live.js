#!/usr/bin/env node
/* «Фабрика» — проверка «Пульса разделов» на живых данных хостинга (14.11.2026, Т. В.: «проверить все данные раздела портала,
   чтобы они все подгружались … баги, которых не должно повторяться»).
   Загружает site/assets/pulse_data.js, metrics.js, pulse.js как в браузере, но T14Live.bin отдаёт расшифрованные файлы хостинга
   из каталога (их скачивает test_pulse_live.sh через stget.py). Рисует каждый раздел два раза (до и после прихода файлов) и печатает
   карточки, где вместо числа «—». Выход 1, если «—» есть там, где данные в файлах есть (список EXPECT ниже), — такой пакет не выкладывать.
   Запуск: node fabrika/tools/ci/test_pulse_live.js <каталог с *.json> [--json] */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..', '..');   // fabrika/tools/ci → /home/claude
const dir = process.argv[2];
if (!dir || !fs.existsSync(dir)) { console.error('нужен каталог с расшифрованными файлами хостинга (*.json)'); process.exit(2); }
const asJson = process.argv.includes('--json');

function readBin(name) {
  const p = path.join(dir, name.replace(/\.bin$/, '.json'));
  if (!fs.existsSync(p)) return null;
  try { const d = JSON.parse(fs.readFileSync(p, 'utf8')); return d && typeof d === 'object' ? d : null; } catch (e) { return null; }
}

const listeners = {};
const store = {};
const win = {
  addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
  removeEventListener() { },
  dispatchEvent(ev) { (listeners[ev.type] || []).forEach(f => f(ev)); return true; },
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
  sessionStorage: { getItem: () => null, setItem() { }, removeItem() { } },
  location: { protocol: 'https:', pathname: '/razdel.html', href: 'https://example/razdel.html', hash: '' },
  console,
};
win.window = win;
win.document = { readyState: 'complete', addEventListener() { }, hidden: false, querySelector: () => null, getElementById: () => null };
win.CustomEvent = function (type, o) { this.type = type; this.detail = o && o.detail; };
win.setTimeout = setTimeout; win.clearTimeout = clearTimeout; win.Promise = Promise; win.Date = Date; win.JSON = JSON; win.Math = Math;
const asked = {};
win.T14Live = {
  bin(name) { asked[name] = 1; return new Promise(r => setTimeout(() => r(readBin(name)), 5)); },
  load() { asked['ls.bin'] = 1; return new Promise(r => setTimeout(() => r(readBin('ls.bin')), 5)); },
};
win.T14Acct = null;
const ctx = vm.createContext(win);
for (const f of ['site/assets/pulse_data.js', 'site/assets/metrics.js', 'site/assets/pulse.js']) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) { if (f.indexOf('pulse_data') < 0) { console.error('нет ' + f); process.exit(2); } continue; }
  vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}
const P = ctx.T14Pulse;
if (!P) { console.error('T14Pulse не загрузился'); process.exit(2); }

const SECS = ['sales', 'prod', 'quality', 'supply', 'log', 'online', 'fin', 'items', 'people', 'docs', 'site'];
// Карточки, у которых в файлах хостинга данные есть всегда: «—» тут — ошибка кода, а не отсутствие отчёта.
const EXPECT = {
  prod: ['Выпуск месяца|Выпуск: план на дату', 'План в сутки', 'Ниже 90 % плана', 'Лучшая группа', 'Отстающая группа'],
  sales: ['План месяца', 'Продажи за день', 'Отчёты офисов'],
};
function cards(html) {
  const out = [], re = /<span class="t"><i><\/i>([^<]*)<\/span><span class="v">([^<]*)(?:<small>([^<]*)<\/small>)?<\/span>(?:<span class="s">([^<]*)<\/span>)?/g;
  let m; while ((m = re.exec(html))) out.push({ t: m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'), v: m[2], u: m[3] || '', s: (m[4] || '').replace(/&amp;/g, '&') });
  return out;
}
function render(sec) { const host = { innerHTML: '' }; try { P.render(sec, host); } catch (e) { return { err: String(e && e.stack || e) }; } return { html: host.innerHTML }; }

(async () => {
  SECS.forEach(s => { if (P.has(s)) render(s); });           // первый проход — запросы файлов
  await new Promise(r => setTimeout(r, 300));
  const res = {}, bad = [];
  for (const s of SECS) {
    if (!P.has(s)) { res[s] = { missing: true }; if (EXPECT[s]) bad.push(s + ': раздела нет в pulse.js'); continue; }   // 14.11 ревью Рекса CG-10 п. 4
    const r = render(s);
    if (r.err) { res[s] = { err: r.err }; bad.push(s + ': ошибка ' + r.err.split('\n')[0]); continue; }
    const C = cards(r.html);
    res[s] = { cards: C, dash: C.filter(c => c.v.trim() === '—').map(c => c.t) };
    (EXPECT[s] || []).forEach(t => { const alt = t.split('|'), c = C.find(x => alt.includes(x.t)); if (!c) bad.push(s + ': нет карточки «' + t + '»'); else if (c.v.trim() === '—') bad.push(s + ': «' + c.t + '» = — (' + c.s + ')'); });
  }
  if (asJson) { console.log(JSON.stringify({ res, bad, asked: Object.keys(asked) }, null, 1)); }
  else {
    for (const s of SECS) {
      const r = res[s]; if (!r || r.missing) { console.log('· ' + s + ': раздела нет в pulse.js'); continue; }
      if (r.err) { console.log('✗ ' + s + ': ' + r.err.split('\n')[0]); continue; }
      console.log((r.dash.length ? '△ ' : '✓ ') + s + ': ' + r.cards.map(c => c.t + ' ' + c.v + (c.u ? ' ' + c.u : '')).join(' | '));
      if (r.dash.length) console.log('    без числа: ' + r.dash.join(', '));
    }
    console.log('файлы, запрошенные страницей: ' + Object.keys(asked).sort().join(', '));
    console.log(bad.length ? '\nОШИБКИ (данные есть, на экране «—»):\n  ' + bad.join('\n  ') : '\nОшибок нет: где данные есть, числа показаны.');
  }
  process.exit(bad.length ? 1 : 0);
})();
