#!/usr/bin/env python3
"""Презентация «Со склада» по застойным остаткам одного склада: python3 deck_stock.py "Рязань" [N моделей]   (данные — work/rasprodazha/out_stale.json)"""
import sys, json, re, collections
sys.path.insert(0, '/home/claude/fabrika/work/pricelist'); import price_cols as PC
PR = json.load(open('/home/claude/fabrika/work/pricelist/price_2810.json', encoding='utf-8'))
sys.path.insert(0, '/home/claude/fabrika/work/prez'); import prez as P
reg = sys.argv[1]; N = int(sys.argv[2]) if len(sys.argv) > 2 else 12
R = [r for r in json.load(open('/home/claude/fabrika/work/rasprodazha/out_stale.json')) if r['reg'] == reg and r['st'] in ('2мес', '1мес') and not re.search('выставк|маркетплейс', r['wh'], re.I)]
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
agg = collections.defaultdict(lambda: {'q': 0, 's': 0, 'v': collections.Counter()})
for r in R:
    if r['st'] != '2мес': continue
    a = agg[r['model']]; a['q'] += r['q']; a['s'] += r['sum'] or 0; a['v'][r['ch']] += r['q']
top = [(m, a, find(m)) for m, a in sorted(agg.items(), key=lambda x: -x[1]['s'])]
top = [t for t in top if t[2] and t[1]['q'] >= 5][:N]
city = reg.replace('ОП ', '').replace(' Денежниково', '')
loc = {'Рязань': 'в Рязани', 'Москва': 'в Москве', 'Самара': 'в Самаре', 'Краснодар': 'в Краснодаре', 'Екатеринбург': 'в Екатеринбурге', 'Сотрудник14 Имя3': 'в Сотрудник14 Имя3', 'Симферополь': 'в Симферополе'}[city]
def short(ch):
    ch = re.sub(r'Ткань, |Кожа иск\., ', lambda m: 'ткань ' if 'Ткань' in m.group(0) else 'иск. кожа ', ch); return ch[:58]
sl = [P.s_cover('Мебель со склада %s' % loc, 'Кресла и стулья «Фабрикант», которые можно отгрузить сразу: без ожидания производства, по прайс-листу, со специальными условиями в декабре.', 'Декабрь 2026', 'ГК «Фабрикант» · +7 000 000-00-14 · fabrikant.su', P.img(P.card(top[0][2]['c'])['th']['day'], '') if (P.card(top[0][2]['c']).get('th') or {}).get('day') else None),
      P.s_text('Коротко', 'Что в этой подборке', '%d моделей, которые лежат на складе %s и готовы к отгрузке в день оплаты. Цены — по действующему прайс-листу; на объём и на комплект действуют декабрьские условия.' % (len(top), loc),
               boxes=[('Сразу со склада', 'Не нужно ждать производства: срок — только доставка.', '1'), ('Проверенные модели', 'Серийные изделия собственного производства, гарантия завода.', '2'), ('Условия декабря', 'Специальная цена на партию — уточняйте у менеджера.', '3')])]
PRICES = []
for m, a, e in top:
    vs = ', '.join('%s — %d шт.' % (short(c), q) for c, q in a['v'].most_common(3))
    ch0 = a['v'].most_common(1)[0][0]; row, how = PC.find(PR, m, ch0); col = PC.REG.get(city, 'I'); pv = row and row['pr'].get(col)
    ex = ', '.join(x for x in (row['spec'] if row else []) if x)[:60]
    lab = 'колонка %s прайс-листа 28.10.2026 (%s), с НДС · %s' % (col, city, ('за исполнение со склада: ' + short(ch0)) if how == 'исполнение' else 'базовое исполнение по прайсу — точную цену исполнения со склада назовёт менеджер') if pv else ''
    PRICES.append((m, ch0, col, pv, how, ex))
    sl.append(P.s_model(e['c'], stock='На складе %s: <b>%d шт.</b><br>%s' % (loc, a['q'], P.esc(vs)), price=(pv, lab) if pv else None, show_price=bool(pv)))
sl.append(P.s_text('Как заказать', 'Отгрузим в день оплаты', bullets=['Выберите модели и количество — менеджер подтвердит наличие и исполнение.', 'Специальная цена декабря действует на партию и на комплект из нескольких моделей.', 'Доставка транспортной компанией или самовывоз со склада %s.' % loc, 'Телефон +7 000 000-00-14, сайт fabrikant.su.'],
                   small='Наличие указано на 24.11.2026 и меняется каждый день. Цены — по прайс-листу от 28.10.2026, колонка %s (базис отгрузки %s), с НДС.' % (PC.REG.get(city, 'I'), city)))
print(P.build('Со_склада_%s_декабрь_2026' % city.replace(' ', '_'), sl), len(sl), 'слайдов;', [(m, a['q']) for m, a, e in top])

json.dump(PRICES, open('/home/claude/fabrika/work/prez/out/_prices_%s.json' % city.replace(' ', '_'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
