# -*- coding: utf-8 -*-
"""Формы выгрузок из 1С УПП: заказ → запуск → выпуск → отгрузка → оплата → возврат.
Делает страницу (артефакт) и xlsx-шаблон для 1С-программистов из одного описания."""
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
import base64, html
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

esc = lambda s: html.escape(str(s), quote=True)
OUT_HTML = _os.path.join(_ROOT, "sites", "vygruzki-1c.html")
OUT_XLSX = _os.path.join(_ROOT, "out", "Формы_выгрузок_1С.xlsx")
LOGO = base64.b64encode(open(_os.path.join(_SRC, "logo_white.png"), "rb").read()).decode()

# ключевые поля, по которым связываются выгрузки
KEY = {"№ заказа покупателя", "Номенклатура (артикул)"}

FORMS = [
    dict(code="Ф1", step="Вход", title="Заказы покупателей",
         where="Документы «Заказ покупателя» и «Внутренний заказ» (заказы на маркетплейсы и склад), с табличной частью по номенклатуре",
         why="Сколько заказов пришло: шт и ₽ по неделям, каналам, ОП, менеджерам и моделям",
         cols=["Дата заказа", "№ заказа покупателя", "Вид заказа", "Контрагент", "ИНН", "Канал", "ОП / филиал",
               "Менеджер", "Номенклатура (артикул)", "Наименование", "Группа / модель", "Кол-во, шт", "Цена", "Сумма с НДС",
               "Желаемая дата отгрузки", "Статус", "Дата закрытия"],
         ex=[["06.10.2026", "Ж0000005412", "покупателя", "ООО «Пример»", "6200000000", "дилер", "ОП Рязань", "Сотрудник В. С.",
              "АНР-G-ЧЕР", "Кресло Анри G чёрный", "Анри", "40", "4 500", "180 000", "20.10.2026", "открыт", ""],
             ["07.10.2026", "Ж0000005430", "внутренний", "Маркетплейс ПКС", "", "маркетплейс", "e-commerce", "Сотрудник А. А.",
              "САМ-BOX4", "Стул Самба BOX4", "Самба", "120", "1 900", "228 000", "17.10.2026", "закрыт", "17.10.2026"]]),
    dict(code="Ф2", step="Запуск", title="Запуск в производство",
         where="Документы «Заказ на производство» (или «Внутренний заказ» на производство) с основанием — заказ покупателя",
         why="Когда и на какой участок заказ ушёл в работу; что принято, но не запущено",
         cols=["Дата запуска", "№ заказа на производство", "№ заказа покупателя", "Подразделение / участок",
               "Номенклатура (артикул)", "Кол-во, шт", "Плановая дата выпуска", "Статус"],
         ex=[["08.10.2026", "ЗП-0001873", "Ж0000005412", "Кресла (уч. 4)", "АНР-G-ЧЕР", "40", "15.10.2026", "в работе"],
             ["08.10.2026", "ЗП-0001874", "Ж0000005430", "Поролон и стулья (уч. 6)", "САМ-BOX4", "120", "14.10.2026", "выполнен"]]),
    dict(code="Ф3", step="Выпуск", title="Выпуск продукции (факт)",
         where="Документы «Отчёт производства за смену» с табличной частью «Продукция»",
         why="Фактический выпуск по дням, участкам и сменам (включая ночные); срок от заказа до выпуска",
         cols=["Дата выпуска", "№ отчёта за смену", "Подразделение / участок", "Смена (день / ночь)",
               "Номенклатура (артикул)", "Кол-во, шт", "№ заказа на производство", "№ заказа покупателя", "Склад поступления"],
         ex=[["14.10.2026", "ОПС-0045120", "Поролон и стулья (уч. 6)", "ночь", "САМ-BOX4", "120", "ЗП-0001874", "Ж0000005430", "Склад ГП"],
             ["16.10.2026", "ОПС-0045188", "Кресла (уч. 4)", "день", "АНР-G-ЧЕР", "25", "ЗП-0001873", "Ж0000005412", "Склад ГП"]]),
    dict(code="Ф4", step="Отгрузка", title="Отгрузки (реализация)",
         where="Документы «Реализация товаров и услуг» с основанием — заказ покупателя",
         why="Выход заказов: отгружено шт и ₽; срок от заказа до отгрузки; отгрузки против графика",
         cols=["Дата отгрузки", "№ реализации", "№ заказа покупателя", "Контрагент", "Номенклатура (артикул)",
               "Кол-во, шт", "Сумма с НДС", "Себестоимость", "Склад", "Доставка (самовывоз / наш транспорт / ТК)"],
         ex=[["17.10.2026", "РТ-0012045", "Ж0000005430", "Маркетплейс ПКС", "САМ-BOX4", "120", "228 000", "141 600", "Склад ГП", "наш транспорт"],
             ["21.10.2026", "РТ-0012101", "Ж0000005412", "ООО «Пример»", "АНР-G-ЧЕР", "25", "112 500", "70 250", "Склад ГП", "ТК"]]),
    dict(code="Ф5", step="Оплата", title="Оплаты покупателей",
         where="Документы «Платёжное поручение входящее», «Приходный кассовый ордер», отчёты маркетплейсов — с указанием заказа или договора",
         why="Продажа в деньгах: когда заказ оплачен, предоплата или постоплата, дебиторка по заказам",
         cols=["Дата оплаты", "Документ", "Контрагент", "№ заказа покупателя", "Договор", "Сумма", "Вид (предоплата / постоплата)"],
         ex=[["09.10.2026", "п/п вх. № 3381", "ООО «Пример»", "Ж0000005412", "№ 112/26", "90 000", "предоплата"],
             ["24.10.2026", "отчёт МП № 77", "Маркетплейс ПКС", "Ж0000005430", "оферта", "205 200", "постоплата"]]),
    dict(code="Ф6", step="Портфель", title="Состояние заказов на дату",
         where="Отчёт «Ведомость по заказам покупателей» (снимок на понедельник), плоской таблицей",
         why="Сколько заказов в работе и сколько осталось отгрузить и оплатить на каждую неделю",
         cols=["№ заказа покупателя", "Дата заказа", "Контрагент", "Менеджер", "Заказано, шт", "Заказано, ₽",
               "Выпущено, шт", "Отгружено, шт", "Оплачено, ₽", "Осталось отгрузить, шт", "Осталось оплатить, ₽", "Дата по графику"],
         ex=[["Ж0000005412", "06.10.2026", "ООО «Пример»", "Сотрудник В. С.", "40", "180 000", "25", "25", "90 000", "15", "90 000", "20.10.2026"]]),
    dict(code="Ф7", step="Возврат", title="Возвраты и рекламации",
         where="Документы «Возврат товаров от покупателя» и рекламации (как в отчёте по рекламациям № 147)",
         why="Чистые продажи за вычетом возвратов; связь с участками-виновниками",
         cols=["Дата", "№ документа", "№ заказа покупателя", "№ реализации", "Контрагент", "Номенклатура (артикул)",
               "Кол-во, шт", "Сумма", "Причина", "Виновный участок"],
         ex=[["28.10.2026", "ВТ-000318", "Ж0000005430", "РТ-0012045", "Маркетплейс ПКС", "САМ-BOX4", "3", "5 700", "скол покрытия", "покраска стульев"]]),
]
DIRS = [
    dict(title="Номенклатура", cols=["Артикул", "Наименование", "Группа / модель", "Участок изготовления", "Ед. изм.", "Активна (да / нет)"]),
    dict(title="Контрагенты", cols=["Контрагент", "ИНН", "Канал (дилер, сеть, маркетплейс, проект, экспорт, розница)", "Регион",
                                    "ОП / филиал", "Ответственный менеджер"]),
]
HAVE = [
    ("Ведомость по заказам покупателей", "разово, май–август 2026, иерархический отчёт", "нужна еженедельно и плоской таблицей (Ф6)"),
    ("Невыпущенные заказы графика отгрузок", "разово, на 17.09.2026", "только просроченное, без дат выпуска — нужны Ф2 и Ф3"),
    ("Рекламации", "отчёт № 147, 2025–2026", "нужна связь с заказом и реализацией (Ф7)"),
]
METRICS = [
    "Вход: заказы за неделю и месяц в шт и ₽ по каналам, ОП, менеджерам и моделям.",
    "Выход: выпуск, отгрузка и оплата за те же периоды; разница между входом и выходом, то есть рост или снижение портфеля.",
    "Сроки: от заказа до запуска, до выпуска, до отгрузки и до оплаты, по моделям и участкам.",
    "График: отгрузки в срок и с опозданием, хвост просроченных заказов, зависшие документы.",
    "Деньги: продажи по отгрузке и по оплате, дебиторка по заказам, возвраты.",
    "Загрузка участков: выпуск по участкам и сменам, включая ночные, против принятых заказов.",
]

