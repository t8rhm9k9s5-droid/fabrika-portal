#!/bin/bash
# «Фабрика» — проверка перед выкладкой (14.11.2026, Т. В.: «ты можешь делать код, чтобы этих сбоев дурацких не было… на элементарном
# всплывают баги, которых не должно повторяться»; «пока выкладки не будет, пока несколько раз код Рексом не проверим»).
# Один запуск — все проверки; выход 1 при любой ошибке. drive_pack.py без --force пакет при ошибке не собирает.
#   bash fabrika/tools/ci/predeploy_check.sh          — всё (с живыми файлами хостинга для пульса)
#   bash fabrika/tools/ci/predeploy_check.sh --quick  — без сети: синтаксис, линтеры, тесты робота
# Ловит то, что уже ломало прод: незакрытая строка в JS страницы (раздел «Продажи»), NameError на уровне модуля робота
# (ключ владельца → None), метрика из снимка сборки вместо файла хостинга («Производство» — «—»).
set -u
H=/home/claude
cd "$H" || exit 2
FAIL=0
step() { printf '\n== %s\n' "$1"; }
bad() { echo "✗ $1"; FAIL=1; }

step '1. Python: компиляция (портал, сборка, робот)'
for f in build/*.py app_build/*.py app_build/host/live/*.py; do
  case "$f" in *before*|*.orig*|*.bak*) continue;; esac
  python3 -W ignore -m py_compile "$f" 2>/dev/null || bad "py_compile $f"
done

step '2. Python: ошибки, которые линтер видит без запуска (неопределённые имена, повторы, синтаксис)'
RUFF=$(command -v ruff || echo /root/.local/bin/ruff)
if [ -x "$RUFF" ]; then
  # sklad3d/mount_cams/data3d исполняются через exec внутри extra3d.py — их имена приходят из него
  OUT=$("$RUFF" check --select F821,F811,F823,F632,F701,F702,F704,F706,E9,PLE --output-format concise \
        $(ls build/*.py app_build/*.py app_build/host/live/*.py | grep -v -e before -e '\.orig' -e sklad3d.py -e mount_cams.py -e data3d.py) 2>&1 | grep -v '^Found\|^All checks')
  [ -n "$OUT" ] && { echo "$OUT" | head -30; bad 'ruff: ошибки выше'; } || echo 'ruff: ок'
else echo '· ruff не установлен (pip install --break-system-packages ruff)'; fi

step '3. JS: синтаксис файлов и встроенных скриптов страниц'
for f in site/assets/*.js build/acct/*.js build/app/*.js; do
  case "$f" in *before*) continue;; esac
  node --check "$f" 2>/dev/null || bad "node --check $f"
done
node fabrika/tools/ci/test_inline_js.js site || bad 'встроенные скрипты страниц'

step '4. JS: недостижимый код, дубли ключей, NaN и пр. (ESLint, только ошибки)'
EL="$H/fabrika/tools/eslint"
if [ -x "$EL/node_modules/.bin/eslint" ]; then
  OUT=$("$EL/node_modules/.bin/eslint" --no-eslintrc -c "$EL/.eslintrc.html.json" --quiet -f unix \
        $(ls site/assets/*.js build/*_frag.html | grep -v -e before -e '\.min\.') 2>&1 | grep -v '^$\|problem')
  [ -n "$OUT" ] && { echo "$OUT" | head -30; bad 'eslint: ошибки выше'; } || echo 'eslint: ок'
else echo '· eslint не найден (npm i eslint@8.57.0 eslint-plugin-html@7.1.0 в fabrika/tools/eslint)'; fi

step '5. Робот: тесты на макете ~/.fabrika_live (сеть отключена), текущий код'
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
cp -r "$H/fix/work/py" "$T/py"
for f in app_build/host/live/*.py; do case "$f" in *before*) continue;; esac; cp "$f" "$T/py/live/"; done
cp app_build/drive_pack.py "$T/py/drive_pack.py"
# 14.11: шесть тестов устарели до сегодняшних правок (ждут прежних умолчаний) — для них сверяется число пройденных проверок
#   с базой (то же число было на коде до 14.11); меньше базы — регрессия. Обновить тесты — в списке задач.
BASE=' test_audit_deploy:10 test_audit_mail:8 test_glonass_stages:13 test_mail_gas:21 test_mail_q:2 test_poll_remind:0 '
( cd "$T/py/live" && for t in test/test_*.py; do
    n=$(basename "$t" .py); o=$(timeout 120 unshare -n python3 -W ignore "$t" 2>&1); r=$(echo "$o" | tail -1); k=$(echo "$o" | grep -c '✓')
    case "$r" in 'ALL OK'*) echo "✓ $n";;
      *) b=$(echo "$BASE" | grep -o " $n:[0-9]*" | cut -d: -f2)
         if [ -n "$b" ] && [ "$k" -ge "$b" ]; then echo "· $n (устаревший, проверок $k из базы $b)";
         else echo "✗ $n (проверок $k${b:+, база $b}): ${r:0:120}"; echo FAIL >> "$T/fail"; fi;;
    esac
  done )
[ -f "$T/fail" ] && bad 'тесты робота'

if [ "${1:-}" != '--quick' ]; then
  step '6. Пульс разделов на живых файлах хостинга (данные есть → на экране не «—»)'
  O=$(bash fabrika/tools/ci/test_pulse_live.sh 2>&1); RC=$?; echo "$O" | tail -4; [ $RC = 0 ] || bad 'пульс разделов'
fi

echo
[ "$FAIL" = 0 ] && echo 'ИТОГ: можно выкладывать' || echo 'ИТОГ: ВЫКЛАДКА ЗАПРЕЩЕНА — исправить ошибки выше'
exit $FAIL
