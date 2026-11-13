# -*- coding: utf-8 -*-
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
import html, base64
from data_fabrikant import (COMPANY, LEADERSHIP, DIRECTORS, SECRETARY,
                            DEPARTMENTS, DEPT_ORDER, dept_count, count_people,
                            ROMANOV_V, AREAS, AREAS_STAFF, AREA_CARDS)

with open(_os.path.join(_SRC, "logo_white.png"), "rb") as _f:
    LOGO_B64 = base64.b64encode(_f.read()).decode()

def esc(s): return html.escape(s or "")

def contact_html(p):
    rows = [f'<a class="em" href="mailto:{esc(e)}">{esc(e)}</a>' for e in p["emails"]]
    rows += [f'<a class="ph" href="tel:{esc("".join(ch for ch in ph.split("(")[0].split("—")[0] if ch.isdigit() or ch=="+"))}">{esc(ph)}</a>' for ph in p["phones"]]
    if p["extra"]: rows.append(f'<span class="ex">{esc(p["extra"])}</span>')
    return "".join(f'<div class="line">{r}</div>' for r in rows)

def node(p, kind="staff"):
    if p.get("fillable"):
        inputs = "".join(f'<div class="line"><input class="fill" type="text" placeholder="{esc(f)} — вписать"></div>'
                         for f in p.get("fill_fields") or ["ФИО", "Телефон", "E-mail"])
        return (f'<div class="node {kind} fillcard"><div class="nm">{esc(p["role"])}</div>'
                f'<div class="rl">данные вписать</div><div class="ct">{inputs}</div></div>')
    return (f'<div class="node {kind}"><div class="nm">{esc(p["name"])}</div>'
            f'<div class="rl">{esc(p["role"])}</div><div class="ct">{contact_html(p)}</div></div>')

def subgroup_html(sg):
    mail = f'<a class="dept-mail" href="mailto:{esc(sg["email"])}">{esc(sg["email"])}</a>' if sg.get("email") else ""
    head = f'<div class="heads">{node(sg["head"], "head")}</div>' if sg.get("head") else ""
    staff = "".join(node(p) for p in sg.get("staff", []))
    staff = f'<div class="staff-grid">{staff}</div>' if staff else ""
    return (f'<div class="subgroup"><div class="subgroup-head"><span class="subgroup-title">{esc(sg["title"])}</span>'
            f'{mail}</div>{head}{staff}</div>')

def dept_card(key):
    d = DEPARTMENTS[key]
    email = f'<a class="dept-mail" href="mailto:{esc(d["email"])}">{esc(d["email"])}</a>' if d["email"] else ""
    heads = "".join(node(p, "head") for p in d["heads"])
    staff = "".join(node(p) for p in d["staff"])
    body = (f'<div class="dept-note">{esc(d["note"])}</div>' if d.get("note") else "")
    body += f'<div class="heads">{heads}</div>' if heads else ""
    body += f'<div class="staff-grid">{staff}</div>' if staff else ""
    body += "".join(subgroup_html(sg) for sg in d.get("subgroups", []))
    return (f'<details class="dept" data-key="{key}"><summary><span class="chev">▸</span>'
            f'<span class="dept-title">{esc(d["title"])}</span>'
            f'<span class="dept-meta">{esc(d["floor"])} · {dept_count(key)} чел.</span>{email}</summary>'
            f'<div class="dept-body">{body}</div></details>')

_styles = ["council", "gd", "council"]
leadership_html = "".join(f'<div class="dir-wrap">{node(p, _styles[i])}</div>' for i, p in enumerate(LEADERSHIP))
def _dir(p):
    link = (f'<a class="area-link" href="#areas">Производственные участки: {len(AREAS)} · ≈ {AREAS_STAFF} чел.</a>'
            if p is ROMANOV_V else "")
    return f'<div class="dir-wrap">{node(p, "dir")}{link}</div>'
directors_html = "".join(_dir(p) for p in DIRECTORS)

