/* «Фабрика — бот MAX» (Google 1c@) — TimersCtl.gs: контроль сроков в группе «Коммерческий отдел» (перенос mx_ctl.py) и напоминания
   о вопросах без ответа с эскалацией поручений (перенос remind.py). Шаг 3, ночь 05.11.2026.
   Т. В. 27.10: «такие отчёты с чётким пониманием даты бери на контроль и пиши в группе вопросы по наступлению даты и до получения ответа»;
   28.10 23:20: «бот обязан смотреть, что в чате есть вопрос и нет ответа… напоминать до ответа: в чате до конца рабочего дня, вечером письмом,
   утром в чат и почту»; 03.11: руководству и участникам совещания (leaders) бот вопросов не задаёт — их пункты переназначаются адресату или закрываются.
   Источник сообщений — история групп tm/hist_<cid>.json (из очереди max_in, tm_ingest_). Состояние — tm/ctl.json и tm/remind.json
   (формат тот же, что на хостинге — импорт tm_importState продолжает с того же места). Портал — rem.bin («От ботов»).
   Сообщения — tm_send_ (с отметкой в tm_sent), письма — tm_mail_. Тихие часы 19:00–07:00 и праздники — ничего людям:
   вечернее письмо лестницы и эскалации — в 18:00–18:59 (на хостинге было 19:00). */

var TM_ASK_HOUR = 10, TM_MAX_ASKS = 1, TM_REM_MAX_WD = 2, TM_LEAD_MAX_WD = 20;   // 12.11 (2), Т. В.: «сыпем один и тот же вопрос несколько раз — такого быть не должно»: пункт спрашиваем ОДИН раз (повтор — только по новой дате из ответа), дальше — сводка владельцу   // 12.11.2026 (Т. В.: «бот по 5 раз задаёт вопросы, на которые уже есть ответы… такого повторяться больше не должно»): пункт спрашиваем не больше 2 раз, вопрос без ответа напоминаем 1 раз; дальше — только в сводку владельцу
var TM_WD_NAMES = { 'понедельник': 0, 'вторник': 1, 'среду': 2, 'среда': 2, 'четверг': 3, 'пятницу': 4, 'пятница': 4, 'субботу': 5, 'суббота': 5, 'воскресенье': 6 };
var TM_REQ = /(?<![а-яё])(прошу|просим|просьба|жду|ждём|ждем|ожидаю|ожидаем|необходимо|нужно|заполнить|прислать|предоставить|подготовить|сдать|сформировать|проверить|сообщить|направить|отправить)(?![а-яё])/i;
var TM_FUT = /(?<![а-яё])(заберут|оплатят|оплатит|отгрузим|отгрузят|пришлю|пришлют|пришлёт|дадут|даст|будет|будут|сделаю|сделаем|отправлю|отправим|предоставлю|предоставим|подпишут|ответ|ждём|ждем|ждут|планиру[а-яё]*|запланир[а-яё]*|созвон|уточнить|согласу[а-яё]*|отгрузк[а-яё]*|поставк[а-яё]*|оплата|оплату проведут|приедут|выход[а-яё]*)(?![а-яё])/i;
var TM_PAST = /(?<![а-яё])(не ответил[а-яё]*|был[а-яё]*|ушл[а-яё]*|отгрузил[а-яё]*|оплатил[а-яё]*|оплачен[а-яё]*|отгружен[а-яё]*|получен[а-яё]*|произвели|получил[а-яё]*|сделал[а-яё]*|пришл[а-яё]*|приехал[а-яё]*|прошл[а-яё]*)(?![а-яё])/i;
var TM_LEGAL = /^(ип|ооо|ао|зао|пао|оао|ук|гк|тд|ск|пк|нпо|мп|ч\.?п\.?)$/i;
var TM_DATE_RE = /(?<![\d№])((?:(?<![а-яёa-z0-9])(?:от|с|по|до|к|на|в))\s+)?(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d])/g;
var TM_DATE_WRE = new RegExp('((?<![а-яёa-z0-9])(?:до|к|на|в|по)\\s+)?(\\d{1,2})\\s+(' + Object.keys(TM_MON).join('|') + ')', 'gi');
var TM_LEAD_NAMED = /(?<![А-Яа-яЁё])(Сотрудник2[а-яё]*\s+Отчество1[а-яё]*|Т\.\s*В\.\s*Сотрудник1[а-яё]*|Сотрудник14[а-яё]*\s+М|Сотрудник29(а|ой|у)\s+А|Сотрудник42[а-яё]*\s+В[а-яё]*\.?\s*В)/;

