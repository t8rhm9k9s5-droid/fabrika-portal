/** «Фабрика» — поручения совещания в группах MAX: закреплённый список и отчёт ответственных (16.11.2026).
 *  Т. В. (опрос 16.11): «Кнопки лично + ответ в группе»; «Сразу по слову ответственного» — пункт закрывается без подтверждения.
 *   • Лично: каждому ответственному — его пункты с кнопками «✅ Сделано», «📅 Срок», «❓ Вопрос» (op mtsend, один раз на человека).
 *   • В группе: ответ на закреплённый список словом «сделано/выполнено/готово/✅» — бот закрывает пункт автора (если пунктов
 *     несколько — спросит кнопками, какой). Чужой пункт закрыть нельзя.
 *   • Закрытый пункт: в закреплённом списке «✅ … — выполнено (Фамилия, время)», в реестре «Контроль 11.11» — «Выполнено ✅»,
 *     Т. В. — строкой в итогах дня (op mtday читает Telegram-скрипт).
 *  Состояние — Диск бота, папка meet/cur.json (op mtload кладёт Claude). */
var MT_DIR = 'meet', MT_FILE = 'cur.json', MT_REG = 'REDACTED_ID_3', MT_SHEET = 'Контроль 11.11';
var MT_LEAD_RX = /^(романов|андросов|миров)/i;
var MT_NAME_RX = /([А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?)\s+([А-ЯЁ])\.\s*([А-ЯЁ])\./g;

function mt_get_() { return jget_(MT_DIR, MT_FILE, null); }
function mt_names_(line) { var b = String(line).match(/<b>([\s\S]*?)<\/b>/), s = b ? b[1] : String(line), out = [], m; MT_NAME_RX.lastIndex = 0; while ((m = MT_NAME_RX.exec(s))) out.push(m[1] + ' ' + m[2] + '. ' + m[3] + '.'); return out; }
function mt_norm_(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е'); }
/** «Фамилия И. О.» → uid участника группы: фамилия в имени MAX; несколько совпадений — по первой букве имени. */
function mt_match_(nm, M) {
  var p = String(nm).split(/\s+/), sur = mt_norm_(p[0]), ini = mt_norm_((p[1] || '').charAt(0));
  var c = Object.keys(M).filter(function (u) { return mt_norm_(M[u]).indexOf(sur) >= 0; });
  if (c.length > 1 && ini) c = c.filter(function (u) { return mt_norm_(M[u]).split(/\s+/).some(function (w) { return w !== sur && w.charAt(0) === ini; }); });
  return c.length === 1 ? c[0] : null;
}
/** op mtload {state}: {day, title, groups:{cid:{title, mid, head:[], tail:[]}}, items:[{n, pid, cid, line}]} → uid ответственных по участникам групп. */
function mt_load_(q) {
  var S = q.state || {}; if (!S.groups || !Array.isArray(S.items)) return { ok: false, error: 'нет groups/items' };
  var all = {}, miss = [], G = mx_groups();                  // участники ВСЕХ групп бота (человек может не состоять в группе поручения)
  Object.keys(G).forEach(function (c) { if (G[c].channel) return; try { var M = members_(c); Object.keys(M).forEach(function (u) { all[u] = M[u]; }); } catch (e) { /* группа недоступна */ } });
  S.items.forEach(function (it) {
    it.names = mt_names_(it.line); it.uids = {};
    it.names.forEach(function (nm) { var u = mt_match_(nm, all); if (u) it.uids[u] = nm; else miss.push(nm); });
    it.st = it.st || 'open';
  });
  var old = mt_get_();                                     // повторная загрузка того же дня: кому уже писали, кого узнали, что закрыто — сохраняем
  if (old && old.day === S.day) {
    S.sent = old.sent || {}; S.learn = old.learn || {};
    S.items.forEach(function (it) { var o = (old.items || []).filter(function (x) { return x.pid === it.pid; })[0]; if (!o) return;
      ['st', 'by', 't', 'due', 'due_by'].forEach(function (k) { if (o[k] !== undefined) it[k] = o[k]; });
      Object.keys(o.uids || {}).forEach(function (u) { if (S.learn[u]) it.uids[u] = o.uids[u]; }); });
  }
  S.sent = S.sent || {}; S.t = Date.now();
  var r = jrmw_(MT_DIR, MT_FILE, null, function () { return S; });
  if (r === false) return { ok: false, error: 'не записалось' };
  mx_log('mt', 'поручения ' + S.day + ': пунктов ' + S.items.length + ', не нашёл в группах: ' + miss.length);
  var found = {}; S.items.forEach(function (it) { Object.keys(it.uids).forEach(function (u) { found[it.uids[u]] = all[u]; }); });
  return { ok: true, items: S.items.length, miss: miss.filter(function (x, i, a) { return a.indexOf(x) === i; }), found: found };
}
function mt_short_(it, n) { var t = String(it.line).replace(/<b>[\s\S]*?<\/b>\s*—?\s*/, '').replace(/<[^>]+>/g, '').replace(/^•\s*/, ''); return t.length > (n || 60) ? t.slice(0, (n || 60) - 1) + '…' : t; }
function mt_hm_(t) { return Utilities.formatDate(new Date(t), 'Europe/Moscow', 'dd.MM HH:mm'); }
function mt_lineOf_(it, plain) {
  var body = String(it.line).replace(/^•\s*/, '');
  if (it.due) body = body.replace(/\s·\s<i>[^<]*<\/i>\s*$/, '') + ' · <i>срок: ' + h_(it.due) + '</i>';
  if (it.st !== 'done') return '• ' + body;
  var by = it.by ? String(it.by).split(' ')[0] + ', ' : '';
  return '✅ ' + (plain ? body.replace(/<\/?i>/g, '') : '<s>' + body.replace(/<\/?i>/g, '') + '</s>') + ' · <i>выполнено (' + h_(by) + mt_hm_(it.t) + ')</i>';
}
function mt_render_(S, cid, plain) {
  var g = S.groups[cid] || {}, L = (g.head || []).slice();
  S.items.filter(function (it) { return String(it.cid) === String(cid); }).forEach(function (it) { L.push(mt_lineOf_(it, plain)); });
  return L.concat(g.tail || []).join('\n');
}
/** Перерисовать закреплённый список группы (правка своего сообщения). <s> MAX не принял — без зачёркивания. */
function mt_redraw_(S, cid) {
  var g = S.groups[cid]; if (!g || !g.mid) return false;
  var r = api_('PUT', '/messages', { message_id: g.mid }, mx_msgBody(mt_render_(S, cid)));
  if (!ok_(r[0])) r = api_('PUT', '/messages', { message_id: g.mid }, mx_msgBody(mt_render_(S, cid, true)));
  if (!ok_(r[0])) mx_log('mt', 'правка списка в «' + g.title + '» не прошла: ' + r[0]);
  return ok_(r[0]);
}
/** Реестр «Контроль 11.11»: строка по ID в столбце A. vals — {G?, H?, I?, J?}. */
function mt_reg_(pid, vals) {
  try {
    var sh = SpreadsheetApp.openById(MT_REG).getSheetByName(MT_SHEET), ids = sh.getRange(1, 1, Math.min(sh.getLastRow(), 400), 1).getValues();
    for (var i = 0; i < ids.length; i++) if (String(ids[i][0]).trim() === pid) {
      Object.keys(vals).forEach(function (col) { sh.getRange(col + (i + 1)).setValue(vals[col]); }); return true;
    }
    mx_log('mt', 'реестр: нет строки ' + pid); return false;
  } catch (e) { mx_log('mt', 'реестр ' + pid + ': ' + mx_errText(e)); return false; }
}
/** Закрыть пункт n словом ответственного uid. → 'done' | 'already' | 'nf' | 'notyours' */
function mt_close_(n, uid, name) {
  var res = 'nf', it0 = null;
  var S = jrmw_(MT_DIR, MT_FILE, null, function (S) {
    if (!S) return null; var it = S.items.filter(function (x) { return Number(x.n) === Number(n); })[0];
    if (!it) { res = 'nf'; return null; }
    if (!it.uids || !it.uids[String(uid)]) { res = 'notyours'; return null; }
    if (it.st === 'done') { res = 'already'; it0 = it; return null; }
    it.st = 'done'; it.by = it.uids[String(uid)] || name; it.t = Date.now(); res = 'done'; it0 = it; return S;
  });
  if (res !== 'done' || !S) return { res: res, it: it0 };
  mt_redraw_(S, it0.cid);
  if (it0.pid) mt_reg_(it0.pid, { H: 'Выполнено ✅', I: 'Выполнено — ' + it0.by + ', ' + mt_hm_(it0.t) + ' (отметка в MAX)', J: 'По слову ответственного (правило Т. В. 16.11)' });
  mx_log('mt', 'пункт ' + it0.pid + ' закрыт: ' + it0.by);
  return { res: 'done', it: it0 };
}
function mt_setDue_(n, uid, due) {
  var it0 = null, res = 'nf';
  var S = jrmw_(MT_DIR, MT_FILE, null, function (S) {
    if (!S) return null; var it = S.items.filter(function (x) { return Number(x.n) === Number(n); })[0];
    if (!it) return null; if (!it.uids || !it.uids[String(uid)]) { res = 'notyours'; return null; }
    it.due = due; it.due_by = it.uids[String(uid)]; res = 'ok'; it0 = it; return S;
  });
  if (res !== 'ok' || !S) return { res: res };
  mt_redraw_(S, it0.cid);
  if (it0.pid) mt_reg_(it0.pid, { G: due + ' (назвал ' + it0.due_by + ' в MAX)' });
  return { res: 'ok', it: it0 };
}
function mt_kbItems_(items) {
  return { attachments: [{ type: 'inline_keyboard', payload: { buttons: items.map(function (it) {
    return [{ type: 'callback', text: '✅ Сделано · ' + it.k, payload: 'mt:' + it.n + ':d' }, { type: 'callback', text: '📅 Срок · ' + it.k, payload: 'mt:' + it.n + ':s' }, { type: 'callback', text: '❓ · ' + it.k, payload: 'mt:' + it.n + ':q' }];
  }) } }] };
}
/** op mtsend {only?: [uid]} — лично каждому ответственному его пункты (один раз на человека; повтор — только с force). */
function mt_send_(q) {
  var S = mt_get_(); if (!S) return { ok: false, error: 'нет поручений (mtload)' };
  var by = {}; S.items.forEach(function (it) { if (it.st === 'done') return; Object.keys(it.uids || {}).forEach(function (u) { (by[u] = by[u] || []).push(it); }); });
  var sent = [], skip = [], bad = [];
  Object.keys(by).forEach(function (u) {
    if (q.only && q.only.indexOf(u) < 0) return;
    if (S.sent && S.sent[u] && !q.force) { skip.push(u); return; }
    if (MT_LEAD_RX.test(by[u][0].uids[u])) { skip.push(u); return; }
    var gate = typeof mx_dmGate_ === 'function' ? mx_dmGate_(u, by[u][0].uids[u]) : null; if (gate) { bad.push(by[u][0].uids[u] + ': ' + gate); return; }   // 16.11.2026, Т. В.   // 03.11.2026, Т. В.: руководству (Сотрудник28, Сотрудник32, Сотрудник13) бот вопросов не задаёт — отчёт в группе
    if (typeof mx_isBanned === 'function' && mx_isBanned(by[u][0].uids[u])) { bad.push(by[u][0].uids[u] + ': лично бот не пишет (правило 04.11)'); return; }
    var its = by[u].map(function (it, i) { return { n: it.n, k: i + 1, it: it }; });
    var L = ['📋 <b>' + h_(S.title || 'Поручения совещания') + '</b>', 'Ваши пункты:'];
    its.forEach(function (x) { L.push(x.k + '. ' + h_(mt_short_(x.it, 140)) + ' · <i>' + h_((S.groups[x.it.cid] || {}).title || '') + '</i>'); });
    L.push('', 'Сделали — нажмите «✅ Сделано», пункт закроется сразу. Нужен срок — «📅 Срок». Вопрос — «❓».', 'Можно и в группе: ответьте на закреплённый список словом «сделано».');
    var r = mx_sendUser(Number(u), L.join('\n'), mt_kbItems_(its));
    if (ok_(r[0])) { sent.push(by[u][0].uids[u]); S.sent = S.sent || {}; S.sent[u] = Date.now(); } else bad.push(by[u][0].uids[u] + ': MAX ' + r[0]);
  });
  jrmw_(MT_DIR, MT_FILE, null, function (cur) { if (!cur) return null; cur.sent = S.sent; return cur; });
  mx_log('mt', 'лично: отправлено ' + sent.length + ', уже было ' + skip.length + ', не ушло ' + bad.length);
  return { ok: true, sent: sent, skip: skip.length, bad: bad };
}
var MT_DUE = [['Сегодня', 0], ['Завтра', 1], ['Послезавтра', 2], ['До пятницы', 'fr'], ['След. неделя', 7]];
function mt_dueDate_(code) {
  var d = new Date(Date.now() + 3 * 3600e3);
  if (code === 'fr') { var w = d.getUTCDay(), add = (5 - w + 7) % 7; d = new Date(d.getTime() + add * 864e5); }
  else d = new Date(d.getTime() + Number(code) * 864e5);
  return Utilities.formatDate(d, 'UTC', 'dd.MM');
}
/** Кнопки mt:<n>:d | mt:<n>:s | mt:<n>:s:<код> | mt:<n>:q */
function mt_cb_(u) {
  var cb = u.callback || {}, cbid = String(cb.callback_id || ''), m = String(cb.payload || '').match(/^mt:(\d{1,3}):([dsq])(?::([0-9a-z]{1,3}))?$/);
  if (!m) return mx_answerCb(cbid, 'Кнопка устарела.');
  var user = cb.user || {}, uid = String(Number(user.user_id || 0)), name = mx_name(user).replace(/\s*\(@[^)]*\)$/, '');
  if (m[2] === 'd') {
    var r = mt_close_(m[1], uid, name);
    if (r.res === 'done') return mx_answerCb(cbid, 'Отмечено: выполнено ✅ Спасибо!');
    if (r.res === 'already') return mx_answerCb(cbid, 'Этот пункт уже отмечен выполненным.');
    if (r.res === 'notyours') return mx_answerCb(cbid, 'Это поручение другого сотрудника.');
    return mx_answerCb(cbid, 'Пункт не найден.');
  }
  if (m[2] === 's' && !m[3]) {
    mx_answerCb(cbid, 'Выберите срок');
    return mx_sendUser(Number(uid), '📅 Срок по пункту: <i>' + h_(mt_short_((mt_get_() || { items: [] }).items.filter(function (x) { return Number(x.n) === Number(m[1]); })[0] || { line: '' }, 90)) + '</i>',
      { attachments: [{ type: 'inline_keyboard', payload: { buttons: [MT_DUE.map(function (d) { return { type: 'callback', text: d[0], payload: 'mt:' + m[1] + ':s:' + d[1] }; })] } }] });
  }
  if (m[2] === 's') {
    var due = mt_dueDate_(m[3]), r2 = mt_setDue_(m[1], uid, due);
    if (r2.res === 'ok') return mx_answerCb(cbid, 'Срок записан: ' + due);
    return mx_answerCb(cbid, r2.res === 'notyours' ? 'Это поручение другого сотрудника.' : 'Пункт не найден.');
  }
  mx_answerCb(cbid, 'Напишите вопрос');
  return mx_sendUser(Number(uid), '❓ Напишите вопрос по пункту одним сообщением здесь — передам Сотрудник81 Отчество41.');
}
var MT_YES = /(сделан|выполнен|готово|готов\b|закрыт|закрыл|✅|☑|✔)/i, MT_NO = /не\s+(сделан|выполнен|готов|закрыт)/i;
/** Сообщение в группе: ответ на закреплённый список словом «сделано» — закрыть пункт автора (несколько — кнопки). → true, если наше. */
function mt_onGroup_(m) {
  var lk = m.link || null, rmid = lk && lk.type === 'reply' ? String((lk.message || {}).mid || '') : '';
  if (!rmid) return false;
  var S = mt_get_(); if (!S) return false;
  var cid = String((m.recipient || {}).chat_id || ''), g = S.groups[cid]; if (!g || g.mid !== rmid) return false;
  var text = mx_text(m), uid = String(Number((m.sender || {}).user_id || 0)), mid = String((m.body || {}).mid || '');
  if (!MT_YES.test(text) || MT_NO.test(text)) return false;
  var mine = S.items.filter(function (it) { return String(it.cid) === cid && it.st !== 'done' && it.uids && it.uids[uid]; });
  if (!mine.length) {                                     // автор не узнан (в MAX только имя): «сделано, Фамилия» — запомнить, кто это
    var who = mt_norm_(mx_name(m.sender || {}).replace(/\s*\(@[^)]*\)$/, '')), lt = mt_norm_(text), nmHit = null;
    S.items.forEach(function (it) { if (String(it.cid) !== cid || it.st === 'done') return; (it.names || []).forEach(function (nm) {
      var sur = mt_norm_(nm.split(' ')[0]), ini = mt_norm_(nm.split(' ')[1] || '').charAt(0);
      if (lt.indexOf(sur) >= 0 && (who.indexOf(sur) >= 0 || who.charAt(0) === ini)) nmHit = nm; }); });
    if (!nmHit) {
      var ck = 'mtask_' + uid; if (!CacheService.getScriptCache().get(ck)) { CacheService.getScriptCache().put(ck, '1', 21600);
        mx_sendChat(cid, 'Не узнал вас по имени в MAX. Ответьте, пожалуйста, на список ещё раз: «сделано, Фамилия» — дальше буду узнавать сам.', { link: { type: 'reply', mid: mid } }); }
      return true;
    }
    jrmw_(MT_DIR, MT_FILE, null, function (cur) { if (!cur) return null; cur.items.forEach(function (it) { if ((it.names || []).indexOf(nmHit) >= 0) { it.uids = it.uids || {}; it.uids[uid] = nmHit; } }); cur.learn = cur.learn || {}; cur.learn[uid] = nmHit; return cur; });
    mx_log('mt', 'узнал ' + nmHit + ' по ответу в группе');
    S = mt_get_(); mine = S.items.filter(function (it) { return String(it.cid) === cid && it.st !== 'done' && it.uids && it.uids[uid]; });
    if (!mine.length) return true;
  }
  var num = text.match(/(?:^|\D)(\d{1,2})(?:\D|$)/), pick = null;
  if (mine.length === 1) pick = mine[0];
  else if (num) { var k = Number(num[1]); pick = mine[k - 1] || null; }
  if (pick) {
    var r = mt_close_(pick.n, uid, '');
    if (r.res === 'done') mx_sendChat(cid, '✅ Отмечено: ' + h_(mt_short_(pick, 80)) + ' — ' + h_(pick.uids[uid].split(' ')[0]) + '. Спасибо!', { link: { type: 'reply', mid: mid } });
    return true;
  }
  var its = mine.map(function (it, i) { return { n: it.n, k: i + 1, it: it }; });
  var L = ['Какой пункт выполнен?'].concat(its.map(function (x) { return x.k + '. ' + h_(mt_short_(x.it, 70)); }));
  mx_sendChat(cid, L.join('\n'), { link: { type: 'reply', mid: mid }, attachments: [{ type: 'inline_keyboard', payload: { buttons: its.map(function (x) { return [{ type: 'callback', text: '✅ ' + x.k + '. ' + mt_short_(x.it, 30), payload: 'mt:' + x.n + ':d' }]; }) } }] });
  return true;
}
/** op mtday — для итогов дня Т. В.: что закрыто сегодня и сколько открыто. */
function mt_day_() {
  var S = mt_get_(); if (!S) return { ok: true, none: true };
  var day = Utilities.formatDate(new Date(), 'Europe/Moscow', 'dd.MM');
  var done = S.items.filter(function (it) { return it.st === 'done' && it.t && mt_hm_(it.t).slice(0, 5) === day; });
  var dues = S.items.filter(function (it) { return it.due && it.st !== 'done'; });
  return { ok: true, title: S.title || '', total: S.items.length, open: S.items.filter(function (it) { return it.st !== 'done'; }).length,
    done: done.map(function (it) { return { pid: it.pid, by: it.by, t: mt_hm_(it.t).slice(6), x: mt_short_(it, 60), g: (S.groups[it.cid] || {}).title }; }),
    dues: dues.map(function (it) { return { pid: it.pid, due: it.due, by: it.due_by, x: mt_short_(it, 50) }; }) };
}

/** op mtredraw — перерисовать закреплённые списки всех групп по состоянию (после mtload с новым текстом шапки). */
function mt_redrawAll_() { var S = mt_get_(); if (!S) return { ok: false, error: 'нет поручений' }; var res = {}; Object.keys(S.groups).forEach(function (c) { res[S.groups[c].title] = mt_redraw_(S, c); }); return { ok: true, res: res }; }
