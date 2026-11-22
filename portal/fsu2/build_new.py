#!/usr/bin/env python3
"""Сотрудник6 каталог techfabrikant.ru/fsu/ (Т. В. 21.11.2026: «мне нужен новый сайт тут /fsu/, пока начнём с каталога»; главная — вариант B «По пространствам»;
в каждой карточке 5–7 фото + 1–2 в интерьере; недостающие ракурсы и интерьеры — ИИ, с мелкой подписью «визуализация»).
Вход: копия сайта (build/fsu: _api, _fidx, страницы, в т. ч. p-* и k-*), work/fsu/assort/photo_gap.json, ИИ-снимки work/fsu/ai/<код>/<вид>.png.
Выход: work/fsu2/out/ — только новые файлы каталога (n/…) и index.html с маршрутизатором; остальные страницы копии (компания, проекты, podbor,
документы) остаются как есть — их кладёт fsu_build_new.py, собирая fsu.<время> = копия + out/.
Повторный запуск подхватывает новые ИИ-снимки; картинки кэшируются в work/fsu2/cache (по пути, размеру и времени файла).
  python3 build_new.py [--base /home/claude/build/fsu] [--out work/fsu2/out]"""
import glob, os, re, sys, json, html, hashlib, shutil, argparse, concurrent.futures as CF
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(); ap.add_argument('--base', default='/home/claude/build/fsu'); ap.add_argument('--out', default=os.path.join(HERE, 'out'))
ap.add_argument('--jobs', type=int, default=8); O = ap.parse_args()
BASE = os.path.realpath(O.base); OUT = O.out; CACHE = os.path.join(HERE, 'cache'); FSU = '/home/claude/fabrika/work/fsu'
AI = os.path.join(FSU, 'ai'); INFO = json.load(open(os.path.join(FSU, 'assort', 'info_all.json'), encoding='utf-8')) if os.path.exists(os.path.join(FSU, 'assort', 'info_all.json')) else {}; REJ = json.load(open(os.path.join(FSU, 'ai', '_reject.json'), encoding='utf-8')) if os.path.exists(os.path.join(FSU, 'ai', '_reject.json')) else {}; GAP = json.load(open(os.path.join(FSU, 'assort', 'photo_gap.json'), encoding='utf-8'))
# старая оболочка копии: после первой замены index.html — маршрутизатор, а оболочка лежит в old.html
SHELL = os.path.join(BASE, 'old.html') if os.path.exists(os.path.join(BASE, 'old.html')) else os.path.join(BASE, 'index.html')
SH = open(SHELL, encoding='utf-8').read(); A = json.JSONDecoder().raw_decode(SH[SH.index('var A=') + 6:])[0]
def J(k): return json.load(open(os.path.join(BASE, '_api', A[k] + '.json'), encoding='utf-8'))
def K(sub): return next(k for k in A if sub in k)
X = json.load(open(os.path.join(BASE, '_api', '_fidx.json'), encoding='utf-8')); FV = X.get('v') or {}
_A = os.path.join(FSU, 'assort')
PT = json.load(open(os.path.join(_A, 'price_tier.json'), encoding='utf-8')) if os.path.exists(os.path.join(_A, 'price_tier.json')) else {}
PR = json.load(open(os.path.join(_A, 'prais_rows.json'), encoding='utf-8')) if os.path.exists(os.path.join(_A, 'prais_rows.json')) else []
COLS = json.load(open(os.path.join(_A, 'colors.json'), encoding='utf-8')) if os.path.exists(os.path.join(_A, 'colors.json')) else {}
OKNIGHT = {'katrin-kreslo', 'samba-box4-stul', 'chestermen-kreslo', 'metro-urna', 'kombi-urna', 'domik-urna', 'karandash-urna-213351698', 'opora-urna-statsionarnaya', 'zamok-urna', 'atlant-kreslo-1030986919', 'milan-kreslo'}
try: OKNIGHT |= set(json.load(open(os.path.join(FSU, 'assort', 'oknight.json'))))   # 22.11.2026: ночные интерьеры хитов (80% объёма), проверены Claude, Т. В. смотрит утром
except Exception: pass
DOCS = json.load(open(os.path.join(_A, 'docs.json'), encoding='utf-8')) if os.path.exists(os.path.join(_A, 'docs.json')) else {}
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
    ('stulya', 'Стулья', [131, 321], [('sektsii', 'Секции и многоместные', ['~местн', '~на раме', '~секци']), ('taburety', 'Табуреты', ['~табурет']), ('barnye', 'Барные и полубарные', ['барные', '~бар']), ('skladnye', 'Складные и штабелируемые', ['~склад', '~штабел']),
                                     ('derevyannye', 'На деревянном каркасе', ['#321', '~дерев', '~венск', '~ wd', '$derevo']), ('uchenicheskie', 'Ученические', ['учебное', 'школа', '~учен']),
                                     ('kafe', 'Для кафе и ресторанов', ['в кафе', 'HoReCa', 'в ресторан']), ('ofisnye', 'Имя2 и для посетителей', ['для офиса', 'для посетителей', 'для бизнеса', '*'])]),
    ('myagkaya-mebel', 'Мягкая мебель', [133], [('divany', 'Диваны', ['~диван', '~2-х мест', '~3-х мест']), ('pufy', 'Пуфы и банкетки', ['~пуф', '~банкет']),
                                               ('moduli', 'Модульные системы', ['~модул', '~секци', '~угл', '~угол']), ('kresla', 'Кресла', ['~кресл'])]),
    ('stoly', 'Столы и основания', [132], [('stoly', 'Столы', ['^stol']), ('podstolya', 'Подстолья и основания', ['^podst']), ('uchenicheskie', 'Ученические столы и каркасы', ['^uchen'])]),
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


