/* «Фабрика — бот MAX» — MaxCorePrivate.gs (05.11.2026): личные сообщения боту (перенос mx_dialog, mx_owner_post, mx_owner_poll, mx_to_tg из hook.php,
   меню из lib.php). Команды владельца: «/owner КОД» (привязка — ownerBind_ из Relay.gs, замечание 09), «В <группа>: текст» (публикация сразу),
   «Итоги опроса [id]». Зеркало Telegram-бота: событие в виде Telegram → Telegram-скрипт (op maxupd на TG_APP_URL — как hook.php → GAS_URL сегодня),
   ответы людям возвращаются через op tgcall (MaxCoreOps.gs). Без зеркала (нет TG_APP_URL или оно выключено в settings.mirror='0'): меню, справка о компании
   раз в 12 ч, ответ из базы знаний (kb_find), неизвестная команда → «Принял, передал — ответ придёт сюда» + push к Claude (cp_push … now=true).
   Когда зеркало работает, неизвестные команды к Claude передаёт сам Telegram-скрипт (v44m) — чтобы не будить Claude дважды. */

var MX_OWNER_CMD = /^\s*в\s+(?:группу\s+)?([^:\n]{3,60}?)\s*:\s*(\S[\s\S]*)$/i;
var MX_CMDS = [['start', 'Меню'], ['sklad', 'Склад сейчас'], ['vypusk', 'Выпуск за вчера'], ['dannye', 'Отчёты: что пришло'],
               ['docs', 'Инструкции и документы'], ['app', 'Приложение для Android'], ['help', 'Что умеет бот']];

