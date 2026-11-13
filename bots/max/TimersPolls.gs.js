/* «Фабрика — бот MAX» (Google 1c@) — TimersPolls.gs: ежедневные опросы исполнителей в группе «Коммерческий отдел» и проверка формы
   ответов (перенос mx_poll.py хостинга, шаг 3, ночь 05.11.2026). Решения Т. В.: 28.10 23:10 (опросы утром и вечером, «не по форме —
   комментировать как некорректные»), 30.10 («Мягкий старт 2 недели», «Начинаем с утренних вопросов»; тон мягкий), 30.10 ~20:45
   (9:00 МСК вопрос, ответ до 9:15, сводка 9:15), 03.11 (руководству и участникам совещания — leaders — вопросов не задавать).
   Настройки — встроенные (как mx_poll_cfg.json) + лист tm_settings → poll (JSON поверх). Состояние — tm/poll.json; портал — poll.bin
   («От ботов», T14B1). Сообщения — через tm_send_; письма — tm_mail_ (от 1c@, ответ на itm@, копия itm@).
   Окна (МСК): опрос — [morning, morning_due) и [evening, evening_due) в рабочий день, один раз в день (минутный тик, tm_pollSend_);
   ответы, комментарии, напоминания, сводка вопросов, «кто не ответил» после 18:00 — пятиминутный тик (tm_poll_). Тихие часы — ничего. */

