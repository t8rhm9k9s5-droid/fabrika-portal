"""Тест параллельных участков live.py (29.10.2026): раздача за доли секунды, предел времени, замки, ошибки, защита от старого прогона.
30.10.2026 (аудит): макет ~/.fabrika_live — test/mock_home.py (код из этой папки, без app_build и fabrika); устаревшее ожидание
«в пакете send=bot» убрано — в работе сейчас smtp/imap, утром 30.10 — bot/gas: проверяются ОБА режима.
  • bot/gas: imaplib, smtplib (и сокеты у участка mail) подменены ловушкой — любой вызов валит участок и пишется в журнал;
    письмо от бота (inbox_gas) разбирается участком reports, очередь — в st/mo.bin (ключ владельца), подтверждение бота → outbox/sent/;
  • smtp/imap: пароли есть, а IMAP, SMTP, сокеты и sendmail «недоступны» (ConnectionRefusedError) — все 9 участков доходят до конца,
    сбой почты виден в состоянии, письмо очереди остаётся с попыткой и паузой (повтора сразу нет), сети нет."""
import base64, fcntl, json, os, subprocess, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_home as MH
LANES = ['portal', 'reports', 'bots', 'history', 'ozon', 'ozon_hist', 'docs', 'mail', 'glonass']
ok = 0
def check(c, m):
    global ok
    assert c, m; ok += 1; print('  ✓', m)


def wait_lanes(M, lanes, limit=60):
    t0 = time.time()
    while time.time() - t0 < limit:
        st = {}
        for n in lanes:
            try: st[n] = json.load(open(os.path.join(M['FL'], 'state', 'lane_%s.json' % n), encoding='utf-8'))
            except Exception: st[n] = None
        if all(s and s.get('state') not in (None, 'идёт') for s in st.values()): return st
        time.sleep(0.5)
    return st


GALV = b'%PDF-1.4 test galv'
day = time.strftime('%Y-%m-%d', time.gmtime(time.time() + 3 * 3600))

# REDACTED_B64_9 режим bot / gas (утро 30.10)
print('режим send=bot, read=gas')
M = MH.make('bot', 'gas', trap='trap', sock='mail'); FL, C = M['FL'], M['C']
os.makedirs(os.path.join(FL, 'inbox_gas'))
json.dump({'id': 'REDACTED_HEX_8', 'msgid': '<user136@example.org>', 'from': 'user15@example.org', 'to': 'user5@example.org', 'subject': 'Гальваника ОКТЯБРЬ 2026',
           'date': 'Tue, 27 Oct 2026 08:50:00 +0300', 'text': 'Отчёт', 'att': [{'name': 'Гальваника ОКТЯБРЬ 2026.pdf', 'mime': 'application/pdf', 'b64': base64.b64encode(GALV).decode()}]},
          open(os.path.join(FL, 'inbox_gas', '18f2a0c3b4d5e6f7.json'), 'w'), ensure_ascii=False)
subprocess.run([sys.executable, '-W', 'ignore', '-c', 'import mail_q; mail_q.enqueue("Тест", "текст", ["user137@example.org"])'], cwd=C, check=True)
QID = [f[:-5] for f in os.listdir(os.path.join(FL, 'outbox')) if f.endswith('.json')][0]
t0 = time.time(); subprocess.run([sys.executable, '-W', 'ignore', 'live.py'], cwd=C, check=True, env=M['ENV']); dt = time.time() - t0
check(dt < 3, 'раздача участков за %.2f с' % dt)
st = wait_lanes(M, LANES)
for n in LANES: check(st[n] and st[n]['state'] == 'ok', 'участок %s: ok за %s с' % (n, (st[n] or {}).get('secs')))
check(os.path.exists(os.path.join(M['SITE'], 'st', 'hs.bin')) and os.path.exists(os.path.join(M['SITE'], 'st', 'ls.bin')), 'st/hs.bin и st/ls.bin опубликованы')
check(not MH.trap_log(M), 'ни один участок не открыл IMAP или SMTP, участок mail — без сети ' + MH.trap_log(M)[:300])
mo = open(os.path.join(M['SITE'], 'st', 'mo.bin')).read()
O = MH.unseal(mo, bytes.fromhex(MH.KO))
check(O and O['v'] == 1 and [i['id'] for i in O['items']] == [QID] and MH.unseal(mo, bytes.fromhex(MH.KL)) is None, 'st/mo.bin — очередь для бота, ключом владельца (k_live не открывает)')
S = json.load(open(os.path.join(FL, 'state', 'status.json'), encoding='utf-8'))
R = json.load(open(os.path.join(FL, 'state', 'recv.json'), encoding='utf-8'))
check(S['gas_in']['new'] == 1 and S['gas_in']['reports'] == 1 and any(r['k'] == 'galv' for r in R), 'участок reports: письмо от бота (inbox_gas) разобрано — гальваника в recv.json')
check(S['itm']['mail'] == 'отключено: почта через Gmail' and S['mail_mode'] == {'send': 'bot', 'read': 'gas'}, 'itm@ — «отключено: почта через Gmail», режим виден в состоянии')
check(os.listdir(os.path.join(FL, 'inbox_gas', 'done', day)) == ['18f2a0c3b4d5e6f7.json'], 'письмо от бота — в inbox_gas/done/<день>/')
check(os.path.exists(os.path.join(FL, 'state', 'recv.json.bak')) and os.path.exists(os.path.join(FL, 'state', 'status.json.bak')), 'аудит P8: у recv.json и status.json есть .bak')
os.makedirs(os.path.join(FL, 'outbox', 'acks'))
json.dump({'id': QID, 'ok': 1, 't': int(time.time())}, open(os.path.join(FL, 'outbox', 'acks', QID + '.json'), 'w'))
t1 = time.time(); subprocess.run([sys.executable, '-W', 'ignore', 'live.py', '--lane', 'mail'], cwd=C, check=True, env=M['ENV'])
ms = json.load(open(os.path.join(FL, 'state', 'lane_mail.json'), encoding='utf-8'))
check(ms['state'] == 'ok' and os.path.exists(os.path.join(FL, 'outbox', 'sent', day, QID + '.json')) and not MH.trap_log(M)
      and MH.unseal(open(os.path.join(M['SITE'], 'st', 'mo.bin')).read(), bytes.fromhex(MH.KO))['items'] == [],
      'подтверждение бота → письмо в outbox/sent/<день>/, mo.bin пуст; участок mail — %.1f с, без сети' % (time.time() - t1))
