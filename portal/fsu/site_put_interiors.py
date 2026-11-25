#!/usr/bin/env python3
"""Интерьеры день/ночь из review/api → файлы сайта для выпуска-заплатки (25.11.2026; полной сборки сайта после перезапуска нет).
  python3 site_put_interiors.py <папка заплатки/plain> код[:day|:night|:both] …
Формат как у действующих карточек (снято с хостинга): ключ = sha256(PNG)[:16]+'v2'; fsu/n/i/<k>.webp 1365×2048, i/m/ 683×1024, i/t/ 320×480;
карточка fsu/n/d/p/<код>.json → th.day / th.night; fsu/n/d/im.json → [0,1,0,1,'000000','000000000000','000000000000',1] (кадр на всю рамку).
Карточки и im.json берутся С ХОСТИНГА (действующая версия), а не из локальной копии."""
import hashlib, io, json, os, sys
from PIL import Image
sys.path.insert(0, '/home/claude/fabrika/tools'); import live_get as L
H = os.path.dirname(os.path.abspath(__file__)); out = sys.argv[1]; SZ = (('', (1365, 2048), 82), ('m/', (683, 1024), 80), ('t/', (320, 480), 78))
im = json.loads(L.read('fsu/n/d/im.json')); done = []
for a in sys.argv[2:]:
    code, _, which = a.partition(':'); kinds = ('day', 'night') if which in ('', 'both') else (which,)
    card = json.loads(L.read('fsu/n/d/p/%s.json' % code)); th = card.get('th') or {}
    for v in kinds:
        png = open(os.path.join(H, 'review', 'api', '%s_%s.png' % (code, v)), 'rb').read(); k = hashlib.sha256(png).hexdigest()[:16] + 'v2'
        src = Image.open(io.BytesIO(png)).convert('RGB'); assert abs(src.width / src.height - 2 / 3) < 0.01, (code, v, src.size)
        for sub, size, q in SZ:
            p = os.path.join(out, 'fsu/n/i', sub, k + '.webp'); os.makedirs(os.path.dirname(p), exist_ok=True)
            src.resize(size, Image.LANCZOS).save(p, 'WEBP', quality=q, method=6)
        th[v] = k; im[k] = [0, 1, 0, 1, '000000', '000000000000', '000000000000', 1]; done.append((code, v, k))
    card['th'] = th; p = os.path.join(out, 'fsu/n/d/p', code + '.json'); os.makedirs(os.path.dirname(p), exist_ok=True)
    json.dump(card, open(p, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
json.dump(im, open(os.path.join(out, 'fsu/n/d/im.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
for d in done: print(*d)
