"""30.10.2026 аудит — повторы писем и сообщений (P1, P2, P3, P10, DESIGN 14). Без сети: SMTP, IMAP и HTTP — поддельные объекты.
Запуск: cd live && unshare -n python3 -W ignore test/test_audit_mail.py → «ALL OK»."""
import base64, datetime, json, os, smtplib, socket, sys, threading, time, urllib.error, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_home as MH
ok = 0
def check(c, m):
    global ok
    assert c, m; ok += 1; print('  ✓', m)

M = MH.make('smtp', 'imap', passwords=False)
open(os.path.join(M['FL'], 'itm_app_password'), 'w').write('test-pass')
live = MH.load_live(M)
import mail_q as MQ, mx_ctl as MC, importlib
REAL_MAX_SEND = live.max_send
MSK = live.MSK

# REDACTED_B64_9 P1: кривой элемент поручения и повторы по id
print('P1 — письма по поручению (code/mail_out*.json)')
C = M['C']
good = [{'id': 'a1', 'subject': 'Письмо 1', 'text': 'т1', 'to': ['user127@example.org']}, 'мусор', {'id': 'a2', 'text': 'нет темы'},
        {'id': 7, 'subject': 'Число как id', 'text': 'т7', 'to': ['user127@example.org']}, {'id': 'a3', 'subject': 'Письмо 3', 'text': 'т3', 'to': ['user127@example.org']}]
json.dump(good, open(os.path.join(C, 'mail_out.json'), 'w'), ensure_ascii=False)
json.dump([{'id': 'a1', 'subject': 'Письмо 1 (копия в другом файле)', 'text': 'т1б', 'to': ['user127@example.org']}], open(os.path.join(C, 'mail_out_dup.json'), 'w'), ensure_ascii=False)
live.now = lambda: datetime.datetime(2026, 10, 30, 10, 0, tzinfo=MSK)
REC = MH.Rec(); live.max_send = REC.max_send                      # оповещения в MAX — запоминаем (почта — настоящая очередь макета)
_work = MQ.work; MQ.work = lambda *a, **k: {'state': 'не в этом тесте'}   # отправщик здесь не нужен: проверяется постановка в очередь
st = live.lane_mail()
q = [json.load(open(os.path.join(MQ.OUT, f), encoding='utf-8')) for f in MQ.pending()]
subj = sorted(x['subject'] for x in q if not x['subject'].startswith('Фабрика:'))
check(subj == ['Письмо 1', 'Письмо 3', 'Число как id'], 'кривые элементы пропущены, остальные письма поставлены: %s' % subj)
ms = json.load(open(os.path.join(M['FL'], 'state', 'mail_out.json'), encoding='utf-8'))
check(sorted(ms['sent']) == ['7', 'a1', 'a3'] and st['mail_out']['bad'] == 2, 'отметки сохранены (id-число — строкой), ошибочных 2')
aq = [json.load(open(os.path.join(MQ.OUT, f), encoding='utf-8')) for f in MQ.pending()]
check(any('элемент' in x['text'] for x in aq if x['subject'].startswith('Фабрика:')) and any('элемент' in t for t in REC.max),
      'аудит P12: владельцу — письмо (через очередь) и MAX о кривых элементах')
for _ in range(3): live.lane_mail()
q2 = [f for f in MQ.pending()]
check(len([1 for f in q2 if not json.load(open(os.path.join(MQ.OUT, f), encoding='utf-8'))['subject'].startswith('Фабрика:')]) == 3, '3 прогона подряд — ни одного повторного письма (id в двух файлах — одно письмо)')
for f in MQ.pending(): os.remove(os.path.join(MQ.OUT, f))
json.dump([], open(os.path.join(C, 'mail_out.json'), 'w')); os.remove(os.path.join(C, 'mail_out_dup.json'))
MQ.work = _work

# REDACTED_B64_9 P3: цепочка SMTP останавливается после send_message
print('P3 — цепочка SMTP')
log = []
class FakeSMTP:
    mode = {}
    def __init__(self, host, port, timeout=None, context=None): self.port = 'gmail' if 'gmail' in host else port; log.append(('connect', self.port))
    def starttls(self, **k): pass
    def login(self, u, p):
        if FakeSMTP.mode.get(self.port) == 'login': raise smtplib.SMTPAuthenticationError(535, b'auth')
    def send_message(self, m):
        x = FakeSMTP.mode.get(self.port)
        log.append(('send', self.port, m['Message-ID']))
        if x == 'drop': raise smtplib.SMTPServerDisconnected('Connection unexpectedly closed')
        if x == 'data': raise smtplib.SMTPDataError(554, b'rejected')
    def quit(self):
        log.append(('quit', self.port))
        if FakeSMTP.mode.get('quit'): raise smtplib.SMTPServerDisconnected('closed on QUIT')
    def close(self): log.append(('close', self.port))
