# «Фабрика» — тревоги портала (13.11.2026, Т. В.: «35 % мощности этой недели попало в следующую — это прям very bad, emergency call для всего
# портала, должно загораться; от стилистики портала не отходим — как сделал бы iPhone, iPad или macOS»). Правила считают тревоги по данным сборки
# и пишут site/assets/alerts_data.js (window.T14_ALERTS). Показывает assets/alerts.js: «Критично» — карточка на каждой странице и красные
# значки у раздела в меню, на главной и в карте разделов; «Внимание» — на главной и в своём разделе. Запуск — из build_site.py.
#   Пороги — в RULES; поменять порог = поменять число здесь и пересобрать.
import json, glob, datetime
B = '/home/claude/build'; OUT = '/home/claude/site/assets/alerts_data.js'
RULES = {'carry': {'warn': 15.0, 'crit': 30.0},      # % графика отгрузки недели — заказы, не отгруженные по прошлому графику
         'plan': {'warn': 90.0, 'crit': 75.0}}       # % выполнения «должно быть на дату» по плану продаж менеджеров
def J(p, d=None):
    try:
        with open(p, encoding='utf-8') as f: return json.load(f)
    except Exception: return d
def dm(s): return s[8:10] + '.' + s[5:7] if s and len(s) >= 10 else ''
def mln(x): return ('%.1f' % (x / 1e6)).replace('.', ',')
def pct(x): return ('%.0f' % x) if x >= 10 else ('%.1f' % x).replace('.', ',')
A = []
# 1) Отгрузка: перенос с прошлой недели (график 1С «График отгрузки за неделю», build/ship_plan/<понедельник>.json)
sp = sorted(glob.glob(B + '/ship_plan/2*.json'))
if len(sp) > 1:
    a, b = J(sp[-1]) or {}, J(sp[-2]) or {}
    def ords(P):
        o = {}
        for d in P.get('days', []):
            for c in d.get('clients', []):
                for x in c.get('orders', []): o[x['no']] = o.get(x['no'], 0) + (x.get('s') or 0)
        return o
    oa, ob = ords(a), ords(b)
    car = [k for k in oa if k in ob]
    S = (a.get('total') or {}).get('s') or 0
    cs = sum(oa[k] for k in car)
    p = 100.0 * cs / S if S else 0
    R = RULES['carry']
    if p >= R['warn']:
        A.append({'id': 'carry-' + a.get('from', ''), 'lvl': 'crit' if p >= R['crit'] else 'warn', 'cat': 'Отгрузка', 'secs': ['sales'],   # 13.11.2026, Т. В.: отгрузки — продажи, не логистика
                 
                  'href': 'sales.html#ship', 'card': 'sales.html#ship', 'ic': 'omts', 'v': pct(p) + ' %',
                  't': pct(p) + ' % недели — перенос с прошлой', 'short': 'графика отгрузки — перенос с прошлой недели',
                  's': '%d %s на %s млн ₽ из графика %s–%s не отгружены и снова стоят в графике %s–%s' % (
                      len(car), 'заказ' if len(car) % 10 == 1 and len(car) % 100 != 11 else ('заказа' if 2 <= len(car) % 10 <= 4 and not 12 <= len(car) % 100 <= 14 else 'заказов'),
                      mln(cs), dm(b.get('from')), dm(b.get('to')), dm(a.get('from')), dm(a.get('to'))),
                  'rule': 'тревога от %s %%, критично от %s %% графика недели' % (pct(R['warn']), pct(R['crit'])), 'since': a.get('from')})
# 2) Продажи: выполнение плана менеджеров на дату (Сотрудник7, build/sales_plan_mgr/<ГГГГ-ММ>.json)
pm = sorted(glob.glob(B + '/sales_plan_mgr/2*.json'))
if pm:
    x = J(pm[-1]) or {}; T = x.get('total') or {}
    if T.get('need'):
        r = 100.0 * (T.get('fact') or 0) / T['need']; R = RULES['plan']
        if r < R['warn']:
            A.append({'id': 'plan-' + (x.get('asof') or ''), 'lvl': 'crit' if r < R['crit'] else 'warn', 'cat': 'Продажи', 'secs': ['sales'],
                      'href': 'sales.html#planm', 'card': 'sales.html#planm', 'ic': 'sales', 'v': '−' + mln(abs(T.get('diff') or 0)) + ' млн',
                      't': 'План продаж на дату: ' + pct(r) + ' %', 'short': 'план продаж на дату', 'kpi': 'plan',
                      's': '%s из %s млн ₽, которые должны быть на %s (%s из %s раб. дн.) · план месяца %s млн ₽' % (
                          mln(T.get('fact') or 0), mln(T['need']), dm(x.get('asof')), x.get('wd_passed'), x.get('wd_month'), mln(T.get('plan') or 0)),
                      'rule': 'внимание ниже %s %%, критично ниже %s %% плана на дату' % (pct(R['warn']), pct(R['crit'])), 'since': x.get('asof')})
A.sort(key=lambda z: (z['lvl'] != 'crit', z['id']))
# 13.11.2026: «Пульс фабрики» на главной — план продаж на дату (зелёный ≥ 90 %, оранжевый ≥ 75 %, красный ниже)
KPI = {}
if pm:
    x = J(pm[-1]) or {}; T = x.get('total') or {}
    if T.get('need'):
        KPI['plan'] = {'asof': x.get('asof'), 'pct_need': round(100.0 * (T.get('fact') or 0) / T['need']), 'pct_month': T.get('pct'),
                       'fact': T.get('fact'), 'need': T.get('need'), 'plan': T.get('plan')}
D = {'kpi': KPI, 'built': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M'), 'items': A}
with open(OUT, 'w', encoding='utf-8') as f: f.write('window.T14_ALERTS = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('тревоги:', ', '.join('%s %s (%s)' % (z['lvl'], z['cat'], z['v']) for z in A) or 'нет')
