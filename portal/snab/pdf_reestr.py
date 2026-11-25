# PDF реестра поставки за день: 1) сверка с планом машин, 2) документы по поставщикам — строки, суммы, что дослать.
# python3 pdf_reestr.py data_0911 <выход.pdf>
import sys, importlib
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
F = '/usr/share/fonts/truetype/dejavu/'
pdfmetrics.registerFont(TTFont('C', F + 'DejaVuSansCondensed.ttf'))
pdfmetrics.registerFont(TTFont('CB', F + 'DejaVuSansCondensed-Bold.ttf'))
M = importlib.import_module(sys.argv[1]); out = sys.argv[2]
D, PLAN, DATE = M.D, M.PLAN, M.DATE
m2 = lambda x: f"{x:,.2f}".replace(',', ' ').replace('.', ',')
qf = lambda x: (f"{x:,.0f}".replace(',', ' ') if float(x).is_integer() else f"{x:,.1f}".replace(',', ' ').replace('.', ','))
st = lambda n, **k: ParagraphStyle(n, fontName=k.pop('f', 'C'), fontSize=k.pop('s', 9), leading=k.pop('l', 11), **k)
H1, H2, P, PB = st('h1', f='CB', s=14, l=17), st('h2', f='CB', s=11, l=14, spaceBefore=6), st('p'), st('pb', f='CB')
TOT = sum(d[2] for d in D)
el = [Paragraph(f"Реестр документов поставки — «Снабжение _Производство» — {DATE}.2026", H1),
      Paragraph(f"{len(D)} документов, {m2(TOT)} ₽ без НДС. Источник — фото УПД в группе MAX; цены и суммы без НДС, как в УПД.", P), Spacer(1, 4)]
el.append(Paragraph("1. Сверка с планом машин " + getattr(M, 'PLAN_SRC', ''), H2))
mark = lambda ok: '?' if ok is None else ('да' if ok else 'нет')
t = [[Paragraph(x, PB) for x in ('Позиция плана', 'Пришло', 'По документам')]] + [[Paragraph(n, P), Paragraph(mark(ok), P), Paragraph(c, P)] for n, ok, c in PLAN]
T = Table(t, colWidths=[70*mm, 22*mm, 180*mm], repeatRows=1)
T.setStyle(TableStyle([('GRID', (0, 0), (-1, -1), 0.4, colors.grey), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8eef5')), ('VALIGN', (0, 0), (-1, -1), 'TOP')]
                      + [('BACKGROUND', (1, i), (1, i), colors.HexColor('#fde2e2') if ok is False else colors.HexColor('#fff4cc') if ok is None else colors.HexColor('#e2f5e4')) for i, (_, ok, _) in enumerate(PLAN, 1)]))
el += [T, Paragraph("2. Документы по поставщикам", H2)]
rows = [[Paragraph(x, PB) for x in ('№', 'Поставщик / документ', 'Товар', 'Кол-во', 'Ед.', 'Цена', 'Сумма', 'Дослать')]]
sty = [('GRID', (0, 0), (-1, -1), 0.4, colors.grey), ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e8eef5')), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
       ('ALIGN', (3, 1), (3, -1), 'RIGHT'), ('ALIGN', (5, 1), (6, -1), 'RIGHT')]
for i, (s, doc, tot, L, need) in enumerate(D, 1):
    r0 = len(rows)
    for j, (n, q, u, p, sm) in enumerate(L):
        rows.append([Paragraph(str(i), P) if j == 0 else '', Paragraph(f"<b>{s}</b><br/>{doc}", P) if j == 0 else '', Paragraph(n.strip(), P),
                     qf(q), u, m2(p), m2(sm), Paragraph(need or '—', P) if j == 0 else ''])
    rows.append(['', '', Paragraph('Итого по документу', PB), '', '', '', Paragraph(m2(tot), PB), ''])
    r1 = len(rows) - 1
    sty += [('SPAN', (0, r0), (0, r1)), ('SPAN', (1, r0), (1, r1)), ('SPAN', (7, r0), (7, r1)), ('BACKGROUND', (2, r1), (6, r1), colors.HexColor('#f3f3f3'))]
rows.append(['', Paragraph('ВСЕГО', PB), '', '', '', '', Paragraph(m2(TOT), PB), ''])
sty += [('BACKGROUND', (0, len(rows) - 1), (-1, len(rows) - 1), colors.HexColor('#e8eef5'))]
T2 = Table(rows, colWidths=[8*mm, 52*mm, 92*mm, 20*mm, 12*mm, 22*mm, 26*mm, 40*mm], repeatRows=1)
T2.setStyle(TableStyle(sty + [('FONTNAME', (0, 0), (-1, -1), 'C'), ('FONTSIZE', (0, 0), (-1, -1), 9)]))
el.append(T2)
SimpleDocTemplate(out, pagesize=landscape(A4), leftMargin=12*mm, rightMargin=12*mm, topMargin=10*mm, bottomMargin=10*mm,
                  title=f"Реестр поставки {DATE}.2026", author="Фабрика").build(el)
print(out)
