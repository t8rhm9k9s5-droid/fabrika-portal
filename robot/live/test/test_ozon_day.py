"""Тест ozon_day.py (29.10.2026): дни по Москве, отмены, продажи из финансов, товары только вчерашнего дня, публикация."""
import datetime, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ozon as OZ, ozon_hist as OH, ozon_day as OD
OH.time.sleep = OD.time.sleep = lambda s: None
today = datetime.date(2026, 10, 29)
FBO = [  # created_at — UTC
    {'created_at': '2026-10-27T21:30:00Z', 'status': 'delivered', 'products': [{'offer_id': 'A', 'name': 'Стул A', 'price': '1000', 'quantity': 2}]},   # 28.10 00:30 МСК
    {'created_at': '2026-10-28T10:00:00Z', 'status': 'cancelled', 'products': [{'offer_id': 'B', 'name': 'Стул B', 'price': '500', 'quantity': 1}]},
    {'created_at': '2026-10-28T20:59:00Z', 'status': 'awaiting_deliver', 'products': [{'offer_id': 'C', 'name': 'Кресло C', 'price': '3000', 'quantity': 1}]},  # 23:59 МСК 28.10
    {'created_at': '2026-10-28T21:01:00Z', 'status': 'awaiting_packaging', 'products': [{'offer_id': 'D', 'name': 'Стол D', 'price': '7000', 'quantity': 1}]},  # 29.10 00:01 МСК
    {'created_at': '2026-10-27T20:00:00Z', 'status': 'delivered', 'products': [{'offer_id': 'E', 'name': 'Табурет E', 'price': '400', 'quantity': 5}]},  # 27.10 23:00 МСК
]
seen = []
M = lambda v: {'amount': str(v), 'currency': 'RUB'}
for p in FBO:                                             # 29.10: в v3/v4 цена — объект {amount, currency}
    for x in p['products']: x['price'] = M(x['price'])
def call(cid, key, path, body, timeout=25):
    seen.append(path)
    if path in ('/v2/posting/fbo/list', '/v3/posting/fbs/list', '/v3/finance/transaction/totals'):
        raise OZ.OzonError(path + ' 400 obsolete method cannot be used')
    if path == '/v3/posting/fbo/list':                    # по одной записи на страницу — проверка курсора
        a, b = body['filter']['since'], body['filter']['to']
        rows = [p for p in FBO if a <= p['created_at'] <= b]
        i = int(body.get('cursor') or 0)
        return {'postings': rows[i:i + 1], 'has_next': i + 1 < len(rows), 'cursor': str(i + 1) if i + 1 < len(rows) else ''}
    if path == '/v4/posting/fbs/list': return {'postings': [], 'has_next': False, 'cursor': ''}
    if path == '/v1/analytics/data': return {'result': {'data': [{'dimensions': [{'id': '2026-10-28'}], 'metrics': [5000, 3]}]}}
    if path == '/v1/finance/accrual/by-day':
        if body['date'] != '2026-10-28': return {'accruals': [], 'last_id': ''}
        page = [  # продажа 12 345,50: комиссия −1 500, доставка −300; возврат −200; услуга без товара −45
            {'accrued_category': 'POSTING', 'total_amount': M(10545.5), 'posting': {'products': [{'sku': 1, 'commission': {'sale_amount': M(12345.5), 'commission': M(-1500)}, 'delivery': {'total_accrued': M(-300)}}]}},
            {'accrued_category': 'POSTING', 'total_amount': M(-200), 'posting': {'products': [{'sku': 2, 'commission': {'sale_amount': M(-200), 'commission': M(0)}, 'delivery': {'total_accrued': M(0)}}]}}]
        if not body['last_id']: return {'accruals': page, 'last_id': 'p2'}
        if body['last_id'] == 'p2': return {'accruals': [{'accrued_category': 'NON_ITEM', 'total_amount': M(-45), 'non_item_fee': {'accrued': M(-45), 'type_id': 7}}], 'last_id': 'p3'}
        return {'accruals': [], 'last_id': 'p3'}
    raise AssertionError(path)
OZ.call = call
days, top, errs = OD.collect('1', 'k', today)
y = [d for d in days if d['d'] == '2026-10-28'][0]; t = days[0]
ok = 0
def check(c, m):
    global ok; assert c, (m, y, top, errs); ok += 1; print('  ✓', m)
check(not errs, 'без ошибок')
check(len(days) == 8 and days[0]['d'] == '2026-10-29', '8 дней, первый — сегодня')
check(y['orders']['n'] == 3 and y['orders']['s'] == 2000 + 500 + 3000, 'вчера (МСК): 3 заказа на 5 500 ₽ — 00:30 МСК и 23:59 МСК в своём дне')
check(y['orders']['cn'] == 1 and y['orders']['cs'] == 500, 'отмена посчитана')
check(t['orders']['n'] == 1 and t['orders']['s'] == 7000, 'сегодня — заказ 00:01 МСК')
check(y['fin']['accruals_for_sale'] == 12345.5 and y['fin']['sale_commission'] == -1500 and y['fin']['processing_and_delivery'] == -300, 'продажи вчера — начисления за день (/v1/finance/accrual/by-day), две страницы по last_id')
check(y['fin']['refunds_and_cancellations'] == -200 and y['fin']['services_amount'] == -45 and y['fin']['total'] == 10300.5, 'возврат и услуга без товара отдельно, итог как у Ozon')
check(not [x for x in seen if x in ('/v2/posting/fbo/list', '/v3/posting/fbs/list', '/v3/finance/transaction/totals')], 'отключённые методы Ozon больше не вызываются')
# удержания пришли положительными — знак выправляется по total_amount
def call2(cid, key, path, body, timeout=25):
    return {'accruals': [{'accrued_category': 'POSTING', 'total_amount': M(800), 'posting': {'products': [{'commission': {'sale_amount': M(1000), 'commission': M(150)}, 'delivery': {'total_accrued': M(50)}}]}}], 'last_id': ''}
OZ.call = call2; f2 = OH.accrual_day('1', 'k', datetime.date(2026, 10, 28)); OZ.call = call
check(f2['sale_commission'] == -150 and f2['processing_and_delivery'] == -50 and f2['services_amount'] == 0, 'положительные удержания приведены к «−»')
check(y['an'] == {'s': 5000, 'u': 3}, 'аналитика «заказано» за вчера')
check([r['id'] for r in top] == ['C', 'A'], 'товары — только вчерашние, без отменённых, по сумме')
# публикация и пауза 30 минут
d = tempfile.mkdtemp(); os.makedirs(os.path.join(d, 'state'))
open(os.path.join(d, 'ozon_pks'), 'w').write('client_id=123\napi_key=00000000-0000-0000-0000-000000000000\n')
store, pub = {}, {}
r = OD.run(d, lambda *a: None, lambda n, dflt: store.get(n, dflt), lambda n, v: store.__setitem__(n, v), lambda n, o: pub.__setitem__(n, o), lambda x: x.strftime('%Y-%m-%dT%H:%M'))
check(r['state'] == 'ok' and 'ozd.bin' in pub and pub['ozd.bin']['days'][0]['d'], 'опубликован st/ozd.bin')
n0 = len(seen); OD.run(d, lambda *a: None, lambda n, dflt: store.get(n, dflt), lambda n, v: store.__setitem__(n, v), lambda n, o: pub.__setitem__(n, o), lambda x: x)
check(len(seen) == n0, 'повторно раньше чем через 30 минут — без запросов к Ozon')
print('ALL OK', ok)
