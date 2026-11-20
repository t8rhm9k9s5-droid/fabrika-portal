/** «Фабрика» — личные сообщения из mx_direct.json (20.11.2026, Т. В.: «добавь отправку в код прям сейчас»).
 *  Почему: с 05.11 участок bots хостинга выключен (bots_off) — его mx_ctl.py больше не шлёт личные из code/mx_direct.json,
 *  а в боте Google этой отправки не было. Теперь: робот кладёт code/mx_direct.json в «Для ботов» (bots_drive.py, FILES),
 *  бот раз в 5 минут (mx_tick, полный проход) отправляет каждую запись один раз — тем же mx_opDm (дубль по id не уйдёт:
 *  postReserve_ в листе post_ids), с проверкой DmGate.
 *  Запись: {id, at 'ГГГГ-ММ-ДДTЧЧ:ММ' МСК, uid | name, label?, text}. Правила как у mx_ctl.py: только 08:00–20:00 МСК,
 *  не раньше at и не позже at + 10 ч; записи collect / to:'owner' не шлём (владельцу — только Telegram, правило 18.11).
 *  Недопущенных DmGate бот не трогает тревогой на каждого: запись получает отметку «нельзя: …», Claude сводит их одним сообщением.
 *  Итог — «От ботов»/mx_direct.json ({t, direct:{id:{t, st, uid, who, err}}}) → хостинг state/mx_direct_from_bots.json. */
var MXD_FILE = 'mx_direct.json', MXD_PROP = 'MXD_STATE', MXD_MAX_TRIES = 3, MXD_PER_TICK = 12;
/** Решение Т. В. 20.11.2026 (опрос в чате Claude): писать лично Сотрудник38, Сотрудник33, Сотрудник43 — uid или имя; при первой встрече вносится в settings.dm_allow */
var MXD_ALLOW = ['121010894', '212259978', 'дарья бигаева'];

function mxd_tick() {
  if (typeof bf_json !== 'function' || typeof mx_opDm !== 'function') return 'нет модулей';
  var now = new Date(), h = Number(Utilities.formatDate(now, 'Europe/Moscow', 'H'));
  if (h < 8 || h >= 20) return 'вне 08–20';
  var list; try { list = bf_json(MXD_FILE); } catch (x) { mx_log('err', 'mx_direct: файл не читается: ' + mx_errText(x)); return 'битый файл'; }
  if (!Array.isArray(list) || !list.length) return 'пусто';
  var P = PropertiesService.getScriptProperties(), st = {};
  try { st = JSON.parse(P.getProperty(MXD_PROP) || '{}') || {}; } catch (x) { st = {}; }
  var D = st.direct || (st.direct = {}), sent = 0, changed = false, members = null;
  for (var i = 0; i < list.length && sent < MXD_PER_TICK; i++) {
    var x = list[i]; if (!x || !x.id || !x.text || !x.at) continue;
    if (x.collect || x.to === 'owner' || (!x.uid && !x.name)) continue;
    var rec = D[x.id]; if (rec && (rec.st === 'sent' || rec.st === 'dup' || (rec.st === 'blocked' && !/^не утверждён/.test(String(rec.err || ''))) || (rec.n || 0) >= MXD_MAX_TRIES)) continue;
    var at = new Date(String(x.at) + ':00+03:00'); if (isNaN(at.getTime())) continue;
    if (now < at || now - at > 10 * 3600 * 1000) continue;
    var uid = Number(x.uid) || 0, who = String(x.label || x.name || '');
    if (!uid) {
      if (!members) members = mxd_members_();
      var want = mxd_norm_(x.name).split(/\s+/).filter(Boolean), hit = [];
      Object.keys(members).forEach(function (u) { var nm = mxd_norm_(members[u]); if (want.length && want.every(function (w) { return (' ' + nm + ' ').indexOf(' ' + w + ' ') >= 0 || nm.split(/\s+/).indexOf(w) >= 0; })) hit.push(u); });
      if (hit.length !== 1) { D[x.id] = { t: mxd_iso_(now), st: 'blocked', who: who, err: hit.length ? 'несколько людей с таким именем' : 'нет среди участников групп бота' }; changed = true; continue; }
      uid = Number(hit[0]); who = members[hit[0]] || who;
    }
    mxd_allowOwner_(uid, who);
    var why = mxd_gateQuiet_(uid, who);
    if (why) { D[x.id] = { t: mxd_iso_(now), st: 'blocked', uid: uid, who: who, err: why }; changed = true; continue; }
    var r; try { r = mx_opDm({ id: 'mxd-' + x.id, uid: uid, text: String(x.text) }); } catch (e) { r = { ok: false, error: mx_errText(e) }; }
    var n = ((rec && rec.n) || 0) + 1;
    if (r && r.ok) { D[x.id] = { t: mxd_iso_(now), st: 'sent', uid: uid, who: who }; sent++; }
    else if (r && /уже отправлено/.test(String(r.error || ''))) D[x.id] = { t: mxd_iso_(now), st: 'dup', uid: uid, who: who };
    else D[x.id] = { t: mxd_iso_(now), st: 'err', n: n, uid: uid, who: who, err: String((r && r.error) || 'нет ответа').slice(0, 160) };
    changed = true;
  }
  if (changed) {
    var keep = {}, ids = {}; list.forEach(function (x) { if (x && x.id) ids[x.id] = 1; });
    Object.keys(D).forEach(function (k) { if (ids[k]) keep[k] = D[k]; }); st.direct = keep; st.t = mxd_iso_(now);
    try { P.setProperty(MXD_PROP, JSON.stringify(st)); } catch (e) { mx_log('err', 'mx_direct: состояние не сохранено: ' + mx_errText(e)); }
    try { if (typeof bf_write === 'function') bf_write(MXD_FILE, JSON.stringify(st)); } catch (e) { mx_log('err', 'mx_direct: «От ботов» не записан: ' + mx_errText(e)); }
  }
  if (sent) mx_log('dm', 'mx_direct: отправлено личных ' + sent);
  return 'ok ' + sent;
}