// REDACTED_B64_9 даты в тексте (как dates_in в mx_ctl.py)
function tm_ymd_(y, m, d) { var z = function (n) { return (n < 10 ? '0' : '') + n; }; return y + '-' + z(m) + '-' + z(d); }
function tm_validDate_(y, m, d) { if (m < 1 || m > 12 || d < 1) return false; return d <= new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function tm_daysDiff_(a, b) { return Math.round((tm_dateMs_(a) - tm_dateMs_(b)) / 864e5); }
/** → [[дата 'ГГГГ-ММ-ДД', start, end, kind]] — будущие (или сегодняшние) даты в тексте относительно дня сообщения d0 */
function tm_datesIn_(t, d0) {
  var out = [], y0 = +d0.slice(0, 4), m0 = +d0.slice(5, 7), low = String(t).toLowerCase(), wd0 = tm_wd_(d0);
  tm_rxAll_(TM_DATE_RE, t).forEach(function (m) {
    var pre = (m[1] || '').trim().toLowerCase();
    if (pre === 'от' || pre === 'с') return;                                 // «заказ от 30.09», «с 12 по 17» — ссылки, не сроки
    var dd = +m[2], mm = +m[3], y = m[4], yy = y ? (y.length === 2 ? 2000 + (+y) : +y) : y0;
    if (!tm_validDate_(yy, mm, dd)) return;
    var d = tm_ymd_(yy, mm, dd);
    if (!y && tm_daysDiff_(d, d0) < -180) d = tm_ymd_(yy + 1, mm, dd);
    var diff = tm_daysDiff_(d, d0);
    if (diff >= -1 && diff <= 120) out.push([d, m.index, m.index + m[0].length, 'date']);
  });
  tm_rxAll_(TM_DATE_WRE, t).forEach(function (m) {
    var dd = +m[2], mm = TM_MON[m[3].toLowerCase()];
    if (!tm_validDate_(y0, mm, dd)) return;
    var d = tm_ymd_(y0, mm, dd);
    if (tm_daysDiff_(d, d0) < -180) d = tm_ymd_(y0 + 1, mm, dd);
    var diff = tm_daysDiff_(d, d0);
    if (diff >= 0 && diff <= 120) out.push([d, m.index, m.index + m[0].length, 'date']);
  });
  var add = function (d, m, k) { out.push([d, m.index, m.index + m[0].length, k]); };
  var fri = tm_addDays_(d0, (4 - wd0 + 7) % 7);
  tm_rxAll_(/(?<![а-яё])(до|к|на)\s+кон(?:ец|ца|цу)\s+недел[иею]/g, low).forEach(function (m) { add(fri, m, 'week'); });
  tm_rxAll_(/(?<![а-яё])(?:на\s+)?след(?:ующей|\.)?\s*недел[еию]/g, low).forEach(function (m) { add(tm_addDays_(fri, 7), m, 'nextweek'); });
  tm_rxAll_(/(?<![а-яё])(до|к|на)\s+кон(?:ец|ца|цу)\s+месяца/g, low).forEach(function (m) { add(tm_ymd_(y0, m0, new Date(Date.UTC(y0, m0, 0)).getUTCDate()), m, 'month'); });
  tm_rxAll_(/(?<![а-яё])послезавтра(?![а-яё])/g, low).forEach(function (m) { add(tm_nextWorkday_(tm_addDays_(d0, 2)), m, 'rel'); });
  tm_rxAll_(/(?<![а-яё])завтра(?![а-яё])/g, low).forEach(function (m) { add(tm_nextWorkday_(tm_addDays_(d0, 1)), m, 'rel'); });
  tm_rxAll_(/(?<![а-яё])(в|на|к|до)\s+(?:след(?:ующ[а-яё]*|\.)?\s*)?(понедельник|вторник|среду|четверг|пятницу|субботу)(?![а-яё])/g, low).forEach(function (m) {
    var k = TM_WD_NAMES[m[2]], n = (k - wd0 + 7) % 7 || 7; add(tm_addDays_(d0, n), m, 'wd');
  });
  out.sort(function (a, b) { return a[1] - b[1] || (a[3] === 'date' ? 0 : 1) - (b[3] === 'date' ? 0 : 1); });
  var res = [];
  out.forEach(function (x) {
    if (out.some(function (y) { return Math.abs(x[1] - y[1]) < 25 && y[3] === 'date' && x[3] !== 'date'; })) return;   // явная дата рядом с «в четверг» — главнее
    if (!res.some(function (y) { return Math.abs(x[1] - y[1]) < 3; })) res.push(x);
  });
  return res;
}
/** строки и пункты списка; длинная строка — по предложениям */
function tm_clauses_(text) {
  var out = [];
  String(text || '').split(/\n+/).forEach(function (line) {
    var cuts = [0];
    tm_rxAll_(/(?:(?<=\s)|^)(?=\d{1,2}[.)]\s*[А-ЯЁA-Z«"])/g, line).forEach(function (m) { if (m.index > 0) cuts.push(m.index); });
    cuts = cuts.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort(function (a, b) { return a - b; });
    cuts.forEach(function (a, i) {
      var p = line.slice(a, i + 1 < cuts.length ? cuts[i + 1] : line.length).trim(); if (!p) return;
      if (p.length > 260) {                                                         // 11.11: длинный пункт режем на фразы, но клиент из начала пункта идёт с каждой («ООО Галат — Созвониться 06.11»)
        var hd = /^\s*(?:\d{1,2}[.)]\s*)?([^—\-–:]{2,60}?)\s*[—\-–:]/.exec(p), sub = hd ? hd[1].trim() : '';
        p.split(/(?<=[.!?;])\s+(?=[А-ЯЁA-Z«"])/).forEach(function (s, j) { s = s.trim(); if (s) out.push(j && sub && s.indexOf(sub) < 0 ? sub + ' — ' + s : s); });
      }
      else out.push(p);
    });
  });
  return out;
}
/** клиент в начале пункта: «3. Ип Имя25 С. (Махачкала) — общались…» → ['каримов', 'с']; нет тире — null */
function tm_subjKey_(cl) {
  var m = /^\s*(?:\d{1,2}[.)]\s*)?([^—\-–:]{2,60}?)\s*[—\-–:]/.exec(String(cl || '')); if (!m) return null;
  var ws = (m[1].toLowerCase().replace(/ё/g, 'е').match(/[A-Za-zА-Яа-я0-9]+/g) || []).filter(function (w) { return !TM_LEGAL.test(w); });
  if (!ws.length || ws[0].length < 3) return null;
  return [ws[0], ws[1] || ''];
}
function tm_sameSubj_(a, b) { return !!(a && b) && a[0] === b[0] && (!a[1] || !b[1] || a[1] === b[1] || a[1].indexOf(b[1]) === 0 || b[1].indexOf(a[1]) === 0); }
function tm_sq_(s) { return String(s || '').replace(/\s+/g, ' '); }

/** сообщение → [{what, due, who_uid, who, kind, key}] — по каждой дате свой пункт (окно текста вокруг неё); руководство — не спрашиваем */
function tm_checkpoints_(msg, d0, names, skipped) {
  var leadAuthor = !!tm_isLeader_(msg.name, msg.uid, null), text = String(msg.text || '').trim();
  if (!text) return [];
  if (text.length < 60 && !TM_REQ.test(text)) return [];                      // «на завтра свободна одна» — переписка, не обещание
  var res = [], prev = '';
  tm_clauses_(text).forEach(function (cl0) {
    var cl = cl0;
    if (prev && /^[а-яёa-z(]/.test(cl0) && !tm_subjKey_(cl0)) {                   // «обратная связь завтра» — продолжение пункта выше
      var hk = /^\s*(?:\d{1,2}[.)]\s*)?([^—\-–:]{2,60}?)\s*[—\-–:]/.exec(prev); if (hk) cl = hk[1].trim() + ' — ' + cl0;
    }
    if (tm_subjKey_(cl0) || !prev) prev = cl0;
    var ds = tm_datesIn_(cl, d0), lastEnd = -1;
    ds.forEach(function (x) {
      var d = x[0], a = x[1], b = x[2];
      if (d < d0) return;                                                       // 11.11: «участвовала 02.11» в отчёте за 03.11 — факт, не срок
      if ((cl.replace(/[^А-Яа-яЁёA-Za-z]/g, '').length) < 12) return;          // 11.11: «03.11. 05.11», «28.10» — не пункт
      var near = cl.slice(Math.max(0, a - 35), Math.min(cl.length, b + 25));
      if (TM_PAST.test(near) && !(TM_FUT.test(near) || TM_REQ.test(near))) return;   // «Ильшат в пятницу не ответил» — о прошлом
      var lo = Math.max(0, a - 120), sp = lo > 0 ? Math.max(cl.lastIndexOf(' ', lo), 0) : 0;
      var what = cl.slice(sp, Math.min(cl.length, b + 45)).replace(/^[\s,;\-—]+|[\s,;\-—]+$/g, '');
      if (cl.length <= 240) what = cl; else if (sp > 0) what = '…' + what;
      if (b + 45 < cl.length && cl.length > 240) what += '…';
      if (res.length && a < lastEnd && res[res.length - 1].what === tm_sq_(what).slice(0, 260)) { var last = res[res.length - 1]; if (d > last.due) last.due = d; return; }
      lastEnd = b + 45;
      var whoUid = msg.uid, who = msg.name, req = TM_REQ.test(cl.slice(Math.max(0, a - 160), b + 60)) || leadAuthor, leadTo = false;
      if (req) {                                                                // просьба: кому — упомянутый или названный, иначе вся группа
        whoUid = null; who = 'Коллеги';
        if (msg.ruid && String(msg.ruid) !== String(msg.uid)) {
          if (tm_isLeader_(msg.rname, msg.ruid, null)) leadTo = true;
          else { whoUid = String(msg.ruid); who = msg.rname || names[String(msg.ruid)] || 'без имени'; }
        }
        (msg.mentions || []).some(function (uid) {
          uid = String(uid); if (!names[uid] || uid === String(msg.uid)) return false;
          if (tm_isLeader_(names[uid], uid, null)) { leadTo = true; return false; }
          whoUid = uid; who = names[uid]; return true;
        });
        if (who === 'Коллеги') {
          var cll = cl.toLowerCase();
          Object.keys(names).some(function (uid) {
            if (uid === String(msg.uid)) return false;
            var parts = String(names[uid]).split(' (@')[0].split(/\s+/).filter(function (p) { return p.length > 2; });
            if (parts.length && parts.slice(0, 2).every(function (p) { return cll.indexOf(p.toLowerCase()) >= 0; })) {
              if (tm_isLeader_(names[uid], uid, null)) { leadTo = true; return false; }
              whoUid = uid; who = names[uid]; return true;
            }
            return false;
          });
        }
        if (who === 'Коллеги' && TM_LEAD_NAMED.test(cl)) leadTo = true;          // руководитель назван по имени-отчеству
      }
      var skip = function (why) { if (skipped) skipped.push({ what: tm_sq_(what).slice(0, 200), due: d, author: msg.name || '', why: why }); };
      if (leadTo && who === 'Коллеги') return skip('адресат — руководство');
      if (leadAuthor && who === 'Коллеги') return skip('адресат не определён');
      if (tm_isLeader_(who, whoUid, null)) return skip('адресат — руководство');
      res.push({ what: tm_sq_(what).slice(0, 260), due: d, who_uid: whoUid == null ? null : String(whoUid), who: who || 'без имени', kind: req ? 'req' : 'self', key: tm_subjKey_(cl) });
    });
  });
  return res;
}

// REDACTED_B64_9 F4 C-B1: ответ на вопрос бота — кто, по какому пункту, что (выполнено / перенос / просто ответ)
var TM_DONE_RX = /(?<![а-яё])(сделано|сделал[а-яё]*|выполнен[а-яё]*|выполнил[а-яё]*|готово|готов[аы]?|закрыт[а-яё]*|закрыл[а-яё]*|оплачен[а-яё]*|оплатил[а-яё]*|отгружен[а-яё]*|отгрузил[а-яё]*|отправлен[а-яё]*|отправил[а-яё]*|решен[а-яё]*|решил[а-яё]*|подписан[а-яё]*|подписал[а-яё]*|согласован[а-яё]*|согласовал[а-яё]*|получен[а-яё]*|получил[а-яё]*)(?![а-яё])/i;
var TM_NOTDONE_RX = /(?<![а-яё])(не|ещё не|еще не|пока не)\s+(?:[а-яё]+\s+)?(сдела|выполн|готов|закры|оплач|оплат|отгруж|отгруз|отправ|реш|подпис|соглас|получ)/i;
var TM_NUM_RX = /^\s*(?:п\.?|пункт|по|№)?\s*(\d{1,2})\s*(?:[).:—–-]|\s+[—–-])/i;
var TM_FINAL_RX = /(проигра|не\s+выигра|отказал|отказа(лись|лся|лась)|отказ\s+(клиента|заказчика)|не\s+устраива|неактуал|не\s+актуал|отмен[её]н|отменил|выбрали\s+друг|купили\s+у\s+друг|закупил[аи]?\s+у\s+друг|не\s+прош(ли|ёл|ел)|вопрос\s+закрыт|сделка\s+закрыт)/i;   // 11.11 (М. Сотрудник9): итог «проиграли / не устраивает / отказ» — пункт закрыт, больше не спрашивать
function tm_isDone_(s) { s = String(s || ''); return TM_DONE_RX.test(s) && !TM_NOTDONE_RX.test(s); }
/** может ли автор сообщения m отвечать по пункту it: адресат пункта, автор исходного сообщения, владелец; пункт «Коллеги» — любой участник */
function tm_ctlMayAnswer_(m, it, st, owner) {
  var u = String(m.uid || ''); if (!u) return false;
  if (!it.who_uid) return true;
  if (u === String(it.who_uid) || (owner && u === String(owner))) return true;
  var a = it.mid && st.mauth ? st.mauth[it.mid] : null; return !!(a && String(a[0]) === u);
}
/** ответ m на вопрос бота по пунктам its (в порядке строк вопроса 1), 2), …) → [[пункт, 'done' | 'move' | 'answer', дата | null]].
    Один пункт: дата — перенос, «не сделано…» — ответ (пункт открыт), иначе — выполнено. Несколько пунктов: строки «N) …» и строки с клиентом пункта
    относятся к своему пункту; без привязки — дата → перенос всех, «сделано/оплачено…» → выполнены все, иначе — ответ записан, пункты открыты. */
function tm_ctlAnswer_(m, its, d0) {
  var text = String(m.text || ''), out = [], verdict = function (s, d) {
    if (TM_FINAL_RX.test(s)) return ['done', null];
    var nd = tm_datesIn_(s, d).map(function (x) { return x[0]; }).filter(function (x) { return x > d; }).sort();   // 11.11: «оплатила 09.11, отгрузка 09.11» в ответе 09.11 — факт, не перенос
    if (nd.length) return ['move', nd.pop()];
    if (TM_NOTDONE_RX.test(s)) return ['answer', null];
    return tm_isDone_(s) ? ['done', null] : null;
  };
  if (its.length === 1) { var v1 = verdict(text, d0) || ['done', null]; return [[its[0], v1[0], v1[1]]]; }
  var hit = {};
  tm_clauses_(text).forEach(function (cl) {
    var k = -1, mm = TM_NUM_RX.exec(cl);
    if (mm && +mm[1] >= 1 && +mm[1] <= its.length) k = +mm[1] - 1;
    else {
      var ws = tm_words_(cl), cand = its.map(function (it, i) { return it.key && it.key[0] && ws.some(function (w) { return w.indexOf(it.key[0].slice(0, Math.max(4, it.key[0].length - 2))) === 0; }) ? i : -1; }).filter(function (i) { return i >= 0; });
      if (cand.length === 1) k = cand[0];
    }
    if (k < 0) return;
    var v = verdict(cl, d0) || (TM_NOTDONE_RX.test(cl) || /в\s+работе|жд[её]м|ожида|пока\s+нет/i.test(cl) ? ['answer', null] : ['done', null]);   // 11.11: ответ по пункту со статусом — пункт закрыт; «в работе / ждём / пока не…» — открыт (3 дня тишины)
    if (!hit[k] || v[0] !== 'answer') hit[k] = v;
  });
  if (Object.keys(hit).length) { Object.keys(hit).forEach(function (k) { out.push([its[+k], hit[k][0], hit[k][1]]); }); return out; }
  var g = verdict(text, d0) || ['answer', null];
  its.forEach(function (it) { out.push([it, g[0], g[1]]); });
  return out;
}

// REDACTED_B64_9 12.11 (2): дубли пунктов — один человек, тот же текст или тот же клиент за 14 дней
function tm_ctlNorm_(s) { return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60); }
function tm_ctlWho_(it) { return String(it.who_uid || '') || tm_ctlNorm_(it.who); }
function tm_ctlDupOf_(st, cp, atIso) {
  var w = tm_ctlWho_(cp), n = tm_ctlNorm_(cp.what), lim = tm_addDays_(String(atIso || '').slice(0, 10), -14);
  return Object.keys(st.items).some(function (k) {
    var it = st.items[k]; if (!it || it.st === 'done' || it.st === 'lead' || it.st === 'ban' || tm_ctlWho_(it) !== w || String(it.at || '').slice(0, 10) < lim) return false;   // выполненный — новый пункт по клиенту можно
    if (n && tm_ctlNorm_(it.what) === n) return true;
    return !!(cp.key && it.key && tm_sameSubj_(it.key, cp.key));
  });
}
// REDACTED_B64_9 контроль сроков: состояние tm/ctl.json
function tm_ctlState_() {
  var st = tm_load_('ctl.json', {});
  ['items', 'names', 'asks', 'mauth'].forEach(function (k) { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; });
  ['seen', 'lead_log'].forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
  if (!st.last_ts) st.last_ts = 0;
  return st;
}
/** открытые пункты, где спрашивают руководство или автор-руководитель записан ответственным за своё поручение: переназначить адресату или закрыть (st='lead') */
function tm_leadGuard_(st, H, botUid, tIso, res) {
  var names = st.names || {}, moved = 0, closed = 0, hist = (H && H.msgs) || {};
  Object.keys(st.items).forEach(function (k) {
    var it = st.items[k]; if (it.st !== 'open') return;
    var whoLead = tm_isLeader_(it.who, it.who_uid, null);
    var authLead = it.src === 'group' && it.author && it.author === it.who && tm_isLeader_(it.author, null, null);
    if (!whoLead && !authLead) return;
    var to = null;
    if (it.src === 'group' && it.mid) {
      var src = hist[it.mid] || {}, cand = [];
      var r = src.rmid ? hist[src.rmid] : null;
      if (r) cand.push([r.uid, r.name]); else if (src.rmid && st.mauth[src.rmid]) cand.push(st.mauth[src.rmid]);
      if (src.ruid) cand.push([src.ruid, src.rname || names[String(src.ruid)] || '']);
      (src.mentions || []).forEach(function (u) { cand.push([u, names[String(u)] || '']); });
      var low = String(it.what || '').toLowerCase();
      Object.keys(names).forEach(function (u) {
        var parts = String(names[u] || '').split(' (@')[0].split(/\s+/).filter(function (p) { return p.length > 2; });
        if (parts.length && parts.slice(0, 2).every(function (p) { return low.indexOf(p.toLowerCase()) >= 0; })) cand.push([u, names[u]]);
      });
      cand.some(function (c) {
        var u = c[0], nm = c[1];
        if (!u || String(u) === String(botUid) || String(u) === String(src.uid) || tm_isLeader_(nm, u, null)) return false;
        to = [String(u), nm || names[String(u)] || 'без имени']; return true;
      });
    }
    var rec = { t: tIso, id: it.id, what: String(it.what || '').slice(0, 200), due: it.due, from: it.who || '' };
    if (to) { it.who_uid = to[0]; it.who = to[1]; it.kind = 'req'; it.asks = 0; it.last_ask = null; it.lead_fix = 'moved'; it.lead_t = tIso; rec.act = 'переназначен'; rec.to = to[1]; moved++; }
    else { it.st = 'lead'; it.lead_fix = 'closed'; it.lead_t = tIso; rec.act = 'закрыт'; rec.why = authLead && !whoLead ? 'адресат не определён' : 'адресат — руководство'; closed++; }
    st.lead_log.push(rec);
  });
  st.lead_log = st.lead_log.slice(-300);
  if (moved || closed) { res.lead_moved = moved; res.lead_closed = closed; }
}
/** ПЯТИМИНУТНЫЙ ТИК: новые сообщения группы → контрольные точки; ответы на вопросы бота; свои пункты (ctl_manual); вопросы в группу с 10:00 */
/** 11.11: вопрос бота — в шапку группы (MAX: одно закреплённое сообщение; новое заменяет старое) */
function tm_pinAsk_(cid, mid, st, iso, res) {
  try { var r = api_('PUT', '/chats/' + cid + '/pin', null, { message_id: mid, notify: false }); st.pin = { cid: String(cid), mid: mid, day: String(iso).slice(0, 10), code: r[0] }; res.pin = r[0]; }
  catch (e) { res.pin_err = String(e).slice(0, 120); }
}
function tm_unpinAsk_(st, res) {
  try {
    var g = api_('GET', '/chats/' + st.pin.cid + '/pin');                   // снимаем, только если в шапке всё ещё наш вопрос
    if (JSON.stringify(g[1] || {}).indexOf(st.pin.mid) >= 0) { var r = api_('DELETE', '/chats/' + st.pin.cid + '/pin'); res.unpin = r[0]; }
    st.pin = null;
  } catch (e) { res.unpin_err = String(e).slice(0, 120); }
}
function tm_ctl_(ctx) {
  var cid = tm_komCid_();
  if (!tm_chatOk_(cid)) return 'группа ' + cid + ' выключена или её нет в листе groups — контроль сроков не ведётся';   // F4 C-A7
  var H = tm_hist_(cid), msgs = tm_histList_(H), st = tm_ctlState_(), botUid = tm_botUid_(), owner = tm_ownerUid_(), res = { 'new': 0, answers: 0, asked: 0 };
  var seen = {}; st.seen.forEach(function (x) { seen[x] = 1; });
  var today = ctx.today, now = ctx.msk;
  var mem = (tm_load_('poll.json', {}) || {}).members || {};                 // участники группы (список из ядра, poll.json) — адресаты, которые сами пишут редко
  Object.keys(mem).forEach(function (u) { if (mem[u] && !st.names[u]) st.names[u] = String(mem[u]); });
  msgs.forEach(function (m) {
    if (!m.mid || seen[m.mid] || m.ts <= 0) return;
    seen[m.mid] = 1;
    if (m.uid && m.name && !m.bot) st.names[m.uid] = m.name;
    if (m.uid && !m.bot) st.mauth[m.mid] = [m.uid, m.name || ''];
    if (m.bot || (botUid && m.uid === botUid)) return;
    if (m.rmid && !m.ruid && st.mauth[m.rmid]) { m.ruid = st.mauth[m.rmid][0]; m.rname = st.mauth[m.rmid][1]; }
    var d0 = tm_dateOf_(m.ts), atM = tm_msk_(m.ts).iso;
    if (m.rmid && st.asks[m.rmid]) {                                           // ответ на вопрос бота (F4 C-B1): только «свои» пункты; перенос ≠ выполнено
      var all = st.asks[m.rmid].map(function (iid) { return st.items[iid] || {}; });   // порядок строк вопроса 1), 2), … — как при отправке
      var mine = all.filter(function (it) { return it.id && it.st !== 'done' && tm_ctlMayAnswer_(m, it, st, owner); });
      if (mine.length) {
        tm_ctlAnswer_(m, all, d0).forEach(function (x) {
          var it = x[0]; if (mine.indexOf(it) < 0) return;
          it.answer = (m.name + ': ' + m.text).slice(0, 400); it.ans_by = m.name || ''; it.ans_t = atM;
          if (x[1] === 'move' && x[2]) { it.due = x[2]; it.st = 'open'; it.moved = (it.moved || 0) + 1; }
          else if (x[1] === 'done') { it.st = 'done'; it.done_t = atM; }
          else { it.st = 'answered'; it.answered_t = atM; }                   // 12.11: ответ «в работе / ждём» — записан, больше не спрашиваем
        });
        res.answers++;
      }
      return;
    }
    var keysM = tm_clauses_(m.text).map(tm_subjKey_).filter(Boolean);           // тот же клиент в более позднем сообщении автора — старая точка обновлена
    if (keysM.length) Object.keys(st.items).forEach(function (k) {
      var it = st.items[k];
      if (it.st === 'open' && it.src === 'group' && it.author === m.name && it.key && (it.at || '') < atM && keysM.some(function (kk) { return tm_sameSubj_(it.key, kk); })) { it.st = 'upd'; it.upd_t = atM; return; }
      // 12.11: адресат пункта позже написал в группе о том же клиенте (вечерний отчёт, ответ без reply) — это ответ, переспрашивать не нужно
      if (it.st === 'open' && it.key && m.uid && it.who_uid && String(it.who_uid) === String(m.uid) && (it.at || '') < atM && keysM.some(function (kk) { return tm_sameSubj_(it.key, kk); })) {
        var v = tm_ctlAnswer_(m, [it], d0)[0];
        it.answer = (m.name + ': ' + m.text).slice(0, 400); it.ans_by = m.name || ''; it.ans_t = atM;
        if (v[1] === 'move' && v[2]) { it.due = v[2]; it.moved = (it.moved || 0) + 1; }
        else if (v[1] === 'done') { it.st = 'done'; it.done_t = atM; }
        else { it.st = 'answered'; it.answered_t = atM; }
        res.answers++;
      }
    });
    var skipped = [], cps = tm_checkpoints_(m, d0, st.names, skipped);
    skipped.forEach(function (x) { x.t = now.iso; x.mid = m.mid; x.act = 'не создан'; st.lead_log.push(x); res.lead_skip = (res.lead_skip || 0) + 1; });
    cps.forEach(function (cp) {
      if (cp.due < tm_addDays_(today, -5)) return;                             // старые точки (из импорта) — не поднимаем
      var iid = tm_sha12_(m.mid + cp.what); if (st.items[iid]) return;
      if (tm_ctlDupOf_(st, cp, atM)) { res.dup_skip = (res.dup_skip || 0) + 1; return; }   // 12.11 (2): тот же пункт тому же человеку уже есть — второй не заводим
      var it = JSON.parse(JSON.stringify(cp)); it.id = iid; it.src = 'group'; it.mid = m.mid; it.author = m.name; it.at = atM; it.st = 'open'; it.asks = 0;
      st.items[iid] = it; res['new']++;
    });
    if (m.ts > st.last_ts) st.last_ts = m.ts;
  });
  st.seen = Object.keys(seen).slice(-3000);
  var mk = Object.keys(st.mauth); if (mk.length > 4000) mk.sort().slice(0, mk.length - 4000).forEach(function (k) { delete st.mauth[k]; });
  if (!st.seeded) st.asked_day = today;                                         // первый запуск: сегодня не спрашиваем — список сначала смотрит Т. В.
  st.seeded = true;
  // свои пункты: запросы из почты и регулярные отчёты (лист tm_settings → ctl_manual)
  (tm_cfgJson_('ctl_manual', []) || []).forEach(function (x) {
    if (!x || typeof x !== 'object' || x.id == null) return;
    var iid = 'm-' + x.id, it = st.items[iid];
    if (!it) it = st.items[iid] = { id: iid, src: 'manual', what: x.what || '', due: x.due || today, who: x.who || 'Коллеги', who_uid: x.uid == null ? null : String(x.uid), st: 'open', asks: 0, recur: x.recur || null, author: x.from || 'Т. В. Сотрудник1', at: now.iso };
    if (x.done && it.st !== 'done') { it.st = 'done'; it.done_t = now.iso; it.answer = String(x.done).slice(0, 200); }
    if (x.due && x.due !== it.due && it.st === 'open' && !it.recur) it.due = x.due;
    if (!it.who_uid && it.who && it.who !== 'Коллеги') Object.keys(st.names).some(function (uid) {
      var nm = String(st.names[uid]).toLowerCase(); if (it.who.split(/\s+/).slice(0, 2).every(function (p) { return nm.indexOf(p.toLowerCase()) >= 0; })) { it.who_uid = uid; it.who = st.names[uid]; return true; } return false;
    });
    if (it.st === 'done' && it.recur) {                                        // регулярный: следующий срок
      var r = String(it.recur), nd;
      if (r.indexOf('weekly:') === 0) { var k = +r.split(':')[1], wd = tm_wd_(today); nd = tm_addDays_(today, ((k - wd + 7) % 7) || 7); }
      else { var y = +today.slice(0, 4), mo = +today.slice(5, 7), ny = mo === 12 ? y + 1 : y, nm2 = mo % 12 + 1; nd = tm_ymd_(ny, nm2, new Date(Date.UTC(ny, nm2, 0)).getUTCDate()); }
      it.st = 'open'; it.due = nd; it.asks = 0;
    }
  });
  tm_leadGuard_(st, H, botUid, now.iso, res);
  if (!st.mig1111) {                                                            // 11.11: разово закрыть «вечные» пункты — дата в прошлом при записи или ответ «проиграли / не устраивает»
    Object.keys(st.items).forEach(function (k) {
      var it = st.items[k]; if (it.st !== 'open') return;
      var past = it.src === 'group' && it.at && it.due < String(it.at).slice(0, 10);
      var stem = it.key && it.key[0] ? it.key[0].slice(0, Math.max(4, it.key[0].length - 2)).toLowerCase() : '';
      var fin = it.answer && tm_clauses_(String(it.answer)).some(function (cl) { return TM_FINAL_RX.test(cl) && (!stem || cl.toLowerCase().indexOf(stem) >= 0); });
      if (past || fin) { it.st = 'done'; it.done_t = now.iso; it.fix1111 = past ? 'дата в прошлом' : 'итог в ответе'; res.fix1111 = (res.fix1111 || 0) + 1; }
    });
    st.mig1111 = true;
  }
  if (!st.mig1111b) {                                                           // 11.11 (2): пункты, на которые уже ответили по существу, — закрыть; «в работе / ждём / пока не…» — оставить
    Object.keys(st.items).forEach(function (k) {
      var it = st.items[k]; if (it.st !== 'open') return;
      var junk = (String(it.what || '').replace(/[^А-Яа-яЁёA-Za-z]/g, '').length) < 12 || (it.src === 'group' && it.at && it.due < String(it.at).slice(0, 10));
      var stem = it.key && it.key[0] ? it.key[0].slice(0, Math.max(4, it.key[0].length - 2)).toLowerCase() : '';
      var cls = it.answer ? tm_clauses_(String(it.answer).replace(/^[^:]{1,60}:\s*/, '')) : [];
      var mineCl = stem ? cls.filter(function (cl) { return cl.toLowerCase().indexOf(stem) >= 0; }) : cls;
      var waiting = mineCl.some(function (cl) { return TM_NOTDONE_RX.test(cl) || /в\s+работе|жд[её]м|ожида|пока\s+нет/i.test(cl); });
      if (junk || (it.ans_t && !waiting)) { it.st = 'done'; it.done_t = now.iso; it.fix1111 = junk ? 'не пункт' : 'ответ по существу'; res.fix1111b = (res.fix1111b || 0) + 1; }
    });
    st.mig1111b = true;
  }
  if (!st.mig1211) {                                                            // 12.11: разово — отвеченные пункты больше не спрашивать; спрошенные 2+ раз — только в сводку владельцу
    Object.keys(st.items).forEach(function (k) {
      var it = st.items[k]; if (it.st !== 'open') return;
      if (it.ans_t && !(it.moved && String(it.last_ask || '') < String(it.ans_t))) { it.st = 'answered'; it.answered_t = now.iso; it.fix1211 = 'ответ уже был'; res.fix1211 = (res.fix1211 || 0) + 1; }
      else if ((it.asks || 0) >= TM_MAX_ASKS) { it.st = 'stale'; it.fix1211 = 'спрошено ' + it.asks + ' раз'; res.fix1211 = (res.fix1211 || 0) + 1; }
    });
    st.mig1211 = true;
  }
  if (!st.mig1211c) {                                                           // 12.11 (2): разово — дубли (тот же человек + тот же текст или клиент) закрыть, оставить один пункт;
    var seenK = {};                                                             //   уже спрошенные хотя бы раз — больше не спрашивать (только сводка владельцу)
    Object.keys(st.items).map(function (k) { return st.items[k]; }).sort(function (a, b) { return String(b.at || '') < String(a.at || '') ? -1 : 1; }).forEach(function (it) {
      if (!it || (it.st !== 'open' && it.st !== 'answered' && it.st !== 'stale')) return;
      var w = tm_ctlWho_(it), kn = w + '|' + tm_ctlNorm_(it.what), kk = it.key && it.key[0] ? w + '|k|' + it.key[0] : '';
      if (seenK[kn] || (kk && seenK[kk])) { if (it.st === 'open') { it.st = 'dup'; it.dup_t = now.iso; res.fix1211c = (res.fix1211c || 0) + 1; } return; }
      seenK[kn] = 1; if (kk) seenK[kk] = 1;
      if (it.st === 'open' && (it.asks || 0) >= 1 && !(it.moved && String(it.last_ask || '') < String(it.ans_t || ''))) { it.st = 'stale'; it.fix1211c = 'уже спрошен'; res.fix1211c = (res.fix1211c || 0) + 1; }
    });
    st.mig1211c = true;
  }
  // вопросы в группу: рабочий день, с 10:00, раз в день, не в тихие часы; из группы — когда день срока прошёл, свои — в день срока
  if (ctx.workday && now.h >= TM_ASK_HOUR && now.h < 19 && !ctx.quiet && st.asked_day !== today) {
    var due = Object.keys(st.items).map(function (k) { return st.items[k]; }).filter(function (it) {
      return it.st === 'open' && (it.due < today || (it.src === 'manual' && it.due <= today)) && String(it.last_ask || '').slice(0, 10) !== today
        && !(it.ans_t && !(it.moved && String(it.last_ask || '') < String(it.ans_t)));   // 12.11: ответили — не переспрашивать; только новая дата из ответа — один раз после неё
    });
    var by = {}, pcfg = tm_pollCfg_();
    due.forEach(function (it) {
      if ((it.asks || 0) >= TM_MAX_ASKS && !(it.moved && String(it.last_ask || '') < String(it.ans_t || ''))) { it.st = 'stale'; return; }   // 12.11 (2): повтор только по новой дате из ответа
      if (tm_isLeader_(it.who, it.who_uid, null)) { it.st = 'lead'; it.lead_t = now.iso; return; }
      if (it.who !== 'Коллеги' && tm_banned_(pcfg, today, null, it.who)) { it.st = 'ban'; it.ban_t = now.iso; return; }   // Имя7/Джановой лично — ничего
      (by[(it.who_uid || '0') + '|' + it.who] = by[(it.who_uid || '0') + '|' + it.who] || []).push(it);
    });
    var errs = [];
    // 11.11 (Т. В., опрос «Лично в бота»): «у кого бот подключён — в бота, не в группу». Сначала каждому лично (свои пункты, своя нумерация);
    //   кому бот лично не пишет (нет диалога с ботом — MAX 403/404) — в общее сообщение в группе, как раньше. Ответ в личке — tm_ctlDmAnswer_.
    if (!st.dm || typeof st.dm !== 'object') st.dm = {};
    Object.keys(by).forEach(function (key) {
      var uid = key.split('|')[0], who = key.split('|')[1];
      if (!uid || uid === '0' || who === 'Коллеги') return;
      var its = by[key].sort(function (a, b) { return a.due < b.due ? -1 : 1; }).slice(0, 12), n2 = 0;
      var first = String(who).split(' (@')[0].split(/\s+/).filter(Boolean); first = first.length >= 2 ? first[1] : (first[0] || '');
      var txt = '⏰ <b>' + tm_h_(first) + ', контрольные точки — срок наступил</b> · ' + tm_ddmm_(today) + '\n';
      its.forEach(function (it) {
        n2++; var od = tm_wdBetween_(it.due, today), w = tm_sq_(it.what || ''); if (w.length > 160) w = w.slice(0, 158) + '…';
        txt += '\n' + n2 + ') ' + tm_h_(w) + ' — срок ' + tm_ddmm_(it.due) + (od >= 3 ? ' ⚠️ просрочка ' + tm_daysRu_(od) : '');
      });
      txt += '\n\nОтветьте, пожалуйста, здесь же: номер пункта — что сделано или новая дата. Можно одним сообщением на все пункты.';
      var r = tm_sendOnce_('ctl:ask:' + today + ':u:' + uid, 'user', { uid: uid, text: txt, html: true }, 'ctl');
      if (r.ok) {
        if (r.mid) st.asks[r.mid] = its.map(function (it) { return it.id; });
        st.dm[uid] = { mid: r.mid || '', t: now.iso, ids: its.map(function (it) { return it.id; }) };
        its.forEach(function (it) { it.asks = (it.asks || 0) + 1; it.last_ask = now.iso; it.via = 'бот лично'; });
        res.asked += its.length; res.asked_dm = (res.asked_dm || 0) + its.length; delete by[key]; tm_save_('ctl.json', st);
      } else if (r.stub) errs.push('нет ядра');
      // нет диалога с ботом (403/404) или другая ошибка — пункты остаются в общем сообщении в группе
    });
    // 11.11 (Т. В.): одно сообщение на всех — фамилии жирным, сквозная нумерация; сообщение — в шапку группы (старое снять)
    var keys = Object.keys(by).sort(function (a, b) { var x = a.split('|')[1], y = b.split('|')[1]; if (x === 'Коллеги') return 1; if (y === 'Коллеги') return -1; return x < y ? -1 : 1; });
    var fio = function (w) { if (w === 'Коллеги') return 'Всем'; var p = String(w).split(' (@')[0].split(/\s+/).filter(Boolean); return p.length >= 2 ? p[1] + ' ' + p[0] : p.join(' '); };
    var head = '⏰ <b>Контрольные точки — срок наступил</b> · ' + tm_ddmm_(today);
    var foot = '\n\nОтветьте, пожалуйста, <b>ответом на это сообщение</b>: номер пункта — что сделано или новая дата. Каждый — по своим пунктам.';
    var parts = [], cur = { t: head, ids: [], its: [] }, num = 0;
    keys.forEach(function (key) {
      var its = by[key].sort(function (a, b) { return a.due < b.due ? -1 : 1; }).slice(0, 12), who = key.split('|')[1];
      var block = '\n\n<b>' + tm_h_(fio(who)) + '</b>';
      its.forEach(function (it) {
        num++;
        var od = tm_wdBetween_(it.due, today), from = it.src !== 'manual' && it.author && it.author !== who ? ', из сообщения ' + it.author.split(' (@')[0] : '';
        var w = tm_sq_(it.what || ''); if (w.length > 140) w = w.slice(0, 138) + '…';
        block += '\n' + num + ') ' + tm_h_(w) + ' — срок ' + tm_ddmm_(it.due) + (od >= 3 ? ' ⚠️ просрочка ' + tm_daysRu_(od) : '') + tm_h_(from);
        cur.ids.push(it.id); cur.its.push(it);
      });
      if ((cur.t + block + foot).length > 3800 && cur.ids.length > its.length) {          // не влезает — продолжение отдельным сообщением
        var moved = its.length; var mi = cur.ids.splice(-moved), mt = cur.its.splice(-moved);
        parts.push(cur); cur = { t: head + ' (продолжение)', ids: mi, its: mt };
      }
      cur.t += block;
    });
    if (cur.ids.length) parts.push(cur);
    parts.forEach(function (pt, pi) {
      var r = tm_sendOnce_('ctl:ask:' + today + ':all:' + pi, 'chat', { cid: cid, text: pt.t + foot, html: true }, 'ctl');
      if (r.ok) {
        if (r.mid) st.asks[r.mid] = pt.ids.slice();
        pt.its.forEach(function (it) { it.asks = (it.asks || 0) + 1; it.last_ask = now.iso; });
        res.asked += pt.its.length; tm_save_('ctl.json', st);
        if (pi === 0 && r.mid && !r.dup) tm_pinAsk_(cid, r.mid, st, now.iso, res);
      } else if (!r.stub) errs.push(r.code || r.err || '?');
      else errs.push('нет ядра');
    });
    if (!parts.length && st.pin && st.pin.mid && st.pin.day !== today) tm_unpinAsk_(st, res);   // вопросов сегодня нет — вчерашнюю шапку снять
    if (!errs.length) st.asked_day = today;                                       // F4 C-B2: день закрыт, только когда ушли ВСЕ; неуспешным — повтор в следующий тик
    else {                                                                        // (успешные пункты уже с last_ask = сегодня и повторно не спрашиваются)
      st.ask_err = st.ask_err && st.ask_err.d === today ? st.ask_err : { d: today, n: 0 }; st.ask_err.n++;
      if (st.ask_err.n >= 6) { st.asked_day = today; tm_log_('ctl', 'вопросы в группу не ушли 6 раз — до следующего рабочего дня'); }
    }
    if (errs.length) res.err = errs.join('; ').slice(0, 300);
    if (res.asked) tm_log_('ctl', 'вопросов в группе ' + res.asked);
  }
  var ak = Object.keys(st.asks); if (ak.length > 400) ak.slice(0, ak.length - 300).forEach(function (k) { delete st.asks[k]; });
  tm_save_('ctl.json', st);
  var its = Object.keys(st.items).map(function (k) { return st.items[k]; });
  res.open = its.filter(function (i) { return i.st === 'open'; }).length;
  res.due = its.filter(function (i) { return i.st === 'open' && i.due <= today; }).length;
  res.done = its.filter(function (i) { return i.st === 'done'; }).length;
  return res;
}

// REDACTED_B64_9 напоминания о вопросах без ответа (remind.py)
var TM_ASK = /\?|(?<![а-яё])(прошу|просьба|просим|подскажите|подскажи|сообщите|согласуйте|согласовать|направьте|предоставьте|пришлите|ответьте|уточните|нужно ли|можно ли|когда (будет|сможете|можно|планируете|ждать|ответите|дадите|придут|будут|сделаете|отправите|пришлют|отгрузят|оплатят)|как быть|дайте|подтвердите|рассмотрите|ваше решение|ваше мнение|что делать|как поступить|разрешите|одобрите|утвердите|посмотрите|жд[ёе]м ответа|жду ответа|нужен ответ)(?![а-яё])/i;
var TM_ADDR_RE = /^\s*(?:(?:[Дд]обрый\s+(?:день|вечер)|[Дд]оброе\s+утро|[Зз]дравствуйте|[Пп]риветствую|[Пп]ривет|[Уу]важаем[а-яё]+)[,!.\s]+)*([А-ЯЁ][а-яё]+)(?:\s+([А-ЯЁ][а-яё]+))?\s*[,!]/;
var TM_NOT_NAMES = {};
'коллеги уважаемые уважаемый уважаемая все всем добрый здравствуйте спасибо прошу просьба просим направляю да нет ок привет доброе доброго внимание важно срочно друзья ребята девочки мальчики всех'.split(' ').forEach(function (w) { TM_NOT_NAMES[w] = 1; });
var TM_GROUP_TXT = '🔔 Коллеги, на этот вопрос ещё нет ответа. Ответьте, пожалуйста, в группе.';
function tm_remState_() {
  var st = tm_load_('remind.json', {});
  ['q', 'esc', 'members'].forEach(function (k) { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; });
  ['seen_mid', 'lead_sent', 'lead_log'].forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
  return st;
}
/** адресат вопроса → [uid | 'group' | 'owner' | null, как] */
function tm_addressee_(m, byMid, names, bot) {
  var me = String(m.uid || ''), r = byMid[m.rmid || ''], ru = r ? r.uid : (m.rmid ? m.ruid : null), rbot = r ? r.bot : false;
  if (ru && !rbot && String(ru) !== String(bot) && String(ru) !== me) return [String(ru), 'ответ на сообщение'];
  for (var i = 0; i < (m.mentions || []).length; i++) { var u = String(m.mentions[i]); if (u && u !== String(bot) && u !== me) return [u, 'упоминание']; }
  var head = String(m.text || '').replace(/^\s*(?:(?:[Дд]обрый\s+(?:день|вечер)|[Дд]оброе\s+утро|[Зз]дравствуйте|[Пп]риветствую|[Пп]ривет|[Уу]важаем[а-яё]+)[,!.\s]+)*/, '').toLowerCase().replace(/ё/g, 'е');
  var byName = Object.keys(names).filter(function (u) {                      // имя участника как в MAX в начале текста («Сотрудник26 Ю. А., прошу…»)
    if (u === String(bot) || u === me) return false;
    var nm = String(names[u] || '').split(' (@')[0].trim().toLowerCase().replace(/ё/g, 'е');
    return nm.length > 3 && head.indexOf(nm) === 0 && /^[\s,!:—-]/.test(head.slice(nm.length) || ',');
  });
  if (byName.length === 1) return [byName[0], 'по имени'];
  var mm = TM_ADDR_RE.exec(String(m.text || ''));
  if (mm) {
    var w1 = mm[1].toLowerCase().replace(/ё/g, 'е'), w2 = (mm[2] || '').toLowerCase().replace(/ё/g, 'е');
    if (!TM_NOT_NAMES[w1]) {
      if (TM_OWNER_RE.test(mm[1])) return ['owner', 'по имени'];
      var idx = {}; Object.keys(names).forEach(function (u) { if (u !== String(bot) && u !== me) idx[u] = tm_words_(names[u]); });
      var c = Object.keys(idx).filter(function (u) { return idx[u].indexOf(w1) >= 0; });
      if (w2 && c.length) { var c2 = c.filter(function (u) { return idx[u].indexOf(w2) >= 0; }); if (c2.length) c = c2; }
      if (c.length === 1) return [c[0], 'по имени'];
    }
  }
  return [null, ''];
}
/** новые вопросы с адресатом → st.q */
function tm_remScan_(st, G, namesOf, owner, bot, sinceMs, cfg, org) {
  var seen = {}; st.seen_mid.forEach(function (x) { seen[x] = 1; });
  var n = 0;
  Object.keys(G).forEach(function (cid) {
    var g = G[cid], byMid = {}; g.msgs.forEach(function (m) { byMid[m.mid] = m; });
    var names = namesOf[cid] || {};
    g.msgs.forEach(function (m) {
      if (m.ts < sinceMs || m.bot || !m.mid || String(m.uid) === String(bot) || seen[m.mid]) return;
      seen[m.mid] = 1;
      var text = String(m.text || '').trim();
      if (text && ((m.mentions || []).map(String).indexOf(String(bot || TM_BOT_FALLBACK)) >= 0 || TM_BOT_RX.test(text))) { n += tm_remCtlMention_(st, g, cid, m, names, owner, bot, cfg, org, text, byMid); return; }   // 13.11: «@бот на контроль»
      if (g.ctlOnly) return;                                                      // выключенная группа: кроме отметки бота — ничего
      if (!text || text.charAt(0) === '/' || !TM_ASK.test(text)) return;
      var ad = tm_addressee_(m, byMid, names, bot), to = ad[0], how = ad[1];
      var isOwner = (owner && String(m.uid) === String(owner)) || (!owner && TM_OWNER_RE.test(m.name || ''));
      if (to === 'owner' || (owner && to === String(owner)) || (to && to !== 'owner' && TM_OWNER_RE.test(names[to] || ''))) return;
      if (to && to !== 'group' && to !== 'owner' && tm_isLeader_(names[to], to, null)) return;    // вопрос руководителю — не напоминаем
      if (to === null) { if (!isOwner) return; to = 'group'; }
      var qid = tm_sha12_(String(cid) + m.mid); if (st.q[qid]) return;
      var q = { g: g.title, cid: String(cid), mid: m.mid, t: tm_msk_(m.ts).iso, ts: m.ts, from: m.name || 'без имени', from_uid: m.uid, from_owner: !!isOwner,
                to_uid: to === 'group' ? null : String(to), to_name: to === 'group' ? 'Коллеги' : (names[to] || 'участник группы'), how: how, text: text.slice(0, 600), st: 'open', rem: [] };
      if (q.to_uid) {
        var p = tm_person_(cfg, org, names[to] || '', q.to_uid) || {};
        q.mail = p.mail || ''; q.fio = p.fio || ''; q.dep = p.dep || ''; q.first = names[to] ? tm_firstName_(q.to_name, p.fio) : 'Коллега';
        if (!q.mail) q.no_mail = true;
      }
      st.q[qid] = q; n++;
    });
  });
  st.seen_mid = Object.keys(seen).slice(-5000);
  return n;
}
/** F4 C-B1: приветствие / благодарность / «ок» — не ответ на вопрос */
var TM_COURTESY_RX = /^[\s,.!?)(+👍🙏😊🙂]*(?:(?:всем|коллеги|друзья)\s*)?(?:доброе\s+утро|добрый\s+(?:день|вечер)|здравствуйте|привет(?:ствую)?|спасибо(?:\s+большое)?|благодарю|ок(?:ей)?|хорошо|понял[аи]?|принято|принял[аи]?|да|нет|ага|угу)(?:[\s,.!?)(+👍🙏😊🙂]+(?:(?:всем|коллеги|друзья)\s*)?(?:доброе\s+утро|добрый\s+(?:день|вечер)|здравствуйте|привет(?:ствую)?|спасибо(?:\s+большое)?|благодарю|ок(?:ей)?|хорошо|понял[аи]?|принято|принял[аи]?|да|нет|ага|угу))*[\s,.!?)(+👍🙏😊🙂]*$/i;   // 12.11 CodeQL (redos): слова — через разделитель, «поняла» входит в «понял[аи]?»
var TM_STEM_STOP = { 'пожал': 1, 'спаси': 1, 'здрав': 1, 'колле': 1, 'добры': 1, 'добро': 1, 'сегод': 1, 'завтр': 1, 'вчера': 1, 'тимур': 1, 'викто': 1, 'можно': 1, 'нужно': 1, 'будет': 1, 'когда': 1, 'почем': 1, 'какой': 1, 'какая': 1, 'какие': 1, 'сколь': 1, 'подск': 1, 'скажи': 1, 'ответ': 1, 'вопро': 1 };
function tm_stems_(s) { var o = {}; tm_words_(s).forEach(function (w) { if (w.length >= 5 && !TM_STEM_STOP[w.slice(0, 5)]) o[w.slice(0, 5)] = 1; }); return o; }
/** 13.11.2026 (Т. В.; Сотрудник8 К. В.: «когда бота ставят в группе в сообщении, он не берёт его на контроль»): отметка бота в сообщении группы —
    явная постановка на контроль. Каждый отмеченный (кроме бота и автора) — свой вопрос в st.q (ctl: true); никого не отметили — вопрос группе.
    Подтверждение в группе — ответом на сообщение (tm_remAck_, не в тихие часы); нет ответа 2 ч — бот лично (tm_remLadder_), затем группа и письмо. */
var TM_BOT_FALLBACK = '539375202', TM_BOT_RX = /@id6215018827_bot/i;
function tm_remCtlMention_(st, g, cid, m, names, owner, bot, cfg, org, text, byMid) {
  var me = String(m.uid || ''), bu = String(bot || TM_BOT_FALLBACK), isOwner = !!(owner && me === String(owner)), to = [], n = 0;
  var add = function (u) { u = String(u || ''); if (u && u !== bu && u !== me && !(owner && u === String(owner)) && to.indexOf(u) < 0) to.push(u); };
  (m.mentions || []).forEach(add);
  // «@бот бери на контроль» ответом на сообщение: на контроле — то сообщение (его текст и отмеченные в нём; никого — его автор)
  var src = m.rmid && byMid ? byMid[m.rmid] : null;
  if (src && !src.bot && String(src.uid) !== bu) { (src.mentions || []).forEach(add); if (!to.length && String(src.uid || '') !== me) add(src.uid); }
  if (!to.length) tm_namesInText_(src && src.text ? src.text + ' ' + text : text, names).forEach(add);   // 13.11: имена набраны текстом, без отметки
  if (!to.length) to = ['group'];
  var own = text.replace(TM_BOT_RX, '').replace(/^[\s,.:;!—-]+/, '').trim();
  var body = src && String(src.text || '').trim() ? String(src.text).trim() : (own || text), qmid = src ? src.mid : m.mid;
  // 13.11 (Т. В.): срок не указан — спросить автора, к какому сроку; исполнители не отмечены — кто; до ответа исполнителям не напоминать каждые 2 ч
  var dd = tm_ctlDue_(body + (src ? ' ' + own : ''), tm_msk_(m.ts).iso.slice(0, 10), true), need = [];
  if (!dd) need.push('due'); if (to[0] === 'group') need.push('who');
  to.forEach(function (u) {
    var qid = tm_sha12_(String(cid) + qmid + ':' + u); if (st.q[qid]) return;   // то же сообщение второй раз на контроль — второй вопрос не заводим
    var nb = tm_ctlNorm_(body).slice(0, 50);                                     // то же поручение тому же человеку перевыложено — второй вопрос не заводим
    if (Object.keys(st.q).some(function (k) { var x = st.q[k]; return x.ctl && x.st === 'open' && String(x.cid) === String(cid) && String(x.to_uid || 'group') === u && tm_ctlNorm_(x.text).slice(0, 50) === nb; })) return;
    var q = { g: g.title, cid: String(cid), mid: qmid, cmd_mid: m.mid, t: tm_msk_(m.ts).iso, ts: m.ts, from: m.name || 'без имени', from_uid: m.uid, from_owner: isOwner,
              to_uid: u === 'group' ? null : u, to_name: u === 'group' ? 'Коллеги' : (names[u] || 'участник группы'), how: 'на контроль (отметка бота)', ctl: true,
              due: dd ? dd.due : '', due_t: dd ? dd.t : '', need: need.slice(),
              text: body.slice(0, 600), st: 'open', rem: [] };
    if (q.to_uid) {
      var p = tm_person_(cfg, org, names[u] || '', q.to_uid) || {};
      q.mail = p.mail || ''; q.fio = p.fio || ''; q.dep = p.dep || ''; q.first = names[u] ? tm_firstName_(q.to_name, p.fio) : 'Коллега';
      if (!q.mail) q.no_mail = true;
    }
    st.q[qid] = q; n++;
  });
  var q0 = st.q[tm_sha12_(String(cid) + qmid)];                                // обычный вопрос по тому же сообщению — теперь ведёт контроль, без двойных напоминаний
  if (n && q0 && !q0.ctl && q0.st === 'open' && (!q0.to_uid || to.indexOf(String(q0.to_uid)) >= 0)) { q0.st = 'dup'; q0.dup_t = tm_msk_(m.ts).iso; }
  if (n) (st.ack = st.ack || {})[String(cid) + ':' + m.mid] = { cid: String(cid), mid: m.mid, qmid: qmid, t: tm_msk_(m.ts).iso, g: g.title, author: me, own: isOwner,
    need: need.slice(), due: dd ? dd.due : '', due_t: dd ? dd.t : '',
    who: to.map(function (u) { return u === 'group' ? '' : String(names[u] || 'участник группы').split(' (@')[0]; }).filter(Boolean) };
  return n;
}
/** 13.11: имена участников, набранные в тексте без отметки («Имя16 Сотрудник66 Andrei Retrunin»): полное имя как в MAX — сразу;
    одно слово (имя или фамилия) — только если такое слово у одного участника группы. */
function tm_namesInText_(text, names) {
  var low = ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/g, ' ') + ' ', out = [], words = {};
  Object.keys(names).forEach(function (u) {
    var nm = String(names[u] || '').split(' (@')[0].toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/g, ' ').trim(); if (!nm) return;
    if (nm.indexOf(' ') > 0 && low.indexOf(' ' + nm + ' ') >= 0) { out.push(u); return; }
    nm.split(' ').forEach(function (w) { if (w.length >= 3) (words[w] = words[w] || []).push(u); });
  });
  Object.keys(words).forEach(function (w) { var us = words[w]; if (us.length === 1 && low.indexOf(' ' + w + ' ') >= 0 && out.indexOf(us[0]) < 0) out.push(us[0]); });
  return out;
}
/** 13.11.2026 (Т. В.: «сделаем на портале раздел Поручения… невыполненное в ботах и в совещаниях — всё в одно; дальше работает робот»):
    poruch.bin («От ботов» → хостинг st/poruch.bin, bots_drive.py) — отметки бота (контроль), поручения руководства, контрольные точки
    офисов продаж («Коммерческий отдел»), задачи утренних совещаний (meet_tasks.json — из Plaud, пишет Claude после совещания). */
