# «Фабрика» — FTP сайта fabrikant.su → портал (19.11.2026, Т. В.: «по FTP лежит сайт — отобразить на портале отдельным разделом;
#   через этот же FTP будет идти обмен с отчётами — наладь связь»; опрос: «Робот хостинга»).
# Доступ: файл ~/.fabrika_live/ftp.json {"host": "...", "user": "...", "pass": "..."} — создаёт Т. В. или сисадмин (панель хостинга,
#   «Менеджер файлов»), права 600. Claude пароль не вводит и не хранит; в код и на портал пароль не попадает.
# Что делает раз в FTP_EVERY минут:
#   1) обход дерева (глубина до DEPTH, до MAX_ENTRIES записей) → st/ftp_idx.bin: папки, файлы, размер, дата;
#   2) картинки и документы до FILE_MAX байт — зашифрованными файлами st/f/<id>.bin (publish_file), не больше PER_RUN за прогон,
#      всего не больше TOTAL_MAX байт — для просмотра на портале;
#   3) папка отчётов (REPORT_DIRS) — файлы .xlsx/.xls/.pdf/.csv кладутся в arch/ftp/ для разборщиков робота.
import os, json, ftplib, hashlib, datetime, re, io

FTP_EVERY = 60
DEPTH = 8                                                       # 20.11.2026: в каталоге FTP вложенность до 7 уровней
MAX_ENTRIES = 20000
FILE_MAX = 3 * 1024 * 1024
PER_RUN = 300                                                   # 20.11.2026: пока есть очередь — обход каждые 10 мин (BACKLOG), иначе раз в FTP_EVERY
TOTAL_MAX = 2000 * 1024 * 1024                                  # 20.11.2026: весь сайт с FTP (картинки до 3 МБ ≈ 1 ГБ); на хостинге свободно > 40 ГБ
PREVIEW = ('.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.pdf')
REPORT_EXT = ('.xlsx', '.xls', '.pdf', '.csv', '.xml', '.json', '.txt', '.docx')
REM_TO, REM_CC, REM_MAX = ['user33@example.org'], ['user2@example.org', 'user5@example.org'], 3
STORE_DIRS = re.compile(r'^/stores/[^/]+\.xlsx$', re.I)               # 20.11.2026, Т. В.: раздел «Сайт» — магазины по городам (таблицы xlsx)
THUMB_MIN, THUMB_PX = 350 * 1024, 1000                         # 20.11.2026: картинки тяжелее 350 КБ — превью до 1000 px (оригинал остаётся на FTP)
BIG_MAX = 30 * 1024 * 1024                                     # главная картинка товара/проекта крупнее 3 МБ — скачать и уменьшить
MAIN_RE = re.compile(r'/(main|cover)[^/]*$', re.I)
REPORT_DIRS = re.compile(r'(^|/)(reports?|otchet\w*|отч[её]т\w*|exchange|obmen|обмен)(/|$)', re.I)


def _cfg(L):
    p = os.path.join(L, 'ftp.json')
    if not os.path.exists(p): p = os.path.join(os.path.dirname(L), 'ftp.json')   # 19.11.2026: .fabrika_live в менеджере файлов скрыта — можно и в домашнюю папку (рядом с www, вне сайта)
    if not os.path.exists(p): return None
    try: os.chmod(p, 0o600)                                   # 20.11.2026: в ISPmanager права не выставить — робот ставит 600 сам
    except Exception: pass
    try:
        with open(p, encoding='utf-8') as f: c = json.load(f)
        return c if c.get('host') and c.get('user') and c.get('pass') else None
    except Exception: return None


def _fid(path, size, mt):
    return hashlib.sha256(('ftp:%s:%s:%s' % (path, size, mt)).encode('utf-8')).hexdigest()[:24]


def _walk(F, root, depth, out):
    if depth > DEPTH or len(out) >= MAX_ENTRIES: return
    try: items = list(F.mlsd(root, facts=['type', 'size', 'modify']))
    except ftplib.error_perm:
        items = []
        for n in F.nlst(root):
            nm = n.rsplit('/', 1)[-1]
            if nm in ('.', '..'): continue
            try: F.cwd(n); F.cwd('/'); items.append((nm, {'type': 'dir'}))
            except Exception:
                try: sz = F.size(n)
                except Exception: sz = 0
                items.append((nm, {'type': 'file', 'size': sz, 'modify': ''}))
    for nm, fa in items:
        if nm in ('.', '..') or fa.get('type') in ('cdir', 'pdir'): continue
        p = (root.rstrip('/') + '/' + nm) if root != '/' else '/' + nm
        if fa.get('type') == 'dir':
            out.append({'p': p, 'd': 1}); _walk(F, p, depth + 1, out)
        else:
            out.append({'p': p, 's': int(fa.get('size') or 0), 'm': (fa.get('modify') or '')[:14]})
        if len(out) >= MAX_ENTRIES: return


