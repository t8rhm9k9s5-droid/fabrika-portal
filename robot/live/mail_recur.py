# -*- coding: utf-8 -*-
"""«Фабрика» — ежедневные рассылки без разборщика (12.11.2026). Python 3.6, без Claude.
Т. В. 12.11: «чтобы портал от тебя зависел только там, где надо думать… видим, что письмо пришло больше, чем 2 дня подряд, значит,
это ежедневное письмо, его надо бы разбирать… у меня может быть от тебя вопрос, куда его класть».

Раз в сутки (после разбора ящиков) — по реестру state/arch_index.jsonl (itm@: «экономика», «производство», «ОМТС»; 1c@: «Входящие»):
 • рассылка = отправитель + тема без чисел и месяцев (itm_arch._skey);
 • «ежедневная» — пришла 3 и больше рабочих дня подряд (за последние 10 дней);
 • «уже разбирается» — хоть одно письмо разобрано роботом (поле r), тема/вложение узнаётся itm.report_like или KNOWN,
   либо решение Т. В. записано в mail_recur_map.json (to = раздел портала / «не нужно»);
 • остальные → status.mail_recur.new (в ls.bin, шифр) — облачное задание утром спрашивает Т. В., куда класть, и пишет разборщик.
Письма людей (переписка) отсеиваются: нужно вложение хотя бы в половине писем или отправитель-робот (1c@, noreply, econom-…).
Тексты писем и вложения не читаются — только строки реестра."""
import datetime, json, os, re

import itm as IT
import itm_arch as IA

DAYS = 10            # окно просмотра, календарных дней
RUN = 3              # «больше, чем 2 дня подряд» — рабочих дней
MAP_FILE = 'mail_recur_map.json'   # решения Т. В.: {skey: {"to": "раздел" | "не нужно", "t": "ГГГГ-ММ-ДД"}} (рядом с кодом, приходит пакетом)
KNOWN = re.compile(r'ведомость по заказам|выпуск\w* (план|факт|гкз|одди)|омтс|рекламац|претенз|план[- ]факт|отгружено по менеджерам|'
                   r'график отгрузки|складские остатки|пкс свободные|продажи в разрезе|тз в работе|гальваник|жилпромсервис отчеты', re.I)
ROBOT_FROM = re.compile(r'^(1c|noreply|no-reply|robot|report|reports|econom-\d+|pdo|omts|mailer)@', re.I)


def _wd(d): return d.weekday() < 5


def _run_len(days, today):
    """самая длинная серия рабочих дней подряд (выходные не рвут серию) среди дат days за окно"""
    best = cur = 0
    d = today - datetime.timedelta(days=DAYS)
    while d <= today:
        if _wd(d):
            if d in days: cur += 1; best = max(best, cur)
            else: cur = 0
        d += datetime.timedelta(days=1)
    return best


def _map(code_dir):
    try:
        with open(os.path.join(code_dir, MAP_FILE), encoding='utf-8') as f: m = json.load(f)
        return m if isinstance(m, dict) else {}
    except Exception: return {}


def scan(L, code_dir, today=None):
    today = today or IT._now().date()
    since = (today - datetime.timedelta(days=DAYS)).strftime('%Y-%m-%d')
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    G = {}
    with open(idx, encoding='utf-8') as f:
        for line in f:
            try: r = json.loads(line)
            except Exception: continue
            t = str(r.get('t') or '')[:10]
            if t < since: continue
            k = IA._skey(r)
            g = G.setdefault(k, {'fr': r.get('fr') or '', 's': r.get('s') or '', 'f': r.get('f') or '', 'days': set(), 'n': 0,
                                 'att': 0, 'ext': set(), 'done': False, 'last': ''})
            try: g['days'].add(datetime.date(int(t[:4]), int(t[5:7]), int(t[8:10])))
            except Exception: continue
            g['n'] += 1
            names = [a.get('n') or '' for a in (r.get('a') or []) if isinstance(a, dict)]
            if names: g['att'] += 1; g['ext'].update(os.path.splitext(n.lower())[1] for n in names if '.' in n)
            if r.get('r'): g['done'] = True
            if t >= g['last']: g['last'] = t; g['s'] = r.get('s') or g['s']
            try:
                if IT.report_like(g['fr'], (r.get('s') or ''), names): g['done'] = True
            except Exception: pass  # необязательный шаг: сбой не мешает работе робота
    M = _map(code_dir)
    new, known, decided = [], 0, 0
    for k, g in G.items():
        if _run_len(g['days'], today) < RUN: continue
        if not (g['att'] * 2 >= g['n'] or ROBOT_FROM.match(g['fr'])): continue          # переписка людей — не рассылка
        if k in M: decided += 1; continue
        if g['done'] or KNOWN.search(g['s']) or any(KNOWN.search(x) for x in g['ext']): known += 1; continue
        new.append({'k': k[:300], 'fr': g['fr'][:120], 's': g['s'][:160], 'box': g['f'][:40], 'days': len(g['days']), 'n': g['n'],
                    'last': g['last'], 'ext': sorted(x for x in g['ext'] if x)[:6]})
    new.sort(key=lambda x: (-x['days'], x['fr']))
    return {'t': IT._now().strftime('%Y-%m-%dT%H:%M'), 'new': new[:30], 'known': known, 'decided': decided, 'groups': len(G)}


def run(L, code_dir, jload, jsave, log):
    """раз в сутки (после 09:00 МСК — утренние рассылки уже пришли); результат — в status.mail_recur"""
    st = jload('mail_recur.json', {}) or {}
    now = IT._now(); day = now.strftime('%Y-%m-%d')
    if st.get('day') == day or now.strftime('%H:%M') < '09:00':
        return st.get('res') or {'state': 'ждёт 09:00'}
    res = scan(L, code_dir, now.date())
    jsave('mail_recur.json', {'day': day, 'res': res})
    log('  ежедневные рассылки без разборщика:', len(res['new']), '(известных', res['known'], ', решено', res['decided'], ')')
    return res
