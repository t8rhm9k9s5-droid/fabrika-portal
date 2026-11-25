# Сверка «План 2D» ↔ «Модель 3D» по действующей версии портала (правило 25.11: одни и те же объекты, названия, привязки). 25.11.2026
import json, re, sys, collections
S = 'REDACTED_B64_33'
site = json.load(open(S + 'site.json')); p = open(S + 'plan_live.html', encoding='utf-8').read()
B3 = {b['k']: b for b in site['buildings']}
b2 = collections.Counter(re.findall(r'<path class="bld[^"]*" data-b="([^"]+)"', p))
lab = {}
for k, t in re.findall(r'<text class="blab[^"]*" data-lb="([^"]+)"[^>]*>([^<]*)</text>', p): lab.setdefault(k, []).append(t)
# карточки плана: объект с названиями по ключу
m = re.search(r'var\s+(\w+)\s*=\s*(\{"b\d+[^;]{50,})', p); cards = {}
for mm in re.finditer(r'(?:var|const|let)\s+(\w+)\s*=\s*(\{|\[)', p):
    try:
        o, _ = json.JSONDecoder().raw_decode(p[mm.end() - 1:])
    except Exception: continue
    if isinstance(o, dict) and sum(1 for k in o if re.match(r'b\d+', k)) > 20: cards[mm.group(1)] = o
    if isinstance(o, list) and len(o) > 20 and isinstance(o[0], dict) and ('k' in o[0] or 'id' in o[0]) and 'name' in o[0]: cards[mm.group(1)] = {(x.get('k') or x.get('id')): x for x in o}
print('3D зданий', len(B3), '· 2D контуров', len(b2), '· подписей', len(lab), '· наборы карточек плана:', {k: len(v) for k, v in cards.items()})
out = []
only3 = sorted(set(B3) - set(b2)); only2 = sorted(set(b2) - set(B3))
out.append('Есть в 3D, нет контура на 2D (%d): ' % len(only3) + '; '.join('%s «%s»' % (k, B3[k].get('name', '')) for k in only3))
out.append('Есть на 2D, нет в 3D (%d): ' % len(only2) + '; '.join('%s «%s»' % (k, ' / '.join(lab.get(k, []))) for k in only2))
C = next(iter(cards.values())) if cards else {}
diff = []
for k in sorted(set(B3) & set(C)):
    n3 = (B3[k].get('name') or '').strip(); n2 = (C[k].get('name') or C[k].get('n') or '').strip() if isinstance(C[k], dict) else str(C[k])
    if n3 != n2: diff.append('%s: 3D «%s» / 2D «%s»' % (k, n3, n2))
out.append('Названия расходятся в карточках (%d): ' % len(diff) + '; '.join(diff))
nolab = sorted(k for k in b2 if k not in lab and k in B3)
out.append('Контур на 2D без подписи (%d): ' % len(nolab) + '; '.join('%s «%s»' % (k, B3[k].get('name', '')) for k in nolab))
# привязки: камеры, сети, зоны, отопление
hosts = collections.Counter(c.get('host') for c in site['cams']); badh = sorted(str(h) for h in hosts if h and h not in B3)
out.append('Камеры: %d, привязано к зданиям %d, без привязки %d, к несуществующим зданиям: %s' % (len(site['cams']), sum(v for h, v in hosts.items() if h in B3), hosts.get(None, 0) + hosts.get('', 0), ', '.join(badh) or 'нет'))
def refs(o, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            if k in ('host', 'b', 'bld', 'building', 'to', 'from', 'k_b') and isinstance(v, str) and re.match(r'b[A-Za-z0-9]+$', v): acc[v] += 1
            refs(v, acc)
    elif isinstance(o, list):
        for x in o: refs(x, acc)
for name in ('utils', 'power', 'net', 'fiber', 'gasdev', 'heat', 'zones', 'misc', 'equip2', 'fleet', 'netlinks', 'devs', 'radio'):
    acc = collections.Counter(); refs(site.get(name), acc); bad = sorted(k for k in acc if k not in B3)
    if acc or bad: out.append('%s: ссылок на здания %d, на несуществующие: %s' % (name, sum(acc.values()), ', '.join(bad) or 'нет'))
h = site.get('heat') or {}; out.append('Отопление (heat): ключи %s' % {k: (len(v) if hasattr(v, '__len__') else v) for k, v in h.items()})
noname = sorted(k for k, b in B3.items() if not (b.get('name') or '').strip() or re.match(r'(Нежилое здание|Здание|Строение)\b', b.get('name') or ''))
out.append('3D: здания без рабочего названия (%d): ' % len(noname) + '; '.join('%s «%s»' % (k, B3[k].get('name', '')) for k in noname))
dup = [n for n, c in collections.Counter((b.get('name') or '').strip() for b in B3.values()).items() if c > 1 and n]
out.append('3D: одинаковые названия у разных зданий: ' + ('; '.join(dup) or 'нет'))
open('/home/claude/fabrika/work/tidy/map_audit_2511.md', 'w', encoding='utf-8').write('\n\n'.join(out)); print('\n'.join(x[:900] for x in out))
