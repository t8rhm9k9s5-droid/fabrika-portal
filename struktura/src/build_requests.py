# -*- coding: utf-8 -*-
"""Файлы для запросов: коммерческий отдел (функционал, состав и график ОП, подрядчики) и сверка ФИО для отдела кадров."""
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
import re
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from data_fabrikant import DEPARTMENTS, DEPT_ORDER, LEADERSHIP, DIRECTORS, SECRETARY
from build_sales_duties import PEOPLE as SALES, by_name

OUTDIR = _os.path.join(_ROOT, "out", "")
F = "Arial"
H = Font(name=F, bold=True, size=10, color="FFFFFF")
B = Font(name=F, size=10)
BB = Font(name=F, size=10, bold=True)
T = Font(name=F, size=14, bold=True)
I = Font(name=F, size=9.5, italic=True, color="555555")
EX = Font(name=F, size=10, italic=True, color="7F7F7F")
RED = PatternFill("solid", fgColor="E3171D")
YEL = PatternFill("solid", fgColor="FFF2B3")
GREY = PatternFill("solid", fgColor="EDEDED")
PINK = PatternFill("solid", fgColor="FBE3E3")
thin = Side(style="thin", color="D9C9C9")
BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
WRAP = Alignment(wrap_text=True, vertical="top")

