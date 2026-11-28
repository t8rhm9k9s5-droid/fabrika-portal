# -*- coding: utf-8 -*-
"""Видеонаблюдение завода (Dahua) → портал и бот (19.11.2026, Т. В.: «вопрос по видеонаблюдению — Сотрудник5 всё прислал, надо делать»).
Источник — письма регистраторов с user32@example.org на 1c@ (тема «NVR ALERT» / «Тест»), реестр state/arch_index.jsonl (itm_arch.py:
у писем cctv@ — начало текста 'x' и снимки .jpg в arch/files, SVC_FROM / CCTV_FROM).
Что делает:
  1) st/cam.bin — события за 3 суток (камера, вид события, начало/конец, ночь/периметр), сводка по камерам и регистраторам;
  2) снимки событий периметра и ночные — зашифрованными файлами st/f/<sha>.bin (publish_file), не больше SNAP_MAX за прогон;
  3) ночью (20:00–07:00) движение/линия/вторжение на камерах периметра и ворот → alert(critical) → письмо, MAX, бот Telegram;
     не чаще раза в час на камеру и не больше NIGHT_MAX сообщений за ночь (в сообщении — сколько событий было с прошлого);
  4) «регистратор на связи»: регистратор молчит дольше SILENT_H часов → alert (раз в 6 ч, ночью — утром);
  5) системные события (потеря видео, сеть, диск) → alert.
IP-адресов и паролей в публикуемых данных нет: регистраторы называются «Регистратор 1/2»."""
import json, os, re, datetime

FROM = 'user32@example.org'
DAYS = 3
NVR = {'249': 'Регистратор 1', '250': 'Регистратор 2'}      # по последнему числу адреса в письме; адрес на портал не идёт
PERIM = re.compile(r'ворот|периметр|проходн|собак|забор|парковк|перекр|гкз улица', re.I)
SYS = re.compile(r'потер|видео ?сигн|сет|диск|hdd|disk|network|video ?loss|ip.?конфл', re.I)
SNAP_MAX = 40
SNAP_KEEP_H = 48                                 # 20.11.2026, Т. В.: «снимки на портале — 2 суток максимум, потом удаляются вообще»
NIGHT_MAX = 6
SILENT_H = 12
GAP_MIN = 60
# 19.11.2026, Т. В.: «ключевых событий не зафиксировано: пересечение периметра, проезд машин, в каких помещениях движение, в какое время,
#   соответствуют ли рабочему графику; не соответствует — оповещение Сотрудник37 и объяснение, почему там находились люди».
WORK_FROM, WORK_TO = '07:30', '20:00'            # рабочий график по умолчанию: пн–пт; сб, вс и вне этих часов — «вне графика»
IT_TO, IT_CC = ['user33@example.org'], ['user2@example.org']   # 19.11.2026: сисадмин Сотрудник50 И. В., копия — тех. директор; 28.11: itm@ в копию не ставим (Т. В. 16.11: ящик не трогаем)
IT_AT, IT_MIN_CAMS, IT_MAX = '08:30', 6, 3
SEC_TO = ['user11@example.org']               # начальник сторожевой службы Сотрудник37 С. В.
SEC_CC = ['user2@example.org']                    # Сотрудник1 А. В. — видеонаблюдение
SEC_AT = '07:40'                                 # утренняя сводка «вне графика» за ночь — раз в день
# 23.11.2026, Сотрудник50 И. В.: обходы охраны 21:00, 24:00, 4:00, 6:00 (25–30 мин) и перерывы 21:50–22:00, 01:50–02:00, 03:00–04:00, 06:20–06:30 —
#   «эти периоды нужно исключить из учёта»: в ленте событие остаётся (с пометкой), но тревог ночью и вопросов Сотрудник37 по нему нет
GUARD = [('21:00', '21:30'), ('21:50', '22:00'), ('00:00', '00:30'), ('01:50', '02:00'), ('03:00', '04:30'), ('06:00', '06:30')]


