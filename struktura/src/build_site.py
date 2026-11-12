# -*- coding: utf-8 -*-
"""Сайт оргструктуры ГК «Фабрикант»: руководство, производственные участки, отделы, функции коммерческого отдела."""
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
import base64, html, re
from data_fabrikant import (COMPANY, LEADERSHIP, DIRECTORS, SECRETARY, DEPARTMENTS, DEPT_ORDER,
                            ROMANOV_V, AREAS, AREAS_STAFF, AREA_CARDS, NIGHT, dept_count, count_people)
from build_sales_duties import PEOPLE as SALES_ROLES
import sales_section as KO   # стили и скрипты раздела
import ko_master as KOM       # сам раздел «Коммерческий отдел» — ko_master/*.html

OUT = _os.path.join(_ROOT, "sites", "fabrikant-site.html")
LOGO = base64.b64encode(open(_os.path.join(_SRC, "logo_white.png"), "rb").read()).decode()
esc = lambda s: html.escape(s or "", quote=True)

TOTAL_STAFF = AREAS_STAFF
EDITION = "01.11"   # редакция страницы: шапка и подвал

# REDACTED_B64_1 компоненты
def contact_btn(value, kind):
    return (f'<button type="button" class="ct ct-{kind}" data-copy="{esc(value)}" title="Скопировать">'
            f'<span>{esc(value)}</span></button>')

def card(p, head=False, extra_html="", cls=""):
    if p.get("fillable"):
        return (f'<article class="card fill {cls}"><h4>{esc(p["role"])}</h4>'
                f'<p class="role">данные не заполнены</p></article>')
    ex = f'<p class="ex">{esc(p["extra"])}</p>' if p["extra"] else ""
    if p.get("shifts"):   # карточка-график (сторожа): смены вместо контактов
        team = '<ul class="team">' + "".join(f'<li><b>{esc(a)}</b><span>{esc(b)}</span></li>' for a, b in p["shifts"]) + "</ul>"
        return (f'<article class="card{" head" if head else ""} {cls}" data-search="{esc(p["search"])}">'
                f'<h4>{esc(p["name"])}</h4><p class="role">{esc(p["role"])}</p>{team}{ex}</article>')
    lines = [contact_btn(e, "mail") for e in p["emails"]] + [contact_btn(ph, "tel") for ph in p["phones"]]
    srch = p.get("search") or " ".join([p["name"], p.get("search_role", p["role"]), *p["emails"], *p["phones"], p["extra"]]).lower()
    return (f'<article class="card{" head" if head else ""} {cls}" data-search="{esc(srch)}">'
            f'<h4>{esc(p["name"])}</h4><p class="role">{esc(p["role"])}</p>'
            f'<div class="cts">{"".join(lines)}</div>{ex}{extra_html}</article>')

def dept_block(key, idx):
    d = DEPARTMENTS[key]
    meta = [d["floor"], d.get("meta") or f"{dept_count(key)} чел."]
    mail = f'<span class="dmail">{esc(d["email"])}</span>' if d["email"] else ""
    body = ""
    if d.get("note"): body += f'<p class="dnote">{esc(d["note"])}</p>'
    if d["heads"]: body += '<div class="row heads">' + "".join(card(p, True) for p in d["heads"]) + "</div>"
    if d["staff"]: body += '<div class="row">' + "".join(card(p) for p in d["staff"]) + "</div>"
    for sg in d.get("subgroups", []):
        n = (1 if sg.get("head") else 0) + len(sg["staff"])
        body += (f'<div class="sub"><h4 class="subh">{esc(sg["title"])} <small>{n} чел. · {esc(sg["email"])}</small></h4>'
                 + (f'<div class="row heads">{card(sg["head"], True)}</div>' if sg.get("head") else "")
                 + '<div class="row">' + "".join(card(p) for p in sg["staff"]) + "</div></div>")
    if d.get("note_after"): body += f'<p class="dnote">{esc(d["note_after"])}</p>'
    if key == "prod":
        an = (" " + esc(d["areas_note"])) if d.get("areas_note") else ""
        body += f'<p class="dnote">Распределение мастеров по участкам и численность: <a href="#areas">Производственные участки</a>.{an}</p>'
    if key == "sales":
        body += ('<p class="dnote">Блок-схема и функции каждого сотрудника — с правками руководителей и решениями коммерческого директора 26–27.10: '
                 '<a href="#roles">Коммерческий отдел: схема и функционал</a>.</p>')
    return (f'<details class="dept" id="d-{key}"><summary><span class="dn">{idx:02d}</span>'
            f'<span class="dt">{esc(d["title"])}</span><span class="dm">{esc(" · ".join(meta))}</span>{mail}</summary>'
            f'<div class="dbody">{body}</div></details>')

