"""30.10.2026 аудит — оповещения владельцу (P12, P13, DESIGN 5, 6, 7): alert() — не чаще раза в 6 ч на ключ, тихие часы 20:00–08:00 для
некритичных (одним сообщением в 08:00), критичные — сразу; ~/.fabrika_max/fail.jsonl от PHP (новые строки, ротация .1); расширенный сигнал
«жив» (crit, очередь q дольше 20 минут, d_err); сбои участков и блоков подряд; упавший участок; файлы владельца без k_owner.
Каналы — подменены (без сети). Запуск: cd live && unshare -n python3 -W ignore test/test_audit_alerts.py → «ALL OK»."""
import datetime, fcntl, json, os, sys, time


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
T = [datetime.datetime(2026, 10, 30, 11, 0, tzinfo=MSK)]
live.now = lambda: T[0]
S = os.path.join(M['FL'], 'state')

print('alert(): частота и тихие часы')
r1 = live.alert('k1', 'Фабрика: первое'); r2 = live.alert('k1', 'Фабрика: второе')
check(r1.startswith('письмо') and r2.startswith('повтор') and len(R.mail) == 1 and len(R.max) == 1, 'один ключ — не чаще раза в 6 ч (второе не ушло); каналы — письмо и MAX')
live.alert('k2', 'Фабрика: другой ключ'); check(len(R.mail) == 2, 'другой ключ — уходит')
A = json.loads(_rd(os.path.join(S, 'alerts_sent.json'))); A['k']['k1'] -= 6 * 3600 + 5; _wr(json.dumps(A), os.path.join(S, 'alerts_sent.json'), 'w')
live.alert('k1', 'Фабрика: через 6 часов'); check(len(R.mail) == 3, 'через 6 ч тот же ключ — снова уходит')
T[0] = datetime.datetime(2026, 10, 30, 22, 30, tzinfo=MSK)
r = live.alert('night1', 'Фабрика: ночное некритичное 1'); live.alert('night2', 'Фабрика: ночное некритичное 2')
check(r == 'отложено до 08:00' and len(R.mail) == 3, '22:30 — некритичные не отправляются, копятся')
live.alert('crit1', 'Фабрика: критичное ночью', critical=True)
check(len(R.mail) == 4 and 'критичное' in R.max[-1], 'критичное — сразу, и ночью')
check(live.alert_flush() is None and len(R.mail) == 4, 'ночью накопленное не уходит')
T[0] = datetime.datetime(2026, 10, 31, 8, 1, tzinfo=MSK)
live.alert_flush()
check(len(R.mail) == 5 and 'за ночь (2)' in R.mail[-1][0] and 'некритичное 1' in R.mail[-1][1] and 'некритичное 2' in R.mail[-1][1], 'в 08:00 — одним сообщением (2 оповещения)')
live.alert_flush(); check(len(R.mail) == 5, 'второй раз — пусто')
T[0] = datetime.datetime(2026, 10, 30, 12, 0, tzinfo=MSK)
import threading
with open(os.path.join(S, 'alerts_sent.lock'), 'a+') as lk:
    fcntl.flock(lk, fcntl.LOCK_EX)
    res = []; th = threading.Thread(target=lambda: res.append(live.alert('k_lock', 'Фабрика: под замком'))); th.start(); time.sleep(0.5)
    check(not res, 'журнал оповещений под замком: параллельный участок ждёт')
    fcntl.flock(lk, fcntl.LOCK_UN)
th.join(5); check(res and res[0].startswith('письмо'), 'замок снят — оповещение ушло один раз')

print('fail.jsonl от PHP')
mx = os.path.join(os.path.dirname(M['FL']), '.fabrika_max'); os.makedirs(mx, exist_ok=True); F = os.path.join(mx, 'fail.jsonl')
now = int(time.time())
with open(F, 'w') as f:
    f.write(json.dumps({'t': now - 3 * 86400, 'src': 'php', 'area': 'old', 'key': 'php:old', 'crit': False, 'msg': 'старое'}) + '\n')
    f.write(json.dumps({'t': now, 'src': 'php', 'area': 'max_state_config_json', 'key': 'php:max_state_config_json', 'crit': True, 'msg': 'config.json испорчен'}, ensure_ascii=False) + '\n')
