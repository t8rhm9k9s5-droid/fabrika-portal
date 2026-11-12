/* «Фабрика» — общий модуль Outbox.gs (05.11.2026, исправления по отчёту ChatGPT: A5/A6 ядра и Telegram, C-A2/C-A4 общих модулей, C-B2 таймеров):
   долговечная очередь ИСХОДЯЩИХ операций (письма, сообщения MAX/Telegram, op post, push к Claude) с подтверждением доставки
   по каждому адресату отдельно. Один и тот же файл в ОБА проекта Apps Script 1c@ (Telegram «Фабрика — уведомления», MAX «Фабрика — бот MAX»).
   Префикс ob_. Зависимости — только службы Google (PropertiesService, CacheService, SpreadsheetApp, DriveApp, LockService) и свойства скрипта;
   если в проекте есть ClaudePush.gs — берутся его cp_sheetId_ (та же служебная таблица) и cp_mask_ (маскирование журналов), иначе свой запасной путь.
   Контракт — tasks/fix_gpt_0511.md «Контракт common/Outbox.gs»; сигнатуры ob_put/ob_mark/ob_due/ob_get/ob_runner не менять (их зовут F1, F2, F4).

   Принцип (отчёт GPT, «Общие принципы»): бизнес-решение вызывающий сохраняет сразу, а уведомление — операция в листе ob_out со статусом
   pending ДО подтверждённой доставки. Повтор той же операции (тот же key) второй операции не создаёт (ob_put → dup:true и текущее состояние).
   Отдельные адресаты = отдельные ключи: key = '<операция>:<адресат>' (например 'au:price:p1abc:mail', 'recl:w1abc:chat:12345').

   Статусы: pending (ждёт первой попытки или ручного повтора) → failed (попытка не удалась, next_at — когда повторить: 2, 4, 8, 16, 32 мин)
   → sent (доставлено, result — mid и т. п.) | dead (постоянная ошибка либо исчерпаны OB_MAX_TRIES = 6 попыток) | uncertain (обработчик не знает,
   дошло ли — автоматически НЕ повторяется, чтобы не задвоить; владелец решает: ob_retry(key) в редакторе). dead/uncertain → одна техтревога
   владельцу через функцию проекта с именем ob_alert_ (аргумент text; в Outbox.gs она НЕ определяется — MAX: Timers.gs, Telegram: v44m), если она определена (MAX — tm_alert_/mx_tgOwner, Telegram — g4_alertOwner_; она должна
   слать напрямую, не через Outbox), не чаще раза в час;
   остальное видно в листе ob_out (ничего не удаляется молча: компакция — sent старше 7 дней, dead/uncertain старше 30 дней).
   ob_due берёт операцию «в работу» на OB_LEASE_MS (5 мин): параллельный раннер её не возьмёт; упавший раннер — повтор после аренды (попытка засчитана).

   Лист ob_out (служебная таблица проекта — SVC_SHEET_ID / SS_ID как у cp_sheetId_): key, kind, target, payload (JSON ≤ 45 000 знаков; длиннее —
   файл на Диске «Фабрика — боты/outbox/<key>.json», в ячейке {"__file": id}), status, tries, next_at, last_err (маскирован: без почт, телефонов,
   токенов), created, updated, result (JSON). Текст операции в payload хранится как есть — иначе её нельзя доставить; журналы/тревоги — маскируются.
   Всё — только при MODE === 'google'; иначе ob_put → {ok:false, status:'off'}, ob_due → [], ob_runner → {n:0}. Замок — LockService (ScriptLock),
   не получен за OB_LOCK_MS → операция НЕ выполняется (fail-closed): ob_put → {ok:false, status:'busy'} — вызывающий повторяет позже. */