var TM_POLL_DEF = {
  on: true, morning: '09:00', morning_due: '09:15', evening: '16:55', evening_due: '17:30',
  executors: [
    { name: 'Сотрудник40 С. В.', fio: 'Сотрудник40 Имя4 Отчество22', max: 'Имя4', mail: 'user43@example.org' },
    { name: 'Сотрудник47 А. Д.', fio: 'Сотрудник47 Сотрудник3 Отчество25', max: 'Сотрудник3 Сотрудник47', mail: 'user50@example.org' },
    { name: 'Сотрудник42 И. П.', fio: 'Сотрудник42 Сотрудник43 Отчество23', max: 'Сотрудник43 Сотрудник42', mail: 'user47@example.org' },
    { name: 'Сотрудник44 Н. А.', fio: 'Сотрудник44 Сотрудник45 Отчество24', max: 'Сотрудник45 Сотрудник44 Фабрикант Самара', mail: 'user45@example.org' },
    { name: 'Сотрудник48 Т. В.', fio: 'Сотрудник48 Сотрудник32 Отчество22', max: 'Сотрудник32 Сотрудник48', mail: 'user51@example.org' },
    { name: 'Сотрудник6 М. И.', fio: 'Сотрудник6 Сотрудник13 Отчество7', max: 'Сотрудник13 Сотрудник6', mail: 'user42@example.org' },
    { name: 'Сотрудник19 Ю. А.', fio: 'Сотрудник19 Сотрудник38 Отчество12', max: '', mail: 'user15@example.org' },
    { name: 'Сотрудник16 К. В.', fio: 'Сотрудник16 Сотрудник21 Отчество11', max: 'Сотрудник21 Сотрудник16', mail: 'user16@example.org' },
    { name: 'Сотрудник1 А. А.', fio: 'Сотрудник1 Сотрудник49 Отчество26', max: '', mail: 'user22@example.org' }
  ],
  people: [],
  heads: { 'Коммерческий отдел / Филиалы': 'user42@example.org' },
  ban: [                                                                   // RULES «Временные запреты»: ни сообщений, ни писем, ни напоминаний
    { who: 'Сотрудник71 А. А.', surname: 'Сотрудник71', mail: ['user27@example.org'], until: '2026-11-02' },
    { who: 'Сотрудник51 И. М.', surname: 'Сотрудник51', mail: ['user28@example.org'] },
    { who: 'Сотрудник52 О. А.', surname: 'Сотрудник52', mail: ['user29@example.org', 'user55@example.org'] },
    { who: 'Сотрудник50 М. И.', surname: 'Сотрудник50', mail: ['user30@example.org'] },
    { who: 'Имя27', surname: 'Имя27' }, { who: 'Джанова', surname: 'Джанова' }
  ],
  evening_repeat_min: 30, evening_repeat_until: '19:30', carry_days: 3, carry_at: ['09:05', '14:00'],
  questions_from: '2026-11-02', q_digest_at: '09:15', q_digest_to: ['user5@example.org', 'user8@example.org', 'user16@example.org'],
  count_from: '2026-11-16', morning_q: true, evening_from: '2026-11-09', soft_hints: true, soft_from: '2026-11-02',
  fwd_digest_at: '17:30', fwd_to: ['user5@example.org']
};
/** оргструктура: почта → [ФИО, должность, отдел] (unans_org.json хостинга); поверх — «Для ботов»/unans_org.json и tm_settings → org */
var TM_ORG_DEF = {
  "user9@example.org": ["Сотрудник34 С. В.", "Заведующий автотранспортом", "АТП"],
  "user56@example.org": ["Сотрудник86 Н. С.", "Бухгалтер", "Бухгалтерия"],
  "user57@example.org": ["Сотрудник77 И. С.", "Бухгалтер-кассир", "Бухгалтерия"],
  "user58@example.org": ["Сотрудник87 Л. В.", "Бухгалтер", "Бухгалтерия"],
  "user59@example.org": ["Сотрудник88 О. В.", "Бухгалтер", "Бухгалтерия"],
  "user60@example.org": ["Фируза", "Бухгалтер", "Fabrikant UZ"],
  "user61@example.org": ["Сотрудник89 Е. О.", "Бухгалтер", "Бухгалтерия"],
  "user62@example.org": ["Сотрудник76 Н. Н.", "Заместитель главного бухгалтера", "Бухгалтерия"],
  "user63@example.org": ["Сотрудник75 Н. А.", "Заместитель главного бухгалтера", "Бухгалтерия"],
  "user39@example.org": ["Сотрудник18 А. В.", "Председатель совета директоров", "Руководство"],
  "user64@example.org": ["Сотрудник69 А. Г.", "Главный энергетик", "Служба главного инженера"],
  "user51@example.org": ["Сотрудник48 Т. В.", "Менеджер", "Коммерческий отдел / Филиалы"],
  "user23@example.org": ["Сотрудник1 Т. Т.", "Маркетолог", "Отдел маркетинга"],
  "user14@example.org": ["Сотрудник56 Р. С.", "Экономист", "Планово-экономический отдел"],
  "user13@example.org": ["Сотрудник55 А. А.", "Начальник ПЭО", "Планово-экономический отдел"],
  "user34@example.org": ["Сотрудник5 В. В.", "Инженер-программист", "1С-программисты"],
  "user65@example.org": ["Сотрудник74 В. Л.", "Главный бухгалтер", "Бухгалтерия"],
  "user28@example.org": ["Сотрудник51 И. М.", "ПДО", "Производство"],
  "user36@example.org": ["Сотрудник23 В. В.", "Директор по производству", "Руководство"],
  "user66@example.org": ["Сотрудник73 Н. А.", "Инспектор отдела кадров", "Руководство / Приёмная"],
  "user12@example.org": ["Сотрудник25 Н. Я.", "Юрист", "Юрист"],
  "user30@example.org": ["Сотрудник50 М. И.", "Инженер-программист", "1С-программисты"],
  "user15@example.org": ["Сотрудник19 Ю. А.", "Начальник отдела продаж", "Коммерческий отдел"],
  "user49@example.org": ["Сотрудник46 О. С.", "Менеджер", "Коммерческий отдел / Филиалы"],
  "user50@example.org": ["Сотрудник47 А. Д.", "Менеджер", "Коммерческий отдел / Филиалы"],
  "user42@example.org": ["Сотрудник6 М. И.", "Руководитель сети офисов продаж", "Коммерческий отдел / Филиалы"],
  "user32@example.org": ["Сотрудник5 М. В.", "Менеджер-логист", "ОМТС"],
  "user67@example.org": ["Сотрудник78 Е. Ю.", "Специалист финансового отдела", "Бухгалтерия"],
  "user24@example.org": ["Сотрудник33 Д. Р.", "Маркетолог", "Отдел маркетинга"],
  "user68@example.org": ["Сотрудник58 А. О.", "Директор по производству ООО «ФТС»", "ООО «ФТС»"],
  "user2@example.org": ["Сотрудник1 А. В.", "Системный администратор", "Системные администраторы"],
  "user69@example.org": ["Сотрудник70 Ю. В.", "Главный механик", "Служба главного инженера"],
  "user8@example.org": ["Сотрудник6 М. И.", "Руководитель сети офисов продаж", "Коммерческий отдел / Филиалы"],
  "user35@example.org": ["Сотрудник10 М. М.", "Финансовый директор", "Руководство"],
  "user47@example.org": ["Сотрудник42 И. П.", "Руководитель офиса продаж", "Коммерческий отдел / Филиалы"],
  "user70@example.org": ["Сотрудник72 Г. Н.", "Специалист отдела кадров", "Отдел кадров"],
  "user27@example.org": ["Сотрудник71 А. А.", "Начальник отдела кадров", "Отдел кадров"],
  "user71@example.org": ["Сотрудник59 С. Н.", "Кладовщик ООО «ФТС», ООО «ПКС»", "ООО «ФТС»"],
  "user6@example.org": ["Сотрудник17 А. А.", "Генеральный директор", "Руководство"],
  "user16@example.org": ["Сотрудник16 К. В.", "Директор по развитию", "Коммерческий отдел"],
  "user19@example.org": ["Сотрудник37 Е. Е.", "Офис-менеджер", "Коммерческий отдел"],
  "user20@example.org": ["Сотрудник31 В. С.", "Офис-менеджер", "Коммерческий отдел"],
  "user18@example.org": ["Сотрудник39 М. И.", "Офис-менеджер", "Коммерческий отдел"],
  "user45@example.org": ["Сотрудник44 Н. А.", "Менеджер", "Коммерческий отдел / Филиалы"],
  "user10@example.org": ["Сотрудник34 С. В.", "Начальник сторожевой службы", "Сторожевая служба"],
  "user22@example.org": ["Сотрудник1 А. А.", "Руководитель направления e-commerce", "Коммерческий отдел"],
  "user38@example.org": ["Сотрудник9 С. Н.", "Руководитель ОМТС", "ОМТС"],
  "user26@example.org": ["Сотрудник8 О. В.", "Менеджер ОМТС", "ОМТС"],
  "user72@example.org": ["Сотрудник66 М. А.", "Менеджер ОМТС", "ОМТС"],
  "user73@example.org": ["Сотрудник26 А. В.", "Главный инженер", "Служба главного инженера"],
  "user74@example.org": ["Сотрудник65 Г. А.", "Кладовщик материального склада", "Производство"],
  "user75@example.org": ["Сотрудник54 Ю. И.", "Технолог", "Технологический отдел"],
  "user76@example.org": ["Сотрудник60 Е. Н.", "ОТК", "Технологический отдел"],
  "user77@example.org": ["Сотрудник53 Д. В.", "Технолог", "Технологический отдел"],
  "user78@example.org": ["Сотрудник23 В. А.", "Технолог", "Технологический отдел"],
  "user79@example.org": ["Сотрудник17 Е. А.", "Технолог", "Технологический отдел"],
  "user29@example.org": ["Сотрудник52 О. А.", "Руководитель ПТО", "Технологический отдел"],
  "user11@example.org": ["Сотрудник22 А. А.", "ОТК / менеджер по рекламациям", "Технологический отдел"],
  "user44@example.org": ["Сотрудник41 А. В.", "Офис-менеджер (осн.), менеджер (вн. совм.)", "Коммерческий отдел / Филиалы"],
  "user43@example.org": ["Сотрудник40 С. В.", "Руководитель офиса продаж", "Коммерческий отдел / Филиалы"],
  "user53@example.org": ["Сотрудник36 Ф.", "Менеджер", "Fabrikant UZ"],
  "user80@example.org": ["Сотрудник79 И. В.", "Системный администратор", "Системные администраторы"]
};
var TM_WD_RU = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
var TM_MON = { 'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12 };
var TM_MON_RE = Object.keys(TM_MON).join('|');

// REDACTED_B64_2 настройки и люди
var TM_POLL_CACHE = null;
function tm_pollCfg_() {
  if (TM_POLL_CACHE) return TM_POLL_CACHE;
  var o = JSON.parse(JSON.stringify(TM_POLL_DEF)), over = tm_cfgJson_('poll', {});
  if (over && typeof over === 'object') Object.keys(over).forEach(function (k) { o[k] = over[k]; });
  TM_POLL_CACHE = o; return o;
}
var TM_ORG_CACHE = null;
/** почта (нижний регистр) → [ФИО, должность, отдел] */
function tm_org_() {
  if (TM_ORG_CACHE) return TM_ORG_CACHE;
  var o = {}; Object.keys(TM_ORG_DEF).forEach(function (k) { o[k.toLowerCase()] = TM_ORG_DEF[k]; });
  var bots = tm_bots_('unans_org.json', null), m = bots && bots.mail && typeof bots.mail === 'object' ? bots.mail : null;
  if (m) Object.keys(m).forEach(function (k) { if (Array.isArray(m[k])) o[k.toLowerCase()] = m[k]; });
  var over = tm_cfgJson_('org', null);
  if (over && typeof over === 'object') Object.keys(over).forEach(function (k) { if (Array.isArray(over[k])) o[k.toLowerCase()] = over[k]; });
  TM_ORG_CACHE = o; return o;
}
function tm_words_(s) { return (String(s || '').toLowerCase().replace(/ё/g, 'е').match(/[a-zа-я][a-zа-я\-]+/g) || []); }
/** слово имени = фамилия (и женская / мужская форма: Имя27 — Имя27) */
function tm_snEq_(w, sn) { return !!(w && sn) && (w === sn || w === sn + 'а' || (/а$/.test(sn) && w === sn.slice(0, -1))); }
/** запрещённый адресат (ban): по почте или фамилии в имени MAX; until — последний день запрета */
function tm_banned_(cfg, today, mail, name) {
  var ml = String(mail || '').toLowerCase().trim(), ws = tm_words_(name);
  return (cfg.ban || []).some(function (b) {
    if (b.until && today > b.until) return false;
    if (ml && (b.mail || []).map(function (x) { return String(x).toLowerCase(); }).indexOf(ml) >= 0) return true;
    var sn = String(b.surname || '').toLowerCase().replace(/ё/g, 'е');
    return !!sn && ws.some(function (w) { return tm_snEq_(w, sn); });
  });
}
/** человек из cfg (executors / people) — этот ли участник MAX (по uid, имени в группе, фамилии + имени из fio, фамилии) */
function tm_matchEntry_(p, uid, name) {
  if (!p || typeof p !== 'object') return false;
  if (p.uid && uid && String(p.uid) === String(uid)) return true;
  var nn = function (s) { return String(s || '').trim().toLowerCase().replace(/ё/g, 'е'); };
  if (p.max && name && nn(p.max) === nn(name)) return true;
  var sn = (String(p.name || p.fio || '').split(/\s+/)[0] || '').toLowerCase().replace(/ё/g, 'е'), ws = tm_words_(name);
  if (!sn || sn.length < 3 || !ws.some(function (w) { return tm_snEq_(w, sn); })) return false;
  var fio = String(p.fio || '').split(/\s+/);
  if (fio.length >= 2 && ws.indexOf(fio[1].toLowerCase().replace(/ё/g, 'е')) < 0 && ws.length >= 2) return false;   // «Сотрудник3 Сотрудник1» ≠ «Сотрудник1 Сотрудник49»
  return true;
}
/** имя для обращения: из полного ФИО («Сотрудник42 Сотрудник43 Отчество23» → «Сотрудник43»), иначе первое слово имени в MAX */
function tm_firstName_(name, fio) {
  var f = String(fio || '').split(/\s+/).filter(Boolean);
  if (f.length >= 2 && /^[А-ЯЁ][а-яё]+$/.test(f[1])) return f[1];
  var w = String(name || '').split(' (@')[0].split(/\s+/).filter(Boolean);
  return w.length ? w[0] : 'коллега';
}
/** имя в MAX (и id) → {mail, fio, role, dep, short, first} | null: cfg → executors/people, затем оргструктура по фамилии (единственное совпадение) */
function tm_person_(cfg, org, name, uid) {
  var list = (cfg.executors || []).concat(cfg.people || []);
  for (var i = 0; i < list.length; i++) {
    var p = list[i]; if (!tm_matchEntry_(p, uid, name)) continue;
    var ml = String(p.mail || '').toLowerCase(), o = org[ml] || [], fio = p.fio || o[0] || p.name || name;
    return { mail: ml, fio: fio, role: p.role || o[1] || '', dep: p.dep || o[2] || '', short: p.name || o[0] || fio, first: tm_firstName_(name, fio) };
  }
  var ws = tm_words_(name).filter(function (w) { return w.length >= 3; }), hit = null;
  for (var j = 0; j < ws.length && !hit; j++) {
    var w = ws[j], fios = {};
    Object.keys(org).forEach(function (e) { var v = org[e]; if (v && v[0] && tm_snEq_(w, (v[0].split(/\s+/)[0] || '').toLowerCase().replace(/ё/g, 'е'))) if (!fios[v[0]]) fios[v[0]] = e; });
    var ks = Object.keys(fios);
    if (ks.length === 1) {
      var f = ks[0], e = fios[f], ini = ws.filter(function (x) { return x !== w; }), fp = f.split(/\s+/);
      if (ini.length && fp.length > 1 && !ini.some(function (x) { return x[0] === fp[1][0].toLowerCase().replace(/ё/g, 'е'); })) continue;
      hit = [e, org[e]];
    }
  }
  if (!hit) return null;
  var oo = hit[1];
  return { mail: hit[0], fio: oo[0], role: oo[1] || '', dep: oo[2] || '', short: oo[0], first: tm_firstName_(name, null) };
}
var TM_HEAD_RE = /^\s*(начальник|руководитель|директор|главн)/i, TM_HEAD_RANK = ['начальник', 'руководитель', 'директор', 'главн'];
/** руководитель отдела для копии письма: cfg.heads[отдел], иначе в том же отделе «Начальник / Руководитель / Директор / Главный…»; сам — null */
function tm_headOf_(cfg, org, dep, ownMail) {
  if (!dep) return null;
  var own = String(ownMail || '').toLowerCase(), h = (cfg.heads || {})[dep];
  if (h) return String(h).toLowerCase() === own ? null : String(h).toLowerCase();
  var o = org[own]; if (o && o[1] && TM_HEAD_RE.test(o[1])) return null;
  var best = null;
  Object.keys(org).forEach(function (e) {
    var v = org[e]; if (!v || v.length < 3 || v[2] !== dep || e === own || !TM_HEAD_RE.test(v[1] || '')) return;
    var low = String(v[1]).toLowerCase().replace(/^\s+/, ''), rank = 9;
    TM_HEAD_RANK.forEach(function (k, i) { if (rank === 9 && low.indexOf(k) === 0) rank = i; });
    if (!best || rank < best[0]) best = [rank, e];
  });
  return best ? best[1] : null;
}

// REDACTED_B64_2 форма ответов (как в mx_poll.py)
var TM_DATE_RX = /(?<![\d.,])(\d{1,2})[.,\/](\d{1,2})(?:[.,\/](\d{2,4}))?(?![\d])/g;
var TM_DATE_W = new RegExp('(?<![а-яё\\d])(\\d{1,2})\\s+(' + TM_MON_RE + ')(?![а-яё])', 'gi');
var TM_TERM_RX = /(?<![а-яё])(срок\w*|до|дедлайн\w*|следующ[а-яё]+\s+шаг[а-яё]*|оплат[а-яё]+\s+(?:до|на|в)|к\s+\d)(?![а-яё])/i;
var TM_SUM_RX = /(?<![\d.,])\d{1,3}(?:[ \u00a0]\d{3})+(?![\d])|(?<![\d.,:])\d{3,}(?![\d.,:])|\d+(?:[.,]\d+)?\s*(?:тыс|т\.?\s?р(?![а-яё])|тр(?![а-яё])|млн|руб|₽|р\.|к(?![а-яё])|k(?![a-z]))/i;
var TM_QTY_RX = /\d+\s*(?:шт|штук[а-яё]*|%|мест[а-яё]*|чел[а-яё]*|кг|кв\.?\s?м|м2|м3|дн[а-яё]*|час[а-яё]*|мин[а-яё]*|ч(?![а-яё]))/gi;
var TM_LEGAL_RX = /(?<![а-яё])(ооо|ип|ао|зао|пао|оао|гк|тд|ук|мку|мбоу|мбу|гбуз|фгуп|муп|нко|ано)(?![а-яё])\s*[«"„]?[А-ЯЁA-Z0-9]/i;
var TM_QUOTE_RX = /[«"„][^»"“]{2,60}[»"“]/;
var TM_CAP_RX = /(?<![А-Яа-яЁёA-Za-z])([А-ЯЁ][А-Яа-яЁё\-]{2,}|[A-Z][A-Za-z\-]{2,})/g;
var TM_STOP_CAP = {};
('понедельник вторник среда среду четверг пятница пятницу суббота субботу воскресенье январь февраль март апрель май июнь июль август ' +
 'сентябрь октябрь ноябрь декабрь января февраля марта апреля мая июня июля августа сентября октября ноября декабря ' +
 'сегодня завтра вчера послезавтра утром вечером днём днем неделе неделя месяц ' +
 'работала работал работали работаю работаем работа продолжаю продолжаем сделано сделала сделал сделали отправила отправил отправили ' +
 'выставила выставил выставили позвонила позвонил позвонили созвонилась созвонился созвонились встретилась встретился встретились ' +
 'договорились согласовали согласовала согласовал отгрузили отгрузила отгрузил отгрузка отгружено оплата оплатили оплачено оплачен ' +
 'счёт счет заказ запрос запросы новый новая новые клиент клиенты клиенту клиента клиентом клиентами все всё итог итого сумма срок дата ' +
 'что кто где когда пока нет да есть были было был была ждём ждем ждут жду ждёт ждет отчёт отчет отчеты отчёты добрый день вечер утро ' +
 'коллеги спасибо здравствуйте также ещё еще плюс минус итак кроме потом затем далее после пункт пункты вопрос вопросы вопросов ' +
 'ответ ответа ответили ответил ответила уточняю уточнила уточнил уточню готово готов готова выполнено закрыто перенос перенесено переносится ' +
 'отправка доставка поставка производство склад остатки остаток наличие прайс цена цены кп тз ндс ооо ип ао зао пао оао оп мск рф ' +
 'созвон созвонюсь звонок звонки встреча встречи визит выезд контрольный контрольная обратная связь переговоры общались обсудили ' +
 'написала написал напишу отправлю позвоню перезвоню свяжусь уточним согласуем проверю проверила проверил жду ждём ' +
 'пдо пто омтс жпс фтс пкс нет никаких ничего всем всех вам нам мне они она оно мы вы наш наша наше наши ваш ваша ваше ваши свой своя ' +
 'сам сама сами этот эта это эти тот та те там тут здесь очень много мало только уже снова опять').split(/\s+/).forEach(function (w) { TM_STOP_CAP[w.replace(/ё/g, 'е')] = 1; });
function tm_rxAll_(rx, s) { var out = [], m; rx.lastIndex = 0; while ((m = rx.exec(s)) !== null) { out.push(m); if (!m[0]) rx.lastIndex++; } return out; }
/** даты дд.мм (и «5 ноября») в тексте → [[позиция, 'дд.мм']] */
function tm_datesOf_(text) {
  var out = [], t = String(text || ''), z = function (n) { return (n < 10 ? '0' : '') + n; };
  tm_rxAll_(TM_DATE_RX, t).forEach(function (m) { var d = +m[1], mo = +m[2]; if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) out.push([m.index, z(d) + '.' + z(mo)]); });
  tm_rxAll_(TM_DATE_W, t).forEach(function (m) { var d = +m[1]; if (d >= 1 && d <= 31) out.push([m.index, z(d) + '.' + z(TM_MON[m[2].toLowerCase()])]); });
  return out;
}
function tm_hasSum_(text) {
  var t = String(text || '').replace(TM_DATE_RX, ' ').replace(/\d{1,2}:\d{2}/g, ' ').replace(TM_QTY_RX, ' ');
  return TM_SUM_RX.test(t);
}
/** название клиента: «клиент:», кавычки, ООО / ИП, иначе слово с заглавной не из служебных и не имя автора */
function tm_hasClient_(text, author) {
  var t = String(text || '');
  if (/(?<![а-яё])клиент[а-яё]*\s*[:—\-–]/i.test(t) || TM_QUOTE_RX.test(t) || TM_LEGAL_RX.test(t)) return true;
  var stop = {}; tm_words_(author).forEach(function (w) { stop[w] = 1; });
  var ms = tm_rxAll_(TM_CAP_RX, t);
  for (var i = 0; i < ms.length; i++) {
    var raw = ms[i][1], w = raw.toLowerCase().replace(/ё/g, 'е').replace(/^-+|-+$/g, '');
    if (stop[w] || TM_STOP_CAP[w] || w.length < 3) continue;
    if (raw === raw.toUpperCase() && w.length <= 3) continue;
    return true;
  }
  return false;
}
var TM_Q_HEAD = /^[ \t]*(?:[-•*▪️]\s*)?(?:\d+[.)]\s*)?(?:❓\s*)?вопрос[а-яё]*(?:[ \t]+(?:на|в|к|для|по)(?![а-яё])[^:\n]{0,60}?)?[ \t]*(?:[:—–-][ \t]*|$)/im;
var TM_NOQ = /(?<![а-яё])(нет\s+вопрос[а-яё]*|вопрос[а-яё]*\s+нет|без\s+вопрос[а-яё]*|вопрос[а-яё]*\s+отсутству[а-яё]*)(?![а-яё])/i;
var TM_Q_END = /^[ \t]*(?:[-•*]\s*)?(?:нужна помощь|план на завтра|план\s*:|итог[а-яё]*\s*:|отгрузк[а-яё]* на завтра)/i;
/** раздел «Вопросы …» отчёта → {items: [...], noq: bool} */
function tm_questions_(text) {
  var t = String(text || ''), m = TM_Q_HEAD.exec(t);
  if (!m) return { items: [], noq: TM_NOQ.test(t) };
  var after = t.slice(m.index + m[0].length), first = after.split('\n'), headRest = first[0].trim(), rest = first.slice(1), body = [];
  if (headRest) body.push(headRest);
  for (var i = 0; i < rest.length; i++) { if (TM_Q_END.test(rest[i])) break; body.push(rest[i]); }
  var items = [];
  body.forEach(function (ln) {
    ln.split(/(?:^|\s)(?=\d{1,2}[.)]\s)/).forEach(function (part) {
      var x = part.replace(/^[\s\-•*▪️]*(?:\d{1,2}[.)]\s*)?/, '').replace(/^[\s;]+|[\s;]+$/g, '');
      if (!x) return;
      var core = x.replace(/^[\s.!]+|[\s.!]+$/g, ''), fm = TM_NOQ.exec(core);
      if (fm && fm[0] === core) return;
      if (TM_NOQ.test(x) && x.length < 30) return;
      items.push(x.slice(0, 500));
    });
  });
  var noq = !items.length && TM_NOQ.test(t.slice(m.index, m.index + 200));
  return { items: items.slice(0, 15), noq: noq };
}
/** ответ на утренний опрос «❓ Вопросы на совещание» → {items, noq} */
function tm_qMorning_(text) {
  var t = String(text || '').trim(); if (!t) return { items: [], noq: false };
  var q = tm_questions_(t); if (q.items.length || q.noq) return q;
  if (TM_NOQ.test(t) && t.length < 80) return { items: [], noq: true };
  var body = t;
  if (/^\s*1[.)]\s/.test(t) && /(?:^|\n)\s*2[.)]\s/.test(t) && t.toLowerCase().indexOf('просроч') >= 0) body = t.split(/(?:^|\n)\s*2[.)]\s/)[0];
  var out = [];
  body.split('\n').forEach(function (ln) {
    ln.split(/(?:^|\s)(?=\d{1,2}[.)]\s)/).forEach(function (part) {
      var x = part.replace(/^[\s\-•*▪️]*(?:\d{1,2}[.)]\s*)?/, '').replace(/^[\s;]+|[\s;]+$/g, '');
      if (!x || (TM_NOQ.test(x) && x.length < 30)) return;
      out.push(x.slice(0, 500));
    });
  });
  return { items: out.slice(0, 15), noq: !out.length && TM_NOQ.test(t) };
}
/** вечерний отчёт: дата, срок, клиент, сумма (+ вопросы на совещание) → чего нет */
function tm_checkEvening_(text, author, qReq) {
  var ds = tm_datesOf_(text), miss = [], uniq = {};
  ds.forEach(function (d) { uniq[d[1]] = 1; });
  if (!ds.length) miss.push('даты');
  if (!(Object.keys(uniq).length >= 2 || TM_TERM_RX.test(String(text || '')))) miss.push('срока');
  if (!tm_hasClient_(text, author)) miss.push('клиента');
  if (!tm_hasSum_(text)) miss.push('суммы');
  if (qReq) { var q = tm_questions_(text); if (!q.items.length && !q.noq) miss.push('вопросов на совещание (или «нет вопросов»)'); }
  return miss;
}
/** утренний опрос (старый формат): пункт 1 — «?» или «вопросов нет»; пункт 2 — дата или «сделано» при просроченных */
function tm_checkMorning_(text, hasOver) {
  var low = String(text || '').toLowerCase().replace(/ё/g, 'е'), miss = [];
  if (!(low.indexOf('?') >= 0 || /вопрос[а-я]*\s+нет|нет\s+вопрос[а-я]*|без\s+вопрос[а-я]*/.test(low))) miss.push('нет пункта 1 — вопросы к руководству / коллегам или «вопросов нет»');
  if (hasOver && !(tm_datesOf_(text).length || /(?<![а-я])(сделано|сделан[а-я]*|выполнен[а-я]*|готово|закрыт[а-я]*|отправлен[а-я]*|оплачен[а-я]*|отгружен[а-я]*|решен[а-я]*)(?![а-я])/.test(low)))
    miss.push('по пункту 2 нет новой даты (дд.мм) или «сделано» по просроченным пунктам');
  return miss;
}
function tm_qOn_(cfg, day) { var f = String(cfg.questions_from || ''); return !!f && day >= f; }

