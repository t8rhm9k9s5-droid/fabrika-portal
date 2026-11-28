# 27.11.2026 Т. В.: запрос входа по MAX ID — сразу в Telegram (минуя пачки 10:30/15:00/19:00) с кнопкой «Пустить», открывающей запрос в «Управлении»
import sys, os, json, subprocess, tempfile
sys.path.insert(0, '/home/claude/fabrika/work/selfdeploy'); import dep
H = os.path.dirname(os.path.abspath(__file__))
def files(g): fs = g['files']; return fs if isinstance(fs, list) else [dict(name=k, **v) for k, v in fs.items()]
g = dep.call({'op': 'get', 's': 'max'}); src = next(f for f in files(g) if f['name'] == 'MaxCorePrivate')['source']
assert 'bare2711' in src and 'notify2711' not in src
open(os.path.join(H, 'MaxCorePrivate.before-notify2711.gs'), 'w', encoding='utf-8').write(src)
A = "    try { mx_tgOwner('Вход на портал по MAX ID: <b>' + esc(name || 'без имени') + '</b> (MAX ID ' + esc(uid) + '). Бот проверил — это наш сотрудник. Подтвердить: портал → «Управление» → «Вход по MAX ID». Сотрудник4 живёт 30 минут.', null, { id: 'mxlogin:' + code }); }"
assert src.count(A) == 1, src.count(A)
B = ("    // notify2711: 27.11.2026 Т. В. «всё должно приходить ко мне в бот в ТГ» — сразу (_now, мимо пачек) и с кнопкой «Пустить»: открывает запрос в «Управлении»\n"
     "    try { var tr = mx_tgCall({ op: 'tgcall', method: 'sendMessage', params: { chat_id: 'owner', _now: true, parse_mode: 'HTML', disable_web_page_preview: true,\n"
     "        text: '🔑 <b>' + esc(name || 'без имени') + '</b> просит вход на портал (MAX ID ' + esc(uid) + '). Бот проверил — это наш сотрудник. Сотрудник4 живёт 2 часа.',\n"
     "        reply_markup: { inline_keyboard: [[{ text: 'Пустить', url: 'https://techfabrikant.ru/admin.html#mx=' + code }]] } }, meta: { mid: 'mxlogin:' + code } });\n"
     "      if (!(tr && tr.ok)) mx_tgOwner('Вход на портал по MAX ID: <b>' + esc(name || 'без имени') + '</b> (MAX ID ' + esc(uid) + '). Подтвердить: портал → «Управление» → «Вход по MAX ID».', null, { id: 'mxlogin:' + code }); }")
src = src.replace(A, B)
with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f: f.write(src)
r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); assert r.returncode == 0, r.stderr[-300:]
if '--go' not in sys.argv: print('проверено'); sys.exit()
p = dep.call({'op': 'patch', 's': 'max', 'base': g['sha'], 'put': {'MaxCorePrivate': {'type': 'SERVER_JS', 'source': src}}, 'desc': '27.11: запрос входа — сразу в Telegram с кнопкой «Пустить»'})
print('patch', {k: v for k, v in p.items() if k != 'files'}); assert p.get('ok'), p
print('promote', dep.call({'op': 'promote', 's': 'max', 'v': p['version'], 'dep': 'REDACTED_DEPLOYMENT_1', 'desc': '27.11: вход по MAX ID — сразу в Telegram'}))
