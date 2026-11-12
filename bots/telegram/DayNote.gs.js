/* «Фабрика» — DayNote.gs: «Итоги дня» Т. В. в Telegram без Claude (12.11.2026).
   Т. В. 12.11: «все сборщики отчётов на сайте должны быть автономны от тебя, собирать это нужно и из почты и из ботов».
   Заменяет облачный запуск 19:17 (work/daily/day_report.py): тот же вид — сверху короткие строки (на экран iPhone), подробности —
   в сворачиваемой цитате Telegram (<blockquote expandable>).
   Когда: рабочий день, первый тик g4_tick_ (раз в 10 мин) с DN_FROM до DN_TO МСК, один раз за день (свойство dn_day, отметка до отправки).
   Источники — только боты и робот хостинга, без Claude:
     группы MAX — проект «Фабрика — бот MAX», op read (g4_maxCmd_, подпись K_CMD), сообщения с 00:00 МСК;
     ждут Т. В. — открытые обращения в ботах (g4_evObj_) + вопросы без ответа за сегодня (ua.bin робота: почта itm@ и группы MAX);
     почта itm@ — карточки писем людей за сегодня (mq.bin); 1c@ — письма людей, ждущие разбора во «Входящих» (MailTidy);
     портал и робот — участки робота не в порядке (hs.bin).
   Реестр вопросов Claude (questions/open.json) и «сделано Claude» сюда не входят — это данные Claude, не ботов.
   Отметка для сверки — «От ботов»/dn_last.json {day, t, ok, len} (без текста). Ручной просмотр без отправки — dn_test(). */
var DN_FROM = '19:15', DN_TO = '19:55';
var DN_GROUPS = [['-100000000000', 'Снабжение', '📦'], ['-100000000000', 'Погрузка', '🚚'], ['-100000000000', 'Производство', '🏭'],
                 ['-100000000000', 'Ком. отдел', '💼'], ['-100000000000', 'Торг. оборудование', '🛠'], ['-100000000000', 'УЗ', '🌏'],
                 ['-100000000000', 'Кадры', '👥']];
var DN_WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
var DN_LANES = { portal: 'обновления', reports: 'отчёты', bots: 'боты', history: 'история', ozon: 'Ozon', ozon_hist: 'Ozon-история', docs: 'документы',
                 mail: 'почта', glonass: 'транспорт', glm: 'ГЛОНАСС' };

function dn_e_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function dn_cut_(s, n) {
  s = String(s || '').replace(/\s+/g, ' ').trim(); n = n || 90;
  if (typeof g4_maskLog_ === 'function') s = g4_maskLog_(s);
  return s.length <= n ? s : s.slice(0, n - 1).replace(/\s+$/, '') + '…';
}
function dn_first_(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }

