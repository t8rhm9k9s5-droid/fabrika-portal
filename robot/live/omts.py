# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — раздел ОМТС портала (28.10.2026).
Пользователь 27.10: «Нужен раздел ОМТС на главной странице: там начнём сроки поставки материалов, нормативные остатки, установленные на фабрике,
отчёты по просроченным заявкам».

Запуск — из live.py (cron хостинга), без Claude. Источник — архив itm@ (itm_arch.py: state/arch_index.jsonl + arch/files/<sha>.<ext>), только чтение:
 • 1С «Жилпромсервис Заявки снабжения: просроченные даты поставки» и «ФТС Заявки снабжения: просроченные даты поставки» — ежедневно;
 • 1С «Покупные товары» (рассылка «Покупные товары для рассылки.xls»).
Последний отчёт каждого вида → таблица (строка заголовка находится сама), по всем дням — сколько строк было в отчёте (динамика с 01.08).
→ st/omts.bin (зашифрован, как ls.bin); state/omts_sample.json — первые строки файлов как есть (чтобы подстроить разбор)."""
import json, os, re

KINDS = [
    ('zps', 'ЖПС — просроченные заявки снабжения', re.compile(r'жилпромсервис\s+заявки снабжения', re.I)),
    ('fts', 'ФТС — просроченные заявки снабжения', re.compile(r'фтс\s+заявки снабжения', re.I)),
    ('pok', 'Покупные товары', re.compile(r'покупные товары', re.I)),
]
MAX_ROWS = 600


def _cell(v):
    if v is None: return ''
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else ('%.3f' % v).rstrip('0').rstrip('.')
    return re.sub(r'\s+', ' ', str(v)).strip()


def read_rows(path):
    import safe_doc as SAFE                    # 04.11.2026 аудит 29.10 (Ж4): файлы из почты — до openpyxl/xlrd (размер, zip-бомба, DOCTYPE/ENTITY)
    bad = SAFE.check_file(path)
    if bad: raise ValueError('небезопасный файл: ' + bad)
    if path.endswith('.xlsx'):
        import openpyxl
        ws = openpyxl.load_workbook(path, read_only=True, data_only=True).worksheets[0]
        return [[_cell(v) for v in r[:30]] for r in ws.iter_rows(max_row=4000, values_only=True)]
    import xlrd
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    out = []
    for r in range(min(sh.nrows, 4000)):
        row = []
        for c in range(min(sh.ncols, 30)):
            v = sh.cell_value(r, c)
            if sh.cell_type(r, c) == xlrd.XL_CELL_DATE:
                try:
                    t = xlrd.xldate_as_tuple(v, 0); v = '%02d.%02d.%04d' % (t[2], t[1], t[0])
                except Exception:
                    # намеренно: если Excel-дата не преобразуется, передаём исходное значение в _cell.
                    pass
            row.append(_cell(v))
        out.append(row)
    return out


def table(rows):
    """→ (заголовок, строки данных): заголовок — первая строка (из первых 25) с ≥3 текстовыми ячейками, лучше со словом «дата»/«поставщик»/«номенклатура»"""
    best, bi = -1, None
    for i, r in enumerate(rows[:25]):
        txt = [x for x in r if x and re.search(r'[А-Яа-яA-Za-z]', x)]
        if len(txt) < 3: continue
        sc = len(txt) + 5 * sum(1 for x in txt if re.search(r'дата|поставщик|номенклатур|заявк|количеств|контрагент|ответствен|срок', x, re.I))
        if sc > best: best, bi = sc, i
    if bi is None: return [], []
    hdr = rows[bi]
    keep = [j for j in range(len(hdr)) if hdr[j] or any(len(r) > j and r[j] for r in rows[bi + 1:bi + 200])]
    hdr = [hdr[j] or ('Колонка %d' % (j + 1)) for j in keep]
    data = []
    for r in rows[bi + 1:]:
        vals = [r[j] if j < len(r) else '' for j in keep]
        if sum(1 for v in vals if v) < 2: continue
        if re.match(r'^\s*(итого|всего)\b', ' '.join(vals[:2]), re.I): continue
        data.append(vals)
    return hdr, data


REQ_RE = re.compile(r'Заявка в снабжение\s+0*(\d+)\s+от\s+(\d\d\.\d\d\.\d{4})', re.I)
DATE_RE = re.compile(r'^(\d\d)\.(\d\d)\.(\d{4})')


def _col(row, *names):
    for j, v in enumerate(row):
        if any(n in (v or '').lower() for n in names): return j
    return None


def parse_requests(rows, today):
    """1С «Заявки снабжения: просроченные даты поставки»: строка заявки (Ссылка | Дата утверждения | Ответственный | Участок)
    и под ней строки номенклатуры (Номенклатура | Характеристика | Описание | Количество | Ед. | Статус | Срок поставщика)"""
    hr = next((i for i, r in enumerate(rows[:20]) if _col(r, 'ссылка') is not None and _col(r, 'ответствен') is not None), None)
    hi = next((i for i, r in enumerate(rows[:20]) if _col(r, 'номенклатур') is not None and _col(r, 'статус') is not None), None)
    if hr is None or hi is None: return None
    R, I = rows[hr], rows[hi]
    cR = {k: _col(R, *v) for k, v in (('ref', ('ссылка',)), ('appr', ('утвержд',)), ('resp', ('ответствен',)), ('area', ('участок',)))}
    cI = {k: _col(I, *v) for k, v in (('nom', ('номенклатур',)), ('char', ('характеристик',)), ('desc', ('описан',)), ('qty', ('количеств',)),
                                       ('unit', ('единиц',)), ('st', ('статус',)), ('term', ('срок',)))}
    g = lambda r, j: (r[j] if j is not None and j < len(r) else '') or ''
    reqs, cur = [], None
    for r in rows[max(hr, hi) + 1:]:
        m = REQ_RE.search(g(r, cR['ref'])) or next((REQ_RE.search(x) for x in r if REQ_RE.search(x or '')), None)
        if m:
            cur = {'no': m.group(1), 'd': m.group(2), 'appr': g(r, cR['appr']), 'resp': g(r, cR['resp']), 'area': g(r, cR['area']), 'items': []}
            reqs.append(cur); continue
        if cur is None or not any(r): continue
        if re.match(r'^\s*(итого|всего)', ' '.join(x for x in r if x), re.I): continue
        it = {k: g(r, j) for k, j in cI.items()}
        if not it['nom'] and not it['qty']: continue
        cur['items'].append(it)
    def age(x):
        m = DATE_RE.match(x or '')
        if not m: return None
        import datetime
        try: return (today - datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))).days
        except ValueError: return None
    for q in reqs:
        q['age'] = age(q['appr']) if q['appr'] else age(q['d'])
        for it in q['items']: it['late'] = age(it['term']) if it.get('term') else None
    by = lambda key: sorted(((k, sum(1 for q in reqs if (q.get(key) or '—') == k), sum(len(q['items']) for q in reqs if (q.get(key) or '—') == k))
                             for k in set((q.get(key) or '—') for q in reqs)), key=lambda x: -x[2])
    st = {}
    for q in reqs:
        for it in q['items']: st[it['st'] or '—'] = st.get(it['st'] or '—', 0) + 1
    return {'reqs': reqs[:400], 'n_req': len(reqs), 'n_items': sum(len(q['items']) for q in reqs), 'by_resp': by('resp')[:30], 'by_area': by('area')[:30],
            'by_status': sorted(st.items(), key=lambda x: -x[1]), 'oldest': max((q['age'] or 0) for q in reqs) if reqs else None}


def parse_stock(rows):
    """1С «Покупные товары для рассылки»: строка склада (Склад | … | остаток) и под ней номенклатура (Номенклатура | Характеристика | количество)"""
    hs = next((i for i, r in enumerate(rows[:10]) if _col(r, 'склад') is not None), None)
    hn = next((i for i, r in enumerate(rows[:10]) if _col(r, 'номенклатур') is not None), None)
    if hs is None or hn is None: return None
    qcol = _col(rows[hs], 'количеств', 'остаток')
    ccol = _col(rows[hn], 'характеристик')
    whs, cur = [], None
    for r in rows[max(hs, hn) + 1:]:
        vals = [x for x in r if x]
        if not vals: continue
        q = r[qcol] if qcol is not None and qcol < len(r) else vals[-1]
        try: qn = float(str(q).replace(',', '.').replace(' ', ''))
        except ValueError: qn = None
        if re.match(r'^\s*итого', vals[0], re.I): continue
        if ccol is not None and ccol < len(r) and not r[ccol]:
            cur = {'wh': vals[0], 'q': qn, 'items': []}; whs.append(cur)
        elif cur is not None:
            cur['items'].append({'nom': vals[0], 'char': r[ccol] if ccol is not None and ccol < len(r) else '', 'q': qn})
    return {'whs': whs, 'total': sum((w['q'] or 0) for w in whs), 'n_items': sum(len(w['items']) for w in whs)}


# 28.10.2026, пользователь: «по ОМТС поднимай отчёты по заявкам в отдел, с 1/08 по текущую дату — в папке ОМТС это всё есть».
# Каждый ежедневный отчёт 1С «Заявки снабжения: просроченные даты поставки» (ЖПС и ФТС) разбирается один раз (кэш state/omts_hist_cache.json):
# какие заявки были в просрочке в этот день. По всем дням — история: когда заявка попала в просрочку и когда ушла из отчёта (закрыта),
# сколько дней висела, по ответственным и участкам, по неделям: открыто на конец недели, новые, закрытые.
def _dt(s):
    import datetime
    m = DATE_RE.match(s or '')
    if not m: return None
    try: return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError: return None


def history(files, cacheH, today, since='2026-08-01'):
    import datetime
    daily = {}
    for t, p, n in files:
        if (t or '')[:10] < since: continue
        key = os.path.basename(p)
        if key not in cacheH:
            try:
                P = parse_requests(read_rows(p), today)
                cacheH[key] = {'r': [[q['no'], q['d'], q.get('appr') or '', q.get('resp') or '', q.get('area') or '', len(q['items']),
                                      sorted(set(it.get('st') or '' for it in q['items']))[:4], [(it.get('nom') or '')[:60] for it in q['items'][:3]]] for q in (P or {}).get('reqs', [])]} if P else {'err': 1}
            except Exception as e: cacheH[key] = {'err': str(e)[:80]}
        c = cacheH[key]
        if c.get('r') is None: continue
        daily[(t or '')[:10]] = c['r']                                   # за день — последний отчёт
    if not daily: return None
    days = sorted(daily)
    last_day = days[-1]
    R = {}
    for d in days:
        for no, dq, appr, resp, area, ni, sts, noms in daily[d]:
            r = R.get(no)
            if not r: R[no] = r = {'no': no, 'd': dq, 'appr': appr, 'resp': resp, 'area': area, 'first': d, 'last': d, 'n': ni, 'st': sts, 'nom': noms, 'seen': 0}
            r['last'] = d; r['n'] = max(r['n'], ni); r['st'] = sts; r['seen'] += 1
            if resp: r['resp'] = resp
            if area: r['area'] = area
    def dd(a, b):
        try: return (datetime.date(*map(int, b.split('-'))) - datetime.date(*map(int, a.split('-')))).days
        except Exception: return None
    for r in R.values():
        r['open'] = r['last'] == last_day
        r['in'] = dd(r['first'], r['last']) + 1 if dd(r['first'], r['last']) is not None else None     # дней в отчётах о просрочке
        a = _dt(r['appr']) or _dt(r['d'])
        r['age'] = (today - a).days if a and r['open'] else None
    ops = [r for r in R.values() if r['open']]; cls = [r for r in R.values() if not r['open']]
    ins = sorted(r['in'] for r in cls if r['in'] is not None)
    # по неделям (понедельник — начало)
    def wk(d):
        x = datetime.date(*map(int, d.split('-'))); return (x - datetime.timedelta(days=x.weekday())).isoformat()
    W = {}
    for d in days:
        w = W.setdefault(wk(d), {'w': wk(d), 'end': 0, 'new': 0, 'closed': 0})
        w['end'] = len(daily[d])
    for r in R.values():
        W[wk(r['first'])]['new'] += 1
        if not r['open']:
            # закрыта — первый отчётный день после последнего появления
            nxt = next((d for d in days if d > r['last']), None)
            if nxt: W[wk(nxt)]['closed'] += 1
    # 01.11.2026, пользователь: «Во всех отчетах нужны данные за вчера, за прошлую неделю и за прошлый месяц» — по каждому отчётному дню:
    # заявок в просрочке (на конец дня), позиций в них, новых в просрочке и закрытых (первый день, когда заявки в отчёте уже нет); первый день — база, новых нет
    DN = {d: [d, len(daily[d]), sum(x[5] for x in daily[d]), 0, 0] for d in days}
    for r in R.values():
        if r['first'] != days[0]: DN[r['first']][3] += 1
        if not r['open']:
            nxt = next((d for d in days if d > r['last']), None)
            if nxt: DN[nxt][4] += 1
    def by(key):
        m = {}
        for r in R.values():
            k = r.get(key) or '—'; e = m.setdefault(k, [k, 0, 0, 0])
            e[1] += 1; e[2] += 1 if r['open'] else 0; e[3] += 0 if r['open'] else 1
        return sorted(m.values(), key=lambda x: (-x[2], -x[1]))[:25]
    slim = lambda r: {k: r[k] for k in ('no', 'd', 'appr', 'resp', 'area', 'first', 'last', 'n', 'st', 'nom', 'in', 'age', 'open')}
    return {'since': days[0], 'to': last_day, 'reports': len(days), 'total': len(R), 'open': len(ops), 'closed': len(cls),
            'med_in': ins[len(ins) // 2] if ins else None, 'avg_in': round(sum(ins) / len(ins), 1) if ins else None, 'max_age': max((r['age'] or 0) for r in ops) if ops else None,
            'days': [[d, len(daily[d]), sum(x[5] for x in daily[d])] for d in days], 'dn': [DN[d] for d in days], 'weeks': [W[k] for k in sorted(W)],
            'by_resp': by('resp'), 'by_area': by('area'),
            'long': [slim(r) for r in sorted(ops, key=lambda r: -(r['age'] or 0))[:40]],
            'closed_list': [slim(r) for r in sorted(cls, key=lambda r: r['last'], reverse=True)[:60]]}


def run(L, log, jload, jsave, publish, iso):
    import datetime
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    if not os.path.exists(idx): return {'state': 'нет архива itm@'}
    files = {k: [] for k, _, _ in KINDS}
    cache = jload('omts_cache2.json', {})            # 12.11.2026: старые вложения робот удаляет через 3 дня — точка ряда берётся из кэша
    with open(idx, encoding='utf-8') as _cg2_file_1:
        for ln in _cg2_file_1:
            try: r = json.loads(ln)
            except Exception: continue
            if r.get('fr') != 'user3@example.org': continue
            for k, _, rx in KINDS:
                if not rx.search(r.get('s') or ''): continue
                for a in r.get('a') or []:
                    ext = os.path.splitext((a.get('n') or '').lower())[1]
                    if ext in ('.xls', '.xlsx') and a.get('p') and (k != 'pok' or 'покупн' in (a.get('n') or '').lower()):
                        p = os.path.join(L, 'arch', 'files', a['sha'] + ext)
                        if os.path.exists(p) or os.path.basename(p) in cache: files[k].append((r.get('t') or '', p, a.get('n')))
                break
    out = {'t': iso(datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3)))), 'kinds': []}
    sample = {}
    for k, title, _ in KINDS:
        L_ = sorted(set(files[k]))
        series = []
        for t, p, n in L_:
            key = os.path.basename(p)
            if key not in cache:
                try:
                    rr = read_rows(p)
                    P = parse_requests(rr, datetime.date.today()) if k in ('zps', 'fts') else parse_stock(rr)
                    cache[key] = (P.get('n_items') if k != 'pok' else int(P.get('total') or 0)) if P else len(table(rr)[1])
                except Exception as e: cache[key] = -1
            if cache[key] >= 0: series.append([t[:10], cache[key]])
        rec = {'k': k, 'n': title, 'series': series[-120:], 'files': len(L_)}
        if k in ('zps', 'fts'):
            try:
                cacheH = jload('omts_hist_cache.json', {})
                today_ = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).date()
                Hh = history(L_, cacheH, today_)
                jsave('omts_hist_cache.json', cacheH)
                if Hh: rec['hist'] = Hh
            except Exception as e: log('  ! ОМТС история:', e.__class__.__name__, e)
        if L_:
            t, p, n = L_[-1]
            try:
                rows = read_rows(p)
                sample[k] = {'file': n, 't': t, 'rows': rows[:1500]}       # 28.10: все строки — для реестров просрочки (state, не публикуется)
                today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3))).date()
                P = parse_requests(rows, today) if k in ('zps', 'fts') else parse_stock(rows)
                if P:
                    rec.update({'t': t, 'file': n, 'p': P, 'total': P.get('n_items') if k != 'pok' else P.get('total')})
                else:
                    hdr, data = table(rows)
                    rec.update({'t': t, 'file': n, 'hdr': hdr, 'rows': data[:MAX_ROWS], 'total': len(data)})
            except Exception as e:
                rec['err'] = e.__class__.__name__ + ': ' + str(e)[:120]
        out['kinds'].append(rec)
    jsave('omts_cache2.json', cache)
    jsave('omts_sample.json', sample)
    publish('omts.bin', out)
    return {'state': 'ok', 'kinds': {r['k']: r.get('total') for r in out['kinds']}, 't': out['t'],
            'hist': {r['k']: [(r.get('hist') or {}).get(x) for x in ('reports', 'total', 'open', 'closed', 'med_in')] for r in out['kinds'] if r.get('hist')}}
