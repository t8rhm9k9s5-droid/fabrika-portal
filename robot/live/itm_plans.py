# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
"""«Фабрика» — папка «Планы» ящика user5@example.org (12.11.2026).
Т. В. 12.11.2026: «Это все отчеты по планам продаж лежат в папке «Планы» на ящике ТМ. Поэтому я тебе разрешаю зайти именно
в этот ящик, именно в эту папку и проверить за год все отчеты.» (отчёты Сотрудник19 К. В. — планы и план-факт ФТС).

Что делает (из live.py, cron хостинга, без Claude; Python 3.6):
 • открывает в itm@ ТОЛЬКО папку с именем «Планы» (любой уровень вложенности) и ТОЛЬКО для чтения (EXAMINE, BODY.PEEK):
   письма не помечаются прочитанными, ничего не перемещается, не удаляется и не отправляется; другие папки не открываются;
 • письма с 01.01.2026: заголовки (дата, от кого, кому, копия, тема), начало текста (до 3000 знаков) и вложения
   (xls/xlsx/xlsm/csv/pdf/doc/docx/ods/odt/zip/rar/7z, до 15 МБ каждое) → ~/.fabrika_live/plans/files/<sha> (вне сайта, 0600);
 • публикует для владельца (ключ k_owner, как mq.bin): st/exp_pln_idx.bin — список писем и вложений,
   st/exp_pln_<k>.bin — сами вложения частями до ~5 МБ (base64). Части только дописываются; меняется лишь последняя.
За прогон — не дольше BUDGET секунд; что не успел — в следующий прогон.
12.11.2026, Т. В.: «я сейчас тебе дал добро, ты проверил, больше ты ничего не трогаешь по ней» — проверка ОДНОРАЗОВАЯ:
после первого полного прохода (state 'final') ящик itm@ этим модулем больше не открывается никогда; новые письма не читаются.
"""
import base64, datetime, email, email.header, email.policy, email.utils, hashlib, imaplib, os, re, ssl, time
import itm as IT

SINCE = '01-Jan-2026'
FOLDER = re.compile(r'^\s*планы\s*$', re.I)
DOC_EXT = ('.xls', '.xlsx', '.xlsm', '.xlsb', '.csv', '.pdf', '.doc', '.docx', '.ods', '.odt', '.zip', '.rar', '.7z', '.txt', '.rtf')
MAX_MSG = 40 * 1024 * 1024
MAX_ATT = 15 * 1024 * 1024
PART = 5 * 1024 * 1024
BUDGET = 90


def _ext(fn):
    m = re.search(r'(\.[A-Za-z0-9]{1,5})$', fn or '')
    return m.group(1).lower() if m else ''


def _text(msg):
    try:
        b = msg.get_body(preferencelist=('plain', 'html'))
        t = b.get_content() if b else ''
        if b is not None and b.get_content_type() == 'text/html':
            t = re.sub(r'<[^>]+>', ' ', re.sub(r'(?is)<(script|style).*?</\1>', ' ', t))
        return re.sub(r'[ \t\r\f\v]+', ' ', re.sub(r'\n\s*\n+', '\n', t)).strip()[:3000]
    except Exception:
        return ''


def _lst(msg, h):
    try: return [a.lower() for n, a in email.utils.getaddresses([IT.clean(msg.get(h, ''))]) if a][:15]
    except Exception: return []


def _pub_parts(L, st, publish, log):
    """части вложений: стабильное распределение sha → номер части; переписываются только части с новыми файлами"""
    root = os.path.join(L, 'plans', 'files')
    pmap = st.setdefault('part_of', {})
    sizes = st.setdefault('part_sz', {})
    dirty = set(st.get('dirty') or [])
    for m in st['msgs']:
        for a in m.get('a') or []:
            k = a.get('k')
            if not k or k in pmap or not os.path.exists(os.path.join(root, k)): continue
            cur = max([int(x) for x in sizes] or [0])
            sz = os.path.getsize(os.path.join(root, k))
            if sizes.get(str(cur), 0) and sizes.get(str(cur), 0) + sz > PART: cur += 1
            pmap[k] = cur; sizes[str(cur)] = sizes.get(str(cur), 0) + sz; dirty.add(cur)
    done = 0
    for p in sorted(dirty):
        files = {}
        for k, n in pmap.items():
            if n != p: continue
            try:
                with open(os.path.join(root, k), 'rb') as _cg1_file_1:
                    files[k] = base64.b64encode(_cg1_file_1.read()).decode()
            except Exception as e: log('  ! Планы: файл', k, e.__class__.__name__)
        if publish('exp_pln_%d.bin' % p, {'part': p, 't': IT._now().strftime('%Y-%m-%dT%H:%M'), 'files': files}): done += 1
        else: return done, sorted(dirty)
    return done, []


