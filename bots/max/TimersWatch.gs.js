/* «Фабрика — бот MAX» (Google 1c@) — TimersWatch.gs: остальные работы участков bots / history робота (шаг 3, ночь 05.11.2026).
   • Итоги опросов с кнопками владельцу после срока (перенос mx_survey.py): файлы «Фабрика — боты/MAX/polls/<id>.json» пишет ядро
     (формат lib.php: id, title, group, cid, created, deadline, intro_mid, q:[{q, o, mid}], a:{qN:{uID:{o, n, t}}}); здесь — только чтение,
     итоги в личные бота владельцу (можно в любое время), mxsurvey.bin для выжимки Claude.
   • Еженедельная проверка штата коммерческого отдела (перенос staff_watch.py): понедельник с 09:00, список ko_staff.json из «Для ботов»
     (его кладёт робот), вопросы руководителям письмом — кроме тех, кому бот вопросов не задаёт (leaders) и запрещённых (ban).
   • Выгрузки переписки групп по заданию (перенос mx_export.py): tm_settings → export_jobs; источник — история tm/hist_<cid>.json (60 дней).
   • Ночью: обещанные визиты и звонки по истории «Коммерческого отдела» (перенос max_hist.promises) → promises.bin; ротация листов tm_*.
   • 08:30 рабочего дня: au_reclWatchCheck общего модуля Autonomy.gs → мягкие напоминания менеджерам в группы (tm_send_, один раз на напоминание). */

var TM_SURVEY_KEEP = 60, TM_SURVEY_CHUNK = 3800;
var TM_STAFF_QUIET_DAYS = 45;
var TM_STAFF_HEADS = { 'ОП Рязань': ['Сотрудник19 Ю. А.', 'user15@example.org'], 'Сеть офисов продаж': ['Сотрудник6 М. И.', 'user8@example.org'], 'e-commerce': ['Сотрудник1 А. А.', 'user22@example.org'],
                       'Fabrikant UZ': ['Сотрудник16 К. В.', 'user16@example.org'], 'Имя3': ['Сотрудник1 Т. В.', ''], 'Руководство': ['Сотрудник1 Т. В.', ''] };
var TM_STAFF_IGNORE = /попов|джанова|фабрикант|бот|claude/i;

