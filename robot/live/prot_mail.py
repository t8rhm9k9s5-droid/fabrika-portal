# «Фабрика» — протоколы переговоров с поставщиками из ящика 1c@ → «Документы → Протоколы переговоров» (19.11.2026; карточки — 28.11.2026, №421).
# Т. В. 13.11: «всему отделу МТС — протоколы переговоров с поставщиками приложить в раздел МТС»; 19.11: «надо автоматизировать роботом».
# Письма с темой «Протокол переговоров — <поставщик>» (itm_arch.py уже сохранил вложения в arch/files/<sha24><ext>) → каждый файл —
# зашифрованный st/f/<sha24>.bin (publish_file), список — st/prot.bin. Ничего не удаляет и писем не трогает. Python 3.6.
# 28.11.2026 (№421): из файла протокола (Word .docx, PDF с текстом, Excel) робот сам достаёт карточку: номер, дата, поставщик, участники,
#   решения и договорённости (форма ПП 01 «Протокол переговоров» из «Документов → Регламенты» и протоколы свободной формы). Один документ
#   в нескольких форматах (pdf + docx с одним именем в одном письме) — одна карточка. Скан без текста — карточка по теме письма и имени файла
#   («поля в файле»). Ответы на рассылку «Протоколы переговоров с поставщиками — на портал» — поставщик не из темы, а из файла.
#   prot.bin v2 совместим с прежней страницей: у карточки остаются fid/n/sz/t/sup/s (первый файл).
import os, re, json, html, zipfile, unicodedata, datetime

SUBJ = re.compile(r'протокол\w*\s+переговор\w*', re.I)
SUBJ_OMTS = re.compile(r'протокол\w*\s+(разноглас|согласовани\w*\s+(договорн\w*\s+)?цен)', re.I)   # такие темы — только от сотрудников ОМТС
OMTS_FROM = re.compile(r'^(sn|snab[\w\-]*|ls)@fabrikant\.su$', re.I)
REQ_SUBJ = re.compile(r'протокол\w*\s+переговор\w*\s+с\s+поставщикам\w*', re.I)            # наша рассылка 16.11 и ответы на неё
EXT = ('.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.odt', '.rtf')
PRIO = ('.docx', '.pdf', '.xlsx', '.xls', '.odt', '.rtf', '.doc', '.jpg', '.jpeg', '.png')      # из какого файла карточка
FILE_MAX = 8 * 1024 * 1024
IMG_MIN = 40 * 1024                # снимок протокола; логотипы и картинки подписи мельче
PDF_PAGES = 10
KEEP = 300
PARSE_V = 2
OWN = re.compile(r'жилпромсервис|фабрик\w*\s+торгов|промкомплекс|фабрикант|\bрегин\b', re.I)
RE_ = re.compile(r'^\s*((re|fw|fwd|ответ|отв|пересл)(\[\d+\])?\s*:\s*)+', re.I)


def supplier(subj):
    s = RE_.sub('', str(subj or ''))
    if REQ_SUBJ.search(s): return ''
    m = re.search(r'протокол\w*\s+(?:переговор\w*|разноглас\w*|согласовани\w*(?:\s+договорн\w*)?\s+цен\w*)\s*(?:с\s+)?[—–\-:"]*\s*(.+)$', s, re.I)
    sup = (m.group(1) if m else '').strip(' "—–-:.')
    return sup[:80]


def _ext(n):
    return os.path.splitext(str(n or ''))[1].lower()


def _stem(n):
    s = unicodedata.normalize('NFC', os.path.splitext(str(n or ''))[0]).lower().replace('ё', 'е')
    return re.sub(r'\.(docx?|pdf|xlsx?)$', '', re.sub(r'\s*\(\d\)\s*$', '', s)).strip()