// REDACTED_B64_2 исполнители и тексты
/** → {key: {uid, n, over, src}}; key — uid или 'n:Имя' (id неизвестен); без владельца, бота, руководства и ban */
function tm_executors_(cfg, ctl, names, today, owner, bot) {
  var ex = {}, skip = {}; if (owner) skip[owner] = 1; if (bot) skip[bot] = 1;
  var items = (ctl && ctl.items) || {};
  Object.keys(items).forEach(function (k) {
    var it = items[k];
    if (it.st !== 'open' || String(it.due || '') > today || !it.who_uid) return;
    var uid = String(it.who_uid), n = names[uid] || it.who || '';
    if (skip[uid] || !n || n === 'Коллеги' || TM_OWNER_RE.test(n) || tm_banned_(cfg, today, null, n)) return;
    if (tm_isLeader_(n, uid, null)) return;
    var e = ex[uid] || (ex[uid] = { uid: uid, n: n, over: 0, src: 'ctl' });
    if (it.due < today) e.over++;
  });
  (cfg.executors || []).forEach(function (p) {
    if (!p || typeof p !== 'object') return;
    var hits = Object.keys(names).filter(function (u) { return !skip[u] && tm_matchEntry_(p, u, names[u]); });
    if (hits.length === 1) {
      var u = hits[0];
      if (tm_banned_(cfg, today, p.mail, names[u])) return;
      if (tm_isLeader_(names[u], u, p.mail)) return;
      if (!ex[u]) ex[u] = { uid: u, n: names[u], over: 0, src: 'cfg' }; else ex[u].src = 'ctl+cfg';
      return;
    }
    if (tm_banned_(cfg, today, p.mail, p.name)) return;
    if (tm_isLeader_(p.fio || p.name, null, p.mail)) return;
    var disp = String(p.max || p.name || '').trim();
    if (disp && !Object.keys(ex).some(function (k) { return ex[k].n === disp; }))
      ex['n:' + disp] = { uid: null, n: disp, over: 0, src: 'cfg', why: hits.length ? 'несколько участников с такой фамилией' : 'id в группе неизвестен' };
  });
  return ex;
}
function tm_mention_(e) { var nm = tm_h_(e.n); return e.uid ? '<a href="max://user/' + e.uid + '">' + nm + '</a>' : nm; }
function tm_pollText_(kind, ex, msk, cfg) {
  var day = tm_ddmm_(msk.date) + ' (' + TM_WD_RU[msk.wd] + ')';
  var rows = Object.keys(ex).map(function (k) { return ex[k]; }).sort(function (a, b) { return a.n.toLowerCase() < b.n.toLowerCase() ? -1 : 1; });
  if (kind === 'morning') {
    var lines = rows.map(function (e) { return '• ' + tm_mention_(e) + (e.over ? ' — просроченных пунктов: ' + e.over : ''); });
    if (cfg.morning_q)
      return '❓ <b>Вопросы на совещание в головной офис, ' + day + '</b>\n\n' + lines.join('\n') + '\n\nОтветьте, пожалуйста, <b>ответом (reply) на это сообщение до ' +
             (cfg.morning_due || '08:45') + '</b>: ваши вопросы списком (1), 2), …) или «нет вопросов». Вопрос к конкретному человеку — отметьте его (@) или напишите фамилию.\n' +
             'В ' + (cfg.q_digest_at || '08:45') + ' вопросы уйдут Сотрудник81 Отчество42, М. И. Сотрудник6 и К. В. Сотрудник16, отмеченным — их вопрос отдельно.';
    return '📋 <b>Утренний опрос, ' + day + '</b>\n\n' + lines.join('\n') + '\n\nОтветьте, пожалуйста, <b>ответом (reply) на это сообщение до ' + (cfg.morning_due || '10:00') + '</b>:\n' +
           '1) Вопросы к руководству / коллегам (или «вопросов нет»);\n2) Что мешает выполнить просроченные пункты: № пункта — причина — новый срок дд.мм (нет просроченных — так и напишите).';
  }
  return '📊 <b>Вечерний отчёт, ' + day + '</b>\n\n' + rows.map(function (e) { return '• ' + tm_mention_(e); }).join('\n') +
         '\n\nОтветьте, пожалуйста, <b>ответом (reply) на это сообщение до ' + (cfg.evening_due || '17:30') + '</b>. По каждому клиенту / сделке — одна строка по шаблону:\n' +
         '<i>Клиент — что сделано — дата (дд.мм) — срок следующего шага (дд.мм) — сумма (руб.)</i>' +
         (tm_qOn_(cfg, msk.date) ? '\nВ конце — <b>«Вопросы на совещание в головной офис»</b> (совещание утром следующего рабочего дня) или «нет вопросов».' : '');
}
/** ответ m → ключ исполнителя в снимке опроса rec.exec */
function tm_ansKey_(m, rec, cfg) {
  var u = String(m.uid || ''); if (rec.exec[u]) return u;
  var ks = Object.keys(rec.exec);
  for (var i = 0; i < ks.length; i++) {
    if (ks[i].indexOf('n:') !== 0) continue;
    var e = rec.exec[ks[i]], list = cfg.executors || [];
    for (var j = 0; j < list.length; j++) { var p = list[j]; if (p && String(p.max || p.name || '').trim() === e.n && tm_matchEntry_(p, u, m.name)) return ks[i]; }
  }
  return u;
}
function tm_pollTimes_(cfg) {
  return { morning: [tm_hmMin_(cfg.morning, 8 * 60 + 55), tm_hmMin_(cfg.morning_due, 10 * 60)], evening: [tm_hmMin_(cfg.evening, 16 * 60 + 55), tm_hmMin_(cfg.evening_due, 17 * 60 + 30)] };
}
function tm_pollState_() { var st = tm_load_('poll.json', {}); ['names', 'days', 'commented', 'fwd', 'carry_sent', 'qd_sent', 'fwd_sent'].forEach(function (k) { if (!st[k]) st[k] = (k === 'names' || k === 'days' || k === 'fwd') ? {} : []; }); return tm_eveningStateScope20261108_(st, tm_pollCfg_()); }
/** имена участников: ctl.names + poll.names + история группы (+ раз в день список участников через ядро) */
function tm_pollNames_(st, ctl, msgs, cid, today, res) {
  var names = {};
  Object.keys((ctl && ctl.names) || {}).forEach(function (k) { names[String(k)] = ctl.names[k]; });
  Object.keys(st.names).forEach(function (k) { names[k] = st.names[k]; });
  var mf = st.mf && st.mf.d === today ? st.mf : { d: today, n: 0 };
  if (st.members_t !== today && mf.n < 3) {
    var r = tm_send_('members', { cid: cid });
    if (r.ok && r.members && typeof r.members === 'object') { Object.keys(r.members).forEach(function (u) { if (r.members[u]) names[String(u)] = String(r.members[u]); }); st.members_t = today; st.members = r.members; }
    else { mf.n++; if (!r.stub) res.members_err = r.err || 'нет списка участников'; }
  }
  st.mf = mf;
  msgs.forEach(function (m) { if (m.uid && m.name && !m.bot) names[m.uid] = m.name; });
  st.names = names;
  return names;
}
function tm_pollOwner_(names) { var o = tm_ownerUid_(); if (o) return o; var k = Object.keys(names).filter(function (u) { return TM_OWNER_RE.test(names[u] || ''); }); return k.length ? k[0] : ''; }

