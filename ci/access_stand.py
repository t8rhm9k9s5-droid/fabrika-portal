"""Стенд «доступ к порталу по группам» (15.11.2026; tasks/access_launch.md, этап 6).
   python3 access_stand.py <каталог>  → <каталог>/out — зашифрованная малая копия портала (ТЕСТОВЫЙ пароль и ключи групп),
   <каталог>/users.json — тестовые люди: id, личный ключ K (hex), группы. Дальше: node test_access_groups.js <каталог>.
   Только здесь, в рабочей копии: личные ключи запечатаны открытым ключом Claude (acct_secret.json), как на портале."""
import os, sys, json, time, shutil, secrets, subprocess, pathlib
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

A = '/home/claude/app_build'
sys.path.insert(0, A)
import acct as ACCT  # noqa: E402
PAGES = ['home.html', 'calls.html', 'sales.html', 'staff.html', 'stock.html', 'transport.html', 'plan.html']
PEOPLE = {'sales': ['sales'], 'prod': ['prod'], 'auto': ['auto'], 'admin': ['admin'], 'none': []}


def seal(K, pub_b64):
    pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), ACCT.unb64(pub_b64))
    e = ec.generate_private_key(ec.SECP256R1()); eph = e.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=eph, info=b'fabrika-seal').derive(e.exchange(ec.ECDH(), pub))
    iv = secrets.token_bytes(12)
    return ACCT.b64u(eph + iv + AESGCM(key).encrypt(iv, K, None))


def main(d):
    d = pathlib.Path(d)
    if os.environ.get('T14_STAND_KEEP') and (d / 'users.json').exists(): rebuild(d); return   # тот же стенд, новая сборка (старый SW → новый)
    shutil.rmtree(d, ignore_errors=True); src = d / 'src'; src.mkdir(parents=True)
    P = pathlib.Path(A + '/pwa/terekhina14')
    for f in ['sw.js', 'manifest.webmanifest'] + PAGES: shutil.copy(P / f, src / f)
    for sub in ('icons', 'assets'): shutil.copytree(P / sub, src / sub)
    pathlib.Path(d / 'enc_secret.json').write_text(json.dumps({'password': 'test-groups-1511', 'salt': secrets.token_hex(16), 'iter': 1000}))
    pub = ACCT.keys()['pub']; users, people, kr = {}, {}, []
    for name, groups in PEOPLE.items():
        uid, K = secrets.token_hex(12), secrets.token_bytes(32)
        users[name] = {'id': uid, 'K': K.hex(), 'groups': groups}; people[uid] = groups
        kr.append({'id': uid, 'seal': seal(K, pub)})
    pathlib.Path(d / 'keyring.json').write_text(json.dumps({'ok': True, 'now': int(time.time() * 1000), 'rev': 0, 'shared': True, 'users': kr}))
    pathlib.Path(d / 'people.json').write_text(json.dumps(people))
    env = dict(os.environ, T14_ENC_SRC=str(src), T14_ENC_SECRET=str(d / 'enc_secret.json'), T14_KEYRING=str(d / 'keyring.json'), T14_ACCESS='1',
               T14_ACCESS_PEOPLE=str(d / 'people.json'), T14_ACCT_URL='https://example.invalid/acct', PYTHONPATH=A)
    r = subprocess.run(['python3', os.environ.get('T14_BUILD_ENC', A + '/build_enc.py'),   # 20.11.2026: проверка кандидата сборки (work/speed2011)
                     '--base', '/', '--out', str(d / 'out')], env=env, capture_output=True, text=True)
    print(r.stdout[-1200:], r.stderr[-1200:])
    if r.returncode: sys.exit('build_enc: ошибка')
    pathlib.Path(d / 'users.json').write_text(json.dumps(users))
    print('stand ok:', d)



def rebuild(d):
    env = dict(os.environ, T14_ENC_SRC=str(d / 'src'), T14_ENC_SECRET=str(d / 'enc_secret.json'), T14_KEYRING=str(d / 'keyring.json'), T14_ACCESS='1',
               T14_ACCESS_PEOPLE=str(d / 'people.json'), T14_ACCT_URL='https://example.invalid/acct', PYTHONPATH=A)
    r = subprocess.run(['python3', os.environ.get('T14_BUILD_ENC', A + '/build_enc.py'), '--base', '/', '--out', str(d / 'out')], env=env, capture_output=True, text=True)
    print(r.stdout[-600:], r.stderr[-600:])
    if r.returncode: sys.exit('build_enc: ошибка')
    print('stand rebuilt:', d)


if __name__ == '__main__': main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/t14_access_stand')
