# «Фабрика» — детализация звонков корпоративных номеров МТС (19.11.2026, Т. В.: «письма с МТС с отчётами по связи — учесть на портале
#   по сим-картам; по переговорам, по корпоративным номерам — особый контроль; анализ звонков соединить с базой клиентов»).
# Письма user38@example.org «МТС Рязань. Детализация разговоров по ЛС … за период с … по …» с вложением .xls (XML Spreadsheet 2003, cp1251).
# itm_arch.py кладёт вложение в arch/files/<sha24>.xls; здесь — разбор, сводка по номерам и по дням → st/calls.bin (ключ сайта).
# Сопоставление номера собеседника с клиентами 1С и сотрудниками делает страница портала (справочник телефонов — в зашифрованной сборке).
import os, re, json, datetime

FROM = 'user38@example.org'
DAYS = 45


def parse_xls(raw):
    s = raw.decode('cp1251', errors='replace')
    rows = [[re.sub(r'<[^>]+>', '', c).strip() for c in re.findall(r'<Cell[^>]*>(.*?)</Cell>', r, re.S)]
            for r in re.findall(r'<Row[^>]*>(.*?)</Row>', s, re.S)]
    me = next((r[1] for r in rows if len(r) > 1 and r[0].startswith('Сетевой ресурс')), '')
    out, hdr = [], False
    for r in rows:
        if r and r[0] == 'Дата': hdr = True; continue
        if hdr and len(r) >= 9 and re.match(r'\d\d\.\d\d\.\d{4}$', r[0]):
            a, _, b = r[3].partition('OT')
            out.append({'d': r[0][6:10] + '-' + r[0][3:5] + '-' + r[0][0:2], 't': r[1][:8].zfill(8), 'a': _n(a), 'b': _n(b), 'svc': r[6],
                        'dur': _sec(r[8]), 'zone': r[4][:40]})
    return _n(me), out


def _n(x):
    d = re.sub(r'\D', '', str(x or ''))
    return ('7' + d[-10:]) if len(d) >= 10 else d


def _sec(x):
    p = [int(v) for v in re.findall(r'\d+', str(x or ''))]
    if not p: return 0
    if len(p) == 1: return p[0] * 60 if ':' not in str(x) else p[0]
    s = 0
    for v in p: s = s * 60 + v
    return s


def _rows(L, since):
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    out, seen = [], set()
    if not os.path.exists(idx): return out
    with open(idx, encoding='utf-8') as f:
        for ln in f:
            if FROM not in ln: continue
            try: r = json.loads(ln)
            except Exception: continue
            if (r.get('fr') or '').lower() != FROM or (r.get('t') or '') < since: continue
            for a in r.get('a') or []:
                if a.get('p') and re.search(r'\.xls$', a.get('n') or '', re.I) and a['sha'] not in seen:
                    seen.add(a['sha']); out.append((r, a))
    return out


def run(L, log, jload, jsave, publish, now):
    st = jload('mts.json', {}) or {}
    done = set(st.get('done') or []); calls = st.get('calls') or {}
    since = (now - datetime.timedelta(days=DAYS)).strftime('%Y-%m-%d')
    new = 0
    for r, a in _rows(L, since):
        if a['sha'] in done: continue
        p = os.path.join(L, 'arch', 'files', a['sha'] + '.xls')
        if not os.path.exists(p): continue
        try:
            with open(p, 'rb') as f: me, cs = parse_xls(f.read())
        except Exception as e:
            log('  МТС: не разобран %s: %s' % (a.get('n'), str(e)[:80])); continue
        if not me:
            m = re.search(r'номер(\d{11})', a.get('n') or '')
            me = m.group(1) if m else ''
        for c in cs:
            if c['b'] == me: other, dirn = c['a'], 'out'          # «<кому>OT<наш номер>» — исходящий
            elif c['a'] == me: other, dirn = c['b'], 'in'
            else: other, dirn = c['a'], 'out'
            k = '%s|%s|%s|%s' % (me, c['d'], c['t'], other)
            calls[k] = {'me': me, 'd': c['d'], 't': c['t'], 'o': other, 'dir': dirn, 'svc': c['svc'], 'dur': c['dur']}
        done.add(a['sha']); new += 1
    keep = (now - datetime.timedelta(days=DAYS)).strftime('%Y-%m-%d')
    calls = {k: v for k, v in calls.items() if v['d'] >= keep}
    st['done'] = sorted(done)[-3000:]; st['calls'] = calls
    lines = {}
    for v in calls.values():
        ln = lines.setdefault(v['me'], {'n': 0, 'dur': 0, 'o': set(), 'days': {}})
        ln['n'] += 1; ln['dur'] += v['dur']; ln['o'].add(v['o'])
        dd = ln['days'].setdefault(v['d'], [0, 0]); dd[0] += 1; dd[1] += v['dur']
    out = {'v': 1, 't': now.strftime('%Y-%m-%dT%H:%M'), 'days': DAYS,
           'lines': {k: {'n': x['n'], 'dur': x['dur'], 'uniq': len(x['o']), 'days': x['days']} for k, x in lines.items()},
           'calls': sorted(calls.values(), key=lambda v: (v['d'], v['t']), reverse=True)[:3000]}
    if new or not st.get('pub'):
        if publish('calls.bin', out): st['pub'] = out['t']
    jsave('mts.json', st)
    return {'new': new, 'calls': len(calls), 'lines': len(lines)}