def area_card(a):
    chips = "".join(f'<li>{esc(b)}</li>' for b in a["blocks"])
    if a.get("who"):
        w = a["who"]
        ph = "".join(contact_btn(x, "tel") for x in w["phones"]) or f'<span class="nophone">{esc(w.get("extra") or "телефона нет в схеме")}</span>'
        person = (f'<div class="who{" todo" if a.get("todo") else ""}"><b>{esc(w["name"])}</b>'
                  f'<span>{esc(w["role"])}</span><div class="cts">{ph}</div></div>')
    elif a.get("team"):
        person = '<ul class="team">' + "".join(
            f'<li><b>{esc(t["name"])}</b><span>{esc(t["role"])}</span>{contact_btn(t["phones"][0], "tel")}</li>' for t in a["team"]) + "</ul>"
    else:
        person = '<div class="who none"><span>Мастер не назначен</span></div>'
    search = " ".join([a["title"], *a["blocks"], (a.get("who") or {}).get("name", ""),
                       *[t["name"] for t in a.get("team", [])]]).lower()
    return (f'<article class="area{" free" if a.get("free") else ""}{" night" if a.get("night") else ""}" data-search="{esc(search)}">'
            + (f'<header><span class="an">Ночная смена</span><span class="as">состав уточняется</span></header>' if a.get("night") else
               f'<header><span class="an">Участок {a["n"]}</span><span class="as">≈ {a["staff"]} чел.</span></header>')
            + f'<h4>{esc(a["title"])}</h4><ul class="chips">{chips}</ul>'
            + (f'<p class="anote">{esc(a["note"])}</p>' if a.get("note") else "") + f'{person}</article>')

def roles_section():
    out = []
    for g, people in SALES_ROLES:
        out.append(f'<h3 class="gh">{esc(g)}</h3><div class="roles">')
        for name, boss, info in people:
            p = next(x for x in [*DEPARTMENTS["sales"]["heads"], *DEPARTMENTS["sales"]["staff"],
                                 DEPARTMENTS["sales"]["subgroups"][0]["head"], *DEPARTMENTS["sales"]["subgroups"][0]["staff"]]
                     if x["name"] == name)
            duties = "".join(f"<li>{esc(d)}</li>" for d in info["duties"])
            out.append(
                f'<details class="role-item" data-search="{esc((name + " " + p["role"]).lower())}"><summary>'
                f'<b>{esc(name)}</b><span>{esc(p["role"])}</span></summary><div class="rbody">'
                f'<p><strong>Назначение.</strong> {esc(info["purpose"])}</p>'
                f'<p><strong>Подчиняется:</strong> {esc(boss)}</p>'
                f'<ul class="duties">{duties}</ul>'
                f'<p><strong>Взаимодействует:</strong> {esc(info["contacts"])}</p>'
                f'<p><strong>Результат работы:</strong> {esc(info["kpi"])}</p></div></details>')
        out.append("</div>")
    return "".join(out)

