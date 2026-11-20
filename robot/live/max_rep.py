# «Фабрика» — повторяющаяся информация из групп MAX → отчёты на портале (19.11.2026).
# Т. В. 19.11: «Посмотри в группе MAX… всё, что повторяется, с того момента, как ты там присутствуешь, собери, систематизируй, выложи в виде
#   отчётов: визиты клиентов, количество машин на территории, деньги на расчёте, большие объекты и прочее».
# Бот — администратор групп, GET /messages отдаёт их сообщения. История каждой группы — ~/.fabrika_max/rep_<cid>.json (телефоны → [тел.]),
# дочитывается назад до SINCE не больше MAX_CALLS запросов за прогон. Из неё — отчёты → st/maxrep.bin (шифр, ключ портала):
#   visits   — вечерние отчёты менеджеров (ответы на «📊 Вечерний отчёт»): клиент — что сделано — дата — срок — сумма;
#   out      — машины, уехавшие с погрузки (Сотрудник26: «DD.MM уехало N машин»);
#   inbound  — машины поставщиков на территорию (Сотрудник11: «Машины на завтра — …»);
#   supply   — поставки за день (итог бота «Снабжение — итог за …»): документы, поставщики, сумма;
#   absent   — отсутствующие по участкам (итог бота «Отсутствующие за …»);
#   money    — оплаты и согласования денег в группе FABRIKANT_UZ;
#   objects  — объекты ФТС и ВиТ: реестры объектов (файлы) и списки статусов из «Торгового оборудования».
# Ничего в группы не пишет. Python 3.6.
import datetime, json, os, re

SINCE = datetime.datetime(2026, 10, 20)
MAX_CALLS = 90                   # 20.11.2026: было 40 — за прогон успевали 3 группы из 8
KEEP_DAYS = 120
PHONE = re.compile(r'(\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b')
WD = {'понедельник': 0, 'вторник': 1, 'среду': 2, 'среда': 2, 'четверг': 3, 'пятницу': 4, 'пятница': 4, 'субботу': 5, 'воскресенье': 6}


def _mask(t): return PHONE.sub('[тел.]', t or '')


def _att(x):
    out = []
    for a in ((x.get('body') or {}).get('attachments') or []):
        t = a.get('type'); fn = a.get('filename') or ((a.get('payload') or {}).get('filename')) or ''
        out.append({'type': t, 'name': str(fn)[:120]} if fn else {'type': t})
    return out


def pull(MC, token, cid, M, now, calls_left):
    hp = os.path.join(M, 'rep_%s.json' % cid)
    try:
        with open(hp, encoding='utf-8') as f: H = json.load(f)
    except Exception: H = {'msgs': {}, 'done': False}
    since_ms = int(SINCE.replace(tzinfo=MC.MSK).timestamp() * 1000)
    known_max = max([int(v.get('ts') or 0) for v in H['msgs'].values()] or [0])
    used, upper = 0, None
    def page(q):
        code, j = MC.api(token, 'GET', '/messages', q)
        if code != 200: return None
        raw = (j or {}).get('messages') or []
        for x in raw:
            m = MC.norm_msg(x)
            if m['mid'] and m['ts'] > 0 and m['mid'] not in H['msgs']:
                m['text'] = _mask(m['text']); m['att'] = _att(x); m.pop('mentions', None); H['msgs'][m['mid']] = m
        return [int(x.get('timestamp') or 0) for x in raw if x.get('timestamp')], len(raw)
    r = page({'chat_id': cid, 'count': 100}); used += 1                     # 1) свежая страница
    if r and r[0] and min(r[0]) > known_max and known_max and r[1] >= 100:    # пропуск между свежей страницей и известным — добрать назад
        upper = min(r[0]) - 1
        while used < calls_left and upper > known_max:
            r2 = page({'chat_id': cid, 'count': 100, 'from': upper, 'to': known_max}); used += 1
            if not r2 or not r2[0] or r2[1] < 100: break
            upper = min(r2[0]) - 1
    if not H.get('done'):                                                   # 2) история назад до SINCE
        upper = min([int(v.get('ts') or 0) for v in H['msgs'].values()] or [0]) - 1
        while used < calls_left and upper > since_ms:
            r3 = page({'chat_id': cid, 'count': 100, 'from': upper, 'to': since_ms}); used += 1
            if r3 is None: break
            if not r3[0] or r3[1] < 100 or min(r3[0]) <= since_ms: H['done'] = True; break
            upper = min(r3[0]) - 1
        if upper <= since_ms: H['done'] = True
    lo = int((now - datetime.timedelta(days=KEEP_DAYS)).timestamp() * 1000)
    H['msgs'] = {k: v for k, v in H['msgs'].items() if int(v.get('ts') or 0) >= lo}
    with open(hp + '.tmp', 'w', encoding='utf-8') as f: json.dump(H, f, ensure_ascii=False)
    os.chmod(hp + '.tmp', 0o600); os.replace(hp + '.tmp', hp)
    return H, used


