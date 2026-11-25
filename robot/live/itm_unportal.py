"""«Фабрика» — ящик user5@example.org: убрать папки «Портал/…», письма — по папкам самого владельца (25.11.2026).
Т. В. 25.11: «в ящике itm@ убери папки портала, письма разложи по моим папкам»; непонятное — «по другим темам: производство, продажи и так далее».

Работает ТОЛЬКО по команде code/itm_unportal_cmd.json {"id": "…", "mode": "plan" | "go"} — один раз на каждый id (остальное время модуль молчит).
Это прямое слово владельца, поэтому общий запрет «ящик владельца хостингом не читается» (itm.off) эту команду не останавливает.
  plan — только чтение (EXAMINE, заголовки BODY.PEEK): список папок ящика с числом писем и что из «Портал/…» в какую папку пойдёт.
  go   — UID MOVE писем из «Портал/…» в папки владельца (нет нужной — создаётся), потом пустые папки «Портал/…» и сама «Портал» удаляются.
Письма не удаляются: ни \\Deleted, ни EXPUNGE; сервер без MOVE — ничего не делаем (копии плодить нельзя), пишем это в итог.
Итог — state/itm_unportal.json и st/exp_unp.bin (ключ владельца: имена папок его ящика). Python 3.6 (хостинг reg.ru)."""
import email, email.policy, imaplib, json, os, re, ssl, time
import itm as IT
from itm_rules import PARENT, utf7_encode, uid_move, classify

BUDGET = 150                      # секунд на один прогон; не успели — продолжение в следующем прогоне (по тому же id)
CHUNK = 200                       # писем за одну команду IMAP
# папка «Портал/<имя>» → папка владельца (первая существующая из списка; нет ни одной — создаётся первая)
BY_FOLDER = {'продажи оп': ['продажи'], 'структура': ['разное'], 'документы': ['документы'], 'сайт и бот': ['проекты'],
             'омтс и снабжение': ['ОМТС', 'омтс']}
# «Портал/Обработано» и прочие — по содержанию письма (itm_rules.classify) → папка владельца
BY_CLASS = {'Маркетплейсы': ['МП'], 'Экономика и цены': ['экономика'], 'Продажи — офисы': ['продажи'], 'Сотрудники и структура': ['разное'],
            'Документы': ['документы'], 'Сайт и бот': ['проекты'], 'Карта, план и сети': ['проекты'], 'Склад — 1С': ['производство'],
            'Производство и выпуск': ['производство'], 'ОМТС и снабжение': ['ОМТС', 'омтс']}
OTHER = ['разное']


def _cmd():
    try:
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'itm_unportal_cmd.json'), encoding='utf-8') as f: return json.load(f)
    except Exception: return {}


def _hdr(v):
    try: return IT.clean(str(v or ''))
    except Exception: return ''


def _delim(M):
    typ, data = M.list()
    for line in data or []:
        line = line.decode('utf-8', 'replace') if isinstance(line, bytes) else str(line)
        m = re.match(r'\([^)]*\)\s+"([^"]*)"', line)
        if m and m.group(1): return m.group(1)
    return '/'


def _count(M, raw):
    typ, data = M.select('"%s"' % raw, readonly=True)
    if typ != 'OK': return None
    try: return int(data[0])
    except Exception: return None


def _uids(M):
    typ, data = M.uid('SEARCH', None, 'ALL')
    return [u.decode() for u in (data[0] or b'').split()] if typ == 'OK' and data else []


def _heads(M, uids):
    """→ {uid: (from, subject)}"""
    out = {}
    for i in range(0, len(uids), CHUNK):
        typ, data = M.uid('FETCH', ','.join(uids[i:i + CHUNK]), '(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT)])')
        if typ != 'OK': continue
        for it in data or []:
            if not isinstance(it, tuple): continue
            m = re.search(rb'UID (\d+)', it[0] or b'')
            if not m: continue
            msg = email.message_from_bytes(it[1] or b'', policy=email.policy.default)   # как itm_sort: Mail.ru отдаёт заголовки и в UTF-8 без кодирования
            fr = _hdr(msg['from']); a = re.search(r'[\w.+-]+@[\w.-]+', fr)
            out[m.group(1).decode()] = ((a.group(0) if a else fr).lower(), _hdr(msg['subject']))
    return out


def _pick(cands, by_low):
    """первая существующая папка владельца из списка → (raw, имя, есть ли); нет — (None, первое имя, False)"""
    for c in cands:
        if c.lower() in by_low: return by_low[c.lower()][0], by_low[c.lower()][1], True
    return None, cands[0], False