var OB_SHEET = 'ob_out';
var OB_COLS = ['key', 'kind', 'target', 'payload', 'status', 'tries', 'next_at', 'last_err', 'created', 'updated', 'result'];
var OB_STATUSES = { pending: 1, sent: 1, failed: 1, dead: 1, uncertain: 1 };
var OB_MAX_TRIES = 6;                               // после — dead + техтревога
var OB_LEASE_MS = 5 * 60000;                        // «в работе»: взятая ob_due операция не выдаётся повторно, пока аренда не истекла
var OB_LOCK_MS = 3000;                              // ожидание замка; не дождались — fail-closed (busy)
var OB_PAYLOAD_MAX = 45000;                         // JSON длиннее — файл на Диске, в ячейке ссылка (тело не режется)
var OB_RESULT_MAX = 2000, OB_ERR_MAX = 300, OB_KEY_MAX = 200;
var OB_KEEP_SENT_DAYS = 7;                          // окно идемпотентности по key: sent хранится 7 дней, повтор ob_put за это время → dup
var OB_KEEP_DEAD_DAYS = 30;                         // dead/uncertain — 30 дней (видны для разбора)
var OB_ALERT_TTL = 3600;                            // техтревога владельцу не чаще раза в час (остальное — в листе)
var OB_IDLE_TTL = 21600;                            // флаг «очередь пуста» (CacheService): пустой минутный тик не открывает таблицу
var OB_DUE_MAX = 20, OB_RUN_BATCH = 10;
var OB_COMPACT_MIN_ROWS = 200, OB_COMPACT_TTL = 21600;
var OB_DIR = ['Фабрика — боты', 'outbox'];
var OB_SS_MEMO = null;

// ================================================================ свойства, таблица, замок, маскирование
function ob_prop_(k) { return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); }
function ob_mode_() { return ob_prop_('MODE') === 'google'; }
function ob_err_(e) { return String(e && e.message ? e.message : e).slice(0, OB_ERR_MAX); }
function ob_key_(k) { return String(k == null ? '' : k).replace(/[\r\n\t]+/g, ' ').trim().slice(0, OB_KEY_MAX); }
function ob_bot_() { var n = ob_prop_('BOT_NAME'); if (n) return n; if (ob_prop_('TG_TOKEN')) return 'Telegram'; if (ob_prop_('MAX_TOKEN')) return 'MAX'; return 'бот'; }
/** Почты, телефоны, адреса сети, токены → заглушки (для last_err и тревог): cp_mask_ из ClaudePush.gs, иначе свой. */
function ob_mask_(s) {
  s = String(s == null ? '' : s);
  if (typeof cp_mask_ === 'function') { try { return cp_mask_(s); } catch (e) { /* запасной путь ниже */ } }
  return s.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[почта]').replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]')
    .replace(/(^|[^\d])(\+?\d[\d\s()\-]{8,}\d)(?!\d)/g, '$1[телефон]').replace(/sk-ant-[\w-]+|trig_[\w-]+/g, '[токен]');
}
/** id служебной таблицы проекта: как cp_sheetId_ (SVC_SHEET_ID → SS_ID Store.gs в проекте MAX → создать и записать свойство). */
function ob_sheetId_() {
  if (typeof cp_sheetId_ === 'function') return cp_sheetId_();
  var id = ob_prop_('SVC_SHEET_ID'); if (id) return id;
  if (typeof SS_ID === 'string' && /^[\w-]{20,}$/.test(SS_ID)) return SS_ID;
  var lock = LockService.getScriptLock(), got = false; try { got = lock.tryLock(10000); } catch (e) { got = false; }
  try {
    id = ob_prop_('SVC_SHEET_ID'); if (id) return id;
    var ss = SpreadsheetApp.create('Фабрика — ' + ob_bot_() + ' — служебная');
    id = ss.getId(); PropertiesService.getScriptProperties().setProperty('SVC_SHEET_ID', id);
    return id;
  } finally { if (got) lock.releaseLock(); }
}
/** Лист ob_out (создаётся с заголовком). Открывать ДО взятия замка. */
function ob_sheet_() {
  if (!OB_SS_MEMO) OB_SS_MEMO = SpreadsheetApp.openById(ob_sheetId_());
  var sh = OB_SS_MEMO.getSheetByName(OB_SHEET);
  if (!sh) { sh = OB_SS_MEMO.insertSheet(OB_SHEET); sh.appendRow(OB_COLS); }
  else if (sh.getLastRow() === 0) sh.appendRow(OB_COLS);
  return sh;
}
/** Под замком; не получен за OB_LOCK_MS → busy (fail-closed, ничего не пишем). */
function ob_lock_(fn, busy) {
  var lock = LockService.getScriptLock(), got = false; try { got = lock.tryLock(OB_LOCK_MS); } catch (e) { got = false; }
  if (!got) { console.log('ob_lock: замок занят'); return busy; }
  try { return fn(); } finally { lock.releaseLock(); }
}
function ob_ms_(v) { if (v instanceof Date) return v.getTime(); if (v === '' || v == null) return 0; var n = Number(v); if (n) return n; var d = new Date(v).getTime(); return isNaN(d) ? 0 : d; }
function ob_parse_(raw) { if (raw === '' || raw == null) return null; try { return JSON.parse(raw); } catch (e) { return String(raw); } }
/** Флаг «нет pending/failed» (кэш): ob_due при флаге не открывает таблицу; ob_put и возврат в очередь снимают. */
function ob_idle_(set) {
  try {
    var c = CacheService.getScriptCache();
    if (set === undefined) return c.get('ob:idle') === '1';
    if (set) c.put('ob:idle', '1', OB_IDLE_TTL); else c.remove('ob:idle');
  } catch (e) { /* кэш не обязателен */ }
  return false;
}

