"""Тест разбора ответа GetTrips в формате AutoGRAPH (29.10.2026, по первым настоящим данным ТК ГЛОНАСС):
Total ТС — текущие показания «… Last» (одометр, код), не итоги дня; рейс — SD/ED в UTC + SDLocal; отрезки — Stages со статусами
(Value → Caption); геозоны — отрезок GeoFence1 со StatusID; адрес вместо координат — от соседней точки. Без сети."""
import datetime, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import glonass as GL
ok = 0
def check(c, m):
    global ok; assert c, m; ok += 1; print('  ✓', m)
D = '2026-10-29'; P = '2026-10-28'
def it(sd, ed, status, lat=54.7224, lng=39.8357, cap=None, sid=None, loc=None):
    # 30.10.2026 аудит P22: strptime вместо fromisoformat (его нет в Python 3.6 хостинга)
    a = datetime.datetime.strptime(D + 'T' + sd if len(sd) == 8 else sd, '%Y-%m-%dT%H:%M:%S')
    b = datetime.datetime.strptime(D + 'T' + ed, '%Y-%m-%dT%H:%M:%S')
    u = lambda x: (x - datetime.timedelta(hours=3)).isoformat()
    return {'Index': 0, 'SD': u(a), 'ED': u(b), '_SD': u(a) + 'Z', '_ED': u(b) + 'Z', 'SDLocal': a.isoformat(), 'EDLocal': b.isoformat(),
            'Status': status, 'StatusID': sid or GL.ZERO_ID, 'StartPoint': {'Lat': lat, 'Lng': lng}, 'EndPoint': {'Lat': lat, 'Lng': lng},
            'Caption': cap, 'Values': [a.isoformat(), b.isoformat(), lng, lat, loc]}
PAR = ['DateTime First', 'DateTime Last', 'Longitude First', 'Latitude First', 'FirstLocation']
motion = {'Name': 'Motion', 'Alias': '', 'Params': PAR, 'Statuses': [{'Value': 0, 'Caption': 'Остановка'}, {'Value': 1, 'Caption': 'Стоянка'}, {'Value': 2, 'Caption': 'Движение'}],
          'Items': [it('00:00:11', '07:55:00', 1, loc="39° 50,07200' вд, 54° 43,34130' сш"), it('07:55:00', '10:00:00', 2), it('10:00:00', '10:03:00', 0),
                    it('10:03:00', '12:00:00', 2), it('12:00:00', '13:10:00', 1, 54.605, 39.705, loc='ул. Цветочная, 1, Рязань (12 м)'), it('13:10:00', '15:00:00', 2),
                    it('15:00:00', '15:04:00', 1), it('15:04:00', '17:15:04', 2)]}
geo = {'Name': 'GeoFence1', 'Alias': 'GeoFence1', 'Params': PAR, 'Statuses': [],
       'Items': [it('00:00:11', '12:00:00', 0), it('12:00:00', '13:10:00', 0, 54.605, 39.705, cap='Клиент «Ромашка»', sid='Z1'), it('13:10:00', '17:15:04', 0)]}
mh = {'Name': 'MH', 'Alias': 'Sensor1', 'Params': PAR, 'Statuses': [{'Value': 1, 'Caption': 'Работа'}], 'Items': [it('07:50:00', '17:15:00', 1)]}
trip = {'Index': 0, 'Divisors': ['Чт'], 'SD': P + 'T21:00:11', 'ED': D + 'T14:15:04', 'SDLocal': D + 'T00:00:11', 'EDLocal': D + 'T17:15:04',
        'PointStart': {'Lat': 54.72233, 'Lng': 39.8357}, 'PointEnd': {'Lat': 55.776, 'Lng': 42.0758}, 'Stages': [mh, motion, geo],
        'Total': {'DateTime First': D + 'T04:55:41', 'TotalDuration': '10:01:55', 'MoveDuration': '08:04:06', 'ParkDuration': '01:52:14', 'Distance Diff': 491,
                  'TotalDistance': 524.0448762, 'ParkCount': 29, 'Engine1Motohours': '10:01:42', 'Engine1MHOnParks': '01:52:01', 'Engine1MHInMove': '08:04:06',
                  'Engine1FuelConsum': 114.55, 'TankFuelLevel Last': 286.9}}
