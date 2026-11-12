# -*- coding: utf-8 -*-
"""Раздел «Коммерческий отдел»: блок-схема + функционал с правками (общий для обоих сайтов).
Слои правок: Сотрудник Ю. А. (21.10) → второй круг 23.10 (Сотрудник К. В. или Сотрудник Ю. А.). Цвет — по автору:
синий — Сотрудник, зелёный — Сотрудник."""
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
import html, re
from difflib import SequenceMatcher
from importlib.machinery import SourceFileLoader
import build_sales_duties as NEWMOD
from sales_scheme_data import SCHEME_FN
from sales_replies import CONTRACTORS, CONFIRMED, FINALIZED, SECOND_ROUND_AUTHOR

V0MOD = SourceFileLoader("duties_v0", _os.path.join(_SRC, "build_sales_duties.bak")).load_module()
V1MOD = SourceFileLoader("duties_v1", _os.path.join(_SRC, "build_sales_duties.v1.bak")).load_module()
esc = lambda s: html.escape(s, quote=True)

# REDACTED_B64 три редакции
by_name = NEWMOD.by_name
NEW = NEWMOD.PEOPLE
def _idx(people): return {name: (g, boss, info) for g, pp in people for name, boss, info in pp}
V0, V1 = _idx(V0MOD.PEOPLE), _idx(V1MOD.PEOPLE)
HEADS = NEWMOD.HEADS

# Отдел кадров (Сотрудник А. А., 23.10): полные ФИО и должности по штатному расписанию
OLD_NAME = {"Сотрудник Имя Отчество": "Сотрудник А. М.",
            "Сотрудник Сотрудник Отчество": "Сотрудник Сотрудник Отчество"}
OLD_ROLE = {"Сотрудник Имя Отчество": "Менеджер по продажам",
            "Сотрудник Имя Отчество": "Работа с ключевыми клиентами",
            "Сотрудник Сотрудник Отчество": "Руководитель филиальной сети",
            "Сотрудник Сотрудник Отчество": "Руководитель филиала",
            "Сотрудник Имя Отчество": "Руководитель филиала",
            "Сотрудник Имя Отчество": "Менеджер"}
HR_SRC = "отдел кадров, Сотрудник А. А., 23.10"

TR = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя",
              ["a","b","v","g","d","e","e","zh","z","i","y","k","l","m","n","o","p","r","s","t","u","f","h","c","ch",
               "sh","sch","","y","","e","yu","ya"]))
def slug(name):
    return "p-" + "".join(TR.get(ch, ch) for ch in name.split()[0].lower())

def tok(s): return re.findall(r"\w+|\s+|[^\w\s]", s)
def sm_(a, b): return SequenceMatcher(lambda t: t.isspace(), tok(a), tok(b), autojunk=False)
def words(s): return re.findall(r"\w+", s.lower())
def sim(a, b): return SequenceMatcher(None, words(a), words(b), autojunk=False).ratio()

def I(t, who="k"): return f'<ins class="{who}">{t}</ins>' if who in ("r", "h") else f"<ins>{t}</ins>"
def D(t, who="k"): return f'<del class="{who}">{t}</del>' if who in ("r", "h") else f"<del>{t}</del>"

def wdiff(a, b, who="k", eq_k=False):
    """Пословное сравнение: D — прежнее, I — новое; who — чья правка; eq_k — общий текст был добавлен Сотрудник."""
    eq = (lambda t: I(t, "k") if t.strip() else t) if eq_k else (lambda t: t)
    if a == b: return eq(esc(a)) if a else ""
    if a is None: return I(esc(b), who)
    if b is None: return D(esc(a), who)
    if sim(a, b) < 0.5:
        return f"{D(esc(a), who)} {I(esc(b), who)}"
    ta, tb = tok(a), tok(b)
    segs = [["=" if op == "equal" else "~", "".join(ta[i1:i2]), "".join(tb[j1:j2])]
            for op, i1, i2, j1, j2 in sm_(a, b).get_opcodes()]
    for k in range(1, len(segs) - 1):          # короткие общие слова между правками втягиваем в правку
        if segs[k][0] == "=" and len(segs[k][1].strip()) <= 3 and segs[k - 1][0] == "~" and segs[k + 1][0] == "~":
            segs[k][0] = "~"
    merged = []
    for sg in segs:
        if merged and merged[-1][0] == sg[0] == "~":
            merged[-1][1] += sg[1]; merged[-1][2] += sg[2]
        else:
            merged.append(list(sg))
    out = []
    for op, A, B in merged:
        if op == "=": out.append(eq(esc(A))); continue
        if not B.strip():
            lead_a = A[:len(A) - len(A.lstrip())]
            out.append(D(esc(lead_a + A.strip()), who) + A[len(A.rstrip()):]); continue
        if A.strip() and not B.strip()[:1].isalnum() and B.strip()[:1] not in "«(":
            lead_a = A[:len(A) - len(A.lstrip())]
            out.append(D(esc(lead_a + A.strip()), who) + I(esc(B.strip()), who) + B[len(B.rstrip()):]); continue
        lead, trail = B[:len(B) - len(B.lstrip())], B[len(B.rstrip()):]
        mid = ([D(esc(A.strip()), who)] if A.strip() else []) + [I(esc(B.strip()), who)]
        sep = " " if (len(mid) == 2 and (B.strip()[:1].isalnum() or B.strip()[:1] in "«(")) else ""
        out.append(lead + sep.join(mid) + trail)
    return re.sub(r" {2,}", " ", "".join(out))

