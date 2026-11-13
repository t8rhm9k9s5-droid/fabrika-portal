# -*- coding: utf-8 -*-
"""Машиночитаемая выгрузка оргструктуры и коммерческого отдела — для раздела «Сотрудники» сайта «Фабрика» и других сборок.
out/orgstruktura.json — руководство, отделы, производственные участки, ночная смена;
out/kommercheskiy_otdel.json — функционал коммерческого отдела (текущая редакция), краткие функции для схемы, подрядчики, статусы."""
import json, os, datetime
import data_fabrikant as D

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out"); os.makedirs(OUT, exist_ok=True)
now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")

def person(p):
    d = {k: p.get(k) for k in ("name", "role", "emails", "phones", "extra")}
    if p.get("shifts"): d["shifts"] = [list(x) for x in p["shifts"]]
    return d

def area(a):
    w = a.get("who")
    return dict(n=a.get("n"), night=bool(a.get("night")), title=a["title"], blocks=a.get("blocks", []),
                staff=a.get("staff"), note=a.get("note", ""), who=person(w) if isinstance(w, dict) else None,
                team=[person(t) for t in a.get("team", [])] if a.get("team") else None)

depts = []
for k in D.DEPT_ORDER:
    d = D.DEPARTMENTS[k]
    depts.append(dict(key=k, title=d["title"], floor=d.get("floor"), email=d.get("email"), note=d.get("note", ""),
                      note_after=d.get("note_after", ""), meta=d.get("meta", ""),
                      count=D.dept_count(k), heads=[person(p) for p in d["heads"]], staff=[person(p) for p in d["staff"]],
                      subgroups=[dict(title=sg["title"], email=sg.get("email"),
                                      head=person(sg["head"]) if sg.get("head") else None,
                                      staff=[person(p) for p in sg.get("staff", [])]) for sg in d.get("subgroups", [])]))

org = dict(company=D.COMPANY, generated=now, source="data_fabrikant.py",
           leadership=[person(p) for p in D.LEADERSHIP], directors=[person(p) for p in D.DIRECTORS],
           reception=person(D.SECRETARY), production_director=person(D.ROMANOV_V),
           tech_director=person(D.MASHINSKY_A), tech_depts=list(D.TECH_DEPTS),   # 12.11.2026: технический директор и его службы
           departments=depts, areas=[area(a) for a in D.AREAS], night_shift=area(D.NIGHT),
           night_schedule=D.NIGHT_SCHEDULE, people_in_departments=sum(x["count"] for x in depts))
_cg1_json_value_39 = org
with open(os.path.join(OUT, "orgstruktura.json"), "w", encoding="utf-8") as _cg1_json_output_39:
    json.dump(_cg1_json_value_39, _cg1_json_output_39, ensure_ascii=False, indent=1)

# Коммерческий отдел — текущая редакция из главной копии раздела (ko_master/*.html), режим «Чистовик»
import ko_data as K
ko = dict(generated=now, edition=K.EDITION, source="ko_master/stranica_kommercheskiy_otdel.html (через ko_data.py)",
          groups=[dict(title=g, people=pp) for g, pp in K.PEOPLE], scheme=K.SCHEME, tables=K.TABLES)
_cg1_json_value_45 = ko
with open(os.path.join(OUT, "kommercheskiy_otdel.json"), "w", encoding="utf-8") as _cg1_json_output_45:
    json.dump(_cg1_json_value_45, _cg1_json_output_45, ensure_ascii=False, indent=1)
print("saved out/orgstruktura.json, out/kommercheskiy_otdel.json |", org["people_in_departments"], "чел. в отделах")
