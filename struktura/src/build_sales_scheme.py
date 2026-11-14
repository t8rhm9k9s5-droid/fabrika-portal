# -*- coding: utf-8 -*-
"""Блок-схема коммерческого отдела (A3, альбомная): подчинение + ключевые функции."""
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
from reportlab.lib.pagesizes import A3, landscape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

F = _os.path.join(_SRC, "fonts", "DejaVuSans")
pdfmetrics.registerFont(TTFont("DJ", F + ".ttf"))
pdfmetrics.registerFont(TTFont("DJB", F + "-Bold.ttf"))
OUT = _os.path.join(_ROOT, "out", "Коммерческий_отдел_блок-схема.pdf")
PW, PH = landscape(A3)
RED = (1.0, 0.12, 0.12); RED_D = (0.8, 0, 0); RED_L = (1.0, 0.78, 0.78)
GREY = (0.925, 0.925, 0.925); PANEL = (0.969, 0.969, 0.969)
INK = (0.1, 0.1, 0.1); BODY = (0.25, 0.25, 0.25); MUTED = (0.47, 0.47, 0.47)

BW, GAP = 206, 20                         # ширина блока и зазор между колонками
X0 = (PW - (5 * BW + 4 * GAP)) / 2
COLX = [X0 + i * (BW + GAP) for i in range(5)]

def wrap(text, font, size, maxw):
    out, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if pdfmetrics.stringWidth(t, font, size) <= maxw: cur = t
        else:
            if cur: out.append(cur)
            cur = w
    if cur: out.append(cur)
    return out

def lines_of(n):
    out = [(l, "DJB", 10.2, INK) for l in wrap(n["name"], "DJB", 10.2, n["w"] - 16)]
    out += [(l, "DJ", 8.6, MUTED) for l in wrap(n["role"], "DJ", 8.6, n["w"] - 16)]
    for f in n.get("fn", []):
        for i, l in enumerate(wrap(f, "DJ", 8.3, n["w"] - 26)):
            out.append(("• " + l if i == 0 else "   " + l, "DJ", 8.3, BODY))
    return out

def height(n):
    return 14 + sum(s + 2.6 for _, _, s, _ in lines_of(n)) + (4 if n.get("fn") else 0)

def box(c, n):
    x, y, w, h = n["x"], n["y"], n["w"], n["h"]
    head = n.get("head")
    c.setFillColorRGB(*(GREY if head else (1, 1, 1)))
    c.setStrokeColorRGB(*(RED if head else RED_L)); c.setLineWidth(1.3 if head else 1)
    c.roundRect(x, y - h, w, h, 6, stroke=1, fill=1)
    ty = y - 8
    for i, (t, f, s, col) in enumerate(lines_of(n)):
        ty -= s
        if i and f == "DJ" and t.startswith("•") and not n.get("_gap"):
            ty -= 3; n["_gap"] = True
        c.setFont(f, s); c.setFillColorRGB(*col)
        if t.startswith("•"):
            c.setFillColorRGB(*RED_D); c.drawString(x + 8, ty, "•"); c.setFillColorRGB(*col)
            c.drawString(x + 16, ty, t[2:])
        elif t.startswith("   "):
            c.drawString(x + 16, ty, t.strip())
        else:
            c.drawString(x + 8, ty, t)
        ty -= 2.6

def ln(c, pts):
    c.setStrokeColorRGB(*RED); c.setLineWidth(1)
    p = c.beginPath(); p.moveTo(*pts[0])
    for q in pts[1:]: p.lineTo(*q)
    c.drawPath(p, stroke=1, fill=0)

def N(name, role, fn=(), head=False, w=BW):
    return dict(name=name, role=role, fn=list(fn), head=head, w=w)

# REDACTED_B64_8 узлы
# Текущая редакция — из главной копии раздела (ko_data.py); если человека там нет — старые функции 24.10
import ko_data as _K
from sales_scheme_data import new_fn as _old_fn
def F_(name): return _K.scheme_fn(name) or _old_fn(name)
def R_(name, role): return (_K.SCHEME.get(name) or {}).get("role") or role
director = N("Сотрудник1 Сотрудник2 Отчество1", "Коммерческий директор", head=True, w=260)
klishina = N("Сотрудник25 Сотрудник45 Отчество11", "Начальник отдела продаж", F_("Сотрудник25 Сотрудник45 Отчество11"), head=True)
razakhova = N("Сотрудник22 Сотрудник32 Отчество10", "Директор по развитию", F_("Сотрудник22 Сотрудник32 Отчество10"), head=True)
yanina = N("Сотрудник39 Имя6 Отчество3", R_("Сотрудник39 Имя6 Отчество3", "Менеджер по проектам"), F_("Сотрудник39 Имя6 Отчество3"))
mashinsky_a = N("Сотрудник1 Сотрудник51 Отчество26", "Руководитель направления e-commerce", F_("Сотрудник1 Сотрудник51 Отчество26"), head=True)
trausch = N("Сотрудник7 Сотрудник15 Отчество7", "Руководитель сети офисов продаж, г. Краснодар", F_("Сотрудник7 Сотрудник15 Отчество7"), head=True)
sales_team = [N("Сотрудник46 Имя15 Отчество12", "Офис-менеджер", F_("Сотрудник46 Имя15 Отчество12")),
              N("Сотрудник23 Имя18 Отчество14", "Офис-менеджер", F_("Сотрудник23 Имя18 Отчество14"))]
