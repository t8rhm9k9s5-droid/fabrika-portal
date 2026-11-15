# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика»: personal logins on Claude's side (22.10.2026).
   The site key M: from the shared password (PBKDF2, as before) while the shared password is on; a random key after the admin turns it off.
   Each person has a random key K (made on their phone). The script keeps K sealed to Claude's public key (ECDH P-256 + HKDF + AES-GCM);
   at every publish Claude opens the seals and writes k/<id>.bin = AES-GCM(K, M) next to the encrypted site, so the phones of all people
   who are on can open a new version even after M changes. After someone is turned off (the script counts it in «rev»), M changes at the next publish.
     python3 acct.py keys      — make Claude's key pair (once; the private key never leaves acct_secret.json)
     python3 acct.py pub       — Claude's public key (base64url, uncompressed point), goes into the site
     python3 acct.py regsha    — SHA-256 of the registration key from the shared password (goes into the script)
     python3 acct.py check FILE — open the seals of a keyring answer (?op=keyring) and report
   The keyring answer of the script (GET ?op=keyring, read by the browser) is saved to /home/claude/sync/keyring.json before a publish."""
import os, sys, json, hmac, hashlib, base64, secrets, time
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

B = '/home/claude/app_build'
SECRET = f'{B}/acct_secret.json'
ENC_SECRET = os.environ.get('T14_ENC_SECRET') or f'{B}/enc_secret.json'          # tests use a copy
KEYRING = os.environ.get('T14_KEYRING') or '/home/claude/sync/keyring.json'
KEYRING_FRESH = 3 * 3600            # a keyring older than this is not used to change the site key


def b64u(b): return base64.urlsafe_b64encode(b).rstrip(b'=').decode()
def unb64(s):
    s = s.replace('-', '+').replace('_', '/'); return base64.b64decode(s + '=' * (-len(s) % 4))


def keys():
    if os.path.exists(SECRET): return json.load(open(SECRET))
    k = ec.generate_private_key(ec.SECP256R1())
    pub = k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    S = {'d': format(k.private_numbers().private_value, '064x'), 'pub': b64u(pub), 't': time.strftime('%Y-%m-%d')}
    fd = os.open(SECRET, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f: json.dump(S, f, indent=1)
    return S


def enc_secret(): return json.load(open(ENC_SECRET))


def save_enc_secret(S, path=None):
    """enc_secret.json atomically, mode 600: a cut write must not lose a random site key"""
    path = path or ENC_SECRET; tmp = path + '.tmp'
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f: json.dump(S, f, indent=1); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, path)


def master(S=None):
    """the site key: random after the shared password is off, otherwise from the shared password (as before)"""
    S = S or enc_secret()
    if S.get('master_hex'): return bytes.fromhex(S['master_hex'])
    return hashlib.pbkdf2_hmac('sha256', S['password'].encode(), bytes.fromhex(S['salt']), S['iter'], 32)


def regsha(S=None):
    """the phone sends hex(HMAC(M_shared, 'fabrika-register')); the script keeps SHA-256 of that text"""
    S = S or enc_secret()
    m = hashlib.pbkdf2_hmac('sha256', S['password'].encode(), bytes.fromhex(S['salt']), S['iter'], 32)
    reg = hmac.new(m, b'fabrika-register', hashlib.sha256).hexdigest()
    return hashlib.sha256(reg.encode()).hexdigest()


def unseal(seal_b64, K=None):
    """seal = ephemeral public point (65) || iv (12) || AES-GCM(HKDF(ECDH), K)"""
    K = K or keys()
    raw = unb64(seal_b64)
    eph, iv, ct = raw[:65], raw[65:77], raw[77:]
    priv = ec.derive_private_key(int(K['d'], 16), ec.SECP256R1())
    shared = priv.exchange(ec.ECDH(), ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), eph))
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=eph, info=b'fabrika-seal').derive(shared)
    k = AESGCM(key).decrypt(iv, ct, None)
    assert len(k) == 32
    return k


def wrap(K, M):
    iv = secrets.token_bytes(12)
    return iv + AESGCM(K).encrypt(iv, M, b'fabrika-kr')


def load_keyring():
    if not os.path.exists(KEYRING): return None
    kr = json.load(open(KEYRING))
    kr['_age'] = time.time() - (kr['now'] / 1000 if isinstance(kr.get('now'), (int, float)) else os.path.getmtime(KEYRING))   # the server's time, not the file's (a copy resets mtime)
    return kr


def openable(kr):
    """ids of the people whose sealed key Claude can open (each gets k/<id>.bin)"""
    if not kr: return []
    K = keys(); ok = []
    for u in kr.get('users', []):
        if not (isinstance(u.get('id'), str) and len(u['id']) == 24 and all(c in 'REDACTED_HEX_1' for c in u['id'])): continue
        try: unseal(u['seal'], K); ok.append(u['id'])
        except Exception as e: print('seal', u.get('id'), e)
    return ok


def plan_master(S, kr):
    """decide the site key for this publish; changes S (the caller saves it). Returns (M, reason).
    Never switches to a key nobody can open: a new key needs at least one person whose seal opens (checked before anything is written)."""
    if kr and not kr.get('shared', True) and kr['_age'] < KEYRING_FRESH:
        if not S.get('master_hex') or kr.get('rev', 0) > S.get('rev_done', -1):
            if not openable(kr): raise SystemExit('STOP: в keyring нет ни одного открываемого личного ключа — ключ сайта не меняю')
            S['master_hex'] = secrets.token_hex(32); S['rev_done'] = kr.get('rev', 0); S['shared'] = False
            return bytes.fromhex(S['master_hex']), 'new site key (rev %s)' % kr.get('rev')
    return master(S), 'same key'


def write_keyring(out_dir, M, kr, pay=None):
    """k/<id>.bin for everyone who is on; returns how many. pay(id) → what the file holds (15.11.2026: the site key + keys of the person's
    group sets, access.py); without it — the site key only, as before"""
    if not kr: return 0
    os.makedirs(os.path.join(out_dir, 'k'), exist_ok=True)
    K = keys(); n = 0
    for u in kr.get('users', []):
        if not (isinstance(u.get('id'), str) and len(u['id']) == 24 and all(c in 'REDACTED_HEX_1' for c in u['id'])): continue
        try: k = unseal(u['seal'], K)
        except Exception as e: print('seal', u.get('id'), e); continue
        open(os.path.join(out_dir, 'k', u['id'] + '.bin'), 'wb').write(wrap(k, pay(u['id']) if pay else M)); n += 1
    return n


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else ''
    if cmd == 'keys': print('pub', keys()['pub'])
    elif cmd == 'pub': print(keys()['pub'])
    elif cmd == 'regsha': print(regsha())
    elif cmd == 'check':
        kr = json.load(open(sys.argv[2])); K = keys()
        for u in kr.get('users', []):
            try: unseal(u['seal'], K); print(u['id'], 'ok')
            except Exception as e: print(u['id'], 'FAIL', e)
        print('rev', kr.get('rev'), 'shared', kr.get('shared'))
    else: print(__doc__)
