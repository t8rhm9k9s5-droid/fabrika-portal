"""Тест «почта без хостинга» (29.10.2026, пользователь: «убери почту с хостинга работай напрямую через gmail и mail.ru»; спецификация —
fabrika/notes/mail_via_gmail.md): code/mail_cfg.json {"send": "bot", "read": "gas"}.
  • read="gas": ни один блок не открывает IMAP (imaplib, smtplib и сокеты подменены — вызов валит тест), каждый пишет «отключено: почта через Gmail»;
    ответ владельца из бота (send=1) по-прежнему встаёт в очередь; письмо от бота (inbox_gas) разбирается ТЕМ ЖЕ ingest_message, что письмо
    из imap.gmail.com (те же отчёт, дата и mid), и уходит в inbox_gas/done/<день>/; пакет обновления из Gmail — с проверкой подписи;
  • st/in.php и st/mo.php (php из контейнера): подпись k_cmd, метка времени, id, дубли; подтверждения бота разбирает mail_q.bot_work.
Собирает макет ~/.fabrika_live во временной папке из файлов drive_pack.CODE (ключи — тестовые).
30.10.2026 (аудит): макет — test/mock_home.py (без app_build и fabrika); в пакете кода сейчас mail_cfg.json = smtp/imap (работает сейчас),
поэтому режим bot/gas задаётся здесь явно, а в конце — короткая проверка режима smtp/imap (IMAP «недоступен» — ошибки, а не «отключено»).
Пакет из Gmail подписан v2 (DESIGN 8); PHP st/in.php и st/mo.php — из эталона orig/ (только чтение)."""
import base64, hashlib, hmac, json, os, re, shutil, subprocess, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_home as MH
ok = 0
def check(c, m):
    global ok
    assert c, m; ok += 1; print('  ✓', m)

M = MH.make('bot', 'gas')                                           # пароли есть — IMAP всё равно не трогается; 1c@ читается и в gas (29.10), поэтому без пароля 1c@
T, FL, C = M['T'], M['FL'], M['C']
KC, KO, KD = MH.KC, MH.KO, MH.KD
check(json.load(open(os.path.join(C, 'mail_cfg.json'), encoding='utf-8'))['send'] == 'bot', 'режим в макете: send=bot, read=gas')
GALV_F = os.path.join(T, 'galv.pdf'); open(GALV_F, 'wb').write(b'%PDF-1.4 test galv')