// REDACTED_B64_2 итоги опросов владельцу
/** опросы из папки polls (JSON по формату lib.php), менявшиеся за последние TM_SURVEY_KEEP дней (старые файлы не читаются — экономия Диска) */
function tm_pollsAll_() {
  var out = [], lo = Date.now() - TM_SURVEY_KEEP * 864e5;
  try {
    var it = maxDir_(TM_POLLS_SUB).getFiles();
    while (it.hasNext()) {
      var f = it.next(); if (!/\.json$/.test(f.getName())) continue;
      try { if (f.getLastUpdated().getTime() < lo) continue; } catch (e0) {}
      try { var p = JSON.parse(f.getBlob().getDataAsString('UTF-8')); if (p && p.id && Array.isArray(p.q)) out.push(p); } catch (e) { tm_log_('survey', 'файл опроса ' + f.getName() + ' не разобран'); }
    }
  } catch (e2) { tm_log_('survey', tm_err_(e2)); }
  return out.sort(function (a, b) { return String(a.id) < String(b.id) ? -1 : 1; });
}
function tm_pollAnswers_(p, qi) { var a = p.a && typeof p.a === 'object' ? p.a['q' + qi] : null; return a && typeof a === 'object' ? a : {}; }
/** итоги простым текстом: заголовок и блок на вопрос — сколько за вариант (%) и кто как ответил */
function tm_surveyBlocks_(p, nowSec) {
  var dl = Number(p.deadline) || 0, who = {};
  p.q.forEach(function (q, qi) { var qa = tm_pollAnswers_(p, qi); Object.keys(qa).forEach(function (u) { who[u] = (qa[u] || {}).n || u; }); });
  var dm = tm_msk_(dl * 1000), head = 'Итоги опроса «' + (p.title || '') + '» (' + p.id + ')\nГруппа: ' + (p.group || '') + '; срок ' + tm_ddmm_(dm.date) + ' ' + dm.hm + ' МСК' + (nowSec > dl ? ' — завершён' : ' — идёт') + '\nОтветили: ' + Object.keys(who).length + ' чел.';
  var blocks = [head];
  p.q.forEach(function (q, qi) {
    var qa = tm_pollAnswers_(p, qi), opts = q.o || [], by = opts.map(function () { return []; });
    Object.keys(qa).forEach(function (u) { var o = (qa[u] || {}).o; if (typeof o === 'number' && o >= 0 && o < opts.length) by[o].push(String((qa[u] || {}).n || u)); });
    var tot = by.reduce(function (s, b) { return s + b.length; }, 0), L = [(qi + 1) + '. ' + (q.q || '') + ' — ответов ' + tot];
    opts.forEach(function (o, oi) { L.push('• ' + o + ' — ' + by[oi].length + (tot ? ' (' + Math.round(100 * by[oi].length / tot) + '%)' : '') + (by[oi].length ? ': ' + by[oi].sort().join(', ') : '')); });
    blocks.push(L.join('\n'));
  });
  return blocks;
}
function tm_chunks_(blocks, size) {
  var out = [], cur = '';
  blocks.forEach(function (b) { b = b.slice(0, size); if (cur && cur.length + 2 + b.length > size) { out.push(cur); cur = b; } else cur = cur ? cur + '\n\n' + b : b; });
  if (cur) out.push(cur);
  return out;
}
/** РАЗ В 15 МИНУТ (пятиминутный тик, tm_every_): срок прошёл, итоги не отправлены → владельцу в личные; mxsurvey.bin — опросы за 60 дней с именами */
function tm_survey_(ctx) {
  var polls = tm_pollsAll_(); if (!polls.length) return 'нет опросов';
  var st = tm_load_('survey.json', {}), sent = st.sent || {}, nowSec = Math.floor(ctx.msk.ms / 1000), owner = tm_ownerUid_(), out = [], res = {};
  polls.forEach(function (p) {
    if (sent[p.id] || nowSec <= (Number(p.deadline) || 0)) return;
    if (!(p.intro_mid || p.q.some(function (q) { return q.mid; }))) return;        // не был опубликован — итогов нет
    if (!owner) { res.err = 'нет owner_uid'; return; }
    var parts = tm_chunks_(tm_surveyBlocks_(p, nowSec), TM_SURVEY_CHUNK), ok = true;
    for (var i = 0; i < parts.length && ok; i++) { var r = tm_sendOnce_('survey:' + p.id + ':' + i, 'user', { uid: owner, text: parts[i] }, 'survey'); ok = !!r.ok; if (!ok) res.err = r.err || 'не отправлено'; }
    if (ok) { sent[p.id] = ctx.msk.iso; out.push(p.id); tm_log_('survey', 'итоги опроса ' + p.id + ' — владельцу'); }
  });
  var sk = Object.keys(sent); if (sk.length > 300) sk.sort(function (a, b) { return sent[a] < sent[b] ? -1 : 1; }).slice(0, sk.length - 200).forEach(function (k) { delete sent[k]; });
  st.sent = sent;
  var keep = polls.filter(function (p) { return (Number(p.created) || Number(p.deadline) || 0) >= nowSec - TM_SURVEY_KEEP * 86400; }).map(function (p) {
    return { id: p.id, title: p.title || '', intro: p.intro || '', group: p.group || '', created: p.created, deadline: p.deadline, done: nowSec > (Number(p.deadline) || 0),
             q: p.q.map(function (q, qi) { var qa = tm_pollAnswers_(p, qi); return { q: q.q || '', o: q.o || [], a: Object.keys(qa).map(function (u) { return { n: (qa[u] || {}).n || '', o: (qa[u] || {}).o, t: (qa[u] || {}).t }; }) }; }) };
  }).sort(function (a, b) { return (b.created || 0) - (a.created || 0); });
  var h = keep.length ? tm_sha12_(JSON.stringify(keep)) : '';
  if (keep.length && h !== st.h && tm_publish_('mxsurvey.bin', { t: ctx.msk.iso, polls: keep })) { st.h = h; res.bin = 'ok'; }
  tm_save_('survey.json', st);
  res.polls = polls.length; res.reported = out;
  return res;
}

