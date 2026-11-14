"""30.10.2026 аудит — пакеты обновлений (P4–P7, DESIGN 8): подпись v2 (имя + sha256), переход с v1, защита от отката и повтора,
битый пакет не держит очередь, копии и откат при обрыве установки и при сбое проверки импорта, та же проверка для пакетов по почте,
drive_pack.py (копия упаковщика) пишет v2. Ключ — тестовый; drive_pack.py НЕ запускается (он читает настоящий ключ), импортируются
только его чистые функции. Запуск: cd live && unshare -n python3 -W ignore test/test_audit_deploy.py → «ALL OK»."""
import email, email.policy, io, json, os, signal, subprocess, sys, time, zipfile
from email.message import EmailMessage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_home as MH
ok = 0
def check(c, m):
    global ok
    assert c, m; ok += 1; print('  ✓', m)

M = MH.make('smtp', 'imap', passwords=False)
live = MH.load_live(M)
import deploy as DP, mail_pkg as MKP
sys.path.insert(0, os.path.dirname(MH.HERE))
import drive_pack as PK                                             # копия упаковщика: при импорте ключ и app_build не читаются (всё — в main())
KEY = bytes.fromhex(MH.KD)
L, C, SITE = M['FL'], M['C'], M['SITE']
INBOX = os.path.join(L, 'inbox'); os.makedirs(INBOX, exist_ok=True)
logs, alerts = [], []
lg = lambda *a: logs.append(' '.join(str(x) for x in a))
al = lambda key, text, critical=False: alerts.append((key, text))

check(PK.KEY is None and PK.sig_v2(KEY, 'fabrikant-update-20261030-0900.pkg', b'x') == DP.sig_v2(KEY, 'fabrikant-update-20261030-0900.pkg', b'x'),
      'drive_pack.sig_v2 = deploy.sig_v2 (одна формула у упаковщика и хостинга); импорт drive_pack не читает настоящий ключ')
check(DP.unpack(PK.pack(b'zip-bytes', KEY), KEY) == b'zip-bytes', 'шифр пакета упаковщика и хостинга совпадает')


def zbytes(files):
    b = io.BytesIO()
    with zipfile.ZipFile(b, 'w') as z:
        for n, d in files.items(): z.writestr(n, d)
    return b.getvalue()


def put(name, files=None, sig='v2', raw=None, signame=None):
    """пакет и подпись — в ~/.fabrika_live/inbox (как от mail_pkg)"""
    pb = raw if raw is not None else PK.pack(zbytes(files), KEY)
    s = PK.sig_v2(KEY, signame or name, pb) if sig == 'v2' else PK.sig_v1(KEY, pb) if sig == 'v1' else sig
    open(os.path.join(INBOX, name), 'wb').write(pb); open(os.path.join(INBOX, name[:-4] + '.sig'), 'w').write(s)
    return pb


def run():
    return DP.check(live.CFG, L, SITE, live.jload, live.jsave, lg, alert=al)


def done(): return json.load(open(os.path.join(L, 'state', 'deploy.json'), encoding='utf-8'))['done']


LIVE0 = open(os.path.join(C, 'live.py'), encoding='utf-8').read()
print('переход v1 → v2')
put('fabrikant-update-20261030-0800.pkg', {'code/note_a.json': '{"a": 1}'}, sig='v1')
st = run()
check(done()['fabrikant-update-20261030-0800.pkg'].get('sig') == 'v1' and os.path.exists(os.path.join(C, 'note_a.json')) and not st.get('v2'),
      'переходный пакет с подписью v1 принят (ни одного v2 ещё не было) — так ставится новый deploy.py')
put('fabrikant-update-20261030-0900.pkg', {'code/note_b.json': '{"b": 1}'})
st = run()
check(done()['fabrikant-update-20261030-0900.pkg'].get('sig') == 'v2' and st.get('v2') and st['last_ts'] == '202610300900', 'пакет v2 принят, отмечено: v2 уже был')
put('fabrikant-update-20261030-1000.pkg', {'code/note_c.json': '{}'}, sig='v1')
run()
check('v1 больше не принимается' in done()['fabrikant-update-20261030-1000.pkg'].get('err', '') and not os.path.exists(os.path.join(C, 'note_c.json')),
      'после первого v2 подпись v1 отклоняется (старый подписанный пакет не пройдёт)')
print('откат версии и повтор старого пакета')
old = put('fabrikant-update-20261030-0830.pkg', {'code/note_a.json': '{"a": "старое"}'})
run()
check('не новее' in done()['fabrikant-update-20261030-0830.pkg'].get('err', '') and json.load(open(os.path.join(C, 'note_a.json'))) == {'a': 1},
      'пакет с меткой старше установленной — отказ (откат кода невозможен)')