// ================================================================ строки листа (по ключу, не по номеру строки через границу замка)
/** Строка листа → запись (payload/result — сырые строки, даты — мс). */
function ob_rec_(r, row) {
  return { row: row, key: String(r[0]), kind: String(r[1] || ''), target: String(r[2] || ''), payloadRaw: String(r[3] == null ? '' : r[3]),
    status: String(r[4] || 'pending'), tries: Number(r[5]) || 0, next_at: ob_ms_(r[6]), last_err: String(r[7] || ''),
    created: ob_ms_(r[8]), updated: ob_ms_(r[9]), resultRaw: String(r[10] == null ? '' : r[10]) };
}
function ob_rows_(sh) {
  var n = sh.getLastRow(), out = []; if (n < 2) return out;
  var V = sh.getRange(2, 1, n - 1, OB_COLS.length).getValues();
  for (var i = 0; i < V.length; i++) if (String(V[i][0] || '')) out.push(ob_rec_(V[i], i + 2));
  return out;
}
/** Номер строки с key (0 — нет); ищется заново при каждой записи. */
function ob_findRow_(sh, key) {
  var n = sh.getLastRow(); if (n < 2) return 0;
  var f = sh.getRange(2, 1, n - 1, 1).createTextFinder(String(key)).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}
function ob_readRow_(sh, row) { return ob_rec_(sh.getRange(row, 1, 1, OB_COLS.length).getValues()[0], row); }
/** Записать всю строку одной операцией (поля из rec; vals — изменения). */
function ob_writeRow_(sh, rec, vals) {
  var o = { key: rec.key, kind: rec.kind, target: rec.target, payload: rec.payloadRaw, status: rec.status, tries: rec.tries, next_at: rec.next_at, last_err: rec.last_err, created: rec.created, updated: rec.updated, result: rec.resultRaw };
  for (var k in vals) o[k] = vals[k];
  var d = function (ms) { return ms ? new Date(Number(ms)) : ''; };
  sh.getRange(rec.row, 1, 1, OB_COLS.length).setValues([[o.key, o.kind, o.target, o.payload, o.status, Number(o.tries) || 0, d(o.next_at), o.last_err, d(o.created), d(o.updated), o.result]]);
}
/** Пауза перед повтором после tries попыток: 2, 4, 8, 16, 32 мин (≤ 60). */
function ob_backoff_(tries) { return Math.min(60, Math.pow(2, Math.max(1, Number(tries) || 1))) * 60000; }

