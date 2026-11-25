#!/usr/bin/env python3
"""Книга «Застойные остатки — к декабрьской распродаже» (25.11.2026). Источник — out_stale.json (stale.py), списки распродажи Сотрудник8 от 16.11 (traush_lists.json)."""
import json, re, collections, sys
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter
R = json.load(open('out_stale.json')); T = json.load(open('traush_lists.json'))
nk = lambda s: re.sub(r'[^a-zа-я0-9]+', '', str(s).lower().replace('ё', 'е'))
REG = {'Екатеринбург': 'ОП Екатеринбург', 'Краснодар': 'ОП Краснодар', 'Самара': 'ОП Самара'}
inlist = {}
for reg, rows in T.items():
    for x in rows:
        inlist[(REG[reg], nk(x['Товары (работы, услуги)']))] = x.get('Цена со скидкой') or x.get('Цена')
only = sys.argv[1:] or None
F = lambda **k: Font(name='Arial', **k); thin = Side(style='thin', color='C8C8C8'); BR = Border(top=thin, bottom=thin, left=thin, right=thin)
HF = PatternFill('solid', fgColor='DDE5F0'); Y = PatternFill('solid', fgColor='FFF2B3'); RD = PatternFill('solid', fgColor='F8D4D0')
wb = Workbook(); ws = wb.active; ws.title = 'Сводка'
regs = [r for r in ['ОП Москва Денежниково', 'ОП Самара', 'ОП Краснодар', 'ОП Екатеринбург', 'ОП Сотрудник14 Имя3', 'ОП Симферополь', 'Рязань'] if not only or r in only]
ws['A1'] = 'Застойные остатки готовой продукции — к декабрьской распродаже'; ws['A1'].font = F(bold=True, size=14)
ws['A2'] = 'Источник: отчёт 1С «Товары на складах» за октябрь и 01–24 ноября 2026. Цена — минимальная цена модели по прайс-листу от 28.10.2026 (оценка, точная цена зависит от исполнения).'; ws['A2'].font = F(size=9, italic=True)
ws['A3'] = 'Без расхода 2 месяца — позиция была на складе уже в октябре и не отгружалась ни в октябре, ни в ноябре. Без расхода 1 месяц — не отгружалась в ноябре. Склады рекламаций и брака не учтены.'; ws['A3'].font = F(size=9, italic=True)
H = ['Склад', 'Остаток, шт', 'Без расхода 2 мес., шт', 'Без расхода 2 мес., ₽ по прайсу', 'Без расхода 1 мес., шт', 'Без расхода 1 мес., ₽ по прайсу', 'Позиций в списке распродажи от 16.11', 'Застой 2 мес. вне списка, позиций']
for j, h in enumerate(H, 1):
    c = ws.cell(5, j, h); c.font = F(bold=True); c.fill = HF; c.border = BR; c.alignment = Alignment(wrap_text=True, vertical='center')
