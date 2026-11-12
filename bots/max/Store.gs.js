/* «Фабрика — бот MAX» (Google 1c@) — слой хранения (шаг 1 переноса ботов в Google, 04.11.2026; план fabrika/tasks/max_to_google_plan.md).
   Т. В.: «На хостинге ничего с ботами связано быть не должно. Должно всё работать с Google-диска».
   Требования отчёта GPT (03.11): 03 — входящее сначала записывается (лист max_in), «обработано» — только после обработки, повтор;
   05 — статусы pending/sent/failed (лист post_ids), каждая запись проверяется; 08 — в свойствах скрипта ничего больше 8 КБ: состояние —
   в листах служебной таблицы и в JSON-файлах папки Диска «Фабрика — боты/MAX».
   Ключи (K_CMD, MAX_TOKEN) — только в свойствах скрипта; в листах и файлах их нет. */

var SS_ID = 'REDACTED_ID_2';      // служебная таблица ботов на 1c@ («Фабрика — боты»)
var BOT_DIR = 'Фабрика — боты', MAX_DIR = 'MAX', MOVE_PARENT = 'Фабрика — портал';
var STORE_PROP_MAX = 8000;                                               // 08: запас до лимита Google 9 КБ на значение

// REDACTED_B64_2 свойства: только маленькое
function utf8len_(s) { return Utilities.newBlob(String(s)).getBytes().length; }
/** Записать маленькое значение в свойства; больше STORE_PROP_MAX байт — отказ (false), а не исключение посреди обработки. */
function propSet_(k, v) {
  var s = typeof v === 'string' ? v : JSON.stringify(v);
  if (utf8len_(s) > STORE_PROP_MAX) { logRow_('err', 'свойство ' + k + ': ' + utf8len_(s) + ' байт — больше ' + STORE_PROP_MAX + ', не записано'); return false; }
  try { PropertiesService.getScriptProperties().setProperty(k, s); return true; } catch (e) { logRow_('err', 'свойство ' + k + ': ' + e); return false; }
}

// REDACTED_B64_2 таблица
var SHEETS = {
  max_in:   ['key', 't', 'type', 'status', 'tries', 'err', 'done_t', 'body'],           // 03: очередь входящих MAX
  post_ids: ['id', 't', 'status', 'cid', 'title', 'mid', 'err'],                         // 05: публикации pending/sent/failed
  groups:   ['cid', 'title', 'on', 'appr', 'channel', 't0', 't'],
  settings: ['k', 'v'],
  log:      ['t', 'k', 'msg']
};
function ss_() { return SpreadsheetApp.openById(st_ssId()); }
/** Id служебной таблицы: свойство SVC_SHEET_ID (контракт ночи 05.11, если Т. В. заведёт другую таблицу), иначе — SS_ID («Фабрика — боты»). */
function st_ssId() { var v = String(PropertiesService.getScriptProperties().getProperty('SVC_SHEET_ID') || '').trim(); return /^[\w-]{20,}$/.test(v) ? v : SS_ID; }
function sheet_(name) {
  var s = ss_(), sh = s.getSheetByName(name);
  if (!sh) { sh = s.insertSheet(name); if (SHEETS[name]) sh.appendRow(SHEETS[name]); }
  return sh;
}
/** Значение для ячейки: Date — как есть (05.11: раньше превращалась в строку с кавычками, и проверки instanceof Date не работали), объект — JSON, лимит ячейки 50 000. */
function cell_(v) { v = v == null ? '' : v; if (v instanceof Date) return v; if (typeof v === 'object') v = JSON.stringify(v); v = String(v); return v.length > 49000 ? v.slice(0, 49000) : v; }
/** Строка по ключу в первом столбце → {row, vals} | null. */
function findRow_(name, key) {
  var sh = sheet_(name), f = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).createTextFinder(String(key)).matchEntireCell(true).findNext();
  if (!f || f.getRow() === 1) return null;
  var r = f.getRow(); return { row: r, vals: sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0] };
}
function setCols_(name, row, obj) {
  var sh = sheet_(name), hdr = SHEETS[name];
  Object.keys(obj).forEach(function (k) { var c = hdr.indexOf(k); if (c >= 0) sh.getRange(row, c + 1).setValue(cell_(obj[k])); });
}
/** Журнал (лист log): не больше 2 000 строк — старое удаляется пачкой. Никогда не бросает исключение. */
function logRow_(k, msg) {
  try {
    var sh = sheet_('log'); sh.appendRow([new Date(), cell_(k), cell_(String(msg).slice(0, 500))]);
    if (sh.getLastRow() > 2200) sh.deleteRows(2, 200);
  } catch (e) { console.log('log: ' + e + ' · ' + k + ' ' + msg); }
}

