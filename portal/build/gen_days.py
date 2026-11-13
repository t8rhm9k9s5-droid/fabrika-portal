#!/usr/bin/env python3
"""«Фабрика» — данные по дням для полоски недели на главной (14.11.2026, Т. В.: «дата сверху не переключает — что было вчера?!»).
Нажал на день в полоске недели → лист «День»: итоги дня (PDF), отгрузка по графику, совещание и его задачи, документы, поступившие
в этот день. Живые цифры дня (продажи 1С, вечерние отчёты офисов, гальваника) берёт сама страница из данных робота (sales.bin, pf.bin).
Пишет site/assets/days_data.js: window.T14_DAYS = {"ГГГГ-ММ-ДД": {...}} — последние 35 дней и 14 вперёд."""
import json, glob, os, re, datetime

B = '/home/claude/build'
SITE = '/home/claude/site'
today = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=3)).date()
lo, hi = today - datetime.timedelta(days=35), today + datetime.timedelta(days=14)
D = {}


def day(d):
    try: x = datetime.date.fromisoformat(str(d)[:10])
    except Exception: return None
    if not (lo <= x <= hi): return None
    return D.setdefault(x.isoformat(), {})


# отгрузка по графику 1С (build/ship_plan/ГГГГ-ММ-ДД.json — неделя)
for f in sorted(glob.glob(B + '/ship_plan/20??-??-??.json')):
    try: S = json.load(open(f, encoding='utf-8'))
    except Exception: continue
    for x in S.get('days') or []:
        e = day(x.get('d'))
        if e is not None: e['ship'] = [round(x.get('q') or 0), round(x.get('s') or 0), len(x.get('clients') or [])]

# совещания (Plaud → build/poruch/meet_tasks.json)
try:
    M = json.load(open(B + '/poruch/meet_tasks.json', encoding='utf-8'))
    for m in M.get('meetings') or []:
        e = day(m.get('date'))
        if e is None: continue
        ts = m.get('tasks') or []
        e.setdefault('meet', []).append([m.get('title') or 'Совещание', len(ts), sum(1 for t in ts if t.get('st') != 'done')])
except Exception: pass

# документы, поступившие в этот день (library.json; скрытые не показываем)
try:
    L = json.load(open('/home/claude/library/library.json', encoding='utf-8'))
    for it in L.get('items') or []:
        f = it.get('file') or ''
        if not f: continue
        e = day(it.get('received') or it.get('date'))
        if e is None: continue
        href = 'library/' + f.replace('raw/', '', 1)
        t = re.sub(r'\s*\((PDF|Word|Excel)[^)]*\)\s*$', '', it.get('title') or os.path.basename(f))
        e.setdefault('docs', []).append([t[:110], href])
        m = re.search(r'itogi_dnya_(\d{4}-\d{2}-\d{2})', f)
        if m and day(m.group(1)) is not None: D[m.group(1)]['itogi'] = href
except Exception: pass

for k in D:
    if 'docs' in D[k]: D[k]['docs'] = D[k]['docs'][:30]
out = 'window.T14_DAYS = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':'), sort_keys=True).replace('<', '\\u003c') + ';\n'
open(SITE + '/assets/days_data.js', 'w', encoding='utf-8').write(out)
print('days:', len(D), 'bytes:', len(out))
