/* «Фабрика — бот MAX» — Relay.gs (03.11.2026). Полный перенос вебхука MAX с хостинга в этот скрипт.
   Сотрудник2, 02.11: «Перенеси его на диск тоже… чтобы команды уходили моментально» (опрос «Полностью на Google»); 03.11: «давай доделаем перенос бота».
   Код.gs (api_, chats_, findChat_, norm_, check, readKom, listBotPosts, deleteBotPosts, readKomAll…) не меняется — здесь только новое.
   Как работает:
   1) Вебхук MAX → doPost этого веб-приложения (адрес + ?s=HOOK_SECRET; заголовки Apps Script не видит).
      Сам скрипт делает только команду владельца в личке («В Производство: текст» → сразу в группу, после привязки /owner КОД).
      ВСЁ остальное (пересылки, опросы poll:, комментарии, журнал групп, меню, ответы бота) уходит на хостинг max/hook.php
      с подписью ключом команд: X-Fabrika-Relay: <unix>:<hex HMAC-SHA256(K_CMD, "relay:"+t+":"+sha256hex(тело))> — хостинг это принимает.
   2) Команды Claude (POST t, d, s): s = hex HMAC-SHA256(K_CMD, "mx:"+t+":"+sha256hex(d)); d = {"op":"post|dm|read|chats", ...}.
   Секреты — только в свойствах скрипта: MAX_TOKEN, K_CMD (вписывает Сотрудник2), HOOK_SECRET (создаёт connectWebhook). В журнал не выводятся.
   GET /chats в MAX нет (404) — группы бота скрипт запоминает сам (свойство GROUPS) из событий вебхука и seedGroups(). */

var SITE = 'https://techfabrikant.ru/';
var OWNER_CMD = /^\s*в\s+(?:группу\s+)?([^:\n]{3,60}?)\s*:\s*(\S[\s\S]*)$/i;
var KNOWN_GROUPS = { '-100000000003': 'Коммерческий отдел', '-100000000004': 'Производство' };
var HOOK_TYPES = ['message_created', 'message_callback', 'bot_started', 'bot_added', 'bot_removed', 'message_edited', 'message_removed',
                  'user_added', 'user_removed', 'chat_title_changed'];

function hexBytes_(h) { var b = []; for (var i = 0; i < h.length; i += 2) { var x = parseInt(h.substr(i, 2), 16); b.push(x > 127 ? x - 256 : x); } return b; }
function hex_(bytes) { return bytes.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join(''); }
function sha256hex_(s) { return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hmacHex_(keyHex, msg) { return hex_(Utilities.computeHmacSha256Signature(Utilities.newBlob(msg).getBytes(), hexBytes_(keyHex))); }
function kcmd_() { var k = String(P_().getProperty('K_CMD') || '').trim().toLowerCase(); return /^[0-9a-f]{64}$/.test(k) ? k : ''; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
// 04.11.2026 (замечание GPT 08): одно значение свойства Google — не больше 9 КБ; журнал и метки отправок держатся в PROP_MAX байт UTF-8,
//   запись журнала никогда не роняет обработку (ошибка — только в console.log).
var PROP_MAX = 8000;
function u8len_(s) { s = String(s == null ? '' : s); var n = 0; for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); if (c < 0x80) n++; else if (c < 0x800) n += 2; else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) { n += 4; i++; } else n += 3; } return n; }
function keepBytes_(arr, max) {   // массив, чей JSON ≤ max байт: лишнее — с начала (старое)
  arr = Array.isArray(arr) ? arr.slice() : []; max = max || PROP_MAX;
  var total = u8len_(JSON.stringify(arr)); if (total <= max) return arr;
  var sz = arr.map(function (x) { return u8len_(JSON.stringify(x)) + 1; });
  while (arr.length && total > max) { total -= sz.shift(); arr.shift(); }
  return arr;
}
function log_(s) {
  try {
    var p = P_(), a = []; try { a = JSON.parse(p.getProperty('log') || '[]'); } catch (e) {}
    a.push(Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM HH:mm:ss') + ' ' + mask_(s).slice(0, 300));
    p.setProperty('log', JSON.stringify(keepBytes_(a.slice(-60), PROP_MAX)));
  } catch (e2) { console.log('журнал не записан: ' + e2); }
}
/** Метки отправок: ключ — 16 знаков sha256 от id (короче — больше меток в 8 КБ); старый формат (сам id) тоже читается. */
function idKey_(id) { return sha256hex_('post:' + id).slice(0, 16); }
function idsLoad_() { var o = {}; try { o = JSON.parse(P_().getProperty('post_ids') || '{}') || {}; } catch (x) {} return o; }
function idsSave_(ids) {   // убрать старше 14 дней и лишнее по байтам (сначала самые старые); ошибка — false, без исключения
  try {
    var now = Date.now(), ks = Object.keys(ids).filter(function (k) { return now - Number(ids[k]) < 14 * 864e5; }).sort(function (a, b) { return ids[a] - ids[b]; });
    var o = {}; ks.forEach(function (k) { o[k] = ids[k]; });
    while (ks.length && u8len_(JSON.stringify(o)) > PROP_MAX) delete o[ks.shift()];
    P_().setProperty('post_ids', JSON.stringify(o)); return true;
  } catch (e) { console.log('post_ids не записаны: ' + e); return false; }
}
function sendChat_(cid, text) { return api_('POST', '/messages', { chat_id: cid }, { text: String(text).slice(0, 3990), format: 'html' }); }
function sendUser_(uid, text) { return api_('POST', '/messages', { user_id: uid }, { text: String(text).slice(0, 3990), format: 'html' }); }
function h_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }   // 12.11 CodeQL: и кавычки — h_ идёт и в атрибуты href

