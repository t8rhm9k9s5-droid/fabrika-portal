"""«Фабрика» — закрытые разделы портала «Структура» и «СИМ-карты» (11.11.2026).
Т. В. 11.11: «структура со всеми функциональными обязанностями коммерческого отдела … и раздел с сим-картами … должны быть доступны
только мне и брату»; опрос: «Коммерческий отдел» в «Продажах» тоже закрыть до проверки.
Данных в страницах нет: здесь они шифруются ключом владельца k_owner = HMAC(bot_key, 'fabrika-owner-v1') → app_build/enc_reg/k/<sha256('fabrika-sec:'+часть)[:24]>.bin,
обычный пакет сайта кладёт их в k/ сайта, бот (op 'sec', SecPortal.gs) отдаёт владельцу и тем, кому он нажал «Пустить».
Части: ko — коммерческий отдел (data/ko_staff.json), org и kos — страницы пакета «Структура» (fabrika/struktura/структура/out),
sim — СИМ-карты МТС по разделам (fabrika/struktura/СИМ-карты_МТС_по_разделам_*.xlsx).  python3 gen_sec.py"""
import glob, hashlib, hmac, json, os, subprocess, sys
sys.path.insert(0, '/home/claude/app_build/host/live')
from kb_build import seal_obj, unseal
OUT = '/home/claude/app_build/enc_reg/k'   # k/<24 hex>.bin — разрешённые файлы публичной сборки (deploy.py SITE_FILES); имя = sha256('fabrika-sec:'+часть)[:24]
ST = '/home/claude/fabrika/struktura/структура/out/'
bk = open('/home/claude/fabrika/src/Исходники/bot/bot_key.txt').read().strip()
bk = bytes.fromhex(bk) if len(bk) == 64 else bk.encode()
KEY = hmac.new(bk, b'fabrika-owner-v1', hashlib.sha256).digest()
os.makedirs(OUT, exist_ok=True)
subprocess.run([sys.executable, '/home/claude/build/make_ko_staff.py'], check=True, capture_output=True)
parts = {'ko': json.load(open('/home/claude/build/data/ko_staff.json', encoding='utf-8')),
         # 12.11.2026, Т. В.: «всё должно быть как на сайте по оформлению» — данные пакета (JSON), страницу рисует портал (sales_frag: orgView, kosView)
         'org': {'src': 'Пакет «Структура» (снимок 03.11 + 11.11.2026), принят Т. В. 11.11 — на проверке', 'org': json.load(open(ST + 'orgstruktura.json', encoding='utf-8'))},
         'kos': {'src': 'Пакет «Структура»: коммерческий отдел — функционал, зоны, блок-схема — на проверке', 'ko': json.load(open(ST + 'kommercheskiy_otdel.json', encoding='utf-8'))}}
x = sorted(glob.glob('/home/claude/fabrika/struktura/СИМ-карты_МТС_по_разделам_*.xlsx'))
if x:
    import openpyxl
    wb = openpyxl.load_workbook(x[-1], read_only=True); sheets = []; cols = None
    for ws in wb.worksheets:
        if ws.title == 'О файле': continue
        rows = [list(r) for r in ws.iter_rows(values_only=True)]
        cols = cols or [str(c) for c in rows[0]]
        sheets.append({'name': ws.title, 'rows': [[('' if c is None else (int(c) if isinstance(c, float) and c.is_integer() else c)) for c in r] for r in rows[1:] if any(c not in (None, '') for c in r)]})
    parts['sim'] = {'src': 'Список Сотрудник А. В. (МТС, 11.11.2026), разбит по разделам; ответ А. В. 11.11: номера уволенных — в блокировке или с переадресацией, в справочник — только Грачёв',
                    'cols': cols, 'sheets': sheets, 'note': 'На проверке у Т. В. и А. В. Номера — только здесь (закрыто), в общий справочник не вносятся.'}
for k, v in parts.items():
    t = seal_obj(dict(v, t=__import__('datetime').datetime.now().strftime('%Y-%m-%dT%H:%M')), KEY)
    assert unseal(t, KEY) is not None
    open(os.path.join(OUT, hashlib.sha256(('fabrika-sec:' + k).encode()).hexdigest()[:24] + '.bin'), 'w').write(t)
    print(k, len(t))
