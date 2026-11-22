#!/usr/bin/env python3
"""21.11.2026, Т. В.: «сверил прайс, каталог и сайт по ассортименту, недостающее добавил на сайт и из файла с характеристиками добавил всё в описание?»
Копия «Сайта» на портале (не fabrikant.su): 
  1) сверка моделей прайс-листа с карточками сайта → assort/report.json и assort/нет_на_сайте.csv;
  2) в каждую карточку сайта — характеристики из 1С («Вес, габариты и упаковка номенклатуры», Сотрудник11 17.11) и исполнения из прайса:
     только то, чего в карточке нет (значения сайта не меняются), группы «Упаковка», «Поставка», «Исполнения» и строка в описании;
  3) моделей прайса, которых на сайте нет, — карточки (фото из прайса, характеристики 1С), в своих разделах; списки разделов и фильтров — из индекса (SW /fsu/_q).
  python3 fsu_enrich.py <папка копии> [прайс.xlsx] [номенклатура.xlsx]"""
import sys, os, re, json, zipfile, io, hashlib, collections, difflib
import pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); AS = os.path.join(HERE, 'assort')
FSU = sys.argv[1]
PRICE = sys.argv[2] if len(sys.argv) > 2 else os.path.join(AS, 'prais_2026-10-28.xlsx')
NOMF = sys.argv[3] if len(sys.argv) > 3 else os.path.join(AS, 'nomenklatura_2026-11-17.xlsx')
DATE_P, DATE_N = '28.10.2026', '17.11.2026'
LAT = str.maketrans('abcehkmoptxy', 'авсенкмортху')
DROP = {x.translate(LAT) for x in ('стул', 'стулья', 'кресло', 'табурет', 'диван', 'пуф', 'банкетка', 'скамья', 'стол', 'столик', 'вешалка', 'урна', 'кушетка', 'st', 'сн', 'ch',
        'wh', 'пластик', 'пластике', 'металлокаркас', 'металлокаркасе', 'с', 'покрытием', 'краш', 'на', 'ножках', 'new', 'вох', 'box', 'box2', 'box4', 'местн', 'местный', 'мест', 'к-т', 'кт')}
def key(s):
    s = str(s).lower().replace('ё', 'е').replace('&nbsp;', ' '); s = re.sub(r'<[^>]+>', '', s); s = re.sub(r'[«»"\'().,+]', ' ', s).replace('wd', 'w')
    s = re.sub(r'\bbox\s*\d\b|\bвох\s*\d\b', ' ', s)
    s = re.sub(r'\d{3,4}\s*[xх]\s*\d{3,4}(\s*[xх]\s*\d{3,4})?|l=\d+|\bмм\b|\d-мест\.?|\(в разборе\)|в разборе|\(компл\)|компл', ' ', s)
    t = [w.translate(LAT) for w in s.split()]
    return ' '.join(w for w in t if w not in DROP and not re.fullmatch(r'\d+-?х?', w))
def S(x): return '' if x is None or (isinstance(x, float) and x != x) else str(x).strip()
def num(x):
    try: v = float(str(x).replace(',', '.')); return v if v == v and v > 0 else None
    except Exception: return None
def fixzip(src):   # 1С пишет «SharedStrings.xml» — openpyxl ищет «sharedStrings.xml»
    zi = zipfile.ZipFile(src); bio = io.BytesIO(); zo = zipfile.ZipFile(bio, 'w', zipfile.ZIP_DEFLATED)
    for n in zi.namelist():
        b = zi.read(n)
        if n.endswith('.rels') or n == '[Content_Types].xml': b = b.replace(b'SharedStrings.xml', b'sharedStrings.xml')
        zo.writestr(n.replace('SharedStrings.xml', 'sharedStrings.xml'), b)
    zo.close(); bio.seek(0); return bio
# ---------- прайс: модели, исполнения, фото ----------
PR = collections.OrderedDict(); COLS = {18: 'Обивка', 19: 'Цвет каркаса', 20: 'Механизм', 21: 'Подлокотники', 22: 'Опора', 23: 'Ролики', 24: 'Доп. свойства'}
for sh, v in pd.read_excel(PRICE, sheet_name=None, header=None, engine='calamine').items():
    for i in range(len(v)):
        m = S(v.iloc[i, 7]) if v.shape[1] > 7 else ''
        if not m or m == 'Модель': continue
        r = PR.setdefault(m, {'sheet': sh, 'rows': [], 'krat': set(), 'row0': i})
        r['rows'].append({c: S(v.iloc[i, j]) for j, c in COLS.items() if v.shape[1] > j and S(v.iloc[i, j]) not in ('', '-')})
        if v.shape[1] > 17 and S(v.iloc[i, 17]): r['krat'].add(S(v.iloc[i, 17]))