# REDACTED_B64_1 разделы
lead_cards = "".join(card(p, True) for p in LEADERSHIP)
sec = SECRETARY
sec_html = (f'<aside class="secnote" data-search="{esc((sec["name"] + " приёмная секретарь " + sec["role"] + " " + " ".join(sec["emails"] + sec["phones"])).lower())}">'
            f'<span class="lbl">Приёмная</span><b>{esc(sec["name"])}</b><span class="role">{esc(sec["role"])}</span>'
            f'<div class="cts">{contact_btn(sec["emails"][0], "mail")}{contact_btn(sec["phones"][0], "tel")}</div>'
            f'<p class="ex">{esc(sec["extra"])}</p></aside>')
romanov_link = (f'<a class="area-link" href="#areas"><span>Производственные участки</span>'
                f'<b>{len(AREAS)} участков · ≈ {TOTAL_STAFF} чел.</b></a>')
dir_cards = "".join(card(p, True) for p in DIRECTORS if p is not ROMANOV_V) + card(ROMANOV_V, True, romanov_link, cls="romanov")

masters = [a for a in AREAS if not a.get("free")]
free = [a for a in AREAS if a.get("free")]
mx = max(a["staff"] for a in AREAS)
bars = "".join(
    f'<li><span class="bn">{a["n"]}. {esc(a["title"])}</span><span class="bt"><i style="width:{a["staff"] / mx * 100:.1f}%"></i></span>'
    f'<span class="bv">{a["staff"]}</span></li>' for a in AREAS)
makarova = DEPARTMENTS["prod"]["heads"][0]

depts = "".join(dept_block(k, i) for i, k in enumerate(DEPT_ORDER, 1))

