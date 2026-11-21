#!/usr/bin/env python3
"""21.11.2026, Т. В.: «забирай фото у Рекса, пока он может делать». ZIP от Рекса (Notion, карточка «Фото для карточек „Сайта“»):
файлы <код>__<вид>.png|jpg|webp → work/fsu/ai/<код>/<вид>.png (те же места, что у партии fsu_ai_batch; сборка build_new.py берёт их сама).
Готовые не перезаписываются (--force — перезаписать). Неизвестный код/вид — в отчёт, не раскладывается.
  python3 fsu_rex_ingest.py <zip> [...] [--force]"""
import sys, os, io, re, json, zipfile, time
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(H, 'ai')
GAP = json.load(open(os.path.join(H, 'assort', 'photo_gap.json'), encoding='utf-8'))
KINDS = {'interior', 'side', 'back', 'front34l', 'front34r', 'detail', 'sun', 'moon', 'day', 'night'}   # sun/moon/day/night — темы «Солнце/Луна», интерьер день/ночь (21.11), сборка пока не берёт
force = '--force' in sys.argv; zips = [a for a in sys.argv[1:] if not a.startswith('--')]
rep = {'ok': [], 'есть': [], 'код?': [], 'вид?': [], 'мало': []}
for zp in zips:
    with zipfile.ZipFile(zp) as z:
        for n in z.namelist():
            b = os.path.basename(n); m = re.match(r'^(.+?)__([a-z0-9]+)\.(png|jpe?g|webp)$', b, re.I)
            if not m: continue
            code, kind = m.group(1), m.group(2).lower()
            if code not in GAP: rep['код?'].append(b); continue
            if kind not in KINDS: rep['вид?'].append(b); continue
            dst = os.path.join(OUT, code, kind + '.png')
            if os.path.exists(dst) and not force: rep['есть'].append(b); continue
            im = Image.open(io.BytesIO(z.read(n))); im.load()
            if max(im.size) < 1000: rep['мало'].append('%s %dx%d' % (b, *im.size)); continue
            os.makedirs(os.path.dirname(dst), exist_ok=True); im.convert('RGB').save(dst + '.tmp', 'PNG'); os.replace(dst + '.tmp', dst)
            open(os.path.join(OUT, '_log.jsonl'), 'a', encoding='utf-8').write(json.dumps({'code': code, 'kind': kind, 'src': ['rex:' + os.path.basename(zp)], 't': time.strftime('%d.%m %H:%M')}, ensure_ascii=False) + '\n')
            rep['ok'].append(b)
print(json.dumps({k: (len(v) if k == 'ok' else v[:30]) for k, v in rep.items()}, ensure_ascii=False))
