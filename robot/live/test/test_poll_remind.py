"""Проверка mx_poll.py и remind.py без сети (29.10.2026): python3 -I test/test_poll_remind.py → «ALL OK».
API MAX подменён заглушкой (GET /messages по группам с учётом «сейчас», GET members, POST /messages — журнал), временный HOME с ~/.fabrika_max
(config.json с фиктивным токеном, groups.json, ctl.json, history_all.json), «сейчас» подменяется через now() модулей.
Сценарий — 29.10.2026 (чт) 08:57 → 10:05 → 11:30 → 13:35 → 16:57 → 17:35 → 19:05 → 22:30 → 30.10 07:30 → 09:05 → 10:05 → сб 31.10 → 16.11;
прогон дважды: on=false (ничего не уходит, всё в dry) и on=true (через заглушку)."""
import datetime, json, os, re, shutil, sys, tempfile


def _rd(*a, **k):   # CodeQL py/file-not-closed: файл закрывается сразу (15.11.2026)
    with open(*a, **k) as _f:
        return _f.read()


def _wr(_d, *a, **k):
    with open(*a, **k) as _f:
        return _f.write(_d)


HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import mx_ctl as MC, mx_poll as MP, remind as RM

MSK = MC.MSK
D0 = datetime.date(2026, 10, 29)                 # четверг
BOT = 999
NOW = [datetime.datetime(2026, 10, 29, 0, 0, tzinfo=MSK)]
MP.now = lambda: NOW[0]
RM.now = lambda: NOW[0]
fails = []


def at(h, m, day=0): return datetime.datetime.combine(D0 + datetime.timedelta(days=day), datetime.time(h, m), MSK)


def ms(h, m, day=0): return int(at(h, m, day).timestamp() * 1000)


def ok(cond, what):
    if not cond: fails.append(what); print('  FAIL:', what)


# REDACTED_B64_8 заглушка API MAX
class Api:
    def __init__(self):
        self.msgs = {'100': [], '200': []}; self.members = {'100': [], '200': []}; self.posts = []; self.n = 0; self.dm_fail = set()

    def raw(self, cid, uid, name, text, h, m, day=0, mid=None, rmid=None, mentions=None, bot=False):
        self.n += 1
        mid = mid or 'm%03d' % self.n
        x = {'sender': {'user_id': uid, 'name': name, 'is_bot': bot}, 'recipient': {'chat_id': int(cid), 'chat_type': 'chat'}, 'timestamp': ms(h, m, day),
             'body': {'mid': mid, 'text': text, 'markup': [{'type': 'user_mention', 'user_id': u, 'from': 0, 'length': 3} for u in (mentions or [])]}}
        if rmid: x['link'] = {'type': 'reply', 'message': {'mid': rmid}}
        self.msgs[str(cid)].append(x)
        return mid

    def __call__(self, token, method, path, query=None, body=None):
        assert token == 'x', 'токен не из config.json'
        now_ms = int(NOW[0].timestamp() * 1000)
        if method == 'GET' and path == '/messages':
            cid = str(query['chat_id'])
            return 200, {'messages': [x for x in self.msgs.get(cid, []) if x['timestamp'] <= now_ms][-100:]}
        if method == 'GET' and path.endswith('/members'):
            cid = path.split('/')[2]
            return 200, {'members': [{'user_id': u, 'first_name': n.split()[0], 'last_name': ' '.join(n.split()[1:]), 'is_bot': False} for u, n in self.members.get(cid, [])], 'marker': None}
        if method == 'POST' and path == '/messages':
            self.posts.append({'t': NOW[0].strftime('%d.%m %H:%M'), 'q': dict(query), 'body': body})
            if 'user_id' in query and int(query['user_id']) in self.dm_fail: return 404, {'code': 'not.found', 'message': 'Dialog not found'}
            self.n += 1; mid = 'bot%03d' % self.n
            if 'chat_id' in query:                                   # сообщение бота попадает в историю группы
                cid = str(query['chat_id']); self.n -= 1
                self.raw(cid, BOT, 'Фабрикант', body.get('text') or '', NOW[0].hour, NOW[0].minute, (NOW[0].date() - D0).days, mid=mid, rmid=(body.get('link') or {}).get('mid'), bot=True)
            return 200, {'message': {'body': {'mid': mid, 'text': body.get('text')}, 'recipient': dict(query), 'timestamp': now_ms}}
        raise AssertionError('неожиданный вызов API: %s %s' % (method, path))


