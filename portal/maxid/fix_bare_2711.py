# 27.11.2026 Т. В. «Выкладывай»: бот MAX принимает код входа и без слова «портал» (Сотрудник16 прислала «256471» — бот молчал)
import sys, os, json, subprocess, tempfile
sys.path.insert(0, '/home/claude/fabrika/work/selfdeploy'); import dep
H = os.path.dirname(os.path.abspath(__file__))
def files(g): fs = g['files']; return fs if isinstance(fs, list) else [dict(name=k, **v) for k, v in fs.items()]
g = dep.call({'op': 'get', 's': 'max'}); src = next(f for f in files(g) if f['name'] == 'MaxCorePrivate')['source']
assert 'bare2711' not in src, 'уже выложено'
open(os.path.join(H, 'MaxCorePrivate.before-bare2711.gs'), 'w', encoding='utf-8').write(src)
A = "  var pc = type === 'message_created' && text.match(/^\\s*портал\\s*:?\\s*(\\d{6})\\s*$/i);\n  if (pc) { mx_portalClaim(uid, user, pc[1]); return; }\n"
B = ("  var pc = type === 'message_created' && text.match(/^\\s*портал\\s*:?\\s*(\\d{3})\\s?(\\d{3})\\s*$/i);\n  if (pc) { mx_portalClaim(uid, user, pc[1] + pc[2]); return; }\n"
     "  // bare2711: 27.11.2026 — люди присылают просто 6 цифр (Сотрудник16 «256471»): тоже код входа на портал\n"
     "  var pb = type === 'message_created' && text.match(/^\\s*(\\d{3})[\\s-]?(\\d{3})\\s*$/);\n  if (pb) { mx_portalClaim(uid, user, pb[1] + pb[2], true); return; }\n")
assert src.count(A) == 1, src.count(A); src = src.replace(A, B)
C = "function mx_portalClaim(uid, user, code) {"
assert src.count(C) == 1; src = src.replace(C, "function mx_portalClaim(uid, user, code, bare) {")
D = "    : st === 'nocode' ? 'Код не найден или устарел. Нажмите «Войти через MAX» на странице входа ещё раз и пришлите новый код.'"
assert src.count(D) == 1, src.count(D)
src = src.replace(D, "    : st === 'nocode' ? 'Код не найден или устарел. Нажмите «Войти через MAX» на странице входа ещё раз и пришлите новый код.' + (bare ? ' Если это код калькулятора — напишите «калькулятор КОД».' : '')")
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f: f.write(src)
r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); assert r.returncode == 0, r.stderr[-300:]
open(os.path.join(H, 'MaxCorePrivate.bare2711.gs'), 'w', encoding='utf-8').write(src)
if '--go' not in sys.argv: print('проверено, не выложено'); sys.exit()
prev = [d.get('deploymentConfig', {}).get('versionNumber') for d in dep.call({'op': 'versions', 's': 'max'})['deployments'] if d['deploymentId'].startswith('AKfycbzi4A9S')]
print('действует', prev)
p = dep.call({'op': 'patch', 's': 'max', 'base': g['sha'], 'put': {'MaxCorePrivate': {'type': 'SERVER_JS', 'source': src}}, 'desc': '27.11: код входа на портал без слова «портал»'})
print('patch', {k: v for k, v in p.items() if k != 'files'}); assert p.get('ok'), p
D = [d for d in dep.call({'op': 'versions', 's': 'max'})['deployments'] if d['deploymentId'].startswith('AKfycbzi4A9S')][0]['deploymentId']
print('promote', dep.call({'op': 'promote', 's': 'max', 'v': p['version'], 'dep': D, 'desc': '27.11: код входа без «портал»'}))