names = {}
for i, reg in enumerate(regs):
    nm = reg.replace('ОП ', '').replace(' Денежниково', '')[:28]; names[reg] = nm
    sh = wb.create_sheet(nm); rows = [r for r in R if r['reg'] == reg and r['st'] in ('2мес', '1мес')]
    rows.sort(key=lambda r: (0 if r['st'] == '2мес' else 1, -(r['sum'] or 0)))
    sh['A1'] = '%s — позиции без расхода (сначала 2 месяца, затем 1 месяц), по убыванию суммы' % reg; sh['A1'].font = F(bold=True, size=12)
    HH = ['Склад', 'Группа', 'Модель', 'Исполнение', 'Остаток, шт', 'Расход окт., шт', 'Расход ноя., шт', 'Без расхода', 'Цена прайса от, ₽', 'Сумма по прайсу, ₽', 'В списке распродажи 16.11 — цена, ₽', 'Предлагаемая скидка, %', 'Цена со скидкой, ₽', 'Комментарий офиса']
    for j, h in enumerate(HH, 1):
        c = sh.cell(3, j, h); c.font = F(bold=True); c.fill = HF; c.border = BR; c.alignment = Alignment(wrap_text=True, vertical='center')
    for n, r in enumerate(rows, 4):
        lp = inlist.get((reg, nk(r['model'] + r['ch'])))
        vals = [r['wh'], r['grp'], r['model'], r['ch'], r['q'], r['out10'] if r['out10'] is not None else '—', r['out11'], '2 месяца' if r['st'] == '2мес' else '1 месяц', r['p'], '=IF(I%d="","",E%d*I%d)' % (n, n, n), lp if lp else '', '', '=IF(OR(I%d="",L%d=""),"",ROUND(I%d*(1-L%d/100),0))' % (n, n, n, n), '']
        for j, v in enumerate(vals, 1):
            c = sh.cell(n, j, v); c.font = F(size=9); c.border = BR; c.alignment = Alignment(wrap_text=True, vertical='top')
            if j in (12, 14): c.fill = Y
            if j == 8 and r['st'] == '2мес': c.fill = RD
            if j in (9, 10, 11, 13): c.number_format = '#,##0'
    last = 3 + len(rows)
    sh.cell(last + 2, 4, 'Итого').font = F(bold=True); sh.cell(last + 2, 5, '=SUM(E4:E%d)' % last).font = F(bold=True); c = sh.cell(last + 2, 10, '=SUM(J4:J%d)' % last); c.font = F(bold=True); c.number_format = '#,##0'
    for col, w in zip('ABCDEFGHIJKLMN', (26, 16, 24, 44, 9, 9, 9, 11, 11, 13, 14, 12, 12, 28)): sh.column_dimensions[col].width = w
    sh.freeze_panes = 'A4'; sh.auto_filter.ref = 'A3:N%d' % last
    q = "'%s'" % nm; rr = 6 + i
    allq = sum(x['q'] for x in R if x['reg'] == reg)
    out2 = sum(1 for x in rows if x['st'] == '2мес' and (reg, nk(x['model'] + x['ch'])) not in inlist and 'выставк' not in x['wh'].lower())
    vals = [reg, allq, '=SUMIFS(%s!E4:E%d,%s!H4:H%d,"2 месяца")' % (q, last, q, last), '=SUMIFS(%s!J4:J%d,%s!H4:H%d,"2 месяца")' % (q, last, q, last), '=SUMIFS(%s!E4:E%d,%s!H4:H%d,"1 месяц")' % (q, last, q, last), '=SUMIFS(%s!J4:J%d,%s!H4:H%d,"1 месяц")' % (q, last, q, last),
            sum(1 for k in inlist if k[0] == reg) or 'списка нет', out2 if any(k[0] == reg for k in inlist) else '—']
    for j, v in enumerate(vals, 1):
        c = ws.cell(rr, j, v); c.font = F(); c.border = BR
        if j in (2, 3, 4, 5, 6): c.number_format = '#,##0'
rr = 6 + len(regs)
ws.cell(rr, 1, 'Итого').font = F(bold=True)
for j in (2, 3, 4, 5, 6):
    c = ws.cell(rr, j, '=SUM(%s6:%s%d)' % (get_column_letter(j), get_column_letter(j), rr - 1)); c.font = F(bold=True); c.number_format = '#,##0'; c.border = BR
notes = ['Как пользоваться:', '1. На листе своего склада в жёлтом столбце «Предлагаемая скидка, %» поставьте скидку — цена со скидкой посчитается сама.',
         '2. Красным отмечены позиции без расхода два месяца — с них стоит начать.', '3. В столбце «В списке распродажи 16.11» — цена из вашего списка, если позиция в нём уже есть.',
         '4. Скидка больше 5 % согласуется с Т. В. Сотрудник1 — пришлите заполненный файл ответом на письмо.']
for i, t in enumerate(notes): ws.cell(rr + 2 + i, 1, t).font = F(bold=(i == 0), size=10)
for col, w in zip('ABCDEFGH', (30, 13, 16, 18, 16, 18, 18, 18)): ws.column_dimensions[col].width = w
out = 'Застойные_остатки_к_распродаже_25.11.2026%s.xlsx' % ('' if not only else '_' + names[only[0]])
wb.save(out); print(out)
