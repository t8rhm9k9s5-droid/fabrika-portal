"""30.10.2026 аудит — данные: пустые ответы Ozon и AutoGRAPH не затирают прежние (P15); IMAP недоступен и письмо, разбор которого упал, —
повтор и карантин (P16); отчёт с неподтверждённым отправителем — оповещение, строгий режим (P14); документ по тому же адресу (P19);
выгрузка на Диск только st/exp_* (P20); один список праздников (P21). Без сети. Запуск: cd live && unshare -n python3 -W ignore test/test_audit_data.py"""
import base64, datetime, hashlib, hmac, json, os, sys, time
from email.message import EmailMessage


def _rd(*a, **k):   # CodeQL py/file-not-closed: файл закрывается сразу (15.11.2026)
    with open(*a, **k) as _f:
        return _f.read()


def _wr(_d, *a, **k):
    with open(*a, **k) as _f:
        return _f.write(_d)


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_home as MH
ok = 0
def check(c, m):
    global ok
    assert c, m; ok += 1; print('  ✓', m)

M = MH.make('smtp', 'imap', passwords=False)
live = MH.load_live(M)
R = MH.Rec().hook(live)
MSK = live.MSK
live.now = lambda: datetime.datetime(2026, 10, 30, 12, 0, tzinfo=MSK)
L, S = M['FL'], os.path.join(M['FL'], 'state')
import ozon as OZ, ozon_day as OD, glonass as GL, imaplib
pub = {}
publish = lambda n, o: pub.__setitem__(n, json.loads(json.dumps(o)))
live.publish = publish                                              # участки публикуют сюда (содержимое проверяется без шифра)

print('P15 — Ozon: пустой ответ не затирает данные')
_wr('client_id=1\napi_key=00000000-0000-0000-0000-000000000000\n', os.path.join(L, 'ozon_pks'), 'w')
ANS = {'full': True}
def call(cid, key, path, body, timeout=25):
    full = ANS['full']
    if 'warehouse' in path: return {'result': [{'warehouse_id': 1, 'name': 'Рязань'}] if full else []}
    if 'posting' in path: return {'postings': [{'posting_number': '1-1', 'status': 'delivering', 'products': []}] if full else [], 'has_next': False}
    if 'stocks' in path: return {'items': [{'offer_id': 'A', 'product_id': 1, 'stocks': [{'type': 'fbs', 'present': 5}]}] if full else [], 'cursor': ''}
    raise AssertionError(path)
OZ.call = call
r = live.lane_ozon()['ozon']
check(r['state'] == 'ok' and pub['oz.bin']['stocks'][0]['offer_id'] == 'A', 'первый ответ — данные опубликованы')
ANS['full'] = False; st = live.jload('ozon.json', {}); st['ts'] = 0; live.jsave('ozon.json', st); n0 = len(R.mail)
r = live.lane_ozon()
check(pub['oz.bin']['stocks'] and pub['oz.bin']['warehouses'] and r['ozon']['warn'], 'Ozon ответил пустыми списками — на портале прежние склады, отправления, остатки')
check(len(R.mail) == n0 + 1 and 'подозрительно пустой' in R.mail[-1][1], 'владельцу — сообщение')
st = live.jload('ozon.json', {}); st['ts'] = 0; st['empty_since'] = {k: time.time() - 90000 for k in ('warehouses', 'postings', 'stocks')}; live.jsave('ozon.json', st)
r = live.lane_ozon()['ozon']
check(pub['oz.bin']['stocks'] == [] and not r.get('warn'), 'пусто дольше суток подряд — принимается как есть (значит, правда пусто)')

print('P15 — Ozon вчера/сегодня')
YDAY = (datetime.datetime.now(MSK).date() - datetime.timedelta(days=1)).isoformat()   # ozon_day считает от настоящего «сегодня»
def ocall(cid, key, path, body, timeout=25):
    if 'posting' in path:
        rows = [{'created_at': YDAY + 'T09:00:00Z', 'status': 'delivered', 'products': [{'offer_id': 'A', 'name': 'Стул', 'price': {'amount': '1000'}, 'quantity': 1}]}] if ANS['full'] else []
        a, b = body['filter']['since'], body['filter']['to']
        return {'postings': [x for x in rows if a <= x['created_at'] <= b], 'has_next': False}
    if path == '/v1/analytics/data': return {'result': {'data': []}}
    if path == '/v1/finance/accrual/by-day': return {'accruals': [], 'last_id': ''}
    raise AssertionError(path)
