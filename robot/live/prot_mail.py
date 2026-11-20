# «Фабрика» — протоколы переговоров с поставщиками из ящика 1c@ → «Документы → Протоколы переговоров» (19.11.2026).
# Т. В. 13.11: «всему отделу МТС — протоколы переговоров с поставщиками приложить в раздел МТС»; 19.11: «надо автоматизировать роботом».
# Письма с темой «Протокол переговоров — <поставщик>» (itm_arch.py уже сохранил вложения в arch/files/<sha24><ext>) → каждый файл —
# зашифрованный st/f/<sha24>.bin (publish_file), список — st/prot.bin. Ничего не удаляет и писем не трогает. Python 3.6.
import os, re, json, datetime

SUBJ = re.compile(r'протокол\w*\s+переговор\w*', re.I)
EXT = ('.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.odt', '.rtf')
FILE_MAX = 8 * 1024 * 1024


def supplier(subj):
    s = re.sub(r'^\s*((re|fw|fwd|ответ|пересл)\s*:\s*)+', '', str(subj or ''), flags=re.I)
    m = re.search(r'протокол\w*\s+переговор\w*\s*(?:с\s+)?[—–\-:"]*\s*(.+)$', s, re.I)
    sup = (m.group(1) if m else '').strip(' "—–-:.')
    return sup[:80] or 'поставщик не указан'


def _ext(n):
    return os.path.splitext(str(n or ''))[1].lower()


def run(L, log, jload, jsave, publish, publish_file, now):
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    if not os.path.exists(idx): return {'state': 'нет реестра писем'}
    st = jload('prot.json', {}) or {}
    items = {x['fid']: x for x in st.get('items') or []}
    new = 0
    with open(idx, encoding='utf-8') as f:
        for ln in f:
            if 'ротокол' not in ln: continue
            try: r = json.loads(ln)
            except Exception: continue
            if r.get('dup') or not SUBJ.search(r.get('s') or ''): continue
            for a in r.get('a') or []:
                sha, ext = a.get('sha') or '', _ext(a.get('n'))
                if not a.get('p') or not re.match(r'^[0-9a-f]{24}$', sha) or ext not in EXT or sha in items: continue
                p = os.path.join(L, 'arch', 'files', sha + ext)
                if not os.path.exists(p) or os.path.getsize(p) > FILE_MAX: continue
                with open(p, 'rb') as fh: raw = fh.read()
                if not publish_file(sha, raw): continue
                items[sha] = {'fid': sha, 't': str(r.get('t') or '')[:16], 'fr': str(r.get('fr') or '')[:60], 'sup': supplier(r.get('s')),
                              'n': str(a.get('n') or '')[:120], 'sz': len(raw), 's': str(r.get('s') or '')[:160]}
                new += 1
    L_ = sorted(items.values(), key=lambda x: x['t'], reverse=True)[:500]
    st['items'] = L_
    if new or not st.get('pub'):
        if publish('prot.bin', {'v': 1, 't': now.strftime('%Y-%m-%dT%H:%M'), 'items': L_}): st['pub'] = now.strftime('%Y-%m-%dT%H:%M')
    jsave('prot.json', st)
    return {'state': 'ok', 'n': len(L_), 'new': new}