// REDACTED_B64_2 отправка опроса (минутный тик): окно [t0, due), рабочий день, один раз в день
function tm_pollSend_(ctx) {
  var cfg = tm_pollCfg_(); if (!cfg.on) return 'off';
  if (!ctx.workday || ctx.quiet) return 'не время';
  var times = tm_pollTimes_(cfg), m = tm_minOf_(ctx.msk), kind = null;
  Object.keys(times).forEach(function (k) { if (m >= times[k][0] && m < times[k][1]) kind = k; });
  if (!kind) return 'вне окна';
  var ef = String(cfg.evening_from || '');
  if (kind === 'evening' && ef && ctx.today < ef) return 'учебный режим: вечерний отчёт — с ' + tm_ddmm_(ef);
  if (!tm_chatOk_(tm_komCid_())) return 'группа выключена или её нет в листе groups';   // F4 C-A7
  if (tm_runDone_('poll:' + kind, ctx.today)) return 'уже';
  if (!tm_begin_('poll')) return 'занято';
  try {
    var st = tm_pollState_(), D = st.days[ctx.today] || (st.days[ctx.today] = {});
    if (D[kind]) { tm_runMark_('poll:' + kind, ctx.today, 'было'); return 'уже'; }
    var cid = tm_komCid_(), ctl = tm_load_('ctl.json', {}), H = tm_hist_(cid), msgs = tm_histList_(H), res = {};
    var names = tm_pollNames_(st, ctl, msgs, cid, ctx.today, res), owner = tm_pollOwner_(names), bot = tm_botUid_();
    var mem = st.members || {}, pool = {};
    Object.keys(names).forEach(function (u) { if (!Object.keys(mem).length || mem[u]) pool[u] = names[u]; });
    var ex = kind === 'evening' ? tm_eveningExecutors20261108_(cfg, pool, ctx.today, owner, bot) : tm_executors_(cfg, ctl, pool, ctx.today, owner, bot);
    if (!Object.keys(ex).length) { D[kind] = { t: ctx.msk.iso, skip: 'нет исполнителей' }; tm_save_('poll.json', st); tm_runMark_('poll:' + kind, ctx.today, 'нет исполнителей'); return 'нет исполнителей'; }
    var text = tm_pollText_(kind, ex, ctx.msk, cfg);
    var r = tm_sendOnce_('poll:' + kind + ':' + ctx.today, 'chat', { cid: cid, text: text, html: true }, 'poll');
    if (!r.ok) { res.err = r.err || 'не отправлено'; return res; }                          // ошибка или нет ядра — повтор в следующую минуту окна
    var exec = {}; Object.keys(ex).forEach(function (k) { exec[k] = { n: ex[k].n, uid: ex[k].uid, over: ex[k].over || 0 }; });
    D[kind] = { t: ctx.msk.iso, mid: r.mid || '', text: text, exec: exec, ans: {} };
    if (!tm_save_('poll.json', st)) { res.err = 'опрос ушёл, poll.json не записан — следующая минута восстановит по mid из tm_sent'; return res; }   // F4 C-B2: день не отмечаем
    tm_runMark_('poll:' + kind, ctx.today, 'отправлен, исполнителей ' + Object.keys(ex).length + (r.dup ? ' (восстановлено по tm_sent)' : ''));
    tm_log_('poll', 'опрос ' + kind + ': отправлен, исполнителей ' + Object.keys(ex).length);
    return { sent: kind, exec: Object.keys(ex).length };
  } finally { tm_end_('poll'); }
}

