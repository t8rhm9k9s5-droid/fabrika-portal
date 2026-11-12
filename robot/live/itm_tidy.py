"""«Фабрика» — разбор «Входящих» ящика user@example.org после обработки (11.11.2026).
Т. В. (опрос 11.11): «Прочитано + по папкам» — обработанные письма помечаются прочитанными и раскладываются по папкам;
письма, которые ждут его решения, остаются НЕПРОЧИТАННЫМИ во «Входящих»; ответ — только по его кнопке в боте, с того ящика,
на который пришло письмо (сейчас itm@).

Запуск — из itm.run() в том же сеансе IMAP (отдельного входа в ящик нет), без Claude:
  • itm.run() по каждому новому письму «Входящих» вызывает note(): что это — отчёт, робот/рассылка, письмо человека,
    письмо человека с вопросом лично ему (есть запрос ответа) → очередь st['tidy'];
  • work() в конце сеанса: SELECT INBOX (запись), не больше MAX_RUN писем за прогон:
      отчёт / робот / человек без вопроса → \\Seen + UID MOVE в папку по itm_sort.classify (нет правила — «Портал/Обработано»);
      ждёт решения → не трогать; когда ответ ушёл через бота (id в sent_log) → \\Seen + в папку;
      через WAIT_DAYS дней без ответа — перестаём следить, письмо остаётся непрочитанным во «Входящих».
  • Только письма, пришедшие после включения (UID больше отметки start) — старая почта не трогается.
  • Ничего не удаляется: ни \\Deleted, ни EXPUNGE. Сервер без MOVE — только \\Seen, письмо остаётся во «Входящих».
Режим — code/mail_cfg.json → "tidy": "on" | "plan" (только state/itm_tidy_plan.json, ящик не меняется) | нет/иное — выключено.
Python 3.6 (хостинг reg.ru)."""
import datetime, imaplib, json, os, re

MAX_RUN = 40                     # писем за прогон
WAIT_DAYS = 14                   # сколько следить за письмом, ждущим решения
DONE_DIR = 'Обработано'
MSK = datetime.timezone(datetime.timedelta(hours=3))


def _now(): return datetime.datetime.now(MSK)


def mode(path=None):
    """→ 'on' | 'plan' | 'off' (code/mail_cfg.json → tidy)"""
    p = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mail_cfg.json')
    try:
        j = json.load(open(p, encoding='utf-8'))
        v = str(j.get('tidy') or '').strip().lower()
        return v if v in ('on', 'plan') else 'off'
    except Exception: return 'off'


def note(st, raw, uid, kind, frm='', subj='', rid=None):
    """запомнить письмо «Входящих» для разбора. kind: report | robot | person | wait"""
    if not _is_inbox(raw): return
    q = st.setdefault('tidy', {'q': {}, 'start': None})
    if q.get('start') is None or int(uid) <= int(q['start']): return
    q['q'][str(uid)] = {'k': kind, 'f': (frm or '')[:120], 's': (subj or '')[:200], 'id': rid, 't': _now().strftime('%Y-%m-%dT%H:%M')}


def _is_inbox(raw): return (raw or '').strip().strip('"').upper() == 'INBOX'


def target(frm, subj):
    """→ путь папки списком, например ['Портал', 'ОМТС и снабжение'] или ['МП']"""
    try:
        import itm_sort as S
        c = S.classify(frm, subj)
        if c:
            t = S.TARGET.get(c)
            return list(t) if t else [S.PARENT, c]
        return [S.PARENT, DONE_DIR]
    except Exception:
        return ['Портал', DONE_DIR]


def _delim(fl):
    for raw, name, flags in fl or []:
        if '/' in raw: return '/'
    return '/'


def _box(path, fl):
    import itm_sort as S
    return _delim(fl).join(S.utf7_encode(x) for x in path)


