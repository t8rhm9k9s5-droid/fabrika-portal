"""Перенос в графике отгрузки (20.11.2026, Т. В.: «сопоставь, что из этой недели перешло на следующую»; «данные едины на всём портале,
один первоисточник»). Один расчёт для карточки «Продажи → отгрузка» (build_site.py) и тревоги (gen_alerts.py).
Перенос — позиция (заказ + модель), которая стояла в прошлом графике и снова стоит в новом: количество — меньшее из двух, сумма — по цене
нового графика. Номер заказа сам по себе не перенос: большой заказ отгружается партиями, в новом графике — его следующая партия."""


def _items(P):
    o, cl = {}, {}
    for d in (P or {}).get('days', []):
        for c in d.get('clients', []):
            for x in c.get('orders', []):
                cl[x['no']] = c.get('n')
                for it in x.get('items', []) or []:
                    r = o.setdefault((x['no'], it.get('n')), [0.0, 0.0]); r[0] += it.get('q') or 0; r[1] += it.get('s') or 0
    return o, cl


def carry(cur, prev):
    """→ {'n': заказов, 's': сумма ₽, 'q': шт, 'orders': [[номер, получатель, сумма, [[модель, шт], …]], …] по убыванию суммы}"""
    a, cl = _items(cur); b, _ = _items(prev)
    rows = {}
    for k, (q, s) in a.items():
        if k not in b or not q: continue
        q2 = min(q, b[k][0]); v = s / q * q2
        r = rows.setdefault(k[0], [k[0], cl.get(k[0]), 0.0, []]); r[2] += v; r[3].append([k[1], int(q2)])
    out = sorted(rows.values(), key=lambda r: -r[2])
    for r in out: r[2] = round(r[2])
    return {'n': len(out), 's': sum(r[2] for r in out), 'q': sum(x[1] for r in out for x in r[3]), 'orders': out}