TABLES_K = {'k-khab', 'k-eklat', 'k-marbl', 'k-glos', 'k-veyron', 'k-bayt', 'k-drop', 'k-ekstrim'}


def hit(rule, it, pt):
    if rule == '*': return False
    if rule.startswith('^'): return it.get('_tk') == rule[1:]
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
# 21.11.2026, Т. В.: «фото минимум 2К качеством, грузиться быстро на плохом интернете; бежевые обводки — убрать».
#   i2 — 2048 px (меньше — увеличение ×2 нейросетью FSRCNN, затем точная подгонка), m2 — 1024 px (телефон), t2 — 480 px (списки).
#   Фон студийного снимка: прозрачность — на белый; светлый однотонный фон по краям (кремовый, серый, желтоватый) — заливкой от краёв в чистый белый.
for _d in ('i2', 'm2', 't2', 'h'): os.makedirs(os.path.join(CACHE, _d), exist_ok=True)
try:
    import cv2, numpy as _np
    _SR = cv2.dnn_superres.DnnSuperResImpl_create(); _SR.readModel(FSU + '/FSRCNN_x2.pb'); _SR.setModel('fsrcnn', 2)
except Exception:
    _SR = None
BIG, MID, SM = 2048, 1024, 480


def up2(im):   # до 2048: Lanczos + лёгкая резкость (FSRCNN на 2 ядрах — 3–4 с на снимок, 2000 снимков — часы; разница на белом фоне незаметна)
    from PIL import ImageFilter
    r = min(BIG / max(im.size), 2.6)
    if r <= 1.05: return im
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))


def whiten(im):   # светлый нейтральный фон, связный с краем кадра (белый, серые плашки каталога) → чистый белый; предмет не трогаем
    a = _np.asarray(im.convert('RGB')).astype(_np.int16)
    lum = a.mean(axis=2); chroma = a.max(axis=2) - a.min(axis=2)
    cand = ((lum > 212) & (chroma < 12)).astype(_np.uint8)
    edge = _np.concatenate([cand[0], cand[-1], cand[:, 0], cand[:, -1]])
    if edge.mean() < .6: return im, False          # края не светлые и не нейтральные — интерьер, ткань или тёмный снимок: как есть
    if (lum > 250).mean() > .97: return im, False   # уже белый
    n, lab = cv2.connectedComponents(cand, connectivity=4)
    border = _np.unique(_np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])); border = border[border > 0]
    bgm = _np.isin(lab, border).astype(_np.float32)
    fg = 1 - bgm.mean()
    if fg < .14: return im, False                    # почти всё ушло бы в фон — светлый предмет (белое кресло): не трогать
    fgm = bgm < .5
    if fgm.any() and (lum[fgm] > 200).mean() > .45: return im, False   # сам предмет светлый (белый пластик, хром) — заливка съест его края
    bgm = cv2.GaussianBlur(bgm, (0, 0), 1.0)[:, :, None]   # мягкий край, без «ореола»
    out = a * (1 - bgm) + 255 * bgm
    return Image.fromarray(out.clip(0, 255).astype(_np.uint8)), True


