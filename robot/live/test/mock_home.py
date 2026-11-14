"""30.10.2026 (аудит): макет ~/.fabrika_live для тестов участков — БЕЗ /home/claude/app_build и /home/claude/fabrika (их нельзя читать).
Код робота — из этой папки (work/py/live) по списку drive_pack.CODE (work/py/drive_pack.py: тот же список, что едет пакетом кода);
общие модули отчётов (build_output, ingest, parse_1c, stock_data, bot_parts — в архив не входят) — заглушки в ~/.fabrika_live/py;
ключи — тестовые (не настоящие). Режим почты (code/mail_cfg.json) задаётся явно: в работе сейчас smtp/imap, утром 30.10 — bot/gas.
Ловушка сети: sitecustomize в PYTHONPATH подменяет imaplib, smtplib, сокеты и запуск sendmail — каждый вызов пишется в журнал ловушки и
падает (raise_kind='trap' — BaseException: «ни одного вызова»; 'refused' — ConnectionRefusedError: как недоступный сервер)."""
import json, os, re, shutil, sys, tempfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))      # work/py/live
PACKER = os.path.join(os.path.dirname(HERE), 'drive_pack.py')            # work/py/drive_pack.py (копия упаковщика)
KL, KO, KC, KD = '11' * 32, '22' * 32, '33' * 32, '44' * 32              # тестовые k_live, k_owner, k_cmd, k_deploy

STUBS = {
    'build_output.py': r'''
import json, os
def is_workday(d): return d.weekday() < 5
def main(d): json.dump({'date': d}, open(os.environ['FABRIKA_OUT_JSON'], 'w'))
''',
    'ingest.py': r'''
import os
def store(fn, data, date):
    low = fn.lower()
    if 'oserr' in low: raise OSError(28, 'No space left on device')
    if 'broken' in low: raise ValueError('не тот формат')
    if 'гальваник' in low:
        d = os.path.join(os.environ['FABRIKA_OUT_DIR'], 'raw', date.isoformat()); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, 'galv.pdf'), 'wb').write(data); return 'galv.pdf', date.isoformat()
    return None, None
''',
    'parse_1c.py': r'''
import re
def _date_from_text(s):
    m = re.search(r'(\d\d)\.(\d\d)\.(\d{4})', s or '')
    return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1)) if m else None
def _ingest_attachment(root, fn, data, sdate, meta): return []
def find_dates(root): return {}
def build(*a): return {}
''',
    'stock_data.py': 'def build(D, PR, x): return {}, {}\n',
    'bot_parts.py': 'def output_part(O): return {}\ndef vyp_part(*a): return {}\ndef stock_part(*a): return {}\n',
}

SITECUSTOMIZE = r'''
import os, sys
class Trap(BaseException): pass
KIND = os.environ.get('FABRIKA_TRAP_KIND', 'trap')
def _t(name, orig=None, mail_only=False):
    def f(*a, **k):
        if mail_only and not ('--lane' in sys.argv and sys.argv[sys.argv.index('--lane') + 1:][:1] == ['mail']): return orig(*a, **k)
        with open(os.environ['FABRIKA_TRAP'], 'a') as h: h.write('%s: %s\n' % (' '.join(sys.argv[1:]) or '-c', name))
        if KIND == 'refused': raise ConnectionRefusedError(111, 'Connection refused (тестовая ловушка)')
        raise Trap(name)
    return f
import imaplib, smtplib, socket, subprocess
imaplib.IMAP4_SSL = _t('imaplib.IMAP4_SSL'); imaplib.IMAP4 = _t('imaplib.IMAP4'); smtplib.SMTP = _t('smtplib.SMTP'); smtplib.SMTP_SSL = _t('smtplib.SMTP_SSL')
_mo = os.environ.get('FABRIKA_TRAP_SOCK') == 'mail'
socket.create_connection = _t('socket.create_connection', socket.create_connection, _mo); socket.socket.connect = _t('socket.connect', socket.socket.connect, _mo)
_run = subprocess.run
def _srun(args, *a, **k):
    if 'sendmail' in str((args or [''])[0]): return _t('sendmail')(args)
    return _run(args, *a, **k)
subprocess.run = _srun
'''


