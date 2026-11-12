/* «Фабрика — бот MAX» — MaxCoreOps.gs (05.11.2026): подписанные команды Claude и Telegram-скрипта, опросы, зеркало Telegram → MAX (op tgcall), импорт состояния.
   Подпись (как post.php и Relay.gs cmd_): POST t=<unix>&d=<JSON>&s=<hex HMAC-SHA256(K_CMD, "mx:" + t + ":" + sha256hex(d))>, окно 10 минут, d ≤ 12 000 знаков.
   d.op: ping | chats | read {g|cid, n} | hist {g|cid, since, n} | post {g|cid|price, text, id, mid?} (reply — тот же post с mid; price — id запроса цены
         из листа mx_price: группа и mid берутся оттуда; poll — {g, poll:{…}}) | dm {uid|name, text, id} | delete {mids:[…]} | group {cid, on} |
         settings {k, v} | price {id} | tgcall {method, params} | import {id}.
   Замечание 05: публикация — проверка группы → резерв id (лист post_ids: pending) → отправка → sent / failed (failed можно повторить тем же id).
   Замечание 10: dm по имени — все совпадения во всех группах без повторов user_id, отправка только при одном. Замечание 12: удаление — только своё
   сообщение (точный user_id бота из /me) и только в известной группе. op tgcall (вместо max/relay.php): {op:'tgcall', key:<общий ключ>, method, params}
   в виде Telegram → MAX Bot API → ответ в виде Telegram {ok, result}; принимается и как JSON-тело (формат relay.php), и внутри подписанного d. */

var MX_POLL_Q_MIN = 5, MX_POLL_Q_MAX = 7, MX_POLL_OPTS = 3;

