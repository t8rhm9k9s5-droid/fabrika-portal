# -*- coding: utf-8 -*-
"""Реестр портала и документов (13.11.2026, Т. В.: «раз в сутки проверка целостности портала и всех его документов; сделай реестр,
реестр проверяй каждый день — документы должны отзываться по реестру»).
Запуск — build_host.sh после build_enc.py. Пишет host/live/docs_registry.json (уходит роботу пакетом кода, на сайт не выкладывается):
  {v, t, m_sha, n, items: [{p: путь на портале, b: блок b/<…>.bin, sz: размер исходника, k: doc|page|asset, t: название}]}
Робот (docs_check.py) раз в сутки проверяет: каждый блок лежит на хостинге и цел (имя блока = sha256 его содержимого), m.bin — та же сборка.
Названия документов — из library/*.json, архива и страниц; без телефонов, почт и номеров."""
import json, os, re, glob, hashlib, time
A = '/home/claude/app_build'; OUT = A + '/enc_reg'
def _rd(f, mode='r'):
    with open(f, mode, **({} if 'b' in mode else {'encoding': 'utf-8'})) as h: return h.read()

M = json.loads(_rd(A + '/enc_map.json'))
DOC_EXT = ('.pdf', '.docx', '.xlsx', '.xls', '.doc', '.pptx', '.odt', '.ods')
titles = {}
for f in glob.glob('/home/claude/library/*.json'):
    try: d = json.loads(_rd(f))
    except Exception: continue
    def walk(x):
        if isinstance(x, dict):
            t = x.get('title') or x.get('t') or x.get('name')
            for k in ('file', 'orig', 'src'):
                v = x.get(k)
                if isinstance(v, str) and v.lower().endswith(DOC_EXT) and t:
                    titles.setdefault('library/' + v.replace('raw/', '', 1).replace('library/', '', 1), str(t)[:120])
            for v in x.values(): walk(v)
        elif isinstance(x, list):
            for v in x: walk(v)
    walk(d)
try:   # архив — названия из страницы архива
    s = _rd('/home/claude/build/archive_frag.html')
    for m in re.finditer(r'"file":\s*"([^"]+)"[^{}]*?"title":\s*"([^"]+)"', s): titles.setdefault('archive/' + m.group(1), m.group(2)[:120])
    for m in re.finditer(r'"title":\s*"([^"]+)"[^{}]*?"file":\s*"([^"]+)"', s): titles.setdefault('archive/' + m.group(2), m.group(1)[:120])
except Exception: pass  # архив без заголовков — не критично, реестр строится по enc_map
SAFE = re.compile(r'\+?\d[\d\s()-]{8,}\d|[\w.+-]+@[\w-]+\.[\w.]+|\b\d{2}:\d{2}:\d{6,7}:\d+\b')
items = []
for p, v in sorted(M.items()):
    k = 'doc' if p.lower().endswith(DOC_EXT) else 'page' if p.endswith('.html') else 'asset'
    t = SAFE.sub('…', titles.get(p, '')) if k == 'doc' else ''
    items.append({'p': p, 'b': v[0], 'sz': v[2], 'k': k, 't': t})
m_sha = hashlib.sha256(_rd(OUT + '/m.bin', 'rb')).hexdigest() if os.path.exists(OUT + '/m.bin') else ''
reg = {'v': 1, 't': time.strftime('%Y-%m-%dT%H:%M', time.gmtime(time.time() + 3 * 3600)), 'm_sha': m_sha, 'n': len(items),
       'docs': sum(1 for i in items if i['k'] == 'doc'), 'items': items}
with open(A + '/host/live/docs_registry.json', 'w', encoding='utf-8') as h: json.dump(reg, h, ensure_ascii=False, separators=(',', ':'))
print(json.dumps({'n': reg['n'], 'docs': reg['docs'], 'with_title': sum(1 for i in items if i['t'])}, ensure_ascii=False))
