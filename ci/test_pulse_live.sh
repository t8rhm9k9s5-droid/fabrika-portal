#!/bin/bash
# «Фабрика» — пульс разделов на живых данных хостинга (14.11.2026). Скачивает файлы через stget.py, рисует все разделы два раза:
# в node (test_pulse_live.js) и в настоящем браузере (test_pulse_browser.js — страница razdel.html со всеми скриптами, точка тревоги).
# Выход 1 — где данные есть, а на экране «—», пустая диаграмма или ошибка JavaScript. Запускать перед каждой выкладкой портала.
set -u
cd "$(dirname "$0")/../../.." || exit 2
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
# 14.11.2026: gl.bin дважды пришёл как null (робот в эту минуту переписывал файл / сеть) — проверка ложно запрещала выкладку.
#   Пустой ответ (null) — ещё две попытки через 20 с.
for b in pf sales leads omts recl oz promises ls smv smvs gl poruch; do   # 21.11.2026: poruch — карточка «Поручения открыты» считает по нему; ozrev на хостинге нет
  for try in 1 2 3; do
    (cd fabrika/work/plans_fts && timeout 100 python3 stget.py $b.bin "$D/$b.json" >/dev/null 2>&1)
    [ -s "$D/$b.json" ] && [ "$(head -c 4 "$D/$b.json")" != 'null' ] && break
    [ $try = 3 ] && echo "· $b.bin не скачан (3 попытки)" || sleep 20
  done
done
# gl.bin страница получает через бота (glPick_) — пропускаем через тот же фильтр из исходника бота
node fabrika/tools/ci/gl_pick.js "$D/gl.json" || echo "· gl.json не пропущен через glPick_"
RC=0
node fabrika/tools/ci/test_pulse_live.js "$D" || RC=1
NODE_PATH=$(npm root -g) timeout 300 node fabrika/tools/ci/test_pulse_browser.js "$D" || RC=1
# 14.11.2026: лёгкая версия в Telegram (страница входа без Service Worker) — свой стенд с тестовым ключом
LT=$(mktemp -d)
if python3 fabrika/tools/ci/lite_fixture.py "$LT/site" >/dev/null; then
  O=$(NODE_PATH=$(npm root -g) timeout 300 node fabrika/tools/ci/test_lite_tg.js "$LT/site" "$LT" 2>&1); R2=$?; echo "$O" | tail -4; [ $R2 = 0 ] || RC=1
else echo '✗ стенд лёгкой версии не собран'; RC=1; fi
rm -rf "$LT"
exit $RC
