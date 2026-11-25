/* «Фабрика» — общий модуль Autonomy.gs (шаг 5 ночи 05.11.2026): боты сами — рекламация, запрос цены, спор с клиентом, тихие часы,
   руководители, маскирование контактов для внешних ИИ. Т. В. 04.11 ~19:40: «боты — максимально автономные … набиваем память»;
   ~19:50 — спор с клиентом: сначала спросить, какой договор подписан. Один и тот же файл в обоих проектах Apps Script 1c@
   (Telegram «Фабрика — уведомления», MAX «Фабрика — бот MAX»). Префикс au_. Подпись ответов — от имени Т. В. Сотрудник1.
   Зависимости: службы Google (PropertiesService, CacheService, DriveApp, SpreadsheetApp, LockService, Utilities), свойства скрипта и
   общий модуль KbFind.gs (bf_json — bot_rules.json, price_now.json, recl.bin из «Для ботов»; kb_norm — ключи слов). Функций MAX/TG
   (Store.gs, mx_*, tm_*, g4_*) здесь нет. Сообщения, письма и кнопки модуль НЕ отправляет — только готовит тексты; отправку делает вызывающий.

   Правила — bot_rules.json (gk — проверенные статьи ГК РФ, contract_points — пункты НАШИХ договоров по юрлицу, reg_terms — сроки регламента,
   scenarios recl/price/dispute, holidays, bans) и price_now.json (прайс 28.10: items[] {id, model, spec, p{I..V}, same}, city_basis).
   Нет файла — встроенные запасные правила (без ссылок на ГК и без номеров пунктов: они берутся только из проверенного bot_rules).

   Состояние — листы au_* ОДНОЙ общей таблицы обоих проектов «Фабрика — боты — автономность» (свойство AU_SHEET_ID; нет — поиск по имени
   на Диске 1c@, нет — создать и записать id в свойство): au_recl_watch (наблюдения за рекламациями), au_price (запросы цены: кнопки
   нажимаются в Telegram, а запрос приходит из MAX — поэтому таблица общая), au_settings (key/value: leader, not_leader, holiday,
   workday, quiet_from, quiet_to, ban), au_log (журнал без персональных данных). Запись — под LockService.
   Всё новое — при MODE === 'google'; иначе au_detect → {kind:null}, тексты — '', списки — [], au_isQuiet — только часы 19–07, au_isLeader — встроенный
   список (без Диска и таблиц). Ключи и токены не нужны и не выводятся.
   Добавлено проверкой 2 (05.11): au_isHoliday(dateMs) — один источник праздников для обоих проектов; au_sign(nowMs) — подпись (днём Т. В.,
   ночью и в праздники — голос бота); au_setup() — создать общую таблицу из редактора и показать её id. */

var AU_SIGN = 'Т. В. Сотрудник1';                   // подпись от имени владельца (RULES 04.11 ~18:15)
var AU_SIGN_BOT = 'Бот «Фабрика» (по правилам компании)';   // голос бота в личках в тихие часы 19–07 и праздники (проверка 2, 05.11): ночью от имени Т. В. не пишем
var AU_SHEET_NAME = 'Фабрика — боты — автономность';
var AU_QUIET_FROM = 19, AU_QUIET_TO = 7;          // тихие часы МСК для групп и сотрудников (RULES 04.11 ~18:15; au_settings quiet_from/quiet_to)
var AU_WATCH_WD = 2;                              // рабочих дней до проверки реестра рекламаций
var AU_WATCH_HOUR = 8;                            // срок проверки — 08:00 МСК дня после AU_WATCH_WD рабочих дней
var AU_WATCH_KEEP_DAYS = 45;                      // закрытые наблюдения старше — удаляются
var AU_PRICE_TTL_DAYS = 14;                       // запрос цены без нажатия кнопки старше — удаляется
var AU_OWNER_PCT = 5;                             // скидка больше — «нужно ваше решение» (price_now.discount_owner_pct)
var AU_SET_TTL = 600;                             // кэш настроек листа, секунд
var AU_LOG_KEEP = 1500;
var AU_ITM = 'user5@example.org', AU_PTO = 'user13@example.org';
var AU_PEO_TO = ['user15@example.org'], AU_PEO_CC = ['user16@example.org', 'user5@example.org'];
var AU_LAWYER = 'Сотрудник49 Н. Я., user14@example.org';
var AU_SHEETS = {
  au_recl_watch: ['id', 't', 'bot', 'group', 'chat', 'mid', 'client', 'defect', 'manager', 'due', 'status', 'checked', 'reminded', 'note'],
  au_price: ['id', 't', 'status', 'bot', 'chat', 'group', 'manager', 'client', 'item_id', 'position', 'basis', 'city', 'price', 'requested', 'dev_pct', 'qty', 'acted'],
  au_settings: ['key', 'value', 'note'],
  au_log: ['t', 'kind', 'info']
};
// запасные правила обнаружения — те же, что scenarios.*.detect_rx в bot_rules.json (04.11)
var AU_RX_RECL = 'брак|дефект|слома|трещин|скол|царапин|порва|разош|не работает|не фиксир|рекламац|претенз|возврат|замен';
var AU_RX_RECL_STRONG = /брак|дефект|слома|трещин|скол|царапин|порва|разош|не работает|не фиксир|рекламац/;
var AU_RX_DISPUTE = 'спор|конфликт|отказ\\w* (от|принять|приним|оплат|плат)|не (хотят|хочет|будут|будет) (принимать|платить|оплачивать|забирать)|вернуть деньги|возврат денег|неустойк|штраф|суд|юрист|претенз|требу\\w* замен|не соответству|не то,? что заказ';
var AU_RX_DISPUTE_STRONG = /(^|[^а-яa-z])спор(?!т)|конфликт|отказ\w* (от|принять|приним|оплат|плат)|не (хотят|хочет|будут|будет) (принимать|платить|оплачивать|забирать)|вернуть деньги|возврат денег|неустойк|штраф|(^|[^а-яa-z])суд|юрист|не соответству|не то,? что заказ|требу\w* замен/;   // \b в JS не знает кириллицы — границы слов вручную
var AU_RX_PRICE = 'цен[аыу]|стоимост|почем|почём|сколько стоит|скидк|дешевл|последн\\w* цен|прайс|₽|руб';
var AU_RX_PRICE_ASK = /скидк|дешевл|сколько стоит|почем|прайс|последн\w* цен|стоимост|цен[аыу](?![а-я])|за штук|₽|руб/;
var AU_RX_HIDDEN = /через \d+ (мес|недел|год)|гарант|скрыт|спустя|эксплуатац|разош|через (месяц|полгода|год)|после (месяца|года)/;
var AU_RX_LOOKS = /оттен|цвет|внешн|не так(ой|ая|ие), как|на фото|каталог|образ(ец|цу)|отлича/;
var AU_RX_PAY = /не (хотят|хочет|будут|будет) (платить|оплачивать)|оплат|отсрочк|долг|задолж/;
var AU_RX_DELAY = /срок[аи]? (поставк|просроч)|просроч|опоздал|задерж|не вовремя|позже срока/;
var AU_RX_MONEY = /деньг|скидк|компенсац|вернуть|виноват|вина|неустойк|штраф|пен[яи]\b/;
var AU_RX_NOT_OURS = /договор (клиента|заказчика|покупателя|их|не наш|иной|другой)|(их|не наш|чужой|сторонний|клиентск\w*) договор|по (их|его) (форме|договору)|протокол разногласий/;
var AU_GENERIC = { 'стул': 1, 'кресл': 1, 'диван': 1, 'стол': 1, 'new': 1, 'компл': 1, 'набор': 1, 'шт': 1 };
var AU_SYN = { 'велюр': 'velur', 'веллюр': 'velur', 'экокож': 'eco', 'эко': 'eco', 'наппа': 'nappa', 'хуго': 'hugo', 'альянс': 'allianc', 'бум': 'boom' };
// руководители (RULES 03.11, leaders.json): бот вопросов не задаёт — помогает сроками и пунктами. Лист au_settings: leader / not_leader добавляют и убирают.
var AU_LEADERS = [
  { fio: 'Сотрудник1 Сотрудник2 Отчество1', names: ['Сотрудник2 М', 'Сотрудник2 Сотрудник1', 'Сотрудник1 Сотрудник2', 'Сотрудник2 Отчество1', 'Т. В. Сотрудник1'], mail: ['user5@example.org', 'user4@example.org'], uniq: false },
  { fio: 'Сотрудник29 Сотрудник90 Отчество35', names: ['Сотрудник90 Сотрудник29', 'Сотрудник90 Отчество35'], mail: ['user42@example.org'], uniq: true },
  { fio: 'Сотрудник13 Сотрудник17 Отчество29', names: ['Сотрудник17 Сотрудник13', 'Сотрудник17 Отчество29'], mail: ['user37@example.org'], uniq: true },
  { fio: 'Сотрудник42 Сотрудник48 Отчество1', names: ['Сотрудник48 Сотрудник42', 'Сотрудник48 Отчество1'], mail: ['user39@example.org'], uniq: false },
  { fio: 'Сотрудник26 Сотрудник58 Отчество12', names: ['Сотрудник58 Сотрудник26', 'Сотрудник58 Отчество12'], mail: ['user17@example.org'], uniq: true },
  { fio: 'Сотрудник16 Сотрудник47 Отчество11', names: ['Сотрудник47 Сотрудник16', 'Сотрудник47 Отчество11'], mail: ['user18@example.org'], uniq: true },
  { fio: 'Сотрудник1 Сотрудник63 Отчество27', names: ['Сотрудник63 Сотрудник1', 'Сотрудник1 Сотрудник63'], mail: ['user6@example.org'], uniq: false }
];
var AU_MEMO = { rules: undefined, price: undefined, set: undefined, ss: null, items: null };

