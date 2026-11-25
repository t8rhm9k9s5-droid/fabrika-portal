#!/usr/bin/env python3
"""Презентации «Фабрикант» из каталога сайта (25.11.2026, Т. В.: «скомпонуй из каталога несколько презентаций… куда наша мебель может понадобиться»).
Данные карточек — build/fsu/n/d (idx.json, p/<код>.json); фото — с действующего сайта (fsu/n/i/…), ключом сборки; прайс — в карточке (pr).
deck(spec) → HTML 1280×720 на слайд → PDF (Playwright). Шрифты и цвет — фирменные (ALS Gorizont, ALS Departure, #F04B30)."""
import base64, hashlib, html, json, os, re, ssl, sys, urllib.request
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
H = os.path.dirname(os.path.abspath(__file__)); IMG = os.path.join(H, 'img'); OUT = os.path.join(H, 'out')
FSU = '/home/claude/build/fsu/n/d'; SITE = '/home/claude/fabrika/work/live_pull/site'
IDX = {e['c']: e for e in json.load(open(FSU + '/idx.json', encoding='utf-8'))['items']}
_S = json.load(open('/home/claude/app_build/enc_secret.json')); _CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
_MAP = json.load(open(SITE + '/_map.json', encoding='utf-8'))['files']
_AES = AESGCM(bytes.fromhex(_S['master_hex']) if _S.get('master_hex') else hashlib.pbkdf2_hmac('sha256', _S['password'].encode(), bytes.fromhex(_S['salt']), _S['iter'], 32))
SEC = {'kresla': 'Кресла', 'stulya': 'Стулья', 'myagkaya-mebel': 'Мягкая мебель', 'stoly': 'Столы'}


def card(code):
    return json.load(open('%s/p/%s.json' % (FSU, code), encoding='utf-8'))


def img(k, size='m'):
    """фото карточки → путь локального файла (webp); size: 'm' — среднее, '' — полное"""
    rel = 'fsu/n/i/%s%s.webp' % (size + '/' if size else '', k); p = os.path.join(IMG, rel.replace('/', '_'))
    if os.path.exists(p): return p
    f = _MAP.get(rel)
    if not f: return None
    with urllib.request.urlopen('https://techfabrikant.ru/b/' + f[0], context=_CTX, timeout=120) as r: b = r.read()
    open(p, 'wb').write(_AES.decrypt(b[:12], b[12:], None)); return p


def data_uri(p, side=900):
    """картинка → JPEG в строке (webp в PDF хранится без сжатия и раздувает файл в 10 раз)"""
    if not p: return ''
    import io
    from PIL import Image
    im = Image.open(p)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA'); bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3]); im = bg
    else: im = im.convert('RGB')
    im.thumbnail((side, side)); buf = io.BytesIO(); im.save(buf, 'JPEG', quality=84, optimize=True)
    return 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()


def rub(v): return ('{:,.0f}'.format(v)).replace(',', ' ') + ' ₽'
def esc(s): return html.escape(re.sub(r'<[^>]+>', '', str(s or '')))
def font(name): return 'data:font/woff2;base64,' + base64.b64encode(open(SITE + '/assets/fonts/' + name, 'rb').read()).decode()