CSS = r"""
:root{
  /* Layout: sticky red masthead + nav; sections stack; cards on a uniform grid */
  --bg:#f5f3f3; --surface:#ffffff; --ink:#1d1a1a; --muted:#6e6767; --line:#e8dcdc;
  --accent:#e3171d; --accent-ink:#b30d12; --head:#ececec; --band:#ff1f1f; --band-ink:#ffffff;
  --chip:#f6e9e9; --bar:#f0dede;
  --f-body:"Golos Text", "Segoe UI", Roboto, Arial, sans-serif;
  --f-num:"JetBrains Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#141212; --surface:#1e1b1b; --ink:#f2eeee; --muted:#a49b9b; --line:#3a3131;
  --accent:#ff4d52; --accent-ink:#ff7a7e; --head:#2a2626; --band:#c8141a; --band-ink:#ffffff;
  --chip:#2d2323; --bar:#3a2a2a; color-scheme:dark } }
:root[data-theme="dark"]{
  --bg:#141212; --surface:#1e1b1b; --ink:#f2eeee; --muted:#a49b9b; --line:#3a3131;
  --accent:#ff4d52; --accent-ink:#ff7a7e; --head:#2a2626; --band:#c8141a; --band-ink:#ffffff;
  --chip:#2d2323; --bar:#3a2a2a; color-scheme:dark }
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:15px/1.45 var(--f-body)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--band)}
.wrap{max-width:1320px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.mast{background:var(--band);color:var(--band-ink)}
.mast .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;padding-block:18px 16px}
.mast img{height:30px;width:auto}
.mast h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em;text-wrap:balance}
.mast .facts{margin:2px 0 0;font-size:13px;opacity:.92}
.mast .t{flex:1 1 320px;min-width:0}
.nav{position:sticky;top:env(safe-area-inset-top,0px);z-index:9;background:var(--surface);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;padding-block:10px}
.nav a{color:var(--ink);text-decoration:none;font-size:14px;padding:6px 2px;border-bottom:2px solid transparent}
.nav a:hover,.nav a:focus-visible{border-color:var(--accent);outline:none}
.search{margin-left:auto;flex:1 1 240px;max-width:360px;position:relative}
.search input{width:100%;font:inherit;font-size:14px;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.search input:focus{outline:2px solid var(--accent);outline-offset:1px}
.hits{font-size:12px;color:var(--muted);margin-left:4px}
section{padding-block:34px 10px}
.eyebrow{margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink);font-weight:600}
h2{margin:0 0 6px;font-size:26px;line-height:1.15;text-wrap:balance}
.lead{margin:0 0 20px;color:var(--muted);max-width:68ch}
h3.tier{margin:26px 0 12px;font-size:13px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
.row{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:14px}
.lead3{grid-template-columns:repeat(3,minmax(0,1fr))}
.dir2{grid-template-columns:repeat(2,minmax(0,1fr));max-width:780px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;min-height:150px;display:flex;flex-direction:column;gap:2px;min-width:0}
.card.head{background:var(--head);border-color:var(--accent)}
.card.fill{border-style:dashed}
.card h4{margin:0;font-size:15.5px;line-height:1.25}
.role{margin:0 0 8px;color:var(--muted);font-size:13.5px}
.ex{margin:6px 0 0;color:var(--muted);font-size:12.5px}
.cts{display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.ct{all:unset;cursor:pointer;font-size:13.5px;color:var(--ink);border-radius:4px;padding:1px 3px;margin-left:-3px;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.ct-mail{color:var(--accent-ink)}
.ct:hover{background:var(--chip)} .ct:focus-visible{outline:2px solid var(--accent)}
.ct.copied::after{content:" · скопировано";color:var(--muted);font-size:12px}
.secwrap{display:flex;justify-content:flex-end;margin-top:12px}
.secnote{border:1px dashed var(--accent);border-radius:10px;padding:10px 14px;background:var(--surface);width:min(100%,360px)}
.secnote .lbl{display:block;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink);font-weight:700}
.secnote b{display:block;margin:2px 0 4px}
.secnote .role{display:block;margin:-2px 0 6px}
.area-link{margin-top:auto;display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;
  text-decoration:none;color:var(--band-ink);background:var(--accent);border-radius:8px;padding:8px 12px;font-size:13px}
.area-link b{font-weight:700}
.area-link:hover{filter:brightness(1.05)} .area-link:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.prodtop{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;max-width:780px;margin-bottom:6px}
.areas{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.area{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;min-width:0}
.area header{display:flex;justify-content:space-between;align-items:baseline;font-size:12px;color:var(--muted)}
.area .an{font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-ink)}
.area .as{font-family:var(--f-num);font-variant-numeric:tabular-nums;color:var(--ink);font-size:13px}
.area h4{margin:0;font-size:17px;line-height:1.2}
.chips{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px}
.chips li{background:var(--chip);border-radius:20px;padding:2px 10px;font-size:12.5px}
.anote{margin:0;font-size:13px;color:var(--accent-ink);font-weight:500}
.area.night{border-color:var(--ink);grid-column:span 2}
.area.night .an{color:var(--ink)}
@media (max-width:760px){ .area.night{grid-column:auto} }
.who{border-top:1px solid var(--line);padding-top:8px;display:flex;flex-direction:column;gap:1px}
.who span{color:var(--muted);font-size:13px}
.who.todo b::after{content:"уточнить";margin-left:8px;font-size:11px;font-weight:600;color:var(--accent-ink);border:1px solid var(--accent);border-radius:10px;padding:0 6px}
.who.none span{font-style:italic}
.nophone{font-size:12.5px;color:var(--muted)}
.team{list-style:none;margin:0;padding:8px 0 0;border-top:1px solid var(--line);display:flex;flex-direction:column;gap:6px}
.team li{display:flex;flex-direction:column}
.team li span{color:var(--muted);font-size:12.5px}
.bars{list-style:none;margin:0;padding:14px 16px;background:var(--surface);border:1px solid var(--line);border-radius:12px;display:grid;gap:7px}
.bars li{display:grid;grid-template-columns:minmax(0,230px) minmax(60px,1fr) 40px;gap:12px;align-items:center;font-size:13.5px}
.bn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt{height:10px;background:var(--bar);border-radius:5px;overflow:hidden}
.bt i{display:block;height:100%;background:var(--accent);border-radius:5px}
.bv{text-align:right;font-family:var(--f-num);font-variant-numeric:tabular-nums}
.bars .tot{border-top:1px solid var(--line);padding-top:7px;font-weight:700}
.dept{background:var(--surface);border:1px solid var(--line);border-radius:12px;margin-bottom:10px}
.dept summary{list-style:none;cursor:pointer;display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 14px;padding:14px 16px}
.dept summary::-webkit-details-marker{display:none}
.dept summary:focus-visible{outline:2px solid var(--accent);border-radius:12px}
.dn{font-family:var(--f-num);color:var(--accent-ink);font-size:13px}
.dt{font-weight:700;font-size:16.5px}
.dm{color:var(--muted);font-size:13px}
.dmail{margin-left:auto;font-size:13px;color:var(--accent-ink)}
.dept[open] summary{border-bottom:1px solid var(--line)}
.dbody{padding:14px 16px 18px;display:flex;flex-direction:column;gap:14px}
.dbody .row.heads .card{min-height:140px}
.dnote{margin:0;font-size:13.5px;color:var(--muted)}
.dnote a,.lead a{color:var(--accent-ink)}
.sub{border-top:2px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:12px}
.subh{margin:0;font-size:15px} .subh small{font-weight:400;color:var(--muted);margin-left:6px}
.gh{margin:22px 0 10px;font-size:15px}
.roles{display:grid;gap:8px}
.role-item{background:var(--surface);border:1px solid var(--line);border-radius:10px}
.role-item summary{list-style:none;cursor:pointer;display:flex;flex-wrap:wrap;gap:2px 12px;align-items:baseline;padding:11px 16px}
.role-item summary::-webkit-details-marker{display:none}
.role-item summary span{color:var(--muted);font-size:13.5px}
.role-item summary:focus-visible{outline:2px solid var(--accent);border-radius:10px}
.rbody{padding:4px 16px 14px;max-width:80ch;font-size:14px}
.rbody p{margin:6px 0}
.duties{margin:8px 0;padding-left:20px} .duties li{margin:3px 0}
.duties li::marker{color:var(--accent)}
footer{padding-block:30px 40px;color:var(--muted);font-size:12.5px}
.hidden-by-search{display:none!important}
mark{background:#ffe27a;color:#1d1a1a;border-radius:2px}
@media (max-width:760px){ .nav{position:static} .search{max-width:none;margin-left:0} .lead3,.dir2,.prodtop{grid-template-columns:1fr} .secwrap{justify-content:stretch} .bars li{grid-template-columns:minmax(0,1fr) 40px} .bars .bt{grid-column:1 / -1;grid-row:2} .dmail{margin-left:0} }
@media (prefers-reduced-motion:no-preference){ .card,.area{transition:border-color .15s} }
""" + KOM.section_css(KO.SECTION_CSS) + r"""
.ko{--ko-stick:59px}
@media (max-width:760px){ .ko{--ko-stick:0px} }
"""

