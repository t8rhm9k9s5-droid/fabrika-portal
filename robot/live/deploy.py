# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — хостинг сам забирает обновления сайта с Google Диска (27.10.2026, пользователь: «хотелось бы, чтобы файл обновления
хостинг забирал сам, например с Гугл диска»).
Claude кладёт в папку «Fabrikant» на компьютере пользователя (её синхронизирует «Google Диск для компьютера») два файла:
   fabrikant-update-ГГГГММДД-ЧЧММ.zip — изменённые файлы сайта (зашифрованная сборка) и, по необходимости, код хостинга;
   fabrikant-update-ГГГГММДД-ЧЧММ.sig   — подпись: hex HMAC-SHA256(k_deploy, содержимое zip). Ключ — только у Claude и в cfg.json хостинга.
Хостинг раз в 10 минут (из live.py) смотрит папку по открытой ссылке (cfg.json → drive_folder), скачивает новую пару, сверяет подпись и
раскладывает (папка — cfg.json → drive_folder или файл ~/.fabrika_live/drive_folder со ссылкой): в корень сайта — только известные файлы сборки; code/… — в ~/.fabrika_live/code; host/… — PHP-файлы хостинга (st/, max/, wx/).
Без подписи, с чужой подписью или с неизвестными путями — не ставится ничего. Ничего не удаляется: старые блобы остаются (их убирает Claude
в ~/_удалить). Пока drive_folder не задан — выключено.
28.10.2026, пользователь: «перенеси на Фабрика — Диск 1c@ вместо моего owner@ всю работу портала» — Имя1 источник теперь Диск user1@example.org,
папка «Фабрика — портал/Обновления», через скрипт Google от имени 1c@ (gdrive_1c.py; без открытой ссылки). Старая папка owner@ (drive_folder) —
запасная, пока в code/gdrive_1c.json не стоит "old_off": true.
30.10.2026 аудит P4–P6: подпись .sig v2 (имя + sha256 пакета), только пакеты новее установленного, копии и откат, битый пакет не держит
очередь — см. блок «подписи v2» ниже и INSTALL_py.md (порядок перехода с v1 на v2)."""
import hashlib, hmac, io, json, os, re, shutil, subprocess, sys, tempfile, time, urllib.request, zipfile, zlib
def _rd(p, mode='r', **kw):   # 14.11.2026: CodeQL py/file-not-closed — файл читается и сразу закрывается
    with open(p, mode, **kw) as _f: return _f.read()
# тихие часы (пользователь 27.10.2026, уточнение): ночью всё делается и ставится — молчат только уведомления (их держит Google-скрипт бота до 08:00)

SITE_FILES = re.compile(r'^(b/[0-9a-f]{24}\.bin|k/[0-9a-f]{8,64}\.bin|icons/[\w.-]+|index\.html|login\.html|404\.html|sw\.js|m\.bin|mf\.bin|ml\.bin|manifest\.webmanifest|'   # 21.11.2026: mf.bin / ml.bin — карты разделов «Сайт» и «Документы» (деление карты)
                        r'robots\.txt|fabrika\.apk|applink\.js|bot_done\.json|bd\.bin|bn\.bin|\.htaccess|'
                        r'menutest/(?:full/)?(?:index\.html|manifest\.webmanifest)|'   # 15.11.2026: тест нижнего меню (Т. В.), без данных портала
                        # 16.11.2026: тестовая копия портала с доступом по группам (опрос Т. В. «Да, выкладывай копию»; проверка Сотрудник89 И. В. 17.11)
                        r'gtest/(?:b/[0-9a-f]{24}\.bin|k/[0-9a-f]{8,64}\.bin|icons/[\w.-]+|index\.html|login\.html|404\.html|sw\.js|m\.bin|'
                        r'manifest\.webmanifest|robots\.txt|applink\.js))$')
HOST_FILES = re.compile(r'^host/((st|max|wx)/[\w.-]+\.(php|htaccess)|(st|max|wx)/\.htaccess)$')
CODE_FILES = re.compile(r'^(code/[\w.-]+\.(py|json|txt)|out/plan_\d{4}-\d{2}\.json)$')      # out/plan_… — планы выпуска (27.10); .txt — файлы ключей k_owner/k_cmd (29.10)
PACK = re.compile(r'^fabrik(?:a|ant)-update-\d{8}-\d{4}\.(?:zip|pkg)$')     # .pkg — the zip encrypted (27.10), .zip — plain (old)
LAST = ('m.bin', 'sw.js', 'index.html', 'login.html', '404.html')          # after the blobs: the site switches to the new version at the very end
UA = {'User-Agent': 'Mozilla/5.0 (Fabrika hosting; techfabrikant.ru)'}


def _get(url, limit=200 * 1024 * 1024):
    rq = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(rq, timeout=120) as r:
        b = r.read(limit + 1)
    if len(b) > limit: raise ValueError('слишком большой файл')
    return b


def listing(folder):
    """the files of a Drive folder shared «anyone with the link» → {name: id}"""
    h = _get('https://drive.google.com/embeddedfolderview?id=' + folder).decode('utf-8', 'replace')
    out = {}
    for m in re.finditer(r'id="entry-([\w-]{10,})".*?class="flip-entry-title">([^<]+)<', h, re.S):
        out[m.group(2).strip()] = m.group(1)
    return out


def download(fid):
    b = _get('https://drive.google.com/uc?export=download&id=' + fid)
    if b[:15].lower().startswith(b'<!doctype html') or b[:5].lower() == b'<html':      # the «can't scan for viruses» page of big files
        m = re.search(rb'name="uuid" value="([\w-]+)"', b)
        b = _get('https://drive.usercontent.google.com/download?id=%s&export=download&confirm=t%s' % (fid, ('&uuid=' + m.group(1).decode()) if m else ''))
    return b


def release_part(zraw):
    """16.11.2026 (R5-01): опись части выпуска code/release_part.json → {'rid', 'i', 'n'} или None (старые пакеты, одиночный пакет без описи)"""
    try:
        z = zipfile.ZipFile(io.BytesIO(zraw))
        if 'code/release_part.json' not in z.namelist(): return None
        j = json.loads(z.read('code/release_part.json').decode('utf-8'))
        rid, i, n = str(j['rid'])[:40], int(j['i']), int(j['n'])
        return {'rid': rid, 'i': i, 'n': n} if re.match(r'^[\w-]+$', rid) and 1 <= i <= n <= 50 else None
    except Exception: return None


def unpack(zb, key):
    """«.pkg»: b'T14Z1' + nonce16 + ct; поток HMAC-SHA256(KE, nonce‖i_be32), KE = HMAC-SHA256(k_deploy, 'fabrika-pack-enc-v1').
    Целостность — подпись .sig над всем файлом (проверяется до расшифровки). В папке Диска поэтому нет открытого текста."""
    if zb[:5] != b'T14Z1': return zb
    ke = hmac.new(key, b'fabrika-pack-enc-v1', hashlib.sha256).digest()
    nonce, ct = zb[5:21], zb[21:]
    ks = b''.join(hmac.new(ke, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))
    return (int.from_bytes(ct, 'big') ^ int.from_bytes(ks[:len(ct)], 'big')).to_bytes(len(ct), 'big')


# REDACTED_B64_8 30.10.2026 аудит P4–P6 (DESIGN 8): подписи v2, защита от отката, копии и откат
# .sig v2 = 'v2:' + hex HMAC-SHA256(k_deploy, "T14PKG2\n" + <имя пакета> + "\n" + sha256hex(байты пакета)) — подпись покрывает имя (а в нём метка
# времени ГГГГММДД-ЧЧММ): старый подписанный пакет под новым именем не пройдёт. Метка должна быть строго новее последней установленной.
# Старая подпись v1 (hex по байтам) — только пока не установлен ни один пакет v2 (переход), и тоже с проверкой метки. Тот же код — для
# пакетов по почте (mail_pkg). Перед установкой — копии заменяемых файлов в ~/.fabrika_live/deploy_bak/<пакет>/, после — проверка импорта
# кода в отдельном процессе; сбой (или обрыв установки) — откат из копии, пакет отмечается с ошибкой, владельцу — оповещение.
TS_RE = re.compile(r'-(\d{8})-(\d{4})\.(?:zip|pkg)$')
BAK_KEEP = 10                                              # столько последних копий хранить
TRANSIENT_TRIES = 3                                        # временные сбои (скачивание, нет .sig, обрыв установки) — столько прогонов, потом «ошибка»
# 04.11.2026, остаток аудита безопасности 29.10 (В3): защита от отката сделана 30.10 (подпись v2 по имени с меткой, метка строго новее);
# здесь — пределы распаковки: пакет читается целиком в память (data = {…}), а z.read(n) брал часть любого размера. Подпись проверена раньше,
# так что это вторая линия (ошибка сборки, чужой ключ). Замер 04.11: полная сборка — 541 файл, самый большой 15,5 МБ, всё — 352 МБ.
PKG_MAX_ENTRIES = 5000                                     # файлов в пакете
PKG_MAX_ENTRY = 64 * 1024 * 1024                           # один файл после распаковки
PKG_MAX_TOTAL = 512 * 1024 * 1024                          # все файлы после распаковки


class DeployError(Exception):
    """пакет не ставится и повторять бессмысленно (подпись, состав, проверка импорта)"""


class RollbackIncomplete(Exception):
    """01.11.2026, замечание 04: откат не восстановил все файлы — состояние смешанное, нужна повторная попытка, а не «прежняя версия»"""


class DeployRetry(Exception):
    """сбой среды посреди установки (диск, права) — откат сделан, повторить в следующий прогон"""


def pkg_ts(name):
    m = TS_RE.search(name or '')
    return m.group(1) + m.group(2) if m else ''


def sig_v2(key, name, data):
    msg = b'T14PKG2\n' + name.encode('utf-8') + b'\n' + hashlib.sha256(data).hexdigest().encode('ascii')
    return 'v2:' + hmac.new(key, msg, hashlib.sha256).hexdigest()


def last_ts(st):
    """метка последнего УСТАНОВЛЕННОГО пакета (по deploy.json: done без ошибки, с числом файлов)"""
    ts = [pkg_ts(n) for n, v in (st.get('done') or {}).items() if isinstance(v, dict) and v.get('files') is not None and not v.get('err')]
    return max([t for t in ts if t] + [str(st.get('last_ts') or '')])


def verify(key, name, data, sig, st):
    """→ (True, 'v2'|'v1') или (False, причина). sig — содержимое .sig (bytes или str; не-ASCII не роняет проверку — P7)"""
    if isinstance(sig, bytes): sig = sig.decode('utf-8', 'replace')
    s = (sig or '').strip().lower()
    ts = pkg_ts(name)
    if not ts: return False, 'нет метки времени в имени'
    lt = last_ts(st)
    if ts <= lt: return False, 'метка %s не новее установленной %s (повтор или откат версии)' % (ts, lt)
    if s.startswith('v2:'):
        if hmac.compare_digest(sig_v2(key, name, data).encode('ascii'), s.encode('utf-8', 'replace')): return True, 'v2'
        return False, 'подпись v2 не сошлась'
    if st.get('v2'): return False, 'подпись v1 больше не принимается (уже установлен пакет v2)'
    if hmac.compare_digest(hmac.new(key, data, hashlib.sha256).hexdigest().encode('ascii'), s.encode('utf-8', 'replace')): return True, 'v1'
    return False, 'подпись не сошлась'


def _bak_root(L): return os.path.join(L, 'deploy_bak')


def _save_manifest(d, man):
    p = os.path.join(d, 'manifest.json'); tmp = p + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f: json.dump(man, f, ensure_ascii=False, indent=1); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, p)


def rollback(d, log):
    """файлы из копии deploy_bak/<пакет>/ — на место; файлы, которых до установки не было, — убрать → число восстановленных.
    01.11.2026 (внешняя проверка кода, замечание 04): раньше при сбое восстановления отдельного файла опись всё равно получала «откат»,
    и recover() больше к ней не возвращался — сайт мог остаться наполовину новым. Теперь: не всё восстановлено → «откат не завершён»
    со списком файлов; recover() повторяет такие откаты, а новые пакеты не ставятся, пока откат не доведён (RollbackIncomplete)."""
    man = json.loads(_rd(os.path.join(d, 'manifest.json'), encoding='utf-8'))
    n, bad = 0, []
    for x in man.get('files') or []:
        dst = x['dest']
        try:
            if x.get('had'):
                src = os.path.join(d, 'f', x['n'])
                tmp = '%s.rb%d.tmp' % (dst, os.getpid()); shutil.copy2(src, tmp); os.replace(tmp, dst); n += 1
            elif os.path.exists(dst): os.remove(dst); n += 1
        except Exception as e:
            bad.append(x.get('n')); log('выкладка: откат', x.get('n'), 'не удался:', e.__class__.__name__, e)
    man['state'] = 'откат не завершён' if bad else 'откат'; man['rb_t'] = time.strftime('%Y-%m-%dT%H:%M'); man['rb_fail'] = bad
    _save_manifest(d, man)
    log('выкладка: откат пакета', man.get('name'), '— восстановлено файлов', n, ('— НЕ восстановлено: %d (%s)' % (len(bad), ', '.join(bad[:5])) if bad else ''))
    if bad: raise RollbackIncomplete('откат пакета %s не завершён: не восстановлено файлов %d (%s)' % (man.get('name'), len(bad), ', '.join(bad[:5])))
    return n


def check_code(L, mods, jsons, timeout=120):
    """проверка импорта поставленного кода в отдельном процессе (те же пути, что у live.py) → (True, '') или (False, хвост ошибки)"""
    code = os.path.join(L, 'code')
    prog = ('import json, sys, importlib\nsys.path[:0] = [%r, %r]\n' % (os.path.join(L, 'py'), code) +
            'for f in %r: json.load(open(f, encoding="utf-8"))\n' % (list(jsons),) +
            'for m in %r: importlib.import_module(m)\nprint("ok")\n' % (list(mods),))
    try:
        r = subprocess.run([sys.executable, '-I', '-c', prog], cwd=code, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout)
    except subprocess.TimeoutExpired: return False, 'проверка импорта дольше %d с' % timeout
    if r.returncode == 0 and r.stdout.strip().endswith(b'ok'): return True, ''
    return False, (r.stderr.decode('utf-8', 'replace').strip().splitlines() or ['код выхода %s' % r.returncode])[-1][:300]


def _php_bin():
    for c in (shutil.which('php'), '/usr/bin/php', '/usr/local/bin/php', '/opt/php/bin/php'):
        if c and os.path.isfile(c) and os.access(c, os.X_OK): return c
    return None


def pre_check(data):
    """01.11.2026 (внешняя проверка кода, замечание 07): до первой записи — Python компилируется, JSON разбирается, PHP проверяется
    php -l (если на хостинге есть php CLI; нет — в журнал, установка как раньше). Ошибка → DeployError, рабочие файлы не тронуты."""
    errs = []
    php = None
    for n, b in data.items():
        try:
            if n.endswith('.py'): compile(b, n, 'exec')
            elif n.endswith('.json') and n.startswith(('code/', 'out/')): json.loads(b.decode('utf-8'))
            elif n.endswith('.php'):
                php = php or _php_bin() or ''
                if not php: continue
                fd, tmp = tempfile.mkstemp(suffix='.php')
                try:
                    with os.fdopen(fd, 'wb') as f: f.write(b)
                    r = subprocess.run([php, '-l', tmp], stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=30)
                    if r.returncode != 0:
                        errs.append('%s: %s' % (n, (r.stderr + r.stdout).decode('utf-8', 'replace').strip().replace(tmp, n).splitlines()[0][:160]))
                finally:
                    try: os.remove(tmp)
                    except OSError: pass   # намеренно: временного файла проверки уже нет
        except SyntaxError as e: errs.append('%s: синтаксис, строка %s' % (n, e.lineno))
        except ValueError as e: errs.append('%s: %s' % (n, str(e)[:120]))
        except subprocess.TimeoutExpired: errs.append('%s: php -l дольше 30 с' % n)
    if errs: raise DeployError('проверка до установки не прошла: ' + '; '.join(errs[:3]))


def _limits(z):
    """04.11.2026 аудит 29.10 (В3): число файлов, размер каждого и всех вместе, повторы имён — до чтения. → {имя: ZipInfo}"""
    il = [i for i in z.infolist() if not i.filename.endswith('/')]
    if len(il) > PKG_MAX_ENTRIES: raise DeployError('в пакете %d файлов (предел %d)' % (len(il), PKG_MAX_ENTRIES))
    seen, tot = {}, 0
    for i in il:
        if i.filename in seen: raise DeployError('в пакете два файла с именем %s' % i.filename[:80])
        if i.flag_bits & 0x1: raise DeployError('файл %s в пакете зашифрован zip-паролем' % i.filename[:80])
        if i.file_size > PKG_MAX_ENTRY: raise DeployError('файл %s — %d Б после распаковки (предел %d)' % (i.filename[:80], i.file_size, PKG_MAX_ENTRY))
        tot += i.file_size
        if tot > PKG_MAX_TOTAL: raise DeployError('пакет больше %d Б после распаковки' % PKG_MAX_TOTAL)
        seen[i.filename] = i
    return seen


def _read(z, info):
    """часть пакета — не больше заявленного размера (и не больше PKG_MAX_ENTRY), даже если заголовок zip врёт"""
    try:
        with z.open(info) as f: b = f.read(min(info.file_size, PKG_MAX_ENTRY) + 1)
    except (zipfile.BadZipFile, NotImplementedError, RuntimeError, EOFError, zlib.error) as e:   # CRC, сжатие, которого нет в zipfile, обрыв — не ставится
        raise DeployError('файл %s в пакете не читается (%s)' % (info.filename[:80], e.__class__.__name__))
    if len(b) > info.file_size or len(b) > PKG_MAX_ENTRY: raise DeployError('файл %s больше заявленного в пакете' % info.filename[:80])
    return b


def install(zbytes, L, site, log, name=None, verify_code=True):
    z = zipfile.ZipFile(io.BytesIO(zbytes))
    infos = _limits(z)                                      # 04.11.2026 аудит 29.10 (В3): пределы распаковки — до первого чтения
    names = list(infos)
    bad = [n for n in names if not (SITE_FILES.match(n) or HOST_FILES.match(n) or CODE_FILES.match(n)) or '..' in n]
    if bad: raise DeployError('неизвестные файлы: ' + ', '.join(bad[:5]))
    def dest(n):
        if n.startswith(('code/', 'out/')): return os.path.join(L, n)
        if n.startswith('host/'): return os.path.join(site, n[5:])
        return os.path.join(site, n)
    order = [n for n in names if n not in LAST] + [n for n in LAST if n in names]
    data = {n: _read(z, infos[n]) for n in order}           # 30.10.2026 аудит P5: весь архив читается до первой записи (битый zip — ничего не тронуто); 04.11 — с пределом
    pre_check(data)                                         # 01.11.2026, замечание 07: синтаксис Python, JSON и PHP — до замены рабочих файлов
    # 30.10.2026 аудит P5: копии заменяемых файлов и опись — до установки
    d = os.path.join(_bak_root(L), re.sub(r'[^\w.-]', '_', name or ('pkg-' + time.strftime('%Y%m%d-%H%M%S'))))
    if os.path.isdir(d): shutil.rmtree(d)
    os.makedirs(os.path.join(d, 'f')); os.chmod(_bak_root(L), 0o700)
    man = {'name': name, 't': time.strftime('%Y-%m-%dT%H:%M'), 'state': 'ставится', 'files': []}
    for n in order:
        p = dest(n); had = os.path.isfile(p)
        if had:
            b = os.path.join(d, 'f', n); os.makedirs(os.path.dirname(b), exist_ok=True); shutil.copy2(p, b)
        man['files'].append({'n': n, 'dest': p, 'had': had})
    _save_manifest(d, man)
    try:
        for n in order:
            p = dest(n); os.makedirs(os.path.dirname(p), exist_ok=True)
            with open(p + '.tmp', 'wb') as f: f.write(data[n])
            os.chmod(p + '.tmp', 0o600 if n.startswith(('code/', 'out/')) else 0o644); os.replace(p + '.tmp', p)
        mods = sorted(set(['live', 'deploy'] + [n[5:-3] for n in order if n.startswith('code/') and n.endswith('.py')]))
        mods = [m for m in mods if os.path.exists(os.path.join(L, 'code', m + '.py'))]
        jsons = [dest(n) for n in order if n.startswith(('code/', 'out/')) and n.endswith('.json')]
        if verify_code and (mods or jsons) and any(n.startswith(('code/', 'out/')) for n in order):
            ok, why = check_code(L, mods, jsons)
            if not ok: raise DeployError('проверка импорта не прошла: %s' % why)
    except BaseException as e:                             # сбой посреди установки, проверка не прошла, предел времени участка — откат
        try: rollback(d, log)
        except RollbackIncomplete: raise                   # 01.11.2026, замечание 04: смешанное состояние — наверх, с честным текстом
        except Exception as e2: log('выкладка: откат не удался:', e2.__class__.__name__, e2); raise RollbackIncomplete('откат не удался: %s' % e2.__class__.__name__)
        if isinstance(e, Exception) and not isinstance(e, DeployError): raise DeployRetry('сбой установки (%s %s) — откат' % (e.__class__.__name__, str(e)[:120]))
        raise
    man['state'] = 'готово'; _save_manifest(d, man)
    olds = sorted((x for x in os.listdir(_bak_root(L)) if os.path.isdir(os.path.join(_bak_root(L), x))), key=lambda x: os.path.getmtime(os.path.join(_bak_root(L), x)))
    for x in olds[:-BAK_KEEP]: shutil.rmtree(os.path.join(_bak_root(L), x), ignore_errors=True)
    log('выкладка: поставлено файлов', len(order), '(сайт %d, хостинг %d, код %d)' % (sum(1 for n in names if SITE_FILES.match(n)),
        sum(1 for n in names if n.startswith('host/')), sum(1 for n in names if n.startswith('code/'))))
    return len(order)


def recover(L, st, log):
    """30.10.2026 аудит P5: прошлая установка оборвалась вместе с процессом (опись «ставится») — откат из копии → [имена пакетов]"""
    out = []
    root = _bak_root(L)
    if not os.path.isdir(root): return out
    for x in sorted(os.listdir(root)):
        mp = os.path.join(root, x, 'manifest.json')
        try: man = json.loads(_rd(mp, encoding='utf-8'))
        except Exception: continue
        if man.get('state') not in ('ставится', 'откат не завершён'): continue      # 01.11.2026, замечание 04: недоведённый откат — повторить
        try: rollback(os.path.join(root, x), log)
        except RollbackIncomplete as e: st['rb_incomplete'] = str(e)[:300]
        else: st.pop('rb_incomplete', None)
        out.append(man.get('name') or x)
    return out


UPD_DIR = 'Обновления'


def g1c_listing(L, st):
    """пакеты в папке «Фабрика — портал/Обновления» на Диске 1c@ (через gdrive_1c.py) → {name: ('1c', id)}; только за сегодня и вчера (МСК)"""
    import gdrive_1c as GD
    if not GD._url(): return None
    did = st.get('g1c_dir')
    if not did:
        r = GD.call(L, 'ls', {'portal': True, 'limit': 200})
        if not r.get('ok'): raise ValueError('Диск 1c@: %s' % r.get('err'))
        did = next((x['id'] for x in r.get('items') or [] if x.get('dir') and x.get('name') == UPD_DIR), None)
        if not did:
            r = GD.call(L, 'mkdir', {'name': UPD_DIR})
            if not r.get('ok'): raise ValueError('Диск 1c@, папка: %s' % r.get('err'))
            did = r['id']
        st['g1c_dir'] = did
    out = {}
    now = time.time() + 3 * 3600
    for day in (time.strftime('%Y%m%d', time.gmtime(now)), time.strftime('%Y%m%d', time.gmtime(now - 86400))):
        r = GD.call(L, 'ls', {'id': did, 'q': 'fabrikant-update-' + day, 'limit': 400})
        if not r.get('ok'):
            st.pop('g1c_dir', None); raise ValueError('Диск 1c@, список: %s' % r.get('err'))
        for x in r.get('items') or []:
            if not x.get('dir'): out[x['name']] = ('1c', x['id'])
    if not out:                                            # поиск Диска по началу имени может не сработать на дефисах — тогда весь список папки
        r = GD.call(L, 'ls', {'id': did, 'limit': 2000})
        if r.get('ok'):
            days = (time.strftime('%Y%m%d', time.gmtime(now)), time.strftime('%Y%m%d', time.gmtime(now - 86400)))
            for x in r.get('items') or []:
                if not x.get('dir') and any(('-%s-' % d) in x.get('name', '') for d in days): out[x['name']] = ('1c', x['id'])
    return out


def g1c_download(L, fid):
    import gdrive_1c as GD
    r = GD.get_file(L, fid)
    if not r.get('ok'): raise ValueError('Диск 1c@, файл: %s' % r.get('err'))
    return r['data']


def old_off():
    try: return bool(json.loads(_rd(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gdrive_1c.json'), encoding='utf-8')).get('old_off'))
    except Exception: return False


def check(CFG, L, site, state_load, state_save, log, alert=None):
    st = state_load('deploy.json', {'done': {}})           # 30.10.2026 аудит P8: битый deploy.json (без .bak) — исключение, ничего не ставится
    key = CFG.get('k_deploy') or ''
    if not key: return None
    st.setdefault('done', {})
    tries = st.setdefault('tries', {})
    now_ = lambda: time.strftime('%Y-%m-%dT%H:%M')

    def fail(name, why, permanent=True):
        """30.10.2026 аудит P6: битый пакет отмечается и НЕ останавливает очередь; временный сбой — до TRANSIENT_TRIES прогонов"""
        if not permanent:
            tries[name] = int(tries.get(name) or 0) + 1
            if tries[name] < TRANSIENT_TRIES:
                st['err'] = '%s: %s (попытка %d из %d)' % (name, why, tries[name], TRANSIENT_TRIES); state_save('deploy.json', st); return False
        tries.pop(name, None)
        st['done'][name] = {'t': now_(), 'err': str(why)[:300]}; st['err'] = '%s: %s' % (name, str(why)[:200])
        log('выкладка:', name, '—', why)
        state_save('deploy.json', st)                      # 30.10.2026 аудит P10: сразу
        if alert:
            try: alert('deploy:' + name, 'Фабрика: пакет обновления %s не установлен: %s. Робот работает на прежней версии кода.' % (name, str(why)[:300]))
            except Exception as e: log('  ! оповещение о пакете:', e)
        return True

    # 30.10.2026 аудит P5: прошлая установка не дошла до конца (процесс оборвался или предел времени участка) — откат из копии, попытка в счёт
    broken = set(recover(L, st, log))
    if st.get('installing'): broken.add(st.pop('installing'))
    for nm in sorted(broken): fail(nm, 'установка оборвалась — откат из копии', permanent=False)
    if st.get('rb_incomplete'):                            # 01.11.2026, замечание 04: пока откат не доведён — новые пакеты не ставим, тревога
        st['err'] = st['rb_incomplete'] + ' — новые пакеты не ставятся, повтор через 10 мин'
        try: alert('deploy:rollback', 'Фабрика: ' + st['err'] + '. Файлы сайта или кода могут быть разных версий.')
        except Exception as e: log('  ! оповещение об откате:', e)
        state_save('deploy.json', st); return st
    files, errs = {}, []
    try:                                                   # 1) Диск 1c@ (Имя1)
        g = g1c_listing(L, st)
        if g: files.update(g)
    except Exception as e:
        errs.append(str(e)[:120])
    try:                                                   # 1б) 29.10: пакеты, принятые по почте itm@ (mail_pkg.py) — ~/.fabrika_live/inbox/
        import mail_pkg as MKP
        for k, v in MKP.listing(L).items(): files.setdefault(k, v)
    except Exception as e:
        errs.append('почта: %s' % (str(e)[:120]))
    if not old_off():                                      # 2) старая папка owner@ по открытой ссылке (запасная)
        try:
            o = old_listing(CFG, L)
            for k, v in (o or {}).items(): files.setdefault(k, ('old', v))
        except Exception as e:
            errs.append('папка Диска: %s' % (str(e)[:120]))
    if not files and errs:
        st['err'] = '; '.join(errs); state_save('deploy.json', st); return st
    st.pop('err', None)
    st['src'] = sorted(set(v[0] for v in files.values()))
    kb = bytes.fromhex(key)
    get = lambda ref: g1c_download(L, ref[1]) if ref[0] == '1c' else _rd(ref[1], 'rb') if ref[0] == 'mail' else download(ref[1])
    # 30.10.2026 аудит P4: по метке времени из имени (fabrika-… и fabrikant-… — в одном порядке), старше установленного — отказ
    for name in sorted((n for n in files if PACK.match(n)), key=lambda n: (pkg_ts(n), n)):
        if name in st['done']: continue
        sig = name[:-4] + '.sig'
        if sig not in files:                               # подпись ещё не пришла — подождать (порядок пакетов важен), но не вечно
            if fail(name, 'нет файла подписи .sig', permanent=False): continue
            break
        try:
            want = get(files[sig]); zb = get(files[name])
        except MemoryError:                                # 20.11.2026: пакет 389 МБ не влез в память хостинга — весь проход падал и очередь стояла
            fail(name, 'пакет слишком большой для памяти хостинга — пропущен (собирать drive_pack --split)'); continue
        except Exception as e:                             # сеть / Диск — временно
            if fail(name, 'не скачался: %s' % (str(e)[:160] or e.__class__.__name__), permanent=False): continue
            break
        if zb is not None and len(zb) > 150 * 1024 * 1024:   # 20.11.2026: больше 150 МБ хостинг не распакует — сразу в пропуск
            zb = None; fail(name, 'пакет больше 150 МБ — пропущен (собирать drive_pack --split)'); continue
        ok, how = verify(kb, name, zb, want, st)
        if not ok:
            fail(name, how); continue
        # 16.11.2026 (R5-01 Рекса): выпуск из нескольких частей (drive_pack --split) — code/release_part.json {rid, i, n}.
        #   Часть не ставится, если более ранняя часть того же выпуска провалена; последняя часть (m.bin, sw.js — переключение версии)
        #   ставится только после успешной установки всех предыдущих. Пакеты без описи — как раньше.
        rel = st.setdefault('rel', {})
        try: zraw = unpack(zb, kb)
        except MemoryError:
            zb = None; fail(name, 'пакет слишком большой для памяти хостинга — пропущен (собирать drive_pack --split)'); continue
        except (DeployError, zipfile.BadZipFile, ValueError) as e:
            fail(name, str(e)[:300] or e.__class__.__name__); continue
        rp = release_part(zraw)
        if rp:
            R = rel.setdefault(rp['rid'], {'n': rp['n'], 'ok': [], 'bad': []})
            if R['bad']:
                fail(name, 'выпуск %s: часть %s не встала — часть %d из %d не ставлю, рабочая версия прежняя' % (rp['rid'], ','.join(map(str, R['bad'])), rp['i'], rp['n']))
                continue
            miss = [k for k in range(1, rp['i']) if k not in R['ok']]
            if miss:
                if fail(name, 'выпуск %s: части %s ещё не установлены — часть %d из %d ждёт' % (rp['rid'], ','.join(map(str, miss)), rp['i'], rp['n']), permanent=False):
                    R['bad'].append(rp['i']); continue
                break
        st['installing'] = name; state_save('deploy.json', st)       # 30.10.2026 аудит P5: метка «ставится» — обрыв процесса будет виден
        try:
            n = install(zraw, L, site, log, name)
        except (DeployError, zipfile.BadZipFile, ValueError) as e:
            st.pop('installing', None); fail(name, str(e)[:300] or e.__class__.__name__)
            if rp: rel[rp['rid']]['bad'].append(rp['i'])
            continue
        except RollbackIncomplete as e:                    # 01.11.2026, замечание 04: откат не доведён — не «прежняя версия»
            st.pop('installing', None); st['rb_incomplete'] = str(e)[:300]; st['err'] = str(e)[:300]
            try: alert('deploy:rollback', 'Фабрика: пакет %s — %s. Файлы могут быть разных версий; повтор отката через 10 мин.' % (name, str(e)[:200]))
            except Exception as e3: log('  ! оповещение об откате:', e3)
            state_save('deploy.json', st); break
        except Exception as e:                             # среда (диск, права) — откат уже сделан, повторить позже
            st.pop('installing', None)
            if fail(name, (str(e) if isinstance(e, DeployRetry) else 'сбой установки: %s %s — откат' % (e.__class__.__name__, str(e)[:160]))[:300], permanent=False):
                if rp: rel[rp['rid']]['bad'].append(rp['i'])
                continue
            break
        st.pop('installing', None); tries.pop(name, None)
        st['done'][name] = {'t': now_(), 'files': n, 'sha': hashlib.sha256(zb).hexdigest()[:16], 'from': files[name][0], 'sig': how}
        if rp:
            rel[rp['rid']]['ok'].append(rp['i'])
            st['done'][name]['rel'] = '%s %d/%d' % (rp['rid'], rp['i'], rp['n'])
        st['last'] = name; st['last_ts'] = pkg_ts(name)
        if how == 'v2': st['v2'] = True                    # 30.10.2026 аудит P4: после первого v2 подпись v1 больше не принимается
        state_save('deploy.json', st)                      # 30.10.2026 аудит P10: сразу после установки
    st['t'] = now_()
    state_save('deploy.json', st)
    return st


def old_listing(CFG, L):
    folder = (CFG.get('drive_folder') or '').strip()
    if not folder:                                         # or the file ~/.fabrika_live/drive_folder: the folder's link or id (no keys in it)
        try: folder = _rd(os.path.join(L, 'drive_folder'), encoding='utf-8').strip()
        except Exception: folder = ''
    m = re.search(r'/folders/([\w-]{10,})', folder) or re.search(r'[?&]id=([\w-]{10,})', folder)
    if m: folder = m.group(1)
    if folder and not re.fullmatch(r'[\w-]{10,}', folder): folder = ''
    if not folder: return None
    return listing(folder)
