# «План 2D» = «Модель 3D» (правило Т. В. 25.11.2026): те же объекты, названия, контуры и привязки камер.
# Берёт действующие plan.html и index.html (данные 3D — window.T14_SITE) и дописывает в план недостающее. python3 plan_sync.py <куда положить plan.html и search.json>
import json, math, re, sys, pathlib
sys.path.insert(0, '/home/claude/fabrika/tools'); import live_get as g
OUT = pathlib.Path(sys.argv[1]); (OUT / 'assets').mkdir(parents=True, exist_ok=True)
p = g.read('plan.html').decode('utf-8'); i3 = g.read('index.html').decode('utf-8')
site, _ = json.JSONDecoder().raw_decode(i3[i3.index('{', i3.index('window.T14_SITE=')):])
a = p.index('const DATA=') + 11; D, e = json.JSONDecoder().raw_decode(p[a:]); old_json = p[a:a + e]
B3 = {b['k']: b for b in site['buildings']}; B2 = D['b']; L0 = D['loc0']; ms = D['geo']['ms']; rep = []
sv = lambda pt: [round(pt[0] - L0[0], 2), round(L0[1] - pt[1], 2)]                       # локальные метры 3D → координаты плана
msk = lambda q: [round(ms[0][0] * q[0] + ms[0][1] * q[1] + ms[0][2], 2), round(ms[1][0] * q[0] + ms[1][1] * q[1] + ms[1][2], 2)]
dpath = lambda pts: 'M' + ' L'.join('%.2f %.2f' % (x, y) for x, y in pts) + ' Z'
def card(k):
    b = B3[k]; pts = [sv(q) for q in b['poly']]
    c = {'name': b['name'], 'src': b.get('src'), 'zones': b.get('zones') or [], 'area': b.get('area'), 'lat': b.get('lat'), 'lon': b.get('lon'), 'corners': [msk(q) for q in pts], 'poly': pts, 'cad': b.get('cad') or []}
    for f in ('note', 'lit', 'spec', 'kind', 'parent'):
        if b.get(f) is not None: c[f] = b[f]
    return c
def set_path(k, pts, small=False, new=False):
    global p
    m = re.search(r'<path class="(bld[^"]*)" data-b="%s" d="[^"]*"/>' % re.escape(k), p)
    el = '<path class="%s" data-b="%s" d="%s"/>' % ((m.group(1) if m else 'bld bld-small' if small else 'bld'), k, dpath(pts))
    if m: p = p[:m.start()] + el + p[m.end():]
    else:
        anchor = re.search(r'<path class="bld[^"]*" data-b="b43" d="[^"]*"/>', p); p = p[:anchor.end()] + ' ' + el + p[anchor.end():]
def label(k, text):
    global p
    pts = B2[k]['poly']; n = len(pts); cx = sum(q[0] for q in pts) / n; cy = sum(q[1] for q in pts) / n
    ed = max(((math.dist(pts[j], pts[(j + 1) % n]), j) for j in range(n))); q1, q2 = pts[ed[1]], pts[(ed[1] + 1) % n]
    ang = math.degrees(math.atan2(q2[1] - q1[1], q2[0] - q1[0]));  ang = ang - 180 if ang > 90 else ang + 180 if ang < -90 else ang
    fs = max(2.2, min(5.2, 0.82 * ed[0] / (0.56 * len(text))))
    el = '<text class="blab" data-lb="%s" x="%.2f" y="%.2f" font-size="%.2f" transform="rotate(%.1f %.2f %.2f)">%s</text>' % (k, cx, cy + fs * 0.35, fs, ang, cx, cy + fs * 0.35, text)
    m = re.search(r'<text class="blab" data-lb="%s"[^>]*>[^<]*</text>' % re.escape(k), p)
    if m: p = p[:m.start()] + el + p[m.end():]
    else:
        anchor = re.search(r'<text class="blab" data-lb="b43"[^>]*>[^<]*</text>', p); p = p[:anchor.end()] + ' ' + el + p[anchor.end():]
