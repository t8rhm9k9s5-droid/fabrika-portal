#!/bin/bash
# «Фабрика» — пульс разделов на живых данных хостинга (14.11.2026). Скачивает файлы через stget.py, рисует все разделы два раза:
# в node (test_pulse_live.js) и в настоящем браузере (test_pulse_browser.js — страница razdel.html со всеми скриптами, точка тревоги).
# Выход 1 — где данные есть, а на экране «—», пустая диаграмма или ошибка JavaScript. Запускать перед каждой выкладкой портала.
set -u
cd "$(dirname "$0")/../../.." || exit 2
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
for b in pf sales leads omts recl ozrev oz promises ls smv smvs gl; do
  (cd fabrika/work/plans_fts && timeout 100 python3 stget.py $b.bin "$D/$b.json" >/dev/null 2>&1) || echo "· $b.bin не скачан"
done
# gl.bin страница получает через бота (glPick_) — пропускаем через тот же фильтр из исходника бота
node fabrika/tools/ci/gl_pick.js "$D/gl.json" || echo "· gl.json не пропущен через glPick_"
RC=0
node fabrika/tools/ci/test_pulse_live.js "$D" || RC=1
NODE_PATH=$(npm root -g) timeout 300 node fabrika/tools/ci/test_pulse_browser.js "$D" || RC=1
exit $RC
