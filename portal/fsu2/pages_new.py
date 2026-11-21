#!/usr/bin/env python3
"""21.11.2026, Т. В.: «пока начнём с каталога, потом остальное» → «дальше работай». Остальные страницы сайта /fsu/ в новом оформлении:
О компании, Производство, Документация, Вакансии, Новости (+ каждая новость), Контакты, Проекты (+ каждый проект), Акции, Где купить · остатки
(по городам, из файлов 1С upload/als-1c/stores/*.xlsx), Подбор по свойствам. Данные — из снимков копии (_api), картинки — те же файлы копии
(они уже WebP ≤1280, у крупных есть <путь>.640.webp — по карте _img.json), новых байтов фото не добавляется.
Вызывается из build_new.py (build(...)) после сборки каталога; пишет out/n/d/pg/*, out/n/pages.js, out/n/pages.css, out/podbor.html (переход на /fsu/podbor).
Отдельно: python3 pages_new.py [--base build/fsu] [--out work/fsu2/out]  (каталог out/ уже должен быть собран)."""
import os, re, json, html, hashlib, shutil
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
clean = lambda s: re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', str(s or ''))).replace('\xa0', ' ')).strip()
ytxt = lambda s: html.unescape(str(s or '')).replace('\xa0', ' ').replace('­', '').strip()