// ================================================================ свойства, режим, данные
function au_prop_(k) { return String(PropertiesService.getScriptProperties().getProperty(k) || '').trim(); }
function au_mode_() { return au_prop_('MODE') === 'google'; }
/** Какой это бот: 'tg' | 'max' | '' — по свойствам проекта (BOT_NAME, TG_TOKEN / константа GAS_VER, MAX_TOKEN). */
function au_bot_() {
  var n = au_prop_('BOT_NAME').toLowerCase();
  if (/telegram|tg/.test(n)) return 'tg'; if (/max|макс/.test(n)) return 'max';
  if (au_prop_('TG_TOKEN') || typeof GAS_VER === 'string') return 'tg';
  if (au_prop_('MAX_TOKEN')) return 'max';
  return '';
}
function au_err_(e) { return String(e && e.message ? e.message : e).slice(0, 200); }
/** bot_rules.json из «Для ботов» (один раз за запуск); нет файла или ошибка — null (встроенные запасные правила). */
function au_rules_() {
  if (AU_MEMO.rules !== undefined) return AU_MEMO.rules;
  var r = null; try { r = bf_json('bot_rules.json'); } catch (e) { console.log('au_rules: ' + au_err_(e)); }
  AU_MEMO.rules = r && typeof r === 'object' ? r : null; return AU_MEMO.rules;
}
/** price_now.json (один раз за запуск) | null. */
function au_price_() {
  if (AU_MEMO.price !== undefined) return AU_MEMO.price;
  var p = null; try { p = bf_json('price_now.json'); } catch (e) { console.log('au_price: ' + au_err_(e)); }
  AU_MEMO.price = p && p.items ? p : null; return AU_MEMO.price;
}
function au_scen_(kind) { var R = au_rules_(); return (R && R.scenarios && R.scenarios[kind]) || {}; }
function au_rx_(s, fallback) { try { return new RegExp(String(s || fallback), 'i'); } catch (e) { return new RegExp(fallback, 'i'); } }

// ================================================================ общая таблица au_*
/** Общая таблица автономности (обоих проектов): AU_SHEET_ID → кэш id → поиск по имени на Диске (самая старая) → создать. */
function au_ss_() {
  if (AU_MEMO.ss) return AU_MEMO.ss;
  var P = PropertiesService.getScriptProperties(), id = au_prop_('AU_SHEET_ID'), c = CacheService.getScriptCache();
  if (id) { try { AU_MEMO.ss = SpreadsheetApp.openById(id); return AU_MEMO.ss; } catch (e) { console.log('au_ss: AU_SHEET_ID не открывается — ищу по имени'); } }
  try { id = c.get('au:ss') || ''; } catch (e1) { id = ''; }
  if (id) { try { AU_MEMO.ss = SpreadsheetApp.openById(id); return AU_MEMO.ss; } catch (e2) { id = ''; } }
  var lock = LockService.getScriptLock(), got = false; try { got = lock.tryLock(10000); } catch (e3) { got = false; }
  try {
    var it = DriveApp.getFilesByName(AU_SHEET_NAME), best = null, bt = Infinity;
    while (it.hasNext()) { var f = it.next(); if (f.isTrashed()) continue; var t = f.getDateCreated().getTime(); if (t < bt) { bt = t; best = f; } }
    var ss = best ? SpreadsheetApp.openById(best.getId()) : SpreadsheetApp.create(AU_SHEET_NAME);
    try { P.setProperty('AU_SHEET_ID', ss.getId()); } catch (e4) { /* свойство не обязательно */ }
    try { c.put('au:ss', ss.getId(), 21600); } catch (e5) { /* кэш не обязателен */ }
    AU_MEMO.ss = ss; return ss;
  } finally { if (got) lock.releaseLock(); }
}
/** Лист по имени (создаётся с заголовком). */
function au_sheet_(name) {
  var ss = au_ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(AU_SHEETS[name]); }
  else if (sh.getLastRow() === 0) sh.appendRow(AU_SHEETS[name]);
  return sh;
}
/** Все строки листа → [{_row, <колонки>}]. */
function au_rows_(name) {
  var sh = au_sheet_(name), n = sh.getLastRow(), H = AU_SHEETS[name], out = []; if (n < 2) return out;
  var V = sh.getRange(2, 1, n - 1, H.length).getValues();
  for (var i = 0; i < V.length; i++) { var o = { _row: i + 2 }; for (var j = 0; j < H.length; j++) o[H[j]] = V[i][j]; out.push(o); }
  return out;
}
function au_cell_(v) { v = v == null ? '' : v; if (v instanceof Date) return v; if (typeof v === 'object') v = JSON.stringify(v); return String(v).slice(0, 2000); }
function au_append_(name, o) { var H = AU_SHEETS[name]; au_sheet_(name).appendRow(H.map(function (k) { return au_cell_(o[k]); })); }
/** Обновить поля записи ПО КЛЮЧУ id (столбец 1): строка ищется заново в момент записи (C-A3 — никаких сохранённых номеров строк
    через границу замка: общую таблицу пишут оба проекта, а ScriptLock у каждого свой). → true — записано, false — записи с таким id нет. */
function au_updateById_(name, id, o) {
  var H = AU_SHEETS[name], sh = au_sheet_(name), n = sh.getLastRow(); if (n < 2 || !id) return false;
  var f = sh.getRange(2, 1, n - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext(); if (!f) return false;
  var row = f.getRow();
  for (var k in o) { var j = H.indexOf(k); if (j >= 0) sh.getRange(row, j + 1).setValue(au_cell_(o[k])); }
  return String(sh.getRange(row, 1).getValue()) === String(id);               // перепроверка: строка не сдвинулась во время записи
}
function au_ms_(v) { if (v instanceof Date) return v.getTime(); var n = Number(v); if (n) return n; var d = new Date(v).getTime(); return isNaN(d) ? 0 : d; }
/** Журнал au_log (без персональных данных: почты/телефоны/ip маскируются). Никогда не бросает исключение. */
function au_log_(kind, info) {
  try {
    var sh = au_sheet_('au_log'); sh.appendRow([new Date(), String(kind), au_maskContacts(String(info || '')).text.slice(0, 300)]);
    var n = sh.getLastRow(); if (n > AU_LOG_KEEP + 200) sh.deleteRows(2, n - 1 - AU_LOG_KEEP);
  } catch (e) { console.log('au_log: ' + au_err_(e)); }
}
/** Под замком скрипта (ScriptLock проекта — защищает от параллельных запусков ЭТОГО проекта; второй проект пишет ту же таблицу под своим замком,
    поэтому записи — только по ключу id, физическое удаление — только au_compact в одном проекте). Замок не получен за AU_LOCK_MS → fn НЕ выполняется
    (fail-closed; C-A3), возвращается busy. Не вызывать au_* под своим ScriptLock (повторный tryLock той же исполняемой функции не гарантирован). */
var AU_LOCK_MS = 5000;
function au_lock_(fn, busy) {
  var lock = LockService.getScriptLock(), got = false; try { got = lock.tryLock(AU_LOCK_MS); } catch (e) { got = false; }
  if (!got) { console.log('au_lock: замок занят — операция не выполнена'); return busy; }
  try { return fn(); } finally { lock.releaseLock(); }
}
/** Настройки листа au_settings: {leader:[], not_leader:[], holiday:{}, workday:{}, ban:[], quiet_from, quiet_to} (кэш AU_SET_TTL). */
function au_settings_() {
  if (AU_MEMO.set) return AU_MEMO.set;
  var c = CacheService.getScriptCache(), s = null; try { s = c.get('au:set'); } catch (e) { s = null; }
  if (s) { try { AU_MEMO.set = JSON.parse(s); return AU_MEMO.set; } catch (e1) { /* перечитаем */ } }
  var S = { leader: [], not_leader: [], holiday: {}, workday: {}, ban: [], quiet_from: null, quiet_to: null };
  try {
    au_rows_('au_settings').forEach(function (r) {
      var k = String(r.key || '').trim().toLowerCase(), v = String(r.value || '').trim(); if (!k || !v) return;
      if (k === 'leader' || k === 'not_leader' || k === 'ban') S[k].push(v);
      else if (k === 'holiday' || k === 'workday') S[k][au_dateStr_(v)] = 1;
      else if (k === 'quiet_from' || k === 'quiet_to') S[k] = Number(v);
    });
  } catch (e2) { console.log('au_settings: ' + au_err_(e2)); }
  try { c.put('au:set', JSON.stringify(S), AU_SET_TTL); } catch (e3) { /* кэш не обязателен */ }
  AU_MEMO.set = S; return S;
}

// ================================================================ время МСК, рабочие дни, праздники
function au_msk_(ms) {
  var d = new Date(Number(ms) || Date.now()), f = function (p) { return Utilities.formatDate(d, 'Europe/Moscow', p); };
  return { date: f('yyyy-MM-dd'), h: Number(f('H')), m: Number(f('m')), u: Number(f('u')), ms: d.getTime() };
}
/** 'yyyy-MM-dd' из строки даты/Date/мс ('05.11.2026' тоже). */
function au_dateStr_(v) {
  if (v instanceof Date) return au_msk_(v.getTime()).date;
  var s = String(v || '').trim(), m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  var n = Number(s); return n > 1e11 ? au_msk_(n).date : s;
}
/** Полночь МСК даты 'yyyy-MM-dd' в мс. */
function au_dayMs_(date) { var p = String(date).split('-'); return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) - 3 * 3600000; }
function au_addDays_(date, n) { return au_msk_(au_dayMs_(date) + n * 86400000 + 12 * 3600000).date; }
function au_holidays_() {
  var S = au_settings_(), R = au_rules_(), H = {}; for (var k in S.holiday) H[k] = 1;
  ((R && R.holidays) || []).forEach(function (d) { H[au_dateStr_(d)] = 1; });
  return H;
}
/** Рабочий день: пн–пт и не праздник (лист au_settings: holiday добавляет выходной, workday — рабочую субботу). */
function au_isWorkday_(date) {
  var S = au_settings_(); if (S.workday[date]) return true;
  if (au_holidays_()[date]) return false;
  var u = Number(Utilities.formatDate(new Date(au_dayMs_(date) + 12 * 3600000), 'Europe/Moscow', 'u'));
  return u <= 5;
}
/** Дата через n рабочих дней после date (выходные и праздники в срок не входят). */
function au_addWorkdays_(date, n) { var d = date, k = 0; while (k < n) { d = au_addDays_(d, 1); if (au_isWorkday_(d)) k++; } return d; }
/** Срок проверки наблюдения: AU_WATCH_HOUR МСК дня через AU_WATCH_WD рабочих дней после сообщения. */
function au_due_(tMs) { return au_dayMs_(au_addWorkdays_(au_msk_(tMs).date, AU_WATCH_WD)) + AU_WATCH_HOUR * 3600000; }
/** Тихие часы: 19:00–07:00 МСК (au_settings quiet_from/quiet_to) и праздники (bot_rules.holidays + au_settings holiday). Без MODE google — только часы. */
function au_isQuiet(nowMs) {
  var k = au_msk_(nowMs);
  if (!au_mode_()) return k.h >= AU_QUIET_FROM || k.h < AU_QUIET_TO;                 // без режима google — только часы, без Диска и таблиц
  var S = au_settings_(), from = S.quiet_from === null || isNaN(S.quiet_from) ? AU_QUIET_FROM : S.quiet_from, to = S.quiet_to === null || isNaN(S.quiet_to) ? AU_QUIET_TO : S.quiet_to;
  if (from > to ? (k.h >= from || k.h < to) : (k.h >= from && k.h < to)) return true;
  return !!au_holidays_()[k.date] && !S.workday[k.date];
}
/** Праздник ли день (мс любого момента этого дня МСК): bot_rules.holidays + лист au_settings (holiday добавляет, workday — рабочая суббота).
    Один источник праздников для обоих проектов (проверка 2, 05.11): таймеры MAX (tm_*) берут его при наличии, иначе свой список TM_HOLIDAYS.
    Без MODE google — false (без Диска и таблиц). Выходные (сб, вс) здесь не считаются — для них au_isWorkday_. */
