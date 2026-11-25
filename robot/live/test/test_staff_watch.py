"""Тест еженедельной проверки штата (29.10.2026): уволен → куда передан функционал; новый → какой функционал; новый в MAX;
нет активности; запреты; один вопрос на изменение; проверка раз в неделю."""
import datetime, json, os, sys, tempfile


def _rd(*a, **k):   # CodeQL py/file-not-closed: файл закрывается сразу (15.11.2026)
    with open(*a, **k) as _f:
        return _f.read()


def _wr(_d, *a, **k):
    with open(*a, **k) as _f:
        return _f.write(_d)


HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, HERE)
import staff_watch as SW
ok = 0
def check(c, m):
    global ok; assert c, m; ok += 1; print('  ✓', m)
ko = {'zones': [{'n': 2, 't': 'Ключевые клиенты'}, {'n': 10, 't': 'Сеть офисов'}],
      'people': [{'name': 'Сотрудник25 Сотрудник52 Отчество6', 'group': 'ОП Рязань', 'zones': [2], 'duties': ['ОнЛайн Имя6']},
                 {'name': 'Сотрудник21 Сотрудник62 Отчество25', 'group': 'Сеть офисов продаж', 'zones': [], 'duties': ['ОП Самара'], 'aliases': ['Сотрудник93 Сотрудник62 Отчество25']},
                 {'name': 'Сотрудник18 Сотрудник51 Отчество23', 'group': 'Сеть офисов продаж', 'zones': []},
                 {'name': 'Сотрудник36 Сотрудник60 Отчество6', 'group': 'Сеть офисов продаж', 'zones': []}]}
now = datetime.datetime(2026, 11, 2, 9, 30, tzinfo=SW.MSK)
# 1) первая проверка — только снимок
ch, q, snap = SW.check(ko, None, {'1': 'Сотрудник62 Сотрудник21', '2': 'Сотрудник51'}, {}, now)
check(ch == [] and len(snap['names']) == 4, 'первая проверка — снимок без изменений')
# 2) уволена Сотрудник25, принят Новиков, в MAX новый человек
ko2 = json.loads(json.dumps(ko)); ko2['people'][0]['status'] = 'уволен'; ko2['people'].append({'name': 'Новиков Пётр Отчество49', 'role': 'Менеджер', 'group': 'ОП Рязань'})
last = {'Сотрудник36 Сотрудник60 Отчество6': now.timestamp() - 60 * 86400, 'Сотрудник21 Сотрудник62 Отчество25': now.timestamp() - 2 * 86400}
ch, q, snap2 = SW.check(ko2, snap, {'1': 'Сотрудник62 Сотрудник21', '2': 'Сотрудник51', '3': 'Игорь Смирнов', '4': 'Имя7 Сотрудник5'}, last, now)
kinds = sorted((c['kind'], c['name']) for c in ch)
check(('gone', 'Сотрудник25 Сотрудник52 Отчество6') in kinds, 'уволенная — «куда передан функционал»')
g = [c for c in ch if c['kind'] == 'gone'][0]
check('2. Ключевые клиенты' in g['what'] and 'ОнЛайн Имя6' in g['what'], 'в вопросе — её зоны и обязанности')
check(('new', 'Новиков Пётр Отчество49') in kinds, 'новый в списке — «какой функционал»')
check(('new', 'Игорь Смирнов') in kinds and not any('Имя7' in n for _, n in kinds), 'новый участник MAX — вопрос; Имя7 (не работает) — нет')
check([x['name'] for x in q] == ['Сотрудник36 Сотрудник60 Отчество6'], 'нет активности 45+ дней — Сотрудник36; Сотрудник21 писала — нет')
check(SW._match('Сотрудник62 Сотрудник93', ko['people'])['name'].startswith('Сотрудник21') and SW._match('Сотрудник51', ko['people'])['name'].startswith('Сотрудник18'), 'имена из MAX сопоставляются (ё, только имя)')
# 3) run: письма руководителям, один раз, раз в неделю, запреты
L = tempfile.mkdtemp(); M = os.path.join(os.path.dirname(L), '.fabrika_max')
SW.HERE = tempfile.mkdtemp(); _wr(json.dumps(ko2, ensure_ascii=False), os.path.join(SW.HERE, 'ko_staff.json'), 'w')
_wr(json.dumps({'ban': [{'surname': 'Сотрудник8', 'until': '2026-11-30'}]}, ensure_ascii=False), os.path.join(SW.HERE, 'mx_poll_cfg.json'), 'w')
store = {'staff_watch.json': {'snap': snap, 'week': '2026-W44'}}; pub = {}; sent = []
class FakeDT(datetime.datetime):
    @classmethod
    def now(cls, tz=None): return now
SW.datetime.datetime = FakeDT
r = SW.run(L, lambda *a: None, lambda n, d: store.get(n, d), lambda n, v: store.__setitem__(n, v), lambda n, o: pub.__setitem__(n, o), lambda *a, **k: sent.append(a) or 'ok (очередь)')
to = sorted(a[2][0] for a in sent)
check(r['changes'] == 2 and to == ['user17@example.org', 'user17@example.org'], 'письма — Сотрудник26 (ОП Рязань): уволенная и новый')
check(any('куда передан функционал' in a[0] for a in sent) and any('функционал нового' in a[0] for a in sent) and all(a[6] == 'user5@example.org' for a in sent), 'темы писем, ответ — на itm@')
check('staff.bin' in pub and len(pub['staff.bin']['changes']) == 2, 'итог — st/staff.bin для портала')
n0 = len(sent); r2 = SW.run(L, lambda *a: None, lambda n, d: store.get(n, d), lambda n, v: store.__setitem__(n, v), lambda n, o: pub.__setitem__(n, o), lambda *a, **k: sent.append(a) or 'ok')
check(len(sent) == n0 and r2.get('next'), 'в ту же неделю повторно не проверяет и не пишет')
check(SW._banned({'ban': [{'surname': 'Сотрудник8', 'until': '2026-11-30'}]}, 'user10@example.org', 'Сотрудник8 М. И.'), 'запрет — Сотрудник8 не писать')
print('ALL OK', ok)
