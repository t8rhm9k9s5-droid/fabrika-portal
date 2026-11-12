/* «Фабрика — бот MAX» — MaxCoreGroups.gs (05.11.2026): группы — реестр (лист groups), обращения к Т. В. (уведомление в Telegram + пересылка в личные,
   ≤ MX_GRP_FWD_HOUR в час из группы, новые группы выключены), журнал обращений для отчёта «без ответа», push к Claude (обращение к Т. В.,
   брак/рекламация/претензия/срок/конфликт, вопрос без ответа > 30 мин в рабочее время), автономность (au_* шага 5: рекламация, запрос цены, спор).
   Перенос mx_group / mx_addressed / mx_grp_log из hook.php. Тихие часы 19:00–07:00 — только история и уведомления владельцу, события для Claude
   копятся в листе mx_defer до утра (кроме слов об аварии — MX_RX_URGENT); руководителям бот вопросов не задаёт; Имя27/Джановой лично — ничего.
   Работает только из mx_handle (режим google). */

var MX_RX_RECL = /брак|дефект|сломал|слома|трещин|скол|царапин|порва|разош|не работает|не фиксир|рекламац|претенз|возврат|замен/i;   // bot_rules.scenarios.recl.detect_rx
var MX_RX_PRICE = /цен[аыу]|стоимост|почем|почём|сколько стоит|скидк|дешевл|последн\w* цен|прайс|₽|руб/i;                       // …price.detect_rx
var MX_RX_DISPUTE = /спор|конфликт|отказ\w* (от|принять|оплат)|не (хотят|хочет) (принимать|платить|оплачивать)|вернуть деньги|возврат денег|неустойк|штраф|суд|юрист|претенз|требу\w* замен|не соответству|не то,? что заказ/i;
var MX_RX_CLAUDE = /брак|рекламац|претензи|срок|конфликт|не успева|просроч|жалоб/i;   // слова, при которых событие группы уходит Claude (push_cmd.md)
var MX_SNAB_CID = '-100000000002';   // 10.11.2026 (Т. В.: «если есть накладная — сразу»): фото/файл в «Снабжение _Производство» → Claude расшифровывает сразу (не чаще раза в 10 мин; пачку фото Claude берёт целиком)
var MX_RX_URGENT = /авари|пожар|затоп|прорв|сработал\w* сигнализ|охран\w* сообщ|срочно/i;   // явная авария — Claude и в тихие часы (RULES: «тогда Т. В. в Telegram»)
var MX_RX_QUESTION = /\?|^(как|где|когда|почему|зачем|можно ли|есть ли|подскажите|скажите|кто|какой|какая|какие|сколько)\b/i;

// REDACTED_B64_2 реестр групп (лист groups: cid, title, on, appr, channel, t0, t)
/** Все группы: { cid: {title, on, appr, channel} } (память запуска). */
function mx_groups() {
  if (!MX_MEM.groups) {
    var g = {};
    mx_rows('groups').forEach(function (r) { var cid = String(r.cid || ''); if (cid) g[cid] = { title: String(r.title || ''), on: mx_bool(r.on), appr: mx_bool(r.appr), channel: mx_bool(r.channel), row: r._row }; });
    MX_MEM.groups = g;
  }
  return MX_MEM.groups;
}
function mx_bool(v) { return v === true || v === 1 || v === '1' || v === 'true' || v === 'TRUE'; }
function mx_groupGet(cid) { return mx_groups()[String(cid)] || null; }
/** Пересылка и автономность в группе разрешены: включена в листе (appr и on). Новая группа — выключена до включения (op group / импорт). */
function mx_groupOn(g) { return !!g && g.appr && g.on; }
/** Записать/обновить группу под замком: patch — {title, on, appr, channel}. */
function mx_groupSave(cid, patch) {
  cid = String(cid || ''); if (!cid) return;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) { mx_log('err', 'группы: нет замка'); return; }
  try {
    var r = mx_findRow('groups', cid, 1), o = {};
    Object.keys(patch || {}).forEach(function (k) { if (patch[k] !== undefined && patch[k] !== '') o[k] = typeof patch[k] === 'boolean' ? (patch[k] ? '1' : '0') : String(patch[k]).slice(0, 120); });
    o.t = new Date();
    if (r) mx_setObj('groups', r.row, o);
    else mx_appendObj('groups', { cid: cid, title: o.title || ('группа ' + cid), on: o.on || '0', appr: o.appr || '0', channel: o.channel || '0', t0: new Date(), t: new Date() });
    MX_MEM.groups = null;
  } finally { lock.releaseLock(); }
}
/** Незнакомая группа: узнать название в MAX и завести ВЫКЛЮЧЕННОЙ (H5). Владельцу — одно уведомление в Telegram (GPT B5, 05.11): иначе о новой
    группе никто не узнаёт, а её сообщения до включения — только история. Включить: op group {cid, on:true} (Claude по слову Т. В.) или импорт. */
