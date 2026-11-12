/* «Фабрика — бот MAX» — MaxCore.gs (05.11.2026, шаг 2 переноса ботов в Google 1c@): вход, очередь приёма, маршрутизация событий.
   Т. В. Сотрудник1 04.11: «2 бота, 3 бота, 10 ботов — все работают на этом аккаунте. И никто никуда на хостинг не лезет».
   Перенос веток max/hook.php, post.php, relay.php хостинга в этот проект. Файлы ядра: MaxCore.gs (этот), MaxCoreGroups.gs (группы, автономность,
   push), MaxCoreChannel.gs (комментарии канала), MaxCorePrivate.gs (личные, зеркало, команды владельца), MaxCoreOps.gs (подписанные команды
   post/reply/dm/delete/tgcall/hist, опросы, импорт), MaxCoreHistory.gs (история всех групп на Диске). Хранение — Store.gs (листы служебной
   таблицы и файлы Диска); общие модули шага 5 (cp_ push к Claude, kb_/bf_ база знаний и файлы «Для ботов», au_ автономность) — вызываются,
   только если присутствуют в проекте (typeof … === 'function'): без них ядро работает, просто без этих возможностей.

   ВКЛЮЧЕНИЕ: всё новое работает ТОЛЬКО при свойстве скрипта MODE === 'google'. Вход — из Relay.gs, первая строка внутри try в doPost:
     if (typeof mx_isGoogle === 'function' && mx_isGoogle()) return mx_doPost(e);      // дальше — прежний код без изменений
   (патч — Relay_google.patch рядом; без этой строки и без MODE ядро не вызывается — сохранение файлов в редакторе без развёртывания ничего не меняет).
   Из Code.gs/Relay.gs используются: P_, api_, ok_, mask_, sha256hex_, hmacHex_, hexBytes_, kcmd_, json_, h_, members_, ownerBind_ —
   эти файлы остаются в проекте. Имена всех новых функций и глобалов — с префиксом mx_ (одно пространство имён на проект).

   Свойства скрипта (вводит Т. В.; в код, журнал и ответы — никогда): MODE, MAX_TOKEN, K_CMD, HOOK_SECRET, OWNER_UID (ставит ownerBind_),
   TG_APP_URL (веб-приложение Telegram-скрипта — зеркало и уведомления владельцу), CLAUDE_FIRE_URL/CLAUDE_FIRE_TOKEN (модуль cp_),
   SVC_SHEET_ID (необязательно: иначе таблица SS_ID из Store.gs — «Фабрика — боты»).
   Тихие часы 19:00–07:00 МСК (RULES 04.11): бот в группах молчит, события для Claude откладываются до утра (лист mx_defer); история и
   уведомления владельцу об обращениях к нему — всегда. Руководителям (au_isLeader / список RULES 03.11) бот вопросов не задаёт;
   Имя27 и Джановой лично не пишет. В режиме google обращений к techfabrikant.ru нет: список прежних мест и замен — STEP2_README.md. */

var MX_TRIES = 5;                                   // попыток обработки события из очереди max_in, дальше — dead
var MX_STALE_MS = 6 * 60000;                        // событие «в работе» дольше 6 мин — считается зависшим (запуск упал), берётся снова
var MX_HOOK_BUDGET_MS = 8000;                       // сколько обрабатывать внутри вебхука (MAX ждёт ответ 200): остальное — триггер раз в минуту
var MX_GRP_FWD_HOUR = 20;                           // H5: не больше обращений к Т. В. из одной группы за час (уведомление и пересылка)
var MX_PRICE_HOUR = 6;                              // запросов цены из одной группы за час — Т. В. в Telegram (дальше — только история и push)
var MX_MAIL_PER_SENDER = 2;                         // H3: писем маркетологам от одного автора в сутки (МСК)
var MX_ID_BASE = 7000000000000000;                  // id людей MAX в зеркале Telegram-скрипта: 7·10^15 + id (с Telegram не пересекаются)
var MX_SIGN = 'Т. В. Сотрудник1';                    // подпись автономных ответов от имени владельца (RULES 04.11 ~18:15)
var MX_SIGN_BOT = 'Бот «Фабрика» (по правилам компании)';   // голос бота в личке в тихие часы (без au_sign шага 5; проверка 2, 05.11)
var MX_MEM = {};                                    // память одного запуска (кэш настроек, групп, user_id бота)

/** Листы ядра в служебной таблице (Store.gs SHEETS: max_in, post_ids, groups, settings, log — как есть). */
var MX_SHEETS = {
  mx_hist:      ['ts', 'cid', 'g', 'mid', 'uid', 'name', 'bot', 'text', 'rmid', 'ruid', 'rname', 'att', 'ment', 'k', 'fl'],   // буфер истории групп (fl=1 — выгружено на Диск)
  mx_grp_owner: ['k', 'ts', 'cid', 'g', 'mid', 'uid', 'n', 'why', 'x'],   // обращения к владельцу (k=q) и его ответы (k=a) — для отчёта «без ответа» (шаг 3)
  mx_counters:  ['k', 'n', 't'],                                           // счётчики с ключом по часу/дню (лимиты пересылок, писем)
  mx_hello:     ['uid', 't'],                                              // когда человеку в личке давали справку о компании (раз в 12 ч)
  mx_files:     ['id', 'tok', 'url', 'k', 'n', 't'],                       // файлы из MAX для зеркала: getFile Telegram-скрипта → адрес
  mx_sent:      ['mid', 'text', 'format', 't'],                            // тексты сообщений зеркала (чтобы снять кнопки, MAX нужен весь текст)
  mx_questions: ['cid', 'mid', 'ts', 'uid', 'name', 'text', 'status', 't'],   // вопросы в группах: без ответа > 30 мин в рабочее время → push Claude
  mx_cmt_seen:  ['k', 't'],                                                // ответы в комментариях: одному человеку под одним постом — раз в 30 мин
  mx_dispute:   ['cid', 'uid', 't'],                                       // спор: первый вопрос («какой договор») — раз в сутки на человека в группе
  mx_price:     ['id', 'cid', 'g', 'mid', 'uid', 'name', 't'],             // запросы цены, отправленные Т. В. в Telegram: куда отвечать по кнопке
  mx_defer:     ['id', 'ts', 'cid', 'g', 'who', 'why', 'text', 'ctx', 't'] // события групп для Claude, пришедшие в тихие часы: push утром, одной пачкой
};

// REDACTED_B64_2 режим и вход
function mx_isGoogle() { return String(P_().getProperty('MODE') || '').trim().toLowerCase() === 'google'; }