# Сотрудник28 Е. с 01.11 подчиняется Сотрудник1 А. А. (решение Т. В. Сотрудник1 26–27.10)
# 14.11.2026, Т. В.: Сотрудник28 Е. не работает — на схеме место «кто ведёт маркетплейсы» до ответа Сотрудник1 А. А.
krizhvec = N("Маркетплейсы — кто ведёт, уточняется", "вместо Сотрудник28 Е. (не работает с 11.2026)", [], w=BW - 18)
key_team = [N("Сотрудник24 Имя9 Отчество5", "Офис-менеджер", F_("Сотрудник24 Имя9 Отчество5")),
            N("Сотрудник21 Имя7 Отчество4", R_("Сотрудник21 Имя7 Отчество4", "Офис-менеджер"), F_("Сотрудник21 Имя7 Отчество4"))]
burova = N("Сотрудник18 Сотрудник48 Отчество23", "Руководитель офиса продаж, г. Сотрудник13 Имя3", F_("Сотрудник18 Сотрудник48 Отчество23"), head=True)
belousova = N("Сотрудник16 Имя6 Отчество22", "Руководитель офиса продаж, г. Екатеринбург",
              F_("Сотрудник16 Имя6 Отчество22"), head=True)
istomina = N("Сотрудник47 Имя7 Отчество6", "Офис-менеджер (осн.), менеджер (вн. совм.), г. Екатеринбург", F_("Сотрудник47 Имя7 Отчество6"), w=BW - 18)
col4 = [N("Сотрудник19 Сотрудник49 Отчество24", "Менеджер, г. Самара", F_("Сотрудник19 Сотрудник49 Отчество24")),
        N("Сотрудник50 Имя16 Отчество5", "Менеджер, г. Краснодар", F_("Сотрудник50 Имя16 Отчество5")),
        N("Сотрудник17 Сотрудник3 Отчество25", "Менеджер, г. Краснодар", F_("Сотрудник17 Сотрудник3 Отчество25")),
        N("Сотрудник20 Сотрудник40 Отчество22", "Менеджер, г. Симферополь", F_("Сотрудник20 Сотрудник40 Отчество22"))]

ALL = [director, klishina, razakhova, yanina, mashinsky_a, krizhvec, trausch, *sales_team, *key_team, burova, belousova, istomina, *col4]
for n in ALL: n["h"] = height(n)

# REDACTED_B64_8 раскладка
# колонки: 0–1 ОП Рязань (две подколонки), 2 Развитие + E-commerce, 3–4 Филиальная сеть
TOP = PH - 62
director.update(x=(PW - director["w"]) / 2, y=TOP - 22)
L1Y = director["y"] - director["h"] - 50
l1h = max(klishina["h"], trausch["h"])
klishina["h"] = trausch["h"] = l1h
klishina.update(x=(COLX[0] + COLX[1] + BW) / 2 - BW / 2, y=L1Y)
trausch.update(x=(COLX[3] + COLX[4] + BW) / 2 - BW / 2, y=L1Y)
L2Y = L1Y - l1h - 38

def stack(nodes, x, y, gap=10):
    for n in nodes:
        n.update(x=x, y=y); y -= n["h"] + gap
    return y

SUBL = 15                                   # место под подпись подгруппы
stack(sales_team, COLX[0], L2Y - SUBL)
stack(key_team, COLX[1], L2Y - SUBL)
y = stack([razakhova, yanina], COLX[2], L1Y)
ECOM_TOP = y - 14                           # верх панели E-commerce
mashinsky_a.update(x=COLX[2], y=ECOM_TOP - 30)
krizhvec.update(x=COLX[2] + 18, y=mashinsky_a["y"] - mashinsky_a["h"] - 10)
y = stack([burova, belousova], COLX[3], L2Y)
istomina.update(x=COLX[3] + 18, y=y)
stack(col4, COLX[4], L2Y)

# REDACTED_B64_8 рисование
c = canvas.Canvas(OUT, pagesize=(PW, PH))
c.setTitle("Коммерческий отдел — блок-схема"); c.setAuthor("ГК «Фабрикант»")
bar = 44
c.setFillColorRGB(*RED); c.rect(0, PH - bar, PW, bar, fill=1, stroke=0)
lh = 22; c.drawImage(_os.path.join(_SRC, "logo_on_red.png"), 28, PH - bar + (bar - lh) / 2, width=259 * lh / 59, height=lh)
c.setFillColorRGB(1, 1, 1); c.setFont("DJB", 16)
c.drawString(28 + 259 * lh / 59 + 18, PH - bar + 16, "Коммерческий отдел: функциональная блок-схема")