function mx_mirrorOn() { return String(mx_set('mirror') || '') !== '0' && /^https:\/\/script\.google\.com\//.test(String(P_().getProperty('TG_APP_URL') || '')); }

function mx_dialog(u, m) {
  var type = String(u.update_type || ''), user = type === 'message_callback' ? ((u.callback || {}).user || {}) : type === 'bot_started' ? (u.user || {}) : ((m || {}).sender || {});
  var uid = Number(user.user_id || 0); if (!uid) return;
  var text = type === 'message_created' ? mx_text(m) : '', own = mx_ownerUid(), p = P_();
  var mm = text.match(/^\/owner(?:@\S+)?\s+(\d{6})\s*$/);
  if (mm) {
    if (p.getProperty('OWNER_CODE')) { ownerBind_(uid, mm[1]); return; }                       // код выдан ownerCode() из редактора — проверка в Relay.gs (замечание 09)
    mx_sendUser(uid, 'Код не выдан или уже использован. Код владельца создаёт Т. В. Сотрудник1 в редакторе скрипта (ownerCode).'); return;
  }
  if (own && uid === own && type === 'message_created') {
    var gm = text.match(MX_OWNER_CMD);
    if (gm && mx_ownerPost(uid, gm[1], gm[2])) return;
    var pm = text.match(/^\s*итоги\s+опроса(?:\s+(\S+))?\s*$/i);
    if (pm) return mx_ownerPoll(uid, pm[1] || '');
  }
  // 24.11.2026, Т. В. (опрос «Только полный»): «калькулятор КОД» — запрос доступа к калькулятору мебели. Только свой сотрудник (mx_dmAllowed:
  //   владелец, dm_allow, участники рабочих групп) — тогда подписанно в калькулятор (op claim) → Т. В. в Telegram «Пустить / Отказать». Чужой — отказ, Т. В. ничего не приходит.
  var cm = type === 'message_created' && text.match(/^\s*калькулятор\s*:?\s*(\d{6})\s*$/i);
  if (cm) { mx_calcClaim(uid, user, cm[1]); return; }
  // 11.11.2026: ответ на вопрос бота по контрольным точкам в личке — в контроль сроков (TimersCtl), до зеркала и помощника
  if (type === 'message_created' && typeof tm_remCtlDmAnswer_ === 'function' && tm_remCtlDmAnswer_(uid, String(user.name || ((user.first_name || '') + ' ' + (user.last_name || ''))).trim(), text, m)) return;   // 13.11: автор контроля — срок/исполнители
  if (type === 'message_created' && typeof tm_ctlDmAnswer_ === 'function' && tm_ctlDmAnswer_(uid, String(user.name || ((user.first_name || '') + ' ' + (user.last_name || ''))).trim(), text, m)) return;
  if (/^\/owner\b/.test(text)) { mx_sendUser(uid, own && own === uid ? 'Вы — владелец бота: пересылаю обращения к вам из групп.' : 'Код владельца выдаёт Т. В. Сотрудник1 (функция ownerCode в редакторе). Напишите: /owner 123456'); return; }
  var mirror = mx_mirrorOn();
  if (/^(\/|\/menu|\/commands|\/команды|меню|команды)$/i.test(text)) { mx_cmdMenu(uid); return; }
  if (mirror) {                                                                                  // зеркало Telegram-бота — тот же формат, что hook.php → op maxupd
    var tg = mx_toTg(u, m, user);
    if (tg) {
      var r = mx_tgCall({ op: 'maxupd', u: tg });
      if (!(r && r.ok)) { mx_log('tg', 'mirror_retry'); throw new Error('mirror_retry'); }
    }
    if (type === 'bot_started' || /^\/start\b/.test(text)) mx_cmdMenu(uid);
    return;
  }
  if (type === 'message_callback') { mx_answerCb((u.callback || {}).callback_id, 'Кнопки обрабатывает Telegram-скрипт — он сейчас недоступен.'); return; }
  if (type === 'bot_started' || /^\/start\b/.test(text)) { mx_cmdMenu(uid); return; }
  mx_dialogSelf(uid, user, text, m);
}
/** Личное сообщение без зеркала: ответ из базы знаний (kb_find) → иначе «Принял, передал» + push Claude; справка о компании раз в 12 ч; письмо маркетологам, если включено.
    Допуск (GPT A1, 05.11; правило Т. В. 28.10): база знаний, автономность и передача команды Claude — только своим (mx_dmAllowed: владелец,
    settings.dm_allow, участники включённых групп; MAX не ответил — отказ). Посторонний (клиент) получает только справку о компании раз в 12 ч
    (+ письмо маркетологам при 'dialog' в mail_types) — как на хостинге; недоступность зеркала доступ не открывает. */
function mx_dialogSelf(uid, user, text, m) {
  if (!text) return;
  var name = mx_name(user);
  if (!mx_dmAllowed(uid)) {
    mx_log('dm', 'личное от неизвестного uid ' + uid + ' — только справка (допуск не подтверждён)');
    return mx_dialogGuest(uid, user, text, m);
  }
  if (!mx_isBanned(name) && typeof au_reclReply === 'function') {                  // рекламация с фото в личке — как в группе: акт РК 01, сроки, ГК; наблюдение
    var det = mx_detect(text, mx_hasMedia(m));
    if (det.kind === 'recl') {
      try {
        var reply = au_reclReply({ group: '', cid: '', mid: String(((m || {}).body || {}).mid || ''), name: name, text: text, words: det.words, hasMedia: mx_hasMedia(m), sign: mx_signNow() });   // ночью — голос бота, не Т. В.
        if (reply && ok_(mx_sendUser(uid, reply)[0])) {
          if (typeof au_reclWatchAdd === 'function') au_reclWatchAdd({ group: 'личные', cid: 'u' + uid, mid: String(((m || {}).body || {}).mid || ''), client: '', defect: det.words.join(' ').slice(0, 80), manager: name, t: Date.now() });
          mx_log('auto', 'рекламация в личке: ответ отправлен, наблюдение записано');
          if (mx_pushOn()) mx_pushOut({ src: 'max', who: name + ' (id ' + uid + ')', chat: String(uid), id: 'max:dm:' + String(((m || {}).body || {}).mid || Date.now()), text: 'Рекламация в личке (бот ответил: акт РК 01, сроки, ГК):\n' + text.slice(0, 3000) + (mx_attNote(m) ? '\n' + mx_attNote(m) : '') + '\n(ответ: op dm uid=' + uid + ')' }, false);
          return;
        }
      } catch (x) { mx_log('err', 'рекламация (личка): ' + mx_errText(x)); }
    }
  }
  if (typeof kb_find === 'function' && text.length >= 6 && !/^\//.test(text)) {
    try {
      var ka = null; try { ka = mx_tgCall({ op: 'maxkb', q: text.slice(0, 1500), n: name }); } catch (xk) { ka = null; }   // 10.11 Т. В.: ответ по регламентам портала (база знаний + GPT)
      if (ka && ka.ok && ka.known && ka.text) { mx_sendUser(uid, '<b>По регламентам портала</b>\n' + h_(String(ka.text)) + '\n\n<i>Если не то — напишите подробнее.</i>'); mx_log('kb', 'личное: ответ GPT по базе'); return; }
      var fr = kb_find(text, 3) || [];
      if (fr.length) {
        mx_sendUser(uid, '<b>Из базы знаний</b>\n' + fr.map(function (f) { return '• <b>' + h_(String(f.title || '').slice(0, 120)) + '</b>\n' + h_(String(f.text || '').slice(0, 900)); }).join('\n\n') + '\n\n<i>Если нужен точный ответ — передам коллегам.</i>');
        mx_log('kb', 'личное: ответ из базы (' + fr.length + ')'); return;
      }
    } catch (x) { mx_log('err', 'kb_find: ' + mx_errText(x)); }
  }
  if (mx_pushOn()) {                                                                             // неизвестная команда → Claude: Т. В. и руководители — сразу, остальные — пачкой
    var mid = String(((m || {}).body || {}).mid || ''), now = uid === mx_ownerUid() || mx_isLeader(name, uid);
    // GPT A5: модуль cp_ не принял → событие в Outbox (досылка тиком) — обещание «передал» выполнимо; не записалось и туда — честно сказать человеку
    var ok = mx_pushOut({ src: 'max', who: name + ' (id ' + uid + ')', chat: String(uid), id: 'max:dm:' + (mid || Date.now()), text: text.slice(0, 3000) + (mx_attNote(m) ? '\n' + mx_attNote(m) : '') + '\n(ответ: op dm uid=' + uid + ')' }, now);
    mx_sendUser(uid, ok ? 'Принял, передал — ответ придёт сюда.' : 'Не получилось передать сообщение — напишите, пожалуйста, ещё раз чуть позже или позвоните +7 000 000-00-14.');
    return;
  }
  mx_dialogGuest(uid, user, text, m);
}
/** Справка о компании (раз в 12 ч на человека) + письмо маркетологам при 'dialog' в mail_types — для посторонних и когда push не настроен (как на хостинге). */
function mx_dialogGuest(uid, user, text, m) {
  if (!mx_hello(uid)) return;
  var hc = mx_sendUser(uid, 'Здравствуйте! Это бот «Фабрикант».\n\nМебель для офиса и дома, цены и наличие: <a href="https://fabrikant.su">fabrikant.su</a>, +7 000 000-00-14.\nВаше сообщение мы получили — менеджер ответит в рабочее время.');
  if (ok_(hc[0]) && (mx_set('mail_types') || []).indexOf('dialog') >= 0)
    mx_commentMail({ chat: '', post: '', mid: '', sender: user, text: text, ts: (m || {}).timestamp || 0, url: '' }, 'question', '', 'личное сообщение боту — ответ справкой');
}
/** Справка — не чаще раза в 12 часов на человека (лист mx_hello). */
function mx_hello(uid) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return false;
  try {
    var r = mx_findRow('mx_hello', String(uid), 1), now = Date.now();
    if (r && r.vals[1] instanceof Date && now - r.vals[1].getTime() < 12 * 3600e3) return false;
    if (r) mx_setObj('mx_hello', r.row, { t: new Date() }); else { mx_appendObj('mx_hello', { uid: String(uid), t: new Date() }); var sh = mx_sheet('mx_hello'); if (sh.getLastRow() > 3000) sh.deleteRows(2, 1000); }
    return true;
  } finally { lock.releaseLock(); }
}
/** Меню команд — сообщением с кнопками (MAX не даёт боту задать список команд: PATCH /me не поддержан, lib.php 27.10). */
function mx_cmdMenu(uid) {
  var L = [], B = [];
  MX_CMDS.forEach(function (c) { L.push('/' + c[0] + ' — ' + c[1]); if (c[0] !== 'start') B.push({ type: 'message', text: '/' + c[0] }); });
  var rows = []; for (var i = 0; i < B.length; i += 3) rows.push(B.slice(i, i + 3));
  return mx_sendUser(uid, '<b>Бот «Фабрикант» — команды</b>\n' + h_(L.join('\n')) + '\n\nНажмите кнопку ниже или просто напишите вопрос словами, например: «сколько на складе кресел Бун», «кто мастер 5 участка».\nЗаявка на ремонт, «камера не работает», документ — тоже сюда: бот спросит, что нужно.\nЭтот список — по слову «меню».',
    { attachments: [{ type: 'inline_keyboard', payload: { buttons: rows } }] });
}
/** «В <группа>: текст» от владельца → сразу в группу. true — команда обработана (опубликовано или сообщение об ошибке). */
function mx_ownerPost(uid, q, body) {
  var f = mx_findGroup(q); if (f === null) return false;
  if (f === 'many') { mx_sendUser(uid, 'Под «' + h_(q.trim()) + '» подходит несколько групп — напишите название точнее.'); return true; }
  var r = mx_sendChat(f[0], h_(body.trim())), ok = ok_(r[0]);
  mx_log('owner', 'публикация в группе ' + f[0] + ' «' + f[1] + '»: ' + (ok ? 'ok' : 'ошибка ' + r[0]));
  mx_sendUser(uid, ok ? '✅ Опубликовано в «' + h_(f[1]) + '».' : '❌ Не получилось опубликовать в «' + h_(f[1]) + '» (MAX ' + r[0] + '). Попробуйте ещё раз.');
  return true;
}
/** «Итоги опроса <id>» — владельцу сразу; без id — список последних опросов (файлы «Фабрика — боты/MAX/polls/<id>.json»). */
function mx_ownerPoll(uid, id) {
  if (id) { var p = mx_pollGet(id); mx_sendUser(uid, p ? mx_pollSummary(p) : 'Опрос «' + h_(id) + '» не найден. Напишите «Итоги опроса» — пришлю список.'); return; }
  var L = [], it = maxDir_('polls').getFiles(), n = 0;
  while (it.hasNext() && n < 60) { var f = it.next(); n++; try { var j = JSON.parse(f.getBlob().getDataAsString('UTF-8')); if (j && j.id) L.push(j); } catch (x) {} }
  L.sort(function (a, b) { return Number(b.created || 0) - Number(a.created || 0); });
  var out = L.slice(0, 10).map(function (j) { return '• ' + h_(j.id) + ' — «' + h_(j.title || '') + '», ' + h_(j.group || '') + ', до ' + mx_pollMsk(j.deadline); });
  mx_sendUser(uid, out.length ? '<b>Опросы</b>\n' + out.join('\n') + '\n\nИтоги: «Итоги опроса <i>id</i>».' : 'Опросов пока не было.');
}
/** Файл из MAX для зеркала: id 'max:<24 hex>' → лист mx_files (getFile Telegram-скрипта отдаёт адрес). */
function mx_fileId(tok, url, kind, name) {
  var id = 'max:' + sha256hex_(tok + '|' + url).slice(0, 24);
  try {
    var r = mx_findRow('mx_files', id, 1);
    if (r) mx_setObj('mx_files', r.row, { tok: tok, url: url, k: kind, n: name, t: new Date() });
    else { mx_appendObj('mx_files', { id: id, tok: tok, url: url, k: kind, n: name, t: new Date() }); var sh = mx_sheet('mx_files'); if (sh.getLastRow() > 1500) sh.deleteRows(2, 500); }
  } catch (x) { mx_log('err', 'файлы: ' + mx_errText(x)); }
  return id;
}
function mx_fileGet(id) { var r = mx_findRow('mx_files', String(id), 1); return r ? { tok: String(r.vals[1] || ''), url: String(r.vals[2] || ''), k: String(r.vals[3] || ''), n: String(r.vals[4] || '') } : null; }
/** MAX → событие в виде Telegram для Telegram-скрипта (как mx_to_tg в hook.php): id людей — MX_ID_BASE + id; update_id из ключа события (повтор → тот же номер). */
function mx_toTg(u, m, user) {
  var type = String(u.update_type || ''), uid = Number(user.user_id || 0), id = MX_ID_BASE + uid;
  var from = { id: id, is_bot: false, first_name: String(user.first_name || user.name || ''), last_name: String(user.last_name || ''), username: String(user.username || '') };
  if (!from.first_name && !from.last_name) from.first_name = 'MAX ' + uid;
  var ts = Number(u.timestamp || Date.now()), b = (m || {}).body || {};
  var keyStr = [type, String(b.mid || ''), String((u.callback || {}).callback_id || ''), String(u.timestamp || ''), String((u.user || {}).user_id || '')].join(':');
  var md5 = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, keyStr, Utilities.Charset.UTF_8).slice(0, 2).map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
  var upd = { update_id: ts * 1000 + (parseInt(md5.slice(0, 3), 16) % 1000), via: 'max' };
  if (type === 'message_callback') {
    upd.callback_query = { id: 'max:' + String((u.callback || {}).callback_id || ''), data: String((u.callback || {}).payload || ''), from: from, message: { message_id: String(b.mid || ''), chat: { id: id, type: 'private' } } };
    return upd;
  }
  var msg = { message_id: String(b.mid || ('start' + ts)), date: Math.floor(ts / 1000), chat: { id: id, type: 'private' }, from: from };
  if (type === 'bot_started') { msg.text = '/start' + (u.payload ? ' ' + u.payload : ''); upd.message = msg; return upd; }
  var t = mx_text(m); if (t) msg.text = t;
  (b.attachments || []).forEach(function (a) {
    var p = a.payload || {}, tok = String(p.token || ''), url = String(p.url || ''); if (!tok && !url) return;
    if (a.type === 'image') msg.photo = [{ file_id: mx_fileId(tok, url, 'image', 'foto.jpg') }];
    else if (a.type === 'file') msg.document = { file_id: mx_fileId(tok, url, 'file', String(a.filename || 'file')), file_name: String(a.filename || 'file'), file_size: Number(a.size || 0) };
    else if (a.type === 'audio') msg.voice = { file_id: mx_fileId(tok, url, 'audio', 'voice.ogg'), duration: Number(p.duration || 0) };   // голосовые команды
  });
  if (msg.photo || msg.document) { if (t) { msg.caption = t; delete msg.text; } }
  else if (msg.voice) delete msg.text;
  else if (!t) return null;
  upd.message = msg; return upd;
}

