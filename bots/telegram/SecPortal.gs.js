// REDACTED_B64_38 Портал: закрытые разделы «Структура» и «СИМ-карты» (11.11.2026)
// Т. В. 11.11.2026: «структура со всеми функциональными обязанностями коммерческого отдела … и там же раздел с сим-картами …
// должны быть доступны только мне и брату». Опрос: «Коммерческий отдел» в «Продажах» тоже закрыть до проверки.
// Как «Транспорт (ГЛОНАСС)»: данных в страницах портала нет. На сайте лежат k/<sha256('fabrika-sec:'+часть)[:24]>.bin, зашифрованные ключом
// владельца k_owner (build/gen_sec.py, обычный пакет сайта); страница присылает личный вход (op 'sec', tok, part), скрипт проверяет:
//   владелец — личный вход «owner» + привязка к его Telegram («Да, это я», gl_pin — та же, что у транспорта);
//   другие — только из списка sec_acl (кнопка владельца «Пустить» в Telegram; отдельный список, не тот, что у транспорта).
// Убрать доступ — /transport_dostup (там же, отдельной строкой «Структура»).
var SEC_PARTS = { ko: 'Коммерческий отдел: люди, функционал, зоны', org: 'Оргструктура компании', kos: 'Коммерческий отдел: функционал и блок-схема', sim: 'СИМ-карты МТС' };
var SEC_RATE = 30;
var SEC_FILE = { ko: 'REDACTED_HEX_3', org: 'REDACTED_HEX_4', kos: 'REDACTED_HEX_5', sim: 'REDACTED_HEX_6' };
/** k/<имя>.bin с сайта → объект (ключ владельца); кэш — только если влезает (cachePut_ < 100 КБ). */
function secBin_(part) {
  var c = CacheService.getScriptCache(), k = 'secb_' + part, s = c.get(k); if (s) { try { return JSON.parse(s); } catch (e) {} }
  var r = UrlFetchApp.fetch(SITE + 'k/' + SEC_FILE[part] + '.bin?nc=' + Date.now(), { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) return null;
  var txt = b2Open_(r.getContentText(), b2OwnerKey_()); cachePut_(c, k, txt, 300); return JSON.parse(txt);
}
function secPortal_(q) {
  var u = tokUser_(q.tok);
  if (u.id !== GL_OWNER_ID) { var ga = secAclGate_(u); if (ga) return ga; }
  var c = CacheService.getScriptCache(), rk = 'secr_' + u.id, n = Number(c.get(rk) || 0);
  if (n >= SEC_RATE) throw new Error('Слишком часто — подождите минуту.');
  c.put(rk, String(n + 1), 60);
  if (u.id === GL_OWNER_ID && (!u.tokh || props().getProperty('gl_pin') !== u.tokh)) return glAsk_(u);
  var part = String(q.part || '');
  if (!SEC_PARTS.hasOwnProperty(part)) return { ok: true, sec: true, parts: SEC_PARTS };
  var G = null, err = '';
  try { G = secBin_(part); } catch (e) { err = String(e && e.message || e).slice(0, 120); }
  if (!G) return { ok: true, sec: true, none: true, part: part, why: err ? 'Файл раздела не открылся: ' + err : 'Раздел ещё не выложен на хостинг.' };
  log_(u.login, 'закрытый раздел: ' + part);
  return { ok: true, sec: true, part: part, data: G };
}
/** Не владелец: null — доступ есть (вход в sec_acl с тем же токеном); иначе — запрос владельцу «Пустить / Нет». */
function secAclGate_(u) {
  var e = glAcl_('sec_acl').filter(function (x) { return x.id === u.id; })[0];
  if (e && u.tokh && e.tokh === u.tokh) return null;
  var c = CacheService.getScriptCache(), tk = 'secqu_' + u.id;
  if (c.get(tk)) return { ok: true, sec: true, access: false, req: 'again' };
  var chats = uaOwnerChats_();
  if (!chats.length) return { ok: true, sec: true, access: false, req: 'fail', why: 'Владелец сейчас недоступен в Telegram-боте — попробуйте позже.' };
  var rid = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  c.put('glq_' + rid, JSON.stringify({ k: 's', id: u.id, tokh: u.tokh, name: cleanName_(u.name, 60), login: cleanName_(u.login, 30) }), 21600);
  var t = '🔐 <b>' + h_(u.name) + '</b> (личный вход «' + h_(u.login) + '») просит доступ к закрытым разделам портала «Структура» и «СИМ-карты».' +
    (e ? '\n<i>Доступ у него был, но вход сменился (новый пароль или новая запись) — спрашиваю заново.</i>' : '') + '\nУбрать доступ потом — /transport_dostup.';
  var sent = glAskOwner_(chats, t, rid);
  if (sent) c.put(tk, rid, 21600);
  log_(u.login, 'структура: запрос доступа владельцу' + (sent ? '' : ' не отправлен'));
  return sent ? { ok: true, sec: true, access: false, req: 'sent' } : { ok: true, sec: true, access: false, req: 'fail', why: 'Не удалось отправить запрос владельцу — попробуйте через минуту.' };
}
/** Владелец нажал «Пустить» на запрос k 's' — вход человека в sec_acl. */
function secAccOk_(chat, R, c) {
  var u = users_().map[R.id];
  if (!u || u.st !== 'active' || !u.tokh || u.tokh !== R.tokh) return tgMsg_(chat, 'Вход этого человека уже сменился или отключён — пусть откроет раздел «Структура» и попросит ещё раз.');
  var a = glAcl_('sec_acl').filter(function (y) { return y.id !== R.id; });
  a.push({ id: R.id, tokh: R.tokh, name: cleanName_(u.name, 40), login: cleanName_(u.login, 24), t: Date.now(), by: 'владелец' });
  if (!glAclSave_('sec_acl', a)) return tgMsg_(chat, 'Список доступа переполнен — уберите кого-то: /transport_dostup');
  c.remove('secqu_' + R.id); log_('владелец', 'структура: открыл доступ на портале ' + u.login);
  return tgMsg_(chat, '✅ Доступ к закрытым разделам «Структура» и «СИМ-карты» открыт: <b>' + h_(u.name) + '</b> (вход «' + h_(u.login) + '»). Он увидит их, нажав «Проверить» на странице.\nУбрать — /transport_dostup');
}