def _dt(MC, m): return datetime.datetime.fromtimestamp(int(m['ts']) / 1000, MC.MSK)


def _day(dd, mm, ref):
    y = ref.year if int(mm) <= ref.month + 1 else ref.year - 1
    try: return datetime.date(y, int(mm), int(dd)).isoformat()
    except ValueError: return ''


def _num(s):
    s = re.sub(r'[\s  ]', '', str(s or '')).replace(',', '.')
    try: return float(s)
    except ValueError: return None


def extract(groups, MC):
    """groups: {title: [msgs]} → отчёты"""
    R = {'visits': [], 'out': [], 'inbound': [], 'supply': [], 'absent': [], 'money': [], 'objects': [], 'files': []}
    for title, msgs in groups.items():
        msgs = sorted(msgs, key=lambda m: m['ts']); by = {m['mid']: m for m in msgs}
        for m in msgs:
            t = m.get('text') or ''; d = _dt(MC, m); who = (m.get('name') or '')[:60]
            # визиты: ответ на «📊 Вечерний отчёт, DD.MM»
            p = by.get(m.get('rmid') or '')
            if p and p.get('bot') and not m.get('bot'):
                pm = re.search(r'Вечерний отч[её]т,?\s*(\d{1,2})\.(\d{1,2})', p.get('text') or '')
                if pm:
                    day = _day(pm.group(1), pm.group(2), d)
                    rows = []
                    for ln in t.split('\n'):
                        parts = [x.strip() for x in re.split(r'\s+[—–-]\s+', ln.strip(' •-')) if x.strip()]
                        if len(parts) >= 3:
                            rows.append({'client': parts[0][:80], 'did': parts[1][:200], 'when': parts[2][:20], 'next': (parts[3] if len(parts) > 3 else '')[:20],
                                         'sum': _num(re.sub(r'[^\d\s,.]', '', parts[4])) if len(parts) > 4 else None})
                    R['visits'].append({'day': day, 'who': who, 'g': title, 'rows': rows, 'raw': '' if rows else t[:600]})
                    continue
            if m.get('bot'):
                sm = re.search(r'Снабжение\s+—\s+итог за\s+\S+\s+(\d{1,2})\.(\d{1,2})', t)
                if sm:
                    dm = re.search(r'Документы:\s*(\d+)\s+от\s+(\d+)\s+поставщик\w*,\s*всего\s+([\d\s  ]+)', t)
                    tops = [re.sub(r'^\d+\.\s*', '', x).strip()[:120] for x in t.split('\n') if re.match(r'^\d+\.\s', x)]
                    R['supply'].append({'day': _day(sm.group(1), sm.group(2), d), 'docs': int(dm.group(1)) if dm else None, 'sup': int(dm.group(2)) if dm else None,
                                        'sum': _num(dm.group(3)) if dm else None, 'top': tops[:10]})
                am = re.search(r'Отсутствующие за\s+(\d{1,2})\.(\d{1,2})', t)
                if am:
                    rows = [x.strip(' •')[:160] for x in t.split('\n') if x.strip().startswith('•')]
                    nm = re.search(r'Нет отметки:\s*(.+)', t)
                    R['absent'].append({'day': _day(am.group(1), am.group(2), d), 'rows': rows, 'nomark': (nm.group(1).strip()[:200] if nm else '')})
                continue
            om = re.search(r'(\d{1,2})\.(\d{1,2})\s+уехало\s+(\d+)\s+маш', t)
            if om:
                L = [x.strip(' •-•')[:80] for x in t.split('\n')[1:] if x.strip()]
                R['out'].append({'day': _day(om.group(1), om.group(2), d), 'n': int(om.group(3)), 'list': L[:40], 'who': who})
                continue
            im = re.search(r'Машины на\s+(сегодня|завтра|послезавтра|понедельник|вторник|среду|четверг|пятницу|субботу)', t, re.I)
            if im:
                w = im.group(1).lower(); base = d.date()
                if w == 'завтра': base += datetime.timedelta(days=1)
                elif w == 'послезавтра': base += datetime.timedelta(days=2)
                elif w in WD: base += datetime.timedelta(days=(WD[w] - base.weekday()) % 7 or 7)
                L = []
                for x in t.split('\n')[1:]:
                    x = x.strip(' -••'); mm = re.search(r'\(([\d.,]+)\s*т\)', x)
                    if x: L.append({'what': re.sub(r'\s*\([^)]*т\)\s*$', '', x)[:80], 't': _num(mm.group(1)) if mm else None})
                R['inbound'].append({'day': base.isoformat(), 'list': L, 'tons': round(sum(x['t'] or 0 for x in L), 2), 'who': who})
                continue
            if re.search(r'UZ|Узбек|Казах', title) and re.search(r'оплат|согласов|сум\b|млн|реестр платеж|предоплат', t, re.I):
                am2 = re.search(r'([\d][\d\s ]{3,})\s*(сум|₽|руб)', t)
                R['money'].append({'day': d.date().isoformat(), 'who': who, 'x': t[:300], 'sum': _num(am2.group(1)) if am2 else None, 'cur': am2.group(2) if am2 else '',
                                   'files': [a['name'] for a in m.get('att') or [] if a.get('name')]})
            for a in m.get('att') or []:
                n = a.get('name') or ''
                if re.search(r'реестр объект', n, re.I):
                    R['objects'].append({'day': d.date().isoformat(), 'who': who, 'file': n, 'x': t[:600], 'g': title})
                elif n and re.search(r'\.(xlsx?|pdf|docx?)$', n, re.I):
                    R['files'].append({'day': d.date().isoformat(), 'who': who, 'file': n, 'g': title, 'x': t[:160]})
            if re.search(r'Торгов', title) and len(re.findall(r'(?m)^\s*\d{1,2}\.\s+\S', t)) >= 4:
                R['objects'].append({'day': d.date().isoformat(), 'who': who, 'file': '', 'x': t[:1500], 'g': title})
    for k in R: R[k].sort(key=lambda x: x.get('day') or '', reverse=True)
    return R