// REDACTED_B64_2 проверка штата (понедельник, с 09:00, раз в неделю)
function tm_staffNorm_(n) { return String(n || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z]/g, ''); }
/** имя из MAX → человек из списка отдела или null */
function tm_staffMatch_(name, people) {
  var w = String(name || '').split(/\s+/).map(tm_staffNorm_).filter(function (x) { return x.length > 2; });
  for (var i = 0; i < people.length; i++) {
    var p = people[i], pw = String(p.name || '').split(/\s+/).map(tm_staffNorm_);
    (p.aliases || []).forEach(function (a) { String(a).split(/\s+/).forEach(function (x) { pw.push(tm_staffNorm_(x)); }); });
    if ((w.length && w[0] === pw[0]) || (w.length > 1 && w.some(function (x) { return x === pw[0]; }))) return p;
  }
  var one = people.filter(function (p) { var pn = String(p.name || '').split(/\s+/); return w.length === 1 && pn.length > 1 && w[0] === tm_staffNorm_(pn[1]); });
  return one.length === 1 ? one[0] : null;
}
/** сравнение списка со снимком прошлой проверки и участниками группы → {changes, quiet, snap} */
function tm_staffCheck_(ko, prev, members, lastSeen, nowIso, nowMs) {
  var people = ko.people || [], cur = {}, gone = {};
  people.forEach(function (p) { if (p.status === 'уволен') gone[p.name] = p; else cur[p.name] = p; });
  var memNames = members ? Object.keys(members).map(function (u) { return members[u]; }) : null;
  var snap = { names: Object.keys(cur).sort(), t: nowIso, max: memNames ? memNames.slice().sort() : ((prev || {}).max || []) }, changes = [];
  var zn = {}; (ko.zones || []).forEach(function (z) { zn[z.n] = z.t; });
  if (prev && prev.names && prev.names.length) {
    prev.names.filter(function (n) { return !cur[n]; }).sort().forEach(function (n) {
      var p = gone[n] || (prev.people || []).filter(function (x) { return x.name === n; })[0] || { name: n };
      var zs = (p.zones || []).map(function (k) { return k + '. ' + (zn[k] || ''); }), du = (p.duties || []).slice(0, 6);
      var what = (zs.length ? 'зоны: ' + zs.join('; ') : '') + (du.length ? (zs.length ? '; ' : '') + 'обязанности: ' + du.join('; ') : '');
      changes.push({ kind: 'gone', name: p.name, group: p.group, what: what || 'функционал не описан', ask: 'Кому передан функционал ' + p.name + ' (зоны, клиенты, сделки, доступы)? С какой даты?' });
    });
    Object.keys(cur).filter(function (n) { return prev.names.indexOf(n) < 0; }).sort().forEach(function (n) {
      var p = cur[n];
      changes.push({ kind: 'new', name: p.name, group: p.group, what: (p.role || '') + (p.group ? ' · ' + p.group : ''), ask: 'Какой функционал у ' + p.name + ': обязанности, зоны ответственности, кто замещает, с какой даты?' });
    });
  }
  if (memNames && prev && prev.max) memNames.filter(function (nm) { return prev.max.indexOf(nm) < 0; }).sort().forEach(function (nm) {
    if (TM_STAFF_IGNORE.test(nm) || tm_staffMatch_(nm, people)) return;
    changes.push({ kind: 'new', name: nm, src: 'MAX', what: 'новый участник группы «Коммерческий отдел», в списке отдела его нет', ask: 'Кто это и какой у него функционал (должность, офис, зоны ответственности)?', group: 'ОП Рязань' });
  });
  var quiet = [];
  Object.keys(cur).forEach(function (n) {
    var p = cur[n]; if (['Сеть офисов продаж', 'ОП Рязань'].indexOf(p.group) < 0) return;
    var ts = lastSeen[n]; if (ts != null && (nowMs - ts) / 864e5 > TM_STAFF_QUIET_DAYS) quiet.push({ kind: 'quiet', name: n, what: 'не писал(а) в группе «Коммерческий отдел» больше ' + TM_STAFF_QUIET_DAYS + ' дней (последнее — ' + tm_dmy_(tm_dateOf_(ts)) + ')' });
  });
  snap.people = Object.keys(cur).map(function (n) { var p = cur[n]; return { name: p.name, group: p.group, zones: p.zones, duties: (p.duties || []).slice(0, 12) }; });
  return { changes: changes, quiet: quiet, snap: snap };
}
function tm_staffLetter_(c) {
  if (c.kind === 'gone') return ['Штат коммерческого отдела: куда передан функционал — ' + c.name,
    'Добрый день!\n\nПо еженедельной проверке штата коммерческого отдела: ' + c.name + ' больше нет в списке сотрудников (уволен(а) или переведён(а)).\n\nЧто за ним(ней) было закреплено: ' + c.what +
    '.\n\nПрошу ответить на это письмо: кому передан этот функционал — по каждой зоне и обязанности одно ФИО, с какой даты; переданы ли клиенты, сделки в работе, доступы (почта, 1С, маркетплейсы) и документы.\n\nАвтоматическая проверка портала «Фабрика» по поручению Т. В. Сотрудник1.'];
  return ['Штат коммерческого отдела: функционал нового сотрудника — ' + c.name,
    'Добрый день!\n\nПо еженедельной проверке штата коммерческого отдела: новый сотрудник — ' + c.name + (c.what ? ' (' + c.what + ')' : '') +
    '.\n\nПрошу ответить на это письмо: какой у него функционал (обязанности по пунктам), какие зоны ответственности за ним, кто его замещает в отпуск и болезнь, с какой даты он работает, его почта.\n\nАвтоматическая проверка портала «Фабрика» по поручению Т. В. Сотрудник1.'];
}
function tm_isoWeek_(day) { var d = new Date(tm_dateMs_(day) + 12 * 3600e3), dn = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dn + 3); var y1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); var w = 1 + Math.round(((d - y1) / 864e5 - 3 + ((y1.getUTCDay() + 6) % 7)) / 7); return d.getUTCFullYear() + '-W' + (w < 10 ? '0' : '') + w; }
function tm_staffWatch_(ctx) {
  var st = tm_load_('staff_watch.json', {}), week = tm_isoWeek_(ctx.today);
  var due = (ctx.msk.wd === 0 && ctx.msk.h >= 9 && st.week !== week) || !st.snap;
  if (!due) return 'ждём понедельника';
  var ko = tm_bots_('ko_staff.json', null); if (!ko || !ko.people) return 'нет ko_staff.json в «Для ботов»';
  var cfg = tm_pollCfg_(), heads = TM_STAFF_HEADS, over = tm_cfgJson_('staff_heads', null);
  if (over && typeof over === 'object') { heads = JSON.parse(JSON.stringify(TM_STAFF_HEADS)); Object.keys(over).forEach(function (k) { heads[k] = over[k]; }); }
  var poll = tm_load_('poll.json', {}), members = poll.members || {}, H = tm_hist_(tm_komCid_()), people = ko.people, last = {};
  Object.keys(H.msgs).forEach(function (k) { var m = H.msgs[k]; if (m.bot) return; var p = tm_staffMatch_(m.name, people); if (p) last[p.name] = Math.max(last[p.name] || 0, m.ts); });
  var r = tm_staffCheck_(ko, st.snap, Object.keys(members).length ? members : null, last, ctx.msk.iso, ctx.msk.ms), asked = st.asked || {}, known = ko.known_gone || [];
  r.changes.forEach(function (c) {
    var key = c.kind + ':' + c.name, head = heads[c.group || ''] || ['', ''];
    c.to = head[0];
    if (asked[key]) { ['asked_t', 'via'].forEach(function (k) { if (asked[key][k]) c[k] = asked[key][k]; }); return; }
    if (c.kind === 'gone' && known.indexOf(c.name) >= 0) { c.known = true; asked[key] = { what: c.what, ask: 'решено собственником — письмо не отправлялось', to: c.to }; return; }
    if (head[1] && tm_isLeader_(head[0], null, head[1])) c.via = 'без вопроса: список «бот вопросов не задаёт»';
    else if (head[1] && !tm_banned_(cfg, ctx.today, head[1], head[0])) {
      var L = tm_staffLetter_(c), rr = tm_mail_([head[1]], [], L[0], L[1], false);
      if (rr === 'ok' || rr === 'dry') { c.asked_t = ctx.msk.iso; c.via = rr; tm_log_('staff', 'вопрос руководителю: ' + L[0].slice(0, 80)); }
      else c.via = 'не отправлено: ' + rr;
    }
    asked[key] = { asked_t: c.asked_t, via: c.via, what: c.what, ask: c.ask, to: c.to };
  });
  var hist = (st.hist || []).concat(r.changes.length ? [{ t: r.snap.t, changes: r.changes }] : []);
  st.week = week; st.snap = r.snap; st.asked = asked; st.hist = hist.slice(-30); st.t = r.snap.t;
  tm_save_('staff_watch.json', st);
  var pend = Object.keys(asked).filter(function (k) { return !asked[k].answer; }).slice(-20).map(function (k) { var v = JSON.parse(JSON.stringify(asked[k])); v.kind = k.split(':')[0]; v.name = k.slice(k.indexOf(':') + 1); return v; });
  tm_publish_('staff.bin', { v: 1, t: r.snap.t, changes: r.changes.length ? r.changes : pend, quiet: r.quiet, n: r.snap.names.length });
  return { changes: r.changes.length, quiet: r.quiet.length, n: r.snap.names.length };
}

