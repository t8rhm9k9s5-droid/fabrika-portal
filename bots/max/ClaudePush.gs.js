/* «Фабрика» — общий модуль ClaudePush.gs (шаг 5 ночи 05.11.2026): команда из бота — мгновенно к Claude (push).
   Т. В. 04.11 ~18:50: «Из бота команда моментально поступает сюда, если она неизвестна боту … Есть команда — работаем. Нет команды — не работаем.»
   Один и тот же файл в обоих проектах Apps Script 1c@ (Telegram «Фабрика — уведомления», MAX «Фабрика — бот MAX»). Префикс cp_.
   Зависимости — только службы Google (PropertiesService, CacheService, SpreadsheetApp, UrlFetchApp, LockService, Utilities) и свойства.

   Куда шлём: запуск запланированной задачи Claude «Фабрика — команда из бота (push)» —
   POST <CLAUDE_FIRE_URL> (…/v1/claude_code/routines/<trig_…>/fire), заголовки Authorization: Bearer <CLAUDE_FIRE_TOKEN>,
   anthropic-version: 2026-10-21, Content-Type: application/json; тело {"text": "…"} (≤ 65 536 знаков у Anthropic, у нас ≤ 60 000).
   Ответ 200 {"type":"routine_fire","claude_code_session_id":…}; 429 — лимит (30 запусков/час на задачу, 100/час на аккаунт), Retry-After;
   400 — в т. ч. задача приостановлена; 5xx/503 — повтор. Идемпотентности на стороне Anthropic нет — свой журнал id (лист cp_log).
   Документация: platform.claude.com/docs/en/api/claude-code/routines-fire (проверена 05.11.2026).

   Свойства скрипта: MODE ('google' — включено; иначе cp_push/cp_flush ничего не делают), CLAUDE_FIRE_URL, CLAUDE_FIRE_TOKEN (нет —
   cp_enabled()=false: события копятся в буфере, в сеть ничего не идёт), SVC_SHEET_ID (служебная таблица; нет — создаётся
   «Фабрика — <бот> — служебная», id пишется в свойство), BOT_NAME (необязательно — имя бота для названия таблицы).
   Листы: cp_buf (буфер событий: id, t, src, who, chat, tries, not_before, ev), cp_log (журнал событий: id, t, src, status, info —
   последние 2 000 строк), cp_runs (журнал запусков: t, events, http, ms, info — для лимита 25/час скользящий), cp_dead (недоставленные:
   id, t, src, who, chat, tries, why, ev — для разбора; cp_retryDead(id) возвращает в буфер).
   Триггер: cp_flush() раз в минуту — регистрируют tm_setupTriggers (MAX) и g4_setupTriggers (Telegram); сам модуль триггеров не ставит.
   Токен и адрес в журналы не пишутся; в cp_log нет текстов сообщений, почт и телефонов (кто/чат — только в буфере до отправки).

   Исправления по отчёту ChatGPT 05.11 (C-A1, C-A2):
   - cp_push: сначала долговечная запись в cp_buf, лишь затем отметка «id принят» (кэш/журнал); запись не удалась → false, отметки нет — повтор
     вебхука/Outbox запишет событие. Замок не получен за 2 с → только буфер (без отправки сразу), событие не теряется; дубли буфера снимает cp_flush.
     true = событие долговечно (отправлено или в буфере), false = не принято. Статусы cp_log: buf | sent | dup | buf-off | uncertain | fail | dead | err.
   - Сетевое исключение (ответа нет) — исход неизвестен: статус uncertain, повтор по not_before. Повтор БЕЗВРЕДЕН: Claude дедуплицирует по строке id=…
     в каждом событии пачки (контракт FABRIKA-PUSH v1), поэтому возможный дубль запуска не даёт второго действия.
   - Исчерпанные события (6 попыток / старше 6 ч / битые) не удаляются молча: строка переносится в лист cp_dead, cp_log 'dead', одна техтревога
     владельцу (функция проекта ob_alert_, если определена; не чаще раза в час). Возврат в очередь — cp_retryDead(id) из редактора.
   - Лимит запусков в час — свойство CP_HOUR_LIMIT (нет — 25). Если ОБА проекта запускают одну задачу Claude (30/час на задачу), в каждом ставить 15;
     превышение и так безопасно: 429 → пауза Retry-After, события ждут в буфере.
   - cp_flush не держит замок во время сети: под замком берёт пачки в работу (not_before = аренда 4 мин), шлёт без замка, итог отмечает под замком по id. */