# ---------- безопасный HTML из блоков копии: только разметка текста, ссылки и картинки ----------
class _San(HTMLParser):
    OK = {'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'blockquote', 'sup', 'sub', 'hr'}
    MAP = {'h1': 'h2', 'h5': 'h4', 'h6': 'h4', 'div': 'p', 'nobr': None, 'span': None, 'font': None}
    VOID = {'br', 'img', 'hr'}

    def __init__(self, fix):
        super().__init__(convert_charrefs=True); self.o = []; self.st = []; self.fix = fix

    def handle_starttag(self, t, a):
        t = self.MAP.get(t, t)
        if t not in self.OK: self.st.append(None); return
        a = dict(a); at = ''
        if t == 'a':
            h = self.fix(a.get('href') or '')
            if not h: self.st.append(None); return
            at = ' href="%s"' % html.escape(h, quote=True) + (' target="_blank" rel="noopener"' if re.match(r'https?://', h) and 'techfabrikant.ru' not in h else '')
        if t == 'img':
            s = self.fix(a.get('src') or '')
            if not s: return
            self.o.append('<img src="%s" alt="%s" loading="lazy" decoding="async">' % (html.escape(s, quote=True), html.escape(a.get('alt') or '', quote=True))); return
        if t in self.VOID: self.o.append('<%s>' % t); return
        self.o.append('<%s%s>' % (t, at)); self.st.append(t)

    def handle_endtag(self, t):
        t = self.MAP.get(t, t)
        if t in self.VOID: return
        while self.st:
            x = self.st.pop()
            if x: self.o.append('</%s>' % x)
            if x == t or x is None and t not in self.OK: break

    def handle_data(self, d): self.o.append(html.escape(re.sub(r'\s+', ' ', d.replace('\u00ad', '')), quote=False))

    def out(self):
        while self.st:
            x = self.st.pop()
            if x: self.o.append('</%s>' % x)
        s = ''.join(self.o)
        s = re.sub(r'(<br>\s*){3,}', '<br><br>', s); s = re.sub(r'<p>\s*(<br>\s*)*</p>', '', s); s = re.sub(r'^(\s*<br>)+|(<br>\s*)+$', '', s.strip())
        return s.strip()


def build(BASE, OUT, N, A, idx, ver):
    D = os.path.join(N, 'd', 'pg'); shutil.rmtree(D, ignore_errors=True)
    for s in ('news', 'proj', 'st'): os.makedirs(os.path.join(D, s))
    IMAP = {}
    try: IMAP = json.load(open(os.path.join(BASE, '_img.json'), encoding='utf-8'))
    except Exception: pass
    PF = 'upload/als-1c/catalog/products/'

    def J(k):
        h = A.get(k)
        if not h: return None
        try: return json.load(open(os.path.join(BASE, '_api', h + '.json'), encoding='utf-8'))
        except Exception: return None

    def page(u): return J('/api/v1/?action=blockPage.getPageByUrl&url=%s&lang=ru' % u)
    def one(sub): return J(next((k for k in A if sub in k), ''))

    def fix(u):   # ссылки и картинки копии → адреса /fsu/…; внешние — как есть
        u = html.unescape(str(u or '')).strip()
        if not u or u.startswith(('javascript:', 'data:')): return ''
        if u.startswith(('http://', 'https://', 'mailto:', 'tel:', '#')):
            m = re.match(r'https?://(?:www\.)?fabrikant\.su(/.*)?$', u)
            return ('/fsu' + (m.group(1) or '/')) if m else u
        if u.startswith('//'): return 'https:' + u
        if u.startswith('/fsu/'): return u
        if u.startswith('/'): return '/fsu' + u
        return ''

    def im(src):   # {s: основной файл, t: миниатюра} — только если файл есть в копии
        s = fix(src)
        if not s.startswith('/fsu/'): return None
        rel = s[5:].split('?')[0]
        if not os.path.exists(os.path.join(BASE, rel)): return None
        k = ('~' + rel[len(PF):]) if rel.startswith(PF) else rel; v = IMAP.get(k) or [0, 0, 0]
        return {'s': s, 't': s + '.640.webp' if v[1] and os.path.exists(os.path.join(BASE, rel + '.640.webp')) else s}

    def san(h):
        p = _San(fix); p.feed(str(h or '')); p.close(); return p.out()

    def htmls(pt): return ''.join(san(x.get('html')) for x in (pt or []) if isinstance(x, dict))

    # --- блоки страниц «О компании» → простые типы: txt / facts / photos / video / docs / vac / addr ---
    def blocks(items):
        out = []
        for it in items or []:
            c = it.get('component') or ''; cp = it.get('componentProps') or {}; t = htmls(it.get('previewText'))
            if c == 'tabs':
                out += blocks(cp.get('tabs')); continue
            if c == 'fact_red':
                f = {'h': ytxt(cp.get('header')), 's': ytxt(cp.get('headerSubText'))}
                if out and out[-1]['t'] == 'facts': out[-1]['v'].append(f)
                else: out.append({'t': 'facts', 'v': [f]})
                continue
            if c in ('facts_promo_photos_grid', 'promo_bender'):
                ph = []
                for i in (1, 2, 3):
                    p = im((cp.get('photo%d' % i) or {}).get('src'))
                    if p: ph.append({**p, 'h': ytxt(cp.get('photo%dHeader' % i)), 's': ytxt(cp.get('photo%dSubHeader' % i))})
                out.append({'t': 'photos', 'd': ytxt(cp.get('description')), 'v': ph}); continue
            if c == 'video':
                f = fix(cp.get('file'))
                ok = f.startswith('/fsu/') and os.path.exists(os.path.join(BASE, f[5:]))
                out.append({'t': 'video', 'h': t, 'f': f if ok else '', 'n': ytxt(it.get('name')), 'id': it.get('code') or ''}); continue
            if c == 'documentation':
                out.append({'t': 'docs', 'v': [{'n': ytxt(g.get('name')), 'd': san(g.get('description')),
                                                'f': [{'n': ytxt(x['file'].get('name')), 'e': (x['file'].get('ext') or '').upper(), 'z': x['file'].get('size') or 0, 'u': fix(x['file'].get('src'))}
                                                      for x in g.get('items') or [] if x.get('file')]} for g in cp.get('data') or []]}); continue
            if c == 'vacancies_table':
                v = (cp.get('vacancies') or {}).get('items') or []
                out.append({'t': 'vac', 'hh': cp.get('hhId'), 'v': [{'n': ytxt(x.get('name')), 'a': ((x.get('area') or {}).get('name') or ''),
                                                                  'f': (x.get('salary') or {}).get('from'), 'to': (x.get('salary') or {}).get('to'),
                                                                  'g': (x.get('salary') or {}).get('gross'), 'u': x.get('alternate_url') or '',
                                                                  'e': ((x.get('experience') or {}).get('name') or ''), 'sc': ((x.get('schedule') or {}).get('name') or ''),
                                                                  'dt': (x.get('published_at') or '')[:10]} for x in v]}); continue
            if c in ('address_list', 'address_map'):
                if t: out.append({'t': 'txt', 'h': t})
                if not any(b['t'] == 'addr' for b in out): out.append({'t': 'addr', 'only': cp.get('addressListActive')})
                continue
            if c == 'form':
                out.append({'t': 'form', 'h': t or '<h2>Стать партнером</h2>'}); continue
            if c in ('news_catalog', 'production_cycle_menu'):
                out.append({'t': c}); continue
            raw = ''.join(str(x.get('html') or '') for x in (it.get('previewText') or []) if isinstance(x, dict))
            m = re.search(r'class="h1"[^>]*>(.*?)</span>(.*)', raw, re.S)
            if m:
                f = {'h': clean(m.group(1)), 's': clean(m.group(2))}
                if out and out[-1]['t'] == 'facts': out[-1]['v'].append(f)
                else: out.append({'t': 'facts', 'v': [f]})
                continue
            if t and re.fullmatch(r'<h2>[A-Za-z0-9 ,.&;-]+</h2>', t): continue   # служебные английские якоря копии («Production Process»)
            if t: out.append({'t': 'txt', 'h': t, 'lead': 'lead' in raw})
        return out

    site = {'v': ver}
    for code in ('production', 'documentation', 'vacancies', 'contacts', 'news'):
        p = page('/company/' + code)
        if not p or not isinstance(p.get('data'), dict): continue
        b = blocks(p.get('items'))
        if b and b[0]['t'] == 'txt' and re.match(r'^<h2>', b[0]['h']): b = b[1:]   # заголовок страницы — свой
        site[code] = {'n': ytxt(p['data'].get('name')), 'b': b}

    # --- адреса (города: склад/офис, контакты, карта) ---
    addr = []
    for g in one('address.getStructuredItems') or []:
        for x in g.get('items') or []:
            addr.append({'id': g.get('id'), 'c': ytxt(g.get('name')), 'h': san(x.get('previewText')), 'map': x.get('map') or None})
    site['addr'] = addr

    # --- новости: оглавление в site.json, каждая — свой файл ---
    nl = one('news.getItemsShort') or []
    det = {}
    for k in A:
        if 'getPageByUrl&url=/company/news/' in k:
            d = (J(k) or {}).get('dynamicContent') or {}
            if d.get('type') == 'news_detail' and isinstance(d.get('data'), dict): det[d['data'].get('code')] = d['data']
    news = []
    for x in nl:
        c = x.get('code')
        if not c: continue
        dd = det.get(c) or {}; body = htmls(dd.get('detailText'))
        pic = im((x.get('previewPicture') or {}).get('src')) or im((x.get('detailPicture') or {}).get('src')) or im((dd.get('previewPicture') or {}).get('src'))
        if not pic:
            m = re.search(r'<img src="([^"]+)"', body); pic = im(m.group(1)) if m else None
        ts = (x.get('activeDate') or [0])[0] or 0
        e = {'c': c, 'n': ytxt(x.get('name')), 'ts': ts, 'd': ytxt((x.get('activeDate') or [0, ''])[1]), 'i': pic['t'] if pic else '', 'has': bool(body)}
        news.append(e)
        if body:
            json.dump({**e, 'big': pic['s'] if pic else '', 'h': body}, open(os.path.join(D, 'news', c + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    news.sort(key=lambda e: -e['ts']); site['news_list'] = news

    # --- проекты ---
    pl = one('projects.getItemsShort') or []; cl = {c.get('id'): c for c in (one('projectsClients.getItemsShort') or []) if isinstance(c, dict)}
    pdet = {}
    for k in A:
        if 'getPageByUrl&url=/projects/' in k:
            d = (J(k) or {}).get('dynamicContent') or {}
            if d.get('type') == 'projects_detail' and isinstance(d.get('data'), dict): pdet[d['data'].get('code')] = d['data']
    CAT = {'office': 'Имя2', 'restaurant': 'Кафе и рестораны', 'hotel': 'Отели', 'education': 'Образование', 'medicine': 'Медицина', 'public': 'Общественные пространства'}
    BYN = {}
    for e in idx: BYN.setdefault(e['n'].lower().replace('ё', 'е'), e['c'])
    projs = []
    for x in pl:
        c = x.get('code')
        if not c: continue
        pic = im((x.get('previewPicture') or {}).get('src')); cli = cl.get(x.get('client')) or {}
        e = {'c': c, 'n': ytxt(x.get('name')), 'p': ytxt(x.get('preview')), 'cat': CAT.get(x.get('category'), ytxt(x.get('category'))), 'dt': (x.get('date') or '')[:10],
             'i': pic['t'] if pic else '', 'pi': ({'v': ytxt((x.get('promoIndicator') or {}).get('value')), 'd': ytxt((x.get('promoIndicator') or {}).get('description'))}
                                                if x.get('promoIndicator') else None), 'cli': ytxt(cli.get('name'))}
        projs.append(e)
        dd = pdet.get(c)
        if dd:
            comp = []
            for q in dd.get('compositions') or []:
                pi = im((q.get('image') or {}).get('src'))
                comp.append({'v': ytxt(q.get('value')), 'd': ytxt(q.get('description')), 'i': pi['t'] if pi else ''})
            gal = [x for x in (im(p.get('src')) for p in (dd.get('photos') or []) if isinstance(p, dict)) if x]
            ba = [x for x in (im((dd.get('photoBefore') or {}).get('src')), im((dd.get('photoAfter') or {}).get('src'))) if x]
            body = {'task': ytxt(dd.get('task')), 'dtask': ytxt(dd.get('descriptionTask')), 'after': ytxt(dd.get('textAfterTask')), 'comp': comp,
                    'acomp': ytxt(dd.get('textAfterCompositions')), 'res': ytxt(dd.get('result')), 'days': dd.get('completedInDays'),
                    'big': (im((dd.get('detailPicture') or {}).get('src')) or {}).get('s', ''), 'ph': gal[:30], 'ba': ba if len(ba) == 2 else []}
            json.dump({**e, **body}, open(os.path.join(D, 'proj', c + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    site['projects'] = projs

    # --- остатки складов (файлы 1С): город → строки; модель → карточка каталога ---
    import pandas as pd
    SD = os.path.join(BASE, 'upload', 'als-1c', 'stores')
    CITY = {'ryazan': 'Рязань', 'moscow': 'Москва', 'nizhny-novgorod': 'Сотрудник15 Имя3', 'samara': 'Самара', 'ekaterinburg': 'Екатеринбург',
            'simferopol': 'Симферополь', 'krasnodar': 'Краснодар', 'almaty': 'Алматы', 'saint-petersburg': 'Санкт-Петербург', 'karshi': 'Карши'}
    nk = lambda s: re.sub(r'\s+', ' ', re.sub(r'[^a-zа-я0-9+]+', ' ', str(s).lower().replace('ё', 'е'))).strip()
    NM = {}
    for e in idx: NM.setdefault(nk(e['n']), e['c'])
    names = sorted(NM, key=len, reverse=True)

    def match(model):
        m = nk(model)
        if m in NM: return NM[m]
        m2 = nk(re.sub(r'\(.*?\)|hoff.*$', ' ', model, flags=re.I))
        if m2 in NM: return NM[m2]
        for n in names:
            if len(n) >= 4 and (m2 == n or m2.startswith(n + ' ')): return NM[n]
        return None

    stock, cities, st_rows_tot, st_hit = {}, [], 0, 0
    for f in sorted(os.listdir(SD)) if os.path.isdir(SD) else []:
        if not f.endswith('.xlsx'): continue
        cc = f[:-5]
        try: x = pd.read_excel(os.path.join(SD, f), header=None, engine='calamine')
        except Exception: continue
        rows = []
        if x.shape[1] >= 5:
            for r in x.itertuples(index=False):
                nm, ch, q = r[0], r[1], r[4]
                if not isinstance(nm, str) or nm.strip() in ('Склад', 'Номенклатура', 'Итого') or not isinstance(q, (int, float)) or q != q: continue
                rows.append([nm.strip(), ch.strip() if isinstance(ch, str) else '', int(q)])
        else:
            for r in x.itertuples(index=False):
                t, q = r[0], r[1]
                if not isinstance(t, str) or not isinstance(q, (int, float)) or q != q or '(' not in t: continue
                mm = re.match(r'^(.*?)\s*\((.*)\)\s*$', t.strip())
                rows.append([mm.group(1), mm.group(2), int(q)] if mm else [t.strip(), '', int(q)])
        if not rows and x.shape[0] < 5: continue
        out = []
        for nm, ch, q in rows:
            c = match(nm); st_rows_tot += 1; st_hit += bool(c)
            out.append([nm, ch, q, c or ''])
            if c:
                s = stock.setdefault(c, {}).setdefault(cc, [0, 0]); s[0] += q; s[1] += 1
        out.sort(key=lambda r: (r[0].lower(), -r[2]))
        mt = os.path.getmtime(os.path.join(SD, f))
        import time
        json.dump({'c': cc, 'n': CITY.get(cc, cc), 'dt': time.strftime('%d.%m.%Y', time.localtime(mt)), 'rows': out, 'x': '/fsu/upload/als-1c/stores/' + f},
                  open(os.path.join(D, 'st', cc + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        cities.append({'c': cc, 'n': CITY.get(cc, cc), 'rows': len(out), 'q': sum(r[2] for r in out), 'm': len({r[0] for r in out}), 'dt': time.strftime('%d.%m.%Y', time.localtime(mt)), 'x': '/fsu/upload/als-1c/stores/' + f})
    order = ['ryazan', 'moscow', 'saint-petersburg', 'nizhny-novgorod', 'samara', 'ekaterinburg', 'krasnodar', 'simferopol', 'almaty', 'karshi']
    cities.sort(key=lambda c: order.index(c['c']) if c['c'] in order else 99)
    site['stock'] = cities
    json.dump(stock, open(os.path.join(D, 'stock.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    # --- подбор по свойствам: данные прежнего podbor.json, адреса → коды каталога ---
    pb = []
    try: pj = json.load(open(os.path.join(BASE, 'podbor.json'), encoding='utf-8'))
    except Exception: pj = []
    codes = {e['c'] for e in idx}
    for r in pj:
        c = (r.get('u') or '').rstrip('/').split('/')[-1]
        if c not in codes: continue
        pb.append({'c': c, 'k': r.get('k') or '', 'op': r.get('op') or '', 'soft': r.get('soft'), 'arm': r.get('arm'), 'm': r.get('m') or [], 'fin': r.get('fin') or '',
                   'w': r.get('w'), 'h': r.get('h'), 'seat': r.get('seat')})
    json.dump(pb, open(os.path.join(D, 'podbor.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    json.dump(site, open(os.path.join(D, 'site.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    for f in ('pages.js', 'pages.css'): shutil.copy2(os.path.join(HERE, 'site', f), os.path.join(N, f))
    # прежний подбор (отдельный файл копии) → новая страница; параметры сохраняются
    open(os.path.join(OUT, 'podbor.html'), 'w', encoding='utf-8').write(
        '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Подбор — Фабрикант</title><script>location.replace("/fsu/podbor"+location.search+location.hash)</script><a href="/fsu/podbor">Подбор по свойствам</a>')
    h = hashlib.md5(ver.encode())
    for f in ('pages.js', 'pages.css'): h.update(open(os.path.join(N, f), 'rb').read())
    h.update(open(os.path.join(D, 'site.json'), 'rb').read()); h.update(open(os.path.join(D, 'stock.json'), 'rb').read())
    rep = {'news': len(news), 'news_body': sum(1 for e in news if e['has']), 'projects': len(projs), 'project_pages': len(pdet), 'stock_cities': len(cities),
           'stock_rows': st_rows_tot, 'stock_matched': st_hit, 'stock_cards': len(stock), 'podbor': len(pb), 'pages': [k for k in ('production', 'documentation', 'vacancies', 'contacts', 'news') if k in site]}
    print('страницы:', json.dumps(rep, ensure_ascii=False))
    return h.hexdigest()[:10]


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser(); ap.add_argument('--base', default='/home/claude/build/fsu'); ap.add_argument('--out', default=os.path.join(HERE, 'out')); O = ap.parse_args()
    BASE = os.path.realpath(O.base); SHELL = os.path.join(BASE, 'old.html') if os.path.exists(os.path.join(BASE, 'old.html')) else os.path.join(BASE, 'index.html')
    SH = open(SHELL, encoding='utf-8').read(); A = json.JSONDecoder().raw_decode(SH[SH.index('var A=') + 6:])[0]
    N = os.path.join(O.out, 'n'); idx = json.load(open(os.path.join(N, 'd', 'idx.json'), encoding='utf-8'))['items']
    print(build(BASE, O.out, N, A, idx, 'x'))
