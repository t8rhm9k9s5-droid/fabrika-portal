/* «Фабрика — бот MAX» (Google 1c@) — Timers.gs: таймеры (триггеры по времени) вместо участка bots робота хостинга
   (шаг 3 переноса ботов в Google, ночь 05.11.2026; план fabrika/tasks/max_to_google_plan.md, задания tasks/night_briefs.md и night_contracts.md).
   Т. В. Сотрудник1: «На хостинге ничего с ботами связано быть не должно. Должно всё работать с Google-диска».

   Что здесь: настройки (лист tm_settings), время МСК, праздники и тихие часы, руководители (бот вопросов не задаёт),
   состояние в JSON-файлах Диска («Фабрика — боты/MAX/tm/…», через Store.gs: jget_/jput_), отметки «отправлено» (лист tm_sent),
   единственный выход в MAX — tm_send_ (API ядра шага 2: REDACTED_B64_8), публикация файлов для портала
   в «От ботов» (bf_seal/bf_write шага 5: файлы владельца — ключ k_owner, остальные — ключ сайта), техтревоги владельцу (tm_alert_, раз в день),
   чтение новых сообщений групп из очереди max_in (Store.gs), диспетчер тиков tm_tickMinute/tm_tick с окнами по МСК, триггеры tm_setupTriggers/
   tm_removeTriggers и импорт состояния tm_importState. Остальные файлы: TimersPolls.gs (опросы), TimersCtl.gs (сроки, напоминания),
   TimersMail.gs (письма-команды, без ответа, sales@), TimersWatch.gs (штат, итоги опросов, выгрузки, обещания, рекламации, ротация).

   Всё работает ТОЛЬКО при свойстве скрипта MODE === 'google' (иначе триггеры сразу выходят, tm_setupTriggers триггеров не ставит).
   В режиме google — ни одного обращения к techfabrikant.ru. Ключи (K_CMD, MAX_TOKEN, CLAUDE_FIRE_*) — только в свойствах скрипта,
   в листы, файлы и журнал не попадают. Журнал — лист log (logRow_ из Store.gs), без персональных данных.
   Префикс всех функций и глобалов — tm_ (в проекте одно пространство имён с Code.gs, Relay.gs, Store.gs, MaxCore*.gs, cp_/kb_/bf_/au_). */

var TM_VER = 'tm-1.0 (05.11.2026)';
var TM_SUB = 'tm';                                                        // подпапка Диска: «Фабрика — боты/MAX/tm» — файлы состояния
var TM_POLLS_SUB = 'polls';                                              // опросы с кнопками (пишет ядро, формат — lib.php polls/<id>.json)
var TM_ITM = 'user5@example.org';
var TM_KOM_CID = '-100000000003';                                      // «Коммерческий отдел» (как KNOWN_GROUPS в Relay.gs; уточняется листом groups)
var TM_KOM_RE = /коммерческ/i;
var TM_OWNER_RE = /^\s*Сотрудник2(?![а-яё])/i;
var TM_HOLIDAYS = ['2026-11-04', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08'];
var TM_QUIET_FROM = 20, TM_QUIET_TO = 8;                                 // тихие часы уведомлений сотрудникам (опросы, напоминания, письма): 20:00–08:00 МСК (RULES 27–28.10, как quiet() в mx_poll.py/remind.py/live.py); владельцу — всегда.
                                                                         // НЕ путать с окном вмешательств от имени Т. В. в группах (au_isQuiet, 19:00–07:00) — проверка 1, 05.11
var TM_BUDGET = { minute: 90000, five: 280000 };                         // мс на один запуск (лимит Google — 6 мин)
var TM_HIST_DAYS = 60;                                                   // история групп для напоминаний и обещаний
var TM_SHEETS = {
  tm_settings: ['k', 'v', 'note'],
  tm_sent:     ['id', 't', 'kind', 'to', 'mid', 'job'],                 // отметки «отправлено» — повтор тика не дублирует сообщения
  tm_runs:     ['job', 'key', 't', 'res'],                               // когда и с каким итогом шла каждая работа
  tm_mail_log: ['id', 't', 'from', 'subj', 'status']                     // письма-команды: что передано Claude / отклонено
};
/** Функции ядра (шаг 2, MaxCore.gs, раздел «API ядра для таймеров»; сверено с STEP2_README 05.11 ~03:30), которые вызывает tm_send_:
    mx_tmSendChat(cid, text, {html, reply}) → {ok, mid, code, err} (html=false — текст как есть, без разметки; reply — mid; удалённое сообщение → без ссылки);
    mx_tmSendUser(uid, text, {html}) → {ok, mid, code, err}; mx_tmDelete(mid) → {ok, err}; mx_tmMembers(cid) → {ok, members:{uid: имя}, err};
    mx_tmQueue(limit, budgetMs) → {ok, n} — минутная работа ядра (очередь, отложенные события, вопросы без ответа, выгрузка истории; бюджет — остаток минутного тика, ≤ 40 с; CHECK3 05.11).
    Нет функции — заглушка: ничего не уходит, итог {ok:false, stub:true}; имена при переименовании в ядре правятся только здесь. */
var TM_CORE = { chat: 'mx_tmSendChat', user: 'mx_tmSendUser', 'delete': 'mx_tmDelete', members: 'mx_tmMembers', queue: 'mx_tmQueue' };
var TM_ALERT_TO = 'user5@example.org';                                    // техтревоги владельцу (письмо от 1c@) — можно и в тихие часы
var TM_OWNER_BIN_RE = /^(ua|grp|mq|diag|rem|poll|gl|mo|grpp|mxsurvey)\.bin$|^exp_/;   // файлы только для владельца — ключ k_owner (как OWNER_BINS в live.py и BF_OWNER_RX)
var TM_MEM = { files: {}, cfg: null, cfgT: 0, triggers: null, groups: null };   // память одного запуска: файлы состояния, настройки, триггеры ядра, группы
var TM_QUOTA_DAY_MS = 3.5 * 3600e3;                                      // F4 C-B3: прогноз расхода триггеров MAX за сутки выше 3,5 ч (из 6 ч на аккаунт 1c@ вместе с Telegram) — техтревога

// REDACTED_B64_2 режим, свойства
function tm_props_() { return PropertiesService.getScriptProperties(); }
function tm_on_() { return String(tm_props_().getProperty('MODE') || '').trim().toLowerCase() === 'google'; }
function tm_log_(k, msg) { logRow_('tm:' + k, msg); }
function tm_err_(e) { return String(e && e.message || e).slice(0, 200); }

// REDACTED_B64_2 время МСК (без перевода часов: UTC+3)
/** Date → части МСК: {date 'ГГГГ-ММ-ДД', h, m, hm 'ЧЧ:ММ', wd (0 — пн … 6 — вс), ms} */
function tm_msk_(d) {
  var t = new Date((d instanceof Date ? d : new Date(d)).getTime() + 3 * 3600e3);
  var z = function (n) { return (n < 10 ? '0' : '') + n; };
  return { date: t.getUTCFullYear() + '-' + z(t.getUTCMonth() + 1) + '-' + z(t.getUTCDate()), h: t.getUTCHours(), m: t.getUTCMinutes(),
           hm: z(t.getUTCHours()) + ':' + z(t.getUTCMinutes()), wd: (t.getUTCDay() + 6) % 7, ms: (d instanceof Date ? d : new Date(d)).getTime(),
           iso: t.getUTCFullYear() + '-' + z(t.getUTCMonth() + 1) + '-' + z(t.getUTCDate()) + 'T' + z(t.getUTCHours()) + ':' + z(t.getUTCMinutes()) };
}
/** 'ГГГГ-ММ-ДД' → Date (полночь МСК) */
function tm_dateMs_(s) { var p = String(s).slice(0, 10).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]) - 3 * 3600e3; }
function tm_dateOf_(ms) { return tm_msk_(ms).date; }
function tm_addDays_(s, n) { return tm_dateOf_(tm_dateMs_(s) + n * 864e5 + 3600e3); }
function tm_wd_(s) { return tm_msk_(tm_dateMs_(s) + 3600e3).wd; }
function tm_ddmm_(s) { s = String(s || ''); return s.slice(8, 10) + '.' + s.slice(5, 7); }
function tm_dmy_(s) { s = String(s || ''); return s.slice(8, 10) + '.' + s.slice(5, 7) + '.' + s.slice(0, 4); }
function tm_hmMin_(s, def) { var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? (+m[1]) * 60 + (+m[2]) : def; }
/** 'ГГГГ-ММ-ДДTЧЧ:ММ' (МСК) → мс */
function tm_isoMs_(s) { return tm_dateMs_(s) + tm_hmMin_(String(s || '').slice(11, 16), 0) * 60000; }
function tm_minOf_(msk) { return msk.h * 60 + msk.m; }
function tm_holidays_() {
  var extra = String(tm_cfgGet_('holidays', '') || '').split(/[,\s;]+/).filter(Boolean);
  return TM_HOLIDAYS.concat(extra);
}
/** F4 C-B4: явный рабочий день (перенос: рабочая суббота, отмена праздника) — общий календарь au_settings.workday (лист общей таблицы автономности,
    Autonomy.gs). Явная рабочая дата главнее любого праздника (в т. ч. встроенного TM_HOLIDAYS) и выходного — так же, как au_isWorkday_/au_isHoliday. */
function tm_workdayForced_(d) {
  try {
    if (typeof au_mode_ === 'function' && !au_mode_()) return false;          // без MODE google общий модуль таблиц не читает — и мы не читаем
    if (typeof au_settings_ === 'function') { var S = au_settings_(); return !!(S && S.workday && S.workday[d]); }
    if (typeof au_isWorkday_ === 'function' && tm_wd_(d) >= 5) return !!au_isWorkday_(d);   // без доступа к листу: сб/вс, которые общий календарь считает рабочими, — только перенос
  } catch (e) { tm_log_('calendar', tm_err_(e)); }
  return false;
}
/** праздник ли день 'ГГГГ-ММ-ДД': один источник — au_isHoliday общего модуля (bot_rules.holidays + лист au_settings), если он в проекте;
    свой список TM_HOLIDAYS + tm_settings.holidays — дополняет его (проверка 2, 05.11: два списка не расходятся — достаточно заполнить au_settings).
    F4 C-B4: явный рабочий день (au_settings.workday) праздником не бывает. */