var CP_API_VERSION = '2026-10-21';
var CP_HOUR_LIMIT = 25;                           // запусков в скользящий час (у Anthropic 30 на задачу) — считаются все попытки, дошедшие до сервера
var CP_BATCH_MAX = 60000;                         // знаков текста одного запуска
var CP_EVENT_TEXT_MAX = 12000;                    // знаков текста одного события; контекст — ещё до CP_CTX_MAX
var CP_CTX_MAX = 6000;
var CP_CTX_LINES = 10;
var CP_FLUSH_MAX_RUNS = 5;                        // запусков за один cp_flush (триггер раз в минуту)
var CP_FLUSH_BUDGET_MS = 200000;                  // cp_flush не дольше ~3,5 мин (предел Google 6 мин)
var CP_WEBHOOK_BUDGET_MS = 2500;                  // в вебхуке: если до отправки прошло больше — только буфер (всё cp_push ≤ 5 с)
var CP_BUF_MAX_AGE_MS = 6 * 3600000;              // событие старше — не слать (drop)
var CP_MAX_TRIES = 6;
var CP_LOG_KEEP = 2000, CP_RUNS_KEEP = 500, CP_DEAD_KEEP = 500;
var CP_SEEN_TTL = 21600;                          // кэш «id уже принят», секунд
var CP_CLAIM_MS = 240000;                         // cp_flush: взятые в работу события не берёт параллельный cp_flush 4 мин (упал — повтор после)
var CP_ALERT_TTL = 3600;                          // техтревога владельцу о недоставленных — не чаще раза в час
var CP_SRC = { tg: 1, max: 1, mail: 1, group: 1 };
var CP_SHEETS = {
  cp_buf: ['id', 't', 'src', 'who', 'chat', 'tries', 'not_before', 'ev'],
  cp_log: ['id', 't', 'src', 'status', 'info'],
  cp_runs: ['t', 'events', 'http', 'ms', 'info'],
  cp_dead: ['id', 't', 'src', 'who', 'chat', 'tries', 'why', 'ev']
};
var CP_SS_MEMO = null;