# REDACTED_B64_9 текст файла
def _docx_lines(xml):
    """document.xml → строки: абзацы как есть, строка таблицы — «ячейка | ячейка» (вложенные таблицы — тоже)"""
    out, par, stack = [], [], []
    for m in re.finditer(r'<(/?)w:(p|tc|tr|t|tab|br)\b([^>]*?)(/?)>([^<]*)', xml):
        close, tag, attrs, selfc, txt = m.groups()
        if tag == 't':
            if not close and not selfc: par.append(html.unescape(txt))
        elif tag == 'tab': par.append(' ')
        elif tag == 'br': par.append(' ')
        elif tag == 'p' and (close or selfc):
            s = ' '.join(''.join(par).split()); par = []
            if s:
                if stack and stack[-1][0] == 'tc': stack[-1].append(s)
                else: out.append(s)
        elif tag == 'tc':
            if not close and not selfc: stack.append(['tc'])
            elif close and stack and stack[-1][0] == 'tc':
                c = stack.pop()
                if stack and stack[-1][0] == 'tr': stack[-1].append(' '.join(c[1:]))
        elif tag == 'tr':
            if not close and not selfc: stack.append(['tr'])
            elif close and stack and stack[-1][0] == 'tr':
                cells = stack.pop()[1:]
                if any(cells):
                    line = ' | '.join(cells)
                    if stack and stack[-1][0] == 'tc': stack[-1].append(line)
                    else: out.append(line)
    return out


def text_of(path):
    """→ (строки, причина пусто). Файлы из почты — сначала safe_doc (размер, zip-бомба, DOCTYPE), как omts/docs_sum."""
    import safe_doc as SAFE
    bad = SAFE.check_file(path)
    if bad: return [], 'небезопасный файл: ' + bad
    ext = _ext(path)
    try:
        if ext == '.docx':
            with zipfile.ZipFile(path) as z: xml = z.read('word/document.xml').decode('utf-8', 'replace')
            return _docx_lines(xml), ''
        if ext == '.odt':
            with zipfile.ZipFile(path) as z: xml = z.read('content.xml').decode('utf-8', 'replace')
            xml = re.sub(r'</text:(p|h)>|<text:line-break/>', '\n', xml)
            return [x for x in (' '.join(html.unescape(re.sub(r'<[^>]+>', ' ', ln)).split()) for ln in xml.split('\n')) if x], ''
        if ext == '.pdf':
            import pypdf
            R = pypdf.PdfReader(path); out = []
            for i, pg in enumerate(R.pages):
                if i >= PDF_PAGES: break
                try: t = pg.extract_text() or ''
                except Exception: t = ''
                out += [' '.join(x.split()) for x in t.split('\n') if x.strip()]
            return out, ('' if sum(len(x) for x in out) > 40 else 'скан без текста')
        if ext in ('.xls', '.xlsx'):
            import omts as OM
            return [' | '.join(x for x in r if x) for r in OM.read_rows(path) if any(r)][:400], ''
        if ext in ('.jpg', '.jpeg', '.png'): return [], 'скан (фото)'
        if ext == '.doc': return [], 'старый формат Word (.doc) — поля в файле'
        return [], 'формат не разбирается'
    except Exception as e:
        return [], 'не прочитался (%s)' % e.__class__.__name__


# REDACTED_B64_9 разбор протокола
MON = (('январ', 1), ('феврал', 2), ('март', 3), ('апрел', 4), ('ма', 5), ('июн', 6), ('июл', 7), ('август', 8), ('сентябр', 9), ('октябр', 10), ('ноябр', 11), ('декабр', 12))   # «март» раньше «ма»
D_NUM = r'(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2})(?!\d)'
D_TXT = r'«?(\d{1,2})»?\s+(январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)[а-я]*\s+(\d{4})'
NAME = (r'[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+(?:[А-ЯЁ]\.\s?[А-ЯЁ]\.?|[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+(?:вич|вна|ична|чна|оглы|кызы))'
        r'|[А-ЯЁ]\.\s?[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?')