def _remind(st, jsave, now, mail_send):
    # 19.11.2026, Т. В. «надо автоматизировать роботом»: пока ftp.json нет — робот сам раз в рабочий день (после 10:00) мягко напоминает сисадмину,
    #   всего не больше REM_MAX раз; пароль в письме не пишется — его вносит человек на хостинге
    today = now.strftime('%Y-%m-%d')
    if not mail_send or now.weekday() >= 5 or now.strftime('%H:%M') < '10:00' or st.get('rem_day') == today or int(st.get('rem_n') or 0) >= REM_MAX: return None
    txt = ('Сотрудник5, добрый день!\n\nДля связи портала «Фабрика» с сайтом fabrikant.su по FTP роботу на хостинге techfabrikant.ru нужен файл доступа. '
           'Пожалуйста, в панели хостинга (ISPmanager → «Менеджер файлов») в домашней папке, рядом с папкой www, создайте файл ftp.json с текстом:\n\n'
           '{"host": "<адрес FTP>", "user": "<логин FTP>", "pass": "<пароль FTP>"}\n\n'
           'Пароль FTP лучше перед этим сменить. В письма и чаты его не пишите — только в этот файл. Робот проверит связь сам в течение часа.\n\n'
           'Спасибо!\nПортал «Фабрика» (по поручению Т. В. Сотрудник1)')
    r = mail_send('FTP сайта fabrikant.su: нужен файл доступа ftp.json для портала', txt, REM_TO, REM_CC)
    if str(r).startswith('ok'): st['rem_day'] = today; st['rem_n'] = int(st.get('rem_n') or 0) + 1; jsave('ftp_state.json', st)
    return str(r)[:60]


def _group(p):
    a = p.split('/')
    if len(a) > 3 and a[1] == 'catalog': return '/'.join(a[:4])
    if len(a) > 2 and a[1] == 'projects': return '/'.join(a[:3])
    return p


def _order(items):
    """20.11.2026: сначала по одной главной картинке на товар/предложение/проект (main_*, иначе первая по имени), затем остальное"""
    first = {}
    for it in items:
        if it.get('d') or os.path.splitext(it['p'])[1].lower() not in PREVIEW: continue
        g = _group(it['p']); cur = first.get(g)
        key = (0 if MAIN_RE.search(it['p']) else 1, it['p'])
        if cur is None or key < cur[0]: first[g] = (key, it['p'])
    lead = set(v[1] for v in first.values())
    return sorted([i for i in items if not i.get('d')], key=lambda i: (0 if i['p'] in lead else 1, i['p'])), lead


def _thumb(raw, ext):
    """превью для портала, если на хостинге есть Pillow; иначе — оригинал"""
    if len(raw) < THUMB_MIN or ext not in ('.jpg', '.jpeg', '.png', '.webp'): return raw
    try:
        from PIL import Image
        im = Image.open(io.BytesIO(raw)); im.thumbnail((THUMB_PX, THUMB_PX))
        out = io.BytesIO()
        if im.mode in ('RGBA', 'LA', 'P'):
            im = im.convert('RGBA'); im.save(out, 'PNG', optimize=True)
        else:
            im.convert('RGB').save(out, 'JPEG', quality=82, optimize=True)
        b = out.getvalue()
        return b if len(b) < len(raw) else raw
    except Exception:
        return raw


def _store_rows(raw):
    """таблица магазинов города → {'h': заголовок, 'rows': [...]} (не больше 500 строк, ячейки до 200 знаков)"""
    try: import safe_doc as SAFE
    except ImportError: SAFE = None
    if SAFE is not None:
        try: SAFE.check_ooxml(raw, 'книга')
        except Exception as e: return {'err': 'файл не прошёл проверку: %s' % str(e)[:80]}
    rows = []
    try:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        for r in wb.worksheets[0].iter_rows(values_only=True):
            v = ['' if c is None else str(c).strip()[:200] for c in r]
            while v and not v[-1]: v.pop()
            if any(v): rows.append(v)
            if len(rows) > 501: break
    except Exception:
        rows = _xlsx_rows(raw)          # 20.11.2026: книги без sharedStrings.xml (строки inline) — старый openpyxl хостинга их не открывает
    return {'h': rows[0] if rows else [], 'rows': rows[1:501], 'n': max(0, len(rows) - 1)}


def _xlsx_rows(raw):
    import zipfile, xml.etree.ElementTree as ET
    ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
    z = zipfile.ZipFile(io.BytesIO(raw)); names = z.namelist(); ss = []
    if 'xl/sharedStrings.xml' in names:
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')).iter(ns + 'si'): ss.append(''.join(t.text or '' for t in si.iter(ns + 't')))
    sh = sorted(n for n in names if re.match(r'xl/worksheets/sheet\d+\.xml$', n))
    if not sh: return []
    def col(ref):
        n = 0
        for ch in re.match(r'[A-Z]+', ref).group(0): n = n * 26 + ord(ch) - 64
        return n - 1
    out = []
    for r in ET.fromstring(z.read(sh[0])).iter(ns + 'row'):
        v = []
        for c in r.iter(ns + 'c'):
            t = c.get('t'); i = col(c.get('r') or 'A1')
            if t == 'inlineStr': x = ''.join(e.text or '' for e in c.iter(ns + 't'))
            else:
                e = c.find(ns + 'v'); x = e.text if e is not None else ''
                if t == 's' and x != '': x = ss[int(x)] if int(x) < len(ss) else ''
            while len(v) < i: v.append('')
            v.append(str(x or '').strip()[:200])
        while v and not v[-1]: v.pop()
        if any(v): out.append(v)
        if len(out) > 501: break
    return out


