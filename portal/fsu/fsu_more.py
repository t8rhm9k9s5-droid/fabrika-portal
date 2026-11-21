#!/usr/bin/env python3
"""21.11.2026, Т. В.: «посмотри в других папках на FTP — там тоже есть фото, дополни; можно ещё взять из PDF каталога;
посмотри, что ещё есть в каталоге, чего не было на сайте». Копия «Сайта» на портале (не fabrikant.su), после fsu_enrich.py:
  1) файлы FTP, которых не было в копии (ftp_extra/ ← fsu_ftp_fetch.py): цвета коллекций, фото исполнений и товаров — на свои места;
     фото товара, на которое карточка не ссылается, — в галерею её карточки (по папке кода 1С или по имени файла);
  2) инфографика из папок FTP, ещё не разложенных по карточкам, — в галерею карточки (по названию папки);
  3) каталог 2025 (catalog2025.json ← fsu_catalog.py): карточкам без фото — снимок из каталога; без габаритов — габариты и материалы
     из каталога; моделей каталога, которых нет на сайте, — новые карточки (снимок, материалы, габариты, страница каталога).
  Отчёт — assort/catalog_report.json и assort/каталог_нет_на_сайте.csv.
  python3 fsu_more.py <папка копии>"""
import sys, os, re, json, hashlib, shutil, collections, difflib, csv
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); FSU = sys.argv[1]; AS = os.path.join(HERE, 'assort'); EX = os.path.join(HERE, 'ftp_extra')
CAT = os.path.join(HERE, 'catalog2025'); UP = os.path.join(FSU, 'upload/als-1c')
LAT = str.maketrans('abcehkmoptxy', 'авсенкмортху')
DROP = {x.translate(LAT) for x in ('стул', 'стулья', 'кресло', 'табурет', 'диван', 'пуф', 'банкетка', 'скамья', 'стол', 'столик', 'вешалка', 'урна', 'кушетка',
        'st', 'сн', 'ch', 'wh', 'пластик', 'на', 'new', 'вох', 'box', 'с', 'и', 'ткань', 'кожа', 'иск', 'местн', 'местный', 'мест', 'двухместный', 'трехместный')}


def key(s):
    s = str(s).lower().replace('ё', 'е').replace('&nbsp;', ' ').replace('\xa0', ' '); s = re.sub(r'<[^>]+>', '', s); s = re.sub(r'[«»"\'().,+/]', ' ', s)
    s = re.sub(r'\bbox\s*\d\b|\bвох\s*\d\b|\d{3,4}\s*[xх]\s*\d{3,4}(\s*[xх]\s*\d{3,4})?|\bмм\b|\d-?х?\b', ' ', s)
    return ' '.join(w for w in (w.translate(LAT) for w in s.split()) if w not in DROP and not w.isdigit())


IX = os.path.join(FSU, 'index.html'); H = open(IX, encoding='utf-8').read()
a0 = H.index('var A=') + 6; A, a_end = json.JSONDecoder().raw_decode(H[a0:]); a1 = a0 + a_end
API = os.path.join(FSU, '_api')
def jl(h): return json.load(open(os.path.join(API, h + '.json'), encoding='utf-8'))
def jw(obj):
    b = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8'); h = hashlib.md5(b).hexdigest()[:16]
    p = os.path.join(API, h + '.json'); open(p + '.tmp', 'wb').write(b); os.replace(p + '.tmp', p); return h
FX = os.path.join(API, '_fidx.json'); X = json.load(open(FX, encoding='utf-8'))
rep = {'ftp_placed': 0, 'ftp_gallery': [], 'info_gallery': [], 'cat_photo': [], 'cat_dims': [], 'cat_added': [], 'cat_on_site': 0, 'cat_skip': []}


def ph(src_rel, alt):
    p = os.path.join(FSU, src_rel)
    try: w, h = Image.open(p).size
    except Exception: return None
    return {'src': '/fsu/' + src_rel, 'h': h, 'w': w, 'size': os.path.getsize(p), 'alt': alt}