ORG = re.compile(r'\b(ООО|ОАО|ЗАО|ПАО|АО|ТОО|ИП|ТД|ООО\s+ТД|ООО\s+ПКФ|НПО|ПК)\s*[«"“]?\s*([^«»"”|\n;,]{1,60}?)\s*[»"”]|\bИП\s+(' + NAME + ')')
SEC_WHO = re.compile(r'^(?:\d+\s*)?(участники|присутствовали|присутствуют|в\s+переговорах\s+(?:участвовали|приняли\s+участие)|состав\s+участников)\b', re.I)
SEC_DEC = re.compile(r'^(?:\d+\s*)?(итоги\s+встречи|решени[ея]\s+по\s+итогам(?:\s+(?:встречи|переговоров))?|решили|постановили|приняты\s+решения|принятые\s+решения|по\s+итогам\s+(?:переговоров|встречи)'
                     r'|стороны\s+договорились|договорились|результаты\s+переговоров)', re.I)
SEC_AGR = re.compile(r'^(?:\d+\s*)?договор[её]нност', re.I)
SEC_END = re.compile(r'^(подпис|с\s+уважением|форма\s+пп\b|лист\s+\d+\s+из|м\.\s?п\.|согласовано\s*:?$|утверждаю|протокол\s+составил)', re.I)
SEC_OTHER = re.compile(r'^(?:\d+\s*)?(повестка|тема\b|слушали|обсуждали|рассмотрели|вопросы)', re.I)


def _iso(d, mo, y):
    y = int(y); y = y + 2000 if y < 100 else y
    try: return datetime.date(y, int(mo), int(d)).isoformat() if 2015 <= y <= 2035 else None
    except ValueError: return None


def find_date(s):
    m = re.search(D_NUM, s)
    a = _iso(*m.groups()) if m else None
    m2 = re.search(D_TXT, s, re.I)
    b = None
    if m2:
        mo = next(v for k, v in MON if m2.group(2).lower().startswith(k))
        b = _iso(m2.group(1), mo, m2.group(3))
    if a and b: return a if m.start() < m2.start() else b
    return a or b


def _flat(ln): return ' '.join(x for x in ln.split(' | ') if x.strip())


def _org(s):
    for m in ORG.finditer(s or ''):
        if m.group(3): v = 'ИП ' + m.group(3)
        else: v = '%s «%s»' % (m.group(1), m.group(2).strip())
        if not OWN.search(v): return v[:80]
    return ''


def _cut(s, n=300): s = ' '.join(str(s or '').split()); return s if len(s) <= n else s[:n - 1].rstrip() + '…'