// ================================================================ payload: ячейка или файл на Диске
function ob_dir_() {
  var c = CacheService.getScriptCache(), id = ''; try { id = c.get('ob:dir') || ''; } catch (e) { id = ''; }
  if (id) { try { return DriveApp.getFolderById(id); } catch (e1) { id = ''; } }
  var f = DriveApp.getRootFolder();
  for (var i = 0; i < OB_DIR.length; i++) { var it = f.getFoldersByName(OB_DIR[i]); f = it.hasNext() ? it.next() : f.createFolder(OB_DIR[i]); }
  try { c.put('ob:dir', f.getId(), 21600); } catch (e2) { /* кэш не обязателен */ }
  return f;
}
function ob_fileName_(key) { return String(key).replace(/[\/\\]/g, '_').slice(0, 120) + '.json'; }
/** JSON payload → строка ячейки; длиннее OB_PAYLOAD_MAX — файл «Фабрика — боты/outbox/<key>.json» (перезапись того же файла), в ячейке ссылка. */
function ob_payloadStore_(key, payload) {
  var s = JSON.stringify(payload === undefined ? null : payload);
  if (s.length <= OB_PAYLOAD_MAX) return s;
  var dir = ob_dir_(), name = ob_fileName_(key), it = dir.getFilesByName(name), f = it.hasNext() ? it.next() : null;
  if (f) f.setContent(s); else f = dir.createFile(name, s, 'application/json');
  return JSON.stringify({ __file: f.getId(), len: s.length });
}
function ob_payloadLoad_(raw) {
  if (raw === '' || raw == null) return null;
  var v; try { v = JSON.parse(raw); } catch (e) { return String(raw); }
  if (v && typeof v === 'object' && typeof v.__file === 'string') {
    try { return JSON.parse(DriveApp.getFileById(v.__file).getBlob().getDataAsString()); } catch (e1) { console.log('ob_payload: файл недоступен: ' + ob_err_(e1)); return null; }
  }
  return v;
}
function ob_payloadDrop_(raw) {
  try { var v = JSON.parse(raw); if (v && typeof v === 'object' && typeof v.__file === 'string') DriveApp.getFileById(v.__file).setTrashed(true); } catch (e) { /* файла уже нет */ }
}

// ================================================================ техтревога владельцу (одна, через функцию проекта ob_alert_, если есть)
function ob_alertFn_() { return typeof ob_alert_ === 'function' ? ob_alert_ : null; }
/** Одна тревога (не чаще раза в OB_ALERT_TTL): list = [{key, kind, status, err, tries}]. Текст маскируется. → true — передана функции проекта. */
function ob_alertOnce_(list) {
  if (!list || !list.length) return false;
  try {
    var c = CacheService.getScriptCache();
    if (c.get('ob:alert') === '1') { console.log('ob_alert: отложено (не чаще раза в час), операций ' + list.length); return false; }
    c.put('ob:alert', '1', OB_ALERT_TTL);
  } catch (e) { /* без кэша — шлём */ }
  var st = ob_status(), L = list.slice(0, 5).map(function (a) { return '• ' + a.status + ' ' + a.kind + ' ' + a.key + (a.tries ? ' (попыток ' + a.tries + ')' : '') + (a.err ? ' — ' + a.err : ''); });
  var text = ob_mask_('⚠️ Исходящие бота (' + ob_bot_() + '): не доставлено ' + list.length + (list.length > 5 ? ', первые 5' : '') + ':\n' + L.join('\n') +
    '\nЛист ob_out: dead ' + st.dead + ', uncertain ' + st.uncertain + ', ждут повтора ' + (st.pending + st.failed) + '. Повторить вручную: ob_retry(\'<key>\') в редакторе проекта.');
  var fn = ob_alertFn_();
  if (fn) { try { fn(text); return true; } catch (e1) { console.log('ob_alert: функция проекта: ' + ob_err_(e1)); } }
  console.log(text);
  return false;
}

// ================================================================ публичное (контракт)
/** Положить операцию: key — '<операция>:<адресат>' (идемпотентно: повтор того же key второй операции не создаёт), kind — вид для обработчика
    (handlers[kind] в ob_runner), target — адресат (строка, для листа), payload — что доставить (любой JSON; длинное — файл на Диске).
    → {ok, dup, status, tries, result?}: dup=true — операция уже была, status/result — её текущее состояние (новый payload при повторе НЕ записывается).
    ok=false: status 'off' (MODE не google), 'bad' (нет key/kind), 'busy' (замок занят — повторить позже; ничего не записано). */
function ob_put(key, kind, target, payload) {
  key = ob_key_(key); kind = String(kind == null ? '' : kind).trim().slice(0, 40); target = String(target == null ? '' : target).replace(/[\r\n]+/g, ' ').slice(0, 200);
  if (!ob_mode_()) return { ok: false, dup: false, status: 'off', err: 'MODE не google' };
  if (!key || !kind) return { ok: false, dup: false, status: 'bad', err: 'нужны key и kind' };
  var sh = ob_sheet_(), now = Date.now();
  return ob_lock_(function () {
    var row = ob_findRow_(sh, key);
    if (row) { var rec = ob_readRow_(sh, row); return { ok: true, dup: true, status: rec.status, tries: rec.tries, result: ob_parse_(rec.resultRaw) }; }
    var raw = ob_payloadStore_(key, payload);
    sh.appendRow([key, kind, target, raw, 'pending', 0, new Date(now), '', new Date(now), new Date(now), '']);
    ob_idle_(false);
    return { ok: true, dup: false, status: 'pending', tries: 0 };
  }, { ok: false, dup: false, status: 'busy', err: 'замок занят — повторите' });
}
/** Отметить исход по ключу (под замком, строка ищется заново): status — sent (result — mid и т. п.) | failed (повтор через 2^tries мин; после
    OB_MAX_TRIES попыток → dead) | dead (постоянная ошибка) | uncertain (неизвестно, дошло ли — без автоповтора) | pending (вернуть в очередь сейчас).
    err — в last_err (маскируется). sent — окончательно: другой статус поверх sent не ставится. → {ok, status, tries, next_at}. */