# REDACTED_B64 xlsx-шаблон
def build_xlsx():
    F = "Arial"
    H = Font(name=F, bold=True, size=10, color="FFFFFF"); B = Font(name=F, size=10); T = Font(name=F, size=14, bold=True)
    I = Font(name=F, size=9.5, italic=True, color="555555"); EX = Font(name=F, size=10, italic=True, color="7F7F7F")
    RED = PatternFill("solid", fgColor="E3171D"); KEYF = PatternFill("solid", fgColor="8A1414")
    thin = Side(style="thin", color="D9C9C9"); BOX = Border(left=thin, right=thin, top=thin, bottom=thin)
    wb = Workbook(); ws = wb.active; ws.title = "Требования"
    ws["A1"] = "Выгрузки из 1С: заказы от входа до оплаты"; ws["A1"].font = T
    rows = [
        "Формат: Excel (.xlsx), плоская таблица без группировок и итогов, одна строка — одна строка документа (заказ × номенклатура).",
        "Первая выгрузка: с 01.01.2026 по текущую дату. Дальше еженедельно, по понедельникам до 10:00, за прошлую неделю (пн–вс).",
        "Ф6 «Состояние заказов» — снимок на понедельник 00:00, все незакрытые заказы.",
        "Ключ для связки: «№ заказа покупателя» должен быть в Ф1–Ф7. Если в документе основание не заполнено, оставьте ячейку пустой — по ним сделаем отдельный список.",
        "Колонки с тёмно-красным заголовком — ключевые. Названия колонок можно оставить как в 1С, если смысл тот же.",
        "Справочники «Номенклатура» и «Контрагенты» нужны один раз, потом только при изменениях.",
        "Строки «пример» на листах форм — образец формата, их нужно удалить.",
    ]
    for i, t in enumerate(rows, 3):
        ws.cell(i, 1, f"{i - 2}. {t}").font = B
    ws.column_dimensions["A"].width = 140
    def sheet(name, cols, title, note, ex):
        s = wb.create_sheet(name[:31])
        s["A1"] = title; s["A1"].font = T
        s["A2"] = note; s["A2"].font = I
        for j, c in enumerate(cols, 1):
            cell = s.cell(4, j, c); cell.font = H; cell.fill = KEYF if c in KEY else RED
            cell.alignment = Alignment(wrap_text=True, vertical="center"); cell.border = BOX
            s.column_dimensions[get_column_letter(j)].width = max(14, min(34, len(c) + 4))
        s.row_dimensions[4].height = 34
        for r, row in enumerate(ex, 5):
            for j, v in enumerate(row, 1):
                cell = s.cell(r, j, v); cell.font = EX; cell.border = BOX
            s.cell(r, len(cols) + 1, "пример").font = EX
        s.freeze_panes = "A5"
    for f in FORMS:
        sheet(f"{f['code']} {f['title']}", f["cols"], f"{f['code']}. {f['title']}",
              f"Где в 1С: {f['where']}. Зачем: {f['why']}.", f["ex"])
    for d in DIRS:
        sheet(f"Справочник {d['title']}", d["cols"], f"Справочник: {d['title']}", "Один раз, потом при изменениях.", [])
    wb.save(OUT_XLSX); print("saved", OUT_XLSX)

