#!/usr/bin/env python3
"""21.11.2026 (Т. В.: «разделы сайта не прогружены» — «для офиса», «HoReCa» пустые): индекс фильтров каталога для копии «Сайта».
Для каждого значения каждого фильтра (тип, назначение, коллекция, популярно, цвет, материал) берём список товаров с fabrikant.su.
Выход: <out>/_fidx.json = {items:{id:товар}, order:[id], v:{код:{значение:[id]}}}. Service Worker по нему отвечает на любые сочетания фильтров.
  python3 fsu_fidx.py <файл getFilter.json> <out-папка>"""
import sys, os, json, time, urllib.request, urllib.parse
F = json.load(open(sys.argv[1], encoding='utf-8')); OUT = sys.argv[2]
B = 'https://fabrikant.su/api/v1/?action=products.getItemsShortByFilter&lang=ru&withTotal=true&page=1&pageSize=400&filter='
import hashlib
CACHE = os.path.join(OUT, 'c', time.strftime('%Y-%m-%d')); os.makedirs(CACHE, exist_ok=True)   # 21.11.2026 (Рекс CG-56): ответы годны только в день обхода
def get1(flt, page):   # ответы сохраняются: обрыв связи — повтор только недостающих
    key = os.path.join(CACHE, hashlib.md5(('%s|%d' % (json.dumps(flt, sort_keys=True), page)).encode()).hexdigest() + '.json')
    if os.path.exists(key): return json.load(open(key, encoding='utf-8'))
    d = get1n(flt, page); json.dump(d, open(key, 'w', encoding='utf-8'), ensure_ascii=False); return d
def get1n(flt, page):   # curl с жёстким сроком: зависшее соединение через прокси не держит обход
    u = B.replace('page=1&pageSize=400', 'page=%d&pageSize=100' % page) + urllib.parse.quote(json.dumps(flt, ensure_ascii=False, separators=(',', ':')))
    import subprocess
    for i in range(8):
        r = subprocess.run(['curl', '-s', '-m', '30', '-A', 'Mozilla/5.0', u], capture_output=True)
        try: return json.loads(r.stdout.decode('utf-8'))
        except Exception: time.sleep(1 + 2 * i)
    raise SystemExit('нет ответа сайта: %s стр. %d' % (flt, page))
def get(flt):   # постранично по 100: большие ответы обрывались
    d = get1(flt, 1); its = list(d['items']); n = d.get('total', len(its)); p = 1
    while len(its) < n and p < 60:
        p += 1; more = get1(flt, p)['items']
        if not more: break
        its += more
    if len(its) < n: raise SystemExit('неполная выдача сайта: %s — %d из %d' % (flt, len(its), n))   # 21.11.2026 (Рекс CG-56): неполный индекс не сохраняем
    return its
items, v = {}, {}
inputs = []
def walk(o):
    for x in o.get('inputs', []):
        if x.get('selectValues'): inputs.append(x)
        walk(x)
walk(F)
for x in inputs:
    v[x['code']] = {}
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(6) as ex: got = list(ex.map(lambda sv: get({x['code']: [sv['code']]}), x['selectValues']))
    for sv, its in zip(x['selectValues'], got):
        v[x['code']][sv['code']] = [it['id'] for it in its]; print(' ', x['code'], sv['code'], len(its), file=sys.stderr, flush=True)
        for it in its: items.setdefault(str(it['id']), it)
    print(x['code'], len(x['selectValues']), file=sys.stderr)
# порядок — как на сайте без фильтров: по типам продукта в порядке сайта, внутри — как отдал сайт
order, seen = [], set()
for sv in next(x for x in inputs if x['code'] == 'miblock-section-id')['selectValues']:
    for i in v['miblock-section-id'][sv['code']]:
        if i not in seen: seen.add(i); order.append(i)
for k in items:
    if int(k) not in seen: order.append(int(k))
json.dump({'items': items, 'order': order, 'v': v, 't': time.strftime('%Y-%m-%dT%H:%M')}, open(OUT + '/_fidx.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('товаров', len(items), 'значений', sum(len(a) for a in v.values()))
