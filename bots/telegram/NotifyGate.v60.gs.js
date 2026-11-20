/** 18.11.2026, Т. В.: «Сообщения в бот мне, Сотрудник90, Сотрудник3 — не чаще раза в час, идеально 3 раза в день: утренняя сводка в 10:30,
 *  когда все отчёты соберутся; в 15:00 — если что-то есть; в 19:00 — когда сводки закрыты и остались вопросы дня. Не слать по каждому делу.
 *  О почте в бот не присылать. О сообщении в MAX — только если я не ответил больше получаса: „сообщение в MAX ждёт вашего ответа“».
 *  Ворота стоят в tgRaw_ (всё, что уходит в Telegram: tg_, tgMsg_, uaSend_, op tgcall из бота MAX, зеркало Сотрудник90):
 *   — ответ человеку на его же команду (идёт обработка его обновления — GATE_IN) и правка уже отправленного — сразу;
 *   — обращение к владельцу в группе MAX («💬 MAX …») — ждёт 30 мин, потом одно сообщение «ждёт вашего ответа»;
 *   — всё остальное владельцу и админам — в очередь gate_q, уходит пачкой в 10:30, 15:00, 19:00 МСК (poll → gateTick_).
 *  Выключатель: свойство gate_off = 1 (всё сразу, как раньше). Ничего не теряется: очередь — b2 (свойства частями). */
var GATE_IN = null, GATE_BYPASS = false, GATE_CHATS = null;
var GATE_SLOTS = [[10, 30, 'Утро'], [15, 0, 'День'], [19, 0, 'Вечер']];
var GATE_SEND = { sendMessage: 1, sendPhoto: 1, sendDocument: 1, sendMediaGroup: 1, copyMessage: 1, forwardMessage: 1 };
var GATE_MAX_WAIT = 30 * 60000, GATE_Q_BYTES = 60000;

function gateChats_() {
  if (GATE_CHATS) return GATE_CHATS;
  var out = {};
  try { uaOwnerChats_().forEach(function (c) { out[String(c)] = 1; }); } catch (e) { }
  try { var U = tgUsers_(); Object.keys(U).forEach(function (k) { if (U[k] && U[k].role === 'admin' && U[k].chat) out[String(U[k].chat)] = 1; }); } catch (e) { }
  try { if (typeof mir_tgChat_ === 'function' && mir_tgChat_()) out[String(mir_tgChat_())] = 1; } catch (e) { }
  GATE_CHATS = out; return out;
}

/** true — сообщение задержано (в очередь), отправлять сейчас не нужно. */
function gateHold_(method, p) {
  if (GATE_BYPASS || !GATE_SEND[method] || !p || p.chat_id === undefined || p.chat_id === null) return false;
  if (p._now) { delete p._now; return false; }
  if (props().getProperty('gate_off') === '1') return false;
  var ch = String(p.chat_id);
  if (!gateChats_()[ch]) return false;
  if (GATE_IN !== null && String(GATE_IN) === ch) return false;                 // ответ на его же команду / кнопку
  var txt = String(p.text || p.caption || '');
  if (/сводк/i.test(txt.replace(/<[^>]+>/g, '').slice(0, 120)) && gateInSlot_(90)) return false;   // сама сводка в своё окно (10:30, 15:00, 19:00 + 90 мин) — сразу
  var item = { t: Date.now(), m: method, p: p };
  if (/^💬\s*<b>MAX/.test(txt)) item.due = Date.now() + GATE_MAX_WAIT;          // обращение к нему в группе MAX — через 30 мин
  return gatePush_(item);
}

function gateLock_(fn) {
  var lk = LockService.getScriptLock(), had = lk.hasLock();
  if (!had && !lk.tryLock(8000)) return null;
  try { return fn(); } finally { if (!had) lk.releaseLock(); }
}

function gatePush_(item) {
  var r = gateLock_(function () {
    var q = b2Get_('gate_q', []); if (!Array.isArray(q)) q = [];
    q.push(item);
    b2Set_('gate_q', keepBytes_(q, GATE_Q_BYTES));
    return true;
  });
  return r === true;                                                             // замок не взят — не теряем: отправится сразу
}

function gateInSlot_(win) {
  var s = gateMsk_(Date.now()), hm = Number(s.slice(9, 11)) * 60 + Number(s.slice(12, 14));
  return GATE_SLOTS.some(function (sl) { var at = sl[0] * 60 + sl[1]; return hm >= at && hm < at + win; });
}