/** Вход для Relay.gs (режим google): подписанные команды (t, d, s), вызов Telegram-скрипта (op tgcall, формат relay.php) или вебхук MAX. */
function mx_doPost(e) {
  try {
    if (e && e.parameter && e.parameter.d && e.parameter.t) return json_(mx_cmd(e));
    var raw = (e && e.postData && e.postData.contents) || '', u = null;
    try { u = JSON.parse(raw); } catch (x) { u = null; }
    if (u && u.op === 'tgcall' && !u.update_type) return json_(mx_tgcallJson(u));
    return json_(mx_hook(e, raw, u));
  } catch (x) { mx_log('err', 'doPost: ' + mx_errText(x)); return json_({ ok: false, error: 'ошибка' }); }
}

/** Вебхук MAX (адрес …/exec?s=HOOK_SECRET): записать в очередь → обработать тут же (пока есть время) → ответ. Повтор того же события (ключ)
    ничего не делает второй раз. Apps Script не умеет ответить раньше конца doPost, поэтому обработка — с бюджетом времени. */
function mx_hook(e, raw, u) {
  var sec = P_().getProperty('HOOK_SECRET');
  if (!sec || !e || !e.parameter || e.parameter.s !== sec) return { ok: false };
  if (!u || typeof u !== 'object' || !u.update_type) return { ok: true };
  var key = mx_updKey(u);
  if (findRow_('max_in', key)) return { ok: true, dup: true };               // повтор — без замка и без действий
  var r = inPut_(key, String(u.update_type), raw);
  if (!r.ok) { mx_log('err', 'очередь: не записано (' + r.err + ')'); return { ok: false, error: 'очередь' }; }
  if (r.dup) return { ok: true, dup: true };
  var t0 = Date.now(), n = mx_drain(MX_HOOK_BUDGET_MS, 3);
  if (Date.now() - t0 < MX_HOOK_BUDGET_MS / 2) mx_histFlush(MX_HOOK_BUDGET_MS / 2);   // быстрый запуск — сразу выгрузить историю на Диск
  return { ok: true, n: n };
}

/** Ключ события (как mx_upd_key в hook.php, но хэш): тип, mid, callback_id, время, user_id. */
function mx_updKey(u) {
  var m = u.message || {}, b = m.body || {}, cb = u.callback || {}, us = u.user || {};
  return 'e' + sha256hex_([String(u.update_type || ''), String(b.mid || ''), String(cb.callback_id || ''), String(u.timestamp || ''), String(us.user_id || '')].join(':')).slice(0, 40);
}

/** Обработка очереди: взять пачку (под замком, status=work), обработать без замка, отметить done/fail/dead ПО КЛЮЧУ (строка находится заново под
    замком — GPT A3, 05.11: обрезка листа между взятием и отметкой номера строк не ломает). Тело длиннее ячейки лежит в файле (st_inBody, GPT A4).
    «done» = обработчик завершился; его побочные действия, которые не удались (push, Telegram, MAX), лежат в Outbox (mx_outbox) и досылаются
    тиком — событие целиком не повторяется, чтобы не отправить второй раз уже отправленное (GPT A5). Пока есть бюджет времени. → обработано. */
function mx_drain(budgetMs, batch) {
  var t0 = Date.now(), n = 0, timeUp = true, err = false;
  while (Date.now() - t0 < budgetMs) {
    var items = st_inClaim(batch || 5, MX_TRIES, MX_STALE_MS); if (!items.length) { timeUp = false; break; }
    items.forEach(function (it) {
      var raw = st_inBody(it.body); if (raw === null) { st_inFail(it.key, it.tries, 'тело события на Диске не найдено', true); return; }
      var u; try { u = JSON.parse(raw); } catch (x) { st_inFail(it.key, it.tries, 'не JSON', true); return; }
      try { mx_handle(u); st_inDone(it.key); n++; }
      catch (x) { mx_log('err', 'обработка ' + it.type + ': ' + mx_errText(x)); st_inFail(it.key, it.tries, mx_errText(x), it.tries >= MX_TRIES); if (it.tries < MX_TRIES) err = true; }
    });
  }
  mx_inDirty(timeUp, err);                                                    // вышли по времени / были сбои — минутный тик дочитает очередь; пусто и без сбоев — тик лист не трогает
  return n;
}
/** Флаги «в очереди max_in есть работа» (CacheService; проверка 2, 05.11 — экономия квоты триггеров): mx_in_dirty — mx_drain вышел по времени
    (снимается, когда очередь пуста); mx_in_retry — был сбой обработчика, повторы раз в минуту ещё нужны (живёт MX_TRIES + 2 мин, сам истекает).
    Минутный тик без флагов лист max_in не читает; каждые 5 минут — полный проход в любом случае. */
function mx_inDirty(timeUp, err) {
  try { var ca = CacheService.getScriptCache(); if (timeUp) ca.put('mx_in_dirty', '1', 21600); else ca.remove('mx_in_dirty'); if (err) ca.put('mx_in_retry', '1', (MX_TRIES + 2) * 60); } catch (x) { /* кэш не обязателен */ }
}
function mx_inDirtyGet() { try { var ca = CacheService.getScriptCache(); return !!(ca.get('mx_in_dirty') || ca.get('mx_in_retry')); } catch (x) { return true; } }

/** Минутная работа ядра: повтор необработанных событий, отложенные (тихие часы) и просроченные вопросы → Claude, выгрузка истории, обрезки.
    budgetMs — на всё; вызывается триггером mx_queueTick или из таймеров шага 3 (mx_tmQueue). → обработано событий очереди. */
function mx_tick(budgetMs, batch) {
  var t0 = Date.now(), n = 0, left = function () { return budgetMs - (Date.now() - t0); };
  var full = new Date().getMinutes() % 5 === 0;                               // полный проход — каждые 5 минут; в остальные минуты листы читаются только по флагам (квота триггеров — проверка 2, 05.11)
  if (full || mx_inDirtyGet()) { try { n = mx_drain(Math.max(5000, budgetMs * 0.6), batch || 10); } catch (x) { mx_log('err', 'очередь (триггер): ' + mx_errText(x)); mx_inDirty(true, true); } }
  if (full) {
    try { mx_deferFlush(); } catch (x) { mx_log('err', 'отложенные: ' + mx_errText(x)); }
    try { mx_questionsTick(); } catch (x) { mx_log('err', 'вопросы: ' + mx_errText(x)); }
  }
  try { mx_histFlush(Math.max(8000, left() - 3000)); } catch (x) { mx_log('err', 'история: ' + mx_errText(x)); }
  try { mx_obRun(Math.max(5000, Math.min(20000, left() - 2000))); } catch (x) { mx_log('err', 'outbox: ' + mx_errText(x)); }   // досылка неудавшихся действий (GPT A5)
  if (new Date().getMinutes() % 30 === 7 && left() > 10000) { st_inTrim(3000); mx_countersTrim(); mx_histTrim(); st_inboxTrim(7); }
  return n;
}