// REDACTED_B64_2 группы бота (свойство GROUPS)
/** { chat_id: {title, type} } — запомненные группы + то, что вдруг отдаст GET /chats. */
function groups_() {
  var g = {}; try { g = JSON.parse(P_().getProperty('GROUPS') || '{}'); } catch (e) {}
  try { var C = chats_(); Object.keys(C).forEach(function (k) { if (!g[k]) g[k] = { title: C[k].title, type: C[k].type }; }); } catch (e) {}
  return g;
}
function saveGroup_(cid, title, type) {
  cid = String(cid || ''); if (!cid) return;
  var lock = LockService.getScriptLock(); try { lock.waitLock(5000); } catch (e) { return; }
  try {
    var g = {}; try { g = JSON.parse(P_().getProperty('GROUPS') || '{}'); } catch (e) {}
    var cur = g[cid] || {}; g[cid] = { title: String(title || cur.title || ('группа ' + cid)).slice(0, 80), type: String(type || cur.type || 'chat') };
    P_().setProperty('GROUPS', JSON.stringify(g));
  } finally { lock.releaseLock(); }
}
function dropGroup_(cid) {
  var g = {}; try { g = JSON.parse(P_().getProperty('GROUPS') || '{}'); } catch (e) {}
  if (g[String(cid)]) { delete g[String(cid)]; P_().setProperty('GROUPS', JSON.stringify(g)); }
}
/** Название и тип чата из MAX (GET /chats/{id}) — запомнить. */
function learnChat_(cid) {
  var r = api_('GET', '/chats/' + encodeURIComponent(cid)), j = r[1] || {};
  if (ok_(r[0])) saveGroup_(cid, j.title, j.type);
  return ok_(r[0]);
}
/** Группа по части названия: точно → вхождение → основа (6 букв). [chat_id, название] | 'many' | null. Каналы не берутся. */
function findGroup_(q) {
  q = String(q || '').replace(/[«»"]/g, '').trim().toLowerCase(); if (q.length < 3) return null;
  var G = groups_(), ids = Object.keys(G).filter(function (k) { return G[k].type !== 'channel'; });
  function pick(test) { return ids.filter(function (k) { return G[k].title && test(String(G[k].title).toLowerCase()); }); }
  var hit = pick(function (t) { return t === q; });
  if (!hit.length) hit = pick(function (t) { return t.indexOf(q) >= 0; });
  if (!hit.length && q.length >= 6) { var st = q.slice(0, 6); hit = pick(function (t) { return t.indexOf(st) >= 0; }); }
  if (hit.length > 1) return 'many';
  return hit.length ? [hit[0], G[hit[0]].title] : null;
}
/** Участники группы: { user_id: имя } (для личных сообщений по имени). */
function members_(cid) {
  var out = {}, marker = null;
  for (var n = 0; n < 10; n++) {
    var q = { count: 100 }; if (marker) q.marker = marker;
    var r = api_('GET', '/chats/' + encodeURIComponent(cid) + '/members', q); if (!ok_(r[0])) break;
    (r[1].members || []).forEach(function (m) { out[String(m.user_id)] = String(m.name || ((m.first_name || '') + ' ' + (m.last_name || '')).trim()); });
    marker = r[1].marker; if (!marker) break;
  }
  return out;
}

// REDACTED_B64_2 команды Claude (подпись K_CMD)
function cmd_(e) {
  var k = kcmd_(); if (!k) return { ok: false, error: 'ключ команд не установлен' };
  var t = Number(e.parameter.t || 0), d = String(e.parameter.d || ''), s = String(e.parameter.s || '').toLowerCase();
  if (!t || Math.abs(Date.now() / 1000 - t) > 600 || !d || d.length > 12000 || !/^[0-9a-f]{64}$/.test(s)) return { ok: false, error: 'нет доступа' };
  if (hmacHex_(k, 'mx:' + t + ':' + sha256hex_(d)) !== s) return { ok: false, error: 'нет доступа' };
  var q; try { q = JSON.parse(d); } catch (x) { return { ok: false, error: 'bad' }; }
  var op = String(q.op || 'post');
  if (op === 'ping') return { ok: true, pong: true, key: true, groups: Object.keys(groups_()).length };
  if (op === 'chats') { var G = groups_(); return { ok: true, chats: Object.keys(G).map(function (k2) { return { id: k2, title: G[k2].title, type: G[k2].type }; }) }; }
  if (op === 'read') {
    var f = findGroup_(q.g); if (!f || f === 'many') return { ok: false, error: f ? 'несколько групп подходят' : 'нет группы бота с таким названием' };
    var r = api_('GET', '/messages', { chat_id: f[0], count: Math.min(100, Number(q.n) || 50) });
    if (!ok_(r[0])) return { ok: false, error: 'MAX ' + r[0] };
    return { ok: true, title: f[1], msgs: (r[1].messages || []).map(norm_) };
  }
  // post / dm — один раз на метку id
  var id = String(q.id || '').replace(/[^\w.-]+/g, '_').slice(0, 80); if (!id) return { ok: false, error: 'нет метки id' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ids = idsLoad_(), ik = idKey_(id);
    if (ids[ik] || ids[id]) return { ok: false, error: 'уже отправлено (id)' };
    var res;
    if (op === 'post') {
      var g = findGroup_(q.g); if (!g) return { ok: false, error: 'нет группы бота с таким названием' }; if (g === 'many') return { ok: false, error: 'несколько групп подходят — уточните название' };
      var rp = sendChat_(g[0], q.text); if (!ok_(rp[0])) return { ok: false, error: 'MAX ' + rp[0], title: g[1] };
      res = { ok: true, title: g[1], mid: String(((rp[1].message || {}).body || {}).mid || '') };
      ids[ik] = Date.now(); if (!idsSave_(ids)) res.warn = 'метка отправки не записана';   // 04.11.2026 (замечание GPT 08): метка — сразу после отправки
      log_('Claude → группа «' + g[1] + '» (' + id + ')');
    } else if (op === 'dm') {
      var uid = Number(q.uid) || 0, who = '';
      if (!uid && q.name) {                              // по имени — среди участников групп бота
        // 04.11.2026 (замечание GPT 10): все совпадения во всех группах, один человек в нескольких группах — один кандидат;
        //   отправка только при единственном совпадении, иначе — варианты (повторить с uid)
        var want = String(q.name).toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean), G2 = groups_(), cand = {};
        Object.keys(G2).forEach(function (c) {
          if (G2[c].type === 'channel') return;
          var M = members_(c);
          Object.keys(M).forEach(function (u) {
            var nm = String(M[u]).toLowerCase().replace(/ё/g, 'е');
            if (want.every(function (w) { return nm.indexOf(w) >= 0; })) { if (!cand[u]) cand[u] = { uid: Number(u), name: M[u], groups: [] }; cand[u].groups.push(G2[c].title || c); }
          });
        });
        var ck = Object.keys(cand);
        if (ck.length > 1) return { ok: false, error: 'несколько людей с таким именем — уточните (uid)', options: ck.map(function (k) { return cand[k]; }) };
        if (ck.length === 1) { uid = cand[ck[0]].uid; who = cand[ck[0]].name; }
      }
      if (!uid) return { ok: false, error: 'человек не найден среди участников групп бота' };
      var rd = sendUser_(uid, q.text); if (!ok_(rd[0])) return { ok: false, error: 'MAX ' + rd[0] };
      res = { ok: true, uid: uid, who: who };
      ids[ik] = Date.now(); if (!idsSave_(ids)) res.warn = 'метка отправки не записана';
      log_('Claude → личное ' + (who || uid) + ' (' + id + ')');
    } else return { ok: false, error: 'неизвестная команда' };
    return res;
  } finally { lock.releaseLock(); }
}

// REDACTED_B64_2 вебхук MAX
function hook_(e) {
  var sec = P_().getProperty('HOOK_SECRET'); if (!sec || !e || !e.parameter || e.parameter.s !== sec) return { ok: false };
  var raw = e.postData && e.postData.contents || '', u; try { u = JSON.parse(raw); } catch (x) { return { ok: true }; }
  var key = 'u' + sha256hex_(raw).slice(0, 40), ca = CacheService.getScriptCache();
  if (ca.get(key)) return { ok: true, dup: true }; ca.put(key, '1', 21600);
  try { track_(u); } catch (x) { log_('группы: ' + x); }
  var handled = false;
  try { handled = owner_(u); } catch (x) { log_('владелец: ' + x); }
  if (!handled) relay_(raw);
  return { ok: true };
}
/** Запомнить группы бота из событий (GET /chats в MAX нет). */
function track_(u) {
  var type = String(u.update_type || '');
  if (type === 'bot_added') { var c1 = String(u.chat_id || ''); if (c1 && !learnChat_(c1)) saveGroup_(c1, '', u.is_channel ? 'channel' : 'chat'); return; }
  if (type === 'bot_removed') { if (u.chat_id) dropGroup_(u.chat_id); return; }
  if (type === 'chat_title_changed') { if (u.chat_id) saveGroup_(u.chat_id, u.title, ''); return; }
  if (type === 'message_created' && u.message) {
    var rc = u.message.recipient || {}, cid = String(rc.chat_id || '');
    if (cid && String(rc.chat_type) !== 'dialog') { var G = {}; try { G = JSON.parse(P_().getProperty('GROUPS') || '{}'); } catch (x) {} if (!G[cid]) learnChat_(cid); }
  }
}
/** Команды владельца в личных: «/owner КОД» (привязка), «В <группа>: текст» (публикация). true — обработано здесь, на хостинг не отправлять. */
function owner_(u) {
  if (String(u.update_type) !== 'message_created' || !u.message) return false;
  var m = u.message, rc = m.recipient || {}, s = m.sender || {}; if (String(rc.chat_type) !== 'dialog' || s.is_bot) return false;
  var uid = Number(s.user_id || 0), text = String((m.body || {}).text || '').trim(), p = P_();
  var mm = text.match(/^\/owner\s+(\d{6})$/);
  if (mm && p.getProperty('OWNER_CODE')) return ownerBind_(uid, mm[1]);   // 04.11.2026 (замечание GPT 09); кода Google нет — как раньше, на хостинг
  var own = Number(p.getProperty('OWNER_UID') || 0); if (!own || uid !== own) return false;
  var g = text.match(OWNER_CMD); if (!g) return false;
  var f = findGroup_(g[1]); if (!f) return false;          // нет такой группы — обычное сообщение, дальше на хостинг
  if (f === 'many') { sendUser_(uid, 'Под «' + h_(g[1].trim()) + '» подходит несколько групп — напишите название точнее.'); return true; }
  var r = sendChat_(f[0], h_(g[2].trim()));
  log_('владелец → группа «' + f[1] + '»: ' + (ok_(r[0]) ? 'ok' : 'ошибка ' + r[0]));
  sendUser_(uid, ok_(r[0]) ? '✅ Опубликовано в «' + h_(f[1]) + '».' : '❌ Не получилось опубликовать в «' + h_(f[1]) + '» (MAX ' + r[0] + '). Попробуйте ещё раз.');
  return true;
}
/** Событие — на хостинг (max/hook.php) с подписью K_CMD. → код ответа хостинга (0 — нет связи / нет ключа). */
function relay_(raw) {
  var k = kcmd_(); if (!k) { log_('хостинг: нет K_CMD — событие не передано'); return 0; }
  var t = Math.floor(Date.now() / 1000), sig = hmacHex_(k, 'relay:' + t + ':' + sha256hex_(raw));
  try {
    var r = UrlFetchApp.fetch(SITE + 'max/hook.php', { method: 'post', contentType: 'application/json', payload: raw, muteHttpExceptions: true,
                                                      followRedirects: false, headers: { 'X-Fabrika-Relay': t + ':' + sig } });
    var c = r.getResponseCode(); if (c !== 200) log_('хостинг: ' + c);
    return c;
  } catch (x) { log_('хостинг: ' + x); return 0; }
}

function doPost(e) {
  try {
    // Additive Rex/Claude control endpoint; existing webhook branches follow unchanged.
    var rexControlBody = null;
    if (e && e.postData && typeof e.postData.contents === 'string') {
      try { rexControlBody = JSON.parse(e.postData.contents); } catch (ignoreRexControlJson) {}
    }
    if (rexControlBody && rexControlBody.op === 'rexctl') return json_(rexctl_handleEnvelope_(rexControlBody));
    if (typeof mx_isGoogle === 'function' && mx_isGoogle()) return mx_doPost(e);   // 05.11.2026: MODE === 'google' — ядро MaxCore*.gs (очередь, все ветки, без хостинга); иначе — как было
    if (e && e.parameter && e.parameter.d && e.parameter.t) return json_(cmd_(e));
    return json_(hook_(e));
  } catch (x) { log_('doPost: ' + x); return json_({ ok: false, error: 'ошибка' }); }
}
function doGet(e) {if(e && e.parameter && e.parameter.page === 'owner-timers') return rcot_render_(); if(e && e.parameter && e.parameter.page === 'owner-control') return rcow_routeGet_(e);  if(e && e.parameter && e.parameter.page === 'rexapprove') return rxap_renderApproval_(); if(e && e.parameter && e.parameter.page === 'rexsetup') return rxa_renderSetup_(); return json_({ ok: true, bot: 'Фабрика — бот MAX' }); }

// REDACTED_B64_2 настройка (запускать из редактора)
var WEBAPP_URL_FIXED = 'https://script.google.com/macros/s/REDACTED_2/exec';   // адрес веб-приложения (…/exec) после развёртывания — вписывается сюда, если getUrl() из редактора отдаёт /dev
function webappUrl_() {
  if (WEBAPP_URL_FIXED) return WEBAPP_URL_FIXED;
  var u = ''; try { u = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!u || /\/dev$/.test(u)) u = String(P_().getProperty('WEBAPP_URL') || u || '');
  return u;
}
/** Проверка без секретов: MAX /me, ключ команд есть/нет, адрес веб-приложения, подписка, группы. */
function checkRelay() {
  var me = api_('GET', '/me'); console.log('MAX /me: ' + me[0] + ' ' + ((me[1] || {}).name || (me[1] || {}).first_name || (me[1] || {}).message || ''));
  console.log('ключ команд K_CMD: ' + (kcmd_() ? 'есть' : 'НЕТ') + '; HOOK_SECRET: ' + (P_().getProperty('HOOK_SECRET') ? 'есть' : 'нет (создаст connectWebhook)') +
              '; владелец: ' + (P_().getProperty('OWNER_UID') ? 'привязан' : 'нет'));
  var u = webappUrl_(); console.log('веб-приложение: ' + (u ? u.replace(/\/macros\/s\/([^/]{6})[^/]+/, '/macros/s/$1…') : 'не развёрнуто'));
  hooks();
  var G = groups_(); console.log('группы: ' + Object.keys(G).map(function (k) { return k + ' «' + G[k].title + '» ' + G[k].type; }).join(' | '));
}
/** Запомнить известные группы (Коммерческий отдел, Производство) — названия берутся из MAX. */
function seedGroups() {
  Object.keys(KNOWN_GROUPS).forEach(function (cid) { var ok = learnChat_(cid); if (!ok) saveGroup_(cid, KNOWN_GROUPS[cid], 'chat'); console.log(cid + ': ' + (ok ? 'из MAX' : 'по справочнику')); });
  var G = groups_(); console.log('группы: ' + Object.keys(G).map(function (k) { return k + ' «' + G[k].title + '»'; }).join(' | '));
}
/** Подписанный тестовый пинг на хостинг (в MAX ничего не публикуется; хостинг запишет его как «неизвестное событие»). */
function testRelay() {
  if (!kcmd_()) { console.log('K_CMD нет в свойствах скрипта — пинг не отправлен'); return; }
  var c = relay_(JSON.stringify({ update_type: 'fabrika_relay_ping', timestamp: Date.now(), from: 'gas' }));
  console.log('хостинг max/hook.php ответил: ' + c + (c === 200 ? ' — подпись принята' : c === 403 ? ' — подпись НЕ принята (ключ не тот?)' : ''));
}
/** 04.11.2026 (замечание GPT 09): привязка владельца по коду — код живёт OWNER_TTL, не больше 3 неверных попыток с человека и 10 всего
 *  (потом код гасится), проверка и погашение под замком (из двух верных одновременно проходит один), уже привязанного владельца
 *  код не заменяет без OWNER_REBIND=1 (ставит сам владелец), о попытке смены владельцу приходит сообщение. → true (обработано). */
var OWNER_TTL = 30 * 6e4;
function ownerBind_(uid, code) {
  var lk = LockService.getScriptLock(); if (!lk.tryLock(10000)) return true;
  try {
    var p = P_(), cur = Number(p.getProperty('OWNER_UID') || 0), want = p.getProperty('OWNER_CODE'), t0 = Number(p.getProperty('OWNER_CODE_T') || 0), tr = {};
    try { tr = JSON.parse(p.getProperty('OWNER_TRIES') || '{}') || {}; } catch (x) {}
    function kill(why) { p.deleteProperty('OWNER_CODE'); p.deleteProperty('OWNER_CODE_T'); p.deleteProperty('OWNER_TRIES'); log_('код владельца погашен: ' + why); }
    if (!want) { sendUser_(uid, 'Код не выдан или уже использован.'); return true; }
    if (!t0 || Date.now() - t0 > OWNER_TTL) { kill('просрочен'); sendUser_(uid, 'Код просрочен — попросите новый.'); return true; }
    var mine = Number(tr[uid] || 0), all = Number(tr._all || 0);
    if (mine >= 3 || all >= 10) { kill('много неверных попыток'); sendUser_(uid, 'Слишком много неверных попыток — код погашен.'); return true; }
    if (code !== want) {
      tr[uid] = mine + 1; tr._all = all + 1; p.setProperty('OWNER_TRIES', JSON.stringify(tr));
      if (tr[uid] >= 3 || tr._all >= 10) { kill('много неверных попыток'); sendUser_(uid, 'Слишком много неверных попыток — код погашен.'); }
      else sendUser_(uid, 'Неверный код.');
      return true;
    }
    if (cur && cur !== uid && p.getProperty('OWNER_REBIND') !== '1') {
      kill('попытка сменить владельца ' + cur + ' → ' + uid + ' без разрешения');
      sendUser_(uid, 'Владелец бота уже привязан. Смена — только с разрешения владельца.');
      sendUser_(cur, '⚠️ Кто-то ввёл верный код владельца бота (user_id ' + uid + '). Владелец не сменён, код погашен.');
      return true;
    }
    p.setProperty('OWNER_UID', String(uid)); p.deleteProperty('OWNER_REBIND'); kill('использован');
    log_('владелец привязан: ' + uid + (cur && cur !== uid ? ' (был ' + cur + ')' : ''));
    sendUser_(uid, '✅ Готово: вы — владелец бота в Google. Команда «В Производство: текст» публикует сообщение в группе сразу, без хостинга.');
    if (cur && cur !== uid) sendUser_(cur, 'Владелец бота сменён на user_id ' + uid + ' (по вашему разрешению).');
    return true;
  } finally { lk.releaseLock(); }
}
/** Одноразовый код владельца — Сотрудник2 отправляет боту в личку «/owner КОД» (действует 30 минут). */
function ownerCode() { var c = String(Math.floor(100000 + Math.random() * 900000)), p = P_(); p.setProperty('OWNER_CODE', c); p.setProperty('OWNER_CODE_T', String(Date.now())); p.deleteProperty('OWNER_TRIES'); console.log('код владельца: ' + c); }
/** Текущие подписки вебхука (адреса без секретов). */
function hooks() {
  var r = api_('GET', '/subscriptions');
  console.log('подписки MAX: ' + r[0] + ' ' + (((r[1] || {}).subscriptions) || []).map(function (s) { return String(s.url || '').replace(/([?&]s=)[^&]+/, '$1***').replace(/\/macros\/s\/([^/]{6})[^/?]+/, '/macros/s/$1…'); }).join(' | '));
}
/** Переключить вебхук MAX на это веб-приложение. Прежний адрес хостинга снимается (откат — «Управление» → бот MAX → «Подключить вебхук» на портале). */
function connectWebhook() {
  var url = webappUrl_(); if (!url || /\/dev$/.test(url)) { console.log('нет адреса веб-приложения: сначала «Начать развертывание» → Новое развёртывание → Веб-приложение'); return; }
  if (!kcmd_()) { console.log('нет K_CMD в свойствах скрипта — без него события не дойдут до хостинга. Сначала впишите K_CMD.'); return; }
  var sec = P_().getProperty('HOOK_SECRET'); if (!sec) { sec = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); P_().setProperty('HOOK_SECRET', sec); }
  if (!Object.keys(groups_()).length) seedGroups();
  var cur = api_('GET', '/subscriptions'), old = (((cur[1] || {}).subscriptions) || []).map(function (s) { return String(s.url || ''); });
  var r = api_('POST', '/subscriptions', null, { url: url + '?s=' + sec, update_types: HOOK_TYPES });
  console.log('подписка на скрипт: ' + r[0] + ' ' + JSON.stringify(r[1]).slice(0, 160));
  if (!ok_(r[0]) || (r[1] && r[1].success === false)) { console.log('MAX не принял подписку — хостинг остаётся как был'); return; }
  old.filter(function (o) { return o.indexOf(url) !== 0; }).forEach(function (o) { var d = api_('DELETE', '/subscriptions', { url: o }); console.log('снят прежний адрес (хостинг): ' + d[0]); });
  log_('вебхук переключён на скрипт');
  hooks();
}
/** Снять подписку этого скрипта (только по слову Сотрудник2). Вернуть хостинг: портал → «Управление» → бот MAX → «Подключить вебхук». */
function disconnectWebhook() {
  var url = webappUrl_(), cur = api_('GET', '/subscriptions');
  (((cur[1] || {}).subscriptions) || []).map(function (s) { return String(s.url || ''); }).filter(function (o) { return url && o.indexOf(url) === 0; })
    .forEach(function (o) { var d = api_('DELETE', '/subscriptions', { url: o }); console.log('снята подписка скрипта: ' + d[0]); });
  log_('вебхук скрипта снят'); hooks();
}
function setWebappUrl(u) { P_().setProperty('WEBAPP_URL', String(u)); }
function showLog() { console.log((JSON.parse(P_().getProperty('log') || '[]')).join('\n')); }