def area_html(a):
    chips = "".join(f'<span class="chip">{esc(b)}</span>' for b in a["blocks"])
    if a.get("who"):
        w = a["who"]
        ph = "".join(f'<div class="line"><a class="ph" href="tel:{esc(x.replace(" ", ""))}">{esc(x)}</a></div>' for x in w["phones"]) \
             or f'<div class="line ex">{esc(w.get("extra") or "телефона нет в схеме")}</div>'
        tag = ' <span class="todo">уточнить</span>' if a.get("todo") else ""
        who = f'<div class="who"><b>{esc(w["name"])}</b>{tag}<div class="rl">{esc(w["role"])}</div>{ph}</div>'
    elif a.get("team"):
        who = '<div class="who">' + "".join(f'<div class="line"><b>{esc(t["name"])}</b> · {esc(t["phones"][0])}</div>' for t in a["team"]) + "</div>"
    else:
        who = '<div class="who"><span class="ex">Мастер не назначен</span></div>'
    hdr = ('<span>Ночная смена</span><span>состав уточняется</span>' if a.get("night")
           else f'<span>Участок {a["n"]}</span><span>≈ {a["staff"]} чел.</span>')
    return (f'<div class="area{" free" if a.get("free") else ""}"><div class="ah">{hdr}</div>'
            f'<div class="at">{esc(a["title"])}</div><div class="chips">{chips}</div>'
            + (f'<div class="anote">{esc(a["note"])}</div>' if a.get("note") else "") + f'{who}</div>')
areas_html = "".join(area_html(a) for a in AREA_CARDS)
depts_html = "".join(dept_card(k) for k in DEPT_ORDER)
S = SECRETARY
_tail = " · ".join(x for x in [(S["phones"][0] if S["phones"] else ""), S["extra"]] if x)
secretary_html = (f'<div class="sec-note-wrap"><div class="sec-note"><span class="sec-note-title">Приёмная</span>'
                  f'<b>{esc(S["name"])}</b><br>{esc(S["role"])}<br><a href="mailto:{esc(S["emails"][0])}">{esc(S["emails"][0])}</a>'
                  f'<br>{esc(_tail)}</div></div>')