CSS = """
@font-face{font-family:Gor;src:url(%s)}@font-face{font-family:Dep;font-weight:400;src:url(%s)}@font-face{font-family:Dep;font-weight:700;src:url(%s)}
@page{size:1280px 720px;margin:0}*{box-sizing:border-box}html,body{margin:0}body{font-family:Dep,Arial,sans-serif;color:#15181D;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.s{width:1280px;height:720px;position:relative;overflow:hidden;page-break-after:always;background:#fff;padding:56px 64px}
.s:last-child{page-break-after:auto}
h1,h2,.g{font-family:Gor,Dep,Arial;font-weight:500;letter-spacing:-.01em;margin:0}
.logo{position:absolute;left:64px;bottom:34px;height:22px}.pg{position:absolute;right:64px;bottom:36px;font-size:13px;color:#8A9099}
.bar{position:absolute;left:0;top:0;width:10px;height:100%%;background:#F04B30}
.cover{background:#15181D;color:#fff;padding:84px 84px}.cover h1{font-size:54px;line-height:1.05;max-width:900px}.cover .sub{font-size:22px;color:#C9CDD3;margin-top:26px;max-width:860px;line-height:1.38}.cover.wp h1,.cover.wp .sub{max-width:640px}
.cover .tag{display:inline-block;background:#F04B30;color:#fff;font-size:15px;font-weight:700;padding:7px 14px;border-radius:999px;margin-bottom:34px;letter-spacing:.04em;text-transform:uppercase}
.cover .foot{position:absolute;left:84px;bottom:56px;font-size:16px;color:#9AA1AB}.cover .logo{left:auto;right:84px;bottom:54px;height:28px;filter:brightness(0) invert(1)}.cover.wp .logo{right:auto;left:84px;bottom:96px}
.cover .ph{position:absolute;right:0;top:0;width:470px;height:100%%;object-fit:cover;opacity:.92}
h2{font-size:38px;line-height:1.08}.kick{font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#F04B30;margin-bottom:12px}
.lead{font-size:20px;line-height:1.45;color:#3A4049;margin-top:18px;max-width:1000px}
.grid{display:grid;gap:18px;margin-top:30px}.c2{grid-template-columns:1fr 1fr}.c3{grid-template-columns:1fr 1fr 1fr}.c4{grid-template-columns:repeat(4,1fr)}
.box{background:#F3F4F6;border-radius:18px;padding:22px 24px}.box b{display:block;font-size:19px;margin-bottom:8px}.box p{margin:0;font-size:16px;line-height:1.42;color:#3A4049}
.box .n{font-family:Gor;font-size:40px;color:#F04B30;line-height:1;margin-bottom:8px}
.m{display:grid;grid-template-columns:470px 1fr;gap:40px;height:100%%}.m .pic{background:#fff;border:1px solid #E1E4E8;border-radius:22px;display:flex;align-items:center;justify-content:center;overflow:hidden;height:520px}
.m .pic img{max-width:92%%;max-height:92%%;object-fit:contain}.m .pic.int img{max-width:100%%;max-height:100%%;width:100%%;height:100%%;object-fit:cover}
.m h2{font-size:42px}.m .cat{font-size:15px;color:#6B7280;margin:8px 0 14px}.m .d{font-size:16px;line-height:1.42;color:#3A4049;margin-top:12px;max-height:92px;overflow:hidden}
.m .viz{font-size:11.5px;color:#9AA1AB;margin-top:8px;letter-spacing:.04em;text-transform:uppercase}
.specs{display:grid;grid-template-columns:1fr 1fr;column-gap:30px;margin-top:14px}.specs div{display:flex;justify-content:space-between;gap:14px;border-bottom:1px solid #E5E7EB;padding:6px 0;font-size:14px;line-height:1.3}.specs div.w{grid-column:1/-1}.specs span{color:#6B7280;white-space:nowrap}.specs b{font-weight:600;text-align:right}
.m table{border-collapse:collapse;margin-top:14px;font-size:15.5px;width:100%%}.m td{padding:6px 0;border-bottom:1px solid #E5E7EB;vertical-align:top}.m td:first-child{color:#6B7280;width:44%%}
.price{margin-top:18px;display:flex;align-items:baseline;gap:14px}.price .v{font-family:Gor;font-size:40px;white-space:nowrap}.price .t{font-size:15px;color:#6B7280}
.stock{margin-top:12px;background:#FFF1EE;border-radius:14px;padding:12px 16px;font-size:15.5px;line-height:1.4}.stock b{color:#D93A20}
ul{margin:14px 0 0;padding-left:22px;font-size:19px;line-height:1.5;color:#2B3037}li{margin-bottom:6px}
.t{width:100%%;border-collapse:collapse;margin-top:22px;font-size:16px}.t th{text-align:left;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#6B7280;border-bottom:2px solid #15181D;padding:8px 10px 8px 0}
.t td{padding:9px 10px 9px 0;border-bottom:1px solid #E5E7EB;vertical-align:top}.small{font-size:13px;color:#8A9099;margin-top:14px}
"""


def page(inner, n=None, cls=''):
    return '<section class="s %s">%s%s%s</section>' % (cls, '' if 'cover' in cls else '<div class="bar"></div>', inner,
        '' if 'cover' in cls else '<img class="logo" src="%s"><div class="pg">%s</div>' % (LOGO, n or ''))


def s_cover(title, sub, tag='', foot='', photo=None):
    return page(('<img class="ph" src="%s">' % data_uri(photo, 1200) if photo else '') + ('<div class="tag">%s</div>' % esc(tag) if tag else '') + '<h1>%s</h1><div class="sub">%s</div><div class="foot">%s</div><img class="logo" src="%s">' % (esc(title), esc(sub), esc(foot), LOGO), cls='cover wp' if photo else 'cover')


