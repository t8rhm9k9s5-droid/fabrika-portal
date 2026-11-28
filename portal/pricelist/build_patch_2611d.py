# Заплатка 2611d (26.11.2026), слово Т. В.: «Продукция» — ссылки на разделы «Документов» без ~products (products.html, hub.js);
# «Прайс-листы и акции»: 10 презентаций распродажи/«со склада» из «Каталогов» сюда с пометкой «в работе»; сырую таблицу Сотрудник8 убрать,
# положить анализ цен конкурентов (PDF + Excel, ФАБ-0122); легенда ФАБ-0114 — с оригинальными страницами прайса (картинки).
# База — действующие файлы с хостинга (live_pull в scratchpad/lv2611d). Повторный запуск номер не сдвигает (номер берётся из NUMF по файлу).
import json, re, hashlib, os, shutil, pathlib, pymupdf
L = pathlib.Path('REDACTED_B64_41')
P = pathlib.Path('/home/claude/app_build/patch/2611d/plain'); T = '2026-11-26'
K = '/home/claude/fabrika/work/konkurenty/'; LEG = 'REDACTED_B64_39.pdf'
sha = lambda p: hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
RAW = 'library/prices/analiz_konkurentov_kra_2026-11-16.xlsx'
NEW = [('library/prices/analiz_cen_konkurentov_2026-11-26.pdf', K + 'analiz_cen_konkurentov_2026-11-26.pdf',
        'Анализ цен конкурентов: где мы дороже, где дешевле — 28 моделей против UTFC, Радома, Бюрократа, Тайпита, Комфура, Tetchair, Аленсио (PDF)'),
       ('library/prices/analiz_cen_konkurentov_2026-11-26.xlsx', K + 'analiz_cen_konkurentov_2026-11-26.xlsx',
        'Анализ цен конкурентов — таблицы: по моделям, все цены, Екатеринбург (Excel)')]
SRC = ('Собрано Claude 26.11.2026 по поручению Т. В. Сотрудник1 из таблицы ОП Краснодар (Сотрудник8 М. И., письмо 16.11.2026 «Стратегия цен… и анализ прайсов конкурентов»): '
       'наша цена против самой низкой и средней цены конкурентов, позиция модели; 5 предложений — на решение Т. В.')
WORK = re.compile(r'library/catalogs/(so_sklada|rasprodazha)_.*_dekabr_2026\.pdf$')

for rel, src, _ in NEW: (P / rel).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, P / rel)
(P / 'library/prices').mkdir(parents=True, exist_ok=True); shutil.copy2(LEG, P / 'library/prices/legenda_prais_2026-10-28.pdf')

lib = (L / 'library.html').read_text(encoding='utf-8'); m = re.search(r'(<script id="lib-data" type="application/json">)(.*?)(</script>)', lib, re.S)
d = json.loads(m.group(2))
S = json.loads((L / 'assets/search.json').read_text(encoding='utf-8'))
d['items'] = [i for i in d['items'] if i['file'] != RAW]
S = [s for s in S if 'analiz_konkurentov_kra' not in s.get('u', '')]
moved = []
for it in d['items']:
    if WORK.search(it['file']):
        it['cat'] = 'prices'
        if not it['title'].startswith('В работе — '): it['title'] = 'В работе — ' + it['title']
        if 'ждёт подтверждения' not in it['source']: it['source'] += '; в работе — ждёт подтверждения Сотрудник8 М. И., потом рассылка в офисы продаж'
        moved.append(it['number'])
        for s in S:
            if s.get('u', '').endswith(it['file']): s['t'] = it['title']; s['k'] = s.get('k', '') + ('' if 'в работе' in s.get('k', '') else ' акция распродажа в работе')
    if it['file'] == 'library/prices/legenda_prais_2026-10-28.pdf':
        it['bytes'] = os.path.getsize(LEG); it['sha256'] = sha(LEG); it['pages'] = pymupdf.open(LEG).page_count
        if 'с картинками' not in it['source']: it['source'] += '; в конце — оригинальные страницы легенды из прайса с картинками (стр. 3–8 PDF)'