function mx_cmd(e) {
  var k = kcmd_(); if (!k) return { ok: false, error: 'ключ команд не установлен' };
  var t = Number(e.parameter.t || 0), d = String(e.parameter.d || ''), s = String(e.parameter.s || '').toLowerCase();
  if (!t || Math.abs(Date.now() / 1000 - t) > 600 || !d || d.length > 12000 || !/^[0-9a-f]{64}$/.test(s)) return { ok: false, error: 'нет доступа' };
  if (hmacHex_(k, 'mx:' + t + ':' + sha256hex_(d)) !== s) return { ok: false, error: 'нет доступа' };
  var q; try { q = JSON.parse(d); } catch (x) { return { ok: false, error: 'bad' }; }
  if (!q || typeof q !== 'object') return { ok: false, error: 'bad' };
  var ca = CacheService.getScriptCache(), nk = 'mxs' + s.slice(0, 32);                           // одна подпись — один раз (повтор запроса без id)
  if (ca.get(nk)) {
    if (q.op === 'tgcall' && q.params && q.params._g4fx && /^(sendMessage|sendPhoto|sendDocument)$/.test(String(q.method)))
      return mx_tgcallDo(String(q.method), q.params);
    return { ok: false, error: 'повтор запроса' };
  }
  ca.put(nk, '1', 900);
  var op = String(q.op || 'post');
  try {
    if (op === 'ownercheck') return mx_ownerCheck_(q);
    if (op === 'ping') return { ok: true, pong: true, mode: 'google', key: true, groups: Object.keys(mx_groups()).length, push: mx_pushOn(), tg: !!P_().getProperty('TG_APP_URL') };
    if (op === 'chats') { var G = mx_groups(); return { ok: true, chats: Object.keys(G).map(function (c) { return { id: c, title: G[c].title, on: mx_groupOn(G[c]), channel: G[c].channel }; }) }; }
    if (op === 'read') return mx_opRead(q);
    if (op === 'hist') { var fh = mx_opGroup(q); if (!fh.ok) return fh; return { ok: true, title: fh.title, msgs: mx_histRead(fh.cid, q.since, q.n) }; }
    if (op === 'post') return q.poll ? mx_opPoll(q) : mx_opPost(q);
    if (op === 'dm') return mx_opDm(q);
    if (op === 'delete') return mx_opDelete(q);
    if (op === 'group') { if (!/^-?\d{1,20}$/.test(String(q.cid || '')) || !mx_groupGet(String(q.cid))) return { ok: false, error: 'нет такой группы' }; mx_groupSave(String(q.cid), { on: !!q.on, appr: !!q.on }); mx_log('admin', 'группа ' + q.cid + ' — пересылка ' + (q.on ? 'включена' : 'выключена')); return { ok: true }; }
    if (op === 'settings') { if (!q.k || !/^[a-z_]{2,30}$/.test(String(q.k))) return { ok: false, error: 'k' }; mx_setPut(String(q.k), q.v); return { ok: true }; }
    if (op === 'price') { var pr = mx_findRow('mx_price', String(q.id || ''), 1); return pr ? { ok: true, cid: String(pr.vals[1]), g: String(pr.vals[2]), mid: String(pr.vals[3]), uid: Number(pr.vals[4]) || 0, name: String(pr.vals[5]) } : { ok: false, error: 'нет такого запроса цены' }; }
    if (op === 'tgcall') return mx_tgcallDo(String(q.method || ''), q.params || {});
    if (op === 'import') return mx_importState(String(q.id || ''));
    return { ok: false, error: 'неизвестная команда' };
  } catch (x) { mx_log('err', 'команда ' + op + ': ' + mx_errText(x)); return { ok: false, error: 'ошибка: ' + mx_errText(x) }; }
}
/** Вызов Telegram-скрипта JSON-телом (формат relay.php): {op:'tgcall', key, method, params}. Ключ — общий (mx_maxKey). */
function mx_tgcallJson(u) {
  if (!mx_keyOk(String(u.key || ''))) return { ok: false, error_code: 403, description: 'нет доступа' };
  try { return mx_tgcallDo(String(u.method || ''), (u.params && typeof u.params === 'object') ? u.params : {}); }
  catch (x) { mx_log('err', 'tgcall ' + u.method + ': ' + mx_errText(x)); return { ok: false, error_code: 500, description: 'ошибка' }; }
}
/** Группа из запроса: q.cid (точный id) или q.g (часть названия). → {ok, cid, title} | {ok:false, error}. */
function mx_opGroup(q) {
  if (q.cid !== undefined && q.cid !== '') { var g = mx_groupGet(String(q.cid)); return g ? { ok: true, cid: String(q.cid), title: g.title } : { ok: false, error: 'нет группы бота с таким id' }; }
  var f = mx_findGroup(q.g);
  if (!f) return { ok: false, error: 'нет группы бота с таким названием' };
  if (f === 'many') return { ok: false, error: 'несколько групп подходят — уточните название' };
  return { ok: true, cid: f[0], title: f[1] };
}
function mx_opRead(q) {
  var f = mx_opGroup(q); if (!f.ok) return f;
  var prm = { chat_id: f.cid, count: Math.min(100, Number(q.n) || 50) }; if (Number(q.to) > 0) prm.to = Number(q.to); if (Number(q.from) > 0) prm.from = Number(q.from);   // 10.11: листание истории назад (to — до этого времени, мс)
  var r = api_('GET', '/messages', prm);
  if (!ok_(r[0])) return { ok: false, error: 'MAX ' + r[0] };
  return { ok: true, title: f.title, msgs: (r[1].messages || []).map(function (m) { return mx_normMsg(m, m.recipient || { chat_id: f.cid }); }) };
}
/** Публикация в группе (замечание 05); mid — ответ на сообщение. */
function mx_opPost(q) {
  var id = String(q.id || '').replace(/[^\w.-]+/g, '_').slice(0, 80), text = String(q.text || '').trim();
  if (!id) return { ok: false, error: 'нет метки id' }; if (!text) return { ok: false, error: 'нет текста' };
  if (q.price) {                                                                        // ответ по кнопке запроса цены (Telegram-скрипт): группа и сообщение — из листа mx_price
    var pr = mx_findRow('mx_price', String(q.price), 1); if (!pr) return { ok: false, error: 'нет такого запроса цены' };
    q.cid = String(pr.vals[1]); if (q.mid === undefined) q.mid = String(pr.vals[3] || '');
  }
  var f = mx_opGroup(q); if (!f.ok) return f;
  var rs = postReserve_(id, f.cid, f.title);
  if (rs === 'dup') return { ok: false, error: 'уже отправлено (id)', title: f.title };
  if (rs !== 'ok') return { ok: false, error: 'не удалось зарезервировать id (замок/таблица)' };
  var extra = {}; if (q.mid) extra.link = { type: 'reply', mid: String(q.mid) };
  var r = mx_sendChat(f.cid, text, extra);
  if (!ok_(r[0]) && q.mid && r[0] === 400) r = mx_sendChat(f.cid, text);              // сообщение для ответа уже удалено — без ссылки
  if (!ok_(r[0])) { postMark_(id, 'failed', '', 'MAX ' + r[0]); return { ok: false, error: 'MAX ' + r[0], title: f.title }; }
  var mid = String((((r[1] || {}).message || {}).body || {}).mid || '');
  if (!postMark_(id, 'sent', mid)) mx_log('err', 'post_ids: метка ' + id + ' не записана');
  mx_log('post', 'Claude → группа «' + f.title + '» (' + id + ')' + (q.mid ? ' ответ' : ''));
  return { ok: true, title: f.title, mid: mid };
}
/** Личное сообщение по uid или имени (замечание 10). */
function mx_opDm(q) {
  var id = String(q.id || '').replace(/[^\w.-]+/g, '_').slice(0, 80), text = String(q.text || '').trim();
  if (!id) return { ok: false, error: 'нет метки id' }; if (!text) return { ok: false, error: 'нет текста' };
  var uid = Number(q.uid) || 0, who = '';
  if (!uid && q.name) {
    var want = String(q.name).toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter(Boolean), G = mx_groups(), cand = {};
    Object.keys(G).forEach(function (c) {
      if (G[c].channel) return;
      var M = members_(c);
      Object.keys(M).forEach(function (u) {
        var nm = String(M[u]).toLowerCase().replace(/ё/g, 'е');
        if (want.every(function (w) { return nm.indexOf(w) >= 0; })) { if (!cand[u]) cand[u] = { uid: Number(u), name: M[u], groups: [] }; cand[u].groups.push(G[c].title || c); }
      });
    });
    var ck = Object.keys(cand);
    if (ck.length > 1) return { ok: false, error: 'несколько людей с таким именем — уточните (uid)', options: ck.map(function (k) { return cand[k]; }) };
    if (ck.length === 1) { uid = cand[ck[0]].uid; who = cand[ck[0]].name; }
  }
  if (!uid) return { ok: false, error: 'человек не найден среди участников групп бота' };
  if (mx_isBanned(who)) return { ok: false, error: 'этому человеку лично бот не пишет (правило 04.11)' };
  var rs = postReserve_(id, 'u' + uid, who);
  if (rs === 'dup') return { ok: false, error: 'уже отправлено (id)' };
  if (rs !== 'ok') return { ok: false, error: 'не удалось зарезервировать id' };
  var r = mx_sendUser(uid, text);
  if (!ok_(r[0])) { postMark_(id, 'failed', '', 'MAX ' + r[0]); return { ok: false, error: 'MAX ' + r[0] }; }
  postMark_(id, 'sent', String((((r[1] || {}).message || {}).body || {}).mid || ''));
  mx_log('post', 'Claude → личное ' + (who || uid) + ' (' + id + ')');
  return { ok: true, uid: uid, who: who };
}
/** Удаление сообщений бота (замечание 12): без точного user_id бота — ничего; только своё и только в известной группе. */
function mx_opDelete(q) {
  var mids = Array.isArray(q.mids) ? q.mids : (q.mid ? [q.mid] : []); if (!mids.length) return { ok: false, error: 'нет mids' };
  var me = mx_botUid(); if (!me) return { ok: false, error: 'не удалось определить бота (/me) — удаление остановлено' };
  var G = mx_groups(), out = [];
  mids.slice(0, 50).forEach(function (mid) {
    mid = String(mid); var g = api_('GET', '/messages/' + encodeURIComponent(mid)), m = g[1] || {}, s = m.sender || {}, rc = String(((m.recipient || {}).chat_id) || '');
    if (!ok_(g[0])) { out.push({ mid: mid, ok: false, why: 'не прочитано ' + g[0] }); return; }
    if (!rc || !G[rc]) { out.push({ mid: mid, ok: false, why: 'чат не из групп бота' }); return; }
    if (!s.is_bot || String(s.user_id || '') !== me) { out.push({ mid: mid, ok: false, why: 'не сообщение этого бота' }); return; }
    var r = api_('DELETE', '/messages', { message_id: mid });
    out.push({ mid: mid, ok: ok_(r[0]), why: ok_(r[0]) ? '' : 'MAX ' + r[0] });
    Utilities.sleep(500);
  });
  mx_log('admin', 'удаление: ' + out.filter(function (x) { return x.ok; }).length + ' из ' + out.length);
  return { ok: true, res: out };
}