def s_text(kick, title, lead='', bullets=(), boxes=(), cols=3, table=None, small=''):
    h = '<div class="kick">%s</div><h2>%s</h2>' % (esc(kick), esc(title))
    if lead: h += '<div class="lead">%s</div>' % esc(lead)
    if bullets: h += '<ul>' + ''.join('<li>%s</li>' % esc(b) for b in bullets) + '</ul>'
    if boxes: h += '<div class="grid c%d">' % cols + ''.join('<div class="box">%s<b>%s</b><p>%s</p></div>' % ('<div class="n">%s</div>' % esc(b[2]) if len(b) > 2 and b[2] else '', esc(b[0]), esc(b[1])) for b in boxes) + '</div>'
    if table: h += '<table class="t"><tr>' + ''.join('<th>%s</th>' % esc(x) for x in table[0]) + '</tr>' + ''.join('<tr>' + ''.join('<td>%s</td>' % esc(x) for x in r) + '</tr>' for r in table[1:]) + '</table>'
    if small: h += '<div class="small">%s</div>' % esc(small)
    return h


HQ = '/home/claude/fabrika/work/prez/hq'; LOWRES = {}   # 25.11.2026, Т. В.: мелкие и мутные фото — заново через API (hq/<код>.png), метка «визуализация»


def specs(c):
    """все технические данные карточки → [(название, значение)]"""
    ch = {g.get('t', ''): [(a, b) for a, b in g.get('v') or [] if a and b] for g in c.get('ch') or []}
    out = []; g = dict(ch.get('Габариты') or [])
    mm = lambda v: re.sub(r'\s*мм$', '', re.sub(r'^(\d+)–\1\b', r'\1', str(v))).strip()
    if g.get('Ширина') or g.get('Высота'):
        out.append(('Габариты (Ш × Г × В)', ' × '.join(mm(g.get(k, '—')) for k in ('Ширина', 'Глубина', 'Высота')) + ' мм'))
    for k, v in ch.get('Габариты') or []:
        if k in ('Ширина', 'Глубина', 'Высота'): continue
        out.append((('Вес' if k == 'Вес' else k.replace('Посадочное место: ', '').capitalize()), re.sub(r'\((кг)\)', r'\1', str(v))))
    d = re.sub(r'<[^>]+>', ' ', c.get('desc') or '')
    m = re.search(r'[Гг]рузопод[ъь]?[её]мность[^0-9]{0,12}(\d{2,3})\s*кг', d)
    if m: out.append(('Нагрузка', 'до %s кг' % m.group(1)))
    NM = {'Обивка': 'Обивка', 'Цвет каркаса': 'Цвет каркаса', 'Механизм': 'Механизм', 'Подлокотники': 'Подлокотники', 'Опора': 'Опора', 'Ролики': 'Ролики', 'Доп. свойства': 'Дополнительно', 'Вариантов в 1С': 'Исполнений в прайс-листе', 'Материалы (каталог)': 'Материалы'}
    for k, v in ch.get('Исполнения') or []: out.append((NM.get(k, k), str(v)))
    p = dict(ch.get('Упаковка') or [])
    if p.get('Ширина') or p.get('Высота'): out.append(('Упаковка (Ш × Г × В)', ' × '.join(mm(p.get(k, '—')) for k in ('Ширина', 'Глубина', 'Высота')) + ' мм'))
    for k, v in ch.get('Поставка') or []: out.append(('В упаковке' if 'ратност' in k else k, str(v)))
    for f in (c.get('ft') or [])[:2]:
        if f.get('n'): out.append(('Особенность', f['n']))
    have = ' '.join(x[0] for x in out).lower()
    for rx, nm in ((r'[Вв]ысота посадочного места[^0-9]{0,6}(\d[\d–\- ]*)\s?мм', 'Высота сиденья'), (r'[Вв]ысота по подлокотникам[^0-9]{0,6}(\d[\d ,и–]*\d)\s?мм', 'Высота подлокотников')):
        m = re.search(rx, d)
        if m and nm.lower() not in have and 'посадочн' not in have: out.append((nm, m.group(1).strip() + ' мм'))
    if len(out) < 7:   # в карточке мало данных — берём факты из описания
        low = d.lower()
        for rx, nm, val in ((r'пятилуч', 'Опора', 'металлическое пятилучье'), (r'четырьмя лучами', 'Опора', 'четыре луча'), (r'ринг-?\s?база', 'Опора для ног', 'кольцо (ринг-база)'), (r'проножк', 'Опора для ног', 'проножка вокруг оси'),
                            (r'глайдер', 'Установка', 'на глайдерах'), (r'опоры качения', 'Установка', 'на роликах'), (r'вращения блока|вращением', 'Регулировка высоты', 'вращением сиденья'),
                            (r'металлических труб', 'Каркас', 'металлические трубы'), (r'порошков', 'Покрытие каркаса', 'порошковая краска'), (r'прилавк|кассов', 'Назначение', 'касса, прилавок, стойка')):
            if re.search(rx, low) and nm.lower() not in ' '.join(x[0] for x in out).lower(): out.append((nm, val))
    return [(a, b) for a, b in out if len(str(b)) < 90]


