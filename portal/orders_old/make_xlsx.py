# Книги по открытым заказам старше 180 дней: общая и по адресатам
import json, os, collections
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
O = json.load(open('orders_open.json', encoding='utf-8'))
OLD = sorted([x for x in O if (x['age'] or 0) > 180], key=lambda x: -(x['age'] or 0))
NEXT = sorted([x for x in O if 90 < (x['age'] or 0) <= 180], key=lambda x: -(x['age'] or 0))
def who(x):
    r = x['resp'].strip()
    if r in ('Сотрудник36 О. С.',): return 'zabelina'
    if r == 'Сотрудник21 Н.А.': return 'tochenova'
    if r == 'Сотрудник37 А. В.': return 'istomina'
    if r == 'Сотрудник18 С.В.': return 'belousova'
    if r in ('Сотрудник8 М. И.', 'Антипова И. А.', 'Михайлов А. П.'): return 'traush'
    if r in ('Сотрудник16 К.В.', 'Савидова О. М.'): return 'razahova'
    if r == 'Сотрудник24 Е. Е.': return 'shchelkanova'
    if r == 'Сотрудник87 И.С.': return 'morozova'
    if 'ВсеИнструменты' in x['client']: return 'klishina'
    return 'it1c'
HDR = ['№', 'Заказ', 'Дата заказа', 'Дней открыт', 'Покупатель', 'Ответственный в 1С', 'Подразделение', 'Статус в 1С', 'Сумма заказа, ₽', 'Остаток, шт', 'Остаток, ₽', 'Что числится в остатке', 'Комментарий в заказе', 'Причина — почему заказ не закрыт (заполнить)', 'Что сделано и когда закрыт (заполнить)']
W = [5, 16, 12, 9, 34, 20, 26, 15, 14, 10, 13, 46, 30, 40, 34]
thin = Side(style='thin', color='BBBBBB'); B = Border(left=thin, right=thin, top=thin, bottom=thin)
def sheet(ws, rows, title):
    ws['A1'] = title; ws['A1'].font = Font(name='Arial', bold=True, size=12)
    ws['A2'] = 'Источник: выгрузка базы 1С «Жилпромсервис» от 17.11.2026 (остатки по заказам покупателей). Возраст заказа посчитан на 25.11.2026. Жёлтые столбцы — для вашего ответа.'
    ws['A2'].font = Font(name='Arial', size=9, color='555555')
    for i, h in enumerate(HDR, 1):
        c = ws.cell(row=4, column=i, value=h); c.font = Font(name='Arial', bold=True, size=10); c.alignment = Alignment(wrap_text=True, vertical='center', horizontal='center'); c.border = B
        c.fill = PatternFill('solid', fgColor='FFF2A8' if i >= 14 else 'E8ECF2'); ws.column_dimensions[get_column_letter(i)].width = W[i - 1]
    ws.row_dimensions[4].height = 44
    for n, x in enumerate(rows, 1):
        num = x['num'] if x['in_head'] else x['num'].replace('Заказ покупателя ', '').split(' от ')[0]
        v = [n, num, '.'.join(reversed(x['date'].split('-'))), x['age'], x['client'] or '(в выгрузке нет карточки заказа)', x['resp'] or '(не указан)', x['dep'], x['status'], x['doc_sum'] or None, x['rest_qty'], x['rest_sum'], x['items'], x['comment'], '', '']
        for i, val in enumerate(v, 1):
            c = ws.cell(row=4 + n, column=i, value=val); c.font = Font(name='Arial', size=10); c.border = B; c.alignment = Alignment(wrap_text=True, vertical='top')
            if i in (9, 11): c.number_format = '#,##0'
            if i >= 14: c.fill = PatternFill('solid', fgColor='FFFBE0')
    r = 5 + len(rows)
    ws.cell(row=r, column=5, value='Итого заказов').font = Font(name='Arial', bold=True, size=10)
    ws.cell(row=r, column=4, value='=COUNTA(B5:B%d)' % (r - 1)).font = Font(name='Arial', bold=True, size=10)
    ws.cell(row=r, column=11, value='=SUM(K5:K%d)' % (r - 1)).font = Font(name='Arial', bold=True, size=10); ws.cell(row=r, column=11).number_format = '#,##0'
    ws.freeze_panes = 'C5'
os.makedirs('out', exist_ok=True)
wb = Workbook(); sheet(wb.active, OLD, 'Открытые заказы покупателей старше 180 дней — реестр на 25.11.2026'); wb.active.title = 'Старше 180 дней'
ws = wb.create_sheet('91–180 дней (на подходе)'); sheet(ws, NEXT, 'Открытые заказы 91–180 дней — следующие на очереди (для сведения)')
ws = wb.create_sheet('Сводка'); ws['A1'] = 'По ответственным (старше 180 дней)'; ws['A1'].font = Font(name='Arial', bold=True, size=12)
for i, h in enumerate(['Ответственный в 1С', 'Заказов', 'Остаток, ₽'], 1):
    ws.cell(row=3, column=i, value=h).font = Font(name='Arial', bold=True, size=10)
c = collections.Counter(); s = collections.Counter()
for x in OLD: k = x['resp'] or '(не указан)'; c[k] += 1; s[k] += x['rest_sum']
for n, (k, v) in enumerate(c.most_common(), 4):
    ws.cell(row=n, column=1, value=k).font = Font(name='Arial', size=10); ws.cell(row=n, column=2, value=v).font = Font(name='Arial', size=10)
    d = ws.cell(row=n, column=3, value=round(s[k])); d.number_format = '#,##0'; d.font = Font(name='Arial', size=10)
ws.column_dimensions['A'].width = 30; ws.column_dimensions['B'].width = 10; ws.column_dimensions['C'].width = 14
wb.save('out/Открытые_заказы_старше_180_дней_25.11.2026.xlsx')
G = collections.defaultdict(list)
for x in OLD: G[who(x)].append(x)
stat = {}
for k, rows in G.items():
    wb = Workbook(); sheet(wb.active, rows, 'Открытые заказы покупателей старше 180 дней — ваш список на 25.11.2026'); wb.active.title = 'Старше 180 дней'
    f = 'out/Заказы_старше_180_дней_%s.xlsx' % k; wb.save(f); stat[k] = {'n': len(rows), 'sum': round(sum(r['rest_sum'] for r in rows)), 'file': f, 'nums': [(r['num'] if r['in_head'] else r['num'].replace('Заказ покупателя ', '').split(' от ')[0]).strip() for r in rows]}
json.dump(stat, open('out/stat.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(OLD), round(sum(x['rest_sum'] for x in OLD)), len(NEXT), round(sum(x['rest_sum'] for x in NEXT)))
for k, v in stat.items(): print(k, v['n'], v['sum'], os.path.getsize(v['file']))
