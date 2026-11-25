# Посещения и ошибки устройств — серверная часть в проект tg («Фабрика — уведомления»): Visits.gs + маршрут; проверка и автовозврат. python3 deploy_vs.py
import sys, os, json, re, time, subprocess, tempfile, ssl, urllib.request
sys.path.insert(0, '/home/claude/fabrika/work/selfdeploy'); import dep
H = os.path.dirname(os.path.abspath(__file__)); C = json.load(open('/home/claude/fabrika/work/maxid/tg_dep.json')); did = C['tg_dep']
def post(url, body):
    ctx = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
    with urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'text/plain;charset=utf-8'}), context=ctx, timeout=90) as r: return json.loads(r.read().decode())
def syntax(src):
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f: f.write(src)
    r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); os.unlink(f.name); assert r.returncode == 0, r.stderr[-300:]
g = dep.call({'op': 'get', 's': 'tg'}); fs = g['files']; fs = fs if isinstance(fs, list) else [dict(name=k, **v) for k, v in fs.items()]
kod = next(f for f in fs if f['name'] == 'Код')['source']; assert 'vsPost_' not in kod and 'mxPost_' in kod
a = "  if (/^mx(req|get|list|give|deny)$/.test(String(op))) return mxPost_(op, q);"; assert kod.count(a) == 1
kod = kod.replace(a, a + "\n  if (/^vs(hit|err|sum)$/.test(String(op))) return vsPost_(op, q);   // 26.11.2026: посещения и ошибки устройств (Visits.gs)")
vs = open(os.path.join(H, 'Visits.gs'), encoding='utf-8').read(); syntax(kod); syntax(vs)
prev = max(d.get('deploymentConfig', {}).get('versionNumber') or 0 for d in dep.call({'op': 'versions', 's': 'tg'})['deployments'] if d.get('deploymentId') == did)
p = dep.call({'op': 'patch', 's': 'tg', 'base': g['sha'], 'put': {'Код': {'type': 'SERVER_JS', 'source': kod}, 'Visits': {'type': 'SERVER_JS', 'source': vs}}, 'desc': '26.11: посещения портала и ошибки устройств (Visits)'}); assert p.get('ok'), p
print('версия', p['version'], '· прежняя', prev, '· promote', dep.call({'op': 'promote', 's': 'tg', 'v': p['version'], 'dep': did, 'desc': '26.11: посещения портала и ошибки устройств'}).get('version'))
url = re.search(r'"url":\s*"([^"]+)"', open('/home/claude/fabrika/work/maxid/out/public/login.html', encoding='utf-8').read()).group(1); ok = False; r = {}
for i in range(12):
    time.sleep(6)
    try:
        r = post(url, {'op': 'vssum', 'tok': '0' * 48})
        if r.get('ok') is False and r.get('error') != 'нет подписки': print('новая версия отвечает через', (i + 1) * 6, 'с'); break
    except Exception as e: r = {'error': repr(e)[:100]}
try:
    assert r.get('ok') is False and r.get('error') != 'нет подписки', r
    a1 = post(url, {'op': 'vshit', 'page': ''}); assert a1.get('ok') is True, a1
    a2 = post(url, {'op': 'salt', 'id': '0' * 24}); assert a2.get('ok') and a2.get('salt'), a2
    a3 = post(url, {'op': 'mxget', 'code': '000000', 'rid': '0' * 48}); assert a3.get('st') == 'none', a3
    print('проверка: vssum без прав — «%s»; vshit принят; salt и mxget работают' % r.get('error')); ok = True
except Exception as e: print('ПРОВЕРКА НЕ ПРОШЛА:', repr(e)[:300])
if not ok: print('возврат на', prev, dep.call({'op': 'promote', 's': 'tg', 'v': prev, 'dep': did, 'desc': 'автовозврат'}).get('version')); sys.exit(1)
json.dump({'tg_dep': did, 'prev': prev}, open('/home/claude/fabrika/work/maxid/tg_dep.json', 'w'))