def s_model(code, stock='', why='', interior=False, price_note='по прайс-листу, с НДС'):
    c = card(code); e = IDX.get(code, {})
    k = None; viz = False
    if interior and (c.get('th') or {}).get('day'): k = c['th']['day']; viz = True
    if not k and c.get('ph'): k = next((p['k'] for p in c['ph'] if not p.get('ai')), c['ph'][0]['k'])
    if not k: k = e.get('i')
    pic = img(k, '') if interior else (img(k, '') or img(k, 'm'))
    if not viz:
        hq = os.path.join(HQ, code + '.png')
        if os.path.exists(hq): pic = hq; viz = True
        else:
            from PIL import Image as _I
            w, h = _I.open(pic).size
            if max(w, h) < 700: LOWRES[code] = [w, h, pic]
    prices = sorted(p[0] for p in c.get('pr') or [] if isinstance(p, list) and p and isinstance(p[0], (int, float)))
    d = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', c.get('desc') or '')).strip()
    d = d if len(d) < 230 else d[:230].rsplit('. ', 1)[0] + '.'
    cat = SEC.get(e.get('g'), '') or ''
    sp = specs(c)[:12]
    h = '<div class="m"><div><div class="pic%s"><img src="%s"></div>%s</div><div><div class="kick">%s</div><h2>%s</h2><div class="d">%s</div>' % (
        ' int' if interior and (c.get('th') or {}).get('day') else '', data_uri(pic, 1400), '<div class="viz">%s</div>' % ('визуализация по фото изделия' if viz else 'фото изделия'), esc(why or cat), esc(c['n']), esc(d))
    if sp: h += '<div class="specs">' + ''.join('<div%s><span>%s</span><b>%s</b></div>' % (' class="w"' if len(str(b)) > 24 else '', esc(a), esc(b)) for a, b in sp) + '</div>'
    if prices:
        rng = 'от %s' % rub(prices[0]) if prices[0] == prices[-1] or len(prices) < 2 else '%s – %s' % (rub(prices[0]).replace(' ₽', ''), rub(prices[-1]))
        h += '<div class="price"><div class="v">%s</div><div class="t">%s%s</div></div>' % (rng, esc(price_note), ' · %d исполнений' % len(prices) if len(prices) > 1 else '')
    if stock: h += '<div class="stock">%s</div>' % stock
    return h + '</div></div>'


LOGO = 'data:image/svg+xml;base64,' + base64.b64encode(open('/home/claude/docs_brand/brand/logo-h.svg', 'rb').read()).decode()


def build(name, slides):
    json.dump(LOWRES, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', '_lowres_%s.json' % name[:12]), 'w', encoding='utf-8'), ensure_ascii=False)
    css = CSS % (font('als_gorizont/ALSGorizont2.1-MediumExpanded.woff2'), font('als_departure/ALSDeparture-Regular.woff2'), font('als_departure/ALSDeparture-Bold.woff2'))
    body = ''.join(s if s.startswith('<section') else page(s, i + 1) for i, s in enumerate(slides))
    hp = os.path.join(OUT, name + '.html'); open(hp, 'w', encoding='utf-8').write('<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>%s</title><style>%s</style></head><body>%s</body></html>' % (esc(name), css, body))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1280, 'height': 720}); pg.goto('file://' + hp); pg.wait_for_timeout(800)
        pg.pdf(path=os.path.join(OUT, name + '.pdf'), width='1280px', height='720px', print_background=True)
        pg.screenshot(path=os.path.join(OUT, name + '_1.png')); b.close()
    return os.path.join(OUT, name + '.pdf')
