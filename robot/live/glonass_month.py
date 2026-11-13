"""«Фабрика» — ТК ГЛОНАСС: архив за месяц для сверки (11.11.2026).
Т. В. 11.11.2026: «возьми за октябрь все путевые листы по грузовым автомобилям и сопоставь с треками GPS, выяви отклонения»;
«проверь моточасы с фактическим временем нахождения на работе по СКУД».
На хостинге ГЛОНАСС хранит только сегодня и вчера (glonass.py). Этот модуль по файлу code/glonass_month.json {"month": "2026-10"}
собирает по дням месяца рейсы, пробег, время в движении, стоянки и простои по всем ТС (тот же day_data, что у glonass.py; только чтение API),
копит state/glonass_month_<месяц>.json (за прогон — сколько успеет за BUDGET секунд), а когда собраны все дни —
публикует st/glm.bin ключом владельца (OWNER_BINS в live.py). Нет файла или месяц собран — ничего не делает.
Пароль и токен не пишутся ни в журнал, ни в файлы (Session из glonass.py). Python 3.6."""
import datetime, json, os, re, time
import glonass as GL

BUDGET = 110
NUM_KEY = re.compile(r'MH|Moto|Engine|Fuel|Dist|Run|Mileage|Duration|Time|Speed|Odo|Fill|Drain|Consum', re.I)


def _cfg(L):
    try:
        with open(os.path.join(L, 'code', 'glonass_month.json'), encoding='utf-8') as _cg1_file_1:
            return json.load(_cg1_file_1)
    except Exception: return {}


def _nums(o, out=None, pre=''):
    """из сырого Total — только числовые поля с понятными именами (моточасы, топливо, пробег, время)"""
    out = {} if out is None else out
    if isinstance(o, dict):
        for k, v in list(o.items())[:80]:
            kk = (pre + '.' + str(k)) if pre else str(k)
            if isinstance(v, (int, float)) and not isinstance(v, bool) and NUM_KEY.search(kk): out[kk[:60]] = v
            elif isinstance(v, (dict, list)) and len(pre) < 40: _nums(v, out, kk)
    elif isinstance(o, list):
        for i, v in enumerate(o[:3]): _nums(v, out, '%s[%d]' % (pre, i))
    return out


def _row(r, total):
    stops = [{'sd': s.get('sd'), 'ed': s.get('ed'), 'min': s.get('min'), 'k': s.get('k'), 'zone': s.get('zone'),
              'lat': s.get('lat'), 'lng': s.get('lng')} for s in (r.get('stops') or []) if (s.get('min') or 0) >= 10][:60]
    return {'km': r.get('km'), 'move_h': r.get('move_h'), 'park_h': r.get('park_h'), 'idle_h': r.get('idle_h'), 'trips': r.get('trips'),
            'stops': stops, 'tot': _nums(total) if total else {}}


def run(L, log, jload, jsave, publish, iso):
    c = _cfg(L); m = str(c.get('month') or '')
    if not re.match(r'^\d{4}-\d{2}$', m): return {'state': 'выключено'}
    name = 'glonass_month_%s.json' % m
    st = jload(name, {'month': m, 'days': {}, 'vrn': {}, 'names': {}})
    if st.get('published'): return {'state': 'готово', 'month': m, 'days': len(st.get('days') or {})}
    user, pw, mt = GL.creds(L)
    if user is None: return {'state': 'нет ключа'}
    tok_only = '' if (user and pw) else GL.file_token(L)
    ref = jload('glonass_ref.json', {})
    if not ref.get('schemas'): return {'state': 'ждём справочник ГЛОНАСС'}
    ids = (jload('glonass.json', {}) or {}).get('ids') or {}
    y, mo = map(int, m.split('-'))
    d, last = datetime.date(y, mo, 1), (datetime.date(y + (mo == 12), mo % 12 + 1, 1) - datetime.timedelta(days=1))
    today = datetime.datetime.utcnow().date()
    deadline = time.time() + BUDGET
    S = GL.Session(L, user, pw, mt, tok_only)
    got, err = 0, ''
    for k, v in ((ref.get('devices') or {}).items()):
        if isinstance(v, dict) and v.get('name'): st['names'][k] = str(v.get('name'))[:80]
    while d <= last and d < today:
        k = d.isoformat()
        if k not in st['days']:
            if time.time() > deadline - 25: break
            try:
                rows, hits, dbg, vrn = GL.day_data(S, ref, ids, d, deadline)
            except Exception as e:
                err = (str(e)[:160] or e.__class__.__name__); log('  ! глонасс месяц', k, err); break
            raw = dbg.get('raw_total') or {}
            st['days'][k] = {str(r['id']): _row(r, raw.get(r['id'])) for r in rows if r.get('id')}
            for a, b in (vrn or {}).items(): st['vrn'][str(a)] = str(b)[:20]
            got += 1
        d += datetime.timedelta(days=1)
    need = (last - datetime.date(y, mo, 1)).days + 1
    st['t'] = (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).strftime('%Y-%m-%dT%H:%M')
    st['err'] = err
    if len(st['days']) >= need:
        publish('glm.bin', {'t': st['t'], 'month': m, 'days': st['days'], 'vrn': st['vrn'], 'names': st['names'], 'devices': ref.get('devices') or {}})
        st['published'] = st['t']
        log('глонасс месяц', m, ': собрано', len(st['days']), 'дн., st/glm.bin опубликован')
    jsave(name, st)
    return {'state': 'готово' if st.get('published') else 'собираю', 'month': m, 'days': len(st['days']), 'need': need, 'now': got, 'err': err}
