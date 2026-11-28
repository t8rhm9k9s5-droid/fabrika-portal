"""«Фабрика» — закрытые разделы портала «Структура» и «СИМ-карты» (11.11.2026).
Т. В. 11.11: «структура со всеми функциональными обязанностями коммерческого отдела … и раздел с сим-картами … должны быть доступны
только мне и брату»; опрос: «Коммерческий отдел» в «Продажах» тоже закрыть до проверки.
Данных в страницах нет: здесь они шифруются ключом владельца k_owner = HMAC(bot_key, 'fabrika-owner-v1') → app_build/enc_reg/k/<sha256('fabrika-sec:'+часть)[:24]>.bin,
обычный пакет сайта кладёт их в k/ сайта, бот (op 'sec', SecPortal.gs) отдаёт владельцу и тем, кому он нажал «Пустить».
Части: ko — коммерческий отдел (data/ko_staff.json), org и kos — страницы пакета «Структура» (fabrika/struktura/структура/out),
sim — СИМ-карты МТС по разделам (fabrika/struktura/СИМ-карты_МТС_по_разделам_*.xlsx).  python3 gen_sec.py"""
import glob, hashlib, hmac, json, os, subprocess, sys
import pathlib   # 14.11.2026: чтение/запись файлов с закрытием (CodeQL py/file-not-closed)
sys.path.insert(0, '/home/claude/app_build/host/live')
from kb_build import seal_obj, unseal
OUT = '/home/claude/app_build/enc_reg/k'   # k/<24 hex>.bin — разрешённые файлы публичной сборки (deploy.py SITE_FILES); имя = sha256('fabrika-sec:'+часть)[:24]
ST = '/home/claude/fabrika/struktura/структура/out/'
bk = pathlib.Path('/home/claude/fabrika/src/Исходники/bot/bot_key.txt').read_text().strip()
bk = bytes.fromhex(bk) if len(bk) == 64 else bk.encode()
KEY = hmac.new(bk, b'fabrika-owner-v1', hashlib.sha256).digest()
os.makedirs(OUT, exist_ok=True)
subprocess.run([sys.executable, '/home/claude/build/make_ko_staff.py'], check=True, capture_output=True)
parts = {'ko': json.loads(pathlib.Path('/home/claude/build/data/ko_staff.json').read_text(encoding='utf-8')),
         # 12.11.2026, Т. В.: «всё должно быть как на сайте по оформлению» — данные пакета (JSON), страницу рисует портал (sales_frag: orgView, kosView)
         'org': {'src': 'Пакет «Структура» (снимок 03.11 + 11.11.2026), принят Т. В. 11.11 — на проверке', 'org': json.loads(pathlib.Path(ST + 'orgstruktura.json').read_text(encoding='utf-8'))},
         'kos': {'src': 'Пакет «Структура»: коммерческий отдел — функционал, зоны, блок-схема — на проверке', 'ko': json.loads(pathlib.Path(ST + 'kommercheskiy_otdel.json').read_text(encoding='utf-8'))}}
# 28.11.2026, Т. В.: «Контакты сотрудников / карта ID» (struct.html#sec-con) — MAX ID к людям из оргструктуры. Только в закрытой части org
#   (видят те же, кто видит «Структуру»). Источники — то, что уже есть у портала и бота: состав рабочих групп MAX (build/data/max_ids.json)
#   и реестр доступа Сотрудник5 (work/access_2311/table.json). Ключ — «фамилия имя» (как key() в struct.html); ФИО на странице — только из оргструктуры.
def _mxk(s):
    import re as _r
    s = _r.sub(r'\(.*?\)|\bгк\s+фабрикант\b', ' ', str(s or '').lower().replace('ё', 'е').replace('ъ', 'ь'))
    s = _r.sub(r'[^а-яa-z ]', ' ', _r.sub(r'\s+-\s+.*$', '', s))
    return ' '.join(s.split()[:2])
try:
    _ids, _all = {}, []
    def _add(k, uid, src):
        if len(k.split()) == 2 and uid and uid not in _ids.setdefault(k, []): _ids[k].append(uid)
    _mx = json.loads(pathlib.Path('/home/claude/build/data/max_ids.json').read_text(encoding='utf-8'))
    for m in _mx.get('people') or []:
        u, nm = str(m.get('uid') or ''), (m.get('name') or '').split()
        for a, b in ((m.get('ln', ''), m.get('fn', '')), (nm[1] if len(nm) > 1 else '', nm[0] if nm else '')):
            _add(_mxk(a + ' ' + b), u, 'группы MAX')
        _all.append([m.get('name') or '', u, 'группы MAX'])
    try:
        for r in json.loads(pathlib.Path('/home/claude/fabrika/work/access_2311/table.json').read_text(encoding='utf-8')).get('rows') or []:
            u = str(r[3] or '').strip("'")
            if u and r[1]: _add(_mxk(r[0]), u, 'реестр доступа')
            if u and not any(x[1] == u for x in _all): _all.append([r[0], u, 'реестр доступа'])
    except Exception as _e: print('реестр доступа:', _e)
    _add('машинский тимур', '140426852', 'подтверждён Т. В. 24.11')
    parts['org']['mx'] = {'src': 'состав рабочих групп MAX ' + str(_mx.get('t', ''))[:10] + ' и реестр доступа (Сотрудник50 И. В.); совпадение по фамилии и имени, привязка к корпоративному номеру — на проверке у Сотрудник5',
                          'ids': _ids, 'all': _all}
    print('MAX ID для контактов:', len(_ids))
except Exception as _e: print('MAX ID для контактов:', _e)
x = sorted(glob.glob('/home/claude/fabrika/struktura/СИМ-карты_МТС_по_разделам_*.xlsx'))
if x:
    import openpyxl
    wb = openpyxl.load_workbook(x[-1], read_only=True); sheets = []; cols = None
    for ws in wb.worksheets:
        if ws.title == 'О файле': continue
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        cols = cols or [str(c) for c in rows[0]]
        sheets.append({'name': ws.title, 'rows': [[('' if c is None else (int(c) if isinstance(c, float) and c.is_integer() else c)) for c in r] for r in rows[1:] if any(c not in (None, '') for c in r)]})
    parts['sim'] = {'src': 'Список Сотрудник1 А. В. (МТС, 11.11.2026), разбит по разделам; ответ А. В. 11.11: номера уволенных — в блокировке или с переадресацией, в справочник — только Грачёв',
                    'cols': cols, 'sheets': sheets, 'note': 'На проверке у Т. В. и А. В. Номера — только здесь (закрыто), в общий справочник не вносятся.'}
for k, v in parts.items():
    t = seal_obj(dict(v, t=__import__('datetime').datetime.now().strftime('%Y-%m-%dT%H:%M')), KEY)
    assert unseal(t, KEY) is not None
    pathlib.Path(os.path.join(OUT, hashlib.sha256(('fabrika-sec:' + k).encode()).hexdigest()[:24] + '.bin')).write_text(t)
    print(k, len(t))
