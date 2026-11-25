/* «Фабрика — бот MAX» (Google 1c@) — TimersMail.gs: почта 1c@ через GmailApp (шаг 3, ночь 05.11.2026).
   1) Письма-команды на 1c@ (перенос mail_cmd.py; Т. В. 04.11 ~18:50 — «Из бота команда моментально поступает сюда… Есть команда — работаем»):
      каждую минуту — письма от itm@ / mav@ (tm_settings → mail_cmd_from) с темами «Фабрика: команда/голос/промт/документ/заявка» (и любые с itm@,
      кроме пересланных) → проверка подлинности по верхнему Authentication-Results от mx.google.com (dmarc / dkim / spf = pass для домена отправителя)
      → cp_push({src:'mail', …}, true) общего модуля ClaudePush — ОДИН раз на письмо (лист tm_mail_log + ярлык «Фабрика — бот/Передано Claude»).
      Без CLAUDE_FIRE_* (cp_enabled() = false) или без модуля — ничего не делаем. Ящик — только чтение и ярлык; письма не удаляются.
      Квота Gmail (чтения): поиск только новее водяного знака времени — в пустую минуту один вызов GmailApp.search; sales@ — переписки
      перечитываются только с новыми письмами, полный перебор окна раз в день.
   2) Вопросы без ответа (перенос unans.py, задача №18 Т. В.): раз в 55 минут — обращения к Т. В. с вопросом в группах MAX без его ответа
      и письма ему (лично / в копии) по копиям в Gmail 1c@ без ответа с itm@ / owner@ → ua.bin, grp.bin («От ботов»).
   3) Контроль sales@ (перенос sales_ctl.py): запросы клиентов через sales@ по письмам в Gmail 1c@; 4 и 8 рабочих часов без ответа —
      напоминание (адресаты минус руководство), 08:50 — сводка владельцу. Что в Gmail 1c@ не пересылается — боту не видно (README).
   Тексты писем в файлах — без телефонов, почт, IP (tm_mask_). */

var TM_MAIL_LABEL = 'Фабрика — бот/Передано Claude';
var TM_ME2 = ['user5@example.org', 'user4@example.org'];
var TM_OWN_DOMAINS = ['fabrikant.su', 'fabrikant.pro', 'techfabrikant.ru'];
var TM_ROBOT_RE = /(^|[.@_-])(no-?reply|noreply|mailer-daemon|postmaster|notification|notify|robot|bot|daemon|support|news|info|sales|calendar|drive-shares|1c)([.@_-]|$)/i;
var TM_REPORT_SUBJ = /^\s*(?:(?:re|fw|fwd|отв|пересл)\s*:\s*)*(?:отч[её]т|выгрузк|остатки|реестр|план\b|справка|ведомость|сводка|1с|1c)/i;
var TM_FWD_SUBJ = /^\s*(?:(?:fw|fwd|пересл[а-яё]*|перес)\s*(?:\[\d+\])?\s*:)/i;
var TM_UA_OWNER = /(?<![А-Яа-яЁё])(Сотрудник2(а|у|ом|е)?(\s+Отчество1(а|у|ем|е)?)?|Т\.\s?В\.)(?![А-Яа-яЁё])|(?<![А-Яа-яЁёA-Za-z])ТВ(?![А-Яа-яЁёA-Za-z])/;
var TM_UA_ASK = /\?|(?<![а-яё])(прошу|просьба|просим|подскажите|подскажи|сообщите|согласуйте|согласовать|согласуете|направьте|предоставьте|пришлите|ответьте|уточните|нужно ли|можно ли|когда (будет|сможете|можно|планируете|ждать|ответите|дадите)|как быть|дайте|подтвердите|рассмотрите|ваше решение|ваше мнение|что делать|как поступить|разрешите|одобрите|утвердите|посмотрите)(?![а-яё])/i;
var TM_SUBJ_PFX = /^\s*((re|fw|fwd|отв|ответ|пересл|пересылка|ha)\s*(\[\d+\])?\s*:\s*)+/i;

// REDACTED_B64_9 общее: адреса, заголовки, тело
/** «Имя <адрес>» → адрес в нижнем регистре */
function tm_addr_(s) { var m = /<([^<>\s]+@[^<>\s]+)>/.exec(String(s || '')); var a = m ? m[1] : (String(s || '').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0]; return String(a).trim().toLowerCase(); }
function tm_addrs_(s) { var out = []; String(s || '').split(',').forEach(function (x) { var a = tm_addr_(x); if (a) out.push(a); }); return out; }
function tm_dom_(a) { a = String(a || ''); return a.indexOf('@') >= 0 ? a.split('@').pop().toLowerCase() : ''; }
function tm_ownDom_(a) { return TM_OWN_DOMAINS.indexOf(tm_dom_(a)) >= 0; }
/** заголовки письма из сырого MIME → [{name, value}] (строки-продолжения склеены) */
function tm_headers_(raw) {
  var head = String(raw || '').split(/\r?\n\r?\n/)[0], lines = head.split(/\r?\n/), out = [];
  lines.forEach(function (ln) {
    if (/^[ \t]/.test(ln) && out.length) { out[out.length - 1].value += ' ' + ln.trim(); return; }
    var i = ln.indexOf(':'); if (i > 0) out.push({ name: ln.slice(0, i).trim().toLowerCase(), value: ln.slice(i + 1).trim() });
  });
  return out;
}
/** подлинность отправителя по верхнему Authentication-Results, который поставил приёмный сервер Google → {ok, why}.
    F4: берётся ТОЛЬКО самый верхний заголовок (его добавляет приёмный сервер Google последним; нижние могли прийти внутри письма), и его authserv-id
    (первое слово до «;») должен быть ровно mx.google.com — не префикс (mx.google.com.evil и т. п. — отказ). */
