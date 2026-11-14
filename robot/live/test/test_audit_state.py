"""30.10.2026 аудит — повреждённые файлы состояния (P8), атомарная запись при обрыве (P9), повторный запуск cron и общий замок itm@ (P17).
Запуск: cd live && unshare -n python3 -W ignore test/test_audit_state.py → «ALL OK»."""
import datetime, fcntl, json, os, random, signal, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_home as MH
ok = 0
def check(c, m):
    global ok
    assert c, m; ok += 1; print('  ✓', m)

M = MH.make('smtp', 'imap', passwords=False)
live = MH.load_live(M)
REC = MH.Rec().hook(live)
live.now = lambda: datetime.datetime(2026, 10, 30, 11, 0, tzinfo=live.MSK)
S = os.path.join(M['FL'], 'state')
def corrupt(n, data='{"битый'): open(os.path.join(S, n), 'w').write(data)

print('P8 — битый JSON не считается пустым')
live.jsave('recv.json', [{'k': 'galv', 'date': '2026-10-29', 'got': '2026-10-29T08:50', 'mid': 'm1'}])
check(os.path.exists(os.path.join(S, 'recv.json.bak')), 'jsave критичного файла пишет и .bak (копия последней удачной записи)')
corrupt('recv.json')
v = live.jload('recv.json', [])
check(v and v[0]['k'] == 'galv' and json.load(open(os.path.join(S, 'recv.json')))[0]['mid'] == 'm1', 'битый recv.json → восстановлен из .bak (не пустой список)')
check([f for f in os.listdir(S) if f.startswith('recv.json.corrupt-')] and not os.path.exists(os.path.join(S, 'recv.json.corrupt')), 'испорченный отложен как .corrupt-<время>')
check(REC.mail and 'восстановлен из резервной копии' in REC.mail[-1][1], 'владельцу — сообщение о восстановлении')
corrupt('recv.json'); corrupt('recv.json.bak', 'тоже битый')
try: live.jload('recv.json', []); raised = False
except live.StateCorrupt: raised = True
check(raised and os.path.exists(os.path.join(S, 'recv.json.corrupt')) and not os.path.exists(os.path.join(S, 'recv.json')), 'и .bak битый — StateCorrupt, метка recv.json.corrupt')
check(any('резервной копии нет' in x[1] and 'остановлен' in x[1] for x in REC.mail) and REC.max, 'владельцу — критичное оповещение (письмо и MAX): блок остановлен, что разобрать')
try: live.jload('recv.json', []); raised = False
except live.StateCorrupt: raised = True
check(raised, 'файла нет, но есть метка .corrupt — по-прежнему StateCorrupt (не «пусто» в следующем прогоне)')
check(live.jload('recv.json', ['x'], peek=True) == ['x'], 'peek=True — только посмотреть: без исключения и переименований')
# участок reports с битым recv.json: почта не читается, проверка 10:35 не делается, данные портала не пересчитываются
for n in ('gmail_app_password',): open(os.path.join(M['FL'], n), 'w').write('p')
import imaplib
calls = []
imaplib.IMAP4_SSL = lambda *a, **k: calls.append(a) or (_ for _ in ()).throw(ConnectionRefusedError(111, 'x'))
live.jsave('alerts.json', {'2026-10-29': {'t': 'x', 'miss': []}})
r = live.lane_reports()
st = json.load(open(os.path.join(S, 'status.json'), encoding='utf-8'))
check(not calls and 'recv.json' in st['mail'] and r['state'].startswith('ошибка'), 'битый recv.json без копии — IMAP не открывается, участок reports сообщает ошибку (fail closed)')
check(json.load(open(os.path.join(S, 'alerts.json'))) == {'2026-10-29': {'t': 'x', 'miss': []}}, 'проверка 10:35 не выполнялась (нет ложного «не пришли»)')
os.remove(os.path.join(S, 'recv.json.corrupt'))
check(live.jload('recv.json', []) == [], 'метку убрали (разобрано вручную) — снова обычная работа')
# deploy.json битый — ничего не ставится
corrupt('deploy.json')
import deploy as DP
try: DP.check(live.CFG, live.L, live.SITE, live.jload, live.jsave, live.log); raised = False
except live.StateCorrupt: raised = True
p = live.lane_portal()
check(raised and str(p['deploy'].get('state', '')).startswith('ошибка'), 'битый deploy.json (без .bak) — установка пакетов остановлена, не «всё заново» (раньше: переустановка старых пакетов)')
# mail_out.json битый — письма по поручению не уходят повторно
json.dump([{'id': 'x1', 'subject': 'S', 'text': 'T', 'to': ['user128@example.org']}], open(os.path.join(M['C'], 'mail_out.json'), 'w'))
corrupt('mail_out.json')
import mail_q as MQ
before = len(MQ.pending())
st = live.lane_mail()
after = [json.load(open(os.path.join(MQ.OUT, f), encoding='utf-8'))['subject'] for f in MQ.pending()]
check('S' not in after and str(st['mail_out'].get('state', '')).startswith('ошибка'), 'битый mail_out.json — ни одного письма по поручению (раньше: все письма заново)')
json.dump([], open(os.path.join(M['C'], 'mail_out.json'), 'w'))
# некритичный файл — заново, но не молча
corrupt('glonass.json'); n0 = len(REC.mail)
check(live.jload('glonass.json', {'d': 1}) == {'d': 1} and [f for f in os.listdir(S) if f.startswith('glonass.json.corrupt-')] and len(REC.mail) > n0,
      'некритичный файл битый — отложен (.corrupt-<время>), начат заново, владельцу — сообщение')

