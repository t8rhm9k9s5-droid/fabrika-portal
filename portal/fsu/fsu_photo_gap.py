#!/usr/bin/env python3
"""21.11.2026, Т. В.: «на каждой карточке должно быть 5–7 фото минимум + 1–2 в интерьере».
Опись настоящих фото по каждой карточке копии сайта (build/fsu): галерея страницы + все файлы папки товара в копии
+ ftp_extra (папка товара на FTP), каталог 2025 (вырезы). Инфографика считается отдельно, полстраницы каталога — не фото.
Повторы убираются по имени файла и по 64-битному dHash (≤5 бит разницы). Студийное/интерьер — по доле светлых/прозрачных
пикселей по краю кадра. Выход: assort/photo_gap.json, assort/фото_нехватка.csv.
  python3 fsu_photo_gap.py"""
import json, os, re, csv, collections, concurrent.futures as CF
from PIL import Image
FSU = '/home/claude/build/fsu'; HERE = os.path.dirname(os.path.abspath(__file__)); FX = os.path.join(HERE, 'ftp_extra')
OUT = os.path.join(HERE, 'assort'); os.makedirs(OUT, exist_ok=True)
IMG = ('.png', '.jpg', '.jpeg', '.webp')
H = open(FSU + '/index.html', encoding='utf-8').read(); A = json.JSONDecoder().raw_decode(H.split('var A=', 1)[1])[0]
SEC = {s['id']: re.sub(r'&nbsp;', ' ', s['name']) for s in json.load(open(FSU + '/_api/' + A[next(k for k in A if 'products.getSections' in k)] + '.json', encoding='utf-8'))}
NOINT = {'Коллекция материалов', 'Комплектующие'}


def local(src):
    p = FSU + src[len('/fsu'):] if src.startswith('/fsu/') else FSU + src
    return p if os.path.exists(p) else None


def originals(d):
    """оригиналы в папке (без производных .640.webp / .2560.webp)"""
    if not d or not os.path.isdir(d): return []
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.lower().endswith(IMG) and not re.search(r'\.\d+\.webp$', f)]


def stem(p):
    s = os.path.basename(p).lower(); s = re.sub(r'\.\d+\.webp$', '', s); return re.sub(r'\.(png|jpe?g|webp)$', '', s)


def small(p):
    """быстрый путь: готовая уменьшенная копия .640.webp, если есть"""
    q = p + '.640.webp'; return q if os.path.exists(q) else p


