#!/usr/bin/env python3
"""21.11.2026 — новый каталог в разделе «Сайт» портала (techfabrikant.ru/fsu/).
Собирает fsu.<время> = текущая копия сайта (build/fsu → fsu.<время>, все прежние страницы) + work/fsu2/out (новый каталог: n/…, index.html-маршрутизатор,
old.html — прежняя оболочка) жёсткими ссылками, проверяет её и атомарно переключает ссылку build/fsu. Предыдущая сборка остаётся для отката:
  python3 fsu_build_new.py            — собрать (build_new.py) и переключить
  python3 fsu_build_new.py --no-gen   — только переключить на уже собранный out/
  python3 fsu_build_new.py --rollback — вернуть build/fsu на предыдущую сборку
  python3 fsu_build_new.py --dry <папка> — собрать и проверить в <папке>, build/fsu не трогать (проверка до выкладки)
Шифрование и выкладка — как у копии: build_site.py берёт build/fsu целиком (os.path.realpath), build_enc кладёт fsu/ в mf.bin."""
import os, sys, json, shutil, subprocess, time, fcntl
HERE = os.path.dirname(os.path.abspath(__file__)); FINAL = '/home/claude/build/fsu'; ROOT = os.path.dirname(FINAL); OUTN = os.path.join(HERE, 'out')
_LOCK = open(FINAL + '.lock', 'w'); fcntl.flock(_LOCK, fcntl.LOCK_EX | fcntl.LOCK_NB)   # вместе с fsu_build.py не запускается


def switch(target):
    tmp = FINAL + '.lnk'
    if os.path.lexists(tmp): os.remove(tmp)
    os.symlink(os.path.basename(target), tmp); os.replace(tmp, FINAL)


if '--rollback' in sys.argv:
    st = json.load(open(os.path.join(ROOT, 'fsu.new.json')))
    if not os.path.isdir(st.get('prev', '')): sys.exit('нет предыдущей сборки для отката')
    switch(st['prev']); print('build/fsu →', os.path.basename(st['prev'])); sys.exit()
if '--no-gen' not in sys.argv:
    subprocess.run([sys.executable, os.path.join(HERE, 'build_new.py'), '--base', FINAL, '--out', OUTN], check=True)
for f in ('index.html', 'old.html', 'n/app.js', 'n/boot.js', 'n/app.css', 'n/d/idx.json'):
    if not os.path.getsize(os.path.join(OUTN, f)): sys.exit('out неполный: ' + f)
src = os.path.realpath(FINAL)
if '--dry' in sys.argv: pass
# первый раз build/fsu — обычная папка: перенести её в fsu.pre-link и сделать ссылкой (как fsu_build.py)
if '--dry' not in sys.argv and os.path.isdir(FINAL) and not os.path.islink(FINAL):
    pre = FINAL + '.pre-link'; os.rename(FINAL, pre); os.symlink(os.path.basename(pre), FINAL); src = pre
DRY = sys.argv[sys.argv.index('--dry') + 1] if '--dry' in sys.argv else None
VER = DRY or FINAL + '.' + time.strftime('%Y%m%d%H%M%S'); TMP = VER + '.part'
if DRY: shutil.rmtree(DRY, ignore_errors=True)
shutil.rmtree(TMP, ignore_errors=True)
# прежние страницы копии — жёсткими ссылками (без второй копии на диске); прошлый новый каталог (n/) не переносим — его заменяет out/
shutil.copytree(src, TMP, copy_function=os.link, symlinks=True, ignore=lambda d, n: ['n'] if os.path.abspath(d) == os.path.abspath(src) else [])
for root, dirs, files in os.walk(OUTN):
    rel = os.path.relpath(root, OUTN); dd = os.path.join(TMP, rel) if rel != '.' else TMP; os.makedirs(dd, exist_ok=True)
    for f in files:
        dst = os.path.join(dd, f)
        if os.path.lexists(dst): os.remove(dst)
        os.link(os.path.join(root, f), dst)
# проверка: маршрутизатор, оболочка копии с картой API, данные каталога, все карточки и картинки на месте
idx = json.load(open(os.path.join(TMP, 'n/d/idx.json'), encoding='utf-8'))
H = open(os.path.join(TMP, 'index.html'), encoding='utf-8').read(); OH = open(os.path.join(TMP, 'old.html'), encoding='utf-8').read()
miss = [x['c'] for x in idx['items'] if not os.path.exists(os.path.join(TMP, 'n/d/p', x['c'] + '.json'))]
imgs = {x[k] for x in idx['items'] for k in ('i', 'i2') if x.get(k)}
noimg = [k for k in imgs if not os.path.exists(os.path.join(TMP, 'n/i', k + '.webp')) or not os.path.exists(os.path.join(TMP, 'n/i/t', k + '.webp'))]
err = []
if 'FSU_NEW_V' not in H or 'var A=' not in H: err.append('index.html без маршрутизатора или карты API')
if 'var A=' not in OH or 'FSU_NEW_V' in OH: err.append('old.html не прежняя оболочка')
if miss: err.append('нет карточек: %d' % len(miss))
if noimg: err.append('нет картинок: %d' % len(noimg))
if len(idx['items']) < 500: err.append('карточек меньше 500: %d' % len(idx['items']))
for f in ('podbor.html', '_api/_fidx.json', 'f/media/fonts/als_departure/ALSDeparture-Regular.woff2'):
    if not os.path.exists(os.path.join(TMP, f)): err.append('нет ' + f)
if err: shutil.rmtree(TMP, ignore_errors=True); sys.exit('сборка не переключена: ' + '; '.join(err))
os.rename(TMP, VER)
if DRY: print(json.dumps({'dry': VER, 'cards': len(idx['items'])}, ensure_ascii=False)); sys.exit()
prev = os.path.realpath(FINAL); switch(VER)
json.dump({'cur': VER, 'prev': prev, 't': time.strftime('%d.%m.%Y %H:%M'), 'cards': len(idx['items'])}, open(os.path.join(ROOT, 'fsu.new.json'), 'w'), ensure_ascii=False)
# храним текущую и одну предыдущую (откат); остальные fsu.<время> — удалить
for d in os.listdir(ROOT):
    p = os.path.join(ROOT, d)
    if d.startswith('fsu.') and d[4:5].isdigit() and os.path.isdir(p) and not os.path.islink(p) and p not in (VER, prev):
        shutil.rmtree(p, ignore_errors=True)
print(json.dumps({'build/fsu': os.path.basename(VER), 'prev': os.path.basename(prev), 'cards': len(idx['items']), 'images': len(os.listdir(os.path.join(VER, 'n/i'))) - 1}, ensure_ascii=False))
