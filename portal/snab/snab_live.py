# «Снабжение _Производство» — каждую накладную сразу (Т. В. 10.11.2026: «если есть накладная — сразу, никаких данных не хватает — тоже вопрос.
# И выкладывай снизу, а потом в конце дня просто собирай их вместе»). Состояние дня — work/snab/live/ГГГГ-ММ-ДД.json.
#   python3 snab_live.py new                 — новые фото/файлы группы за сегодня (не разобранные): качает, поворачивает → печатает mid, время, автор, путь
#   python3 snab_live.py add '<json doc>'    — документ (s, doc, t, L=[[товар,кол,ед,цена,сумма]...], need, mids=[...]) → проверка сумм, пост в группу, запись
#   python3 snab_live.py skip mid1 mid2 ...  — фото без документа (или страница уже учтённого) — отметить разобранным
#   python3 snab_live.py ask '<текст>' mid…  — вопрос в группу (не хватает листа / не читается / нет суммы); mids — к каким фото
#   python3 snab_live.py docs                — список документов дня (для реестра 17:20: D в формате data_ДДММ.py)
import sys, os, json, ssl, urllib.request, time
from datetime import datetime, timezone, timedelta
sys.path.insert(0, 'REDACTED_B64_27')
import mxcall
TZ = timezone(timedelta(hours=3)); CID = '-100000000003'; G = 'Снабжение _Производство'
CA = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
TODAY = datetime.now(TZ).strftime('%Y-%m-%d')
D0 = '/home/claude/fabrika/work/snab/live'; os.makedirs(D0, exist_ok=True)
SP = f'{D0}/{TODAY}.json'
PH = f'REDACTED_B64_28{TODAY}'; os.makedirs(PH, exist_ok=True)
TW = 31
def load():
    try: return json.load(open(SP))
    except Exception: return {'done': [], 'docs': [], 'asks': []}
def save(st): json.dump(st, open(SP, 'w'), ensure_ascii=False, indent=1)
m2 = lambda x: f"{x:,.2f}".replace(',', ' ').replace('.', ',')
r0 = lambda x: f"{x:,.0f}".replace(',', ' ')
qf = lambda x: (f"{x:,.0f}".replace(',', '') if float(x).is_integer() else f"{x:.3f}".rstrip('0').replace('.', ','))
pf = lambda x: f"{x:.2f}".replace('.', ',')
def wrap(t, w):
    out, cur = [], ''
    for wd in t.split():
        if len((cur + ' ' + wd).strip()) <= w: cur = (cur + ' ' + wd).strip()
        else: out.append(cur); cur = wd
    return out + ([cur] if cur else [])
def table(rows, tot):
    H = ('Товар', 'Кол', 'Цена', 'Сумма'); R = rows + [('ИТОГО', '', '', tot)]
    wq, wp, ws = (max(len(H[k]), *(len(r[k]) for r in R)) for k in (1, 2, 3)); wn = max(5, TW - wq - wp - ws - 3); out = []
    for r in [H] + R:
        ws_ = r[0].split(); first = ''
        while ws_ and len((first + ' ' + ws_[0]).strip()) <= wn: first = (first + ' ' + ws_.pop(0)).strip()
        if not first: out += wrap(r[0], TW); ws_ = []
        out.append(first.ljust(wn) + ' ' + r[1].rjust(wq) + ' ' + r[2].rjust(wp) + ' ' + r[3].rjust(ws))
        if ws_: out += [' ' + x for x in wrap(' '.join(ws_), TW - 1)]
    return '\n'.join(x.rstrip() for x in out)
def esc(s): return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
def render(d):
    L = d['L']; units = [x[2] for x in L]; main = max(set(units), key=units.count); unit = main if len(set(units)) == 1 else ''
    rows = [(x[0] + ('' if x[2] == main else ', ' + x[2]), qf(x[1]), pf(x[3]), r0(x[4])) for x in L]   # единица большинства — в заголовке (h), у остальных — после названия
    h = d.get('h') or (f"ед.: {unit}" if unit else '')   # h — общее слово товара и единица («лента х/к, т»), как в реестре
    t = f"📄 <b>{esc(d['s'])} — {esc(d['doc'])}</b>" + (f"\n{esc(h)}" if h else '') + f"\n<pre>{esc(table(rows, r0(d['t'])))}</pre>\nИтого без НДС: <b>{m2(d['t'])} ₽</b>"
    if d.get('need'): t += f"\n⚠️ {esc(d['need'])}"
    return t
