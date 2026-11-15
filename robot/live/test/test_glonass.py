"""Тест glonass.py (29.10.2026): ключ, вход и кэш токена, повторный вход, 401/503 при входе, где сейчас, рейсы, стоянки, геозоны,
частоты, пароль нигде не виден. Без сети."""
import datetime, json, os, sys, tempfile, time


def _rd(*a, **k):   # CodeQL py/file-not-closed: файл закрывается сразу (15.11.2026)
    with open(*a, **k) as _f:
        return _f.read()


def _wr(_d, *a, **k):
    with open(*a, **k) as _f:
        return _f.write(_d)


sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import glonass as GL
PW = 'Sekr3t-Pa$$'
calls, ok = [], 0
def check(c, m):
    global ok; assert c, m; ok += 1; print('  ✓', m)
d = tempfile.mkdtemp(); os.makedirs(os.path.join(d, 'state'))
store, pub, logs = {}, {}, []
jl = lambda n, dflt: json.loads(json.dumps(store[n])) if n in store else dflt
js = lambda n, v: store.__setitem__(n, json.loads(json.dumps(v)))
pb = lambda n, o: pub.__setitem__(n, json.loads(json.dumps(o)))
iso = lambda x: x.strftime('%Y-%m-%dT%H:%M')
run = lambda: GL.run(d, lambda *a: logs.append(' '.join(map(str, a))), jl, js, pb, iso)
MODE = {'login': 'ok', 'expire_once': False}
today = datetime.datetime.now(GL.MSK).date().strftime('%Y-%m-%d')
def call(method, params, timeout=25):
    calls.append((method, timeout))
    if method == 'Login':
        assert params['UTCOffset'] == 180 and params['Password'] == PW
        if MODE['login'] == '401': raise GL.GlonassError('Login: HTTP 401 ', 401)
        if MODE['login'] == '503': raise GL.GlonassError('Login: HTTP 503 upstream connect error ?Password=' + PW, 503)
        return 'TOKEN-abcdef-123456'
    assert params.get('session') == 'TOKEN-abcdef-123456', params
    if MODE['expire_once']: MODE['expire_once'] = False; raise GL.GlonassError(method + ': HTTP 401 ', 401)
    if method == 'EnumSchemas': return [{'ID': 'S1', 'Name': 'Фабрикант'}]
    if method == 'EnumDevices': return {'Groups': [{'ID': 'G', 'Name': 'Грузовые'}], 'Items': [
        {'ID': 'D1', 'ParentID': 'G', 'Name': 'ГАЗель', 'Properties': [{'Name': 'VRN', 'Value': 'А123ВС62'}]},
        {'ID': 'D2', 'ParentID': 'G', 'Name': 'Фура', 'Properties': []}]}
    if method == 'EnumGeoFences': return [{'ID': 'Z1', 'Name': 'Клиент «Ромашка»'}, {'ID': 'Z2', 'Name': 'Рязань'}]
    if method == 'GetGeofences': return {'Z1': {'Name': 'Клиент «Ромашка»', 'Points': [{'Lat': 54.60, 'Lng': 39.70}, {'Lat': 54.60, 'Lng': 39.71}, {'Lat': 54.61, 'Lng': 39.71}, {'Lat': 54.61, 'Lng': 39.70}]},
                                         'Z2': {'Name': 'Рязань', 'Points': [{'Lat': 54.5, 'Lng': 39.5}, {'Lat': 54.5, 'Lng': 39.9}, {'Lat': 54.7, 'Lng': 39.9}, {'Lat': 54.7, 'Lng': 39.5}]}}
    if method == 'GetOnlineInfoAll': return {'D1': {'ID': 'D1', 'Name': 'ГАЗель', 'LastPosition': {'Lat': 54.62, 'Lng': 39.74}, 'DTLocal': today + 'T15:58:00', 'Speed': 54.5, 'State': 2, 'Address': 'Рязань, Московское ш.'},
                                             'D2': {'ID': 'D2', 'Name': 'Фура', 'LastPosition': {'Lat': 54.65, 'Lng': 39.6}, 'DT': today + 'T12:50:00Z', 'Speed': 0, 'State': 1}}
    if method == 'GetTrips':
        day = params['SD'][:8]; dd = day[:4] + '-' + day[4:6] + '-' + day[6:8]
        return {'D1': {'ID': 'D1', 'Name': 'ГАЗель', 'VRN': 'А123ВС62', 'Total': {'TotalDistance': 182.4, 'MoveDuration': '04:12:00', 'ParkingDuration': '02:00:00'},
                       'Trips': [{'Index': 0, 'SD': dd + 'T08:00:00', 'ED': dd + 'T10:05:00', 'PointEnd': {'Lat': 54.605, 'Lng': 39.705, 'Address': 'ул. Цветочная, 1'}},
                                 {'Index': 1, 'SD': dd + 'T11:10:00', 'ED': dd + 'T12:00:00', 'PointEnd': {'Lat': 54.65, 'Lng': 39.75}},
                                 {'Index': 2, 'SD': dd + 'T12:03:00', 'ED': dd + 'T14:00:00'}]},
                'D2': {'ID': 'D2', 'Name': 'Фура', 'Total': {'Пробег, км': '410,2', 'Время в движении': '7:30'}, 'Trips': []}}
    raise AssertionError(method)
