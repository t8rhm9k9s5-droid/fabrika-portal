#!/usr/bin/env python3
"""28.11.2026 (задача №439) — данные «Подбора в 4 вопроса» сайта techfabrikant.ru/fsu/podbor: n/d/pw.json.
Вопросы: где будет стоять (пространство) → для чего (роль) → обивка → бюджет за 1 шт. Правила — здесь, страница (app.js, vPick) только считает и показывает.
Источники: idx (элементы idx.json: группа, подразделы, метки назначения, f.obivka, mat, sp), карточки (cards[код]['pr'] — исполнения по прайсу 28.10 с ценой),
прежний podbor.json копии (обивка «экокожа/ткань/велюр…» и «мягкое: нет»).
В сборке: work/fsu2/build_new.py — `import podbor_wizard; podbor_wizard.build(BASE, N, idx, cards)` до подсчёта версии (ver), pw.json — в хеш версии.
Отдельно для проверки: python3 podbor_wizard.py --idx <idx.json> --cards <папка p> --base <копия fsu с podbor.json> --out <pw.json>"""
import json, os, re

# обивка: коды исполнений прайса → вид (проверено по совпадению с f.obivka и podbor.json на 271 модели с ценой, 28.11.2026)
OB_CODE = {'eco': 'ekokozha', 'do': 'ekokozha', 'boom': 'ekokozha', 'nappa': 'ekokozha', 'sc': 'kozha',
           'velur': 'tkan', 'vl': 'tkan', 'hugo': 'tkan', 'tk': 'tkan', 'тк': 'tkan', 'мебельная': 'tkan', 'alliance': 'tkan', 'крафт': 'tkan', 'pv': 'tkan',
           'teddy': 'tkan', 'buckle': 'tkan', 'prisma': 'tkan', 'mega': 'tkan', 'sherlock': 'tkan', 'kids': 'tkan', 'tw': 'setka', 's': 'setka'}
OB_WORD = [(r'натуральн', 'kozha'), (r'экокож|кожа иск|искусств', 'ekokozha'), (r'^кожа$', 'kozha'), (r'ткань|велюр|рогожк|букле|шенилл', 'tkan'), (r'сетк', 'setka')]
SKIP_G = ('materialy', 'komplektuyushchie')


def _ob_word(w):
    w = str(w).lower().strip()
    for rx, k in OB_WORD:
        if re.search(rx, w): return k
    return None


def roles(x):
    """Для чего: rab — рабочее место, ruk — руководитель, pos — посетители и переговоры, ozh — ожидание и отдых,
    gost — гости за столом, bar — барная стойка, ucheb — ученики и дети, stol — столы, aks — вешалки и урны."""
    g, s, ss, pur, nm = x['g'], x.get('s') or '', set(x.get('ss') or []), set(x.get('pur') or []), x['n'].lower()
    has = lambda *a: any(t == s or t in ss for t in a)
    R = set()
    if g == 'kresla':
        if has('kompyuternye', 'operatorskie', 'igrovye') or pur & {'компьютерное', 'для кассиров'}: R.add('rab')
        if has('rukovoditelya') or 'для руководителя' in pur: R.add('ruk')
        if has('posetiteley') or 'конференц-зал' in pur: R.add('pos')
        if has('detskie'): R.add('ucheb')
    elif g == 'stulya':
        if has('ofisnye'): R.add('pos')
        if has('kafe', 'derevyannye', 'taburety'): R.add('gost')
        if has('barnye') or 'барные' in pur: R.add('bar')
        if has('sektsii') or (has('ofisnye') and 'для холла' in pur): R.add('ozh')
        if has('uchenicheskie') or pur & {'учебное', 'школа', 'в аудиторию'}: R.add('ucheb')
        if 'конференц-зал' in pur: R.add('pos')
    elif g == 'myagkaya-mebel': R.add('ozh')
    elif g == 'zaly':
        if s != 'chasti': R.add('ozh')
    elif g == 'medicina':
        R.add('rab' if re.search(r'кушетк|кровать|хокер|сфера|мяч|медицинск', nm) else 'ozh')
    elif g == 'detskaya-i-shkolnaya': R.add('ucheb')
    elif g == 'stoly': R.add('ucheb' if s == 'uchenicheskie' else 'stol')
    elif g == 'aksessuary': R.add('ozh' if s == 'banketki' else 'aks')
    return R


def spaces(x, R):
    """Где будет стоять: метки назначения idx (sp) + правила по роли и группе — у 242 моделей своих меток нет (28.11.2026)."""
    g, s = x['g'], x.get('s') or ''
    S = set(x.get('sp') or [])
    soft = g == 'myagkaya-mebel'
    sek = 'sektsii' in (x.get('ss') or []) or s == 'sektsii'
    if R & {'rab', 'ruk', 'pos'} and g in ('kresla', 'stulya') or soft or sek or 'stol' in R or 'aks' in R: S.add('ofis')
    if R & {'gost', 'bar'} or soft or 'stol' in R or 'aks' in R: S.add('horeca')
    if R & {'gost', 'bar'} or g == 'kresla' and R & {'rab', 'ruk', 'ucheb'} or soft or 'stol' in R or g == 'detskaya-i-shkolnaya' and s == 'detskaya': S.add('dom')
    if 'ucheb' in R or sek or g == 'zaly' and s != 'chasti' or 'aks' in R: S.add('shkoly')
    if g == 'medicina' or sek or g == 'zaly' and s == 'na-balke' or g == 'aksessuary': S.add('medicina')
    if g == 'zaly' and s != 'chasti' or sek or soft or g == 'aksessuary' or g == 'medicina' and 'ozh' in R or 'ozh' in R and g == 'stulya': S.add('zaly-ozhidaniya')
    return S