dev = {'ID': 'D1', 'Name': 'SCANIA', 'VRN': 'А 763 ОС 62', 'SD': P + 'T21:00:00', 'Trips': [trip],
       'Total': {'DateTime Last': D + 'T17:15:04', 'CANTotalDistance': 1672668, 'Distance Last': 1672668, 'DistanceValid Last': 1672679, 'Motion Last': 2,
                 'ParkCount': 21, 'Speed Last': 90.4, 'MaxSpeed': 95.6, 'AverageSpeed': 72.9, 'CANMotohours': '1396.22:42:00', 'FDT': '00:04:59.58'}}
dbg = {'total_keys': set(), 'trip_total_keys': set(), 'parsed': {}, 'stops_src': {}, 'raw_total': {}, 'method': {}}
zones = [{'poly': [[54.60, 39.70], [54.60, 39.71], [54.61, 39.71], [54.61, 39.70]], 'a': 1, 'bb': [54.60, 39.70, 54.61, 39.71], 'id': 'Z1', 'name': 'Клиент «Ромашка»'}]
row, hits, vrn = GL.device_day('D1', dev, zones, {'Z1': 'Клиент «Ромашка»'}, dbg)
print('    ', {k: v for k, v in row.items() if k != 'stops'}, dbg['parsed'], dbg['stops_src'])
check(row['km'] == 524.0, 'пробег за день — TotalDistance рейсов (524 км), а не одометр «Distance Last» (1 672 668)')
check(abs(row['move_h'] - 8.07) < 0.01, 'в движении — MoveDuration 08:04 (8,07 ч), а не код «Motion Last» = 2')
check(abs(row['park_h'] - 1.87) < 0.01 and abs(row['idle_h'] - 1.87) < 0.01, 'стоянки 1,87 ч (ParkDuration), простой с двигателем 1,87 ч (Engine1MHOnParks)')
st = row['stops']
check([(s['sd'][11:], s['ed'][11:], s['min']) for s in st] == [('00:00', '07:55', 475), ('12:00', '13:10', 70)],
      'стоянки из отрезка Motion по подписи «Стоянка», время местное (SDLocal), 4 мин и «Остановка» — не стоянки')
check(st[1].get('zone') == 'Клиент «Ромашка»' and st[1].get('addr') == 'ул. Цветочная, 1, Рязань (12 м)' and 'addr' not in st[0],
      'стоянка у клиента — геозона и адрес; координаты вместо адреса — адресом не считаются')
check(row['trips'] == 2, 'поездок 2: короткая остановка поездку не делит, стоянка от 5 минут — делит')
check(len(hits) == 1 and hits[0]['zone'] == 'Клиент «Ромашка»' and hits[0]['min'] == 70, 'заезд к клиенту — в доставках')
check(dbg['stops_src'] == {'Stages': 1} and 'Motion' in dbg['stage_sample'] and dbg['stage_sample']['Motion']['statuses'][1] == [1, 'Стоянка'],
      'отладка: статусы и параметры отрезков сохраняются для проверки')
# где сейчас: координаты вместо адреса → адрес соседней машины
cache = []
cars = [{'id': 'A', 'lat': 54.72247, 'lng': 39.83285, 'addr': None}, {'id': 'B', 'lat': 54.72250, 'lng': 39.83330, 'addr': 'Терёхина ул., 14, Поляны, Рязанская обл. Рязанский р-н (28 м)'},
        {'id': 'C', 'lat': 45.03, 'lng': 39.06, 'addr': None}]