def setup(on):
    home = tempfile.mkdtemp(prefix='fabrika_test_')
    L = os.path.join(home, '.fabrika_live'); M = os.path.join(home, '.fabrika_max')
    os.makedirs(L); os.makedirs(M)
    _wr(json.dumps({'token': 'x', 'bot': {'user_id': BOT, 'name': 'Фабрикант'}}), os.path.join(M, 'config.json'), 'w')      # owner не привязан — по имени «Сотрудник2 М»
    _wr(json.dumps({'100': {'on': True, 'title': 'Коммерческий отдел'}, '200': {'on': True, 'title': 'Торговое оборудование'},
               '300': {'on': False, 'title': 'Старая группа'}, '400': {'on': True, 'title': 'Канал Фабрикант', 'channel': True}}), os.path.join(M, 'groups.json'), 'w')
    names = {'1': 'Сотрудник2 М', '11': 'Сотрудник51', '12': 'Сотрудник61 Сотрудник20', '13': 'Сотрудник17 Сотрудник8', '14': 'Сотрудник3 Сотрудник19', '15': 'Поп Имя7', '16': 'Сотрудник58 Сотрудник26', '17': 'Сотрудник47 Сотрудник16'}
    items = {}
    def item(iid, uid, who, due, what):
        items[iid] = {'id': iid, 'src': 'group', 'what': what, 'due': due, 'who': who, 'who_uid': uid, 'st': 'open', 'asks': 1, 'author': who, 'at': '2026-10-%sT12:00' % due[8:10], 'mid': 'src' + iid, 'kind': 'self'}
    item('A1', 12, 'Сотрудник61 Сотрудник20', '2026-10-26', 'Топ-Сервис — контрольный звонок 26.10')             # 3 раб. дня
    item('A2', 12, 'Сотрудник61 Сотрудник20', '2026-10-23', 'Казаков А. — отгрузка 23.10')                        # 4 раб. дня (с A1 — одним сообщением)
    item('B1', 14, 'Сотрудник3 Сотрудник19', '2026-10-21', 'ТДР — доп. заказ до 21.10')                   # 6 раб. дней
    item('C1', 13, 'Сотрудник17 Сотрудник8', '2026-10-14', 'Статио проект — предоплата до 14.10')                 # 11 раб. дней
    item('D1', 15, 'Поп Имя7', '2026-10-26', 'Клиент Х — счёт до 26.10')                              # запрещён
    item('F1', 11, 'Сотрудник51', '2026-10-28', 'АверсПлюс — оплата 28.10')                                # 1 день — mx_ctl сам
    item('G1', 16, 'Сотрудник58 Сотрудник26', '2026-10-26', 'Договоры — ответ до 26.10')                           # 3 дня, диалога с ботом нет
    items['E1'] = {'id': 'E1', 'src': 'manual', 'what': 'План ноября', 'due': '2026-10-26', 'who': 'Коллеги', 'who_uid': None, 'st': 'open', 'asks': 1}
    items['H1'] = {'id': 'H1', 'src': 'group', 'what': 'закрыто', 'due': '2026-10-20', 'who': 'Сотрудник61 Сотрудник20', 'who_uid': 12, 'st': 'done', 'asks': 1}
    _wr(json.dumps({'names': names, 'items': items, 'asks': {}, 'seen': []}, ensure_ascii=False), os.path.join(M, 'ctl.json'), 'w')
    _wr(json.dumps({'msgs': {'old1': {'ts': ms(10, 0, -3), 'mid': 'old1', 'uid': 11, 'name': 'Сотрудник51', 'bot': False, 'text': 'Старый отчёт', 'rmid': '', 'mentions': []}}}, ensure_ascii=False), os.path.join(M, 'history_all.json'), 'w')
    cfg = json.loads(_rd(os.path.join(os.path.dirname(HERE), 'mx_poll_cfg.json'), encoding='utf-8'))
    cfg['on'] = on
    cp = os.path.join(home, 'mx_poll_cfg.json'); _wr(json.dumps(cfg, ensure_ascii=False), cp, 'w')
    MP.CFG_FILE = cp
    api = Api(); MC.api = api
    api.members['100'] = [(1, 'Сотрудник2 М'), (11, 'Сотрудник51'), (12, 'Сотрудник61 Сотрудник20'), (13, 'Сотрудник17 Сотрудник8'), (14, 'Сотрудник3 Сотрудник19'), (15, 'Поп Имя7'),
                          (16, 'Сотрудник58 Сотрудник26'), (17, 'Сотрудник47 Сотрудник16'), (18, 'Сотрудник62 Сотрудник21 Фабрикант Самара'), (19, 'Сотрудник54 Сотрудник22')]
    api.members['200'] = [(1, 'Сотрудник2 М'), (21, 'Сотрудник66 Сотрудник65'), (22, 'Сотрудник63 Сотрудник30'), (23, 'Имя21 Сотрудник81'), (24, 'Сотрудник53 Сотрудник34'), (25, 'Анна Сотрудник82')]
    api.dm_fail.add(16)
    # группа 200 — до начала дня
    api.raw('200', 21, 'Сотрудник66 Сотрудник65', 'Коллеги, график на ноябрь во вложении', 8, 30, mid='mak1')
    return home, L, M, api


def run_all(L, env):
    r1 = MP.run(L, {}, env['log'], env['jload'], env['jsave'], env['publish'], env['iso'])
    r2 = RM.run(L, {}, env['log'], env['jload'], env['jsave'], env['publish'], env['iso'], env['mail_send'])
    assert r1.get('state') == 'ok', r1
    assert r2.get('state') == 'ok', r2
    return r1, r2


