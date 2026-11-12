# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — команды ботам письмом на ящик user1@example.org (28.10.2026).
Пользователь: «Дай права моему брату писать команды ботам через почту 1c@» — Сотрудник1 Сотрудник3 Отчество1.

Кто может писать: code/mail_cmd.json → "people": [{"name", "emails": [...], "max": id в MAX}]. Письмо принимается, только если
  1) адрес «От» есть в списке и
  2) Google при приёме подтвердил подлинность отправителя (верхний заголовок Authentication-Results от mx.google.com:
     dmarc=pass, или dkim=pass с доменом отправителя, или spf=pass с тем же доменом) — подделанное «От» не пройдёт.
Как бот понимает письмо (тема, если пустая — первая строка текста):
  • «/sklad осло», «/vypusk», «/dannye», «/docs», «/help», «/my», «/zhurnal», «/promt», «/users», «меню» — команда боту, как если бы
    человек написал её боту в MAX;
  • «Вопрос: …» или тема со знаком «?» — вопрос помощнику бота;
  • всё остальное — задача (правка) для портала и ботов: бот заводит задачу «Другое» с темой и текстом письма, она попадает в журнал
    правок (утверждает Т. В. Сотрудник1) → промт для Claude → выкладка; номер задачи бот присылает в MAX.
  Вложения (скриншоты, файлы) кладутся на Google Диск 1c@: «Фабрика — портал/Письма-команды», в задаче — их список.
