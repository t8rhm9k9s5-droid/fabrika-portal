#!/usr/bin/env python3
"""Презентации «Куда нужна наша мебель» по сферам — ВТОРАЯ редакция (27.11.2026, замечания Т. В.):
только целые изделия (3-местная секция, а не элементы прайса), полноценные большие презентации, крупные фото, интерьеры,
пример расчёта оснащения помещения, одна цена — колонка I прайс-листа 28.10.2026. Никуда не кладём, пока Т. В. не посмотрит.
python3 deck_spheres2.py [сфера ...] → out/v2/*.pdf"""
import sys, json, os, re
sys.path.insert(0, '/home/claude/fabrika/work/prez'); import prez as P
from deck_spheres import base_price, FOOT, OFFICES, PLUS
P.OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out', 'v2'); os.makedirs(P.OUT, exist_ok=True)
S = 'REDACTED_B64_30'
P.CSS += """
.m2{display:grid;grid-template-columns:600px 1fr;gap:40px;height:560px}
.m2 .big{height:430px;border:1px solid #E1E4E8;border-radius:22px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff}
.m2 .big img{width:94%%;height:94%%;object-fit:contain}.m2 .big.int img{width:100%%;height:100%%;max-width:none;max-height:none;object-fit:cover}
.m2 .th{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px}.m2 .th div{height:112px;border:1px solid #E1E4E8;border-radius:14px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:#fff}
.m2 .th img{width:90%%;height:90%%;object-fit:contain}
.m2 h2{font-size:40px}.m2 .d{font-size:16px;line-height:1.42;color:#3A4049;margin-top:12px;max-height:68px;overflow:hidden}
.m2 .viz{font-size:11px;color:#9AA1AB;margin-top:6px;letter-spacing:.04em;text-transform:uppercase}
.m2 .comp{margin-top:14px;background:#F3F4F6;border-radius:16px;padding:14px 18px;font-size:15px;line-height:1.45}.m2 .comp b{display:block;margin-bottom:4px}
.full{padding:0}.full img.bg{position:absolute;inset:0;width:100%%;height:100%%;object-fit:cover}.full .cap{position:absolute;left:0;right:0;bottom:0;padding:26px 64px 30px 74px;background:linear-gradient(transparent,rgba(10,12,16,.82) 38%%);color:#fff}
.full .cap h2{font-size:36px;color:#fff}.full .cap p{margin:8px 0 0;font-size:17px;color:#D7DBE0;max-width:980px}.full .cap .viz{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#AEB4BC;margin-top:8px}
.full .logo{filter:brightness(0) invert(1)}.full .pg{color:#C9CDD3}
.lu{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:22px}.lu.c5{grid-template-columns:repeat(5,1fr)}.lu.c6{grid-template-columns:repeat(6,1fr);gap:12px}.lu.c7{grid-template-columns:repeat(7,1fr);gap:10px}.lu.c6 .ph,.lu.c7 .ph{height:170px}.lu.c6 img,.lu.c7 img{max-height:170px}.lu.c7 b{font-size:14px}.lu.c7 span{font-size:12px}.lu div{border:1px solid #E1E4E8;border-radius:16px;padding:10px 12px 12px;background:#fff}
.lu .ph{height:150px;display:flex;align-items:center;justify-content:center}.lu img{max-width:100%%;max-height:150px;object-fit:contain}
.lu b{display:block;font-size:15.5px;margin-top:6px;line-height:1.2}.lu span{display:block;font-size:13px;color:#6B7280;margin-top:3px}.lu .pr{font-family:Gor;font-size:18px;color:#15181D;margin-top:4px}
.calc{width:100%%;border-collapse:collapse;margin-top:20px;font-size:17px}.calc th{text-align:left;font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:#6B7280;border-bottom:2px solid #15181D;padding:8px 10px 8px 0}
.calc td{padding:9px 10px 9px 0;border-bottom:1px solid #E5E7EB}.calc td.n{text-align:right;white-space:nowrap}.calc tr.tot td{border-bottom:0;font-family:Gor;font-size:24px;padding-top:14px}
"""
PH = {}
for f in ('zaly_ph.json', 'sch_ph.json'):
    for t in json.load(open(S + f)): PH.setdefault(t[0], []).append(t[-1])
def tile(f, i): return json.load(open(S + f))[i][-1]