# ---------- 0) страницы товаров, которые обход сайта не сохранил (ftp_extra/pages ← fsu_ftp_fetch.py) ----------
PD = os.path.join(EX, 'pages'); rep['pages_added'] = []
if os.path.isdir(PD):
    for f in sorted(os.listdir(PD)):
        o = json.load(open(os.path.join(PD, f), encoding='utf-8')); kk = '/api/v1/?action=blockPage.getPageByUrl&url=%s&lang=ru' % o['url']
        if kk in A: continue
        s = json.dumps(o['page'], ensure_ascii=False)
        for pth in set(re.findall(r'"(/upload/[^"]+)"', s)):
            src = os.path.join(EX, 'site_upload', pth.lstrip('/')); dst = os.path.join(FSU, pth.lstrip('/'))
            if os.path.exists(src) and not os.path.exists(dst): os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(src, dst)
        s = re.sub(r'https?://(?:www\.)?fabrikant\.su/', '/fsu/', s); s = s.replace('"/upload/', '"/fsu/upload/')
        pgo = json.loads(s); A[kk] = jw(pgo); rep['pages_added'].append(o['url'])
        sid = ((pgo.get('dynamicContent') or {}).get('data') or {}).get('id')
        if sid: A.setdefault('/api/v1/?action=products.getSimilarItems&id=%s&limit=5&lang=ru' % sid, jw([]))   # «похожие» — пусто, но без плашки «не сохранено»
# карточки товаров: адрес снимка → страница
PAGES = {}   # ключ A → (страница, data)
for k, h in A.items():
    if 'blockPage.getPageByUrl' in k and '/catalog/' in k:
        try: pg = jl(h); d = pg['dynamicContent']['data']
        except Exception: continue
        if (pg.get('dynamicContent') or {}).get('type') == 'products_catalog_detail' or 'characteristics' in d: PAGES[k] = pg
BYCODE = collections.defaultdict(list); BYKEY = collections.defaultdict(list)
for k, pg in PAGES.items():
    d = pg['dynamicContent']['data']; BYKEY[key(d['name'])].append(k)
    for p in d.get('photos') or []:
        m = re.search(r'/products/([^/]+)/', p.get('src', ''))
        if m: BYCODE[m.group(1)].append(k)
CHANGED = set()
PK = {}   # код товара → ключ страницы
for k in PAGES: PK[k.split('&lang=')[0].rsplit('/', 1)[-1]] = k
SITEK = {}   # ключ названия → страница (или None, если страницы нет) — по всем товарам сайта, не только сохранённым страницам
for it in X['items'].values(): SITEK.setdefault(key(it['name']), PK.get(it['code']))
def compact(s): return re.sub(r'[^a-zа-я0-9]', '', s)
SITEC = {compact(k): v for k, v in SITEK.items() if k}
for it in X['items'].values(): SITEC.setdefault(compact(re.sub(r'&nbsp;|<[^>]+>', '', it['name'].lower().replace('ё', 'е'))), PK.get(it['code']))
RAW = ''
def site_hit(k):
    if k in SITEK: return True, SITEK[k]
    c = compact(k)
    if c in SITEC: return True, SITEC[c]
    rc = compact(RAW.lower().replace('ё', 'е')) if RAW else ''
    if rc and rc in SITEC: return True, SITEC[rc]
    for k2, v in SITEK.items():   # «Феликс G хром» — исполнение «Феликс G»; «Ева PLZ» — исполнение «Ева»
        if k2 and len(k2) >= 3 and (k.startswith(k2 + ' ') or k2.startswith(k + ' ')): return True, v
    m = difflib.get_close_matches(k, list(SITEK), n=1, cutoff=0.88)
    return (True, SITEK[m[0]]) if m else (False, None)


