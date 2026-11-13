# -*- coding: utf-8 -*-
"""Раздел «Коммерческий отдел» — главная копия хранится готовым HTML в папке ko_master/.

С 26.10 раздел вёл чат «Фабрика1»: добавил слои правок Сотрудник6 М. И., Сотрудник1 А. А. и решения Т. В. Сотрудник1,
ответы, графики и подрядчиков. Генератор этих слоёв в пакет не попал, поэтому раздел хранится как опубликован (редакция 28.10):
  ko_master/razdel_v_orgstrukture.html      — раздел внутри сайта «Оргструктура» (от <section id="roles"> до </section>)
  ko_master/stranica_kommercheskiy_otdel.html — тот же раздел на отдельной странице (<main class="wrap ko">…</main>)
  ko_master/dop_stili.css                    — стили новых слоёв (оранжевый, бирюзовый, малиновый)
  ko_master/shapka_i_podval.txt              — шапка и подвал отдельной страницы
Правка функционала = правка ОБОИХ html-файлов одинаково (проверка: python src/proverka.py).
sales_section.py даёт только общие стили и скрипты раздела; его данные (редакция 24.10) на сайты больше не идут."""
from _cg1_file_io import read_file as _cg1_read_file, load_json as _cg1_load_json
import os
_SRC = os.path.dirname(os.path.abspath(__file__))
_D = os.path.join(_SRC, "ko_master")
_rd = lambda n: _cg1_read_file(os.path.join(_D, n), encoding="utf-8")

ORG_SECTION = _rd("razdel_v_orgstrukture.html")
PAGE_MAIN = _rd("stranica_kommercheskiy_otdel.html")
_lines = [l for l in _rd("shapka_i_podval.txt").splitlines() if l.strip() and not l.startswith("#")]
PAGE_FACTS, PAGE_FOOTER = _lines[0], _lines[1]
EXTRA_CSS = _rd("dop_stili.css").rstrip("\n")

_MARK = ".ko .chg-cols .h-list li::marker{color:var(--ins3)}"
_COLS4 = ".ko .chg-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 24px}"
_COLS3 = ".ko .chg-cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 24px}"

def section_css(css):
    """Общие стили раздела + стили новых слоёв; «Что изменилось» — в три колонки."""
    assert css.count(_MARK) == 1 and css.count(_COLS4) == 1
    return css.replace(_MARK, _MARK + "\n" + EXTRA_CSS, 1).replace(_COLS4, _COLS3, 1)
