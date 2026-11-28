# 26.11.2026, решение Т. В. (опрос): еженедельный контроль ботом — каждому ответственному его заказы покупателей,
# которые отгружены (остаток в штуках 0 или меньше), но не закрыты, и висят дольше 30 дней. Источник — выгрузка 1С ЖПС
# (тот же zip, что 17.11: 12_ЗаказПокупателя_Шапка, 08_Пользователи, 28_ЗаказыПокупателей_ОстаткиНаКонец).
# python3 weekly.py <выгрузка.zip> [--days 30]  → out/weekly_<дата>.json (кому что) и текст сообщений; отправка — в утреннем окне понедельника.
import zipfile, csv, io, json, datetime, collections, re, sys, os
zp = sys.argv[1]; DAYS = int(sys.argv[sys.argv.index('--days') + 1]) if '--days' in sys.argv else 30
Z = zipfile.ZipFile(zp)
def rows(n):
    m = [x for x in Z.namelist() if x.endswith(n)]
    return list(csv.DictReader(io.StringIO(Z.read(m[0]).decode('utf-8-sig')), delimiter=';')) if m else []
def num(s):
    try: return float((s or '0').replace(',', '.').replace('\xa0', '').replace(' ', ''))
    except ValueError: return 0.0
head = {r['GUID']: r for r in rows('ЗаказПокупателя_Шапка.csv')}
agg = {}
for r in rows('ЗаказыПокупателей_ОстаткиНаКонец.csv'):
    a = agg.setdefault(r['ЗаказПокупателя_GUID'], {'name': r['ЗаказПокупателя'], 'qty': 0.0, 'sum': 0.0})
    a['qty'] += num(r['КоличествоОстаток']); a['sum'] += num(r['СуммаВзаиморасчетовОстаток'])
m = re.search(r'(\d{8})', os.path.basename(zp)); today = datetime.datetime.strptime(m.group(1), '%Y%m%d').date() if m else datetime.date.today()
by = collections.defaultdict(list)
for g, a in agg.items():
    h = head.get(g)
    if not h or a['qty'] > 0: continue                                   # не отгружено полностью — это не «забыли закрыть»
    try: d = datetime.date.fromisoformat((h.get('Дата') or '')[:10])
    except ValueError: continue
    if (today - d).days <= DAYS: continue
    by[(h.get('Ответственный') or '(не указан)').strip()].append({'num': h.get('Номер'), 'date': d.isoformat(), 'client': h.get('Контрагент', ''), 'rest_sum': round(a['sum'], 2), 'rest_qty': a['qty']})
out = {'asof': today.isoformat(), 'days': DAYS, 'by': {}}
for who, xs in sorted(by.items(), key=lambda kv: -len(kv[1])):
    xs.sort(key=lambda x: x['date'])
    lines = ['%s от %s — %s, остаток %s ₽' % (x['num'], '.'.join(reversed(x['date'].split('-'))), x['client'][:40], format(round(x['rest_sum']), ',').replace(',', ' ')) for x in xs]
    out['by'][who] = {'n': len(xs), 'orders': xs,
        'text': 'Добрый день! Еженедельная проверка базы 1С: эти заказы уже отгружены, но не закрыты (висят дольше %d дней):\n%s\n\nЗакройте их, пожалуйста, в 1С (документ «Закрытие заказов покупателей»). Если заказ ещё живой — ответьте с причиной и сроком.' % (DAYS, '\n'.join(lines))}
os.makedirs('out', exist_ok=True)
json.dump(out, open('out/weekly_%s.json' % today.isoformat(), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('на', today, 'ответственных', len(out['by']), 'заказов', sum(v['n'] for v in out['by'].values()))
for w, v in out['by'].items(): print(' ', w, v['n'])
