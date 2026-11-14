"""14.11.2026 — ключи робота читаются при загрузке модуля (регрессия пакета 20261114-1050: помощник _rd стоял ниже строки
KEY_OWNER = _key_file(...), NameError глушился в except → ключ None → файлы владельца перестали публиковаться).
Ревью Рекса CG-10 п. 6: каждый сценарий — в отдельном процессе, точные ожидания:
  1) есть k_owner.txt и k_cmd.txt → live.KEY_OWNER и max_move.kcmd() (ключ k_cmd) — ровно тестовые ключи;
  2) нет k_owner.txt → KEY_OWNER is None, k_cmd по-прежнему читается;
  3) каждый модуль робота импортируется без исключений (SystemExit — тоже ошибка).
Запуск: cd live && unshare -n python3 -W ignore test/test_keys_load.py → «ALL OK»."""
import os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ok = 0
def check(c, m):
    global ok
    assert c, m; ok += 1; print('  ✓', m)

CHILD = r'''
import glob, importlib, json, os, sys
sys.path.insert(0, %(here)r)
import mock_home as MH
M = MH.make('smtp', 'imap', passwords=False, k_owner=%(own)s)
live = MH.load_live(M)
out = {'owner': live.KEY_OWNER.hex() if live.KEY_OWNER else None,
       'KO': MH.KO, 'KC': MH.KC, 'bad': []}
import max_move
kc = max_move.kcmd(M['C']); out['cmd'] = kc.hex() if kc else None
if %(mods)s:
    for f in sorted(glob.glob(os.path.join(M['C'], '*.py'))):
        n = os.path.basename(f)[:-3]
        if n in sys.modules or n.startswith('test_'): continue
        try: importlib.import_module(n)
        except BaseException as e: out['bad'].append('%%s: %%s %%s' %% (n, type(e).__name__, str(e)[:80]))
print('RESULT ' + json.dumps(out))
'''
def run(own, mods):
    p = subprocess.run([sys.executable, '-W', 'ignore', '-c', CHILD % {'here': HERE, 'own': own, 'mods': mods}],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True, timeout=120)
    line = [l for l in p.stdout.splitlines() if l.startswith('RESULT ')]
    assert p.returncode == 0 and line, 'процесс проверки упал (код %s): %s' % (p.returncode, p.stdout[-400:])
    import json
    return json.loads(line[-1][7:])

r = run(True, True)
check(r['owner'] == r['KO'], 'k_owner.txt есть → KEY_OWNER — ровно тестовый ключ')
check(r['cmd'] == r['KC'], 'k_cmd.txt есть → max_move.kcmd() — ровно тестовый ключ')
check(not r['bad'], 'все модули робота импортируются: ' + ('; '.join(r['bad']) if r['bad'] else 'ок'))
r = run(False, False)
check(r['owner'] is None, 'нет k_owner.txt → KEY_OWNER is None (файлы владельца не публикуются)')
check(r['cmd'] == r['KC'], 'нет k_owner.txt → k_cmd по-прежнему читается')
print('ALL OK', ok)
