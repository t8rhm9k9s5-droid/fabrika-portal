# -*- coding: utf-8 -*-
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from data_fabrikant import (COMPANY, LEADERSHIP, DIRECTORS, SECRETARY,
                            DEPARTMENTS, DEPT_ORDER, dept_count, all_people,
                            ROMANOV_V, AREAS, AREAS_STAFF, AREA_CARDS)

F = _os.path.join(_SRC, "fonts", "DejaVuSans")
pdfmetrics.registerFont(TTFont("DJ", F + ".ttf"))
pdfmetrics.registerFont(TTFont("DJB", F + "-Bold.ttf"))
pdfmetrics.registerFont(TTFont("DJI", F + "-Oblique.ttf"))
LOGO = ImageReader(_os.path.join(_SRC, "logo_on_red.png")); LW, LH = 259, 59

PAGE = landscape(A4); PW, PH = PAGE
M = 26
RED = (1.0, 0.12, 0.12); RED_D = (0.80, 0.0, 0.0)
LIGHT = (0.925, 0.925, 0.925); DARK = (0.54, 0.08, 0.08)
INK = (0.17, 0.17, 0.17); MUTED = (0.47, 0.47, 0.47); LINE = (0.93, 0.80, 0.80)
BOXW = 185.0; GAP = 12

def wrap(text, font, size, maxw):
    out = []; cur = ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if pdfmetrics.stringWidth(t, font, size) <= maxw: cur = t
        else:
            if cur: out.append(cur)
            cur = w
    if cur: out.append(cur)
    return out or [""]

def box_lines(p):
    if p.get("fillable"):
        out = [(p["role"], "DJB", 8.6, INK), ("данные вписать", "DJI", 6.9, MUTED)]
        return out + [(f + ": ____________________", "DJ", 7.2, MUTED) for f in p.get("fill_fields", [])]
    out = [(p["name"], "DJB", 8.6, INK)]
    if p["role"]: out.append((p["role"], "DJ", 7.4, MUTED))
    out += [(e, "DJ", 7.2, RED_D) for e in p["emails"]]
    out += [(ph, "DJ", 7.4, INK) for ph in p["phones"]]
    if p["extra"]: out.append((p["extra"], "DJ", 6.9, MUTED))
    return out

def real_h(p):
    h = 8
    for txt, font, size, _ in box_lines(p):
        h += len(wrap(txt, font, size, BOXW - 14)) * (size + 2.4)
    return h + 6

UH = max(real_h(p) for p in all_people() + DEPARTMENTS["security"]["staff"]) + 2   # единая высота

def draw_box(c, x, y, p, style="plain"):
    fill, border, bw = (1, 1, 1), LINE, 0.8
    if style in ("council", "dir", "head"): fill, border, bw = LIGHT, RED, 1.1
    elif style == "gd": border, bw = RED, 1.8
    c.setFillColorRGB(*fill); c.setStrokeColorRGB(*border); c.setLineWidth(bw)
    if p.get("fillable"): c.setDash(2, 2)
    c.roundRect(x, y - UH, BOXW, UH, 7, stroke=1, fill=1); c.setDash()
    ty = y - 8
    for txt, font, size, col in box_lines(p):
        for ln in wrap(txt, font, size, BOXW - 14):
            ty -= size; c.setFont(font, size); c.setFillColorRGB(*col)
            c.drawCentredString(x + BOXW / 2, ty, ln); ty -= 2.4

def line(c, x1, y1, x2, y2):
    c.setStrokeColorRGB(*RED); c.setLineWidth(1); c.line(x1, y1, x2, y2)

def header_bar(c, title, subtitle=""):
    bar = 36
    c.setFillColorRGB(*RED); c.rect(0, PH - bar, PW, bar, fill=1, stroke=0)
    lh = 20; lw = LW * lh / LH
    c.drawImage(LOGO, M, PH - bar + (bar - lh) / 2, width=lw, height=lh)
    c.setFillColorRGB(1, 1, 1); c.setFont("DJB", 15); c.drawString(M + lw + 14, PH - bar + 13, title)
    y = PH - bar - 4
    if subtitle:
        c.setFont("DJ", 9.5); c.setFillColorRGB(*DARK); y -= 13; c.drawString(M, y, subtitle); y -= 4
    return y

def footer(c, txt):
    c.setFont("DJ", 7.5); c.setFillColorRGB(*MUTED)
    c.drawString(M, M - 8, txt); c.drawRightString(PW - M, M - 8, COMPANY)

def row(c, people, styles, y, gap=GAP):
    n = len(people); x = (PW - (BOXW * n + gap * (n - 1))) / 2; xs = []
    for i, p in enumerate(people):
        draw_box(c, x, y, p, styles[i] if isinstance(styles, list) else styles)
        xs.append(x + BOXW / 2); x += BOXW + gap
    return y - UH, xs

