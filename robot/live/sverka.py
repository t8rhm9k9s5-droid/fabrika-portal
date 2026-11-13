# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — файл сверки для Claude (04.11.2026). Т. В. Сотрудник1 04.11 (опрос): «Файл сверки на Диске» — чтобы Claude сам каждый день
проверял, что данные из рассылок видны на портале, без входа Т. В. и без ключей сайта.

Как устроено (Python 3.6):
  • live.publish(name, obj) после записи st/<name> вызывает note(): из ТОГО ЖЕ объекта, что получает портал (плитки главной и страницы
    разделов), берутся только итоги и даты → state/sverka/<name>.json (у каждого участка свой файл — участки работают параллельно);
  • после участков reports / history / docs / ozon — flush(): письма-отчёты за 3 дня (state/recv.json: вид, за какой день, время письма,
    тема, отправитель, id; ОМТС — из state/arch_index.jsonl) + итоги портала → одна сводка за день, зашифрована ОТДЕЛЬНЫМ ключом сверки
    code/k_check.txt (T14B1, как seal_bytes) → Google Диск 1c@ «Фабрика — портал/Сверка/sverka-ГГГГММДД.bin» (gdrive_1c.put_file,
    тот же файл за день перезаписывается). Отправляется только если содержимое изменилось.
  • Ключ k_check знают только хостинг и Claude; ключи сайта и владельца не нужны. Людей и тексты писем в сводку не кладём — только итоги и даты.