// REDACTED_B64_2 03: очередь входящих
/** Записать событие до ответа MAX. → {ok, dup} ; ok=false — записать не удалось (вызывающий отвечает MAX ошибкой → MAX повторит).
    05.11 (GPT A4): тело НЕ режется — длиннее ячейки (ST_CELL_MAX) → файл на Диске «Фабрика — боты/MAX/inbox/<key>.json», в ячейке ссылка
    'file:<key>' (читать — st_inBody); файл не записался → ok:false (MAX повторит), а не ложный успех с испорченным JSON. */
function inPut_(key, type, body) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return { ok: false, err: 'замок' };
  try {
    if (findRow_('max_in', key)) return { ok: true, dup: true };
    var b = String(body == null ? '' : body);
    if (b.length > ST_CELL_MAX) { var ref = st_bodyStore(key, b); if (!ref) return { ok: false, err: 'тело ' + b.length + ' знаков не сохранено на Диске' }; b = ref; }
    sheet_('max_in').appendRow([cell_(key), new Date(), cell_(type), 'new', 0, '', '', b]);
    return { ok: true, dup: false };
  } catch (e) { return { ok: false, err: String(e) }; }
  finally { lock.releaseLock(); }
}
/** Необработанные события (new, fail с попытками < tries) по порядку — ВСЕГО листа, не последних 500 строк (GPT A2, 05.11). Тела читаются
    только у выбранных строк. */
function inPending_(limit, tries) {
  var out = [];
  st_inScan(function (st, tr) { return st === 'new' || (st === 'fail' && tr < (tries || 5)); }, limit || 20).forEach(function (r) {
    var v = sheet_('max_in').getRange(r, 1, 1, 8).getValues()[0];
    out.push({ row: r, key: String(v[0]), type: String(v[2]), tries: Number(v[4]) || 0, body: String(v[7]) });
  });
  return out;
}
/** Номера строк max_in (по порядку, с самой старой), для которых test(status, tries, tookMs) — true; не больше limit. Читаются только столбцы
    status/tries/done_t всего листа (без тел) — так самое старое незавершённое событие не выпадает из выборки, сколько бы строк ни накопилось. */
