# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — обмен робота хостинга с ботами Google через Диск 1c@ (05.11.2026, шаг 4 переноса ботов в Google 1c@).
Т. В. Сотрудник1 04.11: «Бот работает независимо, только на G-драйве». Решения Р1 (данные сайта ботам — через папку Диска 1c@
«Фабрика — портал/Для ботов»), Р2 (данные ботов для портала — на Диск, робот показывает), Р4 (оповещения робота через Диск → бот пишет
Т. В. в Telegram).

Что делает (участок bots, раз в 10 минут; подключение в live.py — одной вставкой, см. deploy/gas/move1c/live_bots_drive.patch):
  1) робот → боты: копии файлов сайта и st/*.bin, которые читают боты (как есть: st/*.bin уже зашифрованы T14B1 ключами k_live/k_owner —
     боты расшифровывают их тем же ключом), bot_rules.json / bot_prompt.txt / price_now.json / ko_staff.json / unans_org.json (как есть, JSON),
     wx_f.json (кэш ответа wx/f.php — ~/.wx_cache/fabrika_f.json), site_ver.json (const VERSION из sw.js) → «Для ботов». Только изменившиеся
     (sha256 — state/bots_drive.json), не больше MAX_PUTS файлов за прогон, сначала самые нужные.
  2) боты → робот/портал: из «От ботов» — ev.bin → st/ev.bin (обращения, ключ владельца; как писал st/ev.php), hb.json → state/gas_hb.json
     (сторож live.py watch() видит отметки скрипта Google как раньше), mx_direct.json → state/mx_direct_from_bots.json (не в код и не на сайт —
     внутри личные сообщения), dr/*.json → ~/.fabrika_live/drafts/in/ (черновики — как от st/dr.php). Только изменившиеся (дата файла на Диске).
  3) флаг code/bots_off.json (кладётся пакетом при переключении; {"off": false} — выключить флаг, не удаляя файл): участок bots больше ничего не
     делает, кроме этого обмена; max_send и mail_send робота (install) не шлют сами — оповещения уходят в «Для ботов»/robot_alerts.json
     (бот Telegram пишет Т. В.), письма — в «Для ботов»/robot_mail.json (бот отправляет их от 1c@ через Gmail, ответ — на itm@).
Диск — через gdrive_1c.py (подписанные запросы к веб-приложению Google от имени 1c@): put (перезапись того же файла), ls, get. Ничего на Диске
не удаляется. Ключи и пароли робота на Диск не попадают (список файлов — явный, каталог code/ целиком не копируется). Python 3.6."""
import base64, fcntl, hashlib, json, os, re, time

HERE = os.path.dirname(os.path.abspath(__file__))
TO_BOTS, FROM_BOTS, DR_DIR = 'Для ботов', 'От ботов', 'dr'
STATE_FILE = 'bots_drive.json'
ALERTS_FILE, MAIL_FILE = 'bots_alerts.json', 'bots_mail.json'          # очереди робота (state/), на Диск — robot_alerts.json / robot_mail.json
MAX_PUTS, MAX_BYTES, BUDGET_S = 12, 20 * 1024 * 1024, 240
MAX_ATT = 1500 * 1024                                                   # вложений в одном письме для бота — не больше (base64 в JSON)
ALERT_KEEP, MAIL_KEEP, MAIL_TTL = 50, 30, 2 * 86400
# (имя на Диске, откуда): site — корень сайта, st — <сайт>/st/, code — ~/.fabrika_live/code/, wx — ~/.wx_cache/fabrika_f.json, ver — из sw.js.
# Порядок = приоритет (первыми уходят те, что нужны чаще). Список — по коду v44l/v44m (bd, bn, bot_done, lb, ua, mq, gl, rem, poll, grp, diag,
# bot_rules, bot_prompt, price_now) и проекта MAX (kb, recl, ko_staff, unans_org, ls, sales, omts, smvs, mxsurvey, grpp, hs, docs, staff).
FILES = [('lb.bin', 'st'), ('bd.bin', 'site'), ('mq.bin', 'st'), ('gl.bin', 'st'), ('bn.bin', 'site'), ('bot_done.json', 'site'), ('ua.bin', 'st'),
         ('wx_f.json', 'wx'), ('site_ver.json', 'ver'),
         ('rem.bin', 'st'), ('poll.bin', 'st'), ('grp.bin', 'st'), ('grpp.bin', 'st'), ('diag.bin', 'st'), ('hs.bin', 'st'), ('recl.bin', 'st'),
         ('kb.bin', 'st'), ('ls.bin', 'st'), ('sales.bin', 'st'), ('omts.bin', 'st'), ('smvs.bin', 'st'), ('mxsurvey.bin', 'st'), ('docs.bin', 'st'), ('staff.bin', 'st'),
         ('bot_rules.json', 'code'), ('bot_prompt.txt', 'code'), ('price_now.json', 'code'), ('ko_staff.json', 'code'), ('unans_org.json', 'code')]
DOWN = ('ev.bin', 'hb.json', 'mx_direct.json', 'poruch.bin')   # 13.11: poruch.bin — раздел «Поручения» (бот MAX, ключ сайта)                           # из «От ботов» (плюс папка dr/)
GD = None                                                               # модуль gdrive_1c (подставляется в тестах)


def _gd():
    global GD
    if GD is None:
        import gdrive_1c as G
        GD = G
    return GD


def off(code_dir):
    """флаг code/bots_off.json: есть файл и в нём не {"off": false} → участок bots выключен (боты работают в Google)"""
    p = os.path.join(code_dir, 'bots_off.json')
    if not os.path.exists(p): return False
    try:
        with open(p, encoding='utf-8') as _cg1_file_1:
            j = json.load(_cg1_file_1)
        return not (isinstance(j, dict) and j.get('off') is False)
    except Exception: return True


def _sha(b): return hashlib.sha256(b).hexdigest()[:24]


def _iso(ts=None): return time.strftime('%Y-%m-%dT%H:%M', time.gmtime((ts or time.time()) + 3 * 3600))


def _atomic_write(path, data):
    d = os.path.dirname(path)
    if d and not os.path.isdir(d): os.makedirs(d, exist_ok=True)
    tmp = '%s.%d.tmp' % (path, os.getpid())
    with open(tmp, 'wb') as f: f.write(data if isinstance(data, bytes) else data.encode('utf-8'))
    os.replace(tmp, path)


def _queue_update(L, name, fn):
    """очередь робота (state/<name>): под замком — участки работают параллельно; fn(items) → items"""
    sd = os.path.join(L, 'state'); os.makedirs(sd, exist_ok=True)
    p = os.path.join(sd, name)
    lk = open(p + '.lock', 'a+')
    try:
        fcntl.flock(lk, fcntl.LOCK_EX)
        try:
            with open(p, encoding='utf-8') as _cg1_file_2:
                Q = json.load(_cg1_file_2)
        except Exception: Q = {}
        items = Q.get('items') if isinstance(Q, dict) and isinstance(Q.get('items'), list) else []
        items = fn(items)
        _atomic_write(p, json.dumps({'t': _iso(), 'items': items}, ensure_ascii=False))
        return items
    finally: lk.close()


def _src_path(L, SITE, name, kind):
    if kind == 'site': return os.path.join(SITE, name)
    if kind == 'st': return os.path.join(SITE, 'st', name)
    if kind == 'code': return os.path.join(L, 'code', name)
    if kind == 'wx': return os.path.join(os.path.dirname(L), '.wx_cache', 'fabrika_f.json')
    return None


def site_ver(SITE):
    """{"ver": <const VERSION из sw.js>, "t": …} — бот Telegram сообщает телефонам о новой версии (вместо чтения sw.js с хостинга); None — нет sw.js"""
    try:
        with open(os.path.join(SITE, 'sw.js'), encoding='utf-8', errors='replace') as _cg1_file_3:
            s = _cg1_file_3.read(20000)
    except Exception: return None
    m = re.search(r"const VERSION = '([^']+)'", s)
    if not m: return None
    return {'ver': m.group(1)[:80], 't': _iso()}


def _read_src(L, SITE, name, kind):
    """байты файла для «Для ботов» или None (нет файла / слишком большой)"""
    if kind == 'ver':
        v = site_ver(SITE)
        return json.dumps(v, ensure_ascii=False).encode('utf-8') if v else None
    p = _src_path(L, SITE, name, kind)
    if not p or not os.path.isfile(p): return None
    if os.path.getsize(p) > MAX_BYTES: return None
    with open(p, 'rb') as f: return f.read()


def _mime(name):
    return 'application/json' if name.endswith('.json') else 'text/plain'


def _queue_json(L, name):
    try:
        with open(os.path.join(L, 'state', name), encoding='utf-8') as _cg1_file_4:
            Q = json.load(_cg1_file_4)
        return json.dumps(Q, ensure_ascii=False).encode('utf-8') if isinstance(Q, dict) and Q.get('items') else None
    except Exception: return None


def run(L, CODE, SITE, log, jload, jsave, iso, budget=BUDGET_S):
    """из live.lane_bots(): обмен с Диском → {state, up, down, err, t}. Без адреса веб-приложения Диска — ничего не делает."""
    t0 = time.time()
    try:
        G = _gd()
        if not G._url(): return {'state': 'нет адреса веб-приложения Диска (code/gdrive_1c.json)'}
    except Exception as e:
        return {'state': 'ошибка: нет gdrive_1c (%s)' % (str(e)[:100] or e.__class__.__name__)}
    st = jload(STATE_FILE, {}) or {}
    for k, d in (('sent', {}), ('from', {})):
        if not isinstance(st.get(k), dict): st[k] = d
    res = {'t': iso_now(), 'up': 0, 'down': 0, 'err': [], 'skipped': 0}
    try: res['up'] = _upload(L, SITE, st, res, t0 + budget * 0.6, log)
    except Exception as e: res['err'].append('→ Диск: %s %s' % (e.__class__.__name__, str(e)[:120]))
    try: res['down'] = _download(L, SITE, st, res, t0 + budget, log)
    except Exception as e: res['err'].append('← Диск: %s %s' % (e.__class__.__name__, str(e)[:120]))
    st['t'] = res['t']; jsave(STATE_FILE, st)
    res['state'] = 'ok' if not res['err'] else ('ошибка: ' + '; '.join(res['err'])[:300])
    res['err'] = '; '.join(res['err'])[:400] or None
    res['off'] = off(CODE)
    return res


def iso_now(): return _iso()


def _upload(L, SITE, st, res, deadline, log):
    """изменившиеся файлы → «Для ботов» (сначала по списку FILES, затем очереди robot_alerts/robot_mail)"""
    G = _gd(); n = 0; sent = st['sent']
    todo = []
    for name, kind in FILES:
        data = _read_src(L, SITE, name, kind)
        if data is None: continue
        h = _sha(data)
        if sent.get(name, {}).get('sha') == h: continue
        todo.append((name, data, h))
    for name, qf in (('robot_alerts.json', ALERTS_FILE), ('robot_mail.json', MAIL_FILE)):
        data = _queue_json(L, qf)
        if data is None: continue
        h = _sha(data)
        if sent.get(name, {}).get('sha') != h: todo.insert(0, (name, data, h))                # оповещения и письма — первыми
    for name, data, h in todo:
        if n >= MAX_PUTS or time.time() > deadline: res['skipped'] += 1; continue
        try: r = G.put_file(L, name, data, _mime(name), TO_BOTS)
        except Exception as e: r = {'ok': False, 'err': '%s %s' % (e.__class__.__name__, str(e)[:100])}
        if r.get('ok'):
            sent[name] = {'sha': h, 't': _iso(), 'id': r.get('id'), 'bytes': len(data)}; n += 1
            log('боты ← Диск «%s»: %s (%d байт)' % (TO_BOTS, name, len(data)))
        else:
            res['err'].append('%s: %s' % (name, str(r.get('err'))[:120]))
            if len(res['err']) >= 3: break                                                     # Диск не отвечает — остальное в следующий прогон
    return n


def _folder_id(L, st, name, parent_id=None):
    """id папки «Фабрика — портал/<name>» (или подпапки parent_id/<name>), запоминается в state"""
    G = _gd(); key = 'id:' + (parent_id or 'portal') + '/' + name
    if st.get(key): return st[key]
    ls = G.call(L, 'ls', {'id': parent_id, 'limit': 500} if parent_id else {'portal': True, 'limit': 500})
    for it in ls.get('items') or []:
        if it.get('dir') and it.get('name') == name:
            st[key] = it['id']; return it['id']
    return None


def _download(L, SITE, st, res, deadline, log):
    """из «От ботов»: ev.bin → st/, hb.json → state/gas_hb.json, mx_direct.json → state/, dr/*.json → drafts/in/ — только новые по дате файла"""
    G = _gd(); n = 0; seen = st['from']
    fid = _folder_id(L, st, FROM_BOTS)
    if not fid: return 0                                                                        # папки ещё нет — боты ничего не писали
    ls = G.call(L, 'ls', {'id': fid, 'limit': 200})
    items = ls.get('items') or []
    dr_id = None
    for it in items:
        if time.time() > deadline: res['skipped'] += 1; break
        name = str(it.get('name') or '')
        if it.get('dir'):
            if name == DR_DIR: dr_id = it['id']
            continue
        if name not in DOWN: continue
        if seen.get(name, {}).get('mod') == it.get('mod'): continue
        if (it.get('size') or 0) > MAX_BYTES: continue
        r = G.get_file(L, it['id'])
        if not r.get('ok'): res['err'].append('%s: %s' % (name, str(r.get('err'))[:100])); continue
        if _store(L, SITE, name, r['data'], log): seen[name] = {'mod': it.get('mod'), 't': _iso()}; n += 1
    if dr_id and time.time() < deadline:
        n += _drafts(L, st, dr_id, res, deadline, log)
    return n


def _store(L, SITE, name, data, log):
    try:
        if name == 'ev.bin':
            if not data.startswith(b'T14B1.'): return False                                     # обращения — только зашифрованные ключом владельца
            _atomic_write(os.path.join(SITE, 'st', 'ev.bin'), data); os.chmod(os.path.join(SITE, 'st', 'ev.bin'), 0o644)
        elif name == 'poruch.bin':                                                            # 13.11: «Поручения» — только зашифрованный файл
            if not data.startswith(b'T14B1.'): return False
            _atomic_write(os.path.join(SITE, 'st', 'poruch.bin'), data); os.chmod(os.path.join(SITE, 'st', 'poruch.bin'), 0o644)
        elif name == 'hb.json':
            j = json.loads(data.decode('utf-8'))
            if not isinstance(j, dict) or not isinstance(j.get('t'), (int, float)): return False
            rec = {k: j[k] for k in ('t', 'gas_t', 'v', 'lu', 'q', 'fe', 'crit', 'd_t', 'q_t') if k in j}
            rec['src'] = 'gdrive'
            _atomic_write(os.path.join(L, 'state', 'gas_hb.json'), json.dumps(rec, ensure_ascii=False))
        elif name == 'mx_direct.json':
            json.loads(data.decode('utf-8'))
            _atomic_write(os.path.join(L, 'state', 'mx_direct_from_bots.json'), data)
        else: return False
        log('боты → хостинг: %s (%d байт)' % (name, len(data)))
        return True
    except Exception as e:
        log('  ! боты → хостинг %s: %s %s' % (name, e.__class__.__name__, str(e)[:100])); return False


def _drafts(L, st, dr_id, res, deadline, log):
    """«От ботов»/dr/<id>.json → ~/.fabrika_live/drafts/in/<id>.json (формат st/dr.php: {id, text, send})"""
    G = _gd(); n = 0; seen = st['from']
    ls = G.call(L, 'ls', {'id': dr_id, 'limit': 100})
    for it in ls.get('items') or []:
        if time.time() > deadline: break
        name = str(it.get('name') or '')
        if it.get('dir') or not re.match(r'^[0-9a-f]{12}\.json$', name): continue
        if seen.get('dr/' + name, {}).get('mod') == it.get('mod'): continue
        r = G.get_file(L, it['id'])
        if not r.get('ok'): continue
        try:
            j = json.loads(r['data'].decode('utf-8'))
            if not isinstance(j, dict) or not j.get('text'): continue
            rec = {'id': name[:-5], 'text': str(j['text'])[:20000], 'got': int(time.time()), 'send': 1 if j.get('send') else 0}
            d = os.path.join(L, 'drafts', 'in'); os.makedirs(d, exist_ok=True)
            _atomic_write(os.path.join(d, name), json.dumps(rec, ensure_ascii=False)); os.chmod(os.path.join(d, name), 0o600)
            seen['dr/' + name] = {'mod': it.get('mod'), 't': _iso()}; n += 1
        except Exception as e: res['err'].append('dr/%s: %s' % (name, e.__class__.__name__))
    return n


# REDACTED_B64_37 флаг bots_off: оповещения и письма робота → очереди для ботов (Р4)
def queue_alert(L, subject, text, critical=False):
    """оповещение владельцу → state/bots_alerts.json (на Диск — следующим прогоном; бот Telegram пишет Т. В.). Повтор того же текста за час — не дублируется."""
    h = _sha(str(text).encode('utf-8'))[:16]                            # повтор — по тексту: alert() зовёт и mail_send, и max_send с одним текстом
    def fn(items):
        now = time.time()
        items = [x for x in items if now - float(x.get('ts') or 0) < 7 * 86400]
        if any(x.get('h') == h and now - float(x.get('ts') or 0) < 3600 for x in items): return items
        items.append({'id': 'ra-%d-%s' % (int(now), h[:8]), 't': _iso(now), 'ts': int(now), 'h': h, 'subj': str(subject or '')[:200], 'text': str(text or '')[:3000], 'crit': bool(critical)})
        return items[-ALERT_KEEP:]
    _queue_update(L, ALERTS_FILE, fn)
    return 'ok (Диск → бот Google)'


def queue_mail(L, subject, text, to, cc=None, att=None, html=None, reply_to=None):
    """письмо робота → state/bots_mail.json (на Диск — robot_mail.json; отправляет бот Telegram от 1c@, ответ — на itm@).
    Вложения — base64, всего ≤ MAX_ATT; больше — в письме отметка. to/cc — списки адресов."""
    atts, skipped, total = [], [], 0
    for a in att or []:
        try:
            name, data = a[0], a[1]                                         # как mail_q.enqueue: [(имя, bytes, mime)]
            mime = a[2] if len(a) > 2 and a[2] else 'application/octet-stream'
            if isinstance(data, str): data = data.encode('utf-8')
            if total + len(data) > MAX_ATT: skipped.append(str(name)); continue
            total += len(data); atts.append({'name': str(name)[:120], 'mime': str(mime)[:80], 'b64': base64.b64encode(data).decode('ascii')})
        except Exception: skipped.append('?')
    body = str(text or '')
    if skipped: body += '\n\n(вложения не переданы боту — слишком большие: %s)' % ', '.join(skipped)[:300]
    now = time.time()
    rec = {'id': 'rm-%d-%s' % (int(now), _sha((str(subject) + body + ','.join(to or [])).encode('utf-8'))[:8]), 't': _iso(now), 'ts': int(now),
           'subject': str(subject or '')[:200], 'text': body[:20000], 'to': list(to or []), 'cc': list(cc or []), 'reply_to': reply_to or 'user5@example.org'}
    if html: rec['html'] = str(html)[:40000]
    if atts: rec['att'] = atts
    def fn(items):
        items = [x for x in items if now - float(x.get('ts') or 0) < MAIL_TTL]
        items.append(rec); return items[-MAIL_KEEP:]
    _queue_update(L, MAIL_FILE, fn)
    return 'ok (очередь → Диск → бот Google)'


def install(live, L, CODE):
    """вызывается из live.py при загрузке модуля (строка перед LANES): при флаге bots_off max_send/mail_send робота не шлют сами —
    оповещения и письма уходят ботам через Диск. Без флага ничего не меняется. → True, если подменено."""
    if not off(CODE): return False
    alert_to = [str(x).lower() for x in (getattr(live, 'CFG', {}) or {}).get('alert_to') or ['user5@example.org']]
    def max_send(text):
        return queue_alert(L, str(text).split('\n')[0][:150], text)
    def mail_send(subject, text, to=None, cc=None, att=None, html=None, reply_to=None):
        rcpt = [str(x).lower() for x in (to or alert_to)]
        if not to or sorted(rcpt) == sorted(alert_to): return queue_alert(L, subject, text, critical=False)   # оповещение владельцу — в Telegram через бота
        return queue_mail(L, subject, text, list(to), cc, att, html, reply_to)
    live.max_send, live.mail_send = max_send, mail_send
    return True