def key(p):
    st = os.stat(p); return hashlib.md5(('%s|%d|%d' % (os.path.realpath(p), st.st_size, int(st.st_mtime))).encode()).hexdigest()[:16]


def dhash(im):   # 64 бит: повторы одного и того же снимка в галерее (разные имена/размеры) — по сходству
    g = im.convert('L').resize((9, 8)); px = list(g.get_flattened_data() if hasattr(g, 'get_flattened_data') else g.getdata())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


LITK = ('sun', 'moon', 'day', 'night')   # 21.11.2026, Т. В.: «Солнце/Луна» — товар под солнцем / под луной, офис днём / ночью
def LIT(p): return '/work/fsu/ai/' in p and os.path.basename(p)[:-4] in LITK


def conv(p):
    k = key(p) + 'v2'; a, m, b, hf = [os.path.join(CACHE, d, k + '.webp') for d in ('i2', 'm2', 't2')] + [os.path.join(CACHE, 'h', k)]
    if os.path.exists(a) and os.path.exists(m) and os.path.exists(b):
        if not os.path.exists(hf): open(hf, 'w').write(str(dhash(Image.open(b))))
        return k, int(open(hf).read())
    try:
        im = Image.open(p); im.load()
        if im.mode in ('P', 'LA', 'RGBA', 'PA') or 'transparency' in im.info:
            im = im.convert('RGBA'); bg = Image.new('RGB', im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[3]); im = bg
        else:
            im = im.convert('RGB')
            if '/infographic/' not in p and not LIT(p): im, _ = whiten(im)   # инфографика и кадры «Солнце/Луна» — свой фон: не трогаем
        bb = None if ('/infographic/' in p or LIT(p)) else Image.eval(im.convert('L'), lambda v: 255 if v < 247 else 0).getbbox()   # белые поля вокруг предмета — срезать, оставив 5 % (не у инфографики)
        if bb:
            pad = int(max(bb[2] - bb[0], bb[3] - bb[1]) * .05); bb = (max(0, bb[0] - pad), max(0, bb[1] - pad), min(im.width, bb[2] + pad), min(im.height, bb[3] + pad))
            if (bb[2] - bb[0]) * (bb[3] - bb[1]) < .97 * im.width * im.height: im = im.crop(bb)
        big = up2(im) if max(im.size) < BIG else im
        f = big.copy(); f.thumbnail((BIG, BIG), Image.LANCZOS); f.save(a + '.tmp', 'WEBP', quality=82, method=4); os.replace(a + '.tmp', a)
        f = im.copy() if max(im.size) >= MID else big.copy(); f.thumbnail((MID, MID), Image.LANCZOS); f.save(m + '.tmp', 'WEBP', quality=80, method=5); os.replace(m + '.tmp', m)
        t = im.copy(); t.thumbnail((SM, SM), Image.LANCZOS); t.save(b + '.tmp', 'WEBP', quality=78, method=5); os.replace(b + '.tmp', b)
        h = dhash(t); open(hf, 'w').write(str(h)); return k, h
    except Exception as e:
        return None, str(e)


def fpath(src):   # путь копии /fsu/upload/... → файл
    if not src: return None
    if src.startswith('/home/'): return src if os.path.exists(src) else None
    p = os.path.join(BASE, src.replace('/fsu/', '', 1).lstrip('/')); return p if os.path.exists(p) else None


