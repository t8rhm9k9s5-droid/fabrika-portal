# -*- coding: utf-8 -*-
"""PDF «Коммерческий отдел — функционал сотрудников» в текущей редакции (чистовик).
Данные — из главной копии раздела (ko_data.py ← ko_master/stranica_kommercheskiy_otdel.html), оформление — как в build_sales_duties.py.
Результат: out/Коммерческий_отдел_функционал.pdf"""
import os
from xml.sax.saxutils import escape as X
import build_sales_duties as B          # стили, шрифты, цвета (данные редакции 24.10 оттуда не берутся)
from build_sales_duties import (st, W, H, M, RED, RED_D, GREY, LINE, MUTED, colors, mm, A4, Paragraph, Spacer, Table,
                                TableStyle, KeepTogether, PageBreak, BaseDocTemplate, PageTemplate, Frame)
from reportlab.platypus import ListFlowable, ListItem
import ko_data as K

_SRC = os.path.dirname(os.path.abspath(__file__)); _ROOT = os.path.dirname(_SRC)
OUT = os.path.join(_ROOT, "out", "Коммерческий_отдел_функционал.pdf")
P_ = lambda t, s="body": Paragraph(X(t).replace("\n", "<br/>"), st[s])

def on_page(c, doc):
    c.saveState()
    bar = 15 * mm
    c.setFillColor(RED); c.rect(0, H - bar, W, bar, fill=1, stroke=0)
    lh = 6.5 * mm; lw = 259 * lh / 59
    c.drawImage(os.path.join(_SRC, "logo_on_red.png"), M, H - bar + (bar - lh) / 2, width=lw, height=lh)
    c.setFillColor(colors.white); c.setFont("DJB", 10)
    c.drawRightString(W - M, H - bar + 5.6 * mm, "Коммерческий отдел · функционал сотрудников")
    c.setFont("DJ", 7.5); c.setFillColor(MUTED)
    c.drawString(M, 9 * mm, f"ГК «Фабрикант» · редакция {K.EDITION}.2026 · проект для обсуждения")
    c.drawRightString(W - M, 9 * mm, f"стр. {doc.page}")
    c.restoreState()

def person_block(p):
    cont = " · ".join(p["emails"] + p["phones"] + p["notes"]) or "Контактные данные пока не указаны"
    hdr = Table([[P_(p["name"], "name")], [P_(p["role"], "role")], [P_(cont, "cont")]], colWidths=[W - 2 * M])
    hdr.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GREY if p["head"] else colors.white),
        ("BOX", (0, 0), (-1, -1), 1.1, RED if p["head"] else LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (0, 0), 7), ("BOTTOMPADDING", (0, -1), (-1, -1), 7),
        ("TOPPADDING", (0, 1), (-1, -1), 1), ("BOTTOMPADDING", (0, 0), (-1, -2), 1)]))
    items = (ListFlowable([ListItem(P_(d), leftIndent=12, value="•") for d in p["duties"]], bulletType="bullet",
                          bulletFontName="DJ", bulletFontSize=9, bulletColor=RED_D, leftIndent=12)
             if p["duties"] else P_("Функционал пока не заполнен."))
    inner = [hdr, Spacer(1, 5)]
    if p["purpose"]: inner.append(Paragraph(f"<b>Назначение роли.</b> {X(p['purpose'])}", st["body"]))
    if p["boss"]: inner.append(Paragraph(f"<b>Подчиняется:</b> {X(p['boss'])}", st["body"]))
    inner += [Paragraph("Основные функции", st["lab"]), items, Spacer(1, 3)]
    for lab, val in p["paragraphs"]:
        inner.append(Paragraph((f"<b>{X(lab)}:</b> " if lab else "") + X(val).replace("\n", "<br/>"), st["body"]))
    inner.append(Spacer(1, 14))
    return KeepTogether(inner)

def table(t, widths):
    rows = [[P_(h, "cellh") for h in t["columns"]]] + [[P_(c, "cell") for c in r] for r in t["rows"]]
    tb = Table(rows, colWidths=[w * mm for w in widths], repeatRows=1)
    tb.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), GREY), ("LINEBELOW", (0, 0), (-1, 0), 1, RED),
        ("LINEBELOW", (0, 1), (-1, -1), 0.4, LINE), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 3.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4)]))
    return tb

def fit(n, total=(W - 2 * M) / mm):
    """Ширины колонок: последняя («Прислал(а)» / «Ответил(а)») уже остальных."""
    last = 30 if n > 3 else 40
    rest = (total - last) / (n - 1)
    return [rest] * (n - 1) + [last]

def build():
    doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=M, rightMargin=M, topMargin=24 * mm, bottomMargin=17 * mm,
                          title="Коммерческий отдел — функционал сотрудников", author="ГК «Фабрикант»")
    doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(M, 17 * mm, W - 2 * M, H - 41 * mm, id="f",
                         leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)], onPage=on_page)])
    total = sum(len(pp) for _, pp in K.PEOPLE)
    note = Table([[Paragraph(
        "Функционал каждого сотрудника коммерческого отдела в текущей редакции (чистовик, без пометок): назначение роли, "
        "основные функции, подчинённость, скидки, замещение, взаимодействие и результат работы. "
        f"Редакция {K.EDITION}: правки Сотрудник19 Ю. А., Сотрудник16 К. В., отдела кадров, Сотрудник6 М. И., Сотрудник1 А. А. "
        "и решения коммерческого директора Т. В. Сотрудник1. Правки цветом — на странице «Коммерческий отдел».", st["note"])]],
        colWidths=[W - 2 * M])
    note.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f7f7f7")), ("BOX", (0, 0), (-1, -1), 0.8, LINE),
                              ("LEFTPADDING", (0, 0), (-1, -1), 9), ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                              ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7)]))
    summary = {"columns": ["№", "Сотрудник", "Должность", "Подчиняется"],
               "rows": [[str(i + 1), p["name"], p["role"], p["boss"]] for i, p in enumerate(p for _, pp in K.PEOPLE for p in pp)]}
    story = [Paragraph("Коммерческий отдел: функционал сотрудников", st["title"]),
             Paragraph(f"ГК «Фабрикант» · ОП Рязань, e-commerce и сеть офисов продаж · {total} сотрудников", st["sub"]),
             note, Spacer(1, 12), Paragraph("Состав отдела", st["h2"]), table(summary, [8, 50, 58, (W - 2 * M) / mm - 116])]
    for g, pp in K.PEOPLE:
        story += [PageBreak(), Paragraph(g, st["h2"])] + [person_block(p) for p in pp]
    for name, t in K.TABLES.items():
        story += [PageBreak(), Paragraph(name, st["h2"]), table(t, fit(len(t["columns"])))]
    doc.build(story)
    print("saved", OUT)

if __name__ == "__main__":
    build()
