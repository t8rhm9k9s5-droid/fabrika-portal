#!/usr/bin/env python3
"""Цены материалов из накладных «Снабжение _Производство» (25.11.2026, Т. В.: «цены из накладных — в базу калькулятора; скачок — сразу алерт
в Telegram и письмо в ОМТС: почему так»).
  python3 snab_prices.py build            → out/prices_base.json (история цены по каждой позиции), сводка скачков за всё время
  python3 snab_prices.py check <pid>      → скачки в только что выложенном документе (вызывает snab_live.py add): печатает JSON
Цена в накладной — без НДС. Скачок: цена выше средней по прежним поставкам этой позиции за 45 дней больше чем на JUMP (10 %) и сумма строки ≥ MIN_SUM.
Позиция — наименование без регистра, лишних пробелов и кавычек, плюс единица измерения."""
import glob, json, os, re, sys
H = os.path.dirname(os.path.abspath(__file__)); LIVE = os.path.join(H, 'live'); OUT = os.path.join(H, 'out'); JUMP = 0.10; MIN_SUM = 1000.0; WIN = 45


def key(name, unit):
    s = re.sub(r'[«»"“”\']', '', str(name).lower().replace('ё', 'е')); s = re.sub(r'\s+', ' ', s).strip(' .,;')
    return s + ' | ' + str(unit or '').lower().strip(' .')


def rows():
    out = []
    for f in sorted(glob.glob(os.path.join(LIVE, '20??-??-??.json'))):
        day = os.path.basename(f)[:10]
        for d in json.load(open(f, encoding='utf-8')).get('docs', []):
            novat = 'без ндс' in str(d.get('doc', '')).lower()
            for L in d.get('L', []):
                if len(L) < 5 or not L[3]: continue
                out.append({'day': day, 's': d.get('s', ''), 'doc': d.get('doc', ''), 'pid': d.get('pid', ''), 'n': str(L[0]), 'q': L[1], 'u': L[2], 'p': float(L[3]), 'sum': float(L[4]), 'novat': novat})
    return out


def days(a, b):
    import datetime
    return (datetime.date.fromisoformat(b) - datetime.date.fromisoformat(a)).days


def jumps(R, only_pid=None):
    by = {}; out = []
    for r in R: by.setdefault(key(r['n'], r['u']), []).append(r)
    for k, L in by.items():
        for i, r in enumerate(L):
            if only_pid and r['pid'] != only_pid: continue
            prev = [x for x in L[:i] if x['pid'] != r['pid'] and 0 <= days(x['day'], r['day']) <= WIN]
            if not prev or r['sum'] < MIN_SUM: continue
            q = sum(float(x['q'] or 0) for x in prev); avg = (sum(x['p'] * float(x['q'] or 0) for x in prev) / q) if q else sum(x['p'] for x in prev) / len(prev)
            if avg > 0 and r['p'] > avg * (1 + JUMP):
                out.append({'n': r['n'], 'u': r['u'], 'p': r['p'], 'avg': round(avg, 2), 'pct': round((r['p'] / avg - 1) * 100, 1), 'q': r['q'], 'over': round((r['p'] - avg) * float(r['q'] or 0), 2),
                            's': r['s'], 'doc': r['doc'], 'day': r['day'], 'pid': r['pid'], 'prev_n': len(prev), 'prev_s': sorted({x['s'] for x in prev})[:3], 'prev_last': prev[-1]['day']})
    return sorted(out, key=lambda x: -x['over'])