import openpyxl
IMG = {}
try:
    wb = openpyxl.load_workbook(fixzip(PRICE))
    for ws in wb.worksheets:
        rows = {}
        for im in ws._images:
            try: rows.setdefault(im.anchor._from.row, im)
            except Exception: pass
        for m, r in PR.items():
            if r['sheet'] == ws.title and r['row0'] in rows and m not in IMG: IMG[m] = rows[r['row0']]
except Exception as e: print('фото прайса:', e, file=sys.stderr)
# ---------- 1С: вес, габариты, упаковка, кратность, характеристики ----------
N = pd.read_excel(NOMF, header=None, engine='calamine')
hdr = [S(x) for x in N.iloc[8].tolist()]; ci = {h: j for j, h in enumerate(hdr) if h}
NOM = collections.defaultdict(lambda: {'vars': set(), 'vals': collections.defaultdict(collections.Counter)})
FIELDS = ['Вес, кг', 'Высота max, мм', 'Высота min, мм', 'Глубина max, мм', 'Глубина min, мм', 'Ширина max, мм', 'Ширина min, мм', 'Упаковка: вес, кг', 'Упаковка: высота, мм',
          'Упаковка: глубина, мм', 'Упаковка: ширина, мм']
KR = [h for h in ci if h.startswith('Кратность')]
for i in range(9, len(N)):
    nm = S(N.iloc[i, 0]);
    if not nm: continue
    d = NOM[nm]; ch = S(N.iloc[i, ci.get('Характеристика', 3)])
    if ch: d['vars'].add(ch)
    for f in FIELDS:
        x = num(N.iloc[i, ci[f]]) if f in ci else None
        if x: d['vals'][f][x] += 1
    if KR and S(N.iloc[i, ci[KR[0]]]): d['vals']['krat'][S(N.iloc[i, ci[KR[0]]])] += 1
def top(d, f): c = d['vals'].get(f); return c.most_common(1)[0][0] if c else None
NK = collections.defaultdict(list)
for nm in NOM: NK[key(nm)].append(nm)
PK = collections.defaultdict(list)
for m in PR: PK[key(m)].append(m)
def mm(x): return ('%d' % x) if x == int(x) else ('%g' % x)
def kg(x): return ('%g' % x).replace('.', ',')
# ---------- копия сайта: карта снимков ----------
IX = os.path.join(FSU, 'index.html'); H = open(IX, encoding='utf-8').read()
a0 = H.index('var A=') + 6; A, a_end = json.JSONDecoder().raw_decode(H[a0:]); a1 = a0 + a_end
API = os.path.join(FSU, '_api')
def jl(h): return json.load(open(os.path.join(API, h + '.json'), encoding='utf-8'))
def jw(obj):
    b = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8'); h = hashlib.md5(b).hexdigest()[:16]
    p = os.path.join(API, h + '.json'); tmp = p + '.tmp'; open(tmp, 'wb').write(b); os.replace(tmp, p); return h
