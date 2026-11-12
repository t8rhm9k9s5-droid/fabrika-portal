/** Переключение ботов 05.11.2026 — обёртки для запуска из редактора проекта «Фабрика — бот MAX» (кнопка «Выполнить» не передаёт аргументы,
 *  а mx_importState() без аргумента взял бы старую копию 04.11). Порядок — tasks/switch_0511.md. Ничего не отправляют.
 *  sw_importPre()    — P6: копия «Перенос MAX max-2026-11-05-pre» → ядро, затем таймеры.
 *  sw_importFinal()  — P9: копия «…-final» (после остановки таймеров хостинга).
 *  sw_importFinal2() — D2 (по желанию, после T): копия «…-final2». */
function sw_importPre()    { return sw_import_('max-2026-11-05-pre'); }
function sw_importFinal()  { return sw_import_('max-2026-11-05-final'); }
function sw_importFinal2() { return sw_import_('max-2026-11-05-final2'); }
function sw_import_(id) {
  var core = mx_importState(id), r = { id: id, core: core, timers: null };
  if (core && core.ok) r.timers = tm_importState();
  else r.note = 'ядро не импортировано до конца — запустите эту же функцию ещё раз (повтор безвреден)';
  console.log(JSON.stringify(r).slice(0, 8000));
  return r;
}
function sw_auth() { ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL); return 'ok'; }