def obivka(x, card, pb):
    O = set(x.get('f', {}).get('obivka') or [])
    O.discard('plastik')
    for m in x.get('mat') or []:
        k = _ob_word(m)
        if k: O.add(k)
    for m in (pb or {}).get('m') or []:
        k = _ob_word(m)
        if k: O.add(k)
    for r in (card or {}).get('pr') or []:
        for t in re.split(r'\s*\+\s*', str(r[1].get('Обивка') or '')):
            t = re.split(r'[\s(№]', t.strip().lower())[0]
            if t in OB_CODE: O.add(OB_CODE[t])
    # без обивки: пластик/дерево — по f.obivka «пластик» без мягкого исполнения, «мягкое: нет» в podbor.json, столы и аксессуары
    if 'plastik' in (x.get('f', {}).get('obivka') or []) or (pb or {}).get('soft') == 0: O.add('bez')
    return O


def price(card):
    p = [r[0] for r in (card or {}).get('pr') or [] if isinstance(r[0], (int, float)) and r[0] > 0]
    return int(min(p)) if p else None


def price_ob(card):
    """Цена «от» по виду обивки: у одной модели экокожа и ткань стоят по-разному — бюджет считаем по выбранной обивке."""
    po = {}
    for r in (card or {}).get('pr') or []:
        if not (isinstance(r[0], (int, float)) and r[0] > 0): continue
        for t in re.split(r'\s*\+\s*', str(r[1].get('Обивка') or '')):
            k = OB_CODE.get(re.split(r'[\s(№]', t.strip().lower())[0])
            if k and (k not in po or r[0] < po[k]): po[k] = int(r[0])
    return po


def make(idx, cards, pbrows):
    pbm = {r['c']: r for r in pbrows if r.get('c')}
    out = {}
    for x in idx:
        if x['g'] in SKIP_G or not x.get('i'): continue   # материалы, комплектующие и модели без фото в подбор не идут
        R = roles(x)
        if not R: continue
        S = spaces(x, R)
        if not S: continue
        e = {'s': sorted(S), 'r': sorted(R)}
        if not R & {'stol', 'aks'}:
            O = obivka(x, cards.get(x['c']), pbm.get(x['c']))
            if O: e['o'] = sorted(O)
        p = price(cards.get(x['c']))
        if p: e['p'] = p
        po = price_ob(cards.get(x['c']))
        if p and len(set(po.values())) > 1: e['po'] = po   # только если по обивке цены разные
        out[x['c']] = e
    return {'v': 1, 'r': out}


def _pb(BASE, codes):   # прежний podbor.json копии: адрес → код (как pages_new.py)
    try:
        with open(os.path.join(BASE, 'podbor.json'), encoding='utf-8') as f: pj = json.load(f)
    except Exception: return []
    o = []
    for r in pj:
        c = r.get('c') or (r.get('u') or '').rstrip('/').split('/')[-1]
        if c in codes: o.append(dict(r, c=c))
    return o


def build(BASE, N, idx, cards):
    """Вызов из build_new.py: пишет N/d/pw.json, возвращает короткий отчёт."""
    pw = make(idx, cards, _pb(BASE, {e['c'] for e in idx}))
    p = os.path.join(N, 'd', 'pw.json')
    with open(p + '.tmp', 'w', encoding='utf-8') as f: json.dump(pw, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(p + '.tmp', p)
    R = pw['r'].values()
    rep = {'models': len(pw['r']), 'with_price': sum(1 for e in R if 'p' in e), 'with_obivka': sum(1 for e in R if 'o' in e)}
    print('подбор (pw.json):', json.dumps(rep, ensure_ascii=False))
    return rep


if __name__ == '__main__':
    import argparse, glob
    ap = argparse.ArgumentParser(); ap.add_argument('--idx', required=True); ap.add_argument('--cards', required=True); ap.add_argument('--base', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args()
    with open(a.idx, encoding='utf-8') as f: idx = json.load(f)['items']
    cards = {}
    for fp in glob.glob(os.path.join(a.cards, '*.json')):
        with open(fp, encoding='utf-8') as f: cards[os.path.basename(fp)[:-5]] = json.load(f)
    pw = make(idx, cards, _pb(a.base, {e['c'] for e in idx}))
    with open(a.out, 'w', encoding='utf-8') as f: json.dump(pw, f, ensure_ascii=False, separators=(',', ':'))
    R = list(pw['r'].values())
    print('моделей', len(R), 'с ценой', sum(1 for e in R if 'p' in e), 'с обивкой', sum(1 for e in R if 'o' in e), 'байт', os.path.getsize(a.out))