/** Текст отчёта (HTML Telegram). now — мс (по умолчанию сейчас). */
function dn_build(now) {
  now = now || Date.now();
  var day = b2Msk_(now, 'yyyy-MM-dd'), t0 = Date.parse(day + 'T00:00:00+03:00'), top = [], det = [];
  // --- ждут вас
  var ev = null; try { ev = typeof g4_evObj_ === 'function' ? g4_evObj_() : null; } catch (e0) { ev = null; }
  var evOpen = (ev && ev.open) || [];
  var ua = g4_bin_('ua.bin', 600) || {}, uaT = (ua.items || []).filter(function (x) { return x && x.day === day; });
  var wait = evOpen.length + uaT.length;
  top.push((wait ? '⚠️' : '✅') + ' <b>Ждут вашего решения: ' + wait + '</b>' +
           (wait ? ' (обращений в ботах ' + evOpen.length + ', вопросов без ответа ' + uaT.length + ')' : ''));
  if (wait) {
    var L = evOpen.slice(0, 4).map(function (a) { return '• ' + (a.late ? '⏰ ' : '') + dn_e_(dn_cut_(a.name, 30)) + ': ' + dn_e_(dn_cut_(a.text, 60)); });
    uaT.slice(-5).forEach(function (q) {
      L.push('• ' + (q.src === 'mail' ? '✉️ ' : '💬 ') + dn_e_(dn_cut_(q.fio || q.n, 30)) + (q.g ? ' (' + dn_e_(q.g) + ')' : '') + ': ' + dn_e_(dn_cut_(q.s || q.x, 55)));
    });
    det.push('<b>Ждут вас</b>\n' + L.join('\n'));
  }
  // --- группы MAX
  DN_GROUPS.forEach(function (g) {
    var j = null; try { j = g4_maxCmd_({ op: 'read', cid: g[0], n: 100 }); } catch (e1) { j = null; }
    if (!j || !j.ok || !Array.isArray(j.msgs)) { top.push(g[2] + ' ' + g[1] + ': нет связи с ботом'); return; }
    var tm = j.msgs.filter(function (m) { return Number(m.ts) >= t0 && !m.k; });
    if (!tm.length) { top.push(g[2] + ' ' + g[1] + ': тихо'); return; }
    var ppl = tm.filter(function (m) { return !m.bot; }), bot = tm.filter(function (m) { return m.bot; });
    var files = 0; ppl.forEach(function (m) { (m.att || []).forEach(function (a) { if (/^(file|image|video)$/.test(String(a.type))) files++; }); });
    var q = ppl.filter(function (m) { return String(m.text || '').indexOf('?') >= 0; });
    var who = {}; ppl.forEach(function (m) { var f = dn_first_(m.name); if (f) who[f] = 1; });
    top.push(g[2] + ' <b>' + g[1] + '</b>: ' + ppl.length + ' сообщ.' + (files ? ', файлов ' + files : '') + (q.length ? ', вопросов ' + q.length : '') + (bot.length ? ', бот ' + bot.length : ''));
    var d = ['<b>' + g[2] + ' ' + g[1] + '</b> — писали: ' + dn_e_(Object.keys(who).sort().slice(0, 8).join(', ') || '—')];
    bot.slice(-1).forEach(function (m) { d.push('🤖 ' + dn_e_(dn_cut_(m.text, 80))); });
    q.slice(-2).forEach(function (m) { d.push('❓ ' + dn_e_(dn_cut_(m.name, 16)) + ': ' + dn_e_(dn_cut_(m.text, 70))); });
    det.push(d.join('\n'));
  });
  // --- почта
  var mq = g4_bin_('mq.bin', 300) || {}, notes = (mq.notes || []).filter(function (n) { return String(n && n.t || '').slice(0, 10) === day; });
  var mine = notes.filter(function (n) { return n.d && n.q; });
  top.push('✉️ Почта itm@: ' + notes.length + ' писем людей' + (mine.length ? ', лично вам с вопросом ' + mine.length : ''));
  try {
    var inb = GmailApp.search('in:inbox is:unread older_than:1d', 0, 30).length;
    if (inb) top.push('📬 1c@: писем людей ждут разбора дольше суток — ' + inb);
  } catch (e2) { /* без строки */ }
  // --- портал и робот
  var hs = g4_bin_('hs.bin', 300) || {}, bad = [];
  Object.keys(hs.lanes || {}).forEach(function (k) { var v = hs.lanes[k] || {}; if (v.state && v.state !== 'ok') bad.push(DN_LANES[k] || k); });
  var age = hs.t ? Math.round((now - Date.parse(String(hs.t).slice(0, 16) + ':00+03:00')) / 60000) : null;
  top.push('🌐 Портал и робот: ' + (bad.length ? '⚠️ сбой: ' + bad.join(', ') : 'работают') + (age !== null && age > 90 ? ' · ⚠️ робот молчит ' + Math.round(age / 60) + ' ч' : ''));
  var head = '<b>Итоги дня · ' + DN_WD[(Number(b2Msk_(now, 'u')) + 6) % 7] + ' ' + b2Msk_(now, 'dd.MM') + '</b>';
  var txt = head + '\n' + top.join('\n') + (det.length ? '\n<blockquote expandable>' + det.join('\n\n') + '</blockquote>' : '');
  if (txt.length > 4000) {
    var cut = txt.slice(0, 3900), i = cut.lastIndexOf('\n');
    txt = (i > 0 ? cut.slice(0, i) : cut) + (cut.indexOf('<blockquote') >= 0 ? '\n…</blockquote>' : '\n…');
  }
  return txt;
}

/** Отправка Т. В. (HTML; Telegram не принял разметку — тем же текстом без тегов). → true/false */
function dn_send_(html) {
  var U = pj_(props().getProperty('tg_users'), {}) || {}, o = U[ITM_TO]; if (!o || !o.chat) return false;
  var r = tgRaw_('sendMessage', { chat_id: o.chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
  if (r && r.ok) return true;
  var plain = String(html).replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  r = tgRaw_('sendMessage', { chat_id: o.chat, text: plain.slice(0, 4000), disable_web_page_preview: true });
  return !!(r && r.ok);
}

/** Из g4_tick_: рабочий день, окно DN_FROM–DN_TO, раз в день. */
function dn_tick() {
  var now = Date.now(), hm = b2Msk_(now, 'HH:mm'), day = b2Msk_(now, 'yyyy-MM-dd'), p = props();
  if (!evWorkDay_(now) || hm < DN_FROM || hm >= DN_TO || p.getProperty('dn_day') === day) return null;
  p.setProperty('dn_day', day);                          // отметка до отправки — повтор тика не удвоит
  var html = dn_build(now), ok = false;
  try { ok = dn_send_(html); } catch (e) { fail_('g4:dn', e); }
  if (!ok) p.deleteProperty('dn_day');                   // не ушло — следующий тик в том же окне попробует снова
  try { g4_put_('dn_last.json', JSON.stringify({ day: day, t: b2Msk_(Date.now(), 'HH:mm'), ok: ok, len: html.length })); } catch (e3) { /* отметка не обязательна */ }
  try { g4_log_('dn', day + ': ' + (ok ? 'отправлено' : 'НЕ ушло') + ' (' + html.length + ' зн.)'); } catch (e4) { /* журнал */ }
  return ok;
}
/** Просмотр текста без отправки (из редактора). */
function dn_test() { var t = dn_build(); console.log(t); return t; }