code = r'''
import live, time, json, fcntl, subprocess, sys
def hang():
    try: time.sleep(100)
    except Exception: pass
live.LANES.append(('slow', hang, 2)); t = time.time(); st = live.run_lane('slow')
assert st['state'].startswith('прервано') and time.time() - t < 4; print('  ✓ зависший участок прерван по пределу')
live.LANES[-1] = ('slow', lambda: time.sleep(3) or {}, 10)
p = subprocess.Popen([sys.executable, '-W', 'ignore', '-c', 'import live,time; live.LANES.append(("slow", lambda: time.sleep(3) or {}, 10)); live.run_lane("slow")'])
time.sleep(1); t = time.time()
assert live.run_lane('slow') is None and time.time() - t < 0.5; print('  ✓ повторный запуск занятого участка сразу выходит (flock)')
r = live.run_lane('portal'); assert r and r['state'] == 'ok'; print('  ✓ портал работает, пока другой участок занят'); p.wait()
live.LANES.append(('bad', lambda: 1 / 0, 5)); r = live.run_lane('bad'); assert r['state'] == 'ошибка' and r['fails'] == 1; print('  ✓ ошибка участка записана, счётчик сбоев 1')
lk = open('../run.lock', 'w'); fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
s = live.main(); assert 'mail' not in s and 'portal' in s; print('  ✓ при старом прогоне участок mail не запускается'); lk.close(); time.sleep(3)
'''
r = subprocess.run([sys.executable, '-W', 'ignore', '-c', code], cwd=C, env=M['ENV'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
print(r.stdout.rstrip()); check(r.returncode == 0, 'замки, пределы и ошибки участков ' + r.stderr[-600:])
ok += r.stdout.count('✓')

# REDACTED_B64_9 режим smtp / imap (работает сейчас): почта «недоступна»
print('режим send=smtp, read=imap (почтовые серверы недоступны)')
M = MH.make('smtp', 'imap', trap='refused', sock='all'); FL, C = M['FL'], M['C']
subprocess.run([sys.executable, '-W', 'ignore', '-c', 'import mail_q; mail_q.enqueue("Тест SMTP", "текст", ["user137@example.org"])'], cwd=C, check=True)
QID = [f[:-5] for f in os.listdir(os.path.join(FL, 'outbox')) if f.endswith('.json')][0]
subprocess.run([sys.executable, '-W', 'ignore', 'live.py'], cwd=C, check=True, env=M['ENV'])
st = wait_lanes(M, LANES)
for n in LANES: check(st[n] and st[n]['state'] == 'ok', 'участок %s: ok (сбой почты не валит участок)' % n)
S = json.load(open(os.path.join(FL, 'state', 'status.json'), encoding='utf-8'))
check(S['mail_mode'] == {'send': 'smtp', 'read': 'imap'} and str(S['mail']).startswith('ошибка') and str(S['itm']['mail']).startswith('ошибка'),
      'Gmail и itm@ не отвечают — в состоянии «ошибка» (не «ok»): %s / %s' % (S['mail'], S['itm']['mail']))
tl = MH.trap_log(M)
check('imaplib.IMAP4_SSL' in tl and 'smtplib.SMTP_SSL' in tl, 'участки действительно пытались войти (и получили отказ ловушки)')
it = json.load(open(os.path.join(FL, 'outbox', QID + '.json'), encoding='utf-8'))
check(it['tries'] == 1 and it['next'] > time.time() and it.get('mid') and not it.get('inflight') and not it.get('sent'),
      'письмо очереди: одна попытка, срок повтора, постоянный Message-ID, без «inflight»')
qs = json.load(open(os.path.join(FL, 'state', 'mail_q.json'), encoding='utf-8'))
check(qs.get('down_until') and qs['mode'] == 'smtp', 'связи нет — пауза отправителя (повтора через 10 минут нет)')
d = json.load(open(os.path.join(FL, 'state', 'lane_reports.json'), encoding='utf-8'))['detail']
check(d['itm']['state'] if isinstance(d.get('itm'), dict) and 'state' in d['itm'] else True, 'detail участка reports записан')
print('ALL OK', ok)
