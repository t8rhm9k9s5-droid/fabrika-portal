# 27.11.2026 Т. В.: кнопка «Пустить» в Telegram не срабатывает (встроенный браузер Telegram без входа) — убрать кнопку, подтверждать с плашки на главной портала
import sys, os, subprocess, tempfile
sys.path.insert(0, '/home/claude/fabrika/work/selfdeploy'); import dep
H = os.path.dirname(os.path.abspath(__file__))
def files(g): fs = g['files']; return fs if isinstance(fs, list) else [dict(name=k, **v) for k, v in fs.items()]
g = dep.call({'op': 'get', 's': 'max'}); src = next(f for f in files(g) if f['name'] == 'MaxCorePrivate')['source']
open(os.path.join(H, 'MaxCorePrivate.before-nobtn2711.gs'), 'w', encoding='utf-8').write(src)
A = "просит вход на портал (MAX ID ' + esc(uid) + '). Бот проверил — это наш сотрудник. Сотрудник4 живёт 2 часа.',\n        reply_markup: { inline_keyboard: [[{ text: 'Пустить', url: 'https://techfabrikant.ru/#mxok=' + code }]] } }"
assert src.count(A) == 1, src.count(A)
B = "просит вход на портал (MAX ID ' + esc(uid) + '). Бот проверил — это наш сотрудник.\\n\\nПодтвердить: откройте портал с иконки → оранжевая плашка «Ждут входа» сверху → «Пустить». Сотрудник4 живёт 2 часа.' }"
src = src.replace(A, B)
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f: f.write(src)
r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); assert r.returncode == 0, r.stderr[-300:]
if '--go' not in sys.argv: print('проверено'); sys.exit()
p = dep.call({'op': 'patch', 's': 'max', 'base': g['sha'], 'put': {'MaxCorePrivate': {'type': 'SERVER_JS', 'source': src}}, 'desc': '27.11: запрос входа в Telegram без кнопки — подтверждение с плашки портала'})
print('patch', {k: v for k, v in p.items() if k != 'files'}); assert p.get('ok'), p
print('promote', dep.call({'op': 'promote', 's': 'max', 'v': p['version'], 'dep': 'REDACTED_DEPLOYMENT_1', 'desc': '27.11: вход по MAX ID — подтверждение с плашки'}))