def cols(): return max(1, int((PW - 2 * M + GAP) // (BOXW + GAP)))

def grid(c, people, top, bus=None, head_xs=()):
    n = len(people); k = cols()
    x0 = M + (PW - 2 * M - (k * BOXW + (k - 1) * GAP)) / 2
    if bus is not None:
        xs = [x0 + BOXW / 2, x0 + (min(k, n) - 1) * (BOXW + GAP) + BOXW / 2] + list(head_xs)
        line(c, min(xs), bus, max(xs), bus)
    y = top
    for r in range(0, n, k):
        x = x0
        for p in people[r:r + k]:
            if r == 0 and bus is not None: line(c, x + BOXW / 2, bus, x + BOXW / 2, y)
            draw_box(c, x, y, p); x += BOXW + GAP
        y -= UH + 12
    return y

def heads(c, hs, y):
    bot, xs = row(c, hs, "head", y)
    bus = bot - 14
    for x in xs: line(c, x, bot, x, bus)
    return bus, xs

def sg_height(sg):
    h = 38 + (UH + 30 if sg.get("head") else 0)
    return h + -(-len(sg.get("staff", [])) // cols()) * (UH + 12)

c = canvas.Canvas(_os.path.join(_ROOT, "out", "Оргструктура_контакты.pdf"), pagesize=PAGE)

# ---- Стр. 1: верхний уровень ----
y = header_bar(c, f"{COMPANY} — оргструктура (верхний уровень)",
               "Высшее руководство · директора направлений · приёмная") - 14
lbot, lxs = row(c, LEADERSHIP, ["council", "gd", "council"], y, gap=14)
lead_cx = sum(lxs) / len(lxs)
# секретарь — сноска под правой карточкой
S = SECRETARY; scx = lxs[-1]
sl = [("ПРИЁМНАЯ", "DJB", 7.5, DARK), (S["name"], "DJB", 8.2, INK), (S["role"], "DJ", 7.2, MUTED), (S["emails"][0], "DJ", 7.2, RED_D),
      (" · ".join(x for x in [S["phones"][0], S["extra"]] if x), "DJ", 7, MUTED)]
sh = 9 + sum(sz + 2.4 for _, _, sz, _ in sl); stop = lbot - 22
c.setDash(2, 2); c.setStrokeColorRGB(*RED); c.setLineWidth(0.8); c.setFillColorRGB(0.98, 0.98, 0.98)
c.roundRect(scx - BOXW / 2, stop - sh, BOXW, sh, 6, stroke=1, fill=1); c.setDash()
ty = stop - 9
for txt, fn, sz, col in sl:
    ty -= sz; c.setFont(fn, sz); c.setFillColorRGB(*col); c.drawCentredString(scx, ty, txt); ty -= 2.4
# директора
dl = lbot - 92
c.setFont("DJB", 9); c.setFillColorRGB(*MUTED); c.drawString(M, dl, "ДИРЕКТОРА НАПРАВЛЕНИЙ")
bus = (lbot + dl - 8) / 2 - 2
line(c, lead_cx, lbot, lead_cx, bus)
_, dxs = row(c, DIRECTORS, "dir", dl - 8)
line(c, min(dxs), bus, max(dxs), bus)
for x in dxs: line(c, x, bus, x, dl - 8)
rx = dxs[DIRECTORS.index(ROMANOV_V)]
c.setFont("DJB", 8); c.setFillColorRGB(*RED_D)
c.drawCentredString(rx, dl - 8 - UH - 12, f"▼ Производственные участки: {len(AREAS)} · ≈ {AREAS_STAFF} чел. (стр. 2)")
footer(c, "Стр. 1 — верхний уровень. Стр. 2 — производственные участки, далее по одному отделу на страницу."); c.showPage()

# ---- Стр. 2: производственные участки ----
def area_lines(a):
    top = "НОЧНАЯ СМЕНА   ·   состав уточняется" if a.get("night") else f"УЧАСТОК {a['n']}   ·   ≈ {a['staff']} чел."
    out = [(top, "DJB", 7, RED_D), (a["title"], "DJB", 9, INK),
           (", ".join(a["blocks"]), "DJ", 7.2, MUTED)]
    if a.get("note"): out.append((a["note"], "DJB", 7, RED_D))
    if a.get("who"):
        w = a["who"]
        out += [(w["name"] + ("  (уточнить)" if a.get("todo") else ""), "DJB", 8, INK), (w["role"], "DJ", 7, MUTED)]
        out += [(ph, "DJ", 7.4, INK) for ph in w["phones"]] or [(w.get("extra") or "телефона нет в схеме", "DJI", 7, MUTED)]
    elif a.get("team"):
        out += [("Кладовщики: " + ", ".join(t["name"].split()[0] for t in a["team"]), "DJ", 7.2, INK)]
    else:
        out += [("Мастер не назначен", "DJI", 7.2, MUTED)]
    return out
AW = 185.0
def area_h(a):
    return 8 + sum(len(wrap(t, f, sz, AW - 14)) * (sz + 2.4) for t, f, sz, _ in area_lines(a)) + 6
AH = max(area_h(a) for a in AREA_CARDS) + 2
def area_box(c, x, y, a, h=None):
    h = h or AH
    c.setFillColorRGB(1, 1, 1); c.setStrokeColorRGB(*LINE); c.setLineWidth(0.8)
    if a.get("free"): c.setDash(2, 2)
    c.roundRect(x, y - h, AW, h, 7, stroke=1, fill=1); c.setDash()
    ty = y - 8
    for t, f, sz, col in area_lines(a):
        for l in wrap(t, f, sz, AW - 14):
            ty -= sz; c.setFont(f, sz); c.setFillColorRGB(*col); c.drawCentredString(x + AW / 2, ty, l); ty -= 2.4

y = header_bar(c, "Производственные участки", f"Директор по производству Сотрудник В. В. · {len(AREAS)} участков · стабильный состав ≈ {AREAS_STAFF} чел. · пунктир: отдельные участки без мастера") - 12
bot, rxs = row(c, [ROMANOV_V], "dir", y)
bus = bot - 14; line(c, rxs[0], bot, rxs[0], bus)
k = 4; x0 = M + (PW - 2 * M - (k * AW + (k - 1) * GAP)) / 2
line(c, x0 + AW / 2, bus, x0 + (k - 1) * (AW + GAP) + AW / 2, bus)
yy = bus - 16
for r in range(0, len(AREA_CARDS), k):
    xx = x0
    rh = max(area_h(a) for a in AREA_CARDS[r:r + k]) + 2      # одинаковая высота внутри ряда
    for a in AREA_CARDS[r:r + k]:
        if r == 0: line(c, xx + AW / 2, bus, xx + AW / 2, yy)
        area_box(c, xx, yy, a, rh); xx += AW + GAP
    yy -= rh + 12
c.setFont("DJ", 7.5); c.setFillColorRGB(*MUTED)
c.drawString(M, yy - 6, "Численность приблизительная, по схеме участков. Мастера и телефоны сверены с оргструктурой. Планирование производства: ПДО Сотрудник И. М. (см. раздел «Производство»).")
footer(c, "Стр. 2 — производственные участки"); c.showPage()

# ---- Страницы отделов ----
for idx, key in enumerate(DEPT_ORDER, 1):
    d = DEPARTMENTS[key]; total = len(DEPT_ORDER)
    sub = " · ".join([d["floor"]] + (["общая почта: " + d["email"]] if d["email"] else []) + [f"{dept_count(key)} чел."])
    y = header_bar(c, f"{idx}. {d['title']}", sub) - 12
    if d.get("note"):
        nl = wrap(d["note"], "DJ", 9.5, PW - 2 * M - 20); nh = 18 + len(nl) * 13
        c.setFillColorRGB(0.97, 0.97, 0.97); c.setStrokeColorRGB(*LINE); c.setDash(2, 2)
        c.roundRect(M, y - nh, PW - 2 * M, nh, 6, stroke=1, fill=1); c.setDash()
        c.setFont("DJ", 9.5); c.setFillColorRGB(0.35, 0.35, 0.35); ty = y - 19.5
        for ln in nl: c.drawString(M + 10, ty, ln); ty -= 13
        y -= nh + 10
    bus = None; hx = []
    if d["heads"]: bus, hx = heads(c, d["heads"], y); y = bus
    if d["staff"]: y = grid(c, d["staff"], (bus - 16) if bus else (y - 6), bus, hx)
    for sg in d.get("subgroups", []):
        if y - sg_height(sg) < M + 8:
            footer(c, f"Раздел {idx} из {total} · продолжение на следующей странице"); c.showPage()
            y = header_bar(c, f"{idx}. {d['title']} (продолжение)", sub) - 12
        y -= 8
        c.setFillColorRGB(*LIGHT); c.rect(M, y - 22, PW - 2 * M, 22, fill=1, stroke=0)
        c.setFillColorRGB(*DARK); c.setFont("DJB", 11); c.drawString(M + 8, y - 15, sg["title"])
        if sg.get("email"):
            c.setFont("DJ", 9); c.setFillColorRGB(*RED_D); c.drawRightString(PW - M - 8, y - 15, sg["email"])
        y -= 30; sb = None; sx = []
        if sg.get("head"): sb, sx = heads(c, [sg["head"]], y); y = sb
        if sg.get("staff"): y = grid(c, sg["staff"], (sb - 16) if sb else (y - 6), sb, sx)
    footer(c, f"Раздел {idx} из {total} · увеличивайте масштаб для деталей"); c.showPage()

c.save()
print("saved out/Оргструктура_контакты.pdf")