def build():
    R = rows(); by = {}
    for r in R: by.setdefault(key(r['n'], r['u']), []).append(r)
    base = {}
    for k, L in by.items():
        last = L[-1]; ps = [x['p'] for x in L]
        base[k] = {'name': last['n'], 'unit': last['u'], 'last': last['p'], 'last_day': last['day'], 'last_s': last['s'], 'novat': last['novat'], 'min': min(ps), 'max': max(ps), 'n': len(L),
                   'hist': [[x['day'], x['s'], x['p'], x['q'], x['doc']] for x in L]}
    os.makedirs(OUT, exist_ok=True)
    json.dump({'t': R[-1]['day'] if R else '', 'rows': len(R), 'items': base}, open(os.path.join(OUT, 'prices_base.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    return R, base


def alert(pid):
    """скачки в документе pid → сразу Telegram владельцу (мимо очереди) и одно письмо в ОМТС (начальнику отдела); повтор по тому же документу не шлётся"""
    import subprocess
    J = jumps(rows(), pid)
    if not J: return []
    sp = os.path.join(OUT, 'alerts_sent.json')
    try: sent = json.load(open(sp, encoding='utf-8'))
    except Exception: sent = {}
    if pid in sent: return J
    fm = lambda v: ('%.2f' % v).replace('.', ',')
    doc = J[0]['doc']; sup = J[0]['s']
    tg = '⚠️ <b>Снабжение: цена выше обычной</b>\n%s, %s\n' % (sup, doc) + '\n'.join(
        '• %s: <b>%s ₽</b> против средней %s ₽ за %d дн. (+%s %%), %s %s — переплата ≈ %s ₽' % (j['n'][:70], fm(j['p']), fm(j['avg']), WIN, fm(j['pct']), j['q'], j['u'], fm(j['over'])) for j in J[:8]) + '\nПисьмо в ОМТС с вопросом «почему» отправлено.'
    r1 = subprocess.run([sys.executable, '/home/claude/fabrika/work/tgsay.py', tg, '--now'], capture_output=True, text=True)
    body = ('Сотрудник56 Отчество38, добрый день!\n\nВ накладной %s (%s) цена по позициям ниже оказалась выше, чем в прошлых поставках. Подскажите, пожалуйста, с чем это связано: '
            'изменилась цена поставщика, это разовая закупка (тогда — для чего она), другая партия или характеристика, либо в документе что-то не дописано?\n\n' % (doc, sup)
            + '\n'.join('%d. %s — %s руб. за %s без НДС; в прошлых поставках (%s, последняя %s.%s) в среднем %s руб.; разница +%s %%, по этой поставке ≈ %s руб.' % (
                i, j['n'], fm(j['p']), j['u'], ', '.join(j['prev_s'])[:80], j['prev_last'][8:10], j['prev_last'][5:7], fm(j['avg']), fm(j['pct']), fm(j['over'])) for i, j in enumerate(J[:12], 1))
            + '\n\nДостаточно короткого ответа на это письмо. Если всё в порядке и цена согласована — так и напишите, вопрос закроем.\n\nСпасибо!\nПортал «Фабрика» по поручению Т. В. Сотрудник1')
    mp = os.path.join(OUT, 'alert_%s.json' % pid)
    json.dump({'to': 'user41@example.org', 'subject': 'Цена выше прежних поставок: %s, %s' % (sup[:60], doc[:60]), 'text': body}, open(mp, 'w', encoding='utf-8'), ensure_ascii=False)
    r2 = subprocess.run([sys.executable, '/home/claude/fabrika/tools/mail1c.py', 'send', mp], capture_output=True, text=True)
    sent[pid] = {'n': len(J), 'tg': (r1.stdout or r1.stderr)[-80:], 'mail': (r2.stdout or r2.stderr)[-80:]}
    json.dump(sent, open(sp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return J


if __name__ == '__main__':
    c = sys.argv[1] if len(sys.argv) > 1 else 'build'
    if c == 'build':
        R, base = build(); J = jumps(R)
        json.dump(J, open(os.path.join(OUT, 'jumps_all.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        print('строк', len(R), '| позиций', len(base), '| с повторными поставками', sum(1 for v in base.values() if v['n'] > 1), '| скачков', len(J))
        for j in J[:25]: print('  %s | %s | %s → %s (+%s%%) × %s %s = переплата %s | %s, %s' % (j['day'], j['n'][:50], j['avg'], j['p'], j['pct'], j['q'], j['u'], j['over'], j['s'][:28], j['doc'][:26]))
    elif c == 'check':
        print(json.dumps(jumps(rows(), sys.argv[2]), ensure_ascii=False))
    elif c == 'alert':
        print('скачков:', len(alert(sys.argv[2])))