def _guard(t):
    hm = (t or '')[11:16]
    return any(a <= hm < b for a, b in GUARD)

NAME_SEED = {'250|52': '052_Ворота', '250|50': '050_Периметр', '249|2': '002_Гараж', '249|3': '003_Часовня', '250|16': '016_Сборка Престиж'}

X_RX = {
    'ev': re.compile(r'Трев\.\s*событие:\s*(.+?)\s*(?:/|№ входного|Имя канала|Начало|Окончание|Имя трев|$)'),
    'ch': re.compile(r'№ входного канала тревоги:\s*(\d+)'),
    'name': re.compile(r'Имя канала тревожного входа:\s*(.+?)\s*(?:/|Начало|Окончание|Имя трев|$)'),
    'beg': re.compile(r'Начало\([^)]*\)\)?:\s*(\d\d)/(\d\d)/(\d{4})\s+(\d\d):(\d\d):(\d\d)'),
    'end': re.compile(r'Окончание\([^)]*\)\)?:\s*(\d\d)/(\d\d)/(\d{4})\s+(\d\d):(\d\d):(\d\d)'),
    'ip': re.compile(r'IP адрес:\s*\d+\.\d+\.\d+\.(\d+)'),
}
SNAP_RX = re.compile(r'^ch(\d+)_(\d{8})_(\d{6})', re.I)


def _dt(m):
    d, mo, y, h, mi, s = m.groups()
    return '%s-%s-%sT%s:%s:%s' % (y, mo, d, h, mi, s)


def _kind(ev):
    e = ev.lower()
    if 'тест' in e or e == 'test': return 'test'
    if 'движ' in e or 'motion' in e: return 'motion'
    if 'линии' in e or 'tripwire' in e or 'cross' in e: return 'line'
    if 'вторж' in e or 'intrusion' in e or 'зон' in e: return 'zone'
    if 'чел' in e or 'human' in e or 'smd' in e: return 'human'
    if SYS.search(e): return 'sys'
    return 'other'


KIND_RU = {'motion': 'движение', 'line': 'пересечение линии', 'zone': 'вторжение в зону', 'human': 'человек/машина', 'sys': 'системное', 'test': 'проверка связи', 'other': 'событие'}


def parse(r):
    """строка реестра → событие или None"""
    x = r.get('x') or ''
    s = r.get('s') or ''
    ev = {'mt': r.get('t') or ''}
    m = X_RX['ev'].search(x)
    raw_ev = (m.group(1).strip() if m else s).strip()
    ev['end'] = bool(re.search(r'\b(clear|кон\.?|конец|stop)\b', raw_ev, re.I))
    raw_ev = re.sub(r'\s*\b(Clear|Кон\.?|Start|Начало)\s*$', '', raw_ev, flags=re.I).strip()
    ev['ev'] = raw_ev[:60]
    ev['k'] = 'test' if s.strip().lower() in ('тест', 'test') else _kind(raw_ev)
    m = X_RX['ch'].search(x); ev['ch'] = int(m.group(1)) if m else None
    m = X_RX['name'].search(x); ev['name'] = m.group(1).strip()[:60] if m else ''
    m = X_RX['beg'].search(x) or X_RX['end'].search(x); ev['t'] = _dt(m) if m else ''
    m = X_RX['ip'].search(x); ev['nvr'] = NVR.get(m.group(1), 'Регистратор ?') if m else ''
    snaps = [a for a in r.get('a') or [] if re.search(r'\.jpe?g$', a.get('n') or '', re.I)]
    if snaps:
        ev['snap'] = snaps[0].get('sha') if snaps[0].get('p') else None
        ev['snap_n'] = snaps[0].get('n')
        sm = SNAP_RX.match(snaps[0].get('n') or '')
        if sm:
            if ev['ch'] is None: ev['ch'] = int(sm.group(1))
            if not ev['t']:
                d, t = sm.group(2), sm.group(3)
                ev['t'] = '%s-%s-%sT%s:%s:%s' % (d[:4], d[4:6], d[6:], t[:2], t[2:4], t[4:])
    if not x and not snaps and ev['k'] != 'test': return None
    if not ev['t']: ev['t'] = (ev['mt'] + ':00') if len(ev['mt']) == 16 else ev['mt']
    if not ev['name'] and ev['ch'] is not None: ev['name'] = 'канал %d' % ev['ch']
    h = int(ev['t'][11:13]) if len(ev['t']) >= 13 else 12
    ev['night'] = h >= 20 or h < 7
    ev['perim'] = bool(PERIM.search(ev['name']))
    return ev