def parse(lines):
    """строки протокола → {kind, no, d, topic, by, who[{n,r}], dec[], agr[{x,who,due}], sup}"""
    L = [x for x in (ln.strip(' |') for ln in lines) if x]
    F = [_flat(x) for x in L]
    full = '\n'.join(F)
    c = {}
    k = 'Протокол переговоров'
    if re.search(r'протокол\w*\s+разноглас', full[:3000], re.I): k = 'Протокол разногласий'
    elif re.search(r'протокол\w*\s+согласовани\w*\s+(?:договорн\w*\s+)?цен', full[:3000], re.I): k = 'Протокол согласования цен'
    c['kind'] = k
    m = re.search(r'протокол\w*[^\n№]{0,80}№\s*([\w\-/.]*\d[\w\-/.]*)', full, re.I) or re.search(r'^№\s*([\w\-/.]*\d[\w\-/.]*)', full, re.M)
    if m: c['no'] = m.group(1).strip('.')[:20]
    d = None
    for x in F[:40]:
        mm = re.search(r'\bдата\b\s*(?:проведения|встречи|переговоров)?\s*[:\-]?\s*(.{0,40})', x, re.I)
        if mm and find_date(mm.group(1)): d = find_date(mm.group(1)); break
    if not d:
        for x in F[:25]:
            if re.search(r'протокол|\bот\b|\bг\.\s|«\d', x, re.I) and find_date(x) and not re.search(r'приказ|утвержден|введен', x, re.I): d = find_date(x); break
    if d: c['d'] = d
    for x in L[:60]:
        cells = [y.strip() for y in x.split(' | ')]
        h = cells[0]
        if re.match(r'^(тема|повестка(\s+дня)?|предмет\s+переговоров)\b', h, re.I):
            v = ' '.join(cells[1:]) if len(cells) > 1 else re.sub(r'^(тема|повестка(\s+дня)?|предмет\s+переговоров)\s*[:\-—]?\s*', '', h, flags=re.I)
            if v.strip() and 'topic' not in c: c['topic'] = _cut(v, 200)
        if re.match(r'^протокол\s+составил', h, re.I):
            v = re.sub(r'\(?ФИО,?\s*должность\)?', '', ' '.join(cells[1:]) if len(cells) > 1 else h[len('протокол составил'):], flags=re.I).strip(' :—-')
            if v: c['by'] = _cut(v, 120)
    # разделы
    who, dec, agr, sec, org_pref = [], [], [], None, ''
    for x in L:
        f = _flat(x); cells = [y.strip() for y in x.split(' | ')]
        if SEC_WHO.match(f): sec = 'who'; rest = SEC_WHO.sub('', f).strip(' :—-'); f = rest; cells = [rest]
        elif SEC_AGR.match(f) and not (sec == 'agr'): sec = 'agr'; continue
        elif SEC_DEC.match(f):
            sec = 'dec'; rest = SEC_DEC.sub('', f).strip(' :—-')
            rest = re.sub(r'^(по\s+итогам\s+встречи\s*)?:?\s*', '', rest, flags=re.I) if rest.lower().startswith('по итогам') else rest
            rest = re.sub(r'^(стороны\s+)?(договорились|решили|пришли\s+к\s+(соглашению|следующему))\s*:?\s*', '', rest, flags=re.I)
            if len(cells) > 1: rest = ' '.join(cells[1:])
            if rest and len(rest) > 3: dec.append(rest)
            continue
        elif SEC_END.match(f): sec = None; continue
        elif SEC_OTHER.match(f) and sec == 'who': sec = None; continue
        if not f: continue
        if sec == 'who':
            if re.match(r'^фио\b', f, re.I): continue
            mo = re.match(r'^от\s+(.{2,80}?)\s*(?::|\s[—–-]\s)\s*(.*)$', f, re.I)
            if mo and not re.search(NAME, mo.group(1)): org_pref = mo.group(1).strip(); f = mo.group(2); cells = [f]
            if len(cells) > 1 and re.search(NAME, cells[0]):
                who.append({'n': _cut(cells[0], 60), 'r': _cut(', '.join(y for y in cells[1:] if y) or org_pref, 120)}); continue
            for part in re.split(r';\s*|\s*\n\s*', f):
                mm = re.search(NAME, part)
                if not mm: continue
                role = (part[:mm.start()] + ' ' + part[mm.end():]).strip(' ,—-–:()')
                if org_pref and org_pref.lower() not in role.lower(): role = (role + ', ' if role else '') + org_pref
                who.append({'n': mm.group(0), 'r': _cut(role, 120)})
        elif sec == 'dec':
            v = re.sub(r'^\s*(\d{1,2}[.)]|[-–—•·])\s*', '', f)
            if re.match(r'^\d{1,2}$', f) or not v: continue
            if re.match(r'^\s*(\d{1,2}[.)]|[-–—•·])\s+', f) or not dec: dec.append(v)
            else: dec[-1] = dec[-1] + ' ' + v
        elif sec == 'agr':
            if re.match(r'^№\s*\|?\s*договор', x, re.I) or re.match(r'^№?\s*договор[её]нность\b', f, re.I): continue
            if len(cells) >= 2:
                cc = cells[1:] if re.match(r'^\d{1,2}\.?$', cells[0]) else cells
                if not any(cc) or not cc[0]: continue
                agr.append({'x': _cut(cc[0]), 'who': _cut(cc[1] if len(cc) > 1 else '', 60), 'due': _cut(cc[2] if len(cc) > 2 else '', 30)})
            elif not re.match(r'^\d{1,2}$', f):
                v = re.sub(r'^\s*\d{1,2}[.)]?\s+', '', f)
                if re.match(r'^\s*\d{1,2}[.)]?\s+', f) or not agr: agr.append({'x': _cut(v), 'who': '', 'due': ''})
                else: agr[-1]['x'] = _cut(agr[-1]['x'] + ' ' + v)
    seen = set(); who2 = []
    for w in who:
        key = re.sub(r'[\s.]', '', w['n']).lower()
        if key not in seen: seen.add(key); who2.append(w)
    if who2: c['who'] = who2[:12]
    if dec: c['dec'] = [_cut(x) for x in dec[:15]]
    if agr: c['agr'] = agr[:15]
    sup = ''
    for x in F[:30]:
        if re.search(r'поставщик|между|с\s+(ООО|АО|ЗАО|ПАО|ОАО|ИП)\b|^от\s', x, re.I): sup = _org(x)
        if sup: break
    sup = sup or _org(' '.join(w['r'] for w in who2)) or _org(full[:4000])
    if sup: c['sup'] = sup
    return c


