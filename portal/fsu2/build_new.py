#!/usr/bin/env python3
"""Сотрудник6 каталог techfabrikant.ru/fsu/ (Т. В. 21.11.2026: «мне нужен новый сайт тут /fsu/, пока начнём с каталога»; главная — вариант B «По пространствам»;
в каждой карточке 5–7 фото + 1–2 в интерьере; недостающие ракурсы и интерьеры — ИИ, с мелкой подписью «визуализация»).
Вход: копия сайта (build/fsu: _api, _fidx, страницы, в т. ч. p-* и k-*), work/fsu/assort/photo_gap.json, ИИ-снимки work/fsu/ai/<код>/<вид>.png.
Выход: work/fsu2/out/ — только новые файлы каталога (n/…) и index.html с маршрутизатором; остальные страницы копии (компания, проекты, podbor,
документы) остаются как есть — их кладёт fsu_build_new.py, собирая fsu.<время> = копия + out/.
Повторный запуск подхватывает новые ИИ-снимки; картинки кэшируются в work/fsu2/cache (по пути, размеру и времени файла).
  python3 build_new.py [--base /home/claude/build/fsu] [--out work/fsu2/out]"""
import os, re, sys, json, html, hashlib, shutil, argparse, concurrent.futures as CF
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument('--base', default='/home/claude/build/fsu'); ap.add_argument('--out', default=os.path.join(HERE, 'out'))
ap.add_argument('--jobs', type=int, default=8); O = ap.parse_args()
BASE = os.path.realpath(O.base); OUT = O.out; CACHE = os.path.join(HERE, 'cache'); FSU = '/home/claude/fabrika/work/fsu'
AI = os.path.join(FSU, 'ai'); GAP = json.load(open(os.path.join(FSU, 'assort', 'photo_gap.json'), encoding='utf-8'))
# старая оболочка копии: после первой замены index.html — маршрутизатор, а оболочка лежит в old.html
SHELL = os.path.join(BASE, 'old.html') if os.path.exists(os.path.join(BASE, 'old.html')) else os.path.join(BASE, 'index.html')
SH = open(SHELL, encoding='utf-8').read(); A = json.JSONDecoder().raw_decode(SH[SH.index('var A=') + 6:])[0]
def J(k): return json.load(open(os.path.join(BASE, '_api', A[k] + '.json'), encoding='utf-8'))
def K(sub): return next(k for k in A if sub in k)
X = json.load(open(os.path.join(BASE, '_api', '_fidx.json'), encoding='utf-8')); FV = X.get('v') or {}
clean = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', str(s or ''))).replace('\xa0', ' ')).strip()

# ---------- данные ----------
F = J(K('products.getFilter&lang=ru')); LAB = {i['code']: {s['code']: clean(s['text']) for s in i.get('selectValues', [])} for i in F['inputs']}
tags = {}
for fc in ('mp-purpose', 'lp-materials', 'mp-collection'):
    for v, ids in (FV.get(fc) or {}).items():
        for i in ids: tags.setdefault(int(i), {}).setdefault(fc, []).append(LAB.get(fc, {}).get(v, v))
POP = {int(i) for i in (FV.get('mp-popular') or {}).get('1', [])}
SECS = {s['id']: s for s in J(K('products.getSections'))}
STORES = [{'id': g.get('id'), 'name': clean(g.get('name'))} for g in J(K('address.getStructuredItems'))]
PAGE = {}
for k, h in A.items():
    if 'getPageByUrl&url=/catalog/' in k and os.path.exists(os.path.join(BASE, '_api', h + '.json')):
        try: d = (json.load(open(os.path.join(BASE, '_api', h + '.json'), encoding='utf-8')).get('dynamicContent') or {}).get('data')
        except Exception: continue
        if isinstance(d, dict) and d.get('code'): PAGE[d['code']] = d
SIM = {}
for k in A:
    m = re.search(r'getSimilarItems&id=(\d+)', k)
    if m:
        try: s = J(k); s = s.get('items', s) if isinstance(s, dict) else s; SIM[int(m.group(1))] = [int(x['id']) for x in (s or []) if x.get('id')]
        except Exception: pass
ITEMS = [i for i in X['items'].values() if i.get('code')]; BYID = {int(i['id']): i for i in ITEMS}

