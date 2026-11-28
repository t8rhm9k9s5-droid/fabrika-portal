# Ночная сборка «Сайта» против действующего портала: не потеряет ли выпуск фото и интерьеры, поставленные заплатками напрямую. 26.11.2026
import sys, json, glob, os, pathlib
sys.path.insert(0, '/home/claude/fabrika/tools'); import live_get as g
B = os.path.realpath('/home/claude/build/fsu'); fm = g.fmap()
codes = sorted({os.path.basename(f)[:-5] for d in glob.glob('/home/claude/app_build/patch/2511*/plain/fsu/n/d/p') for f in glob.glob(d + '/*.json')})
lose = []; same = 0
def keys(c): return {x.get('k') for x in (c.get('ph') or [])} | {v for v in (c.get('th') or {}).values() if isinstance(v, str)} | {v for v in (c.get('th2') or {}).values() if isinstance(v, str)} | ({c['in']} if isinstance(c.get('in'), str) else set())
for c in codes:
    L = json.loads(g.read('fsu/n/d/p/%s.json' % c)); p = os.path.join(B, 'n/d/p/%s.json' % c)
    if not os.path.exists(p): lose.append((c, 'карточки нет в сборке')); continue
    N = json.loads(pathlib.Path(p).read_text(encoding='utf-8')); miss = keys(L) - keys(N)
    if miss or (L.get('th') or {}) != (N.get('th') or {}): lose.append((c, 'в сборке нет %d снимков из действующих; th: %s → %s' % (len(miss), json.dumps(L.get('th'), ensure_ascii=False)[:90], json.dumps(N.get('th'), ensure_ascii=False)[:90])))
    else: same += 1
live_files = {k for k in fm if k.startswith('fsu/')}; build_files = set()
for d, _, fs in os.walk(B):
    for f in fs: build_files.add('fsu/' + os.path.relpath(os.path.join(d, f), B).replace(os.sep, '/'))
print('сборка', os.path.basename(B), '· карточек, правленных заплатками 25.11:', len(codes), '· совпадают:', same, '· выпуск их откатил бы:', len(lose))
for c, w in lose: print('  ', c, '—', w)
print('файлов сайта: на портале', len(live_files), '· в сборке', len(build_files), '· есть на портале, нет в сборке:', len(live_files - build_files), '· новых в сборке:', len(build_files - live_files))
