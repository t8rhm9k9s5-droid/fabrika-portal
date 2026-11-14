#!/usr/bin/env python3
"""«Фабрика» — сквозная нумерация документов портала (14.11.2026, Т. В.: «документ для портала — читаем, проверяем, фирменный стиль,
присваиваем ему сквозной номер и потом кладём на портал. Больше никак»). Реестр build/doc_numbers.json: {"next": N, "docs": {ключ: {n, title, date}}}.
Номер — «ФАБ-0001»: один на документ навсегда (новая редакция — тот же номер, редакция в названии).
  python3 docnum.py get <ключ> "<название>"   → печатает номер (выдаёт новый, если ключа ещё нет)
  python3 docnum.py list                      → весь реестр"""
import json, os, sys, datetime
P = '/home/claude/build/doc_numbers.json'
def load():
    try: return json.load(open(P, encoding='utf-8'))
    except Exception: return {'next': 1, 'docs': {}}
def get(key, title=''):
    R = load(); d = R['docs'].get(key)
    if not d:
        d = {'n': 'ФАБ-%04d' % R['next'], 'title': title, 'date': (datetime.datetime.utcnow() + datetime.timedelta(hours=3)).strftime('%Y-%m-%d')}
        R['docs'][key] = d; R['next'] += 1
        json.dump(R, open(P, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    return d['n']
if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == 'get': print(get(a[1], a[2] if len(a) > 2 else ''))
    elif a and a[0] == 'list': print(json.dumps(load(), ensure_ascii=False, indent=1))
    else: print(__doc__)