OVR = {'tris': ['/home/claude/fabrika/work/prez/rex/tris_34_svet.jpg']}   # 27.11 Т. В.: «Трис — бери новое фото Рекса»
def photos(code, n=4):
    """27.11 Т. В.: не анфас — ракурс 3/4: сначала студийные кадры «Солнце» и «Луна», затем фото карточки"""
    c = P.card(code); out = list(OVR.get(code, []))
    th = c.get('th') or {}
    for k in ('sun', 'moon'):
        if th.get(k) and len(out) < n:
            p = P.img(th[k], '') or P.img(th[k], 'm')
            if p: out.append(p)
    for ph in c.get('ph') or []:
        if ph.get('ai') and len(c['ph']) > 2: continue
        p = P.img(ph['k'], '') or P.img(ph['k'], 'm')
        if p: out.append(p)
        if len(out) >= n: break
    return out[:n]

def price_of(code):
    bp = base_price(code)
    return bp

def s_model2(code, why, comp=None):
    c = P.card(code); ph = photos(code, 4); bp = price_of(code)
    d = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', c.get('desc') or '')).strip(); d = d if len(d) < 200 else d[:200].rsplit('. ', 1)[0] + '.'
    if d.startswith('Модель есть в каталоге'): d = ''
    sp = P.specs(c)[:9]
    h = '<div class="m2"><div><div class="big"><img src="%s"></div>' % P.data_uri(ph[0] if ph else None, 1400)
    if len(ph) > 1: h += '<div class="th">' + ''.join('<div><img src="%s"></div>' % P.data_uri(p, 500) for p in ph[1:4]) + '</div>'
    h += '<div class="viz">фото изделия</div></div><div><div class="kick">%s</div><h2>%s</h2>%s' % (P.esc(why), P.esc(c['n']), '<div class="d">%s</div>' % P.esc(d) if d else '')
    if sp: h += '<div class="specs">' + ''.join('<div%s><span>%s</span><b>%s</b></div>' % (' class="w"' if len(str(b)) > 24 else '', P.esc(a), P.esc(b)) for a, b in sp) + '</div>'
    if comp: h += '<div class="comp"><b>Комплект</b>%s</div>' % P.esc(comp)
    if bp: h += '<div class="price"><div class="v">%s</div><div class="t">%s</div></div>' % (P.rub(bp[0]), P.esc(bp[1]))
    else: h += '<div class="stock">Цена — по запросу: считаем под ваш объём, обивку и регион.</div>'
    return h + '</div></div>'

def s_comp(kick, title, desc, pics, parts, specs, price=None, note=''):
    """целое изделие, которое в прайсе собирается из нескольких строк (секция «Флайт», парта «Оптима»)"""
    h = '<div class="m2"><div><div class="big"><img src="%s"></div><div class="th">%s</div><div class="viz">фото изделия в сборе</div></div>' % (
        P.data_uri(pics[0], 1400), ''.join('<div><img src="%s"></div>' % P.data_uri(p, 500) for p in pics[1:4]))
    h += '<div><div class="kick">%s</div><h2>%s</h2><div class="d">%s</div>' % (P.esc(kick), P.esc(title), P.esc(desc))
    h += '<div class="specs">' + ''.join('<div%s><span>%s</span><b>%s</b></div>' % (' class="w"' if len(str(b)) > 24 else '', P.esc(a), P.esc(b)) for a, b in specs) + '</div>'
    h += '<div class="comp"><b>Что входит в изделие</b>%s</div>' % P.esc('; '.join('%s — %s' % (a, b) for a, b in parts))
    if price: h += '<div class="price"><div class="v">%s</div><div class="t">%s</div></div>' % (P.rub(price[0]), P.esc(price[1]))
    else: h += '<div class="stock">%s</div>' % P.esc(note or 'Цена — по запросу: считаем комплект под ваш зал.')
    return h + '</div></div>'

def s_full(path, title, text, viz=True):
    return P.page('<img class="bg" src="%s"><div class="cap"><h2>%s</h2><p>%s</p>%s</div>' % (P.data_uri(path, 1600), P.esc(title), P.esc(text), '<div class="viz">визуализация интерьера по фото изделия</div>' if viz else ''), cls='full')

def interior(code):
    k = (P.card(code).get('th') or {}).get('day')
    return P.img(k, '') if k else None