# фоновые панели направлений
bottom = min(n["y"] - n["h"] for n in ALL) - 16
def panel(title, x1, x2, ytop, ybot):
    c.setFillColorRGB(*PANEL); c.roundRect(x1 - 8, ybot, x2 - x1 + 16, ytop - ybot, 8, stroke=0, fill=1)
    c.setFillColorRGB(*MUTED); c.setFont("DJB", 9); c.drawString(x1, ytop - 18, title.upper())
panel("ОП Рязань", COLX[0], COLX[1] + BW, L1Y + 30, bottom)
panel("Развитие", COLX[2], COLX[2] + BW, L1Y + 30, ECOM_TOP + 6)
panel("E-commerce", COLX[2], COLX[2] + BW, ECOM_TOP, bottom)
panel("Филиальная сеть", COLX[3], COLX[4] + BW, L1Y + 30, bottom)

# линии подчинения
dx, dy = director["x"] + director["w"] / 2, director["y"] - director["h"]
bus = dy - 26
kx, tx = klishina["x"] + BW / 2, trausch["x"] + BW / 2
ln(c, [(dx, dy), (dx, bus)])
ln(c, [(kx, bus), (tx, bus)])
for n in (klishina, trausch): ln(c, [(n["x"] + BW / 2, bus), (n["x"] + BW / 2, n["y"])])
# развитие и e-commerce: общая линия слева от колонки
sx2 = COLX[2] - 9
dev = [razakhova, yanina, mashinsky_a]
ln(c, [(sx2, bus), (sx2, dev[-1]["y"] - 22)])
for n in dev: ln(c, [(sx2, n["y"] - 22), (n["x"], n["y"] - 22)])

def subtree(parent, cols, tb):
    px, py = parent["x"] + BW / 2, parent["y"] - parent["h"]
    ln(c, [(px, py), (px, tb)])
    ln(c, [(cols[0][0], tb), (cols[-1][0], tb)])
    for sx, kids in cols:
        ln(c, [(sx, tb), (sx, kids[-1]["y"] - kids[-1]["h"] / 2)])
        for ch in kids: ln(c, [(sx, ch["y"] - ch["h"] / 2), (ch["x"], ch["y"] - ch["h"] / 2)])

tb = L2Y + 22
subtree(klishina, [(COLX[0] - 9, sales_team), (COLX[1] - 9, key_team)], tb)
c.setFillColorRGB(*MUTED); c.setFont("DJB", 7.6)
c.drawString(COLX[0], L2Y - SUBL + 5, "ОТДЕЛ ПРОДАЖ")
c.drawString(COLX[1], L2Y - SUBL + 5, "КЛЮЧЕВЫЕ КЛИЕНТЫ")
subtree(trausch, [(COLX[3] - 9, [burova, belousova]), (COLX[4] - 9, col4)], tb)
bx = belousova["x"] + 9
ln(c, [(bx, belousova["y"] - belousova["h"]), (bx, istomina["y"] - istomina["h"] / 2),
       (istomina["x"], istomina["y"] - istomina["h"] / 2)])
mx = mashinsky_a["x"] + 9
ln(c, [(mx, mashinsky_a["y"] - mashinsky_a["h"]), (mx, krizhvec["y"] - krizhvec["h"] / 2),
       (krizhvec["x"], krizhvec["y"] - krizhvec["h"] / 2)])

for n in ALL: box(c, n)

# легенда и подпись — вверху, по сторонам от коммерческого директора
ly = director["y"] - director["h"] / 2 - 6
c.setFillColorRGB(*GREY); c.setStrokeColorRGB(*RED); c.setLineWidth(1.3); c.roundRect(28, ly, 22, 12, 3, stroke=1, fill=1)
c.setFillColorRGB(*BODY); c.setFont("DJ", 8); c.drawString(56, ly + 3, "руководитель")
c.setFillColorRGB(1, 1, 1); c.setStrokeColorRGB(*RED_L); c.setLineWidth(1); c.roundRect(130, ly, 22, 12, 3, stroke=1, fill=1)
c.setFillColorRGB(*BODY); c.drawString(158, ly + 3, "сотрудник")
ln(c, [(222, ly + 6), (250, ly + 6)]); c.drawString(256, ly + 3, "прямое подчинение")
c.setFillColorRGB(*MUTED); c.setFont("DJ", 7.5)
c.drawRightString(PW - 28, ly + 9, "Функции указаны кратко, подробно: «Коммерческий_отдел_функционал.pdf»")
c.drawRightString(PW - 28, ly - 3, f"Редакция {_K.EDITION}: правки руководителей и решения Т. В. Сотрудник1 (26–27.10)")
c.drawRightString(PW - 28, ly - 15, "ФИО и должности — отдел кадров (23.10) · проект для обсуждения")
c.save()
print("saved", OUT, "| bottom y", round(bottom))
