# «Фабрика» — сводка поведения на портале (13.11.2026, Т. В.: «все баги фиксируем, даже движение мышкой; копим ошибки, видим, где человек
# запутался, смотрим тепловые карты; в 9 вечера собираем»). Сырьё — ~/.fabrika_stat/ux/ГГГГ-ММ-ДД.jsonl (st/ux.php, страница — assets/ux.js).
# Раз в 30 минут (из lane_portal): сводка за 7 дней → st/ux.bin (ключ владельца): по дням и страницам — просмотры, устройства, клетки щелчков
# и движения мыши (для тепловых карт), «ярость» (3+ щелчка в одно место за секунду), «мёртвые» щелчки (не по ссылке/кнопке и ничего не
# случилось), быстрые уходы (< 3 с), «по кругу» (A → B → A → B), «Назад», ошибки JS, время загрузки. Сырые файлы старше 14 дней удаляются.
import os, json, time, datetime, glob, collections

KEEP_DAYS, SUM_DAYS, EVERY = 14, 7, 1800


def _day(ts): return (datetime.datetime.utcfromtimestamp(ts) + datetime.timedelta(hours=3)).strftime('%Y-%m-%d')


def summarize(path):
    P = collections.defaultdict(lambda: {'v': 0, 'dev': set(), 'clk': collections.Counter(), 'mv': collections.Counter(), 'rage': collections.Counter(),
                                         'dead': collections.Counter(), 'quick': 0, 'loop': 0, 'back': collections.Counter(), 'load': [], 'tgt': collections.Counter()})
    ERR = collections.Counter(); devs = set(); users = set(); n = 0
    with open(path, encoding='utf-8', errors='replace') as f:
        for line in f:
            try: r = json.loads(line)
            except Exception: continue
            n += 1; d = r.get('d') or ''; devs.add(d)
            if r.get('u'): users.add(r['u'])
            for pg, g in (r.get('m') or {}).items():
                for c, k in g.items(): P[pg]['mv'][c] += int(k)
            for e in r.get('ev') or []:
                k, a = e[0], e[1:]
                try:
                    if k == 'v' and len(a) >= 2: P[a[1]]['v'] += 1; P[a[1]]['dev'].add(d)
                    elif k == 'c' and len(a) >= 6:
                        pg, x, y, tg, fl = a[1], float(a[2]), float(a[3]), str(a[4])[:90], str(a[5])
                        P[pg]['clk']['%d_%d' % (min(39, int(x / 2.5)), min(99, int(y)))] += 1; P[pg]['tgt'][tg] += 1
                        if 'r' in fl: P[pg]['rage'][tg] += 1
                        if 'd' in fl: P[pg]['dead'][tg] += 1
                    elif k == 'q' and len(a) >= 2: P[a[1]]['quick'] += 1
                    elif k == 'l' and len(a) >= 2: P[a[1]]['loop'] += 1
                    elif k == 'b' and len(a) >= 3: P[a[1]]['back'][str(a[2])[:80]] += 1
                    elif k == 'n' and len(a) >= 3: P[a[1]]['load'].append(int(a[2]))
                    elif k == 'e' and len(a) >= 3: ERR[(str(a[1])[:60], str(a[2])[:160], str(a[3])[:80] if len(a) > 3 else '')] += 1
                except Exception: continue
    pages = {}
    for pg, x in P.items():
        ld = sorted(x['load'])
        pages[pg] = {'v': x['v'], 'dev': len(x['dev']), 'clk': dict(x['clk']), 'mv': dict(x['mv'].most_common(1500)),
                     'rage': x['rage'].most_common(15), 'dead': x['dead'].most_common(15), 'tgt': x['tgt'].most_common(25),
                     'quick': x['quick'], 'loop': x['loop'], 'back': x['back'].most_common(10),
                     'load_med': ld[len(ld) // 2] if ld else None, 'load_p90': ld[int(len(ld) * 0.9)] if ld else None}
    return {'batches': n, 'devices': len(devs), 'users': len(users), 'pages': pages,
            'errors': [[k[0], k[1], k[2], c] for k, c in ERR.most_common(40)]}


def run(L, log, jload, jsave, publish):
    home = os.path.dirname(L.rstrip('/'))
    D = os.path.join(home, '.fabrika_stat', 'ux')
    st = jload('ux_sum.json', {'t': 0})
    res = {'t': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M')}
    if not os.path.isdir(D): res['state'] = 'событий ещё нет'; return res
    if time.time() - (st.get('t') or 0) < EVERY: res['state'] = 'ждёт'; return res
    now = time.time(); files = sorted(glob.glob(os.path.join(D, '2*.jsonl')))
    for f in files:                                                     # сырьё старше 14 дней — удалить
        try:
            if now - os.path.getmtime(f) > KEEP_DAYS * 86400: os.remove(f)
        except Exception: pass
    out = {'t': res['t'], 'days': {}}
    for f in sorted(glob.glob(os.path.join(D, '2*.jsonl')))[-SUM_DAYS:]:
        try: out['days'][os.path.basename(f)[:10]] = summarize(f)
        except Exception as e: log('  ! ux: ', os.path.basename(f), e.__class__.__name__)
    publish('ux.bin', out)
    st['t'] = now; jsave('ux_sum.json', st)
    td = out['days'].get(_day(now)) or {}
    res.update({'state': 'ok', 'days': len(out['days']), 'today_batches': td.get('batches', 0), 'today_devices': td.get('devices', 0), 'errors': len(td.get('errors') or [])})
    return res