def read():
    r = json.loads(mxcall.call({'op': 'read', 'cid': CID, 'n': 100}))
    return sorted(r['msgs'], key=lambda m: m['ts'])
def cmd_new():
    st = load(); done = set(st['done']); out = []
    day0 = datetime.strptime(TODAY, '%Y-%m-%d').replace(tzinfo=TZ).timestamp() * 1000
    from PIL import Image
    ms = read()
    for m in ms:
        if m['ts'] < day0 or m['mid'] in done or m.get('bot'): continue
        att = [a for a in (m.get('att') or []) if a.get('type') in ('image', 'file')]
        if not att: continue
        for k, a in enumerate(att):
            p = f"{PH}/{m['mid'][-10:]}_{k}" + ('.jpg' if a['type'] == 'image' else '_' + (a.get('name') or 'file'))
            if not os.path.exists(p): open(p, 'wb').write(urllib.request.urlopen(a['url'], context=CA, timeout=90).read())
            if a['type'] == 'image':
                im = Image.open(p)
                if im.height > im.width: im = im.rotate(90, expand=True)
                q = p[:-4] + '_r.jpg'; im.save(q, quality=88); p = q
            out.append({'mid': m['mid'], 't': datetime.fromtimestamp(m['ts'] / 1000, TZ).strftime('%H:%M'), 'who': m.get('name', ''), 'path': p, 'type': a['type']})
    last = max([m['ts'] for m in ms if m.get('att') and not m.get('bot')] or [0])
    print(json.dumps({'new': out, 'last_media_min_ago': round((time.time() * 1000 - last) / 60000, 1) if last else None}, ensure_ascii=False, indent=1))
def post(text, pid):
    r = json.loads(mxcall.call({'op': 'post', 'g': G, 'id': pid, 'text': text}))
    if not r.get('ok') and 'уже отправлено' not in str(r.get('error', '')): raise SystemExit('post: ' + str(r))
    return r.get('mid', '')
def cmd_add(js):
    d = json.loads(js); st = load()
    s = round(sum(x[4] for x in d['L']), 2)
    bad = [x for x in d['L'] if abs(x[1] * x[3] - x[4]) > max(1.0, 0.01 * x[4])]
    if abs(s - d['t']) > 0.011 or bad: raise SystemExit(f'проверь: сумма строк {s} ≠ итог {d["t"]} или строки кол×цена≠сумма: {bad}')
    n = len(st['docs']) + 1; pid = f"snab-doc-{TODAY}-{n}"
    d['posted'] = post(render(d), pid); d['pid'] = pid
    st['docs'].append(d); st['done'] = sorted(set(st['done']) | set(d.get('mids', []))); save(st); print('ok', pid, d['posted'])
    try:                                                   # 25.11.2026, Т. В.: скачок цены — сразу алерт в Telegram и письмо в ОМТС (snab_prices.py)
        import subprocess; r = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'snab_prices.py'), 'alert', pid], capture_output=True, text=True, timeout=240); print(r.stdout.strip()[-60:])
    except Exception as e: print('алерт цены не сработал:', e)
def cmd_skip(mids):
    st = load(); st['done'] = sorted(set(st['done']) | set(mids)); save(st); print('ok', len(mids))
def cmd_ask(text, mids):
    st = load(); n = len(st['asks']) + 1; pid = f"snab-q-{TODAY}-{n}"
    mid = post('❓ ' + text + '\n\nСпасибо!\nТ. В. Сотрудник1', pid)
    st['asks'].append({'text': text, 'mids': mids, 'pid': pid, 'mid': mid}); save(st); print('ok', pid)
def cmd_docs():
    st = load(); print(json.dumps([[d['s'], d['doc'], d['t'], d['L'], d.get('need', '')] for d in st['docs']], ensure_ascii=False, indent=1))
if __name__ == '__main__':
    c = sys.argv[1]
    if c == 'new': cmd_new()
    elif c == 'add': cmd_add(sys.argv[2])
    elif c == 'skip': cmd_skip(sys.argv[2:])
    elif c == 'ask': cmd_ask(sys.argv[2], sys.argv[3:])
    elif c == 'docs': cmd_docs()