def run(L, CFG, log, jload, jsave):
    cmd = _cmd(); cid = str(cmd.get('id') or ''); mode = str(cmd.get('mode') or '')
    st = jload('itm_unportal.json', {})
    if not cid or mode not in ('plan', 'go') or cid in (st.get('done_ids') or []): return None
    me = (CFG.get('itm_mail') or 'user5@example.org').lower()
    pw = IT.password(L)
    res = {'v': 1, 'id': cid, 'mode': mode, 't': IT._now().strftime('%Y-%m-%dT%H:%M'), 'err': []}
    if not pw:
        res['state'] = 'нет пароля itm@ на хостинге (itm_app_password)'; st.setdefault('done_ids', []).append(cid); st['last'] = res; jsave('itm_unportal.json', st); return res
    lk = IT.imap_lock(L, 20)
    if lk is None: return None                              # ящик занят — в следующий прогон
    t0 = time.time(); M = None
    try:
        M = imaplib.IMAP4_SSL(IT.HOST, 993, ssl_context=ssl.create_default_context())
        M.login(me, pw)
        typ, cap = M.capability(); has_move = b'MOVE' in (b' '.join(cap or []) if typ == 'OK' else b'').upper()
        d = _delim(M); fl = [(raw, name, flags) for raw, name, flags in IT.folders(M)]
        pref = PARENT + d
        own = [(raw, name) for raw, name, flags in fl if '\\noselect' not in flags and name != PARENT and not name.startswith(pref)
               and not re.search(r'\\(sent|trash|junk|drafts|all|archive)', flags) and name.upper() != 'INBOX']
        by_low = {}
        for raw, name in own: by_low.setdefault(name.split(d)[-1].lower(), (raw, name))
        portal = sorted([(raw, name) for raw, name, flags in fl if (name.startswith(pref) or name == PARENT) and '\\noselect' not in flags], key=lambda x: -x[1].count(d))
        res['folders'] = []
        for raw, name, flags in fl:
            if '\\noselect' in flags: continue
            res['folders'].append([name, _count(M, raw)])
        res['move_cap'] = has_move; plan = []; moved = 0; late = False
        if mode == 'go' and not has_move: res['err'].append('сервер без MOVE — перенос не делался')
        for raw, name in portal:
            if time.time() - t0 > BUDGET: late = True; break
            sub = name[len(pref):] if name != PARENT else ''; n = _count(M, raw) or 0
            if not n: plan.append([name, 0, '—']); continue
            typ, _ = M.select('"%s"' % raw, readonly=(mode != 'go' or not has_move))
            if typ != 'OK': res['err'].append('SELECT ' + name); continue
            uids = _uids(M); groups = {}
            if sub.lower() in BY_FOLDER: groups[tuple(BY_FOLDER[sub.lower()])] = uids
            else:
                H = _heads(M, uids)
                for u in uids:
                    fr, sj = H.get(u, ('', ''))
                    groups.setdefault(tuple(BY_CLASS.get(classify(fr, sj)) or OTHER), []).append(u)
            for cands, us in sorted(groups.items()):
                traw, tname, have = _pick(list(cands), by_low)
                plan.append([name, len(us), tname + ('' if have else ' (создать)')])
                if mode != 'go' or not has_move: continue
                if not have:
                    traw = utf7_encode(tname); typ, _ = M.create('"%s"' % traw)
                    if typ != 'OK': res['err'].append('CREATE ' + tname); continue
                    by_low[tname.lower()] = (traw, tname)
                for i in range(0, len(us), CHUNK):
                    typ, _ = uid_move(M, ','.join(us[i:i + CHUNK]), '"%s"' % traw, True)
                    if typ == 'OK': moved += len(us[i:i + CHUNK])
                    else: res['err'].append('MOVE %s → %s' % (name, tname))
                    if time.time() - t0 > BUDGET: late = True; break
                if late: break
            if late: break
        res['plan'] = plan; res['moved'] = moved; removed = []
        if mode == 'go' and has_move and not late:
            try: M.close()
            except Exception: pass                           # папка могла быть не выбрана
            if not any(n == PARENT for _, n in portal): portal = portal + [(utf7_encode(PARENT), PARENT)]   # «Портал» без писем (\\Noselect) — убрать последней
            for raw, name in portal:
                if name == PARENT and any(n.startswith(pref) and n not in removed for _, n in portal): continue   # остались вложенные — «Портал» не трогаем
                cnt = _count(M, raw)
                if cnt != 0 and not (cnt is None and name == PARENT): continue   # в папке остались письма — не удаляем («Портал» без писем может не открываться — пробуем удалить)
                try: M.close()
                except Exception: pass
                typ, _ = M.delete('"%s"' % raw)
                if typ == 'OK': removed.append(name)
                else: res['err'].append('DELETE ' + name)
        res['removed'] = removed; res['late'] = late
        res['state'] = ('план готов' if mode == 'plan' else 'не всё: время вышло — продолжение в следующем прогоне' if late else 'перенесено %d, папок убрано %d' % (moved, len(removed)))
    except Exception as e:
        res['state'] = 'ошибка: %s' % (str(e)[:200] or e.__class__.__name__); res['err'].append(res['state'])
    finally:
        try:
            if M is not None: M.logout()
        except Exception: pass                               # выход из ящика — не критично
        lk.close()
    if not res.get('late') or mode == 'plan': st.setdefault('done_ids', []).append(cid)
    st['done_ids'] = st.get('done_ids', [])[-20:]; st['last'] = res; jsave('itm_unportal.json', st)
    log('  itm@ папки «Портал»: %s' % res.get('state'))
    return res