function tm_isHoliday_(s) {
  var d = String(s).slice(0, 10);
  if (tm_workdayForced_(d)) return false;
  if (typeof au_isHoliday === 'function') { try { if (au_isHoliday(tm_dateMs_(d) + 12 * 3600e3)) return true; } catch (e) { /* модуль недоступен — свой список */ } }
  return tm_holidays_().indexOf(d) >= 0;
}
/** рабочий день: явный рабочий (au_settings.workday) — да; иначе пн–пт и не праздник (au_isHoliday + TM_HOLIDAYS + лист tm_settings → holidays) */
function tm_workday_(s) { var d = String(s).slice(0, 10); if (tm_workdayForced_(d)) return true; return tm_wd_(d) < 5 && !tm_isHoliday_(d); }
function tm_nextWorkday_(s) { var d = s; for (var i = 0; i < 20 && !tm_workday_(d); i++) d = tm_addDays_(d, 1); return d; }
/** рабочих дней в (d0, d1] */
function tm_wdBetween_(d0, d1) { var n = 0, d = d0; while (d < d1) { d = tm_addDays_(d, 1); if (tm_workday_(d)) n++; } return n; }
/** тихие часы уведомлений сотрудникам (20:00–08:00 МСК, как на хостинге) и праздники — людям ничего не слать (владельцу — можно всегда).
    au_isQuiet общего модуля здесь НЕ используется: это другое окно (19:00–07:00 — только для вмешательств от имени Т. В. в группах, им пользуется ядро mx_quiet). */
function tm_quiet_(now) {
  var ms = now instanceof Date ? now.getTime() : (now || Date.now());
  var k = tm_msk_(ms);
  return k.h >= TM_QUIET_FROM || k.h < TM_QUIET_TO || tm_isHoliday_(k.date);
}
function tm_daysRu_(n) { n = Number(n) || 0; var a = n % 10, b = n % 100; return n + ' ' + (a === 1 && b !== 11 ? 'день' : a >= 2 && a <= 4 && !(b >= 12 && b <= 14) ? 'дня' : 'дней'); }
function tm_daysGen_(n) { n = Number(n) || 0; return n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'дня' : 'дней'); }

// REDACTED_B64_2 листы tm_*
function tm_sheet_(name) {
  var s = ss_(), sh = s.getSheetByName(name);
  if (!sh) { sh = s.insertSheet(name); sh.appendRow(TM_SHEETS[name] || ['k', 'v']); }
  return sh;
}
function tm_cell_(v) { return cell_(v); }
/** строка по ключу в первом столбце → {row, vals} | null */
function tm_findRow_(name, key) {
  var sh = tm_sheet_(name), n = Math.max(sh.getLastRow(), 1);
  var f = sh.getRange(1, 1, n, 1).createTextFinder(String(key)).matchEntireCell(true).findNext();
  if (!f || f.getRow() === 1) return null;
  var r = f.getRow(); return { row: r, vals: sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0] };
}

// REDACTED_B64_2 настройки (лист tm_settings: k, v, note)
/** значения по умолчанию — повторяют mx_poll_cfg.json, leaders.json, sales_ctl_cfg.json, mail_cmd.json хостинга; Т. В. правит лист */
var TM_DEFAULTS = [
  ['owner_uid', '', 'id владельца бота в MAX (иначе — свойство OWNER_UID или импорт config.json)'],
  ['bot_uid', '', 'id самого бота в MAX (сообщения бота не разбираются)'],
  ['kom_cid', TM_KOM_CID, 'chat_id группы «Коммерческий отдел» (иначе ищется по названию в листе groups)'],
  ['holidays', '', 'дополнительные нерабочие дни, через запятую: ГГГГ-ММ-ДД (производственный календарь; базовый список — в коде)'],
  ['remind_groups', 'all', 'напоминания о вопросах без ответа: all — все группы бота, kom — только «Коммерческий отдел»'],
  ['mail_on', '1', '1 — письма людям от 1c@ (ответ на itm@, копия itm@); 0 — писем нет, только записи dry в состоянии'],
  ['mail_cmd_from', 'user5@example.org, user2@example.org, user54@example.org', 'чьи письма на 1c@ — команды (push к Claude); подлинность — dkim/spf/dmarc pass'],
  ['mail_cmd_subjects', '^(?:(?:re|fw|fwd|отв)\\s*:\\s*)*Фабрика\\s*:\\s*(?:команда|голос|промт|документ|заявка)', 'темы писем-команд (регулярное выражение) — для всех из mail_cmd_from'],
  ['mail_cmd_any', 'user5@example.org, user2@example.org', 'чьи письма на 1c@ — команды с любой темой (кроме пересланных и отчётов), как было на хостинге'],
  ['poll', '', 'JSON: настройки опросов поверх встроенных (on, morning, morning_due, evening, evening_due, executors, ban, heads, …)'],
  ['leaders', '', 'JSON-список руководителей поверх встроенного (fio, mail[], names[], uids[], unique_surname)'],
  ['ctl_manual', '[]', 'JSON: свои контрольные точки [{id, what, due, who, uid, recur, done}] — как ctl_manual.json на хостинге'],
  ['export_jobs', '[]', 'JSON: выгрузки переписки групп [{id, g (регулярка по названию), from, to}] — каждая один раз'],
  ['sales', '', 'JSON: контроль sales@ поверх встроенного (on, hours, second, to, owner, digest_at)'],
  ['org', '', 'JSON: почта → [ФИО, должность, отдел] поверх встроенной оргструктуры'],
  ['staff_heads', '', 'JSON: отдел → [имя, почта] руководителей для вопросов проверки штата (поверх встроенного)']
];
/** все настройки листа → {k: v} (кэш 60 с в памяти запуска); строки умолчаний, которых в листе нет, дописываются — Т. В. видит, что править */
function tm_cfg_() {
  if (TM_MEM.cfg && Date.now() - TM_MEM.cfgT < 60000) return TM_MEM.cfg;
  var sh = tm_sheet_('tm_settings'), n = sh.getLastRow(), o = {}, has = {};
  if (n > 1) sh.getRange(2, 1, n - 1, 2).getValues().forEach(function (r) { if (r[0] !== '') { has[String(r[0])] = 1; o[String(r[0])] = r[1] == null ? '' : String(r[1]); } });
  TM_DEFAULTS.forEach(function (r) { if (!has[r[0]]) { sh.appendRow(r); if (!(r[0] in o)) o[r[0]] = r[1]; } });
  TM_MEM.cfg = o; TM_MEM.cfgT = Date.now();
  return o;
}
function tm_cfgGet_(k, def) { var o = tm_cfg_(), v = o[k]; return v == null || v === '' ? def : v; }
/** значение по умолчанию из TM_DEFAULTS (когда в листе ячейка стёрта) */
function tm_def_(k) { for (var i = 0; i < TM_DEFAULTS.length; i++) if (TM_DEFAULTS[i][0] === k) return TM_DEFAULTS[i][1]; return ''; }
/** JSON-настройка (объект или массив) → разобранное значение; пусто или ошибка → def */
function tm_cfgJson_(k, def) {
  var v = tm_cfgGet_(k, '');
  if (!v) return def;
  try { var j = JSON.parse(v); return j == null ? def : j; } catch (e) { tm_log_('cfg', 'настройка ' + k + ': не JSON'); return def; }
}
/** записать настройку (из импорта): создаёт строку или меняет значение */
function tm_cfgSet_(k, v, note) {
  var r = tm_findRow_('tm_settings', k), sh = tm_sheet_('tm_settings');
  if (r) sh.getRange(r.row, 2).setValue(tm_cell_(v)); else sh.appendRow([k, tm_cell_(v), note || '']);
  TM_MEM.cfg = null;
}
function tm_ownerUid_() {
  var v = tm_cfgGet_('owner_uid', '') || tm_props_().getProperty('OWNER_UID') || '';
  return String(v || '').trim();
}
function tm_botUid_() { return String(tm_cfgGet_('bot_uid', '') || '').trim(); }
function tm_bool_(v) { return v === true || v === 1 || String(v) === '1' || String(v).toLowerCase() === 'true'; }
/** группы бота из листа groups (Store.gs: cid, title, on, appr, channel): {cid: {title, on, appr, channel}} — память запуска.
    Ошибка чтения — пустой список (и не запоминается): fail-closed, в группы ничего не уходит. */
function tm_groups_() {
  if (TM_MEM.groups) return TM_MEM.groups;
  var out = {};
  try {
    var sh = sheet_('groups'), n = sh.getLastRow();
    if (n >= 2) sh.getRange(2, 1, n - 1, 5).getValues().forEach(function (r) {
      var cid = String(r[0] || ''); if (!cid) return;
      out[cid] = { title: String(r[1] || ''), on: tm_bool_(r[2]), appr: tm_bool_(r[3]), channel: tm_bool_(r[4]) };
    });
  } catch (e) { tm_log_('groups', tm_err_(e)); return out; }
  TM_MEM.groups = out; return out;
}
/** F4 C-A7: ЕДИНЫЙ предикат «можно слать в группу» (как mx_groupOn ядра: appr && on) — строка группы в листе groups есть, подтверждена (appr),
    включена (on) и не канал. Группа, удалённая из листа или неизвестная, — НЕ разрешена. Проверяется в tm_send_ (единственный выход в MAX) и в работах. */
function tm_chatOk_(cid) { var g = tm_groups_()[String(cid)]; return !!g && g.appr && g.on && !g.channel; }
/** chat_id «Коммерческого отдела»: настройка → лист groups по названию → встроенный */
function tm_komCid_() {
  var c = String(tm_cfgGet_('kom_cid', '') || '').trim(); if (c) return c;
  var G = tm_groups_(), k = Object.keys(G).filter(function (x) { return TM_KOM_RE.test(G[x].title); });
  return k.length ? k[0] : TM_KOM_CID;
}
function tm_groupTitle_(cid) { var G = tm_groups_(); return (G[cid] && G[cid].title) || (cid === TM_KOM_CID ? 'Коммерческий отдел' : 'группа ' + cid); }

