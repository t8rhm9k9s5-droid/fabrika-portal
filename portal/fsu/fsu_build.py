#!/usr/bin/env python3
"""Копия сайта fabrikant.su для раздела портала «Сайт» (Т. В. 20.11.2026: «копируем один к одному», «на всю страницу, только кнопка назад»,
«фото больше 3 МБ — оптимизировать», «ошибки кода — сразу устранять»).
Вход: зеркало обхода (crawl3.js → m/, state3.json). Выход: /home/claude/build/fsu/ — копируется build_site.py в site/fsu/,
шифруется вместе с порталом (build_enc). Пути сайта переписаны под /fsu/, запросы API — на снимки _api/<md5>.json.
  python3 fsu_build.py <папка обхода>
"""
import sys, os, re, json, shutil, hashlib, subprocess, io
from PIL import Image
SRC = sys.argv[1]; M = os.path.join(SRC, 'm'); OUT = '/home/claude/build/fsu'
st = json.load(open(os.path.join(SRC, sys.argv[2] if len(sys.argv) > 2 else 'state3.json')))
shutil.rmtree(OUT, ignore_errors=True); os.makedirs(OUT)
P = '/fsu/'
def rw(t):   # абсолютные пути сайта → под /fsu/
    t = t.replace('https://fabrikant.su/', P)
    for a in ('f/', 'upload/', 'api/', 'favicon'):
        t = re.sub(r'(["\'(`])/' + a, lambda m: m.group(1) + P + a, t)
    return t
JOBS = []
rep = {'img': 0, 'img_before': 0, 'img_after': 0, 'big': [], 'txt': 0}
for root, _, fs in os.walk(M):
    for f in fs:
        if f.endswith('.part'): continue
        s = os.path.join(root, f); rel = os.path.relpath(s, M); d = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(d), exist_ok=True)
        ext = os.path.splitext(f)[1].lower()
        if ext in ('.js', '.css', '.json', '.svg', '.html', '.txt'):
            t = open(s, encoding='utf-8', errors='replace').read(); open(d, 'w', encoding='utf-8').write(rw(t)); rep['txt'] += 1; continue
        if ext in ('.png', '.jpg', '.jpeg', '.webp'):
            JOBS.append((s, d, rel)); continue
        if ext == '.mp4' and os.path.getsize(s) > 1_500_000:   # видео: 720p, H.264 veryfast — в разы легче
            r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', s, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
                                '-an', '-movflags', '+faststart', d], capture_output=True)
            if r.returncode == 0 and os.path.exists(d) and os.path.getsize(d) < os.path.getsize(s):
                rep['vid'] = rep.get('vid', 0) + os.path.getsize(s) - os.path.getsize(d); continue
        shutil.copy2(s, d)
# 20.11.2026: габариты, которых нет на сайте, — из других источников (dims_extra.json: инфографика FTP), в карточку как у остальных
_X = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dims_extra.json'), encoding='utf-8'))
def _mm(v): return '%d&nbsp;мм' % v
for _f in os.listdir(os.path.join(OUT, '_api')):
    _p = os.path.join(OUT, '_api', _f)
    try: _j = json.load(open(_p, encoding='utf-8'))
    except Exception: continue
    _dc = _j.get('dynamicContent') if isinstance(_j, dict) else None
    if not (isinstance(_dc, dict) and _dc.get('type') == 'products_catalog_detail'): continue
    _d = _dc['data']; _e = _X.get(_d.get('code'))
    if not _e: continue
    if _d.get('characteristics'):   # есть часть габаритов — дополнить недостающие
        _g = next((g for g in _d['characteristics'] if g.get('title') == 'Габариты'), None)
        if _g is None: _g = {'title': 'Габариты', 'values': []}; _d['characteristics'].insert(0, _g)
        _have = {v.get('name') for v in _g['values']}
        for _n, _k, _i in (('Глубина', 'dp', 'depth'), ('Ширина', 'w', 'width')):
            if _n not in _have: _g['values'].insert(0, {'name': _n, 'value': _mm(_e[_k]), 'icon': _i})
        _d.setdefault('widthMin', _e['w']); _d.setdefault('depthMin', _e['dp'])
        if not _d.get('widthMin'): _d['widthMin'] = _e['w']
        if not _d.get('depthMin'): _d['depthMin'] = _e['dp']
        json.dump(_j, open(_p, 'w', encoding='utf-8'), ensure_ascii=False); rep['dims_extra'] = rep.get('dims_extra', 0) + 1
        continue
    _v = [{'name': 'Глубина', 'value': _mm(_e['dp']), 'icon': 'depth'}, {'name': 'Ширина', 'value': _mm(_e['w']), 'icon': 'width'},
          {'name': 'Высота', 'value': _mm(_e['h']) if not _e.get('hM') else '%d–%d&nbsp;мм' % (_e['h'], _e['hM']), 'icon': 'height'}]
    _d['characteristics'] = [{'title': 'Габариты', 'values': _v}]
    if _e.get('seat'): _d['characteristics'].append({'title': 'Посадочное место', 'values': [{'name': 'Высота посадочного места', 'value': _mm(_e['seat']) if not _e.get('seatM') else '%d–%d&nbsp;мм' % (_e['seat'], _e['seatM']), 'icon': 'height'}]})
    if _e.get('note'): _d['characteristics'].append({'title': 'Дополнительно', 'values': [{'name': 'Спальное место', 'value': _e['note'].replace('спальное место ', '')}]})
    _d['heightMin'], _d['widthMin'], _d['depthMin'] = _e['h'], _e['w'], _e['dp']
    json.dump(_j, open(_p, 'w', encoding='utf-8'), ensure_ascii=False); rep['dims_extra'] = rep.get('dims_extra', 0) + 1