# REDACTED_B64 страница
def form_card(f):
    head = "".join(f'<th class="{"key" if c in KEY else ""}">{esc(c)}</th>' for c in f["cols"])
    body = "".join("<tr>" + "".join(f"<td>{esc(v)}</td>" for v in row) + "</tr>" for row in f["ex"])
    return f'''<article class="form" id="{f["code"].lower()}">
  <header><span class="code">{f["code"]}</span><div><p class="step">{esc(f["step"])}</p><h3>{esc(f["title"])}</h3></div></header>
  <dl><dt>Где в 1С</dt><dd>{esc(f["where"])}</dd><dt>Зачем</dt><dd>{esc(f["why"])}</dd></dl>
  <div class="tw"><table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>
  <p class="exnote">Строки в таблице — пример формата, не ваши данные.</p>
</article>'''

def build_html():
    flow = "".join(f'<li><a href="#{f["code"].lower()}"><span class="code">{f["code"]}</span><b>{esc(f["step"])}</b>'
                   f'<span>{esc(f["title"])}</span></a></li>' for f in FORMS)
    have = "".join(f"<tr><td><b>{esc(a)}</b></td><td>{esc(b)}</td><td>{esc(c)}</td></tr>" for a, b, c in HAVE)
    dirs = "".join(f'<div class="dir"><h4>{esc(d["title"])}</h4><ul>' + "".join(f"<li>{esc(c)}</li>" for c in d["cols"]) + "</ul></div>" for d in DIRS)
    metrics = "".join(f"<li>{esc(m)}</li>" for m in METRICS)
    css = r"""
:root{
  /* Layout: red masthead; flow strip of 7 steps; form cards with scrollable sample tables */
  --bg:#f5f3f3; --surface:#ffffff; --ink:#1d1a1a; --muted:#6e6767; --line:#e8dcdc;
  --accent:#e3171d; --accent-ink:#b30d12; --key:#8a1414; --band:#ff1f1f; --band-ink:#ffffff; --chip:#f6e9e9;
  --f-body:"Golos Text", "Segoe UI", Roboto, Arial, sans-serif;
  --f-num:"JetBrains Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#141212; --surface:#1e1b1b; --ink:#f2eeee; --muted:#a49b9b; --line:#3a3131;
  --accent:#ff4d52; --accent-ink:#ff7a7e; --key:#ff9a9d; --band:#c8141a; --band-ink:#ffffff; --chip:#2d2323; color-scheme:dark } }
:root[data-theme="dark"]{
  --bg:#141212; --surface:#1e1b1b; --ink:#f2eeee; --muted:#a49b9b; --line:#3a3131;
  --accent:#ff4d52; --accent-ink:#ff7a7e; --key:#ff9a9d; --band:#c8141a; --band-ink:#ffffff; --chip:#2d2323; color-scheme:dark }
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:15px/1.5 var(--f-body)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--band)}
.wrap{max-width:1180px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.mast{background:var(--band);color:var(--band-ink)}
.mast .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:12px 22px;padding-block:18px 16px}
.mast img{height:30px;width:auto}
.mast h1{margin:0;font-size:22px;letter-spacing:-.01em;text-wrap:balance}
.mast p{margin:2px 0 0;font-size:13px;opacity:.92}
main{padding-block:22px 10px;display:grid;gap:30px}
main>section{min-width:0}
h2{margin:0 0 6px;font-size:22px;letter-spacing:-.01em;text-wrap:balance}
.lead{margin:0 0 14px;color:var(--muted);max-width:72ch}
.flow{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;counter-reset:s}
.flow li{position:relative}
.flow a{display:flex;flex-direction:column;gap:2px;height:100%;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 12px}
.flow a:hover{border-color:var(--accent)} .flow a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.flow li:not(:last-child)::after{content:"→";position:absolute;right:-8px;top:50%;transform:translate(50%,-50%);color:var(--accent);font-weight:700;z-index:1}
.flow .code{font-family:var(--f-num);font-size:12px;color:var(--accent-ink)}
.flow b{font-size:15px}
.flow span:last-child{font-size:12.5px;color:var(--muted);line-height:1.3}
.req{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px}
.req ol{margin:0;padding-left:20px;display:grid;gap:6px}
.req li::marker{color:var(--accent);font-weight:700}
.legend{display:flex;flex-wrap:wrap;gap:6px 18px;margin:10px 0 0;font-size:13px;color:var(--muted)}
.sw{display:inline-block;width:12px;height:12px;border-radius:3px;vertical-align:-1px;margin-right:6px}
.sw.k{background:var(--key)} .sw.n{background:var(--accent)}
.forms{display:grid;gap:16px}
.form{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;scroll-margin-top:16px;min-width:0}
.form header{display:flex;align-items:center;gap:12px;margin-bottom:8px}
.form .code{font-family:var(--f-num);font-size:15px;font-weight:600;color:var(--band-ink);background:var(--accent);border-radius:8px;padding:6px 9px}
.form .step{margin:0;font-size:12px;letter-spacing:.07em;text-transform:uppercase;color:var(--accent-ink);font-weight:600}
.form h3{margin:0;font-size:18px}
.form dl{display:grid;grid-template-columns:110px minmax(0,1fr);gap:4px 12px;margin:0 0 12px;font-size:14px}
.form dt{color:var(--muted)} .form dd{margin:0;max-width:80ch}
.tw{overflow-x:auto;border:1px solid var(--line);border-radius:8px}
table{border-collapse:collapse;font-size:13px;min-width:100%}
th{background:var(--accent);color:var(--band-ink);font-weight:600;text-align:left;padding:8px 10px;white-space:nowrap;border-right:1px solid color-mix(in srgb,var(--band-ink) 25%,transparent)}
th.key{background:var(--key);color:var(--surface)}
td{padding:7px 10px;border-top:1px solid var(--line);white-space:nowrap;color:var(--muted);font-style:italic;font-variant-numeric:tabular-nums}
.exnote{margin:6px 2px 0;font-size:12.5px;color:var(--muted)}
.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}
.box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px;min-width:0}
.box h3{margin:0 0 8px;font-size:17px}
.box ul{margin:0;padding-left:18px;display:grid;gap:5px;font-size:14px}
.box li::marker{color:var(--accent)}
.dirs{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
.dir h4{margin:0 0 4px;font-size:14px}
.have{width:100%;font-size:14px}
.have td{white-space:normal;font-style:normal;color:var(--ink);vertical-align:top}
.have td:last-child{color:var(--accent-ink)}
footer{padding-block:26px 40px;color:var(--muted);font-size:12.5px}
@media (max-width:980px){ .flow{grid-template-columns:repeat(4,minmax(0,1fr))} .flow li::after{display:none} }
@media (max-width:760px){ .two,.dirs{grid-template-columns:1fr} .form dl{grid-template-columns:1fr} }
@media (max-width:520px){ .flow{grid-template-columns:repeat(2,minmax(0,1fr))} }
"""
    page = f"""<title>Выгрузки из 1С для заказов</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap">
<style>{css}</style>
<header class="mast"><div class="wrap">
  <img src="data:image/png;base64,{LOGO}" alt="Фабрикант">
  <div><h1>Выгрузки из 1С: заказы от входа до оплаты</h1>
  <p>ГК «Фабрикант» · 7 форм и 2 справочника · что нужно выгрузить, чтобы видеть вход и выход заказов и продажи</p></div>
</div></header>
<main class="wrap">
<section>
  <h2>Путь заказа</h2>
  <p class="lead">Каждый шаг — отдельная выгрузка. Связываем их по номеру заказа покупателя, поэтому он нужен в каждой форме.</p>
  <ol class="flow">{flow}</ol>
</section>
<section>
  <h2>Общие требования к выгрузкам</h2>
  <div class="req"><ol>
    <li>Excel (.xlsx), плоская таблица без группировок и итогов: одна строка — одна строка документа (заказ × номенклатура).</li>
    <li>Первая выгрузка — с 01.01.2026 по сегодня. Дальше еженедельно, по понедельникам до 10:00, за прошлую неделю.</li>
    <li>Ф6 «Состояние заказов» — снимок на понедельник: все незакрытые заказы.</li>
    <li>«№ заказа покупателя» обязателен в Ф1–Ф7. Если в документе не заполнено основание, ячейка остаётся пустой, по таким сделаем отдельный список.</li>
    <li>Справочники номенклатуры и контрагентов — один раз, дальше только изменения.</li>
  </ol>
  <p class="legend"><span><i class="sw k"></i>ключевая колонка для связки</span><span><i class="sw n"></i>обычная колонка</span></p></div>
</section>
<section>
  <h2>Формы</h2>
  <div class="forms">{"".join(form_card(f) for f in FORMS)}</div>
</section>
<section class="two">
  <div class="box"><h3>Справочники</h3><div class="dirs">{dirs}</div></div>
  <div class="box"><h3>Что посчитаю по этим данным</h3><ul>{metrics}</ul></div>
</section>
<section>
  <h2>Что уже было из 1С</h2>
  <div class="box"><div class="tw"><table class="have"><thead><tr><th>Отчёт</th><th>Что было</th><th>Чего не хватает</th></tr></thead><tbody>{have}</tbody></table></div></div>
</section>
</main>
<footer><div class="wrap">ГК «Фабрикант» · формы выгрузок для 1С-программистов (Сотрудник В. В., Сотрудник М. И.) · проект, октябрь 2026</div></footer>
"""
    open(OUT_HTML, "w", encoding="utf-8").write(page); print("saved", OUT_HTML, len(page))

if __name__ == "__main__":
    build_xlsx(); build_html()