def probe(p):
    try:
        im = Image.open(small(p)); im.draft('RGB', (256, 256)); im.load()
        hasA = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
        im = im.convert('RGBA'); im.thumbnail((256, 256)); W, Hh = im.size
        g = im.convert('L').resize((9, 8)); px = list(g.get_flattened_data() if hasattr(g, 'get_flattened_data') else g.getdata())
        dh = sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])
        b = max(2, min(W, Hh) // 25); pts = []
        for x in range(0, W, 2): pts += [im.getpixel((x, y)) for y in list(range(b)) + list(range(Hh - b, Hh))]
        for y in range(0, Hh, 2): pts += [im.getpixel((x, y)) for x in list(range(b)) + list(range(W - b, W))]
        al = im.split()[3]; tr = sum(1 for a in al.getdata() if a < 40) / (W * Hh)
        cr = [im.getpixel(q)[3] for q in ((1, 1), (W - 2, 1), (1, Hh - 2), (W - 2, Hh - 2))]
        mid = [im.getpixel((W // 2, y))[3] for y in (1, Hh - 2)] + [im.getpixel((x, Hh // 2))[3] for x in (1, W - 2)]
        detail = tr > 0.1 and all(a < 40 for a in cr) and sum(a > 200 for a in mid) >= 3   # круглый вырез детали
        light = sum(1 for r, g2, bl, a in pts if a < 40 or (r > 225 and g2 > 225 and bl > 225 and max(r, g2, bl) - min(r, g2, bl) < 18)) / max(1, len(pts))
        return {'dh': dh, 'studio': tr >= 0.05 or light >= 0.55, 'detail': detail, 'cutout': tr >= 0.05, 'light': round(light, 2), 'w': Image.open(p).size[0] if p.endswith('.png') else W, 'alpha': hasA}
    except Exception as e:
        return {'err': str(e)[:80]}


cards = []
for k, h in A.items():
    if 'getPageByUrl&url=/catalog/' not in k: continue
    url = k.split('url=/catalog/')[1].split('&')[0]
    if url.count('/') != 1: continue
    j = json.load(open(FSU + '/_api/' + h + '.json', encoding='utf-8')); d = (j.get('dynamicContent') or {}).get('data')
    if not d or not d.get('code'): continue
    real, info, catpage = [], [], []
    folders = set()
    for ph in d.get('photos') or []:
        s = ph['src']; p = local(s)
        if '/infographic/' in s: info.append(s); continue
        if '/catalog2025/page' in s: catpage.append(s); continue
        if p: real.append(p)
        m = re.search(r'/catalog/(products|offers)/([^/]+)/', s)
        if m and not folders: folders.add(m.groups())   # своя папка — папка главного фото
    for kind, fid in folders:
        real += originals(f'{FSU}/upload/als-1c/catalog/{kind}/{fid}/photos')
        real += originals(f'{FX}/catalog/{kind}/{fid}/photos') + originals(f'{FX}/catalog/{kind}/{fid}')
    cards.append({'code': d['code'], 'name': re.sub(r'&nbsp;', ' ', d.get('name', '')), 'section': SEC.get(d.get('sectionId'), str(d.get('sectionId'))),
                  'url': '/fsu/catalog/' + url, 'real': list(dict.fromkeys(real)), 'info': info, 'catpage': catpage})

allp = sorted({p for c in cards for p in c['real']})
with CF.ThreadPoolExecutor(8) as ex: PR = dict(zip(allp, ex.map(probe, allp)))
print('снимков проверено', len(allp), 'ошибок', sum(1 for v in PR.values() if 'err' in v))

res = {}; dist = collections.Counter()
for c in cards:
    keep, stems, hashes = [], set(), []
    for p in c['real']:
        r = PR.get(p) or {}
        if 'err' in r: continue
        st = stem(p)
        if st in stems or any(bin(r['dh'] ^ x).count('1') <= 5 for x in hashes): continue
        stems.add(st); hashes.append(r['dh']); keep.append((p, r))
    details = [p for p, r in keep if r.get('detail')]
    studio = [p for p, r in keep if r['studio'] and not r.get('detail')]; inter = [p for p, r in keep if not r['studio']]
    best = max(studio, key=lambda p: (stem(p).startswith('main'), PR[p].get('cutout', False), PR[p].get('light', 0), PR[p].get('w', 0)), default=None) or (inter[0] if inter else None)
    noint = c['section'] in NOINT
    res[c['code']] = {'name': c['name'], 'section': c['section'], 'url': c['url'], 'real_studio': len(studio), 'real_interior': len(inter),
                      'infographics': len(c['info']), 'catalog_page_only': len(c['catpage']), 'best_source_photo': best,
                      'details': len(details), 'need_angles': max(0, 5 - len(studio) - len(details)), 'need_interior': 0 if noint else max(0, 1 - len(inter)),
                      'no_interior_section': noint, 'studio': studio, 'interior': inter, 'detail_files': details}
    dist[min(len(studio) + len(details), 7)] += 1
json.dump(res, open(os.path.join(OUT, 'photo_gap.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(os.path.join(OUT, 'фото_нехватка.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['Код', 'Модель', 'Раздел', 'Адрес в «Сайте»', 'Фото студийные (ракурсы)', 'Фото деталей', 'Фото в интерьере', 'Инфографика', 'Только страница каталога',
                'Не хватает ракурсов (до 5)', 'Не хватает интерьерных (до 1)', 'Интерьер не нужен (раздел)', 'Исходное фото для ИИ'])
    for code, r in sorted(res.items(), key=lambda kv: (kv[1]['section'], -kv[1]['need_angles'], kv[0])):
        w.writerow([code, r['name'], r['section'], r['url'], r['real_studio'], r['details'], r['real_interior'], r['infographics'], r['catalog_page_only'],
                    r['need_angles'], r['need_interior'], 'да' if r['no_interior_section'] else '', (r['best_source_photo'] or '').replace(FSU, '/fsu').replace(HERE, 'work/fsu')])
T = {'карточек': len(res), 'с ≥5 фото (ракурсы+детали)': sum(1 for r in res.values() if r['real_studio'] + r['details'] >= 5),
     'с ≥5 ракурсов без деталей': sum(1 for r in res.values() if r['real_studio'] >= 5), 'фото деталей всего': sum(r['details'] for r in res.values()),
     'нужно ракурсов всего': sum(r['need_angles'] for r in res.values()), 'нужно интерьерных всего': sum(r['need_interior'] for r in res.values()),
     'без единого фото': sum(1 for r in res.values() if not r['best_source_photo']),
     'с интерьером уже': sum(1 for r in res.values() if r['real_interior']),
     'распределение ракурсы+детали (7 = 7+)': dict(sorted(dist.items()))}
print(json.dumps(T, ensure_ascii=False, indent=1))