/** 21.11.2026: «Журнал происшествий и охраны — Фабрика» (охрана и диспетчер заполняют сами): последние 60 дней, до 200 строк; текст — через tm_mask_. */
var TM_EV_SHEET = 'REDACTED_ID_7';   // 21.11.2026: журнал — на рабочем аккаунте user1@example.org
function tm_events_(ctx) {
  try {
    var id = PropertiesService.getScriptProperties().getProperty('EV_SHEET_ID') || TM_EV_SHEET;
    var v = SpreadsheetApp.openById(id).getSheets()[0].getDataRange().getDisplayValues(), from = tm_addDays_(ctx.today, -60), rows = [];
    for (var i = 1; i < v.length; i++) {   // 21.11.2026 (Рекс CG-56): читаем все строки, ограничение — после сортировки по дате
      var r = v[i], d = String(r[0] || '').trim(), k = String(r[2] || '').trim().toLowerCase();
      if (!d || !k || k.indexOf('пример') >= 0) continue;
      var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(d); if (m) d = m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
      if (!/^\d{4}-\d\d-\d\d$/.test(d) || d < from) continue;
      var kind = /периметр|забор|проникн|посторон/.test(k) ? 'per' : /машин|подач|транспорт|авто/.test(k) ? 'car' : 'inc';
      rows.push({ d: d, tm: String(r[1] || '').slice(0, 5), k: kind, place: tm_mask_(r[3]).slice(0, 80), what: tm_mask_(r[4]).slice(0, 300), who: tm_mask_(r[5]).slice(0, 60),
                  act: tm_mask_(r[6]).slice(0, 200), st: /^\s*(закрыт[оа]?|решен[оа]?|выполнен[оа]?|готово)\s*$/i.test(String(r[7] || '')) ? 'done' : 'open' });   // точный статус: «не закрыто» — открыто
    }
    // 21.11.2026, Т. В. («происшествия — из совещаний и почты»): письма 1c@ за 30 дней с признаками происшествия или неподанной машины — строками журнала (источник «письмо 1c@»).
    //   Свои письма робота и камер, сверки поручений — не берутся; письмо, уже внесённое в таблицу (та же тема), — один раз.
    var MAILOK = true;
    try {
      var seen = {}; rows.forEach(function (x) { seen[String(x.what).slice(0, 60).toLowerCase()] = 1; });
      var Q = 'newer_than:30d -from:user1@example.org -from:user32@example.org -subject:"NVR ALERT" (происшествие OR авария OR травма OR пожар OR возгорание OR задымление OR кража OR хищение OR протечка OR затопление OR "несчастный случай" OR ДТП OR "машина не подана" OR "не подали машину" OR "машину не подали")';
      GmailApp.search(Q, 0, 40).forEach(function (th) {
        var tid = th.getId(); if (seen['t:' + tid]) return; seen['t:' + tid] = 1; var sub = String(th.getFirstMessageSubject() || ''); if (/поручени[яй] на|видеонаблюдени|сводк|отчёт|отчет|совещани|протокол|договор|служебн|сч[её]т|замечани/i.test(sub)) return;   // повестки, договоры, счета — не происшествия
        var RXI = /происшеств|авари[яи]|травм|пожар|возгоран|задымл|краж[аиу]|хищени|протечк|затоплен|несчастн[а-я]* случа|(^|[^а-я])дтп([^а-я]|$)|машин[а-я]* не подан|не подали машин|проникновени/;
        var m = null, txt = ''; th.getMessages().some(function (mm) { var tx = (sub + ' ' + mm.getPlainBody().slice(0, 1500)).toLowerCase(); if (RXI.test(tx)) { m = mm; txt = tx; return true; } return false; });   // 21.11.2026 (Рекс CG-56): письмо цепочки, в котором совпало
        if (!m) return; var dt = m.getDate();
        if (!/происшеств|авари[яи]|травм|пожар|возгоран|задымл|краж[аиу]|хищени|протечк|затоплен|несчастн[а-я]* случа|(^|[^а-я])дтп([^а-я]|$)|машин[а-я]* не подан|не подали машин|проникновени/.test(txt)) return;   // поиск Gmail нестрогий — слово должно быть в теме или начале письма
        var d2 = Utilities.formatDate(dt, 'Europe/Moscow', 'yyyy-MM-dd'); if (d2 < from) return;
        var key = sub.replace(/^(re|fwd?|fw):\s*/ig, '').slice(0, 60).toLowerCase(); if (seen[key]) return; seen[key] = 1;
        var kind = /машин[а-я]* не подан|не подали машин|машину не подал/.test(txt) ? 'car' : /периметр|проникн|посторон/.test(txt) ? 'per' : 'inc';
        rows.push({ d: d2, tm: Utilities.formatDate(dt, 'Europe/Moscow', 'HH:mm'), k: kind, place: '', what: tm_mask_(sub).slice(0, 300), who: tm_mask_(String(m.getFrom()).replace(/<[^>]*>/, '').trim()).slice(0, 50) + ' (письмо 1c@)',
                    act: '', st: 'open', src: 'mail' });
      });
    } catch (em) { MAILOK = false; }   // почта недоступна — строки таблицы есть, писем нет (mail:false — портал пишет об этом)
    rows.sort(function (a, b) { var x = a.d + ' ' + (a.tm || ''), y = b.d + ' ' + (b.tm || ''); return x < y ? 1 : x > y ? -1 : 0; });
    return { ok: true, rows: rows.slice(0, 200), mail: MAILOK };   // 21.11.2026 (GPT): не больше 200 строк и с письмами
  } catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 120) }; }
}
function tm_poruch_(ctx, st, ctl) {
  var today = ctx.today, wk = tm_addDays_(today, -7), nm = function (s) { return String(s || '').split(' (@')[0].trim(); };
  var out = { v: 1, t: ctx.msk.iso, ctl: [], lead: [], cp: [], meet: [] }, by = {};
  Object.keys(st.q).forEach(function (k) {
    var q = st.q[k]; if (!q.ctl || q.st === 'dup') return;
    var key = q.cid + ':' + q.mid, e = by[key];
    if (!e) e = by[key] = { id: tm_sha12_(key), g: q.g || '', t: q.t || '', from: nm(q.from), text: tm_mask_(q.text).slice(0, 400), due: q.due || '', due_t: q.due_t || '', need: q.need || [], who: [] };
    e.who.push({ n: q.to_uid ? nm(q.to_name) : 'все в группе', st: q.st, by: nm(q.ans_by), done_t: q.done_t || '', rem: (q.rem || []).filter(function (r) { return r.kind !== 'ack'; }).length });
  });
  out.ctl = Object.keys(by).map(function (k) { return by[k]; }).filter(function (e) {
    return e.who.some(function (w) { return w.st === 'open' || w.st === 'stale'; }) || String(e.t).slice(0, 10) >= wk;
  }).sort(function (a, b) { return a.t < b.t ? 1 : -1; }).slice(0, 200);
  var items = (ctl && ctl.items) || {};
  Object.keys(items).forEach(function (id) {
    var it = items[id]; if (['open', 'stale', 'lead', 'answered'].indexOf(it.st) < 0) return;
    var row = { id: id, what: tm_mask_(it.what).slice(0, 300), who: nm(it.who), due: it.due || '', st: it.st, from: nm(it.author), at: String(it.at || '').slice(0, 10), asks: it.asks || 0,
                ans: it.answer ? tm_mask_(it.answer).slice(0, 200) : '' };
    (it.src === 'manual' ? out.lead : out.cp).push(row);
  });
  out.cp.sort(function (a, b) { return a.due < b.due ? -1 : 1; }); out.lead.sort(function (a, b) { return a.due < b.due ? -1 : 1; });
  if (out.cp.length > 300) out.cp = out.cp.slice(0, 300);
  var M = tm_load_('meet_tasks.json', null);
  if (M && Array.isArray(M.meetings)) out.meet = M.meetings.map(function (m) {
    return { id: m.id, date: m.date, title: m.title, tasks: (m.tasks || []).map(function (x, i) { return { i: i, who: x.who, what: tm_mask_(x.what).slice(0, 300), due: x.due || '', st: x.st || 'open', note: x.note || '' }; }) };
  });
  out.ev = tm_events_(ctx);   // 21.11.2026, Т. В.: журнал происшествий и охраны (таблица) — для «Щекотливого» и сводки «Происшествия»
  out.stats = { ctl: out.ctl.filter(function (e) { return e.who.some(function (w) { return w.st === 'open'; }); }).length, lead: out.lead.length, cp: out.cp.length,
                meet: out.meet.reduce(function (s, m) { return s + m.tasks.filter(function (x) { return x.st !== 'done'; }).length; }, 0) };
  return tm_publish_('poruch.bin', out) ? out.stats : 'не записан';
}
/** 13.11 (разово): контроль, поставленный до v36, — без срока: дубли одного текста (перевыложено) закрыть, имена текстом — исполнителями,
    сегодняшним авторам (кроме Т. В.) — вопрос о сроке/исполнителях лично. */
