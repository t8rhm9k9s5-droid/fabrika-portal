#!/usr/bin/env python3
"""21.11.2026: положить индекс фильтров в копию «Сайта»: адреса фото → /fsu/, порядок — как в сохранённой выдаче сайта без фильтров.
  python3 fsu_fidx_put.py <_fidx.json от fsu_fidx.py> <папка копии, например /home/claude/build/fsu>"""
import sys, json, re, os, urllib.parse as up
SRC, FSU = sys.argv[1], sys.argv[2]
X = json.load(open(SRC, encoding='utf-8'))
t = open(os.path.join(FSU, 'index.html'), encoding='utf-8').read()
A = json.JSONDecoder().raw_decode(t.split('var A=', 1)[1])[0] if 'var A=' in t else {}   # карты ещё нет — порядок как отдал сайт
pg = []
for k, h in A.items():
    if 'getItemsShortByFilter' in k and 'filter=%7B%7D' in k and 'sectionId' not in k:
        m = re.search(r'[?&]page=(\d+)', k)
        if m: pg.append((int(m.group(1)), h))
order, seen = [], set()
for _, h in sorted(pg):
    for it in json.load(open(os.path.join(FSU, '_api', h + '.json'), encoding='utf-8')).get('items', []):
        if it['id'] not in seen: seen.add(it['id']); order.append(it['id'])
for i in X['order']:
    if i not in seen: seen.add(i); order.append(i)
X['order'] = [i for i in order if str(i) in X['items']]
s = json.dumps(X, ensure_ascii=False, separators=(',', ':'))
s = re.sub(r'https?:(?:\\?/){2}(?:www\.)?fabrikant\.su(?:\\?/)', '/fsu/', s)
s = re.sub(r'"/(upload|f)/', r'"/fsu/\1/', s)
open(os.path.join(FSU, '_api', '_fidx.json'), 'w', encoding='utf-8').write(s)
miss = sorted({m for m in re.findall(r'"(/fsu/upload/[^"]+)"', s) if not os.path.exists(os.path.join(FSU, m[5:]))})
print('товаров', len(X['items']), 'в порядке сайта', len(seen & {int(k) for k in X['items']}), 'КБ', len(s) // 1024, 'фото нет в копии', len(miss))
