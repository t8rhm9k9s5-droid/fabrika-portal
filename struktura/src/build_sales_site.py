# -*- coding: utf-8 -*-
"""Отдельный сайт «Коммерческий отдел»: тот же раздел, что и в общем сайте оргструктуры (sales_section.py)."""
import os as _os
_SRC = _os.path.dirname(_os.path.abspath(__file__))
_ROOT = _os.path.dirname(_SRC)
import base64
import sales_section as S    # стили и скрипты раздела
import ko_master as KOM      # сам раздел — ko_master/stranica_kommercheskiy_otdel.html

OUT = _os.path.join(_ROOT, "sites", "kommercheskiy-otdel.html")
LOGO = base64.b64encode(open(_os.path.join(_SRC, "logo_white.png"), "rb").read()).decode()

PAGE_CSS = r"""
:root{
  /* Layout: red masthead; sticky section toolbar; scheme as a 6-column tree; functions as cards beside a sticky index */
  --bg:#f5f3f3; --surface:#ffffff; --ink:#1d1a1a; --muted:#6e6767; --line:#e8dcdc;
  --accent:#e3171d; --accent-ink:#b30d12; --head:#ececec; --band:#ff1f1f; --band-ink:#ffffff; --chip:#f6e9e9;
  --f-body:"Golos Text", "Segoe UI", Roboto, Arial, sans-serif;
}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){
  --bg:#141212; --surface:#1e1b1b; --ink:#f2eeee; --muted:#a49b9b; --line:#3a3131;
  --accent:#ff4d52; --accent-ink:#ff7a7e; --head:#2a2626; --band:#c8141a; --band-ink:#ffffff; --chip:#2d2323; color-scheme:dark } }
:root[data-theme="dark"]{
  --bg:#141212; --surface:#1e1b1b; --ink:#f2eeee; --muted:#a49b9b; --line:#3a3131;
  --accent:#ff4d52; --accent-ink:#ff7a7e; --head:#2a2626; --band:#c8141a; --band-ink:#ffffff; --chip:#2d2323; color-scheme:dark }
*{box-sizing:border-box}
body{background:var(--bg);color:var(--ink);font:15px/1.5 var(--f-body)}
body::before{content:"";position:fixed;inset:0 0 auto;height:env(safe-area-inset-top,0px);z-index:10;background:var(--band)}
.wrap{max-width:1320px;margin:0 auto;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
.mast{background:var(--band);color:var(--band-ink)}
.mast .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:12px 22px;padding-block:18px 16px}
.mast img{height:30px;width:auto}
.mast h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em;text-wrap:balance}
.mast .facts{margin:2px 0 0;font-size:13px;opacity:.92}
main.wrap{padding-block:16px 0}
section{padding-block:22px 6px}
h2{margin:0 0 6px;font-size:24px;letter-spacing:-.01em;text-wrap:balance}
.eyebrow{margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--accent-ink);font-weight:600}
.lead{margin:0 0 16px;color:var(--muted);max-width:72ch}
footer{padding-block:30px 40px;color:var(--muted);font-size:12.5px}
"""

nav = '<nav aria-label="Разделы"><a href="#changes">Что изменилось</a><a href="#scheme">Блок-схема</a><a href="#roles">Функционал</a><a href="#ko-contractors">Подрядчики</a></nav>'
page = f"""<title>Коммерческий отдел «Фабрикант»</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700&display=swap">
<style>{PAGE_CSS}{KOM.section_css(S.SECTION_CSS)}</style>
<header class="mast"><div class="wrap">
  <img src="data:image/png;base64,{LOGO}" alt="Фабрикант">
  <div><h1>Коммерческий отдел: структура и функционал</h1>
  <p class="facts">{KOM.PAGE_FACTS}</p></div>
</div></header>
{KOM.PAGE_MAIN}
<footer><div class="wrap">{KOM.PAGE_FOOTER}</div></footer>
<script>{S.TOGGLE_JS}{S.COPY_JS}</script>
"""
open(OUT, "w", encoding="utf-8").write(page)
print("saved", OUT, len(page))