# ---------- новая структура: группы (тип) → подразделы; пространства ----------
GROUPS = [  # код, название, разделы копии, подразделы [(код, название, проверка)]
    ('kresla', 'Кресла', [117], [('rukovoditelya', 'Руководителя', ['для руководителя']), ('kompyuternye', 'Компьютерные', ['компьютерное']),
                                 ('operatorskie', 'Операторские и для кассиров', ['для кассиров', '~оператор']), ('posetiteley', 'Для посетителей и конференц-зала', ['для посетителей', 'конференц-зал']),
                                 ('igrovye', 'Игровые', ['игровые', '~игров']), ('detskie', 'Детские', ['для детей', '~детск'])]),
    ('stulya', 'Стулья', [131, 321], [('barnye', 'Барные и полубарные', ['барные', '~бар']), ('skladnye', 'Складные и штабелируемые', ['~склад', '~штабел']),
                                     ('derevyannye', 'На деревянном каркасе', ['#321', '~дерев', '~венск', '~ wd', '$derevo']), ('uchenicheskie', 'Ученические', ['учебное', 'школа', '~учен']),
                                     ('kafe', 'Для кафе и ресторанов', ['в кафе', 'HoReCa', 'в ресторан']), ('ofisnye', 'Имя2 и для посетителей', ['для офиса', 'для посетителей', 'для бизнеса', '*'])]),
    ('myagkaya-mebel', 'Мягкая мебель', [133], [('divany', 'Диваны', ['~диван']), ('pufy', 'Пуфы и банкетки', ['~пуф', '~банкет']),
                                               ('moduli', 'Модульные системы', ['~модул', '~секци', '~угл']), ('kresla', 'Кресла', ['~кресл'])]),
    ('stoly', 'Столы и основания', [132], []),
    ('zaly', 'Для залов и аудиторий', [140], [('teatralnye', 'Театральные кресла', ['~театр']), ('na-balke', 'Секции на балке', ['~балк', '~секци', '~мест']),
                                              ('auditornye', 'Аудиторные', ['~аудитор']), ('chasti', 'Комплектующие секций', ['~накладк', '~подлокотн', '~опора', '~столик', '~сиденье'])]),
    ('medicina', 'Медицина и лаборатории', [320], [('stulya', 'Стулья и табуреты', ['~стул', '~табур', '~хокер', '~сфер', '~мяч']), ('kushetki', 'Кушетки, банкетки, скамьи', ['~кушет', '~банкет', '~скам', '~кроват']),
                                                ('myagkaya', 'Мягкая мебель для холлов', ['~диван', '~модул', '~пуф', '~угл', '~сектор', '~мест']), ('kresla', 'Кресла', ['~кресл', '*'])]),
    ('detskaya-i-shkolnaya', 'Детская и школьная', [135, 138], [('detskaya', 'Детская мебель', ['#135']), ('shkolnaya', 'Школьная мебель', ['#138'])]),
    ('aksessuary', 'Аксессуары', [134, 136, 137], [('veshalki', 'Вешалки', ['#134']), ('urny', 'Урны', ['#136']), ('banketki', 'Банкетки и кушетки', ['#137'])]),
    ('materialy', 'Ткани и материалы', [139], []),
    ('komplektuyushchie', 'Комплектующие', [289], []),
]
SEC2G = {s: g[0] for g in GROUPS for s in g[2]}
OLDSEC = {SECS[s]['code']: SEC2G.get(s) for s in SECS if s in SEC2G}   # старый код раздела → новая группа
SPACES = [('ofis', 'Имя2', ['для офиса', 'для руководителя', 'компьютерное', 'конференц-зал', 'для посетителей', 'для кассиров', 'для бизнеса'], []),
          ('horeca', 'Кафе, рестораны, отели', ['HoReCa', 'в кафе', 'в ресторан', 'в отель', 'барные'], []),
          ('dom', 'Дом', ['для дома', 'игровые'], []), ('shkoly', 'Школы и аудитории', ['учебное', 'школа', 'в аудиторию', 'для детей'], [138, 135]),
          ('medicina', 'Медицина и лаборатории', ['в лабораторию'], [320]), ('zaly-ozhidaniya', 'Залы ожидания и театры', ['для холла'], [140, 137])]


