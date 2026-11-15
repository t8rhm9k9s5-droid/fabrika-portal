"""14.11.2026 — ревью Рекса CG-10 п. 5: ночная очередь оповещений не теряется при отказе каналов.
alert_flush(): оба канала явно отказали → очередь цела, следующий проход отправляет; канал принял → очередь пуста; исход неизвестен
(таймаут MAX после отправки, почта отказала) → очередь очищена, повторной отправки нет. alert(): оба отказали → отметка снята,
повтор не глушится на 6 ч. Каналы подменены (без сети). Запуск: cd live && unshare -n python3 -W ignore test/test_alert_queue.py → «ALL OK»."""
import datetime, json, os, sys


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
MSK = live.MSK
T = [datetime.datetime(2026, 11, 13, 22, 0, tzinfo=MSK)]
live.now = lambda: T[0]
S = os.path.join(M['FL'], 'state')
mode = {'mail': 'ok (очередь)', 'max': 'ok'}
sent = []
live.mail_send = lambda subject, text, *a, **k: (sent.append(('mail', subject)), mode['mail'])[1]
live.max_send = lambda text: (sent.append(('max', text[:40])), mode['max'])[1]
def queue(): return json.loads(_rd(os.path.join(S, 'alerts_sent.json'))).get('q') or []

print('ночная очередь')
live.alert('n1', 'Фабрика: ночное 1'); live.alert('n2', 'Фабрика: ночное 2')
check(len(queue()) == 2 and not sent, 'ночью копятся две записи, ничего не ушло')
T[0] = datetime.datetime(2026, 11, 14, 8, 1, tzinfo=MSK)
mode.update(mail='почта: очередь недоступна: OSError x', max='бот MAX не подключён')
live.alert_flush()
check(len(queue()) == 2, 'оба канала явно отказали — очередь сохранена')
mode.update(mail='ok (очередь)', max='ok'); n0 = len(sent)
live.alert_flush()
check(len(queue()) == 0 and len(sent) == n0 + 2, 'следующий проход: отправлено, очередь пуста')
T[0] = datetime.datetime(2026, 11, 14, 22, 0, tzinfo=MSK)
live.alert('n3', 'Фабрика: ночное 3')
T[0] = datetime.datetime(2026, 11, 15, 8, 1, tzinfo=MSK)
mode.update(mail='почта: очередь недоступна: OSError x', max='MAX: неизвестно, ушло ли (timed out)'); n0 = len(sent)
live.alert_flush(); live.alert_flush()
check(len(queue()) == 0 and len(sent) == n0 + 2, 'исход неизвестен — очередь очищена, повторной отправки нет')

print('alert() днём')
T[0] = datetime.datetime(2026, 11, 15, 12, 0, tzinfo=MSK)
mode.update(mail='почта: очередь недоступна: OSError x', max='MAX 503')
r1 = live.alert('d1', 'Фабрика: дневное')
mode.update(mail='ok (очередь)', max='ok')
r2 = live.alert('d1', 'Фабрика: дневное, повтор')
check(not r2.startswith('повтор'), 'оба канала отказали — повтор того же ключа не глушится на 6 ч')
r3 = live.alert('d1', 'Фабрика: дневное, третье')
check(r3.startswith('повтор'), 'после успешной отправки — снова не чаще раза в 6 ч')
mode.update(mail='почта: очередь недоступна: OSError x', max='MAX: неизвестно, ушло ли (timed out)')
live.alert('d2', 'Фабрика: неизвестный исход'); mode.update(mail='ok (очередь)', max='ok')
check(live.alert('d2', 'Фабрика: неизвестный исход, повтор').startswith('повтор'), 'исход неизвестен — повтор глушится (без слепой повторной отправки)')
print('ALL OK', ok)