OZ.call = ocall; OD.OH.time.sleep = OD.time.sleep = lambda s: None
OD.datetime = datetime
ANS['full'] = True
store = {}
jl = lambda n, d: store.get(n, d); js = lambda n, v: store.__setitem__(n, v)
OD.run(L, lambda *a: None, jl, js, publish, live.iso)
d1 = pub['ozd.bin']
check(any(x['orders']['n'] for x in d1['days']), 'заказы за прошедшие дни опубликованы')
ANS['full'] = False; store['ozon_day.json']['ts'] = 0; pub.pop('ozd.bin')
r = OD.run(L, lambda *a: None, jl, js, publish, live.iso)
check('ozd.bin' not in pub and r['state'] == 'подозрительно пусто' and r['warn'] and store['ozon_day.json']['days'] == d1['days'],
      'всё нули без ошибок, а вчера заказы были — st/ozd.bin не затёрт, прежние дни в состоянии, предупреждение')

print('P15 — AutoGRAPH (ГЛОНАСС)')
_wr('login=u\npassword=p\n', os.path.join(L, 'glonass'), 'w')
class FS:
    def __init__(self, *a): self.n, self.logins = 0, 0
    def mask(self, s): return str(s)
GL.Session = FS
CARS = {'n': [{'id': '1', 'name': 'Газель', 'vrn': 'А001АА', 'lat': 54.6, 'lng': 39.7, 'dt': '2026-10-30 11:50:00', 'speed': 0, 'state': 1, 'addr': 'Рязань'}]}
REF = {'schemas': [{'id': 's1', 'name': 'Фабрикант'}], 'devices': {'1': {'name': 'Газель'}}, 'zones': {}, 'zone_names': {}}
GL.refresh_ref = lambda S_, old, dl: (dict(REF), [])
GL.online = lambda S_, ref, ids: (list(CARS['n']), [])
GL.day_data = lambda S_, ref, ids, d, dl: ([{'km': 10}], [], {}, {})
GL.near_fill = lambda pts, geo: None
r = live.lane_glonass()['glonass']
check(r['cars'] == 1 and pub['gl.bin']['cars'], 'машины опубликованы (gl.bin — ключом владельца)')
st = live.jload('glonass.json', {}); st.update({'ts_now': 0, 'ts_ref': 0, 'ts_day': 0}); live.jsave('glonass.json', st)
CARS['n'] = []; GL.refresh_ref = lambda S_, old, dl: ({'schemas': [], 'devices': {}, 'zones': {}, 'zone_names': {}}, [])
GL.day_data = lambda S_, ref, ids, d, dl: ([], [], {}, {})
n0 = len(R.mail); r = live.lane_glonass()['glonass']
st = live.jload('glonass.json', {}); ref = live.jload('glonass_ref.json', {})
check(r['cars'] == 1 and st['cars'] and ref.get('schemas') and r.get('warn'), 'AutoGRAPH ответил пусто — машины и справочник прежние (раньше: «ok» с нулём машин)')
yd = (datetime.datetime.now(MSK).date() - datetime.timedelta(days=1)).isoformat()
check(st['day'].get(yd) == [{'km': 10}] and not st.get('ok_now'), 'рейсы за вчера не затёрты; отчёт по трекерам по старым данным не строится (ok_now=false)')
check(len(R.mail) == n0 + 1 and 'подозрительно пустой' in R.mail[-1][1], 'владельцу — сообщение')

print('P16 — Gmail IMAP: недоступен; письмо, разбор которого упал, — повтор и карантин')
_wr('p', os.path.join(L, 'gmail_app_password'), 'w')
def rep_letter(fn, subj='Гальваника ОКТЯБРЬ 2026', auth=True, frm='user14@example.org', mid=None):
    m = EmailMessage(); m['From'] = frm; m['To'] = 'user5@example.org'; m['Subject'] = subj
    m['Date'] = 'Fri, 30 Oct 2026 08:50:00 +0300'; m['Message-ID'] = mid or '<user125@example.org>' % hashlib.sha1(fn.encode()).hexdigest()[:10]
    if auth: m['Authentication-Results'] = 'mx.google.com; dkim=pass header.i=@fabrikant.su; spf=pass smtp.mailfrom=%s; dmarc=pass (p=NONE) header.from=fabrikant.su' % frm
    m.set_content('отчёт'); m.add_attachment(b'%PDF-1.4', maintype='application', subtype='pdf', filename=fn)
    return m.as_bytes()