function tm_authentic_(raw, frm) {
  var ars = tm_headers_(raw).filter(function (h) { return h.name === 'authentication-results'; }).map(function (h) { return h.value; });
  var ar = ars[0], sid = ar ? String(ar).split(';')[0].trim().split(/\s+/)[0].toLowerCase() : '';
  if (!ar || sid !== 'mx.google.com') return { ok: false, why: 'нет отметки Google о проверке' };
  var a = ar.replace(/\s+/g, ' ').toLowerCase(), d = tm_dom_(frm), m;
  m = /dmarc=(\w+)[^;]*?header\.from=([\w.-]+)/.exec(a);
  if (m && m[1] === 'pass' && m[2] === d) return { ok: true, why: 'dmarc=pass' };
  var rx = /dkim=(\w+)[^;]*?header\.(?:i|d)=@?([\w.-]+)/g;
  while ((m = rx.exec(a)) !== null) if (m[1] === 'pass' && (m[2] === d || m[2].slice(-(d.length + 1)) === '.' + d)) return { ok: true, why: 'dkim=pass' };
  m = /spf=(\w+)[^;]*?smtp\.mailfrom=(?:[^@\s;]*@)?([\w.-]+)/.exec(a);
  if (m && m[1] === 'pass' && m[2] === d) return { ok: true, why: 'spf=pass' };
  return { ok: false, why: 'проверка не пройдена' };
}
/** текст письма без цитат, подписи и пересланной части */
function tm_mailBody_(plain) {
  var out = [], lines = String(plain || '').replace(/\r/g, '').split('\n');
  for (var i = 0; i < lines.length; i++) {
    var s = lines[i].trim();
    if (s.charAt(0) === '>') continue;
    if (/^(--|—|__)\s*$/.test(s) || /^(с уважением|с наилучшими|best regards|regards|спасибо[,!.]?\s*$)/i.test(s)) break;
    if (/^(-{2,}\s*(original|исходное|пересылаемое)|(on|в)\s.+(wrote|писал|пишет)\s*:\s*$|\d{1,2}[.\s].+\d{4}.*(писал|пишет|wrote)|от:\s|from:\s|отправлено (с|из)|sent from)/i.test(s)) break;
    out.push(s);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
/** ярлык Gmail по полному имени; вложенный («Папка/Ярлык») — сначала родитель */
function tm_label_(name) {
  var l = GmailApp.getUserLabelByName(name); if (l) return l;
  var parts = String(name).split('/'), cur = '';
  for (var i = 0; i < parts.length; i++) { cur = cur ? cur + '/' + parts[i] : parts[i]; l = GmailApp.getUserLabelByName(cur) || GmailApp.createLabel(cur); }
  return l;
}
/** множество значений первого столбца листа (без заголовка) */
function tm_colSet_(name) {
  var sh = tm_sheet_(name), n = sh.getLastRow(), s = {}; if (n < 2) return s;
  sh.getRange(2, 1, n - 1, 1).getValues().forEach(function (r) { if (r[0] !== '') s[String(r[0])] = 1; });
  return s;
}

// REDACTED_B64_9 1) письма-команды → cp_push (минутный тик)
var TM_MAILCMD_FIRST_MS = 3600e3;                                        // первый запуск: письма не старше часа (старые разобрал робот хостинга — дубли Claude не нужны)
var TM_MAILCMD_LAG_MS = 180e3;                                           // запас к водяному знаку времени (письмо могло прийти чуть «из прошлого»)
var TM_MAILCMD_PAGE = 50, TM_MAILCMD_MAX = 400;                          // F4 C-A5: поиск постранично; больше TM_MAILCMD_MAX нитей в окне — окно времени делится пополам
var TM_MAILCMD_SPAN_MS = 7 * 864e5, TM_MAILCMD_HOLD_MS = 6 * 3600e3;    // окно поиска; письмо, которое cp_push не принимает дольше 6 ч, снимается с удержания (журнал + техтревога)
/** все нити поиска q постранично → [нить]; null — нитей больше TM_MAILCMD_MAX (окно надо сузить) */
function tm_mailSearch_(q) {
  var all = [];
  for (var start = 0; start < TM_MAILCMD_MAX; start += TM_MAILCMD_PAGE) {
    var page = GmailApp.search(q, start, TM_MAILCMD_PAGE) || []; all = all.concat(page);
    if (page.length < TM_MAILCMD_PAGE) return all;
  }
  return null;
}
/** Письма-команды на 1c@ → cp_push. F4 C-A5: курсор полного диапазона — окно [водяной знак − запас, + до 7 дней) с before:, все страницы поиска,
    письма разрешённых отправителей по времени от СТАРЫХ к новым; водяной знак (tm/mail_cmd.json wm) — не выше самого раннего необработанного письма
    (время вышло, cp_push не принял); разобранные id — лист tm_mail_log (повтор не дублирует). В пустую минуту — один вызов GmailApp.search. */
function tm_mailCmd_(ctx) {
  if (typeof cp_push !== 'function') return 'нет cp_push';
  if (typeof cp_enabled === 'function' && !cp_enabled()) return 'push выключен';
  var allowed = {}; String(tm_cfgGet_('mail_cmd_from', tm_def_('mail_cmd_from'))).split(/[,\s;]+/).forEach(function (a) { a = a.trim().toLowerCase(); if (a) allowed[a] = 1; });
  if (!Object.keys(allowed).length) return 'нет списка отправителей';
  var anyFrom = {}; String(tm_cfgGet_('mail_cmd_any', tm_def_('mail_cmd_any'))).split(/[,\s;]+/).forEach(function (a) { a = a.trim().toLowerCase(); if (a) anyFrom[a] = 1; });
  var subjRe; try { subjRe = new RegExp(tm_cfgGet_('mail_cmd_subjects', tm_def_('mail_cmd_subjects')), 'i'); } catch (e) { subjRe = /Фабрика\s*:/i; }
  var st = tm_load_('mail_cmd.json', {}), now = ctx.msk.ms, wm = Number(st.wm) || (now - TM_MAILCMD_FIRST_MS), hold = st.hold || {};
  var fromQ = '(' + Object.keys(allowed).map(function (a) { return 'from:' + a; }).join(' OR ') + ')';
  var res = { pushed: 0, rej: 0, skip: 0 }, done = null, sh = null, label = null, newWm = wm, stop = false, lo = wm - TM_MAILCMD_LAG_MS, span = TM_MAILCMD_SPAN_MS;
  var logRow = function (id, frm, subj, status) { done[id] = 1; sh.appendRow([id, new Date(), tm_cell_(tm_mailFromMask_(frm)), tm_cell_(String(subj).slice(0, 120)), tm_cell_(status)]); };   // CHECK3 05.11 (вопрос GPT): адрес отправителя в листе — маскирован; в push к Claude (ev.who) — контракт, как есть
  for (var guard = 0; guard < 16 && !stop; guard++) {
    var hi = Math.min(lo + span, now + 60000);
    var threads = tm_mailSearch_('after:' + Math.floor(lo / 1000) + ' before:' + Math.ceil(hi / 1000) + ' ' + fromQ);
    if (threads === null) {                                                     // больше TM_MAILCMD_MAX нитей — окно пополам (старое — первым)
      if (span <= 15 * 60000) { res.err = 'слишком много писем в окне'; tm_alert_('mail_cmd_many', 'Писем от отправителей команд на 1c@ больше ' + TM_MAILCMD_MAX + ' за 15 минут — разбор писем-команд остановлен на ' + tm_msk_(lo).iso.replace('T', ' ') + ' МСК.'); break; }
      span = Math.floor(span / 2); continue;
    }
    var list = [];
    threads.forEach(function (th) { th.getMessages().forEach(function (msg) {
      var t = msg.getDate().getTime(); if (t < lo || t >= hi) return;
      var frm = tm_addr_(msg.getFrom()); if (!allowed[frm]) return;          // чужое письмо в той же переписке
      list.push({ th: th, msg: msg, t: t, id: msg.getId(), frm: frm });
    }); });
    list.sort(function (a, b) { return a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    if (list.length && !done) { done = tm_colSet_('tm_mail_log'); sh = tm_sheet_('tm_mail_log'); }
    var pend = null, lastDone = null;                                          // самое раннее необработанное письмо окна; последнее разобранное до него
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (done[x.id]) { if (pend === null) lastDone = x.t; continue; }
      if (ctx.left() < 20000) { if (pend === null) pend = x.t; stop = true; break; }   // время вышло — остальное в следующую минуту
      var r = tm_mailOne_(x, subjRe, anyFrom, logRow, res, hold, now);
      if (r === 'hold') { if (pend === null) pend = x.t; continue; }
      if (r === 'pushed') { try { if (!label) label = tm_label_(TM_MAIL_LABEL); x.th.addLabel(label); } catch (e2) { tm_log_('mail_cmd', 'ярлык: ' + tm_err_(e2)); } }
      if (pend === null) lastDone = x.t;
    }
    if (pend !== null) { newWm = pend; stop = true; }
    else if (hi <= now - TM_MAILCMD_LAG_MS) { newWm = Math.max(newWm, hi); lo = hi - TM_MAILCMD_LAG_MS; span = TM_MAILCMD_SPAN_MS; }   // окно целиком в прошлом и разобрано — дальше
    else { if (lastDone !== null) newWm = Math.max(newWm, lastDone); stop = true; }
  }
  var hk = JSON.stringify(hold);
  if (newWm !== st.wm || hk !== JSON.stringify(st.hold || {})) { st.wm = newWm; st.hold = hold; st.t = ctx.msk.iso; if (!tm_save_('mail_cmd.json', st)) res.err = 'водяной знак не записан'; }
  if (res.pushed) tm_log_('mail_cmd', 'передано Claude: ' + res.pushed);
  return res;
}
/** адрес отправителя для листов/журнала: первая буква ящика + *** + домен ('i***@fabrikant.su') — кто из разрешённых писал, видно; сам адрес в лист не попадает */
function tm_mailFromMask_(a) { var m = /^([^@\s])[^@\s]*@([\w.-]+)$/.exec(String(a || '').trim().toLowerCase()); return m ? m[1] + '***@' + m[2] : (a ? '[адрес]' : ''); }
/** одно письмо разрешённого отправителя → 'pushed' | 'rej' | 'skip' | 'dead' (разобрано, в журнал) | 'hold' (cp_push не принял — повтор, водяной знак стоит) */
function tm_mailOne_(x, subjRe, anyFrom, logRow, res, hold, now) {
  var msg = x.msg, id = x.id, frm = x.frm, subj = String(msg.getSubject() || '').replace(/\s+/g, ' ').trim();
  var isCmd = subjRe.test(subj) || (anyFrom[frm] && !TM_FWD_SUBJ.test(subj) && !TM_REPORT_SUBJ.test(subj));
  if (!isCmd) { logRow(id, frm, subj, 'skip: не команда'); res.skip++; return 'skip'; }
  var auth = tm_authentic_(msg.getRawContent(), frm);
  if (!auth.ok) {
    logRow(id, frm, subj, 'rej: ' + auth.why); res.rej++; tm_log_('mail_cmd', 'письмо отклонено: ' + auth.why);
    tm_alert_('mail_spoof', 'Письмо-команда на 1c@ с адреса из списка не прошло проверку подлинности (' + auth.why + ') и не передано Claude. Если письмо ваше — проверьте настройки почты отправителя (DKIM/SPF); если нет — кто-то подделывает адрес.');
    return 'rej';
  }
  var when = tm_msk_(msg.getDate()).iso, body = tm_mailBody_(msg.getPlainBody()), att = 0;
  try { att = msg.getAttachments().length; } catch (e1) { att = 0; }
  var text = 'Тема: ' + subj + '\nОт: ' + frm + '\nДата: ' + when + ' МСК' + (att ? '\nВложений: ' + att + ' (в письме в Gmail 1c@)' : '') + '\n\n' + (body || '(письмо без текста)');
  var ok = false;
  try { ok = !!cp_push({ src: 'mail', who: frm, chat: 'user1@example.org', id: 'mail:' + id, text: text.slice(0, 20000) }, true); }
  catch (e) { tm_log_('mail_cmd', 'cp_push: ' + tm_err_(e)); }
  if (!ok) {
    var h = hold[id] || (hold[id] = { t0: now, n: 0 }); h.n++; res.err = 'cp_push не принял';
    if (now - h.t0 < TM_MAILCMD_HOLD_MS) return 'hold';
    logRow(id, frm, subj, 'dead: cp_push не принял ' + h.n + ' раз за 6 ч'); delete hold[id];
    tm_alert_('mail_cmd_dead', 'Письмо-команду на 1c@ («' + subj.slice(0, 80) + '») 6 часов не удаётся передать Claude (cp_push) — оно снято с повтора и лежит в Gmail 1c@. Передайте вручную.');
    return 'dead';
  }
  delete hold[id];
  logRow(id, frm, subj, 'pushed: ' + auth.why); res.pushed++;
  return 'pushed';
}

// REDACTED_B64_9 2) вопросы без ответа (раз в 55 минут)
/** сегодня и n прошлых рабочих дней → ['ГГГГ-ММ-ДД', …] */
function tm_workDays_(today, n) { var out = [today], d = today; while (out.length < n + 1) { d = tm_addDays_(d, -1); if (tm_workday_(d)) out.push(d); } return out; }
function tm_nsubj_(s) { return String(s || '').replace(TM_SUBJ_PFX, '').replace(/\s+/g, ' ').trim().toLowerCase(); }
/** сами вопросы: предложения с «?» или просьбой (до 300 знаков); иначе — начало письма */
function tm_qtext_(txt) {
  var t = String(txt || '').replace(/\s+/g, ' ').trim(), parts = t.split(/(?<=[.!?…])\s+/);
  var qs = parts.filter(function (p) { return TM_UA_ASK.test(p) && p.length > 6 && !/^(с уважением|best regards|спасибо)/i.test(p); });
  return tm_mask_(qs.length ? qs.slice(0, 4).join(' ') : t).slice(0, 300);
}
function tm_uaPerson_(org, frm, fname) {
  var o = org[String(frm || '').toLowerCase()];
  if (o) return { fio: o[0], role: o[1] || '', dep: o[2] || '', e: frm };
  return { fio: fname || frm, role: '', dep: tm_ownDom_(frm) ? '' : 'внешний адрес', e: frm, 'new': true };
}
/** письма Т. В. (лично / в копии) с вопросом без ответа — по копиям в Gmail 1c@ */
function tm_uaMail_(ctx, days) {
  var since = days[days.length - 1], out = [], st = { threads: 0, msgs: 0 }, seen = {};
  var q = '(to:' + TM_ITM + ' OR cc:' + TM_ITM + ') after:' + tm_addDays_(since, -1).replace(/-/g, '/') + ' -in:spam -in:trash';
  var threads = GmailApp.search(q, 0, 60);
  for (var i = 0; i < threads.length && ctx.left() > 20000; i++) {
    var msgs = threads[i].getMessages(); st.threads++;
    var mine = msgs.filter(function (m) { return TM_ME2.indexOf(tm_addr_(m.getFrom())) >= 0; }).map(function (m) { return m.getDate().getTime(); });
    for (var j = 0; j < msgs.length; j++) {
      var m = msgs[j], frm = tm_addr_(m.getFrom()); st.msgs++;
      if (TM_ME2.indexOf(frm) >= 0) continue;
      var t = m.getDate().getTime(), day = tm_dateOf_(t); if (days.indexOf(day) < 0) continue;
      var to = tm_addrs_(m.getTo()), cc = tm_addrs_(m.getCc()), direct = to.indexOf(TM_ITM) >= 0, copy = cc.indexOf(TM_ITM) >= 0;
      var subj = String(m.getSubject() || '').replace(/\s+/g, ' ').trim();
      if (!(direct || copy) || TM_ROBOT_RE.test(frm) || TM_REPORT_SUBJ.test(subj)) continue;
      var txt = tm_mailBody_(m.getPlainBody()).slice(0, 4000), fname = String(m.getFrom() || '').replace(/<.*$/, '').replace(/"/g, '').trim();
      if (!TM_UA_ASK.test(subj + '\n' + txt)) continue;
      var gm = /^\s*(?:(?:добрый день|доброе утро|добрый вечер|здравствуйте|приветствую)[,!.\s]+)?([А-ЯЁ][а-яё]+)\s*[,!]/i.exec(txt);
      if (!direct && gm && ['тимур', 'коллеги', 'уважаемые', 'уважаемый', 'все', 'добрый', 'здравствуйте', 'спасибо', 'прошу', 'просьба', 'просим'].indexOf(gm[1].toLowerCase()) < 0) continue;
      if (mine.some(function (x) { return x > t; })) continue;                   // в переписке есть более поздний ответ Т. В.
      var key = frm + '|' + tm_nsubj_(subj); if (seen[key]) continue; seen[key] = 1;
      out.push({ src: 'mail', t: tm_msk_(t).iso, day: day, f: frm, n: fname.slice(0, 80), s: subj.slice(0, 160), x: tm_qtext_(subj + '. ' + txt), d: direct });
    }
  }
  st.asked = out.length; st.open = out.length; st.mail = 'ok';
  return [st, out];
}
/** группы MAX: обращения к Т. В. с вопросом, на которые он не ответил в группе */
function tm_uaMax_(days, komCid) {
  var owner = tm_ownerUid_(), lo = tm_dateMs_(days[days.length - 1]), out = [], n = 0, cids = tm_histGroups_();
  if (cids.indexOf(komCid) < 0 && tm_chatOk_(komCid)) cids.push(komCid);       // F4 C-A7: выключенная/удалённая группа не обрабатывается
  cids.forEach(function (cid) {
    var H = tm_hist_(cid), msgs = tm_histList_(H), by = {}; msgs.forEach(function (m) { by[m.mid] = m; });
    var own = owner;
    if (!own) { var cnt = {}; msgs.forEach(function (m) { if (!m.bot && m.uid && /^\s*Сотрудник2(\s|$)/.test(m.name || '')) cnt[m.uid] = (cnt[m.uid] || 0) + 1; }); var ks = Object.keys(cnt); if (ks.length) own = ks.sort(function (a, b) { return cnt[b] - cnt[a]; })[0]; }
    if (!own) return;
    var mine = msgs.filter(function (m) { return String(m.uid) === String(own) && m.ts >= lo; });
    msgs.forEach(function (m) {
      if (m.ts < lo || m.bot || String(m.uid) === String(own)) return;
      var day = tm_dateOf_(m.ts); if (days.indexOf(day) < 0) return;
      var txt = m.text || '', rto = by[m.rmid || ''];
      var why = (m.mentions || []).indexOf(String(own)) >= 0 ? 'упоминание' : (rto && String(rto.uid) === String(own)) ? 'ответ на его сообщение' : TM_UA_OWNER.test(txt) ? 'по имени' : '';
      if (!why || !TM_UA_ASK.test(txt)) return;
      n++;
      var first = (String(m.name || '').split(/\s+/)[0] || '');
      // 12.11.2026 (Т. В.: «согласовал машину в Абхазию, а ты пишешь, что не согласована»): текст и фото уходят отдельными сообщениями
      //   подряд — ответ Т. В. на любое сообщение той же «пачки» (тот же автор, ±3 мин) засчитывается
      var burst = {}; msgs.forEach(function (x) { if (String(x.uid) === String(m.uid) && Math.abs(x.ts - m.ts) <= 180000) burst[x.mid] = 1; });
      var ans = mine.some(function (a) { return a.ts > m.ts - 1000 && (a.rmid === m.mid || burst[a.rmid] || (a.mentions || []).indexOf(String(m.uid)) >= 0 || (first && new RegExp('^\\s*' + tm_escRe_(first) + '(?![а-яё])', 'i').test(a.text || ''))); });
      if (!ans) out.push({ src: 'max', mid: m.mid, t: tm_msk_(m.ts).iso, day: day, n: String(m.name || 'без имени').slice(0, 80), g: H.title || tm_groupTitle_(cid), why: why, x: tm_mask_(tm_sq_(txt)).slice(0, 300) });
    });
  });
  return [{ asked: n, open: out.length }, out];
}
function tm_unans_(ctx) {
  var days = tm_workDays_(ctx.today, 2), org = tm_org_(), komCid = tm_komCid_(), ms, mq, xs, xq;
  try { var a = tm_uaMail_(ctx, days); ms = a[0]; mq = a[1]; } catch (e) { ms = { err: 'почта: ' + tm_err_(e) }; mq = []; }
  try { var b = tm_uaMax_(days, komCid); xs = b[0]; xq = b[1]; } catch (e2) { xs = { err: 'MAX: ' + tm_err_(e2) }; xq = []; }
  var items = [];
  mq.forEach(function (q) { var p = tm_uaPerson_(org, q.f, q.n); items.push({ src: 'mail', day: q.day, t: q.t, fio: p.fio, role: p.role, dep: p.dep, 'new': !!p['new'], s: q.s, x: q.x, d: q.d }); });
  var names = {}; Object.keys(org).forEach(function (e) { var v = org[e]; if (v && v[0]) { var k = v[0].split(/\s+/)[0].toLowerCase(); if (!names[k]) names[k] = v; } });
  xq.forEach(function (q) {
    var v = null; String(q.n).split(/\s+/).some(function (w) { if (names[w.toLowerCase()]) { v = names[w.toLowerCase()]; return true; } return false; });
    items.push({ src: 'max', day: q.day, t: q.t, fio: v ? v[0] : q.n, role: v ? v[1] || '' : '', dep: v ? v[2] || '' : '', 'new': !v, g: q.g, why: q.why, x: q.x });
  });
  items.sort(function (a, b) { return a.t < b.t ? -1 : 1; });
  var out = { v: 1, t: ctx.msk.iso, days: days, items: items, mail: ms, max: xs, not: 'личные переписки в Telegram и MAX ботам недоступны' };
  tm_publish_('ua.bin', out);
  if (tm_chatOk_(komCid)) try {                                                   // задача №20: сообщения «Коммерческого отдела» за эти дни → grp.bin (выключенная группа — нет; F4 C-A7)
    var H = tm_hist_(komCid), msgs = tm_histList_(H), by = {}; msgs.forEach(function (m) { by[m.mid] = m; });
    var g = [];
    msgs.forEach(function (m) {
      var day = tm_dateOf_(m.ts); if (days.indexOf(day) < 0) return;
      var r = by[m.rmid || ''];
      g.push({ t: tm_msk_(m.ts).iso, mid: m.mid, n: String(m.name || '').slice(0, 60), b: !!m.bot, x: tm_mask_(tm_sq_(m.text)).slice(0, 700), r: r ? String(r.name || '').slice(0, 60) : '', rx: r ? tm_mask_(tm_sq_(r.text)).slice(0, 160) : '' });
    });
    tm_publish_('grp.bin', { v: 1, t: ctx.msk.iso, g: 'Коммерческий отдел', days: days, msgs: g.slice(-600) });
  } catch (e3) { tm_log_('grp', tm_err_(e3)); }
  tm_save_('unans.json', { t: ctx.msk.iso, mail: ms, max: xs, n: items.length });
  return { mail: ms.open, max: xs.open, n: items.length };
}

// REDACTED_B64_9 3) контроль sales@ (раз в 25 минут)
var TM_SALES_DEF = { on: true, from: '2026-10-31', hours: 4, second: 8, work: ['09:00', '18:00'], window_days: 21, to: ['user10@example.org', 'user18@example.org', 'user17@example.org'],
                     greet: 'Сотрудник17 Отчество8, Сотрудник47 Отчество11, Сотрудник58 Отчество12', owner: TM_ITM, digest_at: '08:50', skip_from: [], skip_domains: [] };
function tm_salesCfg_() { var o = JSON.parse(JSON.stringify(TM_SALES_DEF)), over = tm_cfgJson_('sales', {}); if (over && typeof over === 'object') Object.keys(over).forEach(function (k) { o[k] = over[k]; }); return o; }
/** рабочих минут между t0 и t1 (пн–пт, окно work, без праздников) */
function tm_workMins_(t0, t1, cfg) {
  if (t1 <= t0) return 0;
  var a = tm_hmMin_(cfg.work[0], 9 * 60), b = tm_hmMin_(cfg.work[1], 18 * 60), total = 0, d = tm_dateOf_(t0), end = tm_dateOf_(t1);
  while (d <= end) {
    if (tm_workday_(d)) {
      var s = Math.max(t0, tm_dateMs_(d) + a * 60000), e = Math.min(t1, tm_dateMs_(d) + b * 60000);
      if (e > s) total += (e - s) / 60000;
    }
    d = tm_addDays_(d, 1);
  }
  return Math.round(total);
}
function tm_salesLine_(i, r, now, cfg) {
  var w = tm_workMins_(tm_isoMs_(r.t), now, cfg), h = Math.floor(w / 60), mm = w % 60;
  return i + ') ' + r.n + ' (' + r.dom + ') — «' + String(r.s).replace(/^\s*\[\s*sales\s*\]\s*/i, '').slice(0, 90) + '» — ' + tm_ddmm_(r.t) + ' ' + r.t.slice(11, 16) + ', без ответа ' + h + ' ч' + (mm ? ' ' + mm + ' мин' : '') + (r.fwd ? ' (переслано коллегам без клиента и sales@)' : '') + (r.x ? '. «' + r.x + '»' : '');
}
/** одна переписка Gmail → запросы клиентов в ней {id первого письма: {t, n, dom, s, x, ans, fwd}} (клиент — чужой домен; ответ — наше письмо клиенту или с sales@ в копии) */
function tm_salesThread_(thread, cfg, lo) {
  var req = {}, skipFrom = (cfg.skip_from || []).map(String), skipDom = (cfg.skip_domains || []).map(String);
  var msgs = thread.getMessages().map(function (m) {
    var frm = tm_addr_(m.getFrom());
    return { id: m.getId(), t: m.getDate().getTime(), frm: frm, fname: String(m.getFrom() || '').replace(/<.*$/, '').replace(/"/g, '').trim(), rc: tm_addrs_(m.getTo()).concat(tm_addrs_(m.getCc())), s: String(m.getSubject() || '').replace(/\s+/g, ' ').trim(), msg: m };
  }).sort(function (a, b) { return a.t - b.t; });
  var cur = null;
  msgs.forEach(function (m) {
    var ext = !tm_ownDom_(m.frm) && !TM_ROBOT_RE.test(m.frm) && skipFrom.indexOf(m.frm) < 0 && skipDom.indexOf(tm_dom_(m.frm)) < 0;
    if (ext) {
      if (tm_dateOf_(m.t) < lo) return;
      var txt = tm_mailBody_(m.msg.getPlainBody()).slice(0, 2000);
      if (!cur || cur.ans) {                                                     // первое письмо или новое письмо клиента после нашего ответа — с вопросом
        if (cur && cur.ans && !TM_UA_ASK.test(m.s + '\n' + txt)) return;
        cur = req[m.id] = { t: tm_msk_(m.t).iso, n: (m.fname || m.frm.split('@')[0]).slice(0, 60), dom: tm_dom_(m.frm), s: m.s.slice(0, 160), x: tm_mask_(tm_sq_(txt)).slice(0, 160), ans: null, fwd: null, client: m.frm };
      }
      return;
    }
    if (!cur || cur.ans || !tm_ownDom_(m.frm)) return;
    var toClient = m.rc.indexOf(cur.client) >= 0 || m.rc.indexOf('user44@example.org') >= 0;
    if (toClient) cur.ans = { t: tm_msk_(m.t).iso, n: (m.fname || m.frm.split('@')[0]).slice(0, 60) };
    else cur.fwd = { t: tm_msk_(m.t).iso, n: (m.fname || m.frm.split('@')[0]).slice(0, 60) };
  });
  Object.keys(req).forEach(function (k) { delete req[k].client; });
  return req;
}
/** письма через sales@ в Gmail 1c@ → запросы {id: {t, n, dom, s, x, ans, fwd}}. Экономия чтений Gmail: разобранные переписки хранятся в st.th
    {threadId: {t, req}}; обычный прогон перечитывает только переписки с письмами новее прошлого прогона (after: в секундах), полный перебор
    окна window_days — раз в день (st.full). */
function tm_salesScan_(ctx, cfg, st) {
  var from = tm_addDays_(ctx.today, -(Number(cfg.window_days) || 21)), lo = String(cfg.from || '2026-10-31');
  if (from < tm_addDays_(lo, -7)) from = tm_addDays_(lo, -7);
  if (!st.th || typeof st.th !== 'object') st.th = {};
  var full = st.full !== ctx.today || !st.scan_t, base = '(to:user44@example.org OR cc:user44@example.org OR subject:"[sales]") -in:spam -in:trash';
  var q = full ? base + ' after:' + from.replace(/-/g, '/') : base + ' after:' + Math.floor((tm_isoMs_(st.scan_t) - 15 * 60000) / 1000);
  var threads = GmailApp.search(q, 0, full ? 100 : 30), seen = {}, n = 0;
  for (var i = 0; i < threads.length && ctx.left() > 20000; i++) {
    var th = threads[i], tid = String(th.getId()), last = th.getLastMessageDate().getTime();
    seen[tid] = 1;
    if (!full && st.th[tid] && st.th[tid].t === last) continue;                    // переписка не менялась
    st.th[tid] = { t: last, req: tm_salesThread_(th, cfg, lo) }; n++;
  }
  if (full && i >= threads.length) { Object.keys(st.th).forEach(function (k) { if (!seen[k]) delete st.th[k]; }); st.full = ctx.today; }   // полный перебор дошёл до конца — лишнее забыто
  st.scan_t = ctx.msk.iso; st.scan_n = n;
  var req = {}, loIso = from + 'T00:00';
  Object.keys(st.th).forEach(function (k) { var R = st.th[k].req || {}; Object.keys(R).forEach(function (id) { if (R[id].t >= loIso) req[id] = R[id]; }); });
  return req;
}
function tm_salesCtl_(ctx) {
  var cfg = tm_salesCfg_(); if (!cfg.on) return 'off';
  var a = tm_hmMin_(cfg.work[0], 9 * 60), b = tm_hmMin_(cfg.work[1], 18 * 60), tod = tm_minOf_(ctx.msk), st = tm_load_('sales_ctl.json', {}), res = {};
  if (!st.rem) st.rem = {}; if (!st.dg) st.dg = [];
  var inWork = ctx.workday && tod >= a && tod < b, at = tm_hmMin_(cfg.digest_at, 8 * 60 + 50);
  var dueDigest = ctx.workday && tod >= at && tod < 12 * 60 && st.dg.indexOf(ctx.today) < 0;
  if (!inWork && !dueDigest) return 'вне рабочего окна';
  var req = tm_salesScan_(ctx, cfg, st), now = ctx.msk.ms, leaders = tm_leaderMails_();
  // напоминание: 4 и 8 рабочих часов без ответа — одно письмо по всем таким запросам
  if (inWork && !ctx.quiet) {
    var h1 = (Number(cfg.hours) || 4) * 60, h2 = (Number(cfg.second) || 8) * 60, first = [], second = [];
    Object.keys(req).sort(function (x, y) { return req[x].t < req[y].t ? -1 : 1; }).forEach(function (mid) {
      var r = req[mid]; if (r.ans) return;
      var w = tm_workMins_(tm_isoMs_(r.t), now, cfg), n = (st.rem[mid] || []).length;
      if (n === 0 && w >= h1) first.push([mid, r]); else if (n === 1 && w >= h2) second.push([mid, r]);
    });
    if (first.length || second.length) {
      var items = first.concat(second), body = [];
      if (first.length) { body.push('Нет ответа клиенту больше ' + (h1 / 60) + ' рабочих часов:'); first.forEach(function (x, i) { body.push(tm_salesLine_(i + 1, x[1], now, cfg)); }); }
      if (second.length) { if (body.length) body.push(''); body.push('Повторно — нет ответа больше ' + (h2 / 60) + ' рабочих часов:'); second.forEach(function (x, i) { body.push(tm_salesLine_(first.length + i + 1, x[1], now, cfg)); }); }
      var text = (cfg.greet || 'Коллеги') + ', добрый день.\n\nПисьма на user44@example.org — на особом контроле: ответ клиенту в течение ' + (h1 / 60) + ' рабочих часов, с user44@example.org в копии.\n\n' + body.join('\n') +
                 '\n\nОтвечая клиенту, ставьте user44@example.org в копию — тогда запрос закроется. Если ответ уже ушёл без копии — перешлите его на user44@example.org.\n— бот «Фабрикант» (контроль sales@)';
      var n = items.length, subj = 'sales@: ' + n + ' ' + (n === 1 ? 'запрос' : n < 5 ? 'запроса' : 'запросов') + ' без ответа клиенту';
      var to = (cfg.to || []).map(function (x) { return String(x).toLowerCase(); }).filter(function (x) { return !leaders[x]; });   // руководству напоминаний нет
      if (to.length) {
        var r1 = tm_mail_(to, [], subj, text, false);
        if (r1 === 'ok' || r1 === 'dry') { items.forEach(function (x) { (st.rem[x[0]] = st.rem[x[0]] || []).push(ctx.msk.iso); }); res.rem = items.length; res.mail = r1; }
        else res.err = r1;
      } else res.rem = 'нет адресатов (все — руководство)';
    }
  }
  // сводка владельцу в digest_at рабочего дня
  if (dueDigest) {
    var y = ctx.today; for (var k = 0; k < 15; k++) { y = tm_addDays_(y, -1); if (tm_workday_(y)) break; }
    var ks = Object.keys(req).sort(function (x, z) { return req[x].t < req[z].t ? -1 : 1; });
    var opn = ks.filter(function (m) { return !req[m].ans; }), newY = ks.filter(function (m) { return req[m].t.slice(0, 10) >= y && req[m].t.slice(0, 10) < ctx.today; });
    var ansY = ks.filter(function (m) { return req[m].ans && req[m].ans.t.slice(0, 10) >= y && req[m].ans.t.slice(0, 10) < ctx.today; });
    if (opn.length || newY.length || ansY.length) {
      var h1d = (Number(cfg.hours) || 4) * 60, lines = [];
      if (opn.length) { lines.push('Без ответа клиенту (в копии sales@ ответа нет): ' + opn.length); opn.forEach(function (m, i) { var rs = st.rem[m] || []; lines.push(tm_salesLine_(i + 1, req[m], now, cfg) + (rs.length ? ' Напоминаний: ' + rs.length + ' (' + rs.map(function (x) { return tm_ddmm_(x) + ' ' + x.slice(11, 16); }).join(', ') + ').' : '')); }); }
      else lines.push('Все запросы на sales@ отвечены.');
      if (ansY.length) {
        var ws = ansY.map(function (m) { return tm_workMins_(tm_isoMs_(req[m].t), tm_isoMs_(req[m].ans.t), cfg); }), late = ws.filter(function (w) { return w > h1d; }).length, avg = ws.reduce(function (s, w) { return s + w; }, 0) / ws.length;
        lines.push(''); lines.push('За ' + tm_ddmm_(y) + ' отвечено: ' + ansY.length + ', в среднем за ' + Math.floor(avg / 60) + ' ч ' + Math.round(avg % 60) + ' мин рабочего времени' + (late ? '; позже ' + (h1d / 60) + ' ч — ' + late : '') + '.');
        ansY.forEach(function (m) { var r = req[m]; lines.push('  • ' + r.n + ' — «' + String(r.s).replace(/^\s*\[\s*sales\s*\]\s*/i, '').slice(0, 90) + '» — ответил(а) ' + r.ans.n + ' в ' + tm_ddmm_(r.ans.t) + ' ' + r.ans.t.slice(11, 16)); });
      }
      lines.push(''); lines.push('Сотрудник6 запросов за ' + tm_ddmm_(y) + ': ' + newY.length + '.');
      var txt = 'Контроль писем на user44@example.org на ' + tm_ddmm_(ctx.today) + ' ' + ctx.msk.hm + '.\n\n' + lines.join('\n') + '\n\nНапоминания уходят через ' + (h1d / 60) + ' и ' + (Number(cfg.second) || 8) + ' рабочих часов без ответа.\n— бот «Фабрикант» (контроль sales@)';
      var r2 = tm_mail_([cfg.owner || TM_ITM], [], 'sales@ на ' + tm_ddmm_(ctx.today) + ': без ответа — ' + opn.length, txt, true);
      if (r2 === 'ok' || r2 === 'dry') { res.digest = opn.length; st.dg.push(ctx.today); st.dg = st.dg.slice(-30); } else res.err = r2;
    } else { st.dg.push(ctx.today); st.dg = st.dg.slice(-30); }
  }
  delete st.req;                                                                   // запросы теперь в st.th по перепискам
  Object.keys(st.rem).forEach(function (k) { if (!req[k]) delete st.rem[k]; });
  st.open = Object.keys(req).filter(function (k) { return !req[k].ans; }).length; st.t = ctx.msk.iso;
  tm_save_('sales_ctl.json', st);
  res.open = st.open; res.req = Object.keys(req).length;
  return res;
}