// ================================================================ свойства и служебная таблица
function cp_props_() { return PropertiesService.getScriptProperties(); }
function cp_prop_(k) { return String(cp_props_().getProperty(k) || '').trim(); }
function cp_mode_() { return cp_prop_('MODE') === 'google'; }
/** Есть адрес и токен запуска (значения не возвращаются). */
function cp_enabled() { return /^https:\/\//.test(cp_prop_('CLAUDE_FIRE_URL')) && cp_prop_('CLAUDE_FIRE_TOKEN').length > 0; }
/** Имя бота для названия служебной таблицы: BOT_NAME, иначе по наличию токенов проекта. */
function cp_botName_() {
  var n = cp_prop_('BOT_NAME'); if (n) return n;
  if (cp_prop_('TG_TOKEN')) return 'Telegram';
  if (cp_prop_('MAX_TOKEN')) return 'MAX';
  return 'бот';
}
/** id служебной таблицы: свойство SVC_SHEET_ID; в проекте MAX без свойства — таблица Store.gs (SS_ID «Фабрика — боты»: иначе модуль создал бы новую
    таблицу и записал её id в SVC_SHEET_ID, а st_ssId() переключил бы на пустую таблицу всю очередь, группы и настройки ядра — проверка 1, 05.11);
    иначе — создать «Фабрика — <бот> — служебная» и записать id (под замком). */
function cp_sheetId_() {
  var id = cp_prop_('SVC_SHEET_ID'); if (id) return id;
  if (typeof SS_ID === 'string' && /^[\w-]{20,}$/.test(SS_ID)) return SS_ID;   // проект MAX: та же таблица, что у Store.gs (свойство не пишем — st_ssId сам берёт SS_ID)
  var lock = LockService.getScriptLock(), got = lock.tryLock(10000);
  try {
    id = cp_prop_('SVC_SHEET_ID'); if (id) return id;
    var ss = SpreadsheetApp.create('Фабрика — ' + cp_botName_() + ' — служебная');
    id = ss.getId(); cp_props_().setProperty('SVC_SHEET_ID', id);
    return id;
  } finally { if (got) lock.releaseLock(); }
}
function cp_ss_() { if (!CP_SS_MEMO) CP_SS_MEMO = SpreadsheetApp.openById(cp_sheetId_()); return CP_SS_MEMO; }
/** Лист по имени (создаётся с заголовком). */
function cp_sheet_(name) {
  var ss = cp_ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(CP_SHEETS[name]); }
  else if (sh.getLastRow() === 0) sh.appendRow(CP_SHEETS[name]);
  return sh;
}
function cp_cell_(v) { v = v == null ? '' : v; if (typeof v === 'object' && !(v instanceof Date)) v = JSON.stringify(v); v = String(v); return v.length > 49000 ? v.slice(0, 49000) : v; }
/** Почты, телефоны, адреса сети, сам токен и адрес запуска в строке → заглушки (для журналов). */
function cp_mask_(s) {
  s = String(s == null ? '' : s);
  var tk = cp_prop_('CLAUDE_FIRE_TOKEN'), url = cp_prop_('CLAUDE_FIRE_URL');
  if (tk) s = s.split(tk).join('[токен]');                      // на случай, если токен попал в текст исключения или ответа
  if (url) s = s.split(url).join('[адрес]');
  return s
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[почта]')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]')
    .replace(/(^|[^\d])(\+?\d[\d\s()\-]{8,}\d)(?!\d)/g, '$1[телефон]')
    .replace(/sk-ant-[\w-]+|trig_[\w-]+/g, '[токен]');
}
/** Строка в cp_log (без текстов и персональных данных); ротация до CP_LOG_KEEP. Никогда не бросает исключение. */
function cp_logRow_(id, src, status, info) {
  try {
    var sh = cp_sheet_('cp_log');
    sh.appendRow([cp_cell_(id), new Date(), cp_cell_(src), cp_cell_(status), cp_cell_(cp_mask_(info || '').slice(0, 300))]);
    var n = sh.getLastRow(); if (n > CP_LOG_KEEP + 200) sh.deleteRows(2, n - 1 - CP_LOG_KEEP);
  } catch (e) { console.log('cp_log: ' + (e && e.message || e)); }
}
/** Строка в cp_runs (одна попытка запуска); ротация. */
function cp_runRow_(events, http, ms, info) {
  try {
    var sh = cp_sheet_('cp_runs');
    sh.appendRow([new Date(), Number(events) || 0, Number(http) || 0, Number(ms) || 0, cp_cell_(cp_mask_(info || '').slice(0, 300))]);
    var n = sh.getLastRow(); if (n > CP_RUNS_KEEP + 100) sh.deleteRows(2, n - 1 - CP_RUNS_KEEP);
  } catch (e) { console.log('cp_runs: ' + (e && e.message || e)); }
}
/** Сколько попыток запуска было за последний час (по cp_runs; считаются попытки, дошедшие до сервера: http ≠ 0). */
function cp_runsLastHour_(nowMs) {
  var sh = cp_sheet_('cp_runs'), n = sh.getLastRow(); if (n < 2) return 0;
  var from = Math.max(2, n - 199), V = sh.getRange(from, 1, n - from + 1, 3).getValues(), c = 0, lim = nowMs - 3600000;
  for (var i = 0; i < V.length; i++) { var t = V[i][0] instanceof Date ? V[i][0].getTime() : new Date(V[i][0]).getTime(); if (t >= lim && Number(V[i][2]) !== 0) c++; }
  return c;
}
function cp_backoffUntil_() { try { return Number(CacheService.getScriptCache().get('cp:backoff') || 0); } catch (e) { return 0; } }
/** Пауза после 429 (Retry-After: секунды или HTTP-дата; нет — 120 с). */
function cp_backoff_(retryAfter, nowMs) {
  var sec = 120, v = String(retryAfter || '').trim();
  if (/^\d+$/.test(v)) sec = Number(v); else if (v) { var d = new Date(v).getTime(); if (!isNaN(d)) sec = Math.round((d - nowMs) / 1000); }
  sec = Math.max(30, Math.min(3600, sec || 120));
  try { CacheService.getScriptCache().put('cp:backoff', String(nowMs + sec * 1000), sec); } catch (e) { /* кэш не обязателен */ }
  return sec;
}
/** Лимит запусков в скользящий час: свойство CP_HOUR_LIMIT (1…30), нет — CP_HOUR_LIMIT (25). Одна задача Claude на оба проекта → по 15 в каждом. */
function cp_hourLimit_() { var n = Number(cp_prop_('CP_HOUR_LIMIT')); return n >= 1 && n <= 30 ? Math.floor(n) : CP_HOUR_LIMIT; }
/** Можно ли сделать ещё k запусков сейчас. */
function cp_canSend_(k, nowMs) { return cp_backoffUntil_() <= nowMs && cp_runsLastHour_(nowMs) + k <= cp_hourLimit_(); }

