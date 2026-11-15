"""30.10.2026 треки: тест glonass.py — GetTrack, чистка сбоев сигнала (выбросы, скачок на 100 км вбок и обратно, дрейф на стоянке,
(0, 0), порядок и повторы), перерывы в данных, пробег и время в движении по чистому треку, пометка 864 км / 1,24 ч, Дуглас — Пекер и размер
gl.bin, разбор разных видов ответа, прогон run() с поддельной сессией. Без сети: cd fix/tracks && unshare -n python3 -W ignore test/test_tracks.py"""
import datetime, json, math, os, random, sys, tempfile, time


def _rd(*a, **k):   # CodeQL py/file-not-closed: файл закрывается сразу (15.11.2026)
    with open(*a, **k) as _f:
        return _f.read()


def _wr(_d, *a, **k):
    with open(*a, **k) as _f:
        return _f.write(_d)


sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import glonass as GL
ok = 0
def check(c, m, info=''):
    global ok
    assert c, m + (' — ' + str(info)[:600] if info != '' else ''); ok += 1; print('  ✓', m)
random.seed(30102026)
D0 = datetime.datetime(2026, 10, 29, 8, 0)
RZN = (54.62, 39.74)

def move(t0, p0, brg, kmh, secs, step=10, spd=True):
    """прямая: от p0 по курсу brg (градусы) со скоростью kmh, точка раз в step секунд"""
    out, b = [], math.radians(brg)
    for i in range(int(secs / step) + 1):
        d = kmh / 3.6 * step * i
        out.append((t0 + datetime.timedelta(seconds=step * i), p0[0] + d * math.cos(b) / 110540.0,
                    p0[1] + d * math.sin(b) / (111320.0 * math.cos(math.radians(p0[0]))), float(kmh) if spd else None))
    return out

def off(p, north_m, east_m): return (p[0] + north_m / 110540.0, p[1] + east_m / (111320.0 * math.cos(math.radians(p[0]))))

def park(t0, p0, secs, step=30, sig=15, excur=True):
    """стоянка с дрейфом GPS: разброс ~15 м, раз в 10 минут «вылет» на 150 м со скоростью 4–6 км/ч и обратно"""
    out = []
    for i in range(int(secs / step) + 1):
        q = off(p0, random.gauss(0, sig), random.gauss(0, sig)); sp = random.choice([0.0, 0.0, 1.0, 2.0])
        if excur and i % 20 == 10: q = off(p0, 150, 40); sp = random.choice([4.0, 6.0])
        out.append((t0 + datetime.timedelta(seconds=step * i), q[0], q[1], sp))
    return out

print('чистка и пробег')
drive = move(D0, RZN, 30, 60, 3600)                                  # 60 км за час
c = GL.clean_track(drive); s = GL.track_sum(c)
check(abs(s['km'] - 60) <= 1.2 and abs(s['mh'] - 1.0) < 0.02 and not c['gl'] and s['cov'] == 100, 'прямая 60 км за 1 ч при 60 км/ч — 60 км ± 2 %, 1,0 ч в движении, сбоев нет', s)
# одиночный выброс: 5 км вбок на одной точке
sp = list(drive); i = 180; q = off(sp[i][1:3], 0, 5000); sp[i] = (sp[i][0], q[0], q[1], 60.0)
c = GL.clean_track(sp); s = GL.track_sum(c)
check(len(c['gl']) == 1 and c['gl'][0]['why'] == 'выброс' and abs(s['km'] - 60) <= 1.2 and 9 <= c['gl'][0]['km'] <= 11, 'выброс 5 км вбок — убран («выброс», добавлял ~10 км), пробег 60 км', (c['gl'], s))
# «ехала-ехала и раз на 100 км правее оказалась и потом обратно»: 12 точек (2 мин) в 100 км вбок
jb = list(drive)
for k in range(200, 212):
    q = off(jb[k][1:3], -20000, 98000); jb[k] = (jb[k][0], q[0], q[1], 61.0)
c = GL.clean_track(jb); s = GL.track_sum(c); g = c['gl']
check(len(g) == 1 and g[0]['why'] == 'скачок' and g[0]['n'] == 12 and abs(s['km'] - 60) <= 1.2 and 190 <= c['km_gl'] <= 215,
      'скачок на 100 км вбок и обратно (12 точек, 2 мин) — убран целиком, пробег 60 км, убрано ~200 км', (g, s, c['km_gl']))