// REDACTED_B64_2 руководители: бот вопросов не задаёт (leaders.json → встроенный список + лист)
var TM_LEADERS_DEF = [
  { fio: 'Сотрудник1 Сотрудник2 Отчество1', mail: ['user5@example.org', 'user4@example.org'], names: ['Сотрудник2 М', 'Сотрудник2 Сотрудник1', 'Сотрудник1 Сотрудник2', 'Сотрудник2 Отчество1'], unique_surname: false, owner: true },
  { fio: 'Сотрудник18 Сотрудник80 Отчество34', mail: ['user39@example.org'], names: ['Сотрудник80 Сотрудник18', 'Сотрудник18 Сотрудник80', 'Сотрудник80 Отчество34'], unique_surname: true },
  { fio: 'Сотрудник10 Сотрудник13 Отчество28', mail: ['user35@example.org'], names: ['Сотрудник13 Сотрудник10', 'Сотрудник10 Сотрудник13', 'Сотрудник13 Отчество28'], unique_surname: true },
  { fio: 'Сотрудник23 Сотрудник24 Отчество1', mail: ['user36@example.org'], names: ['Сотрудник24 Сотрудник23', 'Сотрудник23 Сотрудник24', 'Сотрудник24 Отчество1'], unique_surname: false },
  { fio: 'Сотрудник19 Сотрудник38 Отчество12', mail: ['user15@example.org'], names: ['Сотрудник19 Ю. А.', 'Сотрудник38 Сотрудник19', 'Сотрудник19 Сотрудник38'], unique_surname: true },
  { fio: 'Сотрудник16 Сотрудник21 Отчество11', mail: ['user16@example.org'], names: ['Сотрудник21 Сотрудник16', 'Сотрудник16 Сотрудник21', 'Сотрудник16 К. В.'], unique_surname: true },
  { fio: 'Сотрудник1 Сотрудник49 Отчество26', mail: ['user22@example.org'], names: ['Сотрудник1 А. А.', 'Сотрудник1 Сотрудник49', 'Сотрудник49 Сотрудник1'], unique_surname: false }
];
function tm_n_(s) { return String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/[^0-9a-zа-я]+/g, ' ').trim(); }
/** основа фамилии/имени для падежей: машинский → машинск, мирова → миров, тимур → тимур */
function tm_stem_(w) {
  w = tm_n_(w);
  if (/(ский|ская|цкий|цкая)$/.test(w)) return w.slice(0, -2);
  if (/(ова|ева|ина)$/.test(w)) return w.slice(0, -1);
  if (w.length > 5 && /[аяйь]$/.test(w)) return w.slice(0, -1);
  return w;
}
var TM_LEADERS_CACHE = null;
function tm_leaders_() {
  if (TM_LEADERS_CACHE) return TM_LEADERS_CACHE;
  var raw = tm_cfgJson_('leaders', null);
  var list = (Array.isArray(raw) && raw.length ? raw : TM_LEADERS_DEF).map(function (x) {
    var parts = tm_n_(x.fio).split(' ').filter(Boolean); if (parts.length < 2) return null;
    var sur = parts[0], first = parts[1], pat = parts[2] || '';
    return { fio: x.fio || '', sur: tm_stem_(sur), sur0: sur[0], first: first, first_st: tm_stem_(first), pat: pat, pat_st: tm_stem_(pat),
             mail: (x.mail || []).map(function (m) { return String(m).trim().toLowerCase(); }), uids: (x.uids || []).map(String),
             names: (x.names || []).map(tm_n_), unique: !!x.unique_surname, owner: !!x.owner };
  }).filter(Boolean);
  TM_LEADERS_CACHE = list; return list;
}
function tm_nameHit_(p, toks) {
  if (p.names.indexOf(toks.join(' ')) >= 0) return true;
  var words = toks.filter(function (t) { return t.length > 1; }), inits = toks.filter(function (t) { return t.length === 1; });
  var isSur = function (w) { return w.indexOf(p.sur) === 0; }, isFirst = function (w) { return w.indexOf(p.first_st) === 0; }, isPat = function (w) { return !!p.pat && w.indexOf(p.pat_st) === 0; };
  var hasSur = words.some(isSur), hasFirst = words.some(isFirst), hasPat = words.some(isPat);
  var other = words.filter(function (w) { return !(isSur(w) || isFirst(w) || isPat(w)); });
  if (hasSur) {
    if (hasFirst) return true;
    if (inits.length) return inits[0] === p.first[0] && (inits.length < 2 || !p.pat || inits[1] === p.pat[0]);
    if (other.length) return false;
    return p.unique;
  }
  if (hasFirst && hasPat && !other.length) return true;                 // «Сотрудник2 Отчество1»
  if (hasFirst && inits.length && !other.length) return inits[0] === p.sur0;   // «Сотрудник2 М», «Сотрудник24 Р.»
  return false;
}
/** → ФИО руководителя ('' — не руководство) по имени в MAX, id или почте; владелец бота — тоже руководство.
    au_isLeader общего модуля (если есть) — дополняет: его «да» тоже считается. */
function tm_isLeader_(name, uid, mail) {
  var u = uid == null ? '' : String(uid), own = tm_ownerUid_();
  var P = tm_leaders_();
  if (u && own && u === own) { var o = P.filter(function (p) { return p.owner; })[0]; return o ? o.fio : 'владелец'; }
  var ml = String(mail || '').trim().toLowerCase(), toks = name ? tm_n_(name).split(' ').filter(Boolean) : [];
  for (var i = 0; i < P.length; i++) {
    var p = P[i];
    if (u && p.uids.indexOf(u) >= 0) return p.fio;
    if (ml && p.mail.indexOf(ml) >= 0) return p.fio;
    if (toks.length && tm_nameHit_(p, toks)) return p.fio;
  }
  if (typeof au_isLeader === 'function') {
    try { if ((name && au_isLeader(name)) || (u && au_isLeader(u))) return 'руководство'; } catch (e) { tm_log_('leader', tm_err_(e)); }
  }
  return '';
}
/** все почты руководства (нижний регистр) — убрать из получателей напоминаний */
function tm_leaderMails_() { var s = {}; tm_leaders_().forEach(function (p) { p.mail.forEach(function (m) { s[m] = 1; }); }); return s; }

// REDACTED_B64_2 состояние: JSON-файлы Диска «Фабрика — боты/MAX/tm» (Store.gs)
/** файл читается с Диска один раз за запуск (память TM_MEM.files); записанное тем же запуском — уже в памяти */
function tm_load_(name, def) {
  if (Object.prototype.hasOwnProperty.call(TM_MEM.files, name)) return TM_MEM.files[name] == null ? def : TM_MEM.files[name];
  var v = jget_(TM_SUB, name, null); if (v == null) return def;
  TM_MEM.files[name] = v; return v;
}
/** → true/false (F4 C-A6: итог записи передаётся вызывающему — водяные знаки двигаются только после подтверждённой записи) */
function tm_save_(name, obj) { TM_MEM.files[name] = obj; var ok = !!jput_(TM_SUB, name, obj); if (!ok) tm_log_('state', 'файл ' + name + ' не записан'); return ok; }
function tm_memReset_() { TM_MEM.files = {}; TM_MEM.cfg = null; TM_MEM.triggers = null; TM_MEM.groups = null; }

// REDACTED_B64_2 отметки «отправлено» (лист tm_sent) — идемпотентность
/** уже отправлялось? */
function tm_sentHas_(id) { return !!tm_findRow_('tm_sent', id); }
function tm_sentMark_(id, kind, to, mid, job) {
  try { tm_sheet_('tm_sent').appendRow([tm_cell_(id), new Date(), tm_cell_(kind), tm_cell_(to), tm_cell_(mid || ''), tm_cell_(job || '')]); }
  catch (e) { tm_log_('sent', 'отметка ' + id + ' не записана: ' + tm_err_(e)); }
}
/** работа с ключом периода (день/неделя) уже выполнена? лист tm_runs: job, key */
/** 10.11.2026: Таблицы превращают ключ «2026-11-10» / «2026-11-10 12:01» в дату — сравниваем в обоих видах (иначе «раз в день» не работал: техтревога каждые 10 мин съела квоту писем). */
function tm_runKeyEq_(v, key) {
  key = String(key);
  if (v instanceof Date) {
    var tz = Session.getScriptTimeZone();
    return Utilities.formatDate(v, tz, 'yyyy-MM-dd') === key || Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm') === key;
  }
  return String(v) === key;
}
function tm_runDone_(job, key) { var r = tm_findRow_('tm_runs', job); return !!r && tm_runKeyEq_(r.vals[1], key); }
function tm_runMark_(job, key, res) {
  try {
    var sh = tm_sheet_('tm_runs'), r = tm_findRow_('tm_runs', job), row = [tm_cell_(job), tm_cell_(key), new Date(), tm_cell_(String(res == null ? '' : res).slice(0, 300))];
    var rn = r ? r.row : sh.getLastRow() + 1;
    sh.getRange(rn, 2).setNumberFormat('@');                                  // ключ — текстом, чтобы Таблицы не делали из него дату
    sh.getRange(rn, 1, 1, 4).setValues([row]);
  } catch (e) { tm_log_('runs', 'отметка ' + job + ': ' + tm_err_(e)); }
}

// REDACTED_B64_2 выход в MAX: ОДИН тонкий слой над ядром шага 2
function tm_global_() { return this; }                                   // глобальный объект проекта (функции ядра ищутся по имени)
function tm_core_(kind) { var fn = TM_CORE[kind] ? tm_global_()[TM_CORE[kind]] : null; return typeof fn === 'function' ? fn : null; }
/** kind: 'chat' {cid, text, html?, reply?} · 'user' {uid, text, html?} · 'delete' {mid} · 'members' {cid} · 'queue' {limit?}.
    → {ok, mid?, code?, err?, members?, n?}. Нет ядра — {ok:false, stub:true}: ничего не уходит, отметка «отправлено» не ставится.
    Текст — не длиннее 3990 знаков (лимит MAX). Тихие часы и праздники проверяет вызывающий (tm_quiet_), владельцу — можно всегда. */
function tm_send_(kind, payload) {
  var p = payload || {};
  var g0 = kind === 'chat' ? tm_groups_()[String(p.cid)] : null;                // 13.11 (Т. В.: «бот должен везде брать на контроль, где его отметили, во всех группах»):
  if (kind === 'chat' && !tm_chatOk_(p.cid) && !(p.ctl && g0 && !g0.channel)) return { ok: false, perm: true, err: 'группа ' + p.cid + ' выключена или её нет в листе groups — не шлём' };   // F4 C-A7; отметка бота — явное обращение
  var fn = tm_core_(kind);
  if (!fn) return { ok: false, stub: true, err: 'нет функции ядра ' + (TM_CORE[kind] || kind) };
  var text = String(p.text || '').slice(0, 3990), r;
  try {
    if (kind === 'chat') r = fn(String(p.cid), text, { html: !!p.html, reply: p.reply ? String(p.reply) : '' });
    else if (kind === 'user') r = fn(String(p.uid), text, { html: !!p.html });
    else if (kind === 'delete') r = fn(String(p.mid));
    else if (kind === 'members') r = fn(String(p.cid));
    else r = fn(Number(p.limit) || 20, Number(p.budget) || undefined);   // F4 C-B3: бюджет минутной работы ядра (mx_tmQueue(limit, budgetMs) — запрос F1; старое ядро второй аргумент не читает)
  } catch (e) { return { ok: false, err: tm_err_(e) }; }
  if (r == null) return { ok: false, err: 'ядро ничего не вернуло' };
  if (typeof r !== 'object') return { ok: !!r };
  if (kind === 'members') { var n = Object.keys(r.members || {}).length; return { ok: !!r.ok && n > 0, members: r.members || {}, n: n, err: r.err || (n ? '' : 'список участников пуст') }; }
  var out = { ok: !!r.ok, err: String(r.err || '') };
  if (r.mid != null) out.mid = String(r.mid); if (r.code != null) out.code = Number(r.code) || 0; if (r.n != null) out.n = Number(r.n) || 0;
  return out;
}
/** отправка с отметкой: id — ключ идемпотентности. → {ok, mid, dup}. F4 C-B2: повтор возвращает СОХРАНЁННЫЙ mid (лист tm_sent) — если сообщение ушло,
    а состояние (poll/ctl) не записалось, следующий тик восстанавливает связь reply по этому mid. */
