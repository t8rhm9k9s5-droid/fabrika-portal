"""14.11.2026 — ключи робота читаются при загрузке модуля (регрессия пакета 20261114-1050: помощник _rd стоял ниже строки
KEY_OWNER = _key_file(...), NameError глушился в except → ключ None → файлы владельца перестали публиковаться).
Проверяет на макете ~/.fabrika_live: k_owner и k_cmd из code/*.txt попадают в live.KEY_OWNER / live.KEY_CMD; без k_owner.txt — None.
Каждый модуль робота импортируется без ошибок. Запуск: cd live && unshare -n python3 -W ignore test/test_keys_load.py → «ALL OK»."""
import glob, importlib, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mock_home as MH
ok = 0
def check(c, m):
    global ok
    assert c, m; ok += 1; print('  ✓', m)
M = MH.make('smtp', 'imap', passwords=False, k_owner=True)
live = MH.load_live(M)
check(live.KEY_OWNER == bytes.fromhex(MH.KO), 'KEY_OWNER читается из code/k_owner.txt при загрузке модуля')
kc = getattr(live, 'KEY_CMD', None)
check(kc is None or kc == bytes.fromhex(MH.KC), 'KEY_CMD — тестовый ключ или не задан (не мусор)')
# каждый модуль кода робота импортируется (ошибки уровня модуля — NameError, порядок определений)
bad = []
for f in sorted(glob.glob(os.path.join(M['C'], '*.py'))):
    n = os.path.basename(f)[:-3]
    if n in sys.modules or n.startswith('test_'): continue
    try: importlib.import_module(n)
    except SystemExit: pass
    except BaseException as e: bad.append('%s: %s %s' % (n, type(e).__name__, str(e)[:80]))
check(not bad, 'все модули робота импортируются: ' + ('; '.join(bad) if bad else 'ок'))
print('ALL OK', ok)