function mx_groupLearn(cid, type) {
  var r = api_('GET', '/chats/' + encodeURIComponent(cid)), j = ok_(r[0]) ? (r[1] || {}) : {};
  var known = !!mx_groupGet(cid);
  mx_groupSave(cid, { title: String(j.title || ''), on: false, appr: false, channel: type === 'channel' || j.type === 'channel' });
  var g = mx_groupGet(cid);
  if (!known && mx_count('grpnew:' + cid, 1)) {
    try { mx_tgOwner('🆕 Бот MAX в новой группе «' + h_(g && g.title || cid) + '» (chat_id ' + cid + ') — пересылка и автономность выключены, пишется только история.\nВключить: сказать Claude «включи группу ' + cid + '» (op group).', [], { mid: 'grpnew:' + cid, g: String(g && g.title || cid), why: 'новая группа', id: 'grpnew:' + cid }); }
    catch (x) { mx_log('err', 'новая группа (уведомление): ' + mx_errText(x)); }
  }
  return g;
}
function mx_groupTitle(cid) { var g = mx_groupGet(cid); return (g && g.title) || ('группа ' + cid); }
/** bot_added / bot_removed: группа заводится (новая — выключена) или отмечается как покинутая (on=false). */
function mx_groupMembership(u) {
  var cid = String(u.chat_id || ''), type = String(u.update_type); if (!cid) return;
  var g = mx_groupGet(cid);
  if (type === 'bot_added') {
    if (!g) { mx_groupLearn(cid, u.is_channel ? 'channel' : 'chat'); mx_log('group', 'бот добавлен в новую группу ' + cid + ' — пересылка выключена до включения'); }
    else { mx_groupSave(cid, { on: g.appr }); mx_log('group', 'бот снова в группе ' + cid + (g.appr ? '' : ' (выключена)')); }
  } else { mx_groupSave(cid, { on: false }); mx_log('group', 'бот удалён из группы ' + cid); }
}
/** Группа по части названия (как mx_find_group в lib.php): точно → вхождение → основа 6 букв. → [cid, title] | 'many' | null. Каналы не берутся. */
function mx_findGroup(q) {
  q = String(q || '').replace(/[«»"]/g, '').trim().toLowerCase(); if (q.length < 3) return null;
  var G = mx_groups(), ids = Object.keys(G).filter(function (k) { return !G[k].channel && G[k].title; });
  var sel = function (test) { return ids.filter(function (k) { return test(G[k].title.toLowerCase()); }); };
  var hit = sel(function (t) { return t === q; });
  if (!hit.length) hit = sel(function (t) { return t.indexOf(q) >= 0; });
  if (!hit.length && q.length >= 6) { var st = q.slice(0, 6); hit = sel(function (t) { return t.indexOf(st) >= 0; }); }
  if (hit.length > 1) return 'many';
  return hit.length ? [hit[0], G[hit[0]].title] : null;
}

// REDACTED_B64_2 сообщение в группе
function mx_group(m, u) {
  var rc = m.recipient || {}, cid = String(rc.chat_id || ''), s = m.sender || {}, uid = Number(s.user_id || 0), b = m.body || {};
  var g = mx_groupGet(cid);
  if (!g) { mx_groupLearn(cid, 'chat'); mx_log('group', 'новая группа ' + cid + ' — пересылка выключена до включения'); return; }
  if (!mx_groupOn(g)) return;                                                   // выключена: только история (уже записана)
  var owner = mx_ownerUid(), text = mx_text(m), name = mx_name(s), lk = m.link || null, mid = String(b.mid || ''), ts = Number(m.timestamp || 0);
  var rmid = lk && lk.type === 'reply' ? String((lk.message || {}).mid || '') : '';
  if (owner && uid === owner) {                                                 // сам Т. В.: его ответ — в журнал для отчёта «без ответа»; вопросы в группе он закрывает
    if (rmid) mx_grpLog({ k: 'a', ts: ts, cid: cid, mid: mid, rmid: rmid });
    mx_questionsClose(cid, uid, rmid, text);
    return;
  }
  var why = mx_addressed(m, owner), title = g.title || ('группа ' + cid);
  if (why) {
    mx_grpLog({ k: 'q', ts: ts, cid: cid, g: title, mid: mid, uid: uid, n: name, why: why, x: mx_maskPhones(text).slice(0, 500) });
    if (mx_count('grp:' + cid + ':' + mx_hourKey(), MX_GRP_FWD_HOUR)) mx_notifyOwner(m, title, name, why);
    else if (mx_count('grpw:' + cid + ':' + mx_hourKey(), 1)) mx_log('group', 'группа ' + cid + ': больше ' + MX_GRP_FWD_HOUR + ' обращений за час — уведомления и пересылка приостановлены до конца часа');
  }
  mx_questionsClose(cid, uid, rmid, text);                                      // ответ другого человека закрывает открытые вопросы
  var quiet = mx_quiet(), leader = mx_isLeader(name, uid), banned = mx_isBanned(name);
  var det = mx_detect(text, mx_hasMedia(m)), auto = '';
  if (det.kind && !quiet && !leader && !banned) det = mx_aiCheck(det, text, title, name, mx_hasMedia(m), mid);   // 10.11 Т. В.: слова — только повод, решает GPT
  if (det.kind && !quiet && !leader && !banned) {                               // автономность: не в тихие часы, не руководству, не Имя27/Джановой
    try {
      if (det.kind === 'recl' && !mx_hasMedia(m)) {                            // 10.11 Т. В.: шаблон про акт РК 01 — только при фото/видео; без фото — в группу ничего, Т. В. — в Telegram
        if (!why && mx_count('grp:' + cid + ':' + mx_hourKey(), MX_GRP_FWD_HOUR)) mx_notifyOwner(m, title, name, 'похоже на рекламацию (без фото) — бот в группе не отвечал');
      } else if (det.kind === 'recl') auto = mx_autoRecl(cid, title, m, name, det);
      else if (det.kind === 'price') auto = mx_autoPrice(cid, title, m, name, uid, det);
      else if (det.kind === 'dispute') auto = mx_autoDispute(cid, title, m, name, uid);
    } catch (x) { mx_log('err', 'автономность (' + det.kind + '): ' + mx_errText(x)); }
  }
  var kbDone = (!why && !det.kind && !quiet && !leader && !banned && MX_RX_QUESTION.test(text)) ? mx_kbGroupAnswer(cid, title, mid, name, text) : false;   // 10.11 Т. В.: вопрос «как быть» — ответ по регламенту портала
  if (!kbDone && !why && MX_RX_QUESTION.test(text) && !leader && text.length >= 8) mx_questionAdd(cid, mid, ts, uid, name, text);
  var skip = leader ? ' — автор из руководства' : banned ? ' — автору лично не пишем' : quiet ? ' — тихие часы' : '';
  var need = why ? 'обращение к Т. В. (' + why + ')' : det.kind ? 'сценарий ' + det.kind + (auto ? ' — бот ответил: ' + auto : skip) : MX_RX_CLAUDE.test(text) ? 'слова: ' + (text.match(MX_RX_CLAUDE) || [''])[0] : '';
  if (!need && cid === MX_SNAB_CID && mx_hasMedia(m)) need = 'документ снабжения (фото) — расшифровать сразу, tasks/snab_live.md';   // 10.11: без счётчика — cp_flush сам собирает фото за минуту в один запуск
  if (!need) return;
  if (quiet && !MX_RX_URGENT.test(text)) { mx_groupDefer(cid, title, m, name, need); return; }   // ночью Claude не будим — пачка утром; авария — сразу
  mx_groupPush(cid, title, m, name, need);
}
/** 10.11.2026 Т. В.: «пусть gpt анализирует сообщения». Слова (au_detect) — только повод; GPT через Telegram-скрипт (op maxai, ключ AI_KEY там) решает recl | price | dispute | none.
 *  GPT подтвердил тот же сценарий — работаем; сказал «none» или другое — бот молчит. GPT не ответил — решение по словам (отчёты не трогаем, шаблон рекламации — только при фото). */
var MX_AI_SYS = 'Ты помощник коммерческого директора мебельной фабрики «Фабрикант». Тебе дают сообщение сотрудника из рабочей группы MAX. Определи, нужно ли боту реагировать. Ответь строго JSON без пояснений: {"kind":"recl|price|dispute|none","why":"до 15 слов"}.\n' +
  'recl — сотрудник сообщает о НОВОЙ жалобе клиента на брак/дефект/недостачу полученного товара, по которой надо оформить рекламацию (акт).\n' +
  'price — сотрудник просит согласовать цену или скидку для клиента.\n' +
  'dispute — конфликт с клиентом (угрозы судом, отказ платить, требование вернуть деньги), где нужен руководитель.\n' +
  'none — всё остальное: отчёты и списки запросов за день, рассказ о работе, упоминание прошлой или уже разобранной рекламации, платная замена или ремонт со счётом, вопросы коллегам, обсуждение.';
/** 10.11.2026 Т. В. (опрос «Отвечать самому»): вопрос сотрудника в группе «как быть / что делать / куда / какой порядок…» — бот ищет ответ в регламентах портала
 *  (база знаний kb.bin + GPT в Telegram-скрипте, op maxkb: только по выдержкам, иначе «не знаю») и отвечает ответом на сообщение, от своего имени, с названием документа.
 *  Нет ответа в регламентах — молчит (вопрос остаётся в списке «без ответа»). Не больше 3 ответов в час на группу. → true — ответил. */
var MX_RX_HOWTO = /(^|[^а-яё])(как (быть|поступить|оформить|сделать|правильно|оформля|провести|вернуть|списать|отгрузить|согласовать)|что (делать|нужно|надо)|куда (отправ|писать|сдавать|нести)|какой (порядок|срок|документ)|какие документы|в какой срок|сколько дней|по регламенту|кто (должен|отвечает|оформляет)|можно ли)/i;
function mx_kbGroupAnswer(cid, title, mid, name, text) {
  text = String(text || ''); if (text.length < 15 || !MX_RX_HOWTO.test(text.toLowerCase())) return false;
  if (!mx_count('kbg:' + cid + ':' + mx_hourKey(), 3)) return false;
  var r = null; try { r = mx_tgCall({ op: 'maxkb', q: mx_maskPhones(text).slice(0, 1500), g: title, n: name }); } catch (x) { r = null; }
  if (!r || !r.ok || !r.known || !r.text) { mx_log('kb', 'группа «' + title + '»: в регламентах ответа нет' + (r && !r.ok ? ' (' + String(r.error || '').slice(0, 80) + ')' : '')); return false; }
  var body = '📘 <b>По регламентам портала</b>\n' + h_(String(r.text)) + '\n\n<i>Бот «Фабрикант». Если ситуация другая — уточните, подключим руководителя.</i>';
  var s = mx_sendChat(cid, body, mid ? { link: { type: 'reply', mid: mid } } : {});
  if (!ok_(s[0])) { mx_log('kb', 'группа «' + title + '»: ответ не ушёл (MAX ' + s[0] + ')'); return false; }
  mx_log('kb', 'группа «' + title + '»: ответ по регламенту отправлен');
  return true;
}
var MX_AI_REVIEW = 'Ты проверяешь автоответ бота в рабочей группе MAX мебельной фабрики перед отправкой. Даны сообщение сотрудника и готовый ответ бота. Ответ подходит, если он по существу этого сообщения: например, просьба оформить акт рекламации подходит к сообщению о новом браке у клиента и не подходит к отчёту за день, к уже оплаченной замене, к реплике о прошлом случае или к вопросу о другом. Ответь строго JSON: {"ok":true|false,"why":"до 15 слов"}.';
/** 10.11.2026 Т. В. («Оба варианта»): GPT проверяет готовый ответ бота перед отправкой в группу. → {ok, why}. GPT не ответил — отправляем как есть (шаблон и так прошёл проверку сценария). */
function mx_aiReview(text, reply, title, name, hasMedia) {
  var user = 'Группа: ' + title + '\nАвтор: ' + name + '\nФото/видео: ' + (hasMedia ? 'да' : 'нет') + '\nСообщение сотрудника:\n' + mx_maskPhones(String(text || '')).slice(0, 3000) + '\n\nОтвет бота:\n' + String(reply || '').slice(0, 3000);
  var r = null; try { r = mx_tgCall({ op: 'maxai', sys: MX_AI_REVIEW, user: user, max: 120 }); } catch (x) { r = { ok: false, error: mx_errText(x) }; }
  if (!r || !r.ok) { mx_log('err', 'GPT-проверка ответа: ' + String((r && r.error) || 'нет ответа').slice(0, 150) + ' — отправляю как есть'); return { ok: true }; }
  var mo = String(r.text || '').match(/"ok"\s*:\s*(true|false)/), mw = String(r.text || '').match(/"why"\s*:\s*"([^"]*)"/);
  if (!mo) { mx_log('err', 'GPT-проверка ответа: непонятный ответ — отправляю как есть'); return { ok: true }; }
  mx_log('group', 'GPT-проверка ответа: ' + mo[1] + (mw ? ' (' + mw[1].slice(0, 100) + ')' : ''));
  return { ok: mo[1] === 'true', why: mw ? mw[1] : '' };
}
function mx_aiCheck(det, text, title, name, hasMedia, mid) {
  var c = CacheService.getScriptCache(), ck = 'ai:' + String(mid || ''), kind = null, why = '';
  try { kind = mid ? c.get(ck) : null; } catch (x0) { kind = null; }
  if (!kind) {
    var user = 'Группа: ' + title + '\nАвтор: ' + name + '\nФото/видео: ' + (hasMedia ? 'да' : 'нет') + '\nСлова-поводы: ' + (det.words || []).join(', ') + '\nСообщение:\n' + mx_maskPhones(String(text || '')).slice(0, 3000);
    var r = null; try { r = mx_tgCall({ op: 'maxai', sys: MX_AI_SYS, user: user, max: 120 }); } catch (x1) { r = { ok: false, error: mx_errText(x1) }; }
    if (!r || !r.ok) { mx_log('err', 'GPT (maxai): ' + String((r && r.error) || 'нет ответа').slice(0, 150) + ' — решение по словам'); return det; }
    var mm = String(r.text || '').match(/"kind"\s*:\s*"(recl|price|dispute|none)"/), mw = String(r.text || '').match(/"why"\s*:\s*"([^"]*)"/);
    kind = mm ? mm[1] : ''; why = mw ? mw[1] : '';
    if (!kind) { mx_log('err', 'GPT (maxai): непонятный ответ — решение по словам'); return det; }
    try { if (mid) c.put(ck, kind, 21600); } catch (x2) { /* кэш не обязателен */ }
    mx_log('group', 'GPT: ' + det.kind + ' → ' + kind + (why ? ' (' + why.slice(0, 100) + ')' : ''));
  }
  return kind === det.kind ? det : { kind: null, words: det.words || [], ai: kind };
}
/** Почему сообщение — к владельцу: упоминание, ответ на его сообщение, имя в тексте (owner_names). '' — не к нему. */
function mx_addressed(m, owner) {
  var b = m.body || {}, lk = m.link || null;
  if (owner && (b.markup || []).some(function (mk) { return mk.type === 'user_mention' && Number(mk.user_id) === owner; })) return 'упоминание';
  if (owner && lk && lk.type === 'reply' && Number((lk.sender || {}).user_id) === owner) return 'ответ на ваше сообщение';
  var t = mx_text(m), re = String(mx_set('owner_names') || '');
  if (t && re) { try { if (new RegExp(re, 'u').test(t)) return 'обращение по имени'; } catch (x) { if (/(^|[^А-Яа-яЁё])(Сотрудник2|Т\.\s?В\.)(?![А-Яа-яЁё])/.test(t)) return 'обращение по имени'; } }
  return '';
}
/** Уведомление Т. В. в Telegram (op maxown — как hook.php сегодня) и пересылка в его личные MAX (link forward, иначе — текстом). */
function mx_notifyOwner(m, title, name, why) {
  var b = m.body || {}, mid = String(b.mid || ''), text = mx_text(m), owner = mx_ownerUid();
  var p = { op: 'maxown', cid: String((m.recipient || {}).chat_id || ''), mid: mid, ts: Number(m.timestamp || 0), g: title, n: name, why: why, x: text.slice(0, 3000), att: mx_attNote(m) };
  var r = mx_tgCall(p), st = mx_tgState(r), okey = 'maxown:' + (mid || mx_updKey({ update_type: 'message_created', message: m }));
  if (st === 'sent') return;                                                    // 11.11 Т. В.: дошло в Telegram — в MAX не дублировать
  mx_log('tg', 'уведомление в Telegram (' + st + '): ' + String((r && r.error) || '?').slice(0, 120));
  if (st === 'uncertain') { mx_outboxUncertain(okey, 'mx_tg', 'owner', p, r.error); return; }   // могло дойти — без дубля в MAX
  if (!owner) { if (st !== 'permanent') mx_outbox(okey, 'mx_tg', 'owner', p); return; }        // Telegram не дошёл — запасной путь: личные MAX
  var head = '👥 <b>' + h_(title) + '</b> · ' + h_(name) + ' · ' + mx_tsText(m.timestamp) + '\n<i>' + h_(why) + '</i>';
  var h = mx_sendUser(owner, head); if (!ok_(h[0])) mx_outbox('ownhead:' + mid, 'mx_user', String(owner), { uid: owner, text: head });
  var ok = false;
  if (mid) { var f = api_('POST', '/messages', { user_id: owner }, { link: { type: 'forward', mid: mid } }); ok = ok_(f[0]); if (!ok) mx_log('group', 'пересылка владельцу: MAX ' + f[0]); }
  if (!ok) { var n = mx_attNote(m), body = '«' + h_(text.slice(0, 3000)) + '»' + (n ? '\n' + n : '') + (m.url ? '\n' + h_(m.url) : ''); var t2 = mx_sendUser(owner, body); if (!ok_(t2[0]) && st !== 'permanent') mx_outbox(okey, 'mx_tg', 'owner', p); }
}
/** Журнал обращений к владельцу и его ответов (лист mx_grp_owner, ≤ 3000 строк) — читает отчёт «вопросы без ответа» (шаг 3). */
function mx_grpLog(o) {
  try {
    var sh = mx_sheet('mx_grp_owner'); mx_appendObj('mx_grp_owner', { k: o.k, ts: o.ts, cid: o.cid, g: o.g || '', mid: o.mid || '', uid: o.uid || '', n: o.n || '', why: o.why || '', x: o.x || (o.rmid ? 'ответ на ' + o.rmid : '') });
    if (sh.getLastRow() > 3300) sh.deleteRows(2, 300);
  } catch (x) { mx_log('err', 'журнал обращений: ' + mx_errText(x)); }
}