def hit(rule, it, pt):
    if rule == '*': return False
    if rule.startswith('$'): return rule[1:] in it.get('_fk', [])
    if rule.startswith('#'): return it['sectionId'] == int(rule[1:])
    if rule.startswith('~'): return rule[1:] in it['_nm']
    return rule in pt


# признаки для фильтров: из «Исполнений», характеристик и описания
RX = {'obivka': [('tkan', 'Ткань', r'ткан|рогож|велюр|флок|шенил|микрофиб|жаккард|сканди|hugo|teddy'), ('ekokozha', 'Экокожа', r'экокож|иск\.?\s*кож|искусств\w* кож|кожзам|eco[\s-]|\beco\b|\bdo\b|\bpu\b'),
                   ('kozha', 'Кожа', r'натуральн\w* кож|\bкожа\b(?!\s*зам)'), ('setka', 'Сетка', r'сетк|mesh|\btw\b|\bdw\b'), ('plastik', 'Пластик', r'пластик|полипроп')],
      'mekhanizm': [('piastra', 'Пиастра', r'пиастр|газлифт'), ('topgan', 'Топ-ган', r'топ[-\s]?ган|top[-\s]?gun|\bтг\b'), ('multiblok', 'Мультиблок', r'мультиблок|синхрон'),
                    ('pvm', 'ПВМ / постоянный контакт', r'\bпвм\b|постоянн\w* контакт')],
      'karkas': [('khrom', 'Хром', r'хром|\bch\b|\bchrome\b'), ('poroshok', 'Порошковая окраска', r'порошк|окраск|\bbl\b|\bal\b|\bgr\b'), ('derevo', 'Дерево', r'дерев|бук|берез|массив|фанер'),
                 ('plastik', 'Пластик', r'пластик|нейлон|полиамид')]}
LBL = {k: {c: n for c, n, _ in v} for k, v in RX.items()}


def feats(it, d):
    ex = ' '.join(clean(v.get('name')) + ' ' + clean(v.get('value')) for g in (d.get('characteristics') or []) for v in g.get('values', []))
    t = (ex + ' ' + clean(d.get('description'))[:600] + ' ' + clean(it.get('name'))).lower()
    return {k: [c for c, _, r in v if re.search(r, t)] for k, v in RX.items()}


def num(v):
    m = re.search(r'\d+(?:[.,]\d+)?', clean(v)); return round(float(m.group(0).replace(',', '.'))) if m else None


# ---------- картинки: webp 1600 и миниатюра 480 (кэш) ----------
for _d in ('i', 't', 'h'): os.makedirs(os.path.join(CACHE, _d), exist_ok=True)


def key(p):
    st = os.stat(p); return hashlib.md5(('%s|%d|%d' % (os.path.realpath(p), st.st_size, int(st.st_mtime))).encode()).hexdigest()[:16]


def dhash(im):   # 64 бит: повторы одного и того же снимка в галерее (разные имена/размеры) — по сходству
    g = im.convert('L').resize((9, 8)); px = list(g.get_flattened_data() if hasattr(g, 'get_flattened_data') else g.getdata())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


def conv(p):
    k = key(p); a, b, hf = os.path.join(CACHE, 'i', k + '.webp'), os.path.join(CACHE, 't', k + '.webp'), os.path.join(CACHE, 'h', k)
    if os.path.exists(a) and os.path.exists(b):
        if not os.path.exists(hf): open(hf, 'w').write(str(dhash(Image.open(b))))
        return k, int(open(hf).read())
    try:
        im = Image.open(p); im.load()
        if im.mode in ('P', 'LA', 'RGBA', 'PA') or 'transparency' in im.info:
            im = im.convert('RGBA'); bg = Image.new('RGB', im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[3]); im = bg
        else: im = im.convert('RGB')
        bb = Image.eval(im.convert('L'), lambda v: 255 if v < 247 else 0).getbbox()   # белые поля вокруг предмета — срезать, оставив 4 %
        if bb:
            pad = int(max(im.size) * .04); bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad))
            if (bb[2] - bb[0]) * (bb[3] - bb[1]) < .97 * im.width * im.height: im = im.crop(bb)
        f = im.copy(); f.thumbnail((1600, 1600)); f.save(a + '.tmp', 'WEBP', quality=80, method=5); os.replace(a + '.tmp', a)
        t = im.copy(); t.thumbnail((480, 480)); t.save(b + '.tmp', 'WEBP', quality=76, method=5); os.replace(b + '.tmp', b)
        h = dhash(t); open(hf, 'w').write(str(h)); return k, h
    except Exception as e:
        return None, str(e)


