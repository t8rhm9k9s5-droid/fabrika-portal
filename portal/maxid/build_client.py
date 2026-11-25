# Вход по MAX ID: правка страницы входа (с хостинга) и «Управления» (с хостинга + исходник admin_frag.html)
import sys, os, re, json, pathlib, shutil
sys.path.insert(0, '/home/claude/fabrika/tools'); import live_get as g
H = pathlib.Path(__file__).parent; OUT = H / 'out'; (OUT / 'public').mkdir(parents=True, exist_ok=True)
def once(s, a, b):
    assert s.count(a) == 1, ('якорь не один:', a[:60], s.count(a)); return s.replace(a, b)
# --- страница входа
L = g.get('index.html').decode('utf-8'); assert g.get('login.html').decode('utf-8') == L and g.get('404.html').decode('utf-8') == L, 'три копии страницы входа различаются'
assert 'toMx' not in L, 'страница входа уже с MAX ID'
(OUT / 'login.before-mx.html').write_text(L, encoding='utf-8')
L = once(L, '<button class="link" type="button" id="toReg">Нет личного входа? Сотрудник4 доступ</button>',
         '<button class="link" type="button" id="toReg">Нет личного входа? Сотрудник4 доступ</button>\n    <button class="link" type="button" id="toMx">Войти через MAX — без пароля</button>')
L = once(L, '<section id="fq" hidden', '<section id="fm" hidden aria-live="polite"><h2>Вход через MAX</h2><p class="lead">Откройте MAX и отправьте боту «Фабрика» сообщение:</p><p class="mxcode" id="fmC"></p>'
         '<a class="go" id="fmB" href="https://max.ru/example1" target="_blank" rel="noopener">Открыть бота в MAX</a><button class="link" type="button" id="fmCp">Скопировать сообщение</button>'
         '<p class="lead" id="fmT"></p><button class="link" type="button" id="fmX">Отмена</button></section>\n  <section id="fq" hidden')
L = once(L, '#fq[hidden]{display:none}', '#fq[hidden]{display:none}\n#fm{display:grid;gap:12px;justify-items:center;text-align:center}\n#fm[hidden]{display:none}\n#fm h2{margin:4px 0 0;font:600 22px/1.25 -apple-system,BlinkMacSystemFont,"SF Pro Display",system-ui,sans-serif}\n'
         '#fm .go{width:100%;display:flex;align-items:center;justify-content:center;text-decoration:none;box-sizing:border-box}\n.mxcode{margin:2px 0;font:700 30px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;-webkit-user-select:all;user-select:all}')
i = L.rindex('</body>'); L = L[:i] + '<script>\n' + (H / 'login_mx.js').read_text(encoding='utf-8') + '</script>\n' + L[i:]
for n in ('index.html', 'login.html', '404.html'): (OUT / 'public' / n).write_text(L, encoding='utf-8')
# --- «Управление»
def admin(s):
    s = once(s, "    var L = $('lists'); L.innerHTML = '';\n", "    var L = $('lists'); L.innerHTML = '';\n    mxDraw(L);\n")
    s = once(s, "      draw();\n    });\n  }\n  function draw() {", "      draw(); mxLoad();\n    });\n  }\n  function draw() {")
    return once(s, "  function showPw(where, r) {", (H / 'admin_mx.js').read_text(encoding='utf-8') + "  function showPw(where, r) {")
a = g.read('admin.html').decode('utf-8'); assert 'mxDraw' not in a
P = pathlib.Path(sys.argv[1]); P.mkdir(parents=True, exist_ok=True); (P / 'admin.html').write_text(admin(a), encoding='utf-8')
F = pathlib.Path('/home/claude/fabrika/src/Исходники/build/admin_frag.html'); f = F.read_text(encoding='utf-8')
if 'mxDraw' not in f: shutil.copy2(F, str(F).replace('.html', '.before-mx2511.html')); F.write_text(admin(f), encoding='utf-8')
shutil.copy2(OUT / 'public' / 'login.html', '/home/claude/app_build/enc/login.live-mx2511.html')
print('страница входа', len(L), '· admin.html', len(admin(a)))
