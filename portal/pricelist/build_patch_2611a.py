# Заплатка 2611a: презентации с ценой колонки региона, легенда прайс-листа (ФАБ-0114), без контактов закрытого ОП Санкт-Петербург в каталоге 2025, презентации «Производство» и тексте сайта. 26.11.2026
import json, re, hashlib, os, shutil, pathlib, datetime, pymupdf
M = '/home/claude/build/live_mirror'; P = pathlib.Path('/home/claude/app_build/patch/2611a/plain'); shutil.rmtree(P, ignore_errors=True)
O = '/home/claude/fabrika/work/prez/out/'; T = '2026-11-26'
rep = {'library/catalogs/so_sklada_%s_dekabr_2026.pdf' % k: O + 'Со_склада_%s_декабрь_2026.pdf' % v for k, v in
       (('ryazan', 'Рязань'), ('moskva', 'Москва'), ('samara', 'Самара'), ('krasnodar', 'Краснодар'), ('ekaterinburg', 'Екатеринбург'), ('nizhniy_novgorod', 'Сотрудник14_Имя3'), ('simferopol', 'Симферополь'))}
rep.update({'library/catalogs/rasprodazha_%s_dekabr_2026.pdf' % k: O + 'Распродажа_%s_декабрь_2026.pdf' % v for k, v in (('ekaterinburg', 'Екатеринбург'), ('krasnodar', 'Краснодар'), ('samara', 'Самара'))})
rep['library/katalog_fabrikant_2025.pdf'] = 'REDACTED_B64_34.pdf'
rep['library/catalogs/prezentaciya_fabrikant_proizvodstvo.pdf'] = 'REDACTED_B64_35.pdf'
NEW = 'library/prices/legenda_prais_2026-10-28.pdf'; rep[NEW] = 'REDACTED_B64_36.pdf'
for rel, src in rep.items():
    (P / rel).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, P / rel)
sha = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest()
lib = open(M + '/library.html', encoding='utf-8').read(); m = re.search(r'(<script id="lib-data" type="application/json">)(.*?)(</script>)', lib, re.S)
d = json.loads(m.group(2)); have = {i['file']: i for i in d['items']}; num = json.load(open('/home/claude/build/doc_numbers.json'))
for rel, src in rep.items():
    if rel == NEW: continue
    it = have[rel]; it['bytes'] = os.path.getsize(src); it['sha256'] = sha(src)
    if 'so_sklada' in rel: it['title'] = re.sub(r'\(12 моделей[^)]*\)', '(12 моделей с остатками; одна цена — колонка прайс-листа своего базиса отгрузки)', it['title'])
    if 'rasprodazha_' in rel and ('ekaterinburg' in rel or 'krasnodar' in rel): it['source'] = it['source'].rstrip('.') + '; рядом с ценой распродажи — цена прайс-листа 28.10.2026 по колонке базиса (26.11.2026)'
    if rel.endswith(('katalog_fabrikant_2025.pdf', 'prezentaciya_fabrikant_proizvodstvo.pdf')): it['source'] = it['source'].rstrip('.') + '; 26.11.2026 по слову Т. В. убраны адрес и телефоны закрытого филиала в Санкт-Петербурге'
no = 'ФАБ-%04d' % num['next']
d['items'].append({'cat': 'prices', 'title': 'Легенда прайс-листа от 28.10.2026 — колонки цен I–V (базисы отгрузки по офисам), колонки листа, сокращения, доплаты', 'file': NEW, 'bytes': os.path.getsize(rep[NEW]), 'date': T,
                   'source': 'Собрано Claude 26.11.2026 по поручению Т. В. Сотрудник1: легенда прайс-листа 28.10.2026 (стр. 3–7 PDF) и Excel-файл прайса; дополнено соответствие офисов колонкам и вопросы к маркетингу',
                   'sha256': sha(rep[NEW]), 'received': T, 'pages': pymupdf.open(rep[NEW]).page_count, 'number': no})
j = json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
(P / 'library.html').write_text(lib[:m.start(2)] + j + lib[m.end(2):], encoding='utf-8')
S = json.load(open(M + '/assets/search.json', encoding='utf-8'))
for x in S:
    for rel in rep:
        if x.get('u') == 'library.html#open=' + rel and rel in have: x['t'] = have[rel]['title']
nn = no.replace('ФАБ-', '')
S.append({'t': d['items'][-1]['title'], 'x': no + ' · Документы', 'u': 'library.html#open=' + NEW, 'g': 'Документы', 'i': 'file', 'c': 'var(--ic-docs)',
          'k': '%s ФАБ%s фаб %s фаб %d %s легенда прайс прайс-лист колонка колонки I II III IV V базис отгрузки регион Рязань Москва Краснодар Сотрудник14 Имя3 Самара Екатеринбург Крым Симферополь цена с НДС кратность обивка CH AL BL WH AWD ТГ МБ МТГ пиастра крестовина ролики доплата наценка BOX2 BOX4' % (no, nn, nn, int(nn), nn)})
(P / 'assets').mkdir(parents=True, exist_ok=True); (P / 'assets' / 'search.json').write_text(json.dumps(S, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
for f in ('fsu/index.html', 'fsu/old.html'):
    t = open(M + '/' + f, encoding='utf-8').read(); n = t.count('Москве, Санкт-Петербурге, ')
    (P / f).parent.mkdir(parents=True, exist_ok=True); (P / f).write_text(t.replace('Москве, Санкт-Петербурге, ', 'Москве, '), encoding='utf-8'); print(f, 'убрано упоминаний:', n)
num['next'] += 1; json.dump(num, open('/home/claude/build/doc_numbers.json', 'w'))
print('файлов в заплатке:', sum(1 for _ in P.rglob('*') if _.is_file()), '· новый документ', no)