inner = r'''
import base64, email, email.utils, hashlib, hmac, json, os, sys, time
TRAP = []
class Trap(BaseException): pass
def trap(name):
    def f(*a, **k): TRAP.append(name); raise Trap(name)
    return f
import imaplib, smtplib, socket
imaplib.IMAP4_SSL = trap('imaplib.IMAP4_SSL'); imaplib.IMAP4 = trap('imaplib.IMAP4')
smtplib.SMTP = trap('smtplib.SMTP'); smtplib.SMTP_SSL = trap('smtplib.SMTP_SSL')
socket.create_connection = trap('socket.create_connection'); socket.socket.connect = trap('socket.connect')
import live, mail_q as MQ, itm as IT, itm_arch as IA, itm_sort as IS, itm_ytd as IY, unans as UA, sales_rep as SR, mail_pkg as MKP, mail_cmd as MC
R = {}
R['mode'] = MQ.mode()
R['fetch'] = live.fetch_mail({})
R['smtp'] = live._smtp_send('t', 'x', ['user128@example.org'])
# itm@: ответ владельца из бота (send=1) — в очередь; черновик без send — ждёт; IMAP не открывается
st = {'folders': {}, 'notes': [], 'ddone': [], 'dreq': {
    'aaaaaaaaaaa1': {'id': 'aaaaaaaaaaa1', 't': time.strftime('%Y-%m-%dT%H:%M'), 'f': 'user9@example.org', 'n': 'Сотрудник14 Сотрудник6', 'to_name': 'Сотрудник14 Сотрудник6', 's': 'Оплата', 'mid': '<user129@example.org>', 'refs': '', 'x': 'Прошу согласовать', 'ox': 'Прошу согласовать'},
    'aaaaaaaaaaa2': {'id': 'aaaaaaaaaaa2', 't': time.strftime('%Y-%m-%dT%H:%M'), 'f': 'user33@example.org', 'n': 'Л', 'to_name': 'Л', 's': 'Вопрос', 'mid': '<user138@example.org>', 'refs': '', 'x': 'Когда?', 'ox': 'Когда?'}}}
live.jsave('itm.json', st)
din = os.path.join(live.L, 'drafts', 'in'); os.makedirs(din)
json.dump({'id': 'aaaaaaaaaaa1', 'text': 'Согласовываю.', 'send': 1}, open(os.path.join(din, 'aaaaaaaaaaa1.json'), 'w'))
json.dump({'id': 'aaaaaaaaaaa2', 'text': 'Черновик', 'send': 0}, open(os.path.join(din, 'aaaaaaaaaaa2.json'), 'w'))
R['itm'] = IT.run(live.L, live.CFG, lambda raw: [], live.log, live.jload, live.jsave, live.publish)
R['din'] = sorted(os.listdir(din)); R['queue'] = [json.load(open(os.path.join(MQ.OUT, f), encoding='utf-8')) for f in MQ.pending()]
R['arch'] = IA.run(live.L, live.CFG, lambda raw: [], live.log, live.jload, live.jsave)
R['arch_1c'] = IA.run_1c(live.L, live.CFG, lambda raw: [], live.log, live.jload, live.jsave)
R['sort'] = IS.run(live.L, live.CFG, live.log, live.jload, live.jsave)
R['ytd'] = IY.run(live.L, live.CFG, live.IG, live.BO, live.OUTD, live.log, live.jload, live.jsave, live.publish)
R['unans'] = UA.mail(live.L, live.CFG, UA.work_days(UA._now().date(), 2), live.log)[0]
res = {}; SR.mail_part(live.L, live.CFG, {}, res); R['sales'] = res
R['pkg_run'] = MKP.run(live.L, live.CFG, live.log, live.jload, live.jsave)
MC._cfg = lambda: {'people': [{'name': 'Т', 'emails': ['user128@example.org']}], 'gas': 'https://example.invalid/x'}
MC._mx_key = lambda L: 'k'; MC._replies = lambda *a: 0
R['mail_cmd'] = MC.run(live.L, live.CFG, live.log, live.jload, live.jsave, live.mail_send, '')   # 1c@ без пароля: IMAP 1c@ в режиме gas открывается (29.10), в тесте сети нет
# письмо из Gmail: как его отдаёт IMAP (RFC 822) и как его приносит бот (inbox_gas) — один и тот же разбор
from email.message import EmailMessage
galv = open(sys.argv[1], 'rb').read()
m = EmailMessage(); m['From'] = 'Экономист <user15@example.org>'; m['To'] = 'user5@example.org'; m['Subject'] = 'Гальваника ОКТЯБРЬ 2026'
m['Date'] = 'Tue, 27 Oct 2026 08:50:00 +0300'; m['Message-ID'] = '<user136@example.org>'; m.set_content('Отчёт во вложении')
m.add_attachment(galv, maintype='application', subtype='pdf', filename='Гальваника ОКТЯБРЬ 2026.pdf')
recv1 = []; R['imap_got'] = live.ingest_message(m.as_bytes(), recv1)
gi = live.GAS_IN; os.makedirs(gi, exist_ok=True)
J = {'id': 'REDACTED_HEX_8', 'msgid': '<user136@example.org>', 'from': 'Экономист <user15@example.org>', 'to': 'user5@example.org',
     'subject': 'Гальваника ОКТЯБРЬ 2026', 'date': 'Tue, 27 Oct 2026 08:50:00 +0300', 'text': 'Отчёт во вложении',
     'att': [{'name': 'Гальваника ОКТЯБРЬ 2026.pdf', 'mime': 'application/pdf', 'b64': base64.b64encode(galv).decode()}]}
json.dump(J, open(os.path.join(gi, J['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
open(os.path.join(gi, 'badjson1.json'), 'w').write('{не json')
# пакет обновления письмом через бота — подпись k_deploy; второй — с чужой подписью
pk = b'T14Z1' + os.urandom(64); nm = 'fabrikant-update-20261029-1700.pkg'
import deploy as DP
sig = DP.sig_v2(bytes.fromhex(live.CFG['k_deploy']), nm, pk)          # 30.10.2026: подпись v2 (DESIGN 8)
def pkg_letter(i, name, s):
    return {'id': i, 'msgid': '<%s@x>' % i, 'from': 'user4@example.org', 'to': 'user5@example.org', 'subject': 'Фабрика: пакет ' + name,
            'date': email.utils.formatdate(), 'text': '', 'att': [{'name': name, 'mime': 'application/octet-stream', 'b64': base64.b64encode(pk).decode()},
                                                                 {'name': name[:-4] + '.sig', 'mime': 'text/plain', 'b64': base64.b64encode(s.encode()).decode()}]}
json.dump(pkg_letter('pkgok1', nm, sig), open(os.path.join(gi, 'pkgok1.json'), 'w'))
json.dump(pkg_letter('pkgbad1', 'fabrikant-update-20261029-1701.pkg', '00' * 32), open(os.path.join(gi, 'pkgbad1.json'), 'w'))
recv2 = []; R['gas'] = live.gas_inbox(recv2)
R['recv1'] = [[r['k'], r['date'], r['mid']] for r in recv1]; R['recv2'] = [[r['k'], r['date'], r['mid']] for r in recv2]
R['gas_left'] = sorted(f for f in os.listdir(gi) if f.endswith('.json'))
R['gas_done'] = sorted(os.listdir(os.path.join(gi, 'done', live.now().strftime('%Y-%m-%d'))))
R['gas_bad'] = sorted(os.listdir(os.path.join(gi, 'bad')))
R['inbox'] = sorted(os.listdir(os.path.join(live.L, 'inbox')))
R['pkg_sha'] = hashlib.sha256(open(os.path.join(live.L, 'inbox', nm), 'rb').read()).hexdigest() == hashlib.sha256(pk).hexdigest()
R['trap'] = TRAP
print(json.dumps(R, ensure_ascii=False, default=str))
'''
r = subprocess.run([sys.executable, '-W', 'ignore', '-c', inner, GALV_F], cwd=C, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
assert r.returncode == 0, r.stderr[-1500:]
R = json.loads(r.stdout.strip().splitlines()[-1])
OFF = 'отключено: почта через Gmail'
check(R['mode'] == {'send': 'bot', 'read': 'gas'}, 'режим из code/mail_cfg.json: bot / gas')
check(R['trap'] == [], 'ни imaplib, ни smtplib, ни сокетов — ни одного вызова (пароли при этом лежат)')
check(R['fetch'] == [[], OFF], 'Gmail (live.fetch_mail): ' + OFF)
check(R['smtp'].startswith('почта: отключено'), '_smtp_send при send=bot — без сети: «отключено»')
check(R['itm']['mail'] == OFF and R['itm'].get('sent') == 1 and R['itm'].get('drafts_wait') == 1, 'itm@: «отключено», ответ владельца (send=1) — в очередь, черновик ждёт')
check(R['din'] == ['aaaaaaaaaaa2.json'], 'черновик без send не потерян — лежит в drafts/in')
q = R['queue']
check(len(q) == 1 and q[0]['headers']['In-Reply-To'] == '<user129@example.org>' and q[0]['from_name'] == 'Сотрудник2 Сотрудник1' and q[0]['subject'] == 'Re: Оплата', 'ответ в той же цепочке (In-Reply-To), от имени владельца')
for k in ('arch', 'ytd'): check(R[k].get('state') == OFF, '%s: %s' % (k, OFF))
check(R['arch_1c'].get('state') != OFF, 'ящик 1c@ (Gmail Workspace) читается и в режиме gas — данные для сайта')
check(R['sort'].get('state') == OFF, 'раскладка itm@ (itm_sort): ' + OFF)
check(R['unans'].get('mail') == OFF, 'вопросы без ответа — почта: ' + OFF)
check(R['sales'].get('mail') == OFF, 'продажи — письма офисов: ' + OFF)
check(R['pkg_run'].get('state', '').startswith(OFF), 'пакеты по почте (IMAP itm@): ' + OFF)
check(R['mail_cmd'].get('state') != OFF, 'письма-команды на 1c@ читаются и в режиме gas')
check(R['imap_got'] and R['recv1'] and R['recv1'] == R['recv2'] and R['recv2'][0][0] == 'galv', 'письмо от бота разобрано тем же ingest_message: тот же отчёт, дата и mid, что из IMAP')
check(R['gas']['new'] == 3 and R['gas']['reports'] == 1 and R['gas']['bad'] == 1 and R['gas']['left'] == 0, 'inbox_gas: 3 письма, 1 отчёт, 1 испорченный файл')
check(R['gas_left'] == [] and '18f2a0c3b4d5e6f7.json' in R['gas_done'] and R['gas_bad'] == ['badjson1.json'], 'разобранные — в inbox_gas/done/<день>/, испорченный — в bad/ (ничего не удалено)')
check(R['gas']['pkg'] == 1 and R['pkg_sha'] and 'fabrikant-update-20261029-1700.sig' in R['inbox'] and 'fabrikant-update-20261029-1701.pkg' not in R['inbox'],
      'пакет из Gmail — принят по подписи k_deploy, с чужой подписью — нет')

# REDACTED_B64_10 PHP: st/in.php и st/mo.php (эталон orig/, только чтение)
H = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(MH.HERE))), 'orig', '4 Хостинг — точки для скрипта и сайта')
WR = os.path.join(T, 'wrap.php')
open(WR, 'w').write('<?php\n$_SERVER["REQUEST_METHOD"] = "POST"; $a = json_decode(file_get_contents($argv[1]), true);\n'
                    '$_POST = $a["post"]; if (isset($a["cl"])) $_SERVER["CONTENT_LENGTH"] = $a["cl"];\ninclude $argv[2];\n')
