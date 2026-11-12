# -*- coding: utf-8 -*-
"""Данные коммерческого отдела в текущей редакции — читаются из главной копии раздела
(ko_master/stranica_kommercheskiy_otdel.html) в режиме «Чистовик»: зачёркнутое и удалённое отбрасывается, вставки остаются.
Только стандартная библиотека Python.

  PEOPLE      — [(группа, [сотрудник, …]), …]; сотрудник: id, name, role, status, emails, phones, notes,
                purpose, boss, duties, paragraphs [(заголовок, текст)]
  SCHEME_FN   — {ФИО: [краткие функции из блок-схемы]}
  TABLES      — {"Графики работы ОП": {...}, "Ответы и решения": {...}, "Подрядчики ОП": {...}}
"""
import os, re
from html.parser import HTMLParser

_SRC = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(_SRC, "ko_master", "stranica_kommercheskiy_otdel.html")
VOID = {"br", "img", "input", "meta", "link", "hr", "col", "wbr"}

class _N:
    __slots__ = ("tag", "attrs", "kids", "parent")
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.kids, self.parent = tag, dict(attrs), [], parent
    @property
    def cls(self): return (self.attrs.get("class") or "").split()
    def find_all(self, tag=None, cls=None):
        out = []
        for k in self.kids:
            if isinstance(k, _N):
                if (tag is None or k.tag == tag) and (cls is None or cls in k.cls): out.append(k)
                out += k.find_all(tag, cls)
        return out
    def find(self, tag=None, cls=None):
        r = self.find_all(tag, cls); return r[0] if r else None

class _P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.root = _N("root", {}, None); self.cur = self.root
    def handle_starttag(self, tag, attrs):
        n = _N(tag, attrs, self.cur); self.cur.kids.append(n)
        if tag not in VOID: self.cur = n
    def handle_endtag(self, tag):
        c = self.cur
        while c is not None and c.tag != tag: c = c.parent
        if c is not None and c.parent is not None: self.cur = c.parent
    def handle_data(self, d): self.cur.kids.append(d)

HIDDEN_CLEAN = {"rem", "ghostli", "pchips", "ntag", "gtag", "dot", "legend", "need"}
def text(n, clean=True):
    """Текст узла как в режиме «Чистовик»: без <del>, без удалённых пунктов и служебных пометок."""
    if isinstance(n, str): return n
    if clean and (n.tag == "del" or HIDDEN_CLEAN & set(n.cls)): return ""
    if n.tag == "br": return "\n"
    inner = "".join(text(k, clean) for k in n.kids)
    if "dec" in n.cls: return "\nРешение: " + inner        # в таблицах ответов решение подписано через CSS ::before
    return inner
norm = lambda s: re.sub(r"[ \t ]+", " ", re.sub(r"\s*\n\s*", "\n", s)).strip()

def _parse():
    p = _P(); p.feed(open(MASTER, encoding="utf-8").read()); return p.root

def _section(root, sid):
    for s in root.find_all("section"):
        if s.attrs.get("id") == sid: return s

def _people(root):
    roles = _section(root, "roles"); groups, cur = [], None
    def walk(n):
        nonlocal cur
        for k in n.kids:
            if not isinstance(k, _N): continue
            if k.tag == "h3" and "grp" in k.cls:
                cur = (norm(text(k)), []); groups.append(cur)
            elif k.tag == "article" and "pc" in k.cls:
                cur[1].append(_person(k))
            else: walk(k)
    walk(roles); return groups

def _person(a):
    hdr = a.find("header", "pch")
    btns = [b.attrs.get("data-copy", "") for b in hdr.find_all("button")]
    d = dict(id=a.attrs.get("id"), head="head" in a.cls,
             name=norm(text(hdr.find("h3"))), role=norm(text(hdr.find("p", "rl"))),
             status=[norm(text(c, clean=False)) for c in hdr.find_all("span", "pchip")],
             emails=[b for b in btns if "@" in b], phones=[b for b in btns if "@" not in b],
             notes=[norm(text(s)) for s in hdr.find_all("span", "ex")],
             purpose="", boss="", duties=[], paragraphs=[])
    body = a.find("div", "pcb")
    for k in body.kids:
        if not isinstance(k, _N): continue
        if k.tag == "ul" and "pduties" in k.cls:
            d["duties"] = [t for t in (norm(text(li)) for li in k.find_all("li")) if t]
        elif k.tag == "p":
            b = k.find("b"); lab = norm(text(b)).rstrip(":. ") if b else ""
            full = norm(text(k)); val = norm(full[len(norm(text(b))):]) if b else full
            if lab == "Назначение роли": d["purpose"] = val
            elif lab == "Подчиняется": d["boss"] = val
            elif val or lab: d["paragraphs"].append((lab, val))
        elif k.tag == "h4": pass
    return d

def _scheme(root):
    out = {}
    for a in _section(root, "scheme").find_all("a", "nd"):
        b = a.find("b")
        if not b: continue
        fn = a.find("ul", "fn")
        out[norm(text(b))] = dict(role=norm(text(a.find("span", "nr"))) if a.find("span", "nr") else "",
                                  fn=[t for t in (norm(text(li)) for li in fn.find_all("li")) if t] if fn else [])
    return out

def _tables(root):
    res = {}
    for sid, title in (("ko-answers", None), ("ko-contractors", "Подрядчики ОП")):
        sec = _section(root, sid); name = title
        for k in sec.find_all():
            if k.tag == "h3" and "ctr-h" in k.cls: name = norm(text(k))
            if k.tag == "table":
                head = [norm(text(th)) for th in k.find_all("th")]
                rows = [[norm(text(td)) for td in tr.find_all("td")] for tr in k.find_all("tr") if tr.find("td")]
                res[name or "Ответы и решения"] = dict(columns=head, rows=rows); name = None
    return res

_root = _parse()
PEOPLE = _people(_root)
SCHEME = _scheme(_root)
SCHEME_FN = {k: v["fn"] for k, v in SCHEME.items()}
TABLES = _tables(_root)
EDITION = re.search(r"редакция (\d\d\.\d\d)", open(os.path.join(_SRC, "ko_master", "shapka_i_podval.txt"), encoding="utf-8").read()).group(1)

def scheme_fn(name, fallback=()):
    return SCHEME_FN.get(name) or list(fallback)

if __name__ == "__main__":
    for g, pp in PEOPLE:
        print(g, len(pp))
        for p in pp: print("  ", p["name"], "|", p["role"], "|", len(p["duties"]), "функций |", [l for l, _ in p["paragraphs"]])
    print({k: len(v["rows"]) for k, v in TABLES.items()}, "| схема:", len(SCHEME_FN), "| редакция", EDITION)
