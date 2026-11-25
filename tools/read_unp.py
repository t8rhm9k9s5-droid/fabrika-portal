# Итог работы itm_unportal на хостинге: st/exp_unp.bin (ключ владельца) → печать плана/результата. 25.11.2026
import base64, hashlib, hmac, json, ssl, sys, time, urllib.request
CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
K = bytes.fromhex(open('/home/claude/app_build/host/live/k_owner.txt').read().strip())
def unseal(text, key):
    b = base64.b64decode(text[6:]); nonce, tag, ct = b[:16], b[16:48], b[48:]
    if not hmac.compare_digest(tag, hmac.new(key, nonce + ct, hashlib.sha256).digest()): return None
    ks = b''.join(hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))[:len(ct)]
    return (int.from_bytes(ct, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(len(ct), 'big').decode('utf-8')
def get():
    try:
        with urllib.request.urlopen(urllib.request.Request('https://techfabrikant.ru/st/exp_unp.bin?t=%d' % time.time(), headers={'Cache-Control': 'no-cache'}), context=CTX, timeout=60) as r: t = r.read().decode().strip()
    except Exception as e: return None
    raw = unseal(t, K); return json.loads(raw) if raw else {'state': 'не открыт ключом владельца'}
if __name__ == '__main__':
    want = sys.argv[1] if len(sys.argv) > 1 else ''
    for i in range(int(sys.argv[2]) if len(sys.argv) > 2 else 1):
        j = get()
        if j and (not want or j.get('id') == want): break
        time.sleep(30)
    else: sys.exit('нет итога %s' % want)
    json.dump(j, open('/home/claude/fabrika/work/mail_2511e/unp_%s.json' % (j.get('id') or 'x'), 'w'), ensure_ascii=False, indent=1)
    print(j.get('id'), j.get('mode'), j.get('t'), '|', j.get('state'), '| MOVE:', j.get('move_cap'), '| ошибки:', j.get('err'))
    print('папки:', '; '.join('%s %s' % (n, c) for n, c in (j.get('folders') or [])))
    for src, n, dst in (j.get('plan') or []): print('  %s: %s → %s' % (src, n, dst))
    if j.get('mode') == 'go': print('перенесено', j.get('moved'), '| убраны:', j.get('removed'), '| не всё:', j.get('late'))