HTML = f"""<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(COMPANY)} — оргструктура и контакты</title>
<style>
  :root {{ --red:#ff1f1f; --red-d:#cc0000; --light:#ececec; --dark:#8a1414;
          --ink:#2b2b2b; --muted:#7a7a7a; --line:#f0cccc; --bg:#faf7f4; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif; color:var(--ink); background:var(--bg); line-height:1.35; }}
  header {{ background:linear-gradient(135deg,var(--red),var(--red-d)); color:#fff; padding:20px; position:sticky; top:0; z-index:10; box-shadow:0 2px 12px rgba(0,0,0,.15); }}
  .brand {{ display:flex; align-items:center; gap:14px; flex-wrap:wrap; }}
  header h1 {{ margin:0; font-size:21px; }}
  header .sub {{ opacity:.92; font-size:13px; margin-top:3px; }}
  .toolbar {{ display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }}
  .toolbar input {{ flex:1; min-width:200px; padding:9px 12px; border:none; border-radius:8px; font-size:14px; outline:none; }}
  .btn {{ background:rgba(255,255,255,.18); color:#fff; border:1px solid rgba(255,255,255,.5); padding:8px 12px; border-radius:8px; cursor:pointer; font-size:13px; }}
  .btn:hover {{ background:rgba(255,255,255,.3); }}
  main {{ max-width:1200px; margin:0 auto; padding:20px 16px; }}
  .tier-label {{ font-size:12px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin:22px 0 10px; font-weight:600; }}
  .row {{ display:flex; gap:14px; flex-wrap:wrap; justify-content:center; }}
  .lead-block {{ width:100%; max-width:900px; margin:0 auto; }}
  .lead-row {{ flex-wrap:nowrap; }}
  .lead-row .dir-wrap {{ flex:1 1 0; min-width:0; }}
  .lead-row .node {{ width:100%; }}
  .sec-note-wrap {{ display:flex; justify-content:flex-end; margin-top:10px; }}
  .sec-note {{ font-size:12px; color:var(--muted); border:1px dashed var(--line); border-radius:8px; padding:8px 12px; background:#fafafa; width:250px; max-width:100%; text-align:center; line-height:1.5; }}
  .sec-note-title {{ display:block; font-weight:700; color:var(--dark); text-transform:uppercase; font-size:10.5px; letter-spacing:.05em; margin-bottom:2px; }}
  .sec-note a {{ color:var(--red-d); text-decoration:none; }}
  .sec-note b {{ color:var(--ink); }}
  .node {{ background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px 14px; width:250px; min-height:132px; box-shadow:0 1px 4px rgba(0,0,0,.05); }}
  .node .nm {{ font-weight:700; font-size:14px; }}
  .node .rl {{ font-size:12.5px; color:var(--muted); margin:2px 0 6px; }}
  .node .line {{ font-size:12.5px; margin:1px 0; }}
  .node a {{ color:var(--red-d); text-decoration:none; word-break:break-all; }}
  .node a.ph {{ color:var(--ink); }}
  .node a:hover {{ text-decoration:underline; }}
  .node .ex {{ color:var(--muted); font-size:12px; }}
  .node.fillcard {{ border-style:dashed; }}
  .node .fill {{ width:100%; font-size:12.5px; padding:4px 6px; margin:2px 0; border:1px solid var(--line); border-radius:6px; font-family:inherit; }}
  .node.council, .node.dir, .heads .node {{ background:var(--light); border-color:var(--red); }}
  .node.gd {{ border:2px solid var(--red); }}
  .dir-wrap {{ display:flex; flex-direction:column; align-items:center; }}
  details.dept {{ background:#fff; border:1px solid var(--line); border-left:4px solid var(--red); border-radius:10px; margin:10px 0; overflow:hidden; }}
  details.dept summary {{ list-style:none; cursor:pointer; padding:14px 16px; display:flex; align-items:center; gap:10px; flex-wrap:wrap; }}
  details.dept summary::-webkit-details-marker {{ display:none; }}
  details.dept summary:hover {{ background:#f6f6f6; }}
  .chev {{ color:var(--red); transition:transform .15s; }}
  details.dept[open] .chev {{ transform:rotate(90deg); }}
  .dept-title {{ font-weight:700; font-size:15.5px; }}
  .dept-meta {{ font-size:12.5px; color:var(--muted); }}
  .dept-mail {{ margin-left:auto; font-size:13px; color:var(--red-d); text-decoration:none; background:var(--light); padding:4px 10px; border-radius:20px; }}
  .dept-body {{ padding:6px 16px 18px; border-top:1px solid var(--line); }}
  .dept-note {{ font-size:12.5px; color:#666; background:#f7f7f7; border:1px dashed var(--line); border-radius:8px; padding:10px 12px; margin:12px 0 2px; }}
  .heads {{ display:flex; gap:12px; flex-wrap:wrap; padding:14px 0 6px; }}
  .staff-grid {{ display:flex; flex-wrap:wrap; gap:12px; padding-top:12px; }}
  .heads + .staff-grid {{ border-top:1px dashed var(--line); margin-top:8px; }}
  .subgroup {{ margin-top:14px; border-top:2px solid var(--line); padding-top:6px; }}
  .subgroup-head {{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; background:var(--light); border-radius:8px; padding:7px 12px; margin:6px 0; }}
  .subgroup-title {{ font-weight:700; font-size:14px; color:var(--dark); }}
  .area-link {{ display:block; margin-top:8px; font-size:12.5px; font-weight:600; color:#fff; background:var(--red-d); text-decoration:none; padding:6px 12px; border-radius:8px; text-align:center; }}
  .area-link:hover {{ background:var(--red); }}
  .areas {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px; }}
  .area {{ background:#fff; border:1px solid var(--line); border-radius:12px; padding:12px 14px; display:flex; flex-direction:column; gap:6px; }}
  .area.free {{ border-style:dashed; }}
  .area .ah {{ display:flex; justify-content:space-between; font-size:11.5px; font-weight:700; color:var(--red-d); text-transform:uppercase; letter-spacing:.04em; }}
  .area .at {{ font-weight:700; font-size:15px; }}
  .area .chips {{ display:flex; flex-wrap:wrap; gap:5px; }}
  .area .chip {{ background:#f7ecec; border-radius:12px; padding:1px 9px; font-size:12px; }}
  .area .anote {{ font-size:12px; color:var(--red-d); font-weight:600; }}
  .area .who {{ border-top:1px solid var(--line); padding-top:6px; font-size:13px; }}
  .area .who .rl {{ font-size:12.5px; color:var(--muted); }}
  .area .who a.ph {{ color:var(--ink); text-decoration:none; }}
  .area .ex {{ color:var(--muted); font-size:12px; }}
  .area .todo {{ font-size:10.5px; font-weight:700; color:var(--red-d); border:1px solid var(--red); border-radius:10px; padding:0 6px; }}
  .areas-note {{ font-size:12px; color:var(--muted); margin:8px 0 0; }}
  mark {{ background:#ffe08a; padding:0 2px; border-radius:3px; }}
  .hidden {{ display:none !important; }}
  footer {{ text-align:center; color:var(--muted); font-size:12px; padding:24px; }}
  @media (max-width:640px) {{ .staff-grid .node, .heads .node, .row > .dir-wrap .node {{ width:100%; }} .lead-row .node {{ padding:10px; }} }}
</style></head><body>
<header>
  <div class="brand"><img src="data:image/png;base64,{LOGO_B64}" alt="Фабрикант" height="30">
    <div><h1>{esc(COMPANY)} — оргструктура и контакты</h1>
    <div class="sub">{count_people()} человек · нажмите на отдел, чтобы раскрыть сотрудников</div></div></div>
  <div class="toolbar">
    <input id="search" type="search" placeholder="Поиск: имя, должность, e-mail, телефон, город…" autocomplete="off">
    <button class="btn" id="expandAll">Раскрыть всё</button>
    <button class="btn" id="collapseAll">Свернуть всё</button>
  </div>
</header>
<main>
  <div class="tier-label">Высшее руководство</div>
  <div class="lead-block"><div class="row lead-row">{leadership_html}</div>{secretary_html}</div>
  <div class="tier-label">Директора направлений</div>
  <div class="row">{directors_html}</div>
  <div class="tier-label" id="areas">Производственные участки · директор по производству Сотрудник23 В. В. · {len(AREAS)} участков, ≈ {AREAS_STAFF} чел.</div>
  <div class="areas">{areas_html}</div>
  <p class="areas-note">Численность приблизительная, по схеме участков. Мастера и телефоны сверены с оргструктурой.</p>
  <div class="tier-label">Отделы</div>
  <div id="depts">{depts_html}</div>
</main>
<footer>Данные сверены с файлом «Компания (1).pdf». Производственные участки по схеме участков.</footer>
"""