def s_lineup(kick, title, items):
    n = len(items); cols = 4 if n <= 8 else 5 if n <= 10 else 6 if n <= 12 else 7
    h = '<div class="kick">%s</div><h2>%s</h2><div class="lu c%d">' % (P.esc(kick), P.esc(title), cols)
    for code, where, pic in items:
        c = P.card(code) if code else {}; bp = price_of(code) if code else None
        ph = pic or (photos(code, 1) or [None])[0]
        h += '<div><div class="ph"><img src="%s"></div><b>%s</b><span>%s</span><div class="pr">%s</div></div>' % (P.data_uri(ph, 500), P.esc(c.get('n') or where[0]), P.esc(where if code else where[1]), P.rub(bp[0]) if bp else 'по запросу')
    return h + '</div>'

def s_calc(kick, title, lead, rows, small):
    tot = 0; body = ''
    for name, q, pr in rows:
        s = q * pr if pr else None; tot += s or 0
        body += '<tr><td>%s</td><td class="n">%d шт.</td><td class="n">%s</td><td class="n">%s</td></tr>' % (P.esc(name), q, P.rub(pr) if pr else 'по запросу', P.rub(s) if s else '—')
    miss = any(not pr for _, _, pr in rows)
    h = '<div class="kick">%s</div><h2>%s</h2><div class="lead">%s</div><table class="calc"><tr><th>Изделие</th><th class="n">Количество</th><th class="n">Цена</th><th class="n">Сумма</th></tr>%s<tr class="tot"><td>%s</td><td></td><td></td><td class="n">%s</td></tr></table><div class="small">%s</div>' % (
        P.esc(kick), P.esc(title), P.esc(lead), body, 'Итого без позиций «по запросу»' if miss else 'Итого', P.rub(tot), P.esc(small))
    return h

def pr1(code):
    bp = price_of(code); return bp[0] if bp else None
CALC_NOTE = 'Цены — колонка I прайс-листа 28.10.2026 (Рязань, Москва), с НДС, базовое исполнение; для других регионов — колонка своего региона. Доставка и монтаж считаются отдельно.'

# ---------- целые изделия, собранные из нескольких строк прайса ----------
FLAYT = lambda: s_comp('Залы ожидания, вокзалы, поликлиники', 'Флайт — 3-местная секция',
    'Кресла для залов ожидания: три посадочных места на общей опорной раме, конструкция разборная. Вместо одного места можно поставить столик; подлокотники и мягкие накладки на сиденье и спинку — в разных сочетаниях.',
    [tile('zaly_ph.json', 18), tile('zaly_ph.json', 8), tile('zaly_ph.json', 14), tile('zaly_ph.json', 5)],
    [('опорная рама на 3 места', '1'), ('сиденье со спинкой, металл', '3'), ('подлокотники', 'по выбору'), ('мягкие накладки, столик', 'по выбору')],
    [('Габариты (Ш × Г × В)', '1805 × 600 × 870 мм'), ('Высота сиденья', '450 мм'), ('Каркас', 'металл, порошковая окраска'), ('Сиденье и спинка', 'перфорированный металл')],
    note='Цена — по запросу: в прайс-листе «Флайт» собирается из опоры, сидений и подлокотников, считаем секцию целиком под ваш зал.')
LAYN = lambda: s_comp('Залы ожидания, коридоры, холлы', 'Сотрудник15 — 3-местная секция',
    'Секция на три места на общей металлической опоре. Сиденья со спинкой — металл с перфорацией; можно добавить подлокотники, мягкие накладки и столик вместо одного места.',
    [tile('zaly_ph.json', 47), tile('zaly_ph.json', 46), tile('zaly_ph.json', 44), tile('zaly_ph.json', 31)],
    [('металлическая опора на 3 места', '1'), ('сиденье со спинкой, металл', '3'), ('подлокотники', 'по выбору'), ('мягкие накладки, столик', 'по выбору')],
    [('Мест в секции', '3'), ('Каркас', 'металл, порошковая окраска'), ('Сиденье и спинка', 'перфорированный металл'), ('Цвет', 'по карте RAL, синий и оранжевый на фото')],
    note='Цена — по запросу: в прайс-листе «Сотрудник15» собирается из опоры, сидений и подлокотников, считаем секцию целиком под ваш зал.')