pb = open(os.path.join(INBOX, 'fabrikant-update-20261030-0900.pkg'), 'rb').read()
put('fabrikant-update-20261030-1100.pkg', raw=pb, sig=PK.sig_v2(KEY, 'fabrikant-update-20261030-0900.pkg', pb))
run()
check('подпись v2 не сошлась' in done()['fabrikant-update-20261030-1100.pkg'].get('err', ''), 'старый пакет под новым именем со старой подписью — отказ (подпись покрывает имя)')
print('битый пакет не держит очередь')
put('fabrikant-update-20261030-1200.pkg', {'code/x.json': '{}'}, sig='v2:' + '00' * 32)
put('fabrikant-update-20261030-1201.pkg', raw=b'T14Z1' + os.urandom(80))
put('fabrikant-update-20261030-1202.pkg', {'../evil.py': 'x'})
put('fabrikant-update-20261030-1203.pkg', {'code/note_d.json': '{"d": 1}'})
open(os.path.join(INBOX, 'fabrikant-update-20261030-1204.sig'), 'w').write('v2:' + 'ü' * 64)     # не-ASCII в подписи
open(os.path.join(INBOX, 'fabrikant-update-20261030-1204.pkg'), 'wb').write(b'T14Z1')
alerts.clear(); run(); D = done()
check(all(D['fabrikant-update-20261030-12%02d.pkg' % i].get('err') for i in (0, 1, 2, 4)) and D['fabrikant-update-20261030-1203.pkg'].get('files') == 1,
      'чужая подпись, битый zip, путь «../», не-ASCII подпись — отмечены с ошибкой, следующий пакет поставлен (раньше: break — очередь стояла)')
check(len([a for a in alerts if a[0].startswith('deploy:')]) == 4, 'аудит P12: по каждому битому пакету — оповещение владельцу')
print('проверка импорта и откат')
put('fabrikant-update-20261030-1300.pkg', {'code/live.py': 'def broken(:\n', 'code/note_e.json': '{"e": 1}'})
alerts.clear(); run(); D = done()
check('проверка импорта' in D['fabrikant-update-20261030-1300.pkg'].get('err', '') and open(os.path.join(C, 'live.py'), encoding='utf-8').read() == LIVE0
      and not os.path.exists(os.path.join(C, 'note_e.json')), 'пакет со сломанным live.py — откат из копии: прежний live.py на месте, новый файл убран')