def add_photo(k, photo, front=False):
    d = PAGES[k]['dynamicContent']['data']; ps = d.setdefault('photos', [])
    if any(p.get('src') == photo['src'] for p in ps): return False
    (ps.insert(0, photo) if front else ps.append(photo)); CHANGED.add(k)
    it = X['items'].get(str(d['id']))
    if it is not None and (front or not it.get('photos')): it['photos'] = ps[:2]
    return True


# ---------- 1) файлы FTP ----------
for root, _, fs in os.walk(os.path.join(EX, 'catalog')):
    for f in fs:
        rel = os.path.relpath(os.path.join(root, f), EX)                       # catalog/products/<код>/photos/x.png
        dst = os.path.join(UP, rel)
        if not os.path.exists(dst): os.makedirs(os.path.dirname(dst), exist_ok=True); shutil.copy2(os.path.join(root, f), dst); rep['ftp_placed'] += 1
        parts = rel.split('/')
        if parts[1] != 'products' or '/photos/' not in rel or '/offers/' in rel: continue
        code = parts[2]; ks = BYCODE.get(code)
        if not ks:   # папки кода нет ни в одной карточке — по имени файла: main_rasti_3.png → «расти»
            stem = re.sub(r'^(main|view)_|_\d+$|_x\d+$', '', os.path.splitext(f)[0].lower()); stem = re.sub(r'_\d+$', '', stem)
            cand = [kk for kk in PAGES if re.search(r'/' + re.escape(stem.replace('_', '-')) + r'(-|&|$)', kk)]
            ks = cand[:1]
        for k in ks[:1]:
            p = ph('upload/als-1c/' + rel, f)
            if p and add_photo(k, p): rep['ftp_gallery'].append([PAGES[k]['dynamicContent']['data']['name'], rel])
# ---------- 2) инфографика из папок FTP, ещё не разложенных ----------
ib = os.path.join(EX, 'infographic')
if os.path.isdir(ib):
    os.makedirs(os.path.join(UP, 'infographic'), exist_ok=True)
    for root, _, fs in os.walk(ib):
        if not fs: continue
        folder = os.path.basename(root); kf = key(re.split(r',', folder)[0])
        hit = BYKEY.get(kf) or [BYKEY[x][0] for x in difflib.get_close_matches(kf, list(BYKEY), n=1, cutoff=0.86)]
        if not hit: rep.setdefault('info_nomatch', []).append(folder); continue
        for f in sorted(fs):
            src = os.path.join(root, f); h = hashlib.md5(open(src, 'rb').read()).hexdigest()[:20]
            rel = 'upload/als-1c/infographic/%s.webp' % h
            if not os.path.exists(os.path.join(FSU, rel)):
                im = Image.open(src); im.thumbnail((1400, 1400)); im.convert('RGB').save(os.path.join(FSU, rel), 'WEBP', quality=82, method=5)
            p = ph(rel, 'инфографика')
            if p and add_photo(hit[0], p): rep['info_gallery'].append([PAGES[hit[0]]['dynamicContent']['data']['name'], folder])
# ---------- 3) каталог 2025 ----------
CJ = json.load(open(os.path.join(HERE, 'catalog2025.json'), encoding='utf-8')) if os.path.exists(os.path.join(HERE, 'catalog2025.json')) else []
os.makedirs(os.path.join(UP, 'catalog2025'), exist_ok=True)
SECT = [(r'^Кресла|руководител|кресл', 117), (r'^Стулья|стул', 131), (r'Мягкая', 133), (r'Столы|стол', 132), (r'Вешалк', 134), (r'Детск', 135), (r'Урн', 136),
        (r'Банкетк|кушетк', 137), (r'Школьн', 138), (r'театр|зал', 140), (r'Медицин', 320), (r'деревянн', 321)]