Читает Claude: fabrika/tasks/sverka.py."""
import base64, datetime, fcntl, hashlib, hmac, json, os, re, secrets, time

MSK = datetime.timezone(datetime.timedelta(hours=3))
SUB = 'Сверка'
WATCH = ('ls.bin', 'sales.bin', 'smvs.bin', 'omts.bin', 'recl.bin', 'tz1c.bin', 'ozrev.bin', 'oz.bin')
DAYS_BACK = 3


def _now(): return datetime.datetime.now(MSK)
def _iso(t=None): return (t or _now()).strftime('%Y-%m-%dT%H:%M')


def _n(x):
    return x if isinstance(x, (int, float)) and not isinstance(x, bool) else None


def _scal(d, keys=None):
    """только числа и короткие строки-даты/метки (без списков и вложенных объектов — значит, без людей и текстов)"""
    if not isinstance(d, dict): return None
    out = {}
    for k, v in d.items():
        if keys and k not in keys: continue
        if isinstance(v, bool): out[k] = v
        elif _n(v) is not None: out[k] = v
        elif isinstance(v, str) and len(v) <= 40 and (re.match(r'^\d{4}-\d\d-\d\d', v) or k in ('wh', 'm', 'unit', 'kind', 'k')): out[k] = v
    return out


# ---------- итоги по файлам портала (тот же объект, что публикуется) ----------
def s_ls(o):
    out, st = o.get('out') or {}, o.get('status') or {}
    areas = {}
    for aid, a in sorted((out.get('areas') or {}).items()):
        dp = df = mp = mf = 0; has_p = False; lines = []
        for ln in a.get('lines') or []:
            d, m = ln.get('day') or {}, ln.get('month') or {}
            f, p = _n(d.get('fact')), _n(d.get('plan'))
            if p is not None and f is not None: dp += p; df += f; has_p = True
            if _n(m.get('plan_to_date')) is not None and _n(m.get('fact')) is not None: mp += m['plan_to_date']; mf += m['fact']
            lines.append([str(ln.get('n') or '')[:40], f, p])
        areas[aid] = {'pct_day': round(df / dp * 100) if has_p and dp else None, 'pct_month': round(mf / mp * 100) if mp else None,
                      'lines': lines[:12]}
    br = o.get('brief') or {}
    stk = o.get('stock') or {}
    exp = [{'k': r.get('k'), 'want': r.get('want'), 'ok': r.get('ok'), 'none': r.get('none')} for r in st.get('expect') or []]
    return {'t': o.get('t'), 'out_date': out.get('date'), 'areas': areas,
            'brief': _scal(br, ('qty', 'rub', 'd_day', 'd_month', 'free', 'date', 'wh')),
            'stock': {'date': stk.get('date'), 'pks': bool(stk.get('pks')), 'qty': _n((stk.get('total') or {}).get('qty')),
                      'allwh_date': (stk.get('allwh') or {}).get('date')},
            'last': {k: _scal(v, ('date', 'got', 'none')) for k, v in (st.get('last') or {}).items()},
            'expect': exp, 'mail': st.get('mail'), 'mail_t': st.get('mail_t'), 'alert': bool(st.get('alert'))}


def s_sales(o):
    sd = o.get('sday') or {}
    D = sd.get('days') or {}
    days, mon = {}, {}
    for d in sorted(D):
        x = D[d] or {}
        row = {}
        for kind in ('types', 'cap'):
            t = (x.get(kind) or {})
            tot = t.get('tot') or []
            row[kind] = {'qty': _n(tot[0]) if len(tot) > 0 else None, 'rub': _n(tot[1]) if len(tot) > 1 else None, 'got': t.get('got')}
        days[d] = row
        t2 = x.get('types') or x.get('cap') or {}
        tot = t2.get('tot') or [0, 0]
        m = mon.setdefault(d[:7], {'qty': 0, 'rub': 0.0, 'last': '', 'got': ''})
        m['qty'] += _n(tot[0]) or 0; m['rub'] += _n(tot[1]) or 0; m['last'] = d
        if str(t2.get('got') or '') > m['got']: m['got'] = str(t2.get('got') or '')
    for m in mon.values(): m['rub'] = round(m['rub'], 2)
    months = {k: _scal(v) for k, v in (sd.get('months') or {}).items()}
    return {'t': o.get('t'), 'days': {k: days[k] for k in sorted(days)[-5:]}, 'month_sum': {k: mon[k] for k in sorted(mon)[-3:]},
            'month_rep': months}


def s_smvs(o):
    last = o.get('last') or {}
    tot = last.get('tot') or []
    return {'t': o.get('t'), 'm': last.get('m'), 'from': last.get('from'), 'to': last.get('to'),
            'tot': {'start': _n(tot[0]) if len(tot) > 0 else None, 'in': _n(tot[1]) if len(tot) > 1 else None,
                    'out': _n(tot[2]) if len(tot) > 2 else None, 'end': _n(tot[3]) if len(tot) > 3 else None},
            'brak_end': _n((last.get('brak') or [None] * 4)[3]) if len(last.get('brak') or []) > 3 else None, 'nw': last.get('nw'),
            'groups': [[str(g[0])[:40], _n(g[4]) if len(g) > 4 else None] for g in (last.get('g') or [])][:20]}


def s_omts(o):
    ks = []
    for k in o.get('kinds') or []:
        p = k.get('p') or {}
        ks.append({'k': k.get('k'), 'n': str(k.get('n') or '')[:60], 't': k.get('t'), 'total': _n(k.get('total')),
                   'p': _scal(p), 'err': bool(k.get('err'))})
    return {'t': o.get('t'), 'kinds': ks}


def s_recl(o):
    return {'asof': (o.get('open') or {}).get('asof') or o.get('asof'), 'open': _scal(o.get('open')), 'all': _scal(o.get('all'))}


def s_tz(o): return _scal(o)


def s_ozrev(o): return _scal(o)


def s_oz(o):
    rv = o.get('rev') or {}
    return {'rev': _scal(rv), 'stale': bool(rv.get('stale'))}


EXTRACT = {'ls.bin': s_ls, 'sales.bin': s_sales, 'smvs.bin': s_smvs, 'omts.bin': s_omts, 'recl.bin': s_recl, 'tz1c.bin': s_tz,
           'ozrev.bin': s_ozrev, 'oz.bin': s_oz}


def summarize(name, obj):
    fn = EXTRACT.get(name)
    if not fn or not isinstance(obj, dict): return None
    return fn(obj)


def _atomic(p, obj):
    tmp = '%s.%d.tmp' % (p, os.getpid())
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False)
    os.replace(tmp, p)


def note(state_dir, name, obj):
    """из live.publish — итоги файла портала → state/sverka/<name>.json"""
    if name not in WATCH: return False
    s = summarize(name, obj)
    if s is None: return False
    d = os.path.join(state_dir, 'sverka'); os.makedirs(d, exist_ok=True)
    _atomic(os.path.join(d, name + '.json'), {'t': _iso(), 'sum': s})
    return True


# ---------- письма-отчёты ----------
def letters(state_dir, recv, days=DAYS_BACK):
    cut = (_now().date() - datetime.timedelta(days=days)).isoformat()
    out = []
    for r in recv or []:
        if str(r.get('got') or '')[:10] < cut: continue
        out.append({'k': r.get('k'), 'day': r.get('date'), 'got': r.get('got'), 'subj': str(r.get('subj') or '')[:120],
                    'fr': r.get('fr'), 'mid': r.get('mid'), 'none': bool(r.get('none'))})
    try:                                                   # ОМТС читает omts.py из архива ящиков — письма оттуда же
        import omts as OM
        kinds = [(k, rx) for k, _, rx in OM.KINDS]
        p = os.path.join(state_dir, 'arch_index.jsonl')
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f: tail = f.readlines()[-3000:]
            for ln in tail:
                if 'user3@example.org' not in ln: continue
                try: r = json.loads(ln)
                except Exception: continue
                t = str(r.get('t') or '')
                if t[:10] < cut or r.get('fr') != 'user3@example.org': continue
                s = str(r.get('s') or '')
                for k, rx in kinds:
                    if rx.search(s):
                        if k == 'pok' and not any('покупн' in str(a.get('n') or '').lower() for a in r.get('a') or []): break   # как omts_last()
                        out.append({'k': 'omts:' + k, 'day': t[:10], 'got': t[:16], 'subj': s[:120], 'fr': r.get('fr'), 'mid': r.get('id') or r.get('mid')})
                        break
    except Exception: pass
    out.sort(key=lambda x: (str(x.get('got') or ''), str(x.get('k') or '')))
    return out


# ---------- шифрование (как seal_bytes, другим ключом) ----------
def seal_k(key, raw):
    nonce = secrets.token_bytes(16)
    ks = b''.join(hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(raw) + 31) // 32))[:len(raw)]
    ct = (int.from_bytes(raw, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(len(raw), 'big') if raw else b''
    tag = hmac.new(key, nonce + ct, hashlib.sha256).digest()
    return ('T14B1.' + base64.b64encode(nonce + tag + ct).decode()).encode()


def open_k(key, blob):
    s = blob.decode() if isinstance(blob, bytes) else blob
    s = s.strip()
    if not s.startswith('T14B1.'): return None
    raw = base64.b64decode(s[6:]); nonce, tag, ct = raw[:16], raw[16:48], raw[48:]
    if not hmac.compare_digest(tag, hmac.new(key, nonce + ct, hashlib.sha256).digest()): return None
    ks = b''.join(hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))[:len(ct)]
    return (int.from_bytes(ct, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(len(ct), 'big') if ct else b''


def kcheck(code_dir):
    try:
        with open(os.path.join(code_dir, 'k_check.txt')) as f: k = f.read().strip().lower()
    except Exception: return None
    return bytes.fromhex(k) if re.fullmatch(r'[0-9a-f]{64}', k) else None


def build(state_dir, recv):
    d = os.path.join(state_dir, 'sverka')
    portal = {}
    for name in WATCH:
        try:
            with open(os.path.join(d, name + '.json'), encoding='utf-8') as f: portal[name] = json.load(f)
        except Exception: portal[name] = None
    return {'v': 1, 'day': _now().date().isoformat(), 'letters': letters(state_dir, recv), 'portal': portal}


def flush(L, code_dir, state_dir, recv, log=None, put=None):
    """сводка → Диск 1c@ (только если изменилась); → состояние"""
    key = kcheck(code_dir)
    if not key: return {'state': 'нет code/k_check.txt — сверка не отправляется'}
    lk = open(os.path.join(state_dir, 'sverka.lock'), 'w')
    try: fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError: return {'state': 'занято другим участком'}
    try:
        doc = build(state_dir, recv)
        body = json.dumps(doc, ensure_ascii=False, sort_keys=True).encode('utf-8')
        sha = hashlib.sha256(body).hexdigest()
        sp = os.path.join(state_dir, 'sverka_sent.json')
        try:
            with open(sp, encoding='utf-8') as f: sent = json.load(f)
        except Exception: sent = {}
        if sent.get('day') == doc['day'] and sent.get('sha') == sha: return {'state': 'без изменений', 't': sent.get('t')}
        doc['made'] = _iso()
        raw = json.dumps(doc, ensure_ascii=False).encode('utf-8')
        name = 'sverka-%s.bin' % doc['day'].replace('-', '')
        if put is None:
            import gdrive_1c as GD
            put = lambda n, data, sub: GD.put_file(L, n, data, 'text/plain', sub)
        r = put(name, seal_k(key, raw), SUB) or {}
        if not r.get('ok'):
            if log: log('  ! сверка: Диск —', r.get('err'))
            return {'state': 'ошибка: ' + str(r.get('err'))[:120]}
        _atomic(sp, {'day': doc['day'], 'sha': sha, 't': doc['made'], 'id': r.get('id')})
        if log: log('сверка: %s — писем %d, файлов портала %d' % (name, len(doc['letters']), sum(1 for v in doc['portal'].values() if v)))
        return {'state': 'ok', 't': doc['made'], 'file': name}
    finally:
        try: fcntl.flock(lk, fcntl.LOCK_UN)
        except Exception:
            # намеренно: после неудачной явной разблокировки дескриптор всё равно закрывается ниже.
            pass
        lk.close()