function st_inScan(test, limit) {
  var sh = sheet_('max_in'), n = sh.getLastRow(), out = []; if (n < 2) return out;
  var V = sh.getRange(2, 4, n - 1, 4).getValues();                          // status, tries, err, done_t
  for (var i = 0; i < V.length && out.length < (limit || 20); i++) {
    var took = V[i][3] instanceof Date ? V[i][3].getTime() : (Date.parse(String(V[i][3] || '').replace(/"/g, '')) || 0);
    if (test(String(V[i][0]), Number(V[i][1]) || 0, took, i + 2)) out.push(i + 2);
  }
  return out;
}
function inDone_(row) { setCols_('max_in', row, { status: 'done', done_t: new Date() }); }
function inFail_(row, tries, err, final) { setCols_('max_in', row, { status: final ? 'dead' : 'fail', tries: tries, err: String(err).slice(0, 300) }); }

// REDACTED_B64_2 05: публикации
/** Зарезервировать номер ПОСЛЕ проверки группы. → 'ok' | 'dup' (уже sent или pending) | 'err'. failed можно повторить тем же id. */
function postReserve_(id, cid, title) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return 'err';
  try {
    var r = findRow_('post_ids', id);
    if (r && (r.vals[2] === 'sent' || r.vals[2] === 'pending')) return 'dup';
    if (r) { setCols_('post_ids', r.row, { t: new Date(), status: 'pending', cid: cid, title: title, err: '' }); return 'ok'; }
    sheet_('post_ids').appendRow([cell_(id), new Date(), 'pending', cell_(cid), cell_(title), '', '']);
    return 'ok';
  } catch (e) { return 'err'; }
  finally { lock.releaseLock(); }
}
function postMark_(id, status, mid, err) {
  var r = findRow_('post_ids', id); if (!r) return false;
  setCols_('post_ids', r.row, { status: status, mid: mid || '', err: err || '' }); return true;
}

// REDACTED_B64_2 Диск: JSON-файлы состояния
function folder_(path) {                                           // 'Фабрика — боты/MAX/state' — от корня Моего диска, создаётся
  var f = DriveApp.getRootFolder();
  String(path).split('/').filter(String).forEach(function (n) { var it = f.getFoldersByName(n); f = it.hasNext() ? it.next() : f.createFolder(n); });
  return f;
}
function maxDir_(sub) { return folder_(BOT_DIR + '/' + MAX_DIR + (sub ? '/' + sub : '')); }
function jget_(sub, name, def) {
  var it = maxDir_(sub).getFilesByName(name); if (!it.hasNext()) return def;
  try { return JSON.parse(it.next().getBlob().getDataAsString('UTF-8')); } catch (e) { logRow_('err', 'файл ' + sub + '/' + name + ': ' + e); return def; }
}
/** Записать JSON (новая версия того же файла). → true/false; без исключений. */
function jput_(sub, name, obj) {
  try {
    var d = maxDir_(sub), s = JSON.stringify(obj), it = d.getFilesByName(name);
    if (it.hasNext()) it.next().setContent(s); else d.createFile(name, s, 'application/json');
    return true;
  } catch (e) { logRow_('err', 'запись ' + sub + '/' + name + ': ' + e); return false; }
}
/** Изменить JSON-файл под замком: fn(текущее) → новое | null (не менять). → итог | false. */
function jrmw_(sub, name, def, fn) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(20000)) return false;
  try { var cur = jget_(sub, name, def), nw = fn(cur); if (nw === null || nw === undefined) return cur; return jput_(sub, name, nw) ? nw : false; }
  finally { lock.releaseLock(); }
}

// REDACTED_B64_2 шифр T14B1 (как seal() на хостинге), ключ K_CMD
function kcmdBytes_() {
  var k = String(PropertiesService.getScriptProperties().getProperty('K_CMD') || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(k)) return null;
  var b = []; for (var i = 0; i < 64; i += 2) { var x = parseInt(k.substr(i, 2), 16); b.push(x > 127 ? x - 256 : x); } return b;
}
function int4_(i) { return [(i >>> 24) & 255, (i >>> 16) & 255, (i >>> 8) & 255, i & 255].map(function (x) { return x > 127 ? x - 256 : x; }); }
/** 'T14B1.…' → строка UTF-8 | null (подпись не сошлась). */
function t14open_(key, s) {
  s = String(s || ''); if (s.indexOf('T14B1.') !== 0) return null;
  var raw = Utilities.base64Decode(s.slice(6)), nonce = raw.slice(0, 16), tag = raw.slice(16, 48), ct = raw.slice(48);
  var mac = Utilities.computeHmacSha256Signature(nonce.concat(ct), key);
  var diff = 0; for (var i = 0; i < 32; i++) diff |= (mac[i] ^ tag[i]); if (diff) return null;
  var out = new Array(ct.length), blk = null;
  for (var j = 0; j < ct.length; j++) {
    if ((j & 31) === 0) blk = Utilities.computeHmacSha256Signature(nonce.concat(int4_(j >>> 5)), key);
    out[j] = ((ct[j] ^ blk[j & 31]) << 24) >> 24;
  }
  return Utilities.newBlob(out).getDataAsString('UTF-8');
}

