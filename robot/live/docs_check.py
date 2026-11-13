# -*- coding: utf-8 -*-
"""Проверка целостности портала по реестру (13.11.2026, Т. В.: «раз в сутки проверка целостности портала и всех его документов;
реестр проверяй каждый день — документы должны отзываться по реестру»).
Реестр — code/docs_registry.json (собирается вместе с сайтом, docs_registry.py): каждый файл портала → зашифрованный блок b/<sha256[:24]>.bin.
Раз в сутки (первый прогон после 07:00 МСК): блок есть на хостинге, размер не нулевой, sha256 содержимого совпадает с именем; m.bin — та же сборка.
Итог — status.docs; есть проблемы — оповещение владельцу в Telegram (через live.alert в lb.bin, бот «Фабрика»)."""
import hashlib, json, os, time, datetime

HERE = os.path.dirname(os.path.abspath(__file__))


def _sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for ch in iter(lambda: f.read(1 << 20), b''): h.update(ch)
    return h.hexdigest()


def run(SITE, jload, jsave, log, force=False):
    now = datetime.datetime.utcnow() + datetime.timedelta(hours=3)
    day = now.strftime('%Y-%m-%d')
    st = jload('docs_check.json', {}) or {}
    if not force and (st.get('day') == day or now.hour < 7): return st.get('last')
    rp = os.path.join(HERE, 'docs_registry.json')
    if not os.path.exists(rp): return {'t': now.strftime('%Y-%m-%dT%H:%M'), 'state': 'нет реестра'}
    with open(rp, encoding='utf-8') as f: R = json.load(f)
    t0 = time.time(); bad = []
    for it in R.get('items') or []:
        p = os.path.join(SITE, 'b', it['b'])
        why = None
        if not os.path.exists(p): why = 'нет файла'
        elif os.path.getsize(p) == 0: why = 'пустой'
        elif _sha(p)[:24] + '.bin' != it['b']: why = 'повреждён'
        if why: bad.append({'p': it['p'], 't': it.get('t') or '', 'k': it.get('k'), 'why': why})
    mp = os.path.join(SITE, 'm.bin')
    m_ok = os.path.exists(mp) and _sha(mp) == R.get('m_sha')
    res = {'t': now.strftime('%Y-%m-%dT%H:%M'), 'state': 'ok' if not bad and m_ok else 'есть проблемы', 'reg_t': R.get('t'),
           'n': R.get('n'), 'docs': R.get('docs'), 'bad_n': len(bad), 'bad_docs': sum(1 for b in bad if b['k'] == 'doc'),
           'bad': bad[:40], 'm_ok': m_ok, 'sec': round(time.time() - t0, 1)}
    st.update({'day': day, 'last': res}); jsave('docs_check.json', st)
    log('проверка портала по реестру: файлов %s, документов %s; не на месте %d (документов %d); m.bin %s; %.1f с' %
        (res['n'], res['docs'], res['bad_n'], res['bad_docs'], 'та же сборка' if m_ok else 'НЕ совпадает с реестром', res['sec']))
    return res


def alert_of(res):
    """→ {id, text} для live.alert (бот шлёт в Telegram один раз на id) или None"""
    if not res or res.get('state') == 'ok' or res.get('state') == 'нет реестра': return None
    names = [b['t'] or b['p'] for b in res.get('bad') or [] if b.get('k') == 'doc'][:6] or [b['p'] for b in res.get('bad') or []][:6]
    txt = 'Портал: проверка по реестру %s — не на месте %d из %d файлов (документов %d)%s.%s' % (
        res['t'][8:10] + '.' + res['t'][5:7], res['bad_n'], res.get('n') or 0, res['bad_docs'],
        ': ' + '; '.join(names) if names else '', '' if res.get('m_ok') else ' Карта сайта (m.bin) не совпадает с реестром — сборка выложена не полностью.')
    return {'id': 'docs-%s-%d-%d' % (res['t'][:10], res['bad_n'], 0 if res.get('m_ok') else 1), 'text': txt[:900], 'miss': ['docs']}