def pair(os_, ns_, T=0.5):
    """Монотонное сопоставление пунктов по сходству (динамическое программирование)."""
    n, m = len(os_), len(ns_)
    f = [[0.0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            best = max(f[i + 1][j], f[i][j + 1])
            sv = sim(os_[i], ns_[j])
            if sv >= T: best = max(best, sv + f[i + 1][j + 1])
            f[i][j] = best
    i = j = 0; res = []
    while i < n or j < m:
        if i < n and j < m and sim(os_[i], ns_[j]) >= T and abs(f[i][j] - (sim(os_[i], ns_[j]) + f[i + 1][j + 1])) < 1e-9:
            res.append(("~", os_[i], ns_[j])); i += 1; j += 1
        elif i < n and (j == m or f[i][j] == f[i + 1][j]):
            res.append(("-", os_[i], None)); i += 1
        else:
            res.append(("+", None, ns_[j])); j += 1
    return res

def align(old, new):
    m = SequenceMatcher(None, old, new, autojunk=False); res = []
    for op, i1, i2, j1, j2 in m.get_opcodes():
        if op == "equal": res += [("=", o, o) for o in old[i1:i2]]
        elif op == "delete": res += [("-", o, None) for o in old[i1:i2]]
        elif op == "insert": res += [("+", None, x) for x in new[j1:j2]]
        else: res += pair(old[i1:i2], new[j1:j2])
    return res

def _k_li(op, a, b):
    if op == "=": return f"<li>{esc(b)}</li>"
    if op == "+": return f'<li class="add"><ins>{esc(b)}</ins></li>'
    if sim(a, b) < 0.5: return f'<li class="rem"><del>{esc(a)}</del></li><li class="add"><ins>{esc(b)}</ins></li>'
    return f'<li class="chg">{wdiff(a, b)}</li>'

def duty_items(d0, d1, d2, w="r"):
    """Пункты функций в три слоя: правки Сотрудник 21.10 (d0→d1) и поверх них правки второго круга (d1→d2), w — автор."""
    sfx = "-r" if w == "r" else ""
    kinfo, before, pending = [], [], []
    for op, a, b in align(d0, d1):
        if b is None: pending.append(a); continue
        kinfo.append((op, a, b)); before.append(pending); pending = []
    out, i = [], 0
    for op, x, y in align(d1, d2):
        if x is None:
            out.append(f'<li class="add add{sfx}">{I(esc(y), w)}</li>'); continue
        out += [f'<li class="rem"><del>{esc(rm)}</del></li>' for rm in before[i]]
        kop, a0, b1 = kinfo[i]; i += 1
        if op == "=": out.append(_k_li(kop, a0, b1))
        elif op == "-": out.append(f'<li class="rem rem{sfx}">{D(esc(x), w)}</li>')
        elif sim(x, y) < 0.5:
            out.append(f'<li class="rem rem{sfx}">{D(esc(x), w)}</li><li class="add add{sfx}">{I(esc(y), w)}</li>')
        else:
            out.append(f'<li class="chg chg{sfx}">{wdiff(x, y, w, eq_k=(kop == "+"))}</li>')
    out += [f'<li class="rem"><del>{esc(rm)}</del></li>' for rm in pending]
    return "".join(out)

# REDACTED_B64 карточки функционала
def contacts_html(p):
    parts = [f'<button class="ct ct-mail" type="button" data-copy="{esc(e)}">{esc(e)}</button>' for e in p["emails"]]
    parts += [f'<button class="ct" type="button" data-copy="{esc(t)}">{esc(t)}</button>' for t in p["phones"]]
    if not (p["emails"] or p["phones"]):
        parts.append('<span class="nocontact">контакты пока не указаны</span>')
    elif p["extra"]:
        parts.append(f'<span class="ex">{esc(p["extra"])}</span>')
    return "".join(parts)

EMPTY = dict(purpose=None, duties=[], contacts=None, kpi=None)
STATUS = {}      # name -> dict(st, new, who)
def person_card(group, name, boss, info):
    p = by_name(name)
    on = OLD_NAME.get(name, name)
    g0, _, i0 = V0.get(on, (None, None, EMPTY))
    g1, _, i1 = V1.get(on, (None, None, EMPTY))
    chips, new, who = [], None, None
    if on not in V1:
        new = who = "r"; chips.append('<span class="pchip pchip-new-r">новый сотрудник · Сотрудник К. В.</span>')
    elif on not in V0:
        new = who = "k"; chips.append('<span class="pchip pchip-new">новый сотрудник · Сотрудник Ю. А.</span>')
    if g0 and g1 and g0 != g1:
        chips.append(f'<span class="pchip pchip-mv">раздел: <del>{esc(g0)}</del> <ins>{esc(g1)}</ins></span>'); who = who or "k"
    if g1 and g1 != group:
        chips.append(f'<span class="pchip pchip-mv">раздел: <del class="r">{esc(g1)}</del> <ins class="r">{esc(group)}</ins></span>'); who = "r"
    fields = ("purpose", "duties", "contacts", "kpi")
    w2 = SECOND_ROUND_AUTHOR.get(name, "r")
    if not new and any(i0[k] != i1[k] for k in fields):
        chips.append('<span class="pchip pchip-chg">правки Сотрудник Ю. А., 21.10</span>'); who = who or "k"
    if new != "r" and any(i1[k] != info[k] for k in fields):
        chips.append('<span class="pchip pchip-chg">правки Сотрудник Ю. А., 23.10</span>' if w2 == "k"
                     else '<span class="pchip pchip-chg-r">правки Сотрудник К. В., 23.10</span>'); who = w2
    if name in OLD_NAME or name in OLD_ROLE:
        what = " и ".join(x for x in ("ФИО" if name in OLD_NAME else "",
                                      "должность по штату" if name in OLD_ROLE else "") if x)
        chips.append(f'<span class="pchip pchip-hr">{what} · {esc(HR_SRC)}</span>'); who = who or "h"
    if not chips: chips.append('<span class="pchip pchip-same">без изменений</span>')
    if name in CONFIRMED: chips.append(f'<span class="pchip pchip-ok">подтверждено · {esc(CONFIRMED[name])}</span>')
    elif name in FINALIZED: chips.append(f'<span class="pchip pchip-ok">окончательная редакция · {esc(FINALIZED[name])}</span>')
    else: chips.append('<span class="pchip pchip-wait">ждём подтверждения</span>')
    STATUS[name] = dict(st="chg" if who else "same", new=new, who=who or "same")
    def fld(k):
        if i1[k] == info[k]: return wdiff(i0[k], i1[k], "k")
        return wdiff(i1[k], info[k], w2)
    dut = duty_items(i0["duties"], i1["duties"], info["duties"], w2)
    dut_html = f'<ul class="pduties">{dut}</ul>' if dut else '<p class="nofn">Функционал пока не заполнен, запрошен у руководителя.</p>'
    srch = esc(" ".join([name, on, p["role"], OLD_ROLE.get(name, ""), group] + p["emails"] + p["phones"]).lower())
    h3 = esc(name) if name not in OLD_NAME else D(esc(on), "h") + " " + I(esc(name), "h")
    rl = esc(p["role"]) if name not in OLD_ROLE else D(esc(OLD_ROLE[name]), "h") + " " + I(esc(p["role"]), "h")
    head = name in HEADS
    return f'''<article class="pc{' head' if head else ''}" id="{slug(name)}" data-st="{STATUS[name]['st']}" data-search="{srch}">
  <header class="pch">
    <div class="pcn"><h3>{h3}</h3><p class="rl">{rl}</p></div>
    <div class="pchips">{"".join(chips)}</div>
    <div class="pcts">{contacts_html(p)}</div>
  </header>
  <div class="pcb">
    <p><b>Назначение роли.</b> {fld("purpose")}</p>
    <p><b>Подчиняется:</b> {esc(boss)}{"" if boss.endswith(".") else "."}</p>
    <h4>Основные функции</h4>
    {dut_html}
    <p><b>Взаимодействует:</b> {fld("contacts")}</p>
    <p><b>Результат работы:</b> {fld("kpi")}</p>
  </div>
</article>'''

cards_html, index_html = [], []
_g0 = {g for g, _ in V0MOD.PEOPLE}
for group, people in NEW:
    gnew = "" if group in _g0 else ' <ins class="gtag">новый раздел</ins>'
    cards_html.append(f'<h3 class="grp" id="g-{len(cards_html)}">{esc(group)}{gnew}</h3>')
    items = []
    for name, boss, info in people:
        cards_html.append(person_card(group, name, boss, info))
        parts = name.split()
        short = parts[0] + " " + " ".join(x[0] + "." for x in parts[1:]) if len(parts) == 3 else name
        stt = STATUS[name]
        items.append(f'<li data-st="{stt["st"]}"><a href="#{slug(name)}">{esc(short)}</a><i class="dot dot-{stt["who"]}"></i></li>')
    index_html.append(f'<p class="ixg">{esc(group)}</p><ul>{"".join(items)}</ul>')

# REDACTED_B64 блок-схема
FN_LI = {"=": lambda t: f"<li>{esc(t)}</li>",
         "+": lambda t: f'<li class="add"><ins>{esc(t)}</ins></li>',
         "-": lambda t: f'<li class="rem"><del>{esc(t)}</del></li>',
         "r+": lambda t: f'<li class="add add-r"><ins class="r">{esc(t)}</ins></li>',
         "r-": lambda t: f'<li class="rem rem-r"><del class="r">{esc(t)}</del></li>'}
def node(name, role, cls="", tag="", old=None, old_name=None):
    lis = "".join(FN_LI[s](t) for s, t in SCHEME_FN.get(name, []))
    head = " head" if name in HEADS or cls == "dir" else ""
    nw = (STATUS.get(name) or {}).get("new")
    stc = " is-new is-new-r" if nw == "r" else (" is-new" if nw == "k" else "")
    href = f' href="#{slug(name)}"' if name in STATUS else ""
    tg = f'<span class="ntag">{tag}</span>' if tag else ""
    nm = esc(name) if not old_name else D(esc(old_name), "h") + " " + I(esc(name), "h")
    rl = esc(role) if not old else D(esc(old), "h") + " " + I(esc(role), "h")
    return (f'<a class="nd{head}{stc} {cls}"{href}><b>{nm}</b><span class="nr">{rl}</span>{tg}'
            + (f'<ul class="fn">{lis}</ul>' if lis else "") + "</a>")

def kid(inner, cls=""): return f'<li class="{cls}">{inner}</li>'

op_left = (
    kid('<span class="glbl">Отдел продаж</span>', "klbl")
    + kid(node("Сотрудник Имя Отчество", "Офис-менеджер"))
    + kid(node("Сотрудник Имя Отчество", "Офис-менеджер"))
    + kid(node("Сотрудник Имя", "Офис-менеджер", tag='<ins class="r">новый сотрудник</ins> · на обучении, функционал не заполнен'))
    + kid('<span class="ghost"><del>Сотрудник Имя Отчество</del> <ins>перенесена в «Ключевые клиенты»</ins></span>', "klbl ghostli")
)
op_right = (
    kid('<span class="glbl">Ключевые клиенты <ins class="gtag">новая группа</ins></span>', "klbl")
    + kid(node("Сотрудник Имя Отчество", "Офис-менеджер",
               tag='<del>Отдел продаж</del> <ins>Ключевые клиенты</ins>', old="Менеджер по продажам"))
    + kid(node("Сотрудник Имя Отчество", "Офис-менеджер", tag="<ins>новый сотрудник</ins>",
               old="Работа с ключевыми клиентами", old_name="Сотрудник А. М."))
)
dev = (kid(node("Сотрудник Сотрудник Отчество", "Директор по развитию"))
       + kid(node("Сотрудник Имя Отчество", "Должность уточняется", tag='<ins class="r">новый сотрудник</ins> · должность и подчинение уточняются у Сотрудник К. В.')))
fil_left = (kid(node("Сотрудник Сотрудник Отчество", "Руководитель офиса продаж, г. Сотрудник Имя",
                     old="Руководитель филиала, г. Сотрудник Имя"))
            + kid(node("Сотрудник Имя Отчество", "Руководитель офиса продаж, г. Екатеринбург",
                       old="Руководитель филиала, г. Екатеринбург")
                  + '<ul class="kids">' + kid(node("Сотрудник Имя Отчество",
                                                   "Офис-менеджер (осн.), менеджер (вн. совм.), г. Екатеринбург",
                                                   old="Менеджер, г. Екатеринбург")) + "</ul>"))
fil_right = kid(node("Сотрудник Сотрудник Отчество", "Менеджер, г. Самара",
                     old_name="Сотрудник Сотрудник Отчество")) + "".join(kid(node(n, r)) for n, r in [
    ("Сотрудник Имя Отчество", "Менеджер, г. Краснодар"),
    ("Сотрудник Сотрудник Отчество", "Менеджер, г. Краснодар"),
    ("Сотрудник Сотрудник Отчество", "Менеджер, г. Симферополь")])

scheme_html = f'''<div class="sch">
  <div class="sch-dir">{node("Сотрудник Сотрудник Отчество", "Коммерческий директор", "dir")}</div>
  <div class="sch-cols">
    <section class="pn pn-wide"><p class="pl">ОП Рязань</p>{node("Сотрудник Сотрудник Отчество", "Начальник отдела продаж", "half")}
      <div class="split"><ul class="kids">{op_left}</ul><ul class="kids">{op_right}</ul></div></section>
    <section class="pn pn-multi"><p class="pl">Развитие</p><ul class="kids">{dev}</ul></section>
    <section class="pn"><p class="pl">E-commerce</p>{node("Сотрудник Сотрудник Отчество", "Руководитель направления e-commerce")}</section>
    <section class="pn pn-wide"><p class="pl">Филиальная сеть</p>{node("Сотрудник Сотрудник Отчество", "Руководитель сети офисов продаж, г. Краснодар", "half", old="Руководитель филиальной сети, г. Краснодар")}
      <div class="split"><ul class="kids">{fil_left}</ul><ul class="kids">{fil_right}</ul></div></section>
  </div>
</div>'''

# REDACTED_B64 что изменилось
CHANGES_K = [
    ("Сотрудник Сотрудник Отчество", "Сотрудник К. В.", "добавлено экспортное направление: Бишкек (Кыргызстан), Казахстан, Армения."),
    ("Сотрудник Имя Отчество", "Сотрудник М. И.", "добавлены работа с проектами и рекламации."),
    ("Сотрудник Имя Отчество", "Сотрудник Е. Е.", "счета и договоры по поручению Сотрудник и Сотрудник, базис отгрузки Москва и Рязань, рекламации; контроль оплат убран."),
    ("Сотрудник Имя Отчество", "Сотрудник В. С.", "перенесена в «Ключевые клиенты», ведёт одного клиента ООО «ОнЛайн Имя»."),
    ("Сотрудник Имя Отчество", "Сотрудник А. М.", "новый сотрудник: клиенты «ВсеИнструменты.ру» и «КОМФОРТ МЕБЕЛЬ» («Первый мебельный»)."),
    ("Сотрудник Сотрудник Отчество", "Сотрудник И. П.", "добавлено полное обеспечение работы филиала: аренда, помещения, подбор и обучение персонала."),
    ("Сотрудник Имя Отчество", "Сотрудник С. В.", "та же дополнительная функция, что у Сотрудник."),
    ("Сотрудник Сотрудник Отчество", "Сотрудник А. А.", "вынесен в отдельный раздел «Направление e-commerce», функции без изменений."),
]
CHANGES_R = [
    ("Сотрудник Сотрудник Отчество", "Сотрудник К. В.", "добавлены крупные сетевые клиенты и экспорт в Узбекистан."),
    ("Сотрудник Имя Отчество", "Сотрудник М. И.", "расширено сопровождение проектов; добавлены генподрядчики, монтажные бригады и выезды на сдачу объектов; по рекламациям — графики выездов и акты."),
    ("Сотрудник Имя Отчество", "Сотрудник С. И.", "новый сотрудник, проектные продажи (HoReCa, гостиницы, автосалоны, бизнес-центры, жилые комплексы). Должность в таблице — «директор по развитию», это под вопросом, уточняем у Сотрудник."),
    ("Сотрудник Имя", "Сотрудник Е.", "новый офис-менеджер отдела продаж, функционал пока не заполнен."),
    (None, "Подрядчики", "ОП Рязань: ИП Апухтин А. Н., монтаж мебели и декора."),
]
CHANGES_K2 = [
    ("Сотрудник Имя Отчество", "Сотрудник Е. Е.", "добавлены задачи по маркетплейсам (Ozon, Сотрудник Имя): заказы, этикетки, 1С, УПД, возвраты, заявки на транспорт."),
    ("Сотрудник Имя", "Сотрудник Е.", "проходит обучение; задачи по маркетплейсам планируется передать ей. Нужно решение, когда."),
    ("Сотрудник Сотрудник Отчество", "Сотрудник Ю. А., Сотрудник В. С., Сотрудник А. М.", "функционал подтверждён без изменений."),
]
CHANGES_H = [
    ("Сотрудник Имя Отчество", "Сотрудник А. М.", "полное ФИО — Сотрудник Имя Отчество; должность по штату — офис-менеджер."),
    ("Сотрудник Сотрудник Отчество", "Сотрудник Н. А.", "правильное написание фамилии — через «е» (было «Сотрудник»)."),
    ("Сотрудник Сотрудник Отчество", "Сотрудник М. И.", "руководитель сети офисов продаж (было: руководитель филиальной сети)."),
    ("Сотрудник Сотрудник Отчество", "Сотрудник И. П. и Сотрудник С. В.", "руководители офисов продаж (было: руководители филиалов)."),
    ("Сотрудник Имя Отчество", "Сотрудник В. С.", "офис-менеджер (было: менеджер по продажам)."),
    ("Сотрудник Имя Отчество", "Сотрудник А. В.", "офис-менеджер, по внутреннему совместительству — менеджер."),
    ("Сотрудник Сотрудник Отчество", "Остальные", "ФИО и должности подтверждены. Функционал не менялся."),
]
def _chg_li(n, s, t):
    href = f"#{slug(n)}" if n else "#ko-contractors"
    return f'<li><a href="{href}">{esc(s)}</a> {esc(t)}</li>'
changes_k_html = "".join(_chg_li(*c) for c in CHANGES_K)
changes_r_html = "".join(_chg_li(*c) for c in CHANGES_R)
changes_k2_html = "".join(_chg_li(*c) for c in CHANGES_K2)
changes_h_html = "".join(_chg_li(*c) for c in CHANGES_H)
n_ok = sum(1 for _, pp in NEW for n, _, _ in pp if n in CONFIRMED or n in FINALIZED)
total = sum(len(pp) for _, pp in NEW)
n_same = sum(1 for v in STATUS.values() if v["st"] == "same")
n_new = sum(1 for v in STATUS.values() if v["new"])

old_note = ("Документ описывает базовый функционал каждого сотрудника коммерческого отдела: назначение роли, основные функции, "
            "подчинённость, ключевые взаимодействия и результат, по которому оценивается работа. Это проект для обсуждения: функции "
            "сформулированы по должностям из оргструктуры и требуют проверки руководителями. Линии подчинения указаны по текущей схеме компании.")
new_note = ("Документ описывает базовый функционал каждого сотрудника коммерческого отдела: назначение роли, основные функции, "
            "подчинённость, ключевые взаимодействия и результат, по которому оценивается работа. Это проект для обсуждения; функции "
            "и линии подчинения требуют подтверждения руководителями.")


# REDACTED_B64 стили раздела (всё под .ko)
TOKENS_CSS = r"""
.ko{--ins:#1554c9;--ins-bg:#e6eeff;--ins2:#0b7a55;--ins2-bg:#dcf3e8;--ins3:#7a3db8;--ins3-bg:#f1e7fb;--del:#9a8d8d;--panel:#efeaea;--g:14px;--ko-stick:0px}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .ko{--ins:#8db6ff;--ins-bg:#1a2742;--ins2:#62d6a6;--ins2-bg:#12302a;--ins3:#c9a2f2;--ins3-bg:#2a1d3d;--del:#867b7b;--panel:#191616} }
:root[data-theme="dark"] .ko{--ins:#8db6ff;--ins-bg:#1a2742;--ins2:#62d6a6;--ins2-bg:#12302a;--ins3:#c9a2f2;--ins3-bg:#2a1d3d;--del:#867b7b;--panel:#191616}
"""

SRC_CSS = r"""
ins{color:var(--ins);background:var(--ins-bg);text-decoration:none;border-radius:3px;padding:0 2px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
del{color:var(--del);text-decoration:line-through;text-decoration-thickness:1.5px}
&.clean del, &.clean li.rem, &.clean .ghostli, &.clean .pchips, &.clean .ntag, &.clean .gtag, &.clean .dot, &.clean .legend, &.clean .chg-sec{display:none}
&.clean ins, &.clean ins.r, &.clean ins.h{color:inherit;background:none;padding:0}
&.clean .nd.is-new{border-style:solid;border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
&.clean .pduties li.add::marker, &.clean .pduties li.chg::marker{color:var(--accent)}
&.clean .fn li.add::before{background:var(--accent)}
&.clean .nd.is-new-r{border-style:solid;border-color:color-mix(in srgb,var(--accent) 30%,var(--line))}
&.only-chg .pc[data-st="same"], &.only-chg .ix li[data-st="same"]{display:none}

.kbar{position:sticky;top:calc(env(safe-area-inset-top,0px) + var(--ko-stick));z-index:6;background:var(--surface);border:1px solid var(--line);border-radius:10px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:8px 12px;margin:0 0 18px}
.kbar nav{display:flex;gap:16px;flex-wrap:wrap}
.kbar nav a{color:var(--ink);text-decoration:none;font-size:14px;padding:4px 1px;border-bottom:2px solid transparent}
.kbar nav a:hover, .kbar nav a:focus-visible{border-color:var(--accent);outline:none}
.legend{display:flex;flex-wrap:wrap;gap:4px 16px;margin:0;font-size:13.5px;color:var(--muted)}
.tools{margin-left:auto;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;font-size:13.5px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{font:inherit;font-size:13px;border:0;background:var(--surface);color:var(--ink);padding:6px 11px;cursor:pointer}
.seg button[aria-pressed="true"]{background:var(--ink);color:var(--surface)}
.seg button:focus-visible{outline:2px solid var(--ins);outline-offset:-2px}
.tg{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.tg input{accent-color:var(--ins);width:16px;height:16px}
.kh{margin:26px 0 10px;font-size:19px;letter-spacing:-.01em}
.kh:first-child{margin-top:0}
.ksub{margin:0 0 12px;color:var(--muted);max-width:72ch;font-size:14.5px}

.chg-box{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 18px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:4px 28px}
.chg-box ul{margin:0;padding-left:18px;display:grid;gap:5px;font-size:14px}
.chg-box li::marker{color:var(--ins)}
.chg-box a{color:var(--ink);font-weight:600;text-decoration:none;border-bottom:1px solid var(--line)}
.chg-box a:hover{border-color:var(--ins)}
.chg-box .meta{font-size:13.5px;color:var(--muted);display:grid;gap:6px;align-content:start}
.chg-box .meta b{color:var(--ink);font-variant-numeric:tabular-nums}

.sch{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px 16px 16px}
.nd{display:block;text-decoration:none;color:var(--ink);background:var(--surface);border:1px solid var(--line);border:1px solid color-mix(in srgb,var(--accent) 30%,var(--line));border-radius:8px;padding:8px 10px 9px;position:relative;z-index:1}
.nd:hover{border-color:var(--accent)}
.nd:focus-visible{outline:2px solid var(--ins);outline-offset:2px}
.nd.head{background:var(--head);border:1.5px solid var(--accent)}
.nd.is-new{border:1.5px dashed var(--ins)}
.nd.is-new-r{border-color:var(--ins2)}
.nd b{display:block;font-size:13.5px;line-height:1.25}
.nr{display:block;font-size:12px;color:var(--muted);line-height:1.3;margin-top:1px}
.ntag{display:block;font-size:11.5px;margin-top:3px}
.fn{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:2px;font-size:12px;line-height:1.3}
.fn li{position:relative;padding-left:10px}
.fn li::before{content:"";position:absolute;left:1px;top:.5em;width:4px;height:4px;border-radius:50%;background:var(--accent)}
.fn li.add::before{background:var(--ins)}
.fn li.add-r::before{background:var(--ins2)}
.fn li.rem::before{background:var(--del)}
.sch-dir{display:flex;justify-content:center;position:relative;padding-bottom:20px}
.sch-dir .nd{width:min(100%,300px)}
.sch-dir::after{content:"";position:absolute;left:50%;bottom:0;height:20px;border-left:1.5px solid var(--accent)}
.sch-cols{position:relative;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:var(--g);padding-top:16px}
.sch-cols::before{content:"";position:absolute;top:0;left:calc(100% / 6 - var(--g) / 3);right:calc(100% / 6 - var(--g) / 3);border-top:1.5px solid var(--accent)}
.pn{position:relative;background:var(--panel);border-radius:10px;padding:10px 10px 12px;min-width:0}
.pn::before{content:"";position:absolute;left:50%;top:-16px;height:52px;border-left:1.5px solid var(--accent)}
.pn-wide{grid-column:span 2}
.pn-multi::before{left:18px}
.pn-multi .pl{padding-left:20px}
.pl{margin:0 0 8px;height:18px;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.half{width:calc(50% - var(--g) / 2);margin:0 auto}
.kids{list-style:none;margin:0;padding:0}
.kids>li{position:relative;padding:0 0 8px 20px}
.kids>li::before{content:"";position:absolute;left:8px;top:0;bottom:0;border-left:1.5px solid var(--accent)}
.kids>li:last-child::before{bottom:auto;height:22px}
.kids>li::after{content:"";position:absolute;left:8px;top:22px;width:12px;border-top:1.5px solid var(--accent)}
.kids>li.klbl::after{display:none}
.kids>li.klbl{padding-top:10px;padding-bottom:6px}
.glbl{display:block;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.glbl ins{letter-spacing:0;text-transform:none;font-weight:600;margin-left:4px}
.ghost{display:block;font-size:12px;border:1px dashed var(--line);border-radius:8px;padding:6px 9px;background:var(--surface)}
.kids .kids{margin-top:8px}
.split{position:relative;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--g);padding-top:14px}
.split::before{content:"";position:absolute;top:14px;left:8px;width:calc(50% + var(--g) / 2);border-top:1.5px solid var(--accent)}
.split::after{content:"";position:absolute;top:0;left:50%;height:14px;border-left:1.5px solid var(--accent)}

.fx{display:grid;grid-template-columns:220px minmax(0,1fr);gap:24px;align-items:start}
.ix{position:sticky;top:calc(env(safe-area-inset-top,0px) + var(--ko-stick) + 70px);font-size:13.5px;max-height:calc(100vh - 90px - var(--ko-stick));overflow:auto;padding-bottom:10px}
.ix ul{list-style:none;margin:0 0 10px;padding:0;display:grid;gap:2px}
.ix li{display:flex;align-items:center;gap:6px}
.ix a{color:var(--ink);text-decoration:none;padding:2px 0}
.ix a:hover{color:var(--accent-ink)}
.ixg{margin:8px 0 3px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.dot-k{background:var(--ins)}
.dot-r{background:var(--ins2)}
.dot-same{background:var(--line)}
.cards{display:grid;gap:14px;min-width:0}
.grp{margin:14px 0 0;font-size:16px}
.grp:first-child{margin-top:0}
.gtag{font-size:12px;font-weight:600;margin-left:6px}
.pc{background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;scroll-margin-top:calc(var(--ko-stick) + 80px)}
.pc.head{border-color:var(--accent)}
.pc.head .pch{background:var(--head)}
.pch{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;padding:12px 16px;border-bottom:1px solid var(--line)}
.pcn h3{margin:0;font-size:17px;line-height:1.3}
.rl{margin:0;color:var(--muted);font-size:13.5px}
.pchips{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;align-items:flex-start}
.pchip{font-size:12px;border-radius:20px;padding:2px 9px;white-space:nowrap}
.pchip-chg{border:1px solid var(--ins);color:var(--ins)}
.pchip-new{background:var(--ins);color:var(--surface)}
.pchip-mv{border:1px solid var(--ins);color:var(--ink)}
.pchip-mv ins, .pchip-mv del{background:none;padding:0}
.pchip-same{border:1px solid var(--line);color:var(--muted)}
.pchip-chg-r{border:1px solid var(--ins2);color:var(--ins2)}
.pchip-new-r{background:var(--ins2);color:var(--surface)}
.pchip-mv ins.r, .pchip-mv del.r{background:none}
ins.r{color:var(--ins2);background:var(--ins2-bg)}
del.r{text-decoration-color:var(--ins2)}
ins.h{color:var(--ins3);background:var(--ins3-bg)}
del.h{text-decoration-color:var(--ins3)}
.pchip-hr{border:1px solid var(--ins3);color:var(--ins3)}
.dot-h{background:var(--ins3)}
.chg-cols .h-list li::marker{color:var(--ins3)}
.nofn{margin:0 0 10px;color:var(--muted);font-style:italic;font-size:14.5px}
.chg-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 24px}
@media (max-width:1100px){ .chg-cols{grid-template-columns:repeat(2,minmax(0,1fr))} }
.pchip-ok{border:1px solid var(--line);color:var(--ink);background:var(--surface)}
.pchip-ok::before{content:"✓ ";color:var(--ins2)}
.pchip-wait{border:1px dashed var(--line);color:var(--muted)}
.chg-cols h4{margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.chg-cols .r-list li::marker{color:var(--ins2)}
.chg-meta{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:4px 20px;border-top:1px solid var(--line);padding-top:10px;font-size:13.5px;color:var(--muted)}
.chg-meta b{color:var(--ink);font-variant-numeric:tabular-nums}
.ctr-wrap{overflow-x:auto;background:var(--surface);border:1px solid var(--line);border-radius:12px}
.ctr{width:100%;border-collapse:collapse;font-size:14px;min-width:760px}
.ctr th{text-align:left;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted);font-weight:600;padding:10px 12px;border-bottom:1px solid var(--line)}
.ctr td{padding:10px 12px;vertical-align:top;border-bottom:1px solid var(--line)}
.ctr tr:last-child td{border-bottom:0}
.ctr td.src{color:var(--ins2);font-size:13px;white-space:nowrap}
.ctr td:nth-child(4){min-width:190px}
.ctr .ct{white-space:nowrap;overflow-wrap:normal}
.ctr-note{margin:8px 2px 0;font-size:13px;color:var(--muted)}
.pcts{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:2px 12px;align-items:center}
.ct{all:unset;cursor:pointer;font-size:13.5px;color:var(--ink);border-radius:4px;padding:1px 3px;margin-left:-3px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.ct-mail{color:var(--accent-ink)}
.ct:hover{background:var(--chip)}
.ct:focus-visible{outline:2px solid var(--ins)}
.ct.copied::after{content:" · скопировано";color:var(--muted);font-size:12px}
.ex, .nocontact{font-size:13px;color:var(--muted)}
.pcb{padding:12px 16px 14px;max-width:86ch}
.pcb p{margin:0 0 6px;font-size:14.5px}
.pcb h4{margin:10px 0 4px;font-size:14px}
.pduties{margin:0 0 10px;padding-left:20px;display:grid;gap:3px;font-size:14.5px}
.pduties li::marker{color:var(--accent)}
.pduties li.add::marker{color:var(--ins)}
.pduties li.add-r::marker, .pduties li.chg-r::marker{color:var(--ins2)}
.pduties li.rem::marker{color:var(--del)}

@media (max-width:1060px){
  .sch-cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .sch-cols::before, .pn::before, .sch-dir::after{display:none}
  .sch-dir{padding-bottom:12px}
  .pn-wide{grid-column:1 / -1}
  .half{width:min(100%,320px)}
}
@media (max-width:860px){
  .fx{grid-template-columns:1fr}
  .ix{display:none}
  .chg-box, .chg-cols{grid-template-columns:1fr}
  .tools{margin-left:0}
}
@media (max-width:620px){
  .sch{padding:12px 10px}
  .sch-cols{grid-template-columns:1fr}
  .half{width:100%}
  .split{grid-template-columns:1fr;gap:0}
  .split::before{display:none}
  .split::after{left:8px}
  .split>.kids:first-child>li:last-child::before{bottom:0;height:auto}
  .split>.kids+.kids>li:first-child.klbl{padding-top:14px}
  .pch{grid-template-columns:1fr}
  .pchips{justify-content:flex-start}
}
"""

def _scope_rules(css, pre):
    out, i = [], 0
    while True:
        j = css.find("{", i)
        if j < 0: break
        sel = css[i:j].strip()
        if sel.startswith("@"):
            depth, k = 1, j + 1
            while depth:
                depth += {"{": 1, "}": -1}.get(css[k], 0); k += 1
            out.append(sel + "{" + _scope_rules(css[j + 1:k - 1], pre) + "}")
            i = k; continue
        k = css.index("}", j)
        sels = []
        for s in sel.split(","):
            s = s.strip()
            sels.append(s.replace("&", pre, 1) if s.startswith("&") else f"{pre} {s}")
        out.append(",".join(sels) + css[j:k + 1])
        i = k + 1
    return "\n".join(out)

SECTION_CSS = TOKENS_CSS + _scope_rules(SRC_CSS, ".ko")
# CSS-классы карточек статусов
SECTION_CSS = SECTION_CSS

TOGGLE_JS = r"""
(function(){
  var kos=[].slice.call(document.querySelectorAll('.ko'));
  function setMode(clean){
    kos.forEach(function(k){ k.classList.toggle('clean',clean) });
    document.querySelectorAll('.seg button').forEach(function(x){
      x.setAttribute('aria-pressed',String((x.getAttribute('data-mode')==='clean')===clean)) });
    try{localStorage.setItem('ko-mode',clean?'clean':'diff')}catch(e){}
  }
  document.querySelectorAll('.seg button').forEach(function(btn){
    btn.addEventListener('click',function(){ setMode(btn.getAttribute('data-mode')==='clean') });
  });
  var only=document.getElementById('ko-only');
  if(only) only.addEventListener('change',function(){ kos.forEach(function(k){ k.classList.toggle('only-chg',only.checked) }) });
  try{ if(localStorage.getItem('ko-mode')==='clean') setMode(true) }catch(e){}
})();
"""

COPY_JS = r"""
document.addEventListener('click',function(e){
  var c=e.target.closest('.ct'); if(!c) return;
  var v=c.getAttribute('data-copy');
  function done(){ c.classList.add('copied'); setTimeout(function(){c.classList.remove('copied')},1400) }
  function sel(){ var r=document.createRange(); r.selectNodeContents(c); var s=getSelection(); s.removeAllRanges(); s.addRange(r) }
  try{ navigator.clipboard.writeText(v).then(done,sel) }catch(err){ sel() }
});
"""

# REDACTED_B64 готовые блоки разметки
def toolbar_html(nav=""):
    return f'''<div class="kbar">{nav}
  <p class="legend"><span><ins>синим</ins> правки Сотрудник Ю. А., 21.10 и 23.10</span><span><ins class="r">зелёным</ins> правки Сотрудник К. В., 23.10</span><span><ins class="h">фиолетовым</ins> ФИО и должности по штату — отдел кадров, 23.10</span><span><del>зачёркнуто</del> удалено</span></p>
  <div class="tools">
    <div class="seg" role="group" aria-label="Вид">
      <button type="button" id="ko-m-diff" data-mode="diff" aria-pressed="true">С правками</button>
      <button type="button" id="ko-m-clean" data-mode="clean" aria-pressed="false">Чистовик</button>
    </div>
    <label class="tg"><input type="checkbox" id="ko-only"> Только изменённые</label>
  </div>
</div>'''

def changes_block():
    return f'''<div class="chg-box chg-cols">
    <div><h4>Сотрудник Ю. А., 21.10</h4><ul>{changes_k_html}</ul></div>
    <div><h4>Сотрудник К. В., 23.10</h4><ul class="r-list">{changes_r_html}</ul></div>
    <div><h4>Сотрудник Ю. А., 23.10</h4><ul>{changes_k2_html}</ul></div>
    <div><h4>Отдел кадров, 23.10</h4><ul class="h-list">{changes_h_html}</ul></div>
    <div class="chg-meta">
      <span>Сотрудников: <b>{total}</b></span>
      <span>Новых: <b>{n_new}</b></span>
      <span>Функционал подтверждён или окончательный: <b>{n_ok}</b> из {total}</span>
      <span>Ждём: Сотрудник М. И. по филиалам, Сотрудник А. А., Сотрудник Е.; графики работы ОП пока никто не прислал. Срок 29.10</span>
    </div>
  </div>'''

def contractors_block():
    rows = "".join(
        f'<tr><td>{esc(c["op"])}</td><td><b>{esc(c["name"])}</b><br>{esc(c["work"])}</td><td>{esc(c["goal"])}</td>'
        f'<td>{esc(c["contact"])}<br><button class="ct" type="button" data-copy="{esc(c["phone"])}">{esc(c["phone"])}</button><br>'
        f'<button class="ct ct-mail" type="button" data-copy="{esc(c["email"])}">{esc(c["email"])}</button></td>'
        f'<td>{esc(c["freq"])}<br>{esc(c["contract"])}</td><td class="src">{esc(c["source"])}</td></tr>' for c in CONTRACTORS)
    return f'''<div class="ctr-wrap"><table class="ctr">
    <thead><tr><th>ОП</th><th>Подрядчик и работы</th><th>Цель привлечения</th><th>Контакты</th><th>Как часто · договор</th><th>Прислал(а)</th></tr></thead>
    <tbody>{rows}</tbody></table></div>
  <p class="ctr-note">По ответам на запрос от 23.10. Филиалы и остальные подразделения ОП Рязань ещё не ответили.</p>'''

def roles_block():
    return f'''<p class="ksub">{wdiff(old_note, new_note)}</p>
  <div class="fx">
    <aside class="ix" aria-label="Сотрудники коммерческого отдела">{"".join(index_html)}</aside>
    <div class="cards">{"".join(cards_html)}</div>
  </div>'''
