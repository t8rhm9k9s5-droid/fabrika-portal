"""«Фабрика» — сводка выпуска Т. В. в Telegram без Claude (12.11.2026).
Т. В. 12.11: «все сборщики отчётов на сайте должны быть автономны от тебя». Заменяет облачную «проверку выпуска 11:10»:
робот сам, в рабочий день после 11:05 МСК, когда выпуск за прошлый рабочий день разобран (out.date), один раз за дату шлёт
через alert() (бот Telegram → Т. В.): % плана по участкам за день и к дате, кто отстаёт, каких строк нет, какие отчёты не пришли.
Нет данных — молчит (о непришедших отчётах уже сообщает проверка 10:35). Python 3.6."""
import datetime

NAMES = {'1': 'каркасы', '2': 'сварка', '3': 'мягкая мебель', '4': 'кресла', '5': 'ГКИ/ТПА', '6': 'Изо/Стандарты/покраска',
         '7': 'упаковка', '8': 'гальваника'}
LAG = 80          # ниже, % к дате — «отстаёт»
WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']


def _num(x):
    try: return float(x)
    except (TypeError, ValueError): return None


def _pct(f, p): return int(round(100.0 * f / p)) if p else None


def compose(out, expect):
    """→ текст или None (нет участков с планом)"""
    if not isinstance(out, dict) or not isinstance(out.get('areas'), dict) or not out.get('date'): return None
    rows, lag, miss = [], [], []
    for k in sorted(out['areas'], key=lambda x: (len(str(x)), str(x))):
        a = out['areas'][k] or {}
        dp = df = mp = mf = 0.0; has = False
        for ln in a.get('lines') or []:
            d, m = ln.get('day') or {}, ln.get('month') or {}
            p, f = _num(d.get('plan')), _num(d.get('fact'))
            if p:
                has = True; dp += p
                if f is None: miss.append('«%s» (уч. %s)' % (ln.get('n') or '?', k))
                else: df += f
            pt, mft = _num(m.get('plan_to_date')), _num(m.get('fact'))
            if pt: mp += pt; mf += (mft or 0)
        if not has and not mp: continue
        d_pct, m_pct = _pct(df, dp), _pct(mf, mp)
        rows.append('Уч. %s %s — %s дня / %s к дате' % (k, NAMES.get(str(k), ''), '%d%%' % d_pct if d_pct is not None else '—',
                                                      '%d%%' % m_pct if m_pct is not None else '—'))
        if m_pct is not None and m_pct < LAG: lag.append('уч. %s (%d%%)' % (k, m_pct))
    if not rows: return None
    try:
        dd = datetime.date(*map(int, str(out['date'])[:10].split('-'))); ds = '%s (%s)' % (dd.strftime('%d.%m'), WD[dd.weekday()])
    except Exception: ds = str(out['date'])
    t = ['Фабрика: выпуск за ' + ds] + rows
    if lag: t.append('Отстают от плана к дате: ' + ', '.join(lag))
    if miss: t.append('Нет строк в отчёте: ' + ', '.join(miss[:8]))
    nx = [str(x.get('n') or x.get('k')) for x in (expect or []) if isinstance(x, dict) and x.get('ok') is False]
    if nx: t.append('Не пришли: ' + '; '.join(nx[:6]))
    return '\n'.join(t)


def run(out, expect, alert, now, is_workday, prev_workday, jload, jsave):
    """→ {'state': ...}; alert(key, text) — оповещение робота (бот → Telegram Т. В.)"""
    today = now.date()
    if not is_workday(today) or (now.hour, now.minute) < (11, 5): return {'state': 'не время'}
    want = prev_workday(today).isoformat()
    d = str((out or {}).get('date') or '')[:10]
    if d != want: return {'state': 'ждём выпуск за %s (есть %s)' % (want, d or '—')}
    st = jload('vyp_note.json', {})
    if st.get('sent') == d: return {'state': 'отправлено', 'date': d}
    if 'sent' not in st:                                  # первое включение: за текущую дату уже доложила облачная проверка — не дублировать
        st['sent'] = d; jsave('vyp_note.json', st); return {'state': 'включено', 'date': d}
    text = compose(out, expect)
    if not text: st['sent'] = d; jsave('vyp_note.json', st); return {'state': 'нет участков с планом', 'date': d}
    r = alert('vyp-note:' + d, text)
    st['sent'] = d; st['r'] = str(r)[:120]; jsave('vyp_note.json', st)
    return {'state': 'отправлено', 'date': d, 'r': str(r)[:120]}