def run(L, log, jload, jsave, publish, publish_file, now, mail_send=None):
    c = _cfg(L)
    st = jload('ftp_state.json', {}) or {}
    if not c:
        r = _remind(st, jsave, now, mail_send)
        return {'state': 'нет доступа: файл ftp.json не создан', 'rem': r or st.get('rem_day'), 'rem_n': st.get('rem_n')}
    t = now.strftime('%Y-%m-%dT%H:%M')
    last = st.get('t') or ''
    try:
        gap = (FTP_EVERY if not st.get('backlog') else 9) * 60
        if last and (now - datetime.datetime.strptime(last, '%Y-%m-%dT%H:%M')).total_seconds() < gap: return {'state': 'ждём', 't': last, 'backlog': st.get('backlog')}
    except Exception: pass
    pubs = st.get('pub') or {}; total = int(st.get('bytes') or 0); n_new = 0; rep = 0
    try:
        F = ftplib.FTP(c['host'], timeout=40); F.login(c['user'], c['pass']); F.set_pasv(True)
        try: F.encoding = 'utf-8'
        except Exception: pass
        items = []; _walk(F, c.get('root') or '/', 0, items)
        rdir = os.path.join(L, 'arch', 'ftp'); os.makedirs(rdir, exist_ok=True)
        order, lead = _order(items); stores = st.get('stores') or {}; sto_new = 0
        for it in order:
            ext = os.path.splitext(it['p'])[1].lower()
            if STORE_DIRS.search(it['p']):
                sf = _fid(it['p'], it['s'], it['m'])
                if ((stores.get(it['p']) or {}).get('fid') != sf or (stores.get(it['p']) or {}).get('err')) and it['s'] <= BIG_MAX:
                    bio = io.BytesIO()
                    try:
                        F.retrbinary('RETR ' + it['p'], bio.write); rec = _store_rows(bio.getvalue())
                    except Exception as e: rec = {'err': '%s: %s' % (e.__class__.__name__, str(e)[:80])}
                    rec['fid'] = sf; rec['m'] = it['m']; stores[it['p']] = rec; sto_new += 1
                continue
            fid = _fid(it['p'], it['s'], it['m']); it['id'] = fid
            want_rep = bool(REPORT_DIRS.search(it['p'])) and ext in REPORT_EXT
            want_pub = ext in PREVIEW and (it['s'] <= FILE_MAX or (it['p'] in lead and it['s'] <= BIG_MAX))
            if fid in pubs or not (want_rep or want_pub): continue
            if n_new >= PER_RUN or total + it['s'] > TOTAL_MAX: continue
            bio = io.BytesIO()
            try: F.retrbinary('RETR ' + it['p'], bio.write)
            except Exception as e: log('  FTP: не скачан', it['p'][-80:], str(e)[:60]); continue
            raw = bio.getvalue()
            if want_rep:
                with open(os.path.join(rdir, fid + ext), 'wb') as f: f.write(raw)
                rep += 1
            if want_pub:
                raw = _thumb(raw, ext)
                if len(raw) > FILE_MAX: log('  FTP: крупная картинка без превью', it['p'][-60:]); continue
                if publish_file(fid, raw): pubs[fid] = it['p']; total += len(raw); n_new += 1
        try: F.quit()
        except Exception: pass
    except Exception as e:
        st['err'] = '%s: %s' % (e.__class__.__name__, str(e)[:120]); st['t'] = t; jsave('ftp_state.json', st)
        return {'state': 'ошибка FTP', 'err': st['err']}
    for it in items:
        if it.get('id') not in pubs: it.pop('id', None)
    for it in items:
        if it['p'] in lead: it['lead'] = 1
    publish('ftp_idx.bin', {'v': 1, 't': t, 'host': 'fabrikant.su (FTP)', 'n': len(items), 'items': items, 'bytes': total})
    if stores and (sto_new or not st.get('stores_pub')):
        publish('ftp_stores.bin', {'v': 1, 't': t, 'stores': {k: {x: v[x] for x in ('h', 'rows', 'n', 'err', 'm') if x in v} for k, v in stores.items()}})
    st['stores'] = stores; st['stores_pub'] = st.get('stores_pub') or bool(stores)
    left = sum(1 for i in items if not i.get('d') and os.path.splitext(i['p'])[1].lower() in PREVIEW and i.get('id') not in pubs and (i['s'] <= FILE_MAX))
    st.update({'t': t, 'pub': pubs, 'bytes': total, 'n': len(items), 'err': None, 'backlog': left})
    jsave('ftp_state.json', st)
    return {'state': 'ok', 'n': len(items), 'new': n_new, 'left': left, 'reports': rep, 'mb': round(total / 1048576, 1), 'stores': len(stores)}
