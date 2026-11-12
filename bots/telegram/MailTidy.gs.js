/* «Фабрика» — MailTidy.gs: разбор «Входящих» ящика user@example.org без Claude (12.11.2026).
   Т. В. 12.11.2026: «написать скрипты, чтобы почта проверялась без твоего участия на всех трёх ящиках».
   Правила — как ручной разбор Claude 11–12.11 (RULES: разобранный тред — из «Входящих» в папку; копии из корпоративного ящика —
   прочитано и по папкам; что касается Т. В. — уведомление; ничего не удалять).
   Вызов — из g4_tick_ (раз в 10 мин; строка «typeof mt_tick»), сам решает не чаще MT_EVERY_MIN. Берутся только треды во «Входящих»,
   где последнее письмо старше MT_AGE_MIN (робот хостинга забирает отчёты из 1c@ по IMAP каждые 10 мин — по номерам, не по «прочитано»).
   Правило — по первому совпадению:
     report — рассылки 1С (все письма треда от user@example.org)             → «1С — отчёты», прочитано, из «Входящих»;
     bot    — письма бота самому себе «Фабрика: команда/голос/промт/…»     → «Поручения», прочитано, из «Входящих» (их исполняет Claude);
     econ   — отчёты экономистов и ПДО с вложением (econom-*, peo@, imm@, pdo@, industry@) → «ИТМ/экономика» | «ИТМ/производство»,
              прочитано, из «Входящих» (выпуск, ведомость и гальванику забирает робот хостинга);
     svc    — служебные уведомления (no-reply, mailer-daemon, Google)     → «Служебные», прочитано, из «Входящих»;
     copy   — копия письма из itm@ или bostimur@ (их адрес в «Кому/Копии», тред начат не нами, нет просьбы к порталу/Claude — MT_TASK)
              → «ИТМ» (+ «ИТМ/<папка>» по ITM_MAP/ITM_SKIP), прочитано,
              из «Входящих»: оригинал в itm@ разбирает робот хостинга (itm.py + itm_tidy), уведомления о личном — бот по /pochta;
     people — письма людей в 1c@ (ответы на наши запросы и прочее)        → ярлык («Служебные» для ответов на наши письма, иначе
              по ITM_MAP), остаются НЕПРОЧИТАННЫМИ во «Входящих» — их разбирают облачные проверки Claude или Т. В.
   Сигнал Т. В. в Telegram — только если что-то не так (правило 10.11): рабочий день, 10:00–18:00, раз в день — письма людей
   во «Входящих» непрочитанные дольше MT_STALE_H часов (значит, их никто не разобрал): одна сводка, до 8 строк.
   Журнал — свойство mt_log (последние 30 прогонов, только счётчики, без адресов и тем). Ручной запуск из редактора — mt_run(). */
var MT_EVERY_MIN = 15, MT_AGE_MIN = 30, MT_STALE_H = 24, MT_MAX = 80, MT_BUDGET_MS = 50000;
var MT_ME = 'user@example.org', MT_COPY = /itm@fabrikant\.su|bostimur@gmail\.com/i;   // копии из ящиков Т. В.: itm@ (правило mail.ru) и bostimur@ (фильтр Gmail, 12.11)
var MT_TASK = /портал|в\s+раздел|загрузи|загрузить|выложи|на\s+сайт|добав\S*\s.{0,40}(раздел|портал|сайт)|claude|клод/i;   // просьба к порталу/Claude — не прятать
var MT_BOT_SUBJ = /^\s*фабрика\s*:\s*(команда|голос|промт|документ|заявка|вопрос|правка|событие)/i;
var MT_SVC_FROM = /(^|[.@])(no-?reply|noreply|mailer-daemon|postmaster)[^@]*@|@(accounts\.)?google\.com$|@googlemail\.com$/i;
var MT_ECON = /^(econom(-\d+)?|peo)@fabrikant\.su$/i, MT_PROD = /^(imm|pdo|industry)@fabrikant\.su$/i;

function mt_addr_(s) { return (String(s || '').match(/[\w.+-]+@[\w.-]+/) || [''])[0].toLowerCase(); }
function mt_lab_(cache, name) { if (!cache[name]) cache[name] = GmailApp.getUserLabelByName(name) || GmailApp.createLabel(name); return cache[name]; }
function mt_msk_(f, t) { return Utilities.formatDate(new Date(t || Date.now()), 'Europe/Moscow', f); }

/** Папка itm@ по отправителю (те же таблицы, что g4_itmSort_ в Код.gs); нет — ''. */
function mt_itmFolder_(fr) {
  var dm = fr.replace(/^[^@]*/, '');
  try {
    var sk = (typeof ITM_SKIP === 'object' && ITM_SKIP) ? (ITM_SKIP[fr] || ITM_SKIP[dm]) : null;
    if (sk) return String(sk[0] || '');
    var mp = (typeof ITM_MAP === 'object' && ITM_MAP) ? (ITM_MAP[fr] || ITM_MAP[dm]) : '';
    return String(mp || '');
  } catch (e) { return ''; }
}

