# -*- coding: utf-8 -*-
"""Сверка после правок (запускается в конце run_all.py, можно и отдельно: python src/proverka.py).
1. Раздел «Коммерческий отдел» хранится в двух HTML (ko_master/): карточки сотрудников, блок-схема и таблицы
   в них должны совпадать. Расхождение — ошибка: правку внесли только в один файл.
2. ФИО, почта и телефоны сотрудников коммерческого отдела в разделе и в data_fabrikant.py должны сходиться — иначе предупреждение."""
from _cg1_file_io import read_file as _cg1_read_file
import os, re, sys
import data_fabrikant as D
import ko_data as K
SRC = os.path.dirname(os.path.abspath(__file__)); M = os.path.join(SRC, "ko_master")
rd = lambda n: _cg1_read_file(os.path.join(M, n), encoding="utf-8")
org, page = rd("razdel_v_orgstrukture.html"), rd("stranica_kommercheskiy_otdel.html")
errors, warns = [], []

def blocks(s):
    cards = {m.group(2): m.group(1) for m in re.finditer(r'(<article class="pc[^"]*" id="([^"]+)".*?</article>)', s, re.S)}
    sch = s[s.find('<div class="sch">'):]; sch = sch[:sch.find("</section>")]
    tables = re.findall(r"<table.*?</table>", s, re.S)
    return cards, sch, tables
c1, s1, t1 = blocks(org); c2, s2, t2 = blocks(page)
for k in sorted(set(c1) | set(c2)):
    if c1.get(k) != c2.get(k): errors.append(f"карточка {k} различается в двух HTML раздела")
if s1.strip() != s2.strip(): errors.append("блок-схема различается в двух HTML раздела")
if t1 != t2: errors.append("таблицы (графики, ответы, подрядчики) различаются в двух HTML раздела")

def find(name):
    for k in D.DEPT_ORDER + ["filials"]:
        d = D.DEPARTMENTS[k]
        for p in d["heads"] + d["staff"] + [x for sg in d.get("subgroups", []) for x in ([sg["head"]] if sg.get("head") else []) + sg["staff"]]:
            if p["name"] == name: return p
for g, pp in K.PEOPLE:
    for p in pp:
        q = find(p["name"])
        if not q: warns.append(f"{p['name']}: есть в разделе, нет в data_fabrikant.py"); continue
        if set(p["emails"]) != set(q["emails"]): warns.append(f"{p['name']}: почта в разделе {p['emails']}, в data_fabrikant.py {q['emails']}")
        if set(p["phones"]) != set(q["phones"]): warns.append(f"{p['name']}: телефоны в разделе {p['phones']}, в data_fabrikant.py {q['phones']}")
# 3. Собранные страницы против снимков опубликованных (папка published/) — только для сведения
ROOT = os.path.dirname(SRC)
def _body(path):
    t = _cg1_read_file(path, encoding="utf-8"); t = t[t.find("<title>"):]
    return (t[:t.rfind("</body>")] if "</body>" in t else t).rstrip().splitlines()
for site, pub in (("fabrikant-site.html", "orgstruktura_01.11.html"), ("kommercheskiy-otdel.html", "kommercheskiy-otdel_28.10.html"),
                  ("vygruzki-1c.html", "vygruzki-1c_23.10.html")):
    a_, b_ = os.path.join(ROOT, "sites", site), os.path.join(ROOT, "published", pub)
    if not (os.path.exists(a_) and os.path.exists(b_)): continue
    x, y = _body(a_), _body(b_)
    diff = [i for i in range(max(len(x), len(y))) if (x[i] if i < len(x) else None) != (y[i] if i < len(y) else None)]
    print(f"sites/{site} против published/{pub}: " + ("совпадает" if not diff else f"отличается строк: {len(diff)} (первая — №{diff[0] + 1})"))
for w in warns: print("предупреждение:", w)
for e in errors: print("ОШИБКА:", e)
print(f"сверка: {sum(len(pp) for _, pp in K.PEOPLE)} сотрудников раздела, ошибок {len(errors)}, предупреждений {len(warns)}")
sys.exit(1 if errors else 0)