def run(L, log, jload, jsave, publish, iso):
    import mx_ctl as MC
    home = os.path.dirname(L); M = os.path.join(home, '.fabrika_max')
    try:
        with open(os.path.join(M, 'config.json'), encoding='utf-8') as f: token = (json.load(f) or {}).get('token') or ''
    except Exception: return {'state': 'нет настроек бота MAX'}
    if not token: return {'state': 'нет токена MAX'}
    now = datetime.datetime.now(MC.MSK)
    # 19.11.2026: GET /chats у MAX отвечает 404 — список групп бота берём из ~/.fabrika_max/groups.json (как max_hist), /chats — запасной
    chats = []
    try:
        with open(os.path.join(M, 'groups.json'), encoding='utf-8') as f: G = json.load(f) or {}
        chats = [(str(k), str((v or {}).get('title') or '')) for k, v in G.items() if re.match(r'^-?\d+$', str(k)) and (v or {}).get('on', True)]
    except Exception: chats = []
    if not chats:
        code, j = MC.api(token, 'GET', '/chats', {'count': 100})
        if code != 200: return {'state': 'нет groups.json, MAX /chats: %s' % code}
        chats = [(str(c.get('chat_id')), str(c.get('title') or '')) for c in (j or {}).get('chats') or [] if c.get('chat_id') and c.get('type') in (None, 'chat', 'channel')]
    calls, groups, st = 1, {}, jload('maxrep.json', {}) or {}
    k0 = int(st.get('rot') or 0) % max(1, len(chats)); chats = chats[k0:] + chats[:k0]; st['rot'] = k0 + 1   # 20.11.2026: по кругу — каждая группа доходит
    for cid, title in chats:
        if calls < MAX_CALLS:
            H, used = pull(MC, token, cid, M, now.replace(tzinfo=None), max(1, (MAX_CALLS - calls) // max(1, len(chats))) + 2)
            calls += used
        else:                                               # 20.11.2026: лимит запросов исчерпан — в отчёт всё равно то, что уже скачано
            try:
                with open(os.path.join(M, 'rep_%s.json' % cid), encoding='utf-8') as f: H = json.load(f)
            except Exception: H = {'msgs': {}}
        if H.get('msgs'): groups[title or cid] = list(H['msgs'].values())
    R = extract(groups, MC)
    sig = json.dumps({k: len(v) for k, v in R.items()}, sort_keys=True) + str(max([max([int(m['ts']) for m in v] or [0]) for v in groups.values()] or [0]))
    if sig != st.get('sig') or st.get('dirty'):
        if publish('maxrep.bin', dict(R, v=1, t=iso(now), groups=sorted(groups))) is not False: st['sig'] = sig; st.pop('dirty', None)
        else: st['dirty'] = True
    jsave('maxrep.json', st)
    return {'state': 'ok', 'calls': calls, 'groups': len(groups), 'n': {k: len(v) for k, v in R.items()}}
