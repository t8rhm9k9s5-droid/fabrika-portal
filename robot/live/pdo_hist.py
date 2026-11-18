"""«Фабрика» — отчёты ПДО по дням с 01.11.2026 целиком (18.11.2026, Т. В.: «из этого отчёта с 1/11 прими всю статистику по обоим файлам и отобрази на портале»).
Каждое утро ПДО (Сотрудник38 И.) присылает два файла за прошлый рабочий день:
  vypusk.pdf     — «Отчёт выпуска производства»: все участки, дневная и ночная смена, итог за сутки, пометки (переупаковка, Шеффилд, «информация отсутствует»);
  vedomost.xls   — 1С «Ведомость по заказам на производство»: сдано на склад по видам номенклатуры и моделям.
live.py раскладывает их в OUTD/raw/<ГГГГ-ММ-ДД>/. Здесь — все дни с SINCE: {'since', 'days': [{d, v: [[строка, день, ночь, итог, пометка]], s: {total, groups}}]}
→ pf.bin['pdo'] → страница «Производство», блок «Отчёты ПДО по дням».
Дни, которых нет в OUTD/raw хостинга (отчёты ноября пришли в itm@ до переезда робота на 1c@), берутся из pdo_seed.json рядом с кодом
(разобраны теми же функциями build_output 18.11.2026). Python 3.6."""
import json, os, re

SINCE = '2026-11-01'
HERE = os.path.dirname(os.path.abspath(__file__))


def _num(lst):
    return [int(x) if float(x) == int(x) else float(x) for x in (lst or [])]


def vyp_rows(BO, path):
    """vypusk.pdf → (дата, [[строка, [день], [ночь], [итог], пометка]]) в порядке отчёта"""
    d, rows = BO.parse_vypusk(path)
    out = []
    for nm, r in rows.items():
        day, night, tot = r.get('day') or [[], ''], r.get('night') or [[], ''], r.get('total') or [[], '']
        note = (tot[1] or day[1] or night[1] or '').strip()
        out.append([nm, _num(day[0]), _num(night[0]), _num(tot[0]), note[:80]])
    return d, out


def vyp_to(BO, path):
    """отчёт за несколько дней («за 03.11.2026г.-04.11.2026г.») → последняя дата 'ГГГГ-ММ-ДД', иначе None"""
    try: m = re.search(r'за\s+\d\d\.\d\d\.\d{4}\s*г?\.?\s*[-–]\s*(\d\d)\.(\d\d)\.(\d{4})', BO.pdf_text(path)[:400])
    except Exception: return None
    return '%s-%s-%s' % (m.group(3), m.group(2), m.group(1)) if m else None


def lines(BO, path):
    """строки выпуска по правилу itm_ytd._day_rec (составные ячейки, «Шеффилд» отдельно) → {строка: [участок, шт]}"""
    try:
        import itm_ytd as IY
        return IY._day_rec(BO, path)[1]
    except Exception: return {}


def sklad(BO, path):
    """vedomost.xls → {total, groups: [[вид, шт, [[модель, шт]]]]}"""
    v = BO.parse_vedomost(path) or {}
    gs = []
    for g in v.get('groups') or []:
        gs.append([g[0], g[1], [[m[0][:70], m[1]] for m in (g[2] if len(g) > 2 else [])][:60]])
    return {'total': v.get('total'), 'groups': gs, 'd': v.get('date')}


def build(BO, OUTD, L=None, since=SINCE):
    days = {}
    try:
        with open(os.path.join(HERE, 'pdo_seed.json'), encoding='utf-8') as f: seed = json.load(f)
        for x in seed.get('days') or []:
            if x.get('d', '') >= since: days[x['d']] = x
    except Exception: pass
    bases = [os.path.join(OUTD, 'raw')] + ([os.path.join(L, 'ytd', 'raw')] if L else [])
    for base in bases:
        if not os.path.isdir(base): continue
        for dd in sorted(os.listdir(base)):
            if not re.match(r'\d{4}-\d\d-\d\d$', dd) or dd < since: continue
            folder = os.path.join(base, dd)
            rec = dict(days.get(dd) or {'d': dd})
            p = os.path.join(folder, 'vypusk.pdf')
            if os.path.exists(p):
                try:
                    rd, v = vyp_rows(BO, p)
                    if v: rec['v'] = v
                    l = lines(BO, p)
                    if l: rec['l'] = l
                    if rd and rd != dd: rec['rd'] = rd
                    to = vyp_to(BO, p)
                    if to: rec['to'] = to
                except Exception as e: rec['v_err'] = e.__class__.__name__
            vd = next((os.path.join(folder, f) for f in ('vedomost.xlsx', 'vedomost.xls') if os.path.exists(os.path.join(folder, f))), None)
            if vd:
                try: rec['s'] = sklad(BO, vd)
                except Exception as e: rec['s_err'] = e.__class__.__name__
            if rec.get('v') or rec.get('s'): days[dd] = rec
    return {'since': since, 'days': [days[k] for k in sorted(days, reverse=True)]}


if __name__ == '__main__':          # сборка pdo_seed.json из скачанных файлов: pdo_hist.py <папка с файлами ПДО> <build_output dir>
    import sys, glob
    sys.path.insert(0, sys.argv[2])
    import build_output as BO
    D = {}
    for p in sorted(glob.glob(os.path.join(sys.argv[1], '*.pdf'))):
        d, v = vyp_rows(BO, p)
        if d:
            D.setdefault(d, {'d': d})['v'] = v
            D[d]['l'] = lines(BO, p)
            to = vyp_to(BO, p)
            if to: D[d]['to'] = to
    for p in sorted(glob.glob(os.path.join(sys.argv[1], '*.xls*'))):
        s = sklad(BO, p)
        if s.get('d'): D.setdefault(s['d'], {'d': s['d']})['s'] = s
    out = {'since': SINCE, 'days': [D[k] for k in sorted(D, reverse=True)]}
    with open(os.path.join(HERE, 'pdo_seed.json'), 'w', encoding='utf-8') as f: json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    print(len(out['days']), [x['d'] for x in out['days']])
