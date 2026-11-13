# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — движение по складам в разрезе филиалов: отчёт 1С «Товары на складах» (03.11.2026).
Т. В. Сотрудник1 03.11.2026: «Динамика складов показана абсолютно неверно на схеме. Возьми отчет от Сотрудник10, используй его как базу.
То есть движение по складу в разрезе филиалов то же самое. Склады брака тоже можно указать уже внутри отчета. На главной плашке…
должно быть указано общее количество согласно того отчета.» Образец — письмо М. М. Сотрудник10 02.11.2026 «Октябрь 2026 Запасы ГП»
(«Запасы ГП 01_30.10.2026.xlsx»). Отчество44 рассылка этого отчёта на user1@example.org запрошена у В. В. Сотрудник6 03.11.2026.
Отчёт: показатели — Начальный остаток, Приход, Расход, Конечный остаток (шт, базовые единицы); группировки строк — Склад →
Вид номенклатуры сбыт → Номенклатура → Характеристика (уровни структуры строк 0…3); последняя строка «Итог».
Филиал: склады «Офис продаж <город> [Выставка|Рекламации|брак]» → «ОП <город>», остальные склады → «Рязань».
Брак и рекламации — склады с «брак»/«рекламац» в названии, внутри своего филиала (отметка k='brak'), выставки — k='vyst'.
Сборка портала (build/stock_move.py) и робот хостинга (live.py) разбирают файл этим же кодом. Python 3.6: без f-строк с «=»."""
import calendar, io, re, zipfile

MON = {'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'ма': 5, 'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10, 'ноябр': 11, 'декабр': 12}
FN = re.compile(r'запас\w*\s*гп|товары\s+на\s+складах', re.I)
RAZ = 'Рязань'
SUFFIX = re.compile(r'\s+(выставка|рекламации|брак)\s*$', re.I)


def is_mv(fn, subj=''):
    """вложение похоже на отчёт «Товары на складах» (по имени файла или теме письма); точно — проверяет parse() по шапке"""
    return str(fn or '').lower().endswith('.xlsx') and bool(FN.search(str(fn or '')) or FN.search(str(subj or '')))


def fix_xlsx(data):
    """1С пишет часть книги как «xl/SharedStrings.xml» (с большой буквы) — openpyxl её не находит; имена частей — по стандарту"""
    zi = zipfile.ZipFile(io.BytesIO(data))
    names = zi.namelist()
    if 'xl/sharedStrings.xml' in names or not any(n.lower() == 'xl/sharedstrings.xml' for n in names): return data
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as zo:
        for n in names: zo.writestr('xl/sharedStrings.xml' if n.lower() == 'xl/sharedstrings.xml' else n, zi.read(n))
    return out.getvalue()


def _num(x): return float(x) if isinstance(x, (int, float)) else 0.0


def _r(x):
    x = round(x, 1)
    return int(x) if x == int(x) else x


def clean(n): return re.sub(r'\s+', ' ', str(n or '')).replace('( ', '(').replace(' )', ')').strip()


def kind(n):
    l = n.lower()
    if re.search('рекламац|брак', l): return 'brak'
    if 'выстав' in l: return 'vyst'
    return ''


def branch(n):
    """название склада 1С → (филиал, подпись склада внутри филиала, полное короткое имя)"""
    n = clean(n)
    if n.lower().startswith('офис продаж'):
        rest = n[len('офис продаж'):].strip(); m = SUFFIX.search(rest)
        city = rest[:m.start()].strip() if m else rest
        lab = m.group(1).capitalize() if m else 'Основной склад'
        return 'ОП ' + city, lab, 'ОП ' + city + ('' if not m else ' · ' + lab.lower())
    return RAZ, n, n


def _period(rows, fname, got_date=None):
    """строка «Период: …» → (месяц ГГГГ-ММ, с, по). «Октябрь 2026 г.» — весь месяц (имя «Запасы ГП 01_30.10.2026» — по 30.10;
    месяц ещё идёт — по день перед письмом); «01.11.2026 - 02.11.2026» — эти даты"""
    line = ''
    for row in rows[:10]:
        for c in row:
            s = str(c or '')
            if s.startswith('Период'): line = s; break
        if line: break
    if not line: return None
    ds = re.findall(r'(\d{2})\.(\d{2})\.(\d{4})', line)
    if ds:
        a, b = ds[0], ds[-1]
        fr = '%s-%s-%s' % (a[2], a[1], a[0]); to = '%s-%s-%s' % (b[2], b[1], b[0])
        return fr[:7], fr, to
    mm = re.search(r'Период:\s*([А-Яа-яё]+)\s+(\d{4})', line)
    if not mm: return None
    w = mm.group(1).lower()
    k = next((v for p, v in sorted(MON.items(), key=lambda x: -len(x[0])) if w.startswith(p)), None)
    if not k: return None
    y = int(mm.group(2)); m = '%d-%02d' % (y, k)
    to = '%s-%02d' % (m, calendar.monthrange(y, k)[1])
    f = re.search(r'(\d{2})_(\d{2})\.(\d{2})\.(\d{4})', str(fname or ''))
    if f and '%s-%s' % (f.group(4), f.group(3)) == m: to = '%s-%s' % (m, f.group(2))
    elif got_date and str(got_date)[:7] == m and str(got_date) <= to:          # месяц ещё идёт — остаток на вчера
        import datetime as _dt
        g = _dt.datetime.strptime(str(got_date)[:10], '%Y-%m-%d') - _dt.timedelta(days=1)
        to = max(m + '-01', g.strftime('%Y-%m-%d'))
    return m, m + '-01', to


def parse(data, fname='', got_date=None, src=None):
    """bytes xlsx → данные «движения за месяц» (схема v2, см. gen_stock.py) или None, если это не отчёт «Товары на складах»"""
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(fix_xlsx(data)))        # не read_only: нужны уровни структуры строк
    ws = wb.worksheets[0]
    head = [[ws.cell(i, c).value for c in range(1, 9)] for i in range(1, 15)]
    nc, cols = 2, [3, 4, 5, 6]                                      # форма Сотрудник10: имена — B, числа — C…F
    if not any(str(c or '').strip() == 'Товары на складах' for row in head for c in row):
        # 06.11.2026 (Т. В., опрос: «Без Материалов»): рассылка 1С «Товары на складах за месяц вчерашним днём … claude.xlsx» —
        #   без заголовка и строки «Период»: шапка «Склад | … | Количество Начальный остаток | Приход | Расход | Конечный остаток»
        #   (имена — A, числа — E…H), итог — «Итого»; период — с 1-го числа по день перед письмом (по имени файла «вчерашним днём»).
        hr = next((i for i, row in enumerate(head) if str(row[0] or '').strip() == 'Склад'
                   and any('конечный остаток' in str(c or '').lower() for c in row)), None)
        if hr is None or not FN.search(str(fname or '')): return None
        H = [str(c or '').lower() for c in head[hr]]
        try: cols = [next(j + 1 for j, c in enumerate(H) if w in c) for w in ('начальный остаток', 'приход', 'расход', 'конечный остаток')]
        except StopIteration: raise ValueError('нет колонок остатков')
        nc = 1
        if not (got_date and 'вчерашн' in str(fname or '').lower()): raise ValueError('нет строки «Период: …»')
        import datetime as _dt
        to = (_dt.datetime.strptime(str(got_date)[:10], '%Y-%m-%d') - _dt.timedelta(days=1)).strftime('%Y-%m-%d')
        m, fr = to[:7], to[:7] + '-01'
    else:
        P = _period(head, fname, got_date)
        if not P: raise ValueError('нет строки «Период: …»')
        m, fr, to = P
    start = None
    for i in range(1, 41):
        if str(ws.cell(i, nc).value or '').startswith('Характеристика'): start = i + 1; break
    if not start: raise ValueError('нет шапки отчёта')
    W, tot, cur, ct, cm, skip, mat = [], None, None, None, None, False, [0.0] * 4
    for i in range(start, ws.max_row + 1):
        lvl = ws.row_dimensions[i].outline_level or 0
        v = [ws.cell(i, c).value for c in [nc] + cols]
        if v[0] is None and lvl == 0 and not any(isinstance(x, (int, float)) for x in v[1:]): continue
        if lvl == 0 and str(v[0]).strip() in ('Итог', 'Итого'): tot = [_num(x) for x in v[1:]]; continue
        rec = [_num(x) for x in v[1:]]
        name = clean(v[0]) if v[0] is not None else ''
        if lvl == 0 and 'склад материалов' in name.lower(): return None   # 06.11.2026: отчёт со складом материалов — не остатки ГП
        if lvl <= 1: skip = False
        if lvl == 1 and cur is not None and name.lower() == 'материалы':  # 06.11.2026 (Т. В.: «Без Материалов»): вид «Материалы» не считаем
            skip = True
            for k in range(4): cur['v'][k] -= rec[k]; mat[k] += rec[k]
            continue
        if skip: continue
        if lvl == 0: cur = {'n': name, 'v': rec, 't': []}; W.append(cur)
        elif lvl == 1 and cur is not None: ct = {'n': name, 'v': rec, 'm': []}; cur['t'].append(ct)
        elif lvl == 2 and ct is not None: cm = {'n': name, 'v': rec, 'c': []}; ct['m'].append(cm)
        elif cm is not None: cm['c'].append([name] + rec)
    if not W: raise ValueError('в отчёте нет складов')
    if tot: tot = [tot[k] - mat[k] for k in range(4)]

    def bal(v, what):
        if abs(v[0] + v[1] - v[2] - v[3]) > 0.01: raise ValueError('не сходится %s: %s' % (what, v))
    S = [0.0] * 4
    for w in W:
        bal(w['v'], w['n'])
        for k in range(4): S[k] += w['v'][k]
        ts = [sum(t['v'][k] for t in w['t']) for k in range(4)]
        if w['t'] and any(abs(ts[k] - w['v'][k]) > 0.01 for k in range(4)): raise ValueError('виды не дают склад: %s' % w['n'])
        for t in w['t']:
            bal(t['v'], w['n'] + ' / ' + t['n'])
            for mo in t['m']:
                bal(mo['v'], w['n'] + ' / ' + mo['n'])
                for c in mo['c']: bal(c[1:], w['n'] + ' / ' + mo['n'] + ' / ' + c[0])
    if tot and any(abs(S[k] - tot[k]) > 0.01 for k in range(4)): raise ValueError('итог 1С %s ≠ сумма складов %s' % (tot, S))
    if not tot: tot = S
    # филиалы: склады по филиалу, внутри — по конечному остатку (больше — выше); филиалы — так же
    B = {}
    for w in W:
        bn, lab, full = branch(w['n']); kd = kind(w['n'])
        B.setdefault(bn, []).append({'n': full, 'l': lab, 'k': kd, 'src': w['n'], 'v': [_r(x) for x in w['v']],
            't': [{'n': t['n'], 'v': [_r(x) for x in t['v']],
                   'm': [{'n': re.sub(r', шт$', '', mo['n']), 'v': [_r(x) for x in mo['v']],
                          'c': [[c[0] or '(характеристика не указана)'] + [_r(x) for x in c[1:]] for c in mo['c']]} for mo in t['m']]}
                  for t in sorted(w['t'], key=lambda t: -t['v'][3])]})
    G = []
    for bn, ws_ in B.items():
        ws_.sort(key=lambda w: -w['v'][3])                               # по конечному остатку: больше — выше (брак — в общем порядке, с отметкой)
        bk = [w for w in ws_ if w['k'] == 'brak']
        G.append({'n': bn, 'v': [_r(sum(w['v'][k] for w in ws_)) for k in range(4)],
                  'b': [_r(sum(w['v'][k] for w in bk)) for k in range(4)], 'nb': len(bk), 'w': ws_})
    G.sort(key=lambda g: -g['v'][3])
    allb = [w for g in G for w in g['w'] if w['k'] == 'brak']
    neg = sorted([[w['n'], mo['n'], c[0], c[4]] for g in G for w in g['w'] for t in w['t'] for mo in t['m'] for c in mo['c'] if c[4] < 0],
                 key=lambda x: x[3])
    return {'v': 2, 'm': m, 'from': fr, 'to': to, 'src': src or str(fname or ''), 'rep': '1С «Товары на складах»',
            'tot': [_r(x) for x in tot], 'brak': [_r(sum(w['v'][k] for w in allb)) for k in range(4)], 'nbrak': len(allb),
            'nw': len(W), 'nmod': len({mo['n'] for w in W for t in w['t'] for mo in t['m']}),
            'npos': sum(len(mo['c']) for w in W for t in w['t'] for mo in t['m']), 'g': G, 'neg': neg}


def summary(J):
    """коротко — для плитки на главной и таблицы по дням: итог, брак, филиалы [имя, начало, приход, расход, конец]"""
    return {'m': J['m'], 'from': J['from'], 'to': J['to'], 'tot': J['tot'], 'brak': J.get('brak'), 'nw': J.get('nw'),
            'g': [[g['n']] + g['v'] for g in J['g']]}


# ---------- робот хостинга (live.py)
def ingest(fn, data, got_iso, jload, jsave, log):
    """вложение письма → state/stock_mv.json (месяцы и итоги по дням); вернуть «по» отчёта или None, если это не «Товары на складах»"""
    J = parse(data, fn, str(got_iso)[:10], src=str(fn)[:120])
    if not J: return None
    J['got'] = str(got_iso)[:16]
    st = jload('stock_mv.json', {}) or {}
    M = st.setdefault('months', {})
    D = st.setdefault('days', {})
    od = D.get(J['to'])                                           # итог на этот день: позднее письмо за тот же день — заменяет
    if not od or str(od.get('got', '')) <= J['got']: D[J['to']] = dict(summary(J), got=J['got'])
    for k in sorted(D)[:-120]: D.pop(k, None)
    old = M.get(J['m'])
    if old and (old.get('to', '') > J['to'] or (old.get('to') == J['to'] and str(old.get('got', '')) > J['got'])):
        jsave('stock_mv.json', st); jsave('stock_mv_pub.json', {'p': 1})
        log('  движение по складам: %s по %s — месяц уже есть новее (по %s), записан только итог дня' % (J['m'], J['to'], old.get('to'))); return J['to']
    M[J['m']] = J
    for k in sorted(M)[:-3]: M.pop(k, None)                      # подробно — три последних месяца
    st['got'] = max(str(st.get('got') or ''), J['got'])
    jsave('stock_mv.json', st)
    jsave('stock_mv_pub.json', {'p': 1})
    log('  движение по складам: %s по %s — итог %s шт, складов %d, брак и рекламации %s' % (J['m'], J['to'], J['tot'][3], J['nw'], (J.get('brak') or [0] * 4)[3]))
    return J['to']


def bins(st):
    """state → (smv.bin: месяцы подробно, свежий первым; smvs.bin: коротко для главной и таблица по дням)"""
    M = st.get('months') or {}
    if not M: return None, None
    ms = [M[k] for k in sorted(M, reverse=True)]
    D = st.get('days') or {}
    full = {'v': 2, 't': st.get('got'), 'months': ms, 'days': [D[k] for k in sorted(D)]}
    short = {'v': 2, 't': st.get('got'), 'last': summary(ms[0]), 'days': [D[k] for k in sorted(D)][-40:]}
    return full, short


def publish_all(jload, jsave, publish, exists):
    """st/smv.bin и st/smvs.bin (ключ сайта, как sales.bin): после нового отчёта или если файлов на сайте ещё нет"""
    pend = jload('stock_mv_pub.json', {}) or {}
    if not pend.get('p') and exists('smv.bin') and exists('smvs.bin'): return []
    full, short = bins(jload('stock_mv.json', {}) or {})
    if not full: return []
    done = []
    if publish('smv.bin', full): done.append('smv.bin')
    if publish('smvs.bin', short): done.append('smvs.bin')
    if len(done) == 2: jsave('stock_mv_pub.json', {})
    return done