JS = r"""
(function(){
  var q=document.getElementById('q'), hits=document.getElementById('hits');
  document.addEventListener('click',function(e){
    var b=e.target.closest('.ct'); if(!b) return;
    var v=b.getAttribute('data-copy');
    function done(){ b.classList.add('copied'); setTimeout(function(){b.classList.remove('copied')},1400); }
    function sel(){ var r=document.createRange(); r.selectNodeContents(b.firstChild); var s=getSelection(); s.removeAllRanges(); s.addRange(r); }
    try{ navigator.clipboard.writeText(v).then(done,sel); }catch(err){ sel(); }
  });
  var items=[].slice.call(document.querySelectorAll('[data-search]'));
  var depts=[].slice.call(document.querySelectorAll('details.dept'));
  var roles=[].slice.call(document.querySelectorAll('details.role-item'));
  q.addEventListener('input',function(){
    var t=q.value.trim().toLowerCase(), n=0;
    items.forEach(function(el){
      var ok=!t||el.getAttribute('data-search').indexOf(t)>=0;
      el.classList.toggle('hidden-by-search',!ok); if(t&&ok) n++;
    });
    depts.forEach(function(d){
      var any=d.querySelector('[data-search]:not(.hidden-by-search)');
      var titleHit=t&&d.querySelector('summary').textContent.toLowerCase().indexOf(t)>=0;
      if(titleHit){ d.querySelectorAll('[data-search]').forEach(function(x){x.classList.remove('hidden-by-search')}); any=true; }
      d.classList.toggle('hidden-by-search',!!t&&!any); d.open=!!t&&!!any;
    });
    roles.forEach(function(r){ if(!t) r.open=false; });
    hits.textContent=t?('найдено: '+n):'';
  });
  function openHash(){
    var id=location.hash.slice(1); if(!id) return;
    var el=document.getElementById(id); if(el&&el.tagName==='DETAILS') el.open=true;
  }
  window.addEventListener('hashchange',openHash); openHash();
})();
"""

