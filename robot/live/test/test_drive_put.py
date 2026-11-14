"""Тест drive_put.py (29.10.2026): файл сайта → Диск 1c@ один раз; нет файла / ошибка Диска — не отмечается сделанным."""
import json, os, sys, tempfile
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, HERE)
import drive_put as DP, gdrive_1c as GD
L, SITE = tempfile.mkdtemp(), tempfile.mkdtemp(); os.makedirs(os.path.join(SITE, 'st'))
open(os.path.join(SITE, 'st', 'exp_x.bin'), 'w').write('T14B1.abc')
jobs = [{'id': 'x', 'src': 'st/exp_x.bin', 'name': 'exp_x.bin', 'sub': 'Выгрузки'}, {'id': 'y', 'src': 'st/nope.bin'}, {'id': 'z', 'src': '../etc/passwd'}]
DP.HERE = tempfile.mkdtemp(); json.dump(jobs, open(os.path.join(DP.HERE, 'drive_put.json'), 'w'))
calls, store = [], {}
GD.put_file = lambda L_, name, data, mime='application/octet-stream', sub=None: calls.append((name, data, sub)) or {'ok': True, 'id': 'F1'}
jl = lambda n, d: store.get(n, d); js = lambda n, v: store.__setitem__(n, v)
r = DP.run(L, SITE, lambda *a: None, jl, js)
assert calls == [('exp_x.bin', b'T14B1.abc', 'Выгрузки')], calls; print('  ✓ файл ушёл на Диск в «Выгрузки»')
assert 'x' in store['drive_put.json']['done'] and 'y' not in store['drive_put.json']['done'] and 'z' not in store['drive_put.json']['done']; print('  ✓ нет файла и «..» — не отмечены сделанными')
DP.run(L, SITE, lambda *a: None, jl, js); assert len(calls) == 1; print('  ✓ повторно не отправляет')
GD.put_file = lambda *a, **k: {'ok': False, 'err': 'quota'}
jobs.append({'id': 'w', 'src': 'st/exp_x.bin'}); json.dump(jobs, open(os.path.join(DP.HERE, 'drive_put.json'), 'w'))
r = DP.run(L, SITE, lambda *a: None, jl, js); assert 'w' not in store['drive_put.json']['done'] and 'quota' in r['err']; print('  ✓ ошибка Диска — повтор в следующий раз')
print('ALL OK')
