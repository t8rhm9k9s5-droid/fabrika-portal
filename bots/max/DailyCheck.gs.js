/* «Фабрика — бот MAX» (Google 1c@) — DailyCheck.gs: ежедневная проверка в группе по рабочим дням (16.11.2026).
   Т. В. Сотрудник1, 16.11.2026: «группа Погрузка. Отчётное время 15:45. Ответственные — Сотрудник50 Сотрудник1, Сотрудник47 Отчество4 Сотрудник52, Сотрудник25 Сотрудник44.
   Вопрос коллегам: что с погрузкой маркетплейсов, успеваем ли мы доставить? Есть ли все документы, найден ли товар на складе, всё ли окей?
   Любого из троих достаточно, если он написал окей. Это должно вылетать напоминанием в группе… Группа Погрузка, используем только её».
   Опрос 16.11 (что, если нет «ОК»): «16:30 — это поздно. 15:55» → к 15:55 нет «ОК» — одно напоминание в группе и строка Т. В. в Telegram;
   ответ о проблеме (не успеваем, нет документов, товар не найден…) — Т. В. в Telegram сразу.
   ФИО и роли — из оргструктуры (docs_brand/org.json): Сотрудник1 Сотрудник50 Отчество26 — руководитель направления e-commerce, Сотрудник52 Сотрудник47 Отчество4 — ПДО,
   Сотрудник25 Сотрудник44 Отчество11 — начальник отдела продаж. Сотрудник25 и А. А. Сотрудник1 в списке «бот вопросов не задаёт» (leaders.json) —
   для ЭТОЙ проверки исключение по прямому слову Т. В. 16.11 (общий список не меняется).
   Настройка — лист tm_settings, ключ daily_checks (JSON-список как DC_DEFAULT; пусто — DC_DEFAULT). Состояние — файл Диска tm/dcheck.json.
   Запуск — из минутного тика (tm_tickMinute → tm_job_(ctx, 'dcheck', dc_run_)): днём он идёт раз в 2 минуты. Префикс dc_. */
var DC_DEFAULT = [{
  id: 'mp-load', cid: '-100000000001', title: 'Погрузка',
  at: '15:45', remind: '15:55', until: '19:00',
  who: [{ n: 'Сотрудник50 Отчество26', short: 'А. А. Сотрудник1', gen: 'А. А. Сотрудник1', uids: ['65293829'] },
        { n: 'Сотрудник47 Отчество4', short: 'И. М. Сотрудник52', gen: 'И. М. Сотрудник52', uids: ['123349999'] },
        { n: 'Сотрудник44 Отчество11', short: 'Ю. А. Сотрудник25', gen: 'Ю. А. Сотрудник25', uids: ['142092525', '382630043'] }],
  head: '🚚 <b>Погрузка маркетплейсов — статус на сегодня</b>',
  ask: 'подскажите, пожалуйста, как с погрузкой маркетплейсов:\n• успеваем доставить в срок?\n• все документы готовы?\n• весь товар найден на складе?\n' +
       'Если всё в порядке — достаточно одного «ОК» от любого из вас 🙏',
  again: '🔔 Коллеги, ждём ответ по погрузке маркетплейсов — достаточно одного «ОК» от любого из вас.',
  topic: 'Погрузка маркетплейсов'
}];
// «ОК» — короткое согласие; проблема — явное «не успеваем / нет документов / не нашли…»
var DC_OK_RX = /(?<![а-яёa-z])(ок|окей|окэй|оке|ok|okay|о\.к\.?|норм|нормально|всё\s+(?:в\s+)?порядке|все\s+(?:в\s+)?порядке|всё\s+хорошо|все\s+хорошо|успеваем|всё\s+готово|все\s+готово|всё\s+есть|все\s+есть)(?![а-яёa-z])|👍|✅|👌/i;
var DC_BAD_RX = /(не\s+успева|не\s+успеем|не\s+успели|нет\s+документ|не\s+все\s+документ|без\s+документ|не\s+найд|не\s+нашл|не\s+хватает|нехватк|проблем|задерж|сорв|опазд|перенос|не\s+ок(?![а-яё])|не\s+в\s+порядке|не\s+готов)/i;

