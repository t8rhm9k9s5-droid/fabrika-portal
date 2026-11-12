# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник Сотрудник Отчество (владелец) и Сотрудник Сотрудник Отчество — с равными правами.
# Команда Сотрудник Отчество = команда Сотрудник Отчество, любым каналом: почта (в т. ч. user@example.org, user@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""Page «Производство»: production areas, masters and stable headcount (from the org chart the user sent),
in the look of iOS «Настройки» (22.10.2026): grouped lists, a row per area, a tap opens the details.
Which buildings belong to an area comes from the edits store (chosen in the model's building card),
otherwise from the defaults in areas.json. Writes build/staff_frag.html (a fragment; the skeleton is added by build_site.py)."""
import os
import json, html
B = '/home/claude/build/'
# 03.11.2026: «Расследования» (gen_invest.py → invest_frag.html) на общий портал НЕ выкладываем: выводы и имена — только Сотрудник
#   (правило: «выводы о виновных — только Т. В.», по 6244/6038 никому ничего до его разбора на планёрке). Данные — build/invest/cases.json и реестр.
#   Выложить — только по слову Т. В.: в cases.json поставить "public": true.
try: INVEST_PUBLIC = bool(json.load(open(B + 'invest/cases.json', encoding='utf-8')).get('public'))
except Exception: INVEST_PUBLIC = False
A = json.load(open(B + 'areas.json', encoding='utf-8'))
S = json.load(open(B + 'site_app.json', encoding='utf-8'))
import sys as _s; _s.path.insert(0, B); import split_b43 as _SB; _SB.split(S); import split_b29 as _SB29; _SB29.split(S)   # лит. С is two areas: металлоизделия and ГКИ (23.10.2026)
esc = lambda s: html.escape(str(s), quote=True)
areas = A['areas']
mx = max(a['staff'] for a in areas)
total = sum(a['staff'] for a in areas)
masters = [a for a in areas if not a.get('free')]
free = [a for a in areas if a.get('free')]
names = {b['k']: b['name'] for b in S['buildings'] if not b.get('parent') and b.get('kind') not in ('plan', 'stage2', 'porch', 'chimney')}
SV = lambda d: f'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{d}</svg>'
I_PEOPLE = SV('<circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9" r="2.5"/><path d="M3 20c.7-3.6 2.9-5.5 5.5-5.5s4.8 1.9 5.5 5.5M14 14.9c.8-.6 1.8-.9 2.8-.9 2.2 0 3.8 1.7 4.2 5.3"/>')
I_GRID = SV('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>')
I_MOON = SV('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>')
I_BADGE = SV('<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20.5c.9-4 3.6-6 7-6s6.1 2 7 6"/>')


def tile(a):
    return f'<span class="itile num" style="--c:{a["color"]};--ci:{a["ink"]}">{a["n"]}</span>'


def lc(t): return t[:1].lower() + t[1:] if t and not t[1:2].isupper() else t   # «ОТК …» stays


def copy_row(label, name, phone, extra='', role=''):
    rl = f'<br><span class="dim">{esc(role)}</span>' if role else ''
    tel = rl + (f'<br><span class="tel">{esc(phone)}</span>' if phone else (f'<br><span class="dim">{esc(extra)}</span>' if extra else ''))
    btn = f'<button type="button" class="cp" data-copy="{esc(phone)}">Скопировать</button>' if phone else ''
    return f'<div class="drow"><span>{esc(label)}</span><span>{esc(name)}{tel}</span>{btn}</div>'


def area_row(a):
    """one area: the row (number, area, master, headcount) and, opened, the master with the phone, the night work, the blocks, where it is and the bar
    (the scheme «Производственные участки», 23.10.2026)"""
    title = a.get('title') or a['name']
    sub = a['role'] if a.get('free') else a['name'] + ' — ' + lc(a['role'])
    rows = []
    if not a.get('free'):
        rows.append(copy_row('Мастер' if a['role'].startswith('Мастер') else 'Ответственный', a['name'], a['phone'], a.get('contact', ''), a['role']))
    for nm, rl, ph in a.get('resp') or []:      # the storekeepers of area 10 (org structure, 23.10.2026)
        rows.append(copy_row(rl, nm, ph))
    if a.get('night'):
        k, _, v = a['night'].partition(': ')
        rows.append(f'<div class="drow"><span>{esc(k)}</span><span class="night">{esc(v)}</span></div>')
    if a['blocks']:
        rows.append(f'<div class="drow"><span>Блоки</span><span>{esc(", ".join(a["blocks"]))}</span></div>')
    rows.append(f'<div class="drow"><span>На площадке</span><span data-where="{a["n"]}">&nbsp;</span></div>')
    rows.append(f'<div class="drow"><span>Стабильный состав</span><span class="grow"><span class="ibar"><i style="width:{a["staff"] / mx * 100:.1f}%;background:{a["color"]}"></i></span></span>'
                f'<b>{"≈ " if a["approx"] else ""}{a["staff"]}</b></div>')
    moon = '<span class="moon" title="Работает и ночью">' + I_MOON + '</span>' if a.get('night') else ''
    return (f'<details id="u{a["n"]}"><summary class="irow">{tile(a)}<span class="ic"><span class="ibody"><span class="ititle">{esc(title)}{moon}</span>'
            f'<span class="isub">{esc(sub)}</span></span><span class="ival">{"≈ " if a["approx"] else ""}{a["staff"]}</span><span class="ichev"></span></span></summary>'
            f'<div class="idetail">{"".join(rows)}</div></details>')


def night_row(N):
    """the night shift: one row, opened — the night master, what works at night, which nights"""
    m = N['master']
    rows = [copy_row(m['role'], m['name'], m.get('phone', '')),
            f'<div class="drow"><span>Ночью работают</span><span>{esc(", ".join(N["blocks"]))}</span></div>',
            f'<div class="drow"><span>Ночи</span><span>{esc(N["note"])}</span></div>',
            f'<div class="drow"><span>Состав</span><span>{esc(N.get("status", ""))}</span></div>']
    return (f'<details id="night"><summary class="irow"><span class="itile" style="--c:#3a3f8f">{I_MOON}</span><span class="ic"><span class="ibody">'
            f'<span class="ititle">{esc(N["title"])}</span><span class="isub">{esc(lc(m["role"]))} {esc(m["name"])} · {esc(N.get("status", ""))}</span></span>'
            f'<span class="ichev"></span></span></summary><div class="idetail">{"".join(rows)}</div></details>')


def count_row(a):
    nm = a.get('title') or a['name'] if a.get('free') else a['name'].split(' ')[0]
    sm = f' — {a["short"]}' if a.get('short') else ''
    return (f'<div class="irow static">{tile(a)}<span class="ic"><span class="ibody"><span class="ititle">{esc(nm)}<span class="dim">{esc(sm)}</span></span>'
            f'<span class="ibar"><i style="width:{a["staff"] / mx * 100:.1f}%;background:{a["color"]}"></i></span></span>'
            f'<span class="ival">{a["staff"]}</span></span></div>')


def stat(icon, color, title, val, href=None):
    # 02.11.2026, замечания Т. В. (скриншот «НЕ кликабельно»): строки сводки ведут к своим спискам
    if href:
        return (f'<a class="irow" href="{href}"><span class="itile" style="--c:{color}">{icon}</span><span class="ic"><span class="ibody"><span class="ititle">{title}</span></span>'
                f'<span class="ival">{val}</span><span class="ichev" aria-hidden="true"></span></span></a>')
    return (f'<div class="irow static"><span class="itile" style="--c:{color}">{icon}</span><span class="ic"><span class="ibody"><span class="ititle">{title}</span></span>'
            f'<span class="ival">{val}</span></span></div>')


d = A['director']
ini = ''.join(w[0] for w in d['name'].split()[:2])
data = json.dumps({'areas': [{k: a.get(k) for k in ('n', 'name', 'title', 'blds', 'free')} for a in areas], 'names': names}, ensure_ascii=False).replace('<', '\\u003c')

page = f'''<title>Фабрика — производство</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="assets/site.css">
<style>
:root{{--bg:#f2f2f7;--fg:#000}}
*{{box-sizing:border-box}}
html,body{{margin:0;min-height:100%}}
body{{background:var(--bg);color:var(--fg);font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}}
.itile.num{{font-variant-numeric:tabular-nums}}
.ititle .dim{{color:var(--ios-2,#888)}}
.ibody .ibar{{margin-top:7px;max-width:260px}}
.idetail{{padding-left:60px}}
.idetail .drow .grow{{flex:1;min-width:80px}}
.idetail .drow .grow .ibar{{margin-top:0}}
.idetail .drow b{{font-variant-numeric:tabular-nums}}
.idetail .tel{{user-select:all;font-variant-numeric:tabular-nums}}
.idetail .cp{{margin-left:auto}}
[data-where] a{{color:var(--ios-blue,#007aff);text-decoration:none}}
.idetail .dim{{color:var(--ios-2,#888)}}
.idetail .night{{color:var(--ios-indigo,#5856d6)}}
.ititle .moon{{display:inline-flex;width:15px;height:15px;margin-left:6px;vertical-align:-2px;color:var(--ios-indigo,#5856d6)}}
.ititle .moon svg{{width:100%;height:100%}}
</style>
<div class="ios">
  <p class="eyebrow">Фабрика</p>
  <h1>Производство</h1>
  <div class="igroup" style="margin-top:14px">
    <div class="irow static big"><span class="iavatar">{esc(ini)}</span><span class="ic"><span class="ibody"><span class="ititle">{esc(d['name'])}</span><span class="isub">{esc(d['role'])}{(' · <span class="tel">' + esc(d['phone']) + '</span>') if d.get('phone') else ''}</span></span></span></div>
    {(lambda q: f'<div class="irow static"><span class="iavatar sm">{esc("".join(w[0] for w in q["name"].split()[:2]))}</span><span class="ic"><span class="ibody"><span class="ititle">{esc(q["name"])}</span><span class="isub">{esc(q["role"])} · <span class="tel">{esc(q["phone"])}</span> · {esc(q["email"])}</span></span></span></div>')(A['pdo']) if A.get('pdo') else ''}
  </div>
  <p class="ihdr">Сводка</p>
  <div class="igroup">
    {stat(I_PEOPLE, '#007aff', 'Стабильный состав', f'≈ {total} чел.', '#headcount')}
    {stat(I_GRID, '#ff9500', 'Участков', len(areas), '#masters')}
    {stat(I_BADGE, '#34c759', 'Мастеров и ответственных', len(masters), '#masters')}
  </div>
  <p class="ihdr" id="masters">Участки с мастерами и ответственными</p>
  <div class="igroup">{''.join(area_row(a) for a in masters)}</div>
  <p class="ifoot">Нажмите на участок: телефон мастера, ночная работа, блоки и здания на площадке. Луна — участок работает и ночью.</p>
  {(f'<p class="ihdr">Ночная смена</p><div class="igroup">{night_row(A["night"])}</div>') if A.get('night') else ''}
  <p class="ihdr" id="areas">Отдельные участки</p>
  <div class="igroup">{''.join(area_row(a) for a in free)}</div>
  {open(B + 'pf_frag.html', encoding='utf-8').read() if os.path.exists(B + 'pf_frag.html') else ''}
  {open(B + 'salescap_frag.html', encoding='utf-8').read() if os.path.exists(B + 'salescap_frag.html') else ''}
  {open(B + 'invest_frag.html', encoding='utf-8').read() if os.path.exists(B + 'invest_frag.html') and INVEST_PUBLIC else ''}
  <p class="ihdr" id="headcount">Численность по участкам</p>
  <div class="igroup">{''.join(count_row(a) for a in sorted(areas, key=lambda a: (-a['staff'], a['n'])))}</div>
  <p class="ifoot">{esc(A['note'])} Где находится участок — предварительно, по названиям цехов; поправить можно в <a href="index.html">модели</a>: откройте здание и выберите участок в карточке. В модели слой «Участки производства» красит здания по участкам.</p>
</div>
<script id="areas-data" type="application/json">{data}</script>
<script src="assets/edits.js"></script>
<script src="assets/site.js"></script>
<script>
(function(){{
  var D = JSON.parse(document.getElementById('areas-data').textContent), E = window.T14Edits;
  function esc(s){{ return String(s).replace(/[&<>"]/g, function(c){{ return {{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}}[c]; }}); }}
  function fill(){{
    var def = {{}}; D.areas.forEach(function(a){{ (a.blds || []).forEach(function(k){{ def[k] = a.n; }}); }});
    var by = {{}};
    Object.keys(D.names).forEach(function(k){{ var e = E.get('b:' + k), n = e && e.area != null ? e.area : def[k]; if (n) (by[n] = by[n] || []).push({{k:k, name:(e && e.name) || D.names[k]}}); }});
    document.querySelectorAll('[data-where]').forEach(function(p){{
      var n = Number(p.getAttribute('data-where')), L = by[n] || [];
      p.innerHTML = L.length ? L.map(function(b){{ return '<a href="index.html#' + b.k + '">' + esc(b.name) + '</a>'; }}).join(', ')
        : 'не указано — <a href="index.html#area' + n + '">выбрать в модели</a>';
    }});
  }}
  E.ready().then(fill); E.on(fill);
  window.T14Ask = ['Кто мастер швейного участка?', 'Кто ночной мастер?', 'Где на площадке участок 6?'];
  // a link to #u5 (or #night) opens that area
  function openHash(){{ var m = /^#(u\\d+|night)$/.test(location.hash) && document.querySelector(location.hash); if (m && m.tagName === 'DETAILS') m.open = true; }}
  openHash(); window.addEventListener('hashchange', openHash);
  document.addEventListener('click', function(e){{
    var b = e.target.closest('[data-copy]'); if (!b) return;
    e.preventDefault();
    var t = b.getAttribute('data-copy'), done = function(){{ b.textContent = 'Скопировано'; setTimeout(function(){{ b.textContent = 'Скопировать'; }}, 1600); }};
    try {{ navigator.clipboard.writeText(t).then(done, sel); }} catch(err){{ sel(); }}
    function sel(){{ var s = b.parentNode.querySelector('.tel'), r = document.createRange(); r.selectNodeContents(s); var w = getSelection(); w.removeAllRanges(); w.addRange(r); b.textContent = 'Выделено — Ctrl+C'; }}
  }});
}})();
</script>
'''
open(B + 'staff_frag.html', 'w', encoding='utf-8').write(page)
print('staff page', round(len(page) / 1e3), 'KB')