def nb(s): return s.replace(' ', '&nbsp;', 1) if False else s
rep = {'site_cards': 0, 'enriched': 0, 'no_1c': [], 'added': [], 'mismatch': []}
# ---------- 2) характеристики в карточки сайта ----------
seen_keys = set()
for k in list(A):
    if 'blockPage.getPageByUrl' not in k or '/catalog/' not in k: continue
    try: pg = jl(A[k])
    except Exception: continue
    dc = (pg.get('dynamicContent') or {}); d = dc.get('data') if dc.get('type') == 'products_catalog_detail' else None
    if not isinstance(d, dict): continue
    rep['site_cards'] += 1; sk = key(d.get('name', '')); seen_keys.add(sk)
    noms = NK.get(sk, []); prs = PK.get(sk, [])
    if not noms and not prs: rep['no_1c'].append(re.sub(r'<[^>]+>|&nbsp;', ' ', d.get('name', '')).strip()); continue
    ch = d.get('characteristics') or []; d['characteristics'] = ch
    def grp(t):
        for g in ch:
            if g.get('title') == t: return g
        g = {'title': t, 'values': []}; ch.append(g); return g
    def has(g, nm): return any(v.get('name') == nm for v in g['values'])
    agg = {f: None for f in FIELDS}; kr = None; vars_ = set()
    for nm in noms:
        for f in FIELDS: agg[f] = agg[f] or top(NOM[nm], f)
        kr = kr or top(NOM[nm], 'krat'); vars_ |= NOM[nm]['vars']
    add = []
    g = grp('Габариты')
    for nm, f1, f2, ic in (('Ширина', 'Ширина min, мм', 'Ширина max, мм', 'width'), ('Глубина', 'Глубина min, мм', 'Глубина max, мм', 'depth'), ('Высота', 'Высота min, мм', 'Высота max, мм', 'height')):
        lo, hi = agg[f1], agg[f2]; val = (mm(lo) + '–' + mm(hi) if lo and hi and lo != hi else mm(hi or lo)) if (lo or hi) else None
        if val and not has(g, nm): g['values'].append({'name': nm, 'value': val + '&nbsp;мм', 'icon': ic}); add.append(nm.lower() + ' ' + val + ' мм')
    if agg['Вес, кг'] and not has(g, 'Вес'): g['values'].append({'name': 'Вес', 'value': kg(agg['Вес, кг']) + '&nbsp;кг'}); add.append('вес ' + kg(agg['Вес, кг']) + ' кг')
    if not g['values']: ch.remove(g)
    if any(agg[f] for f in FIELDS[7:]):
        gu = grp('Упаковка')
        for nm, f, ic in (('Ширина', 'Упаковка: ширина, мм', 'width'), ('Глубина', 'Упаковка: глубина, мм', 'depth'), ('Высота', 'Упаковка: высота, мм', 'height')):
            if agg[f] and not has(gu, nm): gu['values'].append({'name': nm, 'value': mm(agg[f]) + '&nbsp;мм', 'icon': ic}); add.append('упаковка: ' + nm.lower() + ' ' + mm(agg[f]) + ' мм')
        if agg['Упаковка: вес, кг'] and not has(gu, 'Вес'): gu['values'].append({'name': 'Вес', 'value': kg(agg['Упаковка: вес, кг']) + '&nbsp;кг'})
    krs = set(); [krs.update(PR[m]['krat']) for m in prs]
    if kr: krs.add(kr)
    if krs:
        gp = grp('Поставка')
        if not has(gp, 'Кратность'): gp['values'].append({'name': 'Кратность (в упаковке)', 'value': ' / '.join(sorted(krs)) + '&nbsp;шт'}); add.append('кратность ' + ' / '.join(sorted(krs)) + ' шт')
    ex = collections.defaultdict(set)
    for m in prs:
        for r in PR[m]['rows']:
            for c, x in r.items(): ex[c].add(x)
    if ex or vars_:
        gi = grp('Исполнения')
        for c in COLS.values():
            if ex.get(c) and not has(gi, c): gi['values'].append({'name': c, 'value': ', '.join(sorted(ex[c]))[:400]})
        if vars_ and not has(gi, 'Вариантов в 1С'): gi['values'].append({'name': 'Вариантов в 1С', 'value': str(len(vars_))})
    line = []
    if ex.get('Обивка'): line.append('обивка — ' + ', '.join(sorted(ex['Обивка']))[:200])
    if ex.get('Цвет каркаса'): line.append('цвет каркаса — ' + ', '.join(sorted(ex['Цвет каркаса']))[:200])
    line += add
    if line and 'По прайсу и 1С' not in (d.get('description') or ''):
        d['description'] = (d.get('description') or '') + '<p><b>По прайсу и 1С</b> (прайс %s, 1С %s): %s.</p>' % (DATE_P, DATE_N, '; '.join(line))
    # расхождения сайта и 1С по весу (больше 10 %) — в отчёт отделу продаж
    try:
        sw = next((num(re.sub(r'[^\d,\.]', '', v['value'].split('&')[0])) for gg in ch if gg.get('title') == 'Габариты' for v in gg['values'] if v.get('name') == 'Вес'), None)
        if sw and agg['Вес, кг'] and abs(sw - agg['Вес, кг']) / agg['Вес, кг'] > 0.1: rep['mismatch'].append([d.get('name'), 'вес на сайте %s, в 1С %s' % (kg(sw), kg(agg['Вес, кг']))])
    except Exception: pass
    A[k] = jw(pg); rep['enriched'] += 1
# ---------- 1) и 3) недостающие модели ----------
SECT = {'Стулья': 131, 'Кресла': 117, 'Стулья WD': 131, 'Столы (каркасы)': 132, 'Мягкая мебель': 133, 'Мебель для залов ожидания, теат': 140, 'Банкетки и кушетки': 137,
        'Школьная мебель': 138, 'Разборные стулья и кресла': 131}