// REDACTED_B64_2 шаг 0 → Google: приём копии с хостинга
/** Перенести копию «Фабрика — портал/Перенос MAX <id>» → «Фабрика — боты/MAX/move/<имя>.json» (расшифровано, без секретов — их там и нет).
    Сверка sha256 по manifest. Повторный запуск продолжает с того, что не перенесено. → {ok, done, left, bad}.
    05.11 (GPT B4): файл считается перенесённым только если его sha в manifest совпадает с перенесённым (st.done[name].sha) — новая копия
    (другой id) с изменённым файлом того же имени переносится заново; у done хранится и id копии. */
function moveImport_(id) {
  var key = kcmdBytes_(); if (!key) return { ok: false, err: 'нет K_CMD в свойствах скрипта' };
  var src = folder_(MOVE_PARENT + '/Перенос MAX ' + id), mi = src.getFilesByName('manifest.bin');
  if (!mi.hasNext()) return { ok: false, err: 'копия ещё не готова (нет manifest.bin)' };
  var man = JSON.parse(t14open_(key, mi.next().getBlob().getDataAsString()) || 'null'); if (!man) return { ok: false, err: 'manifest не открылся (ключ?)' };
  var st = jget_('move', '_import.json', { done: {} }), t0 = Date.now(), bad = [];
  var same = function (f) { var d = st.done[f.name]; return !!d && (f.sha ? d.sha === f.sha : d.id === id); };
  man.files.forEach(function (f) {
    if (f.skipped || same(f) || Date.now() - t0 > 240000) return;
    var it = src.getFilesByName(f.name.replace(/\//g, '__') + '.bin'); if (!it.hasNext()) { bad.push(f.name + ': нет файла'); return; }
    var txt = t14open_(key, it.next().getBlob().getDataAsString()); if (txt === null) { bad.push(f.name + ': подпись'); return; }
    var h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.newBlob(txt).getBytes()).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
    if (f.sha && h !== f.sha) { bad.push(f.name + ': sha'); return; }
    var d = maxDir_('move'), nm = f.name.replace(/\//g, '__'), ex = d.getFilesByName(nm);
    if (ex.hasNext()) ex.next().setContent(txt); else d.createFile(nm, txt, 'application/json');
    st.done[f.name] = { sha: h, t: new Date().toISOString(), id: id };
  });
  jput_('move', '_import.json', st);
  var left = man.files.filter(function (f) { return !f.skipped && !same(f); }).length;
  logRow_('move', 'перенос ' + id + ': готово ' + Object.keys(st.done).length + ', осталось ' + left + (bad.length ? ', ошибки: ' + bad.join('; ') : ''));
  return { ok: !bad.length, done: Object.keys(st.done).length, left: left, bad: bad };
}

// ================================================================ добавлено 05.11.2026 (шаг 2, ядро MAX): ТОЛЬКО новые функции st_*,
// существующие имена и сигнатуры выше не менялись (ими пользуется шаг 3).
/** 16 случайных байт для nonce (два UUID v4 → 122+ бит случайности на пакет). */
function st_randBytes16() {
  var h = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32), b = [];
  for (var i = 0; i < 32; i += 2) { var x = parseInt(h.substr(i, 2), 16); b.push(x > 127 ? x - 256 : x); }
  return b;
}
/** Запечатать строку/байты в 'T14B1.…' тем же потоком, что seal_bytes_k в app_build/host/live/max_move.py (обратное t14open_).
    key — байты ключа (kcmdBytes_()). Пустой текст тоже запечатывается (tag считается по nonce). */
function st_t14seal(key, data) {
  var raw = typeof data === 'string' ? Utilities.newBlob(data).getBytes() : (data || []);
  var nonce = st_randBytes16(), ct = new Array(raw.length), blk = null;
  for (var j = 0; j < raw.length; j++) {
    if ((j & 31) === 0) blk = Utilities.computeHmacSha256Signature(nonce.concat(int4_(j >>> 5)), key);
    ct[j] = ((raw[j] ^ blk[j & 31]) << 24) >> 24;
  }
  var tag = Utilities.computeHmacSha256Signature(nonce.concat(ct), key);
  return 'T14B1.' + Utilities.base64Encode(nonce.concat(tag).concat(ct));
}
/** Файл истории: несколько строк, каждая — свой пакет 'T14B1.…' (дописывание без расшифровки прежних). → массив открытых строк
    в порядке файла; пакет с чужой подписью даёт null в своей позиции (вызывающий решает). Одиночный пакет без переводов строк — тоже годится. */
function st_t14openAll(key, text) {
  var out = [];
  String(text || '').split(/\r?\n/).forEach(function (line) {
    line = line.trim(); if (!line) return;
    out.push(line.indexOf('T14B1.') === 0 ? t14open_(key, line) : null);
  });
  return out;
}
/** Лист с заголовком по имени (для листов mx_… и tm_… вне SHEETS): создаётся при первом обращении, заголовок — hdr. */
function st_sheetFor(name, hdr) {
  var s = ss_(), sh = s.getSheetByName(name);
  if (!sh) { sh = s.insertSheet(name); if (hdr && hdr.length) sh.appendRow(hdr); }
  return sh;
}
/** 03: забрать события в работу ОДНИМ действием под замком: new, fail (попыток < tries, не раньше ST_RETRY_MS после прошлой попытки — иначе все
    попытки сгорали бы за секунды в одном запуске) и зависшие work (взяты раньше, чем staleMs назад). Каждому взятому ставится status='work', tries+1,
    done_t=сейчас (время взятия). → [{row, key, type, tries, body}]; замок не получен — []. */
var ST_RETRY_MS = 45000;
var ST_CELL_MAX = 49000;                                                     // лимит ячейки Google — 50 000 знаков; длиннее — тело в файл (inPut_)
function st_inClaim(limit, tries, staleMs) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) return [];
  try {
    var sh = sheet_('max_in'), now = Date.now(), max = tries || 5, stale = staleMs || 360000, dead = [];
    // 05.11 (GPT A2): просмотр ВСЕГО листа по столбцам status/tries/done_t (без тел) — самое старое незавершённое не выпадает после 500 строк.
    // (GPT B2): зависшее work с исчерпанными попытками (запуск оборван на последней попытке) — не вечное work, а dead с пометкой uncertain.
    var rows = st_inScan(function (st, tr, took, row) {
      if (st === 'new') return true;
      if (st === 'fail') return tr < max && (!took || now - took >= ST_RETRY_MS);
      if (st === 'work' && (!took || now - took > stale)) { if (tr < max) return true; dead.push(row); }
      return false;
    }, limit || 5), out = [];
    dead.forEach(function (r) { setCols_('max_in', r, { status: 'dead', err: 'uncertain: выполнение оборвано на попытке ' + max + ' (лимит времени?) — исход неизвестен' }); });
    if (dead.length) logRow_('err', 'очередь: ' + dead.length + ' событий закрыто как dead (uncertain) — обрыв на последней попытке');
    rows.forEach(function (r) {
      var v = sh.getRange(r, 1, 1, 8).getValues()[0], tr = (Number(v[4]) || 0) + 1;
      out.push({ row: r, key: String(v[0]), type: String(v[2]), tries: tr, body: String(v[7]) });
      setCols_('max_in', r, { status: 'work', tries: tr, done_t: new Date() });
    });
    return out;
  } catch (e) { logRow_('err', 'очередь (claim): ' + e); return []; }
  finally { lock.releaseLock(); }
}
/** Отметка события по НЕИЗМЕННОМУ ключу под замком (GPT A3, 05.11): строка находится заново (findRow_), номер строки из claim не используется —
    обрезка листа между claim и отметкой безопасна. → true — найдено и записано. */
