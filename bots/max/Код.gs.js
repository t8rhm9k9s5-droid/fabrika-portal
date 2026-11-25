/* «Фабрика — бот MAX» (Google Apps Script, 02.11.2026) — этап 1: чтение групп MAX и проверка публикаций бота.
   Пользователь: «Перенеси его на диск тоже… чтобы команды уходили моментально»; опрос 17:50 — «Работать с хостинга сейчас»:
   мгновенные команды идут через хостинг (max/post.php, команда владельца в личке бота), а этот скрипт с токеном MAX_TOKEN
   (вписал Сотрудник2 Отчество1 в свойства скрипта) читает группы и проверяет, что бот опубликовал. Полный перенос — завтра,
   когда в свойства скрипта будет внесён ключ команд K_CMD. Токен в журнал и ответы не выводится. */
var API = ['https://platform-api2.max.ru', 'https://platform-api.max.ru'];

function P_() { return PropertiesService.getScriptProperties(); }
function tok_() { var t = P_().getProperty('MAX_TOKEN'); if (!t) throw new Error('нет MAX_TOKEN в свойствах скрипта'); return String(t).trim(); }
function mask_(s) { var t = P_().getProperty('MAX_TOKEN'); s = String(s == null ? '' : s); return t ? s.split(String(t).trim()).join('***') : s; }

/** MAX Bot API: [код, ответ]. Токен — в заголовке Authorization, как на хостинге; в ошибках он замаскирован. */
function api_(method, path, query, body) {
  var q = query ? '?' + Object.keys(query).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); }).join('&') : '';
  var opt = { method: method.toLowerCase(), muteHttpExceptions: true, headers: { Authorization: tok_(), Accept: 'application/json' } };
  if (body != null) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(body); }
  var last = [0, { message: 'нет связи' }];
  for (var i = 0; i < API.length; i++) {
    try {
      var r = UrlFetchApp.fetch(API[i] + path + q, opt), c = r.getResponseCode(), j = {};
      try { j = JSON.parse(r.getContentText()); } catch (e) { j = { raw: r.getContentText().slice(0, 200) }; }
      if (c === 404 && i < API.length - 1) { last = [c, j]; continue; }   // другой адрес API может знать метод
      return [c, j];
    } catch (e) { last = [0, { message: mask_(e && e.message || e) }]; }
  }
  return last;
}
function ok_(c) { return c >= 200 && c < 300; }