def _sup_from_name(n):
    s = os.path.splitext(unicodedata.normalize('NFC', str(n or '')))[0]
    o = _org(s.replace('_', ' '))
    if o: return o
    s = re.sub(r'протокол\w*|переговор\w*|разноглас\w*|согласовани\w*|цен\w*|скан\w*|\bс\b|№\s*\S+|\d[\d._\-]*|копия', ' ', s, flags=re.I)
    s = ' '.join(re.sub(r'[_\-–—()]+', ' ', s).split())
    return s[:60] if len(re.findall(r'[А-Яа-яA-Za-z]', s)) >= 3 and not OWN.search(s) else ''


def card(r, group, L, sup_subj, single):
    """письмо r + файлы одного документа group [(a, path, raw|None)] → карточка (поля для портала)"""
    files = [{'fid': a['sha'], 'n': str(a.get('n') or '')[:120], 'sz': sz} for a, p, sz in group]
    e = {'id': files[0]['fid'], 'fid': files[0]['fid'], 'n': files[0]['n'], 'sz': files[0]['sz'], 'files': files,
         't': str(r.get('t') or '')[:16], 'mid': str(r.get('mid') or '')[:16], 'fr': str(r.get('fr') or '')[:60],
         'from': str(r.get('n') or '')[:60], 'box': '1c@' if r.get('f') == 'ящик 1c@' else 'itm@',
         's': str(r.get('s') or '')[:160], 'pv': PARSE_V}
    P, why = {}, 'файл уже убран с хостинга'
    for a, p, sz in group:
        if not p or not os.path.exists(p): continue
        lines, why = text_of(p)
        if lines:
            P = parse(lines); why = ''
            break
    e.update({k: v for k, v in P.items() if k != 'sup'})
    e['kind'] = P.get('kind') or ('Протокол разногласий' if re.search(r'разноглас', e['s'] + e['n'], re.I) else
                                  'Протокол согласования цен' if re.search(r'согласовани\w*\s+(договорн\w*\s+)?цен', e['s'] + e['n'], re.I) else 'Протокол переговоров')
    e['sup'] = (sup_subj if sup_subj and single else '') or P.get('sup') or _sup_from_name(e['n']) or sup_subj or 'поставщик не указан'
    if not e.get('d'):
        d = find_date(e['n'].replace('_', '.'))
        e['d'], e['dsrc'] = (d, 'файл') if d else (e['t'][:10], 'письмо')
    else: e['dsrc'] = 'документ'
    e['st'] = 'ok' if (e.get('who') or e.get('dec') or e.get('agr')) and (e.get('no') or e['dsrc'] == 'документ') else ('part' if P else 'file')
    if why: e['why'] = why
    return e


def _want(r):
    s = str(r.get('s') or '')
    if SUBJ.search(s): return True
    return bool(SUBJ_OMTS.search(s) and OMTS_FROM.match(str(r.get('fr') or '')))


def _norm(s): return ' '.join(re.sub(r'[^0-9a-zа-я]+', ' ', str(s or '').lower().replace('ё', 'е')).split())