print('P9 — атомарная запись при обрыве процесса')
prog = r'''
import sys, os, json
sys.path[:0] = [sys.argv[1], sys.argv[2]]
import live, mail_q as MQ
big = [{'k': 'x' * 50, 'n': i, 's': 'строка ' * 20} for i in range(4000)]
p = os.path.join(MQ.OUT, 'item.json')
print('go', flush=True)
i = 0
while True:
    i += 1; big[0]['n'] = i
    live.jsave('recv.json', big); MQ._write_json(p, {'n': i, 'big': big[:500]})
'''
good = 0
os.makedirs(MQ.OUT, exist_ok=True)
for k in range(12):
    pr = subprocess.Popen([sys.executable, '-W', 'ignore', '-c', prog, os.path.join(M['FL'], 'py'), M['C']], stdout=subprocess.PIPE)
    pr.stdout.readline(); time.sleep(random.uniform(0.05, 0.6)); pr.send_signal(signal.SIGKILL); pr.wait()
    try:
        a = json.load(open(os.path.join(S, 'recv.json'), encoding='utf-8')); b = json.load(open(os.path.join(MQ.OUT, 'item.json'), encoding='utf-8'))
        good += 1 if len(a) == 4000 and len(b['big']) == 500 else 0
    except Exception as e: print('    битый после kill:', e)
check(good == 12, 'kill -9 посреди записи (12 раз) — recv.json и файл письма всегда целые (временный файл + os.replace)')
pp = os.path.join(MQ.OUT, 'item.json'); MQ._write_json(pp, {'n': 'хорошее'})
import json as _j
real = _j.dump
def bad_dump(obj, f, **k): f.write('{"обрыв'); raise OSError(28, 'No space left on device')
MQ.json.dump = bad_dump
try: MQ._write_json(pp, {'n': 'новое'}); raised = False
except OSError: raised = True
MQ.json.dump = real
check(raised and json.load(open(pp, encoding='utf-8')) == {'n': 'хорошее'}, 'диск кончился посреди записи — прежний файл письма цел (раньше: письмо в bad/ и потеряно)')
for f in os.listdir(MQ.OUT):
    if f.endswith('.tmp') or f == 'item.json': os.remove(os.path.join(MQ.OUT, f))

print('Повторный запуск cron (flock) и общий замок itm@ (P17)')
code = r'''
import sys, time
sys.path[:0] = [sys.argv[1], sys.argv[2]]
import itm as IT
lk = IT.imap_lock(sys.argv[3], 5); print('got' if lk else 'none', flush=True); time.sleep(float(sys.argv[4]))
'''
pa = subprocess.Popen([sys.executable, '-c', code, os.path.join(M['FL'], 'py'), M['C'], M['FL'], '3'], stdout=subprocess.PIPE, universal_newlines=True)
check(pa.stdout.readline().strip() == 'got', 'первый участок взял замок входа в itm@')
import itm as IT
t0 = time.time(); lk = IT.imap_lock(M['FL'], 1)
check(lk is None and 0.9 <= time.time() - t0 < 2.5, 'второй — ждёт не дольше своего предела и пропускает прогон (не входит параллельно)')
open(os.path.join(M['FL'], 'itm_app_password'), 'w').write('p')
imaplib.IMAP4_SSL = lambda *a, **k: (_ for _ in ()).throw(AssertionError('вход в itm@ при занятом замке'))
IT_wait = IT.imap_lock
IT.imap_lock = lambda L, wait=20: IT_wait(L, 1)
r = IT.run(live.L, live.CFG, lambda raw: [], live.log, live.jload, live.jsave, live.publish)
check(r['mail'] == IT.BUSY, 'itm.run при занятом ящике — «%s», без входа' % IT.BUSY)
pa.wait(); IT.imap_lock = IT_wait
lk = IT.imap_lock(M['FL'], 1); check(lk is not None, 'замок освободился — следующий участок входит'); lk.close()
code2 = r'''
import sys, time
sys.path[:0] = [sys.argv[1], sys.argv[2]]
import live
live.LANES.append(('t1', lambda: time.sleep(2) or {}, 10)); r = live.run_lane('t1'); print('run' if r else 'skip', flush=True)
'''
procs = [subprocess.Popen([sys.executable, '-W', 'ignore', '-c', code2, os.path.join(M['FL'], 'py'), M['C']], stdout=subprocess.PIPE, universal_newlines=True) for _ in range(3)]
outs = sorted(p.communicate()[0].strip() for p in procs)
check(outs == ['run', 'skip', 'skip'], 'три одновременных запуска одного участка (cron наложился) — работает один, двое выходят сразу: %s' % outs)
print('ALL OK', ok)