// REDACTED_B64_2 Outbox (модуль common/Outbox.gs шага F3, контракт fix_gpt_0511.md): неудавшиеся побочные действия
/** Положить действие в Outbox: key — '<операция>:<адресат>' (повтор того же key второй операции не создаёт), kind — mx_push | mx_tg | mx_user | mx_chat,
    payload — что повторить (mx_obHandlers). → true — записано (или уже было); false — модуля нет / не записалось (в журнал: действие потеряно). */
function mx_outbox(key, kind, target, payload) {
  if (typeof ob_put !== 'function') { mx_log('err', 'outbox: нет модуля — потеряно ' + kind + ' ' + key); return false; }
  try { var r = ob_put(String(key).slice(0, 120), kind, String(target || ''), payload); if (r && r.ok) { mx_log('outbox', kind + ' ' + key + (r.dup ? ' (уже в очереди)' : ' — отложено')); return true; } mx_log('err', 'outbox: не записано ' + kind + ' ' + key); return false; }
  catch (x) { mx_log('err', 'outbox ' + kind + ' ' + key + ': ' + mx_errText(x)); return false; }
}
/** Исход неизвестен (Telegram-скрипт ответил state:'uncertain'): операция записывается в Outbox и сразу помечается uncertain — автоповтора нет
    (иначе возможен дубль), запись видна владельцу (техтревога — модуль). → true — записано. */
function mx_outboxUncertain(key, kind, target, payload, err) {
  if (!mx_outbox(key, kind, target, payload)) return false;
  try { if (typeof ob_mark === 'function') ob_mark(String(key).slice(0, 120), 'uncertain', null, String(err || 'исход неизвестен').slice(0, 200)); } catch (x) { mx_log('err', 'outbox uncertain ' + key + ': ' + mx_errText(x)); }
  return true;
}
/** Обработчики видов Outbox ядра: item → {status:'sent'|'retry'|'permanent'|'uncertain', result?, err?}. Виды с префиксом mx_ — чтобы runner таймеров
    (свои виды) и этот не мешали друг другу. */
function mx_obHandlers() {
  var mxRes = function (r) { if (ok_(r[0])) return { status: 'sent', result: { mid: String((((r[1] || {}).message || {}).body || {}).mid || '') } }; return { status: r[0] >= 400 && r[0] < 500 && r[0] !== 429 ? 'permanent' : 'retry', err: 'MAX ' + r[0] }; };
  return {
    mx_push: function (it) { var p = it.payload || {}; if (!mx_pushOn()) return { status: 'retry', err: 'push не настроен' }; return mx_push(p.ev || {}, !!p.now) ? { status: 'sent' } : { status: 'retry', err: 'cp_push отказал' }; },
    mx_tg:   function (it) {                                              // тот же payload → тот же meta.mid/mid: Telegram-скрипт дошлёт только недоставленным
      var r = mx_tgCall(it.payload || {}), st = mx_tgState(r), err = String((r && r.error) || '?').slice(0, 120);
      if (st === 'sent') return { status: 'sent', result: r.result || true };
      if (st === 'uncertain' || st === 'permanent') return { status: st, err: err };
      return { status: 'retry', err: err };                                // retry и ответ без state (старый скрипт) — повтор, после 6 попыток модуль закроет dead
    },
    mx_user: function (it) { var p = it.payload || {}; if (!p.uid) return { status: 'permanent', err: 'нет uid' }; return mxRes(mx_sendUser(Number(p.uid), String(p.text || ''), p.extra || {})); },
    mx_chat: function (it) { var p = it.payload || {}; if (!p.cid || !mx_groupGet(String(p.cid))) return { status: 'permanent', err: 'нет группы' }; return mxRes(mx_sendChat(String(p.cid), String(p.text || ''), p.extra || {})); }
  };
}
/** Досылка из Outbox (из mx_tick, бюджет budgetMs). Без модуля — ничего. → сколько обработано (как вернул ob_runner) | 0. */
function mx_obRun(budgetMs) {
  if (typeof ob_runner !== 'function' || !mx_isGoogle()) return 0;
  var r = ob_runner(mx_obHandlers(), budgetMs); return typeof r === 'number' ? r : (r && r.n) || 0;
}
/** Состояние очереди max_in по статусам (для чек-листа переключения/отката, GPT B5: перед снятием MODE дождаться new/work/fail = 0 — иначе принятые
    от MAX события останутся необработанными; также число незакрытых операций Outbox, если модуль есть). Запускать из редактора или op ping. */
function mx_queueStatus() {
  var c = { 'new': 0, work: 0, fail: 0, dead: 0, done: 0, rows: 0 };
  try { st_inScan(function (st) { c.rows++; if (c[st] !== undefined) c[st]++; return false; }, 1); } catch (x) { c.err = mx_errText(x); }
  c.pending = c['new'] + c.work + c.fail;                                   // незакрытые операции Outbox — лист ob_out (status pending/failed), ob_due не звать: он берёт их в работу
  return c;
}
/** Триггер раз в минуту (ставит mx_setupTriggers). Если стоят триггеры шага 3 (tm_tickMinute → mx_tmQueue), этот не нужен — работа та же. */
function mx_queueTick() {
  if (!mx_isGoogle()) return;
  mx_tick(240000, 10);
}
/** Поставить триггер очереди (запускать из редактора один раз при переключении; повторный запуск дублей не создаёт). Только при MODE === 'google'. */
function mx_setupTriggers() {
  if (!mx_isGoogle()) { console.log('MODE не google — триггер mx_queueTick не ставится'); return false; }
  mx_removeTriggers();
  ScriptApp.newTrigger('mx_queueTick').timeBased().everyMinutes(1).create();
  console.log('триггер mx_queueTick (раз в минуту) поставлен'); return true;
}
function mx_removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'mx_queueTick') ScriptApp.deleteTrigger(t); });
}

// REDACTED_B64_2 API ядра для таймеров шага 3 (Timers.gs: TM_CORE → tm_send_)
/** Сообщение в группу: opt.html — текст уже в HTML MAX (иначе отправляется как есть, без разметки), opt.reply — mid, на который отвечаем.
    → {ok, mid, code, err}. Своё сообщение попадает в историю группы. */
