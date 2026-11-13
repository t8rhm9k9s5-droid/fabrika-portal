// ClaudeMail.gs — 12.11.2026, Т. В. Сотрудник1: «отключим аккаунт user1@example.org от коннектора Gmail, я подключу свой личный Gmail».
// Почта 1c@ для Claude и облачных заданий — через этот скрипт (он работает от 1c@ и уже сам разбирает этот ящик), без коннекторов.
// Доступ — только подпись K_CMD с префиксом 'cm' ({t, d, s}, как post.php; окно 10 минут, одна подпись — один раз).
//   mailsearch {q, max?}                         → {threads: [{id, n, last, subject, from, snippet}]}
//   mailget    {thread}                          → {messages: [{id, date, from, to, cc, subject, text, att: [{i, name, size, type}]}]}
//   mailatt    {msg, i}                          → {name, type, b64}
//   mailsend   {to, cc?, subject, text?, html?, att?: [{name, type, b64}], draft?} → {ok, draft?}
//   mailreply  {thread, text?, html?, cc?, all?, att?, draft?}               → ответ на последнее письмо треда
// Адресаты — только @fabrikant.su, @techfabrikant.ru и адреса из свойства CM_EXTRA (через запятую). Отправка — от имени itm@ (псевдоним),
// если он настроен. Не больше CM_DAY_LIMIT писем в сутки. В журнал g4_log — только тема и число адресатов, без текста.
var CM_DAY_LIMIT = 80, CM_MAX_ATT = 20 * 1024 * 1024;
var CM_EXTRA_DEF = ['user81@example.org'];   // Т. В. 11.11: письма Сотрудник16 — всегда на оба адреса (rkv@ и личный)

function cm_post_(q) {
  var sg = g4_sigCheck_(q, ['cm']);
  if (!sg || !sg.ok || sg.how !== 'sig' || sg.prefix !== 'cm') return { ok: false, error: 'нет доступа' };
  var d = sg.d || {};
  try {
    if (q.op === 'mailsearch') {
      var th = GmailApp.search(String(d.q || ''), 0, Math.min(Math.max(Number(d.max) || 20, 1), 50));
      return { ok: true, threads: th.map(function (t) {
        var m = t.getMessages(), l = m[m.length - 1];
        return { id: t.getId(), n: t.getMessageCount(), last: l.getDate().toISOString(), subject: t.getFirstMessageSubject(), from: l.getFrom(), snippet: String(l.getPlainBody() || '').replace(/\s+/g, ' ').slice(0, 300) };
      }) };
    }
    if (q.op === 'mailget') {
      var t1 = GmailApp.getThreadById(String(d.thread || '')); if (!t1) return { ok: false, error: 'нет треда' };
      return { ok: true, id: t1.getId(), subject: t1.getFirstMessageSubject(), messages: t1.getMessages().map(function (m) {
        return { id: m.getId(), date: m.getDate().toISOString(), from: m.getFrom(), to: m.getTo(), cc: m.getCc(), subject: m.getSubject(),
          text: String(m.getPlainBody() || '').slice(0, 20000),
          att: m.getAttachments({ includeInlineImages: false }).map(function (a, i) { return { i: i, name: a.getName(), size: a.getSize(), type: a.getContentType() }; }) };
      }) };
    }
    if (q.op === 'mailatt') {
      var m2 = GmailApp.getMessageById(String(d.msg || '')); if (!m2) return { ok: false, error: 'нет письма' };
      var a2 = m2.getAttachments({ includeInlineImages: false })[Number(d.i) || 0]; if (!a2) return { ok: false, error: 'нет вложения' };
      if (a2.getSize() > CM_MAX_ATT) return { ok: false, error: 'вложение больше 20 МБ' };
      return { ok: true, name: a2.getName(), type: a2.getContentType(), b64: Utilities.base64Encode(a2.getBytes()) };
    }
    if (q.op === 'mailsend' || q.op === 'mailreply') return cm_send_(q.op, d);
  } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 300) }; }
  return { ok: false, error: 'неизвестная команда' };
}

function cm_addrOk_(list) {
  var extra = (String(props().getProperty('CM_EXTRA') || '') + ',' + CM_EXTRA_DEF.join(',')).toLowerCase().split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  var bad = [];
  String(list || '').split(',').map(function (x) { var m = x.match(/<([^>]+)>/); return (m ? m[1] : x).trim().toLowerCase(); }).filter(Boolean).forEach(function (a) {
    if (!/^[a-z0-9._%+-]+@(fabrikant\.su|techfabrikant\.ru)$/.test(a) && extra.indexOf(a) < 0) bad.push(a);
  });
  return bad;
}

function cm_send_(op, d) {
  var p = props(), day = Utilities.formatDate(new Date(), 'Europe/Moscow', 'yyyy-MM-dd'), cnt = pj_(p.getProperty('cm_day'), null) || {};
  if (cnt.day !== day) cnt = { day: day, n: 0 };
  if (!d.draft && cnt.n >= CM_DAY_LIMIT) return { ok: false, error: 'лимит писем на сутки (' + CM_DAY_LIMIT + ')' };
  var bad = cm_addrOk_([d.to, d.cc].filter(Boolean).join(','));
  if (bad.length) return { ok: false, error: 'адрес вне разрешённых: ' + bad.join(', ') };
  var opt = {}, atts = [];
  (d.att || []).forEach(function (a) { atts.push(Utilities.newBlob(Utilities.base64Decode(String(a.b64 || '')), String(a.type || 'application/octet-stream'), String(a.name || 'файл'))); });
  if (atts.length) opt.attachments = atts;
  if (d.cc) opt.cc = String(d.cc);
  if (d.html) opt.htmlBody = String(d.html);
  try { if (GmailApp.getAliases().indexOf('user5@example.org') >= 0) { opt.from = 'user5@example.org'; opt.name = 'Т. В. Сотрудник1'; } } catch (e) { /* без псевдонима — от 1c@ */ }
  var text = String(d.text || (d.html ? String(d.html).replace(/<[^>]+>/g, ' ') : '')), res = { ok: true };
  if (op === 'mailsend') {
    if (!d.to || !d.subject) return { ok: false, error: 'нет адресата или темы' };
    if (d.draft) { var df = GmailApp.createDraft(String(d.to), String(d.subject), text, opt); res.draft = df.getId(); }
    else GmailApp.sendEmail(String(d.to), String(d.subject), text, opt);
  } else {
    var t = GmailApp.getThreadById(String(d.thread || '')); if (!t) return { ok: false, error: 'нет треда' };
    var ms = t.getMessages(), last = ms[ms.length - 1];
    var bad2 = cm_addrOk_(d.all ? [last.getFrom(), last.getTo(), last.getCc()].join(',') : last.getFrom());
    if (bad2.length) return { ok: false, error: 'адрес вне разрешённых: ' + bad2.join(', ') };
    if (d.draft) { var dr = d.all ? last.createDraftReplyAll(text, opt) : last.createDraftReply(text, opt); res.draft = dr.getId(); }
    else if (d.all) last.replyAll(text, opt); else last.reply(text, opt);
  }
  if (!d.draft) { cnt.n++; p.setProperty('cm_day', JSON.stringify(cnt)); }
  try { g4_log_('cm', (d.draft ? 'черновик ' : '') + op + ' · ' + String(d.subject || (op === 'mailreply' ? 'ответ в тред' : '')).slice(0, 120) + ' · адресатов ' + String([d.to, d.cc].filter(Boolean).join(',')).split(',').length); } catch (e) { /* журнал не обязателен */ }
  return res;
}
