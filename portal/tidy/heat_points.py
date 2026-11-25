# Теплопункты К1–К15 на карту (2D и 3D) — по списку теплопунктов и генплану с котельными, присланным 20.11.2026 (МСК-62). 26.11.2026
#   python3 heat_points.py <plan.html — основа> <куда положить plan.html и index.html>
import json, math, re, sys, pathlib
sys.path.insert(0, '/home/claude/fabrika/tools'); import live_get as g
SRC = pathlib.Path(sys.argv[1]); OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
p = SRC.read_text(encoding='utf-8'); i3 = g.read('index.html').decode('utf-8')
assert 'class="heatpt"' not in p and 'Теплопункт К7' not in i3
site, _ = json.JSONDecoder().raw_decode(i3[i3.index('{', i3.index('window.T14_SITE=')):])
a = p.index('const DATA=') + 11; D, e = json.JSONDecoder().raw_decode(p[a:]); L0 = D['loc0']; ms = D['geo']['ms']; B3 = {b['k']: b for b in site['buildings']}
PXM = 4.75 * 4967 / 2000; X0, Y0, PX0, PY0 = 454500.0, 1337100.0, 745 * 4967 / 2000, 52 * 4967 / 2000   # крест сетки 454500 / 1337100 на генплане
det = ms[0][0] * ms[1][1] - ms[0][1] * ms[1][0]
def px2svg(px, py):
    X = X0 - (py - PY0) / PXM; Y = Y0 + (px - PX0) / PXM; dx, dy = X - ms[0][2], Y - ms[1][2]
    return (ms[1][1] * dx - ms[0][1] * dy) / det, (-ms[1][0] * dx + ms[0][0] * dy) / det
loc = lambda s: (s[0] + L0[0], L0[1] - s[1])
def inside(pt, poly):
    x, y = pt; c = False
    for j in range(len(poly)):
        (x1, y1), (x2, y2) = poly[j], poly[(j + 1) % len(poly)]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1: c = not c
    return c
def nearest(pt, poly):
    best = None
    for j in range(len(poly)):
        (x1, y1), (x2, y2) = poly[j], poly[(j + 1) % len(poly)]; dx, dy = x2 - x1, y2 - y1; t = max(0, min(1, ((pt[0] - x1) * dx + (pt[1] - y1) * dy) / (dx * dx + dy * dy or 1)))
        f = (x1 + t * dx, y1 + t * dy); d = math.dist(pt, f)
        if best is None or d < best[0]: best = (d, f, (dx, dy))
    return best
cen = lambda k: (sum(q[0] for q in B3[k]['poly']) / len(B3[k]['poly']), sum(q[1] for q in B3[k]['poly']) / len(B3[k]['poly']))
# № : (точка на генплане в пикселях исходного листа | ключ здания-котельной, оборудование по подписи на генплане, что отапливает — по списку)
K = {1: ('kot1', '', 'Трубопрокатный цех (лит. Г)'), 2: ('kot2', '', 'Участок гальваники (лит. В)'), 3: ((3243, 2347), '3 × Ишма-100', 'Участок порошковой покраски (лит. П)'),
     4: ((3837, 1701), '', 'ТПА — основной зал'), 5: ((3204, 2620), '', 'Здание АБК (лит. А)'), 6: ('nGef', '', 'Склад № 1, механический цех (лит. Ж)'), 7: ((1396, 427), '2 × Ишма-100', 'Здания лит. С'),
     8: ((2947, 1480), '', 'Механический цех (лит. Ж)'), 9: ((1248, 1312), '', '«Мебельпромплюс»: бытовые помещения 1–2 этажей; гараж (лит. У)'), 10: ((3763, 2195), '', 'Цех поролона'),
     11: ((3167, 2594), '2 × Ишма-100 и один котёл из К5', 'Каркасный цех (лит. Б)'), 12: ((3927, 1520), '4 × Ишма-100', 'Директорские и операторские кресла, ТПА, швейка (лит. З, И)'),
     13: ((2068, 1940), '2 × Ишма-100', 'Гальваника, ручная покраска, каркасный цех (лит. В, Б)'), 14: ((2406, 1211), '1 × Ишма-100', 'Склад материалов, швейка 2-й этаж'), 15: ((2381, 1707), '2 × Ишма-100', 'Мягкая мебель, столярка (лит. Д, Д1, Е)')}