far = GL._dist_m((g[0]['lat'], g[0]['lng']), RZN)
check(far > 90000, 'точка сбоя для карты — самая дальняя из убранных (~100 км)', far)
# два скачка подряд в разные стороны и скачок в конце трека
j2 = list(drive)
for k in range(100, 104): q = off(j2[k][1:3], 0, 100000); j2[k] = (j2[k][0], q[0], q[1], 60.0)
for k in range(104, 107): q = off(j2[k][1:3], 0, -80000); j2[k] = (j2[k][0], q[0], q[1], 60.0)
q = off(j2[-1][1:3], 300000, 0); j2[-1] = (j2[-1][0], q[0], q[1], 60.0)
c = GL.clean_track(j2); s = GL.track_sum(c)
check(len(c['gl']) == 2 and abs(s['km'] - 60) <= 1.5 and any(x['why'] == 'выброс в конце трека' for x in c['gl']),
      'два куска сбоя подряд (+100 км и −80 км) — один сбой; последняя точка в 300 км — «выброс в конце трека»', (c['gl'], s))
# скачок без возврата: две равные половины — не решить, км скачка не считаются
h1 = move(D0, RZN, 0, 60, 1800); h2 = move(D0 + datetime.timedelta(seconds=1810), off(h1[-1][1:3], 0, 200000), 0, 60, 1800)
c = GL.clean_track(h1 + h2); s = GL.track_sum(c)
Tb = GL.track_day(h1 + h2)
check(c['open'] == 1 and abs(s['km'] - 60) <= 1.5 and c['gl'][0]['why'].startswith('скачок без возврата') and len(Tb['b']) == 1 and Tb['open'] == 1 and Tb['gn'] == 0,
      'скачок на 200 км без возврата между равными кусками — не убран, его 200 км не считаются, линия рвётся', (c['gl'], s))
# дрейф на стоянке
pk = park(D0, RZN, 3600)
c = GL.clean_track(pk); s = GL.track_sum(c)
st0 = c['stops'][0] if c['stops'] else {}
raw_km = c['km_raw']
check(s['km'] < 0.05 and s['mh'] == 0 and len(c['stops']) == 1 and GL._dist_m((st0['lat'], st0['lng']), RZN) < 25 and raw_km > 3 and c['km_drift'] > 3 and len(c['pts']) == 2,
      'стоянка 1 ч с дрейфом GPS (%.1f км «пробега» по сырым точкам) — одна стоянка в центре, 0 км, 0 ч в движении' % raw_km, (s, c['stops'], raw_km))
# стоянка с редкими точками (раз в 5 минут): «скорость» скачка правдоподобна, но трекер «стоит» — тоже сбой
sp5 = [(D0 + datetime.timedelta(minutes=5 * k), RZN[0], RZN[1], 0.0) for k in range(60)]
q = off(RZN, 5000, 0); sp5[10] = (sp5[10][0], q[0], q[1], 0.0)                    # 5 км за 5 минут (60 км/ч) и обратно
for k in (30, 31, 32): q = off(RZN, 0, 3000 + 50 * k); sp5[k] = (sp5[k][0], q[0], q[1], 1.0)   # три точки в 3 км
q = off(RZN, 0, 1000); sp5[45] = (sp5[45][0], q[0], q[1], 0.0)                     # 1 км и обратно
c = GL.clean_track(sp5); s = GL.track_sum(c)
check(s['km'] == 0 and s['mh'] == 0 and [g['why'] for g in c['gl']] == ['выброс на стоянке', 'скачок на стоянке'] and [g['n'] for g in c['gl']] == [1, 3] and len(c['stops']) == 1,
      'стоянка, точки раз в 5 мин: «прыжки» на 5 км и на 3 км (3 точки) при скорости 0 — сбои; 1 км и обратно — дрейф; 0 км, одна стоянка', (c['gl'], s, c['km_raw']))