PARTS = re.compile(r'^(сиденье|подлокотник|пюпитр|соединительный элемент|столешница|каркас стола|основание|подстолье)|подстолье', re.I)
SAME = {'банкетка т': 'Банкетка-Т', 'для посетителей': 'Скамья С-1', 'для посетителей су': 'Скамья С-1СУ', 'для посетителей у': 'Скамья У',
        'основание стола журнального лофт': 'Лофт основание журнального стола', 'т': 'Банкетка-Т', 'кассира кс-6': 'Кресло КС-6', 'кассира кс-10': 'Кресло КС-10',
        'изо раме неразборный': 'Изо 3-х местный на раме'}   # есть на сайте под другим именем
secs = {s['id']: s for s in jl(A[next(x for x in A if 'products.getSections' in x)])}
tmpl = {}
for k in A:
    if 'blockPage.getPageByUrl' in k and '/catalog/' in k:
        try: pg = jl(A[k]); d = pg['dynamicContent']['data']; tmpl.setdefault(d['sectionId'], pg)
        except Exception: pass
FX = os.path.join(API, '_fidx.json'); X = json.load(open(FX, encoding='utf-8'))
TR = dict(zip('абвгдеёжзийклмнопрстуфхцчшщъыьэюя', ['a','b','v','g','d','e','e','zh','z','i','y','k','l','m','n','o','p','r','s','t','u','f','kh','ts','ch','sh','sch','','y','','e','yu','ya']))
def slug(s): s = ''.join(TR.get(c, c) for c in s.lower()); return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', s)).strip('-')[:60]
site_keys = {key(v['name']) for v in X['items'].values()} | seen_keys
SKN = collections.defaultdict(list)
for i2, v2 in X['items'].items(): SKN[key(v2['name'])].append(i2)
fam = collections.OrderedDict()
for m, r in PR.items(): fam.setdefault(key(m), []).append(m)
os.makedirs(os.path.join(FSU, 'upload/als-1c/catalog/products/_price'), exist_ok=True)
nid = 990000; miss_rows = []
for k, models in fam.items():
    if k in site_keys or not k: continue
    if k in SAME: miss_rows.append([models[0], PR[models[0]]['sheet'], 'есть на сайте как «%s»' % SAME[k]]); continue
    m0 = models[0]; r0 = PR[m0]; sec = 289 if PARTS.search(m0) else SECT.get(r0['sheet'], 131); sc = secs.get(sec) or secs[131]
    nid += 1; code = 'p-' + slug(m0); name = re.sub(r'\s+', ' ', m0)
    photos = []
    im = IMG.get(m0) or next((IMG[x] for x in models if x in IMG), None)
    if im is not None:
        try:
            b = im._data(); ext = 'png' if b[:4] == b'\x89PNG' else 'jpg'; rel = 'upload/als-1c/catalog/products/_price/%s.%s' % (code, ext)
            open(os.path.join(FSU, rel), 'wb').write(b)
            from PIL import Image; w, h = Image.open(io.BytesIO(b)).size
            photos = [{'src': '/fsu/' + rel, 'h': h, 'w': w, 'size': len(b), 'alt': name}]
        except Exception as e: print('фото', m0, e, file=sys.stderr)
    noms = NK.get(k, []); agg = {f: None for f in FIELDS}; vars_ = set()
    for nm in noms:
        for f in FIELDS: agg[f] = agg[f] or top(NOM[nm], f)
        vars_ |= NOM[nm]['vars']
    ch = []; gv = []
    for nm, f1, f2, ic in (('Ширина', 'Ширина min, мм', 'Ширина max, мм', 'width'), ('Глубина', 'Глубина min, мм', 'Глубина max, мм', 'depth'), ('Высота', 'Высота min, мм', 'Высота max, мм', 'height')):
        lo, hi = agg[f1], agg[f2]
        if lo or hi: gv.append({'name': nm, 'value': (mm(lo) + '–' + mm(hi) if lo and hi and lo != hi else mm(hi or lo)) + '&nbsp;мм', 'icon': ic})
    if agg['Вес, кг']: gv.append({'name': 'Вес', 'value': kg(agg['Вес, кг']) + '&nbsp;кг'})
    if gv: ch.append({'title': 'Габариты', 'values': gv})
    gu = [{'name': nm, 'value': mm(agg[f]) + '&nbsp;мм', 'icon': ic} for nm, f, ic in (('Ширина', 'Упаковка: ширина, мм', 'width'), ('Глубина', 'Упаковка: глубина, мм', 'depth'), ('Высота', 'Упаковка: высота, мм', 'height')) if agg[f]]
    if agg['Упаковка: вес, кг']: gu.append({'name': 'Вес', 'value': kg(agg['Упаковка: вес, кг']) + '&nbsp;кг'})
    if gu: ch.append({'title': 'Упаковка', 'values': gu})
    krs = set(); [krs.update(PR[m]['krat']) for m in models]
    if krs: ch.append({'title': 'Поставка', 'values': [{'name': 'Кратность (в упаковке)', 'value': ' / '.join(sorted(krs)) + '&nbsp;шт'}]})
    ex = collections.defaultdict(set)
    for m in models:
        for rr in PR[m]['rows']:
            for c, x in rr.items(): ex[c].add(x)
    gi = [{'name': c, 'value': ', '.join(sorted(ex[c]))[:400]} for c in COLS.values() if ex.get(c)]
    if len(models) > 1: gi.insert(0, {'name': 'Модели в прайсе', 'value': '; '.join(models)[:400]})
    if vars_: gi.append({'name': 'Вариантов в 1С', 'value': str(len(vars_))})
    if gi: ch.append({'title': 'Исполнения', 'values': gi})
    pg = json.loads(json.dumps(tmpl.get(sec) or tmpl.get(131)))
    pg['dynamicContent']['data'] = {'id': nid, 'code': code, 'name': name, 'sectionId': sec, 'articul': '', 'barcode': '',
        'description': '<p>Модель есть в прайс-листе %s, на сайте fabrikant.su её карточки пока нет. Карточка собрана по прайсу и выгрузке 1С от %s%s.</p>' % (DATE_P, DATE_N, '; фото — из прайс-листа' if photos else '; фото нет'),
        'heightMin': agg['Высота min, мм'], 'heightMax': agg['Высота max, мм'], 'depthMax': agg['Глубина max, мм'], 'widthMax': agg['Ширина max, мм'],
        'seo': {'title': name}, 'characteristics': ch, 'features': {'id': 0, 'description': '', 'items': []}, 'photos': photos,
        'parentSections': [{k2: sc[k2] for k2 in sc if k2 in ('id', 'name', 'code', 'dl', 'lm', 'rm', 'icon', 'seo')}]}
    A['/api/v1/?action=blockPage.getPageByUrl&url=/catalog/%s/%s&lang=ru' % (sc['code'], code)] = jw(pg)
    A['/api/v1/?action=products.getSimilarItems&id=%d&limit=5&lang=ru' % nid] = jw([])
    X['items'][str(nid)] = {'id': nid, 'code': code, 'name': name, 'sectionId': sec, 'photos': photos}
    X['order'].append(nid); X['v'].setdefault('miblock-section-id', {}).setdefault(str(sec), []).append(nid)
    rep['added'].append([name, sc['name'], '/catalog/%s/%s' % (sc['code'], code), 'фото есть' if photos else 'без фото', len(ch)])
    near = [X['items'][str(i2)]['name'] for kk in difflib.get_close_matches(k, list(SKN), n=2, cutoff=0.7) for i2 in SKN[kk][:1]]
    miss_rows.append([name, r0['sheet'], 'добавлена карточка в копию: /catalog/%s/%s' % (sc['code'], code), re.sub(r'<[^>]+>|&nbsp;', ' ', ', '.join(near))])
# списки разделов, «Все товары» и фильтры — из индекса (там и новые карточки); «Популярно» (rand) — как было
for k in [k for k in A if 'getItemsShortByFilter' in k and 'rand=' not in k]: del A[k]
json.dump(X, open(FX + '.tmp', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); os.replace(FX + '.tmp', FX)
H = H[:a0] + json.dumps(A, ensure_ascii=False) + H[a1:]
open(IX + '.tmp', 'w', encoding='utf-8').write(H); os.replace(IX + '.tmp', IX)
os.makedirs(AS, exist_ok=True)
json.dump(rep, open(os.path.join(AS, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
import csv
with open(os.path.join(AS, 'нет_на_сайте.csv'), 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f, delimiter=';'); w.writerow(['Модель (прайс %s)' % DATE_P, 'Раздел прайса', 'Что сделано', 'Проверить: похожая карточка на сайте']); w.writerows(miss_rows)
print(json.dumps({'карточек сайта': rep['site_cards'], 'дополнено': rep['enriched'], 'без данных 1С/прайса': len(rep['no_1c']), 'добавлено': len(rep['added']),
                  'расхождений веса': len(rep['mismatch'])}, ensure_ascii=False))