// REDACTED_B64 опросы в группах (перенос lib.php: mx_poll_*; файлы «Фабрика — боты/MAX/polls/<id>.json»)
function mx_pollId(s) { s = String(s || ''); return /^[A-Za-z0-9_.-]{1,32}$/.test(s) ? s : ''; }
function mx_pollGet(id) { id = mx_pollId(id); if (!id) return null; var p = jget_('polls', id + '.json', null); return p && p.id ? p : null; }
function mx_pollMsk(t) { return mx_msk('dd.MM HH:mm', new Date(Number(t) * 1000)); }
/** Проверка опроса: [опрос, ''] или [null, 'что не так']. Срок: deadline_iso, иначе через 24 ч; не раньше чем через 10 минут, не позже 14 дней. */
function mx_pollCheck(p) {
  if (!p || typeof p !== 'object') return [null, 'нет опроса'];
  var id = mx_pollId(p.id); if (!id) return [null, 'id: латиница, цифры, _ . - (до 32)'];
  var title = String(p.title || '').trim(); if (!title || title.length > 200) return [null, 'title: 1–200 знаков'];
  var intro = String(p.intro || '').trim(); if (intro.length > 1500) return [null, 'intro: до 1500 знаков'];
  var qs = p.questions; if (!Array.isArray(qs) || qs.length < MX_POLL_Q_MIN || qs.length > MX_POLL_Q_MAX) return [null, 'вопросов должно быть ' + MX_POLL_Q_MIN + '–' + MX_POLL_Q_MAX];
  var Q = [];
  for (var i = 0; i < qs.length; i++) {
    var q = qs[i] || {}, t = String(q.q || '').trim(), o = q.opts;
    if (!t || t.length > 600) return [null, 'вопрос ' + (i + 1) + ': текст 1–600 знаков'];
    if (!Array.isArray(o) || o.length !== MX_POLL_OPTS) return [null, 'вопрос ' + (i + 1) + ': ровно ' + MX_POLL_OPTS + ' варианта'];
    var O = o.map(function (x) { return String(x).trim(); });
    if (O.some(function (x) { return !x || x.length > 64; })) return [null, 'вопрос ' + (i + 1) + ': вариант 1–64 знака'];
    var low = {}; O.forEach(function (x) { low[x.toLowerCase()] = 1; }); if (Object.keys(low).length !== MX_POLL_OPTS) return [null, 'вопрос ' + (i + 1) + ': варианты повторяются'];
    Q.push({ q: t, o: O, mid: '' });
  }
  var now = Math.floor(Date.now() / 1000), dl = now + 86400;
  if (String(p.deadline_iso || '').trim()) { var dt = new Date(String(p.deadline_iso)).getTime(); if (isNaN(dt)) return [null, 'deadline_iso: не дата']; dl = Math.floor(dt / 1000); }
  if (dl < now + 600 || dl > now + 14 * 86400) return [null, 'срок — от 10 минут до 14 дней'];
  return [{ id: id, title: title, intro: intro, deadline: dl, q: Q }, ''];
}
function mx_pollKb(id, qi, opts) { return { attachments: [{ type: 'inline_keyboard', payload: { buttons: opts.map(function (o, oi) { return [{ type: 'callback', text: o, payload: 'poll:' + id + ':' + qi + ':' + oi }]; }) } }] }; }
/** Публикация опроса (или продолжение после сбоя): вступление и по сообщению на вопрос. → {ok, sent, n, err}. */
function mx_pollPublish(cid, title, P) {
  var name = P.id + '.json', cur = jget_('polls', name, null);
  if (!cur) {
    var init = { id: P.id, title: P.title, intro: P.intro, deadline: P.deadline, q: P.q, cid: String(cid), group: String(title), created: Math.floor(Date.now() / 1000), intro_mid: '', a: {} };
    if (jrmw_('polls', name, null, function (x) { return x ? null : init; }) === false) return { ok: false, sent: 0, n: P.q.length, err: 'запись опроса' };
    cur = jget_('polls', name, null);
  }
  if (String(cur.cid) !== String(cid)) return { ok: false, sent: 0, n: (cur.q || []).length, err: 'опрос с этим id уже начат в другой группе' };
  var sent = 0, err = '';
  if (!cur.intro_mid) {
    var txt = '<b>Опрос: ' + h_(cur.title) + '</b>' + (cur.intro ? '\n' + h_(cur.intro) : '') + '\n\nВопросов: ' + cur.q.length + '. Под каждым — три варианта, нажмите один; передумали — нажмите другой.' +
              '\nОтветы с именами видит только Сотрудник Отчество — в группе их не видит никто.\nОтвечать до ' + mx_pollMsk(cur.deadline) + ' МСК.';
    var r0 = mx_sendChat(cid, txt); if (!ok_(r0[0])) return { ok: false, sent: 0, n: cur.q.length, err: 'MAX ' + r0[0] };
    var im = String((((r0[1] || {}).message || {}).body || {}).mid || '-');
    jrmw_('polls', name, null, function (x) { x.intro_mid = im; return x; });
  }
  for (var qi = 0; qi < cur.q.length; qi++) {
    if (cur.q[qi].mid) { sent++; continue; }
    Utilities.sleep(250);
    var r = mx_sendChat(cid, '<b>Вопрос ' + (qi + 1) + ' из ' + cur.q.length + '.</b> ' + h_(cur.q[qi].q), mx_pollKb(cur.id, qi, cur.q[qi].o));
    if (!ok_(r[0])) { err = 'MAX ' + r[0] + ' на вопросе ' + (qi + 1); break; }
    var mid = String((((r[1] || {}).message || {}).body || {}).mid || '-');
    jrmw_('polls', name, null, (function (i, mm) { return function (x) { x.q[i].mid = mm; return x; }; })(qi, mid));
    sent++;
  }
  return { ok: !err, sent: sent, n: cur.q.length, err: err };
}
/** op post с poll (как post.php mx_post_poll): тот же id ещё раз — опубликован целиком → отказ; оборвался — допубликуются оставшиеся вопросы. */
function mx_opPoll(q) {
  var ck = mx_pollCheck(q.poll), P = ck[0]; if (!P) return { ok: false, error: 'опрос: ' + ck[1] };
  var f = mx_opGroup(q); if (!f.ok) return f;
  var cur = mx_pollGet(P.id);
  if (cur && cur.intro_mid && !(cur.q || []).some(function (x) { return !x.mid; })) return { ok: false, error: 'опрос с этим id уже опубликован', title: String(cur.group || '') };
  var key = 'poll_' + P.id, rs = postReserve_(key, f.cid, f.title);
  if (rs === 'dup') { var pr = findRow_('post_ids', key); if (pr && pr.vals[1] instanceof Date && Date.now() - pr.vals[1].getTime() < 300000) return { ok: false, error: 'этот опрос уже публикуется — подождите 5 минут и проверьте' }; postMark_(key, 'failed', '', 'повтор'); postReserve_(key, f.cid, f.title); }
  var r = mx_pollPublish(f.cid, f.title, P);
  mx_log('poll', 'опрос ' + P.id + ' в группе «' + f.title + '»: ' + (r.ok ? 'ok' : 'ошибка ' + r.err) + ', вопросов ' + r.sent + '/' + r.n);
  postMark_(key, r.ok ? 'sent' : 'failed', '', r.ok ? '' : r.err);
  if (!r.ok) return { ok: false, error: r.err, title: f.title, sent: r.sent, n: r.n };
  return { ok: true, title: f.title, sent: r.sent, n: r.n, deadline: mx_pollMsk((mx_pollGet(P.id) || {}).deadline || 0) + ' МСК' };
}
/** Нажатие кнопки опроса: ответ записывается (повтор заменяет прежний), человеку — «Ответ принят». Имена — только в файле опроса. */
function mx_pollAnswer(u) {
  var cb = u.callback || {}, cbid = String(cb.callback_id || ''), m = String(cb.payload || '').match(/^poll:([A-Za-z0-9_.-]{1,32}):(\d{1,2}):(\d)$/);
  if (!m) return mx_answerCb(cbid, 'Опрос не найден.');
  var id = m[1], qi = Number(m[2]), oi = Number(m[3]), user = cb.user || {}, uid = String(Number(user.user_id || 0));
  if (uid === '0') return mx_answerCb(cbid, 'Не удалось определить, кто ответил.');
  var name = mx_name(user).replace(/\s*\(@[^)]*\)$/, '').slice(0, 80), cid = String((((u.message || {}).recipient) || {}).chat_id || '');
  if (!mx_pollGet(id)) return mx_answerCb(cbid, 'Опрос не найден.');
  var res = 'nf', opt = '';
  var r = jrmw_('polls', id + '.json', null, function (p) {
    if (!p || !p.q || !p.q[qi] || !p.q[qi].o || p.q[qi].o[oi] === undefined) { res = 'nf'; return null; }
    if (cid && String(p.cid || '') !== cid) { res = 'nf'; return null; }
    if (Date.now() / 1000 > Number(p.deadline || 0) || p.closed) { res = 'closed'; return null; }
    opt = p.q[qi].o[oi]; var a = p.a || {}, k = 'q' + qi; a[k] = a[k] || {}; var prev = a[k]['u' + uid] ? a[k]['u' + uid].o : null;
    res = prev === null ? 'new' : (Number(prev) === oi ? 'same' : 'changed');
    a[k]['u' + uid] = { o: oi, n: name, t: Math.floor(Date.now() / 1000) }; p.a = a; return p;
  });
  if (r === false) return mx_answerCb(cbid, 'Не получилось записать ответ — нажмите ещё раз.');
  if (res === 'nf') return mx_answerCb(cbid, 'Опрос не найден.');
  if (res === 'closed') return mx_answerCb(cbid, 'Опрос завершён — ответы больше не принимаются.');
  mx_log('poll', 'опрос ' + id + ': ответ на вопрос ' + (qi + 1) + (res === 'changed' ? ' (изменён)' : ''));   // без имени и варианта
  mx_answerCb(cbid, (res === 'changed' ? 'Ответ изменён: ' : 'Ответ принят: ') + opt);
}
/** Итоги для владельца (HTML MAX): по каждому вопросу — сколько за каждый вариант и кто как ответил. */
function mx_pollSummary(p) {
  var a = p.a || {}, all = {};
  Object.keys(a).forEach(function (k) { Object.keys(a[k] || {}).forEach(function (u) { all[u] = (a[k][u] || {}).n || u; }); });
  var done = Date.now() / 1000 > Number(p.deadline || 0);
  var L = ['<b>Итоги опроса «' + h_(p.title || '') + '»</b> (' + h_(p.id || '') + ')', 'Группа: ' + h_(p.group || '') + '; срок ' + mx_pollMsk(p.deadline || 0) + ' МСК' + (done ? ' — завершён' : ' — идёт'), 'Ответили: ' + Object.keys(all).length + ' чел.'];
  (p.q || []).forEach(function (q, qi) {
    var qa = a['q' + qi] || {}, by = [[], [], []];
    Object.keys(qa).forEach(function (u) { var o = Number((qa[u] || {}).o); if (by[o]) by[o].push(String((qa[u] || {}).n || u)); });
    L.push(''); L.push('<b>' + (qi + 1) + '. ' + h_(q.q) + '</b> — ответов ' + Object.keys(qa).length);
    (q.o || []).forEach(function (o, oi) { by[oi].sort(); L.push('• ' + h_(o) + ' — ' + by[oi].length + (by[oi].length ? ': ' + h_(by[oi].join(', ')) : '')); });
  });
  return L.join('\n');
}