n0 = len(R.mail); r = live.php_fails()
check(r['new'] == 1 and len(R.mail) == n0 + 1 and 'config.json испорчен' in R.mail[-1][1], 'первый запуск: новая строка → оповещение; старше суток — не тревожит')
r = live.php_fails(); check(r['new'] == 0 and len(R.mail) == n0 + 1, 'повторно те же строки не читаются (позиция и inode — state/fail_jsonl.json)')
with open(F, 'a') as f: f.write(json.dumps({'t': now, 'area': 'st_kcmd', 'key': 'php:st_kcmd', 'crit': True, 'msg': 'нет k_cmd.txt'}) + '\n{"t": %d, "key": "php:half' % now)
r = live.php_fails(); check(r['new'] == 1 and 'k_cmd' in R.mail[-1][1], 'дописанная строка — прочитана; недописанная (без \\n) — ждёт')
with open(F, 'a') as f: f.write('", "msg": "хвост до ротации"}\n')
os.rename(F, F + '.1')
with open(F, 'w') as f: f.write(json.dumps({'t': now, 'area': 'rot', 'key': 'php:rot', 'crit': False, 'msg': 'после ротации'}, ensure_ascii=False) + '\n')
r = live.php_fails()
check(r['new'] == 2 and sorted(r['keys']) == ['php:half', 'php:rot'], 'ротация в fail.jsonl.1 — дочитан хвост старого и новый файл с начала')
_wr('', F, 'w'); r = live.php_fails(); check(r['new'] == 0, 'файл стал меньше позиции — с начала, без ошибки')

print('сигнал «жив» (gas_hb.json от hb.php)')
alerts = {}; status = {}
def hb(**k):
    d = {'t': time.time(), 'gas_t': int(time.time()), 'v': '44f'}; d.update(k); _wr(json.dumps(d), os.path.join(S, 'gas_hb.json'), 'w')
hb(lu=1, q=0, fe=0, crit=['tg_hook', 'vapid_lost'], d_t=time.time())
n0 = len(R.mail); live.watch(T[0], alerts, status)
check(len(R.mail) == n0 + 1 and 'вебхука' in R.mail[-1][1] and 'VAPID' in R.mail[-1][1], 'crit не пуст — критичное оповещение (секрет вебхука, ключи VAPID)')
check(status['gas']['d']['crit'] == ['tg_hook', 'vapid_lost'], 'состояние сигнала — в status.gas.d (для портала)')
T[0] = datetime.datetime(2026, 10, 30, 23, 0, tzinfo=MSK)
hb(q=4, q_t=time.time() - 25 * 60, crit=[], d_t=time.time())
n0 = len(R.mail); live.watch(T[0], alerts, status)
check(len(R.mail) == n0 + 1 and 'очередь' in R.mail[-1][1], 'q > 0 дольше 20 минут (q_t от hb.php) — оповещение, и ночью (критичное)')
hb(q=4, q_t=time.time() - 5 * 60, crit=[], d_t=time.time()); alerts = {}
A = json.loads(_rd(os.path.join(S, 'alerts_sent.json'))); A['k'].pop('gas_queue', None); _wr(json.dumps(A), os.path.join(S, 'alerts_sent.json'), 'w')
n0 = len(R.mail); live.watch(T[0], alerts, status); check(len(R.mail) == n0, 'очередь 5 минут — ещё не тревога')
hb(crit=['tg_users_lost'], d_t=time.time() - 40 * 60)
n0 = len(R.mail); live.watch(T[0], alerts, status); check(len(R.mail) == n0, 'расширенные данные старше 30 минут — не используются')
T[0] = datetime.datetime(2026, 10, 30, 12, 0, tzinfo=MSK)
hb(d_err='sig'); n0 = len(R.mail); live.watch(T[0], alerts, status)
check(len(R.mail) == n0 + 1 and 'неверными расширенными данными' in R.mail[-1][1], 'd_err — предупреждение владельцу')
hb(); n0 = len(R.mail); live.watch(T[0], alerts, status); check(len(R.mail) == n0, 'старый вид отметки (без d) — как раньше, без лишних сообщений')

