#!/usr/bin/env python3
"""21.11.2026, Т. В.: «посмотри в других папках на FTP — там тоже есть фото, дополни».
Скачивает с портала (робот хостинга выложил файлы FTP сайта зашифрованными: st/f/<id>.bin, опись — st/ftp_idx.bin) все картинки
папок /catalog/ (товары, исполнения, коллекции) и /infographic/ в work/fsu/ftp_extra/<путь FTP>. Уже скачанные — не повторяются.
  python3 fsu_ftp_fetch.py <ftp_idx.json>"""
import sys, os, json, hmac, hashlib, base64, re, pathlib, subprocess, concurrent.futures as CF
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'ftp_extra')
bk = pathlib.Path('/home/claude/bot/bot_key.txt').read_text().strip()
bk = bytes.fromhex(bk) if re.fullmatch(r'[0-9a-fA-F]{64}', bk) else bk.encode()
K = hmac.new(bk, b'fabrika-live-v1', hashlib.sha256).digest()


def unseal(s):
    b = base64.b64decode(s.strip()[6:]); n, t, ct = b[:16], b[16:48], b[48:]
    if not hmac.compare_digest(t, hmac.new(K, n + ct, hashlib.sha256).digest()): raise ValueError('подпись')
    ks = b''.join(hmac.new(K, n + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))[:len(ct)]
    return (int.from_bytes(ct, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(len(ct), 'big') if ct else b''


IDX = json.load(open(sys.argv[1], encoding='utf-8'))
want = [x for x in IDX['items'] if not x.get('d') and x.get('id') and x['p'].startswith(('/catalog/', '/infographic/'))
        and x['p'].lower().endswith(('.jpg', '.jpeg', '.png', '.webp'))]
# только то, чего нет в копии сайта (каталог) и инфографика папок, ещё не разобранных по карточкам (info_map.json)
COPY = '/home/claude/build/fsu/upload/als-1c'
IMAP = json.load(open(os.path.join(HERE, 'info_map.json'), encoding='utf-8')) if len(sys.argv) < 3 else json.load(open(sys.argv[2], encoding='utf-8'))
want = [x for x in want if (x['p'].startswith('/catalog/') and not os.path.exists(COPY + x['p'])) or
        (x['p'].startswith('/infographic/') and '/'.join(x['p'].split('/')[:-1]) not in IMAP)]


def one(x):
    dst = os.path.join(OUT, x['p'].lstrip('/'))
    if os.path.exists(dst) and os.path.getsize(dst): return 'есть'
    for i in range(4):
        r = subprocess.run(['curl', '-s', '-f', '-m', '120', 'https://techfabrikant.ru/st/f/%s.bin' % x['id']], capture_output=True)
        if r.returncode == 0:
            try:
                b = unseal(r.stdout.decode())
            except Exception: return 'ошибка'
            os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst + '.tmp', 'wb').write(b); os.replace(dst + '.tmp', dst); return 'скачан'
    return 'нет'


from collections import Counter
with CF.ThreadPoolExecutor(6) as ex: res = Counter(ex.map(one, want))
print(json.dumps({'всего': len(want), **res}, ensure_ascii=False))

# ---------- 21.11.2026: карточки, которые есть в списках сайта, но страницы которых обход не сохранил (19 шт.: «Пилот», «Бёрн», «Честермэн»…) ----------
#   страница товара и её фото — с fabrikant.su (API сайта) → ftp_extra/pages/<код>.json и ftp_extra/site_upload/<путь>
import urllib.parse
FSU = '/home/claude/build/fsu'
X = json.load(open(FSU + '/_api/_fidx.json', encoding='utf-8'))
H = open(FSU + '/index.html', encoding='utf-8').read(); A = json.JSONDecoder().raw_decode(H.split('var A=', 1)[1])[0]
have = {k.split('url=/catalog/')[1].split('&')[0].split('/')[-1] for k in A if 'getPageByUrl&url=/catalog/' in k}
SECS = {s['id']: s['code'] for s in json.load(open(FSU + '/_api/' + A[next(x for x in A if 'products.getSections' in x)] + '.json', encoding='utf-8'))}
PD = os.path.join(OUT, 'pages'); os.makedirs(PD, exist_ok=True); got = 0
for it in X['items'].values():
    if it['code'] in have or int(it['id']) >= 990000: continue
    if os.path.exists(os.path.join(PD, it['code'] + '.json')): got += 1; continue
    sec = SECS.get(it.get('sectionId'), 'all'); url = '/catalog/%s/%s' % (sec, it['code'])
    u = 'https://fabrikant.su/api/v1/?action=blockPage.getPageByUrl&url=%s&lang=ru' % urllib.parse.quote(url, safe='/')
    for _i in range(4):
        r = subprocess.run(['curl', '-s', '-f', '-m', '40', '-A', 'Mozilla/5.0', u], capture_output=True)
        if r.returncode == 0 and r.stdout: break
    try: pg = json.loads(r.stdout.decode('utf-8'))
    except Exception: print('нет страницы', url); continue
    if not ((pg.get('dynamicContent') or {}).get('data')): print('пустая страница', url); continue
    s = json.dumps(pg, ensure_ascii=False)
    for p in sorted(set(re.findall(r'"(/upload/[^"]+\.(?:png|jpe?g|webp|gif|pdf))"', s))):
        dst = os.path.join(OUT, 'site_upload', p.lstrip('/'))
        if not os.path.exists(dst):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            subprocess.run(['curl', '-s', '-f', '-m', '120', '-A', 'Mozilla/5.0', '-o', dst, 'https://fabrikant.su' + urllib.parse.quote(p)])
    json.dump({'url': url, 'page': pg}, open(os.path.join(PD, it['code'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False); got += 1
print('страниц сайта дозагружено', got)
