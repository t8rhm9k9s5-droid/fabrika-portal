#!/usr/bin/env python3
"""Презентация распродажи склада офиса продаж по списку, согласованному Т. В. (списки Сотрудник8 М. И. от 16.11.2026: work/rasprodazha/traush_lists.json).
  python3 deck_sale.py Самара|Краснодар|Екатеринбург    Цены — из списка: «Цена» и, где есть, «Цена со скидкой»."""
import sys, json, re, collections
sys.path.insert(0, '/home/claude/fabrika/work/prez'); import prez as P
reg = sys.argv[1]; L = json.load(open('/home/claude/fabrika/work/rasprodazha/traush_lists.json'))[reg]
def nk(s): return re.sub(r'\s+', ' ', re.sub(r'[^a-zа-я0-9+ ]+', ' ', str(s).lower().replace('ё', 'е'))).strip()
STOP = {'кресло', 'стул', 'box2', 'box4', 'box5', 'new', 'диван', 'табурет', 'х', 'мест', 'полубар', 'бар'}
cards = {}
for e in P.IDX.values(): cards.setdefault(nk(e['n']), e)
def find(model):
    k = nk(model)
    if k in cards: return cards[k]
    k2 = ' '.join(t for t in k.split() if t not in STOP)
    for n, e in cards.items():
        if ' '.join(t for t in n.split() if t not in STOP) == k2: return e
G = collections.OrderedDict(); tot_q = 0; tot_s = 0
for r in L:
    nm = str(r['Товары (работы, услуги)']); m = re.match(r'^(.*?)\s*\((.*)\)\s*$', nm, re.S)
    model, var = (m.group(1).strip(), m.group(2).strip()) if m else (nm.strip(), '')
    q = int(r.get('Кол-во') or 0); p = r.get('Цена'); ps = r.get('Цена со скидкой')
    G.setdefault(model, []).append((var, q, p, ps)); tot_q += q; tot_s += (ps or p or 0) * q
loc = {'Самара': 'в Самаре', 'Краснодар': 'в Краснодаре', 'Екатеринбург': 'в Екатеринбурге'}[reg]
def table(rows):
    has = any(r[3] for r in rows)
    h = '<table class="sale"><tr><th>Исполнение</th><th class="n">На складе</th><th class="n">%s</th></tr>' % ('Цена → распродажа' if has else 'Цена распродажи')
    for var, q, p, ps in rows:
        price = ('<s>%s</s>%s<span class="pc">−%d %%</span>' % (P.rub(p).replace(' ₽', ''), P.rub(ps), round((1 - ps / p) * 100)) if ps and p else P.rub(p) if p else '—')
        h += '<tr><td>%s</td><td class="n">%d шт.</td><td class="p">%s</td></tr>' % (P.esc(var[:120]), q, price)
    return h + '</table>'
first = next((find(m) for m in G if find(m)), None); c0 = P.card(first['c']) if first else None
ph = P.img(((c0.get('th') or {}).get('day') or c0['ph'][0]['k']), '') if c0 else None
sl = [P.s_cover('Распродажа склада %s' % loc, 'Кресла и стулья «Фабрикант» со склада офиса продаж: цены распродажи, количество ограничено остатком.', 'Декабрь 2026', 'ГК «Фабрикант» · +7 000 000-00-14 · fabrikant.su', ph),
      P.s_text('Коротко', 'Что в распродаже', '%d моделей, %d исполнений, %d шт. на складе %s. Отгрузка в день оплаты, цены действуют, пока товар есть на складе.' % (len(G), len(L), tot_q, loc),
               boxes=[('Со склада', 'Товар лежит на складе офиса: срок — только доставка.', '1'), ('Цена распродажи', 'Цена указана у каждого исполнения, с НДС.', '2'), ('Пока есть остаток', 'Количество — по каждому исполнению; повторной поставки по этим ценам не будет.', '3')])]
nophoto = []
for model, rows in G.items():
    e = find(model)
    if not e: nophoto += [(model + ' — ' + v, q, p, ps) for v, q, p, ps in rows]; continue
    for i in range(0, len(rows), 5):
        sl.append(P.s_model(e['c'], stock=table(rows[i:i + 5]), why='Распродажа' + (' (продолжение)' if i else ''), show_price=False, max_specs=6 if len(rows[i:i + 5]) > 2 else 8))
for i in range(0, len(nophoto), 12):
    sl.append('<div class="kick">Распродажа</div><h2>Ещё на складе %s</h2>%s' % (loc, table(nophoto[i:i + 12])))
sl.append(P.s_text('Дальше', 'Как заказать', bullets=['Назовите менеджеру модель, исполнение и количество — он выставит счёт по цене распродажи.', 'Отгрузка со склада %s в день оплаты, самовывоз или доставка.' % loc, 'Количество ограничено остатком на складе на 16.11.2026; наличие уточняйте у менеджера.'], small='ГК «Фабрикант» · +7 000 000-00-14 · fabrikant.su · цены с НДС'))
print(P.build('Распродажа_%s_декабрь_2026' % reg, sl), len(sl), 'слайдов; моделей', len(G), 'без карточки', len(nophoto), 'шт', tot_q, 'сумма', round(tot_s))