function tm_sendOnce_(id, kind, payload, job) {
  var was = tm_findRow_('tm_sent', id);
  if (was) return { ok: true, dup: true, mid: String(was.vals[4] == null ? '' : was.vals[4]) };
  var r = tm_send_(kind, payload);
  if (r.ok) tm_sentMark_(id, kind, kind === 'user' ? 'user' : String(payload.cid || ''), r.mid || '', job);   // адресаты в лист не пишем — только тип
  return r;
}
/** HTML-экранирование для format=html */
function tm_h_(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
/** маскирование телефонов, почт и IP в текстах для файлов портала и журнала */
function tm_mask_(x) {
  x = String(x == null ? '' : x).replace(/(?<![\d.])\d{1,3}(\.\d{1,3}){3}(?![\d.])/g, '[IP]');
  x = x.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[адрес]');
  return x.replace(/(\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g, '[тел.]');
}
function tm_phoneMask_(x) { return String(x == null ? '' : x).replace(/(\+7|(?<!\d)8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/g, '[тел.]'); }
function tm_sha12_(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.newBlob(String(s)).getBytes()).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 12); }

// REDACTED_B64_2 публикация для портала: «От ботов» (bf_seal + bf_write общего модуля KbFind.gs)
/** какой ключ T14B1 для файла — как publish() в live.py: файлы владельца — k_owner ('owner'), остальные — ключ сайта k_live версии live_ver */
function tm_keyFor_(name) {
  if (TM_OWNER_BIN_RE.test(String(name))) return 'owner';
  var v = Number(tm_props_().getProperty('live_ver') || 1) || 1;
  return v <= 1 ? 'live1' : 'live:' + v;
}
/** объект → файл name в «От ботов», запечатан нужным ключом. Нет модуля или ключа — файл не записывается (владельцу — техтревога раз в день),
    как на хостинге (аудит P13: файлы владельца ключом сайта не публикуются). → true/false */
function tm_publish_(name, obj) {
  if (typeof bf_write !== 'function' || typeof bf_seal !== 'function') { tm_log_('publish', name + ': нет bf_seal/bf_write (общий модуль KbFind.gs)'); return false; }
  var which = tm_keyFor_(name), packed;
  try { packed = bf_seal(JSON.stringify(obj), which); }
  catch (e) {
    tm_log_('publish', name + ': ключ ' + which + ' — ' + tm_err_(e));
    tm_alert_('key:' + which, 'Бот MAX (Google) не может записать для портала файл ' + name + ': нет ключа ' + which + ' (свойства скрипта BOT_KEY / K_CMD / live_ver). Файлы владельца ключом сайта не публикуются.');
    return false;
  }
  try { return !!bf_write(name, packed); } catch (e2) { tm_log_('publish', name + ': ' + tm_err_(e2)); return false; }
}
/** техтревога владельцу — письмо от 1c@ на itm@, не чаще раза в день на ключ (лист tm_runs 'alert:<ключ>'); можно в тихие часы */
function tm_alert_(key, text) {
  var day = tm_msk_(Date.now()).date;
  if (tm_runDone_('alert:' + key, day)) return false;
  tm_runMark_('alert:' + key, day, String(text).slice(0, 120));
  var r = tm_mail_([TM_ALERT_TO], [], 'Фабрика — бот MAX: техтревога (' + key + ')', String(text) + '\n\nВремя МСК: ' + tm_msk_(Date.now()).iso.replace('T', ' ') + '. Письмо приходит не чаще раза в день по этой причине.\n— бот «Фабрикант» (таймеры MAX)', true);
  tm_log_('alert', key + ': ' + r);
  return r === 'ok';
}
/** файл из «Для ботов» как JSON (bf_json шага 5) — ko_staff.json, unans_org.json, recl.bin; нет модуля или файла → def */
function tm_bots_(name, def) {
  if (typeof bf_json !== 'function') return def;
  try { var v = bf_json(name); return v == null ? def : v; } catch (e) { return def; }
}

// REDACTED_B64_2 почта от 1c@ (контракт Р3: ответ — на itm@, копия itm@)
var TM_MAIL_DOMAINS = ['fabrikant.su', 'fabrikant.pro', 'techfabrikant.ru'];                  // письма бота — только своим адресам (контракт Р3 / бриф проверки, п. 13)
var TM_MAIL_BAN = ['user28@example.org', 'user29@example.org', 'user55@example.org'];       // Сотрудник51 (ПДО), Сотрудник52 (ПТО) и общий ящик ПТО: писем и напоминаний не писать (RULES 27.10) — на любом пути
/** адрес годится для письма от бота: свой домен и не из запрета */
function tm_mailOk_(a) { var d = String(a || '').split('@').pop(); return TM_MAIL_DOMAINS.indexOf(d) >= 0 && TM_MAIL_BAN.indexOf(String(a)) < 0; }
/** письмо людям: только при mail_on=1 и не в тихие часы (владельцу — всегда); адресаты — только свои домены, без запрещённых. → 'ok' | 'dry' | 'quiet' | 'quota' | 'err: …' */
function tm_mail_(to, cc, subject, text, ownerOnly) {
  to = (Array.isArray(to) ? to : [to]).map(function (a) { return String(a || '').trim().toLowerCase(); }).filter(Boolean);
  cc = (Array.isArray(cc) ? cc : (cc ? [cc] : [])).map(function (a) { return String(a || '').trim().toLowerCase(); }).filter(Boolean);
  var bad = to.concat(cc).filter(function (a) { return !tm_mailOk_(a); });
  if (bad.length) { tm_log_('mail', 'адресаты убраны (чужой домен или запрет): ' + bad.length); to = to.filter(tm_mailOk_); cc = cc.filter(tm_mailOk_); }
  if (!to.length) return 'err: нет адресата';
  if (String(tm_cfgGet_('mail_on', '1')) !== '1') return 'dry';
  if (!ownerOnly && tm_quiet_(Date.now())) return 'quiet';
  if (to.indexOf(TM_ITM) < 0 && cc.indexOf(TM_ITM) < 0) cc.push(TM_ITM);                 // с 1c@ — копия itm@
  cc = cc.filter(function (a) { return to.indexOf(a) < 0; });
  try {
    if (MailApp.getRemainingDailyQuota() < 5) { tm_log_('mail', 'квота писем исчерпана'); return 'quota'; }
    var o = { to: to.join(','), replyTo: TM_ITM, name: 'Фабрикант — бот', subject: String(subject).slice(0, 200), body: String(text) };
    if (cc.length) o.cc = cc.join(',');
    MailApp.sendEmail(o);
    return 'ok';
  } catch (e) { tm_log_('mail', tm_err_(e)); return 'err: ' + tm_err_(e); }
}

// REDACTED_B64_2 сообщения групп из очереди max_in (Store.gs) → история tm/hist_<cid>.json
/** событие MAX message_created → нормализованное сообщение (как norm_msg в mx_ctl.py) | null */
function tm_normMsg_(u) {
  var m = u && u.message; if (!m) return null;
  var s = m.sender || {}, b = m.body || {}, lk = m.link || {}, rc = m.recipient || {};
  var cid = String(rc.chat_id || ''); if (!cid || String(rc.chat_type || '') === 'dialog') return null;
  var name = String(s.name || ((s.first_name || '') + ' ' + (s.last_name || '')).trim() || 'без имени');
  var out = { ts: Number(m.timestamp || u.timestamp || 0), mid: String(b.mid || ''), uid: s.user_id == null ? null : String(s.user_id), name: name.slice(0, 80),
              bot: !!s.is_bot, text: tm_phoneMask_(String(b.text || '')).slice(0, 4000), cid: cid, rmid: '', mentions: [] };
  (b.markup || []).forEach(function (x) { if (x && x.type === 'user_mention' && x.user_id) out.mentions.push(String(x.user_id)); });
  if (lk.type === 'reply') {
    out.rmid = String((lk.message || {}).mid || '');
    var rs = lk.sender || {};
    if (rs.user_id) { out.ruid = String(rs.user_id); out.rname = String(rs.name || ((rs.first_name || '') + ' ' + (rs.last_name || '')).trim() || '').slice(0, 80); }
  }
  if (lk.type === 'forward') {
    var fs = lk.sender || {};
    out.fwd = { from: String(fs.name || ((fs.first_name || '') + ' ' + (fs.last_name || '')).trim() || '').slice(0, 80), chat: lk.chat_id || null,
                text: tm_phoneMask_(String(((lk.message || {}).text) || '')).slice(0, 500) };
  }
  var att = b.attachments || [];
  if (att.length) out.att = att.map(function (a) { return String((a || {}).type || ''); }).slice(0, 10);
  return out;
}
function tm_cellMs_(v) { return v instanceof Date ? v.getTime() : (Number(new Date(v)) || 0); }
var TM_INGEST_PAGE = 400;                                                // строк max_in за одно чтение тел
/** тело события из ячейки body — через st_inBody (Store.gs, F1 A4: тело длиннее ячейки лежит на Диске, в ячейке 'file:<key>'); без st_inBody — как есть.
    → строка | null (файла тела нет — строка пропускается, как обрезанное тело раньше) */
function tm_inBody_(v) {
  var s = String(v == null ? '' : v);
  if (typeof st_inBody === 'function') { try { var b = st_inBody(s); return b == null ? null : String(b); } catch (e) { return null; } }
  return s;
}
/** F4 C-A6: строки очереди max_in с времени sinceMs (столбец t) — последовательным курсором, а не «последние 1000 строк»: столбец t читается
    целиком одним блоком (лист обрезается ядром), тела — страницами по TM_INGEST_PAGE строк от первой подходящей строки; budgetMs — предел чтения.
    → {msgs:[сообщение], lastT: t последней ПРОЧИТАННОЙ строки, firstT: t самой старой строки листа, more: дочитать в следующий раз, err}. */
function tm_queueMsgs_(sinceMs, budgetMs) {
  var out = { msgs: [], lastT: 0, firstT: 0, more: false, rows: 0 }, t0 = Date.now();
  try {
    var sh = sheet_('max_in'), n = sh.getLastRow(); if (n < 2) return out;
    var hdr = sh.getRange(1, 1, 1, Math.max(8, sh.getLastColumn())).getValues()[0].map(String);
    var cT = (hdr.indexOf('t') + 1) || 2, cType = (hdr.indexOf('type') + 1) || 3, cBody = (hdr.indexOf('body') + 1) || 8, w = Math.max(cT, cType, cBody);
    var T = sh.getRange(2, cT, n - 1, 1).getValues(), first = -1;
    out.firstT = tm_cellMs_(T[0][0]);
    for (var i = 0; i < T.length; i++) { if (tm_cellMs_(T[i][0]) >= sinceMs) { first = i; break; } }
    if (first < 0) return out;
    for (var a = first; a < T.length; a += TM_INGEST_PAGE) {
      if (budgetMs && a > first && Date.now() - t0 > budgetMs) { out.more = true; break; }
      var k = Math.min(TM_INGEST_PAGE, T.length - a), V = sh.getRange(2 + a, 1, k, w).getValues();
      V.forEach(function (r) {
        var t = tm_cellMs_(r[cT - 1]); if (t > out.lastT) out.lastT = t;
        if (t < sinceMs || String(r[cType - 1]) !== 'message_created') return;
        var u, b = tm_inBody_(r[cBody - 1]); if (b == null) return;
        try { u = JSON.parse(b); } catch (e) { return; }                     // обрезанное тело (лимит ячейки) — пропускаем
        var m = tm_normMsg_(u); if (m && m.mid && m.ts > 0) { m.qt = t; out.msgs.push(m); }
      });
      out.rows += k;
    }
  } catch (e) { out.err = tm_err_(e); tm_log_('queue', out.err); }
  out.msgs.sort(function (a, b) { return a.ts - b.ts; });
  return out;
}
function tm_histName_(cid) { return 'hist_' + String(cid).replace(/[^\w-]/g, '_') + '.json'; }
/** история группы (60 дней): {title, msgs: {mid: m}, t} */
function tm_hist_(cid) { var H = tm_load_(tm_histName_(cid), null); if (!H || typeof H.msgs !== 'object') H = { title: '', msgs: {} }; return H; }
function tm_histList_(H) { return Object.keys(H.msgs).map(function (k) { return H.msgs[k]; }).sort(function (a, b) { return a.ts - b.ts; }); }
/** новое из очереди → в истории групп; → {new, groups:[cid]} . Состояние — tm/in.json {last_t}.
    F4 C-A6: курсор last_t = время последней ПРОЧИТАННОЙ строки очереди и сдвигается только после подтверждённой записи всех изменённых историй;
    не записалась хоть одна — курсор стоит (повтор дописывает без дублей: ключ — mid). Разрыв (строки после курсора уже обрезаны) — техтревога.
    История собирается по всем группам (кроме каналов) — решение о ОТПРАВКЕ проверяет tm_chatOk_ (C-A7). */
function tm_ingest_(ctx) {
  var st = tm_load_('in.json', { last_t: 0 }), last = Number(st.last_t) || 0;
  var since = last ? Math.max(0, last - 15 * 60000) : Date.now() - 36 * 3600e3;   // первый запуск: полтора дня из очереди
  var q = tm_queueMsgs_(since, Math.max(5000, ctx.left() - 90000));
  if (q.err) return { err: 'очередь не прочитана: ' + q.err };
  var res = { 'new': 0, groups: [], rows: q.rows };
  if (last && q.firstT && q.firstT > last + 60000) { res.gap = true; tm_alert_('hist_gap', 'История групп для таймеров: строки очереди max_in после ' + tm_msk_(last).iso.replace('T', ' ') + ' МСК уже обрезаны до того, как их прочитали (разрыв). Напоминания и контроль сроков по сообщениям из разрыва не сработают.'); }
  var byCid = {};
  q.msgs.forEach(function (m) { (byCid[m.cid] = byCid[m.cid] || []).push(m); });
  var lo = Date.now() - TM_HIST_DAYS * 864e5, G = tm_groups_(), bad = [];
  Object.keys(byCid).forEach(function (cid) {
    if (G[cid] && G[cid].channel) return;                                  // каналы — не группы
    var H = tm_hist_(cid), n = 0;
    byCid[cid].forEach(function (m) { if (!H.msgs[m.mid]) { var c = JSON.parse(JSON.stringify(m)); delete c.qt; H.msgs[m.mid] = c; n++; } });
    Object.keys(H.msgs).forEach(function (k) { if (H.msgs[k].ts < lo) delete H.msgs[k]; });
    H.title = (G[cid] && G[cid].title) || H.title || tm_groupTitle_(cid); H.t = ctx.msk.iso;
    if (n) { if (tm_save_(tm_histName_(cid), H)) { res['new'] += n; res.groups.push(cid); } else bad.push(cid); }
  });
  if (bad.length) { res.err = 'история не записана (' + bad.join(', ') + ') — курсор не сдвинут'; return res; }
  if (q.lastT > last) st.last_t = q.lastT;
  st.t = ctx.msk.iso; if (q.more) st.more = ctx.msk.iso; else delete st.more;
  if (!tm_save_('in.json', st)) res.err = 'курсор in.json не записан';
  if (q.more) res.more = true;
  return res;
}
/** 13.11: все группы с историей (кроме каналов) — для постановки на контроль отметкой бота и в выключенных группах */
function tm_histGroupsAll_() {
  var out = [], G = tm_groups_();
  try {
    var it = maxDir_(TM_SUB).getFiles();
    while (it.hasNext()) { var m = /^hist_(.+)\.json$/.exec(it.next().getName()); if (m && G[m[1]] && !G[m[1]].channel) out.push(m[1]); }
  } catch (e) { tm_log_('hist', tm_err_(e)); }
  return out;
}
/** группы, по которым есть история (файлы hist_*.json), — только разрешённые для отправки (tm_chatOk_: appr && on, не канал, строка в листе есть; F4 C-A7) */
function tm_histGroups_() {
  var out = [];
  try {
    var it = maxDir_(TM_SUB).getFiles();
    while (it.hasNext()) {
      var f = it.next(), m = /^hist_(.+)\.json$/.exec(f.getName()); if (!m) continue;
      var cid = m[1];                                                      // chat_id MAX — отрицательное число, в имени файла как есть
      if (!tm_chatOk_(cid)) continue;
      out.push(cid);
    }
  } catch (e) { tm_log_('hist', tm_err_(e)); }
  return out;
}

// REDACTED_B64_2 диспетчер
/** контекст запуска: время МСК, бюджет, итоги */
function tm_ctx_(scope) {
  tm_memReset_();
  var now = new Date(), msk = tm_msk_(now), t0 = Date.now();
  return { scope: scope, now: now, msk: msk, today: msk.date, workday: tm_workday_(msk.date), quiet: tm_quiet_(now), t0: t0,
           left: function () { return TM_BUDGET[scope] - (Date.now() - t0); }, res: {} };
}
/** флаг «идёт запуск» (CacheService, 6 мин) под коротким замком скрипта — тики не накладываются, а doPost не ждёт */
function tm_begin_(scope) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return false;
  try {
    var ca = CacheService.getScriptCache(), k = 'tm_run_' + scope;
    if (ca.get(k)) return false;
    ca.put(k, String(Date.now()), 360); return true;
  } finally { lock.releaseLock(); }
}
function tm_end_(scope) { try { CacheService.getScriptCache().remove('tm_run_' + scope); } catch (e) {} }
/** одна работа: ошибка не роняет остальные (в журнал); три ошибки подряд (счётчик в CacheService) — техтревога владельцу раз в день */
function tm_job_(ctx, name, fn) {
  var started = Date.now();
  if (ctx.left() < 15000) {
    ctx.res[name] = 'нет времени';
    try { console.log(JSON.stringify({ event: 'tm_job_ms', scope: ctx.scope, job: name, ms: Date.now() - started, skipped: 'budget' })); } catch (profileError) {}
    return;
  }
  var ca = null; try { ca = CacheService.getScriptCache(); } catch (e0) { ca = null; }
  var ck = 'tm_err_' + name;
  try { var r = fn(ctx); ctx.res[name] = r == null ? 'ok' : r; if (ca) ca.remove(ck); }
  catch (e) {
    var msg = tm_err_(e); ctx.res[name] = 'ошибка: ' + msg; tm_log_(name, msg);
    if (!ca) return;
    var n = (Number(ca.get(ck)) || 0) + 1; ca.put(ck, String(n), 21600);
    if (n === 3) tm_alert_('job:' + name, 'Работа таймера «' + name + '» падает третий раз подряд: ' + msg + '. Подробности — лист log служебной таблицы.');
  } finally {
    try { console.log(JSON.stringify({ event: 'tm_job_ms', scope: ctx.scope, job: name, ms: Date.now() - started })); } catch (profileError) {}
  }
}
/** работа раз в день в окне [from, to) минут МСК; key — день */
function tm_daily_(ctx, name, from, to, fn, workdaysOnly) {
  var m = tm_minOf_(ctx.msk);
  if (m < from || m >= to) return;
  if (workdaysOnly && !ctx.workday) return;
  if (tm_runDone_(name, ctx.today)) return;
  tm_job_(ctx, name, function (c) { var r = fn(c); tm_runMark_(name, c.today, JSON.stringify(r == null ? 'ok' : r)); return r; });
}
/** работа не чаще, чем раз в everyMin минут (ключ — отметка времени в tm_runs) */
function tm_every_(ctx, name, everyMin, fn) {
  var r = tm_findRow_('tm_runs', name), last = r && r.vals[2] instanceof Date ? r.vals[2].getTime() : (r ? Number(new Date(r.vals[2])) || 0 : 0);
  if (last && Date.now() - last < everyMin * 60000 - 20000) return;
  tm_job_(ctx, name, function (c) { var out = fn(c); tm_runMark_(name, c.msk.iso, JSON.stringify(out == null ? 'ok' : out)); return out; });
}