// REDACTED_B64_2 push к Claude по событиям группы
/** Последние n сообщений группы из буфера истории — строками «HH:mm Имя: текст». */
function mx_groupCtx(cid, n) {
  var R = mx_histRecent(cid, n || 10);
  return R.map(function (r) { return mx_msk('dd.MM HH:mm', new Date(Number(r.ts) || Date.now())) + ' ' + (r.bot ? '[бот] ' : '') + String(r.name || '') + ': ' + String(r.text || '').replace(/\s+/g, ' ').slice(0, 400) + (r.att && r.att !== '[]' ? ' ' + mx_attText(r.att) : ''); });
}
function mx_attText(att) {
  try { var a = typeof att === 'string' ? JSON.parse(att) : att; return a && a.length ? '[' + a.map(function (x) { return x.type + (x.url ? ' ' + x.url : ''); }).join('; ') + ']' : ''; } catch (x) { return ''; }
}
/** Событие группы для Claude: {src:'group', who, chat, id:'max:<mid>', text (группа, автор, время, причина, текст, mid для ответа), ctx — 10 последних сообщений}. */
function mx_groupEv(cid, title, m, name, why) {
  var b = m.body || {}, mid = String(b.mid || '');
  var txt = 'Группа «' + title + '» (chat_id ' + cid + '), ' + name + ', ' + mx_tsText(m.timestamp) + '\nПричина: ' + why + '\n\n' + mx_maskPhones(mx_text(m)).slice(0, 3000) + (mx_attNote(m) ? '\n' + mx_attNote(m) : '') + (mid ? '\nmid=' + mid + ' (ответ: op post с mid)' : '');
  return { src: 'group', who: name, chat: cid, g: title, why: why, id: 'max:' + (mid || mx_updKey({ update_type: 'message_created', message: m })), text: txt, ctx: mx_groupCtx(cid, 10) };
}
function mx_groupPush(cid, title, m, name, why) {
  var ev = mx_groupEv(cid, title, m, name, why);
  if (mx_pushOn()) return mx_pushOut(ev, false);
  if (String(cid) !== MX_SNAB_CID) return false;
  mx_log('push', 'push к Claude выключен — документ снабжения отложен в mx_defer');   // 10.11: раньше фото молча терялось
  return mx_deferAdd(ev);
}
/** Тихие часы: то же событие — в лист mx_defer, утром mx_deferFlush отдаст его Claude одной пачкой с остальными. */
function mx_groupDefer(cid, title, m, name, why) { return (mx_pushOn() || String(cid) === MX_SNAB_CID) ? mx_deferAdd(mx_groupEv(cid, title, m, name, why)) : false; }

