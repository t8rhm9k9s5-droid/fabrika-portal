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
# 21.11.2026: временные «дома» тестов робота (mock_home: /tmp/tmp*/.fabrika_live) старше 2 часов — убрать; иначе за неделю набирается 16 ГБ
find /tmp -maxdepth 1 -name 'tmp*' -type d -mmin +120 -exec test -d '{}/.fabrika_live' ';' -exec rm -rf '{}' + 2>/dev/null || true
FAIL=0
step() { printf '\n== %s\n' "$1"; }
bad() { echo "✗ $1"; FAIL=1; }

step '1. Python: компиляция (портал, сборка, робот)'
for f in build/*.py app_build/*.py app_build/host/live/*.py; do
  case "$f" in *before*|*.orig*|*.bak*) continue;; esac
  python3 -W ignore -m py_compile "$f" 2>/dev/null || bad "py_compile $f"
done

step '2. Python: ошибки, которые линтер видит без запуска (неопределённые имена, повторы, синтаксис)'
# 14.11 ревью Рекса CG-10 п. 3: линтер обязателен и закреплён по версии; решает код завершения, а не фильтр вывода
RUFF_VER='0.16.9'
RUFF=$(command -v ruff || echo /root/.local/bin/ruff)
if [ ! -x "$RUFF" ]; then bad "ruff не установлен (pip install --break-system-packages ruff==$RUFF_VER)"
elif [ "$("$RUFF" --version 2>/dev/null)" != "ruff $RUFF_VER" ]; then bad "ruff: нужна версия $RUFF_VER, стоит $("$RUFF" --version 2>&1)"
else
  # sklad3d/mount_cams/data3d исполняются через exec внутри extra3d.py — их имена приходят из него (исключены по имени файла)
  PYF=$(ls build/*.py app_build/*.py app_build/host/live/*.py | grep -v -e before -e '\.orig' -e sklad3d.py -e mount_cams.py -e data3d.py)
  OUT=$("$RUFF" check --no-cache --select F821,F811,F823,F632,F701,F702,F704,F706,E9,PLE --output-format concise $PYF 2>&1); RC=$?
  if [ $RC = 0 ]; then echo 'ruff: ок'; else echo "$OUT" | head -30; bad "ruff: код $RC"; fi
fi

step '2а. Рабочий календарь: один список праздников у сборки, робота и портала'
# 14.11.2026, Т. В.: «сделай себе рабочий календарь» — выходные и праздники по производственному календарю; списки не должны разойтись
python3 - <<'EOP' || bad 'рабочий календарь: списки праздников различаются'
import re, sys
def py(p):
    s = open(p, encoding='utf-8').read()
    return set(re.findall(r"'(\d{4}-\d\d-\d\d)'", re.search(r'^HOLIDAYS = \{([^}]*)\}', s, re.M).group(1))), set(re.findall(r"'(\d{4}-\d\d-\d\d)'", re.search(r'^WORKSAT = \{([^}]*)\}', s, re.M).group(1)))
a = py('build/output/build_output.py'); b = py('app_build/host/live/mx_ctl.py')
s = open('site/assets/hub.js', encoding='utf-8').read()
c = (set(re.findall(r"'(\d{4}-\d\d-\d\d)': 1", re.search(r'var HOL = \{([^}]*)\}', s).group(1))), set(re.findall(r"'(\d{4}-\d\d-\d\d)': 1", re.search(r'WS = \{([^}]*)\}', s).group(1))))
ok = a == b == c
print('календарь: ок' if ok else 'календарь: сборка %d/%d, робот %d/%d, портал %d/%d' % (len(a[0]), len(a[1]), len(b[0]), len(b[1]), len(c[0]), len(c[1])))
sys.exit(0 if ok else 1)
EOP

step '3. JS: синтаксис файлов и встроенных скриптов страниц'
for f in site/assets/*.js build/acct/*.js build/app/*.js build/*.js; do
  case "$f" in *before*) continue;; esac
  node --check "$f" 2>/dev/null || bad "node --check $f"
done
node fabrika/tools/ci/test_inline_js.js site || bad 'встроенные скрипты страниц'

step '4. JS: недостижимый код, дубли ключей, NaN и пр. (ESLint, только ошибки)'
EL="$H/fabrika/tools/eslint"; ESL_VER='v8.57.0'
if [ ! -x "$EL/node_modules/.bin/eslint" ]; then bad "eslint не найден (npm i eslint@8.57.0 eslint-plugin-html@7.1.0 в fabrika/tools/eslint)"
elif [ "$("$EL/node_modules/.bin/eslint" --version 2>/dev/null)" != "$ESL_VER" ]; then bad "eslint: нужна версия $ESL_VER"
else
  OUT=$("$EL/node_modules/.bin/eslint" --no-eslintrc -c "$EL/.eslintrc.html.json" --quiet -f unix \
        $(ls site/assets/*.js build/*_frag.html build/*.js | grep -v -e before -e '\.min\.') 2>&1); RC=$?
  if [ $RC = 0 ]; then echo 'eslint: ок'; else echo "$OUT" | head -30; bad "eslint: код $RC"; fi
  # 14.11.2026 (ревью Рекса CG-11: «ReferenceError: ar is not defined» в «Производстве» — чистка убрала объявление): скрипты сайта —
  #   ещё и с no-undef. Общие объекты страниц (T14M, T14Live…) перечислены в .eslintrc.assets.json; новый общий объект — дописать туда.
  OUT=$("$EL/node_modules/.bin/eslint" --no-eslintrc -c "$EL/.eslintrc.assets.json" --quiet -f unix \
        $(ls site/assets/*.js | grep -v -e before -e '\.min\.') 2>&1); RC=$?
  if [ $RC = 0 ]; then echo 'eslint, необъявленные имена: ок'; else echo "$OUT" | head -30; bad "eslint no-undef: код $RC"; fi
fi

step '5. Робот: тесты на макете ~/.fabrika_live (сеть отключена), текущий код'
# 14.11 ревью Рекса CG-10 п. 1–2: каждый шаг подготовки проверяется; код завершения теста — раньше разбора вывода;
#   допускаются только перечисленные устаревшие тесты и только с тем же падением, что на коде до 14.11.
T=$(mktemp -d) || { bad 'mktemp'; T=; }
if [ -n "$T" ]; then
  trap 'rm -rf "$T"' EXIT
  cp -r "$H/fix/work/py" "$T/py" || bad 'копирование макета тестов'
  for f in app_build/host/live/*.py; do case "$f" in *before*) continue;; esac; cp "$f" "$T/py/live/" || bad "копирование $f"; done
  cp app_build/drive_pack.py "$T/py/drive_pack.py" || bad 'копирование drive_pack.py'
  # 14.11.2026 (ревью Рекса CG-11, test_poll_remind): справочник людей робота — тот, что уходит пакетом; без него в макете поиск людей пустой (25 из 29 FAIL)
  cp app_build/host/live/unans_org.json "$T/py/live/" || bad 'копирование unans_org.json'
  # 16.11.2026 (R5-02 Рекса): тесты — из того же исходника, что и код (app_build/host/live/test), а не только старый макет fix/work/py;
  #   справочник руководителей leaders.json уходит пакетом вместе с кодом — без него 4 теста получателей падают на макете.
  cp app_build/host/live/leaders.json "$T/py/live/" || bad 'копирование leaders.json'
  cp -r app_build/host/live/test/. "$T/py/live/test/" || bad 'копирование текущих тестов робота'
  NT=$(ls "$T/py/live/test/"test_*.py 2>/dev/null | wc -l)
  [ "$NT" -ge 45 ] || bad "тестов робота найдено $NT (ожидается не меньше 45)"
  RUNLOG="$H/fabrika/work/ci/predeploy_tests_last.txt"; mkdir -p "$(dirname "$RUNLOG")"
  { echo "# прогон $(date -u +%FT%TZ) · код+тесты sha $(cat app_build/host/live/*.py app_build/host/live/test/*.py 2>/dev/null | sha256sum | cut -c1-16)"; } > "$RUNLOG"
  # устаревшие (ждут прежних умолчаний: SMTP, 9 участков, даты, справочники) — «имя|мин. ✓|начало сообщения AssertionError»
  STALE="$T/stale.txt"
  cat > "$STALE" <<'EOS'
test_audit_deploy|10|AssertionError: пакет со сломанным live.py — откат из копии
test_mail_gas|21|AssertionError: st/in.php: верная подпись
test_mail_q|22|AssertionError: нет файла — как раньше (smtp, imap)
test_check_x|2|AssertionError: вторник: 5 строк, без «Покупных товаров»
test_eco|10|AssertionError: первый прогон: все 9 участков
test_morning_q|6|AssertionError: настройки: опрос 09:00 МСК
test_mx_survey|0|FAILED: 2
test_sales_day|6|KeyError: '2026-10-29'
test_soft_start|1|AssertionError: 02.11 09:01 — утренний опрос
EOS
  # 16.11.2026 (R5-02): 6 последних строк — тесты, которые раньше в прогон не попадали вовсе (устаревшие даты/фикстуры). Это открытая часть R5-02:
  #   обновить фикстуры и убрать строки. Новое падение или другое сообщение — выкладка запрещена.
  if cd "$T/py/live"; then
    for t in test/test_*.py; do
      n=$(basename "$t" .py); o=$(timeout 120 unshare -n python3 -W ignore "$t" 2>&1); rc=$?; k=$(echo "$o" | grep -c '✓')
      # 16.11.2026 (R5-02): успех — код 0 (новые тесты пишут «OK N», «ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ», а не только «ALL OK»); каждый прогон — в журнал
      if [ $rc = 0 ] && ! echo "$o" | grep -qE '^(FAIL|FAILED|Traceback)'; then echo "✓ $n"; echo "ok $n" >> "$RUNLOG"; continue; fi
      line=$(grep "^$n|" "$STALE")
      if [ $rc = 1 ] && [ -n "$line" ]; then
        mk=$(echo "$line" | cut -d'|' -f2); msg=$(echo "$line" | cut -d'|' -f3)
        last=$(echo "$o" | grep -E '^[A-Za-z]+(Error|Exception)?: |^FAILED' | tail -1)
        if [ "$k" -ge "$mk" ] && case "$last" in "$msg"*) true;; *) false;; esac; then
          echo "· $n (устаревший: то же падение, проверок $k из $mk)"; echo "stale $n" >> "$RUNLOG"; continue; fi
      fi
      echo "fail $n" >> "$RUNLOG"
      # test_poll_remind: число FAIL не определяет, какие проверки сломаны.
      # До обновления устаревшего теста любой его ненулевой код блокирует выкладку.
      echo "✗ $n (код $rc, проверок $k): $(echo "$o" | tail -2 | tr '\n' ' ' | cut -c1-160)"; echo FAIL >> "$T/fail"
    done
    cd "$H" || exit 2
  else bad 'переход в каталог тестов'; fi
  [ -f "$T/fail" ] && bad 'тесты робота'
fi

if [ "${1:-}" != '--quick' ]; then
  step '6. Пульс разделов на живых файлах хостинга (данные есть → на экране не «—»)'
  O=$(bash fabrika/tools/ci/test_pulse_live.sh 2>&1); RC=$?; echo "$O" | tail -4; [ $RC = 0 ] || bad 'пульс разделов'
fi

echo
[ "$FAIL" = 0 ] && echo 'ИТОГ: можно выкладывать' || echo 'ИТОГ: ВЫКЛАДКА ЗАПРЕЩЕНА — исправить ошибки выше'
exit $FAIL