// ================================================================ события
function cp_line_(s, max) { return String(s == null ? '' : s).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 200); }
function cp_hash_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.newBlob(String(s)).getBytes()).slice(0, 8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
/** Проверить и нормализовать событие → {src, who, chat, id, text, ctx} | null. id нет — считается от содержимого. */
function cp_norm_(ev) {
  if (!ev || typeof ev !== 'object') return null;
  var src = cp_line_(ev.src, 10).toLowerCase(); if (!CP_SRC[src]) return null;
  var text = String(ev.text == null ? '' : ev.text).replace(/\r\n?/g, '\n').trim();
  var ctx = Array.isArray(ev.ctx) ? ev.ctx.filter(function (x) { return x != null && String(x).trim(); }).slice(-CP_CTX_LINES).map(function (x) { return cp_line_(x, 500); }) : [];
  if (!text && !ctx.length) return null;
  var who = cp_line_(ev.who), chat = cp_line_(ev.chat);
  var id = cp_line_(ev.id, 120) || ('h' + cp_hash_(src + '|' + who + '|' + chat + '|' + text));
  return { src: src, who: who, chat: chat, id: id, text: text.length > CP_EVENT_TEXT_MAX ? text.slice(0, CP_EVENT_TEXT_MAX) + '…' : text, ctx: ctx };
}
/** Текст одного события в пачке (без служебной строки). Строки «-----» и «FABRIKA-PUSH» внутри текста обезвреживаются. */
function cp_eventText_(e) {
  var body = e.text.split('\n').map(function (l) { return /^-{5,}\s*$/.test(l) ? '— — —' : /^FABRIKA-PUSH/.test(l) ? '·' + l : l; }).join('\n');
  if (e.ctx && e.ctx.length) {
    var c = '', i; for (i = 0; i < e.ctx.length && c.length < CP_CTX_MAX; i++) c += '• ' + e.ctx[i].replace(/^-{5,}\s*$/, '— — —') + '\n';
    body += (body ? '\n\n' : '') + '[контекст: последние сообщения]\n' + c.replace(/\n$/, '');
  }
  return 'src=' + e.src + '\nwho=' + e.who + '\nchat=' + e.chat + '\nid=' + e.id + '\n\n' + body;
}
/** Текст пачки: FABRIKA-PUSH v1, события через «-----». */
function cp_batchText_(events) { return 'FABRIKA-PUSH v1\n' + events.map(cp_eventText_).join('\n-----\n'); }
/** Отправить пачку → {ok, code, ms, info, retryAfter}. Исключение сети → code 0. Токен в info не попадает. */
function cp_send_(events) {
  var t0 = Date.now(), text = cp_batchText_(events);
  try {
    var r = UrlFetchApp.fetch(cp_prop_('CLAUDE_FIRE_URL'), {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true, followRedirects: false,
      headers: { Authorization: 'Bearer ' + cp_prop_('CLAUDE_FIRE_TOKEN'), 'anthropic-version': CP_API_VERSION },
      payload: JSON.stringify({ text: text })
    });
    var code = r.getResponseCode(), ms = Date.now() - t0, body = String(r.getContentText() || ''), info = '', ra = '';
    if (code >= 200 && code < 300) { try { info = 'session ' + (JSON.parse(body).claude_code_session_id || '?'); } catch (e1) { info = 'ok'; } }
    else {
      try { var j = JSON.parse(body); info = (j.error && (j.error.type + ': ' + j.error.message)) || body.slice(0, 200); } catch (e2) { info = body.slice(0, 200); }
      if (code === 429) { var H = r.getAllHeaders ? r.getAllHeaders() : (r.getHeaders ? r.getHeaders() : {}); for (var k in H) if (String(k).toLowerCase() === 'retry-after') ra = String(H[k]); }
    }
    return { ok: code >= 200 && code < 300, code: code, ms: ms, info: cp_mask_(info).slice(0, 200), retryAfter: ra };
  } catch (e) { return { ok: false, code: 0, ms: Date.now() - t0, info: cp_mask_(String(e && e.message || e)).slice(0, 200), retryAfter: '' }; }
}

// ================================================================ дедупликация и буфер
/** id уже принимали? (кэш, затем cp_log по первому столбцу — каждое ПРИНЯТОЕ событие там есть: buf/sent/buf-off/uncertain/dead;
    строки 'fail' (буфер не записался) принятием не считаются — повтор запишет событие; C-A1) */
function cp_seen_(id) {
  try { if (CacheService.getScriptCache().get('cp:id:' + id)) return true; } catch (e) { /* без кэша — по листу */ }
  var sh = cp_sheet_('cp_log'), n = sh.getLastRow(); if (n < 2) return false;
  var hits = sh.getRange(2, 1, n - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findAll();
  for (var i = 0; i < hits.length; i++) if (String(sh.getRange(hits[i].getRow(), 4).getValue()) !== 'fail') return true;
  return false;
}
function cp_markSeen_(id) { try { CacheService.getScriptCache().put('cp:id:' + id, '1', CP_SEEN_TTL); } catch (e) { /* кэш не обязателен */ } }
/** Номер строки с id в первом столбце листа (0 — нет). */
function cp_findRow_(name, id) {
  var sh = cp_sheet_(name), n = sh.getLastRow(); if (n < 2) return 0;
  var f = sh.getRange(2, 1, n - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return f ? f.getRow() : 0;
}
/** В буфер. nb — not_before (мс): событие, которое сейчас шлём сами, помечается «в полёте» на 2 мин, чтобы параллельный cp_flush его не взял. */
function cp_bufAdd_(e, nowMs, nb) {
  cp_sheet_('cp_buf').appendRow([cp_cell_(e.id), new Date(nowMs), e.src, cp_cell_(e.who), cp_cell_(e.chat), 0, nb || 0, cp_cell_(JSON.stringify(e))]);
  try { CacheService.getScriptCache().remove('cp:empty'); } catch (e0) { /* кэш не обязателен */ }   // буфер не пуст — минутный cp_flush откроет таблицу
}
/** Флаг «буфер пуст» (CacheService, ≤ 6 ч): пустой минутный тик cp_flush выходит, не открывая таблицу (экономия квоты триггеров; проверка 2, 05.11).
    Флаг снимает cp_bufAdd_; без кэша — таблица читается как раньше. */
function cp_bufEmptyFlag_() { try { return CacheService.getScriptCache().get('cp:empty') === '1'; } catch (e) { return false; } }
function cp_bufEmptySet_() { try { CacheService.getScriptCache().put('cp:empty', '1', CP_SEEN_TTL); } catch (e) { /* кэш не обязателен */ } }
/** Все строки буфера → [{row, id, t, src, tries, nb, ev}] (битые строки пропускаются и удаляются при flush). */
function cp_bufRead_() {
  var sh = cp_sheet_('cp_buf'), n = sh.getLastRow(), out = []; if (n < 2) return out;
  var V = sh.getRange(2, 1, n - 1, 8).getValues();
  for (var i = 0; i < V.length; i++) {
    var raw = String(V[i][7] || ''), ev = null; try { ev = JSON.parse(raw); } catch (e) { ev = null; }
    var t = V[i][1] instanceof Date ? V[i][1].getTime() : new Date(V[i][1]).getTime();
    out.push({ row: i + 2, id: String(V[i][0]), t: isNaN(t) ? 0 : t, src: String(V[i][2]), tries: Number(V[i][5]) || 0, nb: Number(V[i][6]) || 0, ev: ev && typeof ev === 'object' ? ev : null, raw: raw });
  }
  return out;
}
/** Удалить строки буфера по id (снизу вверх, каждый раз ищем заново — буфер могли дописать). */
function cp_bufDel_(ids) {
  var sh = cp_sheet_('cp_buf');
  for (var i = 0; i < ids.length; i++) { var r = cp_findRow_('cp_buf', ids[i]); if (r > 1) sh.deleteRow(r); }
}
/** Отметить попытку: tries+1, not_before = now + 2^tries мин (≤ 60), для 4xx — 30 мин. */
function cp_bufRetry_(items, nowMs, code) {
  var sh = cp_sheet_('cp_buf');
  for (var i = 0; i < items.length; i++) {
    var r = cp_findRow_('cp_buf', items[i].id); if (r < 2) continue;
    var tries = items[i].tries + 1, min = code >= 400 && code < 500 ? 30 : Math.min(60, Math.pow(2, tries));
    sh.getRange(r, 6, 1, 2).setValues([[tries, nowMs + min * 60000]]);
  }
}
/** Удалить строки буфера по номерам (снизу вверх). Только под замком cp_flush сразу после cp_bufRead_: cp_push лишь дописывает строки
    (номера существующих не сдвигаются), другие удаления — только здесь. */
function cp_bufDelRows_(rowsArr) {
  var sh = cp_sheet_('cp_buf'), R = rowsArr.slice().sort(function (a, b) { return b - a; });
  for (var i = 0; i < R.length; i++) if (R[i] > 1) sh.deleteRow(R[i]);
}
/** Недоставленные (6 попыток / старше 6 ч / битая строка) → лист cp_dead (видно, cp_retryDead возвращает), cp_log 'dead'. → текст техтревоги (слать после замка). */
function cp_deadLetter_(items, nowMs) {
  var sh = cp_sheet_('cp_dead'), L = [];
  for (var i = 0; i < items.length; i++) {
    var x = items[i].x, raw = x.raw || (x.ev ? JSON.stringify(x.ev) : '');
    try { sh.appendRow([cp_cell_(x.id || '?'), new Date(x.t || nowMs), cp_cell_(x.src), cp_cell_(x.ev && x.ev.who), cp_cell_(x.ev && x.ev.chat), x.tries, cp_cell_(items[i].why), cp_cell_(raw)]); }
    catch (e) { console.log('cp_dead: ' + (e && e.message || e)); }
    cp_logRow_(x.id || '-', x.src, 'dead', items[i].why + ' — в cp_dead');
    L.push((x.src || '?') + ' ' + (x.id || '?') + ' (' + items[i].why + ')');
  }
  try { var n = sh.getLastRow(); if (n > CP_DEAD_KEEP + 100) sh.deleteRows(2, n - 1 - CP_DEAD_KEEP); } catch (e1) { /* ротация не обязательна */ }
  return '⚠️ Push к Claude (' + cp_botName_() + '): не доставлено ' + items.length + ' событий — лист cp_dead служебной таблицы: ' + L.slice(0, 5).join('; ') + (L.length > 5 ? ' …' : '') + '. Вернуть в очередь: cp_retryDead() в редакторе.';
}
/** Одна техтревога владельцу не чаще раза в CP_ALERT_TTL — через функцию проекта ob_alert_ (как у Outbox.gs), если определена; иначе console. */
function cp_alert_(text) {
  try { var c = CacheService.getScriptCache(); if (c.get('cp:alert') === '1') { console.log('cp_alert: отложено (не чаще раза в час)'); return false; } c.put('cp:alert', '1', CP_ALERT_TTL); } catch (e) { /* без кэша — шлём */ }
  text = cp_mask_(text);
  var fn = typeof ob_alert_ === 'function' ? ob_alert_ : null;
  if (fn) { try { fn(text); return true; } catch (e1) { console.log('cp_alert: функция проекта: ' + (e1 && e1.message || e1)); } }
  console.log(text);
  return false;
}
/** Из редактора: вернуть недоставленные из cp_dead в буфер (id — одно событие, без id — все; tries 0, время — сейчас). → число возвращённых. */
function cp_retryDead(id) {
  if (!cp_mode_()) return 0;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return 0;
  try {
    var sh = cp_sheet_('cp_dead'), n = sh.getLastRow(), k = 0; if (n < 2) return 0;
    var V = sh.getRange(2, 1, n - 1, 8).getValues();
    for (var i = V.length - 1; i >= 0; i--) {
      if (id && String(V[i][0]) !== String(id)) continue;
      var ev = null; try { ev = JSON.parse(String(V[i][7] || '')); } catch (e) { ev = null; }
      if (!ev || !ev.id) { continue; }
      cp_bufAdd_(ev, Date.now(), 0); sh.deleteRow(i + 2); k++;
      cp_logRow_(ev.id, ev.src, 'buf', 'возвращено из cp_dead вручную');
    }
    return k;
  } finally { lock.releaseLock(); }
}

// ================================================================ публичное
/** Принять событие ev = {src:'tg'|'max'|'mail'|'group', who, chat, id, text, ctx?:[]}.
    now=true (личная команда Т. В./Сотрудник3) — отправить сразу, если часовой бюджет и время позволяют; иначе — в буфер (cp_flush дошлёт).
    → true: событие дойдёт до Claude (отправлено или в буфере при включённом push) или уже принималось (повтор вебхука);
      false: MODE не google, событие пустое/неверное, или push не настроен (нет CLAUDE_FIRE_URL/TOKEN — событие лишь в буфере и журнале).
    В обработчике вебхука — не дольше ~5 с: одна попытка сети, без ожиданий. */
function cp_push(ev, now) {
  if (!cp_mode_()) return false;
  var t0 = Date.now(), e = cp_norm_(ev);
  if (!e) { cp_logRow_('?', ev && ev.src, 'bad', 'нет текста или источника'); return false; }
  var lock = LockService.getScriptLock(), got = false;
  try { got = lock.tryLock(2000); } catch (e0) { got = false; }
  var on = cp_enabled(), direct = false;
  try {
    if (cp_seen_(e.id)) { cp_logRow_(e.id, e.src, 'dup', ''); return true; }
    direct = got && !!now && on && Date.now() - t0 <= CP_WEBHOOK_BUDGET_MS && cp_canSend_(1, t0);   // без замка — только буфер (дубль буфера снимет cp_flush)
    try { cp_bufAdd_(e, t0, direct ? t0 + 120000 : 0); }                                           // СНАЧАЛА долговечная запись (C-A1)
    catch (e1) { cp_logRow_(e.id, e.src, 'fail', 'буфер не записан: ' + (e1 && e1.message || e1)); return false; }   // «принят» не отмечаем — повтор запишет
    cp_markSeen_(e.id);                                                                             // только после записи
  } finally { if (got) lock.releaseLock(); }
  if (!on) { cp_logRow_(e.id, e.src, 'buf-off', 'push не настроен'); return false; }
  if (!direct) { cp_logRow_(e.id, e.src, 'buf', now ? (got ? 'лимит или время — через cp_flush' : 'замок занят — через cp_flush') : ''); return true; }
  try {
    var res = cp_send_([e]);
    cp_runRow_(1, res.code, res.ms, res.ok ? res.info : 'http ' + res.code + ' ' + res.info);
    if (res.ok) { cp_bufDel_([e.id]); cp_logRow_(e.id, e.src, 'sent', res.info); return true; }
    if (res.code === 429) cp_backoff_(res.retryAfter, Date.now());
    cp_bufRetry_([{ id: e.id, tries: 0 }], Date.now(), res.code === 429 ? 0 : res.code);
    cp_logRow_(e.id, e.src, res.code === 0 ? 'uncertain' : 'buf', res.code === 0 ? 'сеть: исход неизвестен, повтор по not_before (дубль Claude отсеет по id)' : 'сразу не ушло: http ' + res.code);
  } catch (e2) { cp_logRow_(e.id, e.src, 'err', 'после отправки: ' + (e2 && e2.message || e2)); }   // событие в буфере с not_before — cp_flush дошлёт
  return true;
}
/** Разослать буфер пачками (триггер раз в минуту). → число удачных запусков. Не дольше budgetMs (необязательный; нет — CP_FLUSH_BUDGET_MS 200 с).
    1) под замком: прочитать буфер; битые / старше 6 ч / 6 попыток → cp_dead (+ одна тревога), дубли id → удалить, собрать до CP_FLUSH_MAX_RUNS пачек
       и взять их события в работу (not_before = аренда CP_CLAIM_MS); 2) без замка — отправка; 3) под замком по id — удалить отправленные / отметить попытку.
    Замок не держится во время сети (вебхуки и Outbox не ждут); упавший cp_flush → события снова берутся после аренды (дубль Claude отсеет по id). */
function cp_flush(budgetMs) {
  if (!cp_mode_() || !cp_enabled()) return 0;
  if (cp_bufEmptyFlag_()) return 0;                                       // буфер пуст с прошлого раза и никто ничего не добавил — без замка и таблицы (< 1 с)
  var budget = Number(budgetMs) > 0 ? Math.min(CP_FLUSH_BUDGET_MS, Number(budgetMs)) : CP_FLUSH_BUDGET_MS;   // запрос F4: таймер передаёт остаток своего бюджета
  var t0 = Date.now(), sent = 0, lock = LockService.getScriptLock();
  if (cp_backoffUntil_() > t0) return 0;
  if (!lock.tryLock(5000)) return 0;
  var batches = [], alert = '';
  try {
    var all = cp_bufRead_(), ready = [], dead = [], dupRows = [], seen = {}, i;
    if (!all.length) { cp_bufEmptySet_(); return 0; }
    all.sort(function (a, b) { return a.t - b.t; });
    for (i = 0; i < all.length; i++) {
      var x = all[i];
      if (!x.ev || !x.id) { dead.push({ x: x, why: 'битая строка' }); continue; }
      if (seen[x.id]) { dupRows.push(x.row); continue; }                 // тот же id дважды (cp_push без замка) — лишняя строка
      seen[x.id] = 1;
      if (t0 - x.t > CP_BUF_MAX_AGE_MS) { dead.push({ x: x, why: 'старше 6 ч' }); continue; }
      if (x.tries >= CP_MAX_TRIES) { dead.push({ x: x, why: 'попыток ' + x.tries }); continue; }
      if (x.nb > t0) continue;
      ready.push(x);
    }
    if (dead.length) alert = cp_deadLetter_(dead, t0);
    var del = dupRows.concat(dead.map(function (d) { return d.x.row; }));
    if (del.length) cp_bufDelRows_(del);
    while (ready.length && batches.length < CP_FLUSH_MAX_RUNS) {
      var batch = [], len = 'FABRIKA-PUSH v1\n'.length;
      while (ready.length) {                                      // пачка — пока влезает в CP_BATCH_MAX (минимум одно событие)
        var et = cp_eventText_(ready[0].ev), add = et.length + (batch.length ? 7 : 0);
        if (batch.length && len + add > CP_BATCH_MAX) break;
        batch.push(ready.shift()); len += add;
      }
      batches.push(batch);
    }
    if (batches.length) {                                         // взять в работу: not_before = аренда (одной записью столбца; буфер могли только дописать)
      var claim = {}; batches.forEach(function (b) { b.forEach(function (x) { claim[x.id] = 1; }); });
      var sh = cp_sheet_('cp_buf'), n = sh.getLastRow();
      if (n >= 2) { var V = sh.getRange(2, 1, n - 1, 7).getValues(), col = V.map(function (r) { return [claim[String(r[0])] ? t0 + CP_CLAIM_MS : r[6]]; }); sh.getRange(2, 7, n - 1, 1).setValues(col); }
    }
  } catch (e) { cp_logRow_('-', '-', 'err', 'cp_flush: ' + (e && e.message || e)); batches = []; }
  finally { lock.releaseLock(); }
  if (alert) cp_alert_(alert);                                               // тревога — вне замка (функция проекта может ходить в сеть)
  var k = 0;
  while (k < batches.length && Date.now() - t0 < budget && cp_canSend_(1, Date.now())) {
    var B = batches[k], res = cp_send_(B.map(function (b) { return b.ev; })), now = Date.now(), okB = false;
    k++;
    cp_runRow_(B.length, res.code, res.ms, res.ok ? res.info : 'http ' + res.code + ' ' + res.info);
    if (!lock.tryLock(15000)) { cp_logRow_('-', B[0].src, 'err', 'cp_flush: замок занят после отправки (' + B.length + ' событий, http ' + res.code + ') — повтор после аренды'); break; }
    try {
      if (res.ok) { cp_bufDel_(B.map(function (b) { return b.id; })); B.forEach(function (b) { cp_logRow_(b.id, b.src, 'sent', res.info); }); sent++; okB = true; }
      else {
        if (res.code === 429) { cp_backoff_(res.retryAfter, now); cp_bufRetry_(B, now, 0); }
        else cp_bufRetry_(B, now, res.code);                    // сеть (0) или 4xx/5xx — следующий раз по not_before
        if (res.code === 0) cp_logRow_('-', B[0].src, 'uncertain', 'сеть: исход неизвестен, событий ' + B.length + ' (' + B.slice(0, 5).map(function (b) { return b.id; }).join(', ') + (B.length > 5 ? ' …' : '') + '), повтор по not_before');
      }
    } finally { lock.releaseLock(); }
    if (!okB) break;                                              // не долбить: остальные пачки — следующей минутой
  }
  if (k < batches.length) cp_release_(batches.slice(k));         // не отправляли (бюджет/лимит/сбой): снять аренду
  return sent;
}
/** Снять аренду с невзятых в отправку пачек (not_before = 0 для событий без попытки в этот раз). */
function cp_release_(batches) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return;
  try {
    var sh = cp_sheet_('cp_buf'), ids = {}; batches.forEach(function (b) { b.forEach(function (x) { ids[x.id] = x.nb || 0; }); });
    var n = sh.getLastRow(); if (n < 2) return;
    var V = sh.getRange(2, 1, n - 1, 7).getValues(), col = V.map(function (r) { var k = String(r[0]); return [ids.hasOwnProperty(k) ? ids[k] : r[6]]; });
    sh.getRange(2, 7, n - 1, 1).setValues(col);
  } catch (e) { console.log('cp_release: ' + (e && e.message || e)); }
  finally { lock.releaseLock(); }
}
/** Состояние для диагностики (без секретов): {mode, enabled, buffered, dead, lastHour, hourLimit, backoffSec}. */
function cp_status() {
  var now = Date.now(), out = { mode: cp_mode_(), enabled: cp_enabled(), buffered: 0, dead: 0, lastHour: 0, hourLimit: cp_hourLimit_(), backoffSec: 0 };
  try { out.buffered = Math.max(0, cp_sheet_('cp_buf').getLastRow() - 1); out.dead = Math.max(0, cp_sheet_('cp_dead').getLastRow() - 1); out.lastHour = cp_runsLastHour_(now); out.backoffSec = Math.max(0, Math.round((cp_backoffUntil_() - now) / 1000)); }
  catch (e) { out.err = String(e && e.message || e); }
  return out;
}


// REDACTED_B64_38 10.11.2026: включение push (свойств больше 50 — в «Настройках проекта» они только для чтения)
/** Вставьте ключ задачи «Фабрика — команда из бота (push)» в кавычки ниже, выберите cp_setupFire и нажмите «Выполнить».
    ПОСЛЕ ЗАПУСКА СОТРИТЕ КЛЮЧ ИЗ КАВЫЧЕК И СОХРАНИТЕ — в свойствах он останется, в коде храниться не должен. */
var CP_FIRE_TOKEN_PASTE = '';
function cp_setupFire() {
  var p = PropertiesService.getScriptProperties();
  p.setProperty('CLAUDE_FIRE_URL', 'https://api.anthropic.REDACTED_B64_43');
  p.setProperty('CP_HOUR_LIMIT', '15');
  if (String(CP_FIRE_TOKEN_PASTE).trim()) p.setProperty('CLAUDE_FIRE_TOKEN', String(CP_FIRE_TOKEN_PASTE).trim());
  console.log('CLAUDE_FIRE_URL задан; CP_HOUR_LIMIT=15; ключ: ' + (p.getProperty('CLAUDE_FIRE_TOKEN') ? 'ЕСТЬ' : 'НЕТ — вставьте и запустите ещё раз') + '; MODE=' + p.getProperty('MODE') + '; push включён: ' + cp_enabled());
}