// REDACTED_B64_2 вопросы без ответа (> 30 мин в рабочее время → Claude)
function mx_questionAdd(cid, mid, ts, uid, name, text) {
  if (!mx_pushOn() || !mid) return;
  try { mx_appendObj('mx_questions', { cid: cid, mid: mid, ts: ts || Date.now(), uid: uid, name: name, text: mx_maskPhones(text).slice(0, 500), status: 'open', t: new Date() }); }
  catch (x) { mx_log('err', 'вопросы (запись): ' + mx_errText(x)); }
}
/** Новое сообщение в группе: вопрос закрывается только связанным ответом (GPT B3, 05.11) — ответ (reply) на сообщение с вопросом, имя спросившего
    в тексте другого человека, общая тема (mx_qRelated: не меньше двух общих слов) либо сам спросивший написал «спасибо / понял / разобрался».
    Посторонние сообщения (о другом заказе и т. п.) вопрос не закрывают — он уйдёт в контроль Claude через 30 мин. */
function mx_questionsClose(cid, uid, rmid, text) {
  try {
    var low = String(text || '').toLowerCase();
    mx_rows('mx_questions', 300).forEach(function (q) {
      if (String(q.cid) !== String(cid) || (q.status !== 'open' && q.status !== 'open1')) return;
      var closed = false;
      if (Number(q.uid) === Number(uid)) closed = MX_RX_THANKS.test(low);                                       // спросивший сам: «спасибо, разобрался»
      else {
        var first = String(q.name || '').split(/[\s(]/)[0].toLowerCase();
        closed = (rmid && rmid === String(q.mid)) || (first.length >= 3 && low.indexOf(first) >= 0) || mx_qRelated(q.text, text);
      }
      if (closed) mx_setObj('mx_questions', q._row, { status: 'answered' });
    });
  } catch (x) { mx_log('err', 'вопросы (закрытие): ' + mx_errText(x)); }
}
var MX_RX_THANKS = /^\s*(спасибо|благодар|понял|поняла|ясно|ок(?![а-яё])|окей|хорошо|разобрал|решил|нашёл|нашел|нашла|отбой|уже не (нужно|надо|актуально)|вс[её],? понятно|вопрос снят)/i;   // \b с кириллицей не работает
var MX_Q_STOP = { 'подскажите': 1, 'скажите': 1, 'кто-нибудь': 1, 'знает': 1, 'можно': 1, 'нужно': 1, 'когда': 1, 'почему': 1, 'какой': 1, 'какая': 1, 'какие': 1, 'сколько': 1, 'есть': 1, 'коллеги': 1, 'пожалуйста': 1, 'добрый': 1, 'день': 1, 'утро': 1, 'вечер': 1, 'сегодня': 1, 'завтра': 1, 'вчера': 1, 'всем': 1, 'привет': 1, 'здравствуйте': 1, 'будет': 1, 'было': 1, 'этот': 1, 'этого': 1, 'который': 1, 'которые': 1 };
/** Слова темы: длиннее 3 букв, без служебных, основа — первые 5 букв (накладные/накладных → «накла»). */
function mx_qStems(s) {
  var out = {}; String(s || '').toLowerCase().replace(/ё/g, 'е').split(/[^а-яa-z0-9]+/).forEach(function (w) { if (w.length >= 4 && !MX_Q_STOP[w]) out[w.slice(0, 5)] = 1; });
  return out;
}
/** Сообщение о том же (не меньше двух общих основ слов) — осторожная проверка связи ответа с вопросом. */
function mx_qRelated(question, text) {
  var a = mx_qStems(question), b = mx_qStems(text), n = 0;
  Object.keys(b).forEach(function (k) { if (a[k]) n++; });
  return n >= 2;
}
/** Триггер: открытые вопросы старше 30 мин в рабочее время → push Claude (один раз, статус pushed). Не ушло — остаётся open и повторяется
    следующим тиком (GPT B3: не skipped навсегда). Закрытые (answered/pushed/expired) старше 2 дней — удаляются; открытые НЕ удаляются до контроля
    (вопрос вечера пятницы доживает до понедельника), старше 7 дней — статус expired (архив), удаляется ещё через 2 дня. */
function mx_questionsTick() {
  var R = mx_rows('mx_questions'); if (!R.length) return;
  var sh = mx_sheet('mx_questions'), now = Date.now(), work = mx_workTime();
  for (var i = R.length - 1; i >= 0; i--) {
    var q = R[i], ts = Number(q.ts) || 0, open = q.status === 'open' || q.status === 'open1', age = now - ts;
    if (!open && age > 2 * 864e5) { sh.deleteRow(q._row); continue; }
    if (open && age > 7 * 864e5) { mx_setObj('mx_questions', q._row, { status: 'expired' }); continue; }
    if (!open || !work || age < 30 * 60000) continue;
    var ageText = age < 3600e3 ? Math.round(age / 60000) + ' мин' : age < 864e5 ? Math.round(age / 3600e3) + ' ч' : Math.round(age / 864e5) + ' дн.';
    var ok = mx_pushOut({ src: 'group', who: String(q.name || ''), chat: String(q.cid), id: 'max:q:' + q.mid, text: 'Группа «' + mx_groupTitle(q.cid) + '» (chat_id ' + q.cid + '): вопрос без ответа ' + ageText + '\n' + q.name + ', ' + mx_tsText(ts) + ':\n' + q.text + '\nmid=' + q.mid, ctx: mx_groupCtx(String(q.cid), 10) }, false);
    if (ok) mx_setObj('mx_questions', q._row, { status: 'pushed' });
  }
}

// REDACTED_B64_2 автономность (au_* шага 5; без модуля — только обнаружение для push)
/** Что за ситуация: au_detect шага 5, иначе — те же регулярные выражения из bot_rules.json. → {kind, words}. */
function mx_detect(text, hasMedia) {
  if (typeof au_detect === 'function') { try { var d = au_detect(text, !!hasMedia); if (d && typeof d === 'object') return { kind: d.kind || null, words: d.words || [] }; } catch (x) { mx_log('err', 'au_detect: ' + mx_errText(x)); } }
  var t = String(text || '');
  if (hasMedia && MX_RX_RECL.test(t)) return { kind: 'recl', words: [(t.match(MX_RX_RECL) || [''])[0]] };
  if (MX_RX_DISPUTE.test(t)) return { kind: 'dispute', words: [(t.match(MX_RX_DISPUTE) || [''])[0]] };
  if (MX_RX_RECL.test(t) && /рекламац|претенз/i.test(t)) return { kind: 'recl', words: [(t.match(MX_RX_RECL) || [''])[0]] };
  if (MX_RX_PRICE.test(t) && /\d/.test(t)) return { kind: 'price', words: [(t.match(MX_RX_PRICE) || [''])[0]] };
  return { kind: null, words: [] };
}
/** Рекламация: ответ от имени Т. В. (акт РК 01 на почту, сроки по договору и регламенту, ГК) + наблюдение au_reclWatchAdd. → что сделано ('' — ничего). */
function mx_autoRecl(cid, title, m, name, det) {
  if (typeof au_reclReply !== 'function') return '';
  var ctx = { group: title, cid: cid, mid: String((m.body || {}).mid || ''), name: name, text: mx_text(m), words: det.words, hasMedia: mx_hasMedia(m), sign: MX_SIGN };
  var reply = au_reclReply(ctx); if (!reply) return '';
  var rv = mx_aiReview(ctx.text, reply, title, name, ctx.hasMedia);   // 10.11 Т. В.: GPT проверяет ответ перед отправкой
  if (!rv.ok) { mx_notifyOwner(m, title, name, 'GPT остановил ответ бота про рекламацию: ' + rv.why); mx_log('auto', 'рекламация в «' + title + '»: GPT остановил ответ (' + rv.why + ')'); return ''; }
  var r = mx_sendChat(cid, reply, { link: { type: 'reply', mid: ctx.mid } });
  if (!ok_(r[0])) { mx_log('auto', 'рекламация: MAX ' + r[0]); return ''; }
  if (typeof au_reclWatchAdd === 'function') au_reclWatchAdd({ group: title, cid: cid, mid: ctx.mid, client: '', defect: det.words.join(' ').slice(0, 80), manager: name, t: Date.now() });
  mx_log('auto', 'рекламация в «' + title + '»: ответ отправлен, наблюдение записано');
  return 'рекламация (акт РК 01, сроки, ГК)';
}
/** Сотрудник4 цены: прайс (au_priceLookup) → Т. В. в Telegram с кнопками (au_priceMessage); в группе бот цену не обещает. */
function mx_autoPrice(cid, title, m, name, uid, det) {
  if (typeof au_priceLookup !== 'function' || typeof au_priceMessage !== 'function') return '';
  var mid = String((m.body || {}).mid || '');
  // ctx — запрос шага 5 (проверка 1, 05.11): по нему au_priceAction знает группу и менеджера, а Telegram-скрипт по кнопке отвечает в эту группу (op post {price:id})
  var res = au_priceLookup(mx_text(m), { chat: cid, group: title, manager: name, mid: mid }); if (!res || !res.found) return '';
  var msg = au_priceMessage(res); if (!msg || !msg.text) return '';
  if (!mx_count('price:' + cid + ':' + mx_hourKey(), MX_PRICE_HOUR)) { mx_log('auto', 'запрос цены в «' + title + '»: больше ' + MX_PRICE_HOUR + ' за час — Т. В. не беспокоим'); return ''; }
  var id = String(res.id || mid || Date.now());
  try { mx_appendObj('mx_price', { id: id, cid: cid, g: title, mid: mid, uid: uid, name: name, t: new Date() }); } catch (x) { mx_log('err', 'цены (запись): ' + mx_errText(x)); }
  var head = '💰 Сотрудник4 цены — «' + h_(title) + '», ' + h_(name) + ', ' + mx_msk('HH:mm', new Date(Number(m.timestamp) || Date.now())) + '\n';
  var ok = mx_tgOwner(head + msg.text, msg.buttons || [], { cid: cid, g: title, mid: mid, uid: uid, name: name, why: 'запрос цены', id: id });
  mx_log('auto', 'запрос цены в «' + title + '»: ' + (ok ? 'Т. В. уведомлён в Telegram' : 'уведомить Т. В. не удалось'));
  return ok ? 'запрос цены — Т. В. в Telegram' : '';
}
/** Спор с клиентом: первый шаг — вопрос, какой договор подписан (раз в сутки на человека в группе); дальше ведёт Claude (push). */
function mx_autoDispute(cid, title, m, name, uid) {
  if (typeof au_disputeReply !== 'function') return '';
  var R = mx_rows('mx_dispute', 200), now = Date.now();
  if (R.some(function (r) { return String(r.cid) === cid && Number(r.uid) === uid && now - (r.t instanceof Date ? r.t.getTime() : 0) < 864e5; })) return '';
  var reply = au_disputeReply(1, { group: title, cid: cid, name: name, text: mx_text(m), sign: MX_SIGN }); if (!reply) return '';
  var rv = mx_aiReview(mx_text(m), reply, title, name, mx_hasMedia(m));   // 10.11 Т. В.: GPT проверяет ответ перед отправкой
  if (!rv.ok) { mx_notifyOwner(m, title, name, 'GPT остановил ответ бота про спор: ' + rv.why); mx_log('auto', 'спор в «' + title + '»: GPT остановил ответ (' + rv.why + ')'); return ''; }
  var r = mx_sendChat(cid, reply, { link: { type: 'reply', mid: String((m.body || {}).mid || '') } });
  if (!ok_(r[0])) { mx_log('auto', 'спор: MAX ' + r[0]); return ''; }
  mx_appendObj('mx_dispute', { cid: cid, uid: uid, t: new Date() });
  var sh = mx_sheet('mx_dispute'); if (sh.getLastRow() > 500) sh.deleteRows(2, 200);
  mx_log('auto', 'спор в «' + title + '»: задан вопрос о договоре');
  return 'спор — вопрос о договоре';
}