smtplib.SMTP_SSL = FakeSMTP; smtplib.SMTP = FakeSMTP
open(os.path.join(M['FL'], 'gmail_app_password'), 'w').write('g-pass')
FakeSMTP.mode = {'quit': True}; log.clear()
r = live._smtp_send('Тема', 'Текст', ['user128@example.org'], headers={'Message-ID': '<user129@example.org>'})
check(r == 'ok (itm@ 465)' and [x for x in log if x[0] == 'send'] == [('send', 465, '<user129@example.org>')],
      'QUIT упал после удачной отправки — «ok», 587 и Gmail не пробуются (было: второе письмо): %s' % r)
FakeSMTP.mode = {465: 'drop'}; log.clear()
r = live._smtp_send('Тема', 'Текст', ['user128@example.org'])
check(r.startswith(MQ.UNKNOWN) and [x[1] for x in log if x[0] == 'send'] == [465], 'обрыв ВО ВРЕМЯ отправки — «неизвестно», следующий сервер не пробуется')
FakeSMTP.mode = {465: 'login'}; log.clear()
r = live._smtp_send('Тема', 'Текст', ['user128@example.org'])
check(r == 'ok (itm@ 587)' and [x[1] for x in log if x[0] == 'send'] == [587], 'отказ входа на 465 (письмо не отправлялось) — дальше 587')
FakeSMTP.mode = {465: 'data', 587: 'data'}; log.clear()
r = live._smtp_send('Тема', 'Текст', ['user128@example.org'])
check(r == 'ok (gmail)' and [x[1] for x in log if x[0] == 'send'] == [465, 587, 'gmail'], 'явный отказ сервера (554) — письмо не принято, можно следующий путь: %s' % r)
FakeSMTP.mode = {465: 'data', 587: 'data'}; log.clear()
r = live._smtp_send('Тема', 'Текст', ['user128@example.org'], from_name='Сотрудник2 Сотрудник1')
check(r.startswith('почта:') and not [x for x in log if x[0] == 'send' and x[1] not in (465, 587)], 'ответ от имени владельца — только itm@ (не Gmail)')

# REDACTED_B64_9 P2: таймаут — «неизвестно», без немедленного повтора
print('P2 — предел времени письма и постоянный Message-ID')
sent = []
def send_slow(subject, text, to, cc, att, html, rt, headers=None, from_name=None):
    sent.append(headers.get('Message-ID')); time.sleep(3); return 'ok (itm@ 465)'
MQ.enqueue('Долгое', 'т', ['user130@example.org'])
f0 = MQ.pending()[0]; mid = json.load(open(os.path.join(MQ.OUT, f0), encoding='utf-8'))['mid']
check(mid.startswith('<') and mid.endswith('@fabrikant.su>'), 'у письма при постановке — постоянный Message-ID %s' % mid)
lim = MQ.SEND_LIMIT; MQ.SEND_LIMIT = 1
t = [time.time()]
res = MQ.work(send_slow, clock=lambda: t[0], budget=1)              # бюджет кончился — поток не дожидаемся
it = json.load(open(os.path.join(MQ.OUT, f0), encoding='utf-8'))
check(res.get('unknown') == 1 and it['unknown'] == 1 and it['next'] >= t[0] + MQ.UNKNOWN_PAUSE - 1 and not it.get('inflight'),
      'дольше предела — «неизвестно»: не «не ушло», повтор не раньше чем через час')
t[0] += 600; res = MQ.work(send_slow, clock=lambda: t[0] + 0)
check(len(sent) == 1, 'через 10 и 20 минут — НЕ отправляется повторно (было: до 12 копий)')
time.sleep(2.5)
t[0] += MQ.UNKNOWN_PAUSE + MQ.DOWN_PAUSE; MQ.SEND_LIMIT = 10
res = MQ.work(send_slow, clock=lambda: t[0])
check(res['sent'] == 1 and sent == [mid, mid], 'после паузы — повтор с ТЕМ ЖЕ Message-ID (получатель и «Отправленные» узнают повтор)')
MQ.SEND_LIMIT = 1
MQ.enqueue('Ушло позже предела', 'т', ['user131@example.org']); f1 = [f for f in MQ.pending()][0]
def send_late(*a, **k): time.sleep(1.5); return 'ok (itm@ 465)'
res = MQ.work(send_late)
check(res['sent'] == 1 and not MQ.pending(), 'поток дописал письмо после предела, пока участок работает, — отмечено отправленным (повтора не будет)')
MQ.SEND_LIMIT = lim
# процесс оборвался посреди отправки (kill) — отметка inflight → «неизвестно»
_s = MQ.state(); _s.pop('down_until', None); MQ._save_state(_s)    # пауза «нет связи» от прошлых шагов — снять
MQ.enqueue('Оборвано', 'т', ['user132@example.org']); f2 = MQ.pending()[0]; p2 = os.path.join(MQ.OUT, f2)
it = json.load(open(p2, encoding='utf-8')); it['inflight'] = time.time() - 30; json.dump(it, open(p2, 'w'))
calls = []
res = MQ.work(lambda *a, **k: calls.append(1) or 'ok')
it = json.load(open(p2, encoding='utf-8'))
check(not calls and it['unknown'] == 1 and not it.get('inflight'), 'попытка оборвалась вместе с процессом — «неизвестно», без немедленного повтора')
it['next'] = 0; json.dump(it, open(p2, 'w'))
_s = MQ.state(); _s.pop('down_until', None); MQ._save_state(_s)
MQ.SEND_LIMIT = 1
res = MQ.work(lambda *a, **k: time.sleep(2) or 'ok', budget=1)
MQ.SEND_LIMIT = lim
check(res['failed'] == 1 and os.path.exists(os.path.join(MQ.OUT, 'failed', f2)) and res['failed_list'] and 'Отправленные' in res['failed_list'][0]['why'],
      'второй раз «неизвестно» — в failed/ с причиной для владельца (проверить «Отправленные»)')