AIV = [('side', 'сбоку'), ('back', 'сзади'), ('rear34', 'три четверти сзади'), ('front34r', 'три четверти спереди'), ('front34l', 'три четверти спереди слева'), ('detail', 'деталь')]
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
    # 21.11.2026, Т. В. («Катрин»: спинка сзади нарисована неверно): «три четверти сзади» ИИ путает — переносит строчку лицевой стороны на спинку;
    #   такие кадры не ставим совсем; отдельные неудачные кадры — в work/fsu/ai/_reject.json {"код": ["вид", …]}
    for v, _ in AIV:
        if v == 'rear34' or v in REJ.get(c, []): continue
        add(os.path.join(AI, c, v + '.png') if os.path.exists(os.path.join(AI, c, v + '.png')) else None, True, 'angle')
    for p in g.get('interior', []): add(fpath(p), False, 'interior')
    for v in ('interior', 'interior2'):
        if v in REJ.get(c, []): continue
        add(os.path.join(AI, c, v + '.png') if os.path.exists(os.path.join(AI, c, v + '.png')) else None, True, 'interior')
    for v in LITK:   # кадры тем: не в общую галерею — отдельно (сайт сам берёт свой под тему)
        if v in REJ.get(c, []): continue
        q = os.path.join(AI, c, v + '.png')
        if v == 'night' and c not in OKNIGHT: continue   # 22.11.2026, Т. В. («синий фон»): ночные кадры — только утверждённые по новым правилам
        if os.path.exists(q): add(q, True, v)
    for q in sorted(glob.glob(os.path.join(AI, c, 'col', '*.png'))): add(q, True, 'cv:' + os.path.basename(q)[:-4])   # фото исполнения по цвету (после ✅ Т. В.)
    for p in INFO.get(c, []): add(p, False, 'info')   # 21.11.2026, Т. В.: «где вся инфографика с FTP» — в галерею после фото и интерьеров
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
        if x['k'] in LITK or x['k'].startswith('cv:'): keep.append(x); continue   # кадры тем не сравниваем: они похожи на фото по замыслу
        h = DH.get(x['p'])
        if h is not None and any(bin(h ^ DH[y['p']]).count('1') <= DUPD for y in keep if y['k'] not in LITK and DH.get(y['p']) is not None): dups += 1; continue
        keep.append(x)
    gal[c] = keep

# ---------- сборка out/ ----------
shutil.rmtree(OUT, ignore_errors=True); N = os.path.join(OUT, 'n'); os.makedirs(os.path.join(N, 'd', 'p')); os.makedirs(os.path.join(N, 'i', 't')); os.makedirs(os.path.join(N, 'i', 'm'))
used = set()
def img(p):
    k = K2.get(p)
    if not k: return None
    if k not in used:
        used.add(k)
        for sub, dst in (('i2', os.path.join(N, 'i', k + '.webp')), ('m2', os.path.join(N, 'i', 'm', k + '.webp')), ('t2', os.path.join(N, 'i', 't', k + '.webp'))):
            try: os.link(os.path.join(CACHE, sub, k + '.webp'), dst)
            except OSError: shutil.copy2(os.path.join(CACHE, sub, k + '.webp'), dst)
    return k