class Gm:
    box = {'5': rep_letter('OSERR Гальваника.pdf'), '6': rep_letter('Гальваника ОКТЯБРЬ 2026.pdf'), '7': rep_letter('Гальваника 2.pdf', auth=False)}
    fail = False
    def __init__(self, *a, **k):
        if Gm.fail: raise ConnectionRefusedError(111, 'imap.gmail.com недоступен')
        self.untagged_responses = {'UIDVALIDITY': [b'1']}
    def login(self, u, p): pass
    def list(self): return 'OK', [b'(\\HasNoChildren \\All) "/" "[Gmail]/All Mail"']
    def select(self, b, readonly=False): return 'OK', [b'3']
    def uid(self, cmd, *a):
        if cmd == 'SEARCH': return 'OK', [' '.join(sorted(self.box)).encode()]
        return 'OK', [(b'x (RFC822 {1}', self.box[a[0]]), b')']
    def logout(self): pass
imaplib.IMAP4_SSL = Gm
Gm.fail = True
r = live.lane_reports()
check(str(json.loads(_rd(os.path.join(S, 'status.json')))['mail']).startswith('ошибка'), 'imap.gmail.com недоступен — «ошибка» в состоянии, участок дошёл до конца')
Gm.fail = False; R.mail.clear()
for i in range(3): live.lane_reports()
seen = json.loads(_rd(os.path.join(S, 'seen.json')))
recv = json.loads(_rd(os.path.join(S, 'recv.json')))
check(seen['uids'].count('6') == 1 and seen['uids'].count('7') == 1 and '5' in seen['uids'] and seen['quar'] == ['5'], 'упавший разбор (нет места на диске) — повтор, на 3-й — карантин; хорошие письма — один раз')
check(any('карантин' in x[1] for x in R.mail), 'о карантине — сообщение владельцу')
check(any('неподтверждённым отправителем' in x[1] and 'ПРИНЯТ' in x[1] for x in R.mail) and len([r_ for r_ in recv if r_['k'] == 'galv']) == 2,
      'P14: отчёт без SPF/DKIM/DMARC принят (как раньше), но владельцу ВСЕГДА сообщение')

print('P14 — строгий режим (cfg.json → auth_strict) и itm@ (Mail.ru)')
live.CFG['auth_strict'] = True
Gm.box = {'8': rep_letter('Гальваника 3.pdf', auth=False, mid='<fake8@x>')}
live.lane_reports(); recv = json.loads(_rd(os.path.join(S, 'recv.json')))
check(not [r_ for r_ in recv if r_.get('mid') == hashlib.sha256(b'<fake8@x>').hexdigest()[:16]] and any('не принят' in x[1] for x in R.mail), 'auth_strict=true — отчёт без подтверждения не принят, сообщение владельцу')
live.CFG['auth_strict'] = False
import itm as IT
_wr('p', os.path.join(L, 'itm_app_password'), 'w')
class Mr(Gm):
    box = {'21': rep_letter('OSERR Гальваника.pdf', mid='<i21@x>'), '22': rep_letter('Гальваника И.pdf', auth=False, mid='<i22@x>')}
    def list(self): return 'OK', [b'(\\HasNoChildren) "/" "INBOX"']
    def uid(self, cmd, *a):
        if cmd == 'SEARCH': return 'OK', [' '.join(sorted(self.box)).encode()]
        u = a[0]
        if 'HEADER' in a[1]:
            hdr = self.box[u].split(b'\n\n')[0] + b'\n\n'
            return 'OK', [(b'%s (RFC822.SIZE %d BODY[HEADER] {1}' % (u.encode(), len(self.box[u])), hdr), b')']
        return 'OK', [(b'%s (BODY[] {1}' % u.encode(), self.box[u]), b')']
    def append(self, *a): return 'OK', [b'']