REC2 = MH.Rec().hook(live)
live._mail_alerts({'mail_q': res})
check(REC2.mail and 'НЕ отправлено' in REC2.mail[0][0] + REC2.mail[0][1], 'аудит P12: письмо в failed/ — оповещение владельцу')

# REDACTED_B64_9 DESIGN 14: send=bot — большие вложения остаются SMTP
print('DESIGN 14 — send=bot: вложения > 200 КБ — хостинг (SMTP)')
json.dump({'send': 'bot', 'read': 'imap'}, open(os.path.join(C, 'mail_cfg.json'), 'w'))
for f in MQ.pending(): os.remove(os.path.join(MQ.OUT, f))
MQ.enqueue('Маленькое', 'т', ['user130@example.org'], None, [('a.pdf', b'%PDF' * 100, 'application/pdf')]); time.sleep(1.1)
MQ.enqueue('Большое', 'т', ['user133@example.org'], None, [('big.pdf', os.urandom(MQ.BIG_ATT + 10), 'application/pdf')])
pub = {}
live.publish = lambda n, o: pub.__setitem__(n, json.loads(json.dumps(o)))
FakeSMTP.mode = {}; log.clear()
_s = MQ.state(); _s.pop('down_until', None); MQ._save_state(_s)
st = live.lane_mail()
items = [i['subject'] for i in pub['mo.bin']['items']]
check(items == ['Маленькое'] and st['mail_q'].get('smtp_big') == 1, 'в st/mo.bin для бота — только письмо ≤ 200 КБ')
check(st.get('mail_q_smtp', {}).get('sent') == 1 and [x[1] for x in log if x[0] == 'send'] == [465], 'письмо > 200 КБ ушло SMTP itm@ (гибрид)')
check(len(MQ.pending()) == 1 and json.load(open(os.path.join(MQ.OUT, MQ.pending()[0]), encoding='utf-8'))['subject'] == 'Маленькое', 'в очереди осталось только письмо, отданное боту')
r = live._smtp_send('t', 'x', ['user128@example.org'])
check(r.startswith('почта: отключено'), 'send=bot без гибридного флага — _smtp_send по-прежнему «отключено»')
json.dump({'send': 'smtp', 'read': 'imap'}, open(os.path.join(C, 'mail_cfg.json'), 'w'))

# REDACTED_B64_9 P10: второй адрес MAX — только при отказе соединения
print('P10 — MAX: второй адрес только если не подключились')
calls = []
class Resp:
    status = 200
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def read(self): return b'{"message": {"body": {"mid": "m1"}}}'
def mk(behaviour):
    def urlopen(rq, timeout=None, context=None):
        calls.append(rq.full_url.split('/')[2]); b = behaviour.pop(0)
        if b == 'refused': raise urllib.error.URLError(ConnectionRefusedError(111, 'refused'))
        if b == 'timeout': raise socket.timeout('timed out')
        return Resp()
    return urlopen
mx = os.path.join(os.path.dirname(M['FL']), '.fabrika_max'); os.makedirs(mx, exist_ok=True)
json.dump({'token': 't', 'owner': {'user_id': 5}}, open(os.path.join(mx, 'config.json'), 'w'))
urllib.request.urlopen = mk(['timeout', 'ok']); calls.clear()
real_max_send = REAL_MAX_SEND
r = real_max_send('текст')
check(len(calls) == 1 and 'неизвестно' in r, 'live.max_send: таймаут после отправки — второй адрес НЕ пробуется (не будет двойного сообщения)')
urllib.request.urlopen = mk(['refused', 'ok']); calls.clear()
r = real_max_send('текст')
check(calls == ['platform-api2.max.ru', 'platform-api.max.ru'] and r == 'ok', 'не подключились к первому — второй адрес')
urllib.request.urlopen = mk(['timeout', 'ok']); calls.clear()
code, j = MC.api('t', 'POST', '/messages', {'chat_id': 1}, {'text': 'x'})
check(len(calls) == 1 and code == 0, 'mx_ctl.api POST: таймаут — без повтора на второй адрес')
urllib.request.urlopen = mk(['timeout', 'ok']); calls.clear()
code, j = MC.api('t', 'GET', '/messages', {'chat_id': 1})
check(len(calls) == 2 and code == 200, 'mx_ctl.api GET (без побочных действий): таймаут — второй адрес можно')
print('ALL OK', ok)