function tm_remMigCtl_(ctx, st, namesOf, cfg, org) {
  var Q = Object.keys(st.q).map(function (k) { return [k, st.q[k]]; }).filter(function (p) { return p[1].ctl && p[1].st === 'open' && !p[1].need; });
  Q.sort(function (a, b) { return (b[1].ts || 0) - (a[1].ts || 0); });
  var seen = {}, groups = {}, n = 0;
  Q.forEach(function (p) {
    var q = p[1], key = q.cid + '|' + (q.to_uid || 'group') + '|' + tm_ctlNorm_(q.text).slice(0, 50);
    if (seen[key]) { q.st = 'dup'; q.dup_t = ctx.msk.iso; n++; return; } seen[key] = 1;
    var dd = tm_ctlDue_(q.text, String(q.t).slice(0, 10), true); q.due = dd ? dd.due : ''; q.due_t = dd ? dd.t : ''; q.need = dd ? [] : ['due'];
    (groups[q.cid + '|' + q.mid] = groups[q.cid + '|' + q.mid] || []).push(q);
  });
  Object.keys(groups).forEach(function (gk) {
    var L = groups[gk], gq = L.filter(function (q) { return !q.to_uid; })[0], names = namesOf[L[0].cid] || {};
    if (gq) {
      var who = tm_namesInText_(gq.text, names).filter(function (u) { return String(u) !== String(gq.from_uid); });
      who.forEach(function (u) {
        var qid = tm_sha12_(String(gq.cid) + gq.mid + ':' + u); if (st.q[qid]) return;
        var key = gq.cid + '|' + u + '|' + tm_ctlNorm_(gq.text).slice(0, 50);
        if (seen[key]) {                                                         // тот же человек и текст в старом (удалённом) сообщении — контроль переводим на новое
          Object.keys(st.q).forEach(function (k2) { var o = st.q[k2]; if (o.ctl && o.st === 'open' && o.cid === gq.cid && String(o.to_uid) === String(u) && o.mid !== gq.mid && (o.ts || 0) < (gq.ts || 0) && tm_ctlNorm_(o.text).slice(0, 50) === tm_ctlNorm_(gq.text).slice(0, 50)) { o.mid = gq.mid; o.rem = []; } });
          return;
        }
        seen[key] = 1;
        var q = JSON.parse(JSON.stringify(gq)); q.to_uid = String(u); q.to_name = names[u] || 'участник группы'; q.rem = [];
        var pp = tm_person_(cfg, org, q.to_name, q.to_uid) || {}; q.mail = pp.mail || ''; q.fio = pp.fio || ''; q.dep = pp.dep || ''; q.first = tm_firstName_(q.to_name, pp.fio); if (!q.mail) q.no_mail = true;
        st.q[qid] = q;
      });
      if (who.length) { gq.st = 'dup'; gq.dup_t = ctx.msk.iso; } else gq.need.push('who');
    }
    var q0 = L[0];
    if (q0.from_owner || !q0.from_uid || String(q0.t).slice(0, 10) !== ctx.today) return;
    var live = Object.keys(st.q).map(function (k) { return st.q[k]; }).filter(function (q) { return q.ctl && q.st === 'open' && q.cid === q0.cid && q.mid === q0.mid; });
    var need = []; if (live.some(function (q) { return (q.need || []).indexOf('due') >= 0; })) need.push('due'); if (live.every(function (q) { return !q.to_uid; })) need.push('who');
    var whoN = live.filter(function (q) { return q.to_uid; }).map(function (q) { return String(q.to_name).split(' (@')[0]; });
    tm_remAskAuthor_(ctx, st, q0.cid + ':' + (q0.cmd_mid || q0.mid) + ':m', { cid: q0.cid, qmid: q0.mid, mid: q0.mid, g: q0.g, author: q0.from_uid, need: need }, whoN, q0.due ? tm_ddmm_(q0.due) + (q0.due_t ? ' ' + q0.due_t : '') : '');
  });
  return n;
}
/** 13.11: срок из текста: {due:'ГГГГ-ММ-ДД', t:'ЧЧ:ММ'|''} | null. strict (текст поручения) — дата только с «до/к/срок», «завтра», день недели;
    нестрогий (ответ автора) — любая будущая дата, «сегодня», время. */
