/* «Фабрика — бот MAX» — MaxCoreChannel.gs (05.11.2026): комментарии под постами канала (перенос mx_as_comment, mx_kind, mx_pick, mx_comment, mx_reply_comment,
   mx_comment_mail из hook.php). Автоответ по типу (вопрос, цена, жалоба, благодарность, прочее) — фразы из settings.phrases, не та же, что в прошлый раз;
   на ссылки и грубость не отвечает; одному человеку под одним постом — не чаще раза в 30 минут. Вопрос / цена / жалоба → письмо маркетологам
   (MailApp от 1c@, replyTo itm@, копия itm@ всегда; адресаты — только @fabrikant.su; лимиты: адресатов в сутки — settings.mail_day_max,
   от одного автора — MX_MAIL_PER_SENDER писем в сутки; место в лимите занимается до отправки и возвращается, если письмо не ушло).
   Канал, впервые увиденный после 30.10 (groups: appr=false), молчит, пока его не включат (op group). */

/** Комментарий под постом: {chat, post, mid, sender, text, ts, url, api} | null. Три вида событий: тип с «comment», ответ в канале, сообщение в чате обсуждения. */
function mx_asComment(u) {
  var type = String(u.update_type || ''), m = u.message || null, chats = (mx_set('comment_chats') || []).map(String);
  if (/comment/i.test(type)) {
    var c = u.comment || m; if (!c || typeof c !== 'object' || /removed|edited/i.test(type)) return null;
    var cb = c.body || {}, post = String(u.post_id || c.post_id || ((u.post || {}).body || {}).mid || ((c.link || {}).message || {}).mid || '');
    return { chat: String(u.chat_id || (c.recipient || {}).chat_id || ''), post: post, mid: String(cb.mid || c.comment_id || ''), sender: c.sender || u.user || {},
             text: String(cb.text || c.text || '').trim(), ts: Number(c.timestamp || u.timestamp || 0), url: String(c.url || ''), api: 'comments' };
  }
  if (type !== 'message_created' || !m) return null;
  var rc = m.recipient || {}, ct = String(rc.chat_type || ''), cid = String(rc.chat_id || ''), b = m.body || {};
  var inDisc = chats.indexOf(cid) >= 0, isReplyInChannel = ct === 'channel' && ((m.link || {}).type === 'reply' || b.post_id !== undefined);
  if (!inDisc && !isReplyInChannel) return null;
  var s = m.sender || {}; if (s.is_bot) return null;
  return { chat: cid, post: String(b.post_id || ((m.link || {}).message || {}).mid || ''), mid: String(b.mid || ''), sender: s, text: mx_text(m), ts: Number(m.timestamp || 0), url: String(m.url || ''), api: 'messages' };
}
/** Тип комментария: link | bad | complaint | price | question | praise | general. */
function mx_kind(t) {
  var l = String(t || '').toLowerCase();
  if (/(https?:\/\/|www\.|t\.me\/|max\.ru\/|\b[a-z0-9-]{2,}\.(ru|com|net|org|su|рф|io|me|ly|uz|kz|by)\b)/i.test(l)) return 'link';
  if (/(^|[^а-яё])(х[уy][йеёяию]|п[иi]зд|[её]б[аеиоуы]|бл[яе][дт]|сук[аи]|муд[аио]к|пид[оа]р|гандон|шлюх|залуп|дроч)/.test(l)) return 'bad';
  if (/(брак|сломал|слома|не работает|развалил|отвалил|скрип|жалоб|ужас|кошмар|отвратит|разочаров|недовол|обман|верн(ите|уть) деньги|возврат|не привезл|не доставил|задерж|опозда|хамств|(^|[^е])плохо|некачеств)/.test(l)) return 'complaint';
  if (/(цен[аыуе]|стоим|сколько сто|почём|почем|прайс|купить|заказ|наличи|в наличии|доставк|скидк|оптом|опт\b|счёт|счет на|кп\b|коммерческ)/.test(l)) return 'price';
  if (l.indexOf('?') >= 0 || /^(как|где|когда|почему|зачем|можно ли|есть ли|подскажите|скажите|а если|какой|какая|какие|сколько)/.test(l)) return 'question';
  if (/(спасиб|благодар|класс|отличн|супер|красив|нравит|молодц|круто|лучш|шикарн|удобн|👍|❤|🔥|👏|😍)/.test(l)) return 'praise';
  return 'general';
}
/** Фраза по типу — не та же, что в прошлый раз (индекс последней — settings 'phr_<kind>'). */
function mx_pick(kind) {
  var all = mx_set('phrases') || {}, L = (all[kind] || []).filter(function (x) { return String(x || '').trim(); });
  if (!L.length) L = (mx_defaults().phrases[kind] || ['Спасибо за ваш комментарий!']);
  var n = L.length, last = Number(mx_set('phr_' + kind)); if (isNaN(last)) last = -1;
  var i = n > 1 ? ((last + 1 + Math.floor(Math.random() * (n - 1))) % n) : 0;
  if (n > 1 && i === last) i = (i + 1) % n;
  try { mx_setPut('phr_' + kind, String(i)); } catch (x) {}
  return L[i] || L[0];
}
function mx_comment(c) {
  var set_chats = (mx_set('comment_chats') || []).map(String);
  if (c.chat && set_chats.indexOf(c.chat) < 0) { var g = mx_groupGet(c.chat); if (g && !g.appr) { mx_log('cmt', 'канал ' + c.chat + ' выключен — без ответа'); return; } }
  var owner = mx_ownerUid(), uid = Number((c.sender || {}).user_id || 0);
  if (uid && uid === owner) return;                                                       // комментарии владельца — без ответа
  if ((mx_set('staff_ids') || []).map(String).indexOf(String(uid)) >= 0) return;
  var kind = mx_kind(c.text), reply = '', note = '';
  if (kind === 'link' || kind === 'bad') note = kind === 'link' ? 'ссылка — без ответа' : 'грубость — без ответа';
  else if (!c.text && kind === 'general') note = 'без текста — без ответа';
  else if (!mx_cmtOnce(uid, c.post)) note = 'уже отвечали этому человеку под этим постом';
  else { reply = mx_pick(kind); if (!mx_replyComment(c, reply)) { note = 'ответ не отправлен (см. журнал)'; reply = ''; } }
  mx_log('cmt', 'комментарий ' + kind + ' ' + c.chat + '/' + c.post + (note ? ': ' + note : ': ответ отправлен'));
  if (reply && (mx_set('mail_types') || []).indexOf(kind) >= 0) mx_commentMail(c, kind, reply, note);   // H3: письмо — только когда бот действительно ответил
}
/** Одному человеку под одним постом — не чаще раза в 30 минут (лист mx_cmt_seen, под замком). */
function mx_cmtOnce(uid, post) {
  if (!uid) return true;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return false;
  try {
    var k = uid + ':' + post, r = mx_findRow('mx_cmt_seen', k, 1), now = Date.now();
    if (r && r.vals[1] instanceof Date && now - r.vals[1].getTime() < 1800e3) return false;
    if (r) mx_setObj('mx_cmt_seen', r.row, { t: new Date() }); else { mx_appendObj('mx_cmt_seen', { k: k, t: new Date() }); var sh = mx_sheet('mx_cmt_seen'); if (sh.getLastRow() > 2000) sh.deleteRows(2, 500); }
    return true;
  } finally { lock.releaseLock(); }
}
function mx_replyComment(c, text) {
  var body = { text: String(text).slice(0, 3990) }; if (c.mid) body.link = { type: 'reply', mid: c.mid };
  if (c.api === 'comments' && c.post) {                                                   // ответ в ветке комментариев поста
    var r = api_('POST', '/messages/' + encodeURIComponent(c.post) + '/comments', null, body);
    if (ok_(r[0])) return true;
    mx_log('cmt', 'ответ в комментарии ' + r[0]);
  }
  if (!c.chat) return false;
  var r2 = api_('POST', '/messages', { chat_id: c.chat }, body);
  if (!ok_(r2[0])) mx_log('cmt', 'ответ в чате ' + r2[0]);
  return ok_(r2[0]);
}
/** Письмо маркетологам о комментарии (или личном сообщении боту). Лимиты — лист mx_counters. */
function mx_commentMail(c, kind, reply, note) {
  var names = { question: 'вопрос', price: 'цена / заказ', complaint: 'жалоба', praise: 'благодарность', general: 'комментарий', link: 'ссылка', bad: 'грубость' };
  var to = mx_emails([].concat(mx_set('marketing') || [], mx_set('head') || [])), cc = mx_emails(mx_set('cc') || []);
  if (!to.length) return false;
  var rc = mx_rcptCount(to, cc), day = mx_dayKey(), max = Number(mx_set('mail_day_max')) || 40;
  var uid = Number((c.sender || {}).user_id || 0), sk = uid ? 'u' + uid : 'n' + sha256hex_(mx_name(c.sender)).slice(0, 12);
  if (!mx_count('mail:day:' + day, max, rc)) { mx_log('mail', 'письмо не отправлено: лимит дня (' + max + ' адресатов)'); return false; }
  if (!mx_count('mail:' + sk + ':' + day, MX_MAIL_PER_SENDER)) { mx_count('mail:day:' + day, 0, -rc); mx_log('mail', 'письмо не отправлено: от этого автора сегодня уже ' + MX_MAIL_PER_SENDER + ' письма'); return false; }
  var title = c.chat ? mx_groupTitle(c.chat) : 'канал';
  var html = '<p>Комментарий в MAX — <b>' + h_(names[kind] || kind) + '</b></p>' +
    '<p><b>Канал:</b> ' + h_(title) + '<br><b>Автор:</b> ' + h_(mx_name(c.sender)) + '<br><b>Время:</b> ' + mx_tsText(c.ts) + '</p>' +
    '<blockquote style="border-left:3px solid #ff6b00;margin:0;padding:4px 10px">' + h_(String(c.text || '').slice(0, 3000)).replace(/\n/g, '<br>') + '</blockquote>' +
    (reply ? '<p><b>Бот ответил:</b> ' + h_(reply) + '</p>' : '<p><b>Бот не ответил:</b> ' + h_(note) + '</p>') +
    (c.url ? '<p><a href="' + h_(c.url) + '">Открыть в MAX</a></p>' : '') +
    '<p>Пожалуйста, ответьте автору по существу в MAX' + (kind === 'complaint' ? ' и сообщите, как решили вопрос' : '') + '.</p>' +
    '<p style="color:#888;font-size:12px">Письмо отправлено автоматически ботом «Фабрикант» в MAX (Google 1c@).</p>';
  var ok = mx_mail(to, cc, 'MAX: ' + (names[kind] || kind) + ' в комментариях — ' + String(c.text || '').replace(/\s+/g, ' ').slice(0, 60), html);
  if (!ok) { mx_count('mail:day:' + day, 0, -rc); mx_count('mail:' + sk + ':' + day, 0, -1); }   // не ушло — место в лимите возвращаем
  return ok;
}
/** Только адреса @fabrikant.su, без повторов, в нижнем регистре. */
function mx_emails(a) {
  var seen = {}, out = [];
  (Array.isArray(a) ? a : String(a || '').split(',')).forEach(function (e) { e = String(e || '').trim().toLowerCase(); if (/^[a-z0-9._%+-]+@fabrikant\.su$/.test(e) && !seen[e]) { seen[e] = 1; out.push(e); } });
  return out;
}
function mx_rcptCount(to, cc) { var a = { 'user5@example.org': 1 }; to.concat(cc).forEach(function (e) { a[e] = 1; }); return Object.keys(a).length; }
/** Письмо от 1c@ (MailApp): replyTo itm@, itm@ всегда в копии (Р3); квота проверяется; ошибка — в журнал, false. */
function mx_mail(to, cc, subject, html) {
  to = mx_emails(to); cc = mx_emails(cc).filter(function (x) { return to.indexOf(x) < 0; });
  if (to.indexOf('user5@example.org') < 0 && cc.indexOf('user5@example.org') < 0) cc.push('user5@example.org');
  if (!to.length) return false;
  var need = to.length + cc.length, q = 100;
  try { q = MailApp.getRemainingDailyQuota(); } catch (x) {}
  if (q < need) { mx_log('mail', 'квота писем Google: осталось ' + q + ', нужно ' + need); return false; }
  try {
    MailApp.sendEmail({ to: to.join(','), cc: cc.join(','), replyTo: 'user5@example.org', name: 'Бот «Фабрикант» (MAX)', subject: String(subject).slice(0, 180), htmlBody: String(html).slice(0, 20000) });
    mx_log('mail', 'письмо: ' + to.length + ' адресатов, тема «' + String(subject).slice(0, 40) + '»'); return true;
  } catch (x) { mx_log('err', 'письмо не ушло: ' + mx_errText(x)); return false; }
}
