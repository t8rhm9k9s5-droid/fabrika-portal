# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник Сотрудник Отчество (владелец) и Сотрудник Сотрудник Отчество — с равными правами.
# Команда Сотрудник Отчество = команда Сотрудник Отчество, любым каналом: почта (в т. ч. user@example.org, user@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика»: номер версии и список изменений (CHANGELOG.txt — главный файл, новые версии сверху).
   С 28.10.2026 — как принято у программистов (Semantic Versioning, пользователь: «кодировку версии сделай общепринятой»):
   МАЖОР.МИНОР.ПАТЧ — МАЖОР: крупная переделка (дизайн, структура портала и ботов); МИНОР: новые возможности (раздел, отчёт,
   команда бота); ПАТЧ: исправления, обновления данных, мелкие правки. Номер даётся каждому выпуску на хостинг сразу —
   «Готовится» — внесённое, но ещё не выпущенное (version_pending.json); при выпуске номер считается по самому крупному изменению.
     python3 version.py                              — текущая версия
     python3 version.py add N "строка"               — исправление (ПАТЧ) весом N
     python3 version.py feat N "строка"              — новая возможность (МИНОР)
     python3 version.py major N "строка"             — крупная переделка (МАЖОР)
     python3 version.py release                      — выпустить всё из «Готовится» (перед build_site.py)
     python3 version.py bump patch|minor|major "строка" … — выпустить сейчас (старые c|x|d тоже понимаются)
     python3 version.py js FILE                      — assets/version.js для сайта
     python3 version.py news                         — короткий текст для уведомления о новой версии"""
import re, sys, json, datetime
LOG = '/home/claude/build/CHANGELOG.txt'
PENDING = '/home/claude/build/version_pending.json'
KINDS = {'d': 'major', 'x': 'minor', 'c': 'patch', 'major': 'major', 'minor': 'minor', 'patch': 'patch'}
RANK = {'patch': 0, 'minor': 1, 'major': 2}
HEAD = re.compile(r'^(\d+)\.(\d+)\.(\d+) · (.+)$')
TEST = re.compile(r'^тест (\d+\.\d+\.\d+) · (.+)$')             # before 1.0.0 everything was a test (23.10.2026, the user)


def parse():
    lines = open(LOG, encoding='utf-8').read().split('\n')
    out, cur = [], None
    for ln in lines:
        m = HEAD.match(ln.strip()); t = TEST.match(ln.strip())
        if m:
            cur = {'v': '%s.%s.%s' % m.group(1, 2, 3), 'n': tuple(int(x) for x in m.group(1, 2, 3)), 'date': m.group(4), 'items': []}
            out.append(cur)
        elif t:
            cur = {'v': t.group(1), 'n': None, 'test': True, 'date': t.group(2), 'items': []}
            out.append(cur)
        elif cur is not None and ln.strip().startswith('- '):
            cur['items'].append(ln.strip()[2:])
        elif cur is not None and ln.startswith('  ') and cur['items']:
            cur['items'][-1] += ' ' + ln.strip()
    return out


def releases(): return [e for e in parse() if not e.get('test')]


def current(): return releases()[0]['v']


def msk(): return datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=3)


def pending():
    try: return json.load(open(PENDING, encoding='utf-8'))
    except Exception: return {'items': []}


def total(P=None): return sum(i['n'] for i in (P or pending())['items'])


def write_pending_block(P):
    """the block «Готовится» at the top of CHANGELOG.txt (above the versions)"""
    s = open(LOG, encoding='utf-8').read()
    a = s.find('\nГотовится'); b = s.index(releases()[0]['v'] + ' · ')
    if a < 0 or a > b: a = b - 1
    n = total(P)
    kinds = {'patch': 'исправление', 'minor': 'новое', 'major': 'переделка'}
    blk = ('\nГотовится (ещё не выпущено): ' + str(n) + ' ' + ('изменение' if n % 10 == 1 and n % 100 != 11 else 'изменения' if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else 'изменений') +
           '; номер — при выпуске\n' + ''.join('- ' + i['t'] + (' (' + str(i['n']) + ')' if i['n'] != 1 else '') + ' · ' + kinds.get(i.get('k', 'patch'), 'исправление') + ' · ' + i['date'] + '\n'
                                              for i in P['items']) + '\n') if P['items'] else '\n'
    open(LOG, 'w', encoding='utf-8').write(s[:a] + blk + s[b:])


def bump(kind, items):
    """a new version now: the accumulated changes and the given lines go into it"""
    V = releases(); d, x, c = V[0]['n']; kind = KINDS.get(kind, 'patch')
    d, x, c = (d + 1, 0, 0) if kind == 'major' else (d, x + 1, 0) if kind == 'minor' else (d, x, c + 1)
    P = pending(); lines = [i.strip().lstrip('- ') for i in items if i.strip()] + [i['t'] + (' (' + str(i['n']) + ')' if i['n'] != 1 else '') for i in P['items']]
    s = open(LOG, encoding='utf-8').read()
    head = '%d.%d.%d · %s' % (d, x, c, msk().strftime('%d.%m.%Y'))
    entry = head + '\n' + '\n'.join('- ' + i for i in lines) + '\n\n'
    i = s.index(V[0]['v'] + ' · ')
    open(LOG, 'w', encoding='utf-8').write(s[:i] + entry + s[i:])
    json.dump({'items': []}, open(PENDING, 'w', encoding='utf-8'), ensure_ascii=False, indent=1); write_pending_block({'items': []})
    return '%d.%d.%d' % (d, x, c)


def add(n, text, kind='patch'):
    """изменение в «Готовится»; номер версии — при выпуске (release), по самому крупному виду"""
    P = pending(); P['items'].append({'t': text.strip().lstrip('- '), 'n': max(1, int(n)), 'k': KINDS.get(kind, 'patch'), 'date': msk().strftime('%d.%m %H:%M')})
    json.dump(P, open(PENDING, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    write_pending_block(P)
    return 'pending %d' % total(P)


def release():
    """выпуск: всё из «Готовится» — одной версией; МАЖОР/МИНОР/ПАТЧ — по самому крупному изменению"""
    P = pending()
    if not P['items']: return current()
    k = max((i.get('k', 'patch') for i in P['items']), key=lambda z: RANK.get(z, 0))
    return bump(k, [])


def js(path):
    R = releases(); T = [e for e in parse() if e.get('test')]
    data = {'v': R[0]['v'], 'log': [{'v': e['v'], 'date': e['date'], 'items': e['items']} for e in R[:15]],
            'tests': [{'v': e['v'], 'date': e['date'], 'items': e['items']} for e in T],
            'pending': [{'t': i['t'], 'n': i['n'], 'k': i.get('k', 'patch'), 'date': i['date']} for i in pending()['items']], 'rule': 'semver'}
    open(path, 'w', encoding='utf-8').write('/* «Фабрика»: номер версии и что нового (из build/CHANGELOG.txt, version.py) */\nwindow.T14_VERSION = ' +
                                             json.dumps(data, ensure_ascii=False).replace('<', '\\u003c') + ';\n')


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a: print(current())
    elif a[0] == 'bump': print(bump(a[1], a[2:]))
    elif a[0] == 'add': print(add(a[1], ' '.join(a[2:])))
    elif a[0] in ('feat', 'major'): print(add(a[1], ' '.join(a[2:]), 'minor' if a[0] == 'feat' else 'major'))
    elif a[0] == 'release': print(release())
    elif a[0] == 'js': js(a[1]); print('version', current())
    elif a[0] == 'news':
        e = releases()[0]; t = 'Версия ' + e['v'] + ': ' + ' '.join(e['items'])
        print(t[:297] + '…' if len(t) > 300 else t)
    else: print(__doc__)