page = f"""<title>Оргструктура «Фабрикант»</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap">
<style>{CSS}</style>
<header class="mast"><div class="wrap">
  <img src="data:image/png;base64,{LOGO}" alt="Фабрикант">
  <div class="t"><h1>{esc(COMPANY)}: оргструктура и контакты</h1>
  <p class="facts">{count_people()} сотрудника · {len(DEPT_ORDER)} отделов · {len(AREAS)} производственных участков · данные схемы «Компания (1).pdf» и ответы руководителей · редакция {EDITION}</p></div>
</div></header>
<nav class="nav" aria-label="Разделы"><div class="wrap">
  <a href="#leaders">Руководство</a><a href="#areas">Производственные участки</a><a href="#depts">Отделы</a><a href="#roles">Коммерческий отдел</a>
  <label class="search"><input id="q" type="search" placeholder="Поиск: ФИО, должность, телефон, почта, участок" autocomplete="off" aria-label="Поиск по сотрудникам"></label>
  <span class="hits" id="hits" aria-live="polite"></span>
</div></nav>
<main class="wrap">
<section id="leaders">
  <p class="eyebrow">Верхний уровень</p><h2>Руководство</h2>
  <p class="lead">Нажмите на почту или телефон, чтобы скопировать.</p>
  <h3 class="tier">Высшее руководство</h3>
  <div class="row lead3">{lead_cards}</div>
  <div class="secwrap">{sec_html}</div>
  <h3 class="tier">Директора направлений</h3>
  <div class="row dir2">{dir_cards}</div>
</section>
<section id="areas">
  <p class="eyebrow">Директор по производству · Сотрудник23 В. В.</p><h2>Производственные участки</h2>
  <p class="lead">{len(AREAS)} участков, стабильный состав ≈ {TOTAL_STAFF} человек. Численность приблизительная, по схеме участков. Мастера и телефоны сверены с оргструктурой.</p>
  <div class="prodtop">{card(ROMANOV_V, True)}{card(makarova, True)}</div>
  <h3 class="tier">Участки с мастерами и ответственными</h3>
  <div class="areas">{"".join(area_card(a) for a in masters)}</div>
  <h3 class="tier">Ночная смена</h3>
  <div class="areas">{area_card(NIGHT)}</div>
  <h3 class="tier">Отдельные участки</h3>
  <div class="areas">{"".join(area_card(a) for a in free)}</div>
  <h3 class="tier">Численность по участкам</h3>
  <ul class="bars">{bars}<li class="tot"><span class="bn">Всего</span><span></span><span class="bv">{TOTAL_STAFF}</span></li></ul>
</section>
<section id="depts">
  <p class="eyebrow">Контакты</p><h2>Отделы</h2>
  <p class="lead">Нажмите на отдел, чтобы раскрыть сотрудников. Руководители выделены серым.</p>
  {depts}
</section>
{KOM.ORG_SECTION}
</main>
<footer><div class="wrap">{esc(COMPANY)} · оргструктура по «Компания (1).pdf», производственные участки по схеме участков, ответы руководителей и решения коммерческого директора · редакция {EDITION}.2026</div></footer>
<script>{JS}{KO.TOGGLE_JS}</script>
"""
open(OUT, "w", encoding="utf-8").write(page)
print("saved", OUT, len(page))