# 23.11.2026, Т. В. (опрос «Только ночь 23:00–05:00»), после ответа Сотрудник37 С. В.: у этих камер графика нет —
#   011 парковка (дорога общего пользования) и 003 часовня (срабатывает на фары) — не фиксировать совсем;
#   052 ворота и 002 гараж — «вне графика» только ночью 23:00–05:00 (любой день). Остальные камеры — как раньше.
CAM_SCHED = [(re.compile(r'^0*11(?!\d)|парковк', re.I), None), (re.compile(r'^0*3(?!\d)|часовн', re.I), None),
             (re.compile(r'^0*52(?!\d)|ворот', re.I), ('23:00', '05:00')), (re.compile(r'^0*2(?!\d)|гараж', re.I), ('23:00', '05:00'))]


def _off(t, name=''):
    try: d = datetime.datetime.strptime(t[:16], '%Y-%m-%dT%H:%M')
    except Exception: return False
    hm = t[11:16]
    for rx, win in CAM_SCHED:
        if name and rx.search(name):
            if win is None: return False
            return hm >= win[0] or hm < win[1]
    return d.weekday() >= 5 or hm < WORK_FROM or hm >= WORK_TO


def _read(L, since):
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    out, seen = [], set()
    if not os.path.exists(idx): return out
    with open(idx, encoding='utf-8') as f:
        for ln in f:
            if FROM not in ln: continue
            try: r = json.loads(ln)
            except Exception: continue
            if (r.get('fr') or '').lower() != FROM or (r.get('t') or '') < since: continue
            k = r.get('mid') or (r.get('t'), r.get('s'), r.get('u'))
            if k in seen: continue
            seen.add(k)
            e = parse(r)
            if e: out.append(e)
    out.sort(key=lambda e: e['t'])
    return out


def _snap_path(L, sha, n):
    for ext in ('.jpg', '.jpeg'):
        p = os.path.join(L, 'arch', 'files', sha + ext)
        if os.path.exists(p): return p
    return None