SCRIPT = r"""
<script>
const search=document.getElementById('search');
const depts=[...document.querySelectorAll('details.dept')];
const topNodes=[...document.querySelectorAll('.row .node, .sec-note, .area')];
document.getElementById('expandAll').onclick=()=>depts.forEach(d=>d.open=true);
document.getElementById('collapseAll').onclick=()=>depts.forEach(d=>d.open=false);
function clearMarks(el){el.querySelectorAll('mark').forEach(m=>m.replaceWith(document.createTextNode(m.textContent)));el.normalize();}
function markText(el,q){const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);const t=[];let n;while(n=w.nextNode())t.push(n);
  const rx=new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig');
  t.forEach(x=>{if(rx.test(x.nodeValue)){const s=document.createElement('span');s.innerHTML=x.nodeValue.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(rx,'<mark>$1</mark>');x.replaceWith(s);}});}
search.addEventListener('input',()=>{const q=search.value.trim().toLowerCase();
  [...depts,...topNodes].forEach(clearMarks);
  if(!q){depts.forEach(d=>{d.classList.remove('hidden');d.open=false;d.querySelectorAll('.node').forEach(x=>x.classList.remove('hidden'));});topNodes.forEach(x=>x.classList.remove('hidden'));return;}
  topNodes.forEach(x=>{const hit=x.textContent.toLowerCase().includes(q);x.classList.toggle('hidden',!hit);if(hit)markText(x,q);});
  depts.forEach(d=>{let any=false;const nodes=d.querySelectorAll('.dept-body .node');
    nodes.forEach(x=>{const hit=x.textContent.toLowerCase().includes(q);x.classList.toggle('hidden',!hit);if(hit){any=true;markText(x,q);}});
    const s=d.querySelector('summary');
    if(s.textContent.toLowerCase().includes(q)){any=true;markText(s,q);nodes.forEach(x=>x.classList.remove('hidden'));}
    d.classList.toggle('hidden',!any);d.open=any;});
});
</script></body></html>"""

out = _os.path.join(_ROOT, "out", "Оргструктура_контакты.html")
with open(out, "w", encoding="utf-8") as _cg1_output_213:
    _cg1_output_213.write(HTML + SCRIPT)
print("saved", out)
