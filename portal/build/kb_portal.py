# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — база знаний ботов, часть «портал» (01.11.2026, пользователь: «База знаний за вс–пн»; fabrika/tasks/bot_autonomy.md, этап 1).
Фрагменты из того, что портал УЖЕ показывает сотрудникам: «Кому звонить» (люди, вопросы, оперативные службы, кабинеты, маршрутки),
производство (участки, мастера, ночная смена), оргструктура (отделы), документы (библиотека, регламенты, чертежи, документы fabrikant.su),
здания промплощадки (без кадастра и координат), ассортимент, склад (сводка на дату), что нового (версии), описание разделов.
Не берутся: IP/сеть/камеры, кадастр, пароли/ключи, личный проект владельца (фильтр kb_build.BAN), телефоны — только из открытых справочников
портала («Кому звонить», «Производство»). Итог шифруется T14B1 ключом k_live (как st/ls.bin) →
/home/claude/app_build/host/live/kb_portal.txt (едет пакетом кода в code/; хостинг сливает его со страницами fabrikant.su → st/kb.bin).
Запуск — после сборки сайта (build_site.py: свежие calls_frag.html и др.), перед пакетом кода:  python3 /home/claude/build/kb_portal.py
Ключ — HMAC(bot/bot_key.txt, 'fabrika-live-v1'); нигде не печатается. Открытая копия для проверки — build/kb_portal.json (только в контейнере).
04.11.2026 (Т. В.: «Пусть знают все договора наши… акты рекламации… регламенты работы»): + полные тексты типовых договоров (library/dogovory.json,
пункты с номерами, одинаковые у ЖПС/ПКС/ФТС — один раз, отличия — отдельно), регламентов и бланков (library/regs.json), статей ГК РФ (проверены по
КонсультантПлюс), памятки бота по рекламации и спору, прайс 28.10 (+ app_build/host/live/price_now.json для кода ботов). Приоритет при пределе размера —
рекламации и качество, сроки, приёмка, гарантия, ответственность, цены, оплата, отгрузка; остальное — «кратко»."""
import hashlib, hmac, html, io, json, os, re, subprocess, sys, datetime, zipfile
sys.path.insert(0, '/home/claude/app_build/host/live')
import kb_build as KB

B = '/home/claude/build/'
LIB = '/home/claude/library/'
ORG = '/home/claude/fabrika/src/orgstruktura/out/orgstruktura.json'
OUT = '/home/claude/app_build/host/live/kb_portal.txt'
MSK = datetime.timezone(datetime.timedelta(hours=3))
F = []


def add(title, text, url, section):
    F.extend(KB.frags(title, text, url, section))


def jl(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def page_text(name):
    try: s = open(B + name, encoding='utf-8').read()
    except Exception: return '', ''
    t = re.search(r'<title>(.*?)</title>', s, re.S)
    s = re.sub(r'<script\b.*?</script[^>]*>|<style\b.*?</style[^>]*>|<svg\b.*?</svg[^>]*>', ' ', s, flags=re.S | re.I)   # 12.11 CodeQL: и <SCRIPT>, </script >
    v = re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s))).strip()
    return (t.group(1).strip() if t else ''), v


def ppl_line(P, pid, role=None):
    p = P.get(pid) or {}
    if not p: return ''
    bits = [p.get('n', ''), role or p.get('r', '')]
    if p.get('e'): bits.append(', '.join(p['e']))
    if p.get('p'): bits.append(', '.join(p['p']))
    return ' — '.join(x for x in bits[:2] if x) + ('; ' + '; '.join(bits[2:]) if len(bits) > 2 else '')


# REDACTED_B64_1 «Кому звонить»
def calls():
    try: s = open(B + 'calls_frag.html', encoding='utf-8').read()
    except Exception: return
    m = re.search(r'<script id="calls-data" type="application/json">(.*?)</script>', s, re.S)
    if not m: return
    d = json.loads(m.group(1)); P = d.get('people') or {}
    CL = {c['k']: c['t'] for c in d.get('cl') or []}
    bld = d.get('bld') or {}
    rooms = {}
    for fl in bld.get('floors') or []:
        for r in fl.get('rooms') or []:
            for i in r.get('ids') or []: rooms[i] = '%s, %s этаж, %s' % (bld.get('name', 'административное здание'), fl.get('n'), r.get('name'))
    for pid, p in P.items():
        txt = '%s — %s%s.' % (p.get('n', ''), p.get('r', ''), (', ' + p['d']) if p.get('d') and p.get('d') not in p.get('r', '') else '')
        if p.get('e'): txt += ' Почта: %s.' % ', '.join(p['e'])
        if p.get('p'): txt += ' Телефон: %s.' % ', '.join(p['p'])
        where = rooms.get(pid) or p.get('x')
        if where: txt += ' Где найти: %s.' % where
        add('%s — %s' % (p.get('n', ''), p.get('r', '')), txt, 'calls.html#p-' + pid, 'Кому звонить')
    for t in d.get('topics') or []:
        who = '; '.join(filter(None, (ppl_line(P, w['id'], w.get('as')) for w in t.get('who') or [])))
        txt = 'Вопрос: %s. Раздел «%s». Кому звонить: %s.' % (t.get('q', ''), CL.get(t.get('c'), t.get('c', '')), who or 'см. «Кому звонить»')
        if t.get('note'): txt += ' ' + t['note']
        if t.get('kw'): txt += ' (%s)' % t['kw']
        add('Кому звонить: ' + t.get('q', ''), txt, 'calls.html#' + t.get('id', ''), 'Кому звонить')
    ops = '; '.join(filter(None, (ppl_line(P, o['id'], o.get('as')) for o in d.get('ops') or [])))
    if ops: add('Оперативные службы: кому звонить срочно', 'Срочные вопросы на промплощадке: %s. Общий телефон компании: %s.' % (ops, d.get('main', '')), 'calls.html', 'Кому звонить')
    for x in d.get('site') or []:
        names = ', '.join((P.get(i) or {}).get('n', '') for i in x.get('ids') or [] if P.get(i))
        add(x.get('t', ''), '%s: %s.%s' % (x.get('t', ''), x.get('x', ''), (' Ответственные: ' + names + '.') if names else ''), x.get('u') or 'calls.html', 'Территория')
    bus = d.get('bus') or {}
    for r in bus.get('routes') or []:
        legs = []
        for lg in r.get('legs') or []:
            stops = ', '.join('%s %s' % (st[0], st[1]) if st[1] else st[0] for st in lg[1])
            legs.append('%s: %s' % (lg[0], stops))
        add('Маршрутка до фабрики: %s' % r.get('t', ''), '%s (%s%s). %s. Источник: %s.' % (r.get('t', ''), r.get('days', ''), ', мест ' + r['seats'] if r.get('seats') else '',
            '. '.join(legs), bus.get('src', '')), 'calls.html#bus', 'Транспорт сотрудников')
    for k, v in bus.items():
        if k not in ('src', 'routes') and isinstance(v, (str, list)) and v:
            add('Маршрутки: ' + k, v if isinstance(v, str) else '; '.join(map(str, v)), 'calls.html#bus', 'Транспорт сотрудников')


# REDACTED_B64_1 производство и оргструктура
def production():
    a = jl(B + 'areas.json', {}) or {}
    dr = a.get('director') or {}
    if dr: add('Директор по производству', '%s — %s; %s; %s. %s' % (dr.get('name', ''), dr.get('role', ''), dr.get('phone', ''), dr.get('email', ''), a.get('note', '')), 'staff.html', 'Производство')
    for ar in a.get('areas') or []:
        txt = 'Участок %s «%s»: %s. Стабильный состав %s%s чел. Мастер (ответственный): %s — %s%s.' % (
            ar.get('n'), ar.get('title', ''), ', '.join(ar.get('blocks') or []), '≈ ' if ar.get('approx') else '', ar.get('staff', ''),
            ar.get('name', ''), ar.get('role', ''), (', телефон ' + ar['phone']) if ar.get('phone') else '')
        if ar.get('night'): txt += ' ' + ar['night'] + '.'
        add('Производственный участок %s — %s' % (ar.get('n'), ar.get('title', '')), txt, 'staff.html#a%s' % ar.get('n'), 'Производство')
    n = a.get('night') or {}
    if n: add('Ночная смена', '%s (%s): %s. %s' % (n.get('title', ''), n.get('status', ''), ', '.join(n.get('blocks') or []), n.get('note', '')), 'staff.html', 'Производство')
    if a.get('pdo'):
        p = a['pdo']; add('ПДО — планово-диспетчерский отдел', '%s — %s; %s; %s.' % (p.get('name', ''), p.get('role', ''), p.get('phone', ''), p.get('email', '')), 'staff.html', 'Производство')
    o = jl(ORG, {}) or {}
    def pl(p): return '%s — %s%s%s' % (p.get('name', ''), p.get('role', ''), ('; ' + ', '.join(p['emails'])) if p.get('emails') else '', ('; ' + ', '.join(p['phones'])) if p.get('phones') else '')
    top = [pl(p) for p in (o.get('leadership') or []) + (o.get('directors') or []) if p and p.get('name')]
    if top: add('Руководство компании', 'Руководство ГК «Фабрикант»: ' + '; '.join(top) + '.', 'calls.html', 'Оргструктура')
    for k, dep in (o.get('departments') or {}).items() if isinstance(o.get('departments'), dict) else enumerate(o.get('departments') or []):
        heads = '; '.join(pl(p) for p in dep.get('heads') or [] if p.get('name'))
        staff = '; '.join('%s — %s' % (p.get('name', ''), p.get('role', '')) for p in dep.get('staff') or [] if p.get('name'))
        txt = 'Отдел «%s»%s%s. Руководители: %s. Сотрудники: %s.%s' % (dep.get('title', ''), (' (' + dep['floor'] + ')') if dep.get('floor') else '',
            (', общая почта ' + dep['email']) if dep.get('email') else '', heads or '—', staff or '—', (' ' + dep['note']) if dep.get('note') else '')
        add('Отдел: ' + dep.get('title', ''), txt, 'calls.html', 'Оргструктура')


# REDACTED_B64_1 документы
def documents():
    L = jl(LIB + 'library.json', {}) or {}
    CAT = {'certs': 'Сертификаты и декларации', 'prices': 'Прайс-листы и акции', 'catalogs': 'Каталоги и презентации', 'brand': 'Фирменный стиль',
           'reports': 'Отчёты и сводки', 'other': 'Прочее', 'regs': 'Регламенты и инструкции'}
    for i in [x for x in (L.get('items') or []) if not x.get('hidden')]:   # 02.11.2026: скрытые документы не ищутся
        if i.get('cat') == 'regs': continue                    # регламенты — подробнее из regs.json ниже
        txt = '%s. Раздел «Документы → %s».%s%s%s' % (i.get('title', ''), CAT.get(i.get('cat'), i.get('cat', '')), (' Дата: %s.' % i['date']) if i.get('date') else '',
            (' Получен: %s.' % i['received']) if i.get('received') else '', (' Страниц: %s.' % i['pages']) if i.get('pages') else '')
        add(i.get('title', ''), txt, 'library.html#' + str(i.get('id', '')), 'Документы')
    R = jl(LIB + 'regs.json', {}) or {}
    G = {g['k']: g['t'] for g in R.get('groups') or []}
    for p in R.get('procs') or []:
        add('Процесс: ' + p.get('t', ''), 'Процесс «%s»: %s. Документы — в разделе «Документы → Регламенты».' % (p.get('t', ''), p.get('x', '')), 'library.html#regs', 'Регламенты')
    # 04.11.2026: описания регламентов из regs.json — теперь в regulations() (назначение + текст документа; ссылка #regs / #forms — адреса #reg-<id> портал не открывает)
    for i in (jl(B + 'docs_index.json', {}) or {}).get('items') or []:
        add('Чертёж: ' + i.get('title', ''), '%s. Группа «%s». Источник: %s.' % (i.get('title', ''), i.get('group', ''), i.get('src', '')), 'docs.html#' + str(i.get('id', '')), 'Чертежи и планы')
    S = jl(LIB + 'fabrikant_su.json', {}) or {}
    for d in S.get('docs') or []:
        if d.get('title'): add('Документ fabrikant.su: ' + d['title'], '%s — документ с сайта компании fabrikant.su (раздел «Документация»); копия открывается на портале в «Документы».' % d['title'], 'library.html#pub', 'Документы')


# REDACTED_B64_1 здания, ассортимент, склад
def site_and_goods():
    S = jl(B + 'site_app.json', {}) or {}
    a = jl(B + 'areas.json', {}) or {}
    by = {}
    for ar in a.get('areas') or []:
        for k in ar.get('blds') or []: by[k] = ar
    for b in S.get('buildings') or []:
        if not b.get('name') or b.get('kind') in ('proj', 'canopy', 'chimney', 'plan'): continue
        ar = by.get(b['k'])
        txt = '%s на промплощадке (Поляны, ул. Терехина, 14)%s%s.%s' % (b['name'], (', этажей: %s' % b['floors']) if b.get('floors') else '',
            (', площадь застройки ≈ %s м²' % b['area']) if b.get('area') else '', (' Производственный участок %s «%s», мастер %s.' % (ar.get('n'), ar.get('title', ''), ar.get('name', ''))) if ar else '')
        add('Здание: ' + b['name'], txt, 'index.html#' + b['k'], 'Промплощадка')
    A = jl(B + 'assort.json', {}) or {}
    for t in A.get('types') or []:
        txt = '%s: %s моделей в ассортименте, продано за период %s шт., средняя цена %s ₽. Подробно — раздел «Изделия и материалы → Ассортимент». Источник: %s.' % (
            t.get('n', ''), t.get('models', ''), t.get('q', ''), t.get('avg', ''), A.get('src', ''))
        add('Ассортимент: ' + t.get('n', ''), txt, 'sales.html', 'Продажи')
    sb = jl(B + 'stock_brief.json', {}) or {}
    if sb.get('date'):
        add('Склад готовой продукции: остатки', 'Остатки склада %s на %s: %s шт. на ≈ %.1f млн ₽ (сводка сборки; свежие цифры — раздел «Склад», обновляется с хостинга каждый рабочий день).' % (
            sb.get('wh', ''), sb['date'], sb.get('qty'), (sb.get('rub') or 0) / 1e6), 'stock.html', 'Склад')


# REDACTED_B64_1 разделы портала и что нового
PAGES = [('home_frag.html', 'home.html', 'Главная'), ('calls_frag.html', 'calls.html', 'Кому звонить'), ('staff_frag.html', 'staff.html', 'Производство'),
         ('stock_frag.html', 'stock.html', 'Склад'), ('stores_frag.html', 'stores.html', 'Остатки офисов продаж'), ('sales_frag.html', 'sales.html', 'Продажи'),
         ('products_frag.html', 'products.html', 'Изделия и материалы'), ('omts_frag.html', 'omts.html', 'ОМТС — снабжение'), ('transport_frag.html', 'transport.html', 'Транспорт'),
         ('library_frag.html', 'library.html', 'Документы'), ('archive_frag.html', 'archive.html', 'Архив документов площадки'), ('plan_frag.html', 'plan.html', 'План промплощадки'),
         ('chat_frag.html', 'chat.html', 'Чат')]


DESC = {'calls.html': 'Справочник: кому звонить по вопросу (клиенты, договоры, производство, качество, склад, транспорт, снабжение, территория, кадры, ИТ), '
                      'телефоны и почта сотрудников, оперативные службы (охрана, электрик, аварии, ночная смена), кабинеты админздания, маршрутки до фабрики.',
        'stock.html': 'Остатки склада готовой продукции (Рязань) по группам и моделям из рассылок 1С, сдано на склад за сутки, покупная мебель не нашего производства.',
        'stores.html': 'Остатки в офисах продаж (филиалах) по моделям из 1С.',
        'sales.html': 'Продажи: сумма месяца по дням (отчёт 1С), продажи за день по типам товаров и мощностям производства, офисы продаж и план по менеджерам.',
        'library.html': 'Документы компании: сертификаты и декларации, прайс-листы и акции, каталоги, фирменный стиль, регламенты и инструкции, '
                        'перевыпуск документов, документы fabrikant.su.',
        'chat.html': 'Чат портала: сообщения сотрудников и помощник (ИИ) с поиском по порталу.',
        'transport.html': 'Транспорт: ТК ГЛОНАСС и весь автопарк — где машины сейчас, пробег и рейсы за день, стоянки и простои, доставки клиентам.'}


def portal_map():
    for f, u, name in PAGES:
        title, v = page_text(f)
        v = re.sub(r'^(Фабрика\s*(—\s*[^ ]+\s*)?)+', '', v).strip()
        v = re.sub(r'Загружаю[^.]*…', '', v).strip()
        if u in DESC: v = DESC[u] + ' ' + (v if len(v) > 80 else '')
        add('Раздел портала «%s»' % name, 'Раздел портала «%s» (%s). %s' % (name, u, v[:560]), u, 'Разделы портала')
    try: log = open(B + 'CHANGELOG.txt', encoding='utf-8').read()
    except Exception: log = ''
    vers = re.findall(r'^(\d+\.\d+\.\d+ · [^\n]+)\n((?:- [^\n]*\n?)+)', log, re.M)[:5]
    for head, items in vers:
        add('Что нового на портале: версия ' + head, 'Версия %s: %s' % (head, ' '.join(x.strip('- ').strip() for x in items.strip().split('\n'))), 'home.html#news', 'Что нового')


# REDACTED_B64_1 коммерческий отдел (утверждено 02.11.2026) и правила данных
def ko():
    K = jl(B + 'data/ko_staff.json', {}) or {}
    for z in K.get('zones') or []:
        txt = 'Коммерческий отдел, зона ответственности %s «%s»: ведёт %s%s.%s' % (z.get('n'), z.get('t', ''), z.get('lead') or 'не назначен',
              ('; участвуют: ' + z['part'].rstrip('.')) if z.get('part') else '', (' ' + z['note'][0].upper() + z['note'][1:] + '.') if z.get('note') else '')
        add('Коммерческий отдел: зона %s — %s' % (z.get('n'), z.get('t', '')), txt, 'sales.html#ko', 'Коммерческий отдел')
    for pe in K.get('people') or []:
        if pe.get('status') not in (None, '', 'работает'): continue
        d = '; '.join(x.rstrip('.; ') for x in (pe.get('duties') or [])[:8])
        txt = '%s — %s%s.%s%s%s%s' % (pe.get('name', ''), pe.get('role', ''), (', ' + pe['group']) if pe.get('group') else '',
              (' Подчиняется: ' + pe['reports_to'] + '.') if pe.get('reports_to') else '', (' Задача: ' + pe['purpose']) if pe.get('purpose') else '',
              (' Обязанности: ' + d + '.') if d else '', (' Почта: ' + ', '.join(pe['emails']) + '.') if pe.get('emails') else '')
        if pe.get('subst'): txt += ' Замещение: ' + pe['subst'] + '.'
        add('Коммерческий отдел: ' + pe.get('name', ''), txt, 'sales.html#ko', 'Коммерческий отдел')
    if K.get('src'): add('Коммерческий отдел: структура и функционал', 'Структура и функционал коммерческого отдела на портале (Продажи → Коммерческий отдел). ' + K['src'], 'sales.html#ko', 'Коммерческий отдел')


RULES_KB = [
    ('Закрытие месяца: данные 1С до 5-го числа',
     'Данные за месяц из 1С (продажи, остатки, выпуск по участкам, гальваника) портал собирает накопительным итогом до конца 5-го числа '
     'следующего месяца. С 6-го числа 00:00 по Москве месяц закрыт: цифры фиксируются окончательно и больше не меняются, даже если в 1С '
     'потом прошла корректировка, — поздние правки не принимаются и только отмечаются в реестре закрытий. Решение Т. В. Сотрудник1 02.11.2026. '
     'Например, октябрь принимается до конца дня 5 ноября, с 6 ноября октябрь закрыт.', 'sales.html', 'Правила портала'),
    ('Скидки больше 5 %',
     'Скидки клиентам больше 5 % — решение коммерческого директора Т. В. Сотрудник1. Заявки на такие скидки подаются через Сотрудник19 Ю. А. и '
     'Сотрудник16 К. В. (офис продаж в Рязани) и через Сотрудник6 М. И. (сеть офисов продаж).', 'sales.html#ko', 'Правила портала'),
]


def rules():
    for t, x, u, s in RULES_KB: add(t, x, u, s)


# REDACTED_B64_1 04.11.2026: типовые договоры, регламенты, ГК РФ, прайс 28.10
# Т. В. 04.11.2026: «Пусть знают все договора наши, пусть знают все акты рекламации, как они выглядят, те регламенты работы. Дай им почитать
# сегодня их все, чтобы они в памяти стояли». Полные тексты — фрагментами с заголовком «Договор …, п. X.Y» / «Р-КО-01 …, разд. N, п. M».
# Договоры трёх юрлиц (ЖПС, ПКС, ФТС) во многом совпадают: одинаковый пункт — один фрагмент со списком юрлиц, различия — отдельными фрагментами.
# Реквизиты (счета, ИНН, адреса), шапки и подписи не берутся. Тексты: .doc/.docx → soffice txt, .pdf → pdftotext -layout; кэш — fabrika/kb/src/{dog,regs}/.


KBSRC = '/home/claude/fabrika/kb/src/'
ENT = {'zps': 'ЖПС', 'pks': 'ПКС', 'fts': 'ФТС', 'all': 'все юрлица'}
ENT_FULL = {'zps': 'ЗАО «Жилпромсервис»', 'pks': 'ООО «ПКС»', 'fts': 'ООО «ФТС»'}
# группы одинаковых по смыслу договоров: (ключ, название, [(id договора, метка)], приоритет 1 — главное … 3 — кратко)
DOG_GROUPS = [
    ('sbyt', 'Договор поставки (сбыт)', [('zps_postavka_sbyt', 'ЖПС'), ('pks_postavka_sbyt_ul', 'ПКС'), ('fts_postavka_sbyt', 'ФТС'),
                                          ('zps_postavka_eksport', 'экспорт ЖПС')], {'2', '3', '5', '6', '7', '8'}),
    ('montazh', 'Договор поставки и монтажа', [('fts_postavka_montazh', 'ФТС')], {'3', '4', '6', '7', '8', '9'}),
    ('otsr', 'Доп. соглашение об отсрочке платежа покупателю', [('zps_ds_otsrochka_sbyt', 'ЖПС')], None),
    ('snab90', 'Доп. соглашение к договору снабжения — отсрочка 90 дней', [('zps_ds_snab_90', 'ЖПС'), ('pks_ds_snab_90', 'ПКС'), ('fts_ds_snab_90', 'ФТС')], None),
    ('perev90', 'Доп. соглашение к договору перевозки — отсрочка 90 дней', [('zps_ds_perevozka_90', 'ЖПС')], None),
    ('snab', 'Договор поставки (снабжение, мы — покупатель)', [('zps_postavka_snab', 'ЖПС'), ('fts_postavka_snab', 'ФТС')], set()),
    ('edo', 'Соглашение об ЭДО', [('zps_edo', 'ЖПС'), ('pks_edo', 'ПКС'), ('fts_edo', 'ФТС')], set()),
    ('eksp', 'Договор транспортной экспедиции (с ЭТрН)', [('zps_ekspediciya', 'ЖПС'), ('pks_ekspediciya', 'ПКС'), ('fts_ekspediciya', 'ФТС')], set()),
    ('perev', 'Договор перевозки груза (с ЭТрН)', [('all_perevozka', 'все юрлица')], set()),
    ('etrn', 'Доп. соглашение об ЭТрН к договору перевозки', [('all_ds_etrn', 'все юрлица')], set()),
    ('remont', 'Договор на техобслуживание и ремонт ТС', [('zps_to_remont_ts', 'ЖПС')], set()),
]
EXACT_SECS = {'sbyt': {'6', '7'}}                            # приёмка и качество — каждое отличие отдельным фрагментом, без сводки «отличий»
DOG_URL = 'library.html#dog'
STAT = {}                                                    # сводка для отчёта: договоры, регламенты, фрагменты, отброшено фильтром


def src_text(path, sub):
    """исходник библиотеки → текст (кэш в fabrika/kb/src/<sub>/; пересоздаётся, если исходник новее)"""
    name = re.sub(r'\.(docx?|pdf)$', '', os.path.basename(path), flags=re.I)
    out = KBSRC + sub + '/' + name + '.txt'
    if not os.path.exists(out) or os.path.getmtime(out) < os.path.getmtime(path):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if path.lower().endswith('.pdf'):
            subprocess.run(['pdftotext', '-layout', path, out], check=True, stderr=subprocess.DEVNULL, timeout=180)
        else:
            subprocess.run(['soffice', '--headless', '--convert-to', 'txt:Text (encoded):UTF8', '--outdir', os.path.dirname(out), path],
                           check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=300)
    return open(out, encoding='utf-8-sig').read().replace('\xa0', ' ')


def cap(s):
    s = re.sub(r'\s+', ' ', s).strip().rstrip('.')
    return s[:1].upper() + s[1:].lower() if s.upper() == s else s


TOP_RX = re.compile(r'^(\d{1,2})\.\s*([^\d\s].*)$')
CL_RX = re.compile(r'^(\d{1,2}(?:\.\d{1,2}){1,3})\.?\s+(\S.*)$')
STOP_RX = re.compile(r'реквизит|подписи сторон', re.I)
SIGN_RX = re.compile(r'_{3,}|^М\.\s?[пП]\.?$|^(ПОСТАВЩИК|ПОКУПАТЕЛЬ|ЗАКАЗЧИК|ИСПОЛНИТЕЛЬ|ПЕРЕВОЗЧИК|ЭКСПЕДИТОР|ПОДРЯДЧИК)\b|^(Руководитель|Коммерческий директор|'
                     r'Генеральный директор)\s*$|\bИНН\b|\bОГРН\b|\bКПП\b|\bБИК\b|[Рр]/[сС]ч|[Кк]/[сС]ч|^Адрес:|^Телефон|^E-mail|^ФОРМУ .* УТВЕРЖДАЕМ|^к Договору|^от «')


def dog_parse(text):
    """текст договора → (пункты [{'s': (номер, название раздела), 'n': номер пункта, 'x': текст}], приложения [(заголовок, текст)])"""
    L = [re.sub(r'[ \t]+', ' ', l).strip() for l in text.split('\n')]
    L = [l for l in L if l]
    out, apps, sec, cur, top, stop = [], [], None, None, None, len(L)
    for i, l in enumerate(L):
        if STOP_RX.search(l) and (l.upper() == l or TOP_RX.match(l)) and len(l) < 70: stop = i; break
        m = TOP_RX.match(l)
        if m and not CL_RX.match(l):
            body, nxt = m.group(2), (L[i + 1] if i + 1 < len(L) else '')
            if (body.upper() == body and re.search('[А-ЯЁ]{3}', body)) or (len(body) <= 70 and nxt.startswith(m.group(1) + '.1')):
                sec = (m.group(1), cap(body)); cur = None; top = None; continue
            if sec is None or top is not None or not out:             # договор без разделов (доп. соглашение): «1. …», «2. …»
                top = m.group(1); cur = {'s': sec or ('', ''), 'n': top, 'x': body}; out.append(cur); continue
        m = CL_RX.match(l)
        if m and (sec or top):
            head = m.group(1).split('.')[0]
            if head == (sec[0] if sec and top is None else top):
                cur = {'s': sec or ('', ''), 'n': m.group(1), 'x': m.group(2)}; out.append(cur); continue
        if cur:
            cur['x'] = (cur['x'][:-1] if cur['x'].endswith('-') and l[:1].islower() else cur['x'] + ' ') + l
    # приложения (формы): после реквизитов — «Приложение № N … », без подписей и реквизитов
    tail, app = L[stop:], None
    for l in tail:
        if re.match(r'^Приложение\s*№\s*\d+', l):
            app = [l, []]; apps.append(app); continue
        if app is None or SIGN_RX.search(l): continue
        if re.match(r'^ФОРМУ\b', l): app = None; continue
        app[1].append(l)
    apps = [(a[0], ' '.join(a[1])) for a in apps if len(' '.join(a[1])) > 40]
    return out, apps


def nkey(x):
    x = x.lower().replace('ё', 'е')
    x = re.sub(r'жилпромсервис|ооо|зао|«пкс»|«фтс»|пкс|фтс', 'x', x)
    return re.sub(r'[^a-zа-я0-9]+', '', x)


def numkey(n):
    return [int(p) if p.isdigit() else 0 for p in re.split(r'\D+', n) if p]


def add_merged(items, title_fn, url, section, lim=600):
    """items: [(группа-ключ, номер, текст)] по порядку; подряд идущие короткие пункты одной группы — в один фрагмент «пп. A–B»"""
    buf = []
    def flush():
        if not buf: return
        g, nums, xs = buf[0][0], [b[1] for b in buf], [b[2] for b in buf]
        n = nums[0] if len(nums) == 1 else '%s–%s' % (nums[0], nums[-1])
        add(title_fn(g, n, len(nums) > 1), ' '.join(xs), url, section)
        buf.clear()
    for g, n, x in items:
        if buf and (buf[0][0] != g or sum(len(b[2]) + 1 for b in buf) + len(x) > lim or ';' in n or ';' in buf[-1][1]): flush()
        buf.append((g, n, x))
        if len(x) > lim or ';' in n: flush()                # «ЖПС п. 6.5; ПКС п. 6.6» — отдельным фрагментом, без «пп. …–…»
    flush()


def brief(x, n=170):
    x = re.sub(r'\s+', ' ', x).strip()
    m = re.match(r'(.{40,%d}?[.;:!?])(\s|$)' % n, x)
    return m.group(1) if m else (x if len(x) <= n else x[:n].rsplit(' ', 1)[0] + '…')


def wdiff(a, b, lim=420):
    """слова: что изменилось в b против a — «было» → «стало», + «добавлено», − «убрано»; None — отличий слишком много"""
    import difflib
    aw, bw = a.split(), b.split()
    sm = difflib.SequenceMatcher(None, aw, bw, autojunk=False)
    if sm.ratio() < 0.6: return None
    out = []
    for op, i1, i2, j1, j2 in sm.get_opcodes():
        A, Bt = ' '.join(aw[i1:i2]), ' '.join(bw[j1:j2])
        if op == 'replace': out.append('«%s» → «%s»' % (A, Bt))
        elif op == 'insert': out.append('+ «%s»' % Bt)
        elif op == 'delete': out.append('− «%s»' % A)
    t = '; '.join(out)
    return t if len(t) <= lim else None


def contracts():
    D = jl(LIB + 'dogovory.json', {}) or {}
    by_id = {i['id']: i for i in D.get('items') or []}
    STAT['dog_files'] = 0; STAT['dog_groups'] = 0
    for key, name, members, full in DOG_GROUPS:
        parsed = []
        for did, lab in members:
            it = by_id.get(did)
            if not it: continue
            cl, apps = dog_parse(src_text(LIB + it['file'], 'dog'))
            parsed.append((lab, it, cl, apps)); STAT['dog_files'] += 1
        if not parsed: continue
        STAT['dog_groups'] += 1
        labs_all = [p[0] for p in parsed]; allw = ', '.join(labs_all)
        dates = sorted(set(p[1].get('date') or '' for p in parsed) - {''})
        exact = EXACT_SECS.get(key, set())
        # 1) одинаковый текст — один пункт со списком юрлиц
        seen, order = {}, []
        for lab, it, cl, apps in parsed:
            for c in cl:
                k = nkey(c['x'])
                if len(k) < 8: continue
                if k not in seen:
                    seen[k] = {'labs': [], 'nums': [], 's': c['s'], 'x': c['x'], 'diffs': [], 'base': lab == labs_all[0]}; order.append(k)
                if lab not in seen[k]['labs']: seen[k]['labs'].append(lab); seen[k]['nums'].append(c['n'])
        # 2) почти одинаковый пункт другого юрлица — к пункту первого юрлица (ЖПС) приписываются отличия
        bases = [k for k in order if seen[k]['base']]
        for k in list(order):
            v = seen[k]
            if v['base'] or v['s'][0] in exact: continue
            best, bd = None, None
            for bk in bases:
                b = seen[bk]
                if b['s'][0] != v['s'][0]: continue
                d = wdiff(b['x'], v['x'])
                if d is not None and (bd is None or len(d) < len(bd)): best, bd = bk, d
            if best:
                seen[best]['diffs'].append((v['labs'], v['nums'], bd)); order.remove(k)
        order.sort(key=lambda k: (numkey(seen[k]['s'][0] or '0'), numkey(seen[k]['nums'][0])))
        full_items, brief_secs = [], {}
        for k in order:
            v = seen[k]; sn = v['s'][0]
            if full is not None and sn not in full:
                brief_secs.setdefault(v['s'], []).append(v); continue
            who = '' if v['labs'] == labs_all and len(labs_all) > 1 else ', '.join(v['labs'])
            nums = sorted(set(v['nums']), key=numkey)
            ntxt = nums[0] if len(nums) == 1 else '; '.join('%s п. %s' % (l, n) for l, n in zip(v['labs'], v['nums']))
            x = ('Пункт %s: ' % ntxt if len(nums) == 1 else '(%s) ' % ntxt) + v['x']
            for labs, nn, d in v['diffs']:
                x += ' Отличия у %s (пункт %s): %s.' % (', '.join(labs), ', '.join(sorted(set(nn), key=numkey)), d)
                who = who and (who + ', ' + ', '.join(labs))
            full_items.append(((v['s'], who), ntxt, x))
        def tf(g, n, many, name=name, allw=allw):
            (sn, st), who = g
            sec = (' — разд. %s «%s»' % (sn, st)) if sn else ''
            return '%s (%s)%s, %s' % (name, who or allw, sec, n if ';' in n else ('%s %s' % ('пп.' if many else 'п.', n)))
        add_merged(full_items, tf, DOG_URL, 'Договоры')
        for (sn, st), vs in sorted(brief_secs.items(), key=lambda kv: numkey(kv[0][0] or '0')):
            rows, ln = [], 0
            for v in vs:
                who = '' if v['labs'] == labs_all or len(labs_all) == 1 else ' (%s)' % ', '.join(v['labs'])
                r = 'пункт %s%s — %s' % (v['nums'][0], who, brief(v['x'], 120)); ln += len(r) + 1
                if ln > 480: rows.append('… (далее — в файле договора)'); break
                rows.append(r)
            add('%s (%s)%s — кратко' % (name, allw, (' — разд. %s «%s»' % (sn, st)) if sn else ''),
                'Кратко (полный текст — файл договора в «Документы → Договоры»): ' + ' '.join(rows), DOG_URL, 'Договоры')
        # приложения: форма акта рекламации — полностью (у других юрлиц — только отличия); остальные формы — кратко
        aseen, abase = {}, {}
        for lab, it, cl, apps in parsed:
            for h, x in apps:
                k = nkey(x)[:300]
                if k in aseen: aseen[k][2].append(lab); continue
                b = abase.get(h)
                d = wdiff(aseen[b][1], x, 300) if b else None
                if d is not None: aseen[b][3].append((lab, d)); continue
                aseen[k] = [h, x, [lab], []]
                abase.setdefault(h, k)
        for h, x, labs, diffs in aseen.values():
            if not re.search(r'рекламац', x, re.I): x = brief(x, 300)
            for lab, d in diffs: x += ' Отличия у %s: %s.' % (lab, d)
            add('%s (%s) — %s' % (name, ', '.join(labs + [l for l, _ in diffs]), h), '%s к договору «%s» (%s): %s' % (h, name, ', '.join(labs), x[:1800]),
                DOG_URL, 'Договоры')
        ents = ', '.join(ENT_FULL.get(p[1].get('ent'), '') for p in parsed if p[1].get('ent') in ENT_FULL)
        add('%s — что это за договор' % name,
            '%s — действующая типовая форма (%s%s; от юриста Сотрудник25 Н. Я., 27.10.2026). Юрлица: %s. Договор с клиентом — только по типовой форме; '
            'изменения — протоколом разногласий через юриста (инструкция И-КО-05). Файл — «Документы → Договоры» на портале.' % (
                name, allw, (', редакция от ' + ', '.join(dates)) if dates else '', ents or allw), DOG_URL, 'Договоры')


# REDACTED_B64_1 регламенты, инструкции, бланки (library/regs.json, pdf)
REG_PRIO = {'ko-rekl-reg': 1, 'ko-rekl': 1, '1c-rekl': 1, 'f-akt': 1, 'ko-dog': 1, 'f-sz': 2, 'ko-pogr': 2, '1c-otzyv': 2}   # 1–2 — полностью
HDR_RX = re.compile(r'^(?:390525|ГК «Фабрикант» ·|(?:[А-ЯЁ]{1,2} ){4,}|Утвержден|Структурные подразделения|директором|Рис\. \d)|\bИНН \d|Лист \d+ из \d+')   # 12.11 CodeQL: ^ вынесен за скобки, смысл тот же   # без re.I: «рекламацию…» — не шапка
CODE_RX = re.compile(r'(Регламент|Инструкция|Форма|Бланк|Чек-лист|Памятка|Скрипт|Схема)\s+([А-ЯЁA-Z]{1,3}(?:[- ][А-ЯЁA-Z0-9]{1,4}){1,3})\s+·\s+ред\.')


def reg_parse(text):
    """pdftotext -layout регламента → (код, вступление, пункты [(номер раздела, название, номер пункта, текст)])"""
    code, intro, items, sec, cur, last_sec = None, [], [], ('', ''), None, 0
    for raw in text.split('\n'):
        l = re.sub(r'\s+', ' ', raw).strip()
        if not l: continue
        m = CODE_RX.search(l)
        if m and not code: code = m.group(2).replace(' ', '-')
        if HDR_RX.search(l) and not re.match(r'^\d{1,2}\.? [А-ЯЁ]', l): continue
        if re.search(r'Лист \d+ из \d+', l): continue
        m = re.match(r'^(\d{1,2}) ([А-ЯЁ][^.]{2,110})$', l)
        if m and int(m.group(1)) == last_sec + 1 and not l.endswith(','):
            last_sec = int(m.group(1)); sec = (m.group(1), m.group(2).strip()); cur = None; continue
        m = re.match(r'^(\d{1,2})\. (\S.*)$', l)
        if m:
            cur = [sec[0], sec[1], m.group(1), m.group(2)]; items.append(cur); continue
        if cur:
            cur[3] = (cur[3][:-1] if cur[3].endswith('-') and l[:1].islower() else cur[3] + ' ') + l
        elif sec[0]:
            cur = [sec[0], sec[1], '', l]; items.append(cur)
        else: intro.append(l)
    items = [it for it in items if 'Лист согласования' not in it[1]]
    return code, ' '.join(intro), items


def regulations():
    R = jl(LIB + 'regs.json', {}) or {}
    G = {g['k']: g['t'] for g in R.get('groups') or []}
    STAT['reg_files'] = 0; STAT['reg_full'] = 0
    for d in R.get('docs') or []:
        p = LIB + (d.get('file') or '')
        if not d.get('file') or not os.path.exists(p): continue
        prio = REG_PRIO.get(d['id'], 3)
        code, intro, items = reg_parse(src_text(p, 'regs')); STAT['reg_files'] += 1
        url = 'library.html#forms' if d.get('g') == 'forms' else 'library.html#regs'
        nm = '%s%s «%s»' % (d.get('kind', 'Документ'), (' ' + code) if code else '', d.get('title', ''))
        intro = re.sub(r'\s+', ' ', intro).strip()
        add(nm + ' — назначение', '%s (%s%s, тема «%s»). %s' % (nm, G.get(d.get('g'), ''), (', от ' + d['date']) if d.get('date') else '', d.get('topic', ''),
            intro[:900]), url, 'Регламенты')
        if prio <= 2:
            STAT['reg_full'] += 1
            rows = []
            for sn, st, n, x in items:
                num = ('разд. %s, п. %s' % (sn, n)) if sn and n else ('разд. %s' % sn if sn else 'п. %s' % n)
                pre = ('Раздел %s, пункт %s: ' % (sn, n)) if sn and n else ('Раздел %s: ' % sn if sn else 'Пункт %s: ' % n)
                rows.append(((sn, st), num, pre + x))
            def tf(g, n, many, nm=nm):
                sn, st = g
                return '%s%s, %s' % (nm, (' — %s. %s' % (sn, st)) if sn else '', n)
            add_merged(rows, tf, url, 'Регламенты')
        else:                                                # остальное — кратко: разделы и первые пункты, не больше двух фрагментов
            secs, order = {}, []
            for sn, st, n, x in items:
                if (sn, st) not in secs: secs[(sn, st)] = []; order.append((sn, st))
                if len(secs[(sn, st)]) < 2: secs[(sn, st)].append(('пункт %s — ' % n if n else '') + brief(x, 110))
            body = ' '.join(('%s. %s: ' % (sn, st) if sn else '') + ' '.join(secs[(sn, st)]) for sn, st in order)
            if len(body) > 1100: body = body[:1100].rsplit(' ', 1)[0] + ' … (далее — в документе)'
            if body: add(nm + ' — кратко', 'Кратко (полный текст — «Документы → Регламенты» на портале): ' + body, url, 'Регламенты')


# REDACTED_B64_1 ГК РФ: проверено по consultant.ru 04.11.2026 (ред. от 24.06.2025, с изм. от 09.06.2026)
CONS = 'https://www.consultant.ru/document/cons_doc_LAW_9027/'
GK = [
    ('474', 'Проверка качества товара', 'REDACTED_HEX_2',
     '1. Проверка качества товара может быть предусмотрена законом, иными правовыми актами, обязательными требованиями, установленными в соответствии '
     'с законодательством РФ о техническом регулировании, или договором купли-продажи. Порядок проверки качества товара устанавливается законом, иными '
     'правовыми актами, обязательными требованиями … или договором. 2. Если порядок проверки качества не установлен, проверка производится в соответствии '
     'с обычаями делового оборота или иными обычно применяемыми условиями проверки товара. 3. Если предусмотрена обязанность продавца проверить качество '
     'товара (испытание, анализ, осмотр и т. п.), продавец должен предоставить покупателю доказательства осуществления проверки качества товара. '
     '4. Порядок, а также иные условия проверки качества товара, производимой как продавцом, так и покупателем, должны быть одними и теми же.'),
    ('475', 'Последствия передачи товара ненадлежащего качества', 'REDACTED_ID_1',
     '1. Если недостатки товара не были оговорены продавцом, покупатель, которому передан товар ненадлежащего качества, вправе по своему выбору потребовать '
     'от продавца: соразмерного уменьшения покупной цены; безвозмездного устранения недостатков товара в разумный срок; возмещения своих расходов на '
     'устранение недостатков товара. 2. В случае существенного нарушения требований к качеству товара (обнаружения неустранимых недостатков, недостатков, '
     'которые не могут быть устранены без несоразмерных расходов или затрат времени, или выявляются неоднократно, либо проявляются вновь после их устранения, '
     'и других подобных недостатков) покупатель вправе по своему выбору: отказаться от исполнения договора купли-продажи и потребовать возврата уплаченной '
     'за товар денежной суммы; потребовать замены товара ненадлежащего качества товаром, соответствующим договору. 3. Требования об устранении недостатков '
     'или о замене товара могут быть предъявлены покупателем, если иное не вытекает из характера товара или существа обязательства. 5. Правила этой статьи '
     'применяются, если ГК РФ или другим законом не установлено иное.'),
    ('476', 'Недостатки товара, за которые отвечает продавец', 'REDACTED_HEX_3',
     '1. Продавец отвечает за недостатки товара, если покупатель докажет, что недостатки товара возникли до его передачи покупателю или по причинам, '
     'возникшим до этого момента. 2. В отношении товара, на который продавцом предоставлена гарантия качества, продавец отвечает за недостатки товара, '
     'если не докажет, что недостатки товара возникли после его передачи покупателю вследствие нарушения покупателем правил пользования товаром или его '
     'хранения, либо действий третьих лиц, либо непреодолимой силы.'),
    ('477', 'Сроки обнаружения недостатков переданного товара', 'REDACTED_HEX_4',
     '1. Если иное не установлено законом или договором купли-продажи, покупатель вправе предъявить требования, связанные с недостатками товара, при условии, '
     'что они обнаружены в сроки, установленные этой статьёй. 2. Если на товар не установлен гарантийный срок или срок годности, требования могут быть '
     'предъявлены, если недостатки обнаружены в разумный срок, но в пределах двух лет со дня передачи товара покупателю (или более длительного срока по закону '
     'или договору); для товара, подлежащего перевозке или отправке по почте, срок исчисляется со дня доставки в место назначения. 3. Если на товар установлен '
     'гарантийный срок, покупатель вправе предъявить требования при обнаружении недостатков в течение гарантийного срока (по комплектующим — особые правила). '
     '4. Для товара со сроком годности — в течение срока годности. 5. Если гарантийный срок по договору меньше двух лет и недостатки обнаружены после него, '
     'но в пределах двух лет со дня передачи, продавец отвечает, если покупатель докажет, что недостатки возникли до передачи товара или по причинам, '
     'возникшим до этого момента. Важно: п. 2 ст. 477 признан частично не соответствующим Конституции (Постановление КС РФ от 09.06.2026 № 38-П): до изменений '
     'закона требования по недостаткам, обнаруженным в пределах этого срока, можно предъявить и после его окончания — в пределах исковой давности.'),
    ('483', 'Извещение продавца о ненадлежащем исполнении договора купли-продажи', 'REDACTED_HEX_5',
     '1. Покупатель обязан известить продавца о нарушении условий договора о количестве, ассортименте, качестве, комплектности, таре и (или) упаковке товара '
     'в срок, предусмотренный законом, иными правовыми актами или договором, а если срок не установлен — в разумный срок после того, как нарушение должно было '
     'быть обнаружено исходя из характера и назначения товара. 2. Если покупатель этого не сделал, продавец вправе отказаться полностью или частично от '
     'удовлетворения требований покупателя (о недостающем количестве, замене, устранении недостатков, доукомплектовании, таре и упаковке), если докажет, что '
     'это повлекло невозможность удовлетворить требования или несоизмеримые расходы по сравнению с теми, которые он понёс бы при своевременном извещении. '
     '3. Если продавец знал или должен был знать, что товары не соответствуют договору, он не вправе ссылаться на пп. 1 и 2.'),
    ('513', 'Принятие товаров покупателем (поставка)', 'REDACTED_HEX_6',
     '1. Покупатель (получатель) обязан совершить все необходимые действия, обеспечивающие принятие товаров, поставленных в соответствии с договором поставки. '
     '2. Принятые товары должны быть осмотрены в срок, определённый законом, иными правовыми актами, договором поставки или обычаями делового оборота. '
     'Покупатель обязан в этот же срок проверить количество и качество принятых товаров в установленном порядке и о выявленных несоответствиях или '
     'недостатках незамедлительно письменно уведомить поставщика. 3. При получении товаров от транспортной организации покупатель обязан проверить '
     'соответствие товаров сведениям в транспортных и сопроводительных документах и принять их с соблюдением правил, регулирующих деятельность транспорта.'),
    ('518', 'Последствия поставки товаров ненадлежащего качества', 'REDACTED_HEX_7',
     '1. Покупатель (получатель), которому поставлены товары ненадлежащего качества, вправе предъявить поставщику требования, предусмотренные статьёй 475, '
     'за исключением случая, когда поставщик, получивший уведомление покупателя о недостатках поставленных товаров, без промедления заменит поставленные '
     'товары товарами надлежащего качества. 2. Покупатель, осуществляющий продажу поставленных ему товаров в розницу, вправе требовать замены в разумный срок '
     'товара ненадлежащего качества, возвращённого потребителем, если иное не предусмотрено договором поставки (в наших типовых договорах поставки иное '
     'предусмотрено: ЖПС и ПКС — п. 6.10, ФТС — п. 6.9).'),
    ('720', 'Приемка заказчиком работы, выполненной подрядчиком', 'REDACTED_HEX_8',
     '1. Заказчик обязан в сроки и в порядке, предусмотренные договором подряда, с участием подрядчика осмотреть и принять выполненную работу, а при '
     'обнаружении отступлений от договора, ухудшающих результат, или иных недостатков немедленно заявить об этом подрядчику. 2. Заказчик, обнаруживший '
     'недостатки при приёмке, вправе ссылаться на них, если они оговорены в акте (или в ином документе о приёмке) либо оговорена возможность последующего '
     'требования об их устранении. 3. Если договором не предусмотрено иное, заказчик, принявший работу без проверки, лишается права ссылаться на явные '
     'недостатки (которые могли быть установлены при обычном способе приёмки). 4. Скрытые недостатки (в т. ч. умышленно скрытые подрядчиком) заказчик обязан '
     'сообщить подрядчику в разумный срок по их обнаружении. 5. При споре о недостатках или их причинах по требованию любой стороны назначается экспертиза; '
     'расходы несёт подрядчик, кроме случаев, когда экспертиза не установила нарушений подрядчика или причинной связи — тогда платит сторона, потребовавшая '
     'экспертизу (по соглашению сторон — поровну). 6. При уклонении заказчика от приёмки подрядчик через месяц после срока передачи и двукратного '
     'предупреждения вправе продать результат (п. 6, если договором не предусмотрено иное). 7. Риск случайной гибели при просрочке из-за уклонения заказчика '
     'переходит к заказчику.'),
    ('721', 'Качество работы', 'REDACTED_HEX_9',
     '1. Качество выполненной работы должно соответствовать условиям договора подряда, а при их отсутствии или неполноте — требованиям, обычно предъявляемым '
     'к работам соответствующего рода. Результат работы в момент передачи должен обладать свойствами, указанными в договоре или обычно предъявляемыми, и в '
     'пределах разумного срока быть пригодным для установленного договором (или обычного) использования. 2. Обязательные требования к работе подрядчик-'
     'предприниматель обязан соблюдать; по договору он может принять более высокие требования к качеству.'),
    ('722', 'Гарантия качества работы', 'REDACTED_HEX_10',
     '1. Если законом, иным правовым актом, договором подряда или обычаями делового оборота предусмотрен гарантийный срок, результат работы должен в течение '
     'всего гарантийного срока соответствовать условиям договора о качестве. 2. Гарантия качества, если договором не предусмотрено иное, распространяется на '
     'всё, составляющее результат работы.'),
    ('723', 'Ответственность подрядчика за ненадлежащее качество работы', 'REDACTED_HEX_11',
     '1. Если работа выполнена с отступлениями от договора, ухудшившими результат, или с иными недостатками, делающими его непригодным для предусмотренного '
     '(или обычного) использования, заказчик вправе, если иное не установлено законом или договором, по своему выбору потребовать: безвозмездного устранения '
     'недостатков в разумный срок; соразмерного уменьшения цены; возмещения своих расходов на устранение недостатков, если право заказчика устранять их '
     'предусмотрено договором. 2. Подрядчик вправе вместо устранения недостатков безвозмездно выполнить работу заново с возмещением убытков от просрочки. '
     '3. Если недостатки не устранены в установленный заказчиком разумный срок либо являются существенными и неустранимыми, заказчик вправе отказаться от '
     'договора и потребовать возмещения убытков. 4. Условие договора об освобождении подрядчика от ответственности за определённые недостатки не освобождает '
     'его, если доказано, что они возникли по его вине. 5. Подрядчик, предоставивший материал, отвечает за его качество по правилам ответственности продавца '
     '(ст. 475).'),
    ('724', 'Сроки обнаружения ненадлежащего качества результата работы', 'REDACTED_HEX_12',
     '1. Если иное не установлено законом или договором подряда, заказчик вправе предъявить требования, связанные с ненадлежащим качеством результата работы, '
     'при условии, что оно выявлено в сроки этой статьи. 2. Без гарантийного срока — если недостатки обнаружены в разумный срок, но в пределах двух лет со '
     'дня передачи результата работы (если иные сроки не установлены законом, договором или обычаями). 3. Заказчик вправе предъявить требования по '
     'недостаткам, обнаруженным в течение гарантийного срока. 4. Если гарантийный срок меньше двух лет и недостатки обнаружены после него, но в пределах двух '
     'лет, подрядчик отвечает, если заказчик докажет, что недостатки возникли до передачи результата или по причинам, возникшим до этого момента. '
     '5. Гарантийный срок, если договором не предусмотрено иное, начинает течь с момента, когда результат был принят или должен был быть принят заказчиком.'),
    ('725', 'Давность по искам о ненадлежащем качестве работы', 'REDACTED_HEX_13',
     '1. Срок исковой давности для требований в связи с ненадлежащим качеством работы по договору подряда — один год (для зданий и сооружений — по правилам '
     'ст. 196). 2. Если результат принят по частям, давность течёт со дня приёмки результата в целом. 3. Если установлен гарантийный срок и заявление о '
     'недостатках сделано в его пределах, давность течёт со дня заявления о недостатках.'),
]


def gk():
    for art, t, h, x in GK:
        add('ГК РФ, ст. %s «%s»' % (art, t), 'ГК РФ (часть вторая), ст. %s «%s» (проверено по КонсультантПлюс 04.11.2026, ред. от 24.06.2025 с изм. от 09.06.2026): %s'
            % (art, t, x), CONS + h + '/', 'ГК РФ')


# REDACTED_B64_1 памятки бота (сводка по договору, регламенту и ГК — для сценариев bot_rules.json)
GUIDES = [
    ('Рекламация клиента: что делать (памятка бота)',
     'Порядок при претензии клиента по качеству (регламент Р-КО-01, инструкции И-КО-06 и И-1С-05): 1) менеджер, который ведёт клиента, получает от клиента '
     'акт рекламации по форме РК 01 (приложение № 1 к договору поставки) — на бланке клиента, с подписью и печатью, № и дата накладной, № договора, описание '
     'дефектов, требования клиента; фото каждого изделия с дефектом (сколько изделий в акте — столько фото/видео), фото ярлыка и упаковки с печатью ОТК; '
     '2) регистрирует рекламацию в 1С («Заказы → Рекламация», «Провести и закрыть» — появляется номер; адрес доставки — вкладка «Дополнительно»); '
     '3) одновременно письмом на user11@example.org (ОТК / менеджер по рекламациям Сотрудник22 А. А.) с темой «Рекламация № … от …» и всеми файлами клиента; '
     '4) ПТО рассматривает рекламацию 5 дней с регистрации в 1С и полного пакета документов (Р-КО-01, разд. 2, п. 4; срок ответа менеджеру — разд. 1, п. 4); '
     '5) ответ клиенту — не позднее 3 дней после ответа ПТО или юриста (разд. 1, п. 5). Статус в 1С: две галочки (ПТО и комиссия) — рассмотрено; закрытая '
     'рекламация — зелёная строка.'),
    ('Рекламация: сроки по пунктам наших типовых договоров (ЖПС, ПКС, ФТС)',
     'Видимые недостатки: приёмка по внутритарному количеству и качеству (у ПКС и ФТС — и комплектности) — не позднее 5 рабочих дней с фактической передачи (п. 6.1 у ЖПС, ПКС, ФТС; '
     'поставка и монтаж ФТС — п. 3.1, а товар с работами — осмотр и приёмка в 2 календарных дня с уведомления о готовности, п. 4.2). Немедленно уведомить '
     'поставщика и составить акт с фото/видео — ЖПС п. 6.2, ПКС и ФТС п. 6.3, монтаж п. 3.2. Поставщик рассматривает акт 10 рабочих дней; предельный срок '
     'претензий по видимым недостаткам, ассортименту, комплектности — 10 рабочих дней с передачи, позже не принимаются — ЖПС п. 6.3, ПКС и ФТС п. 6.4, '
     'монтаж п. 3.3. Скрытые дефекты — в гарантийный срок 12 месяцев с даты поставки, только по надлежащему акту рекламации с фото — ЖПС п. 6.4, ПКС п. 6.5 '
     '(претензии — напрямую изготовителю ЗАО «Жилпромсервис»), экспорт ЖПС п. 6.5, монтаж п. 9.1 и 9.4 (12 месяцев с даты УПД/акта работ). В договоре ФТС '
     '(сбыт) отдельного пункта о скрытых дефектах и 12 месяцах нет — гарантия по «Правилам эксплуатации, хранения и условиям гарантии» на fabrikant.su '
     '(пп. 7.1, 7.6). Ответ на акт рекламации — электронным письмом в течение 10 рабочих дней: ЖПС п. 6.5, ПКС п. 6.6, ФТС п. 6.5, монтаж п. 9.5.'),
    ('Рекламация: права поставщика по нашим договорам',
     'По типовым договорам поставки поставщик вправе: не рассматривать акт рекламации, оформленный с нарушениями (ЖПС п. 6.5, ПКС п. 6.6, ФТС п. 6.5, '
     'монтаж п. 9.5); потребовать товар на проверку качества или экспертизу — доставку организует покупатель за свой счёт (ЖПС п. 6.6, ПКС п. 6.7, ФТС п. 6.6, '
     'монтаж п. 9.6); экспертиза — всего заявленного количества, выборочная не допускается (ЖПС п. 6.7 — за счёт стороны, которая её требует; ПКС п. 6.8, '
     'ФТС п. 6.7; монтаж п. 9.7); замена, возврат денег, гарантийное обслуживание — при доставке товара покупателем на склад поставщика (ЖПС и ПКС п. 6.9, '
     'ФТС п. 6.8, монтаж п. 3.4); покупатель, продающий в розницу, не вправе требовать замены товара, возвращённого потребителем (ЖПС и ПКС п. 6.10, '
     'ФТС п. 6.9; ч. 2 ст. 518 ГК РФ); поставщик не отвечает за недостатки, если покупатель не докажет, что они возникли до передачи (п. 7.3 у всех трёх); '
     'товар назад — только с сохранённым товарным видом, с накладной на возврат со ссылкой на рекламацию и оригиналом акта (п. 7.4; у ПКС — ещё счёт-фактура); '
     'небольшое отличие внешнего вида от фото или другой партии — не брак (ЖПС и ПКС п. 6.11, ФТС п. 6.10, монтаж п. 3.5).'),
    ('Спор с клиентом: с чего начинать (памятка бота)',
     'Сначала выяснить, какой договор подписан с клиентом: наш типовой (какого юрлица — ЖПС, ПКС или ФТС; «поставка (сбыт)» или «поставка и монтаж»; '
     'номер и дата) или договор клиента / иной. Наш типовой — действовать по его пунктам: приёмка и рекламации — разд. 6, качество — разд. 7, ответственность '
     '— разд. 8 (для «поставки и монтажа» — разд. 3, 4, 8, 9); фиксировать всё письменно (почта, акт), сроки считать в рабочих днях. Договор не наш — '
     'попросить копию (в группу или на почту) и передать в ПТО (technolog@, tech-main@) по И-КО-06, а до прочтения — только общие правила ГК РФ '
     '(ст. 474–477, 483, 513, 518; для работ — 720–725) с оговоркой «окончательно — после чтения договора»; сложные вопросы — юрист Сотрудник25 Н. Я. '
     '(user12@example.org). Деньги, скидки, признание вины, сроки сверх договора — не обещать: это решает Т. В. Сотрудник1.'),
]


def guides():
    for t, x in GUIDES: add(t, x, 'library.html#recl', 'Памятки бота')


# REDACTED_B64_1 прайс 28.10.2026 → price_now.json (для кода ботов) и фрагменты базы
PRICE_X = LIB + 'raw/prices/prais_2026-10-28.xlsx'
PRICE_OUT = '/home/claude/app_build/host/live/price_now.json'
BASES = [('I', ['Рязань', 'Москва']), ('II', ['Краснодар', 'Сотрудник11 Имя2']), ('III', ['Самара']), ('IV', ['Екатеринбург']), ('V', ['Крым'])]
CITY = {'рязань': 'I', 'рязанская': 'I', 'поляны': 'I', 'москва': 'I', 'московская': 'I', 'краснодар': 'II', 'краснодарский': 'II', 'нижний новгород': 'II',
        'нижегородская': 'II', 'самара': 'III', 'самарская': 'III', 'екатеринбург': 'IV', 'свердловская': 'IV', 'урал': 'IV', 'крым': 'V',
        'симферополь': 'V', 'севастополь': 'V'}
BLEG = 'I — Рязань, Москва; II — Краснодар, Сотрудник11 Имя2; III — Самара; IV — Екатеринбург; V — Крым'


def _xlsx_fixed(path):
    """в файле 1С лист строк назван xl/SharedStrings.xml (с большой буквы) — openpyxl его не видит; картинки и рисунки не нужны"""
    zi, buf = zipfile.ZipFile(path), io.BytesIO()
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zo:
        for i in zi.infolist():
            n = i.filename
            if n.startswith(('xl/media/', 'xl/drawings/', 'xl/worksheets/_rels/')): continue
            data = zi.read(n)
            if n == 'xl/SharedStrings.xml': n = 'xl/sharedStrings.xml'
            if n.endswith('.rels') or n == '[Content_Types].xml': data = data.replace(b'SharedStrings.xml', b'sharedStrings.xml')
            zo.writestr(n, data)
    buf.seek(0); return buf


def price_rows():
    import openpyxl
    wb = openpyxl.load_workbook(_xlsx_fixed(PRICE_X), data_only=True)
    rows = []
    for ws in wb.worksheets:
        hdr1 = {c.column: str(c.value).strip() for c in ws[1] if c.value is not None}
        hdr2 = {c.column: str(c.value).strip() for c in ws[2] if c.value is not None}
        pcol = {v: k for k, v in hdr2.items() if v in ('I', 'II', 'III', 'IV', 'V')}
        mcol = [k for k, v in hdr2.items() if v == 'Модель']
        kcol = [k for k, v in hdr1.items() if v == 'КРАТНОСТЬ']
        scol = [(k, v) for k, v in sorted(hdr2.items()) if v not in ('Фото', 'Модель', 'I', 'II', 'III', 'IV', 'V')]
        if len(pcol) < 5 or not mcol: continue
        group, last = ws.title, ''
        for r in ws.iter_rows(min_row=3):
            v = {c.column: c.value for c in r if c.value is not None}
            if not v: continue
            name = str(v.get(mcol[0], '') or '').strip()
            pr = {b: v.get(pcol[b]) for b in ('I', 'II', 'III', 'IV', 'V')}
            if not all(isinstance(x, (int, float)) for x in pr.values()):
                vals = [str(x).strip() for x in v.values() if str(x).strip()]
                if len(vals) == 1 and not re.search(r'\d{3}', vals[0]): group = vals[0]
                continue
            name = name or last; last = name
            spec = {h.lower(): str(v.get(k)).strip() for k, h in scol if v.get(k) is not None and str(v.get(k)).strip() not in ('', '-')}
            rows.append({'group': group, 'sheet': ws.title, 'model': re.sub(r'\s+', ' ', name), 'pack': v.get(kcol[0]) if kcol else None,
                         'spec': spec, 'p': {b: int(round(x)) for b, x in pr.items()}})
    return rows


def money(x): return '{:,}'.format(x).replace(',', ' ')


def prices():
    rows = price_rows()
    same = 0
    for i, r in enumerate(rows):
        r['id'] = 'p%04d' % (i + 1)
        ps = list(r['p'].values())
        r['same'] = [b for b in ('I', 'II', 'III', 'IV', 'V') if ps.count(r['p'][b]) > 1]   # одинаковая цена на разных базисах — проверить с ПЭО
        if r['same']: same += 1
    out = {'v': 1, 'date': '2026-10-28', 'src': 'library/raw/prices/prais_2026-10-28.xlsx (прайс-лист от 28.10.26, ГК «Фабрикант»)',
           't': datetime.datetime.now(MSK).strftime('%Y-%m-%dT%H:%M'), 'currency': 'RUB', 'vat': 'цены с НДС',
           'note': 'Цены прайс-листа действуют для клиентов, заключивших договор поставки до 9 сентября 2026 года, носят информационный характер и не являются '
                   'публичной офертой (расшифровка прайса). Цена зависит от базиса отгрузки (региона); одинаковых цен по регионам быть не должно — строки с '
                   'совпадением отмечены в same. Скидка больше 5 % — только с согласия Т. В. Сотрудник1.',
           'bases': [{'k': k, 'cities': c} for k, c in BASES], 'city_basis': CITY,
           'peo': [{'name': 'Сотрудник55 Имя6 Отчество30', 'role': 'начальник ПЭО', 'mail': 'user13@example.org'},
                   {'name': 'Сотрудник56 Имя20 Отчество31', 'role': 'экономист ПЭО', 'mail': 'user14@example.org'}],
           'discount_owner_pct': 5, 'n': len(rows), 'n_same': same, 'items': rows}
    tmp = PRICE_OUT + '.tmp'; json.dump(out, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':')); os.replace(tmp, PRICE_OUT)
    STAT['price_rows'] = len(rows); STAT['price_same'] = same
    add('Прайс-лист 28.10.2026: базисы отгрузки и цены',
        'Действующий прайс-лист ГК «Фабрикант» от 28.10.2026 (цены с НДС, руб.). Базисы отгрузки (регион определяет цену): %s. Цены действуют для клиентов, '
        'заключивших договор поставки до 9 сентября 2026 года, информационные, не публичная оферта. Цена всегда называется с базисом (регионом); одинаковых '
        'цен по регионам быть не должно. Скидка больше 5 %% — только с согласия Т. В. Сотрудник1; расчёт новой цены — ПЭО (Сотрудник55 А. А., econom-3@; '
        'Сотрудник56 Р. С., econom-2@). Наценки: постоплата — от 4 %%, нестандартная ткань/цвет — +15 %%, ткань VL — +15 %%, DO в цвете 257 и 203 — +10 %%.' % BLEG,
        'library.html#prices', 'Прайс')
    by, order = {}, []
    for r in rows:
        if r['model'] not in by: by[r['model']] = []; order.append(r['model'])
        by[r['model']].append(r)
    fam, famo = {}, []
    for m in order:                                               # семейство («Самба …», «Вип …») — один-два фрагмента
        g = (by[m][0]['group'], re.split(r'[\s(]', m)[0])
        if g not in fam: fam[g] = []; famo.append(g)
        fam[g].append(m)
    def rng(rs, b):
        a, z = min(r['p'][b] for r in rs), max(r['p'][b] for r in rs)
        return str(a) if a == z else '%d–%d' % (a, z)
    groups = {}
    for g in famo: groups.setdefault(g[0], []).append(g)
    for grp, gs in groups.items():                                # подряд семейства одного раздела — в фрагмент до ~560 знаков
        buf, ln = [], 0
        def flush():
            if not buf: return
            fams = [b[0] for b in buf]
            t = 'Прайс 28.10: %s (%s)' % (', '.join(fams)[:110], grp)
            x = 'С НДС, руб., базисы I/II/III/IV/V, от–до по исполнениям: %s.' % '; '.join(b[1] for b in buf)
            models = [m for b in buf for m in b[2]]
            n0 = len(F); add(t, x, 'library.html#prices', 'Прайс')
            kk = KB.keys(' '.join(models) + ' ' + grp + ' прайс цена', limit=40)
            for f in F[n0:]: f['k'] = kk
            buf.clear()
        for g in gs:
            parts = []
            for m in fam[g]:
                rs = by[m]
                ups = sorted(set(r['spec'].get('обивка', '') for r in rs) - {''})
                parts.append('%s%s: %s' % (m, (' (' + ', '.join(ups)[:40] + ')') if ups else '', '/'.join(rng(rs, b) for b in ('I', 'II', 'III', 'IV', 'V'))))
            txt = '; '.join(parts)
            if buf and ln + len(txt) > 560: flush(); ln = 0
            buf.append((g[1], txt, fam[g])); ln += len(txt) + 2
        flush()

def slim_keys(frs, limit=30, df_max=0.3):
    """ключи фрагментов договоров и регламентов: без слов, что есть почти в каждом фрагменте раздела («договор», «товар», «поставщик»…) — иначе
    любой вопрос со словом «договор» совпадает со всеми; не больше limit ключей (размер kb.bin)"""
    df, n = {}, max(1, len(frs))
    for f in frs:
        for k in set(f['k']): df[k] = df.get(k, 0) + 1
    for f in frs: f['k'] = [k for k in f['k'] if df[k] / n <= df_max or k in KEEP_KEYS][:limit]
    return sorted(k for k, c in df.items() if c / n > df_max and k not in KEEP_KEYS)


# слова сценариев бота (рекламация, спор, цена) и юрлица — ключами остаются всегда, даже если есть почти в каждом фрагменте
KEEP_KEYS = set(KB.keys('рекламация рекламации претензия брак дефект гарантия гарантийный срок сроки приемка качество акт экспертиза возврат замена '
                        'скидка цена оплата отгрузка неустойка штраф монтаж ЖПС ПКС ФТС экспорт снабжение перевозка экспедиция ЭДО отсрочка', limit=80))


KB_PORTAL_BUDGET = 1250000                                     # байт зашифрованного kb_portal.txt: остаток до kb_build.MAX_KB — страницам fabrikant.su


def media_kb():                                      # 11.11.2026 (Т. В.): что узнали из фото и видео групп MAX — work/media/knowledge.json (media_scan.py kb)
    for x in jl('/home/claude/fabrika/work/media/knowledge.json', []) or []:
        if x.get('x'): add(x.get('t') or 'Из групп MAX', x['x'], 'index.html', 'Из групп MAX')


def main():
    calls(); production(); documents(); site_and_goods(); portal_map(); ko(); rules()
    n0 = len(F)
    contracts(); n1 = len(F); regulations(); n2 = len(F); gk(); guides(); prices(); media_kb()      # 04.11.2026: договоры, регламенты, ГК РФ, памятки, прайс
    STAT['ubiq'] = {'Договоры': slim_keys(F[n0:n1], 26), 'Регламенты': slim_keys(F[n1:n2], 26)}
    seen, uniq = set(), []
    for f in F:
        h = hashlib.sha1((f['t'] + '|' + f['x']).encode('utf-8')).hexdigest()
        if h not in seen: seen.add(h); uniq.append(f)
    # 03.11.2026, опрос Т. В. (Р5б): Узбекистан — не в поиске (реестр рекламаций в «Продажах» не трогаем)
    UZ = re.compile(r'Узбекистан|Fabrikant UZ|\bКарши\b|Ташкент|uz@fabrikant', re.I)   # 04.11: \b — иначе «Сотрудник52» (ПТО) выпадал
    uniq = [f for f in uniq if not UZ.search(f['t'] + ' ' + f['x'])]
    t = datetime.datetime.now(MSK).strftime('%Y-%m-%dT%H:%M')
    obj = {'v': 1, 't': t, 'n': len(uniq), 'frags': uniq}
    bk = open('/home/claude/bot/bot_key.txt').read().strip()
    bk = bytes.fromhex(bk) if re.fullmatch(r'[0-9a-fA-F]{64}', bk) else bk.encode()
    key = hmac.new(bk, b'fabrika-live-v1', hashlib.sha256).digest()
    sealed = KB.seal_obj(obj, key)
    assert KB.unseal(sealed, key) == obj
    tmp = OUT + '.tmp'; open(tmp, 'w').write(sealed); os.replace(tmp, OUT)
    json.dump(obj, open(B + 'kb_portal.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    by = {}
    for f in uniq: by[f['s']] = by.get(f['s'], 0) + 1
    if len(sealed) > KB.MAX_KB: sys.exit('kb_portal.txt %d байт больше kb_build.MAX_KB — kb.bin не соберётся' % len(sealed))
    print(json.dumps({'frags': len(uniq), 'bytes_sealed': len(sealed), 'bytes_plain': os.path.getsize(B + 'kb_portal.json'), 'budget': KB_PORTAL_BUDGET,
                      'over_budget': len(sealed) > KB_PORTAL_BUDGET, 'max_kb': KB.MAX_KB, 'by_section': by, 'stat': STAT, 'out': OUT}, ensure_ascii=False))


if __name__ == '__main__':
    main()