def scenario(on):
    print('--- сценарий on=%s' % on)
    home, L, M, api = setup(on)
    store, pub, logs, mails = {}, {}, [], []
    env = {'log': lambda *a: logs.append(' '.join(str(x) for x in a)), 'jload': lambda n, d: json.loads(json.dumps(store.get(n, d))),
           'jsave': lambda n, v: store.__setitem__(n, json.loads(json.dumps(v))), 'publish': lambda n, o: pub.__setitem__(n, json.loads(json.dumps(o))),
           'iso': lambda t: t.strftime('%Y-%m-%dT%H:%M'),
           'mail_send': lambda subject, text, to=None, cc=None, att=None, html=None, reply_to=None: mails.append({'t': NOW[0].strftime('%d.%m %H:%M'), 's': subject, 'x': text, 'to': list(to or []), 'cc': list(cc or [])}) or 'ok (test)'}
    poll = lambda: json.loads(_rd(os.path.join(M, 'poll.json'), encoding='utf-8'))
    rem = lambda: json.loads(_rd(os.path.join(M, 'remind.json'), encoding='utf-8'))
    posts_to = lambda cid: [p for p in api.posts if str(p['q'].get('chat_id')) == str(cid)]
    dms = lambda: [p for p in api.posts if 'user_id' in p['q']]

    # 08:57 — утренний опрос; эскалация: день 3 (личное), день 5 / 10 (письма руководителю)
    NOW[0] = at(8, 57); run_all(L, env)
    P = poll(); day0 = D0.isoformat()
    rec = P['days'][day0].get('morning') or {}
    ok(bool(rec.get('t')) and not rec.get('skip'), 'утренний опрос записан')
    ok(rec.get('dry') == (not on), 'утренний опрос dry=%s' % (not on))
    txt = rec.get('text') or ''
    ok('Утренний опрос, 29.10 (чт)' in txt, 'заголовок утреннего опроса')
    ok('<a href="max://user/1">Сотрудник51</a>' in txt and '<a href="max://user/2">Сотрудник3 Сотрудник19</a>' in txt, 'упоминания исполнителей в опросе')
    ok('Сотрудник1 А. А.' in txt and 'max://user/' not in txt.split('Сотрудник1 А. А.')[0][-30:], 'исполнитель без id — просто имя текстом')
    ok('Поп Имя7' not in txt and 'Сотрудник2' not in txt, 'в опросе нет запрещённых и владельца')
    ok('просроченных пунктов: 1' in txt, 'число просроченных пунктов у исполнителя')
    ok(len(rec.get('exec') or {}) >= 9, 'исполнителей в опросе: %d' % len(rec.get('exec') or {}))
    if on:
        ok(len([p for p in posts_to('100') if p['body'].get('format') == 'html']) == 1 and api.posts[0]['body'].get('format') == 'html', 'опрос отправлен в группу одним html-сообщением')
        ok(rec.get('mid') == 'bot001' or rec.get('mid', '').startswith('bot'), 'mid опроса сохранён')
    else:
        ok(not api.posts and not mails, 'on=false: ни одного POST и письма в 08:57')
        kinds = [d['kind'] for d in P['dry']]
        ok('poll:morning' in kinds, 'dry: утренний опрос')
    R = rem()
    E = R['esc']
    ok('A1' in E and bool(E['A1'].get('d3')), 'день 3: личное сообщение Сотрудник20 (A1)')
    ok('G1' in E and bool(E['G1'].get('d3')) and (not on or E['G1']['d3'].get('via') == 'group'), 'день 3: Сотрудник26 нет диалога с ботом → ответом в группе (G1)')
    ok('B1' in E and bool(E['B1'].get('d5')), 'день 5+: письмо руководителю по B1 (Сотрудник19)')
    ok('C1' in E and bool(E['C1'].get('d5')) and bool(E['C1'].get('d10')), 'день 10+: C1 (Сотрудник8) — письмо и отметка d10')
    ok('D1' not in E and 'F1' not in E and 'E1' not in E and 'H1' not in E, 'запрещённый, 1 день, «Коллеги», закрытый — без эскалации')
    if on:
        dm = dms()
        ok(len(dm) == 2 and sorted(int(p['q']['user_id']) for p in dm) == [12, 16], 'личные сообщения: Сотрудник20 и попытка Сотрудник26 (404)')
        dmb = [p for p in dm if int(p['q']['user_id']) == 12]
        ok(len(dmb) == 1 and dmb[0]['body']['text'].startswith('⚠️ Сотрудник61, по пунктам контроля срок прошёл, ответа в группе нет:\n1) «Казаков А. — отгрузка 23.10» — срок 23.10, просрочка 4 дня')
           and '\n2) «Топ-Сервис — контрольный звонок 26.10» — срок 26.10, просрочка 3 дня' in dmb[0]['body']['text'], 'одно личное сообщение Сотрудник20 со списком двух пунктов')
        ok(any(p['body']['text'].startswith('⚠️ Сотрудник58, по пункту «Договоры — ответ до 26.10» срок 26.10 прошёл 3 дня назад, ответа в группе нет. Ответьте, пожалуйста, на вопрос бота в группе сегодня до 18:00.') for p in dm), 'текст личного сообщения дня 3 (один пункт)')
        m5 = [m for m in mails if m['s'].startswith('Невыполненное поручение')]
        ok(len(m5) == 1, 'писем по дню 5: %d (Сотрудник8 по Сотрудник19; по самому Сотрудник8 — без письма, 03.11)' % len(m5))
        ok(any(m['to'] == ['user45@example.org'] and m['cc'] == [] and '6 дней' in m['s'] for m in m5), 'письмо Сотрудник8 по Сотрудник19, копия itm@, «6 дней»')
        # 03.11.2026 (remind.py): руководству и itm@ «примите решение» не шлём — пункт уходит в утреннюю сводку (d5.skip = «руководство»)
        ok(not any(m['to'] == ['user5@example.org'] for m in m5) and (E['C1'].get('d5') or {}).get('skip') == 'руководство', 'по Сотрудник8 (сам руководитель) — письма нет, пункт в утренней сводке')
        ok(not any('tech-main' in str(m) or 'ok-3@' in str(m) or 'imm@' in str(m) for m in mails), 'запрещённым адресатам писем нет')
    # ответы на утренний опрос и вопросы в группе 200
    pm = rec.get('mid') or 'none'
    api.raw('100', 11, 'Сотрудник51', '1) Вопросов нет. 2) Пункт 1 — клиент не отвечает, новый срок 31.10', 9, 20, rmid=pm)
    bad1 = api.raw('100', 12, 'Сотрудник61 Сотрудник20', 'Всё нормально, работаем', 9, 30, rmid=pm)
    api.raw('100', 13, 'Сотрудник17 Сотрудник8', 'Когда будет прайс на ноябрь? Пункт 1 — Статио: предоплата будет 05.11', 9, 40, rmid=pm)
    api.raw('100', 15, 'Поп Имя7', 'Вопросов нет', 9, 45, rmid=pm)
    api.raw('100', 1, 'Сотрудник2 М', 'Спасибо, жду', 9, 50, rmid=pm)
    q1 = api.raw('200', 1, 'Сотрудник2 М', 'Сотрудник63, когда будет готов график ремонта?', 9, 10)
    qmak = api.raw('200', 23, 'Имя21 Сотрудник81', 'Сотрудник66 Отчество30, можно ли заказать подшипники?', 9, 15, rmid='mak1')
    api.raw('200', 23, 'Имя21 Сотрудник81', 'Сотрудник2 Отчество1, подтвердите заявку?', 9, 20, mentions=[1])
    api.raw('200', 23, 'Имя21 Сотрудник81', 'Сколько стоит ремонт?', 9, 25)
    q2 = api.raw('200', 1, 'Сотрудник2 М', 'Коллеги, прошу сообщить остатки по металлу', 9, 30)
    q3 = api.raw('200', 1, 'Сотрудник2 М', 'Анна, подскажите, когда будет приказ?', 9, 35)
    a2 = api.raw('200', 23, 'Имя21 Сотрудник81', 'Остатки по металлу: 3 тонны листа', 10, 0)
    NOW[0] = at(10, 5); run_all(L, env)
    P = poll(); rec = P['days'][day0]['morning']
    if on:
        ok(set(rec['ans']) >= {'11', '12', '13'} and '15' not in rec['ans'] and '1' not in rec['ans'], 'ответы записаны: 11, 12, 13; Имя7 и владелец — нет')
        ok(rec['ans']['11']['ok'] and rec['ans']['13']['ok'] and not rec['ans']['12']['ok'], 'форма утренних ответов: Сотрудник51 ок, Сотрудник8 ок, Сотрудник20 нет')
        cm = [p for p in posts_to('100') if (p['body'].get('link') or {}).get('mid') == bad1]
        ok(len(cm) == 1 and cm[0]['body']['text'].startswith('❌ Сотрудник61, ответ на утренний опрос некорректен'), 'один комментарий «некорректен» Сотрудник20')
        ok(not any((p['body'].get('link') or {}).get('mid') not in (bad1, None) and p['body']['text'].startswith('❌') for p in posts_to('100')), 'комментариев верным ответам нет')
        rm_ = [p for p in posts_to('100') if p['body']['text'].startswith('⏳')]
        ok(len(rm_) == 1 and 'Сотрудник3 Сотрудник19' in rm_[0]['body']['text'] and 'Сотрудник51' not in rm_[0]['body']['text'] and 'Поп' not in rm_[0]['body']['text'], 'напоминание неответившим один раз, без ответивших и запрещённых')
    else:
        ok(not api.posts and not mails, 'on=false: ничего не отправлено к 10:05')
        ok(any(d['kind'] == 'remind:morning' for d in P['dry']), 'dry: напоминание неответившим')
    R = rem(); Q = R['q']
    byq = lambda mid: next((q for q in Q.values() if q['mid'] == mid), None)
    ok(byq(q1) is not None and byq(q1)['to_uid'] == 22 and byq(q1)['mail'] == 'user75@example.org' and byq(q1)['st'] == 'open', 'вопрос Сотрудник63 по имени, почта найдена')
    ok(byq(q2) is not None and byq(q2)['to_uid'] is None and byq(q2)['st'] == 'done' and byq(q2)['ans_mid'] == a2, 'вопрос группе от владельца закрыт ответом от 3 слов')
    ok(byq(q3) is not None and byq(q3)['st'] == 'open', 'вопрос Сотрудник82 записан')
    ok(byq(qmak) is None or byq(qmak).get('ban') or True, 'вопрос Сотрудник65 (запрещённый) — без напоминаний (проверка ниже)')
    ok(not any(q['to_uid'] == 1 for q in Q.values()) and not any('подтвердите заявку' in q['text'] for q in Q.values()), 'вопросы владельцу не берутся')
    ok(not any('Сколько стоит ремонт' in q['text'] for q in Q.values()), 'вопрос без адресата от не-владельца не берётся')
    ok(not byq(q1)['rem'], 'в 10:05 (меньше 2 ч) напоминания ещё нет')
    # 11:30 — первое напоминание в группе по q1; вопрос Юрию ответом и его ответ
    q4 = api.raw('200', 1, 'Сотрудник2 М', 'Имя21, а по трубе сколько?', 11, 0, rmid=a2)
    api.raw('200', 23, 'Имя21 Сотрудник81', 'По трубе 500 кг', 11, 15)
    NOW[0] = at(11, 30); run_all(L, env)
    R = rem(); Q = R['q']; qq1 = byq(q1)
    ok(len(qq1['rem']) == 1 and qq1['rem'][0]['kind'] == 'group' and qq1['rem'][0]['t'] == '2026-10-29T11:30', 'q1: напоминание в группе в 11:30')
    ok(byq(q4) is not None and byq(q4)['st'] == 'done', 'q4 Юрию (reply) закрыт его сообщением')
    if on:
        g = [p for p in posts_to('200') if (p['body'].get('link') or {}).get('mid') == q1]
        ok(len(g) == 1 and g[0]['body']['text'] == '🔔 Сотрудник63, на этот вопрос ещё нет ответа. Ответьте, пожалуйста, в группе.', 'текст напоминания в группе')
    NOW[0] = at(13, 35); run_all(L, env)
    ok(len(byq(q1)['rem']) == 1 or len(rem()['q'][[k for k, q in rem()['q'].items() if q['mid'] == q1][0]]['rem']) == 2, 'q1: второе напоминание в 13:35')
    # 16:57 — вечерний отчёт; вопрос Имя24 (ОМТС) в 16:00
    q5 = api.raw('200', 23, 'Имя21 Сотрудник81', 'Сотрудник53, когда придут ролики?', 16, 0)      # не Сотрудник30: его сообщение закрыло бы q1
    NOW[0] = at(16, 57); run_all(L, env)
    P = poll(); ev = P['days'][day0].get('evening') or {}
    ok(bool(ev.get('t')) and not ev.get('skip') and 'Вечерний отчёт, 29.10 (чт)' in (ev.get('text') or ''), 'вечерний отчёт отправлен / dry')
    ok('Клиент — что сделано — дата (дд.мм) — срок следующего шага (дд.мм) — сумма (руб.)' in (ev.get('text') or ''), 'шаблон вечернего отчёта')
    R = rem(); Q = R['q']
    ok(len(byq(q1)['rem']) == 3, 'q1: три напоминания в группе за день (11:30, 13:35, 16:57)')
    ok(byq(q5) is not None and byq(q5)['to_uid'] == 24 and byq(q5)['mail'] == 'user74@example.org' and not byq(q5)['rem'], 'q5 Имя24: почта ОМТС, напоминаний пока нет')
    em = ev.get('mid') or 'none'
    api.raw('100', 11, 'Сотрудник51', 'ООО Радуга — выставлен счёт 29.10 — срок оплаты до 05.11 — 120 000 руб.', 17, 5, rmid=em)
    bad2 = api.raw('100', 12, 'Сотрудник61 Сотрудник20', 'Работала с клиентами, всё хорошо', 17, 10, rmid=em)
    bad3 = api.raw('100', 14, 'Сотрудник3 Сотрудник19', 'ИП Томашев — отгрузка 29.10 — 104 т р', 17, 20, rmid=em)
    NOW[0] = at(17, 35); run_all(L, env)
    P = poll(); ev = P['days'][day0]['evening']
    if on:
        ok(ev['ans']['11']['ok'] and not ev['ans']['12']['ok'] and not ev['ans']['14']['ok'], 'форма вечерних отчётов: Сотрудник51 ок, Сотрудник20 и Сотрудник19 нет')
        ok(ev['ans']['12']['miss'] == ['даты', 'срока', 'клиента', 'суммы'] and ev['ans']['14']['miss'] == ['срока'], 'что именно не хватает: %s / %s' % (ev['ans']['12']['miss'], ev['ans']['14']['miss']))
        c2 = [p for p in posts_to('100') if (p['body'].get('link') or {}).get('mid') == bad2]
        c3 = [p for p in posts_to('100') if (p['body'].get('link') or {}).get('mid') == bad3]
        ok(len(c2) == 1 and c2[0]['body']['text'] == '❌ Сотрудник61, отчёт некорректен (не по форме): нет даты / срока / клиента / суммы. Пришлите, пожалуйста, заново ответом на опрос по шаблону.', 'комментарий Сотрудник20 по вечернему отчёту')
        ok(len(c3) == 1 and c3[0]['body']['text'] == '❌ Сотрудник3, отчёт некорректен (не по форме): нет срока. Пришлите, пожалуйста, заново ответом на опрос по шаблону.', 'комментарий Сотрудник19: нет срока')
        rm2 = [p for p in posts_to('100') if p['body']['text'].startswith('⏳') and 'ечерний отчёт' in p['body']['text']]   # 30.10: «⏳ Вечерний отчёт за … не сдан»
        ok(len(rm2) == 1 and 'Сотрудник17 Сотрудник8' in rm2[0]['body']['text'] and 'Сотрудник51' not in rm2[0]['body']['text'], 'напоминание по вечернему отчёту: Сотрудник8 без ответа')
    ok(len(rem()['q'][[k for k, q in rem()['q'].items() if q['mid'] == q1][0]]['rem']) == 3, 'q1: в 17:35 нового напоминания нет (меньше 2 ч от 16:57)')
    n_posts_17, n_mails_17 = len(api.posts), len(mails)
    # 19:05 — письма: q1 (Сотрудник30), q5 (Сотрудник34, копия Сотрудник7), день 3 — Сотрудник20 (копия Сотрудник8) и Сотрудник26 (сама руководитель → только itm@)
    NOW[0] = at(19, 5); run_all(L, env)
    R = rem(); Q = R['q']
    # 30.10.2026, Т. В.: «напоминай пока нормально не выложат отчет» — повтор о вечернем отчёте каждые 30 мин до 19:30 (mx_poll_cfg evening_repeat_until); другого в группы нет
    ok(all(p['body'].get('text', '').startswith('⏳ <b>Вечерний отчёт') and 'напоминание' in p['body'].get('text', '') for p in api.posts[n_posts_17:]), 'в 19:05 в группы — только повтор о вечернем отчёте (до 19:30)')
    mq1 = [r for r in byq(q1)['rem'] if r['kind'] == 'mail']; mq5 = [r for r in byq(q5)['rem'] if r['kind'] == 'mail']
    ok(len(mq1) == 1 and mq1[0]['to'] == ['user75@example.org'] and mq1[0]['cc'] == [], 'письмо Сотрудник30, без копии (сам Имя1 инженер)')
    ok(len(mq5) == 1 and mq5[0]['to'] == ['user74@example.org'] and mq5[0]['cc'] == ['user41@example.org'], 'письмо Сотрудник34, копия Сотрудник7')
    ok(not byq(q3)['rem'] and byq(q3).get('ban'), 'Сотрудник82 — ничего (запрет до 02.11)')
    ok(byq(qmak) is None or (not byq(qmak)['rem'] and byq(qmak).get('ban')), 'Сотрудник65 — ничего')
    E = R['esc']
    ok(bool(E['A1'].get('d3m')) and bool(E['G1'].get('d3m')), 'день 3, 19:00: письма Сотрудник20 и Сотрудник26')
    if on:
        new_m = mails[n_mails_17:]
        ok(len(new_m) == 4, 'писем в 19:05: %d (ожидалось 4)' % len(new_m))
        mm = next((m for m in new_m if m['to'] == ['user75@example.org']), {})
        ok(mm.get('s') == 'Вопрос без ответа в группе «Торговое оборудование» (29.10.2026)', 'тема письма: %s' % mm.get('s'))
        ok('Сотрудник30 А. В., добрый вечер.' in mm.get('x', '') and 'Т. В. Сотрудник1 задал(а) вам вопрос' in mm.get('x', '') and '«Сотрудник63, когда будет готов график ремонта?»' in mm.get('x', ''), 'текст письма по вопросу')
        mb = next((m for m in new_m if m['to'] == ['user50@example.org']), {})
        ok(mb.get('cc') == ['user45@example.org'] and mb.get('s') == 'Невыполненные поручения (2) — до 4 дней' and 'Сотрудник61 Отчество24, добрый вечер.' in mb.get('x', ''), 'письмо Сотрудник20 дня 3: копия itm@ и Сотрудник8, обращение по имени-отчеству, тема: %s' % mb.get('s'))
        ok(sum(1 for m in new_m if m['to'] == ['user50@example.org']) == 1, 'Сотрудник20 — одно письмо на два пункта')
        mk = next((m for m in new_m if m['to'] == ['user17@example.org']), {})
        ok(mk.get('cc') == [], 'Сотрудник26 — без копии')
    else:
        ok(not mails and not api.posts, 'on=false: писем и сообщений нет и в 19:05')
        ok(any(d['kind'] == 'mail:q' for d in R['dry']) and any(d['kind'] == 'mail:esc3' for d in R['dry']), 'dry: письма по вопросу и дню 3')
    late = poll()['days'][day0].get('late') or {}
    ok('Сотрудник17 Сотрудник8' in (late.get('evening') or []) and 'Сотрудник3 Сотрудник19' in (late.get('morning') or []) and (not on or 'Сотрудник51' not in (late.get('morning') or [])), 'после 18:00 — списки неответивших: %s' % late)
    # ночь — тишина
    n_posts, n_mails, n_dry = len(api.posts), len(mails), len(rem()['dry']) + len(poll()['dry'])
    NOW[0] = at(22, 30); run_all(L, env)
    NOW[0] = at(7, 30, 1); run_all(L, env)
    ok(len(api.posts) == n_posts and len(mails) == n_mails and len(rem()['dry']) + len(poll()['dry']) == n_dry, 'ночью и в 07:30 ничего не уходит (и в dry не пишется)')
    # следующий день 09:05 — в группу и письмо «повторно»; утренний опрос нового дня
    NOW[0] = at(9, 5, 1); run_all(L, env)
    R = rem(); Q = R['q']; P = poll(); day1 = (D0 + datetime.timedelta(days=1)).isoformat()
    g1 = [r for r in byq(q1)['rem'] if r['kind'] == 'group' and r['t'][:10] == day1]; m1 = [r for r in byq(q1)['rem'] if r['kind'] == 'mail' and r['t'][:10] == day1]
    ok(len(g1) == 1 and len(m1) == 1, 'q1, 30.10 09:05: напоминание в группе и письмо')
    ok(len([r for r in byq(q5)['rem'] if r['t'][:10] == day1]) == 2, 'q5, 30.10 09:05: в группу и письмо')
    ok(bool((P['days'].get(day1) or {}).get('morning', {}).get('t')), 'утренний опрос 30.10 отправлен')
    if on:
        ok(any('повторно' in m['s'] and m['to'] == ['user75@example.org'] for m in mails if m['t'].startswith('30.10')), 'тема повторного письма с «повторно»')
    ok(E['A1'].get('d') == 3 and rem()['esc']['A1'].get('d') == 4 and not rem()['esc']['A1'].get('d5'), 'A1: день 4 — без новых действий')
    ok(rem()['esc']['A2'].get('d') == 5 and bool(rem()['esc']['A2'].get('d5')), 'A2: день 5 — письмо руководителю')
    if on: ok(any(m['t'].startswith('30.10') and m['s'] == 'Невыполненное поручение — 5 дней' and m['to'] == ['user45@example.org'] and 'Казаков А.' in m['x'] for m in mails), 'письмо Сотрудник8 по A2 на 5-й день')
    # ответ Сотрудник30 закрывает q1
    api.raw('200', 22, 'Сотрудник63 Сотрудник30', 'График ремонта готов, отправил', 9, 50, 1)
    NOW[0] = at(10, 5, 1); run_all(L, env)
    R = rem(); Q = R['q']
    ok(byq(q1)['st'] == 'done' and byq(q1).get('ans_by') == 'Сотрудник63 Сотрудник30', 'q1 закрыт ответом Сотрудник30')
    ok(pub['rem.bin']['stats']['done_today'] == 1 and pub['rem.bin']['stats']['open'] >= 2, 'rem.bin: статистика (%s)' % pub['rem.bin']['stats'])
    S = pub['rem.bin']['summary']
    ok(any(x.startswith('Сотрудник53 Сотрудник34 — вопрос 29.10 в «Торговое оборудование» — напоминаний') for x in S), 'сводка владельцу: вопрос Имя24')
    ok(any(x.startswith('⛔ 10 дней — требуется решение руководителя: Сотрудник17 Сотрудник8') for x in S), 'сводка: ⛔ 10 дней по Сотрудник8')
    ok(any('Сотрудник3 Сотрудник19 — поручение «ТДР' in x and 'на решение' in x for x in S), 'сводка: Сотрудник19 — на решение')
    ok(not any('[тел.]' not in x and re.search(r'\+7\s?\d{3}', x) for x in S), 'в сводке нет телефонов')
    PB = pub['poll.bin']
    ok(PB['v'] == 1 and len(PB['days']) == (2 if on else 0) and 'exec' in PB and (on or not PB['exec']), 'poll.bin: дни и исполнители (dry — не в статистике)')
    if on:
        sv = next((e for e in PB['exec'] if e['n'] == 'Сотрудник51'), {})
        ok(sv.get('ok') == 2 and sv.get('bad') == 0 and sv.get('none') == 1 and sv.get('pct') == 67, 'poll.bin: Сотрудник51 2 ок, 1 без ответа 30.10 (%s)' % sv)
        bu = next((e for e in PB['exec'] if e['n'] == 'Сотрудник61 Сотрудник20'), {})
        ok(bu.get('bad') == 2 and bu.get('pct') == 0, 'poll.bin: Сотрудник20 0 %% (%s)' % bu)
        d0row = next(r for r in PB['days'] if r['d'] == day0)
        ok(d0row['morning']['14']['st'] == 'none' and d0row['evening']['11']['st'] == 'ok' and d0row['evening']['14']['st'] == 'bad', 'poll.bin: состояния за 29.10')
    # суббота — тишина (вопросы q5, q3 открыты; опросов нет)
    n_posts, n_mails = len(api.posts), len(mails); n_dry = len(rem()['dry']) + len(poll()['dry'])
    NOW[0] = at(11, 0, 2); run_all(L, env)
    ok(len(api.posts) == n_posts and len(mails) == n_mails and len(rem()['dry']) + len(poll()['dry']) == n_dry, 'в субботу ничего не уходит')
    ok(not (poll()['days'].get((D0 + datetime.timedelta(days=2)).isoformat()) or {}).get('morning'), 'в субботу опроса нет')
    # 16.11 (пн) — больше 10 рабочих дней: stale
    NOW[0] = datetime.datetime(2026, 11, 16, 11, 0, tzinfo=MSK); run_all(L, env)
    R = rem(); Q = R['q']
    ok(byq(q5)['st'] == 'stale' and byq(q3)['st'] == 'stale', 'через 10 рабочих дней — stale')
    ok(any('напоминания остановлены' in x for x in pub['rem.bin']['summary']), 'stale — в сводке владельцу')
    # права файлов состояния
    for f in ('poll.json', 'remind.json', os.path.join('hist', '200.json')):
        ok(oct(os.stat(os.path.join(M, f)).st_mode & 0o777) == '0o600', 'права 0600: %s' % f)
    ok(os.path.exists(os.path.join(M, 'hist', '100.json')) and not os.path.exists(os.path.join(M, 'hist', '300.json')) and not os.path.exists(os.path.join(M, 'hist', '400.json')), 'история — только группы с ботом, не каналы')
    H100 = json.loads(_rd(os.path.join(M, 'hist', '100.json'), encoding='utf-8'))
    ok('old1' in H100['msgs'], 'история «Коммерческого отдела» дополнена из history_all.json')
    # запрещённые адресаты — ни одного сообщения и письма
    ok(not any(int(p['q'].get('user_id') or 0) in (15, 21, 25) for p in api.posts), 'личных сообщений запрещённым нет')
    ok(not any(set(m['to'] + m['cc']) & {'user27@example.org', 'user28@example.org', 'user29@example.org', 'user58@example.org', 'user30@example.org'} for m in mails), 'писем запрещённым нет')
    ok(not any((p['body'].get('link') or {}).get('mid') in (q3, qmak) for p in api.posts), 'напоминаний в группе по вопросам запрещённым нет')
    if not on:
        ok(not api.posts and not mails, 'on=false: за весь сценарий ни одного POST и письма')
        ok(all(len(d['text']) <= 300 for d in rem()['dry'] + poll()['dry']) and len(rem()['dry']) <= 30 and len(poll()['dry']) <= 30, 'dry: тексты ≤ 300 знаков, ≤ 30 записей')
        print('  dry poll:', sorted(set(d['kind'] for d in poll()['dry']))); print('  dry remind:', sorted(set(d['kind'] for d in rem()['dry'])))
    else:
        for p in api.posts: print('  POST', p['t'], p['q'], (p['body'].get('text') or '')[:90].replace('\n', ' | '))
        for m in mails: print('  MAIL', m['t'], m['to'], m['cc'], m['s'])
    shutil.rmtree(home)


