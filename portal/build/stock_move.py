# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Склад → движение по складам в разрезе филиалов» (02.11.2026 — 5 групп складов; 03.11.2026 — по филиалам).
03.11.2026, Т. В. Сотрудник1: «Динамика складов показана абсолютно неверно на схеме. Возьми отчет от Сотрудник10, используй его как базу.
То есть движение по складу в разрезе филиалов то же самое. Склады брака тоже можно указать уже внутри отчета. На главной плашке…
общее количество согласно того отчета.»
Вход: /home/claude/stock/move/raw/*.xlsx — отчёт 1С «Товары на складах» (Начальный остаток, Приход, Расход, Конечный остаток;
Склад → Вид номенклатуры сбыт → Номенклатура → Характеристика), первый — письмо М. М. Сотрудник10 02.11 «Октябрь 2026 Запасы ГП»;
рядом <файл>.meta.json — исходное имя вложения, подпись источника, дата письма.
Разбор — тот же код, что у робота хостинга: app_build/host/live/stock_mv.py (филиал: «Офис продаж <город> …» → «ОП <город>»,
остальные склады → «Рязань»; брак и рекламации — внутри филиала с отметкой k='brak').
Выход: /home/claude/stock/move/ГГГГ-ММ.json — для страницы «Склад» (gen_stock.py → <script id="move-data">) и плитки на главной."""
import json, os, sys

D = '/home/claude/stock/move'
RAW = os.path.join(D, 'raw')
sys.path.insert(0, '/home/claude/app_build/host/live')
import stock_mv as SMV


def meta(p):
    try: return json.load(open(p[:-5] + '.meta.json', encoding='utf-8'))
    except Exception: return {}


def main():
    done, best = [], {}
    for f in sorted(os.listdir(RAW)):
        if not f.lower().endswith('.xlsx') or f.startswith('~$'): continue
        p = os.path.join(RAW, f); M = meta(p)
        J = SMV.parse(open(p, 'rb').read(), M.get('file') or f, (M.get('letter') or '')[:10] or None, src=M.get('src') or f)
        if not J: sys.exit('не отчёт «Товары на складах»: %s' % f)
        if M.get('to'): J['to'] = M['to']
        J['got'] = (M.get('letter') or '')[:16]
        o = best.get(J['m'])
        if not o or (J['to'], J['got']) > (o['to'], o['got']): best[J['m']] = J        # за месяц — самый поздний отчёт
    for m, J in sorted(best.items()):
        out = os.path.join(D, m + '.json')
        json.dump(J, open(out, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        done.append((m, J['to'], J['tot'], J['nw'], len(J['g']), J['brak'][3], os.path.getsize(out)))
    for x in done: print('движение по складам %s по %s: итог %s, складов %d, филиалов %d, брак и рекламации %s, %d байт' % x)


if __name__ == '__main__':
    main()