idx = []; cards = {}
for it in ITEMS:
    c = it['code']; d = PAGE.get(c, {}); it['_nm'] = clean(it['name']).lower(); iid = int(it['id'])
    gcode = SEC2G.get(it['sectionId']) or 'komplektuyushchie'
    if gcode == 'komplektuyushchie' and re.search(r'подстол|основание стол', it['_nm']): gcode = 'stoly'   # 21.11.2026: подстолья и основания — к столам, не в комплектующие
    if re.search(r'^кресло\b|\bкресло$', it['_nm']) and gcode == 'stulya': gcode = 'kresla'
    # 22.11.2026, Т. В.: «куда-то делись все столы» — столы каталога 2025 (k-*) лежали в «Стульях», ученические каркасы и столешницы — в «Комплектующих»
    tk = None
    if c in TABLES_K or (c.startswith('k-') and re.search(r'столешниц', clean(json.dumps(d, ensure_ascii=False)).lower()) and not re.search(r'стул|табурет|кресл', it['_nm'])): tk = 'stol'
    elif re.search(r'подстол|основание .?стол|каркас для стола|каркас стола', it['_nm']) and not re.search(r'ученич', it['_nm']): tk = 'podst'
    elif re.search(r'стол[аеу]? ученич|столешниц.*ученич|ученич.*стол|каркас для стола ученич|столешница \+', it['_nm']): tk = 'uchen'
    if tk: gcode = 'stoly'; it['_tk'] = tk
    G = next(x for x in GROUPS if x[0] == gcode)
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
    lit = {x['t']: x['k'] for x in gl if x['t'] in LITK}; cvs = {x['t'][3:]: x['k'] for x in gl if x['t'].startswith('cv:')}; gl = [x for x in gl if x['t'] not in LITK and not x['t'].startswith('cv:')]
    photos = [x for x in gl if x['t'] not in ('interior', 'info')]; inter = [x for x in gl if x['t'] == 'interior']; infg = [x for x in gl if x['t'] == 'info']
    h = [num(d.get('heightMin')) or None, num(d.get('heightMax')) or None]
    w = num(d.get('widthMax')) or num(d.get('widthMin')); dp = num(d.get('depthMax')) or num(d.get('depthMin'))
    pur = pt; mat = (tags.get(iid) or {}).get('lp-materials', [])
    sp = [s[0] for s in SPACES if set(pur) & set(s[2]) or it['sectionId'] in s[3]]
    url = '/fsu/catalog/%s/%s%s' % (gcode, (sub + '/') if sub else '', c)
    e = {'c': c, 'n': clean(it['name']), 'g': gcode, 's': sub, 'ss': subs, 'u': url, 'i': photos[0]['k'] if photos else (inter[0]['k'] if inter else None),
         'i2': photos[1]['k'] if len(photos) > 1 else None, 'ia': bool((photos or inter) and (photos or inter)[0]['ai']), 'ia2': bool(len(photos) > 1 and photos[1]['ai']), 'ts': lit.get('sun'), 'tm': lit.get('moon'), 'np': len(photos), 'nai': sum(1 for x in gl if x['ai']), 'ni': len(inter),
         'hit': iid in POP or bool(d.get('hit')), 'pur': pur, 'mat': mat, 'sp': sp, 'f': fe, 'h': h, 'w': w, 'dp': dp,
         'st': len(d.get('inStores') or []), 'q': ' '.join([clean(it['name']), clean(d.get('articul')), ' '.join(pur), ' '.join(mat), G[1]]).lower().replace('ё', 'е')}
    idx.append(e)
    ch = [{'t': clean(g0.get('title')), 'v': [[clean(v.get('name')), clean(v.get('value'))] for v in g0.get('values', [])]} for g0 in (d.get('characteristics') or [])]
    ft = [{'n': clean(f.get('name')), 'i': img(fpath((f.get('image') or {}).get('src'))) if f.get('image') else None} for f in ((d.get('features') or {}).get('items') or [])]
    desc = re.split(r'По прайсу', clean(d.get('description')))[0].strip()
    sim = [BYID[s]['code'] for s in SIM.get(iid, []) if s in BYID]
    cards[c] = {'c': c, 'n': e['n'], 'art': clean(d.get('articul')), 'desc': desc, 'ph': photos, 'in': inter, 'inf': infg, 'th': lit, 'ch': ch, 'ft': ft, 'st': d.get('inStores') or [], 'sim': sim}
    # 22.11.2026, Т. В. (карточка А): все исполнения по прайсу 28.10 — цена и опции; документы/видео товара — assort/docs.json
    _pm = (PT.get(c) or {}).get('m')
    cards[c]['pr'] = [[r['p1'], {k.strip(): str(v).strip() for k, v in r['opt'].items() if str(v).strip() not in ('-', '') and k.strip() not in ('I',)}] for r in PR if _pm and r['m'].strip() == _pm.strip()]
    cards[c]['docs'] = DOCS.get(c, [])
    cards[c]['col'] = COLS.get(c, {}); cards[c]['cv'] = cvs
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

