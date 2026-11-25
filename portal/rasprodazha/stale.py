#!/usr/bin/env python3
"""Застойные остатки по складам (25.11.2026, Т. В.: «помоги Сотрудник8 с декабрьскими распродажами — застойные сегменты и модели на складах»).
Источник — отчёт 1С «Товары на складах» за октябрь и ноябрь (робот, st/smv.bin → work/live_pull/stj/smv.json): по каждой позиции
[начало, приход, расход, конец]. Застой 2 мес. — остаток на конец ноября есть, расхода не было ни в октябре, ни в ноябре (позиция была уже в октябре).
Застой 1 мес. — расхода не было в ноябре. Медленно — расход за 2 месяца меньше 15 % остатка. Цена — прайс 28.10 (мин. цена модели, prais_rows.json).
→ out/stale.json"""
import json, re, os, collections
H = os.path.dirname(os.path.abspath(__file__))
D = json.load(open('/home/claude/fabrika/work/live_pull/stj/smv.json', encoding='utf-8'))
M = {m['m']: m for m in D['months']}
PR = json.load(open('/home/claude/fabrika/work/fsu/assort/prais_rows.json', encoding='utf-8'))
def nk(s): return re.sub(r'[^a-zа-я0-9]+', ' ', str(s).lower().replace('ё', 'е')).strip()
price = collections.defaultdict(list)
for r in PR:
    if r.get('p1'): price[nk(r['m'])].append(r['p1'])
def pr(model):
    k = nk(model)
    if k in price: return min(price[k])
    c = [v for kk, v in price.items() if kk.startswith(k) or k.startswith(kk)]
    return min(min(x) for x in c) if c else None
def flat(m):
    out = {}
    for g in m['g']:
        for w in g['w']:
            for t in w.get('t', []):
                for mm in t.get('m', []):
                    for c in mm.get('c', []):
                        out[(g['n'], w['n'], t['n'], mm['n'], c[0])] = c[1:5]
    return out
N, O = flat(M['2026-11']), flat(M['2026-10'])
rows = []
for k, v in N.items():
    reg, wh, grp, model, ch = k; o0, i1, x1, c1 = v
    if c1 <= 0: continue
    if re.search(r'рекламац|брак', wh, re.I): continue
    ov = O.get(k); x0 = ov[2] if ov else None
    st = 'ok'
    if x1 == 0 and ov is not None and x0 == 0 and (ov[0] > 0 or ov[3] > 0): st = '2мес'
    elif x1 == 0 and o0 > 0: st = '1мес'
    elif (x1 + (x0 or 0)) < 0.15 * c1 and o0 > 0: st = 'медленно'
    p = pr(model)
    rows.append({'reg': reg, 'wh': wh, 'grp': grp, 'model': model, 'ch': ch, 'q': c1, 'out11': x1, 'out10': x0, 'in11': i1, 'st': st, 'p': p, 'sum': round(c1 * p) if p else None})
json.dump(rows, open(os.path.join(H, 'out_stale.json'), 'w', encoding='utf-8'), ensure_ascii=False)
tot = collections.defaultdict(lambda: collections.Counter())
for r in rows:
    tot[r['reg']]['q'] += r['q']; tot[r['reg']]['q_' + r['st']] += r['q']; tot[r['reg']]['s_' + r['st']] += r['sum'] or 0; tot[r['reg']]['s'] += r['sum'] or 0
print('регион | остаток шт | без движения 2 мес (шт, ₽ по прайсу) | 1 мес | медленно | без цены, поз.')
for reg, c in sorted(tot.items(), key=lambda x: -x[1]['q']):
    print('%s | %d | %d шт, %.1f млн | %d шт, %.1f млн | %d шт | %d' % (reg, c['q'], c['q_2мес'], c['s_2мес'] / 1e6, c['q_1мес'], c['s_1мес'] / 1e6, c['q_медленно'], sum(1 for r in rows if r['reg'] == reg and r['p'] is None)))