GL.call = call
# 1) нет ключа
r = run(); check(r['state'] == 'нет ключа' and not calls, 'нет файла ключа — ни одного запроса')
_wr('x', os.path.join(d, 'glonass_old.bak'), 'w'); r = run()
check(r['state'] == 'нет ключа' and 'glonass_old.bak' in r['err'] and not calls, 'нет ключа — в состоянии подсказка: похожие имена файлов (без содержимого)')
kp = os.path.join(d, 'Glonass.txt'); _wr('login = fabrikant\npassword: "%s"\n' % PW, kp, 'w')
check(GL.key_path(d) == kp, 'ключ принимается и как Glonass.txt')
check(GL.creds(d)[:2] == ('fabrikant', PW), 'ключ: логин и пароль (с «=», «:», кавычками)')
# 2) полный прогон
r = run()
check(oct(os.stat(kp).st_mode & 0o777) == '0o600', 'файл ключа — права 600')
check(('Login', 90) in calls, 'вход — с таймаутом 90 с (сервер думает до минуты)')
check(r['state'] == 'ok' and r['cars'] == 2, 'состояние ok, 2 машины')
G = pub['gl.bin']; c1 = [c for c in G['cars'] if c['id'] == 'D1'][0]
check(c1['speed'] == 54.5 and c1['vrn'] == 'А123ВС62' and c1['addr'].startswith('Рязань') and c1['lat'] == 54.62, 'где сейчас: скорость, госномер, адрес, координаты')
D = {x['id']: x for x in G['day'][today]}
check(D['D1']['km'] == 182.4 and abs(D['D1']['move_h'] - 4.2) < 0.01 and D['D1']['trips'] == 3, 'пробег и время в движении из Total')
check(D['D2']['km'] == 410.2 and D['D2']['move_h'] == 7.5, 'русские имена полей Total, «410,2» и «7:30»')
KH = G.get('km') or {}                                # 14.11.2026: история км для «Пробег по дням» (дата → {id: км}), копится в state
check((KH.get(today) or {}).get('D1') == 182.4 and (KH.get(today) or {}).get('D2') == 410.2 and store['glonass.json'].get('km_hist') == KH,
      'gl.bin km: история пробега по машинам, как в day; та же — в state для следующих дней')
