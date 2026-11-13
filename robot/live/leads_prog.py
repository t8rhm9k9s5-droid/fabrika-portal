# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди).
"""«Фабрика» — лиды выставок: ход работы по 11 таблицам офисов (13.11.2026).
Т. В.: «это на особый контроль и напиши всем в отделе продаж — прогресс по мере появления весь учитывать и публиковать, Имя10 пусть всех торопит».
Раз в час (участок history): лист «Лиды» каждой таблицы (доступ «по ссылке») → CSV → только СЧЁТЧИКИ (без контактов): строк, отмечено (есть
хоть одна отметка в жёлтых K–N), со статусом, статусы, сегодня (прирост к первому замеру дня), по дням → st/leads.bin (ключ сайта).
Контакты из таблиц на хостинг не попадают. Сбой одной таблицы не портит остальные: у неё — прежние числа и пометка err."""
import csv, datetime, io, json, os, ssl, urllib.parse, urllib.request
MSK = datetime.timezone(datetime.timedelta(hours=3))


def _csv(sid, tab, timeout=40):
    u = 'https://docs.google.com/spreadsheets/d/%s/gviz/tq?tqx=out:csv&sheet=%s' % (sid, urllib.parse.quote(tab))
    with urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': 'fabrika-robot'}), context=ssl.create_default_context(), timeout=timeout) as r:
        rows = list(csv.reader(io.StringIO(r.read().decode('utf-8', 'replace'))))
    return [x for x in rows[1:] if any((c or '').strip() for c in x[:10])]


def run(L, log, jload, jsave, publish, here=None, force=False):
    here = here or os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, 'leads_cfg.json'), encoding='utf-8') as f: C = json.load(f)
    st = jload('leads.json', {}) or {}; now = datetime.datetime.now(MSK); day = now.strftime('%Y-%m-%d')
    if not force and st.get('at') and (now.timestamp() - st['at']) < int(C.get('every_min', 60)) * 60 - 30: return st.get('last')
    prev = {x['o']: x for x in (st.get('pub') or {}).get('offices', [])}; out = []; errs = []
    hist = st.get('hist') or {}; first = hist.get(day) or {}
    for o in C['offices']:
        try:
            rows = _csv(o['id'], o['tab'])
            k = lambda r, i: (r[i] if len(r) > i else '').strip()
            done = [r for r in rows if any(k(r, i) for i in (10, 11, 12, 13))]
            stt = {}
            for r in rows:
                s = k(r, 13)
                if s: stt[s] = stt.get(s, 0) + 1
            x = {'o': o['o'], 'n': o['n'], 'who': o['who'], 'rows': len(rows), 'done': len(done), 'status': sum(stt.values()), 'st': stt,
                 'url': 'https://docs.google.com/spreadsheets/d/%s/edit' % o['id']}
        except Exception as e:
            x = dict(prev.get(o['o']) or {'o': o['o'], 'n': o['n'], 'who': o['who'], 'rows': o.get('rows', 0), 'done': 0, 'status': 0, 'st': {}}); x['err'] = str(e)[:120]; errs.append(o['o'])
        if o['o'] not in first: first[o['o']] = x['done']
        x['today'] = max(0, x['done'] - first.get(o['o'], x['done']))
        out.append(x)
    hist[day] = first
    for d in sorted(hist)[:-30]: hist.pop(d, None)
    tot = {'rows': sum(x['rows'] for x in out), 'done': sum(x['done'] for x in out), 'status': sum(x['status'] for x in out), 'today': sum(x['today'] for x in out)}
    end = st.get('end') or {}; end[day] = {x['o']: x['done'] for x in out}
    for d in sorted(end)[:-30]: end.pop(d, None)
    pub = {'v': 1, 't': now.strftime('%Y-%m-%dT%H:%M'), 'due': C['due'], 'chaser': C.get('chaser'), 'tot': tot, 'offices': out,
           'days': [{'d': d, 'done': sum(v.values())} for d, v in sorted(end.items())]}
    publish('leads.bin', pub)
    last = {'state': 'ok' if not errs else ('частично' if len(errs) < len(out) else 'ошибка'), 't': pub['t'], 'tot': tot, 'err': errs}
    st.update({'at': now.timestamp(), 'pub': pub, 'hist': hist, 'end': end, 'last': last}); jsave('leads.json', st)
    log('лиды выставок: %s; отмечено %d из %d, сегодня +%d%s' % (last['state'], tot['done'], tot['rows'], tot['today'], ('; сбой ' + ','.join(errs)) if errs else ''))
    return last
