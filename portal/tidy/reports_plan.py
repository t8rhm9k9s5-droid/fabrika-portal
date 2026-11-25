# Самоочистка «Документов»: план (ничего не меняет). Правило: ежедневные и совещания — 14 дней; периодические (неделя, месяц) — пока не вышел следующий и ещё 14 дней;
# справочные и аналитика — только последняя версия. Что уходит — строкой в текстовый архив. 26.11.2026
import json, re, sys, datetime, collections
sys.path.insert(0, '/home/claude/fabrika/tools'); import live_get as g
T = datetime.date(2026, 11, 26); fm = g.fmap(); b = g.read('library.html').decode()
d = json.loads(re.search(r'<script id="lib-data" type="application/json">(.*?)</script>', b, re.S).group(1))
title = {i['file']: i for i in d['items']}
def date(n):
    m = re.search(r'(20\d\d)[-_]?(\d\d)[-_]?(\d\d)', n); return datetime.date(int(m[1]), int(m[2]), int(m[3])) if m else None
def kind(n):
    if re.search(r'itogi_dnya|otkloneniya|agenda|povestka|kontrol_', n): return 'day'
    if re.search(r'stock-week|po_nedelyam|otgruzki|prodazhi_iz_ofisov|peremescheniya|plan_(oktyabr|noyabr)|prodazhi_vseinstr|otchet_po_braku', n): return 'period'
    return 'ref'
series = lambda n: re.sub(r'(20\d\d[-_]?\d\d[-_]?\d\d|oktyabr|noyabr|dekabr|_za_|\.pdf$|\.xlsx?$|\.docx?$|\.ods$)', '', n)
files = sorted(k for k in fm if k.startswith('library/reports/')); groups = collections.defaultdict(list)
for k in files: groups[re.sub(r'\.(pdf)$', '', k.split('/')[-1]) if k.endswith(('.xls.pdf', '.xlsx.pdf', '.docx.pdf', '.ods.pdf')) else k.split('/')[-1]].append(k)
latest = {}
for n in groups:
    s = series(n); dd = date(n) or datetime.date(2000, 1, 1)
    if s not in latest or dd > latest[s][0]: latest[s] = (dd, n)
go = []; stay = []
for n, ks in sorted(groups.items()):
    dd = date(n); age = (T - dd).days if dd else None; k = kind(n); sz = sum(fm[x][2] for x in ks); last = latest[series(n)][1] == n
    out = (k == 'day' and age is not None and age > 14) or (k == 'period' and not last) or (k == 'period' and last and age is not None and age > 45) or (k == 'ref' and not last)
    (go if out else stay).append((n, k, age, sz, len(ks), (title.get('library/reports/' + n) or {}).get('title', '')))
print('групп отчётов', len(groups), '· файлов', len(files), '· уходит в архив сейчас: %d групп, %d файлов, %.1f МБ' % (len(go), sum(x[4] for x in go), sum(x[3] for x in go) / 1e6), '· остаётся: %d групп' % len(stay))
for x in go: print('  АРХИВ  %-62s %-6s %s дн.' % (x[0][:62], x[1], x[2]))
for x in stay: print('  остаётся %-60s %-6s %s дн.' % (x[0][:60], x[1], x[2]))