def fpath(src):   # путь копии /fsu/upload/... → файл
    if not src: return None
    if src.startswith('/home/'): return src if os.path.exists(src) else None
    p = os.path.join(BASE, src.replace('/fsu/', '', 1).lstrip('/')); return p if os.path.exists(p) else None


AIV = [('side', 'сбоку'), ('back', 'сзади'), ('rear34', 'три четверти сзади'), ('front34r', 'три четверти спереди'), ('detail', 'деталь')]
gal = {}; need = set()
for it in ITEMS:
    c = it['code']; d = PAGE.get(c, {}); g = GAP.get(c, {}); L = []; seen = set()
    def add(p, ai=False, kind='photo'):
        if not p: return
        p = os.path.realpath(p)
        if p in seen: return
        seen.add(p); L.append({'p': p, 'ai': ai, 'k': kind})
    for ph in (d.get('photos') or it.get('photos') or []): add(fpath(ph.get('src')))
    for p in g.get('studio', []) + g.get('detail_files', []): add(fpath(p))
    for v, _ in AIV: add(os.path.join(AI, c, v + '.png') if os.path.exists(os.path.join(AI, c, v + '.png')) else None, True, 'angle')
    for p in g.get('interior', []): add(fpath(p), False, 'interior')
    for v in ('interior', 'interior2'): add(os.path.join(AI, c, v + '.png') if os.path.exists(os.path.join(AI, c, v + '.png')) else None, True, 'interior')
    gal[c] = L; need.update(x['p'] for x in L)
for f in ('fsu_photo_gap',): pass
K2 = {}; DH = {}; bad = []
with CF.ProcessPoolExecutor(O.jobs) as ex:
    for p, (k, e) in zip(sorted(need), ex.map(conv, sorted(need), chunksize=8)):
        if k: K2[p] = k; DH[p] = e
        else: bad.append((p, e))
DUPD = int(os.environ.get('FSU_DUPD', '3')); dups = 0
for c, L in gal.items():   # повторы: расстояние Хэмминга ≤ 5 из 64 — оставляем первый (реальные фото идут раньше ИИ)
    keep = []
    for x in L:
        h = DH.get(x['p'])
        if h is not None and any(bin(h ^ DH[y['p']]).count('1') <= DUPD for y in keep if DH.get(y['p']) is not None): dups += 1; continue
        keep.append(x)
    gal[c] = keep

# ---------- сборка out/ ----------
shutil.rmtree(OUT, ignore_errors=True); N = os.path.join(OUT, 'n'); os.makedirs(os.path.join(N, 'd', 'p')); os.makedirs(os.path.join(N, 'i', 't'))
used = set()
def img(p):
    k = K2.get(p)
    if not k: return None
    if k not in used:
        used.add(k)
        for sub, dst in (('i', os.path.join(N, 'i', k + '.webp')), ('t', os.path.join(N, 'i', 't', k + '.webp'))):
            try: os.link(os.path.join(CACHE, sub, k + '.webp'), dst)
            except OSError: shutil.copy2(os.path.join(CACHE, sub, k + '.webp'), dst)
    return k


