// Посещения портала и ошибки на устройствах сотрудников (26.11.2026; слово Т. В. 25.11: «счётчик ставь», «ошибки на телефонах — устанавливай»).
// Свой счётчик: сторонние сервисы статистики страница портала не подключает (политика безопасности страниц). Данные — в служебной таблице под 1c@:
//   лист «visits» — кто, какую страницу, с какого устройства и на какой версии открыл (страница с устройства — не чаще раза в 30 минут);
//   лист «errors» — ошибки скриптов на устройстве (не больше трёх за открытие страницы).
// vshit, vserr — без входа (общий пароль) или с личным токеном; vssum — сводка, только администратор. Частота ограничена, строки старше VS_KEEP_DAYS убираются.
var VS_KEEP_DAYS = 60, VS_TZ = 'Europe/Moscow';
function vsSheet_(name, head) { var ss = db_(), sh = ss.getSheetByName(name); if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); } return sh; }
function vsWho_(tok) { try { var u = tokUser_(String(tok || '')); return [u.name || '', u.login || '']; } catch (e) { return ['', '']; } }
function vsLimit_(key, max) { var c = CacheService.getScriptCache(), k = key + Math.floor(Date.now() / 60000), n = Number(c.get(k) || 0); if (n >= max) return false; c.put(k, String(n + 1), 120); return true; }
function vsCell_(s, n) { s = cleanName_(s, n); return /^[=+\-@]/.test(s) ? "'" + s : s; }       // текст в ячейку — никогда не формула
function vsPost_(op, q) {
  if (op === 'vssum') return vsSum_(tokUser_(q.tok, true), q);
  if (op !== 'vshit' && op !== 'vserr') throw new Error('нет такой операции');
  var page = cleanName_(q.page, 40).replace(/[^A-Za-z0-9_.\-]/g, '');
  if (!page) return { ok: true };
  if (!vsLimit_(op === 'vshit' ? 'vsh' : 'vse', op === 'vshit' ? 240 : 40)) return { ok: true, skip: 1 };
  var who = vsWho_(q.tok), row = [new Date(), vsCell_(who[0] || 'общий пароль', 80), vsCell_(who[1], 40), page, vsCell_(q.dev, 20), vsCell_(q.ver, 24)];
  if (op === 'vshit') vsSheet_('visits', ['t', 'имя', 'логин', 'страница', 'устройство', 'версия']).appendRow(row);
  else vsSheet_('errors', ['t', 'имя', 'логин', 'страница', 'устройство', 'версия', 'ошибка', 'файл', 'строка']).appendRow(row.concat([vsCell_(q.msg, 300), vsCell_(q.src, 80), Number(q.line) || 0]));
  return { ok: true };
}
function vsDay_(d) { return Utilities.formatDate(d, VS_TZ, 'yyyy-MM-dd'); }
function vsTidy_(sh) {                              // портал чистит себя сам: строки старше VS_KEEP_DAYS уходят
  var n = sh.getLastRow(); if (n < 3) return;
  var ts = sh.getRange(2, 1, n - 1, 1).getValues(), lim = Date.now() - VS_KEEP_DAYS * 864e5, k = 0;
  while (k < ts.length && ts[k][0] instanceof Date && ts[k][0].getTime() < lim) k++;
  if (k > 0) sh.deleteRows(2, k);
}
function vsSum_(adm, q) {
  var days = Math.max(1, Math.min(31, Number(q.days) || 7)), from = Date.now() - days * 864e5;
  var sh = vsSheet_('visits', ['t', 'имя', 'логин', 'страница', 'устройство', 'версия']); vsTidy_(sh);
  var n = sh.getLastRow(), take = Math.min(Math.max(n - 1, 0), 30000), rows = take ? sh.getRange(n - take + 1, 1, take, 6).getValues() : [];
  var byDay = {}, ppl = {}, pages = {}, devs = {}, hits = 0;
  rows.forEach(function (r) {
    if (!(r[0] instanceof Date) || r[0].getTime() < from) return;
    var d = vsDay_(r[0]), who = String(r[1] || 'общий пароль'); hits++;
    var D = byDay[d] || (byDay[d] = { hits: 0, who: {} }); D.hits++; D.who[who] = 1;
    var P = ppl[who] || (ppl[who] = { hits: 0, last: 0, pages: {}, dev: {} }); P.hits++; P.last = Math.max(P.last, r[0].getTime()); P.pages[r[3]] = 1; P.dev[r[4]] = 1;
    pages[r[3]] = (pages[r[3]] || 0) + 1; devs[r[4]] = (devs[r[4]] || 0) + 1;
  });
  var es = vsSheet_('errors', ['t', 'имя', 'логин', 'страница', 'устройство', 'версия', 'ошибка', 'файл', 'строка']); vsTidy_(es);
  var en = es.getLastRow(), et = Math.min(Math.max(en - 1, 0), 40), er = et ? es.getRange(en - et + 1, 1, et, 9).getValues() : [];
  return { ok: true, days: days, hits: hits,
    byDay: Object.keys(byDay).sort().map(function (d) { return { d: d, hits: byDay[d].hits, people: Object.keys(byDay[d].who).length }; }),
    people: Object.keys(ppl).map(function (k) { return { name: k, hits: ppl[k].hits, last: ppl[k].last, pages: Object.keys(ppl[k].pages).length, dev: Object.keys(ppl[k].dev).join(', ') }; }).sort(function (a, b) { return b.last - a.last; }),
    pages: Object.keys(pages).map(function (k) { return { p: k, hits: pages[k] }; }).sort(function (a, b) { return b.hits - a.hits; }).slice(0, 30), devs: devs,
    errors: er.reverse().map(function (r) { return { t: r[0] instanceof Date ? r[0].getTime() : 0, name: String(r[1]), page: String(r[3]), dev: String(r[4]), ver: String(r[5]), msg: String(r[6]), src: String(r[7]), line: Number(r[8]) || 0 }; }) };
}
