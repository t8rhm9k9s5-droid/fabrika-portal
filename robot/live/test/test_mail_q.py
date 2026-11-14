"""Тест отдельной почтовой задачи mail_q.py (29.10.2026): очередь, отправщик, повторы, замок, бюджет, раскладка sent/failed."""
import base64, fcntl, importlib, json, os, re, shutil, subprocess, sys, tempfile, time as _t
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import mail_q as MQ
_CF = tempfile.mkdtemp()
def set_mode(send, read='imap'):
    p = os.path.join(_CF, 'mail_cfg.json'); json.dump({'send': send, 'read': read}, open(p, 'w')); MQ.CFG_FILE = p
set_mode('smtp')                                                   # 1–7: прежний режим (SMTP), независимо от code/mail_cfg.json

def fresh():
    d = tempfile.mkdtemp(); MQ.L = d; MQ.OUT = os.path.join(d, 'outbox'); return d

ok = 0
def check(c, msg):
    global ok
    assert c, msg; ok += 1; print('  ✓', msg)

# 1. очередь мгновенная, повтор того же письма не ставится
d = fresh()
r = MQ.enqueue('Тема', 'Текст', ['user137@example.org'], ['user133@example.org'], [('f.txt', b'123', 'text/plain')], None, 'user5@example.org')
check(r.startswith('ok'), 'enqueue → ok')
check(MQ.enqueue('Тема', 'Текст', ['user137@example.org'], ['user133@example.org']).startswith('ok (очередь, уже есть)'), 'дубль не ставится')
check(len(MQ.pending()) == 1, 'в очереди 1 письмо')

# 2. удачная отправка → sent/<день>/, вложение доходит
got = []
def send_ok(s, t, to, cc, att, html, rt, **kw): got.append((s, to, cc, att, rt)); return 'ok (test)'   # 30.10.2026 аудит P2: headers (Message-ID) передаётся всегда
res = MQ.work(send_ok)
check(res['sent'] == 1 and res['queue'] == 0, 'отправлено, очередь пуста')
check(got[0][3][0] == ('f.txt', b'123', 'text/plain') and got[0][4] == 'user5@example.org', 'вложение и reply-to переданы')
check(len(os.listdir(os.path.join(MQ.OUT, 'sent', MQ._now().strftime('%Y-%m-%d')))) == 1, 'файл письма в sent/ (не удалён)')
check(MQ.state()['sent'] == 1, 'state: sent=1')

# 3. нет связи (timed out) — повтор позже, остальные в этот запуск не трогаются
d = fresh()
for i in range(13): MQ.enqueue('Письмо %d' % i, 'т', ['user140@example.org' % i])
calls = []
def send_to(*a, **k): calls.append(1); return 'почта: itm@ 465: timed out'
res = MQ.work(send_to)
check(len(calls) == 1 and res['retry'] == 1 and res['queue'] == 13, 'нет связи: одна попытка, 13 ждут')
it = json.load(open(os.path.join(MQ.OUT, MQ.pending()[0]), encoding='utf-8'))
check(it['tries'] == 1 and it['next'] > 0, 'у письма отмечена попытка и срок повтора')
res = MQ.work(send_to)
check(len(calls) == 1 and 'пауза' in res['state'], 'связи нет — пауза 20 минут: следующий запуск не шлёт ничего')
import time as _t
res = MQ.work(send_to, clock=lambda: _t.time() + MQ.DOWN_PAUSE + 5)
check(len(calls) == 2, 'после паузы — первое письмо ждёт своего срока, пробует следующее')

# 4. срок пришёл — уходит; после 12 неудач — failed/
t = [1e12]
n13 = sum(MQ.work(send_ok, clock=lambda: t[0])['sent'] for _ in range(3))
check(n13 == 13 and not MQ.pending(), 'когда связь есть — уходят все 13 (по 5 за запуск, за 3 запуска)')
d = fresh(); MQ.enqueue('Плохое', 'т', ['user142@example.org'])
def send_bad(*a, **k): return 'почта: 550 rejected'
for k in range(12): t[0] += 10 ** 6; MQ.work(send_bad, clock=lambda: t[0])
check(len(MQ.pending()) == 0 and len(os.listdir(os.path.join(MQ.OUT, 'failed'))) == 1, '12 неудач → failed/ (не удалено)')
check(MQ.state()['failed_total'] == 1 and 'rejected' in MQ.state()['last_err'], 'state: ошибка видна')