/** есть ли у ядра свой минутный триггер mx_queueTick (mx_setupTriggers шага 2) — тогда минутную работу ядра делает он, иначе — mx_tmQueue отсюда; память запуска + кэш 10 мин */
function tm_coreTrigger_() {
  if (TM_MEM.triggers !== null) return TM_MEM.triggers;
  var ca = null, v = null;
  try { ca = CacheService.getScriptCache(); v = ca.get('tm_core_trg'); } catch (e0) { ca = null; }
  if (v === null || v === undefined) {
    try { v = ScriptApp.getProjectTriggers().some(function (t) { return String(t.getHandlerFunction()) === 'mx_queueTick'; }) ? '1' : '0'; }
    catch (e) { v = '0'; }
    if (ca) { try { ca.put('tm_core_trg', v, 600); } catch (e1) {} }
  }
  TM_MEM.triggers = v === '1'; return TM_MEM.triggers;
}
/** F4 C-B3: доля общего бюджета запуска для одной работы — не больше cap и с запасом reserve мс следующим работам (не меньше 1 с) */
function tm_slice_(ctx, cap, reserve) { return Math.max(1000, Math.min(cap, ctx.left() - (reserve || 0))); }
/** ТРИГГЕР каждую минуту. F4 C-B3: общий deadline 90 с и порядок по важности — сначала короткие работы со сроком (опрос в окне 09:00 / 16:55,
    письма-команды на 1c@ → cp_push), затем минутная работа ядра mx_tmQueue (если у ядра нет своего триггера) и cp_flush (ClaudePush) — каждой
    передаётся остаток бюджета с запасом, затем доставка недоставленных уведомлений таймеров (Outbox). Не в режиме google — сразу выход. */