def code_map():
    src = open(PACKER, encoding='utf-8').read()
    return eval(re.search(r"CODE = (\{.*?\})\n", src, re.S).group(1), {'A': '/nonexistent'})


def make(send='smtp', read='imap', passwords=True, k_owner=True, trap='trap', sock='mail', cfg=None):
    """→ dict: T (корень, как ~), FL (~/.fabrika_live), C (code), SITE, ENV (для subprocess), TRAPF (журнал ловушки)"""
    T = tempfile.mkdtemp(); FL = os.path.join(T, '.fabrika_live'); C = os.path.join(FL, 'code')
    for d in ('code', 'state', 'log', 'out', 'stock', 'py'): os.makedirs(os.path.join(FL, d))
    for n in code_map():
        p = os.path.join(HERE, n)
        if os.path.isfile(p): shutil.copy(p, os.path.join(C, n))
    for n, body in STUBS.items(): open(os.path.join(FL, 'py', n), 'w', encoding='utf-8').write(body)
    c = {'k_live': KL, 'k_deploy': KD, 'site': os.path.join(T, 'www'), 'mail': 'user125@example.org'}
    c.update(cfg or {})
    json.dump(c, open(os.path.join(FL, 'cfg.json'), 'w'))
    if k_owner: open(os.path.join(C, 'k_owner.txt'), 'w').write(KO)
    open(os.path.join(C, 'k_cmd.txt'), 'w').write(KC)
    for n in ('mail_out.json', 'mail_out_reissue.json'): open(os.path.join(C, n), 'w').write('[]')   # настоящие письма в макет не берём
    json.dump({'send': send, 'read': read}, open(os.path.join(C, 'mail_cfg.json'), 'w'))
    if passwords:
        for n in ('gmail_app_password', 'itm_app_password'): open(os.path.join(FL, n), 'w').write('test-pass')
    TRAPD = os.path.join(T, 'trap'); os.makedirs(TRAPD); TRAPF = os.path.join(T, 'trap.log')
    open(os.path.join(TRAPD, 'sitecustomize.py'), 'w').write(SITECUSTOMIZE)
    ENV = dict(os.environ, PYTHONPATH=TRAPD, FABRIKA_TRAP=TRAPF, FABRIKA_TRAP_KIND=trap, FABRIKA_TRAP_SOCK=sock)
    return {'T': T, 'FL': FL, 'C': C, 'SITE': os.path.join(T, 'www'), 'ENV': ENV, 'TRAPF': TRAPF}


def unseal(s, key):
    """st/*.bin (T14B1) → объект или None (чужой ключ)"""
    import base64, hashlib, hmac
    b = base64.b64decode(s[6:]); nonce, tag, ct = b[:16], b[16:48], b[48:]
    if not hmac.compare_digest(hmac.new(key, nonce + ct, hashlib.sha256).digest(), tag): return None
    ks = b''.join(hmac.new(key, nonce + i.to_bytes(4, 'big'), hashlib.sha256).digest() for i in range((len(ct) + 31) // 32))
    return json.loads(bytes(a ^ b for a, b in zip(ct, ks)).decode('utf-8'))


def trap_log(M):
    return open(M['TRAPF']).read() if os.path.exists(M['TRAPF']) else ''


def load_live(M):
    """импортировать live (и модули) ИЗ макета в этот процесс: пути робота — от файла live.py макета"""
    sys.path[:0] = [os.path.join(M['FL'], 'py'), M['C']]
    for k in [k for k in sys.modules if k in ('live', 'mail_q', 'itm', 'deploy', 'mail_pkg', 'itm_arch', 'mx_ctl', 'glonass', 'ozon', 'ozon_day', 'stock_mail', 'unans')]:
        del sys.modules[k]
    import live
    return live


class Rec:
    """подмена live.mail_send / live.max_send: запоминает, что ушло бы владельцу"""
    def __init__(self): self.mail, self.max = [], []
    def mail_send(self, subject, text, to=None, cc=None, att=None, html=None, reply_to=None): self.mail.append((subject, text, to)); return 'ok (очередь)'
    def max_send(self, text): self.max.append(text); return 'ok'
    def hook(self, live): live.mail_send = self.mail_send; live.max_send = self.max_send; return self
