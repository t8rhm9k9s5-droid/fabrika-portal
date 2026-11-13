# -*- coding: utf-8 -*-
"""Письма служб на портал (13.11.2026, Т. В.: «расходы транспорта и обходы охраны — выводить на портал обязательно»).
Источник — реестр писем state/arch_index.jsonl (itm_arch.py: ящики itm@ и 1c@; у писем служб — начало текста 'x').
Публикует st/svc.bin: {v, t, items: [{t, src, s, x, sum, kind, a}]} за 90 дней; страница «Транспорт» показывает расходы и обходы."""
import json, os, re, datetime
import itm_arch as IA

DAYS = 90
SUM_RX = re.compile(r'(\d[\d\s]{0,9}(?:[.,]\d{1,2})?)\s*(?:₽|руб)', re.I)


def _kind(s, x):
    t = (s + ' ' + x).lower()
    if re.search(r'охран|обход|кпп|сторож', t): return 'guard'
    return 'transport'


def publish_all(L, publish, log):
    idx = os.path.join(L, 'state', 'arch_index.jsonl')
    if not os.path.exists(idx): return {'state': 'нет реестра'}
    lim = (datetime.datetime.now() - datetime.timedelta(days=DAYS)).strftime('%Y-%m-%dT%H:%M')
    seen, items = set(), []
    with open(idx, encoding='utf-8') as f:
        for ln in f:
            if 'security@' not in ln: continue
            try: r = json.loads(ln)
            except Exception: continue
            fr = (r.get('fr') or '').lower()
            if fr not in IA.SVC_FROM or (r.get('t') or '') < lim: continue
            k = r.get('mid') or (r.get('t'), r.get('s'))
            if k in seen: continue
            seen.add(k)
            x = r.get('x') or ''
            m = SUM_RX.search(x) or SUM_RX.search(r.get('s') or '')
            sm = None
            if m:
                try: sm = round(float(re.sub(r'\s', '', m.group(1)).replace(',', '.')), 2)
                except Exception: sm = None
            items.append({'t': r.get('t') or '', 'src': IA.SVC_FROM[fr], 's': r.get('s') or '', 'x': x, 'sum': sm,
                          'kind': _kind(r.get('s') or '', x), 'a': [a.get('n') for a in r.get('a') or []][:5]})
    items.sort(key=lambda i: i['t'], reverse=True)
    publish('svc.bin', {'v': 1, 't': datetime.datetime.now().strftime('%Y-%m-%dT%H:%M'), 'items': items[:300]})
    return {'state': 'ok', 'n': len(items)}