# 20.11.2026: фото — варианты под экран (fsu_img.py), параллельно
import multiprocessing as MP
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fsu_img
def _job(a):
    try: return a[2], fsu_img.process(*a)
    except Exception as e:
        shutil.copy2(a[0], a[1]); n = os.path.getsize(a[0]); return a[2], (n, n, None)
IMAP = {}
with MP.Pool(int(os.environ.get('FSU_PROC', '4'))) as pool:
    for rel, (b0, b1, m) in pool.imap_unordered(_job, JOBS, chunksize=8):
        rep['img'] += 1; rep['img_before'] += b0; rep['img_after'] += b1
        if m: IMAP[('~' + rel[len('upload/als-1c/catalog/products/'):]) if rel.startswith('upload/als-1c/catalog/products/') else rel] = m
json.dump(IMAP, open(os.path.join(OUT, '_img.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
rep['img_map'] = len(IMAP)
# карта API: путь+запрос → файл
amap = {k: v for k, v in st['api'].items() if os.path.exists(os.path.join(M, '_api', v + '.json'))}
# 20.11: переводы интерфейса — ещё и файлом (относительные запросы api/i18n/…)
for k, v in amap.items():
    if k.startswith('/api/i18n/'):
        os.makedirs(os.path.join(OUT, 'api', 'i18n'), exist_ok=True); shutil.copy2(os.path.join(M, '_api', v + '.json'), os.path.join(OUT, k[1:]))
# оболочка
shell = rw(open(os.path.join(SRC, 'shell.html'), encoding='utf-8').read()).replace('<base href="/">', '<base href="/fsu/">')
shim = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fsu_shim.js'), encoding='utf-8').read().replace('__AMAP__', json.dumps(amap, ensure_ascii=False))
shell = re.sub(r'<link[^>]+rel="preload"[^>]+/fsu/api/[^>]*>', '', shell)
shell = shell.replace('<head>', '<head><script>' + shim + '</script>', 1)
shell = shell.replace('</body>', open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fsu_back.html'), encoding='utf-8').read() + '</body>')
open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(shell)
# 20.11.2026: подбор мебели по свойствам (Т. В.: «я потребитель, не знаю, что такое стул, кресло… ищу по набору свойств»)
HERE = os.path.dirname(os.path.abspath(__file__))
pb = open(os.path.join(HERE, 'podbor.html'), encoding='utf-8').read().replace('</body>', open(os.path.join(HERE, 'fsu_back.html'), encoding='utf-8').read() + '</body>')
open(os.path.join(OUT, 'podbor.html'), 'w', encoding='utf-8').write(pb)
shutil.copy2(os.path.join(HERE, 'podbor.json'), os.path.join(OUT, 'podbor.json'))
# 20.11.2026: инфографика с FTP к карточкам (info_prep.py → work/fsu/info/ и info.json)
if os.path.isdir(os.path.join(HERE, 'info')):
    shutil.copytree(os.path.join(HERE, 'info'), os.path.join(OUT, 'info'), copy_function=os.link)
    shutil.copy2(os.path.join(HERE, 'info.json'), os.path.join(OUT, 'info.json'))
rep['api'] = len(amap); rep['pages'] = len(st['seen'])
json.dump(rep, open(os.path.join(SRC, 'build_report.json'), 'w'), ensure_ascii=False, indent=1)
print(json.dumps({k: v if k != 'big' else len(v) for k, v in rep.items()}, ensure_ascii=False))