// REDACTED_B64_2 ответы, комментарии, напоминания, сводки (пятиминутный тик)
function tm_poll_(ctx) {
  var cfg = tm_pollCfg_(); if (!cfg.on) return 'off';
  if (!tm_chatOk_(tm_komCid_())) return 'группа выключена или её нет в листе groups';   // F4 C-A7: ни замечаний, ни напоминаний, ни сводок
  if (!tm_begin_('poll')) return 'занято';
  try {
    var st = tm_pollState_(), cid = tm_komCid_(), ctl = tm_load_('ctl.json', {}), H = tm_hist_(cid), msgs = tm_histList_(H), res = { comments: 0, sent: [] };
    var names = tm_pollNames_(st, ctl, msgs, cid, ctx.today, res), owner = tm_pollOwner_(names), bot = tm_botUid_();
    var times = tm_pollTimes_(cfg), tod = tm_minOf_(ctx.msk), D = st.days[ctx.today] || (st.days[ctx.today] = {});
    // пересылки в группу — для пятничной сводки владельцу
    msgs.forEach(function (m) {
      if (m.fwd && m.mid && !st.fwd[m.mid] && !m.bot)
        st.fwd[m.mid] = { t: tm_msk_(m.ts).iso, n: m.name, uid: m.uid, from: m.fwd.from || '', chat: m.fwd.chat, x: tm_mask_((m.fwd.text || m.text || '').slice(0, 300)) };
    });
    var fk = Object.keys(st.fwd); if (fk.length > 600) fk.sort(function (a, b) { return st.fwd[a].t < st.fwd[b].t ? -1 : 1; }).slice(0, fk.length - 600).forEach(function (k) { delete st.fwd[k]; });
    // окно опроса прошло, опроса не было — отметить
    if (ctx.workday) Object.keys(times).forEach(function (k) { if (!D[k] && tod >= times[k][1]) D[k] = { t: ctx.msk.iso, skip: 'окно отправки пропущено' }; });
    // ответы (reply на сообщение опроса) за последние 6 дней; не по форме — один комментарий на сообщение
    var polls = {}, days = Object.keys(st.days).sort().slice(-6);
    days.forEach(function (d) { Object.keys(st.days[d]).forEach(function (k) { var rec = st.days[d][k]; if (rec && typeof rec === 'object' && rec.mid) polls[rec.mid] = [d, k, rec]; }); });
    var commented = {}; st.commented.forEach(function (x) { commented[x] = 1; });
    var org = tm_org_();
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (!m.rmid || !polls[m.rmid] || m.bot || !m.mid) continue;
      if ((owner && m.uid === owner) || (bot && m.uid === bot) || (!owner && TM_OWNER_RE.test(m.name || ''))) continue;
      var pd = polls[m.rmid], d = pd[0], kind = pd[1], rec = pd[2], key = tm_ansKey_(m, rec, cfg);
      if (tm_banned_(cfg, ctx.today, null, m.name)) continue;
      if (kind === 'evening' && !rec.exec[key]) continue; // excluded respondents receive no evening format comments
      if (!rec.exec[key] && tm_isLeader_(m.name, m.uid, null)) continue;      // реплика руководителя под опросом — не ответ исполнителя, замечаний ему не пишем
      var e = rec.exec[key] || {}, miss;
      if (kind === 'evening') miss = tm_checkEvening_(m.text, m.name, tm_qOn_(cfg, d));
      else if (cfg.morning_q) { var qm = tm_qMorning_(m.text); miss = (qm.items.length || qm.noq) ? [] : ['нет вопросов на совещание или «нет вопросов»']; }
      else miss = tm_checkMorning_(m.text, !!e.over);
      var tiso = tm_msk_(m.ts).iso, prev = rec.ans[key];
      if (!prev || (prev.t || '') <= tiso)
        rec.ans[key] = { t: tiso, ok: !miss.length, miss: miss, mid: m.mid, n: m.name, uid: m.uid, text: (kind === 'evening' || cfg.morning_q) ? String(m.text || '').slice(0, 4000) : '', ments: (m.mentions || []).slice(0, 10) };
      var soft = d < String(cfg.count_from || '');
      if (!st.hint_w || typeof st.hint_w !== 'object') st.hint_w = {};
      var hk = kind + '|' + (m.uid || m.name), weekHint = soft && st.hint_w[hk] && st.hint_w[hk] > tm_addDays_(ctx.today, -7);   // 12.11: подсказка по форме — не чаще раза в неделю
      if (miss.length && !commented[m.mid] && !weekHint && (!soft || (cfg.soft_hints && d >= String(cfg.soft_from || ''))) && !ctx.quiet) {
        var fn = tm_firstName_(m.name, (tm_person_(cfg, org, m.name, m.uid) || {}).fio), text;
        if (soft && kind === 'evening') text = '💡 ' + fn + ', спасибо за отчёт! Чтобы он был полным, добавьте: ' + miss.join(' / ') + '. Сейчас учебный режим — отчёты пока не оцениваются; образец — сообщение «📌 Образец ежедневного отчёта».';
        else if (soft && cfg.morning_q) text = '💡 ' + fn + ', спасибо! Напишите, пожалуйста, сами вопросы на совещание списком — или «нет вопросов», если их нет.';
        else if (soft) text = '💡 ' + fn + ', спасибо! В ответе не хватает: ' + miss.join('; ') + '.';
        else if (kind === 'evening') text = '❌ ' + fn + ', отчёт некорректен (не по форме): нет ' + miss.join(' / ') + '. Пришлите, пожалуйста, заново ответом на опрос по шаблону.';
        else if (cfg.morning_q) text = '❌ ' + fn + ', в ответе нет вопросов на совещание. Напишите, пожалуйста, ответом на сообщение «❓ Вопросы на совещание»: вопросы списком или «нет вопросов».';
        else text = '❌ ' + fn + ', ответ на утренний опрос некорректен: ' + miss.join('; ') + '. Ответьте, пожалуйста, заново ответом на опрос по шаблону.';
        var r = tm_sendOnce_('pollc:' + m.mid, 'chat', { cid: cid, text: text, reply: m.mid }, 'poll');
        if (r.ok) { commented[m.mid] = 1; res.comments++; if (soft) st.hint_w[hk] = ctx.today; st.commented = Object.keys(commented).slice(-2000); tm_save_('poll.json', st); }
      }
    }
    st.commented = Object.keys(commented).slice(-2000);
    // напоминания: вечерний отчёт — повторно до корректного; утренний — один раз после срока
    tm_pollRepeatEvening_(ctx, cfg, st, D, times, cid, res);
    var mr = D.morning;
    if (ctx.workday && mr && !mr.skip && !mr.remind && tod >= times.morning[1] && mr.exec) {
      var end = times.morning[1] + 150;
      if (tod >= end) mr.remind = { t: ctx.msk.iso, names: [], skip: 'окно напоминания прошло' };
      else {
        var noans = Object.keys(mr.exec).filter(function (k) { return !mr.ans[k]; }).map(function (k) { return mr.exec[k].n; }).sort();
        if (!noans.length) mr.remind = { t: ctx.msk.iso, names: [] };
        else if (true) { mr.remind = { t: ctx.msk.iso, names: noans, skip: 'напоминание отключено 12.11.2026 (Т. В.: без повторных вопросов) — нет ответа = нет вопросов' }; }
        else if (!ctx.quiet) {
          var txt = '⏳ Нет ответа на опрос (' + (cfg.morning_q ? 'вопросы на совещание' : 'утренний') + ', до ' + (cfg.morning_due || '10:00') + '): ' + noans.join(', ') + '. Ответьте, пожалуйста, ответом (reply) на сообщение опроса.';
          var rr = tm_sendOnce_('pollr:morning:' + ctx.today, 'chat', { cid: cid, text: txt }, 'poll');
          if (rr.ok) { mr.remind = { t: ctx.msk.iso, names: noans }; res.sent.push('remind:morning'); tm_save_('poll.json', st); }
        }
      }
    }
    try { tm_fwdDigest_(ctx, cfg, st, res); } catch (e) { res.fwd_err = tm_err_(e); }
    try { tm_qDigest_(ctx, cfg, org, st, res); } catch (e) { res.q_err = tm_err_(e); tm_log_('qdigest', tm_err_(e)); }
    // после 18:00 — кто не ответил (для утреннего отчёта владельцу)
    if (tod >= 18 * 60) {
      ['morning', 'evening'].forEach(function (k) { var rec = D[k]; if (rec && rec.exec) rec.noans = Object.keys(rec.exec).filter(function (x) { return !rec.ans[x]; }).map(function (x) { return rec.exec[x].n; }).sort(); });
      D.late = { morning: (D.morning || {}).noans || [], evening: (D.evening || {}).noans || [] };
    }
    Object.keys(st.days).sort().slice(0, -30).forEach(function (d) { delete st.days[d]; });
    st.last = ctx.msk.iso; st.owner_uid = owner;
    tm_save_('poll.json', st);
    tm_publish_('poll.bin', tm_pollPublish_(st, cfg, ctx.today, tod, times, ctx.msk.iso));
    res.today = {}; ['morning', 'evening'].forEach(function (k) { var r0 = D[k] || {}; res.today[k] = r0.mid ? 'sent' : (r0.skip || '-'); });
    return res;
  } finally { tm_end_('poll'); }
}
/** кто из исполнителей ещё не сдал корректный ответ → [[ключ, исполнитель, чего нет | null]] */
function tm_pendingOf_(rec) {
  var out = [];
  Object.keys(rec.exec || {}).sort(function (a, b) { return rec.exec[a].n.toLowerCase() < rec.exec[b].n.toLowerCase() ? -1 : 1; }).forEach(function (k) {
    var a = rec.ans[k]; if (a && a.ok) return;
    out.push([k, rec.exec[k], a ? (a.miss && a.miss.length ? a.miss : ['формы']) : null]);
  });
  return out;
}
function tm_pendLine_(e, miss) { return tm_mention_(e) + (miss === null ? ' — нет ответа' : ' — не по форме: нет ' + tm_h_(miss.join(' / '))); }
/** вечерний отчёт: после срока — каждые evening_repeat_min до evening_repeat_until (и не в тихие часы); следующие рабочие дни — в carry_at */
function tm_pollRepeatEvening_(ctx, cfg, st, D, times, cid, res) {
  var due = times.evening[1], rep = Math.max(10, Number(cfg.evening_repeat_min) || 30), until = tm_hmMin_(cfg.evening_repeat_until, 19 * 60 + 30), tod = tm_minOf_(ctx.msk);
  var rec = D.evening, cf = String(cfg.count_from || '');
  if (cf && ctx.today < cf) rec = null;                                     // до count_from — без повторных напоминаний за день
  if (ctx.workday && rec && !rec.skip && rec.exec && tod >= due && !ctx.quiet) {
    var pend = tm_pendingOf_(rec), rt = rec.rem_t || (rec.rem_t = []);
    if (!pend.length) { if (!rec.remind) rec.remind = { t: ctx.msk.iso, names: [] }; }
    else if (tod < until && !rt.length) {                                    // 12.11: одно напоминание о вечернем отчёте, без повторов каждые полчаса
      var n = rt.length + 1;
      var text = '⏳ <b>Вечерний отчёт за ' + tm_ddmm_(ctx.today) + ' не сдан' + (n === 1 ? '' : ' — напоминание ' + n) + '</b> (срок был ' + (cfg.evening_due || '17:30') + '):\n' +
                 pend.map(function (p) { return '• ' + tm_pendLine_(p[1], p[2]); }).join('\n') +
                 '\n\nПришлите, пожалуйста, <b>ответом (reply) на сообщение «📊 Вечерний отчёт»</b> по образцу из сообщения «📌 Образец ежедневного отчёта». Бот напоминает, пока отчёт не будет по форме.';
      var r = tm_sendOnce_('pollr:evening:' + ctx.today + ':' + n, 'chat', { cid: cid, text: text, html: true }, 'poll');
      if (r.ok) { rt.push(ctx.msk.iso); rec.remind = { t: ctx.msk.iso, names: pend.map(function (p) { return p[1].n; }) }; res.sent.push('remind:evening'); tm_save_('poll.json', st); }
    }
  }
  return;                                                                   // 12.11 (Т. В.: без повторов): «не сданы отчёты за прошлые дни» больше не пишем
  if (!ctx.workday || ctx.quiet) return;
  var slots = (cfg.carry_at || ['09:05', '14:00']).map(function (x) { return tm_hmMin_(x, null); }).filter(function (x) { return x !== null && x <= tod; });
  if (!slots.length || tod >= 19 * 60 + 30) return;
  var slot = Math.max.apply(null, slots), z = function (v) { return (v < 10 ? '0' : '') + v; };
  var key = ctx.today + ' ' + z(Math.floor(slot / 60)) + ':' + z(slot % 60);
  if (st.carry_sent.indexOf(key) >= 0) return;
  var days = [], d = ctx.today;
  while (days.length < Math.max(1, Number(cfg.carry_days) || 3)) { d = tm_addDays_(d, -1); if ((tm_dateMs_(ctx.today) - tm_dateMs_(d)) / 864e5 > 10) break; if (tm_workday_(d)) days.push(d); }
  var blocks = [];
  days.forEach(function (dd) {
    if (cf && dd < cf) return;
    var r0 = (st.days[dd] || {}).evening; if (!r0 || r0.skip || !r0.mid || !r0.exec) return;
    var pend = tm_pendingOf_(r0); if (pend.length) blocks.push('<b>' + tm_ddmm_(dd) + '</b>\n' + pend.map(function (p) { return '• ' + tm_pendLine_(p[1], p[2]); }).join('\n'));
  });
  if (!blocks.length) { st.carry_sent.push(key); st.carry_sent = st.carry_sent.slice(-60); return; }
  var text2 = '⏳ <b>Не сданы вечерние отчёты</b> (нет ответа или не по форме):\n\n' + blocks.join('\n\n') +
              '\n\nПришлите, пожалуйста, <b>ответом (reply) на сообщение «📊 Вечерний отчёт» за этот день</b> — по образцу из сообщения «📌 Образец ежедневного отчёта». Бот напоминает, пока отчёт не будет по форме.';
  var r2 = tm_sendOnce_('pollr:carry:' + key, 'chat', { cid: cid, text: text2, html: true }, 'poll');
  if (r2.ok) { st.carry_sent.push(key); st.carry_sent = st.carry_sent.slice(-60); res.sent.push('remind:carry'); tm_save_('poll.json', st); }
}
/** оргструктура → [[основа фамилии, почта, ФИО кратко]] для поиска отмеченных в тексте вопроса */
function tm_qPeople_(org, cfg, today, skip) {
  var out = [];
  Object.keys(org).forEach(function (ml) {
    var v = org[ml]; if (!v || skip[ml] || tm_banned_(cfg, today, ml, null)) return;
    var sn = v[0] ? String(v[0]).split(/\s+/)[0] : '';
    if (sn.length < 4 || !/^[А-ЯЁ]/.test(sn)) return;
    var stem = sn.length >= 6 && 'аяоеиыйь'.indexOf(sn.slice(-1)) >= 0 ? sn.slice(0, -1) : sn;
    out.push([stem, ml, v[0]]);
  });
  return out;
}
function tm_escRe_(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
/** кто отмечен в вопросе: упоминание MAX (имя в тексте или вопрос один) и фамилия из оргструктуры → {почта: ФИО} */
function tm_qMarked_(item, ments, names, cfg, org, people, today, skip) {
  var got = {}, low = item.toLowerCase().replace(/ё/g, 'е');
  ments.forEach(function (x) {
    var uid = x[0], single = x[1], nm = names[String(uid)] || '', p = tm_person_(cfg, org, nm, uid) || {}, ml = String(p.mail || '').toLowerCase();
    if (!ml || skip[ml] || tm_banned_(cfg, today, ml, nm)) return;
    var ws = tm_words_(nm).concat(tm_words_(p.fio || '')).filter(function (w) { return w.length >= 4; });
    if (single || ws.some(function (w) { return low.indexOf(w.slice(0, -1)) >= 0; })) got[ml] = p.short || p.fio || nm;
  });
  people.forEach(function (pp) {
    if (got[pp[1]]) return;
    if (new RegExp('(?<![А-Яа-яЁё])' + tm_escRe_(pp[0]) + '[а-яё]{0,3}(?![А-Яа-яЁё])').test(item)) got[pp[1]] = pp[2];
  });
  return got;
}
/** к q_digest_at рабочего дня: вопросы на совещание → письмо q_digest_to + каждому отмеченному — его вопрос (копия руководителю отдела) */
function tm_qDigest_(ctx, cfg, org, st, res) {
  if (!ctx.workday || !cfg.questions_from) return;
  var at = tm_hmMin_(cfg.q_digest_at, 8 * 60 + 45), tod = tm_minOf_(ctx.msk);
  if (tod < at || tod >= 12 * 60) return;
  if (st.qd_sent.indexOf(ctx.today) >= 0) return;
  var recs = [];
  Object.keys(st.days).sort().forEach(function (d) {
    if (d >= ctx.today || (tm_dateMs_(ctx.today) - tm_dateMs_(d)) / 864e5 > 5) return;
    var r = st.days[d].evening; if (!r || r.skip || !r.exec || r.qd || !tm_qOn_(cfg, d)) return;
    recs.push([d, r]);
  });
  var mrec = null;
  if (cfg.morning_q && tm_qOn_(cfg, ctx.today)) { var r0 = (st.days[ctx.today] || {}).morning; if (r0 && !r0.skip && r0.exec && !r0.qd) mrec = r0; }
  if (!recs.length && !mrec) { st.qd_sent.push(ctx.today); st.qd_sent = st.qd_sent.slice(-30); return; }
  var to = (cfg.q_digest_to || TM_POLL_DEF.q_digest_to).map(function (x) { return String(x).toLowerCase(); }), skip = { 'user42@example.org': 1 };
  to.forEach(function (x) { skip[x] = 1; });
  var names = st.names || {}, people = tm_qPeople_(org, cfg, ctx.today, skip), lines = [], noq = [], none = [], personal = {}, silent = [];
  var add = function (who, label, d, items, ments, own) {
    lines.push(who + ', ' + label + ':');
    items.forEach(function (it, i) {
      var sk = {}; Object.keys(skip).forEach(function (k) { sk[k] = 1; }); if (own) sk[own] = 1;
      var mk = tm_qMarked_(it, (ments || []).map(function (u) { return [u, items.length === 1]; }), names, cfg, org, people, ctx.today, sk), mv = Object.keys(mk).map(function (k) { return mk[k]; }).sort();
      lines.push('  ' + (i + 1) + ') ' + it + (mv.length ? ' → ' + mv.join(', ') : ''));
      Object.keys(mk).forEach(function (ml) { (personal[ml] = personal[ml] || { short: mk[ml], q: [] }).q.push([who, d, it]); });
    });
  };
  var byName = function (rec) { return Object.keys(rec.exec).sort(function (a, b) { return rec.exec[a].n.toLowerCase() < rec.exec[b].n.toLowerCase() ? -1 : 1; }); };
  if (mrec) byName(mrec).forEach(function (k) {
    var e = mrec.exec[k], p = tm_person_(cfg, org, e.n, e.uid) || {}, who = p.short || e.n, a = mrec.ans[k];
    if (!a) { silent.push(who); return; }
    var q = tm_qMorning_(a.text || '');
    if (q.items.length) add(who, 'утром ' + tm_ddmm_(ctx.today), ctx.today, q.items, a.ments, p.mail || '');
    else if (q.noq) noq.push(who); else silent.push(who + ' (ответ без вопросов)');
  });
  recs.forEach(function (pr) {
    var d = pr[0], r = pr[1];
    byName(r).forEach(function (k) {
      var e = r.exec[k], a = r.ans[k], p = tm_person_(cfg, org, e.n, e.uid) || {}, who = p.short || e.n;
      if (!a) { if (!mrec) none.push(who + ' (' + tm_ddmm_(d) + ') — отчёта нет'); return; }
      var q = tm_questions_(a.text || '');
      if (!q.items.length) { if (!mrec) (q.noq ? noq : none).push(who + ' (' + tm_ddmm_(d) + ')' + (q.noq ? '' : ' — раздела вопросов нет')); return; }
      add(who, 'отчёт за ' + tm_ddmm_(d), d, q.items, a.ments, p.mail || '');
    });
  });
  var meet = tm_ddmm_(ctx.today), src = [];
  if (mrec) src.push('утренний опрос в группе MAX «Коммерческий отдел»');
  if (recs.length) { var dd = {}; recs.forEach(function (pr) { dd[tm_ddmm_(pr[0])] = 1; }); src.push('вечерние отчёты за ' + Object.keys(dd).sort().join(', ')); }
  var subj = 'Вопросы на совещание ' + meet + ' — ' + src.join('; ');
  var text = 'Вопросы в головной офис к совещанию ' + meet + ' (' + src.join('; ') + ').\n\n' + (lines.length ? lines.join('\n') : 'Вопросов нет.') + '\n\n' +
             (silent.length ? 'Не написали вопросы к ' + (cfg.morning_due || '08:45') + ': ' + silent.join('; ') + '\n' : '') +
             (noq.length ? 'Нет вопросов: ' + noq.join('; ') + '\n' : '') +
             (none.length ? 'Без вопросов в отчёте или без отчёта: ' + none.join('; ') + '\n' : '') + ((silent.length || noq.length || none.length) ? '\n' : '') +
             'Отмеченным в вопросах (→) бот отправил их вопрос отдельным письмом.\n— бот «Фабрикант»';
  // F4 C-B2: сводка и каждое персональное письмо — отдельная операция Outbox ('qd:<день>:<адресат>'); решение «сводка сделана» сохраняется сразу,
  // письма остаются pending до доставки (повтор — минутный тик); без модуля Outbox — сразу, сводка при отказе — повтор в следующий тик (как было)
  var s1 = tm_obSend_('tm:qd:' + ctx.today + ':sum', 'tm_mail', 'sum', { to: to, cc: [], subj: subj, body: text, owner: true, sent_id: 'qd:' + ctx.today + ':sum', job: 'poll' });   // в любое время
  if (!s1.ok && !s1.queued) { res.q_err = s1.err || s1.status; return; }
  var pst = {};
  Object.keys(personal).sort().forEach(function (ml) {
    var pq = personal[ml], po = org[ml] || [], head = tm_headOf_(cfg, org, po[2] || '', ml);
    if (head && (tm_banned_(cfg, ctx.today, head, null) || to.indexOf(head) >= 0 || head === ml)) head = null;
    var greet = tm_firstName_('', po[0] || pq.short);
    var body = (greet !== 'коллега' ? greet : pq.short) + ', добрый день.\n\nК вам ' + (pq.q.length === 1 ? 'вопрос' : 'вопросы') + ' на совещание ' + meet + ' (офисы продаж, группа MAX «Коммерческий отдел»):\n\n' +
               pq.q.map(function (x, i) { return (i + 1) + ') ' + x[2] + ' — от ' + x[0] + ' (' + (x[1] === ctx.today ? 'утром' : 'отчёт за ' + tm_ddmm_(x[1])) + ')'; }).join('\n') +
               '\n\nОтвет — на совещании или ответом на это письмо.' + (head ? ' Копия — руководителю отдела.' : '') + '\n— бот «Фабрикант»';
    var sp = tm_obSend_('tm:qd:' + ctx.today + ':' + ml, 'tm_mail', ml, { to: [ml], cc: head ? [head] : [], subj: 'Вопрос к вам на совещание ' + meet, body: body, sent_id: 'qd:' + ctx.today + ':' + tm_sha12_(ml), job: 'poll' });
    pst[tm_sha12_(ml)] = sp.ok ? 'sent' : (sp.queued ? 'pending' : String(sp.status || 'err'));
  });
  recs.forEach(function (pr) { pr[1].qd = ctx.msk.iso; }); if (mrec) mrec.qd = ctx.msk.iso;
  st.qd_sent.push(ctx.today); st.qd_sent = st.qd_sent.slice(-30);
  res.qdigest = { q: lines.filter(function (x) { return x.indexOf('  ') === 0; }).length, personal: Object.keys(personal).length, silent: silent.length, mail: s1.ok ? 'ok' : (s1.queued ? 'pending' : s1.status), per: pst };
  tm_save_('poll.json', st);
  if (s1.queued || Object.keys(pst).some(function (k) { return pst[k] === 'pending'; })) { try { res.qdigest.run = tm_obRun_(ctx); } catch (e) { res.qdigest.run = tm_err_(e); } }   // доставка сразу; остальное — минутный тик
}
/** пятница, fwd_digest_at: письмо владельцу — пересылки в группу за неделю (нет пересылок — письма нет) */
function tm_fwdDigest_(ctx, cfg, st, res) {
  if (ctx.msk.wd !== 4 || tm_minOf_(ctx.msk) < tm_hmMin_(cfg.fwd_digest_at, 17 * 60 + 30)) return;
  if (st.fwd_sent.indexOf(ctx.today) >= 0) return;
  var since = tm_addDays_(ctx.today, -6), rows = Object.keys(st.fwd).map(function (k) { return st.fwd[k]; }).filter(function (v) { return v.t.slice(0, 10) >= since; }).sort(function (a, b) { return a.t < b.t ? -1 : 1; });
  var mark = function () { st.fwd_sent.push(ctx.today); st.fwd_sent = st.fwd_sent.slice(-20); };
  if (!rows.length) { mark(); return; }
  var by = {}; rows.forEach(function (v) { (by[v.n] = by[v.n] || []).push(v); });
  var lines = [];
  Object.keys(by).sort(function (a, b) { return by[b].length - by[a].length; }).forEach(function (n) {
    lines.push(n + ' — ' + by[n].length + ':');
    by[n].slice(0, 15).forEach(function (v) { lines.push('  • ' + v.t.slice(8, 10) + '.' + v.t.slice(5, 7) + ' ' + v.t.slice(11, 16) + ' — от ' + (v.from || (v.chat ? 'чат ' + v.chat : 'неизвестно откуда')) + ': ' + (v.x || '(файл или фото)').slice(0, 160)); });
  });
  var text = 'Пересылки в группу MAX «Коммерческий отдел» за неделю (' + tm_ddmm_(since) + '–' + tm_ddmm_(ctx.today) + '): ' + rows.length + '.\n\n' + lines.join('\n') +
             '\n\nПересылки ИЗ группы в другие чаты боту не видны (MAX об этом не сообщает).\n— бот «Фабрикант»';
  res.fwd = tm_mail_(cfg.fwd_to || [TM_ITM], [], 'Пересылки в «Коммерческий отдел» за неделю — ' + rows.length, text, true);
  if (res.fwd === 'ok' || res.fwd === 'dry' || res.fwd === 'err: нет адресата') mark();   // F4 C-B2: отметка — только после отправки (иначе повтор в следующий тик)
}
/** poll.bin для портала: 10 дней — по исполнителю ok / bad / none (wait — срок не наступил), % по исполнителям, участники */
function tm_pollPublish_(st, cfg, today, tod, times, tIso) {
  var days = [], agg = {};
  Object.keys(st.days).sort().slice(-10).forEach(function (d) {
    var row = { d: d };
    ['morning', 'evening'].forEach(function (kind) {
      var rec = st.days[d][kind]; if (!rec || !rec.exec) return;
      var closed = d < today || tod >= times[kind][1], cell = {};
      Object.keys(rec.exec).forEach(function (k) {
        var e = rec.exec[k], a = rec.ans[k], s = a ? (a.ok ? 'ok' : 'bad') : (closed ? 'none' : 'wait');
        cell[k] = { n: e.n, st: s };
        if (s !== 'wait') { var g = agg[e.n] || (agg[e.n] = { uid: e.uid, n: e.n, ok: 0, bad: 0, none: 0 }); g[s]++; if (e.uid && !g.uid) g.uid = e.uid; }
      });
      row[kind] = cell;
      if (rec.noans) { row.noans = row.noans || {}; row.noans[kind] = rec.noans; }
    });
    if (Object.keys(row).length > 1) days.push(row);
  });
  var ex = Object.keys(agg).map(function (k) { var g = agg[k], n = g.ok + g.bad + g.none; g.pct = n ? Math.round(100 * g.ok / n) : 0; return g; }).sort(function (a, b) { return b.pct - a.pct || (a.n < b.n ? -1 : 1); });
  var last = {};
  Object.keys(st.days).forEach(function (d) { Object.keys(st.days[d]).forEach(function (k) { var rec = st.days[d][k]; if (rec && rec.ans) Object.keys(rec.ans).forEach(function (x) { var a = rec.ans[x]; if (a.uid && (a.t || '') > (last[a.uid] || '')) last[a.uid] = a.t; }); }); });
  var mem = Object.keys(st.members || {}).sort(function (a, b) { return String(st.members[a]).toLowerCase() < String(st.members[b]).toLowerCase() ? -1 : 1; }).map(function (u) { return { uid: u, n: st.members[u], last_ans: last[u] || '' }; });
  return { v: 1, t: tIso, on: !!cfg.on, days: days, exec: ex, members: mem, members_t: st.members_t || null };
}
