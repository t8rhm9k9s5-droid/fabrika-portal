"""«Фабрика» — правила раскладки ящика itm@ по папкам «Портал/…» (13.11.2026: вынесены из itm_sort.py).
Модуль-лист: не импортирует модули робота, поэтому itm → itm_tidy → itm_rules и itm_sort → itm, itm_rules — без круга
(CodeQL py/cyclic-import; пользователь 13.11: «ошибки, которые гоняют файлы по кругу, пофиксишь»)."""
import base64, datetime, imaplib, re

SINCE = datetime.date(2026, 8, 1)
PARENT = 'Портал'
# куда класть (решение пользователя 27.10.2026, 18:10 «Да, по плану»): в свои папки «МП» и «экономика», остальное — в «Портал/…»;
# None — не переносить (остаётся во «Входящих»)
TARGET = {'Маркетплейсы': ['МП'], 'Экономика и цены': ['экономика'], 'Продажи — офисы': [PARENT, 'Продажи ОП'],
          'Сотрудники и структура': [PARENT, 'Структура'], 'Документы': [PARENT, 'Документы'], 'Сайт и бот': [PARENT, 'Сайт и бот'],
          'Карта, план и сети': None, 'Склад — 1С': None, 'Производство и выпуск': None,
          'ОМТС и снабжение': [PARENT, 'ОМТС и снабжение']}   # 28.10.2026, задача №21: «положить взятые в работу по разделам»
# (папка, отправители, тема) — первое совпадение; отправитель — часть адреса до @ или адрес целиком
RULES = [
    ('ОМТС и снабжение', r'^(sn|snab[-_]?\d*|ls|omts)@', r'заявк|снабж|поставк|омтс|материал|закуп|гсм|сч[её]т|минпромторг|гисп'),
    ('Склад — 1С', r'^(1c|kalyakina)@', r'остатк|пкс|покупн|жилпромсервис|складск|склад'),
    ('Склад — 1С', r'', r'свободные остатки|складские остатки|покупные товары|жилпромсервис отчет'),
    ('Производство и выпуск', r'^(imm|industry|mma|tech-2|technolog|otk)@', r'^отч[её]т\s+\d|выпуск|ведомост|гальван|профилакт|график|брак|отк\b|план производ'),
    ('Производство и выпуск', r'', r'гальваник|отч[её]т выпуска|ведомость выпуска|план производства'),
    ('Экономика и цены', r'^(econom[-\w]*|peo|buh[-\w]*|fin[-\w]*)@', r''),
    ('Экономика и цены', r'', r'средние цены|себестоим|цены реализац|\bцены\b|прайс.*себест|рентаб'),
    ('Продажи — офисы', r'^(ural|ural-1|nn-1|samara-2|samara|kra|kra-1|kra-2|mit|crimea-2|crimea|sale_\d+|kli|rkv|uz|export)@', r'отч[её]т|план|продаж|обзвон|клиент|выручк|отгрузк|заказ'),
    ('Продажи — офисы', r'', r'план продаж|отч[её]т по продажам|обзвон|отч[её]т оп\b|офис продаж'),
    ('Маркетплейсы', r'^shop@', r''),
    ('Маркетплейсы', r'', r'ozon|озон|маркетплейс|wildberries|яндекс маркет|я\.маркет|fbs|rfbs'),
    ('Сотрудники и структура', r'^(ok-\d|ok|kadry|hr|security)@', r''),
    ('Сотрудники и структура', r'', r'оргструктур|коммерческий отдел|функционал|сверка фио|график охран|охран|гсм|автобус|кладовщик|штатн|замещени'),
    ('Документы', r'^(jurist|lawyer)@', r''),
    ('Документы', r'', r'договор|регламент|инструкци|сертификат|декларац|минпромторг|каталог|бланк|реестр'),
    ('Карта, план и сети', r'^(solov[-\w]*|snab-\d|energ[-\w]*|glavenerg[-\w]*)@', r''),
    ('Карта, план и сети', r'', r'генплан|схем[аы]|водопровод|канализац|электро|камер|кпп|терехин|терёхин|навес|котельн|здани[ея]'),
    ('Сайт и бот', r'^(mav|it|admin)@', r'сайт|хостинг|бот|копи|почт|max|макс|телеграм|сервер|домен'),
    ('Сайт и бот', r'', r'techfabrikant|фабрика:|сайт|хостинг|чат-бот|\bбот\b'),
]
ROBOT_SKIP = re.compile(r'(noreply|no-reply|mailer-daemon|postmaster|notification|newsletter|news@|info@|promo|rassylka|subscribe)', re.I)


def utf7_encode(s):
    """строка → имя папки IMAP (modified UTF-7)"""
    out, buf = [], []
    def flush():
        if buf:
            b = ''.join(buf).encode('utf-16-be')
            out.append('&' + base64.b64encode(b).decode('ascii').rstrip('=').replace('/', ',') + '-')
            del buf[:]
    for ch in s:
        if 0x20 <= ord(ch) <= 0x7e:
            flush(); out.append('&-' if ch == '&' else ch)
        else: buf.append(ch)
    flush()
    return ''.join(out)


def uid_move(M, seq, box, has_move):
    """UID MOVE (RFC 6851); старый imaplib (Python 3.6) не знает MOVE — команда идёт напрямую. Без MOVE на сервере — только COPY."""
    if not has_move: return M.uid('COPY', seq, box)
    try: return M.uid('MOVE', seq, box)
    except imaplib.IMAP4.error as e:
        if 'unknown' not in str(e).lower(): raise
        return M._simple_command('UID', 'MOVE', seq, box)


def classify(frm, subj):
    f, s = (frm or '').lower(), (subj or '').lower()
    for folder, fr_re, s_re in RULES:
        if fr_re and not re.search(fr_re, f): continue
        if s_re and not re.search(s_re, s): continue
        if not fr_re and not s_re: continue
        return folder
    return None