function dc_cfg_() {
  var v = typeof tm_cfgJson_ === 'function' ? tm_cfgJson_('daily_checks', null) : null;
  return Array.isArray(v) && v.length ? v : DC_DEFAULT;
}
function dc_uids_(c) { var s = {}; (c.who || []).forEach(function (w) { (w.uids || []).forEach(function (u) { s[String(u)] = w; }); }); return s; }
function dc_mentions_(c) {
  return (c.who || []).map(function (w) { var u = (w.uids || [])[0]; return u ? '<a href="max://user/' + u + '">' + tm_h_(w.n) + '</a>' : '<b>' + tm_h_(w.n) + '</b>'; }).join(', ');
}
/** текст сообщения: заголовок, обращение по имени-отчеству (упоминания), вопрос */
function dc_text_(c) { return c.head + '\n' + dc_mentions_(c) + ', ' + c.ask; }
/** ответ человека: 'ok' | 'bad' | '' (не про это). Ответ на наше сообщение — про это всегда; без ответа-цитаты — короткое «ОК» или слова про погрузку / маркетплейсы */
function dc_kind_(m, mids) {
  var t = String(m.text || '').trim(), re = !!(m.rmid && mids[m.rmid]);
  if (!t && !re) return '';
  var about = re || t.length <= 40 || /маркетплейс|погрузк|отгрузк|озон|ozon|wb|wildberr|вайлдб|яндекс|я\.?\s*маркет|мп(?![а-яё])/i.test(t);
  if (!about) return '';
  if (DC_BAD_RX.test(t)) return 'bad';
  if (DC_OK_RX.test(t)) return 'ok';
  return re ? 'bad' : '';                                                      // ответ на вопрос без «ОК» — пусть посмотрит Т. В.
}
function dc_owner_(ctx, key, text) {
  return tm_obSend_('tm:dc:' + key, 'tm_owner', 'owner', { text: text, subj: 'Погрузка маркетплейсов', note: { why: 'ежедневная проверка в группе', g: 'Погрузка' } });
}
function dc_run_(ctx) {
  if (!ctx.workday) return 'не рабочий день';
  var now = ctx.msk, min = tm_minOf_(now), list = dc_cfg_(), S = tm_load_('dcheck.json', { days: {} }), out = [], dirty = false;
  if (!S.days) S.days = {};
  Object.keys(S.days).forEach(function (d) { if (d < tm_addDays_(ctx.today, -14)) { delete S.days[d]; dirty = true; } });
  var D = S.days[ctx.today] = S.days[ctx.today] || {};
  list.forEach(function (c) {
    if (!c || !c.id || !c.cid) return;
    var at = tm_hmMin_(c.at, 945), rem = tm_hmMin_(c.remind, at + 10), until = tm_hmMin_(c.until, 19 * 60);
    if (min < at || min >= until) return;
    var st = D[c.id] = D[c.id] || {};
    // 1) вопрос в группу — один раз в день
    if (!st.mid) {
      var r = tm_sendOnce_('dc:' + c.id + ':' + ctx.today, 'chat', { cid: String(c.cid), text: dc_text_(c), html: true }, 'dcheck');
      if (!r.ok) { out.push(c.id + ': не отправлено ' + (r.err || '')); return; }
      st.mid = String(r.mid || ''); st.ts = Date.now(); dirty = true; out.push(c.id + ': спросили');
      var prev = S.pin && S.pin[c.id];                                         // закрепить вопрос; вчерашний — открепить, если в шапке ещё он
      if (prev && prev.mid && prev.mid !== st.mid) { var ru = {}; tm_unpinAsk_({ pin: prev }, ru); }
      if (st.mid) { var rp = {}, pst = {}; tm_pinAsk_(String(c.cid), st.mid, pst, now.iso, rp); S.pin = S.pin || {}; S.pin[c.id] = pst.pin || null; }
      return;
    }
    if (st.done) return;
    // 2) ответы трёх ответственных после вопроса (очередь max_in)
    var W = dc_uids_(c), mids = {}; mids[st.mid] = 1; if (st.rmid) mids[st.rmid] = 1;
    var q = tm_queueMsgs_((Number(st.ts) || Date.now()) - 60000, Math.min(20000, Math.max(3000, ctx.left() - 20000)));
    if (q.err) { out.push(c.id + ': очередь ' + q.err); return; }
    st.seen = st.seen || {};
    q.msgs.forEach(function (m) {
      if (st.done || String(m.cid) !== String(c.cid) || m.bot || !m.uid || !W[m.uid] || st.seen[m.mid]) return;
      if (m.ts && st.ts && m.ts < st.ts - 30000) return;
      st.seen[m.mid] = 1; dirty = true;
      var k = dc_kind_(m, mids);
      if (k === 'ok') { st.done = now.iso; st.by = W[m.uid].short; out.push(c.id + ': ОК от ' + st.by); }
      else if (k === 'bad') {
        var txt = '⚠️ <b>' + tm_h_(c.topic) + '</b> (группа «' + tm_h_(c.title) + '»): ' + tm_h_(W[m.uid].short) + ' — «' + tm_h_(String(m.text || '(вложение)').slice(0, 600)) + '»';
        dc_owner_(ctx, c.id + ':' + ctx.today + ':bad:' + m.mid, txt); st.bad = now.iso; out.push(c.id + ': проблема → Т. В.');
      }
    });
    if (st.done) {                                                             // вопрос закрыт — открепить
      var pin = S.pin && S.pin[c.id]; if (pin && pin.mid === st.mid) { var ru2 = {}; tm_unpinAsk_({ pin: pin }, ru2); S.pin[c.id] = null; }
      return;
    }
    // 3) к 15:55 нет «ОК» — напоминание в группе (ответом на вопрос) и строка Т. В.
    if (min >= rem && !st.again && !st.bad) {                                // о проблеме уже написали — Т. В. знает, «ждём ОК» не шлём
      var r2 = tm_sendOnce_('dc:' + c.id + ':' + ctx.today + ':again', 'chat', { cid: String(c.cid), text: c.again + '\n' + dc_mentions_(c), html: true, reply: st.mid }, 'dcheck');
      st.again = now.iso; if (r2 && r2.mid) st.rmid = String(r2.mid); dirty = true;
      dc_owner_(ctx, c.id + ':' + ctx.today + ':late', '🚚 <b>' + tm_h_(c.topic) + '</b>: к ' + tm_h_(c.remind) + ' нет «ОК» от ' +
        (c.who || []).map(function (w) { return tm_h_(w.gen || w.short); }).join(', ') + ' — в группе «' + tm_h_(c.title) + '» напомнил.');
      out.push(c.id + ': напомнили');
    }
  });
  if (dirty) tm_save_('dcheck.json', S);
  return out.length ? out.join('; ') : 'нечего';
}
