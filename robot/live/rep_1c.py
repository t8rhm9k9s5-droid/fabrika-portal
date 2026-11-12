# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник Сотрудник Отчество (владелец) и Сотрудник Сотрудник Отчество — с равными правами.
# Команда Сотрудник Отчество = команда Сотрудник Отчество, любым каналом: почта (в т. ч. user@example.org, user@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — ежедневные рассылки 1С для Claude на user@example.org (02.11.2026):
  • «Реестр рекламаций от ДД.ММ.ГГГГ» (файл «Реестр рекламаций claude.xlsx») — все рекламации за год до даты отчёта;
  • «ТЗ в работе от ДД.ММ.ГГГГ» (файл «РеестрТехЗаданийClaude.xlsx») — реестр ТЗ с мая 2026, статусы отделов и «Закрыто».
Т. В. Сотрудник 02.11.2026 (разбор почты): «Ты там забыл письма с браками… Разбери всю почту внимательно» — рассылки приходили, но робот их не брал.

Файлы 1С пишут часть книги под именем «xl/SharedStrings.xml» (с большой буквы) — openpyxl его не находит (KeyError). fix_xlsx() переупаковывает.
Разбор в те же схемы, что у сборки портала (build/recl/parse_recl.py → recl_open.json, parse_recl_all.py → recl_all.json, build/tz/parse_tz_1c.py → tz_1c.json),
чтобы страница «Продажи» показывала свежие данные с хостинга (st/recl.bin, st/tz1c.bin) поверх тех, что вшиты в сборку.
Python 3.6 (хостинг): без date.fromisoformat, без f-строк с «=»."""
import collections, datetime as _dt, io, json, re, statistics, zipfile

RECL_SUBJ = re.compile(r'Реестр\s+рекламаций', re.I)
TZ_SUBJ = re.compile(r'ТЗ\s+в\s+работе|Реестр\s*Тех\s*Заданий', re.I)
PH = re.compile(r'(\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b')
DOC = re.compile(r'^0*(\d+)\s+от\s+(\d\d)\.(\d\d)\.(\d{4})')
STAGES = ['оформлена неверно', 'принята', 'рассмотрена технологом', 'рассмотрена экономистом', 'готова к печати', 'обработана', 'закрыта', 'отгружена']


def fix_xlsx(data):
    """bytes xlsx 1С → bytes, которые читает openpyxl (имена частей книги — как в стандарте)"""
    zi = zipfile.ZipFile(io.BytesIO(data))
    names = zi.namelist()
    if 'xl/sharedStrings.xml' in names or not any(n.lower() == 'xl/sharedstrings.xml' for n in names): return data
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zo:
        for n in names: zo.writestr('xl/sharedStrings.xml' if n.lower() == 'xl/sharedstrings.xml' else n, zi.read(n))
    return out.getvalue()


def read_rows(data):
    import openpyxl
    ws = openpyxl.load_workbook(io.BytesIO(fix_xlsx(data)), read_only=True, data_only=True).worksheets[0]
    return [['' if v is None else (str(v).strip() if not isinstance(v, (int, float)) else v) for v in r] for r in ws.iter_rows(values_only=True)]


def _iso(y, m, d): return '%s-%s-%s' % (y, m, d)
def _date(s): return _dt.datetime.strptime(s, '%Y-%m-%d').date()
def s_(v): return PH.sub('[тел.]', re.sub(r'\s+', ' ', str(v if v is not None else '')).strip())
def num(v):
    try: return float(str(v).replace(' ', '').replace(' ', '').replace(',', '.'))
    except Exception: return None
def dmy(v):
    m = re.match(r'(\d\d)\.(\d\d)\.(\d{4})', s_(v)); return _iso(m.group(3), m.group(2), m.group(1)) if m else None
def yes(v): return s_(v).lower() == 'да'
def c(r, i): return r[i] if i < len(r) else ''


def parse_recl(rows, asof):
    """1С «Реестр рекламаций claude»: строка документа «0000000893 от 30.10.2026» (0) | контрагент (5) | неверно оформлена (6) | рассмотрено
    технологом (7) | экономистом (8) | готово к печати (9) | дата готово к печати (10) | закрыта (11) | дата отгрузки (12) | количество (15);
    под ней строки номенклатуры: номенклатура (0) | характеристика (5) | ед. (6) | сумма ущерба (7) | требование клиента (8) | вид рекламации
    комиссия (9) | причина брака (10) | описание (11) | виновные лица (12) | материалы замена (13) | исправление (14) | количество (15).
    → {'open': схема recl_open.json, 'all': схема recl_all.json}. Менеджера в отчёте нет — «не указан в отчёте 1С»."""
    per = next((s_(x) for r in rows[:6] for x in r if 'период' in s_(x).lower()), '')
    docs = []
    hdr = next((i for i, r in enumerate(rows[:20]) if s_(c(r, 0)).lower().startswith('док рекламац')), 5)
    for r in rows[hdr + 1:]:
        a = s_(c(r, 0))
        if not a or a.lower() in ('номенклатура', 'итого'): continue
        m = DOC.match(a)
        if m:
            docs.append({'no': m.group(1), 'd': _iso(m.group(4), m.group(3), m.group(2)), 'cl': s_(c(r, 5)), 'bad_form': yes(c(r, 6)), 'tech': yes(c(r, 7)),
                         'econ': yes(c(r, 8)), 'print': yes(c(r, 9)), 'proc': dmy(c(r, 10)), 'closed': yes(c(r, 11)), 'ship': dmy(c(r, 12)), 'q': num(c(r, 15)) or 0, 'l': []})
        elif docs:
            g = s_(c(r, 12)).strip('; ').replace(' ;', ';')
            docs[-1]['l'].append({'n': a, 'ch': s_(c(r, 5))[:120], 'u': s_(c(r, 6)), 'sum': num(c(r, 7)), 'req': s_(c(r, 8)), 'vid': s_(c(r, 9)),
                                  'why': s_(c(r, 10)) or 'не указана', 'x': s_(c(r, 11))[:300], 'g': [x.strip() for x in g.split(';') if x.strip()] or ['не указаны'],
                                  'q': num(c(r, 15)) or 0})
    A = _date(asof)
    for d in docs:
        dd = _date(d['d'])
        d['sum'] = round(sum(x['sum'] or 0 for x in d['l']), 2)
        d['proc_days'] = (_date(d['proc']) - dd).days if d['proc'] else None
        d['ship_days'] = (_date(d['ship']) - dd).days if d['ship'] else None
        d['age'] = (A - dd).days
        d['ym'] = d['d'][:7]
        st = 1
        if d['tech']: st = 2
        if d['econ']: st = 3
        if d['print']: st = 4
        if d['proc']: st = 5
        if d['closed']: st = 6
        if d['ship']: st = 7
        if d['bad_form']: st = 0
        d['stage'] = st
        d['match'] = sum(1 for x in d['l'] if x['req'] and x['vid'] and x['req'].lower().rstrip('. ') == x['vid'].lower().rstrip('. '))
        d['lines'] = len(d['l'])
    src = '1С: «Реестр рекламаций», ' + (per or 'на ' + '.'.join(reversed(asof.split('-'))))
    return {'open': _open(docs, asof, src), 'all': _all(docs, asof, src)}


def _open(docs, asof, src):
    """схема build/recl/parse_recl.py (незакрытые)"""
    D = [d for d in docs if not d['closed']]
    def agg(key):
        A = collections.OrderedDict()
        for d in D:
            ks = key(d)
            for k in (ks if isinstance(ks, (list, set, tuple)) else [ks]):
                a = A.setdefault(k or '—', {'k': k or '—', 'n': 0, 'q': 0, 'sum': 0, 'old': 0}); a['n'] += 1; a['q'] += d['q']; a['sum'] += d['sum'] or 0; a['old'] += 1 if (d['age'] or 0) > 30 else 0
        return sorted(A.values(), key=lambda a: (-a['n'], -a['q']))
    ages = sorted(d['age'] for d in D if d['age'] is not None)
    out = [{'no': d['no'], 'd': d['d'], 'cl': d['cl'], 'm': 'не указан в отчёте 1С', 'q': d['q'], 'age': d['age'], 'sum': d['sum'] or None, 'st': d['stage'],
            'l': [{'n': x['n'], 'u': x['u'], 'q': x['q'], 'sum': x['sum'], 'vid': x['vid'], 'why': x['why'], 'x': x['x'][:400], 'g': x['g']} for x in d['l']]} for d in D]
    return {'asof': asof, 'src': src + ', отбор «Закрыта = Нет»', 'n': len(D), 'lines': sum(len(d['l']) for d in D), 'q': sum(d['q'] for d in D),
            'sum': round(sum(d['sum'] or 0 for d in D)), 'sum_n': sum(1 for d in D if d['sum']), 'old30': sum(1 for a in ages if a > 30), 'old90': sum(1 for a in ages if a > 90),
            'age_med': ages[len(ages) // 2] if ages else None, 'oldest': min([d['d'] for d in D if d['d']] or [None]),
            'by_m': agg(lambda d: 'не указан в отчёте 1С'), 'by_why': agg(lambda d: sorted({x['why'] or 'не указана' for x in d['l']})),
            'by_vid': agg(lambda d: sorted({x['vid'] or 'не указан' for x in d['l']})),
            'by_g': agg(lambda d: sorted({g for x in d['l'] for g in (x['g'] or ['не указаны'])})),
            'by_ym': sorted(agg(lambda d: (d['d'] or '')[:7]), key=lambda a: a['k']), 'by_cl': agg(lambda d: d['cl'])[:15],
            'docs': sorted(out, key=lambda d: (d['d'] or '', d['no']))}


def _all(docs, asof, src):
    """схема build/recl/parse_recl_all.py (все документы периода, этапы)"""
    def agg(key, lines=False):
        A = collections.OrderedDict()
        for d in docs:
            for x in (d['l'] if lines else [d]):
                ks = key(d, x)
                for k in (ks if isinstance(ks, (list, set, tuple)) else [ks]):
                    a = A.setdefault(k or '—', {'k': k or '—', 'n': 0, 'q': 0, 'sum': 0, 'closed': 0, 'docs': set()})
                    a['docs'].add(d['no']); a['q'] += x['q']; a['sum'] += (x['sum'] or 0) if lines else d['sum']
                    if not lines: a['n'] += 1; a['closed'] += 1 if d['closed'] else 0
        out = []
        for a in A.values():
            a['n'] = a['n'] or len(a['docs']); a['docs'] = len(a['docs']); a['sum'] = round(a['sum']); out.append(a)
        return sorted(out, key=lambda a: (-a['n'], -a['q']))
    pd = [d['proc_days'] for d in docs if d['proc_days'] is not None]
    sd = [d['ship_days'] for d in docs if d['ship_days'] is not None]
    by_m = []
    for m in sorted(set(d['ym'] for d in docs)):
        D = [d for d in docs if d['ym'] == m]; P = [d['proc_days'] for d in D if d['proc_days'] is not None]
        by_m.append({'m': m, 'n': len(D), 'q': sum(d['q'] for d in D), 'sum': round(sum(d['sum'] for d in D)), 'closed': sum(1 for d in D if d['closed']),
                     'bad': sum(1 for d in D if d['bad_form']), 'proc_med': statistics.median(P) if P else None, 'proc_n': len(P), 'over14': sum(1 for x in P if x > 14),
                     'open': sum(1 for d in D if not d['closed'])})
    FL = [lambda d: d['bad_form'], lambda d: not d['bad_form'], lambda d: d['tech'], lambda d: d['econ'], lambda d: d['print'], lambda d: bool(d['proc']),
          lambda d: d['closed'], lambda d: bool(d['ship'])]
    dd = sorted(d['d'] for d in docs)
    period = ('%s — %s' % ('.'.join(reversed(dd[0].split('-'))), '.'.join(reversed(dd[-1].split('-'))))) if dd else ''
    return {'asof': asof, 'period': period, 'src': src,
            'n': len(docs), 'lines': sum(d['lines'] for d in docs), 'q': sum(d['q'] for d in docs), 'sum': round(sum(d['sum'] for d in docs)),
            'sum_n': sum(1 for d in docs if d['sum']), 'closed': sum(1 for d in docs if d['closed']), 'open': sum(1 for d in docs if not d['closed']),
            'bad_form': sum(1 for d in docs if d['bad_form']), 'tech': sum(1 for d in docs if d['tech']), 'econ': sum(1 for d in docs if d['econ']),
            'print': sum(1 for d in docs if d['print']), 'proc': len(pd), 'shipped': len(sd),
            'proc_med': statistics.median(pd) if pd else None, 'proc_avg': round(sum(pd) / len(pd), 1) if pd else None, 'proc_over14': sum(1 for x in pd if x > 14),
            'proc_max': max(pd) if pd else None, 'ship_med': statistics.median(sd) if sd else None, 'match': sum(d['match'] for d in docs),
            'match_of': sum(1 for d in docs for x in d['l'] if x['req'] and x['vid']), 'stages': STAGES,
            'funnel': [{'st': i, 't': STAGES[i], 'n': sum(1 for d in docs if FL[i](d))} for i in range(len(STAGES))], 'by_m': by_m,
            'by_why': agg(lambda d, x: x['why'], True), 'by_g': agg(lambda d, x: x['g'], True), 'by_vid': agg(lambda d, x: x['vid'] or 'не указан', True),
            'by_req': agg(lambda d, x: x['req'] or 'не указано', True), 'by_cl': agg(lambda d, x: d['cl'])[:25],
            'by_n': agg(lambda d, x: re.sub(r'\s+(BOX\d|G|кресло|стул|табурет)\b.*$', '', x['n']).strip() or x['n'], True)[:25],
            'open_old': sorted([{'no': d['no'], 'd': d['d'], 'cl': d['cl'][:60], 'age': d['age'], 'stage': d['stage'], 'q': d['q'], 'sum': d['sum']} for d in docs if not d['closed']],
                               key=lambda z: -z['age'])[:40],
            'docs': [{'no': d['no'], 'd': d['d'], 'cl': d['cl'][:80], 'st': d['stage'], 'q': d['q'], 'sum': d['sum'], 'pd': d['proc_days'], 'sd': d['ship_days'],
                      'bad': d['bad_form'], 'lines': d['lines'], 'why': sorted(set(x['why'] for x in d['l']))[:3],
                      'g': sorted(set(g for x in d['l'] for g in x['g']))[:3]} for d in docs]}


TZ_ST = [('kd', 'Коммерческий директор'), ('pto', 'ПТО'), ('peo', 'ПЭО'), ('omts', 'ОМТС'), ('price', 'Прайс')]
TZ_STAGE = {None: 'у коммерческого директора', 'kd': 'у ПТО', 'pto': 'у ПЭО', 'peo': 'цена рассчитана', 'omts': 'у ОМТС', 'price': 'в прайсе'}


def parse_tz(rows, asof):
    """1С «РеестрТехЗаданийClaude»: Месяц (0) | Номер «ММ_ГГГГ_N» (1) | Ответственный (2) | Дата подачи (3) | Дата актуальности (4) | Тема (5) |
    статусы КД (6), ПТО (7), ПЭО (8), ОМТС (9), Прайс (10) | Комментарий (11) | Закрыто ✔ (12); следующая строка — даты статусов.
    «В работе» — без отметки «Закрыто». → схема build/tz/parse_tz_1c.py (tz_1c.json) + closed — сколько закрыто."""
    today = _date(asof)
    out, closed = [], 0
    for i, r in enumerate(rows):
        num_ = s_(c(r, 1))
        if not re.match(r'^\d{2}_\d{4}_\d+$', num_): continue
        if s_(c(r, 12)): closed += 1; continue
        nx = rows[i + 1] if i + 1 < len(rows) else []
        mm, yy, k = num_.split('_')
        subj = s_(c(r, 5))
        m = re.match(r'^ТЗ\s*№\s*[\d/]+\s*(.*)$', subj)
        body = (m.group(1) if m else subj).strip()
        prod, _, client = body.rpartition('_') if '_' in body else (body, '', '')
        st = {}
        for j, (key, _) in enumerate(TZ_ST):
            if s_(c(r, 6 + j)): st[key] = [s_(c(r, 6 + j)), dmy(c(nx, 6 + j)) or None]
        last = None
        for key, _ in TZ_ST:
            if key in st: last = key
        since = st[last][1] if last else dmy(c(r, 3))
        due = dmy(c(r, 4))
        it = {'num': num_, 'tz': '%s/%s' % (mm, k), 'y': int(yy), 'by': s_(c(r, 2)), 't0': dmy(c(r, 3)), 'due': due, 'subj': subj,
              'p': prod.strip() or body, 'c': client.strip(), 'st': st, 'stage': TZ_STAGE[last], 'since': since, 'note': s_(c(r, 11))}
        it['days'] = (today - _date(since)).days if since else None
        it['late'] = (today - _date(due)).days if due and _date(due) < today else 0
        out.append(it)
    out.sort(key=lambda x: (-(x['late'] or 0), x['t0'] or ''))
    stages = {}
    for x in out: stages[x['stage']] = stages.get(x['stage'], 0) + 1
    return {'asof': asof, 'src': '1С «ТЗ в работе», выгрузка ' + '.'.join(reversed(asof.split('-'))),
            'n': len(out), 'closed': closed, 'late': sum(1 for x in out if x['late']), 'stages': stages,
            'order': [TZ_STAGE[k] for k in ['kd', 'pto', 'peo', 'omts', 'price']], 'list': out}


def asof_from(subj, sent_date):
    m = re.search(r'от\s+(\d\d)\.(\d\d)\.(\d{4})', subj or '')
    return _iso(m.group(3), m.group(2), m.group(1)) if m else sent_date


def ingest(subj, fn, data, sent_date, jload, jsave, log):
    """из live.ingest_message: xlsx рассылки 1С → state/recl_1c.json или state/tz_1c.json; → (вид 'recl'|'tz1c', дата) или None"""
    if not str(fn).lower().endswith('.xlsx'): return None
    kind = 'recl' if RECL_SUBJ.search(subj or '') else 'tz1c' if TZ_SUBJ.search(subj or '') else None
    if not kind: return None
    asof = asof_from(subj, sent_date)
    rows = read_rows(data)
    res = parse_recl(rows, asof) if kind == 'recl' else parse_tz(rows, asof)
    name = 'recl_1c.json' if kind == 'recl' else 'tz_1c.json'
    old = jload(name, {}) or {}
    if str((old.get('asof') if kind == 'tz1c' else (old.get('open') or {}).get('asof')) or '') > asof: return (kind, asof)   # старое письмо после нового — не затираем
    jsave(name, res)
    pend = jload('rep_1c_pub.json', {}) or {}
    pend[kind] = asof; jsave('rep_1c_pub.json', pend)
    log('  1С', kind, asof, 'рекламаций' if kind == 'recl' else 'ТЗ в работе', (res['all']['n'] if kind == 'recl' else res['n']))
    return (kind, asof)


def publish_all(jload, jsave, publish, exists):
    """st/recl.bin и st/tz1c.bin (k_live — как sales.bin, docs.bin) для «Продажи → Рекламации» и «Реестр ТЗ в работе»:
    только когда пришёл новый файл (state/rep_1c_pub.json) или файла на сайте ещё нет"""
    pend = jload('rep_1c_pub.json', {}) or {}
    done = []
    for kind, name, bn in (('recl', 'recl_1c.json', 'recl.bin'), ('tz1c', 'tz_1c.json', 'tz1c.bin')):
        if not pend.get(kind) and exists(bn): continue
        r = jload(name, None)
        if not r: continue
        if publish(bn, dict(r, v=1)): done.append(bn); pend.pop(kind, None)
    if done: jsave('rep_1c_pub.json', pend)
    return done
