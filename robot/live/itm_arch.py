# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — архив отчётов из ящика user5@example.org (Mail.ru), 27.10.2026.
Пользователь: «по почтовому боту — пусть переберёт особенно папки экономика и производство и ОМТС, там много отчётов, их можно собрать
и систематизировать, период с 1 августа, чтобы собрать статистику».

Запуск — из live.py после помощника itm.py (cron хостинга), без Claude; за один запуск — не дольше ~2 минут, дальше — в следующий.
 • Папки открываются ТОЛЬКО для чтения (EXAMINE, BODY.PEEK): ничего не помечается, не удаляется и не перемещается.
 • Каждое письмо с 01.08.2026 → строка реестра state/arch_index.jsonl: папка, дата, отправитель, тема, вложения (имя, размер, sha256).
 • Вложения-документы (pdf, xls/xlsx, csv, doc/docx, odt/ods, zip/rar/7z, txt, xml) → ~/.fabrika_live/arch/files/<sha>.<расширение>
   (вне сайта, одинаковые файлы — один раз), не больше ARCH_CAP байт всего.
 • Известные отчёты (выпуск, ведомость, гальваника, склад, ПКС — те же правила, что у помощника) → ingest() из live.py: история на сайте.
Новые письма в этих папках архив тоже подбирает (по UID после последнего)."""
import datetime, email, email.header, email.policy, email.utils, hashlib, imaplib, json, os, re, ssl, time
import itm as IT

SINCE = datetime.date(2026, 8, 1)
FOLDERS = re.compile(r'^(экономика|производство|омтс)$', re.I)
DOC_EXT = ('.pdf', '.xls', '.xlsx', '.xlsm', '.xlsb', '.csv', '.doc', '.docx', '.odt', '.ods', '.zip', '.rar', '.7z', '.txt', '.xml', '.rtf')
ARCH_CAP = 3 * 1024 ** 3
MAX_MSG = 30 * 1024 * 1024
# 03.11.2026 ~21:00, Т. В.: «Отчёты из ящика 1c@ не забраны». Письмо ПЭО «11_Гальваника НОЯБРЬ 2026» (03.11 08:51, без вложения: «выпуск …
# за 02.11.2026 в 1С отсутствуют») ящик 1c@ прошёл раньше, чем робот научился читать такие письма (live.galv_none, 03.11) — за 02.11 гальваника
# числилась «не пришла». Ящик Gmail (1c@): письма по этим запросам, которые уже пройдены, один раз ставятся на повторный разбор (как при сбое
# разбора, fs['retry']): строка архива не задваивается, recv — тоже (повтор того же письма ничего не добавляет). Новый запрос — новая версия.
# 04.11.2026: Gmail режет «11_Гальваника» как одно слово — запрос subject:Гальваника письмо ПЭО «11_Гальваника НОЯБРЬ 2026» НЕ находил, повтор
#   (REREAD_V=1) прошёл мимо него, за 02.11 «выпуска в 1С нет» не легло. Теперь — по отправителю; лишние письма ПЭО отсекает itm.report_like
#   (нужно «гальваник» в теме/имени файла — подстрокой, «11_Гальваника» подходит). Новая версия — повтор ещё раз.
REREAD_V = 2
REREAD = ['from:(user14@example.org OR user13@example.org) after:2026/11/01']


def _ext(n):
    e = os.path.splitext(n.lower())[1]
    return e if re.match(r'^\.[a-z0-9]{1,5}$', e) else ''


def run(L, CFG, ingest, log, jload, jsave, budget=110, limit=150):
    return run_box(L, ingest, log, jload, jsave, IT.HOST, (CFG.get('itm_mail') or 'user5@example.org').lower(), IT.password(L),
                   lambda fl: [(raw, name) for raw, name, flags in fl if FOLDERS.match(name.strip())], 'arch.json', None, 'itm@', budget, limit)


# 28.10.2026, пользователь: ящик user1@example.org (Google Workspace «TechFabrikant») — сюда 1С присылает отчёты; «к порталу: IMAP + пароль приложения».
#   Пароль приложения — файл ~/.fabrika_live/imap_1c (делает пользователь в ISPmanager, никуда не выводится). Только чтение: «Входящие» (INBOX).
def pw_1c(L):
    p = os.path.join(L, 'imap_1c')
    try: os.chmod(p, 0o600)
    except Exception: pass
    try: return re.sub(r'\s+', '', open(p, encoding='utf-8').read())
    except Exception: return ''


def run_1c(L, CFG, ingest, log, jload, jsave, budget=60, limit=120):
    login = (CFG.get('mail_1c') or 'user1@example.org').lower()
    return run_box(L, ingest, log, jload, jsave, 'imap.gmail.com', login, pw_1c(L),
                   lambda fl: [(raw, name) for raw, name, flags in fl if raw.upper() == 'INBOX' or name.strip().lower() in ('inbox', 'входящие')][:1] or [('INBOX', 'INBOX')],
                   'arch_1c.json', 'ящик 1c@', '1c@', budget, limit)


def run_box(L, ingest, log, jload, jsave, host, me, pw, pick, stname, label, who, budget=110, limit=150):
    st = jload(stname, {'folders': {}, 'n': 0, 'files': 0, 'bytes': 0, 'reports': 0})
    res = {'t': IT._now().strftime('%Y-%m-%dT%H:%M'), 'new': 0, 'files': 0, 'reports': 0}
    if IT.off() and stname == 'arch.json': res['state'] = IT.off_text(); return res   # 29.10.2026: read="gas" (code/mail_cfg.json) — IMAP itm@ не открывается;
    # 1c@ (Google Workspace, imap.gmail.com) читается и в режиме gas — пользователь 29.10 ~18:00: «на почте 1c@ все данные только для сайта,
    # если что то новое тоже бери в работу и думай куда интегрировать». Бот (owner@) ящик 1c@ не видит; зависала только отправка через mail.ru.
    if not pw: res['state'] = 'нет пароля ' + who; return res
    if stname != 'arch.json':                                 # общий потолок места на диске — по основному архиву
        try: st['bytes'] = max(st.get('bytes') or 0, (jload('arch.json', {}) or {}).get('bytes') or 0)
        except Exception: pass
    root = os.path.join(L, 'arch', 'files'); os.makedirs(root, exist_ok=True)
    try: os.chmod(os.path.join(L, 'arch'), 0o700)
    except Exception: pass
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    t0 = time.time()
    lk = IT.imap_lock(L, 30) if host == IT.HOST else None   # 30.10.2026 аудит P17: общий замок входа в itm@ (1c@ — другой ящик, без замка)
    if host == IT.HOST and lk is None: res['state'] = IT.BUSY; return res
    try: M = imaplib.IMAP4_SSL(host, 993, ssl_context=ssl.create_default_context())
    except BaseException:
        if lk: lk.close()
        raise
    try:
        M.login(me, pw)
        fl = pick(IT.folders(M))
        res['folders'] = [n for _, n in fl]
        pending = 0
        with open(idx, 'a', encoding='utf-8') as out:
            for raw, name in fl:
                if time.time() - t0 > budget or res['new'] >= limit: pending += 1; continue
                typ, _ = M.select('"%s"' % raw, readonly=True)
                if typ != 'OK': continue
                uv = (M.untagged_responses.get('UIDVALIDITY') or [b''])[0]
                uv = uv.decode() if isinstance(uv, bytes) else str(uv)
                fs = st['folders'].get(raw) or {}
                if fs.get('uv') != uv: fs = {'uv': uv, 'last': 0, 'name': name, 'n': 0}
                typ, data = M.uid('SEARCH', None, 'UID', '%d:*' % (int(fs['last']) + 1), 'SINCE', SINCE.strftime('%d-%b-%Y'))
                todo = sorted(int(u) for u in (data[0] or b'').split() if int(u) > int(fs['last'])) if typ == 'OK' else []
                rt = fs.setdefault('retry', {})             # 30.10.2026 аудит P16: отчёты, разбор которых упал, — ещё попытки (строка реестра — один раз)
                if host == 'imap.gmail.com' and fs.get('rr') != REREAD_V:   # 03.11.2026: повторный разбор (REREAD); ящик с нуля — и так читается впервые
                    for q in (REREAD if int(fs.get('last') or 0) else []):
                        try:
                            M.literal = q.encode('utf-8')
                            typ_, dat_ = M.uid('SEARCH', 'CHARSET', 'UTF-8', 'X-GM-RAW')
                            for x in (dat_[0] or b'').split() if typ_ == 'OK' else []:
                                if int(x) <= int(fs['last']): rt.setdefault(str(int(x)), 0)
                        except Exception as e: log('  ! архив: повторный разбор', who, e.__class__.__name__, e)
                    fs['rr'] = REREAD_V
                todo = sorted(set(todo) | set(int(x) for x in rt))
                for u in todo:
                    if time.time() - t0 > budget or res['new'] >= limit: pending += 1; break
                    typ, d = M.uid('FETCH', str(u), '(RFC822.SIZE INTERNALDATE BODY.PEEK[HEADER])')
                    hdr = next((x[1] for x in d or [] if isinstance(x, tuple)), b'')
                    head = b' '.join(x[0] if isinstance(x, tuple) else x for x in d or [] if x)
                    size = int((re.search(rb'RFC822\.SIZE (\d+)', head) or [0, b'0'])[1])
                    full = None
                    if size < MAX_MSG:
                        typ, d = M.uid('FETCH', str(u), '(BODY.PEEK[])')
                        full = next((x[1] for x in d or [] if isinstance(x, tuple)), None)
                    msg = email.message_from_bytes(full or hdr, policy=email.policy.default)
                    fname, frm = IT.addr(msg['From'])
                    subj = IT.clean(msg['Subject']).strip()
                    try: t = email.utils.parsedate_to_datetime(msg['Date']).astimezone(IT.MSK).strftime('%Y-%m-%dT%H:%M')
                    except Exception: t = ''
                    row = {'f': label or name, 'u': u, 't': t, 'fr': frm, 'n': fname[:80], 's': subj[:240], 'sz': size, 'a': [],
                           'mid': hashlib.sha256(str(msg['Message-ID'] or (frm + subj + t)).encode('utf-8')).hexdigest()[:16]}
                    if full is None: row['big'] = True
                    for p in msg.walk():
                        fn = p.get_filename()
                        if not fn: continue
                        fn = IT.clean(fn)
                        try: fn = str(email.header.make_header(email.header.decode_header(fn)))
                        except Exception: pass
                        fn = IT.fix_ext(IT.clean(fn))
                        data_ = p.get_payload(decode=True) or b''
                        sha = hashlib.sha256(data_).hexdigest()
                        a = {'n': fn[:160], 'sz': len(data_), 'sha': sha[:24]}
                        ext = _ext(fn)
                        if data_ and ext in DOC_EXT:
                            dst = os.path.join(root, sha[:24] + ext)
                            if os.path.exists(dst): a['p'] = 1
                            elif st['bytes'] + len(data_) <= ARCH_CAP:
                                with open(dst + '.tmp', 'wb') as f: f.write(data_)
                                os.chmod(dst + '.tmp', 0o600); os.replace(dst + '.tmp', dst)
                                st['bytes'] += len(data_); st['files'] += 1; res['files'] += 1; a['p'] = 1
                        row['a'].append(a)
                    again = str(u) in rt
                    if again and not hdr: rt.pop(str(u), None); continue          # письма уже нет
                    if full and IT.report_like(frm, subj, [a['n'] for a in row['a']]):
                        try:
                            got = ingest(full) or []
                            row['r'] = ['%s %s' % (g.get('k'), g.get('date')) for g in got]
                            res['reports'] += len(got); st['reports'] += len(got); rt.pop(str(u), None)
                        except Exception as e:
                            log('  ! архив: отчёт', name, u, e.__class__.__name__, e)
                            rt[str(u)] = int(rt.get(str(u)) or 0) + 1                # 30.10.2026 аудит P16
                            if rt[str(u)] >= IT.QUAR_TRIES:
                                rt.pop(str(u), None)
                                res.setdefault('quar_list', []).append('%s %s uid %s «%s»: %s %s' % (who, name[:30], u, subj[:80], e.__class__.__name__, str(e)[:80]))
                    if again: continue                                              # повтор разбора — строка реестра и счётчики уже есть
                    out.write(json.dumps(row, ensure_ascii=False) + '\n'); out.flush()
                    fs['last'] = max(int(fs['last']), u); fs['n'] = int(fs.get('n') or 0) + 1
                    res['new'] += 1; st['n'] += 1
                    st['folders'][raw] = fs
                st['folders'][raw] = fs
        res['state'] = 'идёт' if pending else 'готово'
    except imaplib.IMAP4.error as e:
        res['state'] = ('Mail.ru: ' if host == IT.HOST else host + ': ') + str(e)[:160]
    finally:
        try: M.logout()
        except Exception: pass
        if lk: lk.close()
    try: os.chmod(idx, 0o600)
    except Exception: pass
    st['t'] = res['t']; st['state'] = res.get('state')
    jsave(stname, st)
    res.update({'total': st['n'], 'stored': st['files'], 'mb': round(st['bytes'] / 1048576, 1),
                'by_folder': {v.get('name', k): v.get('n', 0) for k, v in st['folders'].items()}})
    if res['new']: log('архив ' + who + ': писем', res['new'], '; файлов', res['files'], '; отчётов', res['reports'], '; всего', st['n'], ';', res['state'])
    return res
