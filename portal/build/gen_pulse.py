# «Фабрика» — данные «Пульса раздела» на момент сборки (13.11.2026, Т. В.: «в каждом разделе свой пульс: 6 одинаковых карточек, потом две
# большие с диаграммами — как на главной; структура везде одна»). Живые цифры (продажи, выпуск, склад, рекламации, отзывы, лиды, машины)
# страница берёт у робота (assets/metrics.js, assets/live.js); здесь — то, что живёт в сборке: план менеджеров, график отгрузки, счётчики,
# документы, каталог, люди, новые клиенты. → site/assets/pulse_data.js (window.T14_PULSE_STATIC). Запуск — из build_site.py.
import json, re, glob, datetime
B = '/home/claude/build'; OUT = '/home/claude/site/assets/pulse_data.js'
D = {'built': datetime.datetime.utcnow().strftime('%Y-%m-%dT%H:%M')}
def J(p, d=None):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return d
pm = sorted(glob.glob(B + '/sales_plan_mgr/2*.json'))
if pm:
    x = J(pm[-1]) or {}
    D['planm'] = {'asof': x.get('asof'), 'wd': x.get('wd_month'), 'wp': x.get('wd_passed'), 'tot': x.get('total'),
                  'rows': [[r['n'], r['fact'], r['plan'], r.get('pct')] for r in x.get('rows', []) if r.get('plan')]}
nc = J('/home/claude/fabrika/work/new_clients/table_rows.json') or {}
D['newcl'] = {'n': sum(len(v) for v in nc.values()), 'of': len([k for k, v in nc.items() if v]), 'due': '20.11'}
sp = sorted(glob.glob(B + '/ship_plan/2*.json'))
if sp:
    x = J(sp[-1]) or {}
    D['ship'] = {'from': x.get('from'), 'to': x.get('to'), 'days': [[d['d'], d.get('q'), d.get('s'), len(d.get('clients') or [])] for d in x.get('days', [])], 'tot': x.get('total')}
u = J(B + '/utils/utils.json') or {}
r = u.get('res') or {}
if r:
    D['utils'] = {'m': r.get('months'), 'elec': [sum(v or 0 for v in t) for t in zip(r['elec']['own'], r['elec']['sub'])], 'own': r['elec']['own'],
                  'gas': r.get('gas'), 'water': r.get('water'), 'meters': len(r.get('last') or []), 'nodata': len([m for m in (r.get('last') or []) if m.get('v') is None]),
                  'septics': len(u.get('septics') or [])}
L = J('/home/claude/library/library.json') or {}
items = L.get('items') or []
cats = {}
for i in items: cats[i.get('cat')] = cats.get(i.get('cat'), 0) + 1
today = (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).strftime('%Y-%m-%d')
dog = J('/home/claude/library/dogovory.json') or {}
regs = J('/home/claude/library/regs.json') or {}
def cnt(x): return len(x.get('items') or x.get('docs') or []) if isinstance(x, dict) else len(x or [])
D['docs'] = {'n': len(items), 'today': sum(1 for i in items if i.get('received') == today), 'cats': sorted(cats.items(), key=lambda kv: -kv[1]),
             'dog': cnt(dog), 'regs': cnt(regs), 'arch': len(glob.glob('/home/claude/library/raw/archive/**/*', recursive=True))}
days = {}
for i in items:
    d = i.get('received') or i.get('date')
    if d and d >= (datetime.datetime.utcnow() - datetime.timedelta(days=14)).strftime('%Y-%m-%d'): days[d] = days.get(d, 0) + 1
D['docs']['days'] = sorted(days.items())
c = J(B + '/catalog/summary.json') or {}
D['items'] = {'types': c.get('types'), 'models': c.get('models'), 'isp': c.get('isp'), 'prices': cats.get('prices', 0), 'catalogs': cats.get('catalogs', 0)}
try:
    with open('/home/claude/fabrika/struktura/структура/src/data_fabrikant.py', encoding='utf-8') as f: t = f.read()
    D['people'] = {'n': len(set(re.findall(r'P\(\s*"([^"]+)"', t)))}
except Exception: D['people'] = {}
ko = J('/home/claude/app_build/host/live/ko_staff.json') or {}
D['people']['ko'] = len(ko.get('staff') or ko.get('people') or []) if isinstance(ko, dict) else 0
cs = J(B + '/calls_search.json')
D['people']['contacts'] = len(cs) if isinstance(cs, list) else len((cs or {}).get('items') or [])
ON = J(B + '/online/online.json') or {}                     # 13.11.2026: «Онлайн-продажи» — отдельный раздел: сводка мониторинга сайтов (build/online)
W = ON.get('web') or {}
if W:
    thr = ON.get('thr') or 0
    D['online'] = {'t': (W.get('t') or '')[:10], 'total': W.get('total'), 'sites': W.get('sites'), 'checked': W.get('checked'),
                   'low': sum(1 for q in ON.get('prices') or [] if q.get('p') and q.get('r') and q['p'] < q['r'] * (1 - thr)),
                   'below': len(W.get('below') or []), 'noship': len(W.get('no_ship') or []),
                   'by_site': (W.get('by_site') or [])[:8], 'by_model': [[m[0], m[1]] for m in (W.get('by_model') or [])[:8]]}
s = 'window.T14_PULSE_STATIC = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n'
with open(OUT, 'w', encoding='utf-8') as f: f.write(s)
print('pulse data', len(s), 'bytes:', ', '.join(k for k in D if k != 'built'))