// REDACTED_B64_2 выгрузки переписки групп по заданию (tm_settings → export_jobs)
function tm_export_(ctx) {
  var jobs = (tm_cfgJson_('export_jobs', []) || []).filter(function (j) { return j && j.id && j.g && j.from && j.to; });
  if (!jobs.length) return 'нет заданий';
  var done = tm_load_('export_done.json', {}), job = jobs.filter(function (j) { return !done[j.id]; })[0];
  if (!job) return { done: Object.keys(done).length };
  var rg; try { rg = new RegExp(job.g, 'i'); } catch (e) { done[job.id] = { state: 'плохая регулярка', t: ctx.msk.iso }; tm_save_('export_done.json', done); return done[job.id]; }
  var G = tm_groups_(), cid = Object.keys(G).filter(function (k) { return rg.test(G[k].title); })[0];
  if (!cid) tm_histGroups_().some(function (c) { var H = tm_hist_(c); if (rg.test(H.title || '')) { cid = c; return true; } return false; });
  var res = { id: job.id, t: ctx.msk.iso };
  if (!cid) {
    done[job.id] = { state: 'нет группы', t: ctx.msk.iso, titles: Object.keys(G).map(function (k) { return G[k].title; }).filter(Boolean).sort().slice(0, 40) };
    tm_save_('export_done.json', done); tm_publish_('exp_' + job.id + '.bin', { v: 1, id: job.id, state: 'нет группы', titles: done[job.id].titles, t: ctx.msk.iso });
    return done[job.id];
  }
  var t0 = tm_dateMs_(job.from), t1 = tm_dateMs_(job.to) + 86399999, H = tm_hist_(cid), msgs = tm_histList_(H).filter(function (m) { return m.ts >= t0 && m.ts <= t1; });
  var rows = msgs.map(function (m) { return { ts: m.ts, time: tm_msk_(m.ts).iso.replace('T', ' '), 'from': m.name, uid: m.uid, bot: m.bot, mid: m.mid, text: String(m.text || '').slice(0, 4000), att: m.att || [], rmid: m.rmid || '', fwd: m.fwd || null }; });
  var out = { v: 1, id: job.id, chat: cid, title: H.title || tm_groupTitle_(cid), 'from': job.from, to: job.to, n: rows.length, msgs: rows, t: ctx.msk.iso,
              note: 'из истории бота в Google (не старше ' + TM_HIST_DAYS + ' дней); более старое — в архиве «Фабрика — боты/MAX/история»' };
  tm_publish_('exp_' + job.id + '.bin', out);
  jput_('export', job.id + '.json', out);
  done[job.id] = { state: 'ok', n: rows.length, t: ctx.msk.iso }; tm_save_('export_done.json', done);
  tm_log_('export', 'выгрузка ' + job.id + ': ' + rows.length + ' сообщений');
  res.n = rows.length; return res;
}

