# «Фабрика» — выпуск-заплатка поверх действующей версии портала (25.11.2026).
# Зачем: после перезапуска облака полная сборка невозможна (нет части исходных файлов, раздел «Сайт» локально неполный) — полная выкладка
#   убрала бы с портала тысячи файлов. Заплатка берёт карту действующей версии с хостинга и меняет в ней только перечисленные файлы.
#   python3 live_patch.py <папка с новыми файлами (пути как на портале)> <ожидаемая действующая версия> [--send]
# Что делает: шифрует файлы тем же способом, что build_enc.py (ключ сайта или ключ набора групп), собирает m.bin (новая метка времени,
#   прежний хвост версии — без оповещения всем), sw.js, обновляет реестр документов (docs_registry.json) и enc_map.json, собирает пакет
#   drive_pack.write_pkg (подпись v2). С --send — отправляет up_pack.py и ждёт новую версию на хостинге. Ключи не печатаются.
# 25.11.2026 (вечер): заплатка умеет файлы разделов «Сайт» и «Документы» (части карты mf.bin / ml.bin) и НОВЫЕ файлы:
#   новый файл попадает в часть по началу пути (fsu/ → mf.bin, library/ и archive/ → ml.bin) или в основную карту; ключ доступа
#   (общий или набора групп) берётся как у соседних файлов той же папки — если в папке ключи разные или папки нет, остановка.
#   Удаление: --drop путь[,путь] — файл убирается из карты (блок на хостинге остаётся, ссылок на него нет).
import hashlib, hmac, json, os, pathlib, re, secrets, shutil, ssl, subprocess, sys, tempfile, time, urllib.request, uuid
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
A = '/home/claude/app_build'; sys.path.insert(0, A)
import access as ACC, drive_pack as DP, mimetypes
MIME = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
        '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
        '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.kml': 'application/vnd.google-earth.kml+xml', '.geojson': 'application/geo+json'}   # как в build_enc.py
def mime(p): return MIME.get(os.path.splitext(p)[1].lower()) or mimetypes.guess_type(p)[0] or 'application/octet-stream'
BASE = 'https://techfabrikant.ru/'; CTX = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
S = json.load(open(A + '/enc_secret.json'))
def get(p):
    with urllib.request.urlopen(urllib.request.Request(BASE + p + '?t=%d' % time.time(), headers={'Cache-Control': 'no-cache'}), context=CTX, timeout=180) as r: return r.read()
