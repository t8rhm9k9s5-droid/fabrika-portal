#!/usr/bin/env python3
"""21.11.2026, Т. В.: «а где вся инфографика с FTP?» — вся инфографика FTP (/infographic/…, 1600+ картинок, 270+ папок) → карточки нового «Сайта».
Папка → товар: info_map.json (путь папки FTP → id товара сайта, как в _api/_fidx.json). Файлы — с портала (робот выложил FTP зашифрованным:
st/f/<id>.bin, опись — ftp idx.json), в work/fsu/ftp_extra/<путь FTP>; уже скачанные не повторяются.
Итог: work/fsu/assort/info_all.json {код товара: [локальные пути, по порядку папки и имени]} — build_new.py ставит их в карточку блоком «Инфографика».
  python3 fsu_info_all.py <ftp idx.json> [info_map.json]"""
import sys, os, json, hmac, hashlib, base64, re, pathlib, subprocess, collections, concurrent.futures as CF
H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(H, 'ftp_extra')
bk = pathlib.Path('/home/claude/bot/bot_key.txt').read_text().strip()
bk = bytes.fromhex(bk) if re.fullmatch(r'[0-9a-fA-F]{64}', bk) else bk.encode()
K = hmac.new(bk, b'fabrika-live-v1', hashlib.sha256).digest()


def unseal(s):
    b = base64.b64decode(s.strip()[6:]); n, t, ct = b[:16], b[16:48], b[48:]
    if not hmac.compare_digest(t, hmac.new(K, n + ct, hashlib.sha256).digest()): raise ValueError('подпись')
    ks = b''.join(hmac.new(K, n + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))[:len(ct)]
    return (int.from_bytes(ct, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(len(ct), 'big') if ct else b''


IDX = json.load(open(sys.argv[1], encoding='utf-8'))
MAP = json.load(open(sys.argv[2] if len(sys.argv) > 2 else os.path.join(H, 'info_map.json'), encoding='utf-8'))
X = json.load(open('/home/claude/build/fsu/_api/_fidx.json', encoding='utf-8'))['items']
CODE = {int(v['id']): v['code'] for v in X.values()}
want = [x for x in IDX['items'] if not x.get('d') and x.get('id') and x['p'].startswith('/infographic/')
        and x['p'].lower().endswith(('.jpg', '.jpeg', '.png', '.webp')) and '/'.join(x['p'].split('/')[:-1]) in MAP]


def one(x):
    dst = os.path.join(OUT, x['p'].lstrip('/'))
    if os.path.exists(dst) and os.path.getsize(dst): return 'есть'
    for i in range(4):
        r = subprocess.run(['curl', '-s', '-f', '-m', '120', 'https://techfabrikant.ru/st/f/%s.bin' % x['id']], capture_output=True)
        if r.returncode == 0:
            try: b = unseal(r.stdout.decode())
            except Exception: return 'ошибка'
            os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst + '.tmp', 'wb').write(b); os.replace(dst + '.tmp', dst); return 'скачан'
    return 'нет'


with CF.ThreadPoolExecutor(6) as ex: res = collections.Counter(ex.map(one, want))
out = collections.defaultdict(list)
for x in sorted(want, key=lambda x: x['p']):
    c = CODE.get(int(MAP['/'.join(x['p'].split('/')[:-1])]))
    dst = os.path.join(OUT, x['p'].lstrip('/'))
    if c and os.path.exists(dst): out[c].append(dst)
json.dump(out, open(os.path.join(H, 'assort', 'info_all.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(json.dumps({'файлов': len(want), **res, 'карточек': len(out), 'картинок': sum(map(len, out.values()))}, ensure_ascii=False))
