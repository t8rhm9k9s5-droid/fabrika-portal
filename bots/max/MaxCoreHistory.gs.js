/* «Фабрика — бот MAX» — MaxCoreHistory.gs (05.11.2026): история ВСЕХ групп и каналов для Claude (RULES 04.11 ~18:15: «ботом и читай все группы»).
   Как устроено: каждое сообщение (текст, автор, время, ответ на что, вложения — тип и ссылка; телефоны → [тел.]) сначала в буфер — лист mx_hist
   (быстро, в обработчике вебхука), затем mx_histFlush (конец быстрого запуска и триггер раз в минуту) выгружает его на Диск 1c@:
     «Фабрика — боты/MAX/история/<группа>/<ГГГГ-ММ>.bin» — файл из СТРОК, каждая строка — пакет 'T14B1.…' (seal_bytes, ключ K_CMD) с порцией
       сообщений в виде JSON Lines (по одной записи в строке открытого текста). Дописывание строки не требует расшифровки прежних — дёшево для
       Apps Script; читатель (fabrika/tasks/max_read.py) открывает каждую строку t14open и склеивает.
     «Фабрика — боты/MAX/новое.bin» — один пакет T14B1: все записи за последние 48 часов по всем группам (JSON Lines) — «новое с последнего
       чтения» для Claude; Claude хранит свой курсор (ts последнего прочитанного). Файл перезаписывается при каждой выгрузке.
   Запись истории: {ts, cid, g, mid, uid, name, bot, text, rmid, ruid, rname, att:[{type,url,name}], ment:[uid], k:''|'edit'|'del', fwd?}
   (как norm_msg в mx_ctl.py — таймеры шага 3 могут читать те же записи через mx_histRecent / st_t14openAll). Файлы вложений на Диск не копируются
   (только ссылки) — см. STEP2_README «не сделано». Личные сообщения в историю не пишутся. */

var MX_HIST_DIR = 'история';          // подпапка «Фабрика — боты/MAX/история»
var MX_NEW_FILE = 'новое.bin';         // «Фабрика — боты/MAX/новое.bin»
var MX_NEW_HOURS = 48;

