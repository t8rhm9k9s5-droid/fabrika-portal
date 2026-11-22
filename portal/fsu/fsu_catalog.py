#!/usr/bin/env python3
"""21.11.2026, Т. В.: «можно ещё взять из PDF каталога, и посмотри, что ещё есть в каталоге, чего не было на сайте».
Каталог 2025 (site/library/katalog_fabrikant_2025.pdf) → work/fsu/catalog2025/: по каждой модели — название, материалы, габариты,
страница и снимок изделия (вырез над подписью, фон обрезан) → catalog2025.json.
Подпись модели в каталоге — блок «Название», под ним «Материалы: …», «Габариты: …»; снимок стоит над подписью в той же колонке.
  python3 fsu_catalog.py [pdf]"""
import sys, os, re, json, io
import pymupdf
from PIL import Image, ImageChops
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'catalog2025'); os.makedirs(OUT, exist_ok=True)
PDF = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/site/library/katalog_fabrikant_2025.pdf'
DPI = 220; SC = DPI / 72.0
doc = pymupdf.open(PDF); res = []


def trim(im):
    """обрезать поля: всё, что близко к белому или к светло-серой подложке каталога"""
    g = im.convert('L'); bg = Image.new('L', g.size, 255)
    diff = ImageChops.difference(g, bg).point(lambda v: 255 if v > 28 else 0)
    box = diff.getbbox()
    return im.crop(box) if box else None


for pi in range(doc.page_count):
    pg = doc[pi]; blocks = [b for b in pg.get_text('blocks') if b[4].strip()]
    sect = next((b[4].strip().split('\n')[0] for b in blocks if b[1] < 40 and '/' in b[4]), '')
    names = []
    for b in blocks:
        t = b[4].strip()
        if '\n' in t.strip() and not t.startswith(('Материалы', 'Габариты')): first = t.split('\n')[0]
        else: first = t.split('\n')[0]
        below = [c for c in blocks if abs(c[0] - b[0]) < 3 and 0 < c[1] - b[3] < 30 and re.match(r'Материал|Габарит', c[4].strip())]
        if not below or re.match(r'Материал|Габарит', first) or len(first) > 60: continue
        txt = ' '.join(c[4].replace('\n', ' ') for c in sorted([c for c in blocks if abs(c[0] - b[0]) < 3 and 0 < c[1] - b[3] < 60], key=lambda c: c[1]))
        mat = re.search(r'Материалы?:\s*(.+?)(?=Габарит|$)', txt); dim = re.search(r'Габариты?:\s*([\d\s×хx]+мм)', txt)
        names.append({'name': first.strip().strip('«»'), 'x0': b[0], 'y0': b[1], 'mat': mat.group(1).strip() if mat else '', 'dims': dim.group(1).strip() if dim else ''})
    if not names: continue
    pix = pg.get_pixmap(dpi=DPI); full = Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')
    for n in names:
        same_row = sorted([m['x0'] for m in names if abs(m['y0'] - n['y0']) < 5 and m['x0'] > n['x0'] + 20])
        x1 = same_row[0] - 8 if same_row else min(n['x0'] + 170, pg.rect.width / 2 if n['x0'] < pg.rect.width / 2 else pg.rect.width)
        above = [m['y0'] for m in names if m['y0'] < n['y0'] - 30 and abs(m['x0'] - n['x0']) < 60]
        y0 = (max(above) + 56) if above else max(30, n['y0'] - 230)
        box = [int(v * SC) for v in (n['x0'] - 20, y0, x1, n['y0'] - 4)]
        if box[2] - box[0] < 60 or box[3] - box[1] < 60: continue
        cr = full.crop(box); im = trim(cr)
        if not im or im.size[0] < 80 or im.size[1] < 80: continue
        g = ImageChops.difference(cr.convert('L'), Image.new('L', cr.size, 255)).point(lambda v: 255 if v > 60 else 0)
        edge = any(g.crop(b2).getbbox() for b2 in ((0, 0, 3, cr.size[1]), (cr.size[0] - 3, 0, cr.size[0], cr.size[1])))   # тёмное у края — изделие могло обрезаться
        fn = 'p%03d_%d_%d.png' % (pi + 1, int(n['x0']), int(n['y0'])); im.save(os.path.join(OUT, fn), optimize=True)
        side = 'L' if n['x0'] < pg.rect.width / 2 else 'R'; hn = 'page%03d%s.webp' % (pi + 1, side)   # половина разворота — если вырез неудачный
        if not os.path.exists(os.path.join(OUT, hn)):
            W2 = full.size[0] // 2; hp = full.crop((0, 0, W2, full.size[1]) if side == 'L' else (W2, 0, full.size[0], full.size[1])); hp.thumbnail((1400, 1400)); hp.save(os.path.join(OUT, hn), 'WEBP', quality=80)
        res.append({'name': n['name'], 'page': pi + 1, 'sect': sect, 'mat': n['mat'], 'dims': n['dims'], 'img': fn, 'w': im.size[0], 'h': im.size[1], 'edge': bool(edge), 'half': hn})
json.dump(res, open(os.path.join(HERE, 'catalog2025.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(res), 'моделей со снимком,', len({r['name'] for r in res}), 'названий')
