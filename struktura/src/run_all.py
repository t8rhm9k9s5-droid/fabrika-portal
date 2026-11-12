# -*- coding: utf-8 -*-
"""Полная пересборка оргструктуры, коммерческого отдела и форм 1С. Работает на Windows, macOS и Linux.
Запуск из любой папки:  python src/run_all.py   (нужны Python 3.9+, reportlab, openpyxl: pip install reportlab openpyxl)
Результат: ../out (PDF, HTML, xlsx, JSON) и ../sites (страницы для публикации)."""
import os, subprocess, sys
SRC = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(SRC)
for d in ("out", "sites"): os.makedirs(os.path.join(ROOT, d), exist_ok=True)
STEPS = ["build_ko_pdf.py",         # out/Коммерческий_отдел_функционал.pdf (текущая редакция, из ko_master)
         "build_sales_scheme.py",   # out/Коммерческий_отдел_блок-схема.pdf (A3)
         "build_pdf_org.py",        # out/Оргструктура_контакты.pdf
         "build_html.py",           # out/Оргструктура_контакты.html
         "build_site.py",           # sites/fabrikant-site.html      -> артефакт «Оргструктура»
         "build_sales_site.py",     # sites/kommercheskiy-otdel.html -> артефакт «Коммерческий отдел»
         "build_1c_forms.py",       # sites/vygruzki-1c.html + out/Формы_выгрузок_1С.xlsx
         "export_html.py",          # out/Сайт_*.html — самодостаточные файлы
         "export_json.py",          # out/orgstruktura.json, out/kommercheskiy_otdel.json
         "proverka.py"]             # сверка: оба HTML раздела совпадают по сотрудникам, данные сходятся
# build_requests.py НЕ запускается: пересоздаёт таблицы запросов, уже отправленные 23.10.
# build_sales_duties.py как отдельный шаг больше не запускается: его данные — редакция 24.10 (модуль нужен для стилей).
env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
for s in STEPS:
    r = subprocess.run([sys.executable, os.path.join(SRC, s)], cwd=SRC, env=env)
    if r.returncode: sys.exit(f"ошибка в {s}")
print("готово")
