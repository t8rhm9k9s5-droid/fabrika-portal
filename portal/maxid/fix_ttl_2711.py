# 27.11.2026 Т. В.: запрос входа по MAX ID живёт 2 часа (было 30 минут)
import sys, os, json, subprocess, tempfile
sys.path.insert(0, '/home/claude/fabrika/work/selfdeploy'); import dep
H = os.path.dirname(os.path.abspath(__file__))
def files(g): fs = g['files']; return fs if isinstance(fs, list) else [dict(name=k, **v) for k, v in fs.items()]
g = dep.call({'op': 'get', 's': 'tg'}); src = next(f for f in files(g) if f['name'] == 'MxLogin')['source']
A = "var MX_TTL = 30 * 60 * 1000, MX_MAX = 20;"; assert src.count(A) == 1
open(os.path.join(H, 'MxLogin.before-ttl2711.gs'), 'w', encoding='utf-8').write(src)
src = src.replace(A, "var MX_TTL = 120 * 60 * 1000, MX_MAX = 40;   // 27.11.2026 Т. В.: запрос живёт 2 часа (было 30 минут, 20 запросов)")
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f: f.write(src)
r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); assert r.returncode == 0, r.stderr[-300:]
if '--go' not in sys.argv: print('проверено'); sys.exit()
p = dep.call({'op': 'patch', 's': 'tg', 'base': g['sha'], 'put': {'MxLogin': {'type': 'SERVER_JS', 'source': src}}, 'desc': '27.11: запрос входа по MAX ID — 2 часа'})
print('patch', {k: v for k, v in p.items() if k != 'files'}); assert p.get('ok'), p
print('promote', dep.call({'op': 'promote', 's': 'tg', 'v': p['version'], 'desc': '27.11: запрос входа по MAX ID — 2 часа'}))