def run(L, log, jload, jsave, publish, publish_file, now):
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    if not os.path.exists(idx): return {'state': 'нет реестра писем'}
    st = jload('prot.json', {}) or {}
    cards = {x.get('id') or x['fid']: x for x in st.get('items') or []}
    f2c = {}
    for cid, x in cards.items():
        for f in x.get('files') or [{'fid': x['fid']}]: f2c[f['fid']] = cid
    new = upd = 0
    with open(idx, encoding='utf-8') as fh:
        for ln in fh:
            if 'ротокол' not in ln: continue
            try: r = json.loads(ln)
            except Exception: continue
            if r.get('dup') or not _want(r): continue
            groups = {}
            for a in r.get('a') or []:
                sha, ext = a.get('sha') or '', _ext(a.get('n'))
                if not a.get('p') or not re.match(r'^[0-9a-f]{24}$', sha) or ext not in EXT: continue
                if ext in ('.jpg', '.jpeg', '.png') and (int(a.get('sz') or 0) < IMG_MIN or re.match(r'^(image|img_?logo|logo|signature|подпись)\d*\.', str(a.get('n') or ''), re.I)): continue
                groups.setdefault(_stem(a.get('n')), []).append(a)
            sup_subj = supplier(r.get('s'))
            for stem, ga in groups.items():
                ga = sorted(ga, key=lambda a: PRIO.index(_ext(a.get('n'))))
                olds = [cards[f2c[a['sha']]] for a in ga if a['sha'] in f2c]
                if olds and all(o.get('pv') == PARSE_V for o in olds): continue           # уже разобрано
                group, ok = [], True
                for a in ga:
                    p = os.path.join(L, 'arch', 'files', a['sha'] + _ext(a.get('n')))
                    if os.path.exists(p) and os.path.getsize(p) <= FILE_MAX:
                        with open(p, 'rb') as fb: raw = fb.read()
                        if not publish_file(a['sha'], raw): ok = False; break          # не выложился — письмо разберём в следующий проход
                        group.append((a, p, len(raw)))
                    elif a['sha'] in f2c:                                               # старая запись (до 28.11): файл уже выложен, на хостинге удалён
                        o = cards[f2c[a['sha']]]
                        group.append((a, None, next((f.get('sz') for f in o.get('files') or [o] if f.get('fid') == a['sha']), 0) or 0))
                if not ok or not group: continue
                e = card(r, group, L, sup_subj, len(groups) == 1)
                for o in olds: cards.pop(o.get('id') or o['fid'], None)
                cards[e['id']] = e
                for f in e['files']: f2c[f['fid']] = e['id']
                if olds: upd += 1
                else: new += 1
    # один документ дважды (прислали повторно другим файлом): тот же поставщик, номер и дата — на портал только последнее письмо
    allc = sorted(cards.values(), key=lambda x: (x.get('d') or '', x.get('t') or ''), reverse=True)[:KEEP]
    seen, out = {}, []
    for x in sorted(allc, key=lambda x: x.get('t') or '', reverse=True):
        x = dict(x); x.pop('resent', None)
        k =(_norm(x.get('sup')), x.get('no'), x.get('d')) if x.get('no') else None
        if k and k in seen: seen[k]['resent'] = seen[k].get('resent', 0) + 1; continue
        if k: seen[k] = x
        out.append(x)
    out.sort(key=lambda x: (x.get('d') or '', x.get('t') or ''), reverse=True)
    st['items'] = allc
    if new or upd: st['dirty'] = True
    if st.get('dirty') or not st.get('pub'):
        if publish('prot.bin', {'v': 2, 't': now.strftime('%Y-%m-%dT%H:%M'), 'items': out}) is not False:
            st['pub'] = now.strftime('%Y-%m-%dT%H:%M'); st.pop('dirty', None)
    jsave('prot.json', st)
    return {'state': 'ok', 'n': len(out), 'new': new, 'upd': upd, 'ok': sum(1 for x in out if x.get('st') == 'ok'),
            'file': sum(1 for x in out if x.get('st') == 'file')}
