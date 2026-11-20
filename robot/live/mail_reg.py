# «Фабрика» — системная повторяющаяся информация из ящика 1c@ → «Документы» портала (19.11.2026).
# Т. В. 19.11: «Найди место на портале для этой информации. Никакой лишней информации не бывает… если это системная информация, которая
#   повторяется. Служебные записки не нужны, если не относятся к качеству или к производству, кратности поставок и прочим».
# Источник — реестр писем state/arch_index.jsonl (itm_arch.py уже сохранил вложения в arch/files/<sha24><ext>).
# Каждое письмо подходящего вида → строка реестра; вложения — зашифрованные st/f/<sha24>.bin (publish_file); список — st/mreg.bin.
# Ничего не удаляет, писем не трогает. Python 3.6.
import os, re, json

EXT = ('.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.odt', '.rtf')
FILE_MAX = 8 * 1024 * 1024
KEEP = 300                       # строк на вид
RE_ = re.compile(r'^\s*((re|fw|fwd|ответ|пересл)(\[\d+\])?\s*:\s*)+', re.I)
MEMO = re.compile(r'служебн\w*\s+записк|^\s*сз\b', re.I)
MEMO_OK = re.compile(r'качеств|рекламац|брак|производ|выпуск|кратност|поставк|накладн|снабжен|омтс|материал|оснастк|отк\b', re.I)
OFFICE = {'samara': 'Самара', 'kra': 'Краснодар', 'crimea': 'Симферополь', 'ural': 'Екатеринбург', 'nn': 'Н. Имя3',
          'spb': 'Санкт-Петербург', 'msk': 'Москва', 'uz': 'Узбекистан'}
# вид: (название, отправитель, тема) — первый подошедший
KINDS = [
    ('omtsreg', 'Реестр заявок ОМТС', lambda fr, s: fr == 'user3@example.org' and re.search(r'реестр\s+заявок\s+омтс', s, re.I)),
    ('export', 'Экспорт: Узбекистан и Казахстан', lambda fr, s: fr.startswith('uz@') or re.search(r'алмат|карши|ташкент|андижан|казахстан|узбекистан|экспорт', s, re.I)),
    ('opexp', 'Расходы офисов продаж', lambda fr, s: (_office(fr) or (fr.startswith('mit@') and re.search(r'краснодар|самар|симферопол|екатеринбург|нижн\w* новгород|\bнн\b|москв|оп\b', s, re.I))) and re.search(r'сч[её]т|акт\b|акты|аренд|грузчик|разгруз|гсм|электроэнерг|уборк|коммунал|оплат', s, re.I)),
    ('mdog', 'Договоры из почты', lambda fr, s: re.search(r'договор', s, re.I) and not re.search(r'типов\w* договор|замечани', s, re.I)),
]


def _office(fr):
    m = re.match(r'([a-z]+)(?:[-_]?\d+)?@fabrikant\.su$', fr or '')
    return OFFICE.get(m.group(1)) if m else None


def _ext(n):
    return os.path.splitext(str(n or ''))[1].lower()


def kind(fr, subj):
    s = RE_.sub('', str(subj or ''))
    if MEMO.search(s) and not MEMO_OK.search(s): return None          # служебки — только про качество, производство, поставки
    for k, _n, f in KINDS:
        if f(fr or '', s): return k
    if MEMO.search(s): return 'memo_q'
    return None


NAMES = dict((k, n) for k, n, _f in KINDS)
NAMES['memo_q'] = 'Служебные записки: качество, производство, поставки'


def run(L, log, jload, jsave, publish, publish_file, now):
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    if not os.path.exists(idx): return {'state': 'нет реестра писем'}
    st = jload('mreg.json', {}) or {}
    seen = set(st.get('seen') or [])
    cats = st.get('cats') or {}
    new = files = 0
    with open(idx, encoding='utf-8') as f:
        for ln in f:
            try: r = json.loads(ln)
            except Exception: continue
            if r.get('dup') or r.get('mid') in seen: continue
            fr = str(r.get('fr') or '').lower()
            k = kind(fr, r.get('s'))
            if not k: continue
            fl = []
            for a in r.get('a') or []:
                sha, ext = a.get('sha') or '', _ext(a.get('n'))
                if not a.get('p') or not re.match(r'^[0-9a-f]{24}$', sha) or ext not in EXT: continue
                p = os.path.join(L, 'arch', 'files', sha + ext)
                if not os.path.exists(p) or os.path.getsize(p) > FILE_MAX: continue
                with open(p, 'rb') as fh: raw = fh.read()
                if not publish_file(sha, raw): continue                    # файл не выложен — письмо разберём в следующий проход
                fl.append({'fid': sha, 'n': str(a.get('n') or '')[:120], 'sz': len(raw)}); files += 1
            if len(fl) < len([a for a in r.get('a') or [] if a.get('p') and _ext(a.get('n')) in EXT]): continue
            cats.setdefault(k, []).append({'t': str(r.get('t') or '')[:16], 'fr': fr[:60], 'who': str(r.get('n') or '')[:60],
                                           'of': _office(fr) or '', 's': RE_.sub('', str(r.get('s') or ''))[:180], 'files': fl})
            seen.add(r.get('mid')); new += 1
    for k in cats: cats[k] = sorted(cats[k], key=lambda x: x['t'], reverse=True)[:KEEP]
    st['cats'] = cats; st['seen'] = list(seen)[-20000:]
    if new: st['dirty'] = True
    if st.get('dirty') or not st.get('pub'):                              # не выложилось — повтор в следующий проход
        if publish('mreg.bin', {'v': 1, 't': now.strftime('%Y-%m-%dT%H:%M'), 'names': NAMES, 'cats': cats}) is not False:
            st['pub'] = now.strftime('%Y-%m-%dT%H:%M'); st.pop('dirty', None)
    jsave('mreg.json', st)
    return {'state': 'ok', 'new': new, 'files': files, 'n': dict((k, len(v)) for k, v in cats.items())}
