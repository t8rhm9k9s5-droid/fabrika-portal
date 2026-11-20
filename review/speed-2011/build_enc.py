# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""Encrypted build of the web app for a public static host (GitHub Pages).
   python3 build_enc.py [--base /t14/] [--out DIR]
   Input: the PWA build (pwa/terekhina14, made by build_pwa.py). Output: DIR with
     index.html, login.html, 404.html — the public sign-in page (no site data in it);
     sw.js — service worker that decrypts on the device; manifest.webmanifest, icons/ — public;
     m.bin — encrypted map (path -> blob, type) and the lists of files to save on the device; b/*.bin — encrypted files.
   Crypto: key = PBKDF2-SHA256(password, salt, ITER) -> AES-256-GCM; each blob = iv(12) || ciphertext+tag.
   The iv of a file is derived from its path and content, so unchanged files keep the same blob name between versions.
   The password and salt live in enc_secret.json (never published)."""
import os, re, sys, json, hmac, hashlib, secrets, shutil, time, mimetypes
import pathlib   # 14.11.2026: чтение/запись файлов с закрытием (CodeQL py/file-not-closed)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
B = '/home/claude/app_build'
STAND = bool(os.environ.get('T14_ENC_SRC'))   # стенд: рабочие файлы сборки (enc_map, release_state, news) не трогаем
SRC = os.environ.get('T14_ENC_SRC') or f'{B}/pwa/terekhina14'   # 15.11.2026: стенд доступа по группам собирает из своей малой копии
ENC = os.environ.get('T14_ENC_TPL') or f'{B}/enc'   # 20.11.2026 (Рекс, CG-50): шаблоны Service Worker'а и входа — из проверяемой папки, а не всегда из app_build/enc
SECRET = os.environ.get('T14_ENC_SECRET') or f'{B}/enc_secret.json'
ITER = 250000
args = sys.argv[1:]
BASE = args[args.index('--base') + 1] if '--base' in args else '/t14/'
OUT = args[args.index('--out') + 1] if '--out' in args else f'{B}/enc_out'

sys.path.insert(0, B); import acct as ACCT
if os.path.exists(SECRET): S = json.loads(pathlib.Path(SECRET).read_text())
else:
    abc = 'abcdefghjkmnpqrstuvwxyz23456789'
    S = {'password': 't14-' + '-'.join(''.join(secrets.choice(abc) for _ in range(4)) for _ in range(3)), 'salt': secrets.token_hex(16), 'iter': ITER}
    ACCT.save_enc_secret(S, SECRET)
# personal logins (22.10.2026): the site key stays the shared-password key while the shared password is on;
# after an admin turns it off (or turns someone off), a fresh keyring answer makes a new random key — see acct.py
ACCT_ON = bool(os.environ.get('T14_ACCT_URL') or os.path.exists('/home/claude/push/acct_live'))
if not ACCT_ON and S.get('master_hex'): sys.exit('STOP: общий пароль выключен, а личные входы выключены — сайт никто не откроет')
KR = ACCT.load_keyring() if ACCT_ON else None
master, why = ACCT.plan_master(S, KR)
# the shared password is off: only personal keys open the site — they must be there before the old build is touched
if ACCT_ON and S.get('master_hex') and not ACCT.openable(KR): sys.exit('STOP: общий пароль выключен, а keyring пуст или ключи не открываются — сайт никто не откроет; сборку не трогаю')
if why != 'same key': ACCT.save_enc_secret(S, SECRET)
if KR and not KR.get('shared', True) and KR['_age'] >= ACCT.KEYRING_FRESH: print('ВНИМАНИЕ: keyring старше 3 ч — отключения не применены, новые люди без k/*.bin')
print('site key:', why, '| keyring:', 'none' if KR is None else '%d people, rev %s, shared %s, %.0f min old' % (len(KR.get('users', [])), KR.get('rev'), KR.get('shared'), KR['_age'] / 60))
ivkey = hmac.new(master, b'iv-derivation', hashlib.sha256).digest()
aes = AESGCM(master)
# 15.11.2026: доступ по группам (access.py, build/access_map.json) — страницы групп шифруются ключом набора групп, а не ключом сайта
import access as ACC
AMAP = ACC.load_map(); ACC_ON = ACC.is_on(AMAP)
if ACC_ON and ACC.ensure_secret(S): ACCT.save_enc_secret(S, SECRET)
SETK = {}
def set_aes(sid):
    if sid not in SETK:
        k = ACC.set_key(S, sid); SETK[sid] = (AESGCM(k), hmac.new(k, b'iv-derivation', hashlib.sha256).digest())
    return SETK[sid]
print('access by groups:', 'ON' if ACC_ON else 'off')

MIME = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
        '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.kml': 'application/vnd.google-earth.kml+xml', '.geojson': 'application/geo+json'}
def mime(p): return MIME.get(os.path.splitext(p)[1].lower()) or mimetypes.guess_type(p)[0] or 'application/octet-stream'

sw0 = pathlib.Path(f'{SRC}/sw.js').read_text(encoding='utf-8')
PRE = json.loads(re.search(r'const PRECACHE = (\[.*?\]);', sw0, re.S).group(1))
DOCS = list(json.loads(re.search(r'const DOC_H = (\{.*?\});', sw0, re.S).group(1)))   # pwa_sw.js: document path -> content hash
PUBLIC_DIRS = ('icons/',)
SKIP = {'sw.js', 'README.txt', 'manifest.webmanifest'}

# keep OUT/.git between publishes: the push then sends only the changed blobs (a new key changes every blob — history starts anew)
if os.path.exists(OUT):
    for n in os.listdir(OUT):
        if n != '.git': p = os.path.join(OUT, n); shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    gsz = sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(f'{OUT}/.git') for f in fs) if os.path.isdir(f'{OUT}/.git') else 0
    if why != 'same key' or gsz > 600e6: shutil.rmtree(f'{OUT}/.git', ignore_errors=True)   # Pages repo stays well under 1 GB
os.makedirs(f'{OUT}/b')
files = {}
# 20.11.2026, Т. В. «на 1–2 Мбит/с должно летать»: текст (html, js, css, json, svg…) сжимается ПЕРЕД шифрованием — зашифрованное уже не сжать,
#   хостинг отдавал такие файлы целиком. Формат: MAGIC (4 байта, первый — NUL, его нет в начале текста) + zlib (deflate с заголовком и контрольной суммой).
import zlib
ZTYPES = ('.html', '.htm', '.js', '.mjs', '.css', '.json', '.svg', '.txt', '.xml', '.geojson', '.kml', '.csv', '.md')
ZMAGIC = b'\x00Z1\x00'
# Шаг 2 выкладки (Рекс, CG-50): включается только FABRIKA_ZPACK=1 — когда у всех уже стоит Service Worker, умеющий распаковку (шаг 1).
ZON = os.environ.get('FABRIKA_ZPACK') == '1'
def zpack(rel, data):
    if not ZON or len(data) < 1024 or not rel.lower().endswith(ZTYPES) or data[:4] == ZMAGIC: return data
    z = ZMAGIC + zlib.compress(data, 9)
    return z if len(z) < len(data) * 0.9 else data
for root, _, names in os.walk(SRC):
    for n in names:
        rel = os.path.relpath(os.path.join(root, n), SRC).replace(os.sep, '/')
        if rel in SKIP or rel.startswith(PUBLIC_DIRS): continue
        data = pathlib.Path(os.path.join(root, n)).read_bytes()
        sid = ACC.set_of(rel, AMAP) if ACC_ON else None
        fa, fiv = set_aes(sid) if sid else (aes, ivkey)
        pdat = zpack(rel, data)   # 20.11.2026 (ревью GPT): IV — от того, что реально шифруется
        iv = hmac.new(fiv, rel.encode() + b'\0' + hashlib.sha256(pdat).digest(), hashlib.sha256).digest()[:12]
        blob = iv + fa.encrypt(iv, pdat, None)
        name = hashlib.sha256(blob).hexdigest()[:24] + '.bin'
        pathlib.Path(f'{OUT}/b/{name}').write_bytes(blob)
        files[rel] = [name, mime(rel), len(data)] + ([sid] if sid else [])
pre = [p for p in PRE if p in files]
# 13.11.2026, Т. В.: «раз в сутки проверка целостности портала и всех документов по реестру» — карта путь → блок для реестра (docs_registry.py; наружу не уходит)
if not STAND:
    with open('/home/claude/app_build/enc_map.json', 'w', encoding='utf-8') as _em: json.dump(files, _em, ensure_ascii=False)
docs = [p for p in DOCS if p in files]
_H8 = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()[:8]
# 28.10.2026: уведомления всем — только «крупный выпуск» (решает build_pwa.py → release_state.json → last.public). Скрипт уведомлений шлёт пуш всем,
#   когда меняется хвост VERSION (после «-»), поэтому для обычной сборки хвост остаётся прежним (enc_pub), а метка времени меняется — sw.js обновляется тихо.
# 16.11.2026 (R5-05 Рекса): тот же порядок, что в build_pwa — блокировка, копия .bak, атомарная запись, повреждённый файл не превращается в «{}»
import fcntl as _fcntl, shutil as _sh
_RSP = '/home/claude/app_build/release_state.json'
_rs_lock = open(_RSP + '.lock', 'w'); _fcntl.flock(_rs_lock, _fcntl.LOCK_EX)
_RS = None
for _p in (_RSP, _RSP + '.bak'):
    if os.path.exists(_p):
        try: _RS = json.loads(pathlib.Path(_p).read_text(encoding='utf-8')); break
        except Exception: continue
if _RS is None:
    if os.path.exists(_RSP): sys.exit('release_state.json повреждён (и .bak) — сборку не продолжаю')
    _RS = {}
# 28.10.2026 20:05: хвост меняется ОДИН раз на крупный выпуск (метка enc_for = last.t). Раньше каждая следующая сборка build_host после крупного
#   выпуска давала новый хвост → пуш всем повторялся (28.10: 18:30 и 19:50, с устаревшим текстом news.txt от 26.10).
_last = _RS.get('last') or {}
if not STAND and (not _RS.get('enc_pub') or (_last.get('public') and _RS.get('enc_for') != _last.get('t'))):
    _RS['enc_pub'] = _H8; _RS['enc_for'] = _last.get('t')
    if os.path.exists(_RSP): _sh.copy2(_RSP, _RSP + '.bak')
    pathlib.Path(_RSP + '.tmp').write_text(json.dumps(_RS, ensure_ascii=False, indent=1), encoding='utf-8'); os.replace(_RSP + '.tmp', _RSP)
VERSION = time.strftime('%Y%m%d%H%M%S') + '-' + (_RS.get('enc_pub') or 'stand')
NEWS = f'{B}/news.txt'                    # «что нового» for the push notification text (private: lives only inside m.bin)
news = pathlib.Path(NEWS).read_text(encoding='utf-8').strip()[:300] if os.path.exists(NEWS) else ''
# 28.10.2026: news.txt больше не обновлялся (auto_news.py жил в старой публикации GitHub) — в пуше висел текст от 26.10. Теперь текст пуша —
#   то, что вошло в портал за сегодня (журнал версий assets/version.js), а склад и выпуск обновляются с хостинга без пушей.
try:
    _vj = pathlib.Path('/home/claude/site/assets/version.js').read_text(encoding='utf-8'); _vj = json.loads(_vj[_vj.index('{'):_vj.rindex('}') + 1])
    _today = time.strftime('%d.%m.%Y', time.gmtime(time.time() + 3 * 3600))
    _its = [i for e in _vj.get('log', []) if e.get('date') == _today for i in e.get('items', [])]
    if _its and not STAND:
        news = ('Что нового на портале\n' + '; '.join(re.sub(r'\s*\(\d+\)$', '', i) for i in _its[:4]))[:300]
        pathlib.Path(NEWS).write_text(news + '\n', encoding='utf-8')
except Exception as _e: print('news:', _e)
m = json.dumps({'v': VERSION, 'files': files, 'pre': pre, 'docs': docs, 'news': news}, ensure_ascii=False).encode()
iv = secrets.token_bytes(12)
pathlib.Path(f'{OUT}/m.bin').write_bytes(iv + aes.encrypt(iv, zpack('m.json', m), None))

# public part
login = pathlib.Path(f'{ENC}/login.html').read_text(encoding='utf-8').replace('__SALT__', S['salt']).replace('__ITER__', str(S['iter']))
# personal logins: switched on once the script has the accounts part (touch /home/claude/push/acct_live)
ACFG = None
if ACCT_ON:
    ACFG = {'url': os.environ.get('T14_ACCT_URL') or json.loads(pathlib.Path('/home/claude/push/push_config.json').read_text())['url'], 'pub': ACCT.keys()['pub'], 'salt': S['salt'], 'iter': S['iter'], 'shared': not S.get('master_hex')}
login = login.replace('__ACCT_CFG__', json.dumps(ACFG)).replace('/*__ACCT_CORE__*/', pathlib.Path('/home/claude/build/acct/acct_core.js').read_text(encoding='utf-8'))
_core = pathlib.Path('/home/claude/build/acct/acct_core.js').read_text(encoding='utf-8')   # 12.11 CodeQL: проверка не внутри assert (python -O её выкидывает)
if '__ACCT' in login or '</script' in _core.lower(): raise SystemExit('build_enc: в странице входа остался __ACCT или </script в acct_core.js')
_SETS = sorted({f[3] for f in files.values() if len(f) > 3}); _PG = ACC.people_groups(KR) if ACC_ON else {}
nk = ACCT.write_keyring(OUT, master, KR, (lambda uid: ACC.payload(master, _PG.get(uid), _SETS, S, AMAP)) if ACC_ON else None) if ACFG else 0
if ACC_ON: print('group sets:', _SETS, '| people with groups:', len(_PG))
print('personal keys k/*.bin:', nk)
login = login.replace('<head>\n', f'<head>\n<base href="{BASE}">\n', 1)
for n in ('index.html', 'login.html', '404.html'): pathlib.Path(f'{OUT}/{n}').write_text(login, encoding='utf-8')
pathlib.Path(f'{OUT}/sw.js').write_text(pathlib.Path(f'{ENC}/enc_sw.js').read_text(encoding='utf-8').replace('__VERSION__', VERSION), encoding='utf-8')
shutil.copy(f'{SRC}/manifest.webmanifest', f'{OUT}/manifest.webmanifest')
shutil.copytree(f'{SRC}/icons', f'{OUT}/icons')
pathlib.Path(f'{OUT}/.nojekyll').write_text('')
shutil.copy(f'{ENC}/applink.js', f'{OUT}/applink.js')   # 24–25.10.2026: «Приложение для Android» в меню + окно «как приложение» (sw.js вставляет его в страницы)
APK = f'{B}/apk/fabrika.apk'             # 4.0 (24.10.2026): открывает https://techfabrikant.ru/?app=apk; собран вне этого контейнера, хранится как есть
if not os.path.exists(APK): APK = f'{B}/out/Terekhina14.apk'          # the online shell (build_app.py online): no site data inside, safe to publish
if os.path.exists(APK) and os.path.getsize(APK) < 8e6: shutil.copy(APK, f'{OUT}/fabrika.apk')   # the link on the sign-in page saves it as «Фабрика.apk»
pathlib.Path(f'{OUT}/robots.txt').write_text('User-agent: *\nDisallow: /\n')
pathlib.Path(f'{OUT}/README.md').write_text('# Фабрика\n\nЗашифрованная сборка веб-приложения (AES-256-GCM). Открывается по паролю: ' + (f'https://owner.github.io{BASE}' if BASE != '/' else 'https://techfabrikant.ru/') + '\n', encoding='utf-8')
tot = sum(v[2] for v in files.values())
print('files', len(files), 'pre', len(pre), 'docs', len(docs), f'{tot / 1e6:.1f} MB', 'version', VERSION, 'base', BASE, '->', OUT)