NUMF = '/home/claude/build/doc_numbers.json'; num = json.loads(pathlib.Path(NUMF).read_text())
key = 'patch2611d/analiz_cen_konkurentov'
if key not in num['docs']: num['docs'][key] = {'n': 'ФАБ-%04d' % num['next'], 'title': NEW[0][2], 'date': T}; num['next'] += 1
no = num['docs'][key]['n']; nn = no[4:]
have = {i['file'] for i in d['items']}
for rel, src, title in NEW:
    if rel in have: continue
    it = {'cat': 'prices', 'title': title, 'file': rel, 'bytes': os.path.getsize(src), 'date': T, 'source': SRC, 'sha256': sha(src), 'received': T, 'number': no}
    if rel.endswith('.pdf'): it['pages'] = pymupdf.open(src).page_count
    d['items'].append(it)
    S.append({'t': title, 'x': no + ' · Документы', 'u': 'library.html#open=' + rel, 'g': 'Документы', 'i': 'file', 'c': 'var(--ic-docs)',
              'k': '%s ФАБ%s фаб %s фаб %d %s конкуренты сравнение цен анализ' % (no, nn, nn, int(nn), title)})
LJS_OLD = '      var pex = its.filter(function(i){ return i.extra; }), pcur = its.filter(function(i){ return !i.extra; }); if (!pcur.length) { pcur = pex; pex = []; }\n      h += \'<p class="ihdr">Действующий</p><div class="igroup">\' + docRow(pcur[0], c) + \'</div>\';\n      if (pex.length) h += \'<p class="ihdr">Для клиентов</p><div class="igroup">\' + pex.map(function(i){ return docRow(i, c); }).join(\'\') + \'</div>\';\n      if (pcur.length > 1) h += \'<p class="ihdr">Прошлые</p><div class="igroup">\' + pcur.slice(1).map(function(i){ return docRow(i, c); }).join(\'\') + \'</div>\';'
LJS_NEW = '      // 26.11.2026, Т. В.: «Прайс-листы и акции» — прайс отдельно от акций, рассылок и анализа; «Действующий» — только прайс-лист, не самый свежий файл раздела\n      var isP = function(i){ return /\\/prais_/.test(i.file); }, isA = function(i){ return /rasprodazh|so_sklada|akci/i.test(i.file) || /^(Акция|В работе)/.test(i.title); };\n      var gp = function(t, l){ return l.length ? \'<p class="ihdr">\' + t + \'</p><div class="igroup">\' + l.map(function(i){ return docRow(i, c); }).join(\'\') + \'</div>\' : \'\'; };\n      var pl = its.filter(isP), pa = its.filter(function(i){ return !isP(i) && isA(i); }), pr = its.filter(function(i){ return !isP(i) && !isA(i); });\n      var pex = pl.filter(function(i){ return i.extra; }), pcur = pl.filter(function(i){ return !i.extra; }); if (!pcur.length) { pcur = pex; pex = []; }\n      h += gp(\'Действующий прайс-лист\', pcur.slice(0, 1)) + gp(\'Для клиентов\', pex) + gp(\'Легенда прайса и анализ цен\', pr)\n        + gp(\'Акции и рассылки — в работе\', pa.filter(function(i){ return /^В работе/.test(i.title); })) + gp(\'Акции и рассылки\', pa.filter(function(i){ return !/^В работе/.test(i.title); }))\n        + gp(\'Прошлые прайс-листы\', pcur.slice(1));'
assert LJS_OLD in lib or LJS_NEW in lib, 'код раздела «Прайс-листы» на хостинге изменился'
lib = lib.replace(LJS_OLD, LJS_NEW); m = re.search(r'(<script id="lib-data" type="application/json">)(.*?)(</script>)', lib, re.S)
j = json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
(P / 'library.html').write_text(lib[:m.start(2)] + j + lib[m.end(2):], encoding='utf-8')
(P / 'assets').mkdir(exist_ok=True); (P / 'assets/search.json').write_text(json.dumps(S, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
hub = (L / 'assets/hub.js').read_text(encoding='utf-8'); (P / 'assets/hub.js').write_text(hub.replace('~products', ''), encoding='utf-8')
cnt = {k: sum(1 for i in d['items'] if i['cat'] == k) for k in ('catalogs', 'prices', 'certs')}
pr = (P / 'products.html').read_text(encoding='utf-8')
def setval(h, href, n):
    i = h.index('href="%s"' % href); a = h.index('<span class="ival">', i); b = h.index('</span>', a)
    return h[:a] + '<span class="ival">%d' % n + h[b:]
for k, v in cnt.items(): pr = setval(pr, 'library.html#' + k, v)
pr = pr.replace('<span class="ititle">Прайс-листы</span><span class="isub">Цены и условия</span>',
                '<span class="ititle">Прайс-листы и акции</span><span class="isub">Цены, легенда, акции и распродажи, анализ конкурентов</span>')
(P / 'products.html').write_text(pr, encoding='utf-8')
pathlib.Path(NUMF).write_text(json.dumps(num))
print('номер анализа', no, '· перенесено в «Прайс-листы и акции»:', moved, '· счёт', cnt, '· ~products в hub:', hub.count('~products'))