st1 = D['D1']['stops']
check(len(st1) == 1 and st1[0]['min'] == 65 and st1[0]['zone'] == 'Клиент «Ромашка»', 'стоянка между рейсами 65 мин в геозоне клиента (меньшая из вложенных), 3 мин — не стоянка')
check(any(h['zone'] == 'Клиент «Ромашка»' and h['min'] == 65 for h in G['zones_hit']), 'заезд в геозону — в «доставках»')
blob = json.dumps([store, pub, logs], ensure_ascii=False)
check(PW not in blob and 'TOKEN-abcdef' not in blob, 'пароля и токена нет ни в state, ни в gl.bin, ни в журнале')
tok = json.loads(_rd(os.path.join(d, 'state', 'glonass_token.json')))
check(tok['token'] == 'TOKEN-abcdef-123456' and oct(os.stat(os.path.join(d, 'state', 'glonass_token.json')).st_mode & 0o777) == '0o600', 'токен — в отдельном файле 600')
print('    debug parsed:', store['glonass.json']['debug'][today]['parsed'])
check(store['glonass.json']['debug'][today]['parsed'].get('km') in ('TotalDistance', 'Пробег, км'), 'найденные поля Total — в state для проверки')
# 3) частоты
n = len(calls); run(); check(len(calls) == n, 'повторный прогон сразу — без запросов')
st = store['glonass.json']; st['ts_now'] -= 6 * 60; js('glonass.json', st); n = len(calls); run()
new = [m for m, _ in calls[n:]]
check(new == ['GetOnlineInfoAll'], 'через 6 минут — только «где сейчас», токен из кэша (без входа)')
# 4) токен истёк — один повторный вход
st = store['glonass.json']; st['ts_now'] -= 6 * 60; js('glonass.json', st); MODE['expire_once'] = True; n = len(calls); r = run()
new = [m for m, _ in calls[n:]]
check(new == ['GetOnlineInfoAll', 'Login', 'GetOnlineInfoAll'] and r['state'] == 'ok', '401 на запросе — один повторный вход и повтор')
# 5) 401 при входе — пауза 30 минут
os.remove(os.path.join(d, 'state', 'glonass_token.json')); MODE['login'] = '401'
st = store['glonass.json']; st['ts_now'] -= 6 * 60; js('glonass.json', st); r = run()
check(r['state'] == 'вход не принят' and 'включён ли доступ к API' in r['err'], '401 при входе — «вход не принят», подсказка про API')
n = len(calls); st = store['glonass.json']; st['ts_now'] -= 6 * 60; js('glonass.json', st); run()
check(len(calls) == n, 'после отказа во входе — 30 минут без попыток (учётку не заблокируют)')
os.utime(kp, (time.time() + 5, time.time() + 5)); MODE['login'] = 'ok'; n = len(calls); r = run()
check(len(calls) > n and r['state'] == 'ok', 'файл ключа изменён — сразу новая попытка')
# 6) 503 при входе — ошибка без пароля, повтор через 10 минут
os.remove(os.path.join(d, 'state', 'glonass_token.json')); MODE['login'] = '503'
st = store['glonass.json']; st['ts_now'] -= 6 * 60; js('glonass.json', st); r = run()
check(r['state'] in ('ошибка', 'частично') and '503' in (r['err'] or '') and PW not in (r['err'] or ''), '503 при входе — ошибка, пароль в тексте скрыт')
# 7) в файле вместо логина и пароля — токен (ключ) ТК ГЛОНАСС
d2 = tempfile.mkdtemp(); os.makedirs(os.path.join(d2, 'state')); TOKF = 'TOKEN-abcdef-123456'
_wr('AB' * 40 + '\n', os.path.join(d2, 'glonass'), 'w')
check(GL.file_token(d2) == 'AB' * 40, 'токен строкой в файле ключа распознан')
_wr('token=' + TOKF + '\n', os.path.join(d2, 'glonass'), 'w')
store2, pub2 = {}, {}
MODE['login'] = 'ok'; n = len(calls)
r2 = GL.run(d2, lambda *a: None, lambda n_, df: store2.get(n_, df), lambda n_, v: store2.__setitem__(n_, json.loads(json.dumps(v))), lambda n_, o: pub2.__setitem__(n_, o), iso)
new = [m for m, _ in calls[n:]]
check('Login' not in new and 'GetOnlineInfoAll' in new and r2['state'] == 'ok', 'только токен: запросы без входа по паролю, данные есть')
check(TOKF not in json.dumps([store2, pub2], ensure_ascii=False), 'токен не попадает в state и gl.bin')
MODE['expire_once'] = True; st2 = store2['glonass.json']; st2['ts_now'] -= 6 * 60; store2['glonass.json'] = st2
r2 = GL.run(d2, lambda *a: None, lambda n_, df: store2.get(n_, df), lambda n_, v: store2.__setitem__(n_, json.loads(json.dumps(v))), lambda n_, o: pub2.__setitem__(n_, o), iso)
check(r2['state'] == 'вход не принят' and 'login= и password=' in r2['err'], 'токен устарел — «вход не принят», просьба вписать логин и пароль')
print('ALL OK', ok)