def run(L, log, jload, jsave, publish, publish_file, alert, now, mail_send=None):
    st = jload('cctv.json', {}) or {}
    t_now = now.strftime('%Y-%m-%dT%H:%M:%S')
    since = (now - datetime.timedelta(days=DAYS)).strftime('%Y-%m-%dT%H:%M')
    evs = _read(L, since)
    res = {'t': t_now[:16], 'n': len(evs)}
    # — имена каналов: из писем, где имя есть; старые письма без текста получают имя по каналу
    nm = st.setdefault('names', dict(NAME_SEED))
    for e in evs:
        nv_ = (e.get('nvr') or '').replace('Регистратор 1', '249').replace('Регистратор 2', '250')
        if e['ch'] is not None and e['name'] and not e['name'].startswith('канал '): nm['%s|%s' % (nv_, e['ch'])] = e['name']
    byc = {}
    for k_, v_ in nm.items(): byc.setdefault(k_.split('|')[1], set()).add(v_)
    for e in evs:
        if e['ch'] is not None and e['name'].startswith('канал '):
            nv_ = (e.get('nvr') or '').replace('Регистратор 1', '249').replace('Регистратор 2', '250')
            v_ = nm.get('%s|%s' % (nv_, e['ch'])) or (list(byc[str(e['ch'])])[0] if len(byc.get(str(e['ch'])) or ()) == 1 else None)
            if v_:
                e['name'] = v_; e['perim'] = bool(PERIM.search(v_))
                if not e.get('nvr'): e['nvr'] = {'249': 'Регистратор 1', '250': 'Регистратор 2'}.get([k for k, x in nm.items() if x == v_][0].split('|')[0], '')
        e['off'] = _off(e['t'], e.get('name') or '')
        e['zone'] = 'perim' if e['perim'] else 'room'
        e['guard'] = _guard(e['t'])
        e['key'] = (not e['end']) and e['k'] not in ('test', 'sys') and e['off'] and not e['guard']
    # — снимки: периметр и ночь, свежие первыми
    pubs = set(st.get('snaps') or [])
    edge = (now - datetime.timedelta(hours=SNAP_KEEP_H)).strftime('%Y-%m-%dT%H:%M')
    want = [e for e in reversed(evs) if e.get('snap') and e['t'][:16] >= edge and (e['perim'] or e['night'] or e.get('key'))][:SNAP_MAX]
    nsnap = 0
    for e in want:
        if e['snap'] in pubs: continue
        p = _snap_path(L, e['snap'], e.get('snap_n'))
        if not p: e['snap'] = None; continue
        try:
            with open(p, 'rb') as f: raw = f.read()
            if publish_file(e['snap'], raw): pubs.add(e['snap']); nsnap += 1
        except Exception as ex: log('  ! камеры: снимок', ex.__class__.__name__, ex)
    # 20.11.2026: снимок живёт на портале не дольше SNAP_KEEP_H часов от события — потом файл st/f/<id>.bin удаляется с хостинга
    snapt = st.get('snapt') or {}
    for e in evs:
        if e.get('snap') and e['snap'] in pubs and e['snap'] not in snapt: snapt[e['snap']] = e['t'][:16]
    dropped = 0
    try: fdir = os.path.join(publish_file.__globals__['SITE'], 'st', 'f')
    except Exception: fdir = None
    for fid in list(pubs):
        tt = snapt.get(fid)
        if tt is None or tt >= edge: continue
        if fdir and re.match(r'^[0-9a-f]{16,40}$', fid):
            try: os.remove(os.path.join(fdir, fid + '.bin'))
            except FileNotFoundError: pass
            except Exception as ex: log('  ! камеры: снимок не удалён', ex.__class__.__name__); continue
        pubs.discard(fid); snapt.pop(fid, None); dropped += 1
    for e in evs:
        if e.get('snap') and e['t'][:16] < edge: e['snap'] = None
    st['snapt'] = {k: v for k, v in snapt.items() if k in pubs}; res['snaps_dropped'] = dropped
    st['snaps'] = list(pubs)[-400:]
    for e in evs:
        if e.get('snap') and e['snap'] not in pubs: e['snap'] = None
    res['snaps'] = nsnap
    # — регистраторы: последнее письмо и последняя проверка связи
    nv = st.setdefault('nvr', {})
    for e in evs:
        if not e.get('nvr'): continue
        n = nv.setdefault(e['nvr'], {})
        if e['mt'] > (n.get('last') or ''): n['last'] = e['mt']
        if e['k'] == 'test' and e['mt'] > (n.get('test') or ''): n['test'] = e['mt']
    for name, n in nv.items():
        try: age = (now.replace(tzinfo=None) - datetime.datetime.strptime(n['last'][:16], '%Y-%m-%dT%H:%M')).total_seconds() / 3600
        except Exception: age = None
        n['ok'] = age is not None and age < SILENT_H
        if age is not None and age >= SILENT_H:
            alert('cctv_silent:' + name, 'Фабрика: видеонаблюдение — %s не присылал писем %d ч (последнее %s МСК). Проверьте, на связи ли регистратор '
                  'и работает ли отправка почты (Сотрудник50 И. В.).' % (name, int(age), n['last'].replace('T', ' ')))
    # — оповещения: только новые события после отметки (первый запуск — без «хвоста»)
    mark = st.get('mark') or t_now
    night_day = (now - datetime.timedelta(hours=7)).strftime('%Y-%m-%d')
    if st.get('night_day') != night_day: st['night_day'], st['night_n'] = night_day, 0
    last_cam = st.setdefault('last_cam', {})
    pend = st.setdefault('pend', {})
    sent = []
    for e in evs:
        if e['t'] <= mark or e['end'] or e['k'] == 'test': continue
        key = (e.get('nvr') or '') + '|' + e['name']
        if e['k'] == 'sys':
            alert('cctv_sys:%s:%s' % (key, e['ev']), 'Фабрика: видеонаблюдение — %s: %s (%s), %s МСК.' % (e['name'] or e.get('nvr') or 'регистратор', e['ev'], e.get('nvr') or '', e['t'][11:16]))
            continue
        if not (e['night'] and e['perim']) or e.get('guard'): continue
        pend[key] = (pend.get(key) or 0) + 1
        lt = last_cam.get(key) or ''
        try: gap = (datetime.datetime.strptime(e['t'][:19], '%Y-%m-%dT%H:%M:%S') - datetime.datetime.strptime(lt[:19], '%Y-%m-%dT%H:%M:%S')).total_seconds() / 60 if lt else 1e9
        except Exception: gap = 1e9
        if gap < GAP_MIN or st['night_n'] >= NIGHT_MAX: continue
        n = pend.pop(key, 1)
        last_cam[key] = e['t']; st['night_n'] += 1
        more = (' (событий с прошлого сообщения: %d)' % n) if n > 1 else ''
        txt = ('Фабрика: камера %s — %s в %s МСК%s. Снимок — на портале: «План» → камера %s.'
               % (e['name'], KIND_RU.get(e['k'], 'событие'), e['t'][11:16], more, e['name'].split('_')[0]))
        r = alert('cctv_night:%s:%s' % (key, e['t'][:16]), txt, critical=True)
        sent.append({'cam': e['name'], 't': e['t'][11:16], 'r': str(r)[:60]})
    if evs: st['mark'] = max(mark, evs[-1]['t'])
    elif not st.get('mark'): st['mark'] = t_now
    res['night_sent'] = sent
    # — сводка по камерам
    day_ago = (now - datetime.timedelta(hours=24)).strftime('%Y-%m-%dT%H:%M')
    cams = {}
    for e in evs:
        if e['k'] == 'test' or e['end']: continue
        c = cams.setdefault((e.get('nvr') or '') + '|' + e['name'], {'name': e['name'], 'nvr': e.get('nvr') or '', 'ch': e['ch'], 'n24': 0, 'n3': 0, 'night': 0, 'last': '', 'perim': e['perim']})
        c['n3'] += 1
        if e['t'] >= day_ago: c['n24'] += 1
        if e['night']: c['night'] += 1
        if e['t'] > c['last']: c['last'] = e['t']
    items = [{'t': e['t'], 'k': e['k'], 'ev': e['ev'], 'name': e['name'], 'ch': e['ch'], 'nvr': e.get('nvr') or '', 'night': e['night'],
              'perim': e['perim'], 'snap': e.get('snap'), 'off': e.get('off'), 'key': e.get('key'), 'guard': e.get('guard')} for e in reversed(evs) if not e['end'] and e['k'] != 'test'][:400]
    # — утренняя сводка Сотрудник37: события вне рабочего графика с прошлой сводки (периметр и помещения), просьба объяснить
    kul = st.get('kul') or {}
    today = t_now[:10]
    if mail_send and t_now[11:16] >= SEC_AT and kul.get('day') != today:
        frm = kul.get('t') or (now - datetime.timedelta(hours=14)).strftime('%Y-%m-%dT%H:%M:%S')
        K = [e for e in evs if e.get('key') and frm < e['t'] <= t_now]
        if K:
            grp = {}
            for e in K: grp.setdefault(e['name'], []).append(e)
            L_ = []
            for name in sorted(grp, key=lambda n: grp[n][0]['t']):
                es = grp[name]; ts = ', '.join(sorted({x['t'][8:10] + '.' + x['t'][5:7] + ' ' + x['t'][11:16] for x in es})[:12])
                L_.append('• %s (%s): %d %s — %s' % (name, 'периметр/ворота' if es[0]['perim'] else 'помещение', len(es), 'событ.' , ts))
            txt = ('Добрый день!\n\nПо камерам завода вне рабочего графика (будни %s–%s, выходные — весь день) зафиксировано движение:\n\n%s\n\n'
                   'Подскажите, пожалуйста, ответом на это письмо: кто находился в этих местах в это время и по какой причине (обход охраны, смена, разгрузка, '
                   'посторонние). Снимки событий — на портале «Фабрика», раздел «Видеонаблюдение».\n\nСпасибо!\nПортал «Фабрика» (по поручению Т. В. Сотрудник1)'
                   % (WORK_FROM, WORK_TO, '\n'.join(L_)))
            r = mail_send('Видеонаблюдение: движение вне рабочего графика %s — нужно пояснение' % (today[8:10] + '.' + today[5:7]), txt, SEC_TO, SEC_CC)
            if str(r).startswith('ok'): st['kul'] = {'day': today, 't': t_now, 'n': len(K), 'cams': len(grp)}
            res['kul'] = str(r)[:60]
        else:
            st['kul'] = {'day': today, 't': t_now, 'n': 0, 'cams': 0}
    # — 19.11.2026, Т. В. «надо автоматизировать роботом»: ночные оповещения включает сисадмин; робот сам по утрам смотрит, сколько камер прислали
    #   события за ночь 20:00–07:00, и если меньше IT_MIN_CAMS — одно мягкое письмо Сотрудник5 (не чаще раза в рабочий день, всего не больше IT_MAX раз)
    it = st.get('it') or {}
    if mail_send and now.weekday() < 5 and t_now[11:16] >= IT_AT and it.get('day') != today:
        n0 = (now - datetime.timedelta(days=1)).strftime('%Y-%m-%d') + 'T20:00'; n1 = today + 'T07:00'
        ncams = sorted({e['name'] for e in evs if n0 <= e['t'] < n1 and e['k'] != 'test'})
        it.update({'day': today, 'cams': len(ncams)})
        if len(ncams) >= IT_MIN_CAMS: it['ok'] = today
        elif int(it.get('sent') or 0) < IT_MAX:
            txt = ('Сотрудник5, добрый день!\n\nЗа ночь (%s 20:00 — %s 07:00) события прислали только %d камер(ы)%s. Для ночного контроля нужны оповещения '
                   'о движении/пересечении линии 20:00–07:00 на всех камерах периметра, ворот и складов, письмом на ящик видеонаблюдения, как сейчас.\n\n'
                   'Подскажите, пожалуйста, когда получится включить, или что мешает — поможем.\n\nСпасибо!\nПортал «Фабрика» (по поручению Т. В. Сотрудник1)'
                   % (n0[8:10] + '.' + n0[5:7], today[8:10] + '.' + today[5:7], len(ncams), (': ' + ', '.join(ncams[:8])) if ncams else ''))
            r = mail_send('Видеонаблюдение: ночные оповещения пришли не со всех камер (%s)' % (today[8:10] + '.' + today[5:7]), txt, IT_TO, IT_CC)
            if str(r).startswith('ok'): it['sent'] = int(it.get('sent') or 0) + 1
            res['it'] = str(r)[:60]
        st['it'] = it
    publish('cam.bin', {'v': 2, 't': t_now[:16], 'days': DAYS, 'items': items, 'work': [WORK_FROM, WORK_TO], 'kul': st.get('kul'), 'it': st.get('it'),
                        'cams': sorted(cams.values(), key=lambda c: c['last'], reverse=True),
                        'nvr': [{'name': k, 'last': v.get('last'), 'test': v.get('test'), 'ok': v.get('ok')} for k, v in sorted(nv.items())]})
    jsave('cctv.json', st)
    res['state'] = 'ok'
    res['cams'] = len(cams)
    return res