function tm_tickMinute() {
  if (rcot_timersPaused_()) return;
  if (!tm_on_()) return;
  var mm0_ = tm_minOf_(tm_msk_(new Date())); if (tm_offHours_() ? mm0_ % 5 !== 0 : mm0_ % 2 !== 0) return;   // 10.11: тихие часы/выходные — раз в 5 мин; днём — раз в 2 мин (квота 6 ч/сутки, слово Т. В. «чтобы не было никаких квот Google»)
  if (!tm_begin_('minute')) return;
  var ctx = tm_ctx_('minute');
  try {
    tm_job_(ctx, 'http_ingress', lmhi_timerJob_);
    tm_job_(ctx, 'poll_send', tm_pollSend_);
    tm_job_(ctx, 'mail_cmd', tm_mailCmd_);
    tm_job_(ctx, 'queue', function (c) {
      if (tm_coreTrigger_()) return 'очередь — триггер ядра';
      var r = tm_send_('queue', { limit: 20, budget: tm_slice_(c, 40000, 15000) }); return r.stub ? 'нет ядра' : (r.ok ? r.n || 0 : r.err);
    });
    tm_job_(ctx, 'push', function (c) { return typeof cp_flush === 'function' ? cp_flush(tm_slice_(c, 30000, 12000)) : 'нет cp_flush'; });   // cp_flush(budgetMs) — запрос F3
    tm_job_(ctx, 'outbox', tm_obRun_);
  } finally { tm_meter_(ctx); tm_end_('minute'); }
}
/** ТРИГГЕР каждые 5 минут: новые сообщения групп → история; ответы на опросы и напоминания; сроки; вопросы без ответа; sales@;
    итоги опросов владельцу; рекламации 08:30; штат по понедельникам; выгрузки; ночью (01:30–02:30) — обещания и ротация листов. */
function tm_tick() {
  if (rcot_timersPaused_()) return;
  if (!tm_on_()) return;
  var mm_ = tm_minOf_(tm_msk_(new Date()));                                 // 10.11 (квота): днём — раз в 10 мин, в тихие часы, выходные и праздники — раз в 30 мин
  if (tm_offHours_() ? mm_ % 30 >= 5 : mm_ % 10 >= 5) return;
  if (!tm_begin_('five')) return;
  var ctx = tm_ctx_('five');
  try {
    tm_job_(ctx, 'ingest', tm_ingest_);
    tm_job_(ctx, 'poll', tm_poll_);                                          // раньше ctl: список участников группы (poll.json) нужен адресатам поручений
    tm_job_(ctx, 'ctl', tm_ctl_);
    tm_every_(ctx, 'remind', 30, tm_remind_);                                // 10.11: раз в 30 мин (было каждые 10 мин по ~40 с — квота триггеров)
    tm_every_(ctx, 'unans', 55, tm_unans_);
    tm_every_(ctx, 'sales', 25, tm_salesCtl_);
    tm_every_(ctx, 'survey', 15, tm_survey_);
    tm_daily_(ctx, 'recl', 8 * 60 + 30, 9 * 60 + 30, tm_reclWatch_, true);
    tm_job_(ctx, 'staff', tm_staffWatch_);
    tm_job_(ctx, 'export', tm_export_);
    tm_daily_(ctx, 'nightly', 90, 150, tm_nightly_);
  } finally { tm_meter_(ctx); tm_end_('five'); }
}
/** 10.11.2026 (Т. В.: «исправь ты»): квота времени триггеров (6 ч в сутки на 1c@ вместе с Telegram-проектом) — 09–10.11 прогноз 10,8–11,6 ч.
    Меры (триггеры не пересоздаются, tm_tick по-прежнему каждые 5 мин): днём tm_tick работает раз в 10 мин (запуски в первые 5 минут десятка),
    в тихие часы (20:00–08:00 МСК), выходные и праздники — раз в 30 мин (первые 5 минут получаса; ночная работа 01:30–02:30 попадает), tm_tickMinute — раз в 5 мин.
    Людям в эти часы бот и так ничего не шлёт (tm_quiet_), а ответы на команды и письма-команды задерживаются не больше чем на 5 мин. */
function tm_offHours_() { var now = new Date(); return tm_quiet_(now) || !tm_workday_(tm_msk_(now).date); }
/** F4 C-B3: учёт времени триггеров MAX за сутки МСК (кэш скрипта; пятиминутный тик переносит итог в лист tm_runs, строка quota) и техтревога, если
    прогноз на сутки выше TM_QUOTA_DAY_MS (квота Workspace — 6 ч на аккаунт 1c@ для ВСЕХ его проектов, Telegram-проект — из того же лимита). */
function tm_meter_(ctx) {
  try {
    var ca = CacheService.getScriptCache(), k = 'tm_q_' + ctx.today, v = {};
    try { v = JSON.parse(ca.get(k) || '{}') || {}; } catch (e0) { v = {}; }
    v[ctx.scope] = (Number(v[ctx.scope]) || 0) + (Date.now() - ctx.t0); v['n_' + ctx.scope] = (Number(v['n_' + ctx.scope]) || 0) + 1;
    ca.put(k, JSON.stringify(v), 21600);
    if (ctx.scope !== 'five') return;
    tm_runMark_('quota', ctx.today, JSON.stringify(v));
    var used = (Number(v.minute) || 0) + (Number(v.five) || 0), el = ctx.msk.ms - tm_dateMs_(ctx.today);
    if (el >= 2 * 3600e3 && used / el * 864e5 > TM_QUOTA_DAY_MS)
      tm_alert_('quota', 'Таймеры бота MAX за сегодня уже ' + Math.round(used / 60000) + ' мин времени триггеров; прогноз на сутки — ' + (used / el * 24).toFixed(1) + ' ч (порог ' + (TM_QUOTA_DAY_MS / 3600e3) + ' ч из 6 ч на аккаунт 1c@ вместе с Telegram-проектом). Если так и дальше — tm_tick реже (TM_TRIGGERS: 10 мин).');
  } catch (e) { /* учёт не обязателен */ }
}

// REDACTED_B64_2 F4 C-A4 / C-B2: уведомления таймеров через Outbox (common/Outbox.gs, контракт tasks/fix_gpt_0511.md)
// Бизнес-решение (au_recl_watch reminded, qd_sent…) сохраняется сразу; уведомление — запись ob_out по ключу '<операция>:<адресат>' (отдельный адресат — отдельный
// ключ) в статусе pending до подтверждённой доставки; доставляет ТОЛЬКО минутный тик (tm_obRun_ → ob_runner) — один исполнитель, без гонок.
var TM_OB_KINDS = ['tm_chat', 'tm_user', 'tm_mail', 'tm_owner'];
function tm_obOn_() { return typeof ob_put === 'function' && typeof ob_runner === 'function'; }
/** доставка одного уведомления (обработчик ob_runner): item {key, kind, target, payload, tries} → {status:'sent'|'retry'|'permanent', result?, err?}.
    payload.sent_id — отметка в tm_sent (журнал «что отправил Google» для сверки при откате; уже есть — повтор не шлёт). */
function tm_obHandle_(item) {
  var k = item.kind, p = item.payload || {}, sid = p.sent_id ? String(p.sent_id) : '', r;
  if (sid) { var was = tm_findRow_('tm_sent', sid); if (was) return { status: 'sent', result: { mid: String(was.vals[4] == null ? '' : was.vals[4]), dup: true } }; }
  var ok = function (kindShort, to, mid) { if (sid) tm_sentMark_(sid, kindShort, to, mid || '', p.job || 'outbox'); return { status: 'sent', result: { mid: mid || '' } }; };
  if (k === 'tm_chat' || k === 'tm_user') {
    if (tm_quiet_(Date.now())) return { status: 'retry', err: 'тихие часы' };
    r = k === 'tm_chat' ? tm_send_('chat', { cid: item.target, text: p.text, html: p.html, reply: p.reply }) : tm_send_('user', { uid: item.target, text: p.text, html: p.html });
    if (r.ok) return ok(k === 'tm_chat' ? 'chat' : 'user', k === 'tm_chat' ? String(item.target) : 'user', r.mid);
    return (r.perm || r.code === 403 || r.code === 404) ? { status: 'permanent', err: r.err } : { status: 'retry', err: r.err || 'не отправлено' };
  }
  if (k === 'tm_mail') {
    r = tm_mail_(p.to, p.cc || [], p.subj, p.body, !!p.owner);
    if (r === 'ok' || r === 'dry') return ok('mail', 'mail', '');
    return r === 'err: нет адресата' ? { status: 'permanent', err: r } : { status: 'retry', err: r };   // quiet / quota / ошибка — повтор
  }
  if (k === 'tm_owner') {                                                  // владельцу: Telegram (mx_tgOwner ядра) → личные MAX → письмо itm@
    var note = p.note || {}; if (!note.id && !note.mid) note.mid = item.key;   // стабильный meta.mid операции: повтор тем же id, Telegram-скрипт дошлёт только недоставленным
    try { if (typeof mx_tgOwner === 'function' && mx_tgOwner(tm_h_(p.text), [], note)) return ok('tg', 'owner', ''); } catch (e) { tm_log_('outbox', 'Telegram: ' + tm_err_(e)); }
    var own = tm_ownerUid_(), done = null;
    if (own) { r = tm_send_('user', { uid: own, text: p.text }); if (r.ok) done = ok('user', 'user', r.mid); }
    if (!done) { r = tm_mail_([TM_ITM], [], p.subj || 'Фабрика — бот MAX: сообщение владельцу', String(p.text) + '\n— бот «Фабрикант»', true); if (r === 'ok' || r === 'dry') done = ok('mail', 'mail', ''); }
    if (done) { tm_obClose_('tgowner:' + String(note.id || note.mid)); return done; }   // CHECK3 05.11: доставлено запасным путём — повтор ядра в Telegram (mx_tgOwner → Outbox 'tgowner:<id>') закрыть, иначе владелец получит то же второй раз
    return { status: 'retry', err: 'владельцу не доставлено: ' + r };
  }
  return { status: 'permanent', err: 'неизвестный вид ' + k };
}
/** поставить уведомление: есть Outbox — ob_put (идемпотентно по key; замок занят — ещё 2 раза) → {ok:false, queued:true} (доставит tm_obRun_: сразу
    вызывающий и/или минутный тик; ob_due берёт операцию в аренду — двух доставок нет); уже доставлено — {ok:true, dup:true}. Без модуля Outbox
    (или он не принял запись) — одна попытка сразу, как раньше, при отказе — техтревога владельцу раз в день. */
