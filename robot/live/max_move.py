# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — шаг 0 переноса ботов в Google 1c@ (04.11.2026): ОДИН раз скопировать состояние и историю бота MAX
с хостинга на Google Диск 1c@ («Фабрика — портал/Перенос MAX <id>»), чтобы проект «Фабрика — бот MAX» в Google продолжил с того же места.
Т. В. Сотрудник1 04.11: «Да, перенести в Google»; «На хостинге ничего с ботами связано быть не должно. Должно всё работать с
Google-диска»; шаг 0 — «Да, скопировать». План — fabrika/tasks/max_to_google_plan.md.

Что делает (только чтение на хостинге; ничего не меняет и не удаляет, кроме собственного состояния state/max_move.json):
  • задание — code/max_move.json {"id": "max-2026-11-04"}; каждое id выполняется один раз (до конца — по частям, за несколько прогонов);
  • файлы ~/.fabrika_max/** (группы, опросы polls/, история hist/ и history_all.json, контрольные точки ctl*.json, напоминания,
    журнал обращений grp_owner.jsonl, статистика…) и состояние робота по ботам (state/: promises, mx_survey, unans, sales_ctl,
    staff_watch, mail_cmd, itm) — каждый файл отдельно, ЗАШИФРОВАН ключом k_cmd (code/k_cmd.txt; тот же поток T14B1, что seal() в live.py;
    его знают только хостинг и скрипты Google) → <путь с «__» вместо «/»>.bin; в конце — manifest.bin (список: имя, размер, sha256 открытого
    содержимого, время изменения);
  • config.json бота MAX — БЕЗ токена, секрета вебхука, общего ключа, кода владельца и любых полей со словами token/secret/key/pass/code
    (остаются владелец, зеркало вкл/выкл, настройки фраз и адресатов, группы); никаких ключей и паролей на Диске нет ни в каком виде;
  • пропускаются: *.lock, *.tmp, *.bak*, *.corrupt, задания menu_job/export_job, файлы больше 20 МБ (попадут в manifest как skipped).
Связь с Диском — gdrive_1c.put_file (подписанный запрос к веб-приложению 1c@; пишет только в «Фабрика — портал/<папка>»).
За прогон — не дольше BUDGET секунд; что не успело — в следующий прогон (участок bots, раз в 10 минут). Python 3.6."""
import hashlib, hmac, base64, json, os, re, secrets, time
def _rd(p, mode='r', **kw):   # 14.11.2026: CodeQL py/file-not-closed — файл читается и сразу закрывается
    with open(p, mode, **kw) as _f: return _f.read()

HERE = os.path.dirname(os.path.abspath(__file__))
MAXF = 20 * 1024 * 1024
BUDGET = 120
SKIP_RE = re.compile(r'(\.lock|\.tmp|\.corrupt)$|\.bak|(^|/)(menu_job|export_job|menu_result)\.json$')
SECRET_RE = re.compile(r'token|secret|key|pass|code', re.I)
STATE_FILES = ('promises.json', 'promises_post_preview.json', 'mx_survey.json', 'unans.json', 'sales_ctl.json', 'staff_watch.json',
               'mail_cmd.json', 'itm.json')
ID_RE = re.compile(r'^[\w.-]{3,40}$')


def _now():
    return time.strftime('%Y-%m-%dT%H:%M', time.gmtime(time.time() + 3 * 3600))   # МСК


def seal_bytes_k(key, raw):
    """тот же поток, что live.seal_bytes, но ключом key (bytes) → 'T14B1.' + base64(nonce16 + tag32 + ct)"""
    nonce = secrets.token_bytes(16)
    ks = b''.join(hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(raw) + 31) // 32))[:len(raw)]
    ct = (int.from_bytes(raw, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(len(raw), 'big') if raw else b''
    tag = hmac.new(key, nonce + ct, hashlib.sha256).digest()
    return ('T14B1.' + base64.b64encode(nonce + tag + ct).decode()).encode()


def open_k(key, blob):
    """обратное seal_bytes_k (для тестов и проверки): None — подпись не сошлась"""
    s = blob.decode() if isinstance(blob, bytes) else blob
    if not s.startswith('T14B1.'): return None
    raw = base64.b64decode(s[6:]); nonce, tag, ct = raw[:16], raw[16:48], raw[48:]
    if not hmac.compare_digest(tag, hmac.new(key, nonce + ct, hashlib.sha256).digest()): return None
    ks = b''.join(hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))[:len(ct)]
    return (int.from_bytes(ct, 'big') ^ int.from_bytes(ks, 'big')).to_bytes(len(ct), 'big') if ct else b''


def scrub(o):
    """убрать поля с секретами (рекурсивно): token, secret, key, owner_code и т. п."""
    if isinstance(o, dict): return {k: scrub(v) for k, v in o.items() if not SECRET_RE.search(str(k))}
    if isinstance(o, list): return [scrub(v) for v in o]
    return o


def kcmd(code_dir):
    try: k = _rd(os.path.join(code_dir, 'k_cmd.txt')).strip().lower()
    except Exception: return None
    return bytes.fromhex(k) if re.fullmatch(r'[0-9a-f]{64}', k) else None


def sources(home, state_dir):
    """→ [(имя в копии, полный путь)] — файлы бота MAX и состояния робота по ботам"""
    out = []
    M = os.path.join(home, '.fabrika_max')
    if os.path.isdir(M):
        for root, dirs, files in os.walk(M):
            dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
            for f in sorted(files):
                rel = os.path.relpath(os.path.join(root, f), M).replace(os.sep, '/')
                if SKIP_RE.search(rel) or f.startswith('.'): continue
                out.append(('max/' + rel, os.path.join(root, f)))
    for f in STATE_FILES:
        p = os.path.join(state_dir, f)
        if os.path.isfile(p): out.append(('state/' + f, p))
    return out


def payload(name, path):
    """содержимое файла для копии: config.json — без секретов; остальное — как есть"""
    with open(path, 'rb') as _cg1_file_2:
        raw = _cg1_file_2.read()
    if name == 'max/config.json':
        try: raw = json.dumps(scrub(json.loads(raw.decode('utf-8'))), ensure_ascii=False, indent=1).encode('utf-8')
        except Exception: return None                       # не разобрался — не копировать вовсе (секреты не уйдут)
    return raw


def run(L, CODE, log, jload, jsave, put=None, home=None, budget=BUDGET):
    try:
        with open(os.path.join(CODE, 'max_move.json'), encoding='utf-8') as _cg1_file_3:
            job = json.load(_cg1_file_3)
    except Exception: return {'state': 'нет задания'}
    jid = str((job or {}).get('id') or '')
    if not ID_RE.match(jid): return {'state': 'ошибка: id задания'}
    st = jload('max_move.json', {}) or {}
    rec = st.get(jid) or {'files': {}, 'started': _now()}
    if rec.get('finished'): return {'state': 'готово', 'id': jid, 'n': len(rec['files']), 'at': rec['finished']}
    key = kcmd(CODE)
    if not key: return {'state': 'ошибка: нет корректного code/k_cmd.txt — копия не делается'}
    if put is None:
        import gdrive_1c as GD
        put = lambda name, data, sub: GD.put_file(L, name, data, 'text/plain', sub)
    home = home or os.path.dirname(L)
    sub = 'Перенос MAX ' + jid
    t0 = time.time(); sent = 0; err = None
    files = rec['files']
    for name, path in sources(home, os.path.join(L, 'state')):
        if name in files and files[name].get('ok'): continue
        if time.time() - t0 > budget: break
        try:
            size = os.path.getsize(path); mt = int(os.path.getmtime(path))
            if size > MAXF: files[name] = {'ok': True, 'skipped': 'больше 20 МБ', 'size': size}; continue
            raw = payload(name, path)
            if raw is None: files[name] = {'ok': True, 'skipped': 'не разобран, секреты не копируются', 'size': size}; continue
            r = put(name.replace('/', '__') + '.bin', seal_bytes_k(key, raw), sub) or {}
            if not r.get('ok'): err = '%s: %s' % (name, r.get('err')); break
            files[name] = {'ok': True, 'size': len(raw), 'sha': hashlib.sha256(raw).hexdigest(), 'mt': mt, 'id': r.get('id')}
            sent += 1
        except Exception as e:
            err = '%s: %s' % (name, e.__class__.__name__); break
    rec['files'] = files
    left = [n for n, _ in sources(home, os.path.join(L, 'state')) if not (files.get(n) or {}).get('ok')]
    if not left and not err:
        man = {'id': jid, 'made': _now(), 'key': 'k_cmd', 'format': 'T14B1 (seal_bytes)',
               'files': [dict(name=n, **{k: v for k, v in f.items() if k != 'id'}) for n, f in sorted(files.items())]}
        r = put('manifest.bin', seal_bytes_k(key, json.dumps(man, ensure_ascii=False).encode('utf-8')), sub) or {}
        if r.get('ok'): rec['finished'] = man['made']; rec['manifest'] = r.get('id')
        else: err = 'manifest: %s' % r.get('err')
    rec['err'] = err
    st[jid] = rec; jsave('max_move.json', st)
    res = {'state': 'готово' if rec.get('finished') else ('ошибка: ' + err if err else 'идёт'), 'id': jid,
           'sent': sent, 'done': sum(1 for f in files.values() if f.get('ok')), 'left': len(left)}
    if log: log('перенос MAX %s: отправлено %d, всего готово %d, осталось %d%s' % (jid, sent, res['done'], len(left), (', ошибка ' + err) if err else ''))
    return res