function au_isHoliday(dateMs) {
  if (!au_mode_()) return false;
  var date = au_msk_(dateMs).date, S = au_settings_();
  return !!au_holidays_()[date] && !S.workday[date];
}
/** Подпись ответов в личках: днём — от имени Т. В. (AU_SIGN), в тихие часы 19–07 и праздники — голос бота (AU_SIGN_BOT): человек сам написал боту,
    ответить можно, но ночью от имени владельца не пишем и ничего не инициируем (проверка 2, 05.11). В группах тихие часы — только чтение (вызывающий). */
function au_sign(nowMs) { return au_isQuiet(nowMs || Date.now()) ? AU_SIGN_BOT : AU_SIGN; }
/** Из редактора, один раз при переключении (любой из проектов): общая таблица автономности с листами, id — в журнал выполнения (не секрет),
    чтобы вписать AU_SHEET_ID во второй проект и оба точно писали в одну таблицу. Ничего не отправляет. */
function au_setup() {
  var ss = au_ss_(); Object.keys(AU_SHEETS).forEach(function (n) { au_sheet_(n); });
  console.log('таблица «' + AU_SHEET_NAME + '»: AU_SHEET_ID = ' + ss.getId() + ' (впишите это свойство во второй проект)');
  return ss.getId();
}
function au_dmy_(date) { var p = String(date).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

// ================================================================ люди: руководители, обращение, запреты
function au_nrm_(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[.,;:!?()«»"']/g, ' ').replace(/\s+/g, ' ').trim(); }
/** Руководитель ли (имя, «Фамилия И.», почта или id MAX/Telegram): встроенный список RULES 03.11 + лист au_settings (leader добавляет, not_leader убирает). */
function au_isLeader(nameOrId) {
  var raw = String(nameOrId == null ? '' : nameOrId).trim().toLowerCase(), S = au_mode_() ? au_settings_() : { leader: [], not_leader: [], ban: [] };   // без google — встроенный список
  if (raw.indexOf('@') > 0) return AU_LEADERS.some(function (L) { return L.mail.indexOf(raw) >= 0; }) || S.leader.some(function (x) { return String(x).trim().toLowerCase() === raw; });
  var s = au_nrm_(raw); if (!s) return false;
  if (S.not_leader.some(function (x) { return au_nrm_(x) === s; })) return false;
  if (S.leader.some(function (x) { return au_nrm_(x) === s; })) return true;
  if (/^\d+$/.test(s)) return false;                                    // числовой id — только из au_settings
  var toks = s.split(' ').filter(function (t) { return t.length > 1 || /^[а-яa-z]$/.test(t); });
  function hit(L) {
    if (au_nrm_(L.fio) === s || L.names.some(function (n) { return au_nrm_(n) === s; }) || L.mail.indexOf(s) >= 0) return true;
    var F = au_nrm_(L.fio).split(' '), sur = F[0], nm = F[1] || '', pat = F[2] || '';
    if (toks.indexOf(sur) < 0) return false;
    var rest = toks.filter(function (t) { return t !== sur; });
    if (!rest.length) return L.uniq;                                      // одна фамилия — только если она однозначна
    return rest.every(function (t) { return (nm && nm.indexOf(t) === 0) || (pat && pat.indexOf(t) === 0); });
  }
  for (var i = 0; i < AU_LEADERS.length; i++) if (hit(AU_LEADERS[i])) return true;
  var extra = S.leader.map(function (x) { return { fio: x, names: [], mail: [], uniq: true }; });
  for (var j = 0; j < extra.length; j++) if (extra[j].fio.split(' ').length > 1 && hit(extra[j])) return true;
  return false;
}
/** Имя7 и Джановой лично бот ничего не адресует (RULES 04.11 ~18:15, bot_rules.bans, лист au_settings ban). */
function au_isBanned_(name) {
  var s = au_nrm_(name); if (!s) return false;
  if (/(^|\s)(попов|джанов)/.test(s)) return true;
  if (!au_mode_()) return false;
  return au_settings_().ban.some(function (b) { b = au_nrm_(b); return b && (s === b || s.indexOf(b) >= 0); });
}
/** Обращение: «Имя Отчество» из ФИО, иначе имя из двух слов, иначе как есть; пусто/запрет — «коллеги». */
function au_address_(name) {
  var raw = String(name || '').replace(/[^\wа-яёА-ЯЁ.\- ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw || au_isBanned_(raw)) return 'коллеги';
  var t = raw.split(' ').filter(String), patr = /(ович|евич|ьич|ич|овна|евна|ична|ьевна|инична)$/i;
  for (var i = 1; i < t.length; i++) if (patr.test(t[i]) && t[i].length > 5 && !/\.$/.test(t[i - 1])) return t[i - 1] + ' ' + t[i];
  if (t.length === 2) {
    var sur = /(ов|ев|ёв|ин|ын|ова|ева|ёва|ина|ына|ский|ская|цкий|цкая|енко|ук|юк|ко|их|ых|ян|дзе|швили|ич)$/i;
    if (sur.test(t[0]) && !sur.test(t[1])) return t[1];
    if (sur.test(t[1]) && !sur.test(t[0])) return t[0];
    if (/^[А-ЯЁA-Z]\.?$/.test(t[1]) || /^[А-ЯЁA-Z]\.?$/.test(t[0])) return raw;
    return t[0];
  }
  return raw;
}

// ================================================================ маскирование контактов для внешних ИИ (Т. В. 04.11 ~21:25)
/** Почты, телефоны и адреса сети → {{email1}}, {{phone1}}, {{ip1}}; ФИО и должности остаются. restore(answer) возвращает контакты в ответ модели.
    Телефоны: +7/8 и 10 цифр с любыми разделителями, международные +NN…, короткие 25-30-40 / 2-30-40; суммы («1 250 000 руб»), даты и годы не трогаются. */
function au_maskContacts(text) {
  var map = {}, cnt = { email: 0, phone: 0, ip: 0 }, back = {};
  function tok(kind, v) {
    var key = kind + ':' + v; if (!map[key]) { cnt[kind]++; map[key] = '{{' + kind + cnt[kind] + '}}'; back[map[key]] = v; }
    return map[key];
  }
  function money(str, pos) { return /^\s*(₽|руб|р\.|р(?![а-яa-z])|рублей|тыс|млн|шт|%)/i.test(str.slice(pos, pos + 10)); }
  var s = String(text == null ? '' : text)
    .replace(/[\w.+\-]+@[\w\-]+(\.[\w\-]+)+/g, function (m) { return tok('email', m); })
    .replace(/(^|[^\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?::\d{2,5})?(?![\d.])/g, function (m, pre) { return pre + tok('ip', m.slice(pre.length)); })
    .replace(/(^|[^\d\w{+])(\+7|[78])[\s(\-]*\d(?:[\s()\-]*\d){9}(?![\d])/g, function (m, pre, pfx, off, str) { return money(str, off + m.length) ? m : pre + tok('phone', m.slice(pre.length)); })
    .replace(/(^|[^\d\w{])\+\d{1,3}[\s(\-]*\d(?:[\s()\-]*\d){6,11}(?![\d])/g, function (m, pre, off, str) { return money(str, off + m.length) ? m : pre + tok('phone', m.slice(pre.length)); })
    .replace(/(^|[^\d\w{\-.])(\d{1,3}[\s\-]\d{2}[\s\-]\d{2})(?![\d\-.])/g, function (m, pre, ph, off, str) { return money(str, off + m.length) || /^\d{1,2}[\s\-]\d{2}[\s\-]\d{2}$/.test(ph) && /^\s*(г|мин|час|ч(?![а-я]))/.test(str.slice(off + m.length, off + m.length + 5)) ? m : pre + tok('phone', ph); });
  var n = cnt.email + cnt.phone + cnt.ip;
  return {
    text: s, n: n,
    restore: function (answer) {
      return String(answer == null ? '' : answer).replace(/\{?\{\s*(email|phone|ip)\s*[_\- ]?(\d+)\s*\}\}?/gi, function (m, k, i) {
        var v = back['{{' + k.toLowerCase() + i + '}}']; return v === undefined ? m : v;
      });
    }
  };
}

// ================================================================ обнаружение ситуации
/** Что за ситуация в сообщении: {kind:'recl'|'price'|'dispute'|null, words:[совпавшие слова]}. hasMedia — есть фото/видео. */
function au_detect(text, hasMedia) {
  var out = { kind: null, words: [] };
  if (!au_mode_()) return out;
  var t = String(text || '').toLowerCase().replace(/ё/g, 'е').trim(); if (!t || t.indexOf(AU_SIGN.toLowerCase()) === 0 || t.indexOf(AU_SIGN_BOT.toLowerCase().replace(/ё/g, 'е')) === 0) return out;   // свои ответы (подпись Т. В. или бота) — не повод
  var reclRx = au_rx_(au_scen_('recl').detect_rx, AU_RX_RECL), dispRx = au_rx_(au_scen_('dispute').detect_rx, AU_RX_DISPUTE), priceRx = au_rx_(au_scen_('price').detect_rx, AU_RX_PRICE);
  // 10.11 Т. В.: отчёт («ОП …» в начале или нумерованный список от 3 строк) — не повод для автоответа; строка со счётом («выставлен сч…») — продажа, не рекламация
  var lines = t.split(/\n+/), nNum = lines.filter(function (s) { return /^\s*\d{1,3}\s*[.)]?\s+\S/.test(s); }).length;
  if (/^оп\s/.test(t) || nNum >= 3) return out;
  var tr = lines.filter(function (s) { return !/выставлен\S*\s+сч|сч\S*\s+(на оплату|на согласование|выставлен)/.test(s); }).join('\n');
  function words(rx, s) { s = s == null ? t : s; var g = new RegExp(rx.source, 'gi'), m, w = [], seen = {}; while ((m = g.exec(s)) && w.length < 6) { var x = m[0].trim(); if (x && !seen[x]) { seen[x] = 1; w.push(x); } if (!m[0]) g.lastIndex++; } return w; }
  var recl = words(reclRx, tr), disp = words(dispRx), price = words(priceRx);
  if (hasMedia && recl.length) return { kind: 'recl', words: recl };
  if (AU_RX_DISPUTE_STRONG.test(t) && disp.length) return { kind: 'dispute', words: disp };
  if (AU_RX_RECL_STRONG.test(tr) && recl.length) return { kind: 'recl', words: recl };
  if (/претенз/.test(t) && disp.length) return { kind: 'dispute', words: disp };
  if (price.length) { var N = au_numbers_(t); if (AU_RX_PRICE_ASK.test(t) || N.requested !== null || N.pct !== null) return { kind: 'price', words: price }; }
  return out;
}

// ================================================================ рекламация: ответ от имени Т. В.
/** Юрлицо/вид договора по тексту: 'ЖПС' | 'ПКС' | 'ФТС' | 'экспорт ЖПС' | 'ФТС монтаж' | '' (не названо). */
function au_contractOf_(text) {
  var t = String(text || '').replace(/ё/g, 'е');
  if (/монтаж/i.test(t) && /фтс/i.test(t)) return 'ФТС монтаж';
  if (/экспорт/i.test(t) && /жпс|жилпромсервис/i.test(t)) return 'экспорт ЖПС';
  if (/(^|[^а-яa-z])пкс(?![а-яa-z])/i.test(t)) return 'ПКС';
  if (/(^|[^а-яa-z])фтс(?![а-яa-z])/i.test(t)) return 'ФТС';
  if (/(^|[^а-яa-z])жпс(?![а-яa-z])|жилпромсервис/i.test(t)) return 'ЖПС';
  if (/поставк\w* и монтаж|договор\w* монтаж/i.test(t)) return 'ФТС монтаж';
  return '';
}
/** Пункты договора по юрлицу: {cp: {...}, name, known} (нет bot_rules — cp пустой). */
function au_points_(contract) {
  var R = au_rules_(), CP = (R && R.contract_points) || {}, c = contract && CP[contract] ? contract : (CP['ЖПС'] ? 'ЖПС' : '');
  return { cp: c ? CP[c] : {}, name: c, known: !!contract && !!CP[contract], note: String(CP.note || '') };
}
/** «п. 6.4» из поля contract_points (с пояснением в скобках — только номер). '' — пункта нет. */
function au_pt_(cp, key) {
  var v = String(cp && cp[key] || '').trim(); if (!v || v.charAt(0) === '—') return '';
  var m = /^([\d.]+(?:\s*[,и]\s*[\d.]+)*)/.exec(v); return m ? (m[1].indexOf(',') > 0 || / и /.test(m[1]) ? 'пп. ' : 'п. ') + m[1].replace(/\.$/, '') : '';
}
function au_withPt_(cp, key, tail) { var p = au_pt_(cp, key); return p ? ' (' + p + (tail || '') + ')' : ''; }
/** Несколько пунктов одной скобкой: ' (пп. 6.1, 6.3)' | ' (п. 6.1)' | ''. */
function au_withPts_(cp, keys) {
  var a = []; keys.forEach(function (k) { var p = au_pt_(cp, k); if (p) a.push(p.replace(/^пп?\. /, '')); });
  return a.length ? ' (' + (a.length > 1 || /,| и /.test(a[0]) ? 'пп. ' : 'п. ') + a.join(', ') + ')' : '';
}
/** Статья ГК из bot_rules.gk (только проверенные): 'ст. 513 п. 2 ГК РФ' | '' (нет в списке). */
function au_gk_(art, p) {
  var R = au_rules_(), L = (R && R.gk) || [];
  for (var i = 0; i < L.length; i++) if (String(L[i].art) === String(art)) return 'ст. ' + art + (p ? ' ' + p : '') + ' ГК РФ';
  return '';
}
function au_joinGk_(list) { var a = list.filter(String); return a.length ? a.join(', ') : ''; }
/** Сроки регламента: {pto, client} дней из reg_terms (нет — 5 и 3). */
function au_regDays_() {
  var R = au_rules_(), out = { pto: 5, client: 3 };
  ((R && R.reg_terms) || []).forEach(function (x) { if (!x.days) return; if (/ПТО рассматривает/.test(x.what)) out.pto = x.days; if (/ответ клиенту/.test(x.what)) out.client = x.days; });
  return out;
}
/** Ответ на рекламацию от имени Т. В.: акт по форме РК 01 на почту (и technolog@ с № рекламации 1С), сроки по пунктам нашего договора
    и регламенту, 1–2 проверенные статьи ГК. ctx = {name, text, hasMedia, words, group, sign?, contract?, hidden?}. Руководителю —
    без просьб (только сроки и пункты). → текст ('' — MODE не google). */
function au_reclReply(ctx) {
  if (!au_mode_()) return '';
  ctx = ctx || {};
  var nm = ctx.name || ctx.who || ctx.manager || '', sign = String(ctx.sign || au_sign()), who = au_address_(nm), leader = au_isLeader(nm), text = String(ctx.text || '');   // ctx.sign не задан — днём Т. В., в тихие часы голос бота (au_sign)
  var contract = ctx.contract || au_contractOf_(text), P = au_points_(contract), cp = P.cp, works = P.name === 'ФТС монтаж';
  var hidden = ctx.hidden === true || (ctx.hidden !== false && AU_RX_HIDDEN.test(text.toLowerCase().replace(/ё/g, 'е')));
  var reg = au_regDays_(), R = au_rules_();
  var actTo = (R && R.scenarios && R.scenarios.recl && R.scenarios.recl.act_to && R.scenarios.recl.act_to[0]) || AU_ITM;
  var pto = (R && R.scenarios && R.scenarios.recl && R.scenarios.recl.pto) || AU_PTO;
  var L = [];
  L.push(sign + ' — ' + who + ', добрый день! ' + (ctx.hasMedia ? 'Спасибо, что сразу показали фото.' : 'Спасибо, что сразу написали.'));
  var act = 'акт рекламации по форме РК 01 (приложение № 1 к договору): на бланке клиента, с подписью и печатью; № и дата накладной' + (works ? ' или УПД' : '') +
    ', № договора; описание дефекта и что клиент просит; фото каждого изделия с дефектом (сколько изделий — столько фото или видео), фото ярлыка и упаковки';
  L.push((leader ? 'Чтобы ПТО взяло рекламацию в работу, понадобится ' + act + '. Акт — на ' + actTo : 'Чтобы мы быстро разобрались и помогли клиенту, попросите, пожалуйста, у него ' + act + '. Акт пришлите, пожалуйста, на ' + actTo) +
    ', а после регистрации в 1С — на ' + pto + ' с темой «Рекламация № … от …» (номер из 1С).');
  var S = [];
  if (works) {
    S.push('Сроки по договору поставки и монтажа (ФТС): заказчик осматривает и принимает товар и работы в течение 2 календарных дней с уведомления о готовности и сразу сообщает о недостатках — запись в акте работ и УПД, акт о недостатках с фото' + au_withPt_(cp, 'accept_goods_and_works_2cd') +
      '; акт о недостатках мы рассматриваем 10 рабочих дней' + au_withPt_(cp, 'review_10wd_claim_limit_10wd') + '; ответ на акт рекламации — письмом в течение 10 рабочих дней' + au_withPt_(cp, 'may_reject_answer_10wd') +
      '; гарантия на товар и работы — 12 месяцев с даты УПД или акта работ' + au_withPt_(cp, 'warranty_12m_from_upd_act') + '.');
  } else {
    var head = P.name ? 'Сроки по нашему типовому договору (' + P.name + (P.known ? '' : '; у ПКС и ФТС номера пунктов чуть другие — уточню, если скажете, какое юрлицо') + ')' : 'Сроки по нашему типовому договору';
    if (hidden) {
      S.push(head + ': это похоже на скрытый дефект — такие претензии рассматриваются в гарантийный срок 12 месяцев с даты поставки при правильно оформленном акте с фото' + au_withPt_(cp, 'hidden_warranty_12m') +
        '; ответ на акт — письмом в течение 10 рабочих дней с его получения' + au_withPt_(cp, 'may_reject_answer_10wd') + '.');
    } else {
      S.push(head + ': проверка количества, комплектности и качества — не позднее 5 рабочих дней с передачи товара' + au_withPt_(cp, 'accept_5wd') + '; о недостатке — сразу сообщить и составить акт с фото' + au_withPt_(cp, 'notify_act_photo') +
        '; претензия по видимым недостаткам — не позже 10 рабочих дней с передачи, акт мы рассматриваем 10 рабочих дней' + au_withPt_(cp, 'review_10wd_claim_limit_10wd') + '; скрытые дефекты — в гарантийный срок 12 месяцев' + au_withPt_(cp, 'hidden_warranty_12m') + '.');
    }
  }
  S.push('По регламенту Р-КО-01: ПТО рассматривает рекламацию ' + reg.pto + ' дней с регистрации в 1С и полного пакета документов, ответ клиенту — не позднее ' + reg.client + ' дней после ответа ПТО.');
  L.push(S.join(' '));
  var gk = works ? au_joinGk_([au_gk_('720', 'пп. 2–3'), au_gk_('724', 'п. 3')]) : hidden ? au_joinGk_([au_gk_('476', 'п. 2'), au_gk_('477', 'п. 3')]) : au_joinGk_([au_gk_('513', 'п. 2'), au_gk_('483', 'п. 1')]);
  if (gk) {
    L.push('По закону: ' + (works ? 'на недостатки, оговорённые в акте приёмки, заказчик может ссылаться, а явные недостатки, не отмеченные при приёмке, потом не принимаются; требования — по недостаткам, обнаруженным в гарантийный срок'
      : hidden ? 'на товар с гарантией продавец отвечает за недостатки, если не докажет, что они появились после передачи из-за нарушения правил эксплуатации или хранения; требования предъявляются по недостаткам, обнаруженным в гарантийный срок'
      : 'покупатель проверяет товар в срок, установленный договором, и о недостатках незамедлительно письменно сообщает поставщику') + ' (' + gk + ').');
  }
  L.push('Через ' + AU_WATCH_WD + ' рабочих дня загляну в реестр рекламаций 1С. ' + (leader ? 'Если нужна помощь с актом — подключимся.' : 'Если что-то мешает или нужна помощь с актом — напишите, подключимся.'));
  return L.join('\n');
}

// ================================================================ наблюдение за рекламацией: лист au_recl_watch, реестр recl.bin
function au_id_(prefix) { return prefix + Date.now().toString(36) + Utilities.getUuid().replace(/-/g, '').slice(0, 4); }
/** Записать наблюдение: rec = {group, chat|cid, mid, client, defect, manager, t}. Повтор (тот же чат и mid; тот же клиент+дефект за сутки; без mid — тот же
    менеджер+дефект за час) — не дублируется.
    → id записи | '' (дубль или MODE не google). */
function au_reclWatchAdd(rec) {
  if (!au_mode_() || !rec) return '';
  var chat = String(rec.chat || rec.cid || ''), mid = String(rec.mid || ''), t = au_ms_(rec.t) || Date.now();
  var client = String(rec.client || '').trim().slice(0, 120), defect = String(rec.defect || '').trim().slice(0, 120), manager = String(rec.manager || '').trim().slice(0, 120);
  return au_lock_(function () {
    var R = au_rows_('au_recl_watch');
    for (var i = 0; i < R.length; i++) {
      var r = R[i]; if (String(r.chat) !== chat) continue;
      if (mid && String(r.mid) === mid) return '';
      if (client && au_nrm_(r.client) === au_nrm_(client) && au_nrm_(r.defect) === au_nrm_(defect) && Math.abs(au_ms_(r.t) - t) < 86400000) return '';
      if (!mid && au_nrm_(r.manager) === au_nrm_(manager) && au_nrm_(r.defect) === au_nrm_(defect) && Math.abs(au_ms_(r.t) - t) < 3600000) return '';   // повтор вебхука без id сообщения
    }
    var id = au_id_('w');
    au_append_('au_recl_watch', { id: id, t: new Date(t), bot: au_bot_(), group: rec.group, chat: chat, mid: mid, client: client, defect: defect, manager: manager, due: au_due_(t), status: 'open', checked: '', reminded: '', note: '' });
    au_log_('recl_watch', 'добавлено наблюдение ' + id + ' (' + String(rec.group || chat) + ')');
    return id;
  }, '');                                                                      // замок занят → '' (вызывающий видит «не записано», повтор вебхука запишет)
}
/** Клиент без ООО/ИП/кавычек, нижний регистр → слова. */
function au_clientKey_(s) {
  var F = { 'ооо': 1, 'ип': 1, 'зао': 1, 'оао': 1, 'пао': 1, 'ао': 1, 'нко': 1, 'гк': 1, 'тд': 1, 'компания': 1, 'фирма': 1 };
  return au_nrm_(s).replace(/[^a-zа-я0-9 ]/g, ' ').split(' ').filter(function (w) { return w.length >= 3 && !F[w]; });
}
function au_sameClient_(a, b) {
  var A = au_clientKey_(a), B = au_clientKey_(b); if (!A.length || !B.length) return false;
  return A.some(function (w) { return B.some(function (v) { return v === w || (w.length >= 5 && v.indexOf(w.slice(0, 5)) === 0) || (v.length >= 5 && w.indexOf(v.slice(0, 5)) === 0); }); });
}
/** Документы реестра (open ∪ all по номеру) → [{no, d, cl, text}] (text — описание дефектов строк). */
function au_reclDocs_(recl) {
  var byNo = {}, out = [];
  [((recl || {}).open || {}).docs || [], ((recl || {}).all || {}).docs || []].forEach(function (D) {
    D.forEach(function (d) {
      if (!d || !d.no) return;
      var o = byNo[d.no] || (byNo[d.no] = { no: String(d.no), d: String(d.d || ''), cl: String(d.cl || ''), text: '' });
      var parts = [];
      (d.l || []).forEach(function (l) { parts.push(String(l.x || ''), String(l.n || ''), String(l.why || '')); });
      (d.why || []).forEach(function (w) { parts.push(String(w)); });
      o.text = (o.text + ' ' + parts.join(' ')).toLowerCase().replace(/ё/g, 'е');
    });
  });
  for (var k in byNo) out.push(byNo[k]);
  return out;
}
/** Есть ли в реестре рекламация по наблюдению: клиент (если известен) совпал и дата ≥ дата сообщения − 1 день; клиента нет — по словам дефекта. */
function au_reclFound_(docs, w) {
  var since = au_addDays_(au_msk_(au_ms_(w.t)).date, -1), client = String(w.client || ''), defect = kb_norm(String(w.defect || ''), null, 8);
  for (var i = 0; i < docs.length; i++) {
    var d = docs[i]; if (!d.d || d.d < since) continue;
    if (client) { if (au_sameClient_(client, d.cl)) return d.no; continue; }
    if (defect.length && defect.some(function (k) { return k.length >= 4 && d.text.indexOf(k) >= 0; })) return d.no;
  }
  return '';
}
/** Проверка наблюдений (таймер 08:30 МСК): прошло AU_WATCH_WD рабочих дня — реестр recl.bin: записи нет → одно мягкое напоминание менеджеру
    в той же группе ([{group, chat, text, id, key}]); есть — наблюдение закрыто. Реестр недоступен или старее сообщения — ждём (не напоминаем по устаревшим данным);
    ещё через AU_WATCH_WD рабочих дня без записи — только Т. В. ({owner:true, text, id, key}; людям второго напоминания нет). → [] в тихие часы и при MODE не google.
    C-A3/C-A4: записи — по ключу id (au_updateById_), физического удаления здесь нет (au_compact); статус reminded/escalated = «решение принято»,
    доставку подтверждает вызывающий через Outbox по key ('au:recl:<id>:chat' | 'au:recl:<id>:owner'); замок занят → [] (следующий запуск). */
function au_reclWatchCheck(nowMs) {
  if (!au_mode_()) return [];
  nowMs = Number(nowMs) || Date.now();
  if (au_isQuiet(nowMs)) return [];
  var out = [], tpl = String(au_scen_('recl').reminder || (AU_SIGN + ' — <Имя Отчество>, добрый день! Подскажите, пожалуйста, как дела с рекламацией <клиент> (<дефект>, сообщение от <дата>)? В реестре 1С я её пока не вижу. Если акт от клиента ещё не пришёл или нужна помощь с оформлением — напишите, подключимся.'));
  var done = au_lock_(function () {
    var R = au_rows_('au_recl_watch'), mine = au_bot_(), recl = undefined, docs = null, asof = '';
    for (var i = R.length - 1; i >= 0; i--) {
      var w = R[i], st = String(w.status || 'open'), t = au_ms_(w.t), due = au_ms_(w.due), id = String(w.id || '');
      if (!id || (st !== 'open' && st !== 'reminded')) continue;
      if (mine && w.bot && String(w.bot) !== mine) continue;              // напоминает тот бот, который видел сообщение
      if (!due || due > nowMs) continue;
      if (recl === undefined) {
        try { recl = bf_json('recl.bin'); } catch (e) { recl = null; au_log_('recl_watch', 'реестр недоступен: ' + au_err_(e)); }
        docs = recl ? au_reclDocs_(recl) : []; asof = recl ? String(((recl.open || {}).asof) || ((recl.all || {}).asof) || '') : '';
      }
      var upd = { checked: new Date(nowMs) };
      if (!recl || !asof || asof < au_msk_(t).date) {                      // реестра нет или он старее сообщения — по таким данным не напоминаем
        upd.note = recl ? 'реестр на ' + asof + ' старее сообщения' : 'реестр недоступен';
        var esc = null;
        if (nowMs - due > 2 * AU_WATCH_WD * 86400000 && st !== 'escalated') {
          upd.status = 'escalated';
          esc = { owner: true, group: String(w.group || ''), chat: '', id: id, key: 'au:recl:' + id + ':owner', text: 'Рекламация ' + (w.client || 'по сообщению от ' + au_dmy_(au_msk_(t).date)) + (w.defect ? ' (' + w.defect + ')' : '') + ' в группе «' + w.group + '»: реестр рекламаций 1С ' + (recl ? 'старее сообщения (на ' + asof + ')' : 'недоступен') + ' — проверьте, пожалуйста, вручную.' };
        }
        if (au_updateById_('au_recl_watch', id, upd) && esc) out.push(esc);   // уведомление — только после записи решения (записи нет — её убрал другой проект)
        continue;
      }
      var no = au_reclFound_(docs, w);
      if (no) { au_updateById_('au_recl_watch', id, { status: 'closed', checked: new Date(nowMs), note: 'в реестре: № ' + no }); au_log_('recl_watch', id + ' закрыто: рекламация в реестре'); continue; }
      if (st === 'open') {
        var txt = tpl.replace('<Имя Отчество>', au_address_(w.manager)).replace('<клиент>', w.client ? String(w.client) : 'по сообщению в группе').replace('<дефект>', w.defect ? String(w.defect) : 'дефект по фото').replace('<дата>', au_dmy_(au_msk_(t).date));
        if (!/^Т\. В\. Сотрудник1/.test(txt)) txt = AU_SIGN + ' — ' + txt;
        if (au_isLeader(w.manager)) txt = AU_SIGN + ' — ' + au_address_(w.manager) + ', добрый день! Рекламации ' + (w.client || 'по сообщению от ' + au_dmy_(au_msk_(t).date)) + (w.defect ? ' (' + w.defect + ')' : '') + ' в реестре 1С пока не вижу — если нужна помощь с актом или регистрацией, подключимся.';
        if (!au_updateById_('au_recl_watch', id, { status: 'reminded', checked: new Date(nowMs), reminded: new Date(nowMs), due: au_due_(nowMs), note: 'напоминание менеджеру' })) continue;   // записи уже нет
        out.push({ group: String(w.group || ''), chat: String(w.chat || ''), id: id, key: 'au:recl:' + id + ':chat', text: txt });
        au_log_('recl_watch', id + ': напоминание менеджеру');
      } else {
        if (!au_updateById_('au_recl_watch', id, { status: 'escalated', checked: new Date(nowMs), note: 'после напоминания записи нет — Т. В.' })) continue;
        out.push({ owner: true, group: String(w.group || ''), chat: '', id: id, key: 'au:recl:' + id + ':owner', text: 'Рекламация ' + (w.client || 'по сообщению от ' + au_dmy_(au_msk_(t).date)) + (w.defect ? ' (' + w.defect + ')' : '') + ' в группе «' + w.group + '»: после напоминания менеджеру ' + (w.manager || '') + ' записи в реестре 1С всё ещё нет.' });
        au_log_('recl_watch', id + ': без записи после напоминания — Т. В.');
      }
    }
    return true;
  }, false);
  if (!done) au_log_('recl_watch', 'замок занят — проверка отложена');
  return done ? out : [];
}
/** Компакция общей таблицы (C-A3): вызывать из ОДНОГО проекта (MAX, ночной тик) — под его замком, по ключам из свежего чтения, снизу вверх,
    с перепроверкой id перед каждым удалением: au_recl_watch — closed/escalated старше AU_WATCH_KEEP_DAYS; au_price — старше AU_PRICE_TTL_DAYS
    (решение по ним уже принято или кнопки истекли). Остальное время строки не удаляются (мягкое удаление статусом). → {watch, price} удалённых. */
function au_compact(nowMs) {
  var out = { watch: 0, price: 0 };
  if (!au_mode_()) return out;
  nowMs = Number(nowMs) || Date.now();
  var r = au_lock_(function () {
    [['au_recl_watch', function (w) { var st = String(w.status || 'open'); return (st === 'closed' || st === 'escalated') && nowMs - au_ms_(w.t) > AU_WATCH_KEEP_DAYS * 86400000; }, 'watch'],
     ['au_price', function (p) { return nowMs - au_ms_(p.t) > AU_PRICE_TTL_DAYS * 86400000; }, 'price']].forEach(function (x) {
      var sh = au_sheet_(x[0]), R = au_rows_(x[0]);
      for (var i = R.length - 1; i >= 0; i--) {
        if (!x[1](R[i])) continue;
        if (String(sh.getRange(R[i]._row, 1).getValue()) !== String(R[i].id)) continue;   // перепроверка ключа: строка сдвинулась — не трогаем
        sh.deleteRow(R[i]._row); out[x[2]]++;
      }
    });
    return out;
  }, null);
  if (!r) { au_log_('compact', 'замок занят — отложено'); return out; }
  if (out.watch || out.price) au_log_('compact', 'удалено: наблюдений ' + out.watch + ', запросов цены ' + out.price);
  return out;
}

// ================================================================ запрос цены: прайс price_now.json
/** Ключи слов для сравнения с прайсом: kb_norm + короткие коды (BL, CH, МБ, ТГ…) + синонимы обивок. */
function au_tok_(s) {
  var t = String(s || '').toLowerCase().replace(/ё/g, 'е'), out = {}, k;
  kb_norm(t, null, 60).forEach(function (w) { out[AU_SYN[w] || w] = 1; });
  (t.match(/[a-zа-я0-9]+/g) || []).forEach(function (w) { if (w.length === 2 && /^[a-zа-я]+$/.test(w)) out[w] = 1; k = AU_SYN[w]; if (k) out[k] = 1; });
  return out;
}
function au_specText_(it) { var s = it.spec || {}, a = []; for (var k in s) if (s[k]) a.push(String(s[k])); return a.join(', '); }
function au_position_(it) { return String(it.model || '') + (au_specText_(it) ? ' — ' + au_specText_(it) : '') + (Number(it.pack) > 1 ? ' (упаковка ' + it.pack + ' шт)' : ''); }
/** Прайс с ключами позиций (один раз за запуск): [{it, mt:[ключи модели без общих слов], all:{}}]. */
function au_items_() {
  if (AU_MEMO.items) return AU_MEMO.items;
  var P = au_price_(), out = [];
  ((P && P.items) || []).forEach(function (it) {
    var mk = Object.keys(au_tok_(it.model)).filter(function (w) { return !AU_GENERIC[w]; });
    if (!mk.length) return;
    out.push({ it: it, mt: mk, all: au_tok_(it.model + ' ' + au_specText_(it) + ' ' + (it.group || '')) });
  });
  AU_MEMO.items = out; return out;
}
/** Базис по тексту: {basis, city, why} — «базис II», город или регион из city_basis (как в тексте). */
function au_basis_(text) {
  var P = au_price_(), t = String(text || '').toLowerCase().replace(/ё/g, 'е'), m = /базис[а-я]*\s*[:—-]?\s*(iv|v|iii|ii|i|[1-5])\b/i.exec(t);
  if (m) { var r = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' }, b = r[m[1]] || m[1].toUpperCase(); return { basis: b, city: au_basisCities_(b), why: 'базис назван в сообщении' }; }
  var CB = (P && P.city_basis) || {}, Q = au_tok_(t), best = null;
  for (var city in CB) {
    var ks = Object.keys(au_tok_(city)); if (!ks.length || !ks.every(function (k) { return Q[k]; })) continue;
    var pos = t.indexOf(city.slice(0, 4));
    if (!best || (pos >= 0 && pos < best.pos)) best = { basis: CB[city], city: city, pos: pos < 0 ? 1e9 : pos };
  }
  if (best) return { basis: best.basis, city: best.city.charAt(0).toUpperCase() + best.city.slice(1), why: 'по городу/региону в сообщении' };
  return { basis: '', city: '', why: 'базис не определён — назовите город клиента или офис продаж' };
}
function au_basisCities_(b) { var P = au_price_(), L = (P && P.bases) || []; for (var i = 0; i < L.length; i++) if (L[i].k === b) return (L[i].cities || []).join(', '); return ''; }
/** Запрошенная цена и количество из текста: {requested, pct, qty}. Числа, приклеенные к буквам (BOX4, Альфа(700)), номера документов
    (№ 123, 123/26), годы и количества (10 шт) ценой не считаются; «19 900» читается как 19900. */
function au_numbers_(text) {
  var t = String(text || '').replace(/ё/g, 'е').replace(/(\d)[\s ](?=\d{3}(?!\d))/g, '$1'), out = { requested: null, pct: null, qty: null };
  var pm = /(\d{1,2}(?:[.,]\d)?)\s*%/.exec(t); if (pm) out.pct = Number(pm[1].replace(',', '.'));
  var qm = /(\d{1,4})\s*(шт|штук|изделий|кресел|кресла|стульев|стула|единиц|ед\.)/i.exec(t); if (qm) out.qty = Number(qm[1]);
  var re = /(^|[^\w(\-])(\d{3,7})(?:[.,](\d{1,2}))?(?![\w)%])/g, m, strong = [], weak = [];
  while ((m = re.exec(t))) {
    var val = Number(m[2] + (m[3] ? '.' + m[3] : '')), after = t.slice(m.index + m[0].length, m.index + m[0].length + 12), before = t.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
    if (/^\s*(шт|штук|изделий|кресел|стул|единиц|ед\.|%|мес|дн|день|год|г\.|мм|см|кг|[\/\-]\d)/i.test(after)) continue;
    if (/(№|#|n|заказ\w*|сч[её]т\w*|договор\w*|накладн\w*|упд)\s*[:—-]?\s*$/i.test(before)) continue;
    if (/^(19|20)\d{2}$/.test(m[2]) && !/^\s*(₽|руб|р\.)/i.test(after)) continue;                          // год, не цена
    if (/^\s*(₽|руб|р\.|р(?![а-яa-z])|рублей)/i.test(after) || /(по|за|цен[аыу]|стоит|просит|предлага|готов|хочет|хотят|дать|дайте|отда|за штуку|за шт)\s*[:—-]?\s*$/.test(before)) strong.push(val); else weak.push(val);
  }
  if (strong.length) out.requested = strong[strong.length - 1]; else if (weak.length === 1 && weak[0] >= 100) out.requested = weak[0];
  return out;
}
function au_fmtMoney_(n) { var s = String(Math.round(Number(n) || 0)), o = ''; while (s.length > 3) { o = ' ' + s.slice(-3) + o; s = s.slice(0, -3); } return s + o; }
/** Поиск позиции прайса по словам и базису: {found, item, basis, city, basis_why, price, prices, requested, qty, dev_pct, same, variants, id, note}.
    Нет позиции — found=false и note с пояснением. ctx (необязательно) = {chat|cid, group, manager|name, client, mid} — для кнопок и письма ПЭО. */
function au_priceLookup(text, ctx) {
  var out = { found: false, item: null, basis: '', city: '', basis_why: '', price: null, prices: null, requested: null, qty: null, dev_pct: null, same: [], variants: [], id: '', note: '' };
  if (!au_mode_()) { out.note = 'MODE не google'; return out; }
  var P = au_price_(); if (!P) { out.note = 'прайс (price_now.json) недоступен в «Для ботов»'; return out; }
  var items = au_items_(), Q = au_tok_(text), cand = [];
  for (var i = 0; i < items.length; i++) {
    var x = items[i], hit = 0, spec = 0;
    x.mt.forEach(function (k) { if (Q[k]) hit++; });
    if (!hit) continue;
    for (var k in x.all) if (Q[k] && x.mt.indexOf(k) < 0 && !AU_GENERIC[k]) spec++;
    cand.push({ x: x, score: hit / x.mt.length * 10 + hit + spec * 0.5, hit: hit, spec: spec });
  }
  if (!cand.length) { out.note = 'позиция не найдена в прайсе ' + au_dmy_(String(P.date || '')) + ' — назовите модель и исполнение (обивка, каркас, механизм)'; return out; }
  cand.sort(function (a, b) { return (b.score - a.score) || String(a.x.it.id).localeCompare(String(b.x.it.id)); });
  var top = cand[0], ties = cand.filter(function (c) { return c.score === top.score; }).slice(0, 5), it = top.x.it;
  var B = au_basis_(text), N = au_numbers_(text), price = B.basis && it.p ? Number(it.p[B.basis]) : null;
  out.found = true; out.item = { id: it.id, model: it.model, spec: au_specText_(it), group: it.group || '', pack: it.pack || 1, position: au_position_(it) };
  out.basis = B.basis; out.city = B.city; out.basis_why = B.why; out.prices = it.p || null; out.price = price || null; out.same = it.same || []; out.qty = N.qty;
  out.variants = ties.length > 1 ? ties.map(function (c) { return { id: c.x.it.id, position: au_position_(c.x.it), price: B.basis && c.x.it.p ? Number(c.x.it.p[B.basis]) : null, prices: c.x.it.p || null }; }) : [];
  if (N.requested !== null && (!price || (N.requested >= price * 0.3 && N.requested <= price * 3))) out.requested = N.requested;   // число вне 30–300 % цены — не цена
  else if (N.pct !== null && price) out.requested = Math.round(price * (1 - N.pct / 100));
  if (out.requested !== null && price) out.dev_pct = Math.round((out.requested - price) / price * 1000) / 10;
  if (!B.basis) out.note = B.why; else if (ties.length > 1) out.note = 'несколько исполнений подходят — показаны все (до 5)';
  var c0 = ctx || {}, client = String(c0.client || au_clientOf_(text) || '').slice(0, 120);
  out.client = client; out.manager = String(c0.manager || c0.name || '').slice(0, 120); out.chat = String(c0.chat || c0.cid || ''); out.group = String(c0.group || '');
  out.id = au_id_('p');
  try {                                                                       // только добавление строки (старые чистит au_compact — C-A3); замок занят → не записано
    var w = au_lock_(function () {
      au_append_('au_price', { id: out.id, t: new Date(), status: 'new', bot: au_bot_(), chat: out.chat, group: out.group, manager: out.manager, client: client, item_id: it.id, position: out.item.position,
        basis: B.basis, city: B.city, price: price || '', requested: out.requested === null ? '' : out.requested, dev_pct: out.dev_pct === null ? '' : out.dev_pct, qty: N.qty || '', acted: '' });
      return true;
    }, false);
    if (!w) { out.note = (out.note ? out.note + '; ' : '') + 'запрос не записан (кнопки могут не сработать): замок занят'; au_log_('price', 'запись запроса ' + out.id + ': замок занят'); }
  } catch (e) { out.note = (out.note ? out.note + '; ' : '') + 'запрос не записан (кнопки могут не сработать): ' + au_err_(e); au_log_('price', 'запись запроса: ' + au_err_(e)); }
  return out;
}
/** Клиент из текста: «для ООО «Ромашка»», «клиент ИП Сотрудник5». */
function au_clientOf_(text) {
  var m = /(?:для|клиент[ау]?|заказчик[ау]?|покупател[ья])\s*[:—-]?\s*((?:ооо|ип|зао|оао|ао|пао|гк|тд)\s*[«"]?[^»"\n,;:()]{2,60}[»"]?|[«"][^»"\n]{2,60}[»"])/i.exec(String(text || ''));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}
function au_html_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function au_pct_(z) { var s = (Math.abs(z) % 1 === 0 ? String(Math.abs(z)) + ',0' : String(Math.abs(z)).replace('.', ',')); return (z < 0 ? '−' : z > 0 ? '+' : '') + s + ' %'; }
/** Сообщение Т. В. в Telegram (HTML) с кнопками по результату au_priceLookup: {text, buttons:[{label, data:'au:price:peo|ok|no:<id>'}]}.
    ctx (необязательно) = {group, name, time} — заголовок «Сотрудник4 цены — …» (MAX добавляет свой заголовок сам). */
function au_priceMessage(res, ctx) {
  if (!au_mode_() || !res) return { text: '', buttons: [] };
  var P = au_price_() || {}, L = [], c = ctx || {};
  if (c.group || c.name) L.push('Сотрудник4 цены — ' + au_html_([c.group ? '«' + c.group + '»' : '', c.name, c.time].filter(String).join(', ')));
  if (!res.found) { L.push('Позиция по прайсу не найдена: ' + au_html_(res.note || '')); return { text: L.join('\n'), buttons: [] }; }
  L.push('Позиция: ' + au_html_(res.item.position) + ' (прайс ' + au_dmy_(String(P.date || '')) + ', ' + au_html_(res.item.id) + ')');
  if (res.variants && res.variants.length > 1) L.push('Подходят несколько исполнений:\n' + res.variants.map(function (v) { return '• ' + au_html_(v.position) + (v.price ? ' — ' + au_fmtMoney_(v.price) + ' ₽' : '') + ' (' + v.id + ')'; }).join('\n'));
  if (res.basis) L.push('Базис: ' + res.basis + (res.city ? ' — ' + au_html_(res.city) : '') + ' (' + au_html_(res.basis_why) + ')');
  else L.push('Базис не определён (' + au_html_(res.basis_why) + ')' + (res.prices ? ':\n' + ['I', 'II', 'III', 'IV', 'V'].map(function (b) { return b + ' — ' + au_fmtMoney_(res.prices[b]) + ' ₽'; }).join('; ') : ''));
  if (res.price) L.push('Действующая цена по прайс-листу: ' + au_fmtMoney_(res.price) + ' ₽ с НДС' + (res.qty ? ' (запрошено ' + res.qty + ' шт)' : ''));
  if (res.requested !== null && res.requested !== undefined) {
    L.push('Запрошено: ' + au_fmtMoney_(res.requested) + ' ₽');
    if (res.dev_pct !== null && res.dev_pct !== undefined) L.push('Отклонение: ' + au_pct_(res.dev_pct) + (Math.abs(res.dev_pct) > (Number(P.discount_owner_pct) || AU_OWNER_PCT) ? ' (больше ' + (Number(P.discount_owner_pct) || AU_OWNER_PCT) + ' % — нужно ваше решение)' : ''));
  }
  if (res.same && res.same.length) L.push('В прайсе одинаковая цена на базисах ' + res.same.join(', ') + '.');
  if (res.client) L.push('Клиент: ' + au_html_(res.client));
  L.push('Прайс действует для договоров поставки до 09.09.2026; для новых договоров цена может отличаться.');
  var btn = (au_scen_('price').buttons || []), lab = function (i, d) { return String(btn[i] || d); };
  return { text: L.join('\n'), buttons: res.id ? [
    { label: lab(0, 'Сотрудник4 в ПЭО на расчёт новой цены'), data: 'au:price:peo:' + res.id },
    { label: lab(1, 'Скидка возможна'), data: 'au:price:ok:' + res.id },
    { label: lab(2, 'Нет'), data: 'au:price:no:' + res.id }] : [] };
}
/** Нажатие кнопки Т. В. (data 'au:price:peo|ok|no:<id>') → {mail?:{to, cc, subject, body}, groupText?, ownerText, chat, group, manager, kind, id, done, decided}.
    peo — письмо в ПЭО (econom-3@, копия econom-2@ и itm@; отправка — вызывающим по контракту Р3) и короткий ответ менеджеру; ok/no — ответ менеджеру
    от имени Т. В. Отправку делает вызывающий; groupText — менеджеру (личка MAX или рабочая группа, не клиенту).
    C-A4: решение (status, acted) фиксируется в листе по ключу id сразу; тексты уведомлений строятся ДЕТЕРМИНИРОВАННО из строки — поэтому повторное
    нажатие (done=true) возвращает те же mail/groupText для ПРИНЯТОГО решения (decided = peo|ok|no, а не нажатая кнопка): вызывающий кладёт их в Outbox
    идемпотентно (ob_put по тем же ключам → dup) и досылает только недоставленное; при done ничего не слать напрямую. Замок занят → error + busy:true. */
function au_priceAction(data) {
  var m = /^au:price:(peo|ok|no):([\w\-]+)$/.exec(String(data || '')), out = { kind: m ? m[1] : '', id: m ? m[2] : '', done: false };
  if (!au_mode_()) { out.error = 'MODE не google'; return out; }
  if (!m) { out.error = 'неизвестная кнопка'; return out; }
  var rec = null, first = false;
  var got = au_lock_(function () {
    var R = au_rows_('au_price');
    for (var i = R.length - 1; i >= 0; i--) if (String(R[i].id) === out.id) { rec = R[i]; break; }
    if (rec && String(rec.status || 'new') === 'new') { first = au_updateById_('au_price', out.id, { status: out.kind, acted: new Date() }); if (first) rec.status = out.kind; }
    return true;
  }, false);
  if (!got) { out.error = 'занято — нажмите, пожалуйста, ещё раз'; out.busy = true; return out; }
  if (!rec) { out.error = 'запрос цены ' + out.id + ' не найден (старше ' + AU_PRICE_TTL_DAYS + ' дней или другая таблица)'; au_log_('price', out.error); return out; }
  out.chat = String(rec.chat || ''); out.group = String(rec.group || ''); out.manager = String(rec.manager || '');
  var kind = /^(peo|ok|no)$/.test(String(rec.status)) ? String(rec.status) : out.kind;     // принятое решение (при повторе — первое)
  out.decided = kind;
  var NAMES = { peo: 'Сотрудник4 в ПЭО', ok: 'Скидка возможна', no: 'Нет' };
  if (!first) { out.done = true; out.ownerText = 'По этому запросу уже выбрано: «' + (NAMES[kind] || kind) + '».'; }
  var P = au_price_() || {}, sc = au_scen_('price'), who = au_address_(rec.manager), pos = String(rec.position || ''), basis = String(rec.basis || '') || '—', city = String(rec.city || '');
  var X = rec.price !== '' && rec.price != null ? Number(rec.price) : null, Y = rec.requested !== '' && rec.requested != null ? Number(rec.requested) : null, Z = rec.dev_pct !== '' && rec.dev_pct != null ? Number(rec.dev_pct) : null;
  var client = String(rec.client || '') || 'по сообщению в группе' + (rec.group ? ' «' + rec.group + '»' : ''), qty = rec.qty ? String(rec.qty) : 'не указано', basisTxt = basis + (city ? ' (' + city + ')' : '');
  if (kind === 'peo') {
    var PL = sc.peo_letter || {}, to = Array.isArray(PL.to) && PL.to.length ? PL.to : AU_PEO_TO, cc = Array.isArray(PL.cc) && PL.cc.length ? PL.cc : AU_PEO_CC;
    var peoName = (sc.peo && sc.peo[0] && sc.peo[0].name) || (P.peo && P.peo[0] && P.peo[0].name) || 'Имя10 Отчество31', addr = au_address_(peoName);
    out.mail = { to: to.slice(), cc: cc.slice(), subject: 'Расчёт цены: ' + pos + ', базис ' + basis,
      body: addr + ', добрый день!\nПросим, пожалуйста, рассчитать цену для клиента ' + client + (rec.manager ? ' (менеджер ' + rec.manager + (rec.group ? ', «' + rec.group + '»' : '') + ')' : '') + ': ' + pos + ', количество ' + qty + ', базис ' + basisTxt + '.' +
        (X ? ' Сейчас по прайсу ' + au_dmy_(String(P.date || '')) + ' — ' + au_fmtMoney_(X) + ' ₽ с НДС' : ' Цены прайса на этом базисе нет') + (Y ? ', клиент просит ' + au_fmtMoney_(Y) + ' ₽' + (Z !== null ? ' (' + au_pct_(Z) + ')' : '') : '') + '.\n' +
        'Если получится, ответ — на ' + AU_ITM + '.\nСпасибо!\n\nзапрос Сотрудник2 Отчество2 Сотрудник1 через ИИ-ассистента' };
    out.groupText = AU_SIGN + ' — ' + who + ': по ' + pos + (rec.client ? ' для ' + rec.client : '') + ' запросил расчёт цены в ПЭО' + (Y ? ' (просят ' + au_fmtMoney_(Y) + ' ₽)' : '') + ' — как ответят, сообщу.';
    if (first) out.ownerText = 'Письмо в ПЭО подготовлено: ' + to.join(', ') + ' (копия ' + cc.join(', ') + ').';
  } else if (kind === 'ok') {
    out.groupText = AU_SIGN + ' — ' + who + ': по ' + pos + (rec.client ? ' для ' + rec.client : '') + (Y ? ' цена ' + au_fmtMoney_(Y) + ' ₽ согласована' : ' скидка возможна — согласуйте, пожалуйста, цену со мной') + (basis !== '—' ? ' (базис ' + basisTxt + ')' : '') + '.';
    if (first) out.ownerText = 'Менеджеру передано: скидка возможна.';
  } else {
    out.groupText = AU_SIGN + ' — ' + who + ': по ' + pos + (Y ? ' цена ' + au_fmtMoney_(Y) + ' ₽, к сожалению, не получится' : ' скидки, к сожалению, не получится') + (X ? '; действует цена прайса ' + au_fmtMoney_(X) + ' ₽' + (basis !== '—' ? ' (базис ' + basisTxt + ')' : '') : '') + '. Если клиенту важен объём — давайте посчитаем с ПЭО.';
    if (first) out.ownerText = 'Менеджеру передано: по этой цене — нет.';
  }
  au_log_('price', out.id + ': ' + (first ? kind : 'повтор кнопки ' + out.kind + ', решение ' + kind));
  return out;
}

// ================================================================ спор с клиентом
/** Ответ по сценарию спора. step 0/1 — вопрос, какой договор подписан (назван в тексте — сразу шаги); step 2 — ответ человека: наш типовой →
    шаги по пунктам contract_points (юрлицо не названо — ЖПС с оговоркой), не наш (ctx.ours === false или «договор клиента») → копию договора, пока —
    общие правила ГК; step ≥ 3 без договора в тексте → '' (диалог окончен). Деньги/скидки/вина — решение Т. В.
    ctx = {name|who, text, sign?, contract?, ours?: true|false, group}. → текст ('' — MODE не google). */
function au_disputeReply(step, ctx) {
  if (!au_mode_()) return '';
  ctx = ctx || {};
  var nm = ctx.name || ctx.who || ctx.manager || '', sign = String(ctx.sign || au_sign()), who = au_address_(nm), text = String(ctx.text || ''), t = text.toLowerCase().replace(/ё/g, 'е');   // подпись — как в au_reclReply
  var contract = ctx.contract || au_contractOf_(text), notOurs = ctx.ours === false || (!contract && AU_RX_NOT_OURS.test(t)), R = au_rules_();
  var lawyer = (R && R.scenarios && R.scenarios.dispute && R.scenarios.dispute.lawyer) ? R.scenarios.dispute.lawyer.name + ', ' + R.scenarios.dispute.lawyer.mail : AU_LAWYER;
  step = Number(step) || 1;
  if (step === 1 && !contract && !notOurs && ctx.ours !== true) {                     // первый вопрос (MAX зовёт step 1, Telegram — 0; ответ человека с юрлицом → сразу шаги)
    return sign + ' — ' + who + ', добрый день! Чтобы подсказать точно, уточните, пожалуйста: с клиентом подписан наш типовой договор поставки (какое юрлицо — ЖПС, ПКС или ФТС; поставка (сбыт) или поставка и монтаж; номер и дата) или договор клиента / другой?';
  }
  var money = AU_RX_MONEY.test(t) ? '\nДеньги, скидки, признание вины и сроки сверх договора не обещаем — это решение Т. В. Сотрудник1; вопрос ему передан.' : '';
  if (step >= 3 && !contract && !notOurs && ctx.ours !== true) return '';                // третий ответ без договора — добавить нечего, диалог окончен
  if (notOurs) {
    var gk = au_joinGk_([au_gk_('513'), au_gk_('474')]);
    return sign + ' — ' + who + ', спасибо! Пришлите, пожалуйста, копию договора сюда или на ' + AU_ITM + ' (и в ПТО, ' + AU_PTO + ' — по И-КО-06 п. 1) — посмотрю условия о приёмке и рекламациях. ' +
      (gk ? 'Пока по общим правилам: покупатель обязан принять товар, проверить его в срок по договору и о недостатках незамедлительно письменно сообщить; порядок проверки качества — по договору, одинаковый для обеих сторон (' + gk + '). ' : '') +
      'Окончательно — после чтения договора; если вопрос сложный, подключим юриста (' + lawyer + ').' + money;
  }
  var P = au_points_(contract), cp = P.cp, works = P.name === 'ФТС монтаж', L = [], n = 0, num = function () { return (++n) + ') '; };
  L.push(sign + ' — ' + who + ', спасибо! Тогда по ' + (works ? 'договору поставки и монтажа (ФТС)' : 'договору ' + (P.name || 'поставки') + (P.known ? '' : ' (номера пунктов — для ЖПС; скажете юрлицо — уточню)')) + ' действуем так.');
  if (AU_RX_LOOKS.test(t)) L.push(num() + 'Внешний вид товара может немного отличаться от фото, образца и другой партии — это не признак ненадлежащего качества' + au_withPt_(cp, 'looks_differ_not_defect') + (au_pt_(cp, 'colors_sizes_reference') ? '; цвета и размеры в каталоге и на сайте справочные (' + au_pt_(cp, 'colors_sizes_reference') + ')' : '') + '. Это можно спокойно объяснить клиенту.');
  if (works) {
    L.push(num() + 'Заказчик осматривает и принимает товар и работы в течение 2 календарных дней с уведомления о готовности; недостатки — в акт работ и УПД, акт о недостатках с фото составляем вместе' + au_withPt_(cp, 'accept_goods_and_works_2cd') + '; акт о недостатках рассматриваем 10 рабочих дней' + au_withPt_(cp, 'review_10wd_claim_limit_10wd') + '.');
    L.push(num() + 'Гарантия на товар и работы — 12 месяцев с даты УПД или акта работ' + au_withPt_(cp, 'warranty_12m_from_upd_act') + '; претензия — актом рекламации' + au_withPt_(cp, 'claim_act') + ', ответ — 10 рабочих дней' + au_withPt_(cp, 'may_reject_answer_10wd') + '; экспертиза — по всему заявленному количеству' + au_withPt_(cp, 'expertise_cost_whole_qty') + '.');
    var g1 = au_joinGk_([au_gk_('720', 'пп. 2–3'), au_gk_('723')]); if (g1) L.push(num() + 'По закону: на недостатки, оговорённые в акте приёмки, заказчик может ссылаться, явные недостатки без отметки при приёмке потом не принимаются; при недостатках работы подрядчик вправе переделать работу (' + g1 + ').');
  } else {
    var g513 = au_gk_('513', 'п. 1');
    L.push(num() + 'Товар клиент принимает' + (g513 ? ' (' + g513 + ')' : '') + '. Если считает его ненадлежащим — в течение 5 рабочих дней с передачи составляет акт с фото' + au_withPts_(cp, ['accept_5wd', 'notify_act_photo']) +
      '; предельный срок претензии по видимым недостаткам — 10 рабочих дней с передачи, мы отвечаем в течение 10 рабочих дней' + au_withPt_(cp, 'review_10wd_claim_limit_10wd') + (au_pt_(cp, 'hidden_warranty_12m') ? '; скрытые дефекты — в гарантийный срок 12 месяцев (' + au_pt_(cp, 'hidden_warranty_12m') + ')' : '') + '.');
    L.push(num() + 'Мы вправе запросить товар на проверку или экспертизу — по всему заявленному количеству' + au_withPts_(cp, ['inspection_return_buyer_cost', 'expertise_whole_qty_notice', 'expertise_cost_whole_qty']) +
      '; неверно оформленный акт вправе не рассматривать' + au_withPt_(cp, 'may_reject_answer_10wd') + '; замена — при доставке на наш склад и сохранённом товарном виде' + au_withPts_(cp, ['delivery_to_our_wh', 'return_terms']) + '.');
    if (AU_RX_DELAY.test(t) && au_pt_(cp, 'delay_penalty')) L.push(num() + 'По сроку поставки: неустойка за просрочку — 0,01 % в день, не больше 10 % (' + au_pt_(cp, 'delay_penalty') + ')' + (au_pt_(cp, 'liability_cap_5pct') ? '; общий предел ответственности — 5 % (' + au_pt_(cp, 'liability_cap_5pct') + ')' : '') + '; выходные и праздники в рабочие дни не входят.');
    if (AU_RX_PAY.test(t) && au_pt_(cp, 'prepay_100')) L.push(num() + 'Оплата — по условиям договора: предоплата 100 %' + au_withPt_(cp, 'prepay_100') + '; отсрочки и скидки — только по решению Т. В. Сотрудник1.');
  }
  L.push(num() + 'Всё фиксируем письменно: письмо клиента, фото, акт' + (works ? ', акт работ и УПД' : ', УПД') + '; пришёл акт — регистрируем рекламацию в 1С и отправляем на ' + AU_PTO + ' (Р-КО-01).');
  L.push(num() + 'До заключения ПТО брак не признаём и замену, скидку, деньги или сроки сверх договора не обещаем — это решение Т. В. Сотрудник1.');
  L.push('Если клиент пришлёт свой вариант договора или протокол разногласий — передайте, пожалуйста, мне и юристу (' + lawyer + ').');
  return L.join('\n');
}