real = [(D0 + datetime.timedelta(minutes=5 * k), RZN[0], RZN[1], 0.0) for k in range(6)]
real += [(D0 + datetime.timedelta(minutes=30 + k), off(RZN, 0, 900 * k)[0], off(RZN, 0, 900 * k)[1], 54.0) for k in range(1, 6)]
real += [(D0 + datetime.timedelta(minutes=36 + k), off(RZN, 0, 900 * (5 - k))[0], off(RZN, 0, 900 * (5 - k))[1], 54.0) for k in range(1, 5)]
real += [(D0 + datetime.timedelta(minutes=45 + 5 * k), RZN[0], RZN[1], 0.0) for k in range(6)]
c = GL.clean_track(real); s = GL.track_sum(c)
check(not c['gl'] and abs(s['km'] - 9.0) < 0.3, 'настоящая поездка на 4,5 км и обратно со стоянки (скорость 54) — не сбой, 9 км', (c['gl'], s))
# день: стоянка — поездка — стоянка
day = park(D0, RZN, 1800) + move(D0 + datetime.timedelta(seconds=1830), RZN, 90, 50, 1800)[1:]
end = day[-1]; day += park(end[0] + datetime.timedelta(seconds=30), end[1:3], 1200)
c = GL.clean_track(day); s = GL.track_sum(c)
check(abs(s['km'] - 25) <= 0.8 and abs(s['mh'] - 0.5) < 0.03 and len(c['stops']) == 2, 'стоянка 30 мин + 25 км за 30 мин + стоянка 20 мин — 25 км, 0,5 ч, две стоянки', (s, len(c['stops'])))
T = GL.track_day(day)
check([x['min'] for x in T['s']] == [30, 20] and T['s'][0]['a'] == '08:00', 'стоянки трека — от 5 минут, время ЧЧ:ММ и центр', T['s'])
# порядок, повторы, (0, 0), пустые координаты
mix = list(drive) + drive[50:80] + [(D0 + datetime.timedelta(seconds=15), 0.0, 0.0, 0.0), (D0 + datetime.timedelta(seconds=25), None, 39.7, 5), (None, 54.6, 39.7, 1),
                                    (D0 + datetime.timedelta(seconds=35), 95.0, 39.7, 1), (D0 + datetime.timedelta(seconds=45), 54.6, 0, 1), ('x',)]
random.shuffle(mix)
c = GL.clean_track(mix); s = GL.track_sum(c)
check(abs(s['km'] - 60) <= 1.2 and c['dup'] == 30 and c['bad'] == 6 and c['uns'] > 0 and not c['gl'], 'вразнобой, 30 повторов времени, (0, 0), нет координат/времени, lat 95 — 60 км, сбоев нет', c)
# перерыв в данных: машина ехала 40 минут без точек — время не «в движении», км — по прямой, трек неполный
g1 = move(D0, RZN, 0, 60, 1800); g2 = move(D0 + datetime.timedelta(seconds=1800 + 2400), off(g1[-1][1:3], 40000, 0), 0, 60, 1800)
c = GL.clean_track(g1 + g2); s = GL.track_sum(c)
check(abs(s['mh'] - 1.0) < 0.03 and abs(s['km'] - 100) <= 2 and s['cov'] == 60, 'дыра 40 мин на ходу — в движении 1,0 ч (не 1,67), км 30+40+30, покрытие 60 %', s)
p1 = move(D0, RZN, 0, 60, 1800); p2 = move(D0 + datetime.timedelta(seconds=1800 + 7200), p1[-1][1:3], 0, 60, 1800)
c = GL.clean_track(p1 + p2); s = GL.track_sum(c)
check(abs(s['mh'] - 1.0) < 0.03 and s['cov'] == 100 and len(c['stops']) == 1 and c['stops'][0]['b'] - c['stops'][0]['a'] >= 7200,
      'трекер молчит 2 ч на стоянке (без смещения) — это стоянка, трек полный', s)
# легковая — свой предел скорости
fast = move(D0, RZN, 0, 180, 1200)
check(not GL.clean_track(fast, GL.vmax_of('Audi A6'))['gl'] and GL.vmax_of('AUDI A6 К 344') == 200 and GL.vmax_of('Газон NEXT Х 408 СТ 62') == 150 and GL.vmax_of('KIA CARNIVAL') == 200,
      'Audi на 180 км/ч — не сбой (предел легковых 200), у грузовиков — 150')

print('пометки строки дня')
r = GL.row_check({'id': 'G', 'km': 864.1, 'move_h': 1.24, 'trips': 3, 'stops': []}, None)
check('697 км/ч' in r['check'] and r['km'] == 864.1 and r['km_api'] == 864.1, '«Газон NEXT» 864,1 км при 1,24 ч (697 км/ч) — помечен даже без трека', r['check'])
gz = move(D0, RZN, 45, 60, int(1.24 * 3600))
for n, k in enumerate((40, 120, 200, 300)):
    for kk in range(k, k + 3): q = off(gz[kk][1:3], 0, 100000 * (1 if n % 2 else -1)); gz[kk] = (gz[kk][0], q[0], q[1], 60.0)
T = GL.track_day(gz)
r = GL.row_check({'id': 'G', 'km': 864.1, 'move_h': 1.24, 'stops': []}, T)
print('    ', r['check'])
check(r['check'].startswith('сбой сигнала: 4 скачка, убрано') and abs(r['km'] - 74.4) < 2 and r['km_api'] == 864.1 and r['src'] == 'трек' and r['glitch_n'] == 4 and r['glitch_km'] > 700
      and '697 км/ч' in r['check'] and 'по треку 74 км, в итоге ГЛОНАСС 864 км' in r['check'], '864 км / 1,24 ч + трек со скачками — по треку 74 км, четыре скачка (~800 км) убраны, пометка', r)