def DESK():
    k, t = desk_parts()
    pr = (k + t, 'стол целиком: каркас %s + столешница с царгой %s; прайс-лист 28.10.2026, с НДС' % (P.rub(k), P.rub(t))) if k and t else None
    return s_comp('Учебный класс', 'Стол ученический «Оптима» регулируемый — в сборе',
        'Одноместный ученический стол на металлическом каркасе с регулировкой высоты: один стол подходит нескольким ростовым группам. Столешница с царгой.',
        [tile('sch_ph.json', 8), tile('sch_ph.json', 4), tile('sch_ph.json', 10), tile('sch_ph.json', 15)],
        [('каркас регулируемый «Оптима»', '1'), ('столешница с царгой', '1')],
        [('Каркас', 'металл, порошковая окраска'), ('Регулировка', 'по высоте, под ростовую группу'), ('Столешница', 'ЛДСП с кромкой'), ('Пара к столу', 'стул ученический «Оптима»')], pr)
def desk_parts():
    return pr1('p-karkas-stola-uchenicheskogo-reguliruemogo-optima-krash'), pr1('REDACTED_B64_31')
def PC_find(name):
    import price_cols as PC
    from deck_spheres import PR
    row, _ = PC.find(PR, name, ''); return row and row['pr'].get('I')

