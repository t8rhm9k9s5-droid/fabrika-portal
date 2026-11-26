# Прайс-лист 28.10.2026 по колонкам базисов отгрузки (легенда, стр. 3 PDF): I — Рязань, Москва; II — Краснодар, Сотрудник14 Имя3; III — Самара; IV — Екатеринбург; V — Крым. Цены с НДС. 26.11.2026
import re, json, pandas as pd
XL = '/home/claude/fabrika/src/Исходники/library/raw/prices/prais_2026-10-28.xlsx'
REG = {'Рязань': 'I', 'Москва': 'I', 'Краснодар': 'II', 'Сотрудник14 Имя3': 'II', 'Самара': 'III', 'Екатеринбург': 'IV', 'Симферополь': 'V', 'Крым': 'V'}
SPEC = ['Обивка', 'Цвет каркаса', 'Механизм', 'Подлокотники', 'Опора', 'Ролики', 'Доп. свойства']
def num(v):
    try: x = float(str(v).replace(' ', '').replace(',', '.'))
    except ValueError: return None
    return x if x == x and x > 0 else None          # NaN и нули — нет цены
def clean(v): s = str(v).strip(); return '' if s in ('nan', '-', '—', '') else s
CANON = ['обивка', 'цвет каркаса', 'механизм', 'подлокотники', 'опора', 'ролики', 'доп. свойства']
def load():
    """Каждый лист разобран по своей шапке (строки 1–2): колонки исполнения и цен I–V у листов разные."""
    rows = []
    for sh, df in pd.read_excel(XL, sheet_name=None, header=None, engine='calamine').items():
        h0 = [str(x).strip() for x in df.iloc[0].tolist()]; h1 = [str(x).strip() for x in df.iloc[1].tolist()]
        col = {k: h1.index(k) for k in ('I', 'II', 'III', 'IV', 'V') if k in h1}
        mc = h1.index('Модель'); kc = h0.index('КРАТНОСТЬ'); nd = next((j for j, x in enumerate(h0) if 'без ндс' in x.lower()), None)
        fields = [(j, h1[j].lower()) for j in range(kc + 1, col['I']) if h1[j] not in ('nan', '')]
        for i in range(3, len(df)):
            r = df.iloc[i].tolist(); name = clean(r[mc])
            if not name: continue
            pr = {k: num(r[c]) for k, c in col.items()}
            if not any(pr.values()): continue
            f = {n: clean(r[j]) for j, n in fields}
            rows.append({'sheet': sh, 'row': i + 1, 'model': name, 'mult': clean(r[kc]), 'f': f,
                         'spec': [f.get(n, '') for n in CANON] + [v for n, v in f.items() if n not in CANON], 'pr': pr, 'nonds': num(r[nd]) if nd is not None and nd < len(r) else None})
    return rows
LAT = str.maketrans('авекмнорстух', 'abekmhopctyx')
def nk(s): return re.sub(r'\s+', ' ', re.sub(r'[^a-zа-я0-9+ ]+', ' ', str(s).lower().replace('ё', 'е'))).strip()
def nl(s): return nk(s).translate(LAT)                     # кириллица и латиница одного вида — одинаково (ТК = TK)
def score(r, ch):
    t = set(nl(ch).split()); sc = 0; sp = r['spec']
    alts = [nl(x).split() for x in re.split(r'/', sp[0]) if nl(x)] if sp[0] else []
    if alts and any(a and a[0] in t for a in alts): sc += 2                                  # обивка (ткань, ECO, DO, Velur…)
    if alts and any(len(a) > 1 and set(a[1:3]) <= t for a in alts): sc += 1                   # и номер ткани
    fr = [nl(x) for x in re.split(r'/', sp[1]) if nl(x)] if sp[1] else []
    if fr and any(set(f.split()) <= t for f in fr): sc += 2                                   # цвет каркаса
    for x in sp[2:5]:
        if x and set(nl(x).split()) <= t: sc += 1                                            # механизм, подлокотники, опора
    return sc
def find(rows, model, ch=''):
    """Строка прайса для модели и исполнения со склада (ch — «Ткань, Velutto, №32, BL»). → (строка, 'исполнение' | 'базовое')"""
    k = nk(model); cand = [r for r in rows if nk(r['model']) == k and r['pr'].get('I')]
    if not cand:
        cut = lambda x: re.sub(r' (new|кресло|стул)\b', '', x); cand = [r for r in rows if cut(nk(r['model'])) == cut(k) and r['pr'].get('I')]
    if not cand: return None, ''
    best = max(cand, key=lambda r: (score(r, ch), -(r['pr']['I'] or 1e9)))
    return best, ('исполнение' if score(best, ch) >= 4 or (len(cand) == 1 and score(best, ch) >= 2) else 'базовое')
if __name__ == '__main__':
    R = load(); json.dump(R, open('/home/claude/fabrika/work/pricelist/price_2810.json', 'w', encoding='utf-8'), ensure_ascii=False)
    same = [r for r in R if len({r['pr'][c] for c in ('I', 'II', 'III', 'IV')} - {None}) == 1]
    nonds = sum(1 for r in R if r['nonds'])
    print('строк прайса', len(R), '· по листам', dict(__import__('collections').Counter(r['sheet'] for r in R)), '· «без НДС» заполнена в', nonds, '· одинаковая цена в I–IV:', len(same), '· во всех I–V:', sum(1 for r in R if len(set(r['pr'].values()) - {None}) == 1))
    for r in same[:12]: print('   ', r['sheet'], r['row'], r['model'], r['spec'][0], r['pr'])