function ob_mark(key, status, result, err) {
  key = ob_key_(key); status = String(status == null ? '' : status).trim().toLowerCase();
  if (!ob_mode_()) return { ok: false, status: 'off', err: 'MODE не google' };
  if (!key || !OB_STATUSES[status]) return { ok: false, status: 'bad', err: 'нужны key и статус pending|sent|failed|dead|uncertain' };
  var sh = ob_sheet_(), now = Date.now(), alert = null;
  var out = ob_lock_(function () {
    var row = ob_findRow_(sh, key); if (!row) return { ok: false, status: 'none', err: 'операции нет: ' + key };
    var rec = ob_readRow_(sh, row);
    if (rec.status === 'sent' && status !== 'sent') return { ok: false, status: 'sent', err: 'уже отправлено', tries: rec.tries, result: ob_parse_(rec.resultRaw) };
    var st = status, nb = 0, vals;
    if (st === 'failed') { if (rec.tries >= OB_MAX_TRIES) st = 'dead'; else nb = now + ob_backoff_(rec.tries); }
    if (st === 'pending') nb = now;
    vals = { status: st, next_at: nb, updated: now };
    if (err != null && err !== '') vals.last_err = ob_mask_(ob_err_(err));
    if (result != null) vals.result = JSON.stringify(result).slice(0, OB_RESULT_MAX);
    ob_writeRow_(sh, rec, vals);
    if (st === 'dead' || st === 'uncertain') alert = { key: key, kind: rec.kind, status: st, err: vals.last_err || rec.last_err, tries: rec.tries };
    if (st === 'pending' || st === 'failed') ob_idle_(false);
    return { ok: true, status: st, tries: rec.tries, next_at: nb };
  }, { ok: false, status: 'busy', err: 'замок занят — повторите' });
  if (alert) ob_alertOnce_([alert]);
  return out;
}
/** Операции к доставке: pending/failed с next_at ≤ nowMs и kind из kinds (пустой список — все), по created, не больше limit (≤ 20).
    Каждая берётся «в работу»: tries+1, next_at = now + OB_LEASE_MS — параллельный раннер её не возьмёт; упавший раннер → повтор после аренды.
    Операции с tries ≥ OB_MAX_TRIES → dead + одна техтревога. → [{key, kind, target, payload, tries, created}] (tries — номер этой попытки). */