idx = []; cards = {}
for it in ITEMS:
    c = it['code']; d = PAGE.get(c, {}); it['_nm'] = clean(it['name']).lower(); iid = int(it['id'])
    gcode = SEC2G.get(it['sectionId']) or 'komplektuyushchie'; G = next(x for x in GROUPS if x[0] == gcode)
    pt = (tags.get(iid) or {}).get('mp-purpose', [])
    fe = feats(it, d); it['_fk'] = fe['karkas']
    subs = [s[0] for s in G[3] if any(hit(r, it, pt) for r in s[2])]
    if not subs and gcode == 'kresla':   # без меток назначения: по опоре и высоте спинки
        t = ' '.join(clean(v.get('value')) + ' ' + clean(v.get('name')) for g0 in (d.get('characteristics') or []) for v in g0.get('values', [])).lower()
        hm = num(d.get('heightMax')) or 0
        subs = ['posetiteley'] if re.search(r'полоз|ножк', t) and not re.search(r'ролик|крестовин|пиастр|топ-ган|газлифт', t) else (['rukovoditelya'] if hm >= 1180 else ['kompyuternye'])
    if not subs: subs = [s[0] for s in G[3] if '*' in s[2]]
    sub = subs[0] if subs else ('drugie' if G[3] else '')
    gl = [{'k': img(x['p']), 'ai': x['ai'], 't': x['k']} for x in gal[c]]; gl = [x for x in gl if x['k']]
    photos = [x for x in gl if x['t'] != 'interior']; inter = [x for x in gl if x['t'] == 'interior']
    h = [num(d.get('heightMin')) or None, num(d.get('heightMax')) or None]
    w = num(d.get('widthMax')) or num(d.get('widthMin')); dp = num(d.get('depthMax')) or num(d.get('depthMin'))
    pur = pt; mat = (tags.get(iid) or {}).get('lp-materials', [])
    sp = [s[0] for s in SPACES if set(pur) & set(s[2]) or it['sectionId'] in s[3]]
    url = '/fsu/catalog/%s/%s%s' % (gcode, (sub + '/') if sub else '', c)
    e = {'c': c, 'n': clean(it['name']), 'g': gcode, 's': sub, 'ss': subs, 'u': url, 'i': photos[0]['k'] if photos else (inter[0]['k'] if inter else None),
         'i2': photos[1]['k'] if len(photos) > 1 else None, 'np': len(photos), 'nai': sum(1 for x in gl if x['ai']), 'ni': len(inter),
         'hit': iid in POP or bool(d.get('hit')), 'pur': pur, 'mat': mat, 'sp': sp, 'f': fe, 'h': h, 'w': w, 'dp': dp,
         'st': len(d.get('inStores') or []), 'q': ' '.join([clean(it['name']), clean(d.get('articul')), ' '.join(pur), ' '.join(mat), G[1]]).lower().replace('ё', 'е')}
    idx.append(e)
    ch = [{'t': clean(g0.get('title')), 'v': [[clean(v.get('name')), clean(v.get('value'))] for v in g0.get('values', [])]} for g0 in (d.get('characteristics') or [])]
    ft = [{'n': clean(f.get('name')), 'i': img(fpath((f.get('image') or {}).get('src'))) if f.get('image') else None} for f in ((d.get('features') or {}).get('items') or [])]
    desc = re.split(r'По прайсу', clean(d.get('description')))[0].strip()
    sim = [BYID[s]['code'] for s in SIM.get(iid, []) if s in BYID]
    cards[c] = {'c': c, 'n': e['n'], 'art': clean(d.get('articul')), 'desc': desc, 'ph': photos, 'in': inter, 'ch': ch, 'ft': ft, 'st': d.get('inStores') or [], 'sim': sim}
