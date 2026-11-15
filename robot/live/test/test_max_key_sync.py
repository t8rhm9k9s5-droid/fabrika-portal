"""Тест max_key_sync.py: ключ из k_cmd, резервная копия старого, токен не тронут, второй раз — ничего."""
import json, os, sys, tempfile, hmac, hashlib


def _rd(*a, **k):   # CodeQL py/file-not-closed: файл закрывается сразу (15.11.2026)
    with open(*a, **k) as _f:
        return _f.read()


def _wr(_d, *a, **k):
    with open(*a, **k) as _f:
        return _f.write(_d)


sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import max_key_sync as MK
ok = 0
def check(c, m):
    global ok; assert c, m; ok += 1; print('  ✓', m)
d = tempfile.mkdtemp(); L = os.path.join(d, '.fabrika_live'); M = os.path.join(d, '.fabrika_max'); C = os.path.join(d, 'code')
for x in (L, M, C): os.makedirs(x)
kc = '11' * 32
_wr(kc + '\n', os.path.join(C, 'k_cmd.txt'), 'w')
_wr(json.dumps({'id': 'x1'}), os.path.join(C, 'max_key_sync.json'), 'w')
_wr(json.dumps({'token': 'T', 'key': 'old', 'secret': 'S', 'owner': {'user_id': 5}}), os.path.join(M, 'config.json'), 'w')
store = {}
r = MK.run(L, lambda *a: None, lambda n, dflt: store.get(n, dflt), lambda n, v: store.__setitem__(n, v), code_dir=C, max_dir=M)
cfg = json.loads(_rd(os.path.join(M, 'config.json')))
want = hmac.new(bytes.fromhex(kc), b'fabrika-max-v1', hashlib.sha256).hexdigest()
check(r['changed'] and cfg['key'] == want, 'ключ = HMAC(k_cmd, fabrika-max-v1)')
check(cfg['token'] == 'T' and cfg['secret'] == 'S' and cfg['owner'] == {'user_id': 5}, 'токен, secret и владелец не тронуты')
baks = [f for f in os.listdir(M) if f.startswith('config.json.bak-')]
check(len(baks) == 1 and json.loads(_rd(os.path.join(M, baks[0])))['key'] == 'old', 'старый ключ — в резервной копии')
check(oct(os.stat(os.path.join(M, 'config.json')).st_mode & 0o777) == '0o600', 'config.json — 0600')
r2 = MK.run(L, lambda *a: None, lambda n, dflt: store.get(n, dflt), lambda n, v: store.__setitem__(n, v), code_dir=C, max_dir=M)
check(r2.get('state') == 'ok' and 'changed' not in r2, 'повторно та же команда — ничего не делает')
# 30.10.2026 (аудит, договорённость с PHP-частью): тот же замок config.json.lock, что у PHP; битый config.json — не перезаписывается; .bak
import fcntl
check(os.path.exists(os.path.join(M, 'config.json.bak')) and json.loads(_rd(os.path.join(M, 'config.json.bak')))['key'] == 'old', 'прежний хороший config.json — в config.json.bak (как у PHP)')
_wr(json.dumps({'id': 'x2'}), os.path.join(C, 'max_key_sync.json'), 'w')
cfg = json.loads(_rd(os.path.join(M, 'config.json'))); cfg['key'] = 'другой'; _wr(json.dumps(cfg), os.path.join(M, 'config.json'), 'w')
lk = open(os.path.join(M, 'config.json.lock'), 'a+'); fcntl.flock(lk, fcntl.LOCK_EX)
_lk = MK._lock; MK._lock = lambda cp, wait=10: _lk(cp, 0.5)          # ждать замок в тесте полсекунды, а не 10 с
r3 = MK.run(L, lambda *a: None, lambda n, dflt: store.get(n, dflt), lambda n, v: store.__setitem__(n, v), code_dir=C, max_dir=M)
MK._lock = _lk
check('занят' in r3['state'] and json.loads(_rd(os.path.join(M, 'config.json')))['key'] == 'другой', 'PHP держит config.json.lock — ключ не пишется (в следующий прогон)')
lk.close()
_wr('{"token": "T", битый', os.path.join(M, 'config.json'), 'w')
r4 = MK.run(L, lambda *a: None, lambda n, dflt: store.get(n, dflt), lambda n, v: store.__setitem__(n, v), code_dir=C, max_dir=M)
check(r4['state'].startswith('нет ~/.fabrika_max/config.json') and _rd(os.path.join(M, 'config.json')) == '{"token": "T", битый', 'config.json не читается — НЕ перезаписывается вслепую')
print('ALL OK', ok)