def run(L, CFG, log, jload, jsave, publish, budget=BUDGET):
    me = (CFG.get('itm_mail') or 'user5@example.org').lower()
    st = jload('itm_plans.json', {'uv': '', 'last': 0, 'msgs': [], 'day': ''})
    res = {'t': IT._now().strftime('%Y-%m-%dT%H:%M'), 'new': 0, 'files': 0}
    if IT.off(): res['state'] = IT.off_text(); return res
    today = IT._now().strftime('%Y-%m-%d')
    if st.get('final') and not st.get('dirty'):                    # 12.11.2026: разовая проверка выполнена — ящик больше не открывать
        # 12.11.2026, Т. В.: «файлы максимум 2–3 дня, дальше удаляются с хостинга роботом» — вложения «Планов» и их части в st/
        try: age = (IT._now().date() - datetime.datetime.strptime(st['final'][:10], '%Y-%m-%d').date()).days
        except Exception: age = 0
        if age >= 3 and not st.get('cleaned'):
            import shutil
            shutil.rmtree(os.path.join(L, 'plans', 'files'), ignore_errors=True)
            sd = os.path.join(CFG.get('site') or os.path.join(os.path.dirname(L), 'www', 'techfabrikant.ru'), 'st')   # как SITE в live.py
            for f in os.listdir(sd) if os.path.isdir(sd) else []:
                if re.match(r'^exp_pln_[\w]+\.bin$', f):
                    try: os.remove(os.path.join(sd, f))
                    except Exception: pass  # необязательный шаг: сбой не мешает работе робота
            st['cleaned'] = IT._now().strftime('%Y-%m-%dT%H:%M'); jsave('itm_plans.json', st)
            log('Планы itm@: файлы удалены через 3 дня')
        res.update({'state': 'выполнено однократно %s — ящик не открывается%s' % (st['final'], '; файлы удалены %s' % st['cleaned'] if st.get('cleaned') else ''), 'msgs': len(st['msgs'])}); return res
    pw = IT.password(L)
    if not pw: res['state'] = 'нет пароля itm@'; return res
    root = os.path.join(L, 'plans', 'files'); os.makedirs(root, exist_ok=True)
    try: os.chmod(os.path.join(L, 'plans'), 0o700)
    except Exception: pass  # необязательный шаг: сбой не мешает работе робота
    t0 = time.time(); pending = False
    if not st.get('final'):
        lk = IT.imap_lock(L, 20)
        if lk is None: res['state'] = IT.BUSY; return res
        try: M = imaplib.IMAP4_SSL(IT.HOST, 993, ssl_context=ssl.create_default_context())
        except BaseException:
            lk.close(); raise
        try:
            M.login(me, pw)
            fl = [(raw, name) for raw, name, flags in IT.folders(M) if FOLDER.match(name.strip().split('/')[-1])]
            res['folders'] = [n for _, n in fl]
            if not fl: res['state'] = 'папки «Планы» в itm@ нет'
            seen = set(m['mid'] for m in st['msgs'])
            for raw, name in fl[:3]:
                typ, _ = M.select('"%s"' % raw, readonly=True)           # EXAMINE — только чтение
                if typ != 'OK': continue
                uv = (M.untagged_responses.get('UIDVALIDITY') or [b''])[0]
                uv = uv.decode() if isinstance(uv, bytes) else str(uv)
                fk = '%s|%s' % (name, uv)
                lasts = st.setdefault('lasts', {})
                last = int(lasts.get(fk) or 0)
                typ, data = M.uid('SEARCH', None, 'UID', '%d:*' % (last + 1), 'SINCE', SINCE)
                todo = sorted(int(u) for u in (data[0] or b'').split() if int(u) > last) if typ == 'OK' else []
                res['total_in_folder'] = res.get('total_in_folder', 0) + len(todo)
                for u in todo:
                    if time.time() - t0 > budget: pending = True; break
                    typ, d = M.uid('FETCH', str(u), '(RFC822.SIZE)')
                    head = b' '.join(x[0] if isinstance(x, tuple) else x for x in d or [] if x)
                    size = int((re.search(rb'RFC822\.SIZE (\d+)', head) or [0, b'0'])[1])
                    part = '(BODY.PEEK[])' if size < MAX_MSG else '(BODY.PEEK[HEADER])'
                    typ, d = M.uid('FETCH', str(u), part)
                    full = next((x[1] for x in d or [] if isinstance(x, tuple)), b'') or b''
                    msg = email.message_from_bytes(full, policy=email.policy.default)
                    fname, frm = IT.addr(msg['From'])
                    subj = IT.clean(msg['Subject']).strip()
                    try: t = email.utils.parsedate_to_datetime(IT.clean(msg['Date'])).astimezone(IT.MSK).strftime('%Y-%m-%dT%H:%M')
                    except Exception: t = ''
                    mid = hashlib.sha256(str(msg['Message-ID'] or (frm + subj + t)).encode('utf-8')).hexdigest()[:16]
                    lasts[fk] = u
                    if mid in seen: continue
                    row = {'f': name, 'u': u, 't': t, 'fr': frm, 'n': fname[:80], 'to': _lst(msg, 'To'), 'cc': _lst(msg, 'Cc'),
                           's': subj[:300], 'sz': size, 'mid': mid, 'a': [], 'x': _text(msg) if size < MAX_MSG else ''}
                    if size >= MAX_MSG: row['big'] = True
                    for p in msg.walk() if size < MAX_MSG else []:
                        fn = p.get_filename()
                        if not fn: continue
                        fn = IT.clean(fn)
                        try: fn = str(email.header.make_header(email.header.decode_header(fn)))
                        except Exception:
                            # намеренно: при ошибке декодирования MIME-заголовка сохраняем исходное имя.
                            pass
                        fn = IT.fix_ext(IT.clean(fn))
                        raw_ = p.get_payload(decode=True) or b''
                        sha = hashlib.sha256(raw_).hexdigest()[:24]
                        ext = _ext(fn)
                        a = {'n': fn[:200], 'sz': len(raw_), 'sha': sha}
                        if raw_ and ext in DOC_EXT and len(raw_) <= MAX_ATT:
                            k = sha + ext
                            dst = os.path.join(root, k)
                            if not os.path.exists(dst):
                                with open(dst + '.tmp', 'wb') as f: f.write(raw_)
                                os.chmod(dst + '.tmp', 0o600); os.replace(dst + '.tmp', dst)
                                res['files'] += 1
                            a['k'] = k
                        row['a'].append(a)
                    st['msgs'].append(row); seen.add(mid); res['new'] += 1
            res.setdefault('state', 'идёт' if pending else 'готово')
        except imaplib.IMAP4.error as e:
            res['state'] = 'Mail.ru: ' + str(e)[:160]; pending = True
        finally:
            try: M.logout()
            except Exception:
                # намеренно: ошибка завершения IMAP-сеанса не должна отменять уже обработанные письма.
                pass
            lk.close()
        st['pending'] = pending
        st['tries'] = int(st.get('tries') or 0) + 1
        if not pending or st['tries'] >= 12: st['day'] = today; st['final'] = res['t']   # 12.11.2026: один полный проход — и всё (не больше 12 заходов)
    st['msgs'].sort(key=lambda m: m.get('t') or '')
    n, dirty = _pub_parts(L, st, publish, log)
    st['dirty'] = dirty
    idx = {'t': res['t'], 'state': 'идёт' if st.get('pending') else 'готово', 'folder': res.get('folders'),
           'msgs': st['msgs'], 'part_of': st.get('part_of', {}), 'parts': len(st.get('part_sz') or {})}
    if res['new'] or n or not dirty: publish('exp_pln_idx.bin', idx)
    jsave('itm_plans.json', st)
    res.update({'msgs': len(st['msgs']), 'parts_pub': n})
    if res['new']: log('Планы itm@: писем', res['new'], '; файлов', res['files'], ';', res.get('state'))
    return res