GL.near_fill(cars, cache)
check(cars[0]['addr'] == '≈ Терёхина ул., 14, Поляны, Рязанская обл. Рязанский р-н' and 'addr' not in cars[2], 'адреса нет — «≈ адрес» точки до 300 м; далеко — без адреса')
cars2 = [{'id': 'A', 'lat': 54.72248, 'lng': 39.83286}]; GL.near_fill(cars2, cache)
check(cars2[0]['addr'].startswith('≈ Терёхина') and len(cache) == 1, 'адрес помнится между опросами')
check(GL._txt_addr("39° 50,07200' вд, 54° 43,34130' сш") is None and GL._txt_addr('–') is None, '«39° 50,07′ вд…» и «–» — не адрес')
# отчёт по неработающим трекерам — раз в сутки после 08:30, только если такие есть
now = datetime.datetime(2026, 10, 30, 8, 35)
st = {'ok_now': True, 'cars': [
    {'id': 'S', 'name': 'Mercedes Sprinter', 'vrn': 'К 333 РВ 62', 'dt': '2026-10-28T01:49', 'speed': None},
    {'id': 'G', 'name': 'Газон NEXT', 'vrn': 'Х 408 СТ 62', 'dt': '2026-10-30T08:31', 'speed': None, 'lat': 57.68, 'lng': 34.22},
    {'id': 'A', 'name': 'Audi A6', 'vrn': 'K 344 TK 61', 'dt': '2026-10-30T08:30', 'speed': 0.0, 'addr': 'Терёхина ул., 14'}]}
sent = []
nf = lambda subj, text, to: (sent.append((subj, text, to)), {'mail': 'ok (очередь)', 'max': 'ok'})[1]
GL.dev_report(st, datetime.datetime(2026, 10, 30, 8, 10), nf, print)
check(not sent and 'dev_day' not in st, 'до 08:30 отчёта нет')
r = GL.dev_report(st, now, nf, print)
check(len(sent) == 1 and r['n'] == 2 and sent[0][2] == GL.DEV_TO and '— 2' in sent[0][0], 'в 08:35 — одно письмо: 2 трекера, Сотрудник40 и Сотрудник8')
check('нет связи с 28.10 01:49 (2 сут 7 ч)' in sent[0][1] and 'нет скорости и координат GPS' in sent[0][1] and 'Audi' not in sent[0][1], 'текст: без связи с какого времени, без GPS; рабочие машины не попадают')
GL.dev_report(st, datetime.datetime(2026, 10, 30, 12, 0), nf, print)
check(len(sent) == 1, 'второй раз за сутки — не отправляется')
st2 = {'ok_now': True, 'cars': [st['cars'][2]]}; sent.clear(); GL.dev_report(st2, now, nf, print)
check(not sent and st2['dev']['n'] == 0, 'все трекеры работают — письма нет')
# схема ТК ГЛОНАСС на самом деле: 1 «Остановка», 2 «Движение», 3 «Полёт» — «Стоянки» нет: остановка от 5 минут — стоянка
m2 = {'Name': 'Motion', 'Alias': '', 'Params': PAR, 'Statuses': [{'Value': 1, 'Caption': 'Остановка'}, {'Value': 2, 'Caption': 'Движение'}, {'Value': 3, 'Caption': 'Полёт'}],
      'Items': [it('00:00:11', '05:09:40', 1), it('05:09:40', '06:13:57', 2), it('06:13:57', '06:15:00', 1), it('06:15:00', '06:16:00', 3), it('06:16:00', '09:00:00', 2), it('09:00:00', '10:30:00', 1, 54.605, 39.705)]}
t2 = dict(trip, Stages=[m2, geo]); dev2 = dict(dev, Trips=[t2])
row2, hits2, _ = GL.device_day('D1', dev2, zones, {'Z1': 'Клиент «Ромашка»'}, {'total_keys': set(), 'trip_total_keys': set(), 'parsed': {}, 'stops_src': {}, 'raw_total': {}, 'method': {}})
check([(s['sd'][11:], s['ed'][11:], s['min']) for s in row2['stops']] == [('00:00', '05:09', 309), ('09:00', '10:30', 90)] and row2['trips'] == 1,
      'схема без «Стоянки»: «Остановка» от 5 минут — стоянка, 1 мин — нет, «Полёт» не считается; поездка одна')
print('ALL OK', ok)
