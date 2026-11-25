// Проверка MxLogin.gs на заглушках Apps Script
const fs = require('fs'), crypto = require('crypto'), vm = require('vm');
let cell = '', cache = {}, logs = [], sigOk = true;
const ctx = { JSON, Math, Date, String, Number, Array, Error, console,
  db_: () => ({ getSheetByName: () => ({ getRange: () => ({ getValue: () => cell, setValue: v => { cell = v; } }) }) }),
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  B64_RE: /^[A-Za-z0-9+\/=]+$/, withLock_: f => f(), log_: (a, b) => logs.push(a + ': ' + b),
  rnd_: n => [...crypto.randomBytes(n)].map(x => x > 127 ? x - 256 : x), hex_: b => Buffer.from(b).toString('hex'), sha256_: b => [...crypto.createHash('sha256').update(Buffer.from(b)).digest()], utf8_: s => [...Buffer.from(String(s))],
  cleanName_: (s, n) => String(s || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n || 80),
  tokUser_: (tok, adm) => { if (tok !== 'ADM') throw new Error('только для администраторов'); return { login: 'itm' }; },
  g4_sigCheck_: q => sigOk ? { ok: true, how: 'key', d: {} } : { ok: false, error: 'нет доступа' } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/MxLogin.gs', 'utf8'), ctx);
const call = (op, q) => vm.runInContext('mxPost_', ctx)(op, q), bot = q => vm.runInContext('mxBot_', ctx)(q);
let ok = 0, bad = 0; const T = (n, c) => { if (c) ok++; else { bad++; console.log('ПРОВАЛ:', n); } };
const thr = f => { try { f(); return ''; } catch (e) { return e.message; } };
const rid = crypto.randomBytes(24).toString('hex'), ridh = crypto.createHash('sha256').update(rid).digest('hex'), pub = crypto.randomBytes(65).toString('base64');
T('плохой запрос', thr(() => call('mxreq', { ridh: 'zz', pub })) === 'неверные данные');
const r1 = call('mxreq', { ridh, pub }); T('код 6 цифр', /^\d{6}$/.test(r1.code) && r1.ttl === 1800);
T('новый', call('mxget', { code: r1.code, rid }).st === 'new');
T('чужой rid', call('mxget', { code: r1.code, rid: crypto.randomBytes(24).toString('hex') }).st === 'none');
T('список без токена', thr(() => call('mxlist', { tok: 'x' })) !== '');
T('список пуст до бота', call('mxlist', { tok: 'ADM' }).reqs.length === 0);
T('выдать до проверки бота нельзя', thr(() => call('mxgive', { tok: 'ADM', code: r1.code, box: 'A'.repeat(200), login: 'max1' })).startsWith('запрос не найден'));
sigOk = false; T('бот без подписи', bot({ code: r1.code, uid: '1', name: 'X' }).ok === false); sigOk = true;
T('бот: нет кода', bot({ code: '000000', uid: '140426852', name: 'Сотрудник5' }).st === 'nocode');
T('бот: принят', bot({ code: r1.code, uid: '140426852', name: 'Сотрудник5 <b>Сотрудник5' }).st === 'sent');
const g = call('mxget', { code: r1.code, rid }); T('проверен + имя без тегов', g.st === 'checked' && g.name === 'Сотрудник5 bСотрудник5');
const l = call('mxlist', { tok: 'ADM' }).reqs; T('в списке администратора', l.length === 1 && l[0].uid === '140426852' && l[0].pub === pub && !('ridh' in l[0]));
T('коробка не b64', thr(() => call('mxgive', { tok: 'ADM', code: r1.code, box: '<script>'.repeat(20), login: 'max1' })) === 'неверные данные');
T('выдача', call('mxgive', { tok: 'ADM', code: r1.code, box: 'Qk9Y'.repeat(50), login: 'max140426852' }).ok === true);
T('устройство получило', call('mxget', { code: r1.code, rid }).box === 'Qk9Y'.repeat(50));
T('повтор бота после выдачи', bot({ code: r1.code, uid: '5', name: 'Чужой' }).st === 'nocode');
T('журнал', logs.length === 2 && /подтвердил вход/.test(logs[1]));
const r2 = call('mxreq', { ridh, pub }); call('mxdeny', { tok: 'ADM', code: r2.code }); T('отклонён', call('mxget', { code: r2.code, rid }).st === 'none');
let L = JSON.parse(cell); L.forEach(x => x.t -= 31 * 60 * 1000); cell = JSON.stringify(L); T('устарел через 30 мин', call('mxget', { code: r1.code, rid }).st === 'none');
for (let i = 0; i < 20; i++) call('mxreq', { ridh, pub }); T('не больше 20 живых', /слишком много неподтверждённых/.test(thr(() => call('mxreq', { ridh, pub }))));
cache = {}; cell = ''; for (let i = 0; i < 30; i++) { try { call('mxreq', { ridh, pub }); } catch (e) { cell = ''; } } T('ограничение частоты', /через 10 минут/.test(thr(() => call('mxreq', { ridh, pub }))));
console.log('MxLogin.gs: успешно', ok, 'провалов', bad); process.exit(bad ? 1 : 0);