function ob_due(kinds, limit, nowMs) {
  if (!ob_mode_()) return [];
  if (ob_idle_()) return [];
  var now = Number(nowMs) || Date.now(), lim = Math.max(1, Math.min(OB_DUE_MAX, Number(limit) || OB_DUE_MAX)), K = null;
  if (Array.isArray(kinds) && kinds.length) { K = {}; kinds.forEach(function (k) { K[String(k)] = 1; }); }
  var sh = ob_sheet_(), dead = [];
  var out = ob_lock_(function () {
    var R = ob_rows_(sh), live = 0, due = [], items = [], i;
    for (i = 0; i < R.length; i++) {
      var r = R[i]; if (r.status !== 'pending' && r.status !== 'failed') continue;
      if (r.tries >= OB_MAX_TRIES && r.next_at <= now) {                       // исчерпано (раннер упал после последней попытки) → dead, видно и тревога
        ob_writeRow_(sh, r, { status: 'dead', next_at: 0, updated: now, last_err: r.last_err || 'попыток ' + r.tries });
        dead.push({ key: r.key, kind: r.kind, status: 'dead', err: r.last_err, tries: r.tries }); continue;
      }
      live++;
      if (r.next_at > now) continue;
      if (K && !K[r.kind]) continue;
      due.push(r);
    }
    if (!live) ob_idle_(true);
    due.sort(function (a, b) { return (a.created - b.created) || (a.row - b.row); });
    due = due.slice(0, lim);
    for (i = 0; i < due.length; i++) {
      var d = due[i];
      ob_writeRow_(sh, d, { tries: d.tries + 1, next_at: now + OB_LEASE_MS, updated: now });
      items.push({ key: d.key, kind: d.kind, target: d.target, payload: ob_payloadLoad_(d.payloadRaw), tries: d.tries + 1, created: d.created });
    }
    return items;
  }, []);
  if (dead.length) ob_alertOnce_(dead);
  return out;
}
/** Запись по ключу → {key, kind, target, payload, status, tries, next_at, last_err, created, updated, result} | null. */
function ob_get(key) {
  key = ob_key_(key); if (!ob_mode_() || !key) return null;
  var sh = ob_sheet_(), row = ob_findRow_(sh, key); if (!row) return null;
  var r = ob_readRow_(sh, row);
  return { key: r.key, kind: r.kind, target: r.target, payload: ob_payloadLoad_(r.payloadRaw), status: r.status, tries: r.tries, next_at: r.next_at, last_err: r.last_err, created: r.created, updated: r.updated, result: ob_parse_(r.resultRaw) };
}
/** Исход обработчика → {status: sent|retry|permanent|uncertain, result, err}. Принимаются true/false и синонимы; неизвестное → retry. */
function ob_normRes_(res) {
  if (res === true) return { status: 'sent' };
  if (!res || typeof res !== 'object') return { status: 'retry', err: 'обработчик вернул ' + String(res) };
  var s = String(res.status || res.state || '').toLowerCase(), map = { sent: 'sent', ok: 'sent', done: 'sent', retry: 'retry', failed: 'retry', fail: 'retry', temp: 'retry', permanent: 'permanent', dead: 'permanent', bad: 'permanent', uncertain: 'uncertain', unknown: 'uncertain' };
  if (!map[s]) return { status: 'retry', result: res.result, err: 'обработчик: статус «' + s + '»' + (res.err ? '; ' + String(res.err) : '') };
  return { status: map[s], result: res.result, err: res.err };
}
/** Доставка всего, что созрело, обработчиками handlers = {kind: function(item) → {status:'sent'|'retry'|'permanent'|'uncertain', result?, err?}}
    в пределах budgetMs (минутный тик: MAX — mx_tick/tm_tickMinute, Telegram — g4_tick_/триггер cp_flush). Исключение обработчика → retry.
    Не уложились в бюджет — взятые, но не обработанные операции возвращаются в очередь (попытка не засчитывается).
    → {n (обработано), sent, retry, dead, uncertain, left, ms}. */
function ob_runner(handlers, budgetMs) {
  var t0 = Date.now(), out = { n: 0, sent: 0, retry: 0, dead: 0, uncertain: 0, left: 0, ms: 0 };
  if (!ob_mode_() || !handlers || typeof handlers !== 'object') return out;
  var kinds = Object.keys(handlers).filter(function (k) { return typeof handlers[k] === 'function'; });
  if (!kinds.length) return out;
  var budget = Math.max(1000, Number(budgetMs) || 30000), rounds = 0;
  while (Date.now() - t0 < budget && rounds++ < 10) {
    var items = ob_due(kinds, OB_RUN_BATCH, Date.now());
    if (!items.length) break;
    for (var i = 0; i < items.length; i++) {
      if (Date.now() - t0 >= budget) { out.left += items.length - i; ob_release_(items.slice(i)); out.ms = Date.now() - t0; return out; }
      var it = items[i], res;
      try { res = handlers[it.kind](it); } catch (e) { res = { status: 'retry', err: 'обработчик: ' + ob_err_(e) }; }
      res = ob_normRes_(res);
      var m = ob_mark(it.key, res.status === 'sent' ? 'sent' : res.status === 'retry' ? 'failed' : res.status === 'permanent' ? 'dead' : 'uncertain', res.result, res.err);
      out.n++;
      var st = (m && m.ok) ? m.status : res.status;
      if (st === 'sent') out.sent++; else if (st === 'dead' || st === 'permanent') out.dead++; else if (st === 'uncertain') out.uncertain++; else out.retry++;
    }
    if (items.length < OB_RUN_BATCH) break;
  }
  try { ob_compactMaybe_(); } catch (e2) { console.log('ob_compact: ' + ob_err_(e2)); }
  out.ms = Date.now() - t0;
  return out;
}