r = GL.row_check({'id': 'A', 'km': 60.5, 'move_h': 1.0}, GL.track_day(drive))
check('check' not in r and abs(r['km'] - 60) < 1 and r['km_api'] == 60.5 and r['src'] == 'трек', 'трек и итог API сходятся, сбоев нет — без пометки, км по треку')
r = GL.row_check({'id': 'A', 'km': 95, 'move_h': 1.6}, GL.track_day(g1 + g2))
check(r['km'] == 95 and r['src'] == 'ГЛОНАСС' and 'трек неполный (60 % времени)' in r['check'], 'трек неполный — км из итога ГЛОНАСС и пометка', r)
r0 = {'id': 'B', 'km': 12, 'move_h': 0.5, 'stops': [{'sd': 'x'}]}
check(GL.row_check(r0, None) == r0, 'нет трека, итог правдоподобен — строка как была (ключи и смысл прежние)')
r = GL.row_check({'id': 'P', 'km': 30, 'move_h': 0.2}, GL.track_day(pk))
check('по треку 0,0 км, в итоге ГЛОНАСС 30 км' in r['check'] and 'дрейф на стоянках' not in r['check'], 'на стоянке API насчитал 30 км — пометка: по треку 0 км', r['check'])

print('Дуглас — Пекер и размер gl.bin')
def wander(t0, p0, n, step=5):
    out, lat, lng, b = [], p0[0], p0[1], random.uniform(0, 360)
    for i in range(n):
        b += random.gauss(0, 25); v = random.uniform(30, 90); d = v / 3.6 * step
        lat += d * math.cos(math.radians(b)) / 110540.0; lng += d * math.sin(math.radians(b)) / (111320.0 * math.cos(math.radians(lat)))
        out.append((t0 + datetime.timedelta(seconds=step * i), lat, lng, v))
    return out
w8 = wander(datetime.datetime(2026, 10, 29, 0, 0, 1), RZN, 8000)
for k in (1000, 3000, 5000):                                         # и сбои
    q = off(w8[k][1:3], 50000, 50000); w8[k] = (w8[k][0], q[0], q[1], 60.0)
t1 = time.time(); T = GL.track_day(w8); dt8 = time.time() - t1
P = GL._dec(T['p'])
check(len(P) <= 300 and len(T['w']) == len(P) and T['gn'] == 3 and abs(P[0][0] - round(w8[0][1], 5)) < 1e-9 and abs(P[-1][1] - round(w8[-1][2], 5)) < 1e-9,
      '8000 точек (11 ч петляний) → линия ≤ 300 точек (%d), концы на месте, 3 сбоя убраны; %.2f с' % (len(P), dt8), (len(P), T['gn']))
T2 = GL._trk_pub(T, 100); P2 = GL._dec(T2['p'])
check(len(P2) == 100 and 'w' not in T2 and P2[0] == P[0] and P2[-1] == P[-1] and all(x in P for x in P2), 'урезание до 100 вершин — по весам, без весов на портал, вершины из исходной линии')
check(GL._dec(GL._enc([(54.123456, 39.987654), (54.12, 39.98)])) == [(54.12346, 39.98765), (54.12, 39.98)], 'координаты — 5 знаков, дельты целыми')
trk = {}
for day in ('2026-10-29', '2026-10-30'):
    trk[day] = {}
    for n in range(12):
        trk[day]['D%d' % n] = GL.track_day(wander(datetime.datetime(2026, 10, 29 if day < '2026-10-30' else 30, 0, 0, 1), off(RZN, 3000 * n, 0), 8000))
cars = [{'id': 'D%d' % n, 'name': 'ГАЗель %03d' % n, 'vrn': 'А%03dВС62' % n, 'lat': 54.6, 'lng': 39.7, 'dt': '2026-10-30T10:00', 'speed': 50.0, 'state': 2, 'addr': 'Рязань, Московское шоссе, 1' * 2} for n in range(12)]
rows = [{'id': 'D%d' % n, 'km': 500.0, 'move_h': 10.5, 'trips': 5, 'park_h': 2.0, 'idle_h': 0.5,
         'stops': [{'sd': '2026-10-30T10:%02d' % k, 'ed': '2026-10-30T10:%02d' % (k + 5), 'min': 30, 'addr': 'Рязань, ул. Ленина, 1, офис 1', 'lat': 54.6, 'lng': 39.7, 'zone': 'Клиент'} for k in range(12)]} for n in range(12)]