# 5. бюджет времени
d = fresh()
for i in range(5): MQ.enqueue('Б%d' % i, 'т', ['user143@example.org' % i])
tt = [0]
def send_slow(*a, **k): tt[0] += 200; return 'ok'
def send_slow50(*a, **k): tt[0] += 50; return 'ok'
res = MQ.work(send_slow50, clock=lambda: tt[0])
check(res['sent'] == 3 and res['queue'] == 2, 'бюджет 120 с: за запуск 3 письма по 50 с, 2 — в следующий')
d = fresh()
for i in range(8): MQ.enqueue('П%d' % i, 'т', ['user144@example.org' % i])
res = MQ.work(send_ok)
check(res['sent'] == 5 and res['queue'] == 3, 'не больше 5 писем за запуск — остальные через 10 минут')
d = fresh(); MQ.enqueue('Ош', 'т', ['user145@example.org']); MQ.enqueue('Ош2', 'т', ['user146@example.org'])
cnt = []
def send_conn(*a, **k): cnt.append(1); return 'почта: itm@ 465: Connection unexpectedly closed; gmail: [Errno 111] Connection refused'
res = MQ.work(send_conn)
check(len(cnt) == 1 and MQ.state().get('down_until') and 'Connection' in MQ.state()['last_err'], 'обрыв связи (не только timed out) — пауза, ошибка видна в состоянии')

# 5б. письмо зависло — не дольше SEND_LIMIT, дальше пауза
d = fresh(); MQ.enqueue('Зав', 'т', ['user147@example.org']); MQ.enqueue('Зав2', 'т', ['user148@example.org'])
import time as _tm
MQ.SEND_LIMIT = 1
def send_hang(*a, **k): _tm.sleep(5); return 'ok'
t0 = _tm.time(); res = MQ.work(send_hang)
check(_tm.time() - t0 < 4 and res['sent'] == 0 and MQ.state().get('down_until') and 'timeout' in MQ.state()['last_err'], 'зависшее письмо — не дольше лимита, пауза, ошибка «timeout» видна')
MQ.SEND_LIMIT = 150

# 6. замок: второй отправщик сразу выходит
import fcntl
lk = open(os.path.join(MQ.OUT, 'mail.lock'), 'w'); fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
check(MQ.work(send_ok).get('state') == 'уже работает', 'замок: второй экземпляр не работает')
lk.close()

# 7. spawn — только когда есть что слать
d = fresh()
check(MQ.spawn() is False, 'пусто — отправщик не запускается')

# 8. 29.10.2026, send="bot" (code/mail_cfg.json; «убери почту с хостинга»): без SMTP и сети — очередь → st/mo.bin, подтверждения бота
check(MQ.mode() == {'send': 'smtp', 'read': 'imap'}, 'режим smtp/imap из файла')
MQ.CFG_FILE = os.path.join(_CF, 'нет.json'); check(MQ.mode() == {'send': 'smtp', 'read': 'imap'}, 'нет файла — как раньше (smtp, imap)')
open(os.path.join(_CF, 'bad.json'), 'w').write('{битый'); MQ.CFG_FILE = os.path.join(_CF, 'bad.json')
check(MQ.mode() == {'send': 'smtp', 'read': 'imap'}, 'файл не читается — как раньше')
set_mode('bot', 'gas'); check(MQ.send_bot() and MQ.read_gas(), 'send=bot, read=gas')
NET = []
class Net(BaseException): pass
def _net(*a, **k): NET.append(a[:1]); raise Net()
import smtplib, socket
smtplib.SMTP = smtplib.SMTP_SSL = _net; socket.create_connection = _net; socket.socket.connect = _net
pub = {}
def publish(name, obj): pub[name] = json.loads(json.dumps(obj))
d = fresh()
big = os.urandom(MQ.MO_ATT_MAX + 10)
MQ.enqueue('Ответ', 'Текст', ['Сотрудник14 <user9@example.org>'], ['user149@example.org'], [('a.pdf', b'%PDF-1', 'application/pdf')], '<p>h</p>', 'user5@example.org',
           headers={'In-Reply-To': '<m1@x>', 'References': '<m0@x> <m1@x>', 'Message-ID': '<user150@example.org>', 'X-Fabrika-Draft': 'itm-assistant-sent'},
           from_name='Сотрудник2 Сотрудник1', meta={'kind': 'itm-reply'})
