#!/usr/bin/env python3
"""22.11.2026, Т. В.: «цвета не меняются» — цвета обивки по исполнениям из остатков 1С (страница «Остатки», build/fsu/n/d/pg/st/*.json).
Строка остатка: [модель, «Кожа иск., DO, №350 (черный) , ТГ, …», шт, код] → материал DO, цвет «№350 (черный)».
Итог — assort/colors.json: {код: {материал: [[цвет, шт], …по убыванию шт]}}; build_new.py кладёт его в карточку (cd['col']).
  python3 fsu_colors.py"""
import json, glob, os, re, collections
H = os.path.dirname(os.path.abspath(__file__))
MATS = ['ECO Style', 'ECO', 'DO', 'PV', 'Hugo', 'Alliance', 'Крафт', 'SC', 'Nappa', 'Teddy', 'Velur', 'VL', 'TW', 'S', 'BOOM', 'Bolton', 'Rio', 'Monolith', 'Malta', 'Zara']
acc = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
for f in glob.glob('/home/claude/build/fsu/n/d/pg/st/*.json'):
    for r in json.load(open(f, encoding='utf-8')).get('rows', []):
        if len(r) < 4 or not r[3]: continue
        parts = [p.strip() for p in str(r[1]).split(',')]
        for i, p in enumerate(parts[:-1]):
            if p in MATS or re.fullmatch(r'[A-Z][A-Za-z ]{1,12}', p or ''):
                col = parts[i + 1]
                if re.search(r'№|\(|^v ?\d|^\d', col):
                    acc[r[3]][p][re.sub(r'\s+', ' ', col).strip()] += int(r[2] or 0)
                break
out = {c: {m: v.most_common() for m, v in mm.items()} for c, mm in acc.items()}
json.dump(out, open(os.path.join(H, 'assort', 'colors.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(out), 'моделей с цветами;', {k: out.get(k) for k in ('samba-box4-stul', 'atlant-kreslo-1030986919', 'milan-kreslo')})
