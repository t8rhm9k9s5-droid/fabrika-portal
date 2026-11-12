"""«Фабрика» — свежесть данных портала к 12:00, без Claude (12.11.2026).
Т. В. 12.11: «если к 12-00 на портале нет свежих данных — мне уведомление от портала минуя тебя должно приходить в бота».
Рабочий день, первый прогон робота с 12:00 до 14:00 МСК, один раз за день: что не пришло из ожидаемых отчётов (status.expect, как проверка 10:35),
есть ли выпуск за прошлый рабочий день (ls.bin out.date) и собирался ли сайт сегодня (VERSION в sw.js — онлайн-цены и разделы выкладываются
сборкой). Есть пропуски — alert() (бот Telegram → Т. В.), всё свежее — молчит. Состояние — state/fresh12.json. Python 3.6."""
import datetime, os, re

MSK = datetime.timezone(datetime.timedelta(hours=3))


def _dm(s):
    s = str(s or '')
    return s[8:10] + '.' + s[5:7] if len(s) >= 10 else (s or '—')


def site_built(site_dir):
    """→ datetime сборки сайта по МСК (VERSION 'ГГГГММДДччммсс-…' в sw.js — время UTC) или None"""
    try:
        m = re.search(r"const VERSION = '(\d{14})", open(os.path.join(site_dir, 'sw.js'), encoding='utf-8').read(200000))
        if not m: return None
        return datetime.datetime.strptime(m.group(1), '%Y%m%d%H%M%S').replace(tzinfo=datetime.timezone.utc).astimezone(MSK)
    except Exception: return None


def run(expect, out, site_dir, alert, now, is_workday, prev_workday, jload, jsave):
    today = now.date()
    if not is_workday(today) or (now.hour, now.minute) < (12, 0) or now.hour >= 14: return {'state': 'не время'}
    st = jload('fresh12.json', {})
    if st.get('day') == today.isoformat(): return {'state': st.get('state'), 'day': st.get('day')}
    miss = []
    for x in expect or []:
        if isinstance(x, dict) and x.get('ok') is False:
            miss.append('%s — нет за %s' % (x.get('n') or x.get('k'), _dm(x.get('want'))))
    pw = prev_workday(today).isoformat(); od = str((out or {}).get('date') or '')[:10]
    if od != pw: miss.append('выпуск производства за %s — на портале только за %s' % (_dm(pw), _dm(od)))
    b = site_built(site_dir)
    if not b or b.date() < today:
        miss.append('портал сегодня не обновлялся (последняя сборка %s) — онлайн-цены и разделы со вчерашними данными' % (b.strftime('%d.%m %H:%M') if b else '—'))
    st = {'day': today.isoformat(), 'state': 'всё свежее' if not miss else 'нет свежих: %d' % len(miss), 'miss': miss}
    if miss:
        st['r'] = str(alert('fresh12:' + today.isoformat(), 'Фабрика: к 12:00 на портале нет свежих данных\n' + '\n'.join('• ' + m for m in miss[:12]) +
                            '\nПроверил робот хостинга (без Claude).'))[:120]
    jsave('fresh12.json', st)
    return st
