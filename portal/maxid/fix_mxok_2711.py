# 27.11.2026 Т. В.: запрос входа по MAX ID — сразу в Telegram (минуя пачки 10:30/15:00/19:00) с кнопкой «Пустить», открывающей запрос в «Управлении»
import sys, os, json, subprocess, tempfile
sys.path.insert(0, '/home/claude/fabrika/work/selfdeploy'); import dep
H = os.path.dirname(os.path.abspath(__file__))
def files(g): fs = g['files']; return fs if isinstance(fs, list) else [dict(name=k, **v) for k, v in fs.items()]
g = dep.call({'op': 'get', 's': 'max'}); src = next(f for f in files(g) if f['name'] == 'MaxCorePrivate')['source']
assert 'notify2711' in src and 'mxok=' not in src
open(os.path.join(H, 'MaxCorePrivate.before-mxok2711.gs'), 'w', encoding='utf-8').write(src)
A = "'https://techfabrikant.ru/admin.html#mx=' + code"
assert src.count(A) == 1, src.count(A)
B = "'https://techfabrikant.ru/#mxok=' + code"
src = src.replace(A, B)
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f: f.write(src)
r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); assert r.returncode == 0, r.stderr[-300:]
if '--go' not in sys.argv: print('проверено'); sys.exit()
p = dep.call({'op': 'patch', 's': 'max', 'base': g['sha'], 'put': {'MaxCorePrivate': {'type': 'SERVER_JS', 'source': src}}, 'desc': '27.11: «Пустить» ведёт на #mxok (через корень портала)'})
print('patch', {k: v for k, v in p.items() if k != 'files'}); assert p.get('ok'), p
print('promote', dep.call({'op': 'promote', 's': 'max', 'v': p['version'], 'dep': 'REDACTED_DEPLOYMENT_1', 'desc': '27.11: вход по MAX ID — сразу в Telegram'}))