/** Запись в буфер истории (лист mx_hist). Повтор того же mid (своё сообщение приходит и вебхуком) не дублируется. */
function mx_histAdd(rec) {
  try {
    if (!rec || !rec.cid) return false;
    if (rec.mid && mx_rows('mx_hist', 300).some(function (r) { return String(r.mid) === rec.mid && String(r.k || '') === String(rec.k || ''); })) return false;
    var g = mx_groupGet(rec.cid);
    mx_appendObj('mx_hist', { ts: rec.ts || Date.now(), cid: rec.cid, g: (g && g.title) || rec.g || '', mid: rec.mid || '', uid: rec.uid || '', name: rec.name || '', bot: rec.bot ? 1 : 0,
                              text: rec.text || '', rmid: rec.rmid || '', ruid: rec.ruid || '', rname: rec.rname || '', att: JSON.stringify(rec.att || []), ment: JSON.stringify(rec.ment || []),
                              k: rec.k || (rec.fwd ? JSON.stringify({ fwd: rec.fwd }) : ''), fl: '' });
    try { CacheService.getScriptCache().put('mx_hist_dirty', '1', 21600); } catch (x) {}   // есть невыгруженное — выгрузка не пропустит тик
    return true;
  } catch (x) { mx_log('err', 'история (буфер): ' + mx_errText(x)); return false; }
}
/** message_edited / message_removed → записи с k='edit' (новый текст) и k='del' (mid). */
function mx_histEvent(u) {
  var type = String(u.update_type || '');
  if (type === 'message_edited' && u.message) { var r = mx_normMsg(u.message, u.message.recipient); if (String((u.message.recipient || {}).chat_type) === 'dialog') return; r.k = 'edit'; mx_histAdd(r); return; }
  if (type === 'message_removed') mx_histAdd({ ts: Number(u.timestamp || Date.now()), cid: String(u.chat_id || ''), mid: String(u.message_id || ''), uid: u.user_id || '', name: '', text: '', k: 'del' });
}
/** Последние n записей группы из буфера (по времени). */
function mx_histRecent(cid, n) {
  var R = mx_rows('mx_hist', 600).filter(function (r) { return String(r.cid) === String(cid) && !r.k; });
  R.sort(function (a, b) { return Number(a.ts) - Number(b.ts); });
  return R.slice(-(n || 10));
}
/** Запись листа → объект истории (JSON Lines) без служебных полей. */
function mx_histObj(r) {
  var o = { ts: Number(r.ts) || 0, cid: String(r.cid), g: String(r.g || ''), mid: String(r.mid || ''), uid: r.uid === '' ? null : Number(r.uid) || String(r.uid), name: String(r.name || ''), bot: mx_bool(r.bot) || r.bot === 1,
            text: String(r.text || ''), rmid: String(r.rmid || ''), ruid: r.ruid === '' ? null : Number(r.ruid) || String(r.ruid), rname: String(r.rname || ''), att: [], ment: [] };
  try { o.att = JSON.parse(r.att || '[]'); } catch (x) {}
  try { o.ment = JSON.parse(r.ment || '[]'); } catch (x) {}
  var k = String(r.k || '');
  if (k === 'edit' || k === 'del') o.k = k; else if (k.charAt(0) === '{') { try { o.fwd = JSON.parse(k).fwd; } catch (x) {} }
  return o;
}
function mx_histSafeName(s) { return String(s || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80); }
/** Выгрузка буфера на Диск: невыгруженные строки → по группам и месяцам → строка-пакет в <ГГГГ-ММ>.bin; затем новое.bin. Бюджет времени — budgetMs. */
function mx_histFlush(budgetMs) {
  var key = kcmdBytes_(); if (!key) return 0;
  var ca = CacheService.getScriptCache();
  if (!ca.get('mx_hist_dirty') && new Date().getMinutes() % 10 !== 3) return 0;   // буфер не трогали — лист не читаем (кэш мог пропасть: полная проверка раз в 10 мин)
  var lock = LockService.getScriptLock(); if (!lock.tryLock(3000)) return 0;
  var t0 = Date.now(), done = 0;
  try {
    var sh = mx_sheet('mx_hist'), R = mx_rows('mx_hist'), todo = R.filter(function (r) { return !mx_bool(r.fl) && r.fl !== 1; });
    if (!todo.length) { ca.remove('mx_hist_dirty'); return 0; }
    var by = {};
    todo.forEach(function (r) {
      var cid = String(r.cid), ym = mx_msk('yyyy-MM', new Date(Number(r.ts) || Date.now())), k = cid + '|' + ym;
      (by[k] = by[k] || { cid: cid, ym: ym, g: String(r.g || ''), rows: [] }).rows.push(r);
    });
    var flRows = [];
    Object.keys(by).forEach(function (k) {
      if (Date.now() - t0 > budgetMs) return;
      var b = by[k], name = mx_histSafeName(b.g || mx_groupTitle(b.cid)) || ('группа ' + b.cid);
      var dir = folder_(BOT_DIR + '/' + MAX_DIR + '/' + MX_HIST_DIR + '/' + name), fn = b.ym + '.bin';
      var lines = b.rows.sort(function (a, c) { return Number(a.ts) - Number(c.ts); }).map(function (r) { return JSON.stringify(mx_histObj(r)); }).join('\n');
      var pack = st_t14seal(key, lines), it = dir.getFilesByName(fn);
      if (it.hasNext()) { var f = it.next(), cur = f.getBlob().getDataAsString('UTF-8'); f.setContent(cur + (cur && !/\n$/.test(cur) ? '\n' : '') + pack + '\n'); }
      else dir.createFile(fn, pack + '\n', 'text/plain');
      b.rows.forEach(function (r) { flRows.push(r._row); });
      done += b.rows.length;
    });
    if (flRows.length) {
      var col = MX_SHEETS.mx_hist.indexOf('fl') + 1, lo = Math.min.apply(null, flRows), hi = Math.max.apply(null, flRows);
      var V = sh.getRange(lo, col, hi - lo + 1, 1).getValues(), set = {}; flRows.forEach(function (r) { set[r] = 1; });
      for (var i = 0; i < V.length; i++) if (set[lo + i]) V[i][0] = 1;
      sh.getRange(lo, col, hi - lo + 1, 1).setValues(V);
      mx_histNew(key, R);
    }
    if (done === todo.length) ca.remove('mx_hist_dirty');
    return done;
  } catch (x) { mx_log('err', 'история (Диск): ' + mx_errText(x)); return done; }
  finally { lock.releaseLock(); }
}
/** новое.bin — записи за последние MX_NEW_HOURS часов по всем группам (один пакет T14B1). */
function mx_histNew(key, rows) {
  var lim = Date.now() - MX_NEW_HOURS * 3600e3, L = (rows || mx_rows('mx_hist')).filter(function (r) { return Number(r.ts) >= lim; });
  L.sort(function (a, b) { return Number(a.ts) - Number(b.ts); });
  var pack = st_t14seal(key, L.map(function (r) { return JSON.stringify(mx_histObj(r)); }).join('\n'));
  var dir = maxDir_(), it = dir.getFilesByName(MX_NEW_FILE);
  if (it.hasNext()) it.next().setContent(pack); else dir.createFile(MX_NEW_FILE, pack, 'text/plain');
}
/** Обрезка буфера: выгруженные строки старше 3 дней — долой (с начала листа), когда строк больше 4000. */
function mx_histTrim() {
  try {
    var sh = mx_sheet('mx_hist'), n = sh.getLastRow(); if (n < 4000) return;
    var lim = Date.now() - 3 * 864e5, V = sh.getRange(2, 1, Math.min(n - 1, 1500), MX_SHEETS.mx_hist.length).getValues(), k = 0, iTs = 0, iFl = MX_SHEETS.mx_hist.indexOf('fl');
    while (k < V.length && Number(V[k][iTs]) < lim && (V[k][iFl] === 1 || V[k][iFl] === '1')) k++;
    if (k > 0) sh.deleteRows(2, k);
  } catch (x) { mx_log('err', 'история (обрезка): ' + mx_errText(x)); }
}
/** Для op hist: записи группы из буфера новее since (мс), не больше n (по времени). */
function mx_histRead(cid, since, n) {
  var R = mx_rows('mx_hist').filter(function (r) { return String(r.cid) === String(cid) && Number(r.ts) > (Number(since) || 0); });
  R.sort(function (a, b) { return Number(a.ts) - Number(b.ts); });
  return R.slice(0, Math.min(Number(n) || 100, 300)).map(mx_histObj);
}