imaplib.IMAP4_SSL = Mr
live.jsave('itm.json', {'folders': {'INBOX': {'uv': '1', 'last': 20}}, 'notes': [], 'dreq': {}, 'ddone': []})
recv = []
for i in range(3):
    r = IT.run(L, live.CFG, lambda raw: live.ingest_message(raw, recv), live.log, live.jload, live.jsave, live.publish)
    if i == 0: first = dict(r)
st = live.jload('itm.json', {})
check(first.get('auth_warn') == 1 and first['auth_list'][0]['taken'] and len([x for x in recv if x['k'] == 'galv']) == 1, 'itm@: отчёт без подтверждения — принят и в auth_list (→ оповещение)')
check(r.get('quar') == 1 and not st['folders']['INBOX'].get('retry') and st['quar'][0]['u'] == 21, 'itm@: упавший разбор — повтор по UID, на 3-й — карантин (не «прочитано и забыто»)')

print('P19 — документ по тому же адресу обновляется')
fid = 'ab' * 12
live.publish_file(fid, b'v1'); p = os.path.join(M['SITE'], 'st', 'f', fid + '.bin'); a = _rd(p)
live.publish_file(fid, b'v1'); check(_rd(p) == a, 'то же содержимое — файл не переписывается')
live.publish_file(fid, b'v2 new'); b_ = _rd(p)
def unseal_bytes(s, key):
    b = base64.b64decode(s[6:]); nonce, tag, ct = b[:16], b[16:48], b[48:]
    assert hmac.compare_digest(hmac.new(key, nonce + ct, hashlib.sha256).digest(), tag)
    ks = b''.join(hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))
    return bytes(x ^ y for x, y in zip(ct, ks))
check(b_ != a and unseal_bytes(b_, bytes.fromhex(MH.KL)) == b'v2 new', 'содержимое изменилось — st/f/<fid>.bin переписан (раньше: старая копия навсегда)')

print('P20 — на Диск 1c@ только st/exp_*.bin')
import drive_put as DPU, gdrive_1c as GD
os.makedirs(os.path.join(M['SITE'], 'st'), exist_ok=True); _wr('T14B1.x', os.path.join(M['SITE'], 'st', 'exp_uz.bin'), 'w')
DPU.HERE = M['C']
_wr(json.dumps([{'id': 'd', 'src': 'st/exp_uz.bin'}, {'id': 'a', 'src': 'live:cfg.json'}, {'id': 'b', 'src': '/etc/passwd'}]), os.path.join(M['C'], 'drive_put.json'), 'w')
sent = []; GD.put_file = lambda L_, name, data, mime='', sub=None: sent.append(name) or {'ok': True, 'id': 'F'}
store = {}
r = DPU.run(L, M['SITE'], lambda *a: None, lambda n, d: store.get(n, d), lambda n, v: store.__setitem__(n, v))
check(sent == ['exp_uz.bin'] and r['err'].count('не разрешён') == 2 and 'a' not in store['drive_put.json']['done'], '«live:cfg.json» (каталог с ключами) и абсолютный путь — отклонены; st/exp_*.bin — ушёл')
_wr(json.dumps([{'id': 'c', 'src': 'st/ls.bin'}]), os.path.join(M['C'], 'drive_put.json'), 'w')
r = DPU.run(L, M['SITE'], lambda *a: None, lambda n, d: store.get(n, d), lambda n, v: store.__setitem__(n, v))
check(sent == ['exp_uz.bin'] and 'не разрешён' in r['err'], 'и файл сайта не из выгрузок (st/ls.bin) — тоже нет')

print('P21 — один список праздников')
import stock_mail as SM, unans as UA, mx_ctl as MC
check(SM.HOLIDAYS is MC.HOLIDAYS and UA.HOLIDAYS is MC.HOLIDAYS and '2027-01-04' in MC.HOLIDAYS, 'stock_mail и unans берут mx_ctl.HOLIDAYS')
r = SM.run(L, lambda: datetime.datetime(2027, 1, 4, 10, 30, tzinfo=MSK), lambda n, d: d, lambda n, v: None, lambda *a: 'ok', lambda *a: None)
check(r['state'] == 'выходной', 'письмо «Остатки» 04.01.2027 не уходит (было: уходило)')
check(not live.is_workday(datetime.date(2027, 1, 4)) and live.is_workday(datetime.date(2026, 10, 30)), 'проверка 10:35: 04.01.2027 — не рабочий день')
print('ALL OK', ok)