function st_inMark(key, patch) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(15000)) { logRow_('err', 'очередь: нет замка для отметки ' + key); return false; }
  try { var r = findRow_('max_in', key); if (!r) { logRow_('err', 'очередь: нет строки ' + key + ' для отметки'); return false; } setCols_('max_in', r.row, patch); return true; }
  catch (e) { logRow_('err', 'очередь (отметка ' + key + '): ' + e); return false; }
  finally { lock.releaseLock(); }
}
function st_inDone(key) { return st_inMark(key, { status: 'done', done_t: new Date() }); }
function st_inFail(key, tries, err, final) { return st_inMark(key, { status: final ? 'dead' : 'fail', tries: tries, err: String(err).slice(0, 300) }); }
/** Тело события из строки max_in: обычное — как есть; 'file:<key>' — содержимое файла inbox/<key>.json (GPT A4). → строка | null (файла нет). */
function st_inBody(body) {
  body = String(body == null ? '' : body);
  if (body.indexOf('file:') !== 0) return body;
  try { var it = maxDir_('inbox').getFilesByName(body.slice(5) + '.json'); return it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : null; }
  catch (e) { logRow_('err', 'очередь: тело ' + body + ': ' + e); return null; }
}
/** Длинное тело → файл «Фабрика — боты/MAX/inbox/<key>.json» (целиком, без обрезки). → 'file:<key>' | null (не записалось). */
function st_bodyStore(key, text) {
  try {
    var d = maxDir_('inbox'), nm = String(key) + '.json', it = d.getFilesByName(nm);
    if (it.hasNext()) it.next().setContent(text); else d.createFile(nm, text, 'application/json');
    return 'file:' + key;
  } catch (e) { logRow_('err', 'очередь: тело ' + key + ' на Диск: ' + e); return null; }
}
/** Файлы inbox/ старше days суток — в корзину (тела давно обработанных событий). → сколько. */
function st_inboxTrim(days) {
  // Temporary source-retention hold: dedupe, unresolved outcomes, and Timers still need originals.
  // Remove only after reviewed permanent identity/archive readers and explicit cleanup approval.
  return 0; // No rows/files removed; preserve the numeric return contract.
  var n = 0;
  try {
    var it = maxDir_('inbox').getFiles(), lim = Date.now() - (days || 7) * 864e5;
    while (it.hasNext()) { var f = it.next(); if (f.getLastUpdated().getTime() < lim) { f.setTrashed(true); n++; } }
  } catch (e) { logRow_('err', 'очередь (inbox): ' + e); }
  return n;
}
/** Обрезка очереди: когда строк больше maxRows — удалить самые старые done/dead пачкой (new/fail/work не трогаются, если они в начале — удаление
    останавливается на первой незавершённой). Под замком (GPT A3): claim и отметки тоже берут замок, а отметки идут по ключу — удаление строк
    номера у работающего обработчика не ломает. → сколько удалено. */
function st_inTrim(maxRows) {
  // Temporary source-retention hold: dedupe, unresolved outcomes, and Timers still need originals.
  // Remove only after reviewed permanent identity/archive readers and explicit cleanup approval.
  return 0; // No rows/files removed; preserve the numeric return contract.
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return 0;
  try {
    var sh = sheet_('max_in'), n = sh.getLastRow(); if (n <= (maxRows || 3000)) return 0;
    var V = sh.getRange(2, 4, Math.min(n - 1, 1000), 1).getValues(), k = 0;
    while (k < V.length && (V[k][0] === 'done' || V[k][0] === 'dead')) k++;
    if (k > 0) sh.deleteRows(2, k);
    return k;
  } catch (e) { logRow_('err', 'очередь (trim): ' + e); return 0; }
  finally { lock.releaseLock(); }
}
/** Открытый текст файла копии шага 0 («Фабрика — боты/MAX/move/<имя с __>») → строка | null. Для mx_importState. */
function st_moveText(name) {
  var it = maxDir_('move').getFilesByName(String(name).replace(/\//g, '__'));
  return it.hasNext() ? it.next().getBlob().getDataAsString('UTF-8') : null;
}