/** Группы и каналы бота: { chat_id: {title, type, members} } — прямо из MAX (кэш 10 минут). */
function chats_(fresh) {
  var ca = CacheService.getScriptCache(), s = !fresh && ca.get('chats');
  if (s) return JSON.parse(s);
  var out = {}, marker = null;
  for (var n = 0; n < 5; n++) {
    var q = { count: 100 }; if (marker) q.marker = marker;
    var r = api_('GET', '/chats', q); if (!ok_(r[0])) break;
    (r[1].chats || []).forEach(function (c) { out[String(c.chat_id)] = { title: String(c.title || ''), type: String(c.type || ''), members: c.participants_count || null }; });
    marker = r[1].marker; if (!marker) break;
  }
  ca.put('chats', JSON.stringify(out), 600);
  return out;
}
/** Группа по части названия: точно → вхождение → основа (6 букв). [chat_id, название] | 'many' | null. Каналы не берутся. */
function findChat_(q) {
  q = String(q || '').replace(/[«»"]/g, '').trim().toLowerCase(); if (q.length < 3) return null;
  var C = chats_(), ids = Object.keys(C).filter(function (k) { return C[k].type !== 'channel'; });
  function pick(test) { return ids.filter(function (k) { return C[k].title && test(C[k].title.toLowerCase()); }); }
  var hit = pick(function (t) { return t === q; });
  if (!hit.length) hit = pick(function (t) { return t.indexOf(q) >= 0; });
  if (!hit.length && q.length >= 6) { var st = q.slice(0, 6); hit = pick(function (t) { return t.indexOf(st) >= 0; }); }
  if (hit.length > 1) return 'many';
  return hit.length ? [hit[0], C[hit[0]].title] : null;
}
function norm_(m) {
  var s = m.sender || {}, b = m.body || {}, lk = m.link || {};
  return { ts: Number(m.timestamp || 0), mid: String(b.mid || ''), uid: s.user_id || null, name: String(s.name || ((s.first_name || '') + ' ' + (s.last_name || '')).trim() || 'без имени'),
           bot: !!s.is_bot, text: String(b.text || '').replace(/(\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/g, '[тел.]'),
           rmid: lk.type === 'reply' ? String((lk.message || {}).mid || '') : '' };
}

// REDACTED_B64_9 запуск из редактора
/** Проверка: токен на месте и MAX отвечает (имя бота), список групп. Токен не печатается. */
function check() {
  var me = api_('GET', '/me'); console.log('MAX /me: ' + me[0] + ' ' + (me[1].name || me[1].first_name || me[1].message || ''));
  var rc = api_('GET', '/chats', { count: 100 }); console.log('/chats: ' + rc[0] + ' ключи: ' + Object.keys(rc[1] || {}).join(',') + ' · всего: ' + ((rc[1].chats || []).length) + ' · ' + JSON.stringify(rc[1]).slice(0, 200));
  var r2 = api_('GET', '/chats'); console.log('/chats без параметров: ' + r2[0] + ' ' + JSON.stringify(r2[1]).slice(0, 300));
  var C = chats_(true); Object.keys(C).forEach(function (k) { console.log(k + ' · ' + C[k].type + ' · ' + C[k].title + (C[k].members ? ' · ' + C[k].members + ' уч.' : '')); });
}
/** Последние сообщения группы (по части названия) — в журнал выполнения, телефоны скрыты. */
function readGroup_(g, n) {
  var f = findChat_(g); if (!f || f === 'many') { console.log(f ? 'несколько групп: ' + g : 'нет группы: ' + g); return; }
  var r = api_('GET', '/messages', { chat_id: f[0], count: n || 40 }); if (!ok_(r[0])) { console.log('MAX ' + r[0] + ' ' + JSON.stringify(r[1]).slice(0, 200)); return; }
  console.log('== ' + f[1]);
  (r[1].messages || []).map(norm_).sort(function (a, b) { return a.ts - b.ts; }).forEach(function (m) {
    console.log(Utilities.formatDate(new Date(m.ts), 'Europe/Moscow', 'dd.MM HH:mm') + ' ' + (m.bot ? '[бот] ' : '') + m.name + (m.rmid ? ' ↩' : '') + ': ' + m.text.replace(/\s+/g, ' ').slice(0, 300));
  });
}
function readProd() { readGroup_('Производство', 40); }
function readKom() { readGroup_('Коммерческий отдел', 40); }


/* 03.11.2026 ~07:50, Сотрудник2: «Больше по этим заказам никому ничего не пиши пока в группах… вопросы, написанные в группах, кроме
   коммерческого отдела, все снимай». listBotPosts — сообщения бота за 02–03.11 в группах, кроме «Коммерческого отдела» (только чтение);
   deleteBotPosts — DELETE /messages?message_id=… по списку RM_MIDS (вписывается после сверки). Перед удалением каждое сообщение
   проверяется: отправил этот бот и это не «Коммерческий отдел». */
var KOM_CID = '-100000000004';                 // «Коммерческий отдел» — не трогать
var RM_CIDS = ['-100000000005'];               // «Производство»
var RM_FROM = '2026-11-02T00:00:00+03:00';
var RM_MIDS = ['mid.ffffbe7b4ab8222b01a19b0eddc6060b', 'mid.ffffbe7b4ab8222b01a1a03536e5060b'];   // 03.11: вопросы бота Т. В. Сотрудник1

function botUid_() { var r = api_('GET', '/me'); return ok_(r[0]) ? String((r[1] || {}).user_id || '') : ''; }

var RUN_MODE = 'lead';   // 03.11: 'lead' — listBotPosts запускает listLeadPosts; 'del' — deleteBotPosts; '' — как было
function listBotPosts() {
  if (RUN_MODE === 'lead') return listLeadPosts();
  if (RUN_MODE === 'del') return deleteBotPosts();
  var me = botUid_(), lo = new Date(RM_FROM).getTime();
  console.log('бот user_id: ' + (me || '?'));
  RM_CIDS.forEach(function (cid) {
    if (cid === KOM_CID) return;
    var ci = api_('GET', '/chats/' + cid);
    console.log('== чат ' + cid + ' — ' + ci[0] + ' «' + String((ci[1] || {}).title || '') + '»');
    var all = [], upper = null;
    for (var k = 0; k < 5; k++) {
      var q = { chat_id: cid, count: 100 }; if (upper) { q.from = upper; q.to = lo; }
      var r = api_('GET', '/messages', q); if (!ok_(r[0])) { console.log('MAX ' + r[0] + ' ' + JSON.stringify(r[1]).slice(0, 200)); break; }
      var raw = r[1].messages || []; all = all.concat(raw);
      var ts = raw.map(function (x) { return Number(x.timestamp || 0); }).filter(Boolean);
      if (!ts.length || Math.min.apply(null, ts) <= lo || raw.length < 100) break;
      upper = Math.min.apply(null, ts) - 1;
    }
    var seen = {}, list = all.filter(function (x) { var s = x.sender || {}; return s.is_bot && (!me || String(s.user_id) === me); }).map(norm_)
      .filter(function (x) { if (!x.mid || x.ts < lo || seen[x.mid]) return false; seen[x.mid] = 1; return true; })
      .sort(function (a, b) { return a.ts - b.ts; });
    console.log('всего сообщений прочитано: ' + all.length + '; бота с 02.11: ' + list.length);
    list.forEach(function (x) { console.log(Utilities.formatDate(new Date(x.ts), 'Europe/Moscow', 'dd.MM HH:mm') + ' mid=' + x.mid + ' len=' + x.text.length + ' :: ' + x.text.replace(/\s+/g, ' ').slice(0, 80)); });
    list.forEach(function (x) { console.log('##### ' + x.mid + ' ' + Utilities.formatDate(new Date(x.ts), 'Europe/Moscow', 'dd.MM HH:mm') + '\n' + x.text + '\n##### конец'); });
  });
}

function deleteBotPosts(mids) {
  mids = (mids && mids.length) ? mids : RM_MIDS;
  if (!mids.length) { console.log('RM_MIDS пуст — нечего снимать'); return; }
  var me = botUid_();
  // 04.11.2026 (замечание GPT 12): без точного user_id бота — ничего не удаляется; удаляется только сообщение этого бота
  //   в разрешённом чате (RM_CIDS, «Коммерческий отдел» — только mid из RM_KOM_OK) из сверенного списка mids
  if (!me) { console.log('не удалось определить бота (/me) — удаление остановлено'); return; }
  mids.forEach(function (mid) {
    var g = api_('GET', '/messages/' + encodeURIComponent(mid)), m = g[1] || {}, s = m.sender || {}, rc = String(((m.recipient || {}).chat_id) || '');
    if (!ok_(g[0])) { console.log(mid + ': не прочитано ' + g[0] + ' ' + JSON.stringify(g[1]).slice(0, 160)); return; }
    if (rc === KOM_CID && RM_KOM_OK.indexOf(mid) < 0) { console.log(mid + ': «Коммерческий отдел» — пропущено (нет в RM_KOM_OK)'); return; }
    if (rc !== KOM_CID && RM_CIDS.indexOf(rc) < 0) { console.log(mid + ': чат ' + (rc || '?') + ' не разрешён — пропущено'); return; }
    if (!s.is_bot || String(s.user_id || '') !== me) { console.log(mid + ': не сообщение этого бота — пропущено'); return; }
    var r = api_('DELETE', '/messages', { message_id: mid });
    console.log(mid + ' (чат ' + rc + '): ' + r[0] + ' ' + JSON.stringify(r[1]).slice(0, 200));
    Utilities.sleep(800);
  });
}


/* 03.11.2026, Сотрудник2: «Мне вопросы бот не задаёт, так же не задаёт вопросы Сотрудник29, Сотрудник42 и Сотрудник13… Убери это из группы и по этим людям».
   listLeadPosts — сообщения бота за 7 дней во всех чатах бота (группы и личные), где упомянут кто-то из руководства (только чтение; строки-подписи
   «Сотрудник4 Сотрудник2 Отчество2 Сотрудник1 через ИИ-ассистента Claude», «Сотрудник2 Сотрудник1 · пишет через Claude», «Поручение Т. В. Сотрудник1» не считаются).
   Снимать — deleteBotPosts по RM_MIDS; в «Коммерческом отделе» — только mid из RM_KOM_OK (сверены вручную). */
var LEAD_RE = /(Сотрудник2\s*М(?![а-яё])|Сотрудник2\s+Отчество1|Сотрудник91\s+Отчество42|Сотрудник1\S*\s+Т(?![а-яё])|Сотрудник1\S*\s+Сотрудник2|Т\.\s*В\.\s*Сотрудник1|Сотрудник29|Сотрудник29|Сотрудник90|Сотрудник13|Сотрудник17\s+Отчество29|Сотрудник42\S*\s+Сотрудник48|Сотрудник48\S*\s+Сотрудник42|Сотрудник48\s+Отчество1|Сотрудник42\S*\s+В\.\s*В\.)/i;
var LEAD_SIG = /Сотрудник4 Сотрудник2 Отчество2 Сотрудник1 через ИИ-ассистента Claude\.?|Сотрудник2 Сотрудник1 · пишет через Claude|Поручени[ея] Т\. В\. Сотрудник1\.?|Напоминание от Т\. В\. Сотрудник1|по поручению Сотрудник2 Отчество2 Сотрудник1/g;
var LEAD_FROM = '2026-10-27T00:00:00+03:00';
var RM_KOM_OK = ['mid.ffffbe7b4ab8222b01a19b0eddc6060b', 'mid.ffffbe7b4ab8222b01a1a03536e5060b'];   // «Коммерческий отдел» 02.11 и 03.11 10:00 «⏰ Сотрудник2 М, контрольные точки…»

function listLeadPosts() {
  var me = botUid_(), lo = new Date(LEAD_FROM).getTime(), C = chats_(true), tot = 0;
  [KOM_CID, '-100000000005'].forEach(function (k) { if (!C[k]) { var ci = api_('GET', '/chats/' + k); C[k] = { title: String((ci[1] || {}).title || ''), type: String((ci[1] || {}).type || 'chat') }; } });
  console.log('бот user_id: ' + (me || '?') + '; чатов: ' + Object.keys(C).length);
  Object.keys(C).forEach(function (cid) {
    if (C[cid].type === 'channel') return;
    var all = [], upper = null;
    for (var k = 0; k < 10; k++) {
      var q = { chat_id: cid, count: 100 }; if (upper) { q.from = upper; q.to = lo; }
      var r = api_('GET', '/messages', q); if (!ok_(r[0])) { console.log(cid + ' MAX ' + r[0] + ' ' + JSON.stringify(r[1]).slice(0, 160)); break; }
      var raw = r[1].messages || []; all = all.concat(raw);
      var ts = raw.map(function (x) { return Number(x.timestamp || 0); }).filter(Boolean);
      if (!ts.length || Math.min.apply(null, ts) <= lo) break;
      upper = Math.min.apply(null, ts) - 1;
    }
    var seen = {}, bots = all.filter(function (x) { var s = x.sender || {}; return s.is_bot && (!me || String(s.user_id) === me); }).map(norm_)
      .filter(function (x) { if (!x.mid || x.ts < lo || seen[x.mid]) return false; seen[x.mid] = 1; return true; })
      .sort(function (a, b) { return a.ts - b.ts; });
    var hit = bots.filter(function (x) { return LEAD_RE.test(x.text.replace(LEAD_SIG, ' ')); });
    console.log('== ' + cid + ' · ' + C[cid].type + ' · «' + C[cid].title + '»: прочитано ' + all.length + ', бота за 7 дн. ' + bots.length + ', с руководством ' + hit.length);
    console.log('все сообщения бота (кратко):\n' + bots.map(function (x) { return Utilities.formatDate(new Date(x.ts), 'Europe/Moscow', 'dd.MM HH:mm') + ' ' + x.mid + ' :: ' + x.text.replace(/\s+/g, ' ').slice(0, 70); }).join('\n'));
    hit.forEach(function (x) { tot++; console.log('##### ' + x.mid + ' ' + Utilities.formatDate(new Date(x.ts), 'Europe/Moscow', 'dd.MM HH:mm') + ' чат ' + cid + (x.rmid ? ' ↩' + x.rmid : '') + '\n' + x.text + '\n##### конец'); });
  });
  console.log('ИТОГО с руководством: ' + tot);
}


/* 03.11.2026 ~10:45, Сотрудник2: «Добавить боту чтение группы» — ТОЛЬКО ЧТЕНИЕ «Коммерческого отдела» с 02.11:
   все сообщения (бот и люди), полный текст, ответы (↩ конец mid). Ничего не публикует и не удаляет. */
function readKomAll() {
  var lo = new Date('2026-11-02T00:00:00+03:00').getTime(), all = [], upper = null;
  for (var k = 0; k < 6; k++) {
    var q = { chat_id: KOM_CID, count: 100 }; if (upper) { q.from = upper; q.to = lo; }
    var r = api_('GET', '/messages', q); if (!ok_(r[0])) { console.log('MAX ' + r[0] + ' ' + JSON.stringify(r[1]).slice(0, 200)); break; }
    var raw = r[1].messages || []; all = all.concat(raw);
    var ts = raw.map(function (x) { return Number(x.timestamp || 0); }).filter(Boolean);
    if (!ts.length || Math.min.apply(null, ts) <= lo || raw.length < 100) break;
    upper = Math.min.apply(null, ts) - 1;
  }
  var seen = {}, list = all.map(norm_).filter(function (x) { if (!x.mid || x.ts < lo || seen[x.mid]) return false; seen[x.mid] = 1; return true; })
    .sort(function (a, b) { return a.ts - b.ts; });
  console.log('«Коммерческий отдел» с 02.11: ' + list.length + ' сообщений');
  list.forEach(function (x) { console.log('# ' + Utilities.formatDate(new Date(x.ts), 'Europe/Moscow', 'dd.MM HH:mm') + ' ' + x.mid.slice(-8) + (x.rmid ? ' ↩' + x.rmid.slice(-8) : '') + ' ' + (x.bot ? '[бот] ' : '') + x.name + ': ' + x.text.replace(/\s+/g, ' ').slice(0, 1200)); });
}
