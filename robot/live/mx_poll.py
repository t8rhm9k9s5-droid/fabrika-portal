# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — ежедневные опросы исполнителей в группе MAX «Коммерческий отдел» и проверка формы ответов (29.10.2026).
Пользователь (28.10.2026 23:10): «создать шаблон в виде опроса в Макс этих исполнителей ежедневно утром в 8:55 вопросы, 16:55 мск отчёт
даты сроки клиенты суммы и проверка этого, отчёты не по форме сразу комментировать как некорректные и вопросы тоже».

Запуск — из live.py (cron хостинга раз в 10 минут), без Claude:
 1) исполнители — участники группы, у которых есть невыполненные пункты контроля (ctl.json из mx_ctl.py: st=open, срок наступил),
    и список executors в mx_poll_cfg.json (рядом с кодом; имена — как в группе, иначе по фамилии среди участников);
 2) будни, 08:55 МСК — «📋 Утренний опрос» (вопросы к руководству / коллегам; что мешает по просроченным пунктам), ответ — до 10:00;
    16:55 — «📊 Вечерний отчёт» (клиент — что сделано — дата — срок — сумма), ответ — до 17:30. Одно сообщение в группу (html),
    обращение к каждому по имени — упоминанием (<a href="max://user/ID">), если id известен;
 3) каждый прогон — ответы (reply на сообщение опроса): не по форме — один комментарий «❌ … некорректен» ответом на сообщение человека;
    верные — без шума, только в состояние (кто, когда, корректно ли);
 4) 10:00 / 17:30 — одно напоминание «⏳ Нет ответа на опрос: …»; после 18:00 — список неответивших для утреннего отчёта владельцу.
 В группу — только 08:00–20:00 МСК. Пока mx_poll_cfg.json → "on": false, ничего не отправляется: что было бы отправлено, пишется
 в poll.json → dry (тексты утверждает пользователь). Запрещённые адресаты — mx_poll_cfg.json → ban (проверка перед каждой отправкой);
 владельцу бота (Т. В. Сотрудник1) опросы и напоминания не шлются. Ничего не удаляется и не правится.
 Состояние — ~/.fabrika_max/poll.json (0600); для портала — st/poll.bin (10 дней: ответил / не ответил / некорректно, % по исполнителям)."""
import datetime, html, json, os, re
try:
    import leaders as LD     # 03.11.2026: руководству бот вопросов не задаёт (leaders.json)
except Exception:           # нет файла на хостинге — хотя бы владелец по имени («Сотрудник2 …»), чтобы не падал весь участок
    import re as _re
    class LD:
        @staticmethod
        def is_lead(name=None, uid=None, mail=None, owner_uid=None, people=None):
            if uid not in (None, '') and owner_uid not in (None, '') and str(uid) == str(owner_uid): return 'владелец'
            if str(mail or '').lower() in ('user5@example.org', 'user4@example.org'): return 'владелец'
            return 'владелец' if _re.match(r'^\s*Сотрудник2(?![а-яё])', str(name or ''), _re.I) else ''
        @staticmethod
        def mails(): return {'user5@example.org', 'user4@example.org'}
import mx_ctl as MC

MSK = MC.MSK
GROUP_TITLE = MC.GROUP_TITLE
CFG_FILE = None                                   # тесты подменяют путь к mx_poll_cfg.json
OWNER_RE = re.compile(r'^\s*Сотрудник2(?![а-яё])', re.I)
WD_RU = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
HEAD_RANK = ['начальник', 'руководитель', 'директор', 'главн']
HEAD_RE = re.compile(r'^\s*(начальник|руководитель|директор|главн)', re.I)
ITM = 'user5@example.org'

# --- форма вечернего отчёта
DATE_RX = re.compile(r'(?<![\d.,])(\d{1,2})[.,/](\d{1,2})(?:[.,/](\d{2,4}))?(?![\d])')
DATE_W = re.compile(r'(?<![а-яё\d])(\d{1,2})\s+(' + '|'.join(MC.MON) + r')(?![а-яё])', re.I)
TERM_RX = re.compile(r'(?<![а-яё])(срок\w*|до|дедлайн\w*|следующ\w+\s+шаг\w*|оплат\w+\s+(?:до|на|в)|к\s+\d)(?![а-яё])', re.I)
SUM_RX = re.compile(r'(?<![\d.,])\d{1,3}(?:[  ]\d{3})+(?![\d])|(?<![\d.,:])\d{3,}(?![\d.,:])|\d+(?:[.,]\d+)?\s*(?:тыс|т\.?\s?р\b|тр\b|млн|руб|₽|р\.|к\b|k\b)', re.I)
QTY_RX = re.compile(r'\d+\s*(?:шт|штук\w*|%|мест\w*|чел\w*|кг|кв\.?\s?м|м2|м3|дн\w*|час\w*|мин\w*|ч\b)', re.I)
LEGAL_RX = re.compile(r'(?<![а-яё])(ооо|ип|ао|зао|пао|оао|гк|тд|ук|мку|мбоу|мбу|гбуз|фгуп|муп|нко|ано)(?![а-яё])\s*[«"„]?[А-ЯЁA-Z0-9]', re.I)
QUOTE_RX = re.compile(r'[«"„][^»"“]{2,60}[»"“]')
CAP_RX = re.compile(r'(?<![А-Яа-яЁёA-Za-z])([А-ЯЁ][А-Яа-яЁё\-]{2,}|[A-Z][A-Za-z\-]{2,})')
STOP_CAP = set(('понедельник вторник среда среду четверг пятница пятницу суббота субботу воскресенье январь февраль март апрель май июнь июль август '
                'сентябрь октябрь ноябрь декабрь января февраля марта апреля мая июня июля августа сентября октября ноября декабря '
                'сегодня завтра вчера послезавтра утром вечером днём днем неделе неделя месяц '
                'работала работал работали работаю работаем работа продолжаю продолжаем сделано сделала сделал сделали отправила отправил отправили '
                'выставила выставил выставили позвонила позвонил позвонили созвонилась созвонился созвонились встретилась встретился встретились '
                'договорились согласовали согласовала согласовал отгрузили отгрузила отгрузил отгрузка отгружено оплата оплатили оплачено оплачен '
                'счёт счет заказ запрос запросы новый новая новые клиент клиенты клиенту клиента клиентом клиентами все всё итог итого сумма срок дата '
                'что кто где когда пока нет да есть были было был была ждём ждем ждут жду ждёт ждет отчёт отчет отчеты отчёты добрый день вечер утро '
                'коллеги спасибо здравствуйте также ещё еще плюс минус итак кроме потом затем далее после пункт пункты вопрос вопросы вопросов '
                'ответ ответа ответили ответил ответила уточняю уточнила уточнил уточню готово готов готова выполнено закрыто перенос перенесено переносится '
                'отправка доставка поставка производство склад остатки остаток наличие прайс цена цены кп тз ндс ооо ип ао зао пао оао оп мск рф '
                'созвон созвонюсь звонок звонки встреча встречи визит выезд контрольный контрольная обратная связь переговоры общались обсудили '
                'написала написал напишу отправлю позвоню перезвоню свяжусь уточним согласуем проверю проверила проверил жду ждём '
                'пдо пто омтс жпс фтс пкс нет никаких ничего всем всех вам нам мне они она оно мы вы наш наша наше наши ваш ваша ваше ваши свой своя '
                'сам сама сами этот эта это эти тот та те там тут здесь очень много мало только уже снова опять').split())


def now(): return datetime.datetime.now(MSK)


def cfg_path(): return CFG_FILE or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'mx_poll_cfg.json')


def load_cfg():
    try: c = json.load(open(cfg_path(), encoding='utf-8'))
    except Exception: c = {}
    if not isinstance(c, dict): c = {}
    for k, d in (('on', False), ('executors', []), ('people', []), ('ban', []), ('heads', {}),
                 ('morning', '08:55'), ('morning_due', '10:00'), ('evening', '16:55'), ('evening_due', '17:30')): c.setdefault(k, d)
    return c


def jl(p, d=None):
    try: return json.load(open(p, encoding='utf-8'))
    except Exception: return d


def jsave0600(p, obj):
    """состояние — как ctl.json: через .tmp, права 0600"""
    with open(p + '.tmp', 'w', encoding='utf-8') as f: json.dump(obj, f, ensure_ascii=False, indent=1)
    os.chmod(p + '.tmp', 0o600); os.replace(p + '.tmp', p)


def words(s): return re.findall(r'[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё\-]+', (s or '').lower().replace('ё', 'е'))


def _sn_eq(w, sn):
    """слово имени = фамилия (и женская / мужская форма: Имя27 — Имя27)"""
    return bool(w and sn) and (w == sn or w == sn + 'а' or (sn.endswith('а') and w == sn[:-1]))


def banned(cfg, today, mail=None, name=None):
    """запрещённый адресат (mx_poll_cfg.json → ban): по почте или по фамилии в имени MAX; until — последний день запрета (включительно)"""
    ml = (mail or '').lower().strip()
    ws = words(name)
    for b in cfg.get('ban') or []:
        until = b.get('until')
        if until and today.isoformat() > until: continue
        if ml and ml in [str(x).lower() for x in (b.get('mail') or [])]: return True
        sn = (b.get('surname') or '').lower().replace('ё', 'е')
        if sn and any(_sn_eq(w, sn) for w in ws): return True
    return False


def org_map():
    """unans_org.json: почта → [ФИО, должность, отдел] (единственный справочник людей на хостинге)"""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'unans_org.json')
    try: return {k.lower(): v for k, v in (json.load(open(p, encoding='utf-8')).get('mail') or {}).items()}
    except Exception: return {}


def match_entry(p, uid, name):
    """человек из cfg (executors / people) — этот ли участник MAX (по uid, имени в группе, фамилии + имени из fio, фамилии)"""
    if not isinstance(p, dict): return False
    if p.get('uid') and uid and str(p['uid']) == str(uid): return True
    if p.get('max') and name and str(p['max']).strip().lower().replace('ё', 'е') == (name or '').strip().lower().replace('ё', 'е'): return True
    sn = (str(p.get('name') or p.get('fio') or '').split() or [''])[0].lower().replace('ё', 'е')
    ws = words(name)
    if not sn or len(sn) < 3 or not any(_sn_eq(w, sn) for w in ws): return False
    fio = str(p.get('fio') or '').split()
    if len(fio) >= 2 and fio[1].lower().replace('ё', 'е') not in ws and len(ws) >= 2: return False   # «Сотрудник3 Сотрудник1» ≠ «Сотрудник1 Сотрудник49»
    return True


def person(cfg, org, name=None, uid=None):
    """имя в MAX (и id) → {'mail','fio','role','dep','short','first'}: сначала mx_poll_cfg.json → executors / people, затем оргструктура —
    по фамилии (слово имени MAX = первое слово ФИО, единственное совпадение)"""
    for p in (cfg.get('executors') or []) + (cfg.get('people') or []):
        if match_entry(p, uid, name):
            ml = str(p.get('mail') or '').lower()
            o = org.get(ml) or []
            fio = p.get('fio') or (o[0] if o else p.get('name') or name)
            return {'mail': ml, 'fio': fio, 'role': (p.get('role') or (o[1] if len(o) > 1 else '')), 'dep': (p.get('dep') or (o[2] if len(o) > 2 else '')),
                    'short': p.get('name') or (o[0] if o else fio), 'first': first_name(name, fio)}
    ws = [w for w in words(name) if len(w) >= 3]
    hit = None
    for w in ws:
        fios = {}
        for e, v in org.items():
            if v and _sn_eq(w, (v[0].split() or [''])[0].lower().replace('ё', 'е')): fios.setdefault(v[0], e)
        if len(fios) == 1:
            f, e = list(fios.items())[0]
            # инициал имени, если он есть в MAX («Сотрудник43 Сотрудник42» ↔ «Сотрудник42 И. П.»)
            ini = [x for x in ws if x != w]
            if ini and len(f.split()) > 1 and not any(x[0] == f.split()[1][0].lower().replace('ё', 'е') for x in ini): continue
            hit = (e, org[e]); break
    if not hit: return None
    e, o = hit
    return {'mail': e, 'fio': o[0], 'role': o[1] if len(o) > 1 else '', 'dep': o[2] if len(o) > 2 else '', 'short': o[0], 'first': first_name(name, None)}


def first_name(name, fio=None):
    """имя для обращения: из полного ФИО (fio: «Сотрудник42 Сотрудник43 Отчество23» → «Сотрудник43»), иначе первое слово имени в MAX («Сотрудник45 Сотрудник44 Фабрикант Самара» → «Сотрудник45»)"""
    f = str(fio or '').split()
    if len(f) >= 2 and re.match(r'^[А-ЯЁ][а-яё]+$', f[1]): return f[1]
    w = str(name or '').split(' (@')[0].split()
    return w[0] if w else 'коллега'


def head_of(cfg, org, dep, own_mail):
    """руководитель отдела для копии: cfg → heads[отдел]; иначе в том же отделе должность «Начальник / Руководитель / Директор / Главный…»;
    сам руководитель (или совпал с адресатом) → None (копия только itm@)"""
    if not dep: return None
    own = (own_mail or '').lower()
    h = (cfg.get('heads') or {}).get(dep)
    if h: return None if str(h).lower() == own else str(h).lower()
    o = org.get(own)
    if o and len(o) > 1 and HEAD_RE.match(o[1] or ''): return None
    best = None
    for e, v in org.items():
        if len(v) < 3 or v[2] != dep or e == own or not HEAD_RE.match(v[1] or ''): continue
        rank = next((i for i, k in enumerate(HEAD_RANK) if (v[1] or '').lower().lstrip().startswith(k)), 9)
        if best is None or rank < best[0]: best = (rank, e)
    return best[1] if best else None


# REDACTED_B64_1 форма ответов
def dates_of(text):
    """даты дд.мм (и «5 ноября») в тексте → [(позиция, 'дд.мм')]"""
    out = []
    for m in DATE_RX.finditer(text or ''):
        d, mo = int(m.group(1)), int(m.group(2))
        if 1 <= d <= 31 and 1 <= mo <= 12: out.append((m.start(), '%02d.%02d' % (d, mo)))
    for m in DATE_W.finditer(text or ''):
        d = int(m.group(1))
        if 1 <= d <= 31: out.append((m.start(), '%02d.%02d' % (d, MC.MON[m.group(2).lower()])))
    return out


def has_sum(text):
    t = DATE_RX.sub(' ', text or '')                       # 29.10.2026 — не сумма
    t = re.sub(r'\d{1,2}:\d{2}', ' ', t)                    # 17:30
    t = QTY_RX.sub(' ', t)                                  # 100 шт — количество, не сумма
    return bool(SUM_RX.search(t))


def has_client(text, author=''):
    """название клиента: «клиент:», в кавычках, ООО / ИП …, иначе слово с заглавной буквы не из служебных (дни, месяцы, глаголы отчёта) и не имя автора"""
    t = text or ''
    if re.search(r'(?<![а-яё])клиент\w*\s*[:—\-–]', t, re.I) or QUOTE_RX.search(t) or LEGAL_RX.search(t): return True
    stop = set(words(author)) | STOP_CAP
    for m in CAP_RX.finditer(t):
        w = m.group(1).lower().replace('ё', 'е').strip('-')
        if w in stop or len(w) < 3: continue
        if m.group(1).isupper() and len(w) <= 3: continue   # НДС, КП — аббревиатуры шаблона
        return True
    return False


def check_evening(text, author='', q_req=False):
    """вечерний отчёт: дата, срок (слово «срок» / «до» или вторая дата), клиент, сумма → чего нет;
    q_req (с 30.10.2026) — ещё раздел «Вопросы на совещание в головной офис» или «нет вопросов»"""
    ds = dates_of(text)
    miss = []
    if not ds: miss.append('даты')
    if not (len(set(d for _, d in ds)) >= 2 or TERM_RX.search(text or '')): miss.append('срока')
    if not has_client(text, author): miss.append('клиента')
    if not has_sum(text): miss.append('суммы')
    if q_req:
        items, noq = questions(text)
        if not items and not noq: miss.append('вопросов на совещание (или «нет вопросов»)')
    return miss


# 30.10.2026, пользователь: «в отчёт писать вопросы на совещание в головной офис (если вопросов нет — писать нет вопросов) — совещание утром
#   следующего дня; вопросы из вечерних отчётов мне, Сотрудник6, Сотрудник16 + если кто-то конкретно отмечен — ему тоже его вопрос, к 8:45»
Q_HEAD = re.compile(r'^[ \t]*(?:[-•*▪️]\s*)?(?:\d+[.)]\s*)?(?:❓\s*)?вопрос\w*(?:[ \t]+(?:на|в|к|для|по)\b[^:\n]{0,60}?)?[ \t]*(?:[:—–-][ \t]*|$)', re.I | re.M)
NOQ = re.compile(r'(?<![а-яё])(нет\s+вопрос\w*|вопрос\w*\s+нет|без\s+вопрос\w*|вопрос\w*\s+отсутству\w*)(?![а-яё])', re.I)
Q_END = re.compile(r'^[ \t]*(?:[-•*]\s*)?(?:нужна помощь|план на завтра|план\s*:|итог\w*\s*:|отгрузк\w* на завтра)', re.I)


def questions(text):
    """раздел «Вопросы …» отчёта → ([вопрос, …], нет_вопросов: bool)"""
    t = text or ''
    m = Q_HEAD.search(t)
    if not m: return [], bool(NOQ.search(t))
    body = []
    first = t[m.end():].split('\n', 1)
    head_rest = first[0].strip()
    rest = first[1] if len(first) > 1 else ''
    if head_rest: body.append(head_rest)
    for ln in rest.split('\n'):
        if Q_END.match(ln): break
        body.append(ln)
    items = []
    for ln in body:
        for part in re.split(r'(?:^|\s)(?=\d{1,2}[.)]\s)', ln):
            x = re.sub(r'^[\s\-•*▪️]*(?:\d{1,2}[.)]\s*)?', '', part).strip(' ;')
            if not x or NOQ.fullmatch(x.strip(' .!')) or (NOQ.search(x) and len(x) < 30): continue
            items.append(x[:500])
    noq = not items and bool(NOQ.search(t[m.start():m.start() + 200] if m else t))
    return items[:15], noq


def q_morning(text):
    """30.10.2026: ответ на утренний опрос «❓ Вопросы на совещание» → ([вопрос, …], нет_вопросов). Заголовок «Вопросы…:» не обязателен;
    пункт «2) …» про просроченные пункты (старый формат опроса) отрезается"""
    t = (text or '').strip()
    if not t: return [], False
    items, noq = questions(t)
    if items or noq: return items, noq
    if NOQ.search(t) and len(t) < 80: return [], True
    body = re.split(r'(?:^|\n)\s*2[.)]\s', t, maxsplit=1)[0] if re.match(r'^\s*1[.)]\s', t) and re.search(r'(?:^|\n)\s*2[.)]\s', t) and 'просроч' in t.lower() else t
    out = []
    for ln in body.split('\n'):
        for part in re.split(r'(?:^|\s)(?=\d{1,2}[.)]\s)', ln):
            x = re.sub(r'^[\s\-•*▪️]*(?:\d{1,2}[.)]\s*)?', '', part).strip(' ;')
            if not x or (NOQ.search(x) and len(x) < 30): continue
            out.append(x[:500])
    return out[:15], (not out and bool(NOQ.search(t)))


def check_morning(text, has_over):
    """утренний опрос: пункт 1 — «?» или «вопросов нет»; пункт 2 (если есть просроченные пункты) — дата дд.мм или «сделано»"""
    low = (text or '').lower().replace('ё', 'е')
    miss = []
    if not ('?' in low or re.search(r'вопрос\w*\s+нет|нет\s+вопрос\w*|без\s+вопрос\w*', low)): miss.append('нет пункта 1 — вопросы к руководству / коллегам или «вопросов нет»')
    if has_over and not (dates_of(text) or re.search(r'(?<![а-яё])(сделано|сделан\w*|выполнен\w*|готово|закрыт\w*|отправлен\w*|оплачен\w*|отгружен\w*|решен\w*)(?![а-яё])', low)):
        miss.append('по пункту 2 нет новой даты (дд.мм) или «сделано» по просроченным пунктам')
    return miss


# REDACTED_B64_1 отправка (с учётом on / dry, тихих часов)
def dry(st, t, kind, to, text, extra=None):
    rec = {'t': t.strftime('%Y-%m-%dT%H:%M'), 'kind': kind, 'to': str(to), 'text': (text or '')[:300]}
    if extra: rec.update(extra)
    st.setdefault('dry', []).append(rec)
    st['dry'] = st['dry'][-30:]
    return rec


def quiet(t): return not (8 <= t.hour < 20)


def send(ctx, kind, to, text, fmt=None, reply=None, user=False):
    """сообщение в MAX: on=false — только запись в dry; → mid сообщения ('dry' / 'sent' без mid / '' при ошибке)"""
    t = ctx['t']
    if quiet(t): return ''
    if not ctx['on']:
        dry(ctx['st'], t, kind, to, text, {'reply': reply} if reply else None); return 'dry'
    body = {'text': text[:3990]}
    if fmt: body['format'] = fmt
    if reply: body['link'] = {'type': 'reply', 'mid': reply}
    q = {'user_id': to} if user else {'chat_id': to}
    code, j = MC.api(ctx['token'], 'POST', '/messages', q, body)
    if fmt and code == 400:                                 # разметка не принята — тем же текстом без тегов
        body.pop('format', None); body['text'] = re.sub(r'<[^>]+>', '', text)[:3990]
        code, j = MC.api(ctx['token'], 'POST', '/messages', q, body)
    ctx['last_code'] = code
    if code and 200 <= code < 300:
        return str((((j or {}).get('message') or {}).get('body') or {}).get('mid') or '') or 'sent'
    ctx['res'].setdefault('err', []).append('%s %s %s' % (kind, code, str((j or {}).get('message') or (j or {}).get('code') or '')[:80]))
    return ''


def members(token, cid, res):
    """участники группы (GET /chats/{id}/members, до 5 страниц) → {uid: имя} без ботов; None — не получилось"""
    out, marker, pages = {}, None, 0
    while pages < 5:
        q = {'count': 100}
        if marker: q['marker'] = marker
        code, j = MC.api(token, 'GET', '/chats/%s/members' % cid, q); pages += 1
        if code != 200 or not isinstance(j, dict): res['members_err'] = 'MAX %s' % code; return None if not out else out
        for x in j.get('members') or []:
            if x.get('is_bot') or not x.get('user_id'): continue
            nm = (str(x.get('first_name') or '') + ' ' + str(x.get('last_name') or '')).strip() or str(x.get('name') or '')
            if nm: out[str(x['user_id'])] = nm
        marker = j.get('marker')
        if not marker: break
    return out


# REDACTED_B64_1 исполнители
def executors(cfg, ctl, names, today, owner_uid, bot_uid):
    """→ {key: {'uid', 'n', 'over': N, 'src'}}; key — str(uid) или 'n:Имя' (id в группе неизвестен); без владельца, бота и ban"""
    ex = {}
    skip = {str(owner_uid or ''), str(bot_uid or '')}
    for it in (ctl.get('items') or {}).values():
        if it.get('st') != 'open' or (it.get('due') or '') > today.isoformat() or not it.get('who_uid'): continue
        uid = str(it['who_uid'])
        n = names.get(uid) or it.get('who') or ''
        if uid in skip or not n or n == 'Коллеги' or OWNER_RE.match(n) or banned(cfg, today, name=n): continue
        if LD.is_lead(name=n, uid=uid, owner_uid=owner_uid): continue      # 03.11.2026: руководство не опрашиваем
        e = ex.setdefault(uid, {'uid': int(uid), 'n': n, 'over': 0, 'src': 'ctl'})
        if it['due'] < today.isoformat(): e['over'] += 1                  # срок сегодня — ещё не просрочка (в опросе человек есть, счётчика нет)
    for p in cfg.get('executors') or []:
        if not isinstance(p, dict): continue
        hits = [u for u, n in names.items() if u not in skip and match_entry(p, u, n)]
        if len(hits) == 1:
            u = hits[0]
            if banned(cfg, today, name=names[u], mail=p.get('mail')): continue
            if LD.is_lead(name=names[u], uid=u, mail=p.get('mail'), owner_uid=owner_uid): continue   # 03.11.2026
            if u not in ex: ex[u] = {'uid': int(u), 'n': names[u], 'over': 0, 'src': 'cfg'}
            else: ex[u]['src'] = 'ctl+cfg'
            continue
        if banned(cfg, today, name=p.get('name'), mail=p.get('mail')): continue
        disp = str(p.get('max') or p.get('name') or '').strip()
        if disp and not any(e['n'] == disp for e in ex.values()):
            ex['n:' + disp] = {'uid': None, 'n': disp, 'over': 0, 'src': 'cfg', 'why': 'id в группе неизвестен' if not hits else 'несколько участников с такой фамилией'}
    return ex


def mention(e):
    nm = html.escape(e['n'], quote=False)
    return '<a href="max://user/%d">%s</a>' % (e['uid'], nm) if e.get('uid') else nm


def poll_text(kind, ex, t, cfg):
    day = '%s (%s)' % (MC.ddmm(t.date().isoformat()), WD_RU[t.weekday()])
    rows = sorted(ex.values(), key=lambda e: e['n'].lower())
    if kind == 'morning':
        lines = ['• ' + mention(e) + (' — просроченных пунктов: %d' % e['over'] if e.get('over') else '') for e in rows]
        if cfg.get('morning_q'):                            # 30.10.2026, пользователь: «Начинаем с утренних вопросов в 8:45. Они хотя бы должны написать сами вопросы»
            return ('❓ <b>Вопросы на совещание в головной офис, %s</b>\n\n%s\n\nОтветьте, пожалуйста, <b>ответом (reply) на это сообщение до %s</b>: '
                    'ваши вопросы списком (1), 2), …) или «нет вопросов». Вопрос к конкретному человеку — отметьте его (@) или напишите фамилию.\n'
                    'В %s вопросы уйдут Сотрудник81 Отчество42, М. И. Сотрудник6 и К. В. Сотрудник16, отмеченным — их вопрос отдельно.'
                    % (day, '\n'.join(lines), cfg.get('morning_due') or '08:45', cfg.get('q_digest_at') or '08:45'))
        return ('📋 <b>Утренний опрос, %s</b>\n\n%s\n\nОтветьте, пожалуйста, <b>ответом (reply) на это сообщение до %s</b>:\n'
                '1) Вопросы к руководству / коллегам (или «вопросов нет»);\n'
                '2) Что мешает выполнить просроченные пункты: № пункта — причина — новый срок дд.мм (нет просроченных — так и напишите).'
                % (day, '\n'.join(lines), cfg.get('morning_due') or '10:00'))
    lines = ['• ' + mention(e) for e in rows]
    return ('📊 <b>Вечерний отчёт, %s</b>\n\n%s\n\nОтветьте, пожалуйста, <b>ответом (reply) на это сообщение до %s</b>. '
            'По каждому клиенту / сделке — одна строка по шаблону:\n'
            '<i>Клиент — что сделано — дата (дд.мм) — срок следующего шага (дд.мм) — сумма (руб.)</i>'
            % (day, '\n'.join(lines), cfg.get('evening_due') or '17:30')
            + ('\nВ конце — <b>«Вопросы на совещание в головной офис»</b> (совещание утром следующего рабочего дня) или «нет вопросов».'
               if q_on(cfg, t.date().isoformat()) else ''))


def q_on(cfg, day):
    """с какого дня в вечернем отчёте обязателен раздел вопросов (mx_poll_cfg.json → questions_from, ГГГГ-ММ-ДД)"""
    f = str(cfg.get('questions_from') or '')
    return bool(f) and day >= f


def hm(s, d):
    try: h, m = str(s).split(':'); return datetime.time(int(h), int(m))
    except Exception: return d


def ans_key(m, rec, cfg):
    """ответ m → ключ исполнителя в снимке опроса rec['exec'] (uid; иначе по имени для 'n:…'; иначе uid не из списка)"""
    u = str(m.get('uid') or '')
    if u in rec['exec']: return u
    for k, e in rec['exec'].items():
        if not k.startswith('n:'): continue
        for p in cfg.get('executors') or []:
            if isinstance(p, dict) and str(p.get('max') or p.get('name') or '').strip() == e['n'] and match_entry(p, u, m.get('name')): return k
    return u


# REDACTED_B64_1 run
def run(L, CFG, log, jload, jsave, publish, iso, mail_send=None):
    M = os.path.join(os.path.dirname(L), '.fabrika_max')
    mcfg = jl(os.path.join(M, 'config.json'))
    if not mcfg: return {'state': 'нет настроек бота MAX'}
    token = mcfg.get('token') or ''
    if not token: return {'state': 'нет токена MAX'}
    bot_uid = (mcfg.get('bot') or {}).get('user_id')
    owner_uid = (mcfg.get('owner') or {}).get('user_id')
    groups = jl(os.path.join(M, 'groups.json'), {}) or {}
    cid = next((k for k, v in groups.items() if v.get('on') and GROUP_TITLE.search(str(v.get('title') or ''))), None)
    if not cid: return {'state': 'бота нет в группе «Коммерческий отдел»'}
    cfg = load_cfg(); org = org_map()
    ctl = jl(os.path.join(M, 'ctl.json'), {}) or {}
    stp = os.path.join(M, 'poll.json')
    st = jl(stp, {}) or {}
    for k, d in (('names', {}), ('days', {}), ('commented', []), ('dry', [])): st.setdefault(k, d)
    t = now(); today = t.date(); day = today.isoformat()
    on = bool(cfg.get('on'))
    res = {'t': iso(t), 'on': on, 'comments': 0, 'sent': []}
    ctx = {'token': token, 'cid': cid, 'st': st, 'res': res, 'on': on, 't': t}
    # имена участников: ctl.json (из сообщений группы), раз в день — список участников группы
    names = {}
    names.update({str(k): v for k, v in (ctl.get('names') or {}).items()})
    names.update(st['names'])
    mf = st.get('mf') if (st.get('mf') or {}).get('d') == day else {'d': day, 'n': 0}
    mem = st.get('members') or {}
    if st.get('members_t') != day and mf['n'] < 3:                        # не вышло — ещё две попытки за день, не чаще
        got = members(token, cid, res)
        if got is not None: names.update(got); st['members_t'] = day; st['members'] = mem = got
        else: mf['n'] += 1
    st['mf'] = mf
    code, j = MC.api(token, 'GET', '/messages', {'chat_id': cid, 'count': 100})
    msgs = []
    if code == 200 and isinstance(j, dict): msgs = sorted((MC.norm_msg(x) for x in (j.get('messages') or [])), key=lambda m: m['ts'])
    else: res['err_get'] = 'MAX %s' % code
    for m in msgs:
        if m['uid'] and m['name'] and not m['bot']: names[str(m['uid'])] = m['name']
    st['names'] = names
    # 30.10.2026, пользователь (опрос): «Сводка пересылок в группу» — кто и что переслал в «Коммерческий отдел» из других чатов
    fw = st.setdefault('fwd', {})
    for m in msgs:
        if m.get('fwd') and m.get('mid') and m['mid'] not in fw and not m['bot']:
            fw[m['mid']] = {'t': datetime.datetime.fromtimestamp(m['ts'] / 1000, MSK).strftime('%Y-%m-%dT%H:%M'), 'n': m['name'], 'uid': m['uid'],
                            'from': m['fwd'].get('from') or '', 'chat': m['fwd'].get('chat'), 'x': MC_mask((m['fwd'].get('text') or m['text'] or '')[:300])}
    if len(fw) > 600: st['fwd'] = dict(sorted(fw.items(), key=lambda x: x[1]['t'])[-600:])
    if not owner_uid: owner_uid = next((int(u) for u, n in names.items() if OWNER_RE.match(n or '')), None)
    pool = {u: n for u, n in names.items() if not mem or u in mem}       # исполнители — только нынешние участники группы (если список участников есть)
    ex = executors(cfg, ctl, pool, today, owner_uid, bot_uid)
    res['exec'] = len(ex)
    wd = MC.workday(today)
    D = st['days'].setdefault(day, {})
    times = {'morning': (hm(cfg.get('morning'), datetime.time(8, 55)), hm(cfg.get('morning_due'), datetime.time(10, 0))),
             'evening': (hm(cfg.get('evening'), datetime.time(16, 55)), hm(cfg.get('evening_due'), datetime.time(17, 30)))}
    tod = t.time().replace(tzinfo=None)
    # 1) опросы — будни, в окне от времени опроса до срока ответа, один раз в день
    ef = str(cfg.get('evening_from') or '')                 # 30.10.2026, пользователь (опрос): «Мягкий старт 2 недели» — неделя 1 только утренние вопросы
    for kind, (t0, due) in times.items():
        if kind == 'evening' and ef and day < ef:
            if wd and kind not in D: D[kind] = {'t': iso(t), 'skip': 'учебный режим: вечерний отчёт — с %s' % MC.ddmm(ef)}
            continue
        if not wd or kind in D or not (t0 <= tod < due): continue
        if not ex: D[kind] = {'t': iso(t), 'skip': 'нет исполнителей'}; continue
        text = poll_text(kind, ex, t, cfg)
        mid = send(ctx, 'poll:' + kind, cid, text, fmt='html')
        if not mid: continue                                # ошибка отправки или тихие часы — попробуем в следующий прогон
        D[kind] = {'t': iso(t), 'mid': '' if mid in ('dry', 'sent') else mid, 'dry': mid == 'dry', 'text': text,
                   'exec': {k: {'n': e['n'], 'uid': e.get('uid'), 'over': e.get('over', 0)} for k, e in ex.items()}, 'ans': {}}
        res['sent'].append(kind); log('опрос MAX (%s): %s, исполнителей %d' % (kind, 'dry' if mid == 'dry' else 'отправлен', len(ex)))
        jsave0600(stp, st)                                  # 30.10.2026 аудит P10: сразу после отправки (обрыв участка — опрос не уйдёт второй раз)
    for kind, (t0, due) in times.items():                   # окно прошло, опроса не было (cron молчал) — отметить
        if wd and kind not in D and tod >= due: D[kind] = {'t': iso(t), 'skip': 'окно отправки пропущено'}
    # 2) ответы (reply на сообщение опроса) — сегодня и вчера; не по форме — один комментарий на сообщение
    polls = {}
    for d in sorted(st['days'])[-6:]:                     # 30.10.2026: исправленный отчёт засчитывается и через несколько дней (напоминания — до 3 раб. дней)
        for kind, rec in st['days'][d].items():
            if isinstance(rec, dict) and rec.get('mid'): polls[rec['mid']] = (d, kind, rec)
    commented = set(st['commented'])
    for m in msgs:
        if not m['rmid'] or m['rmid'] not in polls or m['bot'] or not m['mid']: continue
        if str(m['uid']) in (str(owner_uid or ''), str(bot_uid or '')) or (owner_uid is None and OWNER_RE.match(m['name'] or '')): continue
        d, kind, rec = polls[m['rmid']]
        key = ans_key(m, rec, cfg)
        if banned(cfg, today, name=m['name']): continue
        e = rec['exec'].get(key) or {}
        if kind == 'evening': miss = check_evening(m['text'], m['name'], q_on(cfg, d))
        elif cfg.get('morning_q'): miss = [] if (q_morning(m['text'])[0] or q_morning(m['text'])[1]) else ['нет вопросов на совещание или «нет вопросов»']
        else: miss = check_morning(m['text'], bool(e.get('over')))
        tm = datetime.datetime.fromtimestamp(m['ts'] / 1000, MSK)
        prev = rec['ans'].get(key)
        if not prev or prev.get('t', '') <= iso(tm):
            rec['ans'][key] = {'t': iso(tm), 'ok': not miss, 'miss': miss, 'mid': m['mid'], 'n': m['name'], 'uid': m['uid'],
                               'text': (m['text'] or '')[:4000] if kind == 'evening' or cfg.get('morning_q') else '', 'ments': [int(x) for x in (m.get('mentions') or []) if str(x).isdigit()][:10]}
        soft = d < str(cfg.get('count_from') or '')        # до count_from — учебный режим: не «❌ некорректен», а одна мягкая подсказка (soft_hints)
        if miss and m['mid'] not in commented and (not soft or (cfg.get('soft_hints') and d >= str(cfg.get('soft_from') or ''))):
            fn = first_name(m['name'], (person(cfg, org, m['name'], m['uid']) or {}).get('fio'))
            if soft and kind == 'evening':
                text = ('💡 %s, спасибо за отчёт! Чтобы он был полным, добавьте: %s. Сейчас учебный режим — отчёты пока не оцениваются; '
                        'образец — сообщение «📌 Образец ежедневного отчёта».' % (fn, ' / '.join(miss)))
            elif soft and cfg.get('morning_q'):
                text = '💡 %s, спасибо! Напишите, пожалуйста, сами вопросы на совещание списком — или «нет вопросов», если их нет.' % fn
            elif soft: text = '💡 %s, спасибо! В ответе не хватает: %s.' % (fn, '; '.join(miss))
            elif kind == 'evening': text = '❌ %s, отчёт некорректен (не по форме): нет %s. Пришлите, пожалуйста, заново ответом на опрос по шаблону.' % (fn, ' / '.join(miss))
            elif cfg.get('morning_q'): text = '❌ %s, в ответе нет вопросов на совещание. Напишите, пожалуйста, ответом на сообщение «❓ Вопросы на совещание»: вопросы списком или «нет вопросов».' % fn
            else: text = '❌ %s, ответ на утренний опрос некорректен: %s. Ответьте, пожалуйста, заново ответом на опрос по шаблону.' % (fn, '; '.join(miss))
            r = send(ctx, ('hint:' if soft else 'comment:') + kind, cid, text, reply=m['mid'])
            if r:
                commented.add(m['mid']); res['comments'] += 1
                st['commented'] = list(commented)[-2000:]; jsave0600(stp, st)      # 30.10.2026 аудит P10
    st['commented'] = list(commented)[-2000:]
    # 3) напоминание неответившим — утренний опрос: один раз, с момента срока ответа до 2,5 ч после него (и не позже 20:00).
    #    30.10.2026, пользователь: «и напоминай пока нормально не выложат отчет» — вечерний отчёт: повторно (repeat_evening) до корректного ответа.
    repeat_evening(ctx, cfg, st, D, times, t, today, tod, wd, stp)
    for kind, (t0, due) in times.items():
        if kind == 'evening': continue
        rec = D.get(kind)
        if not rec or rec.get('skip') or rec.get('remind') or tod < due: continue
        end = (datetime.datetime.combine(today, due) + datetime.timedelta(hours=2, minutes=30)).time()
        if tod >= end: rec['remind'] = {'t': iso(t), 'names': [], 'skip': 'окно напоминания прошло'}; continue
        noans = sorted(e['n'] for k, e in rec['exec'].items() if k not in rec['ans'])
        if not noans: rec['remind'] = {'t': iso(t), 'names': []}; continue
        text = '⏳ Нет ответа на опрос (%s, до %s): %s. Ответьте, пожалуйста, ответом (reply) на сообщение опроса.' % (
            ('вопросы на совещание' if cfg.get('morning_q') else 'утренний') if kind == 'morning' else 'вечерний отчёт', due.strftime('%H:%M'), ', '.join(noans))
        r = send(ctx, 'remind:' + kind, cid, text)
        if r:
            rec['remind'] = {'t': iso(t), 'names': noans, 'dry': r == 'dry'}; res['sent'].append('remind:' + kind)
            jsave0600(stp, st)                              # 30.10.2026 аудит P10
    try: fwd_digest(ctx, cfg, st, t, today, tod, mail_send, stp)
    except Exception as e: res['fwd_err'] = '%s %s' % (e.__class__.__name__, str(e)[:120])
    # 3б) 30.10.2026: вопросы на совещание из вечерних отчётов — к 08:45 следующего рабочего дня владельцу, Сотрудник6, Сотрудник16 и отмеченным
    try: q_digest(ctx, cfg, org, st, t, today, tod, wd, mail_send, stp)
    except Exception as e: res['q_err'] = '%s %s' % (e.__class__.__name__, str(e)[:120])
    # 4) после 18:00 — кто не ответил (для утреннего отчёта владельцу)
    if tod >= datetime.time(18, 0):
        for kind in ('morning', 'evening'):
            rec = D.get(kind)
            if rec and rec.get('exec') is not None: rec['noans'] = sorted(e['n'] for k, e in rec['exec'].items() if k not in rec['ans'])
        D['late'] = {k: (D.get(k) or {}).get('noans') or [] for k in ('morning', 'evening')}
    # состояние и портал
    for d in sorted(st['days'])[:-30]: st['days'].pop(d, None)
    st['last'] = iso(t); st['owner_uid'] = owner_uid
    jsave0600(stp, st)
    pub = publish_poll(st, today, tod, times, iso(t))
    publish('poll.bin', pub)
    res.update({'state': 'ok', 'owner': bool(owner_uid), 'today': {k: ('dry' if (D.get(k) or {}).get('dry') else 'sent' if (D.get(k) or {}).get('mid') else (D.get(k) or {}).get('skip') or '-')
                                                                      for k in ('morning', 'evening')}, 'dry': len(st['dry'])})
    return res


def pending_of(rec):
    """кто из исполнителей опроса ещё не сдал корректный ответ → [(ключ, исполнитель, чего нет | None — ответа нет)]"""
    out = []
    for k, e in sorted(rec.get('exec', {}).items(), key=lambda x: x[1]['n'].lower()):
        a = rec['ans'].get(k)
        if a and a.get('ok'): continue
        out.append((k, e, (a.get('miss') or ['формы']) if a else None))
    return out


def pend_line(e, miss):
    return mention(e) + (' — нет ответа' if miss is None else ' — не по форме: нет ' + html.escape(' / '.join(miss), quote=False))


def repeat_evening(ctx, cfg, st, D, times, t, today, tod, wd, stp):
    """30.10.2026, пользователь: «и напоминай пока нормально не выложат отчет».
    Сегодня: после срока (17:30) — каждые evening_repeat_min (30) минут до evening_repeat_until (19:30), пока у человека нет корректного отчёта
    (нет ответа или последний ответ не по форме). Следующие рабочие дни: в carry_at (09:05, 14:00) — одно сообщение по всем несданным отчётам
    за carry_days (3) прошлых рабочих дня; дальше — только в список владельцу (noans). Обращение — упоминанием (уведомление человеку)."""
    t0, due = times['evening']
    rep = max(10, int(cfg.get('evening_repeat_min') or 30))
    until = hm(cfg.get('evening_repeat_until'), datetime.time(19, 30))
    rec = D.get('evening')
    cf = str(cfg.get('count_from') or '')                    # 30.10.2026, пользователь: «Обнули сегодняшнее предупреждение… считаем с понедельника»
    if cf and today.isoformat() < cf: rec = None             # до count_from — без повторных напоминаний за день
    if wd and rec and not rec.get('skip') and rec.get('exec') and tod >= due:
        pend = pending_of(rec)
        rt = rec.setdefault('rem_t', [])
        if not pend:
            rec.setdefault('remind', {'t': iso_(t), 'names': []})
        elif tod < until and (not rt or (t - datetime.datetime.strptime(rt[-1], '%Y-%m-%dT%H:%M').replace(tzinfo=MSK)).total_seconds() >= rep * 60 - 90):
            n = len(rt) + 1
            text = ('⏳ <b>Вечерний отчёт за %s не сдан%s</b> (срок был %s):\n%s\n\nПришлите, пожалуйста, <b>ответом (reply) на сообщение «📊 Вечерний отчёт»</b> '
                    'по образцу из сообщения «📌 Образец ежедневного отчёта». Бот напоминает, пока отчёт не будет по форме.'
                    % (MC.ddmm(today.isoformat()), '' if n == 1 else ' — напоминание %d' % n, due.strftime('%H:%M'), '\n'.join('• ' + pend_line(e, ms) for _, e, ms in pend)))
            r = send(ctx, 'remind:evening', ctx['cid'], text, fmt='html')
            if r:
                rt.append(iso_(t)); rec['remind'] = {'t': iso_(t), 'names': [e['n'] for _, e, _ in pend], 'dry': r == 'dry'}
                ctx['res']['sent'].append('remind:evening'); jsave0600(stp, st)
    if not wd: return
    slots = [hm(x, None) for x in (cfg.get('carry_at') or ['09:05', '14:00'])]
    slot = max((x for x in slots if x and x <= tod), default=None)
    if slot is None or tod >= datetime.time(19, 30): return
    key = '%s %s' % (today.isoformat(), slot.strftime('%H:%M'))
    sent = st.setdefault('carry_sent', [])
    if key in sent: return
    days, d = [], today
    while len(days) < max(1, int(cfg.get('carry_days') or 3)):
        d -= datetime.timedelta(days=1)
        if (today - d).days > 10: break
        if MC.workday(d): days.append(d.isoformat())
    blocks = []
    for dd in days:
        if cf and dd < cf: continue                          # дни до count_from не напоминаем
        r0 = (st['days'].get(dd) or {}).get('evening')
        if not r0 or r0.get('skip') or r0.get('dry') or not r0.get('mid') or not r0.get('exec'): continue
        pend = pending_of(r0)
        if pend: blocks.append('<b>%s</b>\n%s' % (MC.ddmm(dd), '\n'.join('• ' + pend_line(e, ms) for _, e, ms in pend)))
    if not blocks:
        sent.append(key); st['carry_sent'] = sent[-60:]; return
    text = ('⏳ <b>Не сданы вечерние отчёты</b> (нет ответа или не по форме):\n\n%s\n\nПришлите, пожалуйста, <b>ответом (reply) на сообщение «📊 Вечерний отчёт» '
            'за этот день</b> — по образцу из сообщения «📌 Образец ежедневного отчёта». Бот напоминает, пока отчёт не будет по форме.' % '\n\n'.join(blocks))
    r = send(ctx, 'remind:carry', ctx['cid'], text, fmt='html')
    if r:
        sent.append(key); st['carry_sent'] = sent[-60:]; ctx['res']['sent'].append('remind:carry'); jsave0600(stp, st)


def iso_(t): return t.strftime('%Y-%m-%dT%H:%M')


Q_TO_DEF = ['user5@example.org', 'user8@example.org', 'user16@example.org']     # Т. В. Сотрудник1, М. И. Сотрудник6, К. В. Сотрудник16


def q_people(org, cfg, today, skip):
    """оргструктура → [(основа фамилии, почта, ФИО кратко)] для поиска «отмеченных» по фамилии в тексте вопроса"""
    out = []
    for ml, v in org.items():
        if not v or ml in skip or banned(cfg, today, mail=ml): continue
        sn = str(v[0]).split()[0] if v[0] else ''
        if len(sn) < 4 or not re.match(r'^[А-ЯЁ]', sn): continue
        stem = sn[:-1] if len(sn) >= 6 and sn[-1] in 'аяоеиыйь' else sn
        out.append((stem, ml, v[0]))
    return out


def q_marked(item, ments, names, cfg, org, people, today, skip):
    """кто отмечен в вопросе: упоминание MAX (имя или фамилия упомянутого есть в тексте вопроса, или вопрос один) и фамилия из оргструктуры → {почта: ФИО}"""
    got = {}
    low = item.lower().replace('ё', 'е')
    for uid, single in ments:
        nm = names.get(str(uid)) or ''
        p = person(cfg, org, nm, uid) or {}
        ml = (p.get('mail') or '').lower()
        if not ml or ml in skip or banned(cfg, today, mail=ml, name=nm): continue
        ws = [w for w in words(nm) + words(p.get('fio') or '') if len(w) >= 4]
        if single or any(w[:-1] in low for w in ws):
            got[ml] = p.get('short') or p.get('fio') or nm
    for stem, ml, short in people:
        if ml in got: continue
        if re.search(r'(?<![А-Яа-яЁё])' + re.escape(stem) + r'[а-яё]{0,3}(?![А-Яа-яЁё])', item):
            got[ml] = short
    return got


def q_digest(ctx, cfg, org, st, t, today, tod, wd, mail_send, stp):
    """к q_digest_at (08:45) рабочего дня: вопросы на совещание → одно письмо q_digest_to (владелец, Сотрудник6, Сотрудник16) + каждому отмеченному — его вопрос
    (копия руководителю отдела, кроме запрещённых). Источники: 30.10.2026 (пользователь: «Начинаем с утренних вопросов в 8:45. Они хотя бы должны написать
    сами вопросы») — ответы на утренний опрос «❓ Вопросы на совещание» (morning_q) за сегодня; и вопросы из вечерних отчётов прошлых дней (ещё не разосланные).
    Кто утром ничего не написал — отдельной строкой. Нет почты робота (mail_send) — ждём следующего прогона; on=false — dry."""
    if not wd or not cfg.get('questions_from'): return
    at = hm(cfg.get('q_digest_at'), datetime.time(8, 45))
    if tod < at or tod >= datetime.time(12, 0): return
    if today.isoformat() in (st.get('qd_sent') or []): return
    recs = []
    for d in sorted(st['days']):
        if d >= today.isoformat() or (today - datetime.date(*map(int, d.split('-')))).days > 5: continue
        r = st['days'][d].get('evening')
        if not r or r.get('skip') or r.get('dry') or not r.get('exec') or r.get('qd') or not q_on(cfg, d): continue
        recs.append((d, r))
    mrec = None
    if cfg.get('morning_q') and q_on(cfg, today.isoformat()):
        r = (st['days'].get(today.isoformat()) or {}).get('morning')
        if r and not r.get('skip') and not r.get('dry') and r.get('exec') and not r.get('qd'): mrec = r
    if not recs and not mrec:
        st.setdefault('qd_sent', []).append(today.isoformat()); st['qd_sent'] = st['qd_sent'][-30:]; return
    if ctx['on'] and mail_send is None:
        ctx['res']['q_err'] = 'нет mail_send (новый live.py ещё не встал) — сводка вопросов ждёт'; return
    to = [x.lower() for x in (cfg.get('q_digest_to') or Q_TO_DEF)]
    skip = set(to) | {'user42@example.org'}
    names = st.get('names') or {}
    people = q_people(org, cfg, today, skip)
    lines, noq, none, personal, silent = [], [], [], {}, []
    def add(who, label, d, items, ments, own):
        lines.append('%s, %s:' % (who, label))
        for i, it in enumerate(items, 1):
            mk = q_marked(it, [(u, len(items) == 1) for u in (ments or [])], names, cfg, org, people, today, skip | {own})
            lines.append('  %d) %s%s' % (i, it, (' → ' + ', '.join(sorted(mk.values()))) if mk else ''))
            for ml, short in mk.items(): personal.setdefault(ml, {'short': short, 'q': []})['q'].append((who, d, it))
    if mrec:
        for k, e in sorted(mrec['exec'].items(), key=lambda x: x[1]['n'].lower()):
            p = person(cfg, org, e['n'], e.get('uid')) or {}
            who = p.get('short') or e['n']
            a = mrec['ans'].get(k)
            if not a: silent.append(who); continue
            items, nq = q_morning(a.get('text') or '')
            if items: add(who, 'утром %s' % MC.ddmm(today.isoformat()), today.isoformat(), items, a.get('ments'), p.get('mail', ''))
            elif nq: noq.append(who)
            else: silent.append(who + ' (ответ без вопросов)')
    for d, r in recs:
        for k, e in sorted(r['exec'].items(), key=lambda x: x[1]['n'].lower()):
            a = r['ans'].get(k)
            p = person(cfg, org, e['n'], e.get('uid')) or {}
            who = p.get('short') or e['n']
            if not a:
                if not mrec: none.append('%s (%s) — отчёта нет' % (who, MC.ddmm(d)))
                continue
            items, nq = questions(a.get('text') or '')
            if not items:
                if not mrec: (noq if nq else none).append('%s (%s)%s' % (who, MC.ddmm(d), '' if nq else ' — раздела вопросов нет'))
                continue
            add(who, 'отчёт за %s' % MC.ddmm(d), d, items, a.get('ments'), p.get('mail', ''))
    meet = MC.ddmm(today.isoformat())
    src = []
    if mrec: src.append('утренний опрос в группе MAX «Коммерческий отдел»')
    if recs: src.append('вечерние отчёты за ' + ', '.join(sorted(set(MC.ddmm(d) for d, _ in recs))))
    subj = 'Вопросы на совещание %s — %s' % (meet, '; '.join(src))
    text = ('Вопросы в головной офис к совещанию %s (%s).\n\n%s\n\n%s%s%s%s'
            'Отмеченным в вопросах (→) бот отправил их вопрос отдельным письмом.\n— бот «Фабрикант»'
            % (meet, '; '.join(src), '\n'.join(lines) if lines else 'Вопросов нет.',
               ('Не написали вопросы к %s: %s\n' % (cfg.get('morning_due') or '08:45', '; '.join(silent))) if silent else '',
               ('Нет вопросов: ' + '; '.join(noq) + '\n') if noq else '',
               ('Без вопросов в отчёте или без отчёта: ' + '; '.join(none) + '\n') if none else '', '\n' if (silent or noq or none) else ''))
    ok = q_send(ctx, mail_send, 'mail:qdigest', subj, text, to, [])
    if not ok: return
    for ml, pq in sorted(personal.items()):
        p_org = org.get(ml) or []
        head = head_of(cfg, org, p_org[2] if len(p_org) > 2 else '', ml)
        if head and (banned(cfg, today, mail=head) or head in to or head == ml): head = None
        greet = first_name('', (p_org[0] if p_org else pq['short']))
        body = ('%s, добрый день.\n\nК вам %s на совещание %s (офисы продаж, группа MAX «Коммерческий отдел»):\n\n%s\n\n'
                'Ответ — на совещании или ответом на это письмо.%s\n— бот «Фабрикант»'
                % (greet if greet != 'коллега' else pq['short'], 'вопрос' if len(pq['q']) == 1 else 'вопросы', meet,
                   '\n'.join('%d) %s — от %s (%s)' % (i, it, w, 'утром' if d == today.isoformat() else 'отчёт за ' + MC.ddmm(d)) for i, (w, d, it) in enumerate(pq['q'], 1)),
                   ' Копия — руководителю отдела.' if head else ''))
        q_send(ctx, mail_send, 'mail:qpersonal', 'Вопрос к вам на совещание %s' % meet, body, [ml], [head] if head else [])
    for d, r in recs: r['qd'] = iso_(t)
    if mrec: mrec['qd'] = iso_(t)
    st.setdefault('qd_sent', []).append(today.isoformat()); st['qd_sent'] = st['qd_sent'][-30:]
    ctx['res']['qdigest'] = {'q': sum(1 for x in lines if x.startswith('  ')), 'personal': len(personal), 'silent': len(silent)}
    jsave0600(stp, st)


def q_send(ctx, mail_send, kind, subj, text, to, cc):
    """письмо через почту робота (live.mail_send); on=false — в dry"""
    if not ctx['on']:
        dry(ctx['st'], ctx['t'], kind, ','.join(to), subj + ' | ' + text[:200], {'cc': cc}); return True
    r = mail_send(subj, text, list(to), list(cc))
    if str(r).startswith('ok'): ctx['res'].setdefault('mail', []).append(kind); return True
    ctx['res'].setdefault('err', []).append('%s: %s' % (kind, str(r)[:80])); return False


def MC_mask(x):
    """без телефонов, почт и IP (как itm.mask)"""
    x = re.sub(r'\b\d{1,3}(\.\d{1,3}){3}\b', '[IP]', str(x or ''))
    x = re.sub(r'[\w.+-]+@[\w-]+(\.[\w-]+)+', '[адрес]', x)
    return re.sub(r'(\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b', '[тел.]', x)


def fwd_digest(ctx, cfg, st, t, today, tod, mail_send, stp):
    """пятница (fwd_digest_at, 17:30): письмо владельцу — пересылки в группу за неделю (кто, от кого / из какого чата, когда, начало текста).
    Пересылок не было — письма нет."""
    if today.weekday() != 4 or tod < hm(cfg.get('fwd_digest_at'), datetime.time(17, 30)): return
    wk = today.isoformat()
    if wk in (st.get('fwd_sent') or []): return
    since = (today - datetime.timedelta(days=6)).isoformat()
    rows = sorted((v for v in (st.get('fwd') or {}).values() if v['t'][:10] >= since), key=lambda v: v['t'])
    st.setdefault('fwd_sent', []).append(wk); st['fwd_sent'] = st['fwd_sent'][-20:]
    if not rows: jsave0600(stp, st); return
    by = {}
    for v in rows: by.setdefault(v['n'], []).append(v)
    lines = []
    for n, vs in sorted(by.items(), key=lambda x: -len(x[1])):
        lines.append('%s — %d:' % (n, len(vs)))
        for v in vs[:15]:
            src = v.get('from') or ('чат %s' % v['chat'] if v.get('chat') else 'неизвестно откуда')
            lines.append('  • %s.%s %s — от %s: %s' % (v['t'][8:10], v['t'][5:7], v['t'][11:16], src, (v.get('x') or '(файл или фото)')[:160]))
    text = ('Пересылки в группу MAX «Коммерческий отдел» за неделю (%s–%s): %d.\n\n%s\n\n'
            'Пересылки ИЗ группы в другие чаты боту не видны (MAX об этом не сообщает).\n— бот «Фабрикант»'
            % (MC.ddmm(since), MC.ddmm(wk), len(rows), '\n'.join(lines)))
    q_send(ctx, mail_send, 'mail:fwd', 'Пересылки в «Коммерческий отдел» за неделю — %d' % len(rows), text, cfg.get('fwd_to') or ['user5@example.org'], [])
    jsave0600(stp, st)


def publish_poll(st, today, tod, times, t_iso):
    """st/poll.bin: 10 дней — по каждому исполнителю ok / bad / none (wait — срок ответа ещё не наступил), и % по исполнителям"""
    days, agg = [], {}
    for d in sorted(st['days'])[-10:]:
        row = {'d': d}
        for kind in ('morning', 'evening'):
            rec = st['days'][d].get(kind)
            if not rec or not rec.get('exec') or rec.get('dry'): continue     # dry (on=false) — опроса не было, в статистику не идёт
            due = times[kind][1]
            closed = d < today.isoformat() or tod >= due
            cell = {}
            for k, e in rec['exec'].items():
                a = rec['ans'].get(k)
                s = ('ok' if a['ok'] else 'bad') if a else ('none' if closed else 'wait')
                cell[k] = {'n': e['n'], 'st': s}
                if s != 'wait':
                    g = agg.setdefault(e['n'], {'uid': e.get('uid'), 'n': e['n'], 'ok': 0, 'bad': 0, 'none': 0})
                    g[s] += 1
                    if e.get('uid') and not g.get('uid'): g['uid'] = e['uid']
            row[kind] = cell
            if rec.get('noans') is not None: row.setdefault('noans', {})[kind] = rec['noans']
        if len(row) > 1: days.append(row)
    ex = []
    for g in agg.values():
        n = g['ok'] + g['bad'] + g['none']
        g['pct'] = int(round(100.0 * g['ok'] / n)) if n else 0
        ex.append(g)
    ex.sort(key=lambda g: (-g['pct'], g['n']))
    # 30.10.2026, пользователь: «проверить структуру коммерческого отдела … сопоставить со структурой, кто там есть, кого нет в группах» —
    # участники группы «Коммерческий отдел» (список MAX раз в день, st['members']) и последнее сообщение каждого; poll.bin — ключ владельца
    last = {}
    for d in st.get('days', {}).values():
        for rec in d.values():
            if isinstance(rec, dict):
                for a in (rec.get('ans') or {}).values():
                    if a.get('uid') and a.get('t', '') > last.get(str(a['uid']), ''): last[str(a['uid'])] = a['t']
    mem = [{'uid': u, 'n': n, 'last_ans': last.get(str(u), '')} for u, n in sorted((st.get('members') or {}).items(), key=lambda x: str(x[1]).lower())]
    return {'v': 1, 't': t_iso, 'on': bool(load_cfg().get('on')), 'days': days, 'exec': ex, 'members': mem, 'members_t': st.get('members_t')}
