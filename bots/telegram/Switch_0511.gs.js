/** Переключение ботов 05.11.2026 — свойства проекта «Фабрика — уведомления».
 *  У проекта больше 50 свойств, поэтому в «Настройках проекта» список только для чтения: свойства режима ставятся отсюда.
 *  Запускать из редактора (Выполнить), по шагам tasks/switch_0511.md. Ключей здесь нет: K_CMD не нужен (берётся из BOT_KEY),
 *  AU_SHEET_ID модуль автономности находит сам (общая таблица «Фабрика — боты — автономность» по имени, самая старая).
 *  sw_pre()      — до переключения: MAX_APP_URL (адрес проекта «Фабрика — бот MAX», как WEBAPP_URL_FIXED в его Relay.gs).
 *  sw_modeOn()   — минута T: MODE = google, TRK_REPORT = on.
 *  sw_modeOff()  — откат (switch_0511.md R4): снять MODE и TRK_REPORT с отметкой удаления (копия свойств их не вернёт).
 *  sw_show()     — какие свойства режима есть (без значений). */
var SW_MAX_APP_URL = 'https://script.google.com/macros/s/REDACTED_2/exec';
function sw_show() {
  var p = PropertiesService.getScriptProperties();
  var o = {}; ['MODE', 'TRK_REPORT', 'MAX_APP_URL', 'K_CMD', 'AU_SHEET_ID', 'CLAUDE_FIRE_URL', 'CLAUDE_FIRE_TOKEN', 'SVC_SHEET_ID'].forEach(function (k) {
    var v = p.getProperty(k); o[k] = v == null ? 'нет' : (k === 'MODE' || k === 'TRK_REPORT' ? v : 'есть'); });
  console.log(JSON.stringify(o)); return o;
}
function sw_pre() {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(SW_MAX_APP_URL)) throw new Error('SW_MAX_APP_URL не похож на адрес …/exec');
  PropertiesService.getScriptProperties().setProperty('MAX_APP_URL', SW_MAX_APP_URL);
  return sw_show();
}
function sw_modeOn() {
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('MAX_APP_URL')) throw new Error('сначала sw_pre()');
  p.setProperty('MODE', 'google'); p.setProperty('TRK_REPORT', 'on');
  return sw_show();
}
function sw_modeOff() {
  ['MODE', 'TRK_REPORT'].forEach(function (k) {
    if (typeof pdel_ === 'function') pdel_(k); else PropertiesService.getScriptProperties().deleteProperty(k);
  });
  return sw_show();
}
function sw_auth() { ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL); return 'ok'; }