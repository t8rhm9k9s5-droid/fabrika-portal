# Посещения и ошибки устройств: assets/acct.js (+ счётчик) и admin.html (+ сводка) поверх действующих. python3 build_vs.py <каталог заплатки plain>
import sys, pathlib, shutil
sys.path.insert(0, '/home/claude/fabrika/tools'); import live_get as g
H = pathlib.Path(__file__).parent; P = pathlib.Path(sys.argv[1]); (P / 'assets').mkdir(parents=True, exist_ok=True)
def once(s, a, b):
    assert s.count(a) == 1, ('якорь не один', a[:60], s.count(a)); return s.replace(a, b)
st = (H / 'acct_stat.js').read_text(encoding='utf-8'); a = g.read('assets/acct.js').decode('utf-8'); assert "'vshit'" not in a
(P / 'assets' / 'acct.js').write_text(a.rstrip('\n') + '\n' + st, encoding='utf-8')
def admin(s):
    s = once(s, "a4.addEventListener('click', evForm); acts.appendChild(a4);", "a4.addEventListener('click', evForm); acts.appendChild(a4);\n    var a5 = row('button', IC.doc, '#34a0a4', 'Посещения и ошибки', '', 'кто открывает портал и что ломается на устройствах'); a5.addEventListener('click', visForm); acts.appendChild(a5);   // 26.11.2026")
    return once(s, "  function showPw(where, r) {", (H / 'admin_vs.js').read_text(encoding='utf-8') + "  function showPw(where, r) {")
h = g.read('admin.html').decode('utf-8'); assert 'visForm' not in h; (P / 'admin.html').write_text(admin(h), encoding='utf-8')
F = pathlib.Path('/home/claude/fabrika/src/Исходники/build/admin_frag.html'); f = F.read_text(encoding='utf-8')
if 'visForm' not in f: F.write_text(admin(f), encoding='utf-8')
shutil.copy2(H / 'acct_stat.js', '/home/claude/fabrika/src/Исходники/build/acct/acct_stat.js')   # сборка: acct.js = acct_core.js + acct_ui.js + acct_stat.js
print('acct.js', len(a), '→', len(a) + len(st) + 1, '· admin.html', len(h), '→', len(admin(h)))
