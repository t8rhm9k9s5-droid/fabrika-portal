# «Снабжение _Производство» — утренний итог за прошлый рабочий день (слово Т. В. 11.11.2026: «с утра сводка за вчера по машинам, по документам; каждое утро; к 9 готовь»)
#   python3 morning.py [ГГГГ-ММ-ДД]        — текст сводки (по умолчанию прошлый рабочий день): план машин (data_ДДММ.py) + документы (live/ДАТА.json)
#   python3 morning.py post [ГГГГ-ММ-ДД]   — выложить в группу (id snab-day-ДАТА, до 4 попыток при занятом замке)
import sys, os, json, re, time, importlib.util
from datetime import datetime, timezone, timedelta
sys.path.insert(0, 'REDACTED_B64_28')
TZ = timezone(timedelta(hours=3)); D0 = os.path.dirname(os.path.abspath(__file__))
WD = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье']
def prev_day():
    d = datetime.now(TZ) - timedelta(days=1)
    while d.weekday() >= 5: d -= timedelta(days=1)
    return d.strftime('%Y-%m-%d')
def r(v): return f"{v:,.0f}".replace(',', ' ')
def short(s): return re.sub(r'\s*\(.*?\)', '', s).replace('Текстильные технологии', 'Текстильные техн.').strip()
def build(day):
    d = datetime.strptime(day, '%Y-%m-%d'); ddmm = d.strftime('%d%m'); dm = d.strftime('%d.%m')
    live = json.load(open(f'{D0}/live/{day}.json'))
    docs = live.get('docs', [])
    plan, src, reg_docs = None, '', set()
    p = f'{D0}/data_{ddmm}.py'
    if os.path.exists(p):
        sp = importlib.util.spec_from_file_location('dd', p); m = importlib.util.module_from_spec(sp); sp.loader.exec_module(m)
        plan, src = getattr(m, 'PLAN', None), getattr(m, 'PLAN_SRC', '')
        reg_docs = {x[1] for x in getattr(m, 'D', [])}
    out = [f"📦 <b>Снабжение — итог за {WD[d.weekday()]} {dm}</b>"]
    if plan:
        ok = sum(1 for x in plan if x[1])
        out += ['', f"<b>Машины по плану</b> — {src}: {ok} из {len(plan)} {'✓' if ok == len(plan) else ''}".rstrip()]
        out += [('✓ ' if x[1] else ('✗ ' if x[1] is False else '❔ ')) + f"{x[0]} — {x[2]}" for x in plan]
    agg = {}
    for x in docs:
        a = agg.setdefault(x['s'], {'t': 0, 'n': 0, 'h': (x.get('h') or '').split(',')[0].split(';')[0].strip()})
        a['t'] += x['t']; a['n'] += 1
    tot = sum(x['t'] for x in docs)
    out += ['', f"<b>Документы</b>: {len(docs)} от {len(agg)} поставщиков, всего <b>{r(tot)} ₽</b> без НДС"]
    for i, (s, a) in enumerate(sorted(agg.items(), key=lambda kv: -kv[1]['t']), 1):
        nm = short(s) + (f", {a['n']} док." if a['n'] > 1 else '')
        h = ' '.join(a['h'].split()[:3]) if a['h'] else ''
        out.append(f"{i}. {nm} — {r(a['t'])}" + (f" ({h})" if h else ''))
    late = [x for x in docs if x['doc'] not in reg_docs] if reg_docs else []
    if late: out += ['', f"Вечером после реестра выложено ещё {len(late)} док. — войдут в реестр сегодня в 17:30."]
    need = [x for x in docs if x.get('need')]
    if need: out += ['', '⚠️ Ждём: ' + '; '.join(f"{short(x['s'])} {x['doc']} — {x['need']}" for x in need)]
    out += ['', 'Расшифровка каждой накладной — выше в группе.']
    return '\n'.join(out)
if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'post':
        day = a[1] if len(a) > 1 else prev_day(); text = build(day); import mxcall
        head = text.split('\n')[0]
        M = json.loads(mxcall.call({'op': 'read', 'cid': '-100000000003', 'n': 40})).get('msgs') or []
        if any(m.get('bot') and (m.get('text') or '').startswith(re.sub(r'<[^>]+>', '', head)[:40]) for m in M):
            print('итог за этот день уже в группе — не дублирую'); sys.exit(0)
        for i in range(4):
            res = json.loads(mxcall.call({'op': 'post', 'g': 'Снабжение _Производство', 'id': 'snab-day-' + day + ('' if i == 0 else '-r%d' % i), 'text': text}))
            if res.get('ok') or 'зарезерв' not in str(res.get('error', '')): break
            time.sleep(40)
        print(res); sys.exit(0 if res.get('ok') else 1)
    print(build(a[0] if a else prev_day()))