def master(): return bytes.fromhex(S['master_hex']) if S.get('master_hex') else hashlib.pbkdf2_hmac('sha256', S['password'].encode(), bytes.fromhex(S['salt']), S['iter'], 32)
def live_version(): return re.search(r"VERSION = '([^']+)'", get('sw.js').decode()).group(1)
def main():
    plain = pathlib.Path(sys.argv[1]); want = sys.argv[2]; send = '--send' in sys.argv
    mk = master(); aes = AESGCM(mk); ivkey = hmac.new(mk, b'iv-derivation', hashlib.sha256).digest()
    m = json.loads(aes.decrypt((mb := get('m.bin'))[:12], mb[12:], None))
    if m['v'] != want or live_version() != want: sys.exit('действующая версия %s, а заплатка готовилась под %s — остановлено' % (m['v'], want))
    parts = {}
    for nm in sorted(set((m.get('parts') or {}).values())):
        pb = get(nm); parts[nm] = json.loads(aes.decrypt(pb[:12], pb[12:], None))['files']
    full = dict(m['files']); [full.update(v) for v in parts.values()]
    ver = time.strftime('%Y%m%d%H%M%S', time.gmtime()) + '-' + want.split('-', 1)[1]
    out = pathlib.Path(A) / 'patch' / ('out-' + ver); (out / 'b').mkdir(parents=True)
    items = []; changed = {}; dirty = set()
    def home(rel):   # в какой карте живёт файл: основная или часть
        if rel in m['files']: return m['files']
        for nm, fl in parts.items():
            if rel in fl: return fl
        pre = sorted((x for x in (m.get('parts') or {}) if rel.startswith(x)), key=len, reverse=True)
        return parts[m['parts'][pre[0]]] if pre else m['files']
    def part_name(fl): return next((nm for nm, x in parts.items() if x is fl), None)
    for f in sorted(p for p in plain.rglob('*') if p.is_file()):
        rel = str(f.relative_to(plain)).replace(os.sep, '/'); fl = home(rel); data = f.read_bytes()
        if rel in fl: old = fl[rel]
        else:   # новый файл: ключ доступа — как у соседей по папке
            d = rel.rsplit('/', 1)[0] + '/' if '/' in rel else ''
            nb = {(v[3] if len(v) > 3 else None) for k, v in full.items() if (k.startswith(d) and '/' not in k[len(d):]) if d or '/' not in k}
            if len(nb) != 1: sys.exit('новый файл %s: в папке %s ключи доступа %s — не могу выбрать, остановлено' % (rel, d or '(корень)', 'разные' if nb else 'не найдены (папки нет)'))
            sid0 = nb.pop(); old = [None, mime(rel), 0] + ([sid0] if sid0 else [])
        sid = old[3] if len(old) > 3 else None
        if sid: k = ACC.set_key(S, sid); fa, fiv = AESGCM(k), hmac.new(k, b'iv-derivation', hashlib.sha256).digest()
        else: fa, fiv = aes, ivkey
        iv = hmac.new(fiv, rel.encode() + b'\0' + hashlib.sha256(data).digest(), hashlib.sha256).digest()[:12]
        blob = iv + fa.encrypt(iv, data, None); name = hashlib.sha256(blob).hexdigest()[:24] + '.bin'
        assert fa.decrypt(blob[:12], blob[12:], None) == data
        if name == old[0]: print('без изменений:', rel); continue
        (out / 'b' / name).write_bytes(blob); fl[rel] = [name, old[1], len(data)] + ([sid] if sid else []); full[rel] = fl[rel]
        if part_name(fl): dirty.add(part_name(fl))
        items.append(('b/' + name, str(out / 'b' / name))); changed[rel] = (old[0], name, old[2], len(data))
    if '--drop' in sys.argv:
        for rel in sys.argv[sys.argv.index('--drop') + 1].split(','):
            fl = home(rel)
            if rel not in fl: sys.exit('--drop: файла %s нет в карте' % rel)
            if rel in (m.get('pre') or []) or rel in (m.get('docs') or []): sys.exit('--drop: %s в списке предзагрузки или документов — не убираю' % rel)
            old = fl.pop(rel); full.pop(rel, None); changed[rel] = (old[0], None, old[2], 0)
            if part_name(fl): dirty.add(part_name(fl))
    if not changed: sys.exit('изменений нет')
    m['v'] = ver
    mj = json.dumps({'v': ver, 'files': m['files'], 'pre': m['pre'], 'docs': m['docs'], 'news': m.get('news', ''), **({'parts': m['parts']} if m.get('parts') else {})}, ensure_ascii=False).encode()
    iv = secrets.token_bytes(12); (out / 'm.bin').write_bytes(iv + aes.encrypt(iv, mj, None))
    for nm in sorted(dirty):   # изменённые части карты (формат build_enc.py: {v, files})
        pj = json.dumps({'v': ver, 'files': parts[nm]}, ensure_ascii=False).encode(); piv = secrets.token_bytes(12); (out / nm).write_bytes(piv + aes.encrypt(piv, pj, None))
        assert json.loads(aes.decrypt((out / nm).read_bytes()[:12], (out / nm).read_bytes()[12:], None))['files'] == parts[nm]
        items.append((nm, str(out / nm)))
    assert not (set(full) - set(m['files']) - {k for v in parts.values() for k in v}) and len(full) == len(m['files']) + sum(len(v) for v in parts.values()), 'карты не сходятся'
    (out / 'sw.js').write_text(pathlib.Path(A + '/enc/enc_sw.js').read_text(encoding='utf-8').replace('__VERSION__', ver), encoding='utf-8')
    assert (out / 'sw.js').read_text(encoding='utf-8').replace(ver, want) == get('sw.js').decode('utf-8'), 'sw.js на хостинге отличается от шаблона — остановлено'
    # реестр документов и карта сборки — под новую версию (названия документов — из прежнего реестра)
    regp = A + '/host/live/docs_registry.json'; old_reg = json.load(open(regp, encoding='utf-8')); titles = {i['p']: i.get('t', '') for i in old_reg['items']}
    DOC = ('.pdf', '.docx', '.xlsx', '.xls', '.doc', '.pptx', '.odt', '.ods')
    its = [{'p': p, 'b': v[0], 'sz': v[2], 'k': 'doc' if p.lower().endswith(DOC) else 'page' if p.endswith('.html') else 'asset', 't': titles.get(p, '') if p.lower().endswith(DOC) else ''} for p, v in sorted(full.items())]
    reg = {'v': 1, 't': time.strftime('%Y-%m-%dT%H:%M', time.gmtime(time.time() + 3 * 3600)), 'm_sha': hashlib.sha256((out / 'm.bin').read_bytes()).hexdigest(), 'n': len(its), 'docs': sum(1 for i in its if i['k'] == 'doc'), 'items': its}
    for p in (regp, A + '/enc_map.json'): shutil.copy2(p, p + '.before-patch-' + ver[:8])
    json.dump(reg, open(regp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); json.dump(full, open(A + '/enc_map.json', 'w', encoding='utf-8'), ensure_ascii=False)
    items += [('code/docs_registry.json', regp), ('m.bin', str(out / 'm.bin')), ('sw.js', str(out / 'sw.js'))]
    if '--public' in sys.argv:   # 25.11.2026: открытая страница входа (index.html, login.html, 404.html в корне хостинга) — из каталога, только эти три имени
        pub = pathlib.Path(sys.argv[sys.argv.index('--public') + 1]); names = ('index.html', 'login.html', '404.html')
        assert all((pub / n).is_file() for n in names) and len({(pub / n).read_bytes() for n in names}) == 1, '--public: нужны три одинаковых файла index.html, login.html, 404.html'
        assert b'T14_ACCT_CFG' in (pub / 'index.html').read_bytes() and b'id="fp"' in (pub / 'index.html').read_bytes(), '--public: это не страница входа'
        items += [(n, str(pub / n)) for n in names]; print('страница входа: 3 файла,', (pub / 'index.html').stat().st_size, 'байт')
    tf = tempfile.NamedTemporaryFile('w', suffix='.json', delete=False, encoding='utf-8')
    json.dump({'rid': time.strftime('%Y%m%d%H%M', time.gmtime(time.time() + 3 * 3600)) + '-' + uuid.uuid4().hex[:8], 'i': 1, 'n': 1}, tf); tf.close()
    DP.KEY = bytes.fromhex(json.loads(pathlib.Path(A + '/deploy_secret.json').read_text())['k_deploy'])
    before = set(os.listdir(DP.DST)); DP.write_pkg(items + [('code/release_part.json', tf.name)])
    pkg = sorted(f for f in set(os.listdir(DP.DST)) - before if f.endswith('.pkg'))[-1]
    print(json.dumps({'версия': ver, 'пакет': pkg, 'файлы': {k: ('новый, %d байт' % v[3] if v[0] is None else 'убран' if v[1] is None else '%d → %d байт' % (v[2], v[3])) for k, v in list(changed.items())[:40]}, 'всего файлов': len(changed), 'части карты': sorted(dirty), 'реестр': reg['n'], 'с названиями': sum(1 for i in its if i['t'])}, ensure_ascii=False))
    (out / 'patch.json').write_text(json.dumps({'ver': ver, 'base': want, 'pkg': pkg, 'changed': changed}, ensure_ascii=False), encoding='utf-8')
    if not send: return
    r = subprocess.run([sys.executable, A + '/up_pack.py', os.path.join(DP.DST, pkg), '--chunk', '7.5'], capture_output=True, text=True); print('отправка:', (r.stdout.strip() or r.stderr.strip())[-300:])
    if r.returncode != 0: sys.exit('пакет не отправлен')
    for i in range(40):
        time.sleep(30); v = live_version()
        if v == ver: print('на хостинге версия', v, '— через %d с' % ((i + 1) * 30)); break
    else: sys.exit('за 20 минут версия не сменилась (сейчас %s)' % v)
    print(subprocess.run([sys.executable, A + '/drive_pack.py', '--done', pkg], capture_output=True, text=True).stdout.strip()[-300:])
main()