def _ensure(M, box, have):
    if box in have: return True
    parts = box.split('/')
    for i in range(1, len(parts) + 1):
        b = '/'.join(parts[:i])
        if b in have: continue
        typ, _ = M.create('"%s"' % b)
        if typ == 'OK':
            have.add(b)
            try: M.subscribe('"%s"' % b)
            except Exception: pass
    return box in have


def work(M, fl, st, log, md=None, L=None):
    """→ {'moved': n, 'seen': n, 'wait': n, 'plan': [...]}; md — режим (по умолчанию из mail_cfg.json)"""
    md = md or mode()
    res = {'mode': md, 'moved': 0, 'seen': 0, 'wait': 0}
    if md == 'off': return res
    q = st.setdefault('tidy', {'q': {}, 'start': None})
    typ, _ = M.select('INBOX', readonly=(md != 'on'))
    if typ != 'OK': res['err'] = 'INBOX не открывается'; return res
    uv = (M.untagged_responses.get('UIDVALIDITY') or [b''])[0]
    uv = uv.decode() if isinstance(uv, bytes) else str(uv)
    if q.get('start') is None or q.get('uv') != uv:          # первое включение (или ящик пересоздан): отметка — последний UID, старое не трогаем
        typ, data = M.uid('SEARCH', None, 'ALL')
        allu = [int(u) for u in (data[0] or b'').split()] if typ == 'OK' else []
        q.update({'start': max(allu) if allu else 0, 'uv': uv, 'q': {}, 'since': _now().strftime('%Y-%m-%dT%H:%M')})
        res['start'] = q['start']; return res
    sent = set(x.get('id') for x in (st.get('sent_log') or []) if x.get('id'))
    cut = (_now() - datetime.timedelta(days=WAIT_DAYS)).strftime('%Y-%m-%dT%H:%M')
    have = set(raw for raw, _, _ in fl or [])
    has_move = 'MOVE' in (getattr(M, 'capabilities', ()) or ())
    plan, n = [], 0
    for u in sorted(q['q'], key=int):
        if n >= MAX_RUN: break
        it = q['q'][u]
        if it['k'] == 'wait':
            if it.get('id') in sent: it['k'] = 'answered'
            elif it['t'] < cut: q['q'].pop(u, None); continue
            else: res['wait'] += 1; continue
        path = target(it.get('f'), it.get('s'))
        plan.append({'uid': int(u), 'k': it['k'], 'to': '/'.join(path), 's': it.get('s', '')[:80]})
        n += 1
        if md != 'on': continue
        try:
            typ, d = M.uid('FETCH', u, '(FLAGS)')
            if typ != 'OK' or not d or d[0] is None: q['q'].pop(u, None); continue        # письма уже нет во «Входящих»
            M.uid('STORE', u, '+FLAGS.SILENT', '(\\Seen)'); res['seen'] += 1
            box = _box(path, fl)
            if has_move and _ensure(M, box, have):
                import itm_sort as S
                typ, _ = S.uid_move(M, u, '"%s"' % box, True)
                if typ == 'OK': res['moved'] += 1
            q['q'].pop(u, None)
        except imaplib.IMAP4.error as e:
            log('  ! itm_tidy', u, str(e)[:120]); it['err'] = int(it.get('err') or 0) + 1
            if it['err'] >= 3: q['q'].pop(u, None)
    if md == 'plan':
        res['plan'] = plan[:MAX_RUN]
        if L:
            try:
                os.makedirs(os.path.join(L, 'state'), exist_ok=True)
                old = []
                p = os.path.join(L, 'state', 'itm_tidy_plan.json')
                try: old = json.load(open(p, encoding='utf-8')).get('items') or []
                except Exception: pass
                seen = set(x['uid'] for x in old)
                old = (old + [x for x in plan if x['uid'] not in seen])[-300:]
                json.dump({'t': _now().strftime('%Y-%m-%dT%H:%M'), 'items': old}, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
            except Exception as e: log('  ! itm_tidy план:', e)
    if res['moved'] or res['seen']: log('itm_tidy: прочитано', res['seen'], '; в папки', res['moved'], '; ждут решения', res['wait'])
    return res