pub = {'v': 1, 't': '2026-10-30T10:00', 'cars': cars, 'day': {'2026-10-29': rows, '2026-10-30': rows}, 'zones_hit': [], 'err': None}
t1 = time.time(); GL.tracks_pub(pub, {'trk': trk}); dtp = time.time() - t1
raw = json.dumps(pub, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
sealed = 6 + 4 * ((48 + len(raw) + 2) // 3)                          # live.seal: 'T14B1.' + base64(nonce 16 + tag 32 + шифр)
tl = len(json.dumps(pub['tracks'], ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
nv = sum(len(T['p']) // 2 for d in pub['tracks'].values() for T in d.values())
print('    gl.bin: JSON %d КБ (треки %d КБ, вершин %d), на сайте (зашифрован, base64) %d КБ; публикация %.2f с' % (len(raw) // 1024, tl // 1024, nv, sealed // 1024, dtp))
check(sealed <= 600 * 1024 and tl <= GL.TRK_BYTES and nv <= 12 * 2 * 300, '12 машин × 2 дня × 8000 точек — gl.bin %d КБ на сайте (≤ 600 КБ)' % (sealed // 1024))
big = {'2026-10-29': {('X%d' % n): dict(trk['2026-10-29']['D%d' % (n % 12)]) for n in range(60)}}
B0, GL.TRK_BYTES = GL.TRK_BYTES, 100000
out = GL.tracks_out(big); bl = len(json.dumps(out, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
check(bl <= GL.TRK_BYTES and max(len(T['p']) // 2 for T in out['2026-10-29'].values()) < 300, '60 машин при пределе 100 КБ — линии урезаются, треки %d КБ' % (bl // 1024))
GL.TRK_BYTES = B0

print('разбор ответа GetTrack')
utc = lambda d: (d - datetime.timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M:%S')
A = {'D1': [{'DT': [utc(D0), utc(D0 + datetime.timedelta(seconds=10))], 'Speed': [10, None], 'Lat': [54.6, 54.601], 'Lng': [39.7, 39.7]},
            {'DT': [utc(D0 + datetime.timedelta(seconds=20)), utc(D0 + datetime.timedelta(seconds=30)), 'мусор'], 'Lat': [54.602, '54,603', 54.7], 'Lng': [39.7, 39.7]}],
     'D2': None, 'D3': [], 'D4': {'DT': ['2026-10-29T05:00:00Z'], 'Lat': [55.0], 'Lng': [40.0], 'Speed': [5]}}
R = GL.track_resp(A)
check(len(R['D1']) == 4 and R['D1'][1][4] is None and R['D1'][3][2] == 54.603 and R['D1'][0][1] is True and 'D2' not in R and R['D3'] == [],
      'по документации: {ID: [отрезки с DT[], Lat[], Lng[], Speed[]]}; Speed короче, «54,603», лишний DT без координат, None', R['D1'])
check(R['D4'][0][0] == datetime.datetime(2026, 10, 29, 8, 0) and R['D4'][0][1] is False, 'один отрезок словарём; время с «Z» — в МСК сразу (не «без пояса»)')
B = [{'ID': 7, 'Track': [{'DT': '/Date(1761714000000)/', 'Lat': 54.6, 'Lng': 39.7, 'Speed': 3}, {'DT': 1761714010, 'Lat': 54.61, 'Lng': 39.7}]}]
R = GL.track_resp(B)
check(len(R['7']) == 2 and R['7'][0][0] == datetime.datetime(2025, 10, 29, 8, 0) and R['7'][1][0] == datetime.datetime(2025, 10, 29, 8, 0, 10) and R['7'][0][4] == 3,
      'список [{ID, Track: [точки словарями]}], /Date(мс)/ и секунды эпохи', R['7'])
R = GL.track_resp({'Items': [{'ID': 'X', 'DT': [utc(D0)], 'Lat': [54.6], 'Lng': [39.7]}], 'Bad': 'x'})
check(len(R['X']) == 1, '{Items: [{ID, DT[], Lat[], Lng[]}]}')
R = GL.track_resp({'Y': [[utc(D0), 54.6, 39.7, 12], [utc(D0 + datetime.timedelta(seconds=5)), 54.61, 39.7]]})
check(len(R['Y']) == 2 and R['Y'][0][4] == 12.0, 'точки списками [DT, Lat, Lng, Speed]')
check(GL.track_resp('') == {} and GL.track_resp(None) == {} and GL.track_resp({'D': 'строка'}) == {}, 'пустой / не тот ответ — пусто, без ошибки')
# время без пояса: UTC или МСК
day0 = datetime.datetime(2026, 10, 29); day1 = day0 + datetime.timedelta(days=1); now = datetime.datetime(2026, 10, 30, 12, 0)
u = {'A': [(day0 + datetime.timedelta(minutes=m) - datetime.timedelta(hours=3), True) for m in range(0, 1440, 30)]}
check(GL._naive_shift(u, day0, day1, now, {})[0] == 3, 'вчера: точки 21:00–20:30 (сутки МСК в UTC) — сдвиг +3 ч')
mk = {'A': [(day0 + datetime.timedelta(minutes=m), True) for m in range(0, 1440, 30)]}
check(GL._naive_shift(mk, day0, day1, now, {})[0] == 0, 'вчера: точки 00:00–23:30 — уже МСК, без сдвига')
tod = datetime.datetime(2026, 10, 30); n2 = datetime.datetime(2026, 10, 30, 14, 0)
mk2 = {'A': [(tod + datetime.timedelta(hours=9, minutes=m), True) for m in range(0, 290, 10)]}
check(GL._naive_shift(mk2, tod, tod + datetime.timedelta(days=1), n2, {})[0] == 0, 'сегодня: со сдвигом точки были бы «в будущем» — время уже МСК')
u2 = {'A': [(tod + datetime.timedelta(hours=7, minutes=m), True) for m in range(0, 230, 10)]}   # 07:00–10:50 «без пояса» = 10:00–13:50 МСК
check(GL._naive_shift(u2, tod, tod + datetime.timedelta(days=1), n2, {'A': datetime.datetime(2026, 10, 30, 13, 55)})[0] == 3,
      'сегодня: последняя точка 10:50 «без пояса», «где сейчас» 13:55 — это UTC, сдвиг +3 ч', GL._naive_shift(u2, tod, tod + datetime.timedelta(days=1), n2, {'A': datetime.datetime(2026, 10, 30, 13, 55)}))

print('«где сейчас» против трека')
Tr = GL.track_day(move(datetime.datetime(2026, 10, 30, 8, 0), RZN, 0, 60, 3600))
trk = {'2026-10-30': {'S': Tr}}
c = GL.pos_check({'id': 'S', 'name': 'SCANIA', 'lat': 38.84, 'lng': 65.78, 'dt': '2026-10-30T09:05'}, trk)
check(c.get('pos_bad') and '3' in c['pos_why'] and 'доехать нельзя' in c['pos_why'] and c['pos_last']['lat'] == Tr['end'][1], 'конец трека в Рязани в 09:00, «где сейчас» в Узбекистане в 09:05 — pos_bad, причина, последняя верная точка', c)
c = GL.pos_check({'id': 'S', 'name': 'SCANIA', 'lat': 38.84, 'lng': 65.78, 'dt': '2026-10-28T18:23'}, {})
check(not c.get('pos_bad') and c['pos_chk'].startswith('не проверено:') and 'км от базы' in c['pos_chk'], 'SCANIA 38,84 / 65,78, данные 28.10, трека нет — не «сбой», а «не проверено» (рейс мог быть)', c)
c = GL.pos_check({'id': 'S', 'name': 'SCANIA', 'lat': Tr['end'][1] + 0.01, 'lng': Tr['end'][2], 'dt': '2026-10-30T09:10'}, trk)
check('pos_bad' not in c and 'pos_chk' not in c, 'рядом с концом трека — всё в порядке')
eg = move(datetime.datetime(2026, 10, 30, 8, 0), RZN, 0, 60, 1800); q = off(eg[-1][1:3], 0, 30000); eg[-1] = (eg[-1][0], q[0], q[1], 60.0)
Te = GL.track_day(eg)
c = GL.pos_check({'id': 'E', 'name': 'ГАЗель', 'lat': q[0], 'lng': q[1], 'dt': '2026-10-30T08:30'}, {'2026-10-30': {'E': Te}})
check(Te.get('endg') and c.get('pos_bad') and 'убрана из трека' in c['pos_why'], 'последняя точка трека — выброс на 30 км, «где сейчас» там же — pos_bad', (Te.get('endg'), c))

print('run() с поддельной сессией')
d = tempfile.mkdtemp(); os.makedirs(os.path.join(d, 'state'))
PW = 'Sekr3t-Pa$$'; _wr('login=fab\npassword=%s\n' % PW, os.path.join(d, 'glonass'), 'w')
store, pub_, logs, calls = {}, {}, [], []
jl = lambda n, dflt: json.loads(json.dumps(store[n])) if n in store else dflt
js = lambda n, v: store.__setitem__(n, json.loads(json.dumps(v)))
pb = lambda n, o: pub_.__setitem__(n, json.loads(json.dumps(o)))
iso = lambda x: x.strftime('%Y-%m-%dT%H:%M')
run = lambda: GL.run(d, lambda *a: logs.append(' '.join(map(str, a))), jl, js, pb, iso)
NOW = datetime.datetime.now(GL.MSK).replace(tzinfo=None, second=0, microsecond=0)
TODAY, YDAY = NOW.date(), NOW.date() - datetime.timedelta(days=1)
MODE = {'trk': 'ok'}
def fake_track(day):
    """D1 (Газон): вчера — поездка 06:00–07:14 со скачками на 100 км и стоянки; сегодня — до «сейчас − 15 мин». Время — UTC без пояса"""
    base = datetime.datetime(day.year, day.month, day.day)
    if day == TODAY:
        t1 = NOW - datetime.timedelta(minutes=15); t0 = max(base + datetime.timedelta(minutes=1), t1 - datetime.timedelta(hours=1))
        if t1 <= t0: return []
        pts = park(t0, RZN, (t1 - t0).total_seconds() / 2, step=60, excur=False)
        pts += move(pts[-1][0] + datetime.timedelta(seconds=10), RZN, 0, 60, (t1 - t0).total_seconds() / 2 - 20)
        return pts
    pts = park(base + datetime.timedelta(minutes=2), RZN, 6 * 3600 - 240, step=300, excur=False)
    tr = move(base + datetime.timedelta(hours=6), RZN, 45, 60, int(1.24 * 3600))
    for n, k in enumerate((40, 120, 200, 300)):
        for kk in range(k, k + 3): q = off(tr[kk][1:3], 0, 100000 * (1 if n % 2 else -1)); tr[kk] = (tr[kk][0], q[0], q[1], 60.0)
    end = tr[-1]
    return pts + tr + park(end[0] + datetime.timedelta(seconds=60), end[1:3], (base + datetime.timedelta(hours=23, minutes=58) - end[0]).total_seconds(), step=300, excur=False)
def call(method, params, timeout=25):
    calls.append(method)
    if method == 'Login': return 'TOKEN-abcdef-123456'
    assert params.get('session') == 'TOKEN-abcdef-123456'
    if method == 'EnumSchemas': return [{'ID': 'S1', 'Name': 'Фабрикант'}]
    if method == 'EnumDevices': return {'Items': [{'ID': 'D1', 'Name': 'Газон NEXT Х 408 СТ 62'}, {'ID': 'D2', 'Name': 'SCANIA Х 806 РР 62'}]}
    if method in ('EnumGeoFences', 'GetGeofences'): return []
    if method == 'GetOnlineInfoAll':
        return {'D1': {'ID': 'D1', 'Name': 'Газон NEXT Х 408 СТ 62', 'LastPosition': {'Lat': 38.84, 'Lng': 65.78}, 'DTLocal': iso(NOW - datetime.timedelta(minutes=5)) + ':00', 'Speed': 0},
                'D2': {'ID': 'D2', 'Name': 'SCANIA Х 806 РР 62', 'LastPosition': {'Lat': 38.84, 'Lng': 65.78}, 'DTLocal': '2026-10-28T18:23:00', 'Speed': 0}}
    if method == 'GetTrips':
        return {'D1': {'ID': 'D1', 'Total': {'TotalDistance': 864.1, 'MoveDuration': '01:14:24'}, 'Trips': []},
                'D2': {'ID': 'D2', 'Total': {'TotalDistance': 0, 'MoveDuration': '00:00:00'}, 'Trips': []}}
    if method == 'GetTrack':
        if MODE['trk'] == '500': raise GL.GlonassError('GetTrack: HTTP 500 ', 500)
        assert params['IDs'] == 'D1,D2' and params['SD'].endswith('-0000') and params['ED'].endswith('-0000'), params
        day = datetime.date(int(params['SD'][:4]), int(params['SD'][4:6]), int(params['SD'][6:8]))
        P = fake_track(day)
        u3 = lambda t: (t - datetime.timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M:%S')
        h = len(P) // 2
        return {'D1': [{'DT': [u3(p[0]) for p in P[:h]], 'Speed': [p[3] for p in P[:h]], 'Lat': [p[1] for p in P[:h]], 'Lng': [p[2] for p in P[:h]]},
                       {'DT': [u3(p[0]) for p in P[h:]], 'Speed': [p[3] for p in P[h:]], 'Lat': [p[1] for p in P[h:]], 'Lng': [p[2] for p in P[h:]]}], 'D2': []}
    raise AssertionError(method)
GL.call = call
r = run()
st = store['glonass.json']; G = pub_['gl.bin']
check(r['state'] == 'ok' and calls.count('GetTrack') == 2 and st['ok_trk'] is True, 'первый прогон: всё ок, GetTrack за вчера и сегодня (5 ТС в запросе — один запрос в день)', (r, calls))
Y = YDAY.isoformat(); TD = TODAY.isoformat()
row = [x for x in G['day'][Y] if x['id'] == 'D1'][0]
print('    вчера D1:', {k: row.get(k) for k in ('km', 'move_h', 'km_api', 'move_api', 'src', 'cov', 'glitch_n', 'glitch_km', 'check')})
check(row['km_api'] == 864.1 and abs(row['km'] - 74.4) < 2.5 and row['glitch_n'] == 4 and row['src'] == 'трек' and '697 км/ч' in row['check'] and abs(row['move_h'] - 1.24) < 0.05,
      'gl.bin, вчера: Газон — 74 км по чистому треку вместо 864, 4 скачка убраны, пометка (697 км/ч)', row)
T = G['tracks'][Y]['D1']
check(len(T['p']) // 2 <= 300 and len(T['g']) == 4 and all(g['why'] == 'скачок' for g in T['g']) and T['s'] and 'w' not in T and G['v'] == 1,
      'gl.bin → tracks[день][ID]: линия, стоянки, 4 точки сбоя; v=1 и прежние ключи на месте', {k: T[k] for k in T if k != 'p'})
sd = st['debug_trk'][Y]
check(sd['dt_shift_h'] == 3 and len(sd['sample']['first']['DT']) == 20 and sd['sample']['segs'] == 2 and sd['shape'] == 'dict → list → dict' and sd['outside'] == 0,
      'state: образец ответа (20 точек как пришли), форма ответа, время UTC → МСК (+3 ч) по границам суток', {k: sd[k] for k in sd if k != 'sample'})
check(st['trk_meta'][Y]['final'] and not st['trk_meta'][TD]['final'], 'вчерашний трек снят после полуночи — окончательный, сегодняшний — нет')
c1 = [c for c in G['cars'] if c['id'] == 'D1'][0]; c2 = [c for c in G['cars'] if c['id'] == 'D2'][0]
if G['tracks'].get(TD, {}).get('D1'):
    check(c1.get('pos_bad') and 'доехать нельзя' in c1['pos_why'], '«где сейчас» Газона в Узбекистане через 20 мин после конца трека в Рязани — pos_bad', c1)
else: print('    (сразу после полуночи сегодняшнего трека ещё нет — проверка pos_bad пропущена)')
check('pos_bad' not in c2 and c2.get('pos_chk', '').startswith('не проверено'), 'SCANIA (нет связи с 28.10, трека нет) — не скрыта, «не проверено»', c2)
check('pos_bad' not in st['cars'][0] and 'check' not in json.dumps(st['day'], ensure_ascii=False), 'state: итоги API и машины без правок (пометки — только в gl.bin)')
blob = json.dumps([store, pub_, logs], ensure_ascii=False)
check(PW not in blob and 'TOKEN-abcdef' not in blob, 'пароля и токена нет ни в state, ни в gl.bin, ни в журнале')
check(any(l.startswith('глонасс треки за %s' % YDAY.strftime('%d.%m')) and 'сбоев убрано 4' in l for l in logs), 'журнал: треки, сколько сбоев убрано', logs[-3:])
n = len(calls); run(); check(len(calls) == n, 'повторный прогон сразу — без запросов')
st = store['glonass.json']; st['ts_trk'] -= 21 * 60; js('glonass.json', st); n = len(calls); run()
check(calls[n:] == ['GetTrack'], 'через 21 минуту — только трек за сегодня (вчерашний окончательный)', calls[n:])
st = store['glonass.json']; st['ts_trk'] -= 21 * 60; st['ts_now'] -= 6 * 60; js('glonass.json', st); MODE['trk'] = '500'; n = len(calls); r = run()
G2 = pub_['gl.bin']
check(r['state'] == 'частично' and 'треки за' in (r['err'] or '') and G2['tracks'][Y]['D1'] and G2['cars'], 'GetTrack ответил 500 — «частично», ошибка видна, прежние треки и машины на месте', r)
check(store['glonass.json']['ok_trk'] is False, 'неудача — повтор через 10 минут (ok_trk=false)')
# старый gl.bin без треков: страница и скрипт бота работают как раньше — проверяет test_tracks_page.py
_wr(json.dumps(G, ensure_ascii=False), os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sample_gl.json'), 'w')
print('ALL OK', ok)
