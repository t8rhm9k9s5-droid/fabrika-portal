const fs = require('fs'), vm = require('vm'); const sheets = {}; let cache = {};
const mk = name => ({ rows: [], appendRow(r) { this.rows.push(r); }, getLastRow() { return this.rows.length; }, getRange(r, c, nr, nc) { const S = this; return { getValues: () => S.rows.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)) }; }, deleteRows(r, k) { this.rows.splice(r - 1, k); } });
const ctx = { JSON, Math, Date, String, Number, Array, Object, Error, console,
  db_: () => ({ getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = mk(n)) }),
  CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
  Utilities: { formatDate: d => new Date(d.getTime() + 3 * 36e5).toISOString().slice(0, 10) },
  cleanName_: (s, n) => String(s || '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n || 80),
  tokUser_: (tok, adm) => { if (tok === 'ADM') return { name: 'Сотрудник1 Т. В.', login: 'itm', role: 'admin' }; if (tok === 'USR' && !adm) return { name: 'Сотрудник5 И.', login: 'ivanov' }; throw new Error(adm ? 'только для администраторов' : 'войдите заново'); } };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/Visits.gs', 'utf8'), ctx); const call = (op, q) => vm.runInContext('vsPost_', ctx)(op, q);
let ok = 0, bad = 0; const T = (n, c) => { if (c) ok++; else { bad++; console.log('ПРОВАЛ:', n); } }; const thr = f => { try { f(); return ''; } catch (e) { return e.message; } };
T('посещение с личным входом', call('vshit', { tok: 'USR', page: 'sales', dev: 'iPhone', ver: '2.24.2' }).ok && sheets.visits.rows[1][1] === 'Сотрудник5 И.' && sheets.visits.rows[1][3] === 'sales');
call('vshit', { tok: '', page: 'home', dev: 'компьютер', ver: '2.24.2' }); T('без входа — «общий пароль»', sheets.visits.rows[2][1] === 'общий пароль');
call('vshit', { tok: 'USR', page: '../../x<script>', dev: '=HYPERLINK("x")', ver: '+1' }); T('страница и текст очищены, формул нет', sheets.visits.rows[3][3] === '....xscript' && sheets.visits.rows[3][4].startsWith("'=") && sheets.visits.rows[3][5] === "'+1");
T('пустая страница не пишется', call('vshit', { page: '' }).ok && sheets.visits.rows.length === 4);
call('vserr', { tok: 'USR', page: 'plan', dev: 'Android', ver: '2.24.2', msg: 'TypeError: x is undefined', src: 'plan.html', line: 12 }); T('ошибка записана', sheets.errors.rows[1][6] === 'TypeError: x is undefined' && sheets.errors.rows[1][8] === 12);
T('сводка — только администратор', thr(() => call('vssum', { tok: 'USR' })) !== '' && thr(() => call('vssum', { tok: '' })) !== '');
const s = call('vssum', { tok: 'ADM', days: 7 }); T('сводка: 3 посещения, 2 человека, страницы, ошибка', s.hits === 3 && s.people.length === 2 && s.byDay.length === 1 && s.byDay[0].people === 2 && s.pages[0].hits >= 1 && s.errors.length === 1 && s.errors[0].page === 'plan');
sheets.visits.rows.splice(1, 0, [new Date(Date.now() - 70 * 864e5), 'Старый', 'old', 'home', 'компьютер', '2.0.0']); call('vssum', { tok: 'ADM' }); T('строки старше 60 дней убраны', sheets.visits.rows.length === 4 && sheets.visits.rows[1][1] !== 'Старый');
cache = {}; let w = 0; for (let i = 0; i < 300; i++) if (!call('vshit', { page: 'home' }).skip) w++; T('ограничение частоты: 240 в минуту', w === 240);
T('чужая операция', thr(() => call('vsdrop', {})) === 'нет такой операции');
console.log('Visits.gs: успешно', ok, 'провалов', bad); process.exit(bad ? 1 : 0);