function mx_tmSendChat(cid, text, opt) {
  opt = opt || {}; var extra = { format: opt.html ? 'html' : '' };
  if (opt.reply) extra.link = { type: 'reply', mid: String(opt.reply) };
  var r = mx_sendChat(String(cid), text, extra);
  if (!ok_(r[0]) && opt.reply && r[0] === 400) { delete extra.link; r = mx_sendChat(String(cid), text, extra); }   // сообщение для ответа удалено
  return mx_tmRes(r);
}
/** Личное сообщение человеку MAX по user_id (opt.html — как выше). → {ok, mid, code, err}. */
function mx_tmSendUser(uid, text, opt) { return mx_tmRes(mx_sendUser(Number(uid), text, { format: (opt || {}).html ? 'html' : '' })); }
function mx_tmRes(r) {
  var ok = ok_(r[0]);
  return { ok: ok, mid: ok ? String((((r[1] || {}).message || {}).body || {}).mid || '') : '', code: r[0], err: ok ? '' : 'MAX ' + r[0] + ': ' + String((r[1] || {}).message || (r[1] || {}).code || '').slice(0, 120) };
}
/** Удалить сообщение бота (только своё и только в известной группе — замечание 12). → {ok, err}. */
function mx_tmDelete(mid) { var r = mx_opDelete({ mids: [String(mid)] }); if (!r.ok) return { ok: false, err: r.error }; var x = (r.res || [])[0] || {}; return { ok: !!x.ok, err: x.why || '' }; }
/** Участники группы: → {ok, members: {user_id: имя}}. */
function mx_tmMembers(cid) {
  try { var M = members_(String(cid)); return { ok: Object.keys(M).length > 0, members: M, err: Object.keys(M).length ? '' : 'список пуст или MAX не ответил' }; }
  catch (x) { return { ok: false, members: {}, err: mx_errText(x) }; }
}
/** Минутная работа ядра из таймера шага 3 (вместо отдельного триггера mx_queueTick): → {ok, n}. Бюджет — budgetMs (запрос F4, CHECK3 05.11: таймер передаёт
    остаток своего минутного бюджета), не больше 40 с и не меньше 5 с; без аргумента — 40 с (минутный тик таймеров — 50 с). */
function mx_tmQueue(limit, budgetMs) { if (!mx_isGoogle()) return { ok: false, err: 'MODE' }; var b = Number(budgetMs) > 0 ? Math.max(5000, Math.min(40000, Number(budgetMs))) : 40000; return { ok: true, n: mx_tick(b, Number(limit) || 20) }; }

/** Маршрутизация одного события MAX (перенос mx_update из hook.php). Бросает исключение — событие вернётся в очередь (до MX_TRIES раз). */
function mx_handle(u) {
  var type = String(u.update_type || ''), m = u.message || null;
  if (type === 'message_callback' && String((u.callback || {}).payload || '').indexOf('poll:') === 0) return mx_pollAnswer(u);
  if (type === 'bot_added' || type === 'bot_removed') return mx_groupMembership(u);
  if (type === 'chat_title_changed') { if (u.chat_id) mx_groupSave(String(u.chat_id), { title: String(u.title || '') }); return; }
  if (type === 'message_edited' || type === 'message_removed') return mx_histEvent(u);
  if (type === 'user_added' || type === 'user_removed') return;                 // состав группы — без действий (штат смотрит шаг 3)
  var rc = (m || {}).recipient || {}, ct = String(rc.chat_type || '');
  if (type === 'message_created' && m && ct !== 'dialog') mx_histAdd(mx_normMsg(m, rc));   // история ВСЕХ групп и каналов (и комментариев) — до любых фильтров
  var c = mx_asComment(u); if (c) return mx_comment(c);
  if (type === 'message_created' && m) {
    var s = m.sender || {};
    var me = mx_botUid();
    if (s.is_bot || (me && String(s.user_id || '') === me)) return;
    if (ct === 'dialog') return mx_dialog(u, m);
    if (ct === 'chat') { if (typeof regor_onMessage_ === 'function') regor_onMessage_(m); return mx_group(m, u); }
    return;                                                                       // посты самого канала — без действий
  }
  if (type === 'message_callback' || type === 'bot_started') return mx_dialog(u, m);
  mx_log('unknown', type);
}

// REDACTED_B64_2 журнал, настройки, листы
/** Журнал (лист log через Store.gs): без токена MAX, без телефонов; k — область. Никогда не бросает исключение. */
function mx_log(k, msg) { try { logRow_('mx:' + k, mx_maskPhones(mask_(String(msg))).slice(0, 500)); } catch (x) { console.log('mx_log: ' + x); } }
function mx_errText(x) { return String(x && x.message || x).slice(0, 300); }

function mx_sheet(name) { return MX_SHEETS[name] ? st_sheetFor(name, MX_SHEETS[name]) : sheet_(name); }
/** Строка по значению в столбце col (1 = первый) листа name → {row, vals} | null. */
function mx_findRow(name, key, col) {
  var sh = mx_sheet(name), n = Math.max(sh.getLastRow(), 1);
  var f = sh.getRange(1, col || 1, n, 1).createTextFinder(String(key)).matchEntireCell(true).findNext();
  if (!f || f.getRow() === 1) return null;
  var r = f.getRow(); return { row: r, vals: sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0] };
}
/** Записать строку-объект по заголовку листа (новая строка). */
function mx_appendObj(name, o) {
  var hdr = MX_SHEETS[name] || SHEETS[name]; mx_sheet(name).appendRow(hdr.map(function (k) { return cell_(o[k]); }));
}
/** Все строки листа как объекты по заголовку (последние n). */
function mx_rows(name, n) {
  var sh = mx_sheet(name), hdr = MX_SHEETS[name] || SHEETS[name], last = sh.getLastRow(); if (last < 2) return [];
  var from = n ? Math.max(2, last - n + 1) : 2, V = sh.getRange(from, 1, last - from + 1, hdr.length).getValues();
  return V.map(function (r, i) { var o = { _row: from + i }; hdr.forEach(function (k, j) { o[k] = r[j]; }); return o; });
}
function mx_setObj(name, row, o) {
  var sh = mx_sheet(name), hdr = MX_SHEETS[name] || SHEETS[name];
  Object.keys(o).forEach(function (k) { var c = hdr.indexOf(k); if (c >= 0) sh.getRange(row, c + 1).setValue(cell_(o[k])); });
}