# 22.11.2026, Т. В.: «120 кадров» + «предмет на максимум рамки» — разбор каждого снимка заранее (фон, рамка предмета, сцена/нет),
# чтобы страница не считала пиксели на телефоне: n/d/im.json {ключ: [x0,x1,y0,y1,"rrggbb","rrggbb","rrggbb",сцена]} (поля сверху/снизу и слева/справа берутся из rrggbb)
def immeta(fp):
    from PIL import Image as _I
    im = _I.open(fp).convert('RGB'); W = 64; H = max(16, round(64 * im.height / max(1, im.width))); im = im.resize((W, H), _I.BILINEAR); px = im.load()
    e = [px[x, 0] for x in range(W)] + [px[x, H - 1] for x in range(W)] + [px[0, y] for y in range(1, H - 1)] + [px[W - 1, y] for y in range(1, H - 1)]
    df = lambda a, b: abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2])
    best, ref = -1, e[0]
    for i, q in enumerate(e):
        if i % 3: continue
        k = sum(1 for r in e if df(q, r) <= 36)
        if k > best: best, ref = k, q
    if best < len(e) * 0.55: return [0, 1, 0, 1, '000000', '000000', '000000', 1]
    def med(L):
        o = tuple(sorted(c[j] for c in L)[len(L) // 2] for j in range(3)); return ref if df(o, ref) > 30 else o
    iy, ix = round(H * .04), round(W * .04)
    tb = med([px[x, iy] for x in range(W)]), med([px[x, H - 1 - iy] for x in range(W)])
    lr = med([px[ix, y] for y in range(H)]), med([px[W - 1 - ix, y] for y in range(H)])
    x0, x1, y0, y1 = W, -1, H, -1
    for y in range(H):
        for x in range(W):
            if df(px[x, y], ref) > 60:
                x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    h = lambda c: '%02x%02x%02x' % c
    if x1 <= x0 or y1 <= y0: x0, x1, y0, y1 = 0, W - 1, 0, H - 1
    return [round(x0 / W, 3), round((x1 + 1) / W, 3), round(y0 / H, 3), round((y1 + 1) / H, 3), h(ref), h(tb[0]) + h(tb[1]), h(lr[0]) + h(lr[1]), 0]
_imc_p = os.path.join(CACHE, 'immeta.json')
try: _imc = json.load(open(_imc_p))
except Exception: _imc = {}
IMM = {}
for _f in os.listdir(os.path.join(N, 'i', 't')):
    if not _f.endswith('.webp'): continue
    _k = _f[:-5]
    if _k not in _imc:
        try: _imc[_k] = immeta(os.path.join(N, 'i', 't', _f))
        except Exception: continue
    IMM[_k] = _imc[_k]
json.dump(_imc, open(_imc_p, 'w'))
json.dump(IMM, open(os.path.join(N, 'd', 'im.json'), 'w'), separators=(',', ':'))

# ---------- оболочка: app.css, app.js, back.html, index.html (маршрутизатор) ----------
for f in ('ds.css', 'app.css', 'app.js', 'boot.js'): shutil.copy2(os.path.join(HERE, 'site', f), os.path.join(N, f))
shutil.copy2(os.path.join(FSU, 'fsu_back.html'), os.path.join(N, 'back.html'))
logo = open(os.path.join(BASE, 'f/media/brand/logo-black.svg'), encoding='utf-8').read()
logo = re.sub(r'fill="#000(?:000)?"', 'fill="currentColor"', logo)
logo = re.sub(r'<svg([^>]*?)\swidth="(\d+)"\s+height="(\d+)"', lambda m: '<svg class="logo" role="img" aria-label="Фабрикант" viewBox="0 0 %s %s"%s' % (m.group(2), m.group(3), m.group(1)), logo, count=1)
open(os.path.join(N, 'logo.svg'), 'w', encoding='utf-8').write(logo)
ver = hashlib.md5(b''.join(open(os.path.join(N, f), 'rb').read() for f in ('ds.css', 'app.css', 'app.js', 'boot.js')) + open(os.path.join(N, 'd', 'idx.json'), 'rb').read()).hexdigest()[:10]
# 21.11.2026 (B3): остальные страницы сайта — компания, новости, проекты, акции, остатки, подбор (pages_new.py; данные n/d/pg, pages.js/pages.css)
sys.path.insert(0, HERE); import pages_new; ver = pages_new.build(BASE, OUT, N, A, idx, ver)
ROUTE = r'^\/fsu\/(?:$|index\.html$|catalog(?:\/|$)|resheniya(?:\/|$)|poisk(?:\/|$)|company(?:\/|$)|projects(?:\/|$)|shares(?:\/|$)|stock(?:\/|$)|podbor(?:\/|$))'
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