function tm_obSend_(key, kind, target, payload) {
  if (tm_obOn_()) {
    var p = null;
    for (var i = 0; i < 3; i++) {
      try { p = ob_put(key, kind, String(target), payload || {}) || {}; } catch (e) { p = { ok: false, status: 'err', err: tm_err_(e) }; }
      if (p.ok || p.status !== 'busy') break;
      Utilities.sleep(300);
    }
    if (p.ok) {
      if (p.status === 'sent') return { ok: true, dup: !!p.dup, status: 'sent', result: p.result };
      if (p.status === 'dead' || p.status === 'uncertain') return { ok: false, queued: false, status: p.status };
      return { ok: false, queued: true, status: p.status || 'pending' };
    }
    tm_log_('outbox', 'ob_put ' + key + ': ' + (p.err || p.status) + ' — одна попытка сразу');
  }
  var r0 = tm_obHandle_({ key: key, kind: kind, target: target, payload: payload || {}, tries: 0 });
  if (r0.status !== 'sent') tm_alert_('outbox', 'Уведомление таймеров (' + kind + ') не доставлено, а очередь повторов Outbox недоступна (нет модуля Outbox.gs или он не принял запись): ' + String(r0.err || '').slice(0, 100) + '. Подробности — лист log.');
  return { ok: r0.status === 'sent', queued: false, status: r0.status, err: r0.err };
}
/** доставка уведомлений таймеров из Outbox (минутный тик; и сразу после постановки — tm_reclWatch_, tm_qDigest_). Паузы между попытками,
    6 попыток → dead и одна техтревога — в модуле (ob_alert_ ниже). */
function tm_obRun_(ctx) {
  if (!tm_obOn_()) return 'нет Outbox';
  var H = {}; TM_OB_KINDS.forEach(function (k) { H[k] = tm_obHandle_; });
  return ob_runner(H, tm_slice_(ctx, 25000, 3000));
}
/** статус операции Outbox по ключу ('sent' | 'pending' | 'failed' | 'dead' | 'uncertain' | '') */
function tm_obStatus_(key) { try { var o = typeof ob_get === 'function' ? ob_get(key) : null; return o ? String(o.status || '') : ''; } catch (e) { return ''; } }
/** закрыть ждущую операцию Outbox как доставленную другим путём (pending/failed → sent; sent/dead/uncertain не трогаются). → true — закрыта */
function tm_obClose_(key) {
  try { var s = tm_obStatus_(key); if ((s === 'pending' || s === 'failed') && typeof ob_mark === 'function') { var m = ob_mark(key, 'sent', { via: 'fallback', note: 'доставлено владельцу запасным путём (MAX/почта)' }); return !!(m && m.ok); } }
  catch (e) { tm_log_('outbox', 'закрытие ' + key + ': ' + tm_err_(e)); }
  return false;
}
/** Техтревога модулей Outbox и ClaudePush для проекта MAX (контракт Outbox.gs: функция проекта ob_alert_(text), шлёт НАПРЯМУЮ, не через Outbox):
    письмо владельцу от 1c@ (tm_alert_ — MailApp, раз в день по ключу; push к Claude и исходящие — разные ключи). Один экземпляр на проект — F1 (ядро) второй не определяет. */
function ob_alert_(text) { text = String(text || ''); return tm_alert_(/push к claude/i.test(text) ? 'push_dead' : 'outbox_dead', text.slice(0, 3000)); }
/** ночью (окно 01:30–02:30 МСК, раз в день, пятиминутный тик — его бюджет больше): ротация листов tm_*, обещания по истории → promises.bin,
    компакция общей таблицы автономности au_compact (запрос F3, CHECK3 05.11: ТОЛЬКО в проекте MAX — физическое удаление строк в одном проекте; Telegram не зовёт) */
function tm_nightly_(ctx) {
  var out = {};
  tm_job_(ctx, 'rotate', tm_rotate_); out.rotate = ctx.res.rotate;
  tm_job_(ctx, 'promises', tm_promises_); out.promises = ctx.res.promises;
  tm_job_(ctx, 'au_compact', function () { return typeof au_compact === 'function' ? au_compact(Date.now()) : 'нет au_compact'; }); out.au_compact = ctx.res.au_compact;
  return out;
}

// REDACTED_B64_2 триггеры (запускать из редактора при переключении; ночью НЕ запускать)
var TM_TRIGGERS = [['tm_tickMinute', 1], ['tm_tick', 5]];   // 10.11.2026: триггер остаётся 5 мин, реже — по часам внутри tm_tick (tm_offHours_)
/** Поставить триггеры времени (только при MODE === 'google'; повторный запуск — пересоздаёт свои). */
function tm_setupTriggers() {
  if (!tm_on_()) { console.log('MODE не google — триггеры tm_ не ставятся'); return { ok: false, err: 'MODE' }; }
  tm_removeTriggers();
  TM_TRIGGERS.forEach(function (t) { ScriptApp.newTrigger(t[0]).timeBased().everyMinutes(t[1]).create(); });
  try { CacheService.getScriptCache().remove('tm_core_trg'); } catch (e) {}   // проверить заново, есть ли триггер ядра
  tm_cfg_();                                                               // лист настроек с умолчаниями — чтобы Т. В. видел, что править
  Object.keys(TM_SHEETS).forEach(function (n) { tm_sheet_(n); });         // листы tm_* с заголовками
  tm_log_('setup', 'триггеры поставлены: ' + TM_TRIGGERS.map(function (t) { return t[0] + '/' + t[1] + ' мин'; }).join(', '));
  console.log('поставлено: ' + TM_TRIGGERS.map(function (t) { return t[0] + ' каждые ' + t[1] + ' мин'; }).join('; '));
  return { ok: true, triggers: TM_TRIGGERS.map(function (t) { return t[0]; }) };
}
/** Снять все триггеры tm_* этого проекта. */
function tm_removeTriggers() {
  var n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) { if (String(t.getHandlerFunction()).indexOf('tm_') === 0) { ScriptApp.deleteTrigger(t); n++; } });
  if (n) tm_log_('setup', 'снято триггеров: ' + n);
  return n;
}

// REDACTED_B64_2 импорт состояния из копии шага 0 (после moveImport_ из Store.gs)
/** «Фабрика — боты/MAX/move/*.json» → состояние таймеров (tm/*.json, polls/*.json, настройки owner_uid/bot_uid/kom_cid).
    Повторный запуск ничего не портит: тот же файл копии (sha12 содержимого в tm/_import.json) пропускается. F4 B5 (catch-up): более свежий снимок
    (другое содержимое того же файла — mx_importState('<новый id>') ядра положил его в move/) — переносится, пока таймеры в Google ещё НЕ работали
    (лист tm_runs пуст); после их запуска файлы состояния НЕ перезаписываются (kept), истории групп — дополняются по mid. Опросы с кнопками
    polls/<id>.json — только если такого файла ещё нет (дальше их ведёт ядро). Ничего не отправляет; MODE не нужен. */
function tm_importState() {
  var done = tm_load_('_import.json', { files: {} }), out = { ok: true, moved: [], skipped: [], missing: [], kept: [] };
  var started = tm_sheet_('tm_runs').getLastRow() > 1;                  // таймеры уже работали — их состояние главнее снимка хостинга
  var mv = function (name) { return jget_('move', name, null); };
  var take = function (src, dst, fix, opt) {
    var v = mv(src); if (v == null) { if (!done.files[src]) out.missing.push(src); else out.skipped.push(src); return; }
    var h = tm_sha12_(JSON.stringify(v)), d0 = done.files[src], prev = d0 && typeof d0 === 'object' ? String(d0.sha || '') : (d0 ? 'old' : '');
    if (prev && prev === h) { out.skipped.push(src); return; }
    if (prev && started && !(opt && opt.merge)) { out.kept.push(src); return; }
    if (opt && opt.ifAbsent && jget_(dst[0], dst[1], null) != null) { done.files[src] = { sha: h, t: new Date().toISOString(), note: 'уже есть' }; out.skipped.push(src); return; }
    if (fix) v = fix(v);
    if (v != null && tm_saveSub_(dst[0], dst[1], v)) { done.files[src] = { sha: h, t: new Date().toISOString() }; out.moved.push(src); }
    else if (v != null) out.ok = false;
  };
  var cfg = mv('max__config.json') || {};
  if (cfg.owner && cfg.owner.user_id && !tm_cfgGet_('owner_uid', '')) tm_cfgSet_('owner_uid', String(cfg.owner.user_id));
  if (cfg.bot && cfg.bot.user_id && !tm_cfgGet_('bot_uid', '')) tm_cfgSet_('bot_uid', String(cfg.bot.user_id));
  var groups = mv('max__groups.json') || {};
  Object.keys(groups).forEach(function (cid) { var g = groups[cid] || {}; if (g.on && TM_KOM_RE.test(String(g.title || '')) && !tm_cfgGet_('kom_cid', '')) tm_cfgSet_('kom_cid', cid); });
  var komCid = tm_komCid_();
  take('max__ctl.json', [TM_SUB, 'ctl.json'], function (st) { delete st.direct; delete st.direct_try; return st; });
  take('max__poll.json', [TM_SUB, 'poll.json'], function (st) { delete st.dry; return st; });
  take('max__remind.json', [TM_SUB, 'remind.json'], function (st) { delete st.dry; return st; });
  take('state__mx_survey.json', [TM_SUB, 'survey.json']);
  take('state__sales_ctl.json', [TM_SUB, 'sales_ctl.json']);
  take('state__staff_watch.json', [TM_SUB, 'staff_watch.json']);
  take('state__unans.json', [TM_SUB, 'unans.json']);
  var histFix = function (cid, title) {                                      // история группы (norm_msg хостинга) — последние 60 дней, поверх уже накопленного здесь
    return function (H) {
      var lo = Date.now() - TM_HIST_DAYS * 864e5, msgs = {}, src = (H && H.msgs) || {};
      Object.keys(src).forEach(function (k) {
        var m = src[k]; if (!m || Number(m.ts) < lo) return;
        m.cid = cid; if (m.uid != null) m.uid = String(m.uid); if (m.ruid != null) m.ruid = String(m.ruid);
        if (m.mentions) m.mentions = m.mentions.map(String);
        msgs[k] = m;
      });
      var cur = tm_hist_(cid); Object.keys(cur.msgs).forEach(function (k) { msgs[k] = cur.msgs[k]; });
      return { title: (H && H.title) || title || cur.title || tm_groupTitle_(cid), msgs: msgs, t: new Date().toISOString() };
    };
  };
  take('max__history_all.json', [TM_SUB, tm_histName_(komCid)], histFix(komCid, 'Коммерческий отдел'), { merge: true });
  var man = mv('max__ctl_manual.json');                                        // свои контрольные точки → настройка ctl_manual (если лист ещё пуст)
  if (done.files['max__ctl_manual.json']) out.skipped.push('max__ctl_manual.json');
  else if (Array.isArray(man) && man.length) {
    if (!(tm_cfgJson_('ctl_manual', []) || []).length) tm_cfgSet_('ctl_manual', JSON.stringify(man));
    done.files['max__ctl_manual.json'] = new Date().toISOString(); out.moved.push('max__ctl_manual.json');
  } else out.missing.push('max__ctl_manual.json');
  try {                                                                      // опросы с кнопками max__polls__<id>.json → polls/<id>.json; истории остальных групп max__hist__<cid>.json
    var it = maxDir_('move').getFiles();
    while (it.hasNext()) {
      var f = it.next(), nm = f.getName(), m = /^max__polls__(.+\.json)$/.exec(nm), h = /^max__hist__(-?\d+)\.json$/.exec(nm);
      if (m) take(nm, [TM_POLLS_SUB, m[1]], null, { ifAbsent: true });
      else if (h && h[1] !== komCid) take(nm, [TM_SUB, tm_histName_(h[1])], histFix(h[1], ''), { merge: true });
    }
  } catch (e) { out.ok = false; out.err = tm_err_(e); }
  if (!tm_save_('_import.json', done)) out.ok = false;
  tm_log_('import', 'перенесено ' + out.moved.length + ', пропущено ' + out.skipped.length + ', нет в копии ' + out.missing.length + (out.kept.length ? ', не перезаписано (таймеры уже работают) ' + out.kept.length : ''));
  console.log(JSON.stringify(out));
  return out;
}
function tm_saveSub_(sub, name, obj) { if (sub === TM_SUB) TM_MEM.files[name] = obj; return jput_(sub, name, obj); }