ROOMS = {
 'medicina': [('Приёмная и коридор', 'Многоместные секции и диваны, которые легко мыть.', '1'), ('Кабинет врача', 'Стул врача, стул пациента, кушетка.', '2'), ('Смотровая и процедурная', 'Кушетка с подголовником, банкетка, табурет.', '3'),
              ('Лаборатория', 'Лабораторный стул и кресло с высокой посадкой.', '4'), ('Пост медсестры, регистратура', 'Кресло с регулировкой высоты.', '5'), ('Аптека и касса', 'Кресло кассира, высокий табурет.', '6')],
 'obrazovanie': [('Учебный класс', 'Стул и стол ученический по ростовой группе.', '1'), ('Регулируемый класс', 'Стол и стул «Оптима» — один комплект на несколько групп.', '2'), ('Компьютерный класс', 'Кресла на колёсах с регулировкой.', '3'),
                 ('Детский сад', 'Детские кресла и стулья.', '4'), ('Столовая', 'Стулья, которые штабелируются и моются.', '5'), ('Коридор и актовый зал', 'Многоместные секции на раме, театральные кресла.', '6')],
 'zaly': [('Актовый зал', 'Театральные кресла секциями на 2–4 места.', '1'), ('Кинозал', 'Секции «Синема» с мягкими сиденьями.', '2'), ('Конференц-зал', 'Секции «Палермо», в том числе со столиком.', '3'),
          ('Зал ожидания', 'Секции «Флайт» и «Сотрудник15» на металлической опоре.', '4'), ('Холл и коридор', 'Многоместные секции на раме.', '5'), ('Клубы и ДК', 'Одноместные театральные кресла для неровных рядов.', '6')],
 'obshchepit': [('Столовая', 'Лёгкие стулья, которые штабелируются и моются.', '1'), ('Кафе', 'Стулья с мягким сиденьем и деревянные модели.', '2'), ('Ресторан', 'Полукресла и стулья с обивкой.', '3'),
                ('Фудкорт', 'Прочные стулья на металлокаркасе.', '4'), ('Бар и стойка', 'Барные и полубарные стулья.', '5'), ('Сотрудник92 ожидания', 'Диваны и кресла для гостей.', '6')],
 'ofis': [('Рабочее место', 'Кресло сотрудника с регулировками.', '1'), ('Кабинет руководителя', 'Кресло руководителя.', '2'), ('Переговорная', 'Стулья и полукресла на металлокаркасе.', '3'),
          ('Ресепшн и ожидание', 'Диваны и многоместные секции.', '4'), ('Кухня и кофе-поинт', 'Стулья и барные модели.', '5'), ('Учебный и конференц-зал', 'Стулья «Изо» и секции.', '6')],
}
DECKS = {
 'medicina': dict(title='Мебель для клиник, лабораторий и аптек', sub='Секции и диваны для приёмных, кушетки и банкетки для кабинетов, лабораторные стулья, кресла для постов и касс — с завода в Рязани.',
   cover='prestizh-kreslo',
   models=[('sektsiya-stulev-mnogomestnaya-sabrina', 'Приёмная и коридор'), ('izo-3-kh-mest-na-rame-nerazbornyy', 'Коридор, зал ожидания'), ('p-kushetka-2000x800x450-s-podgolovnikom', 'Смотровой кабинет'),
           ('banketka-t', 'Процедурная, раздевалка'), ('meditsinskiy-stul', 'Кабинет врача'), ('laboratornyy-stul-ls-1', 'Лаборатория'), ('regal-r-kreslo', 'Пост медсестры, высокий стол'),
           ('grand-hlr-kreslo', 'Регистратура'), ('khoker-taburet', 'Процедурная, аптека'), ('arriva-divan-2-kh-mest', 'Сотрудник92 ожидания'), ('tom-divan-3-kh-mest', 'Холл'), ('kreslo-kassira-ks-3', 'Аптека, касса')],
   flayt=True, interiors=['prestizh-kreslo', 'regal-r-kreslo', 'tom-divan-3-kh-mest'],
   calc=('Пример расчёта', 'Приёмная поликлиники на 24 места', 'Шесть многоместных секций, диван в зону ожидания, кресло в регистратуру.',
         [('Секция стульев многоместная «Сабрина»', 6, 'sektsiya-stulev-mnogomestnaya-sabrina'), ('Кресло «Гранд HLR» — регистратура', 2, 'grand-hlr-kreslo'), ('Банкетка-Т — у кабинетов', 4, 'banketka-t')]),
   minus=('Сертификаты и регистрационные документы под конкретный тендер нужно запросить заранее', 'Нестандартная обивка (особый цвет, ткань) увеличивает срок изготовления',
          'Вес и габариты упаковки указаны не по всем позициям — для расчёта доставки уточняйте у менеджера', 'Под тендер с жёстким ТЗ сначала сверяем размеры с ближайшим исполнением')),
 'obrazovanie': dict(title='Мебель для школ, колледжей и детских садов', sub='Ученические столы и стулья по ростовым группам, регулируемые комплекты «Оптима», кресла для компьютерных классов, детская мебель и секции для коридоров.',
   cover='logika-kreslo',
   models=[('p-stul-uchenicheskiy-standart-6', 'Класс, ростовая группа № 6'), ('p-stul-uchenicheskiy-optima', 'Класс, регулируемый стул'),
           ('prestizh-kreslo', 'Компьютерный класс'), ('logika-kreslo', 'Компьютерный класс, младшие классы'), ('fred-box2-kreslo', 'Детская'), ('samba-box4-stul', 'Столовая'),
           ('izo-3-kh-mest-na-rame-nerazbornyy', 'Коридор, рекреация'), ('teatralnoe-kreslo-3-khmest-', 'Актовый зал'), ('anri-g', 'Учительская, библиотека')],
   desk=True, interiors=['logika-kreslo', 'samba-box4-stul'],
   calc=('Пример расчёта', 'Учебный класс на 30 мест', '15 двухместных рабочих мест, собранных из одноместных регулируемых столов «Оптима», 30 стульев «Оптима», стул и кресло учителя.',
         [('Стол ученический «Оптима» регулируемый (каркас + столешница)', 30, 'DESK'), ('Стул ученический «Оптима»', 30, 'p-stul-uchenicheskiy-optima'), ('Кресло учителя «Престиж+»', 1, 'prestizh-kreslo')]),
   minus=('Ростовую группу и маркировку нужно указать в заказе — от этого зависит модель', 'Стол в прайс-листе — две строки (каркас и столешница), цену даём за стол целиком',
          'Большие партии к 1 сентября лучше заказывать до мая — летом загрузка производства максимальная', 'Вес и габариты упаковки указаны не по всем позициям — для расчёта доставки уточняйте у менеджера')),
 'zaly': dict(title='Кресла для залов: актовые, кинозалы, конференц-залы, залы ожидания', sub='Театральные кресла секциями, секции «Палермо» и «Синема», 3-местные секции «Флайт» и «Сотрудник15» для залов ожидания — целыми изделиями, с завода в Рязани.',
   cover='teatralnoe-kreslo-3-khmest-',
   models=[('teatralnoe-kreslo-3-khmest-', 'Актовый зал'), ('teatralnoe-kreslo-4-khmest', 'Актовый зал, длинные ряды'), ('teatralnoe-kreslo-2-khmest', 'Актовый зал, короткие ряды'), ('teatralnoe-kreslo-1-mest', 'Неровные ряды, ДК, клубы'),
           ('p-palermo-3-mest-sektsiya', 'Конференц-зал, холл'), ('p-palermo-2-mest-sektsiya-so-stolikom', 'Холл, VIP-зона'), ('p-sinema-sektsiya-2-mest-l-1135-mm', 'Кинозал, зал ожидания'),
           ('sektsiya-stulev-mnogomestnaya-sabrina', 'Зал ожидания')],
   flayt=True, layn=True, interiors=['teatralnoe-kreslo-2-khmest'],
   calc=('Пример расчёта', 'Конференц-зал и холл на 60 мест', '16 секций «Синема» по 3 места в зал, 4 секции «Палермо» по 3 места в холл. Театральные кресла для актового зала считаем по плану зала.',
         [('Синема секция 3-местная L=1620 мм', 16, 'PL:Синема секция 3-мест. L=1620 мм'), ('Палермо 3-местная секция', 4, 'p-palermo-3-mest-sektsiya')]),
   minus=('Для зала нужен план с шагом рядов и уклоном пола — по нему считаем количество и крепление', 'Секции «Флайт» и «Сотрудник15» в прайс-листе собираются из нескольких строк — цену даём за секцию целиком',
          'Монтаж на объекте — отдельная услуга, уточняйте у менеджера', 'Нестандартная обивка увеличивает срок изготовления')),
 'obshchepit': dict(title='Стулья для кафе, столовых, ресторанов и баров', sub='Стулья и полукресла для залов, барные модели для стоек — для мест с большой проходимостью.',
   cover='byern-stul-box2',
   models=[('byern-stul-box2', 'Кафе'), ('tris', 'Кафе, кофейня'), ('meyson', 'Кафе, ресторан'), ('sirena-stul', 'Ресторан'), ('bond-stul', 'Ресторан'),
           ('balun-layt-kreslo', 'Ресторан, лаунж'), ('kataloniya-stul-box2', 'Кафе'), ('venus-stul', 'Кафе, столовая'), ('fabrikant-stul', 'Столовая, фудкорт'),
           ('feliks-stul-box2', 'Кафе, бар'), ('feliks-bar-stul-', 'Барная стойка'), ('tyulpan-stul', 'Барная стойка'), ('balun-w-kreslo', 'Бар, лаунж'), ('chiko-taburet', 'Столовая, кухня')],
   interiors=['byern-stul-box2', 'feliks-stul-box2', 'tris', 'sirena-stul'],
   calc=('Пример расчёта', 'Кафе на 40 посадочных мест', '32 стула в зал и 8 барных стульев к стойке.',
         [('Стул «Бёрн»', 32, 'byern-stul-box2'), ('Барный стул «Феликс бар»', 8, 'feliks-bar-stul-')]),
   minus=('Столы и столешницы в этой презентации не показаны — подбираются отдельно', 'Цвет каркаса вне стандартной палитры увеличивает срок',
          'Для сетей с фирменным стилем лучше заказать образец до партии', 'Вес и габариты упаковки указаны не по всем позициям — для расчёта доставки уточняйте у менеджера')),
 'ofis': dict(title='Кресла, стулья и диваны для офиса', sub='Кресла для сотрудников и руководителей, стулья для переговорных, диваны и секции для зон ожидания — с завода в Рязани.',
   cover='atlant-kreslo-pl-1',
   models=[('prestizh-kreslo', 'Рабочее место'), ('anri-g', 'Рабочее место'), ('beta-kreslo', 'Рабочее место'), ('big-kreslo', 'Рабочее место, большой рост'), ('atlant-kreslo-pl-1', 'Кабинет руководителя'),
           ('atlantis-kreslo', 'Кабинет руководителя'), ('bun-kreslo', 'Кабинет руководителя'), ('viktoriya-g', 'Кабинет руководителя'), ('izo-stul-1944805354', 'Переговорная, учебный зал'),
           ('sofiya-stul', 'Переговорная'), ('samba-m-box4-stul', 'Переговорная, кухня'), ('milan-divan-3-kh-mest', 'Ресепшн, ожидание'), ('v-100-divan-2-kh-mest', 'Сотрудник92 ожидания'),
           ('izo-3-kh-mest-na-rame-nerazbornyy', 'Коридор, ожидание')],
   interiors=['atlant-kreslo-pl-1', 'prestizh-kreslo', 'bun-kreslo', 'milan-divan-3-kh-mest'],
   calc=('Пример расчёта', 'Имя2 на 20 сотрудников', '20 рабочих мест, 2 кабинета руководителя, переговорная на 10 мест.',
         [('Кресло «Престиж+»', 20, 'prestizh-kreslo'), ('Кресло руководителя «Атлант PL-1»', 2, 'atlant-kreslo-pl-1'), ('Стул «Изо» — переговорная', 10, 'izo-stul-1944805354')]),
   minus=('Механизмы качания для части моделей — покупные; комплектацию уточняйте в заказе', 'Кресла в редкой обивке — под заказ, не со склада',
          'Наличие на складе меняется ежедневно — перед счётом проверяем остаток в вашем регионе', 'Вес и габариты упаковки указаны не по всем позициям — для расчёта доставки уточняйте у менеджера')),
}
NAMES = {'medicina': 'Медицина', 'obrazovanie': 'Образование', 'zaly': 'Залы', 'obshchepit': 'Общепит', 'ofis': 'Имя2'}