gd = []; marks = []; rep = []
for n in sorted(K):
    where, eq, serves = K[n]
    if isinstance(where, str): host = where; pt = cen(host)
    else:
        pt = loc(px2svg(*where)); host = next((k for k, b in B3.items() if inside(pt, b['poly']) and not re.match(r'(byt|nav)', k)), None)
        if host is None: host = min(((nearest(pt, b['poly'])[0], k) for k, b in B3.items() if not re.match(r'(byt|nav)', k)))[1]
    d, f, (dx, dy) = nearest(pt, B3[host]['poly']); L = math.hypot(dx, dy) or 1; nx, ny = -dy / L, dx / L
    if inside((f[0] + nx * 0.6, f[1] + ny * 0.6), B3[host]['poly']): nx, ny = -nx, -ny                      # нормаль — наружу
    x3, y3 = f[0] + nx * 0.55, f[1] + ny * 0.55                                                           # шкаф-метка снаружи у ближайшей стены
    name = 'Теплопункт К%d' % n + (' — ' + eq if eq else '')
    note = 'Отапливает: %s. %sМесто — по генплану с котельными (МСК-62), точность ±1–2 м; на модели метка стоит снаружи у ближайшей стены здания «%s». Источник: список теплопунктов и отапливаемых помещений, генплан с котельными — письмо технической службы от 20.11.2026.' % (serves, ('Оборудование по подписи на генплане: ' + eq + '. ') if eq else '', B3[host]['name'])
    gd.append({'name': name, 'x': round(x3, 2), 'y': round(y3, 2), 'z': round((B3[host].get('ground') or 105.5) + 1.2, 2), 'host': host, 'box': {'w': 1.1, 'h': 1.5, 'd': 0.6, 'c': 0xC0392B}, 'note': note, 'heat': n})
    sx, sy = pt[0] - L0[0], L0[1] - pt[1]; marks.append((n, sx, sy, name, serves)); rep.append('К%d: %s · здание %s «%s» · отапливает: %s' % (n, eq or 'оборудование на генплане не подписано', host, B3[host]['name'], serves))
# 3D: в список газового оборудования (слой «Газ»), точечная вставка в JSON страницы
ja = i3.index('"gasdev":[') + 9; arr, je = json.JSONDecoder().raw_decode(i3[ja:]); old = i3[ja:ja + je]
for x in arr:
    if x.get('host') == 'b17': x['host'] = None; rep.append('3D: «Ввод газа в здание» на чужом участке был привязан к несуществующему зданию b17 — привязка снята')
new = json.dumps(arr + gd, ensure_ascii=False, separators=(',', ':')); assert i3.count(old) == 1
(OUT / 'index.html').write_text(i3.replace(old, new), encoding='utf-8')
# 2D: красные метки с номером, подсказка — что отапливает
els = ''.join('<g class="heatpt" data-k="К%d"><title>%s. Отапливает: %s</title><rect x="%.2f" y="%.2f" width="2.6" height="2.6" rx=".4" fill="#c0392b" stroke="#fff" stroke-width=".3"/><text x="%.2f" y="%.2f" font-size="2.3" font-weight="700" fill="#c0392b" stroke="#fff" stroke-width=".5" paint-order="stroke">К%d</text></g>' % (n, nm, sv, sx - 1.3, sy - 1.3, sx + 1.8, sy + 0.9, n) for n, sx, sy, nm, sv in marks)
m = list(re.finditer(r'<text class="blab[^"]*" data-lb="[^"]+"[^>]*>[^<]*</text>', p))[-1]; p = p[:m.end()] + ' ' + els + p[m.end():]
(OUT / 'plan.html').write_text(p, encoding='utf-8')
open('/home/claude/fabrika/work/tidy/heat_points_2511.md', 'w', encoding='utf-8').write('\n'.join('- ' + r for r in rep)); print('\n'.join(rep))