print('сбои участков и блоков (P12)')
live.LANES.append(('bad', lambda: 1 / 0, 5))
for _ in range(3): s = live.run_lane('bad')
check(s['fails'] == 3 and any('«bad»' in x[1] and '3 прогонов' in x[1] for x in R.mail), '3 сбоя подряд — одно оповещение')
n0 = len(R.mail); live.run_lane('bad'); check(len(R.mail) == n0, 'четвёртый сбой — без повтора (не чаще раза в 6 ч)')
live.LANES[-1] = ('bad', lambda: {}, 5); s = live.run_lane('bad'); check(s['fails'] == 0, 'участок заработал — счётчик сброшен')
live.LANES.append(('blk', lambda: {'glonass': {'state': 'ошибка', 'err': 'AutoGRAPH 500'}}, 5))
for _ in range(3): s = live.run_lane('blk')
check(s['state'] == 'ok' and s['bfails']['glonass'] == 3 and any('блок «glonass»' in x[1] for x in R.mail), 'блок участка с ошибкой 3 раза подряд (участок «ok») — оповещение')
_wr(json.dumps({'t': live.iso(live.now()), 'state': 'идёт', 'pid': 99999999, 'fails': 2}), os.path.join(S, 'lane_docs.json'), 'w')
_wr(json.dumps({'ts': time.time()}), os.path.join(S, 'main.json'), 'w')
out = live.lanes_watch()
s = json.loads(_rd(os.path.join(S, 'lane_docs.json')))
check(out.get('docs', '').startswith('упал') and s['fails'] == 3 and any('docs' in x[1] and 'падает' in x[1] for x in R.mail), 'участок упал, не записав итог (замок свободен) — отмечен, на 3-й раз — оповещение')
_wr(json.dumps({'t': (datetime.datetime.now(MSK) - datetime.timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M'), 'state': 'ok'}), os.path.join(S, 'lane_glonass.json'), 'w')
_wr(json.dumps({'ts': time.time()}), os.path.join(S, 'main.json'), 'w')
out = live.lanes_watch(); check('glonass' in out and any('не запускался' in x[1] for x in R.mail), 'участок не запускался 3 часа при работающем cron — оповещение')
_wr(json.dumps({'ts': time.time() - 7200}), os.path.join(S, 'main.json'), 'w'); A = json.loads(_rd(os.path.join(S, 'alerts_sent.json'))); A['k'] = {}; _wr(json.dumps(A), os.path.join(S, 'alerts_sent.json'), 'w')
n0 = len(R.mail); out = live.lanes_watch(); check('glonass' not in out and len(R.mail) == n0, 'стоял сам cron (раздатчик 2 ч не запускался) — про участки не тревожит')

print('файлы владельца без k_owner (P13)')
M2 = MH.make('smtp', 'imap', passwords=False, k_owner=False)
import subprocess
code = r'''
import json, os, live
sent = []
live.mail_send = lambda s, t, *a, **k: sent.append((s, t)) or 'ok'; live.max_send = lambda t: 'ok'
live.now = lambda: __import__('datetime').datetime(2026, 10, 30, 12, 0, tzinfo=live.MSK)
r1 = live.publish('mq.bin', {'x': 1}); r2 = live.publish('exp_uz.bin', {'x': 1}); r3 = live.publish('ls.bin', {'x': 1})
st = os.path.join(live.SITE, 'st')
print(json.dumps({'r': [r1, r2, r3], 'files': sorted(os.listdir(st)), 'key': live.KEY_OWNER is None, 'sent': sent}, ensure_ascii=False))
'''
r = subprocess.run([sys.executable, '-W', 'ignore', '-c', code], cwd=M2['C'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
J = json.loads(r.stdout.strip().splitlines()[-1]) if r.returncode == 0 else {}
check(J.get('key') and J['r'] == [False, False, True] and J['files'] == ['ls.bin'], 'нет k_owner.txt — mq.bin и exp_* не публикуются (раньше — ключом сайта), ls.bin — как обычно ' + r.stderr[-300:])
check(len(J['sent']) == 1 and 'k_owner' in J['sent'][0][1], 'владельцу — одно критичное оповещение (второй файл — без повтора)')
print('ALL OK', ok)
