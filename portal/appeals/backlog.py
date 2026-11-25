# Разбор «хвоста»: все вопросы/обращения к Т. В. в группах MAX, на которые нет ответа Т. В. (слово Т. В. 11.11.2026: «вопросы подобные этим не имеют права потеряться»)
#   python3 backlog.py [ДД.ММ — с какого дня, по умолчанию 01.10]  → JSON open/answered в scratchpad/appeals_backlog.json
import sys, json, re, time
from datetime import datetime, timezone, timedelta
sys.path.insert(0, 'REDACTED_B64_28')
sys.path.insert(0, '/home/claude/fabrika/work/appeals')
import mxcall
from appeals import GROUPS, OWNER_UID, OWNER_RX
TZ = timezone(timedelta(hours=3))
REQ_RX = re.compile(r'\?|соглас|подтверд|сделаем|можно ли|прошу|нужн\S*\s+(ваш|решен|одобр)|подпиш|утверд|ответьте|посмотрите|скажите|подскажите|разреш|жд[её]м|жду|как быть|что делать|решите|одобр', re.I)
def hist(cid, t0):
    out, fr = {}, None
    for _ in range(40):
        q = {'op': 'read', 'cid': cid, 'n': 100}
        if fr: q['from'] = fr
        try: M = json.loads(mxcall.call(q)).get('msgs') or []
        except Exception: time.sleep(5); continue
        if not M: break
        for m in M: out[m['mid']] = m
        fr = min(m['ts'] for m in M) - 1
        if fr < t0: break
    return sorted(out.values(), key=lambda m: m['ts'])
if __name__ == '__main__':
    d, mo = (sys.argv[1] if len(sys.argv) > 1 else '01.10').split('.')
    t0 = int(datetime(2026, int(mo), int(d), tzinfo=TZ).timestamp() * 1000)
    admins = {OWNER_UID}; res = []
    allm = {}
    for cid, g in GROUPS.items():
        ms = [m for m in hist(cid, t0) if m['ts'] >= t0]; allm[cid] = ms
        for m in ms:
            if re.search(r'Сотрудник1\s+Сотрудник3|Сотрудник3\s+Сотрудник1', m.get('name') or ''): admins.add(m.get('uid'))
    for cid, g in GROUPS.items():
        ms = allm[cid]
        for i, m in enumerate(ms):
            t = str(m.get('text') or '')
            if m.get('bot') or m.get('uid') in admins or not t.strip(): continue
            to_owner = bool(OWNER_RX.search(t)) or OWNER_UID in (m.get('ment') or []) or (m.get('ruid') in admins and '?' in t)
            if not to_owner or not REQ_RX.search(t): continue
            thread = {m['mid']} | {x['mid'] for x in ms[i + 1:] if x.get('rmid') == m['mid']}                 # 11.11: ответ — только ответом на сообщение (или в его ветке); «рядом по времени» не считается
            ans = [x for x in ms[i + 1:] if x.get('uid') in admins and x.get('rmid') in thread]
            later = [x for x in ms[i + 1:] if x.get('uid') in admins]
            res.append({'g': g, 'cid': cid, 'mid': m['mid'], 'who': m.get('name', ''), 't': datetime.fromtimestamp(m['ts'] / 1000, TZ).strftime('%d.%m %H:%M'),
                        'text': t[:350], 'answered': bool(ans), 'owner_later': len(later),
                        'others': [((x.get('name') or '')[:20], (x.get('text') or '')[:80]) for x in ms if x.get('rmid') == m['mid'] and x.get('uid') not in admins][:3]})
    json.dump({cid: ms for cid, ms in allm.items()}, open('REDACTED_B64_30.json', 'w'), ensure_ascii=False)
    json.dump({'admins': list(admins), 'items': res}, open('REDACTED_B64_31.json', 'w'), ensure_ascii=False, indent=1)
    op = [x for x in res if not x['answered']]
    print('всего обращений', len(res), 'без ответа', len(op), 'admins', len(admins))
    for g in GROUPS.values(): print(g, len([x for x in op if x['g'] == g]))