def deck(key):
    s = DECKS[key]; models = [(c, w) for c, w in s['models'] if c in P.IDX]
    cov = interior(s['cover']) or (photos(s['cover'], 1) or [None])[0]
    sl = [P.s_cover(s['title'], s['sub'], 'Куда нужна наша мебель', FOOT, cov),
          P.s_text('О нас', 'Своё производство в Рязани', 'Делаем мебель для организаций: от одного кабинета до объекта под ключ. Металлокаркас, пластик, обивка и мягкая мебель — на одной площадке.',
                   boxes=[('Свой завод', PLUS[0], '1'), ('Каркас', PLUS[1], '2'), ('Обивка', PLUS[2], '3'), ('Ремонт', PLUS[3], '4')], cols=2),
          P.s_text('Где нужна', 'Для каких помещений', boxes=ROOMS[key], cols=3)]
    # линейка — обзор всех изделий, по 8 на слайд
    items = [(c, w, None) for c, w in models]
    sl.append(s_lineup('Линейка', 'Что предлагаем', items))   # 27.11 Т. В.: «Что предлагаем» — один лист
    ints = [c for c in s.get('interiors', []) if interior(c)]
    for j, (code, why) in enumerate(models):
        sl.append(s_model2(code, why))
        if j % 4 == 1 and ints:
            c = ints.pop(0); sl.append(s_full(interior(c), 'Как это выглядит в помещении', '%s — %s.' % (P.card(c)['n'], dict(models).get(c, 'в интерьере').lower())))
    if s.get('flayt'): sl.append(FLAYT())
    if s.get('layn'): sl.append(LAYN())
    if s.get('desk'): sl.append(DESK())
    for c in ints: sl.append(s_full(interior(c), 'Как это выглядит в помещении', '%s — %s.' % (P.card(c)['n'], dict(models).get(c, 'в интерьере').lower())))
    k, t, lead, rows = s['calc']
    rr = []
    for name, q, code in rows:
        if code == 'DESK':
            a, b = desk_parts(); rr.append((name, q, (a + b) if a and b else None))
        elif code.startswith('PL:'): rr.append((name, q, PC_find(code[3:])))
        else: rr.append((name, q, pr1(code)))
    sl.append(s_calc(k, t, lead, rr, CALC_NOTE))
    sl += [P.s_text('Честно', 'Сильные стороны и что учесть заранее', table=[('Сильные стороны', 'Что учесть')] + list(zip(PLUS, s['minus']))),
           P.s_text('Как заказать', 'От запроса до поставки', boxes=[('Сотрудник4', 'Помещение, количество мест, требования: тендер, цвет, обивка.', '1'), ('Подбор и расчёт', 'Подбираем модели и считаем цену партии по прайсу вашего региона.', '2'),
                    ('Образец', OFFICES, '3'), ('Производство и доставка', 'Срок — по загрузке завода и объёму партии, называем в счёте.', '4')], cols=2,
                    small=FOOT + ' · цены и характеристики — по прайс-листу и каталогу на дату презентации')]
    return P.build('Куда_нужна_мебель_%s_v2_2026-11' % NAMES[key], sl), len(sl)


if __name__ == '__main__':
    for k in (sys.argv[1:] or list(DECKS)):
        print(k, deck(k))
