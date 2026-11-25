# Чтение файлов действующей версии портала (расшифровка ключом сайта): карта и файлы. python3 live_get.py ls <подстрока> | get <путь> <куда>
import hashlib, hmac, json, re, ssl, sys, time, urllib.request
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
A = '/home/claude/app_build'; sys.path.insert(0, A); import access as ACC
S = json.load(open(A + '/enc_secret.json')); CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt'); BASE = 'https://techfabrikant.ru/'
def get(p):
    with urllib.request.urlopen(urllib.request.Request(BASE + p + ('?t=%d' % time.time() if not p.startswith('b/') else '')), context=CTX, timeout=180) as r: return r.read()
MK = bytes.fromhex(S['master_hex']) if S.get('master_hex') else hashlib.pbkdf2_hmac('sha256', S['password'].encode(), bytes.fromhex(S['salt']), S['iter'], 32)
AES = AESGCM(MK); _M = None
def fmap():
    global _M
    if _M is None:
        mb = get('m.bin'); m = json.loads(AES.decrypt(mb[:12], mb[12:], None)); _M = dict(m['files'])
        for nm in sorted(set((m.get('parts') or {}).values())):
            pb = get(nm); _M.update(json.loads(AES.decrypt(pb[:12], pb[12:], None))['files'])
        _M['__v'] = m['v']
    return _M
def read(rel):
    f = fmap()[rel]; b = get('b/' + f[0]); k = AESGCM(ACC.set_key(S, f[3])) if len(f) > 3 else AES
    return k.decrypt(b[:12], b[12:], None)
if __name__ == '__main__':
    if sys.argv[1] == 'ls':
        for k, v in sorted(fmap().items()):
            if k != '__v' and sys.argv[2] in k: print(k, v[1:], sep='\t')
    elif sys.argv[1] == 'get': open(sys.argv[3], 'wb').write(read(sys.argv[2])); print('ok')
