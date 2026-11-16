// CG-32 (проверка Рекса, п. 2): сводка «Транспорта» в «Пульсе» — запрос на каждый вход; поздний ответ после смены входа не пишется;
// после сбоя сети — повтор не раньше чем через 60 с. Запуск: node ci/test_pulse_glq.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.resolve(__dirname, '../portal/assets/pulse.js'), 'utf8');
const a = src.indexOf('  var GLQ'), b = src.indexOf('  var MSK');
if (a < 0 || b < a) throw Error('не нашёл glData в pulse.js');
const own = (src.match(/p\.id === '([^']+)'\) return true/) || [])[1];
let now = 1e12, me = { id: own, st: 'ok' }, tok = 't1', calls = [], drawn = 0;
const store = {};
const ctx = {
  Date: { now: () => now }, JSON,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  again: () => { drawn++; },
};
ctx.window = ctx;
ctx.T14Acct = { tok: () => tok, me: () => me, api: (op, q) => new Promise((ok, no) => calls.push({ op, q, ok, no })) };
vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.glData = glData;', ctx);
const G = { t: 'x', cars: [{ id: 1, name: 'А', vrn: 'В' }], day: {}, km: {} };
const tick = () => new Promise(r => setImmediate(r));
(async () => {
  const fail = m => { console.error('FAIL', m); process.exit(1); };
  ctx.glData(); ctx.glData(); if (calls.length !== 1) fail('один вход — один запрос, было ' + calls.length);
  const late = calls[0];
  tok = 't2'; me = { id: own, st: 'ok' };          // выход и новый вход
  ctx.glData(); if (calls.length !== 2) fail('новый вход не запросил сводку');
  late.ok({ gl: G }); await tick(); if (store['t14.glsum']) fail('поздний ответ старого входа записан');
  calls[1].no(Error('net')); await tick();
  ctx.glData(); if (calls.length !== 2) fail('повтор сразу после сбоя');
  now += 61e3; ctx.glData(); if (calls.length !== 3) fail('нет повтора через 60 с после сбоя');
  calls[2].ok({ gl: G }); await tick();
  if (!store['t14.glsum'] || !drawn) fail('ответ своего входа не записан');
  console.log('ok: test_pulse_glq'); 
})();
