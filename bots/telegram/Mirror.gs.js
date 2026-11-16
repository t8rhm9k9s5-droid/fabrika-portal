/** «Фабрика» — копия всего, что бот шлёт владельцу, — Сотрудник28 А. В. (16.11.2026, Т. В.: «Продублируй Сотрудник80 всё то же самое,
 *  что и мне»; «проверь, чтобы в тг всё приходило ей»; «мини-приложение у неё тоже должно работать в тг»).
 *  Где: tgMsg_ (все текстовые сообщения бота) → mir_copy_. Владельцу ушло (Telegram) → копия ей:
 *   • в Telegram — если она подключила @fabrika_t14_bot (запись в tgUsers_ по имени или свойство mir_tg);
 *   • лично в бот MAX (uid MIR_MAX_UID) — всегда, пока свойство mir_max не 'off'.
 *  Повторы: одно и то же сообщение ей в Telegram за 10 минут — один раз (прямая рассылка админам + копия); в MAX — id по часу и тексту.
 *  Фото и файлы не копируются (только текст). Кнопки не копируются: решения — за Т. В. */
var MIR_MAX_UID = 139530118, MIR_NAME_RX = /миров|анжелик|angelik|mirova/i, MIR_BUSY = false, MIR_OWN = null;

function mir_ownChat_() {
  if (MIR_OWN !== null) return MIR_OWN;
  var U = tgUsers_(); MIR_OWN = U[ITM_TO] && U[ITM_TO].chat ? Number(U[ITM_TO].chat) : Number(ITM_TO);
  return MIR_OWN;
}
/** Её чат в Telegram: свойство mir_tg (точно) или человек Telegram в боте с её именем. null — бот в Telegram она ещё не подключила. */
function mir_tgChat_() {
  var x = props().getProperty('mir_tg'); if (x && /^\d{3,15}$/.test(x)) return Number(x);
  var U = tgUsers_();
  for (var k in U) { var u = U[k]; if (Number(k) < MAX_BASE && u && u.chat && MIR_NAME_RX.test(String(u.name || '')) && u.st !== 'off' && !tgOwner_(k)) return Number(u.chat); }
  return null;
}
function mir_text_(text) {
  var t = String(text || '');
  if (typeof dn_maxText_ === 'function') t = dn_maxText_(t);            // «ждут вашего решения» → «ждут решения Т. В.»
  return t;
}
function mir_hash_(t) { return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(t), Utilities.Charset.UTF_8)).replace(/[^A-Za-z0-9]/g, '').slice(0, 12); }
/** Повторы ей в Telegram: прямое сообщение ей (например, отчёт всем админам) и копия «как у Т. В.» — одно и то же текстом.
 *  Прямое: если копия этого текста за 10 мин уже была — не шлём; иначе отмечаем 'mirdir_'. Копия: если прямое было — не шлём; иначе 'mircp_'. */