/** решение владельца (MXD_ALLOW) → settings.dm_allow, один раз на человека */
function mxd_allowOwner_(uid, who) {
  var u = String(uid), nm = mxd_norm_(who);
  var hit = MXD_ALLOW.some(function (a) { return a === u || (isNaN(Number(a)) && nm && nm.indexOf(a) >= 0); });
  if (!hit) return;
  var allow = mx_set('dm_allow'); allow = Array.isArray(allow) ? allow.map(String) : [];
  if (allow.indexOf(u) >= 0) return;
  allow.push(u); mx_setPut('dm_allow', allow);
  try { MX_MEM.set = null; CacheService.getScriptCache().remove('mx_set'); } catch (e) {}
  mx_log('admin', 'dm_allow: + ' + (who || u) + ' (решение Т. В. 20.11)');
}

/** участники включённых рабочих групп бота: uid → имя */
function mxd_members_() {
  var G = mx_groups(), out = {};
  Object.keys(G).forEach(function (c) {
    if (G[c].channel || (typeof mx_groupOn === 'function' && !mx_groupOn(G[c]))) return;
    try { var M = members_(c); Object.keys(M).forEach(function (u) { if (!out[u]) out[u] = M[u]; }); } catch (e) { mx_log('err', 'mx_direct: участники ' + c + ': ' + mx_errText(e)); }
  });
  return out;
}

/** то же правило, что mx_dmGate_ (DmGate.gs), но без тревоги владельцу на каждого — null: можно, строка: почему нельзя */
function mxd_gateQuiet_(uid, who) {
  uid = String(Number(uid) || 0); if (uid === '0') return 'нет получателя';
  if (mx_isBanned(who)) return 'этому человеку бот лично не пишет (правило 04.11)';
  var own = mx_ownerUid(); if (own && uid === String(own)) return 'владельцу — только Telegram';
  var allow = mx_set('dm_allow'); if (Array.isArray(allow) && allow.map(String).indexOf(uid) >= 0) return null;
  var S = mx_staff(false); if (S === null) return 'MAX не отдал список участников';
  var inG = !!S[uid]; if (!inG) { S = mx_staff(true) || {}; inG = !!S[uid]; }
  var appr = mx_set('dm_appr'), ok2 = Array.isArray(appr) && appr.map(String).indexOf(uid) >= 0;
  if (inG && ok2) return null;
  return !inG ? 'не состоит ни в одной рабочей группе бота' : 'не утверждён в боте (допуск даёт Т. В. или А. В.)';
}

function mxd_norm_(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ').trim(); }
function mxd_iso_(d) { return Utilities.formatDate(d, 'Europe/Moscow', "yyyy-MM-dd'T'HH:mm"); }
