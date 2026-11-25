#!/usr/bin/env python3
"""Вход по MAX ID — выкладка серверной части: python3 deploy_mx.py tg | max
tg  — «Фабрика — уведомления» (личные входы): MxLogin.gs + два маршрута в «Код»; проверка после переключения, при сбое — возврат прежней версии.
max — бот MAX: «портал КОД» в MaxCorePrivate.gs."""
import sys, os, json, re, subprocess, time, tempfile, urllib.request, ssl
sys.path.insert(0, '/home/claude/fabrika/work/selfdeploy'); import dep
H = os.path.dirname(os.path.abspath(__file__)); what = sys.argv[1]
def files(g): fs = g['files']; return fs if isinstance(fs, list) else [dict(name=k, **v) for k, v in fs.items()]
def once(s, a, b):
    assert s.count(a) == 1, ('якорь не один', a[:70], s.count(a)); return s.replace(a, b)
def syntax(src, name):
    with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f: f.write(src)
    r = subprocess.run(['node', '--check', f.name], capture_output=True, text=True); os.unlink(f.name)
    assert r.returncode == 0, (name, r.stderr[-400:])
def cur(s): return [d.get('deploymentConfig', {}).get('versionNumber') for d in dep.call({'op': 'versions', 's': s}).get('deployments', []) if d.get('deploymentConfig', {}).get('versionNumber')]
def post(url, body):
    ctx = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
    with urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'text/plain;charset=utf-8'}), context=ctx, timeout=90) as r: return json.loads(r.read().decode())
if what == 'tg':
    g = dep.call({'op': 'get', 's': 'tg'}); kod = next(f for f in files(g) if f['name'] == 'Код')['source']
    assert 'mxPost_' not in kod, 'уже выложено'
    open(os.path.join(H, 'tg_Kod.before-mx.gs'), 'w', encoding='utf-8').write(kod)
    kod = once(kod, "    var ar = acctPost_(q); if (ar) return json_(ar);", "    if (q.op === 'mxbot') return json_(mxBot_(q));                                           // 25.11.2026: вход по MAX ID — бот MAX подтвердил сотрудника (MxLogin.gs)\n    var ar = acctPost_(q); if (ar) return json_(ar);")
    kod = once(kod, "function acctPost_(q) {\n  var op = q.op;\n", "function acctPost_(q) {\n  var op = q.op;\n  if (/^mx(req|get|list|give|deny)$/.test(String(op))) return mxPost_(op, q);   // 25.11.2026: вход по MAX ID (MxLogin.gs)\n")
    mx = open(os.path.join(H, 'MxLogin.gs'), encoding='utf-8').read(); syntax(kod, 'Код'); syntax(mx, 'MxLogin')
    prev = cur('tg'); print('действует версия', max(prev))
    p = dep.call({'op': 'patch', 's': 'tg', 'base': g['sha'], 'put': {'Код': {'type': 'SERVER_JS', 'source': kod}, 'MxLogin': {'type': 'SERVER_JS', 'source': mx}}, 'desc': '25.11: вход на портал по MAX ID (MxLogin)'})
    print('patch', {k: v for k, v in p.items() if k != 'files'}); assert p.get('ok'), p
    print('promote', dep.call({'op': 'promote', 's': 'tg', 'v': p['version'], 'desc': '25.11: вход на портал по MAX ID'})); time.sleep(8)
    url = re.search(r'"url":\s*"([^"]+)"', open('REDACTED_B64_32.html', encoding='utf-8').read()).group(1)
    import hashlib, secrets, base64
    okk = False
    try:
        a = post(url, {'op': 'salt', 'id': '0' * 24}); assert a.get('ok') and a.get('salt'), a
        rid = secrets.token_hex(24); r = post(url, {'op': 'mxreq', 'ridh': hashlib.sha256(rid.encode()).hexdigest(), 'pub': base64.b64encode(b'\x04' + secrets.token_bytes(64)).decode()}); assert r.get('ok') and re.fullmatch(r'\d{6}', r['code']), r
        s1 = post(url, {'op': 'mxget', 'code': r['code'], 'rid': rid}); assert s1.get('st') == 'new', s1
        s2 = post(url, {'op': 'mxget', 'code': r['code'], 'rid': secrets.token_hex(24)}); assert s2.get('st') == 'none', s2
        s3 = post(url, {'op': 'mxlist', 'tok': '0' * 48}); assert s3.get('ok') is False, s3
        s4 = post(url, {'op': 'mxbot', 'code': r['code'], 'uid': '1', 'name': 'x'}); assert s4.get('ok') is False, s4
        print('проверка после выкладки: salt, mxreq, mxget, отказ без прав — успешно; пробный код', r['code'], 'сам истечёт через 30 минут'); okk = True
    except Exception as e: print('ПРОВЕРКА НЕ ПРОШЛА:', repr(e)[:300])
    if not okk: print('возврат на версию', max(prev), dep.call({'op': 'promote', 's': 'tg', 'v': max(prev), 'desc': 'автовозврат: проверка MAX ID не прошла'})); sys.exit(1)
if what == 'max':
    g = dep.call({'op': 'get', 's': 'max'}); src = next(f for f in files(g) if f['name'] == 'MaxCorePrivate')['source']
    assert 'mx_portalClaim' not in src, 'уже выложено'
    open(os.path.join(H, 'MaxCorePrivate.before-mx.gs'), 'w', encoding='utf-8').write(src)
    src = once(src, "  if (cm) { mx_calcClaim(uid, user, cm[1]); return; }\n", "  if (cm) { mx_calcClaim(uid, user, cm[1]); return; }\n"
               "  // 25.11.2026, Т. В. («Подтверждаю я с телефона»): «портал КОД» — вход на портал по MAX ID. Свой сотрудник (mx_dmAllowed) → подписанно в скрипт личных входов (op mxbot);\n"
               "  //   администратор подтверждает в «Управлении». Чужой — отказ, администратору ничего не приходит.\n"
               "  var pc = type === 'message_created' && text.match(/^\\s*портал\\s*:?\\s*(\\d{6})\\s*$/i);\n  if (pc) { mx_portalClaim(uid, user, pc[1]); return; }\n")
    src += open(os.path.join(H, 'max_portal.gs'), encoding='utf-8').read(); syntax(src, 'MaxCorePrivate')
    prev = cur('max'); print('действует версия', max(prev))
    p = dep.call({'op': 'patch', 's': 'max', 'base': g['sha'], 'put': {'MaxCorePrivate': {'type': 'SERVER_JS', 'source': src}}, 'desc': '25.11: «портал КОД» — вход на портал по MAX ID'})
    print('patch', {k: v for k, v in p.items() if k != 'files'}); assert p.get('ok'), p
    D = [d for d in dep.call({'op': 'versions', 's': 'max'})['deployments'] if d.get('deploymentConfig', {}).get('versionNumber') == max(prev)]; assert len(D) == 1
    json.dump({'max_dep': D[0]['deploymentId'], 'prev': max(prev)}, open(os.path.join(H, 'max_dep.json'), 'w'))
    print('promote', dep.call({'op': 'promote', 's': 'max', 'v': p['version'], 'dep': D[0]['deploymentId'], 'desc': '25.11: «портал КОД» — вход на портал по MAX ID'}).get('version'))
    print('прежняя версия для отката:', max(prev))