_t.sleep(1.1); MQ.enqueue('Большое', 'т', ['user133@example.org'], None, [('big1.bin', big[:len(big) // 2]), ('big2.bin', big[len(big) // 2:])])
# 30.10.2026 DESIGN 14: письмо с вложениями > 200 КБ, которое ещё не отдавалось боту, теперь остаётся хостингу (SMTP) — здесь проверяется
# прежний путь «уже у бота» (bot_t стоит: отдано до 30.10) — вложения больше 8 МБ не передаются; новое правило — test_audit_mail.py
_pb = os.path.join(MQ.OUT, sorted(MQ.pending())[-1]); _ib = json.load(open(_pb, encoding='utf-8')); _ib['bot_t'] = _t.time() - 60; json.dump(_ib, open(_pb, 'w'))
_t.sleep(1.1); MQ.enqueue('Без адреса', 'т', [])
ids = [f[:-5] for f in MQ.pending()]
res = MQ.bot_work(publish, ['user151@example.org'])
mo = pub.get('mo.bin') or {}
check(mo.get('v') == 1 and re.match(r'^\d{4}-\d\d-\d\dT\d\d:\d\d$', mo.get('t') or '') and [i['id'] for i in mo['items']] == ids, 'mo.bin: v=1, t, items — id = имя файла очереди без .json')
a, b, c = mo['items']
check(set(a) == {'id', 'q', 'subject', 'text', 'html', 'to', 'cc', 'reply_to', 'headers', 'from_name', 'att'}, 'поля элемента — по спецификации')
check(a['headers'] == {'In-Reply-To': '<m1@x>', 'References': '<m0@x> <m1@x>', 'Message-ID': '<user150@example.org>'} and a['from_name'] == 'Сотрудник2 Сотрудник1'
      and a['reply_to'] == 'user5@example.org' and a['html'] == '<p>h</p>' and a['cc'] == ['user149@example.org'], 'заголовки цепочки (без служебных), имя, Reply-To, html, копия')
check(a['att'] == [{'name': 'a.pdf', 'mime': 'application/pdf', 'b64': base64.b64encode(b'%PDF-1').decode()}] and 'att_skipped' not in a, 'вложение — name, mime, b64')
check(b['att'] == [] and b['att_skipped'] == ['big1.bin', 'big2.bin'], 'вложения больше 8 МБ всего — без них, att_skipped: имена')
check(c['to'] == ['user151@example.org'] and c['headers'] is None and c['html'] is None, 'нет адресата — cfg.json alert_to (как у SMTP); нет заголовков — null')
check(res['given'] == 3 and res['queue'] == 3 and not NET, 'отдано боту 3, в очереди 3 — ни SMTP, ни сети')
check(all(json.load(open(os.path.join(MQ.OUT, f), encoding='utf-8')).get('bot_t') for f in MQ.pending()), 'у писем отмечено, когда отданы боту')
check(MQ.state()['mode'] == 'bot' and MQ.state()['bot']['given'] == 3 and MQ.state()['bot']['att_skipped'] == 1, 'state: режим bot, отдано 3, без вложений 1')
# подтверждения: done → sent/<день>/, fail → повтор позже, повтор подтверждения и мусор — без ошибок
ad = os.path.join(MQ.OUT, 'acks'); os.makedirs(ad)
json.dump({'id': ids[0], 'ok': 1, 't': 1}, open(os.path.join(ad, ids[0] + '.json'), 'w'))
json.dump({'id': ids[1], 'err': 'Gmail: Service invoked too many times', 't': 1}, open(os.path.join(ad, ids[1] + '.json'), 'w'))
json.dump({'id': 'zzz', 'ok': 1}, open(os.path.join(ad, 'zzz.json'), 'w'))
open(os.path.join(ad, 'broken.json'), 'w').write('{')
res = MQ.bot_work(publish, ['user151@example.org'])
day = MQ._now().strftime('%Y-%m-%d')
sent = json.load(open(os.path.join(MQ.OUT, 'sent', day, ids[0] + '.json'), encoding='utf-8'))
check(res['done'] == 1 and sent['via'] == 'ok (бот, Gmail)' and sent.get('meta') == {'kind': 'itm-reply'}, 'подтверждено ботом → sent/<день>/, «ok (бот, Gmail)», meta письма сохранена')
it1 = json.load(open(os.path.join(MQ.OUT, ids[1] + '.json'), encoding='utf-8'))
check(res['fail'] == 1 and it1['tries'] == 1 and it1['next'] > _t.time() + 500 and 'too many' in it1['err'][-1], 'неудача бота → tries=1, повтор через 10 минут')
check([i['id'] for i in pub['mo.bin']['items']] == [ids[2]] and res['wait'] == 1, 'в mo.bin — только письмо без ошибки; неудачное ждёт срока')
check(res['unknown'] == 1 and os.path.isdir(os.path.join(ad, 'bad')) and not [f for f in os.listdir(ad) if f.endswith('.json')], 'чужой id и испорченный файл — разобраны без ошибок (в done/ и bad/)')
check(MQ.state()['sent'] == 1 and 'too many' in MQ.state()['last_err'], 'state: отправлено 1, ошибка бота видна')
# 12 неудач → failed/
tt = [_t.time()]
for k in range(MQ.MAX_TRIES - 1):
    tt[0] += 10 ** 5
    json.dump({'id': ids[1], 'err': 'Gmail: ошибка %d' % k}, open(os.path.join(ad, ids[1] + '.json'), 'w'))
    MQ.bot_work(publish, None, clock=lambda: tt[0])
check(os.path.exists(os.path.join(MQ.OUT, 'failed', ids[1] + '.json')) and ids[1] + '.json' not in MQ.pending(), '12 неудач бота → failed/ (не удалено)')
check(MQ.state()['failed_total'] == 1, 'state: failed_total=1')
# старое без подтверждения не держит очередь; предел размера mo.bin
d = fresh()
for i in range(3): MQ.enqueue('Р%d' % i, 'x' * 1000, ['user152@example.org' % i]); _t.sleep(1.1)
ids = [f[:-5] for f in MQ.pending()]
MQ.bot_work(publish, None)
p0 = os.path.join(MQ.OUT, ids[0] + '.json'); it0 = json.load(open(p0, encoding='utf-8')); it0['bot_t'] -= MQ.MO_OLD + 60
json.dump(it0, open(p0, 'w'))
res = MQ.bot_work(publish, None)
check([i['id'] for i in pub['mo.bin']['items']] == ids[1:] + ids[:1] and res['old'] == 1, 'отдано больше часа назад без подтверждения — в конец, в состоянии «без подтверждения»')
cap = MQ.MO_CAP; MQ.MO_CAP = 2000
res = MQ.bot_work(publish, None); MQ.MO_CAP = cap
check(len(pub['mo.bin']['items']) == 1 and MQ.state()['bot']['rest'] == 2, 'предел размера mo.bin: остальные — в следующий прогон')
d = fresh(); res = MQ.bot_work(publish, None)
check(pub['mo.bin']['items'] == [] and res['queue'] == 0, 'пустая очередь — items []')
# письмо, которое хостинг не смог отправить по SMTP (почта с хостинга закрыта), — боту сразу и с полными 12 попытками
MQ.enqueue('Старое SMTP', 'т', ['user153@example.org']); f0 = MQ.pending()[0]; p0 = os.path.join(MQ.OUT, f0)
it0 = json.load(open(p0, encoding='utf-8')); it0.update({'tries': 5, 'next': _t.time() + 3600, 'err': ['itm@ 465: Connection unexpectedly closed']}); json.dump(it0, open(p0, 'w'))
res = MQ.bot_work(publish, None); it0 = json.load(open(p0, encoding='utf-8'))
check(res['given'] == 1 and res['wait'] == 0 and it0['tries'] == 0 and it0['smtp_tries'] == 5 and it0['next'] == 0, 'неудачи SMTP хостинга боту не в счёт: отдано сразу, попытки с нуля')
d = fresh(); os.makedirs(MQ.OUT)
lk = open(os.path.join(MQ.OUT, 'mail.lock'), 'w'); fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
check(MQ.bot_work(publish, None).get('state') == 'уже работает', 'замок общий с SMTP-отправщиком: занят — бот-участок ждёт')
lk.close()
MQ.enqueue('С', 'т', ['user130@example.org'])
check(MQ.spawn() is False, 'send=bot — SMTP-отправщик не запускается')
# «python3 mail_q.py» (старый фоновый запуск) при send=bot сразу выходит: live (SMTP) даже не импортируется — рядом его нет, иначе упал бы
md = tempfile.mkdtemp(); shutil.copy(os.path.join(HERE, 'mail_q.py'), md); json.dump({'send': 'bot', 'read': 'gas'}, open(os.path.join(md, 'mail_cfg.json'), 'w'))
r = subprocess.run([sys.executable, '-W', 'ignore', os.path.join(md, 'mail_q.py')], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
check(r.returncode == 0 and not os.path.exists(os.path.join(os.path.dirname(md), 'outbox', 'sent')), 'python3 mail_q.py при send=bot — выход без отправки')
check(not NET, 'ни одного обращения к SMTP и сети за все шаги send=bot')
print('ALL OK', ok)