/** Решение по треду → {k, lab:[...], read, arch} или null (не трогать). */
function mt_classify_(th) {
  var ms = th.getMessages(), first = ms[0], froms = ms.map(function (m) { return mt_addr_(m.getFrom()); });
  var others = froms.filter(function (f) { return f !== MT_ME; });
  if (!others.length) {                                                     // только наши письма
    if (MT_BOT_SUBJ.test(String(first.getSubject() || ''))) return { k: 'bot', lab: ['Поручения'], read: true, arch: true };
    return null;
  }
  if (others.every(function (f) { return f === 'user@example.org'; })) return { k: 'report', lab: ['1С — отчёты'], read: true, arch: true };
  if (others.every(function (f) { return MT_SVC_FROM.test(f); })) return { k: 'svc', lab: ['Служебные'], read: true, arch: true };
  var last = ms[ms.length - 1], lf = mt_addr_(last.getFrom()), att = false;
  try { att = last.getAttachments({ includeInlineImages: false }).length > 0; } catch (e) { att = false; }
  if (att && MT_ECON.test(lf) && others.every(function (f) { return f === lf; })) return { k: 'econ', lab: ['ИТМ/экономика'], read: true, arch: true };
  if (att && MT_PROD.test(lf) && others.every(function (f) { return f === lf; })) return { k: 'econ', lab: ['ИТМ/производство'], read: true, arch: true };
  var ourThread = mt_addr_(first.getFrom()) === MT_ME;
  var toItm = ms.some(function (m) { return mt_addr_(m.getFrom()) !== MT_ME && MT_COPY.test(String(m.getTo()) + ',' + String(m.getCc())); });
  var toMe = ms.some(function (m) { return mt_addr_(m.getFrom()) !== MT_ME && (String(m.getTo()) + ',' + String(m.getCc())).toLowerCase().indexOf(MT_ME) >= 0; });
  var ask = false; try { ask = MT_TASK.test(String(last.getSubject() || '') + ' ' + String(last.getPlainBody() || '').slice(0, 1500)); } catch (e1) { ask = false; }
  if (!ourThread && toItm && !toMe && !ask) {                               // копия письма itm@ / bostimur@ (пересылка), без просьбы к порталу
    var fo = mt_itmFolder_(lf);
    return { k: 'copy', lab: fo ? ['ИТМ', 'ИТМ/' + fo] : ['ИТМ'], read: true, arch: true };
  }
  var fo2 = mt_itmFolder_(lf);
  return { k: 'people', lab: ourThread ? ['Служебные'] : (fo2 ? ['ИТМ/' + fo2] : []), read: false, arch: false };
}

/** Один проход по «Входящим». dry=true — только план (ничего не меняет). */
function mt_run(dry) {
  var t0 = Date.now(), L = {}, st = { t: mt_msk_('dd.MM HH:mm'), seen: 0, report: 0, bot: 0, econ: 0, svc: 0, copy: 0, people: 0, young: 0, err: 0 }, plan = [];
  var TH = GmailApp.search('in:inbox', 0, MT_MAX), stale = [], now = Date.now();
  for (var i = 0; i < TH.length && Date.now() - t0 < MT_BUDGET_MS; i++) {
    var th = TH[i];
    try {
      st.seen++;
      if (now - th.getLastMessageDate().getTime() < MT_AGE_MIN * 60000) { st.young++; continue; }
      var d = mt_classify_(th); if (!d) continue;
      st[d.k]++;
      if (dry) { plan.push(d.k + ' · ' + d.lab.join('+') + ' · ' + String(th.getFirstMessageSubject() || '').slice(0, 60)); continue; }
      d.lab.forEach(function (n) { th.addLabel(mt_lab_(L, n)); });
      if (d.read) th.markRead();
      if (d.arch) th.moveToArchive();
      if (d.k === 'people' && th.isUnread() && now - th.getLastMessageDate().getTime() > MT_STALE_H * 3600000) {
        var lm = th.getMessages().pop();
        stale.push(String(lm.getFrom()).replace(/<[^>]*>/g, '').replace(/"/g, '').trim().slice(0, 40) + ' — ' + String(th.getFirstMessageSubject() || '').replace(/^(re|fw|fwd)\s*:\s*/ig, '').slice(0, 70));
      }
    } catch (e) { st.err++; console.log('mt: ' + e); }
  }
  st.ms = Date.now() - t0;
  if (dry) return { st: st, plan: plan };
  try {
    var p = PropertiesService.getScriptProperties(), lg = JSON.parse(p.getProperty('mt_log') || '[]');
    lg.push(st); p.setProperty('mt_log', JSON.stringify(lg.slice(-30)));
  } catch (e2) { console.log('mt log: ' + e2); }
  mt_stale_(stale);
  return st;
}

/** Сигнал Т. В.: письма людей, никем не разобранные дольше MT_STALE_H ч — рабочий день 10–18, раз в день. */
function mt_stale_(stale) {
  if (!stale.length) return;
  var dow = Number(mt_msk_('u')), hh = Number(mt_msk_('H')), day = mt_msk_('yyyy-MM-dd');
  if (dow > 5 || hh < 10 || hh >= 18) return;
  var p = PropertiesService.getScriptProperties(); if (p.getProperty('mt_stale_day') === day) return;
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
  var txt = '📬 <b>1c@: не разобраны дольше суток</b> — ' + stale.length + '\n' + stale.slice(0, 8).map(function (s) { return '• ' + esc(s); }).join('\n') +
    (stale.length > 8 ? '\n…и ещё ' + (stale.length - 8) : '') + '\n<i>Письма людей во «Входящих» 1c@. Разберёт Claude при следующей проверке или ответьте сами.</i>';
  try { if (typeof tgMsg_ === 'function' && typeof ITM_TO !== 'undefined') { tgMsg_(ITM_TO, txt); p.setProperty('mt_stale_day', day); } }
  catch (e) { console.log('mt stale: ' + e); }
}

/** Из g4_tick_: не чаще MT_EVERY_MIN минут; ошибки — в журнал бота (fail_), не наружу. */
function mt_tick() {
  var c = CacheService.getScriptCache(); if (c.get('mt_tick')) return null;
  c.put('mt_tick', '1', MT_EVERY_MIN * 60);
  return mt_run(false);
}
/** Статус для проверки (последние прогоны). */
function mt_status() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('mt_log') || '[]').slice(-5); }
