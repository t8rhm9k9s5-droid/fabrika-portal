#!/usr/bin/env python3
"""21.11.2026: фото от Рекса — ZIP он кладёт через «Выкладку» (dput, ящик rex). Забрать новые ZIP (dlist → dget частями по 8 МБ),
сложить в work/fsu/rex_in/, разложить fsu_rex_ingest.py. Уже забранные — по имени+размеру+времени (rex_in/_seen.json).
  python3 fsu_rex_fetch.py   → печатает {новых ZIP, разложено, отчёт}"""
import sys, os, json, base64, subprocess
H = os.path.dirname(os.path.abspath(__file__)); IN = os.path.join(H, 'rex_in'); os.makedirs(IN, exist_ok=True)
sys.path.insert(0, '/home/claude/fabrika/work/selfdeploy'); import dep
SEEN = os.path.join(IN, '_seen.json'); seen = json.load(open(SEEN)) if os.path.exists(SEEN) else {}
fs = [f for f in dep.call({'op': 'dlist'})['boxes'].get('rex', {}).get('files', []) if f['name'].lower().endswith('.zip')]
new = []
for f in fs:
    key = '%s|%s|%s' % (f['name'], f['size'], f['modifiedTime'])
    if key in seen: continue
    b, off = b'', 0
    while True:
        r = dep.call({'op': 'dget', 'box': 'rex', 'name': f['name'], 'off': off})
        if not r.get('ok'): print('не скачался', f['name'], r.get('error')); break
        b += base64.b64decode(r['b64']); off += 8388608
        if off >= r['size']: break
    if len(b) != int(f['size']): continue
    p = os.path.join(IN, f['name']); open(p, 'wb').write(b); new.append(p); seen[key] = 1
json.dump(seen, open(SEEN, 'w'))
out = subprocess.run(['python3', os.path.join(H, 'fsu_rex_ingest.py')] + new, capture_output=True, text=True).stdout.strip() if new else '{}'
print(json.dumps({'zip': len(new), 'ingest': json.loads(out or '{}')}, ensure_ascii=False))