secs = {s['id']: s for s in jl(A[next(x for x in A if 'products.getSections' in x)])}
tmpl = {}
for k, pg in PAGES.items(): tmpl.setdefault(pg['dynamicContent']['data']['sectionId'], pg)
TR = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', ['a','b','v','g','d','e','e','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','sch','','y','','e','yu','ya']))
def slug(s): s = ''.join(TR.get(c, c) for c in s.lower()); return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s)).strip('-')[:60]
def cimg(r):
    if r.get('edge') and r.get('half'):   # вырез задевает соседние снимки — вместо него страница каталога целиком
        rel = 'upload/als-1c/catalog2025/' + r['half']
        if not os.path.exists(os.path.join(FSU, rel)): shutil.copy2(os.path.join(CAT, r['half']), os.path.join(FSU, rel))
        return ph(rel, r['name'] + ' — страница каталога 2025, стр. %d' % r['page'])
    rel = 'upload/als-1c/catalog2025/' + r['img'].replace('.png', '.webp')
    if not os.path.exists(os.path.join(FSU, rel)):
        im = Image.open(os.path.join(CAT, r['img'])); im.convert('RGB').save(os.path.join(FSU, rel), 'WEBP', quality=85, method=5)
    return ph(rel, r['name'] + ' — каталог 2025, стр. %d' % r['page'])
def dimvals(s):
    n = [int(x) for x in re.findall(r'\d{2,4}', s or '')]
    return n if len(n) == 3 else None
best = {}
for r in CJ:   # одна запись на название: снимок без обреза у края, крупнее
    if re.search(r'Проектн|проект', r.get('sect', '')): continue
    k = key(r['name'])
    if not k or len(k) < 3: continue
    b = best.get(k)
    if not b or (b['edge'] and not r['edge']) or (b['edge'] == r['edge'] and r['w'] * r['h'] > b['w'] * b['h']) or (not b.get('dims') and r.get('dims')): best[k] = r