/** Состояние таймеров без секретов — в журнал выполнения (запуск из редактора). F4: + kom (можно ли слать), Outbox, расход триггеров за сегодня. */
function tm_status() {
  var day = tm_msk_(Date.now()).date, q = null;
  try { q = JSON.parse(CacheService.getScriptCache().get('tm_q_' + day) || 'null'); } catch (e) { q = null; }
  if (!q) { var qr = tm_findRow_('tm_runs', 'quota'); if (qr && String(qr.vals[1]) === day) { try { q = JSON.parse(String(qr.vals[3])); } catch (e1) { q = null; } } }
  var out = { ver: TM_VER, mode: tm_on_() ? 'google' : 'не google', owner: tm_ownerUid_() ? 'есть' : 'нет', kom_cid: tm_komCid_(), kom_ok: tm_chatOk_(tm_komCid_()), quiet: tm_quiet_(Date.now()),
              workday: tm_workday_(day), core: Object.keys(TM_CORE).map(function (k) { return k + ':' + (typeof tm_global_()[TM_CORE[k]] === 'function' ? 'есть' : 'нет'); }).join(' '),
              push: typeof cp_push === 'function' ? 'есть' : 'нет', outbox: tm_obOn_() ? 'есть' : 'нет', triggers: ScriptApp.getProjectTriggers().filter(function (t) { return String(t.getHandlerFunction()).indexOf('tm_') === 0; }).length,
              quota_today_min: q ? Math.round(((Number(q.minute) || 0) + (Number(q.five) || 0)) / 60000) : null, ticks_today: q ? { minute: q.n_minute || 0, five: q.n_five || 0 } : null };
  console.log(JSON.stringify(out)); return out;
}
/** F4 B5: проверка готовности ДО свойства MODE (из редактора; ничего не отправляет, триггеров не ставит, значений свойств не показывает).
    → {ok, fail:[…], checks:[[что, да/нет, пояснение]]}. ok — все обязательные пункты выполнены. */
function tm_preflight() {
  var P = tm_props_(), c = [], need = {}, add = function (k, ok, note, req) { c.push([k, !!ok, note || '']); if (req) need[k] = !!ok; };
  ['MAX_TOKEN', 'HOOK_SECRET', 'K_CMD', 'TG_APP_URL', 'BOT_KEY', 'AU_SHEET_ID'].forEach(function (k) { add('свойство ' + k, !!String(P.getProperty(k) || '').trim(), '', true); });
  ['CLAUDE_FIRE_URL', 'CLAUDE_FIRE_TOKEN', 'SVC_SHEET_ID'].forEach(function (k) { add('свойство ' + k, !!String(P.getProperty(k) || '').trim(), 'желательно'); });
  add('MODE ещё не google (preflight до переключения)', !tm_on_(), tm_on_() ? 'MODE уже google' : '');
  var G = {}; try { TM_MEM.groups = null; G = tm_groups_(); } catch (e) { G = {}; }
  var kom = tm_komCid_(), n = Object.keys(G).length, onN = Object.keys(G).filter(tm_chatOk_).length;
  add('группы импортированы (лист groups)', n > 0, n + ' групп, разрешено слать: ' + onN, true);
  add('«Коммерческий отдел» разрешён (appr && on)', tm_chatOk_(kom), 'kom_cid ' + kom, true);
  add('owner_uid', !!tm_ownerUid_(), '', true);
  add('bot_uid', !!tm_botUid_(), 'без него свои сообщения бота разбираются как чужие', true);
  var imp = jget_(TM_SUB, '_import.json', null);
  add('состояние таймеров импортировано (tm_importState)', !!(imp && imp.files && Object.keys(imp.files).length), imp && imp.files ? Object.keys(imp.files).length + ' файлов' : '', true);
  add('ядро MAX (TM_CORE)', Object.keys(TM_CORE).every(function (k) { return typeof tm_global_()[TM_CORE[k]] === 'function'; }), '', true);
  add('модуль Outbox.gs', tm_obOn_(), 'без него недоставленные уведомления не повторяются', true);
  add('модуль ClaudePush (cp_push)', typeof cp_push === 'function', '', true);
  add('модуль Autonomy (au_reclWatchCheck)', typeof au_reclWatchCheck === 'function', '', true);
  ['owner', tm_keyFor_('staff.bin')].forEach(function (w) { var ok = false, why = ''; try { ok = typeof bf_seal === 'function' && /^T14B1\./.test(String(bf_seal('{}', w))); } catch (e) { why = tm_err_(e).slice(0, 80); } add('ключ файлов портала ' + w, ok, why, true); });
  add('триггеры tm_ ещё не стоят', !ScriptApp.getProjectTriggers().some(function (t) { return String(t.getHandlerFunction()).indexOf('tm_') === 0; }), 'ставятся после MODE (tm_setupTriggers)');
  var fail = Object.keys(need).filter(function (k) { return !need[k]; }), out = { ok: !fail.length, fail: fail, checks: c };
  console.log(JSON.stringify(out)); return out;
}
/** F4 B5 (откат): сверка исходящих по ключам операций. Что таймеры Google отправили с момента sinceIso ('ГГГГ-ММ-ДДTЧЧ:ММ' МСК; лист tm_sent: id, kind, mid)
    и что ещё ждёт доставки в Outbox (лист ob_out читается напрямую — ob_due не зовётся, он берёт записи в аренду): pending/failed/uncertain всех видов, own — tm_*.
    mark === true — ждущие tm_* помечаются dead («откат: не доставлено, решить вручную»); mark === 'all' — и остальные виды (mx_* ядра и т. п.), чтобы условие
    отката «в ob_out нет pending/failed» выполнялось явной пометкой, а после возврата MODE ничего старого не ушло само. Помечать — при ещё включённом MODE
    (без MODE Outbox ничего не меняет). Пишет «Фабрика — боты/MAX/rollback/tm_<время>.json» и возвращает то же. Ничего не отправляет. */
function tm_rollbackReport(sinceIso, mark) {
  var since = sinceIso ? tm_isoMs_(String(sinceIso)) : Date.now() - 24 * 3600e3, sent = [], wait = [];
  try {
    var sh = tm_sheet_('tm_sent'), n = sh.getLastRow();
    if (n > 1) sh.getRange(2, 1, n - 1, 6).getValues().forEach(function (r) { if (tm_cellMs_(r[1]) >= since) sent.push({ id: String(r[0]), t: tm_msk_(tm_cellMs_(r[1])).iso, kind: String(r[2]), to: String(r[3]), mid: String(r[4] || ''), job: String(r[5] || '') }); });
  } catch (e) { sent.push({ err: tm_err_(e) }); }
  try {
    var ob = ss_().getSheetByName('ob_out');                                 // лист модуля Outbox (контракт: key, kind, target, payload, status, tries, next_at, last_err, created, updated, result)
    if (ob && ob.getLastRow() > 1) {
      var hdr = ob.getRange(1, 1, 1, ob.getLastColumn()).getValues()[0].map(String), iK = hdr.indexOf('key'), iKind = hdr.indexOf('kind'), iS = hdr.indexOf('status'), iT = hdr.indexOf('tries');
      ob.getRange(2, 1, ob.getLastRow() - 1, hdr.length).getValues().forEach(function (r) {
        var kind = String(r[iKind]), s = String(r[iS]);
        if (['pending', 'failed', 'uncertain'].indexOf(s) < 0) return;
        wait.push({ key: String(r[iK]), kind: kind, status: s, tries: Number(r[iT]) || 0, own: kind.indexOf('tm_') === 0 });
      });
    }
  } catch (e2) { wait.push({ err: tm_err_(e2) }); }
  if ((mark === true || mark === 'all') && typeof ob_mark === 'function') wait.forEach(function (w) {
    if (!w.key || (mark === true && !w.own)) return;
    try { var m = ob_mark(w.key, 'dead', null, 'откат MODE: не доставлено, решить вручную'); w.marked = m === true || !!(m && m.ok); if (!w.marked) w.mark_err = String((m && (m.err || m.status)) || 'не помечено'); } catch (e3) { w.mark_err = tm_err_(e3); }
  });
  var out = { t: tm_msk_(Date.now()).iso, since: tm_msk_(since).iso, sent: sent, waiting: wait, note: 'sent — уже отправлено Google (хостинг не должен повторять: опросы, напоминания, письма по этим ключам); waiting — не доставлено' };
  try { jput_('rollback', 'tm_' + out.t.replace(/[^\d]/g, '') + '.json', out); } catch (e4) {}
  console.log(JSON.stringify({ sent: sent.length, waiting: wait.length, marked: wait.filter(function (w) { return w.marked; }).length }));
  return out;
}
