# Обращения к Т. В. в группах MAX (слово Т. В. 10.11: «проверка раз в час … обращения к вам и вопросы без ответа — в Telegram, нет — молчать»).
#   python3 appeals.py scan   — новые обращения/вопросы к Т. В. с прошлой проверки (JSON); ничего не отправляет
#   python3 appeals.py mark mid1 mid2 …   — отметить отправленными в Telegram (новые больше не повторять; остаются в «open» до ответа Т. В.)
#   python3 appeals.py open               — все вопросы к Т. В. без его ответа (для утреннего списка; закрываются сами, когда Т. В. ответит)
#   python3 appeals.py close mid1 …       — закрыть по слову Т. В. («закрыть», «неактуально»)
# 11.11 (Т. В.: «вопросы подобные этим не имеют права потеряться»): ответ Т. В. — только ответом на это сообщение или в его ветке;
#   «написал потом в группе что-то» больше не считается. Вопрос висит в open и попадает в утренний список, пока нет ответа.
import sys, json, re, time, os
sys.path.insert(0, 'REDACTED_B64_27')
import mxcall
GROUPS = {'-100000000004': 'Ком. отдел', '-100000000006': 'УЗ', '-100000000005': 'Производство', '-100000000001': 'Погрузка',
          '-100000000007': 'Торг. оборудование', '-100000000008': 'Кадры', '-100000000003': 'Снабжение'}
OWNER_UID = 140426852
OWNER_RX = re.compile(r'(?<![А-Яа-яЁё])(Сотрудник2(а|у|ом|е)?(\s+Отчество1(а|у|ем|е)?)?|Т\.\s?В\.)(?![А-Яа-яЁё])|(?<![А-Яа-яЁёA-Za-z])ТВ(?![А-Яа-яЁёA-Za-z])')
ALARM_RX = re.compile(r'авари|пожар|задымл|затоп|прорыв|утечк|травм|несчастн|скорую|сломал|не работает|встал[аи]? (линия|станок|участок|цех)|срочно', re.I)   # 10.11: сбои — даже без обращения к Т. В.
ST = '/home/claude/fabrika/work/appeals/state.json'
def load():
    try: st = json.load(open(ST))
    except Exception: st = {'sent': [], 'since': int(time.time() * 1000) - 3 * 3600e3}
    st.setdefault('open', {}); st.setdefault('closed', []); return st
def save(st): json.dump(st, open(ST, 'w'), ensure_ascii=False, indent=1)
ADMINS = {OWNER_UID, 67409621}                                   # Т. В. и Сотрудник3 Отчество1 (равный админ, правило 08.11)
def hist(cid, pages=3):
    out, fr = {}, None
    for _ in range(pages):
        q = {'op': 'read', 'cid': cid, 'n': 100}
        if fr: q['from'] = fr
        M = json.loads(mxcall.call(q)).get('msgs') or []
        if not M: break
        for m in M: out[m['mid']] = m
        fr = min(m['ts'] for m in M) - 1
    return sorted(out.values(), key=lambda m: m['ts'])
def answered(ms, i):
    # 12.11.2026 (Т. В.: «я согласовывал машину в Абхазию — ты пишешь, что не согласована»): текст и фото человек шлёт подряд отдельными
    #   сообщениями, а Т. В. отвечает на любое из них. Одна «пачка» — сообщения того же автора в пределах 3 минут до и после.
    me, t0 = ms[i].get('uid'), ms[i]['ts']
    burst = {x['mid'] for x in ms if x.get('uid') == me and abs(x['ts'] - t0) <= 180e3}
    thread = burst | {x['mid'] for x in ms if x.get('rmid') in burst}
    if any(x.get('uid') in ADMINS and x['ts'] >= t0 - 1000 and (x.get('rmid') in thread or x['mid'] in thread and x.get('uid') in ADMINS) for x in ms): return True
    # 25.11.2026 (Т. В.: «это всё же было решено — почему вопросы остались»): он отвечает и без «ответа на сообщение» — любой его текст в группе
    #   после вопроса закрывает вопрос (как у бота MAX v59); ответ другого человека на это сообщение — тоже (вопрос разобрали без него).
    if any(x.get('uid') in ADMINS and x['ts'] > t0 for x in ms): return True
    return any(x.get('rmid') in thread and x.get('uid') != me and not x.get('bot') and x['ts'] > t0 for x in ms)
def scan():
    st = load(); since = st['since']; sent = set(st['sent']); out = []
    for cid, g in GROUPS.items():
        try: ms = hist(cid)
        except Exception as e: out.append({'g': g, 'err': str(e)[:120]}); continue
        for i, m in enumerate(ms):
            if m['mid'] in st['open'] and answered(ms, i): st['open'].pop(m['mid']); continue          # Т. В. ответил — закрыть
            if m['ts'] < since - 24 * 3600e3 or m.get('bot') or m.get('uid') in ADMINS or m['mid'] in sent: continue
            t = str(m.get('text') or '')
            own = bool(OWNER_RX.search(t)); alarm = bool(ALARM_RX.search(t))
            if not (own or alarm): continue
            if own and answered(ms, i): continue                                                     # Т. В. уже ответил (ответом на это сообщение / в ветке)
            if not own and m['ts'] < since: continue                                                     # сбой — только новые
            out.append({'g': g, 'mid': m['mid'], 'who': m.get('name', ''), 't': time.strftime('%d.%m %H:%M', time.gmtime(m['ts'] / 1000 + 3 * 3600)),
                        'text': t[:400], 'q': '?' in t, 'kind': 'к Т. В.' if own else 'сбой?'})
    for x in out:
        if x.get('kind') == 'к Т. В.' and x['mid'] not in st['closed']: st['open'].setdefault(x['mid'], dict(x, cid=[c for c, g in GROUPS.items() if g == x['g']][0]))
    save(st)
    print(json.dumps({'since': time.strftime('%d.%m %H:%M', time.gmtime(since / 1000 + 3 * 3600)), 'items': out}, ensure_ascii=False, indent=1))
def open_():
    st = load(); now = time.time() * 1000
    print(json.dumps(sorted(st['open'].values(), key=lambda x: x['t']), ensure_ascii=False, indent=1))
def close(mids):
    st = load()
    for m in mids: st['open'].pop(m, None); st['closed'] = (st['closed'] + [m])[-1000:]
    save(st); print('ok', len(mids))
def mark(mids):
    st = load(); st['sent'] = (st['sent'] + mids)[-500:]; st['since'] = int(time.time() * 1000)
    save(st); print('ok', len(mids))
if __name__ == '__main__':
    if sys.argv[1] == 'scan': scan()
    elif sys.argv[1] == 'mark': mark(sys.argv[2:])
    elif sys.argv[1] == 'open': open_()
    elif sys.argv[1] == 'close': close(sys.argv[2:])