nid = 995000; miss = []
for k, r in best.items():
    if r['name'].startswith('*') or re.match(r'(опора|подставка|заглушка|pl-\d+|замок|цилиндр|комбинация)\b', r['name'], re.I): rep['cat_skip'].append(r['name']); continue
    RAW = r['name']; on, kk = site_hit(k)
    if on:
        rep['cat_on_site'] += 1
        if not kk: continue
        d = PAGES[kk]['dynamicContent']['data']
        if not d.get('photos') and not r['edge']:
            p = cimg(r)
            if p and add_photo(kk, p, front=True): rep['cat_photo'].append([d['name'], r['page']])
        ch = d.setdefault('characteristics', []); titles = [c['title'] for c in ch]; dv = dimvals(r.get('dims'))
        if dv and 'Габариты' not in titles:
            ch.insert(0, {'title': 'Габариты', 'values': [{'name': 'Ширина', 'value': '%d&nbsp;мм' % dv[0], 'icon': 'width'}, {'name': 'Глубина', 'value': '%d&nbsp;мм' % dv[1], 'icon': 'depth'},
                                                         {'name': 'Высота', 'value': '%d&nbsp;мм' % dv[2], 'icon': 'height'}, {'name': 'Источник', 'value': 'каталог 2025, стр. %d' % r['page']}]})
            CHANGED.add(kk); rep['cat_dims'].append([d['name'], r['dims']])
        continue
    sec = next((sid for rx, sid in SECT if re.search(rx, r.get('sect', '') + ' ' + r['name'], re.I)), 131); sc = secs.get(sec) or secs[131]
    nid += 1; code = 'k-' + slug(r['name']); name = r['name']
    p = cimg(r); photos = [p] if p else []
    ch = []; dv = dimvals(r.get('dims'))
    if dv: ch.append({'title': 'Габариты', 'values': [{'name': 'Ширина', 'value': '%d&nbsp;мм' % dv[0], 'icon': 'width'}, {'name': 'Глубина', 'value': '%d&nbsp;мм' % dv[1], 'icon': 'depth'},
                                                       {'name': 'Высота', 'value': '%d&nbsp;мм' % dv[2], 'icon': 'height'}]})
    if r.get('mat'): ch.append({'title': 'Исполнения', 'values': [{'name': 'Материалы (каталог)', 'value': r['mat'][:200]}]})
    pg = json.loads(json.dumps(tmpl.get(sec) or tmpl.get(131)))
    pg['dynamicContent']['data'] = {'id': nid, 'code': code, 'name': name, 'sectionId': sec, 'articul': '', 'barcode': '',
        'description': '<p>Модель есть в каталоге «Фабрикант» 2025 (стр. %d, раздел «%s»), на сайте fabrikant.su её карточки пока нет. '
                       'Карточка собрана по каталогу: снимок, материалы, габариты. Уточняйте наличие и исполнения у менеджера.</p>' % (r['page'], r.get('sect', '')),
        'heightMin': dv[2] if dv else None, 'heightMax': dv[2] if dv else None, 'depthMax': dv[1] if dv else None, 'widthMax': dv[0] if dv else None,
        'seo': {'title': name}, 'characteristics': ch, 'features': {'id': 0, 'description': '', 'items': []}, 'photos': photos,
        'parentSections': [{k2: sc[k2] for k2 in sc if k2 in ('id', 'name', 'code', 'dl', 'lm', 'rm', 'icon', 'seo')}]}
    A['/api/v1/?action=blockPage.getPageByUrl&url=/catalog/%s/%s&lang=ru' % (sc['code'], code)] = jw(pg)
    A['/api/v1/?action=products.getSimilarItems&id=%d&limit=5&lang=ru' % nid] = jw([])
    X['items'][str(nid)] = {'id': nid, 'code': code, 'name': name, 'sectionId': sec, 'photos': photos}
    X['order'].append(nid); X['v'].setdefault('miblock-section-id', {}).setdefault(str(sec), []).append(nid)
    near = [PAGES[BYKEY[x][0]]['dynamicContent']['data']['name'] for x in difflib.get_close_matches(k, list(BYKEY), n=2, cutoff=0.7)]
    rep['cat_added'].append([name, r.get('sect', ''), r['page'], '/catalog/%s/%s' % (sc['code'], code), 'страница каталога вместо выреза' if r['edge'] else 'снимок есть' if photos else 'без снимка'])
    miss.append([name, r.get('sect', ''), r['page'], r.get('mat', ''), r.get('dims', ''), '/catalog/%s/%s' % (sc['code'], code),
                 re.sub(r'<[^>]+>|&nbsp;', ' ', ', '.join(near)), 'страница каталога вместо выреза' if r['edge'] else ''])
for k in CHANGED: A[k] = jw(PAGES[k])
json.dump(X, open(FX + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); os.replace(FX + '.tmp', FX)
H = H[:a0] + json.dumps(A, ensure_ascii=False) + H[a1:]; open(IX + '.tmp', 'w', encoding='utf-8').write(H); os.replace(IX + '.tmp', IX)
os.makedirs(AS, exist_ok=True); json.dump(rep, open(os.path.join(AS, 'catalog_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(os.path.join(AS, 'каталог_нет_на_сайте.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, delimiter=';'); w.writerow(['Модель (каталог 2025)', 'Раздел каталога', 'Стр.', 'Материалы', 'Габариты', 'Карточка в копии', 'Проверить: похожая на сайте', 'Снимок'])
    w.writerows(miss)
print(json.dumps({'файлов FTP на место': rep['ftp_placed'], 'фото FTP в галереи': len(rep['ftp_gallery']), 'инфографика в галереи': len(rep['info_gallery']),
                  'не разложено папок инфографики': len(rep.get('info_nomatch', [])), 'моделей каталога на сайте': rep['cat_on_site'],
                  'снимок из каталога (карточка без фото)': len(rep['cat_photo']), 'габариты из каталога': len(rep['cat_dims']),
                  'новых карточек из каталога': len(rep['cat_added'])}, ensure_ascii=False))
