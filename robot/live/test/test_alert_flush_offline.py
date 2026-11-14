"""CG-11: isolated alert functions, artificial queues, no live imports or network.
Run: python3 robot/live/test/test_alert_flush_offline.py
"""
import ast
import datetime
import fcntl
import json
import multiprocessing
import os
import tempfile
import time
import unittest

SOURCE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'live.py')
with open(SOURCE, encoding='utf-8') as f:
    TREE = ast.parse(f.read(), filename=SOURCE)
NAMES = {'_jread', '_jwrite', '_alerts_io', '_quiet', '_alert_outcome', '_alert_send',
         'alert', 'alert_flush', '_alert_flush_locked'}
TREE.body = [n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in NAMES]
CODE = compile(TREE, SOURCE, 'exec')


def harness(state):
    ns = dict(os=os, json=json, fcntl=fcntl, time=time, STATE=state, ALERT_EVERY=21600,
              now=lambda: datetime.datetime(2026, 11, 14, 9),
              iso=lambda t: t.isoformat(), log=lambda *a: None)
    exec(CODE, ns)
    ns['mail_send'] = lambda *a: 'ok (очередь)'
    ns['max_send'] = lambda *a: 'бот MAX не подключён'
    return ns


def concurrent_worker(state, entered, release, count):
    ns = harness(state)
    def send(*args):
        with count.get_lock(): count.value += 1
        entered.set()
        if not release.wait(5): raise RuntimeError('test timeout')
        return 'ok (очередь)'
    ns['mail_send'] = send
    ns['alert_flush']()


class FlushTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='cg11_alerts_')
        self.ns = harness(self.tmp.name)
        self.path = os.path.join(self.tmp.name, 'alerts_sent.json')
        self.reset([self.entry(0)])

    def tearDown(self): self.tmp.cleanup()

    def entry(self, n, size=1500):
        return {'t': '2026-11-14T02:00', 'key': str(n), 'text': ('ITEM%02d ' % n) + 'x' * (size - 7)}

    def reset(self, entries): self.ns['_jwrite'](self.path, {'k': {}, 'q': entries})
    def state(self): return self.ns['_jread'](self.path)

    def test_success(self):
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], [])

    def test_explicit_failure_and_cooldown(self):
        self.ns['mail_send'] = lambda *a: 'почта: очередь недоступна'
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], [self.entry(0)])
        self.ns['alert']('critical', 'artificial test', True)
        self.assertNotIn('critical', self.state()['k'])

    def test_unknown_preserves_no_blind_retry_semantics(self):
        self.ns['mail_send'] = lambda *a: 'неизвестно: таймаут'
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], [])

    def test_long_queue_max_only_receives_whole_entries(self):
        original = [self.entry(i) for i in range(20)]
        self.reset(original)
        sent = []
        self.ns['mail_send'] = lambda *a: 'почта: очередь недоступна'
        self.ns['max_send'] = lambda text: sent.append(text) or 'ok'
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], original[2:])
        while self.state()['q']: self.ns['alert_flush']()
        self.assertEqual(len(sent), 10)
        for msg in sent: self.assertLessEqual(len(msg), 3990)
        for x in original:
            self.assertEqual(sum(x['text'] in msg for msg in sent), 1)

    def test_added_identical_entry_is_not_removed(self):
        entry = self.entry(0)
        def send(*args):
            self.ns['_alerts_io'](lambda state: state['q'].append(dict(entry)))
            return 'ok (очередь)'
        self.ns['mail_send'] = send
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], [entry])

    def test_added_different_entry_is_not_removed(self):
        def send(*args):
            self.ns['_alerts_io'](lambda state: state['q'].append(self.entry(1)))
            return 'ok (очередь)'
        self.ns['mail_send'] = send
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], [self.entry(1)])

    def test_oversized_malformed_entry_is_not_lost(self):
        entry = self.entry(0, 5000)
        self.reset([entry])
        calls = []
        self.ns['mail_send'] = lambda *a: calls.append(a) or 'ok'
        self.ns['alert_flush']()
        self.assertEqual(calls, [])
        self.assertEqual(self.state()['q'], [entry])

    def test_quiet_hours(self):
        self.ns['now'] = lambda: datetime.datetime(2026, 11, 14, 3)
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], [self.entry(0)])

    def test_lock_released_after_send_exception(self):
        def fail(*args): raise RuntimeError('artificial exception')
        self.ns['mail_send'] = fail
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], [self.entry(0)])
        self.ns['mail_send'] = lambda *a: 'ok'
        self.ns['alert_flush']()
        self.assertEqual(self.state()['q'], [])

    def test_concurrent_processes_do_not_duplicate(self):
        ctx = multiprocessing.get_context('fork')
        entered, release, count = ctx.Event(), ctx.Event(), ctx.Value('i', 0)
        p = ctx.Process(target=concurrent_worker, args=(self.tmp.name, entered, release, count))
        p.start()
        try:
            self.assertTrue(entered.wait(5))
            calls = []
            self.ns['mail_send'] = lambda *a: calls.append(a) or 'ok'
            self.ns['alert_flush']()
            self.assertEqual(calls, [])
            self.assertEqual(count.value, 1)
        finally:
            release.set(); p.join(5)
            if p.is_alive(): p.terminate(); p.join()
        self.assertEqual(p.exitcode, 0)
        self.assertEqual(self.state()['q'], [])


if __name__ == '__main__':
    # формат проверки перед выкладкой (ci/predeploy_check.sh): код 0 и последняя строка «ALL OK N»
    import sys
    r = unittest.TextTestRunner(verbosity=1).run(unittest.defaultTestLoader.loadTestsFromTestCase(FlushTests))
    sys.stdout.flush()
    if not r.wasSuccessful(): sys.exit(1)
    print('ALL OK', r.testsRun)