def sheet_head(ws, title, legend, headers, widths, yellow_cols, start=4):
    ws["A1"] = title; ws["A1"].font = T
    ws["A2"] = legend; ws["A2"].font = I; ws["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    ws.merge_cells(start_row=2, start_column=1, end_row=2, end_column=len(headers))
    ws.row_dimensions[2].height = 44
    for j, (h, w) in enumerate(zip(headers, widths), 1):
        c = ws.cell(start, j, h); c.font = H; c.fill = RED; c.alignment = Alignment(wrap_text=True, vertical="center"); c.border = BOX
        ws.column_dimensions[get_column_letter(j)].width = w
    ws.row_dimensions[start].height = 32
    ws.freeze_panes = ws.cell(start + 1, 1)
    return start + 1

def put_row(ws, r, values, yellow_cols, font=B, fill=None):
    for j, v in enumerate(values, 1):
        c = ws.cell(r, j, v); c.font = font; c.alignment = WRAP; c.border = BOX
        if j in yellow_cols: c.fill = YEL
        elif fill: c.fill = fill

def city(p):
    m = re.search(r"г\.\s*(.+)", p.get("extra", ""))
    return m.group(1).strip() if m else ""

# REDACTED_B64_8 1. Коммерческий отдел
CHECKER = {}
for g, pp in SALES:
    for name, _, _ in pp:
        CHECKER[name] = "Сотрудник8 М. И." if g == "Филиалы" else ("Сотрудник16 К. В." if name.startswith("Сотрудник16") else "Сотрудник26 Ю. А.")

def op_of(name, group):
    if group != "Филиалы": return "ОП Рязань"
    return "Филиал " + (city(by_name(name)) or "—")

wb = Workbook()
ws = wb.active; ws.title = "Функционал"
cols = ["№", "Кто подтверждает", "Раздел", "ФИО", "Должность", "Подчиняется", "Функционал сейчас (редакция Сотрудник26 Ю. А.)",
        "Подтверждаю без изменений (да / нет)", "Окончательный функционал: что убрать, добавить, переписать"]
r = sheet_head(ws, "Коммерческий отдел: окончательное разделение функционала",
               "Заполните жёлтые столбцы по своим сотрудникам: Сотрудник26 Ю. А. — ОП Рязань и e-commerce, Сотрудник16 К. В. — свой функционал и экспорт, "
               "Сотрудник8 М. И. — филиалы. Если функционал верный, поставьте «да». Если нет — «нет» и окончательная формулировка в последнем столбце. "
               "Первая строка — пример заполнения.",
               cols, [5, 16, 18, 26, 24, 26, 70, 16, 60], {8, 9})
put_row(ws, r, ["пример", "Сотрудник26 Ю. А.", "Отдел продаж", "Сотрудник5 Анна Отчество24", "Имя2-менеджер", "начальнику отдела продаж",
                "• Приём входящих заявок\n• Выставление счетов", "нет", "Убрать: выставление счетов (передано Петровой). Добавить: ведение реестра рекламаций."],
        {8, 9}, font=EX)
r += 1
n = 0
for g, pp in SALES:
    for name, boss, info in pp:
        n += 1
        p = by_name(name)
        put_row(ws, r, [n, CHECKER[name], g, name, p["role"], boss, "\n".join("• " + d for d in info["duties"]), "", ""], {8, 9})
        ws.row_dimensions[r].height = max(60, 13 * (len(info["duties"]) + sum(len(d) // 95 for d in info["duties"])))
        r += 1
dv = DataValidation(type="list", formula1='"да,нет"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"H6:H{r}")

ws = wb.create_sheet("Состав и график ОП")
cols = ["ОП / филиал", "ФИО полностью", "Должность", "Телефон", "Почта", "Рабочие дни", "Часы работы (с — по)",
        "Перерыв", "Особенности графика (выезды, удалённо, сменность)", "Работает сейчас (да / нет)", "Комментарий"]
r = sheet_head(ws, "Полный состав ОП и график работы",
               "По каждому ОП — ОП Рязань и все филиалы — проверьте состав и заполните график в жёлтых столбцах. "
               "Если в ОП есть люди, которых нет в списке (в том числе совместители, стажёры, удалённые), допишите их строками внизу. "
               "Первая строка — пример заполнения.",
               cols, [20, 30, 26, 18, 24, 14, 16, 12, 30, 13, 28], {6, 7, 8, 9, 10, 11})
put_row(ws, r, ["пример: Филиал Самара", "Петрова Анна Отчество4", "Менеджер", "+7 000 000-00-15", "user124@example.org",
                "пн–пт", "9:00 — 18:00", "13:00 — 14:00", "по четвергам выезды к клиентам", "да", ""], set(range(6, 12)), font=EX)
r += 1
for g, pp in SALES:
    for name, _, _ in pp:
        p = by_name(name)
        put_row(ws, r, [op_of(name, g), name, p["role"], ", ".join(p["phones"]), ", ".join(p["emails"]), "", "", "", "", "", ""],
                {6, 7, 8, 9, 10, 11})
        r += 1
for _ in range(8):
    put_row(ws, r, [""] * 11, set(range(1, 12))); r += 1
dv2 = DataValidation(type="list", formula1='"да,нет"', allow_blank=True); ws.add_data_validation(dv2); dv2.add(f"J6:J{r}")

ws = wb.create_sheet("Подрядчики")
cols = ["ОП / филиал", "Подрядчик (организация, ИП или ФИО)", "Вид работ или услуг", "Цель привлечения", "Контактное лицо",
        "Телефон", "Почта", "Как часто привлекаем", "Договор (есть / нет, №, дата)", "Комментарий"]
r = sheet_head(ws, "Привлекаемые подрядчики по ОП",
               "Перечислите всех подрядчиков, которых привлекает каждый ОП: сборщики, грузчики, доставка, монтаж, склады, реклама, юридические и прочие услуги. "
               "Одна строка — один подрядчик. Если в ОП подрядчиков нет, напишите строку «ОП …: подрядчиков нет». Первая строка — пример заполнения.",
               cols, [20, 30, 26, 34, 24, 18, 24, 18, 22, 24], set(range(1, 11)))
put_row(ws, r, ["пример: Филиал Краснодар", "ИП Сидоров С. С.", "Сборка мебели у клиента", "Сборка кресел и столов при поставке в офисы",
                "Сидоров Сотрудник56", "+7 000 000-00-15", "—", "по заявке, 2–3 раза в месяц", "есть, № 15 от 10.01.2026", ""], set(), font=EX)
r += 1
for _ in range(20):
    put_row(ws, r, [""] * 10, set(range(1, 11))); r += 1
OUT1 = OUTDIR + "Коммерческий_отдел_запрос_данных.xlsx"
wb.save(OUT1); print("saved", OUT1)

# REDACTED_B64_8 2. Сверка ФИО для отдела кадров
rows, seen = [], {}
def add(p, dept):
    nm = p["name"].strip()
    if not nm or nm.startswith("КПП"): return
    if nm in seen:
        if dept not in rows[seen[nm]][0]: rows[seen[nm]][0] += "; " + dept
        return
    seen[nm] = len(rows); rows.append([dept, nm, p["role"]])
for p in LEADERSHIP: add(p, "Руководство")
for p in DIRECTORS: add(p, "Директора направлений")
add(SECRETARY, "Приёмная")
for k in DEPT_ORDER:
    d = DEPARTMENTS[k]
    for p in d["heads"] + d["staff"]: add(p, d["title"])
    for sg in d.get("subgroups", []):
        for p in ([sg["head"]] if sg.get("head") else []) + sg.get("staff", []): add(p, d["title"] + " · " + sg["title"])

def incomplete(nm):
    w = nm.replace(".", ". ").split()
    return len(w) < 3 or any(len(x.rstrip(".")) == 1 for x in w)

wb = Workbook(); ws = wb.active; ws.title = "Сверка ФИО"
cols = ["№", "Отдел", "ФИО как в оргструктуре", "Должность как в оргструктуре", "ФИО верно? (да / нет)",
        "Правильное ФИО полностью", "Работает сейчас? (да / нет)", "Комментарий (уволен, декрет, перевод и т. п.)"]
r = sheet_head(ws, "ГК «Фабрикант»: сверка ФИО сотрудников оргструктуры",
               f"В списке {len(rows)} человек — все, кто сейчас указан в оргструктуре и на сайте. Заполните жёлтые столбцы: «да», если ФИО написано "
               "верно и полностью; иначе «нет» и правильное ФИО полностью. Розовым отмечены строки, где ФИО неполное. Если кого-то не хватает — допишите внизу. "
               "Первая строка — пример заполнения.",
               cols, [5, 30, 34, 36, 14, 34, 14, 34], {5, 6, 7, 8})
put_row(ws, r, ["пример", "Производство", "Сотрудник56 Сотрудник5", "Мастер участка", "нет", "Сотрудник56 Сотрудник5 Отчество47", "да", ""], {5, 6, 7, 8}, font=EX)
r += 1
for i, (dept, nm, role) in enumerate(rows, 1):
    put_row(ws, r, [i, dept, nm, role, "", "", "", "нужно полное ФИО" if incomplete(nm) else ""], {5, 6, 7, 8},
            fill=PINK if incomplete(nm) else None)
    if incomplete(nm):
        for j in (1, 2, 3, 4): ws.cell(r, j).fill = PINK
    r += 1
for _ in range(6):
    put_row(ws, r, [""] * 8, {2, 3, 4, 5, 6, 7, 8}); r += 1
for col in ("E", "G"):
    dv = DataValidation(type="list", formula1='"да,нет"', allow_blank=True); ws.add_data_validation(dv); dv.add(f"{col}6:{col}{r}")
OUT2 = OUTDIR + "Сверка_ФИО_оргструктура_Фабрикант.xlsx"
wb.save(OUT2); print("saved", OUT2, "| людей:", len(rows), "| неполных ФИО:", [x[1] for x in rows if incomplete(x[1])])
