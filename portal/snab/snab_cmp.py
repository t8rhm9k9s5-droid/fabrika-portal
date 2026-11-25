# Сверка тени ИИ бота (SnabGpt.gs → «От ботов»/snab_gpt_<день>.json) с разбором Claude (work/snab/live/<день>.json). 12.11.2026.
#   python3 snab_cmp.py <snab_gpt_день.json> [work/snab/live/день.json]
# Совпадение документа — по итогу без НДС (±1 ₽) и числу строк; печатает: совпало / только у Claude / только у бота / расхождения.
import json, sys, os
g = json.load(open(sys.argv[1]))
day = g.get('day')
c = json.load(open(sys.argv[2] if len(sys.argv) > 2 else f'/home/claude/fabrika/work/snab/live/{day}.json'))
C = c.get('docs') or []; B = list(g.get('docs') or [])
ok, only_c, diff = [], [], []
for d in C:
    m = [b for b in B if abs(float(b.get('total') or 0) - float(d['t'])) <= 1.0]
    if not m:
        mids = set(d.get('mids') or [])
        m2 = [b for b in B if mids & set(b.get('mids') or [])]
        if m2: diff.append((d, m2[0])); B.remove(m2[0])
        else: only_c.append(d)
        continue
    b = m[0]; B.remove(b)
    (ok if len(b.get('L') or []) == len(d['L']) else diff).append((d, b) if len(b.get('L') or []) != len(d['L']) else d)
print(f'{day}: у Claude {len(C)}, у бота {len(g.get("docs") or [])}; совпало {len(ok)}, расхождений {len(diff)}, только у Claude {len(only_c)}, только у бота {len(B)}')
for d, b in diff: print('  ≠', d['s'], d['doc'], d['t'], '| бот:', b.get('s'), b.get('doc'), b.get('total'), 'строк', len(b.get('L') or []), 'vs', len(d['L']), '|', b.get('why') or '')
for d in only_c: print('  только Claude:', d['s'], d['doc'], d['t'])
for b in B: print('  только бот:', b.get('s'), b.get('doc'), b.get('total'), ('✓' if b.get('ok') else '✗ ' + (b.get('why') or '')))
print('пропущено ботом:', len(g.get('skipped') or []), 'вызовов ИИ:', g.get('calls'))
