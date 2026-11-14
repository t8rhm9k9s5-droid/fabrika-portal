"""Тест перехода на новые методы Ozon (29.10.2026): FBS-заказы ozon.py — /v4 по cursor, цена-объект → прежние price/currency_code;
история ozon_hist — финансы по месяцам из начислений по дням с кэшем старых дней."""
import datetime, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ozon as OZ, ozon_hist as OH
OH.time.sleep = lambda s: None
ok = 0
def check(c, m):
    global ok; assert c, m; ok += 1; print('  ✓', m)
seen = []
def call(cid, key, path, body, timeout=25):
    seen.append((path, body.get('cursor'), body.get('date')))
    if path == '/v4/posting/fbs/list':
        c = body.get('cursor') or ''
        P = {'': ([{'posting_number': '1-1', 'status': 'awaiting_packaging', 'products': [{'offer_id': 'A', 'quantity': 1, 'price': {'amount': '990.00', 'currency': 'RUB'}}]}], True, 'c2'),
             'c2': ([{'posting_number': '1-2', 'status': 'delivering', 'products': [{'offer_id': 'B', 'quantity': 2, 'price': {'amount': '100', 'currency': 'RUB'}}]}], False, '')}[c]
        return {'postings': P[0], 'has_next': P[1], 'cursor': P[2]}
    if path == '/v1/finance/accrual/by-day':
        return {'accruals': [{'accrued_category': 'POSTING', 'total_amount': {'amount': '90'}, 'posting': {'products': [{'commission': {'sale_amount': {'amount': '100'}, 'commission': {'amount': '-10'}}, 'delivery': {'total_accrued': {'amount': '0'}}}]}}], 'last_id': ''}
    raise AssertionError(path)
OZ.call = call
ps = OZ.postings('1', 'k', datetime.datetime(2026, 10, 29, 10, 0))
check([p['posting_number'] for p in ps] == ['1-1', '1-2'], 'FBS: две страницы по cursor')
check(ps[0]['products'][0]['price'] == '990.00' and ps[0]['products'][0]['currency_code'] == 'RUB', 'цена-объект → price + currency_code')
check(all(s[0] == '/v4/posting/fbs/list' for s in seen), 'только /v4/posting/fbs/list')
seen.clear()
cache = {'2026-09-01': {'accruals_for_sale': 5000, 'total': 4500}}
out, cache2 = OH.finance('1', 'k', datetime.date(2026, 9, 1), datetime.date(2026, 10, 29), cache)
asked = {s[2] for s in seen}
check('2026-09-01' not in asked and '2026-10-29' in asked and '2026-10-16' in asked and '2026-10-15' in asked, 'старые дни — из кэша, последние 14 — заново')
check(out['2026-09']['accruals_for_sale'] == 5000 + 29 * 100 and out['2026-10']['sale_commission'] == -290, 'месяцы — сумма дней')
print('ALL OK', ok)