// 24.11.2026: запрос доступа к калькулятору мебели (см. mx_dialog). Ключ CALC_KEY подставляет выкладка (HMAC ключа бота, метка fabrika-calc-v1).
var CALC_URL = 'https://script.google.com/macros/s/REDACTED_1/exec', CALC_KEY = '__CALCK__';
function mx_calcClaim(uid, user, code) {
  if (!mx_dmAllowed(uid)) {
    mx_log('dm', 'калькулятор: запрос от постороннего uid ' + uid + ' — не передан');
    mx_sendUser(uid, 'Доступ к калькулятору мебели — только для сотрудников «Фабриканта». Ваш MAX ID не найден в рабочих группах компании, поэтому запрос не передан. Если вы сотрудник — попросите руководителя добавить вас в рабочую группу MAX.');
    return;
  }
  var name = String(mx_name(user) || '').slice(0, 80), t = Math.floor(Date.now() / 1000), msg = 'max:' + t + ':' + code + ':' + uid + ':' + name;
  var sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(msg).getBytes(), Utilities.newBlob(CALC_KEY).getBytes()).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  var st = '';
  try {
    var r = UrlFetchApp.fetch(CALC_URL + '?op=claim&code=' + code + '&uid=' + encodeURIComponent(uid) + '&name=' + encodeURIComponent(name) + '&t=' + t + '&sig=' + sig, { muteHttpExceptions: true, followRedirects: true });
    var j = JSON.parse(r.getContentText() || '{}'); st = j && j.r && j.r.st || (j && j.error) || '';
  } catch (x) { st = 'err'; mx_log('err', 'калькулятор: ' + mx_errText(x)); }
  mx_log('dm', 'калькулятор: запрос uid ' + uid + ' → ' + st);
  mx_sendUser(uid, st === 'sent' ? 'Сотрудник4 на доступ к калькулятору мебели передан Т. В. Сотрудник1. Как только он подтвердит — калькулятор откроется на вашем устройстве сам.'
    : st === 'nocode' ? 'Код не найден или устарел. Нажмите «Сотрудник4 доступ» в калькуляторе ещё раз и пришлите новый код.'
    : 'Не получилось передать запрос — попробуйте через пару минут.');
}