check(alerts and 'не установлен' in alerts[0][1], 'владельцу — «пакет не установлен», робот на прежней версии')
r = subprocess.run([sys.executable, '-W', 'ignore', '-c', 'import live; print("ok")'], cwd=C, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
check(r.stdout.strip() == 'ok', 'после отката робот запускается')
bak = os.path.join(L, 'deploy_bak', 'fabrikant-update-20261030-1300.pkg')
check(json.load(open(os.path.join(bak, 'manifest.json'), encoding='utf-8'))['state'] == 'откат' and os.path.exists(os.path.join(bak, 'f', 'code', 'live.py')),
      'копия заменяемых файлов — в deploy_bak/<пакет>/, опись «откат»')
print('обрыв установки')
put('fabrikant-update-20261030-1400.pkg', {'code/note_a.json': '{"a": 2}', 'code/note_b.json': '{"b": 2}', 'code/note_f.json': '{"f": 2}'})
kill = r'''
import os, signal, sys
sys.path[:0] = [sys.argv[1], sys.argv[2]]
import live, deploy as DP
n = [0]; real = os.replace
def rep(a, b):
    real(a, b)
    if b.endswith('.json') and '/code/' in b:
        n[0] += 1
        if n[0] == 2: os.kill(os.getpid(), signal.SIGKILL)       # процесс убит посреди установки (хостинг, нехватка памяти)
os.replace = rep
DP.check(live.CFG, live.L, live.SITE, live.jload, live.jsave, lambda *a: None)
'''
r = subprocess.run([sys.executable, '-W', 'ignore', '-c', kill, os.path.join(L, 'py'), C])
half = [json.load(open(os.path.join(C, n))) for n in ('note_a.json', 'note_b.json')]
check(r.returncode == -signal.SIGKILL and half != [{'a': 1}, {'b': 1}], 'процесс убит посреди установки — половина файлов уже новые (пакет целиком не атомарен)')
st = live.jload('deploy.json', {})
names = DP.recover(L, st, lg)
check(names == ['fabrikant-update-20261030-1400.pkg'] and json.load(open(os.path.join(C, 'note_a.json'))) == {'a': 1}
      and json.load(open(os.path.join(C, 'note_b.json'))) == {'b': 1} and not os.path.exists(os.path.join(C, 'note_f.json')),
      'следующий прогон: опись «ставится» → откат из копии (прежние файлы, новых нет)')
run(); D = done()
check(D['fabrikant-update-20261030-1400.pkg'].get('files') == 3 and json.load(open(os.path.join(C, 'note_f.json'))) == {'f': 2}, 'и пакет ставится заново целиком')
print('предел времени участка посреди установки')
class LaneTimeout(BaseException): pass
put('fabrikant-update-20261030-1500.pkg', {'code/note_a.json': '{"a": 3}', 'code/note_g.json': '{}'})
real_rep = DP.os.replace; cnt = [0]
def rep2(a, b):
    real_rep(a, b)
    if '/code/note' in b:
        cnt[0] += 1
        if cnt[0] == 1: raise LaneTimeout()
DP.os.replace = rep2
try: run(); raised = False
except LaneTimeout: raised = True
DP.os.replace = real_rep
st = json.load(open(os.path.join(L, 'state', 'deploy.json')))
check(raised and json.load(open(os.path.join(C, 'note_a.json'))) == {'a': 2} and not os.path.exists(os.path.join(C, 'note_g.json')) and st.get('installing'),
      'сигнал предела времени посреди установки — откат сразу (в том же процессе), метка «ставится» в deploy.json')
run(); st = json.load(open(os.path.join(L, 'state', 'deploy.json')))
check(st['done']['fabrikant-update-20261030-1500.pkg'].get('files') == 2 and not st.get('installing'), 'следующий прогон: попытка засчитана, пакет поставлен')
print('временный сбой скачивания — до 3 прогонов, потом ошибка и дальше')
put('fabrikant-update-20261030-1600.pkg', {'code/note_h.json': '{}'})
put('fabrikant-update-20261030-1601.pkg', {'code/note_i.json': '{}'})
real_get = DP.download; listing = MKP.listing
MKP.listing = lambda L_: dict(listing(L_), **{'fabrikant-update-20261030-1600.pkg': ('mail', '/нет/такого/файла.pkg')})
for k in range(2):
    run(); D = done()
    check('fabrikant-update-20261030-1600.pkg' not in D and 'fabrikant-update-20261030-1601.pkg' not in D, 'прогон %d: не скачался — ждём (порядок пакетов), ошибкой не отмечен' % (k + 1))
run(); D = done(); MKP.listing = listing
check('не скачался' in D['fabrikant-update-20261030-1600.pkg'].get('err', '') and D['fabrikant-update-20261030-1601.pkg'].get('files') == 1,
      '3-й раз — отмечен с ошибкой, следующий пакет поставлен')
print('пакеты по почте (mail_pkg) — та же проверка')
def letter(name, pb, sig):
    m = EmailMessage(); m['Subject'] = 'Фабрика: пакет ' + name; m['From'] = 'user4@example.org'; m.set_content('пакет')
    m.add_attachment(pb, maintype='application', subtype='octet-stream', filename=name)
    m.add_attachment(sig.encode('utf-8') if isinstance(sig, str) else sig, maintype='text', subtype='plain', filename=name[:-4] + '.sig')
    return email.message_from_bytes(m.as_bytes(), policy=email.policy.default)
pb = PK.pack(zbytes({'code/note_m.json': '{}'}), KEY); nm = 'fabrikant-update-20261030-1700.pkg'
store = {}
jl = lambda n, d: live.jload(n, d) if n == 'deploy.json' else store.get(n, d); js = lambda n, v: store.__setitem__(n, v)
check(MKP.from_msg(L, live.CFG, letter(nm, pb, PK.sig_v2(KEY, nm, pb)), lg, jl, js) == 1, 'письмо с пакетом v2 — принят в inbox')
check(MKP.from_msg(L, live.CFG, letter('fabrikant-update-20261030-1701.pkg', pb, 'v2:' + 'я' * 64), lg, jl, js) == 0
      and 'не сошлась' in store['mail_pkg.json']['got']['fabrikant-update-20261030-1701.pkg']['err'], 'не-ASCII подпись — отказ, без падения разбора (P7)')
check(MKP.from_msg(L, live.CFG, letter('fabrikant-update-20261030-1702.pkg', pb, PK.sig_v1(KEY, pb)), lg, jl, js) == 0, 'v1 по почте после первого v2 — отказ')
check(MKP.from_msg(L, live.CFG, letter('fabrikant-update-20261030-0700.pkg', pb, PK.sig_v2(KEY, 'fabrikant-update-20261030-0700.pkg', pb)), lg, jl, js) == 0,
      'по почте пакет старше установленного — отказ')
# IMAP: одно кривое письмо не роняет остальные, seen сохраняется
class FakeIMAP:
    def __init__(self, *a, **k): pass
    def login(self, u, p): pass
    def select(self, box, readonly=False): return 'OK', [b'2']
    def uid(self, cmd, *a):
        if cmd == 'search': return 'OK', [b'10 11']
        if a[0] == '10': raise ValueError('кривое письмо')
        nm2 = 'fabrikant-update-20261030-1800.pkg'; pb2 = PK.pack(zbytes({'code/note_n.json': '{}'}), KEY)
        return 'OK', [(b'11 (BODY[] {1}', letter(nm2, pb2, PK.sig_v2(KEY, nm2, pb2)).as_bytes())]
    def logout(self): pass
open(os.path.join(L, 'itm_app_password'), 'w').write('p')
MKP.imaplib.IMAP4_SSL = FakeIMAP
r = MKP.run(L, live.CFG, lg, jl, js)
check(r['new'] == 1 and store['mail_pkg.json']['seen'] == ['10', '11'], 'IMAP: кривое письмо пропущено и запомнено, следующий пакет принят, seen сохранён')
run(); D = done()
check(D['fabrikant-update-20261030-1700.pkg'].get('files') == 1 and D['fabrikant-update-20261030-1800.pkg'].get('files') == 1, 'принятые по почте пакеты ставит deploy.py')
print('ALL OK', ok)