# 1. бытовки: на плане ключи byt1…byt5, в модели byt11…byt15 (1-й ярус) и byt21…byt25 (2-й ярус на тех же местах)
for n in range(1, 6):
    o, k1, k2 = 'byt%d' % n, 'byt1%d' % n, 'byt2%d' % n
    if o in B2 and k1 in B3:
        assert p.count('data-b="%s"' % o) == 1; p = p.replace('data-b="%s"' % o, 'data-b="%s"' % k1)
        c = card(k1); c['note'] = (c.get('note') or B2[o].get('note') or '') + ' Над ней, вторым ярусом, — «%s».' % B3[k2]['name']
        del B2[o]; B2[k1] = c; rep.append('бытовка %s → %s «%s» (+ 2-й ярус в карточке)' % (o, k1, c['name']))
# 2. контуры, которые в модели разделены или изменены, и объекты, которых на плане не было
for k, b in B3.items():
    if re.match(r'byt2\d$', k): continue
    pts = [sv(q) for q in b['poly']]
    if k not in B2:
        B2[k] = card(k); set_path(k, pts, small=(b.get('area') or 0) < 40, new=True); rep.append('добавлен %s «%s», %s м²' % (k, b['name'], b.get('area')))
    else:
        oldp = B2[k].get('poly') or []
        if len(oldp) != len(pts) or max(abs(x - y) for q, r in zip(oldp, pts) for x, y in zip(q, r)) > 0.3:
            keep = {f: B2[k][f] for f in ('note', 'lit', 'spec', 'kind', 'parent') if f in B2[k]}; B2[k] = {**keep, **card(k)}; set_path(k, pts); rep.append('контур %s «%s» — по модели (%s м²)' % (k, b['name'], b.get('area')))
        elif B2[k].get('name') != b['name']:
            rep.append('название %s: «%s» → «%s»' % (k, B2[k].get('name'), b['name'])); B2[k]['name'] = b['name']
            if b.get('note'): B2[k]['note'] = b['note']
# 3. подписи на плане
for k, t in (('b29', 'Операторские кресла'), ('b29a', 'Транзитный склад'), ('b29c', 'Участок ТПА'), ('b43', 'Металлоизделия'), ('b43g', 'ГКИ'), ('bKN', 'Директорские кресла')):
    if k in B2: label(k, t)
# 4. камеры: привязка к зданию — как в модели
h3 = {c.get('id') or c.get('ip'): c.get('host') for c in site['cams']}
for c in D['cams']:
    k = c.get('id') or c.get('ip')
    if k in h3 and h3[k] != c.get('host') and (h3[k] is None or h3[k] in B2): rep.append('камера %s %s: %s → %s' % (c.get('num') or '', c.get('title') or k, c.get('host'), h3[k])); c['host'] = h3[k]
p = p.replace(old_json, json.dumps(D, ensure_ascii=False), 1); (OUT / 'plan.html').write_text(p, encoding='utf-8')
# 5. поиск: объекты карты
sj = json.loads(g.read('assets/search.json').decode('utf-8')); have = {x['u'] for x in sj}
for x in sj:
    if x.get('u') == 'plan.html#b43': x['t'] = 'Цех металлоизделий'
    if x.get('u') == 'plan.html#b29': x['t'] = 'Участок операторских кресел'
for k in ('b29a', 'b29c', 'b43g', 'bKN', 'b18kn', 'b2kn', 'b66s', 'kotAdm', 'byt11'):
    if k in B2 and 'plan.html#' + k not in have: sj.append({'t': 'Бытовки (10 шт., два яруса)' if k == 'byt11' else B2[k]['name'], 'x': 'Объект на карте', 'u': 'plan.html#' + k, 'g': 'Карта', 'i': 'map', 'c': 'var(--ic-map)'})
(OUT / 'assets' / 'search.json').write_text(json.dumps(sj, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
# проверка: теперь списки совпадают
b2 = set(re.findall(r'<path class="bld[^"]*" data-b="([^"]+)"', p)); want = {k for k in B3 if not re.match(r'byt2\d$', k)}
assert b2 == set(B2) == want, (sorted(b2 ^ want), sorted(set(B2) ^ want))
assert all(B2[k]['name'] == B3[k]['name'] for k in B2)
open('/home/claude/fabrika/work/tidy/plan_sync_2511.md', 'w', encoding='utf-8').write('\n'.join('- ' + r for r in rep))
print('\n'.join(rep)); print('ИТОГ: на плане', len(b2), 'контуров = карточек', len(B2), '= объектов модели без 2-го яруса бытовок', len(want), '· правок', len(rep))
