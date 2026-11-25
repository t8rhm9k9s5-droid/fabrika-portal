// Вход на портал «Фабрика» по MAX ID (25.11.2026). Решение Т. В. (опрос 25.11): «Подтверждаю я с телефона».
//   1. Страница входа: устройство создаёт пару ключей (ECDH P-256) и просит код — op mxreq {ridh, pub} → код из 6 цифр (живёт 30 минут).
//   2. Сотрудник пишет боту MAX «портал КОД». Бот сверяет его MAX ID (mx_dmAllowed: владелец, dm_allow, участники рабочих групп)
//      и подписанно передаёт сюда — op mxbot {code, uid, name} (подпись проекта MAX, как у tgcall). Сотрудник4 получает статус «проверен ботом».
//   3. Администратор в «Управлении» видит запрос (mxlist) и подтверждает: его телефон создаёт личный вход (useradd / userpw — как «Добавить человека»)
//      и шифрует логин с паролем на открытый ключ устройства (mxgive {code, box}). Сервер ни пароля, ни ключа сайта не видит и не хранит.
//   4. Устройство забирает коробку (mxget {code, rid}), открывает её своим закрытым ключом и входит обычным личным входом.
// Хранение: лист «mx» служебной таблицы людей, одна ячейка A2 — JSON-список живых запросов (не больше MX_MAX).
var MX_TTL = 30 * 60 * 1000, MX_MAX = 20;
function mxSheet_() { var ss = db_(), sh = ss.getSheetByName('mx'); if (!sh) { sh = ss.insertSheet('mx'); sh.getRange(1, 1).setValue('запросы входа по MAX ID (служебное, не править)'); } return sh; }
function mxLoad_() {
  var sh = mxSheet_(), L = [], now = Date.now();
  try { L = JSON.parse(String(sh.getRange(2, 1).getValue() || '[]')); } catch (e) { L = []; }
  if (!Array.isArray(L)) L = [];
  return { sh: sh, L: L.filter(function (r) { return r && typeof r === 'object' && now - (Number(r.t) || 0) < MX_TTL; }) };
}
function mxSave_(S) { S.sh.getRange(2, 1).setValue(JSON.stringify(S.L)); }
function mxFind_(S, code) { for (var i = 0; i < S.L.length; i++) if (S.L[i].code === code) return S.L[i]; return null; }
function mxPost_(op, q) {
  if (op === 'mxreq') return mxReq_(q);
  if (op === 'mxget') return mxGet_(q);
  var adm = tokUser_(q.tok, true);
  if (op === 'mxlist') return { ok: true, reqs: mxLoad_().L.filter(function (r) { return r.st === 'checked'; }).map(function (r) { return { code: r.code, name: r.name, uid: r.uid, t: r.t, pub: r.pub }; }) };
  if (op === 'mxgive') return mxGive_(adm, q);
  if (op === 'mxdeny') return withLock_(function () {
    var S = mxLoad_(), code = String(q.code || ''), r = mxFind_(S, code);
    if (r) { S.L = S.L.filter(function (x) { return x !== r; }); mxSave_(S); log_(adm.login, 'MAX ID: отклонил запрос входа ' + (r.name || '') + ' (MAX ID ' + (r.uid || '?') + ')'); }
    return { ok: true };
  });
  throw new Error('нет такой операции');
}
function mxReq_(q) {
  var ridh = String(q.ridh || ''), pub = String(q.pub || '');
  if (!/^[0-9a-f]{64}$/.test(ridh) || !B64_RE.test(pub) || pub.length < 80 || pub.length > 100) throw new Error('неверные данные');
  var c = CacheService.getScriptCache(), n = Number(c.get('mxrq') || 0);
  if (n >= 30) throw new Error('слишком много запросов — попробуйте через 10 минут');
  c.put('mxrq', String(n + 1), 600);
  return withLock_(function () {
    var S = mxLoad_(), code = '';
    if (S.L.length >= MX_MAX) throw new Error('слишком много неподтверждённых запросов — попробуйте позже');
    for (var i = 0; i < 60 && !code; i++) { var b = rnd_(4), x = String((((b[0] & 255) * 16777216 + (b[1] & 255) * 65536 + (b[2] & 255) * 256 + (b[3] & 255)) % 900000) + 100000); if (!mxFind_(S, x)) code = x; }
    if (!code) throw new Error('не получилось выдать код — попробуйте ещё раз');
    S.L.push({ code: code, ridh: ridh, pub: pub, t: Date.now(), st: 'new' }); mxSave_(S);
    return { ok: true, code: code, ttl: Math.floor(MX_TTL / 1000) };
  });
}
function mxGet_(q) {
  var code = String(q.code || ''), rid = String(q.rid || '');
  if (!/^\d{6}$/.test(code) || !/^[0-9a-f]{32,64}$/.test(rid)) throw new Error('неверные данные');
  var r = mxFind_(mxLoad_(), code);
  if (!r || r.ridh !== hex_(sha256_(utf8_(rid)))) return { ok: true, st: 'none' };
  if (r.st === 'given') return { ok: true, st: 'given', box: r.box };
  return { ok: true, st: r.st === 'checked' ? 'checked' : 'new', name: r.st === 'checked' ? r.name : '' };
}
/** Бот MAX: «портал КОД» от проверенного сотрудника. Подпись проекта MAX (как op tgcall). → {ok, st: 'sent' | 'nocode'}. */
function mxBot_(q) {
  var sg = g4_sigCheck_(q, ['mx', 'relay']);
  if (!sg.ok) return { ok: false, error: sg.error || 'нет доступа' };
  var d = sg.how === 'sig' ? sg.d : q, code = String(d.code || ''), uid = String(d.uid || ''), name = cleanName_(d.name, 80);
  if (!/^\d{6}$/.test(code) || !/^\d{1,17}$/.test(uid)) return { ok: true, st: 'nocode' };
  return withLock_(function () {
    var S = mxLoad_(), r = mxFind_(S, code);
    if (!r || r.st === 'given') return { ok: true, st: 'nocode' };
    r.st = 'checked'; r.uid = uid; r.name = name || ('MAX ID ' + uid); r.tc = Date.now(); mxSave_(S);
    log_('бот MAX', 'MAX ID: ' + r.name + ' (MAX ID ' + uid + ') просит вход на портал');
    return { ok: true, st: 'sent' };
  });
}
function mxGive_(adm, q) {
  var code = String(q.code || ''), box = String(q.box || ''), login = cleanName_(q.login, 40);
  if (!/^\d{6}$/.test(code) || !B64_RE.test(box) || box.length < 100 || box.length > 2000) throw new Error('неверные данные');
  return withLock_(function () {
    var S = mxLoad_(), r = mxFind_(S, code);
    if (!r || r.st !== 'checked') throw new Error('запрос не найден или устарел — попросите сотрудника запросить вход ещё раз');
    r.st = 'given'; r.box = box; r.by = adm.login; r.login = login; mxSave_(S);
    log_(adm.login, 'MAX ID: подтвердил вход ' + (r.name || '') + ' (MAX ID ' + r.uid + ', логин ' + login + ')');
    return { ok: true };
  });
}
