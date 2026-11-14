# «Фабрика», 14.11.2026 — тестовый стенд лёгкой версии для Telegram (ci/test_lite_tg.js): копия нужных файлов сайта, зашифрованная ТЕСТОВЫМ ключом из тестового пароля (настоящие ключи не трогаются).
import hashlib, json, os, pathlib, secrets, subprocess, sys
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
OUT = sys.argv[1]; PW = 'test-lite-1411'; SALT = secrets.token_hex(16); ITER = 1000
raw = hashlib.pbkdf2_hmac('sha256', PW.encode(), bytes.fromhex(SALT), ITER, 32); aes = AESGCM(raw)
os.makedirs(OUT + '/b', exist_ok=True); os.makedirs(OUT + '/st', exist_ok=True)
files = {}
for rel in ['assets/portal.css', 'assets/glass.css', 'assets/skin_v22.css', 'assets/pulse_data.js', 'assets/metrics.js', 'assets/live.js', 'assets/pulse.js']:
    data = pathlib.Path('/home/claude/site/' + rel).read_bytes(); iv = secrets.token_bytes(12); blob = iv + aes.encrypt(iv, data, None)
    name = hashlib.sha256(blob).hexdigest()[:24] + '.bin'; pathlib.Path(OUT + '/b/' + name).write_bytes(blob); files[rel] = [name, 'text/plain', len(data)]
iv = secrets.token_bytes(12); m = json.dumps({'v': 'test', 'files': files, 'pre': [], 'docs': []}).encode()
pathlib.Path(OUT + '/m.bin').write_bytes(iv + aes.encrypt(iv, m, None))
login = pathlib.Path('/home/claude/app_build/enc/login.html').read_text(encoding='utf-8').replace('__SALT__', SALT).replace('__ITER__', str(ITER))
login = login.replace('__ACCT_CFG__', 'null').replace('/*__ACCT_CORE__*/', pathlib.Path('/home/claude/build/acct/acct_core.js').read_text(encoding='utf-8'))
pathlib.Path(OUT + '/index.html').write_text(login, encoding='utf-8')
for b in ['pf', 'sales', 'leads', 'omts', 'recl', 'ozrev', 'oz', 'promises', 'ls', 'smv', 'smvs']:   # данные — как они лежат на хостинге (зашифрованы)
    # 14.11.2026: туннель прокси контейнера иногда рвётся (ws_closed_mid_exchange) — до 3 попыток, иначе «—» в пульсе и ложный запрет выкладки
    for _t in range(3):
        _r = subprocess.run(['curl', '-sS', '-f', '-m', '60', '--retry', '2', '--cacert', '/root/.ccr/ca-bundle.crt', '-o', OUT + '/st/' + b + '.bin', 'https://techfabrikant.ru/st/' + b + '.bin'])
        if _r.returncode == 0 or _r.returncode == 22: break   # 22 — файла нет на хостинге (404), повтор не поможет
        import time; time.sleep(15)
print('ok', len(files))