def php(f, post, cl=None):
    pj = os.path.join(T, 'post.json'); json.dump({'post': post, 'cl': cl} if cl else {'post': post}, open(pj, 'w'), ensure_ascii=False)
    r = subprocess.run(['php', WR, pj, os.path.join(H, f)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=dict(os.environ, FABRIKA_HOME=T), universal_newlines=True)
    assert r.returncode == 0, r.stderr[-500:]
    return r.stdout.strip()
def sig_in(t, d, k=KC): return hmac.new(bytes.fromhex(k), ('in:%d:%s' % (t, hashlib.sha256(d.encode('utf-8')).hexdigest())).encode(), hashlib.sha256).hexdigest()
def sig_mo(t, d, k=KC): return hmac.new(bytes.fromhex(k), ('mo:%d:' % t).encode() + d.encode('utf-8'), hashlib.sha256).hexdigest()
gi = os.path.join(FL, 'inbox_gas')
d = json.dumps({'id': 'abc123DEF_-9', 'msgid': '<user139@example.org>', 'from': 'user29@example.org', 'to': 'user5@example.org', 'subject': 'Отчет 28.10.2026г.',
                'date': 'Wed, 28 Oct 2026 09:10:00 +0300', 'text': 'т', 'att': []}, ensure_ascii=False)
t = int(time.time())
check(php('st_in.php', {'t': t, 'd': d, 's': sig_in(t, d)}) == 'ok', 'st/in.php: верная подпись — «ok»')
p = os.path.join(gi, 'abc123DEF_-9.json')
check(os.path.exists(p) and open(p, encoding='utf-8').read() == d and (os.stat(p).st_mode & 0o777) == 0o600, 'письмо записано как есть в inbox_gas/<id>.json, права 0600')
d2 = d.replace('"т"', '"другой текст"')
check(php('st_in.php', {'t': t, 'd': d2, 's': sig_in(t, d2)}) == 'ok' and open(p, encoding='utf-8').read() == d, 'дубль — «ok», файл не перезаписан')
check(php('st_in.php', {'t': t, 'd': d, 's': sig_in(t, d, '11' * 32)}) == 'no', 'подпись ключом k_live (не k_cmd) — 403')
check(php('st_in.php', {'t': t - 700, 'd': d, 's': sig_in(t - 700, d)}) == 'no', 'метка времени старше 10 минут — 403')
d3 = json.dumps({'id': '../x', 'att': []}); check(php('st_in.php', {'t': t, 'd': d3, 's': sig_in(t, d3)}) == 'bad', 'id с «../» — отказ, ничего не пишется')
check(php('st_in.php', {}, cl=30000000) == 'too big', 'тело больше post_max_size (пустой $_POST) — «too big», а не «подпись»')
check(sorted(f for f in os.listdir(gi) if f.endswith('.json')) == ['abc123DEF_-9.json'], 'в inbox_gas — только принятое письмо')
code2 = 'import live; r = []; print(live.gas_inbox(r)["new"], len(r))'
r2 = subprocess.run([sys.executable, '-W', 'ignore', '-c', code2], cwd=C, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
check(r2.returncode == 0 and r2.stdout.split()[0] == '1', 'письмо от st/in.php разбирает участок reports (gas_inbox)')
dd = json.dumps({'id': 'abc123DEF_-9'}); check(php('st_in.php', {'t': t, 'd': dd, 's': sig_in(t, dd)}) == 'ok' and not os.path.exists(p), 'уже разобранное (inbox_gas/done) — «ok», заново не пишется')

# st/mo.php → outbox/acks → mail_q.bot_work
code3 = r'''
import json, time, mail_q as MQ
before = set(MQ.pending())
for i in range(3): MQ.enqueue("Письмо %d" % i, "т", ["user140@example.org" % i]); time.sleep(1.1)
print(json.dumps(sorted(f[:-5] for f in set(MQ.pending()) - before)))
'''
r3 = subprocess.run([sys.executable, '-W', 'ignore', '-c', code3], cwd=C, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
ids = json.loads(r3.stdout)                                            # три новых письма; в очереди ещё ответ владельца из шага выше
check(len(ids) == 3, 'в очереди 3 новых письма (и ответ владельца)')
ack = json.dumps({'done': [ids[0], '../evil', '..'], 'fail': [{'id': ids[1], 'err': 'Gmail: лимит, адрес user141@example.org'}, {'id': ids[0], 'err': 'не затирать'}]}, ensure_ascii=False)
check(php('st_mo.php', {'t': t, 'd': ack, 's': sig_mo(t, ack)}) == 'ok', 'st/mo.php: верная подпись — «ok»')
ad = os.path.join(FL, 'outbox', 'acks')
check(sorted(os.listdir(ad)) == sorted([ids[0] + '.json', ids[1] + '.json']), 'acks/<id>.json — только допустимые id (без «../», «..»)')
a0 = json.load(open(os.path.join(ad, ids[0] + '.json'), encoding='utf-8'))
check(a0.get('ok') == 1 and 'err' not in a0, '«отправлено» не затирается неудачей того же id')
check(php('st_mo.php', {'t': t, 'd': ack, 's': sig_mo(t, ack, '11' * 32)}) == 'no' and php('st_mo.php', {'t': t - 700, 'd': ack, 's': sig_mo(t - 700, ack)}) == 'no',
      'st/mo.php: чужой ключ или старая метка — 403')
code4 = r'''
import json, live, mail_q as MQ
res = MQ.bot_work(live.publish, ['user5@example.org'], live.log)
print(json.dumps({'res': res, 'pending': [f[:-5] for f in MQ.pending()], 'st': MQ.state()}, ensure_ascii=False))
'''
r4 = subprocess.run([sys.executable, '-W', 'ignore', '-c', code4], cwd=C, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
assert r4.returncode == 0, r4.stderr[-800:]
R4 = json.loads(r4.stdout)
sent_d = os.path.join(FL, 'outbox', 'sent', time.strftime('%Y-%m-%d', time.gmtime(time.time() + 3 * 3600)))
check(R4['res']['done'] == 1 and os.path.exists(os.path.join(sent_d, ids[0] + '.json')) and ids[0] not in R4['pending'], 'подтверждение бота → письмо в outbox/sent/<день>/')
it1 = json.load(open(os.path.join(FL, 'outbox', ids[1] + '.json'), encoding='utf-8'))
check(R4['res']['fail'] == 1 and it1['tries'] == 1 and it1['next'] > time.time() and 'лимит' in it1['err'][-1], 'неудача бота → попытка отмечена, повтор позже')
check('[адрес]' in R4['st']['last_err'] and 'user141@example.org' not in json.dumps(R4['st'], ensure_ascii=False), 'в состоянии (портал) ошибка без адресов')
check(R4['res']['given'] == 2 and R4['res']['wait'] == 1 and R4['st']['bot']['given'] == 2 and R4['st']['mode'] == 'bot', 'в mo.bin — 2 письма (ответ владельца и третье), с ошибкой ждёт срока')
check(not [f for f in os.listdir(ad) if f.endswith('.json')] and len(os.listdir(os.path.join(ad, 'done', time.strftime('%Y-%m-%d', time.gmtime(time.time() + 3 * 3600))))) == 2,
      'подтверждения разобраны — в acks/done/<день>/ (не удалены)')

# REDACTED_B64_10 30.10.2026: режим smtp/imap (работает сейчас) — IMAP «недоступен»
M2 = MH.make('smtp', 'imap')
inner2 = r'''
import json, imaplib, smtplib, socket
CALLS = []
def refused(name):
    def f(*a, **k): CALLS.append(name); raise ConnectionRefusedError(111, 'refused (ловушка)')
    return f
imaplib.IMAP4_SSL = refused('imaplib.IMAP4_SSL'); smtplib.SMTP = smtplib.SMTP_SSL = refused('smtplib')
socket.create_connection = refused('socket'); socket.socket.connect = refused('socket.connect')
import live, mail_q as MQ, itm as IT
R = {'mode': MQ.mode()}
try: R['fetch'] = live.fetch_mail({})
except Exception as e: R['fetch'] = 'исключение %s' % e.__class__.__name__
try: R['itm'] = IT.run(live.L, live.CFG, lambda raw: [], live.log, live.jload, live.jsave, live.publish)
except Exception as e: R['itm'] = 'исключение %s' % e.__class__.__name__
R['smtp'] = live._smtp_send('t', 'x', ['user128@example.org'])
R['calls'] = CALLS
print(json.dumps(R, ensure_ascii=False, default=str))
'''
r = subprocess.run([sys.executable, '-W', 'ignore', '-c', inner2], cwd=M2['C'], stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
assert r.returncode == 0, r.stderr[-1200:]
R2 = json.loads(r.stdout.strip().splitlines()[-1])
check(R2['mode'] == {'send': 'smtp', 'read': 'imap'}, 'режим smtp/imap (как сейчас в работе)')
check(R2['fetch'] == 'исключение ConnectionRefusedError' and R2['itm'] == 'исключение ConnectionRefusedError',
      'IMAP Gmail и itm@ недоступны — исключение (участок пишет «ошибка», не «отключено»)')
check(R2['smtp'].startswith('почта:') and 'itm@ 465' in R2['smtp'] and 'gmail' in R2['smtp'] and 'неизвестно' not in R2['smtp'],
      'SMTP недоступен до отправки — цепочка идёт дальше (itm@ 465 → 587 → Gmail), результат «не ушло», не «неизвестно»')
check(os.path.exists(os.path.join(M2['FL'], 'itm_imap.lock')), 'аудит P17: вход в itm@ — через общий замок itm_imap.lock')
print('ALL OK', ok)