function tm_ctlDue_(text, d0, strict) {
  var low = String(text || '').toLowerCase().replace(/ё/g, 'е'), best = null;
  var hm = function (s) { var x = /^\s*(?:в|до|к)?\s*(\d{1,2})[:.](\d{2})(?!\d)/.exec(s); return x && +x[1] < 24 && +x[2] < 60 ? ('0' + x[1]).slice(-2) + ':' + x[2] : ''; };
  tm_datesIn_(text, d0).forEach(function (x) {
    if (best || x[0] < d0) return;
    if (strict && x[3] === 'date' && !/(^|[^а-я])(до|к|срок[а-я]*:?)\s*$/.test(low.slice(Math.max(0, x[1] - 14), x[1]) + ' ') && !/^(до|к)\s/.test(low.slice(x[1], x[1] + 3))) return;
    best = { due: x[0], t: hm(low.slice(x[2], x[2] + 14)) };
  });
  if (!best && /(^|[^а-я])(сегодня|до конца дня)([^а-я]|$)/.test(low)) { var tt = /(?:до|к)\s*(\d{1,2})[:.](\d{2})/.exec(low); best = { due: d0, t: tt && +tt[1] < 24 ? ('0' + tt[1]).slice(-2) + ':' + tt[2] : '18:00' }; }
  if (!best && !strict) { var t2 = /(?:^|\s)(?:в|до|к)?\s*(\d{1,2})[:.](\d{2})(?!\d)/.exec(low); if (t2 && +t2[1] < 24 && +t2[2] < 60) best = { due: d0, t: ('0' + t2[1]).slice(-2) + ':' + t2[2] }; }
  return best;
}
/** 13.11: автору постановки на контроль — лично: что взято, исполнители, срок; нет срока / исполнителей — спросить (кроме Т. В.) */
function tm_remAskAuthor_(ctx, st, k, a, who, dl) {
  var need = a.need || [], qs = [];
  if (need.indexOf('due') >= 0) qs.push('к какому сроку ждать выполнения (дату, при необходимости время — например «16.11 12:00»)');
  if (need.indexOf('who') >= 0) qs.push('кто основные исполнители (фамилии)');
  var sn = ''; Object.keys(st.q).some(function (qk) { var q = st.q[qk]; if (q.ctl && q.mid === (a.qmid || a.mid) && String(q.cid) === String(a.cid)) { sn = tm_sq_(q.text).slice(0, 90); return true; } return false; });
  var txt = '✅ Взял на контроль ваше сообщение в группе «' + (a.g || 'группа') + '»' + (sn ? ': «' + sn + (sn.length >= 90 ? '…' : '') + '»' : '') + (who.length ? '\nИсполнители: ' + who.join(', ') : '') + (dl ? (who.length ? ', срок ' : '\nСрок: ') + dl : '') + '.';
  txt += qs.length ? '\n\nУточните, пожалуйста, ' + qs.join(' и ') + ' — ответьте здесь одним сообщением. До вашего ответа исполнителям не напоминаю; без ответа — напомню им со следующего рабочего дня.'
                   : ' В срок проверю ответ и, если его не будет, напомню исполнителям.';
  var r = tm_sendOnce_('ctl:auth:' + k, 'user', { uid: String(a.author), text: txt }, 'remind');
  if (r.ok && qs.length) { var L0 = (st.ask_author = st.ask_author || {})[String(a.author)]; if (!Array.isArray(L0)) L0 = st.ask_author[String(a.author)] = L0 ? [L0] : [];
    L0.push({ k: k, cid: a.cid, qmid: a.qmid || a.mid, t: ctx.msk.iso, need: need.slice(), g: a.g || '' }); if (L0.length > 10) L0.splice(0, L0.length - 10); }
  return r.ok;
}
/** 13.11: ответ автора лично боту (срок / исполнители) — пишется в ctl_author.json (ядро, под замком), применяется здесь, под таймером */
function tm_remAuthApply_(ctx, st, cfg, org) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return 'замок';
  var n = 0;
  try {
    var A = tm_load_('ctl_author.json', {}) || {};
    Object.keys(A).forEach(function (id) {
      var x = A[id]; if (!x || x.applied) { if (x && x.applied && String(x.applied) < tm_addDays_(ctx.today, -3)) delete A[id]; return; }
      var L = (st.ask_author || {})[String(x.uid)]; if (L && !Array.isArray(L)) L = [L];
      var ask = (L || []).filter(function (y) { return y.k === x.k; })[0]; if (!ask) { x.applied = ctx.msk.iso; x.why = 'нет вопроса'; return; }
      var qs = Object.keys(st.q).map(function (k) { return st.q[k]; }).filter(function (q) { return q.ctl && q.st === 'open' && String(q.cid) === String(ask.cid) && q.mid === ask.qmid; });
      if (x.due) qs.forEach(function (q) { q.due = x.due; q.due_t = x.due_t || ''; delete q.due_fb; q.need = (q.need || []).filter(function (w) { return w !== 'due'; }); });
      if (x.who && x.who.length) qs.filter(function (q) { return !q.to_uid; }).forEach(function (gq) {
        x.who.forEach(function (w) {
          var qid = tm_sha12_(String(ask.cid) + ask.qmid + ':' + w[0]); if (st.q[qid]) return;
          var q = JSON.parse(JSON.stringify(gq)); q.to_uid = String(w[0]); q.to_name = w[1]; q.rem = []; q.need = (q.need || []).filter(function (z) { return z !== 'who'; });
          var p = tm_person_(cfg, org, w[1], q.to_uid) || {}; q.mail = p.mail || ''; q.fio = p.fio || ''; q.dep = p.dep || ''; q.first = tm_firstName_(w[1], p.fio); if (!q.mail) q.no_mail = true;
          st.q[qid] = q;
        });
        gq.st = 'dup'; gq.dup_t = ctx.msk.iso;
      });
      ask.need = (ask.need || []).filter(function (w) { return !(w === 'due' && x.due) && !(w === 'who' && x.who && x.who.length); });
      if (!ask.need.length) { L.splice(L.indexOf(ask), 1); if (L.length) st.ask_author[String(x.uid)] = L; else delete st.ask_author[String(x.uid)]; }
      x.applied = ctx.msk.iso; n++;
    });
    tm_save_('ctl_author.json', A);
  } finally { lock.releaseLock(); }
  return n;
}
/** 13.11: ответ автора лично боту — срок и/или исполнители по его постановке на контроль (вызывается ядром из лички, до зеркала) */
function tm_remCtlDmAnswer_(uid, name, text, m) {
  try {
    uid = String(uid || ''); text = String(text || '').trim(); if (!uid || !text || /^\//.test(text)) return false;
    var st = tm_load_('remind.json', {}) || {}, L = (st.ask_author || {})[uid]; if (L && !Array.isArray(L)) L = [L];
    var ask = (L || []).filter(function (y) { return (y.need || []).length; }).pop(); if (!ask) return false;   // последний открытый вопрос автору
    var now = tm_msk_(Date.now()), d0 = now.iso.slice(0, 10); if (String(ask.t || '') < tm_addDays_(d0, -3)) return false;
    var need = ask.need || [], dd = need.indexOf('due') >= 0 ? tm_ctlDue_(text, d0, false) : null, who = [];
    var names = ((st.members || {})[ask.cid] || {}).names || {};
    if (need.indexOf('who') >= 0) tm_namesInText_(text, names).forEach(function (u) { if (String(u) !== uid) who.push([String(u), String(names[u] || '').split(' (@')[0]]); });
    if (!dd && !who.length) return false;
    var lock = LockService.getScriptLock(); if (!lock.tryLock(10000)) return false;
    try { var A = tm_load_('ctl_author.json', {}) || {}; A[uid + ':' + Date.now()] = { uid: uid, k: ask.k, t: now.iso, due: dd ? dd.due : '', due_t: dd ? dd.t : '', who: who, text: text.slice(0, 300) }; tm_save_('ctl_author.json', A); }
    finally { lock.releaseLock(); }
    var left = need.filter(function (w) { return !(w === 'due' && dd) && !(w === 'who' && who.length); });
    var msg = 'Спасибо, записал' + (dd ? ': срок ' + tm_ddmm_(dd.due) + (dd.t ? ' ' + dd.t : '') : '') + (who.length ? (dd ? '; ' : ': ') + 'исполнители — ' + who.map(function (w) { return w[1]; }).join(', ') : '') + '.';
    msg += left.length ? ' Уточните, пожалуйста, ещё ' + (left[0] === 'due' ? 'срок' : 'исполнителей') + '.' : ' В срок проверю ответ и, если его не будет, напомню исполнителям.';
    tm_send_('user', { uid: uid, text: msg });
    tm_log_('remind', 'ответ автора контроля: ' + (name || uid));
    return true;
  } catch (e) { tm_log_('remind', 'ответ автора контроля — ошибка: ' + e); return false; }
}
/** подтверждение «взял на контроль» — один раз на сообщение, ответом на него; старше суток — не шлём (подхвачено задним числом) */
function tm_remAck_(ctx, st) {
  if (!st.ack || ctx.quiet) return 0;
  var n = 0;
  Object.keys(st.ack).forEach(function (k) {
    var a = st.ack[k]; if (a.sent || (a.tries || 0) >= 3) return;
    if (tm_isoMs_(a.t) < ctx.msk.ms - 24 * 3600e3) { a.sent = 'old'; return; }
    var who = (a.who || []).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    var dl = a.due ? tm_ddmm_(a.due) + (a.due_t ? ' ' + a.due_t : '') : '';
    var txt = '✅ Взял на контроль.' + (who.length ? ' Исполнители: ' + who.join(', ') + '.' : '') + (dl ? ' Срок: ' + dl + '.' : (a.own || !a.author ? '' : ' Срок уточняю у автора.')) +
              ' Ответ — ответом на это сообщение.';
    var r = tm_sendOnce_('ctl:ack:' + k, 'chat', { cid: a.cid, text: txt, reply: a.mid, ctl: true }, 'remind');
    a.tries = (a.tries || 0) + 1;
    if (r.ok) {
      a.sent = ctx.msk.iso; a.amid = r.mid || ''; n++;
      if (r.mid) Object.keys(st.q).forEach(function (qk) { var q = st.q[qk]; if (q.ctl && q.mid === (a.qmid || a.mid) && String(q.cid) === a.cid) q.rem.push({ t: ctx.msk.iso, kind: 'ack', mid: String(r.mid) }); });
      if (a.author && !a.own) tm_remAskAuthor_(ctx, st, k, a, who, dl);
    }
  });
  var ks = Object.keys(st.ack); if (ks.length > 300) ks.slice(0, ks.length - 200).forEach(function (k) { delete st.ack[k]; });
  return n;
}
/** F4 C-B1: сообщение m — ответ на вопрос q? Связь: ответ (reply) на вопрос или на напоминание бота о нём, упоминание автора вопроса, ответ на другое
    сообщение автора вопроса; без такой связи — только содержательный текст (не приветствие/«спасибо»), не ответ на чужое сообщение и с общим словом с вопросом. */
function tm_remIsAnswer_(m, q, byMid, qMids) {
  var t0 = String(m.text || '').trim();                                     // 12.11: адресат после вопроса написал по делу (не «доброе утро»/«спасибо») — ответ есть, не напоминаем
  if (q.to_uid && String(m.uid) === String(q.to_uid) && ((t0 && !TM_COURTESY_RX.test(t0)) || m.fwd || (m.att && m.att.length))) return true;
  var rem = (q.rem || []).map(function (r) { return r.mid; }).filter(Boolean);
  if (m.rmid && (m.rmid === q.mid || rem.indexOf(m.rmid) >= 0)) return true;
  if (m.rmid && qMids && qMids[m.rmid]) return false;                       // ответ на ДРУГОЙ отслеживаемый вопрос — не про этот
  if (q.from_uid && (m.mentions || []).map(String).indexOf(String(q.from_uid)) >= 0) return true;
  if (m.rmid) { var r = byMid[m.rmid]; return !!(r && q.from_uid && String(r.uid) === String(q.from_uid)); }
  var txt = String(m.text || '').trim() || String((m.fwd || {}).text || '').trim();   // 10.11: у пересылки — текст пересланного
  if (!txt) return tm_remMediaAns_(m, q);                                   // 10.11: фото, файл, голосовое, пересылка без текста
  if (TM_COURTESY_RX.test(txt)) return false;
  var A = tm_stems_(txt), B = tm_stems_(q.text), N = tm_stems_((q.to_name || '') + ' ' + (q.from || '') + ' ' + (m.name || ''));   // имена участников — не «общие слова»
  return Object.keys(A).some(function (k) { return !!B[k] && !N[k]; });
}
/** 10.11.2026 (Т. В.: «Исправь код ошибки напоминания»): ответ без текста — фото, файл, голосовое или пересылка — снимает вопрос,
    если пришёл не позже TM_MEDIA_ANS_H часов после вопроса или после напоминания бота о нём (связи reply нет — её проверяет вызывающий).
    До исправления такие ответы не засчитывались, и бот каждые 2 часа писал «на этот вопрос ещё нет ответа»
    («Снабжение _Производство», 09.11: на «Почему нет!?» 11:14 О. Сотрудник76 ответила пересылками в 11:18 и 11:20). */
var TM_MEDIA_ANS_H = 3;
function tm_remMediaAns_(m, q) {
  if (!m.fwd && !(m.att && m.att.length)) return false;
  var marks = [Number(q.ts) || 0].concat((q.rem || []).filter(function (r) { return r.kind === 'group' && r.t; }).map(function (r) { return tm_isoMs_(r.t); }));
  return marks.some(function (t) { return t > 0 && m.ts > t && m.ts - t <= TM_MEDIA_ANS_H * 3600e3; });
}
/** ответ после вопроса (F4 C-B1): личный вопрос — сообщение адресата, связанное с вопросом (tm_remIsAnswer_); вопрос группе — такое же сообщение любого,
    кроме владельца и бота → done. «Доброе утро» и сообщения о другом контроль не снимают. */
function tm_remAnswers_(st, G, owner, bot) {
  var n = 0, qMids = {}; Object.keys(st.q).forEach(function (k) { if (st.q[k].mid) qMids[st.q[k].mid] = 1; });
  Object.keys(st.q).forEach(function (k) {
    var q = st.q[k]; if (q.st !== 'open' || !G[q.cid]) return;
    var byMid = {}; G[q.cid].msgs.forEach(function (m) { byMid[m.mid] = m; });
    G[q.cid].msgs.some(function (m) {
      if (m.ts <= q.ts || m.bot || !m.mid || String(m.uid) === String(bot)) return false;
      if (q.to_uid) { if (String(m.uid) !== String(q.to_uid)) return false; }
      else if ((owner && String(m.uid) === String(owner)) || (!owner && TM_OWNER_RE.test(m.name || ''))) return false;
      if (!tm_remIsAnswer_(m, q, byMid, qMids)) return false;
      q.st = 'done'; q.done_t = tm_msk_(m.ts).iso; q.ans_mid = m.mid; q.ans_by = m.name || ''; n++; return true;
    });
  });
  return n;
}
/** обращение в письме: Имя Отчество из cfg (fio), иначе ФИО из оргструктуры, иначе имя в MAX */
function tm_greetName_(cfg, org, mail, fallback) {
  var ml = String(mail || '').toLowerCase(), list = (cfg.executors || []).concat(cfg.people || []);
  for (var i = 0; i < list.length; i++) {
    var p = list[i]; if (!p || !ml || String(p.mail || '').toLowerCase() !== ml) continue;
    var f = String(p.fio || '').split(/\s+/).filter(Boolean); if (f.length >= 3) return f[1] + ' ' + f[2]; if (p.name) return p.name;
  }
  var o = org[ml]; return o && o[0] && o[0] !== fallback ? o[0] : fallback;
}
/** письмо людям из напоминаний: → запись {t, kind, to, cc, r} | null (ошибка, тихие часы — повтор в следующий прогон) */
function tm_remMail_(ctx, kind, subj, text, to, cc, res) {
  var r = tm_mail_(to, cc, subj, text, false);
  if (r === 'ok' || r === 'dry') return { t: ctx.msk.iso, kind: 'mail', to: to, cc: cc, r: r };
  if (r !== 'quiet') (res.err = res.err || []).push(kind + ': ' + r);
  return null;
}
function tm_qMailText_(ctx, q, cfg, org, repeat) {
  var head = tm_headOf_(cfg, org, q.dep, q.mail);
  if (head && (tm_banned_(cfg, ctx.today, head, null) || head === q.mail)) head = null;
  var who = q.from_owner ? 'Т. В. Сотрудник1' : q.from, greet = ctx.msk.h >= 17 ? 'добрый вечер' : 'добрый день';
  return { head: head, subj: 'Вопрос без ответа в группе «' + q.g + '» (' + tm_dmy_(q.t) + ')' + (repeat ? ' — повторно' : ''),
           text: tm_greetName_(cfg, org, q.mail, q.to_name) + ', ' + greet + '.\n\nВ группе «' + q.g + '» ' + tm_dmy_(q.t) + ' в ' + q.t.slice(11, 16) + ' ' + who +
                 ' задал(а) вам вопрос, ответа в группе пока нет:\n«' + q.text.slice(0, 300) + '»\n\nПожалуйста, ответьте в группе.\n\nЭто автоматическое напоминание бота «Фабрикант» (портал «Фабрика»)' + (head ? '; копия — руководителю отдела' : '') + '.' };
}
/** лестница: в группу через 2 ч и далее каждые 2 ч (09–18, до 4 в день); письмо — 18:00–18:59 (вопрос старше 2 ч) и 09:xx следующего дня */
function tm_remLadder_(ctx, st, cfg, org, res) {
  var h = ctx.msk.h, two = 2 * 3600e3, n = 0, today = ctx.today, G = {}, GO = [];   // G: напоминания в группу, собранные по сообщению
  Object.keys(st.q).forEach(function (k) {
    var q = st.q[k]; if (q.st !== 'open') return;
    var qms = tm_isoMs_(q.t), qd = q.t.slice(0, 10);
    if (tm_wdBetween_(q.ctl && q.due && q.due > qd ? q.due : qd, today) > TM_REM_MAX_WD) {
      if (q.ctl && q.to_uid && !q.from_owner && q.from_uid) {                  // 13.11: снято с напоминаний без ответа — сказать тому, кто ставил на контроль
        if (!ctx.workday || ctx.quiet || ctx.msk.h < 9) return;
        var st0 = '⚠️ ' + 'На контроле без ответа: ' + String(q.to_name).split(' (@')[0] + ' — ваше сообщение в группе «' + q.g + '» от ' + tm_dmy_(q.t) + ':\n«' + q.text.slice(0, 200) +
                  '»\n\nНапоминал лично и в группе. Дальше — на ваше решение.';
        tm_sendOnce_('rem:ctlstale:' + k, 'user', { uid: String(q.from_uid), text: st0 }, 'remind');
      }
      q.st = 'stale'; q.stale_t = ctx.msk.iso; return;
    }
    if (q.to_uid && tm_banned_(cfg, today, q.mail, q.to_name)) { q.ban = true; return; }
    delete q.ban;
    if (!ctx.workday || ctx.quiet) return;
    var gLast = q.rem.filter(function (r) { return r.kind === 'group'; }).map(function (r) { return r.t; }).sort().pop() || '';
    if (q.ctl) {                                                                // 13.11 (Т. В.): до срока — не напоминаем; срок не указан и автор не ответил — со следующего рабочего дня 10:00
      if (!q.due) { var fb = tm_nextWorkday_(tm_addDays_(qd, 1)); if (today < fb || (today === fb && h < 10)) return; q.due = fb; q.due_t = '10:00'; q.due_fb = true; }
      var sMs = tm_isoMs_(q.due + 'T' + (q.due_t || '10:00')); if (ctx.msk.ms < sMs) return;
      qms = Math.max(qms, sMs - two);
    }
    // 13.11: поставлено на контроль отметкой бота — в срок сначала лично в бота; в группу — только если лично не дошло или ещё через 2 ч без ответа
    var dmR = q.rem.filter(function (r) { return r.kind === 'dm' || r.kind === 'dm_fail'; })[0];
    if (q.ctl && q.to_uid && !dmR && h >= 9 && h < 18 && ctx.msk.ms >= qms + two) {
      var dt = '🔔 ' + (q.first || tm_firstName_(q.to_name)) + ', ' + (q.from_owner ? 'Т. В. Сотрудник1' : String(q.from).split(' (@')[0]) + ' поставил(а) на контроль ваш ответ в группе «' + q.g + '» (' +
               tm_dmy_(q.t) + ', ' + q.t.slice(11, 16) + '):\n«' + q.text.slice(0, 300) + '»\n\nОтветьте, пожалуйста, в группе — ответом на это сообщение там. Спасибо!';
      var rd = tm_sendOnce_('rem:dm:' + k, 'user', { uid: q.to_uid, text: dt }, 'remind');
      q.rem.push({ t: ctx.msk.iso, kind: rd.ok ? 'dm' : 'dm_fail', mid: '' }); if (rd.ok) { n++; return; }
    }
    if (q.ctl && dmR && dmR.kind === 'dm' && ctx.msk.ms < tm_isoMs_(dmR.t) + two) return;
    if (h >= 9 && h < 18 && ctx.msk.ms >= qms + two && !gLast) {             // 12.11: в группу — одно напоминание на вопрос, не каждые 2 часа
      // 13.11 (Т. В.: «Вопросы ответственным в одном сообщении должны быть») — всем исполнителям одного сообщения — одно напоминание, имена выделены
      var gk = q.cid + '|' + q.mid;
      if (!G[gk]) { G[gk] = { cid: q.cid, mid: q.mid, ctl: !!q.ctl, who: [], ks: [], all: false }; GO.push(gk); }
      G[gk].ks.push(k);
      if (q.to_uid) { var fn0 = q.first || tm_firstName_(q.to_name); if (G[gk].who.indexOf(fn0) < 0) G[gk].who.push(fn0); } else G[gk].all = true;
    }
    if (q.to_uid && h === 18 && ctx.msk.ms >= qms + two) {                // 12.11: письмо — один раз (18:00 в день вопроса), утром не повторяем
      if (q.rem.some(function (r) { return r.kind === 'mail'; })) return;
      if (!q.mail) { q.no_mail = true; return; }
      var m = tm_qMailText_(ctx, q, cfg, org, q.rem.some(function (r) { return r.kind === 'mail'; }));
      var rec = tm_remMail_(ctx, 'mail:q', m.subj, m.text, [q.mail], m.head ? [m.head] : [], res);
      if (rec) { q.rem.push(rec); n++; }
    }
  });
  GO.forEach(function (gk) {
    var g = G[gk], named = g.who.length > 0;
    var text = named ? '🔔 ' + g.who.map(function (x) { return '<b>' + tm_h_(x) + '</b>'; }).join(', ') + (g.all ? ' и коллеги' : '') +
                       ', на этот вопрос ещё нет ответа. Ответьте, пожалуйста, в группе.' : TM_GROUP_TXT;
    var r = tm_sendOnce_('rem:g:' + tm_sha12_(g.ks.slice().sort().join(',')) + ':' + today, 'chat', { cid: g.cid, text: text, reply: g.mid, ctl: g.ctl, html: named }, 'remind');
    if (r.ok) { g.ks.forEach(function (k) { st.q[k].rem.push({ t: ctx.msk.iso, kind: 'group', mid: r.mid || '' }); }); n++; }   // mid напоминания: ответ на него тоже закрывает вопрос (C-B1)
  });
  return n;
}
function tm_what_(it) { return tm_sq_(it.what || '').slice(0, 200); }
function tm_srcOf_(it) { return it.author && it.at ? ' (из сообщения ' + it.author + ', ' + tm_ddmm_(it.at) + ')' : ''; }
function tm_escLines_(lst) { return lst.map(function (x, i) { return (i + 1) + ') «' + tm_what_(x[0]) + '» — срок ' + tm_ddmm_(x[0].due) + ', просрочка ' + tm_daysRu_(x[1]) + tm_srcOf_(x[0]); }).join('\n'); }
/** эскалация по пунктам контроля: день 3 — личное сообщение и письмо исполнителю (18:xx); день 5 — письмо руководителю отдела; день 10 — отметка в сводку */
function tm_escalate_(ctx, st, cfg, org, ctl, names, owner, bot, cidKom, res) {
  if (!ctx.workday) return 0;
  var E = st.esc, n = 0, h = ctx.msk.h, today = ctx.today, by = {};
  Object.keys(ctl.items || {}).forEach(function (k) {
    var it = ctl.items[k];
    if (it.st !== 'open' || !it.due || it.due >= today || !it.id) return;
    var uid = it.who_uid, who = it.who || '';
    if (!uid || who === 'Коллеги' || String(uid) === String(owner) || String(uid) === String(bot) || TM_OWNER_RE.test(who)) return;
    if (tm_isLeader_(who, uid, null)) return;
    var D = tm_wdBetween_(it.due, today);
    if (D >= 3) (by[String(uid)] = by[String(uid)] || []).push([it, D]);
  });
  Object.keys(by).sort().forEach(function (uid) {
    var lst = by[uid].sort(function (a, b) { return a[0].due < b[0].due ? -1 : 1; }), nm = names[uid] || lst[0][0].who || '';
    if (tm_banned_(cfg, today, null, nm)) return;
    var p = tm_person_(cfg, org, nm, uid) || {};
    if (p.mail && tm_banned_(cfg, today, p.mail, null)) return;
    var first = tm_firstName_(nm, p.fio), head = tm_headOf_(cfg, org, p.dep, p.mail);
    if (head && (tm_banned_(cfg, today, head, null) || head === p.mail)) head = null;
    lst.forEach(function (x) { var e = E[x[0].id] || (E[x[0].id] = { who: nm, uid: uid, what: tm_what_(x[0]), due: x[0].due }); e.d = x[1]; e.t = ctx.msk.iso; if (x[1] >= 10 && !e.d10) e.d10 = { t: ctx.msk.iso }; });
    var d3 = lst.filter(function (x) { return x[1] >= 3 && x[1] < 5 && !E[x[0].id].d3; });
    if (d3.length) { d3.forEach(function (x) { E[x[0].id].d3 = { t: ctx.msk.iso, skip: 'отключено 12.11 — без повторных вопросов человеку' }; }); d3 = []; }   // 12.11 (2)
    if (d3.length && !ctx.quiet && h >= 8) {
      var text = d3.length === 1
        ? '⚠️ ' + first + ', по пункту «' + tm_what_(d3[0][0]) + '» срок ' + tm_ddmm_(d3[0][0].due) + ' прошёл ' + tm_daysRu_(d3[0][1]) + ' назад, ответа в группе нет. Ответьте, пожалуйста, на вопрос бота в группе сегодня до 18:00.'
        : '⚠️ ' + first + ', по пунктам контроля срок прошёл, ответа в группе нет:\n' + tm_escLines_(d3) + '\nОтветьте, пожалуйста, на вопросы бота в группе сегодня до 18:00.';
      var id = 'esc:d3:' + uid + ':' + d3.map(function (x) { return x[0].id; }).join(','), rec = null;
      var r = tm_sendOnce_(id, 'user', { uid: uid, text: text }, 'remind');
      if (r.ok) rec = { t: ctx.msk.iso };
      else if (r.code === 404) rec = { t: ctx.msk.iso, via: 'общий список 10:00', err: 'нет диалога с ботом' };   // 11.11 (Т. В.): в группу отдельным сообщением не пишем — ⚠️ в общем списке
      if (rec) { d3.forEach(function (x) { E[x[0].id].d3 = rec; }); n++; }
    }
    var d3m = lst.filter(function (x) { return x[1] >= 3 && x[1] < 5 && !E[x[0].id].d3m; });
    if (d3m.length) { d3m.forEach(function (x) { E[x[0].id].d3m = { t: ctx.msk.iso, skip: 'отключено 12.11 — без повторных писем человеку' }; }); d3m = []; }   // 12.11 (2)
    if (d3m.length && h === 18) {
      if (!p.mail) d3m.forEach(function (x) { E[x[0].id].d3m = { t: ctx.msk.iso, no_mail: true }; });
      else {
        var one = d3m.length === 1;
        var txt = tm_greetName_(cfg, org, p.mail, nm) + ', добрый вечер.\n\nПо ' + (one ? 'пункту' : 'пунктам') + ' контроля в группе «Коммерческий отдел» срок прошёл, ответа в группе нет:\n' + tm_escLines_(d3m) +
                  '\n\nПожалуйста, ответьте в группе ответом (reply) на вопрос бота — что сделано или новый срок — до 12:00 следующего рабочего дня.\n\nЭто автоматическое напоминание бота «Фабрикант» (портал «Фабрика»)' + (head ? '; копия — руководителю отдела' : '') + '.';
        var subj = one ? 'Невыполненное поручение — ' + tm_daysRu_(d3m[0][1]) : 'Невыполненные поручения (' + d3m.length + ') — до ' + tm_daysGen_(Math.max.apply(null, d3m.map(function (x) { return x[1]; })));
        var rm = tm_remMail_(ctx, 'mail:esc3', subj, txt, [p.mail], head ? [head] : [], res);
        if (rm) { d3m.forEach(function (x) { E[x[0].id].d3m = rm; }); n++; }
      }
    }
    var d5 = lst.filter(function (x) { return x[1] >= 5 && !E[x[0].id].d5; });
    if (d5.length && (!head || tm_isLeader_(null, null, head))) { d5.forEach(function (x) { E[x[0].id].d5 = { t: ctx.msk.iso, skip: 'руководство' }; }); d5 = []; }   // «примите решение» руководству не шлём — пункт в сводке
    if (d5.length && !ctx.quiet && h >= 8) {
      var to = [head], one5 = d5.length === 1;
      var t5 = tm_greetName_(cfg, org, head, head) + ', добрый день.\n\n' + (one5 ? 'Поручение' : 'Поручения') + ' не выполнен' + (one5 ? 'о' : 'ы') + ', на напоминания бота в группе ответа нет. Исполнитель — ' + nm + (p.fio ? ' (' + p.fio + ')' : '') +
               ', группа «Коммерческий отдел»:\n' + tm_escLines_(d5) + '\n\nПрошу принять решение: новый срок, замена исполнителя или снятие пункта — ответом на это письмо или в группе.\n\nЭто автоматическое письмо бота «Фабрикант» (портал «Фабрика»).';
      var s5 = one5 ? 'Невыполненное поручение — ' + tm_daysRu_(d5[0][1]) : 'Невыполненные поручения (' + d5.length + ') — до ' + tm_daysGen_(Math.max.apply(null, d5.map(function (x) { return x[1]; })));
      var r5 = tm_remMail_(ctx, 'mail:esc5', s5, t5, to, [], res);
      if (r5) { d5.forEach(function (x) { E[x[0].id].d5 = r5; }); n++; }
    }
  });
  return n;
}
/** просроченные пункты руководства (st='lead'), которые бот не спрашивает → [[item, кто, рабочих дней просрочки]] */
function tm_leadOverdue_(ctl, today) {
  var out = [];
  Object.keys(ctl.items || {}).forEach(function (k) {
    var it = ctl.items[k];
    if (it.st !== 'lead' || !it.due) return;
    if (it.src === 'group' && it.author && it.author === it.who) return;
    var fio = tm_isLeader_(it.who, it.who_uid, null);
    if (!fio || fio === 'владелец' || (fio.indexOf('Сотрудник2') >= 0 && fio.indexOf('Сотрудник1') >= 0)) return;
    if (it.due >= today) return;
    var D = tm_wdBetween_(it.due, today); if (D < 1 || D > TM_LEAD_MAX_WD) return;
    out.push([it, it.who || fio, D]);
  });
  return out.sort(function (a, b) { return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : (a[0].due < b[0].due ? -1 : 1); });
}
/** рабочий день, 08:45–12:00, раз в день: письмо ТОЛЬКО владельцу — просроченные пункты руководства; пунктов нет — письма нет */
function tm_leadDigest_(ctx, st, ctl, res) {
  var m = tm_minOf_(ctx.msk);
  if (!ctx.workday || m < 8 * 60 + 45 || m >= 12 * 60) return 0;
  if (st.lead_sent.indexOf(ctx.today) >= 0) return 0;
  var lst = tm_leadOverdue_(ctl, ctx.today);
  if (!lst.length) { st.lead_sent.push(ctx.today); st.lead_sent = st.lead_sent.slice(-30); return 0; }
  var by = {}; lst.forEach(function (x) { (by[x[1]] = by[x[1]] || []).push(x); });
  var parts = [];
  Object.keys(by).sort().forEach(function (who) { parts.push(who + ':'); by[who].forEach(function (x, i) { parts.push('  ' + (i + 1) + ') «' + tm_what_(x[0]) + '» — срок ' + tm_ddmm_(x[0].due) + ', просрочка ' + tm_daysRu_(x[2]) + tm_srcOf_(x[0])); }); });
  var text = 'Сотрудник2 Отчество1, добрый день.\n\nПо этим пунктам бот больше не задаёт вопросов (руководство и участники совещания), а ответа нет — для обсуждения на совещании ' + tm_ddmm_(ctx.today) + ':\n\n' +
             tm_mask_(parts.join('\n')) + '\n\nПункты — из контрольных точек группы MAX «Коммерческий отдел». Письмо только вам.\n— бот «Фабрикант»';
  var r = tm_mail_([TM_ITM], [], 'Просроченные пункты руководителей — на совещание ' + tm_ddmm_(ctx.today), text, true);
  if (r !== 'ok' && r !== 'dry') { (res.err = res.err || []).push('lead: ' + r); return 0; }
  st.lead_sent.push(ctx.today); st.lead_sent = st.lead_sent.slice(-30);
  st.lead_log.push({ t: ctx.msk.iso, n: lst.length }); st.lead_log = st.lead_log.slice(-60);
  return lst.length;
}
/** строки для утреннего отчёта владельцу: вопросы без ответа и поручения на решение */
function tm_overdueSummary_(st, ctl, today) {
  var out = [];
  Object.keys(st.q).map(function (k) { return st.q[k]; }).filter(function (q) { return q.st === 'open' || q.st === 'stale'; }).sort(function (a, b) { return a.t < b.t ? -1 : 1; }).forEach(function (q) {
    var d = tm_daysDiff_(today, q.t.slice(0, 10)), who = q.to_uid ? q.to_name : 'Коллеги (вопрос Т. В. Сотрудник1)';
    if (q.st === 'stale') out.push(who + ' — вопрос ' + tm_ddmm_(q.t) + ' в «' + q.g + '» — без ответа больше ' + TM_REM_MAX_WD + ' рабочих дней, напоминания остановлены');
    else out.push(who + ' — вопрос ' + tm_ddmm_(q.t) + ' в «' + q.g + '» — напоминаний ' + q.rem.length + ' — без ответа ' + tm_daysRu_(d) + (q.no_mail ? ' — почта не найдена' : ''));
  });
  var items = ctl.items || {};
  Object.keys(st.esc).sort(function (a, b) { return (st.esc[a].due || '') < (st.esc[b].due || '') ? -1 : 1; }).forEach(function (iid) {
    var e = st.esc[iid], it = items[iid]; if (!it || it.st !== 'open') return;
    var D = tm_wdBetween_(it.due, today);
    if (D >= 10) out.push('⛔ 10 дней — требуется решение руководителя: ' + e.who + ' — «' + String(e.what).slice(0, 120) + '» (срок ' + tm_ddmm_(it.due) + '), просрочка ' + tm_daysRu_(D));
    else if (D >= 5) out.push(e.who + ' — поручение «' + String(e.what).slice(0, 120) + '» (срок ' + tm_ddmm_(it.due) + ') — просрочка ' + tm_daysRu_(D) + ' — на решение');
  });
  tm_leadOverdue_(ctl, today).forEach(function (x) { out.push(x[1] + ' — «' + tm_what_(x[0]).slice(0, 160) + '» (срок ' + tm_ddmm_(x[0].due) + '), просрочка ' + tm_daysRu_(x[2]) + tm_srcOf_(x[0]) + ' — бот не спрашивает, обсудить на совещании'); });
  return out;
}
/** ПЯТИМИНУТНЫЙ ТИК: вопросы без ответа во всех группах бота (или только в «Коммерческом отделе» — tm_settings → remind_groups) */
function tm_remind_(ctx) {
  var cfg = tm_pollCfg_(), org = tm_org_(), st = tm_remState_(), bot = tm_botUid_(), komCid = tm_komCid_(), res = {};
  var only = String(tm_cfgGet_('remind_groups', 'all')) === 'kom', G = {}, namesOf = {}, komOk = tm_chatOk_(komCid);
  var cids = (only ? [komCid] : tm_histGroups_()).filter(tm_chatOk_); if (!only && komOk && cids.indexOf(komCid) < 0) cids.push(komCid);   // F4 C-A7: только разрешённые группы
  if (!only) tm_histGroupsAll_().forEach(function (cid) { if (cids.indexOf(cid) < 0) { cids.push(cid); (G.__ctlOnly = G.__ctlOnly || {})[cid] = 1; } });   // 13.11: отметка бота — во всех группах
  var ctlOnly = G.__ctlOnly || {}; delete G.__ctlOnly;
  cids.forEach(function (cid) { var H = tm_hist_(cid), msgs = tm_histList_(H); if (!msgs.length && cid !== komCid) return; G[cid] = { title: H.title || tm_groupTitle_(cid), msgs: msgs, ctlOnly: !!ctlOnly[cid] }; });
  Object.keys(G).forEach(function (cid) {
    var names = {}, mem = st.members[cid] || {}, day = ctx.today, fails = mem.fd === day ? (mem.fail || 0) : 0;
    if (mem.d !== day && fails < 3) {
      var r = tm_send_('members', { cid: cid });
      if (r.ok && r.members) { mem = { d: day, names: r.members }; st.members[cid] = mem; }
      else if (!r.stub) { mem.fd = day; mem.fail = fails + 1; st.members[cid] = mem; }
    }
    Object.keys(mem.names || {}).forEach(function (u) { names[u] = mem.names[u]; });
    G[cid].msgs.forEach(function (m) { if (m.uid && m.name && !m.bot) names[m.uid] = m.name; });
    namesOf[cid] = names;
  });
  var owner = tm_ownerUid_();
  if (!owner) Object.keys(namesOf).some(function (cid) { return Object.keys(namesOf[cid]).some(function (u) { if (TM_OWNER_RE.test(namesOf[cid][u] || '')) { owner = u; return true; } return false; }); });
  if (!st.since) st.since = ctx.today + 'T00:00';                              // вопросы — с первого запуска (старые не поднимаем)
  res.groups = Object.keys(G).length; res.owner = !!owner;
  res['new'] = tm_remScan_(st, G, namesOf, owner, bot, tm_isoMs_(st.since), cfg, org);
  res.done = tm_remAnswers_(st, G, owner, bot);
  if (!st.mig1311c) { res.mig = tm_remMigCtl_(ctx, st, namesOf, cfg, org); st.mig1311c = ctx.msk.iso; }   // 13.11: постановки v33–v35 — срок/исполнители по новым правилам
  res.auth = tm_remAuthApply_(ctx, st, cfg, org);                               // 13.11: ответы авторов (срок, исполнители) — до подтверждений и лестницы
  res.ack = tm_remAck_(ctx, st);                                                // 13.11: «взял на контроль» на отметку бота
  res.rem = tm_remLadder_(ctx, st, cfg, org, res);
  var ctl = tm_load_('ctl.json', {}), namesC = {};
  Object.keys(ctl.names || {}).forEach(function (k) { namesC[String(k)] = ctl.names[k]; });
  Object.keys(namesOf[komCid] || {}).forEach(function (k) { namesC[k] = namesOf[komCid][k]; });
  res.esc = komOk ? tm_escalate_(ctx, st, cfg, org, ctl, namesC, owner, bot, komCid, res) : 'группа выключена';   // пункты «Коммерческого отдела» — только пока он разрешён
  res.lead = tm_leadDigest_(ctx, st, ctl, res);
  var lim = tm_msk_(ctx.msk.ms - TM_HIST_DAYS * 864e5).iso;
  Object.keys(st.q).forEach(function (k) { if (st.q[k].t < lim) delete st.q[k]; });
  var items = ctl.items || {};
  Object.keys(st.esc).forEach(function (k) { var e = st.esc[k]; if (!items[k] || !(items[k].st === 'open' || (e.t || '') >= lim)) delete st.esc[k]; });
  st.last = ctx.msk.iso; st.owner_uid = owner;
  tm_save_('remind.json', st);
  var opn = Object.keys(st.q).map(function (k) { return st.q[k]; }).filter(function (q) { return q.st === 'open'; });
  var out = { v: 1, t: ctx.msk.iso, on: true,
    open: Object.keys(st.q).sort(function (a, b) { return st.q[a].t < st.q[b].t ? -1 : 1; }).filter(function (k) { return st.q[k].st === 'open'; }).map(function (k) {
      var q = st.q[k]; return { id: k, g: q.g, t: q.t, 'from': q.from.slice(0, 60), to: q.to_name.slice(0, 60), text: tm_mask_(q.text).slice(0, 300), rem: q.rem.length, days: tm_daysDiff_(ctx.today, q.t.slice(0, 10)), mail: !!q.mail, no_mail: !!q.no_mail, ban: !!q.ban }; }),
    stats: { open: opn.length, done_today: Object.keys(st.q).filter(function (k) { return st.q[k].st === 'done' && String(st.q[k].done_t || '').slice(0, 10) === ctx.today; }).length, stale: Object.keys(st.q).filter(function (k) { return st.q[k].st === 'stale'; }).length },
    esc: Object.keys(st.esc).sort(function (a, b) { return (st.esc[a].due || '') < (st.esc[b].due || '') ? -1 : 1; }).filter(function (k) { return (items[k] || {}).st === 'open'; }).slice(0, 100).map(function (k) {
      var e = st.esc[k]; return { id: k, who: e.who, what: tm_mask_(e.what).slice(0, 160), due: e.due, d: e.d, dm: !!e.d3, mail3: !!e.d3m, mail5: !!e.d5, d10: !!e.d10 }; }),
    summary: tm_overdueSummary_(st, ctl, ctx.today).map(tm_mask_) };
  tm_publish_('rem.bin', out);
  res.open = out.stats.open; res.stale = out.stats.stale;
  try { res.poruch = tm_poruch_(ctx, st, ctl); } catch (ep) { res.poruch = 'ошибка: ' + tm_err_(ep); }   // 13.11: раздел портала «Поручения»
  if (res['new'] || res.rem || res.esc) tm_log_('remind', 'новых вопросов ' + res['new'] + ', напоминаний ' + res.rem + ', эскалаций ' + res.esc);
  return res;
}


/** 11.11.2026 (Т. В.: вопросы по контрольным точкам — лично в бота): ответ человека в личке боту.
 *  Ответом считается: reply на вопрос бота в личке или любое сообщение в течение 3 дней после вопроса, пока его пункты открыты.
 *  → true, если сообщение принято как ответ (тогда помощник его не обрабатывает). */
function tm_ctlDmAnswer_(uid, name, text, m) {
  try {
    uid = String(uid || ''); text = String(text || '').trim(); if (!uid || !text || /^\//.test(text)) return false;
    var st = tm_ctlState_(), dm = (st.dm || {})[uid], lk = (m && m.link) || {}, rmid = lk.type === 'reply' ? String((lk.message || {}).mid || '') : '';
    var key = rmid && st.asks[rmid] ? rmid : (dm && dm.mid && st.asks[dm.mid] ? dm.mid : '');
    if (!key) return false;
    var now = tm_msk_(Date.now());
    if (!rmid && dm && String(dm.t || '') < tm_addDays_(now.iso.slice(0, 10), -3)) return false;
    var all = st.asks[key].map(function (iid) { return st.items[iid] || {}; });
    var open = all.filter(function (it) { return it.id && it.st !== 'done'; });
    if (!open.length) return false;
    var mm = { uid: Number(uid), name: name || (st.names || {})[uid] || '', text: text, ts: Date.now(), mid: (m && m.body && m.body.mid) || '' };
    var d0 = now.iso.slice(0, 10), got = 0;
    tm_ctlAnswer_(mm, all, d0).forEach(function (x) {
      var it = x[0]; if (open.indexOf(it) < 0) return;
      it.answer = ((mm.name || '') + ' (лично боту): ' + text).slice(0, 400); it.ans_by = mm.name || ''; it.ans_t = now.iso; got++;
      if (x[1] === 'move' && x[2]) { it.due = x[2]; it.st = 'open'; it.moved = (it.moved || 0) + 1; }
      else if (x[1] === 'done') { it.st = 'done'; it.done_t = now.iso; }
      else { it.st = 'answered'; it.answered_t = now.iso; }                     // 12.11: ответ записан — больше не спрашиваем
    });
    if (!got) { open.forEach(function (it) { it.answer = ((mm.name || '') + ' (лично боту): ' + text).slice(0, 400); it.ans_by = mm.name || ''; it.ans_t = now.iso; it.st = 'answered'; it.answered_t = now.iso; }); got = open.length; }
    tm_save_('ctl.json', st);
    tm_send_('user', { uid: uid, text: 'Спасибо, записал ответ по ' + got + ' ' + (got === 1 ? 'пункту' : 'пунктам') + '.' });
    tm_log_('ctl', 'ответ лично боту: ' + (mm.name || uid) + ', пунктов ' + got);
    return true;
  } catch (e) { tm_log_('ctl', 'ответ лично боту — ошибка: ' + e); return false; }
}