Ответ бота приходит в MAX и копией письмом на адрес отправителя (с itm@, копия itm@) — в течение ~10 минут.
Связь с ботом — та же, что у зеркала MAX: op maxupd в Google-скрипт «Фабрика» с общим ключом (~/.fabrika_max/config.json, не выводится);
ответы бота для MAX идут через max/relay.php — он же записывает их для письма (~/.fabrika_max/mailout.jsonl), пока ждём ответ.
Ящик — только чтение (BODY.PEEK): ничего не удаляет, не помечает. Состояние — state/mail_cmd.json."""
import datetime, email, email.header, email.policy, email.utils, html, imaplib, json, os, re, ssl, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
MSK = datetime.timezone(datetime.timedelta(hours=3))
MAX_BASE = 7000000000000000
CMD = re.compile(r'^(/[A-Za-zА-Яа-яЁё_]+\b.*|меню|команды|помощь)$', re.I | re.S)
ASK = re.compile(r'^(вопрос|спросить)\s*[:\-—]\s*', re.I)
TASK = re.compile(r'^(задача|правка|поправка|исправить|исправление)\s*[:\-—]\s*', re.I)
RE_PFX = re.compile(r'^\s*((re|fw|fwd|отв|пересл)\s*(\[\d+\])?\s*:\s*)+', re.I)
WAIT = 15 * 60                     # сколько ждать ответы бота для письма-ответа
MAX_TEXT = 1400                    # задача «Другое» в боте — до 1500 знаков


def _cfg():
    try: return json.load(open(os.path.join(HERE, 'mail_cmd.json'), encoding='utf-8'))
    except Exception: return {}


def _now(): return datetime.datetime.now(MSK)


def _addr(h):
    n, a = email.utils.parseaddr(re.sub(r'[\t\r\n]+', ' ', str(h or '')))
    try: n = str(email.header.make_header(email.header.decode_header(n)))
    except Exception: pass
    return n.strip().strip('"'), a.strip().lower()


def _dom(a): return a.rsplit('@', 1)[-1].lower() if '@' in a else ''


def authentic(msg, frm):
    """подлинность отправителя по верхнему Authentication-Results, который поставил приёмный сервер Google"""
    ars = msg.get_all('Authentication-Results') or []
    ar = next((str(x) for x in ars if re.match(r'\s*mx\.google\.com\s*;', str(x), re.I)), '')   # 12.11 CodeQL: именно «mx.google.com;», а не «mx.google.com.чужой»
    if not ar: return False, 'нет отметки Google о проверке'
    a = re.sub(r'\s+', ' ', ar.lower()); d = _dom(frm)
    m = re.search(r'dmarc=(\w+)[^;]*?header\.from=([\w.-]+)', a)
    if m and m.group(1) == 'pass' and m.group(2) == d: return True, 'dmarc=pass'
    for m in re.finditer(r'dkim=(\w+)[^;]*?header\.(?:i|d)=@?([\w.-]+)', a):
        if m.group(1) == 'pass' and (m.group(2) == d or m.group(2).endswith('.' + d)): return True, 'dkim=pass'
    m = re.search(r'spf=(\w+)[^;]*?smtp\.mailfrom=(?:[^@\s;]*@)?([\w.-]+)', a)
    if m and m.group(1) == 'pass' and m.group(2) == d: return True, 'spf=pass'
    return False, 'проверка не пройдена: ' + a[:160]


def body_text(msg):
    part = None
    try: part = msg.get_body(preferencelist=('plain', 'html'))
    except Exception: pass
    if part is None: return ''
    try: t = part.get_content()
    except Exception: t = (part.get_payload(decode=True) or b'').decode(part.get_content_charset() or 'utf-8', 'replace')
    if part.get_content_type() == 'text/html':
        t = re.sub(r'(?is)<(script|style).*?</\1>', ' ', t)
        t = re.sub(r'(?is)<blockquote.*?</blockquote>', ' ', t)                  # цитата прошлого письма
        t = re.sub(r'(?i)<br\s*/?>|</p>|</div>|</tr>|</li>', '\n', t)
        t = html.unescape(re.sub(r'<[^>]+>', ' ', t))
    out = []
    for ln in t.replace('\r', '').split('\n'):
        s = ln.strip()
        if s.startswith('>'): continue
        if re.match(r'^(--|—|__)\s*$', s) or re.match(r'^(с уважением|с наилучшими|best regards|regards|спасибо[,!.]?\s*$)', s, re.I): break   # подпись
        if re.match(r'^(-{2,}\s*(original|исходное|пересылаемое)|(on|в)\s.+(wrote|писал|пишет)\s*:\s*$|\d{1,2}[.\s].+\d{4}.*(писал|пишет|wrote)|от:\s|from:\s|отправлено (с|из)|sent from)', s, re.I): break
        out.append(s)
    t = '\n'.join(out)
    return re.sub(r'\n{3,}', '\n\n', t).strip()


def classify(subj, text):
    """→ ('cmd'|'ask'|'task', текст для бота)"""
    s = RE_PFX.sub('', subj or '').strip()
    first = (text.split('\n', 1)[0] if text else '').strip()
    head = s or first
    if TASK.match(head): return 'task', (TASK.sub('', head) + ('\n' + text if text and head == s else '')).strip()
    if ASK.match(head): return 'ask', (ASK.sub('', head) + ('\n' + text if text and head == s else '')).strip()
    if CMD.match(head):
        c = head.split('\n')[0][:300]
        return 'cmd', '/help' if c.lower() in ('меню', 'команды', 'помощь') else c
    if s and s.endswith('?') and len(text) < 200: return 'ask', (s + ('\n' + text if text else '')).strip()
    return 'task', ((s + '\n' if s else '') + text).strip()


def _gas(url, key, u):
    rq = urllib.request.Request(url, data=json.dumps({'op': 'maxupd', 'key': key, 'u': u}, ensure_ascii=False).encode('utf-8'),
                                headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(rq, timeout=60) as r: raw = r.read().decode('utf-8', 'replace')
    try: return json.loads(raw)
    except Exception: return {'ok': False, 'error': 'ответ не JSON: ' + raw[:100]}


def _upd(kind, uid, name, text=None, data=None, seq=0):
    bid = MAX_BASE + int(uid)
    frm = {'id': bid, 'is_bot': False, 'first_name': name[0], 'last_name': name[1], 'username': ''}
    ts = int(time.time() * 1000) + seq
    u = {'update_id': ts * 1000 + seq, 'via': 'max', 'mail': True}
    if kind == 'cb':
        u['callback_query'] = {'id': 'max:mail%d' % ts, 'data': data, 'from': frm, 'message': {'message_id': '', 'chat': {'id': bid, 'type': 'private'}}}
    else:
        u['message'] = {'message_id': 'mail%d' % ts, 'date': ts // 1000, 'chat': {'id': bid, 'type': 'private'}, 'from': frm, 'text': text}
    return u


def _maxdir(L): return os.path.join(os.path.dirname(L), '.fabrika_max')


def _mx_key(L):
    try: return json.load(open(os.path.join(_maxdir(L), 'config.json'), encoding='utf-8')).get('key') or ''
    except Exception: return ''


def _replies(L, st, mail_send, log):
    """собранные ответы бота → письмо отправителю, когда ожидание кончилось или ответы перестали приходить (2 мин)"""
    M = _maxdir(L); p = os.path.join(M, 'mailout.jsonl'); now = int(time.time())
    if os.path.exists(p):
        q = os.path.join(M, 'mailout.%d.jsonl' % now)
        os.replace(p, q)                                             # relay.php дальше пишет в новый файл
        for ln in open(q, encoding='utf-8'):
            try: r = json.loads(ln)
            except Exception: continue
            w = st['wait'].get(str(r.get('chat')))
            tx = str(r.get('text') or '')
            if re.match(r'^(Опишите задачу|Задача\n)', tx): continue        # промежуточные шаги задачи — в письмо не нужны
            if w and int(r.get('t', 0)) >= int(w['t0']) - 5: w.setdefault('out', []).append([int(r['t']), tx[:3500]])
        try: os.remove(q)
        except Exception: pass
    sent = 0
    for chat, w in list(st['wait'].items()):
        last = max([w['t0']] + [x[0] for x in w.get('out', [])])
        if not (now > w['exp'] or (w.get('out') and now - last > 120)): continue
        if w.get('out'):
            sj = w['subj'] if isinstance(w['subj'], list) else [w['subj']]
            txt = ('Ответ бота «Фабрика» на %s %s (%s):\n\n' % ('ваше письмо' if len(sj) == 1 else 'ваши письма', ', '.join('«%s»' % x[:100] for x in sj), w['when'])) + '\n\n— — —\n\n'.join(x[1] for x in w['out'])
            txt += '\n\n--\nПисьмо-ответ отправлено автоматически: команды боту письмом на user1@example.org (портал «Фабрика»). Те же ответы — в боте «Фабрикант» в MAX.'
            r = mail_send('Re: ' + sj[0][:150] + (' и ещё %d' % (len(sj) - 1) if len(sj) > 1 else ''), txt, [w['to']], ['user5@example.org'])
            log('письмо-команда: ответ бота →', w['to'], r); sent += 1
        st['wait'].pop(chat, None)
    if sent:
        try: _sync_wait(L, st)
        except Exception: pass
    return sent


def _sync_wait(L, st):
    p = os.path.join(_maxdir(L), 'mailwait.json')
    W = {k: {'exp': v['exp'], 't0': v['t0']} for k, v in st['wait'].items()}
    tmp = p + '.tmp'; json.dump(W, open(tmp, 'w', encoding='utf-8')); os.chmod(tmp, 0o600); os.replace(tmp, p)


def _att_save(L, msg, when, subj, log):
    """вложения → Диск 1c@ «Фабрика — портал/Письма-команды»; вернуть список имён"""
    names = []
    try: import gdrive_1c as GD
    except Exception: GD = None
    for part in msg.walk():
        fn = part.get_filename()
        if not fn or part.get_content_maintype() == 'multipart': continue
        try: fn = str(email.header.make_header(email.header.decode_header(re.sub(r'[\t\r\n]+', '', fn))))
        except Exception: pass
        fn = re.sub(r'[\\/:*?"<>|]+', ' ', fn).strip()[:120] or 'file'
        data = part.get_payload(decode=True) or b''
        if not data or len(data) > 15 * 1024 * 1024: names.append(fn + ' (не сохранён: пустой или больше 15 МБ)'); continue
        name = when.strftime('%Y-%m-%d %H-%M') + ' — ' + fn
        ok = False
        if GD:
            try: r = GD.put_file(L, name, data, part.get_content_type() or 'application/octet-stream', sub='Письма-команды'); ok = bool(r.get('ok'))
            except Exception as e: log('  ! письмо-команда: вложение на Диск:', e.__class__.__name__, e)
        names.append(name + ('' if ok else ' (на Диск не легло)'))
    return names


def run(L, CFG, log, jload, jsave, mail_send, pw, budget=50):
    cfg = _cfg(); people = cfg.get('people') or []
    res = {'t': _now().strftime('%Y-%m-%dT%H:%M'), 'new': 0, 'done': 0, 'rej': 0}
    if not people: res['state'] = 'нет списка людей'; return res
    if not pw: res['state'] = 'нет пароля 1c@'; return res
    key = _mx_key(L); url = cfg.get('gas') or ''
    if not key or not url: res['state'] = 'нет ключа бота MAX или адреса скрипта'; return res
    st = jload('mail_cmd.json', {'uv': '', 'last': 0, 'wait': {}, 'log': []})
    st.setdefault('wait', {}); st.setdefault('log', [])
    try: res['replied'] = _replies(L, st, mail_send, log)
    except Exception as e: log('  ! письмо-команда: ответы:', e.__class__.__name__, e)
    if res.get('replied'): jsave('mail_cmd.json', st)       # 30.10.2026 аудит P10: сразу после отправки ответов
    who = {}
    for p in people:
        for a in p.get('emails') or []: who[a.strip().lower()] = p
    login = (CFG.get('mail_1c') or 'user1@example.org').lower()
    import mail_q as MQ
    # 29.10.2026: 1c@ (Google Workspace) читается и при read="gas" — пользователь: «на почте 1c@ все данные только для сайта»; ответы — через очередь
    t0 = time.time()
    M = imaplib.IMAP4_SSL('imap.gmail.com', 993, ssl_context=ssl.create_default_context())
    try:
        M.login(login, pw)
        typ, _ = M.select('INBOX', readonly=True)
        uv = (M.untagged_responses.get('UIDVALIDITY') or [b''])[0]; uv = uv.decode() if isinstance(uv, bytes) else str(uv)
        if st.get('uv') != uv:                                     # первый запуск: старые письма не исполняем, только новые
            typ, data = M.uid('SEARCH', None, 'ALL')
            ids = [int(x) for x in (data[0] or b'').split()] if typ == 'OK' else []
            st['uv'] = uv; st['last'] = max(ids) if ids else 0; res['state'] = 'начало: с UID %d' % st['last']
            jsave('mail_cmd.json', st); return res
        typ, data = M.uid('SEARCH', None, 'UID', '%d:*' % (int(st['last']) + 1))
        todo = sorted(int(u) for u in (data[0] or b'').split() if int(u) > int(st['last'])) if typ == 'OK' else []
        for u in todo:
            if time.time() - t0 > budget: break
            st['last'] = u
            # 30.10.2026 аудит P10: состояние — сразу после каждого письма-команды (раньше — в конце: обрыв участка или ошибка в одном
            # письме → те же команды исполнялись снова); одно кривое письмо не останавливает остальные
            try: _one(M, u, st, res, who, url, key, L, log)
            except imaplib.IMAP4.error: raise
            except Exception as e:
                log('  ! письмо-команда', u, e.__class__.__name__, str(e)[:120]); st['log'] = (st['log'] + [{'u': u, 'err': '%s %s' % (e.__class__.__name__, str(e)[:120])}])[-60:]
            jsave('mail_cmd.json', st)
    finally:
        try: M.logout()
        except Exception: pass
    jsave('mail_cmd.json', st)
    return res


def _one(M, u, st, res, who, url, key, L, log):
    """одно письмо на 1c@: от человека из списка — проверка подлинности и передача боту"""
    typ, d = M.uid('FETCH', str(u), '(BODY.PEEK[HEADER.FIELDS (FROM)])')
    hdr = next((x[1] for x in d or [] if isinstance(x, tuple)), b'')
    _, frm = _addr(email.message_from_bytes(hdr, policy=email.policy.default)['From'])
    p = who.get(frm)
    if not p: return                                       # не из списка — это отчёты 1С и прочее, не трогаем
    res['new'] += 1
    typ, d = M.uid('FETCH', str(u), '(RFC822.SIZE BODY.PEEK[])')
    raw = next((x[1] for x in d or [] if isinstance(x, tuple)), b'')
    msg = email.message_from_bytes(raw, policy=email.policy.default)
    ok, why = authentic(msg, frm)
    subj = re.sub(r'[\t\r\n]+', ' ', str(msg['Subject'] or '')).strip()
    try: when = email.utils.parsedate_to_datetime(msg['Date']).astimezone(MSK)
    except Exception: when = _now()
    rec = {'u': u, 't': when.strftime('%Y-%m-%dT%H:%M'), 'from': frm, 's': subj[:120]}
    if not ok:
        rec['rej'] = why; res['rej'] += 1; st['log'] = (st['log'] + [rec])[-60:]
        log('письмо-команда от', frm, 'отклонено:', why); return
    text = body_text(msg)
    kind, t = classify(subj, text)
    att = _att_save(L, msg, when, subj, log) if kind == 'task' else []
    uid = int(p['max']); nm = (p.get('first') or p['name'], p.get('last') or '')
    ups = []
    if kind == 'task':
        if att: t += '\n\nВложения (Google Диск 1c@ → «Фабрика — портал» → «Письма-команды»):\n' + '\n'.join('• ' + a for a in att)
        t = (t or '(письмо без текста)')[:MAX_TEXT] + '\n\n(задача письмом на 1c@ от ' + frm + ', ' + when.strftime('%d.%m %H:%M') + ')'
        ups = [_upd('cb', uid, nm, data='m:oth', seq=1), _upd('msg', uid, nm, text=t, seq=2), _upd('cb', uid, nm, data='ok', seq=3)]
    else:
        ups = [_upd('msg', uid, nm, text=t[:1500], seq=1)]
    chat = MAX_BASE + uid; tnow = int(time.time())
    w0 = st['wait'].get(str(chat))
    sj = subj or t.split('\n')[0][:80]
    if w0 and w0.get('exp', 0) > tnow:                     # несколько писем подряд — один ответ на все
        w0['subj'] = (w0['subj'] if isinstance(w0['subj'], list) else [w0['subj']]) + [sj]; w0['exp'] = tnow + WAIT
    else: st['wait'][str(chat)] = {'exp': tnow + WAIT, 't0': tnow, 'to': frm, 'subj': [sj], 'when': when.strftime('%d.%m %H:%M')}
    try: _sync_wait(L, st)
    except Exception as e: log('  ! письмо-команда: mailwait:', e)
    errs = []
    for up in ups:
        try:
            r = _gas(url, key, up)
            if not r.get('ok'): errs.append(str(r.get('error') or r)[:120])
        except Exception as e: errs.append(e.__class__.__name__ + ' ' + str(e)[:100])
        time.sleep(1.5)
    rec.update({'kind': kind, 'att': len(att), 'auth': why})
    if errs: rec['err'] = '; '.join(errs)[:300]; log('письмо-команда: ошибка передачи боту:', rec['err'])
    else: res['done'] += 1
    st['log'] = (st['log'] + [rec])[-60:]
    log('письмо-команда от', frm, '→', kind, '' if not att else 'вложений %d' % len(att))
