# Возраст открытых поручений на портале (st/poruch.bin с хостинга) — для правила «не дольше 14 дней, потом в новый лист». 25.11.2026
import base64, hashlib, hmac, json, re, sys, datetime, collections
sys.path.insert(0, '/home/claude/fabrika/tools'); import live_get as g
js = g.read('assets/live.js').decode() + g.read('assets/metrics.js').decode()
def unseal(text, key):
    b = base64.b64decode(text[6:]); nonce, tag, ct = b[:16], b[16:48], b[48:]
    if not hmac.compare_digest(tag, hmac.new(key, nonce + ct, hashlib.sha256).digest()): return None
    ks = b''.join(hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))[:len(ct)]
    return (int.from_bytes(ct, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(len(ct), 'big').decode('utf-8')
t = g.get('st/poruch.bin').decode().strip(); raw = None
for c in set(re.findall(r"['\"]([0-9a-f]{64})['\"]", js)):
    try: raw = unseal(t, bytes.fromhex(c))
    except Exception: raw = None
    if raw: break
D = json.loads(raw); json.dump(D, open('/home/claude/fabrika/work/tidy/poruch_live.json', 'w', encoding='utf-8'), ensure_ascii=False)
today = datetime.date(2026, 11, 25)
def d(s):
    m = re.match(r'(\d{4})-(\d\d)-(\d\d)', str(s or '')); return datetime.date(int(m[1]), int(m[2]), int(m[3])) if m else None
print('поручения: данные от', D.get('t'), '· ключи', {k: (len(v) if isinstance(v, list) else v) for k, v in D.items() if k != 'v'})
tot = collections.Counter(); old = collections.Counter(); nod = collections.Counter(); late = collections.Counter()
for src in ('ctl', 'lead', 'cp'):
    for r in D.get(src) or []:
        if src == 'ctl' and not any(w.get('st') in ('open', 'stale') for w in r.get('who', [])): continue
        tot[src] += 1; t0 = d(r.get('t') or r.get('at')); due = d(r.get('due'))
        if t0 is None: nod[src] += 1
        elif (today - t0).days > 14: old[src] += 1
        if due and due < today: late[src] += 1
for m in D.get('meet') or []:
    for x in m.get('tasks') or m.get('items') or []:
        if x.get('st') == 'done': continue
        tot['meet'] += 1; t0 = d(m.get('date') or m.get('t') or x.get('t')); due = d(x.get('due'))
        if t0 is None: nod['meet'] += 1
        elif (today - t0).days > 14: old['meet'] += 1
        if due and due < today: late['meet'] += 1
names = {'ctl': 'отметки бота', 'lead': 'руководство', 'cp': 'офисы продаж', 'meet': 'совещания'}
for k in names: print('%-14s открыто %3d · старше 14 дней %3d · без даты %3d · срок прошёл %3d' % (names[k], tot[k], old[k], nod[k], late[k]))
print('ВСЕГО открыто', sum(tot.values()), '· старше 14 дней', sum(old.values()), '· срок прошёл', sum(late.values()))