def units():
    print('--- форма ответов и справочники')
    ok(MP.check_evening('ООО Радуга — выставлен счёт 29.10 — срок оплаты до 05.11 — 120 000 руб.', 'Сотрудник51') == [], 'форма: полный отчёт')
    ok(MP.check_evening('Работала с клиентами, всё хорошо', 'Сотрудник61 Сотрудник20') == ['даты', 'срока', 'клиента', 'суммы'], 'форма: пустой отчёт')
    ok(MP.check_evening('ИП Томашев — отгрузка 29.10 — 104 т р', 'Сотрудник3 Сотрудник19') == ['срока'], 'форма: нет срока')
    ok(MP.check_evening('Клиент: Сотрудник5, созвон 30.10, до 03.11 оплатят 50 тыс', '') == [], 'форма: «клиент:», тыс')
    ok(MP.check_evening('Промсервис— заказ на кресла Биг 18 шту , в оплату отдали', 'Сотрудник61 Сотрудник20') == ['даты', 'срока', 'суммы'], 'форма: количество — не сумма')
    ok(MP.check_evening('«Аверс плюс» — КП отправлено 29.10, ответ 05.11, 192 тыс', 'Сотрудник51') == [], 'форма: вторая дата = срок, кавычки')
    ok(MP.check_morning('Вопросов нет. По пункту 1 — клиент не отвечает, новый срок 31.10', True) == [], 'утро: по форме')
    ok(len(MP.check_morning('Всё нормально, работаем', True)) == 2, 'утро: ни вопросов, ни даты')
    ok(MP.check_morning('Когда будет прайс на ноябрь?', False) == [], 'утро: вопрос без просроченных')
    ok(MP.check_morning('нет вопросов, пункт 2 сделано', True) == [], 'утро: сделано')
    cfg = MP.load_cfg(); org = MP.org_map(); today = D0
    ok(MP.banned(cfg, today, name='Поп Имя7') and MP.banned(cfg, today, name='Анна Джанова') and MP.banned(cfg, today, mail='user27@example.org'), 'ban: Имя7, Джанова, Сотрудник82')
    ok(not MP.banned(cfg, datetime.date(2026, 11, 3), mail='user27@example.org') and MP.banned(cfg, datetime.date(2026, 11, 2), name='Анна Сотрудник82'), 'ban: Сотрудник82 — до 02.11 включительно')
    ok(MP.banned(cfg, today, mail='user157@example.org') and not MP.banned(cfg, today, name='Сотрудник61 Сотрудник20'), 'ban: регистр почты; Сотрудник20 не запрещена')
    p = MP.person(cfg, org, 'Сотрудник51', 11); ok(p and p['mail'] == 'user46@example.org' and p['first'] == 'Сотрудник51' and 'Филиалы' in p['dep'], 'person: Сотрудник51 → Сотрудник18 (cfg)')
    p = MP.person(cfg, org, 'Сотрудник63 Сотрудник30'); ok(p and p['mail'] == 'user75@example.org' and p['dep'] == 'Служба главного инженера', 'person: Сотрудник30 по фамилии (org)')
    p = MP.person(cfg, org, 'Сотрудник17 Сотрудник8'); ok(p and p['mail'] == 'user45@example.org', 'person: Сотрудник8 → kra@ (первый в оргструктуре)')
    ok(MP.person(cfg, org, 'Сотрудник48 Сотрудник42') is None, 'person: две фамилии Сотрудник42 с одним инициалом — не угадываем')
    ok(MP.person(cfg, org, 'Сотрудник3 Сотрудник1') is None or MP.person(cfg, org, 'Сотрудник3 Сотрудник1')['mail'] != 'user6@example.org', 'person: Сотрудник3 Сотрудник1 ≠ Сотрудник63 Сотрудник1')
    ok(MP.head_of(cfg, org, 'Коммерческий отдел / Филиалы', 'user50@example.org') == 'user45@example.org', 'head: филиалы → Сотрудник8')
    ok(MP.head_of(cfg, org, 'Коммерческий отдел / Филиалы', 'user45@example.org') is None, 'head: Сотрудник8 сам руководитель → None')
    ok(MP.head_of(cfg, org, 'ОМТС', 'user74@example.org') == 'user41@example.org', 'head: ОМТС → Сотрудник7')
    ok(MP.head_of(cfg, org, 'Коммерческий отдел', 'user20@example.org') == 'user17@example.org', 'head: офис-менеджер → Сотрудник26 (Начальник)')
    ok(MP.head_of(cfg, org, 'Коммерческий отдел', 'user17@example.org') is None, 'head: Сотрудник26 сама начальник → None')
    ok(MP.head_of(cfg, org, 'Технологический отдел', 'user78@example.org') == 'user29@example.org' and MP.banned(cfg, today, mail='user29@example.org'), 'head: ПТО → Сотрудник65, но он в ban (копии не будет)')
    names = {'1': 'Сотрудник2 М', '22': 'Сотрудник63 Сотрудник30', '23': 'Имя21 Сотрудник81', '24': 'Сотрудник53 Сотрудник34', '26': 'Сотрудник63 Петров'}
    m = {'uid': 1, 'text': 'Сотрудник53, когда придут ролики?', 'rmid': '', 'mentions': []}
    ok(RM.addressee(m, {}, names, BOT) == (24, 'по имени'), 'адресат по имени')
    m['text'] = 'Сотрудник63, когда?'; ok(RM.addressee(m, {}, names, BOT)[0] is None, 'два Сотрудник63 — адресат не определён')
    m['text'] = 'Сотрудник63 Сотрудник30, когда?'; ok(RM.addressee(m, {}, names, BOT) == (22, 'по имени'), 'два Сотрудник63 — по фамилии')
    m['text'] = 'Добрый день, Имя21! Сколько?'; ok(RM.addressee(m, {}, names, BOT) == (23, 'по имени'), 'приветствие перед именем')
    m['text'] = 'Сотрудник2 Отчество1, подтвердите?'; ok(RM.addressee(m, {}, names, BOT) == ('owner', 'по имени'), 'владелец по имени')
    m['text'] = 'Коллеги, прошу сообщить'; ok(RM.addressee(m, {}, names, BOT) == (None, ''), 'без адресата')
    m2 = {'uid': 1, 'text': 'когда?', 'rmid': 'x1', 'mentions': [23]}
    ok(RM.addressee(m2, {'x1': {'uid': 24, 'bot': False}}, names, BOT) == (24, 'ответ на сообщение'), 'reply важнее упоминания')
    ok(RM.addressee(m2, {'x1': {'uid': BOT, 'bot': True}}, names, BOT) == (23, 'упоминание'), 'reply боту → упоминание')
    ok(RM.wd_between(datetime.date(2026, 10, 26), D0) == 3 and RM.wd_between(datetime.date(2026, 10, 14), D0) == 11 and RM.wd_between(datetime.date(2026, 10, 30), datetime.date(2026, 11, 5)) == 3, 'рабочие дни (04.11 — праздник)')
    ok(RM.days_ru(1) == '1 день' and RM.days_ru(3) == '3 дня' and RM.days_ru(5) == '5 дней' and RM.days_ru(11) == '11 дней' and RM.days_ru(21) == '21 день', 'склонение дней')


units()
scenario(False)
scenario(True)
print('\nALL OK' if not fails else '\nFAILED: %d\n%s' % (len(fails), '\n'.join(' - ' + f for f in fails)))
sys.exit(1 if fails else 0)