// REDACTED_B64_2 обещанные визиты и звонки (ночью; перенос max_hist.promises)
var TM_PR_VISIT = /(?<![а-яё])(заед(у|ем)|доед(у|ем)|при[её]д(у|ем)|подъед(у|ем)|выед(у|ем)|съез(жу|дим)|по[её]д(у|ем)|посещу|посетим|встречусь|встретимся|буд(у|ем)\s+у)(?![а-яё])/i;
var TM_PR_VISIT_N = /(?<![а-яё])(встреч[аиу]|визит[а-яё]*|выезд[а-яё]*|посещени[а-яё]*)(?![а-яё])/i;
var TM_PR_CALL = /(?<![а-яё])(позвон(ю|им)|созвон(юсь|имся)|набер(у|[её]м)|перезвон(ю|им)|свяж(усь|емся)|обзвон(ю|им)|отзвон(юсь|имся)|сделаю\s+звонок)(?![а-яё])/i;
var TM_PR_NOT = /(?<![а-яё])(назначьте|узнайте|позвоните|обзвоните|свяжитесь|наберите|давайте|просьба|прошу|нужно|надо)(?![а-яё])|\?\s*$/i;
var TM_PR_CALL_N = /(?<![а-яё])(созвон|звон(ок|ки|ка))(?![а-яё])/i;
var TM_PR_PLAN = /(?<![а-яё])(завтра|послезавтра|запланир[а-яё]*|планиру[а-яё]*|назнач[а-яё]*|договорились\s+о|на\s+след)/i;
var TM_PR_NEG = /(?<![а-яё])не\s+(смогу|успею|получится|поеду|буду)(?![а-яё])/i;
var TM_PR_DONE = /(?<![а-яё])(был[аи]?\s+(у|в|на)(?![а-яё])|съездил[а-яё]*|заехал[а-яё]*|доехал[а-яё]*|приехал[а-яё]*|подъехал[а-яё]*|посетил[а-яё]*|встретил[а-яё]*|встреча\s+прошла|провел[а-яё]*\s+встреч[а-яё]*|на\s+встрече|по\s+итогам\s+(встречи|звонка|разговора|переговоров)|позвонил[а-яё]*|созвонил[а-яё]*|дозвонил[а-яё]*|переговорил[а-яё]*|поговорил[а-яё]*|пообщал[а-яё]*|общались|обсудили|договорились|связал(ся|ась|ись)|набрал[а-яё]*|отзвонил[а-яё]*|был\s+звонок|по\s+звонку|в\s+разговоре)/i;
var TM_PR_FAIL = /(?<![а-яё])(не\s+успел[а-яё]*|не\s+доехал[а-яё]*|не\s+заехал[а-яё]*|не\s+получилось|не\s+смог[а-яё]*|перен[её]с[а-яё]*|перенос[а-яё]*|не\s+дозвонил[а-яё]*|не\s+бер[её]т[а-яё]*\s+трубку|трубку\s+не\s+бер[а-яё]*|не\s+отвеча[а-яё]*|не\s+ответил[а-яё]*|отменил[а-яё]*|отменен[а-яё]*|не\s+состоял[а-яё]*|сорвал[а-яё]*)/i;
var TM_PR_STOP = {}, TM_PR_PROD = {};
('завтра сегодня послезавтра коллеги добрый день вечер утро спасибо итоги итог отчет отчёт план планы ип ооо ао зао пао тд гк ук ск понедельник вторник среда среду четверг пятница пятницу суббота субботу воскресенье январь февраль март апрель май июнь июль август сентябрь октябрь ноябрь декабрь января февраля марта апреля мая июня июля августа сентября октября ноября декабря москва рязань по также так еще ещё после до на в к с у о об при для от из за это эти этот клиент клиенту клиента клиентом заказ заказу счет счёт кп звонок встреча встречу визит новый новая новое новые новых компания компании просчет просчёт мебельная мебельный фабрика завод магазин группа потеряшка упущенный забытый контрагент контагент контрагенты контрольный контрольная контрольного обратная связь созвон созвона звонка звонки').split(' ').forEach(function (w) { TM_PR_STOP[w] = 1; });
('изо самба стандарт анри сильвия минипро софия гольф марс венус джонни кристенсен трис бун кабаре шеффилд одди хоум hugo ecostyle ecostyl velur велюр адель алекс амби аппи атлантис бали балун барон беймакс бейсик бекеро бергамо берн бернард бизон бона бруно виктория винчи джаз джерси дион ева каталония катрин коко кост лекса лозанна люцерн мадлен марко махаон микс милан мишель мокко моника морган несси окси осло палермо регги рисмер ричи робби рой рокки салар сандра свинг севилья силуэт синема сирена спред стаффорд степ танго тед тета тибу торро турин тюльпан урбан фан феликс фред хокер чери честер чико эмир энигма энцо эстет этна campo emerson mia todd мусс стул стулья кресло кресла диван пуф табурет').split(' ').forEach(function (w) { TM_PR_PROD[w] = 1; });
/** ключевые слова клиента в пункте (кавычки, ООО/ИП, слова с заглавной — не модели и не служебные) */
function tm_prKeys_(cl) {
  var keys = [], q = tm_rxAll_(/[«"„]([^»"“]{2,60})[»"“]/g, cl);
  q.forEach(function (m) { keys.push(m[1].toLowerCase().replace(/ё/g, 'е').trim()); });
  var sk = tm_subjKey_(cl); if (sk && !TM_PR_STOP[sk[0]] && !TM_PR_PROD[sk[0]] && keys.indexOf(sk[0]) < 0) keys.push(sk[0]);
  tm_rxAll_(/(?<![А-Яа-яЁёA-Za-z])([А-ЯЁ][а-яё]{2,}|[A-Z][a-z]{2,})/g, cl).forEach(function (m) {
    var w = m[1].toLowerCase().replace(/ё/g, 'е'); if (TM_PR_STOP[w] || TM_PR_PROD[w] || keys.indexOf(w) >= 0) return;
    if (keys.length < 4) keys.push(w);
  });
  return keys.slice(0, 4);
}
function tm_prHas_(text, keys) { var low = String(text || '').toLowerCase().replace(/ё/g, 'е'); return keys.filter(function (k) { return low.indexOf(k) >= 0; }); }
function tm_prSnip_(t, keys) { t = tm_sq_(t); var i = -1; keys.some(function (k) { i = t.toLowerCase().indexOf(k); return i >= 0; }); var s = i > 60 ? '…' + t.slice(i - 60) : t; return tm_phoneMask_(s).slice(0, 220); }
/** сообщения группы → обещания [{d0, due, dk, who, kind, what, obj, st, ev, mid, id}] */
function tm_promises_calc_(msgsIn, today) {
  var msgs = msgsIn.filter(function (m) { return !m.bot && String(m.text || '').trim(); }).sort(function (a, b) { return a.ts - b.ts; }), byAuthor = {}, out = [], seen = {};
  msgs.forEach(function (m, i) { (byAuthor[m.name || ''] = byAuthor[m.name || ''] || []).push(i); });
  msgs.forEach(function (m, i) {
    var d0 = tm_dateOf_(m.ts), prev = '';
    tm_clauses_(m.text).forEach(function (cl0) {
      var cl = cl0;
      if (prev && /^[а-яёa-z(]/.test(cl0) && !tm_subjKey_(cl0)) { var hk = /^\s*(?:\d{1,2}[.)]\s*)?([^—\-–:]{2,60}?)\s*[—\-–:]/.exec(prev); if (hk) cl = hk[1].trim() + ' — ' + cl0; }
      if (tm_subjKey_(cl0) || !prev) prev = cl0;
      if (TM_PR_NOT.test(cl0)) return;
      var kv = TM_PR_VISIT.exec(cl), kc = TM_PR_CALL.exec(cl);
      if (!kv && !kc) {
        kv = TM_PR_VISIT_N.exec(cl); kc = TM_PR_CALL_N.exec(cl); if (!kv && !kc) return;
        var w = kv || kc, win = cl.slice(Math.max(0, w.index - 50), w.index + w[0].length + 50);
        if (!(tm_datesIn_(win, d0).length || TM_PR_PLAN.test(win))) return;
      }
      if (TM_PR_NEG.test(cl)) return;
      var k0 = kv || kc, near = cl.slice(Math.max(0, k0.index - 40), k0.index + k0[0].length + 40);
      if (TM_PR_DONE.test(near) && !/(?<![а-яё])(завтра|в\s+(понедельник|вторник|среду|четверг|пятницу))(?![а-яё])/i.test(near)) return;
      var kind = kv && (!kc || kv.index <= kc.index) ? 'визит' : 'звонок', ds = tm_datesIn_(cl, d0), due, dk;
      if (/(?<![а-яё])сегодня(?![а-яё])/i.test(cl) && !ds.length) { due = d0; dk = 'сегодня'; }
      else if (ds.length) { due = ds.map(function (x) { return x[0]; }).sort()[0]; dk = 'дата'; }
      else { due = d0; for (var n = 0; n < 2; n++) due = tm_nextWorkday_(tm_addDays_(due, 1)); dk = 'без срока'; }
      var keys = tm_prKeys_(cl), pid = (m.name || '') + '|' + (keys.join('/') || cl.slice(0, 40)) + '|' + due;
      if (seen[pid]) return; seen[pid] = 1;
      var lim = tm_dateMs_(tm_addDays_(due, 10)) + 86399000, ev = null, st = null, upd = null;
      var cand = (byAuthor[m.name || ''] || []).filter(function (j) { return j > i && msgs[j].ts <= lim; });
      for (var j = i + 1; j < msgs.length; j++) if (msgs[j].rmid && msgs[j].rmid === m.mid && cand.indexOf(j) < 0) cand.push(j);
      cand.sort(function (a, b) { return a - b; });
      for (var c = 0; c < cand.length && !st; c++) {
        var mj = msgs[cand[c]], cls = tm_clauses_(mj.text);
        for (var q = 0; q < cls.length; q++) {
          var c2 = cls[q];
          if (keys.length && !tm_prHas_(c2, keys.slice(0, 1)).length) continue;
          if (!keys.length && mj.rmid !== m.mid) continue;
          var nd = null;
          if (TM_PR_FAIL.test(c2)) { st = 'не выполнено'; ev = mj; nd = tm_datesIn_(c2, tm_dateOf_(mj.ts)); }
          else if (TM_PR_DONE.test(c2)) { st = 'выполнено'; ev = mj; }
          else if (keys.length && !upd && !(TM_PR_VISIT.test(c2) || TM_PR_CALL.test(c2) || TM_PR_VISIT_N.test(c2) || TM_PR_CALL_N.test(c2))) upd = [mj, c2];
          if (st) { if (st === 'не выполнено' && nd && nd.length && /перен[её]с|перенос/i.test(c2)) st = 'перенесено'; ev = { d: tm_msk_(ev.ts).iso.replace('T', ' '), who: ev.name, x: tm_prSnip_(c2, keys) }; break; }
        }
      }
      if (!st && upd) { st = 'есть отчёт по клиенту'; ev = { d: tm_msk_(upd[0].ts).iso.replace('T', ' '), who: upd[0].name, x: tm_prSnip_(upd[1], keys) }; }
      if (!st) st = due >= today ? 'срок не наступил' : (!keys.length ? 'не с кем сверить' : 'нет подтверждения');
      out.push({ d0: tm_msk_(m.ts).iso.replace('T', ' '), due: due, dk: dk, who: m.name, kind: kind, what: tm_phoneMask_(tm_sq_(cl)).slice(0, 300), obj: keys, st: st, ev: ev, mid: m.mid, id: tm_sha12_((m.mid || '') + '|' + cl) });
    });
  });
  out.forEach(function (a) {                                                  // то же обещание повторено позже с новым сроком — перенос
    if ((a.st !== 'нет подтверждения' && a.st !== 'не с кем сверить') || !a.obj.length) return;
    var lim2 = tm_addDays_(a.due, 21), nx = out.filter(function (b) { return b !== a && b.who === a.who && b.obj.length && b.obj[0] === a.obj[0] && b.d0 > a.d0 && b.due > a.due && b.d0.slice(0, 10) <= lim2; });
    if (nx.length) { var b = nx.sort(function (x, y) { return x.d0 < y.d0 ? -1 : 1; })[0]; a.st = 'перенесено'; a.ev = { d: b.d0, who: b.who, x: b.what.slice(0, 260), new_due: b.due }; }
  });
  return out;
}
/** НОЧЬЮ: обещания по истории «Коммерческого отдела» → tm/promises.json и promises.bin (в группу ничего не пишется) */
function tm_promises_(ctx) {
  var cid = tm_komCid_(), H = tm_hist_(cid), msgs = tm_histList_(H);
  if (!msgs.length) return 'нет истории';
  var P = tm_promises_calc_(msgs, ctx.today).sort(function (a, b) { return a.d0 < b.d0 ? 1 : -1; }), cnt = {}, byw = {};
  P.forEach(function (p) { cnt[p.st] = (cnt[p.st] || 0) + 1; var w = byw[p.who || '—'] || (byw[p.who || '—'] = { n: 0 }); w.n++; w[p.st] = (w[p.st] || 0) + 1; });
  var out = { t: ctx.msk.iso, msgs: msgs.length, 'from': tm_dateOf_(msgs[0].ts), to: tm_dateOf_(msgs[msgs.length - 1].ts), complete: false, n: P.length, st: cnt,
              by_who: Object.keys(byw).map(function (k) { return [k, byw[k]]; }).sort(function (a, b) { return b[1].n - a[1].n; }), list: P.slice(0, 1500) };
  tm_save_('promises.json', out);
  tm_publish_('promises.bin', out);
  return { promises: P.length, st: cnt };
}

// REDACTED_B64_2 рекламации: напоминания менеджерам через 2 рабочих дня (Autonomy.gs шага 5)
/** 08:30 рабочего дня, раз в день. F4 C-A4: au_reclWatchCheck сразу отмечает наблюдения (reminded/escalated) — поэтому каждое напоминание ставится
    операцией Outbox ('recl:<день>:<группа+текст>' — свой ключ на адресата) и доставляется минутным тиком с повторами до подтверждения; отказ MAX не теряет
    напоминание, а отметка «работа дня выполнена» (tm_daily_) означает «решение принято», не «доставлено». Владельцу — одна операция (Telegram → личные → письмо). */
function tm_reclWatch_(ctx) {
  if (typeof au_reclWatchCheck !== 'function') return 'нет au_reclWatchCheck';
  if (ctx.quiet) return 'тихие часы';
  var list = au_reclWatchCheck(ctx.msk.ms) || [], sent = 0, queued = [], errs = 0, toOwner = [];
  list.forEach(function (x) {
    if (!x || !x.text) return;
    if (x.owner || !x.chat) { toOwner.push(String(x.text)); return; }         // служебное владельцу (реестр рекламаций недоступен и т. п.)
    var id = 'recl:' + ctx.today + ':' + tm_sha12_(String(x.chat) + '|' + x.text);
    var r = tm_obSend_('tm:' + id, 'tm_chat', String(x.chat), { text: String(x.text), sent_id: id, job: 'recl' });
    if (r.ok) sent++; else if (r.queued) queued.push('tm:' + id); else errs++;
  });
  if (toOwner.length) {                                                     // владельцу — в Telegram (mx_tgOwner ядра: op tgcall → Telegram-скрипт; запрос шага 5), иначе личные MAX, иначе письмо itm@
    var oid = 'recl:owner:' + ctx.today, txt = 'Рекламации — проверка 2 рабочих дней:\n• ' + toOwner.join('\n• ');
    var ro = tm_obSend_('tm:' + oid, 'tm_owner', 'owner', { text: txt, subj: 'Рекламации: нужна ручная проверка (' + toOwner.length + ')', note: { why: 'рекламации: проверка 2 рабочих дней', g: 'бот MAX', mid: 'recl-owner-' + ctx.today }, sent_id: oid, job: 'recl' });
    if (ro.queued) queued.push('tm:' + oid); else if (!ro.ok) errs++;
  }
  var wait = 0;
  if (queued.length) { tm_obRun_(ctx); queued.forEach(function (k) { if (tm_obStatus_(k) === 'sent') sent++; else wait++; }); }   // доставка сразу; не вышло — повтор минутным тиком
  if (sent || wait) tm_log_('recl', 'напоминаний по рекламациям: ' + sent + (wait ? ', ждут повтора доставки ' + wait : ''));
  return { reminders: list.length, sent: sent, queued: wait, errs: errs, owner: toOwner.length };
}

// REDACTED_B64_2 ротация листов tm_* (ночью)
function tm_rotate_() {
  var out = {};
  [['tm_sent', 3000], ['tm_mail_log', 2000]].forEach(function (x) {
    try { var sh = tm_sheet_(x[0]), n = sh.getLastRow(); if (n > x[1] + 200) { sh.deleteRows(2, n - x[1]); out[x[0]] = n - x[1]; } }
    catch (e) { tm_log_('rotate', x[0] + ': ' + tm_err_(e)); }
  });
  return out;
}
