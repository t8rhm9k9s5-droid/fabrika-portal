# Заплатка 2611b (26.11.2026): «Распродажа» — колонки «По прайсу / Распродажа / Скидка»; легенда прайса (ФАБ-0114) + опора против опрокидывания;
# очередь почты «Портал: в работе» → «Документы»: план производства декабрь, график производства 23–28.11, гальваника ноябрь, выпуск 17.11,
# система отчётности Сотрудник29, ТЗ №116 табурет СТПУ, предписания ПТО №124 и №265.
import json, re, hashlib, os, shutil, pathlib, pymupdf
M = '/home/claude/build/live_mirror'; P = pathlib.Path('/home/claude/app_build/patch/2611b/plain')
keep = P / 'assets'; tmp = pathlib.Path('REDACTED_B64_40')
if keep.exists(): shutil.rmtree(tmp, ignore_errors=True); shutil.copytree(keep, tmp)
shutil.rmtree(P, ignore_errors=True); P.mkdir(parents=True)
if tmp.exists(): shutil.copytree(tmp, P / 'assets')
O = '/home/claude/fabrika/work/prez/out/'; A = '/home/claude/fabrika/work/mail_2611/att/'; T = '2026-11-26'
rep = {'library/catalogs/rasprodazha_%s_dekabr_2026.pdf' % k: O + 'Распродажа_%s_декабрь_2026.pdf' % v for k, v in (('ekaterinburg', 'Екатеринбург'), ('krasnodar', 'Краснодар'), ('samara', 'Самара'))}
rep['library/prices/legenda_prais_2026-10-28.pdf'] = 'REDACTED_B64_39.pdf'
NEW = [  # (номер-группа, cat, путь, источник, title, date, source)
 (0, 'reports', 'library/reports/plan_proizvodstva_dekabr_2026.xlsx', A + 'plan_dec_1.xlsx', 'План производства на декабрь 2026 (на согласовании): 22 рабочих дня, выпуск по изделиям и плановые отгрузки объектов ВиТ', '2026-11-23',
  'Письма Ю. А. Сотрудник27 и К. В. Сотрудник16 Ф. И. Сотрудник40 23.11.2026 («план на согласование с корректировкой»; сноска по объектам ВиТ), переслал Т. В. Сотрудник1 25.11.2026'),
 (1, 'reports', 'library/reports/grafik_proizvodstva_2026-11-23_28.xls', A + '16_0_0_график_производтсва_23-28.11.xls', 'График производства 23–28.11.2026 по контрагентам и заказам (выгрузка 1С)', '2026-11-20',
  'Письмо Ю. А. Сотрудник27 И. М. Сотрудник40 20.11.2026 «Контроль соблюдения графика производства» — просьба ежедневно сообщать об отклонениях'),
 (2, 'reports', 'library/reports/galvanika_zagruzka_noyabr_2026.pdf', A + '27_0_0_11_Гальваника_НОЯБРЬ_2026.pdf', 'Гальваника: загрузка линии по дням, ноябрь 2026 (норматив 165 траверс, % загрузки) — версия 19.11', '2026-11-19',
  'Письма А. Сотрудник69 (планово-экономический отдел) 17, 18 и 19.11.2026; на портале последняя версия'),
 (3, 'reports', 'library/reports/otchet_vypuska_proizvodstva_2026-11-17.pdf', A + '36_0_1_Отчет_17.11.2026г..pdf', 'Отчёт выпуска производства за 17.11.2026 (по видам изделий и участкам, PDF)', '2026-11-18', 'Письмо И. М. Сотрудник40 (ПДО) 18.11.2026'),
 (3, 'reports', 'library/reports/otchet_vypuska_proizvodstva_2026-11-17.xls', A + '36_0_0_17.11.2026г..xls', 'Отчёт выпуска производства за 17.11.2026 — ведомость по заказам (Excel)', '2026-11-18', 'Письмо И. М. Сотрудник40 (ПДО) 18.11.2026'),
 (4, 'reports', 'library/reports/sistema_otchetnosti_yanina_2026-11-24.xlsx', A + '22_3_0_Система_отчётности_клиенты_и_сроки.xlsx', 'Система отчётности С. И. Сотрудник29: ежедневный отчёт, клиенты и следующие шаги, итоги недель — версия 24.11', '2026-11-24',
  'Ответы С. И. Сотрудник29 на письмо портала 20.11.2026 (версии 20, 23 и 24.11), переслал Т. В. Сотрудник1 25.11.2026'),
 (5, 'objects', 'library/objects/tz_116_taburet_stpu.xls', A + '40_0_0_ТЗ_116_Табурет_для_СТПУ.xls', 'ТЗ №116 «Табурет для СТПУ» — 4 057 шт., на просчёт (ОП Екатеринбург)', '2026-11-17', 'Письмо С. Сотрудник19 (ОП Екатеринбург) 17.11.2026 — просьба согласовать просчёт'),
 (6, 'reports', 'library/reports/predpisanie_124_sofiya_opora_2018-06-15.pdf', A + '19_1_1__124_Предписание_касается_стула_София.pdf', 'Предписание ПТО №124 от 15.06.2018 — комплект опор для стула «София» (арт. 112019102N, продаётся отдельно)', '2018-06-15',
  'Прислал А. Сотрудник44 (рекламации) 20.11.2026 по запросу портала об опоре против опрокидывания; Т. В.: «для прайс-листа»'),
 (6, 'reports', 'library/reports/predpisanie_265_podpyatniki_2021-02-19.pdf', A + '19_1_0__265_Касается_замены_подпятников..pdf', 'Предписание ПТО №265 от 19.02.2021 — замена подпятников: опоры против опрокидывания (Бонд PLZ, Виктория PLZ, Элис PLZ, Тренд PLZ, Карла, Синти, Синти СТ)', '2021-02-19',
  'Прислал А. Сотрудник44 (рекламации) 20.11.2026 по запросу портала; Т. В.: «для прайс-листа»')]