# похожие: из копии, иначе — тот же подраздел (хиты первыми)
for e in idx:
    cd = cards[e['c']]
    if len(cd['sim']) < 6:
        more = [x['c'] for x in sorted(idx, key=lambda x: (not x['hit'], -x['np'])) if x['g'] == e['g'] and x['s'] == e['s'] and x['c'] != e['c'] and x['c'] not in cd['sim'] and x['i']]
        cd['sim'] += more[:8 - len(cd['sim'])]
    json.dump(cd, open(os.path.join(N, 'd', 'p', e['c'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
groups = []
for gcode, gname, secs, subs in GROUPS:
    its = [e for e in idx if e['g'] == gcode]
    cov = next((e['i'] for e in its if e['hit'] and e['i']), next((e['i'] for e in its if e['i']), None))
    ss = [{'c': s[0], 'n': s[1], 'k': sum(1 for e in its if s[0] in e['ss'])} for s in subs]
    if subs and any(not e['ss'] for e in its): ss.append({'c': 'drugie', 'n': 'Другие', 'k': sum(1 for e in its if not e['ss'])})
    groups.append({'c': gcode, 'n': gname, 'k': len(its), 'i': cov, 'subs': [s for s in ss if s['k']], 'sec': secs})
spaces = []
for code, name, tg, sc in SPACES:
    its = sorted([e for e in idx if code in e['sp'] and e['i']], key=lambda e: (not e['hit'], -e['np']))
    spaces.append({'c': code, 'n': name, 'k': sum(1 for e in idx if code in e['sp']), 'i': [e['i'] for e in its[:3]]})
FL = {'pur': sorted({p for e in idx for p in e['pur']}), 'mat': sorted({p for e in idx for p in e['mat']}), 'lbl': LBL}
meta = {'v': X.get('t') or '', 'total': len(idx), 'groups': groups, 'spaces': spaces, 'stores': STORES, 'fl': FL,
        'old': OLDSEC, 'hits': [e['c'] for e in sorted(idx, key=lambda e: -e['np']) if e['hit'] and e['i']][:16]}
json.dump({'meta': meta, 'items': idx}, open(os.path.join(N, 'd', 'idx.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

# ---------- оболочка: app.css, app.js, back.html, index.html (маршрутизатор) ----------
for f in ('app.css', 'app.js', 'boot.js'): shutil.copy2(os.path.join(HERE, 'site', f), os.path.join(N, f))
shutil.copy2(os.path.join(FSU, 'fsu_back.html'), os.path.join(N, 'back.html'))
logo = open(os.path.join(BASE, 'f/media/brand/logo-black.svg'), encoding='utf-8').read()
logo = re.sub(r'fill="#000(?:000)?"', 'fill="currentColor"', logo)
logo = re.sub(r'<svg([^>]*?)\swidth="(\d+)"\s+height="(\d+)"', lambda m: '<svg class="logo" role="img" aria-label="Фабрикант" viewBox="0 0 %s %s"%s' % (m.group(2), m.group(3), m.group(1)), logo, count=1)
open(os.path.join(N, 'logo.svg'), 'w', encoding='utf-8').write(logo)
ver = hashlib.md5(b''.join(open(os.path.join(N, f), 'rb').read() for f in ('app.css', 'app.js', 'boot.js')) + open(os.path.join(N, 'd', 'idx.json'), 'rb').read()).hexdigest()[:10]
ROUTE = r'^\/fsu\/(?:$|index\.html$|catalog(?:\/|$)|resheniya(?:\/|$)|poisk(?:\/|$))'
early = ('<script>/* 21.11.2026: новый каталог /fsu/ — каталог, решения, поиск и главная открываются новой витриной; остальные страницы — прежней копией */'
         '(function(){var R=/%s/,p=location.pathname;window.FSU_NEW_V="%s";'
         'if(R.test(p)){document.write(\'<script src="/fsu/n/boot.js?v=%s"><\\/script><plaintext hidden style="display:none">\');return}'
         'function w(f){return function(s,t,u){try{var a=new URL(u,location.href);if(a.origin===location.origin&&R.test(a.pathname)){location.assign(a.href);return}}catch(e){}return f.apply(this,arguments)}}'
         'history.pushState=w(history.pushState);history.replaceState=w(history.replaceState)})()</script>') % (ROUTE, ver, ver)
sh = re.sub(r'<script>/\* 21\.11\.2026: новый каталог.*?</script>', '', SH, flags=re.S)
sh = sh.replace('<head>', '<head><meta charset="utf-8">' + early, 1)
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(sh)
open(os.path.join(OUT, 'old.html'), 'w', encoding='utf-8').write(re.sub(r'<script>/\* 21\.11\.2026: новый каталог.*?</script>', '', SH, flags=re.S))
rep = {'dups': dups, 'cards': len(idx), 'images': len(used), 'bad_images': len(bad), 'ai_images': sum(e['nai'] for e in idx), 'cards_ge5': sum(1 for e in idx if e['np'] >= 5),
       'cards_inter': sum(1 for e in idx if e['ni']), 'groups': {g['c']: g['k'] for g in groups}, 'ver': ver}
json.dump({**rep, 'bad': bad[:50]}, open(os.path.join(HERE, 'build_report.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(json.dumps(rep, ensure_ascii=False))
