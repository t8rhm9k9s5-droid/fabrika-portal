"""Тест отправки ответов itm@ (29.10.2026): ответ, выбранный владельцем (send=1), уходит через очередь с itm@ — в той же цепочке,
от имени владельца, только через itm@; копия — в «Отправленные», если Mail.ru её не сохранил; без send — по-прежнему черновик."""
import email, email.policy, json, os, re, shutil, smtplib, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, HERE)
import itm as IT, mail_q as MQ
ok = 0
def check(c, m):
    global ok; assert c, m; ok += 1; print('  ✓', m)
L = tempfile.mkdtemp(); MQ.L = L; MQ.OUT = os.path.join(L, 'outbox')
req = {'id': 'abcdef123456', 'f': 'user9@example.org', 'to_name': 'Сотрудник14 Сотрудник6', 's': 'Согласие на оплату', 'mid': '<user134@example.org>', 'refs': '<user135@example.org>',
       't': '2026-10-29T10:41', 'n': 'Сотрудник14 Сотрудник6', 'x': 'Прошу согласовать оплату счёта № Д9298 на 8 400 руб.', 'ox': 'Прошу согласовать оплату счёта № Д9298 на 8 400 руб.'}
d = {'id': 'abcdef123456', 'text': 'Согласовываю оплату.\n\nС уважением,\nСотрудник2 Сотрудник1', 'send': 1}
r = IT.send_reply('user5@example.org', 'Сотрудник2 Сотрудник1', d, req)
check(r.startswith('ok') and len(MQ.pending()) == 1, 'ответ поставлен в очередь')
it = json.load(open(os.path.join(MQ.OUT, MQ.pending()[0]), encoding='utf-8'))
check(it['subject'] == 'Re: Согласие на оплату' and it['headers']['In-Reply-To'] == '<user134@example.org>' and '<user135@example.org> <user134@example.org>' == it['headers']['References'], 'тема Re:, In-Reply-To, References — та же цепочка')
check(it['from_name'] == 'Сотрудник2 Сотрудник1' and it['to'][0].endswith('<user9@example.org>'), 'от имени владельца, адресат — автор письма')
check('Согласовываю оплату' in it['text'] and '> Прошу согласовать' in it['text'], 'текст + цитата исходного письма')
# отправка: live._smtp_send в макете хостинга — только itm@, заголовки на месте
# 30.10.2026 (аудит): макет — test/mock_home.py (без app_build и fabrika), режим smtp/imap — как сейчас в работе; пароль только itm@
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_home as MH
MK = MH.make('smtp', 'imap', passwords=False); T, FL = MK['T'], MK['FL']
open(os.path.join(FL, 'itm_app_password'), 'w').write('test-pass')
code = r'''
import json, smtplib, sys, live
sent = []
class S:
    def __init__(self, *a, **k): pass
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def login(self, u, p): sent.append(('login', u))
    def send_message(self, m): sent.append(('msg', m))
    def starttls(self, **k): pass
smtplib.SMTP_SSL = S; smtplib.SMTP = S
it = json.load(open(sys.argv[1], encoding='utf-8'))
r = live._smtp_send(it['subject'], it['text'], it['to'], None, [], None, None, headers=it['headers'], from_name=it['from_name'])
m = [x[1] for x in sent if x[0] == 'msg'][0]
print(json.dumps({'r': r, 'from': m['From'], 'irt': m['In-Reply-To'], 'mid': m['Message-ID'], 'login': [x[1] for x in sent if x[0] == 'login']}, ensure_ascii=False))
# itm@ не работает — ответ НЕ уходит через Gmail / sendmail
class Bad(S):
    def login(self, u, p): raise smtplib.SMTPAuthenticationError(535, b'no')
smtplib.SMTP_SSL = Bad; smtplib.SMTP = Bad
print(json.dumps({'r2': live._smtp_send('t', 'x', ['user128@example.org'], from_name='Сотрудник2 Сотрудник1')}, ensure_ascii=False))
# send=bot — _smtp_send к SMTP не обращается вовсе
json.dump({'send': 'bot', 'read': 'gas'}, open('mail_cfg.json', 'w')); sent.clear(); smtplib.SMTP_SSL = S; smtplib.SMTP = S
print(json.dumps({'r3': live._smtp_send('t', 'x', ['user128@example.org'], from_name='Сотрудник2 Сотрудник1'), 'n': len(sent)}, ensure_ascii=False))
'''
out = subprocess.run([sys.executable, '-W', 'ignore', '-c', code, os.path.join(MQ.OUT, MQ.pending()[0])], cwd=os.path.join(FL, 'code'), stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
lines = [json.loads(l) for l in out.stdout.strip().splitlines()] if out.returncode == 0 else []
check(lines and lines[0]['r'].startswith('ok (itm@') and 'Сотрудник2 Сотрудник1' in lines[0]['from'] and 'user5@example.org' in lines[0]['from'], 'ушло с itm@ от имени «Сотрудник2 Сотрудник1» ' + (out.stderr[-300:] if out.returncode else ''))
check(lines[0]['irt'] == '<user134@example.org>' and lines[0]['mid'] == it['headers']['Message-ID'], 'In-Reply-To и Message-ID в отправленном письме')
check(lines[1]['r2'].startswith('почта:') and 'gmail' not in lines[1]['r2'], 'нет связи с itm@ — не уходит через Gmail/sendmail, повтор позже')
check(lines[2]['r3'].startswith('почта: отключено') and lines[2]['n'] == 0, 'send=bot: _smtp_send не трогает SMTP (письма шлёт скрипт бота)')
# очередь отправляет → файл в sent/ с meta → копия в «Отправленные»
def fake_send(*a, **k): return 'ok (itm@ 465)'
res = MQ.work(fake_send); check(res['sent'] == 1, 'отправщик отправил')
class FakeM:
    def __init__(self, have): self.have = have; self.app = []
    def select(self, box, readonly=False): return 'OK', [b'1']
    def search(self, cs, *a): return 'OK', [b'5' if self.have else b'']
    def append(self, box, fl, dt, raw): self.app.append((box, fl, raw)); return 'OK', [b'']
fl = [('INBOX', 'Входящие', ''), ('&BB4EQgQ,BEAEMAQyBDsENQQ9BD0ESwQ1-', 'Отправленные', '\\sent')]
st = {}; M1 = FakeM(False); n = IT.copy_sent(M1, fl, L, st, 'user5@example.org', 'Сотрудник2 Сотрудник1', lambda *a: None)
msg = email.message_from_bytes(M1.app[0][2], policy=email.policy.default) if M1.app else None
check(n == 1 and msg['Message-ID'] == it['headers']['Message-ID'] and msg['Subject'] == 'Re: Согласие на оплату', 'копия в «Отправленные» с тем же Message-ID')
n2 = IT.copy_sent(FakeM(False), fl, L, st, 'user5@example.org', 'Сотрудник2 Сотрудник1', lambda *a: None)
check(n2 == 0, 'второй раз не копирует')
st2 = {}; M3 = FakeM(True); n3 = IT.copy_sent(M3, fl, L, st2, 'user5@example.org', 'Сотрудник2 Сотрудник1', lambda *a: None)
check(n3 == 0 and not M3.app, 'Mail.ru уже сохранил (нашёлся Message-ID) — не дублирует')
# черновик, созданный ботом раньше, — отправка по списку из пакета (сам черновик не трогается)
draft = IT.make_draft('user5@example.org', 'Сотрудник2 Сотрудник1', {'text': 'Согласовываю оплату счёта № Д9298.'}, dict(req, s='счет и УПД № Д9298 от 26 октября 2026 г. на сумму 8 400,00 руб.'))
class FakeD:
    def __init__(self): self.app = []
    def select(self, box, readonly=False): self.ro = readonly; return 'OK', [b'1']
    def uid(self, cmd, *a):
        if cmd == 'search': return 'OK', [b'7 8']
        if cmd == 'fetch': return 'OK', [(b'7 (BODY[] {1}', draft if a[0] == b'8' else IT.make_draft('user5@example.org', 'T', {'text': 'другое'}, dict(req, f='user127@example.org', s='Иное')))]
    def append(self, *a): self.app.append(a); return 'OK', [b'']
fld = [('Drafts', 'Черновики', '\\drafts')]
jobs = [{'id': 'trausch-d9298-2026-10-29', 'subject_has': 'Д9298', 'to': 'user9@example.org'}]
jp = os.path.join(HERE, 'itm_send_drafts.json'); had = os.path.exists(jp); keep = open(jp, encoding='utf-8').read() if had else None
json.dump(jobs, open(jp, 'w', encoding='utf-8'), ensure_ascii=False)
try:
    st3 = {}; FD = FakeD(); before = len(MQ.pending())
    n4 = IT.send_old_drafts(FD, fld, L, st3, 'user5@example.org', 'Сотрудник2 Сотрудник1', lambda *a: None)
    q = [json.load(open(os.path.join(MQ.OUT, f), encoding='utf-8')) for f in MQ.pending()]
    check(n4 == 1 and len(q) == before + 1 and 'Д9298' in q[-1]['subject'] and q[-1]['headers'].get('In-Reply-To') == '<user134@example.org>' and FD.ro and not FD.app, 'старый черновик Д9298 поставлен на отправку, ящик только для чтения, черновик не тронут')
    check(IT.send_old_drafts(FakeD(), fld, L, st3, 'user5@example.org', 'Сотрудник2 Сотрудник1', lambda *a: None) == 0, 'повторно не отправляет')
finally:
    if had: open(jp, 'w', encoding='utf-8').write(keep)
    else: os.remove(jp)
print('ALL OK', ok)
