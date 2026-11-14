#!/bin/bash
# «Фабрика» — пульс разделов на живых данных хостинга (14.11.2026). Скачивает файлы через stget.py, рисует все разделы,
# выход 1 — где данные есть, а на экране «—». Запускать перед каждой выкладкой портала.
set -u
cd "$(dirname "$0")/../../.." || exit 2
D=$(mktemp -d)
trap 'rm -rf "$D"' EXIT
for b in pf sales leads omts recl ozrev oz promises ls smv smvs; do
  (cd fabrika/work/plans_fts && timeout 100 python3 stget.py $b.bin "$D/$b.json" >/dev/null 2>&1) || echo "· $b.bin не скачан"
done
node fabrika/tools/ci/test_pulse_live.js "$D"