for rel, src in rep.items(): (P / rel).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, P / rel)
for _, _, rel, src, *_ in NEW: (P / rel).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, P / rel)
sha = lambda p: hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
lib = pathlib.Path(M + '/library.html').read_text(encoding='utf-8'); m = re.search(r'(<script id="lib-data" type="application/json">)(.*?)(</script>)', lib, re.S)
d = json.loads(m.group(2)); have = {i['file']: i for i in d['items']}
for rel, src in rep.items():
    it = have[rel]; it['bytes'] = os.path.getsize(src); it['sha256'] = sha(src)
    if 'rasprodazha' in rel: it['source'] = re.sub(r'; (рядом с ценой распродажи|в таблице цен)[^;]*', '', it['source']).rstrip('.') + '; в таблице цен: цена прайс-листа 28.10.2026 по колонке базиса (зачёркнута), цена распродажи и скидка в % (26.11.2026)'
    else: it['pages'] = pymupdf.open(src).page_count; it['source'] = it['source'].split('; 26.11 дополнено')[0] + '; 26.11 дополнено: опора против опрокидывания (предписания №124, №265)'
NUMF = '/home/claude/build/doc_numbers.json'; num = json.loads(pathlib.Path(NUMF).read_text()); base = num['next']; nums = {}
S = json.loads(pathlib.Path(M + '/assets/search.json').read_text(encoding='utf-8'))
for g, cat, rel, src, title, date, source in NEW:
    no = nums.setdefault(g, 'ФАБ-%04d' % (base + len(nums)))
    it = {'cat': cat, 'title': title, 'file': rel, 'bytes': os.path.getsize(src), 'date': date, 'source': source, 'sha256': sha(src), 'received': T, 'number': no}
    if rel.endswith('.pdf'): it['pages'] = pymupdf.open(src).page_count
    d['items'].append(it); nn = no[4:]
    S.append({'t': title, 'x': no + ' · Документы', 'u': 'library.html#open=' + rel, 'g': 'Документы', 'i': 'file', 'c': 'var(--ic-docs)', 'k': '%s ФАБ%s фаб %s фаб %d %s' % (no, nn, nn, int(nn), title)})
j = json.dumps(d, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
(P / 'library.html').write_text(lib[:m.start(2)] + j + lib[m.end(2):], encoding='utf-8')
(P / 'assets').mkdir(exist_ok=True); (P / 'assets' / 'search.json').write_text(json.dumps(S, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
num['next'] = base + len(nums); pathlib.Path(NUMF).write_text(json.dumps(num))
print('номера:', nums, '· файлов:', sum(1 for _ in P.rglob('*') if _.is_file()))