// REDACTED_B64 op tgcall: Telegram-скрипт → MAX (перенос relay.php: mx_relay и помощники)
function mx_tgErr(d) { return { ok: false, error_code: 400, description: String(d) }; }
function mx_tgUid(chat) { var c = Number(chat) || 0; return c >= MX_ID_BASE ? c - MX_ID_BASE : 0; }
/** HTML Telegram → HTML MAX: теги, которых в MAX нет, убираем, текст оставляем. */
function mx_tgHtml(s) { return String(s || '').replace(/<\/?(tg-spoiler|blockquote|span)[^>]*>/gi, ''); }
/** Кнопки Telegram → inline_keyboard MAX; обычная клавиатура → кнопки «message»; [] — без кнопок; null — разметки нет. */
function mx_tgKb(rm) {
  if (!rm || typeof rm !== 'object') return null;
  var rows = [];
  if (rm.inline_keyboard) (rm.inline_keyboard || []).forEach(function (r) {
    var row = []; (r || []).forEach(function (b) {
      var t = String(b.text || '').slice(0, 128);
      if (b.url) row.push({ type: 'link', text: t, url: String(b.url) });
      else if (b.callback_data !== undefined) row.push({ type: 'callback', text: t, payload: String(b.callback_data) });
      else if (b.web_app && b.web_app.url) row.push({ type: 'link', text: t, url: String(b.web_app.url) });
    });
    if (row.length) rows.push(row.slice(0, 7));
  });
  else if (rm.keyboard) (rm.keyboard || []).forEach(function (r) {
    var row = []; (r || []).forEach(function (b) { var t = typeof b === 'object' ? String(b.text || '') : String(b); if (t) row.push({ type: 'message', text: t.slice(0, 128) }); });
    if (row.length) rows.push(row.slice(0, 7));
  });
  else return [];
  return rows.length ? [{ type: 'inline_keyboard', payload: { buttons: rows.slice(0, 30) } }] : [];
}
function mx_tgBody(p, textKey) {
  var b = {}, t = String(p[textKey || 'text'] || ''), pm = String(p.parse_mode || '').toLowerCase();
  b.text = (pm === 'html' ? mx_tgHtml(t) : t).slice(0, 3990);
  if (pm === 'html') b.format = 'html'; else if (pm === 'markdown' || pm === 'markdownv2') b.format = 'markdown';
  if (p.reply_markup !== undefined) { var k = mx_tgKb(p.reply_markup); if (k !== null) b.attachments = k; }
  if (p.reply_to_message_id) b.link = { type: 'reply', mid: String(p.reply_to_message_id) };
  return b;
}
/** Тексты отправленных зеркалом сообщений (лист mx_sent): чтобы снять кнопки, MAX нужен текст целиком. */
function mx_tgRemember(mid, body) {
  if (!mid) return;
  try {
    var r = mx_findRow('mx_sent', mid, 1), o = { text: body.text || '', format: body.format || '', t: new Date() };
    if (r) mx_setObj('mx_sent', r.row, o); else { o.mid = mid; mx_appendObj('mx_sent', o); var sh = mx_sheet('mx_sent'); if (sh.getLastRow() > 600) sh.deleteRows(2, 300); }
  } catch (x) { mx_log('err', 'mx_sent: ' + mx_errText(x)); }
}
function mx_tgMsgResult(j, chat) {
  var m = (j || {}).message || j || {}, mid = String(((m.body || {}).mid) || '');
  return { message_id: mid, chat: { id: Number(chat), type: 'private' }, date: Math.floor(Number(m.timestamp || Date.now()) / 1000), text: String((m.body || {}).text || '') };
}
function mx_tgSend(chat, body, p) {
  var uid = mx_tgUid(chat); if (!uid) return mx_tgErr('чат не из MAX');
  var qs = { user_id: uid }; if (p.disable_web_page_preview || (p.link_preview_options && p.link_preview_options.is_disabled)) qs.disable_link_preview = 'true';
  var r = api_('POST', '/messages', qs, body);
  if (r[0] === 400 && body.format) { var b2 = {}; Object.keys(body).forEach(function (k) { b2[k] = body[k]; }); b2.text = String(body.text).replace(/<[^>]+>/g, ''); delete b2.format; r = api_('POST', '/messages', qs, b2); }
  if (!ok_(r[0])) return mx_tgErr('MAX ' + r[0] + ': ' + String((r[1] || {}).message || (r[1] || {}).code || ''));
  var res = mx_tgMsgResult(r[1], chat); mx_tgRemember(res.message_id, body); return { ok: true, result: res };
}
/** Загрузка файла в MAX: адрес загрузки → файл → токен вложения. */
function mx_tgUpload(kind, name, bytes) {
  var r = api_('POST', '/uploads', { type: kind }); if (!ok_(r[0]) || !(r[1] || {}).url) return null;
  var up = UrlFetchApp.fetch(String(r[1].url), { method: 'post', muteHttpExceptions: true, payload: { data: Utilities.newBlob(bytes, 'application/octet-stream', name) } });
  var hc = up.getResponseCode(), u = null; try { u = JSON.parse(up.getContentText()); } catch (x) { u = null; }
  if (hc < 200 || hc >= 300) return null;
  if (r[1].token) return { token: r[1].token };                       // видео и аудио: токен выдан заранее
  if (u && typeof u === 'object') return u.token ? { token: u.token } : u;   // фото: {photos:{…}} — как есть
  return null;
}
function mx_tgSendMedia(p, kind, field) {
  var chat = p.chat_id || 0, src = p[field] || '', body = mx_tgBody({ text: p.caption || '', parse_mode: p.parse_mode || '', reply_markup: p.reply_markup }), att = null;
  if (typeof src === 'string' && src.indexOf('max:') === 0) { var f = mx_fileGet(src); if (f && f.tok) att = { type: f.k === 'image' ? 'image' : 'file', payload: { token: f.tok } }; }
  else if (typeof src === 'string' && /^https?:\/\//.test(src) && kind === 'image') att = { type: 'image', payload: { url: src } };
  else if (src && typeof src === 'object' && src.b64) { var pl = mx_tgUpload(kind, String(src.name || 'file'), Utilities.base64Decode(String(src.b64))); if (pl) att = { type: kind, payload: pl }; }
  if (!att) { body.text = (body.text + '\n' + (kind === 'image' ? '(фото — в Telegram-боте)' : '(файл — в Telegram-боте)')).trim(); return mx_tgSend(chat, body, p); }
  body.attachments = [att].concat(body.attachments || []);
  var res = null;
  for (var i = 0; i < 4; i++) {                                        // файл ещё обрабатывается — MAX просит подождать
    res = mx_tgSend(chat, body, p);
    if (res.ok || String(res.description || '').indexOf('not.ready') < 0) return res;
    Utilities.sleep(2000);
  }
  return res;
}
/** Метод Telegram → MAX Bot API (перенос mx_relay). */
function mx_tgcallRaw(method, p) {
  switch (method) {
    case 'sendMessage': return mx_tgSend(p.chat_id || 0, mx_tgBody(p), p);
    case 'editMessageText': {
      var mid = String(p.message_id || ''); if (!mid) return mx_tgErr('нет message_id');
      var b = mx_tgBody(p), r = api_('PUT', '/messages', { message_id: mid }, b);
      if (!ok_(r[0])) return mx_tgErr('MAX ' + r[0] + ': ' + String((r[1] || {}).message || ''));
      mx_tgRemember(mid, b); return { ok: true, result: { message_id: mid, chat: { id: Number(p.chat_id) || 0 } } };
    }
    case 'editMessageReplyMarkup': {
      var mid2 = String(p.message_id || ''), s = mid2 ? mx_findRow('mx_sent', mid2, 1) : null;
      if (!s) return { ok: true, result: true };                        // текста не знаем — кнопки оставляем (правка без текста стёрла бы его)
      var b2 = { text: String(s.vals[1] || ''), attachments: mx_tgKb(p.reply_markup || {}) || [] }; if (s.vals[2]) b2.format = String(s.vals[2]);
      var r2 = api_('PUT', '/messages', { message_id: mid2 }, b2);
      return ok_(r2[0]) ? { ok: true, result: true } : mx_tgErr('MAX ' + r2[0]);
    }
    case 'deleteMessage': { var r3 = api_('DELETE', '/messages', { message_id: String(p.message_id || '') }); return ok_(r3[0]) ? { ok: true, result: true } : mx_tgErr('MAX ' + r3[0]); }
    case 'answerCallbackQuery': {
      var id = String(p.callback_query_id || ''); if (id.indexOf('max:') === 0) id = id.slice(4);
      if (!id || !p.text) return { ok: true, result: true };
      var r4 = api_('POST', '/answers', { callback_id: id }, { notification: String(p.text).slice(0, 200) });
      return { ok: ok_(r4[0]), result: ok_(r4[0]) };
    }
    case 'sendPhoto': return mx_tgSendMedia(p, 'image', 'photo');
    case 'sendDocument': return mx_tgSendMedia(p, 'file', 'document');
    case 'getFile': {
      var f = mx_fileGet(String(p.file_id || '')); if (!f || !f.url) return mx_tgErr('файл не найден');
      return { ok: true, result: { file_id: String(p.file_id), file_path: null, url: f.url, file_name: f.n } };
    }
    case 'sendChatAction': case 'setMyDescription': case 'setMyShortDescription': return { ok: true, result: true };
    case 'setMyCommands': {
      var cmds = (p.commands || []).map(function (c) { return { name: String(c.command || ''), description: String(c.description || '').slice(0, 120) }; });
      var r5 = api_('PATCH', '/me', null, { commands: cmds }); return { ok: ok_(r5[0]), result: ok_(r5[0]) };
    }
  }
  return mx_tgErr('метод ' + method + ' в MAX не поддерживается');
}

// REDACTED_B64 импорт состояния с хостинга (шаг 0 → Google). НЕ запускать до переключения.
/** Копия «Фабрика — портал/Перенос MAX <id>» (max_move.py) → листы и файлы этого проекта: группы, настройки, владелец, зеркало, опросы, справка,
    журнал обращений, история групп (hist/<cid>.json и history_all.json → Диск «история»). Повторный запуск ничего не дублирует. → {ok, done:[…], skipped:[…]}. */
function mx_importState(id) {
  id = String(id || 'max-2026-11-04'); if (!/^[\w.-]{3,40}$/.test(id)) return { ok: false, error: 'id' };
  var t0 = Date.now(), mv = moveImport_(id); if (!mv.ok && !mv.done) return { ok: false, error: 'копия не принята: ' + (mv.err || (mv.bad || []).join('; ')) };
  if (mv.left) return { ok: false, error: 'копия принята не до конца (осталось ' + mv.left + ') — запустите ещё раз', done: [], skipped: [] };
  var done = [], skipped = [], key = kcmdBytes_(), man = null;
  try { var mi = folder_(MOVE_PARENT + '/Перенос MAX ' + id).getFilesByName('manifest.bin'); man = mi.hasNext() && key ? JSON.parse(t14open_(key, mi.next().getBlob().getDataAsString()) || 'null') : null; } catch (x) { man = null; }
  var files = ((man || {}).files || []).map(function (f) { return String(f.name || ''); });
  // GPT B4 (05.11): контрольная точка по id копии (файл move/_state.json: applied[id][раздел]) — повтор того же импорта разделы groups/owner/mirror/
  // settings/hello/polls/grp_owner не применяет второй раз (настройки и включённость групп, изменённые после переключения, не затираются),
  // продолжается только история (она идемпотентна по mid). Новая копия (другой id) применяет всё — это новое состояние с хостинга.
  var ck = jget_('move', '_state.json', { applied: {} }); ck.applied = ck.applied || {}; var ap = ck.applied[id] = ck.applied[id] || {};
  function once(sec, fn) { if (ap[sec]) { skipped.push(sec + ': уже применено из ' + id); return; } fn(); ap[sec] = new Date().toISOString(); jput_('move', '_state.json', ck); }
  function J(name) { var t = st_moveText(name); if (t === null) return null; try { return JSON.parse(t); } catch (x) { skipped.push(name + ': не JSON'); return null; } }
  var g = J('max/groups.json');                                        // группы: on/appr/channel/title
  if (g) once('groups', function () { Object.keys(g).forEach(function (cid) { var e = g[cid] || {}; if (!/^-?\d+$/.test(cid)) return; var appr = !('appr' in e) || !!e.appr, on = appr && (!('on' in e) || !!e.on);
    mx_groupSave(cid, { title: String(e.title || ''), on: on, appr: appr, channel: !!e.channel }); }); done.push('groups: ' + Object.keys(g).length); });
  var cfg = J('max/config.json');                                      // владелец (OWNER_UID, если ещё не привязан), зеркало, настройки фраз/адресатов (секретов в копии нет)
  if (cfg) once('config', function () {
    var ou = Number((cfg.owner || {}).user_id || 0);
    if (ou && !mx_ownerUid()) { P_().setProperty('OWNER_UID', String(ou)); done.push('owner'); } else if (ou) skipped.push('owner: уже привязан в Google — не заменён');
    if ('mirror' in cfg) { mx_setPut('mirror', cfg.mirror ? '' : '0'); done.push('mirror'); }
    var st = cfg.settings || {}, d = mx_defaults(), ns = 0;
    Object.keys(st).forEach(function (k) { if (k in d) { mx_setPut(k, st[k]); ns++; } });
    done.push('settings: ' + ns);
  });
  var hello = J('max/hello.json');                                     // справка раз в 12 ч — последние 300
  if (hello) once('hello', function () { var H = Object.keys(hello).sort(function (a, b) { return hello[b] - hello[a]; }).slice(0, 300); H.forEach(function (u) { if (!mx_findRow('mx_hello', String(u), 1)) mx_appendObj('mx_hello', { uid: String(u), t: new Date(Number(hello[u]) * 1000) }); }); done.push('hello: ' + H.length); });
  var np = 0;                                                          // опросы — файлы max/polls/<id>.json (имена — из manifest)
  files.forEach(function (nm) { if (nm.indexOf('max/polls/') !== 0) return; var p = J(nm); if (p && p.id && !mx_pollGet(p.id)) { jput_('polls', mx_pollId(p.id) + '.json', p); np++; } }); if (np) done.push('polls: ' + np);
  var go = st_moveText('max/grp_owner.jsonl');                         // журнал обращений к владельцу — последние 1000 строк, без дублей по (k, ts, cid, mid, uid)
  if (go !== null) once('grp_owner', function () {
    var have = {}; mx_rows('mx_grp_owner').forEach(function (r) { have[mx_grpKey(r)] = 1; });
    var L = go.split('\n').filter(Boolean).slice(-1000), n = 0;
    L.forEach(function (line) { try { var o = JSON.parse(line); if (o && o.k && !have[mx_grpKey(o)]) { have[mx_grpKey(o)] = 1; mx_grpLog(o); n++; } } catch (x) {} });
    done.push('grp_owner: ' + n);
  });
  var nh = 0, late = false;                                            // история: hist/<cid>.json ({title, msgs:{mid: norm_msg}}) и history_all.json → Диск «история» помесячно
  files.forEach(function (nm) {
    if (!/^max\/hist\/-?\d+\.json$/.test(nm) && nm !== 'max/history_all.json') return;
    if (Date.now() - t0 > 270000) { late = true; return; }           // не влезаем в 6 минут — остальное при повторном запуске (повтор ничего не дублирует)
    var h = J(nm); if (!h || !h.msgs) return;
    var cid = nm === 'max/history_all.json' ? String(h.cid || '-100000000000') : nm.replace(/^max\/hist\/|\.json$/g, ''), title = String(h.title || mx_groupTitle(cid));
    nh += mx_histImport(cid, title, Object.keys(h.msgs).map(function (k) { return h.msgs[k]; }), key);
  });
  if (nh) done.push('history: ' + nh);
  if (late) skipped.push('history: не всё — время вышло, запустите mx_importState ещё раз');
  mx_log('import', 'импорт ' + id + ': ' + done.join(', ') + (skipped.length ? '; пропущено: ' + skipped.join('; ') : ''));
  return { ok: true, done: done, skipped: skipped };
}
/** Стабильный ключ записи журнала обращений (строка листа или запись grp_owner.jsonl): k | ts | cid | mid | uid. */
function mx_grpKey(o) { return [o.k, Number(o.ts) || 0, String(o.cid || ''), String(o.mid || ''), String(o.uid || '')].join('|'); }
/** Записи norm_msg хостинга → файлы «история/<группа>/<ГГГГ-ММ>.bin» (пакет на месяц; в уже существующий файл дописываются только записи
    с новыми mid — hist/<cid>.json и history_all.json пересекаются, повторный импорт ничего не дублирует). → сколько записей добавлено. */
function mx_histImport(cid, title, msgs, key) {
  if (!key) return 0;
  var by = {}, n = 0;
  msgs.forEach(function (m) { var ts = Number(m.ts || 0); if (!ts || !m.mid) return; var ym = mx_msk('yyyy-MM', new Date(ts)); (by[ym] = by[ym] || []).push(m); });
  var dir = folder_(BOT_DIR + '/' + MAX_DIR + '/' + MX_HIST_DIR + '/' + (mx_histSafeName(title) || ('группа ' + cid)));
  Object.keys(by).forEach(function (ym) {
    var it = dir.getFilesByName(ym + '.bin'), f = it.hasNext() ? it.next() : null, have = {}, cur = '';
    if (f) {
      cur = f.getBlob().getDataAsString('UTF-8');
      st_t14openAll(key, cur).forEach(function (txt) { String(txt || '').split('\n').forEach(function (line) { var i = line.indexOf('"mid":"'); if (i >= 0) have[line.slice(i + 7).split('"')[0]] = 1; }); });
    }
    var fresh = by[ym].filter(function (m) { return !have[String(m.mid)]; }); if (!fresh.length) return;
    var lines = fresh.sort(function (a, b) { return Number(a.ts) - Number(b.ts); }).map(function (m) {
      return JSON.stringify({ ts: Number(m.ts), cid: cid, g: title, mid: String(m.mid || ''), uid: m.uid === undefined ? null : m.uid, name: String(m.name || ''), bot: !!m.bot, text: String(m.text || ''),
                              rmid: String(m.rmid || ''), ruid: m.ruid === undefined ? null : m.ruid, rname: String(m.rname || ''), att: [], ment: m.mentions || [], src: 'host' });
    }).join('\n');
    var pack = st_t14seal(key, lines);
    if (f) f.setContent(cur + (cur && !/\n$/.test(cur) ? '\n' : '') + pack + '\n'); else dir.createFile(ym + '.bin', pack + '\n', 'text/plain');
    n += fresh.length;
  });
  return n;
}

// Durable send receipt: pending means unknown, never permission to send again.
// No ScriptLock is held while calling MAX API.
function mx_tgcallDo(method, p) {
  p = p || {};
  var id = String(p._g4fx || '');
  if (!id || !/^(sendMessage|sendPhoto|sendDocument)$/.test(method)) return mx_tgcallRaw(method, p);
  if (!/^\d{1,17}:\d{1,6}$/.test(id)) return mx_tgErr('bad operation id');
  var clean = {}; Object.keys(p).sort().forEach(function (k) { if (k !== '_g4fx') clean[k] = p[k]; });
  var key = 'mx_receipt_' + sha256hex_(id + ':' + method + ':' + String(p.chat_id)).slice(0, 40);
  var hash = sha256hex_(JSON.stringify(clean)), lock = LockService.getScriptLock();
  var uncertain = function () { return { ok: false, error_code: 409, state: 'uncertain', description: 'delivery_unknown' }; };
  var retry = function (why, code) { return { ok: false, error_code: code || 503, state: 'retry', description: why }; };
  if (!lock.tryLock(1000)) return retry('receipt_busy');
  var ps, now;
  try {
    ps = P_(); now = Date.now();
    var raw = ps.getProperty(key), prev = null;
    if (raw !== null) {
      try { prev = JSON.parse(raw); } catch (bad) { console.log('mxsend receipt_invalid ' + key.slice(-12)); return uncertain(); }
      if (!prev || typeof prev.hash !== 'string' || !isFinite(prev.until)) return uncertain();
    }
    if (prev && prev.until > now) {
      console.log('mxsend receipt ' + key.slice(-12) + ' ' + (prev.result ? 'sent' : 'uncertain'));
      if (prev.hash !== hash) return uncertain();
      return prev.result || uncertain();
    }
    if (now - Number(ps.getProperty('mx_receipt_clean') || 0) > 600000) {
      var all = ps.getProperties();
      Object.keys(all).forEach(function (k) {
        if (!/^mx_receipt_[0-9a-f]{40}$/.test(k)) return;
        var v; try { v = JSON.parse(all[k]); } catch (bad) { return; }
        if (v && isFinite(v.until) && v.until <= now) ps.deleteProperty(k);
      });
      ps.setProperty('mx_receipt_clean', String(now));
    }
    ps.setProperty(key, JSON.stringify({ hash: hash, until: now + 86400000 }));
  } catch (e) {
    // No MAX request has been started. A later attempt must obtain a receipt first.
    console.log('mxsend receipt_store_retry ' + key.slice(-12));
    return retry('receipt_store_unavailable');
  } finally { lock.releaseLock(); }
  var r;
  try { r = mx_tgcallRaw(method, clean); }
  catch (e) { console.log('mxsend uncertain ' + key.slice(-12)); return uncertain(); }
  var match = String(r && r.description || '').match(/^MAX (4\d\d)(?::|$)/);
  var rejected = !!match && Number(match[1]) !== 408, cleared = false;
  if (lock.tryLock(1000)) {
    try {
      if (r && r.ok) {
        // Store identifiers only. Whole reply text can exhaust ScriptProperties.
        var result = r.result || {}, packed = { ok: true, result: {
          message_id: String(result.message_id || ''), chat: { id: Number(p.chat_id) },
          date: Number(result.date) || 0
        } };
        ps.setProperty(key, JSON.stringify({ hash: hash, until: now + 86400000, result: packed }));
        console.log('mxsend sent ' + key.slice(-12));
      } else if (rejected) { ps.deleteProperty(key); cleared = true; }
    } catch (e) { console.log('mxsend receipt_finish_failed ' + key.slice(-12)); }
    finally { lock.releaseLock(); }
  } else { console.log('mxsend receipt_finish_busy ' + key.slice(-12)); }
  // A successful API response remains successful even if persisting it failed.
  // Its pending receipt still prevents an automatic duplicate after response loss.
  if (r && r.ok) return r;
  if (rejected && Number(match[1]) === 429 && cleared) return retry('max_rate_limit', 429);
  return rejected && cleared ? r : uncertain();
}