/** Настройки по умолчанию (перенос mx_defaults из lib.php); меняются в листе settings (k, v; значение JSON или строка). */
function mx_defaults() {
  return {
    phrases: {
      question: ['Спасибо за вопрос! Передали его специалисту — ответим здесь или в личных сообщениях.', 'Хороший вопрос! Уже уточняем у коллег и скоро ответим.', 'Спасибо, что спросили! Подготовим ответ и вернёмся к вам в ближайшее время.'],
      price: ['Спасибо за интерес! Цены и наличие подскажет менеджер — напишите, пожалуйста, ваш город и количество, или позвоните +7 000 000-00-14.', 'Спасибо! Передали ваш запрос менеджеру — он свяжется с вами и рассчитает стоимость.', 'Спасибо за интерес к нашей мебели! Актуальные цены и условия пришлёт менеджер — оставьте, пожалуйста, контакт в личных сообщениях.'],
      complaint: ['Нам очень жаль, что так вышло. Передали ваше сообщение ответственным — разберёмся и ответим.', 'Спасибо, что сообщили. Уже передали руководителю — свяжемся с вами, чтобы всё решить.', 'Приносим извинения за неудобства. Ваш комментарий получен и передан в работу.'],
      praise: ['Спасибо за тёплые слова! Нам очень приятно.', 'Спасибо! Передадим команде — это лучшая мотивация.', 'Благодарим за отзыв! Рады, что вам понравилось.'],
      general: ['Спасибо за ваш комментарий!', 'Спасибо, что вы с нами!', 'Спасибо за обратную связь — мы всё читаем.']
    },
    marketing: ['user24@example.org', 'user23@example.org'],   // маркетологи (оргструктура)
    head: [],
    cc: ['user5@example.org'],
    mail_types: ['question', 'price', 'complaint'],               // о каких комментариях писать маркетологам ('dialog' — ещё и личные сообщения боту)
    mail_day_max: 40,                                               // адресатов в сутки (лимит Google — 100 на всю почту скрипта)
    comment_chats: [],                                              // чаты обсуждений каналов (комментарии как сообщения чата)
    staff_ids: [],                                                  // id сотрудников в MAX: на их комментарии бот не отвечает
    dm_allow: [],                                                   // id людей MAX, кому в личке можно отвечать по существу помимо участников включённых групп (mx_dmAllowed; op settings)
    owner_names: '(?<![А-Яа-яЁё])(Сотрудник2(а|у|ом|е)?(\\s+Отчество1(а|у|ем|е)?)?|Т\\.\\s?В\\.)(?![А-Яа-яЁё])|(?<![А-Яа-яЁёA-Za-z])ТВ(?![А-Яа-яЁёA-Za-z])',
    mirror: ''                                                      // зеркало Telegram-бота в личке: '' — включено, если есть TG_APP_URL; '0' — выключено
  };
}
/** Настройки: лист settings поверх умолчаний; кэш 2 минуты. mx_set('marketing') → значение. */
function mx_set(k) {
  if (!MX_MEM.set) {
    var d = mx_defaults(), s = null, ca = CacheService.getScriptCache();
    try { s = JSON.parse(ca.get('mx_set') || 'null'); } catch (x) { s = null; }
    if (!s) {
      s = {};
      try { mx_rows('settings').forEach(function (r) { if (r.k) s[String(r.k)] = r.v; }); } catch (x) { mx_log('err', 'настройки: ' + mx_errText(x)); }
      try { ca.put('mx_set', JSON.stringify(s), 120); } catch (x) {}
    }
    Object.keys(s).forEach(function (key) {
      var v = s[key];
      if (typeof d[key] !== 'string' && typeof v === 'string' && /^[\[{]/.test(v.trim())) { try { v = JSON.parse(v); } catch (x) {} }
      if (typeof d[key] === 'number') v = Number(v) || d[key];
      d[key] = v;
    });
    MX_MEM.set = d;
  }
  return MX_MEM.set[k];
}
/** Записать настройку (op settings, импорт): JSON для объектов и массивов. */
function mx_setPut(k, v) {
  var s = typeof v === 'string' ? v : JSON.stringify(v), r = mx_findRow('settings', k, 1);
  if (r) mx_setObj('settings', r.row, { v: s }); else mx_appendObj('settings', { k: k, v: s });
  try { CacheService.getScriptCache().remove('mx_set'); } catch (x) {}
  MX_MEM.set = null;
}

/** Счётчик с лимитом (лист mx_counters, под замком): ключ уже содержит час/день; add — на сколько занять (по умолчанию 1), отрицательное — вернуть.
    → true — место занято (или возвращено), false — лимит исчерпан или нет замка. */
function mx_count(key, limit, add) {
  add = add === undefined ? 1 : Number(add) || 0;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return false;
  try {
    var r = mx_findRow('mx_counters', key, 1), n = r ? Number(r.vals[1]) || 0 : 0;
    if (add < 0) { if (r) mx_setObj('mx_counters', r.row, { n: Math.max(0, n + add), t: new Date() }); return true; }
    if (n + add > limit) return false;
    if (r) mx_setObj('mx_counters', r.row, { n: n + add, t: new Date() }); else mx_appendObj('mx_counters', { k: key, n: add, t: new Date() });
    return true;
  } catch (x) { mx_log('err', 'счётчик ' + key + ': ' + mx_errText(x)); return false; }
  finally { lock.releaseLock(); }
}
function mx_countersTrim() {
  try {
    var sh = mx_sheet('mx_counters'), R = mx_rows('mx_counters'), lim = Date.now() - 2 * 864e5;
    for (var i = R.length - 1; i >= 0; i--) { var t = R[i].t instanceof Date ? R[i].t.getTime() : 0; if (t && t < lim) sh.deleteRow(R[i]._row); }
  } catch (x) { mx_log('err', 'счётчики (обрезка): ' + mx_errText(x)); }
}

// REDACTED_B64_2 время, тексты, люди
function mx_msk(fmt, d) { return Utilities.formatDate(d || new Date(), 'Europe/Moscow', fmt); }
function mx_hourKey() { return mx_msk('yyyy-MM-dd-HH'); }
function mx_dayKey() { return mx_msk('yyyy-MM-dd'); }
function mx_tsText(ms) { return mx_msk('dd.MM.yyyy HH:mm', new Date(Number(ms) || Date.now())) + ' МСК'; }
/** Тихие часы вмешательств от имени Т. В. в группах — 19:00–07:00 МСК и праздники (RULES 04.11 ~18:15: только читать, отвечать утром):
    au_isQuiet шага 5 → по часам (+ праздники из листа tm_settings, если есть таймеры). Окно таймеров tm_quiet_ (уведомления сотрудникам, 20–08)
    здесь НЕ используется — это другое окно (проверка 1, 05.11). В тихие часы бот в группах молчит; история и уведомления владельцу — как всегда. */
function mx_quiet() {
  if (typeof au_isQuiet === 'function') { try { return !!au_isQuiet(Date.now()); } catch (x) { mx_log('err', 'au_isQuiet: ' + mx_errText(x)); } }
  var h = Number(mx_msk('H')); if (h >= 19 || h < 7) return true;
  if (typeof tm_isHoliday_ === 'function') { try { return !!tm_isHoliday_(mx_dayKey()); } catch (x) {} }
  return false;
}
/** Подпись автономных ответов в личке: au_sign шага 5 (днём Т. В., в тихие часы 19–07 и праздники — голос бота; проверка 2, 05.11), без модуля — по mx_quiet. */
function mx_signNow() {
  if (typeof au_sign === 'function') { try { return String(au_sign(Date.now()) || MX_SIGN); } catch (x) { mx_log('err', 'au_sign: ' + mx_errText(x)); } }
  return mx_quiet() ? MX_SIGN_BOT : MX_SIGN;
}
/** Рабочее время для напоминаний и вопросов без ответа: будни 08:00–19:00 МСК, не тихие часы и не праздник. */
function mx_workTime() {
  if (mx_quiet()) return false;
  var u = Number(mx_msk('u')), h = Number(mx_msk('H'));
  return u <= 5 && h >= 8 && h < 19;
}
/** Руководители (бот вопросов не задаёт): au_isLeader шага 5; без модуля — имена из RULES 03.11. */
function mx_isLeader(name, uid) {
  if (typeof au_isLeader === 'function') { try { return !!(au_isLeader(name) || (uid && au_isLeader(String(uid)))); } catch (x) { mx_log('err', 'au_isLeader: ' + mx_errText(x)); } }
  var own = mx_ownerUid(); if (own && Number(uid) === own) return true;
  return /(^|\s)(Сотрудник2\s*М|Сотрудник2\s+Отчество1|Сотрудник1\S*\s+Т(?![а-яё])|Сотрудник18|Сотрудник80|Сотрудник10|Сотрудник23\S*\s+Сотрудник24|Сотрудник24\s+Отчество1|Сотрудник23\S*\s+В\.\s*В\.|Сотрудник19|Сотрудник16|Сотрудник1\s+А(ндрей|\.\s*А\.))/i.test(String(name || ''));
}
/** Имя27 и Джанова (не работают): лично им бот в MAX ничего не адресует (RULES 04.11 ~18:15, bot_rules.bans). */
function mx_isBanned(name) { return /попов|джанов/i.test(String(name || '')); }
function mx_maskPhones(s) { return String(s == null ? '' : s).replace(/(\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g, '[тел.]'); }
function mx_text(m) { return String(((m || {}).body || {}).text || '').trim(); }
function mx_name(s) {
  s = s || {}; var n = String((s.first_name || '') + ' ' + (s.last_name || '')).trim() || String(s.name || '') || 'без имени';
  return n + (s.username ? ' (@' + s.username + ')' : '');
}
/** Вложения сообщения кратко: [фото, файл] (для уведомлений) */
function mx_attNote(m) {
  var a = ((m || {}).body || {}).attachments || []; if (!a.length) return '';
  var N = { image: 'фото', video: 'видео', audio: 'аудио', file: 'файл', sticker: 'стикер', location: 'место', contact: 'контакт', share: 'ссылка' }, seen = {}, k = [];
  a.forEach(function (x) { var t = N[x.type] || String(x.type || ''); if (t && !seen[t]) { seen[t] = 1; k.push(t); } });
  return k.length ? '[' + k.join(', ') + ']' : '';
}
function mx_hasMedia(m) { return (((m || {}).body || {}).attachments || []).some(function (x) { return x.type === 'image' || x.type === 'video' || x.type === 'file'; }); }
/** Сообщение MAX → запись истории (как norm_msg в mx_ctl.py + вложения): телефоны заменены на [тел.]. */
function mx_normMsg(m, rc) {
  var s = m.sender || {}, b = m.body || {}, lk = m.link || {}, rc2 = rc || m.recipient || {};
  var o = { ts: Number(m.timestamp || 0), cid: String(rc2.chat_id || ''), mid: String(b.mid || ''), uid: s.user_id || null, name: mx_name(s).slice(0, 80), bot: !!s.is_bot,
            text: mx_maskPhones(String(b.text || '')).slice(0, 4000), rmid: lk.type === 'reply' ? String((lk.message || {}).mid || '') : '',
            ruid: lk.type === 'reply' && lk.sender ? (lk.sender.user_id || null) : null, rname: lk.type === 'reply' && lk.sender ? mx_name(lk.sender).slice(0, 80) : '',
            att: (b.attachments || []).map(function (a) { var p = a.payload || {}; return { type: String(a.type || ''), url: String(p.url || ''), name: String(a.filename || p.filename || '') }; }),
            ment: (b.markup || []).filter(function (x) { return x.type === 'user_mention' && x.user_id; }).map(function (x) { return x.user_id; }) };
  if (lk.type === 'forward') o.fwd = { from: mx_name(lk.sender || {}).slice(0, 80), text: String((lk.message || {}).text || '').slice(0, 500) };
  return o;
}

// REDACTED_B64_2 MAX API (через api_ из Code.gs — токен только там)
function mx_botUid() {
  if (MX_MEM.me !== undefined) return MX_MEM.me;
  var ca = CacheService.getScriptCache(), v = ca.get('mx_me');
  if (!v) { var r = api_('GET', '/me'); v = ok_(r[0]) ? String((r[1] || {}).user_id || '') : ''; if (v) ca.put('mx_me', v, 21600); }
  MX_MEM.me = v || ''; return MX_MEM.me;
}
function mx_ownerUid() { return Number(P_().getProperty('OWNER_UID') || 0); }
/** Тело сообщения MAX: text (по умолчанию HTML MAX), extra — link/attachments/format (format: '' — без разметки, как есть). */
function mx_msgBody(text, extra) {
  var body = { text: String(text == null ? '' : text).slice(0, 3990), format: 'html' }; Object.keys(extra || {}).forEach(function (k) { body[k] = extra[k]; });
  if (!body.format) delete body.format;
  return body;
}
/** Сообщение в чат: → [код, ответ]. Своё сообщение в группе — тоже в историю (повтор того же mid из вебхука не дублируется). */
function mx_sendChat(cid, text, extra) {
  var r = api_('POST', '/messages', { chat_id: cid }, mx_msgBody(text, extra));
  if (ok_(r[0])) { try { var msg = (r[1] || {}).message; if (msg) mx_histAdd(mx_normMsg(msg, msg.recipient || { chat_id: cid, chat_type: 'chat' })); } catch (x) {} }
  return r;
}
function mx_sendUser(uid, text, extra) { return api_('POST', '/messages', { user_id: uid }, mx_msgBody(text, extra)); }
function mx_answerCb(cbid, text) { if (cbid) api_('POST', '/answers', { callback_id: cbid }, { notification: String(text).slice(0, 200) }); }

// REDACTED_B64_2 вызовы Telegram-скрипта (вместо max/hook.php → GAS_URL и relay.php)
/** Общий ключ с Telegram-скриптом: hex HMAC-SHA256(K_CMD как байты, 'fabrika-max-v1') — так же выводит v44l (maxKeyDerived_) и хостинг (max_key_sync.py). */
function mx_maxKey() {
  if (MX_MEM.maxKey !== undefined) return MX_MEM.maxKey;
  var k = kcmd_(); MX_MEM.maxKey = k ? hmacHex_(k, 'fabrika-max-v1') : ''; return MX_MEM.maxKey;
}
/** Сравнение секретов без утечки по времени: через SHA-256 обоих значений. */
function mx_keyOk(given) { var mine = mx_maxKey(); return !!mine && typeof given === 'string' && sha256hex_(given) === sha256hex_(mine); }
/** POST в веб-приложение Telegram-скрипта (свойство TG_APP_URL): payload.op — maxown | maxupd | maxmail | tgcall — те же поля, что hook.php
    шлёт сегодня (mx_gas). Подпись двойная, чтобы v44m принял любым из своих способов: key — общий ключ (maxKeyOk_, как hook.php),
    плюс t / d / s — HMAC K_CMD в виде post.php ('mx:' + t + ':' + sha256hex(d), d = JSON всех полей без key). → ответ JSON | {ok:false, error}. */
function mx_tgCall(payload) {
  var url = String(P_().getProperty('TG_APP_URL') || '').trim(), key = mx_maxKey(), kc = kcmd_();
  if (!/^https:\/\/script\.google\.com\//.test(url)) return { ok: false, error: 'нет TG_APP_URL' };
  if (!key || !kc) return { ok: false, error: 'нет K_CMD' };
  if (payload && payload.op === 'tgcall') { payload.meta = payload.meta || {}; if (!payload.meta.mid) payload.meta.mid = 'mx' + sha256hex_(String(payload.method || '') + ':' + JSON.stringify(payload.params || {})).slice(0, 24); }   // стабильный id операции (v44m: дедуп и досылка недоставленным по meta.mid)
  var p = {}; Object.keys(payload || {}).forEach(function (k) { if (k !== 'key') p[k] = payload[k]; });
  var d = JSON.stringify(p), t = Math.floor(Date.now() / 1000);
  p.key = key; p.t = t; p.d = d; p.s = hmacHex_(kc, 'mx:' + t + ':' + sha256hex_(d));
  try {
    var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(p), muteHttpExceptions: true, followRedirects: true });
    var txt = r.getContentText(), code = r.getResponseCode(), j = null; try { j = JSON.parse(txt); } catch (x) { j = null; }
    if (!j) return { ok: false, error: 'скрипт Telegram ответил не JSON (' + code + ')', code: code };
    if (j.code === undefined) j.code = code;
    return j;
  } catch (x) { return { ok: false, error: 'скрипт Telegram: ' + mx_errText(x).split(key).join('***'), code: 0 }; }
}
/** Исход вызова Telegram-скрипта (v44m, 05.11: op tgcall отвечает state — sent | retry | permanent | uncertain; ok:true только если доставлено всем):
    'sent' | 'retry' (повторять ТЕМ ЖЕ payload — тот же meta.mid, скрипт дошлёт недоставленным; сюда же 409 «уже выполняется» и сетевые/конфигурационные
    отказы) | 'uncertain' (дошло ли — неизвестно: НЕ повторять и НЕ слать запасным путём — иначе дубль) | 'permanent' | 'unknown' (ответ без state — старый
    скрипт или неизвестная команда). */
function mx_tgState(r) {
  if (!r) return 'retry';
  if (r.ok) return 'sent';
  var st = String(r.state || '');
  if (st === 'retry' || st === 'uncertain' || st === 'permanent' || st === 'sent') return st;
  if (/^(нет TG_APP_URL|нет K_CMD)/.test(String(r.error || ''))) return 'permanent';   // не настроено — повторять нечем (в журнал), без мёртвых записей в Outbox
  if (Number(r.code) === 409 || /^скрипт Telegram/.test(String(r.error || ''))) return 'retry';
  return 'unknown';
}
/** Сообщение владельцу в Telegram: op tgcall (Telegram-метод sendMessage, chat_id 'owner' — разрешает Telegram-скрипт, кнопки — inline_keyboard; meta.mid —
    стабильный id операции: note.id || note.mid). Исходы: sent → true; retry → тот же payload в Outbox (тик повторит с тем же meta.mid); uncertain → в Outbox
    со статусом uncertain (без автоповтора, техтревога владельцу — модуль); permanent → журнал; без state (скрипт op не знает) — прежний op maxown
    (текст без кнопок, кнопки — списком), не ушёл → в Outbox. → true — доставлено сейчас. */
function mx_tgOwner(text, buttons, note) {
  note = note || {};
  var kb = (buttons || []).map(function (b) { return [{ text: String(b.label).slice(0, 60), callback_data: String(b.data).slice(0, 64) }]; });
  var params = { chat_id: 'owner', text: String(text).slice(0, 3900), parse_mode: 'HTML', disable_web_page_preview: true };
  if (kb.length) params.reply_markup = { inline_keyboard: kb };
  var opId = String(note.id || note.mid || ''), meta = {}; Object.keys(note).forEach(function (k) { meta[k] = note[k]; });
  if (opId) meta.mid = opId;
  var p1 = { op: 'tgcall', method: 'sendMessage', params: params, meta: meta }, r = mx_tgCall(p1), st = mx_tgState(r), key = 'tgowner:' + (opId || p1.meta.mid);
  if (st === 'sent') return true;
  if (st === 'retry') { mx_log('tg', 'владельцу в Telegram — повторим (' + String(r.error || r.code || '').slice(0, 100) + ')'); mx_outbox(key, 'mx_tg', 'owner', p1); return false; }
  if (st === 'uncertain') { mx_log('tg', 'владельцу в Telegram — исход неизвестен, повтора нет: ' + String(r.error || '').slice(0, 100)); mx_outboxUncertain(key, 'mx_tg', 'owner', p1, r.error); return false; }
  if (st === 'permanent') { mx_log('tg', 'владельцу в Telegram не доставлено (окончательно): ' + String(r.error || '').slice(0, 120)); return false; }
  var plain = String(text).replace(/<[^>]+>/g, '') + (kb.length ? '\n\nОтветить: ' + (buttons || []).map(function (b) { return '«' + b.label + '»'; }).join(' / ') + ' — напишите в бот.' : '');
  var p2 = { op: 'maxown', mid: String(opId || p1.meta.mid), ts: Date.now(), g: String(note.g || 'бот MAX'), n: 'бот', why: String(note.why || 'сообщение бота'), x: plain.slice(0, 3000), att: '' };
  var r2 = mx_tgCall(p2);
  if (!(r2 && r2.ok)) {
    mx_log('tg', 'владельцу в Telegram не доставлено: ' + String((r && r.error) || (r2 && r2.error) || '?').slice(0, 120));
    if (mx_tgState(r2) === 'uncertain') mx_outboxUncertain(key, 'mx_tg', 'owner', p2, r2.error); else mx_outbox(key, 'mx_tg', 'owner', p2);   // GPT A5: не теряем — тик дошлёт (тот же mid)
  }
  return !!(r2 && r2.ok);
}

// REDACTED_B64_2 допуск к боту в личке (GPT A1, 05.11; правило Т. В. 28.10: «доступ только через моё согласование»)
/** Кому в личке можно отвечать по существу (база знаний, автономность, передача команды Claude): владелец; uid из settings.dm_allow; участники
    ВКЛЮЧЁННЫХ групп бота (appr и on, не каналы) — список участников берётся из MAX и кэшируется (MX_STAFF_TTL). Fail-closed: список не получен
    (MAX не ответил, пусто) — отказ, а не разрешение; имя человека не проверяется (его можно подделать). → true/false. */
var MX_STAFF_TTL = 600;
function mx_dmAllowed(uid) {
  uid = String(Number(uid) || 0); if (uid === '0') return false;
  var own = mx_ownerUid(); if (own && uid === String(own)) return true;
  var allow = mx_set('dm_allow'); if (Array.isArray(allow) && allow.map(String).indexOf(uid) >= 0) return true;
  var S = mx_staff(false); if (S && S[uid]) return true;
  if (S && !MX_MEM.staffFresh) { S = mx_staff(true); if (S && S[uid]) return true; }   // в кэше нет — один раз за запуск спросить MAX заново (человек мог войти в группу только что)
  return false;
}
/** Участники включённых групп: {uid: 1} из кэша (mx_staff) или из MAX (refresh=true либо кэш пуст). → объект | null (MAX не дал ни одного списка — fail-closed). */
function mx_staff(refresh) {
  var ca = null; try { ca = CacheService.getScriptCache(); } catch (x) { ca = null; }
  if (!refresh && ca) { try { var c = JSON.parse(ca.get('mx_staff') || 'null'); if (c && typeof c === 'object') return c; } catch (x) {} }
  var G = mx_groups(), S = {}, got = 0;
  Object.keys(G).forEach(function (cid) {
    if (!mx_groupOn(G[cid]) || G[cid].channel) return;
    try { var M = members_(cid); var ks = Object.keys(M); if (ks.length) { got++; ks.forEach(function (u) { S[u] = 1; }); } } catch (x) { mx_log('err', 'участники ' + cid + ': ' + mx_errText(x)); }
  });
  MX_MEM.staffFresh = true;
  if (!got) return null;
  if (ca) { try { ca.put('mx_staff', JSON.stringify(S), MX_STAFF_TTL); } catch (x) {} }
  return S;
}

// REDACTED_B64_2 push к Claude (модуль cp_ шага 5; без него — ничего не шлём)
function mx_pushOn() { return typeof cp_push === 'function' && typeof cp_enabled === 'function' && !!cp_enabled(); }
/** ev = {src, who, chat, id, text, ctx}; now — сразу (личная команда Т. В. или руководителя) или пачкой через cp_flush. → true, если принято модулем
    (повтор того же id модуль не шлёт второй раз). Текст и контекст — без телефонов. */
function mx_push(ev, now) {
  if (!mx_pushOn()) return false;
  try {
    ev.text = mx_maskPhones(ev.text).slice(0, 20000);
    if (ev.ctx) ev.ctx = ev.ctx.map(function (s) { return mx_maskPhones(s); });
    return !!cp_push(ev, !!now);
  } catch (x) { mx_log('err', 'push: ' + mx_errText(x)); return false; }
}
/** push с гарантией (GPT A5): модуль cp_ не принял (исключение, замок, таблица) → событие в Outbox (kind mx_push, key 'push:<id>') и досылается тиком.
    → true — Claude получит событие (принято модулем или отложено); false — push не настроен или и Outbox недоступен (в журнале «потеряно»). */
function mx_pushOut(ev, now) {
  if (!mx_pushOn()) return false;
  if (mx_push(ev, now)) return true;
  return mx_outbox('push:' + String(ev.id || ''), 'mx_push', String(ev.src || ''), { ev: ev, now: !!now });
}
/** Тихие часы: событие группы для Claude откладывается до утра (лист mx_defer); mx_deferFlush шлёт всё одной пачкой в первый тик после 07:00. */
function mx_deferAdd(ev) {
  try {
    if (mx_findRow('mx_defer', ev.id, 1)) return true;
    mx_appendObj('mx_defer', { id: ev.id, ts: Date.now(), cid: ev.chat, g: ev.g || '', who: ev.who, why: ev.why || '', text: ev.text.slice(0, 6000), ctx: JSON.stringify(ev.ctx || []).slice(0, 12000), t: new Date() });
    return true;
  } catch (x) { mx_log('err', 'отложенные (запись): ' + mx_errText(x)); return false; }
}
function mx_deferFlush() {
  if (mx_quiet() || !mx_pushOn()) return 0;
  var R = mx_rows('mx_defer'); if (!R.length) return 0;
  var sh = mx_sheet('mx_defer'), done = [];
  R.forEach(function (r) {
    var ctx = []; try { ctx = JSON.parse(r.ctx || '[]'); } catch (x) {}
    if (mx_pushOut({ src: 'group', who: String(r.who || ''), chat: String(r.cid), id: String(r.id), text: '[тихие часы — событие ' + mx_tsText(r.ts) + ']\n' + String(r.text || ''), ctx: ctx }, false)) done.push(r._row);
  });
  for (var i = done.length - 1; i >= 0; i--) sh.deleteRow(done[i]);        // отданы модулю (у него свой буфер и журнал) — строки убираются снизу вверх
  if (done.length) mx_log('push', 'отложенных событий передано Claude: ' + done.length);
  return done.length;
}