function mir_tgDup_(text) {           // из tgMsg_ — для сообщений ей (не копий)
  if (MIR_BUSY) return false;
  var c = CacheService.getScriptCache(), h = mir_hash_(text);
  if (c.get('mircp_' + h)) return true; c.put('mirdir_' + h, '1', 600); return false;
}
function mir_tgCopyDup_(t) {          // для копии
  var c = CacheService.getScriptCache(), h = mir_hash_(t);
  if (c.get('mirdir_' + h)) return true; c.put('mircp_' + h, '1', 600); return false;
}
/** Из tgMsg_: после успешной отправки. */
function mir_copy_(chat, text) {
  if (MIR_BUSY || !text) return;
  if (Number(chat) !== mir_ownChat_()) return;
  if (props().getProperty('mir_off') === '1') return;
  MIR_BUSY = true;
  try {
    var t = mir_text_(text), tg = mir_tgChat_();
    if (tg && tg !== mir_ownChat_() && !mir_tgCopyDup_(t)) { try { tgMsg_(tg, t); } catch (e1) { console.log('mir tg: ' + e1); } }
    if (props().getProperty('mir_max') !== 'off') mir_max_(t);
  } finally { MIR_BUSY = false; }
}
function mir_max_(t) {
  var id = 'mir-' + b2Msk_(Date.now(), 'yyyyMMddHH') + '-' + mir_hash_(t), r = null;
  try { r = g4_maxCmd_({ op: 'dm', id: id, uid: MIR_MAX_UID, text: String(t).slice(0, 3900) }); } catch (e) { r = null; }
  var ok = !!(r && (r.ok || /уже отправлено/.test(String(r.error || ''))));
  if (!ok) { try { g4_log_('mir', 'копия в MAX не ушла: ' + String(r && (r.error || r.description) || 'нет ответа').slice(0, 120)); } catch (e2) { /* журнал */ } }
  return ok;
}
/** Для Claude (op claude, do 'mir'): состояние + по желанию утренний отчёт ей сейчас, права админа и кнопка «Портал» в Telegram. */
function mir_op_(x) {
  var U = tgUsers_(), tg = mir_tgChat_(), out = { tg: tg ? 'есть' : 'нет', max_uid: MIR_MAX_UID };
  var cand = Object.keys(U).filter(function (k) { return MIR_NAME_RX.test(String(U[k] && U[k].name || '')); })
    .map(function (k) { var u = U[k]; return (Number(k) >= MAX_BASE ? 'MAX ' : 'TG ') + String(u.name || '').slice(0, 40) + ' · ' + (u.role || '?') + (u.chat ? '' : ' · без чата'); });
  out.found = cand;
  var pend = pj_(props().getProperty('tg_pend'), {}) || {};
  try {                                                   // личный вход на портал (для мини-приложения «Портал» в Telegram): логин, роль, последний заход
    var um = users_().map; out.portal = Object.keys(um).filter(function (k) { var u = um[k] || {}; return MIR_NAME_RX.test(String(u.name || '')) || MIR_NAME_RX.test(String(u.login || '')); })
      .map(function (k) { var u = um[k]; return { login: String(u.login || '').slice(0, 30), role: u.role, st: u.st, last: u.last ? b2Msk_(u.last, 'dd.MM HH:mm') : null, push: !!u.push }; });
  } catch (ep) { out.portal = 'ошибка: ' + String(ep).slice(0, 80); }
  out.pend = Object.keys(pend).filter(function (k) { return MIR_NAME_RX.test(JSON.stringify(pend[k] || '')); }).length;
  if (x.admin && tg) {                                    // права администратора её записи в Telegram (Т. В. 12.11: «такой же абсолютный админ»)
    for (var k in U) if (Number(U[k].chat) === tg && Number(k) < MAX_BASE) { U[k].role = 'admin'; U[k].adm_t = Date.now(); U[k].adm_by = 'владелец (через Claude)'; }
    tgSaveUsers_(U); out.admin = 'да';
  }
  if (x.menubtn && tg) { var rr = tg_('setChatMenuButton', { chat_id: tg, menu_button: { type: 'web_app', text: 'Портал', web_app: { url: 'https://techfabrikant.ru/' } } }); out.menubtn = !!(rr && rr.ok); }
  if (x.morning) {
    var txt = mir_text_('<i>Утренний отчёт — копия (данные на ' + b2Msk_(Date.now(), 'HH:mm') + ')</i>\n' + b2Morning_());
    out.morning_max = mir_max_(txt);
    if (tg) { var r2 = null; MIR_BUSY = true; try { r2 = tgMsg_(tg, txt); } finally { MIR_BUSY = false; } out.morning_tg = !!(r2 && r2.ok); }
  }
  if (x.text) {                                           // разовое сообщение ей (только по слову Т. В.)
    var tt = String(x.text).slice(0, 3900); out.text_max = mir_max_(tt);
    if (tg) { var r3 = null; MIR_BUSY = true; try { r3 = tgMsg_(tg, tt); } finally { MIR_BUSY = false; } out.text_tg = !!(r3 && r3.ok); }
  }
  return out;
}
var MIR_TG = undefined;
function mir_isTg_(chat) { if (MIR_TG === undefined) MIR_TG = mir_tgChat_(); return !!MIR_TG && Number(chat) === MIR_TG; }
/** 16.11.2026, Т. В.: лично бот пишет только утверждённым (допуск Т. В. или А. В.) и состоящим в рабочих группах. Утверждённые MAX-люди
 *  (записи tgUsers_ с id ≥ MAX_BASE, не выключенные) → настройка dm_appr бота MAX (проверка — DmGate.gs там). Шлём только при изменении. */
function mir_syncAppr_(U, force) {
  U = U || tgUsers_();
  var ids = Object.keys(U).filter(function (k) { var u = U[k] || {}; return Number(k) >= MAX_BASE && u.st !== 'off' && u.st !== 'pending'; })
    .map(function (k) { return String(Number(k) - MAX_BASE); }).sort();
  var h = ids.join(','), p = props();
  if (!force && p.getProperty('dm_appr_h') === h) return 'same';
  var r = null; try { r = g4_maxCmd_({ op: 'settings', k: 'dm_appr', v: ids }); } catch (e) { r = null; }
  if (r && r.ok) { p.setProperty('dm_appr_h', h); return 'ok:' + ids.length; }
  return 'fail';
}