// ================================================================ обслуживание (редактор / тик)
/** Вернуть взятые, но не обработанные операции (бюджет): tries−1, next_at = сейчас. */
function ob_release_(items) {
  if (!items || !items.length) return;
  var sh = ob_sheet_(), now = Date.now();
  ob_lock_(function () {
    items.forEach(function (it) { var row = ob_findRow_(sh, it.key); if (!row) return; var rec = ob_readRow_(sh, row); if (rec.status === 'pending' || rec.status === 'failed') ob_writeRow_(sh, rec, { tries: Math.max(0, rec.tries - 1), next_at: now, updated: now }); });
    ob_idle_(false);
  }, null);
}
/** Вручную (редактор) или из тревоги: вернуть операцию в очередь (dead/uncertain/failed → pending, tries 0). → {ok, status}. */
function ob_retry(key) {
  key = ob_key_(key); if (!ob_mode_() || !key) return { ok: false, status: 'bad' };
  var sh = ob_sheet_(), now = Date.now();
  return ob_lock_(function () {
    var row = ob_findRow_(sh, key); if (!row) return { ok: false, status: 'none', err: 'операции нет: ' + key };
    var rec = ob_readRow_(sh, row); if (rec.status === 'sent') return { ok: false, status: 'sent', err: 'уже отправлено' };
    ob_writeRow_(sh, rec, { status: 'pending', tries: 0, next_at: now, updated: now, last_err: rec.last_err ? 'повтор вручную; было: ' + rec.last_err.slice(0, 200) : '' });
    ob_idle_(false);
    return { ok: true, status: 'pending' };
  }, { ok: false, status: 'busy' });
}
/** Состояние для диагностики (без секретов): {mode, rows, pending, failed, sent, dead, uncertain, due}. */
function ob_status() {
  var out = { mode: ob_mode_(), rows: 0, pending: 0, failed: 0, sent: 0, dead: 0, uncertain: 0, due: 0 };
  if (!out.mode) return out;
  try {
    var R = ob_rows_(ob_sheet_()), now = Date.now();
    out.rows = R.length;
    R.forEach(function (r) { if (out[r.status] !== undefined) out[r.status]++; if ((r.status === 'pending' || r.status === 'failed') && r.next_at <= now) out.due++; });
  } catch (e) { out.err = ob_err_(e); }
  return out;
}
/** Сотрудник4 F4 (tm_status, откат): счётчики без взятия записей в работу — то же, что ob_status(). */
function ob_stats() { return ob_status(); }
/** Компакция (под замком, по ключам из свежего чтения): sent старше OB_KEEP_SENT_DAYS и dead/uncertain старше OB_KEEP_DEAD_DAYS удаляются
    (снизу вверх), их файлы payload — в корзину. pending/failed не трогаются. → число удалённых строк. */
function ob_compact(nowMs) {
  if (!ob_mode_()) return 0;
  var now = Number(nowMs) || Date.now(), sh = ob_sheet_();
  return ob_lock_(function () {
    var R = ob_rows_(sh), n = 0;
    for (var i = R.length - 1; i >= 0; i--) {
      var r = R[i], age = now - (r.updated || r.created || now), old = r.status === 'sent' ? age > OB_KEEP_SENT_DAYS * 86400000 : (r.status === 'dead' || r.status === 'uncertain') ? age > OB_KEEP_DEAD_DAYS * 86400000 : false;
      if (!old) continue;
      if (String(sh.getRange(r.row, 1).getValue()) !== r.key) continue;    // перепроверка ключа перед удалением
      ob_payloadDrop_(r.payloadRaw); sh.deleteRow(r.row); n++;
    }
    return n;
  }, 0);
}
/** Компакция не чаще раза в OB_COMPACT_TTL и только когда строк больше OB_COMPACT_MIN_ROWS (зовёт ob_runner). */
function ob_compactMaybe_() {
  var c = null; try { c = CacheService.getScriptCache(); if (c.get('ob:compact') === '1') return 0; c.put('ob:compact', '1', OB_COMPACT_TTL); } catch (e) { /* без кэша — всё равно проверим */ }
  if (ob_sheet_().getLastRow() - 1 < OB_COMPACT_MIN_ROWS) return 0;
  return ob_compact(Date.now());
}