function gateMsk_(t) { return Utilities.formatDate(new Date(t || Date.now()), 'Europe/Moscow', 'yyyyMMdd HH:mm'); }

/** Каждый запуск poll (10 мин): обращения MAX старше 30 мин и пачки по расписанию. */
function gateTick_() {
  if (props().getProperty('gate_off') === '1') { gateFlush_(null, 'без ворот'); return; }
  var now = Date.now(), s = gateMsk_(now), day = s.slice(0, 8), hm = Number(s.slice(9, 11)) * 60 + Number(s.slice(12, 14));
  var due = gateLock_(function () {
    var q = b2Get_('gate_q', []) || [], go = [], keep = [];
    q.forEach(function (x) { (x.due && x.due <= now ? go : keep).push(x); });
    if (go.length) b2Set_('gate_q', keepBytes_(keep, GATE_Q_BYTES));
    return go;
  }) || [];
  due.forEach(function (x) {
    var p = x.p; p.text = '⏰ <b>В MAX ждёт вашего ответа</b> (больше 30 мин)\n' + String(p.text || '');
    gateSend_(x.m, p);
  });
  var last = props().getProperty('gate_last') || '';
  for (var i = GATE_SLOTS.length - 1; i >= 0; i--) {
    var sl = GATE_SLOTS[i], at = sl[0] * 60 + sl[1], key = day + '-' + at;
    if (hm >= at) { if (last < key) { props().setProperty('gate_last', key); gateFlush_(sl[2] + ' ' + ('0' + sl[0]).slice(-2) + ':' + ('0' + sl[1]).slice(-2)); } break; }
  }
}

function gateSend_(m, p) {
  GATE_BYPASS = true;
  try { return tgRaw_(m, p); } catch (e) { console.log('gate send: ' + e); return null; } finally { GATE_BYPASS = false; }
}

/** Всё накопленное (кроме обращений MAX, у которых не вышли 30 мин) — каждому одним сообщением; с кнопками и файлы — по отдельности. */
function gateFlush_(label) {
  var now = Date.now();
  var go = gateLock_(function () {
    var q = b2Get_('gate_q', []) || [], g = [], keep = [];
    q.forEach(function (x) { (x.due && x.due > now ? keep : g).push(x); });
    b2Set_('gate_q', keepBytes_(keep, GATE_Q_BYTES));
    return g;
  }) || [];
  if (!go.length) return 0;
  var by = {};
  go.forEach(function (x) { var c = String(x.p.chat_id); (by[c] = by[c] || []).push(x); });
  var n = 0;
  Object.keys(by).forEach(function (c) {
    var plain = [], other = [];
    by[c].forEach(function (x) { (x.m === 'sendMessage' && !x.p.reply_markup ? plain : other).push(x); });
    if (plain.length) {
      var head = '🗂 <b>' + (label || 'Сообщения') + '</b> · ' + plain.length + ' ' + (plain.length === 1 ? 'сообщение' : plain.length < 5 ? 'сообщения' : 'сообщений');
      var parts = [], cur = head;
      plain.forEach(function (x) {
        var blk = '<i>' + gateMsk_(x.t).slice(9) + '</i> ' + String(x.p.text || '');
        if ((cur + '\n\n' + blk).length > 3900) { parts.push(cur); cur = blk.slice(0, 3900); } else cur += '\n\n' + blk;
      });
      parts.push(cur);
      parts.forEach(function (t) { var r = gateSend_('sendMessage', { chat_id: Number(c) || c, text: t, parse_mode: 'HTML', disable_web_page_preview: true }); if (r && r.ok) n++; });
    }
    other.forEach(function (x) { var r = gateSend_(x.m, x.p); if (r && r.ok) n++; });
  });
  try { log_('ворота', (label || 'сброс') + ': ' + go.length + ' → ' + n + ' сообщ.'); } catch (e) { }
  return n;
}

/** Из редактора: что ждёт в очереди (без отправки). */
function gateShow() {
  var q = b2Get_('gate_q', []) || [];
  console.log(q.length + ' в очереди; последний сброс ' + (props().getProperty('gate_last') || '—'));
  q.forEach(function (x) { console.log(gateMsk_(x.t) + ' → ' + x.p.chat_id + (x.due ? ' (MAX, в ' + gateMsk_(x.due) + ')' : '') + ': ' + String(x.p.text || x.m).slice(0, 80)); });
}
