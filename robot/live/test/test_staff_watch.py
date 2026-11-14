"""Тест еженедельной проверки штата (29.10.2026): уволен → куда передан функционал; новый → какой функционал; новый в MAX;
нет активности; запреты; один вопрос на изменение; проверка раз в неделю."""
import datetime, json, os, sys, tempfile, time
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, HERE)
import staff_watch as SW
ok = 0
def check(c, m):
    global ok; assert c, m; ok += 1; print('  ✓', m)
ko = {'zones': [{'n': 2, 't': 'Ключевые клиенты'}, {'n': 10, 't': 'Сеть офисов'}],
      'people': [{'name': 'Сотрудник23 Имя8 Отчество5', 'group': 'ОП Рязань', 'zones': [2], 'duties': ['ОнЛайн Имя4']},
                 {'name': 'Сотрудник18 Сотрудник47 Отчество24', 'group': 'Сеть офисов продаж', 'zones': [], 'duties': ['ОП Самара'], 'aliases': ['Сотрудник82 Сотрудник47 Отчество24']},
                 {'name': 'Сотрудник15 Имя5 Отчество22', 'group': 'Сеть офисов продаж', 'zones': []},
                 {'name': 'Сотрудник48 Имя16 Отчество5', 'group': 'Сеть офисов продаж', 'zones': []}]}
now = datetime.datetime(2026, 11, 2, 9, 30, tzinfo=SW.MSK)
# 1) первая проверка — только снимок
ch, q, snap = SW.check(ko, None, {'1': 'Сотрудник47 Сотрудник18', '2': 'Имя5'}, {}, now)
check(ch == [] and len(snap['names']) == 4, 'первая проверка — снимок без изменений')
# 2) уволена Сотрудник23, принят Новиков, в MAX новый человек
ko2 = json.loads(json.dumps(ko)); ko2['people'][0]['status'] = 'уволен'; ko2['people'].append({'name': 'Новиков Пётр Отчество48', 'role': 'Менеджер', 'group': 'ОП Рязань'})
last = {'Сотрудник48 Имя16 Отчество5': now.timestamp() - 60 * 86400, 'Сотрудник18 Сотрудник47 Отчество24': now.timestamp() - 2 * 86400}
ch, q, snap2 = SW.check(ko2, snap, {'1': 'Сотрудник47 Сотрудник18', '2': 'Имя5', '3': 'Игорь Смирнов', '4': 'Имя27 Имя1'}, last, now)
kinds = sorted((c['kind'], c['name']) for c in ch)
check(('gone', 'Сотрудник23 Имя8 Отчество5') in kinds, 'уволенная — «куда передан функционал»')
g = [c for c in ch if c['kind'] == 'gone'][0]
check('2. Ключевые клиенты' in g['what'] and 'ОнЛайн Имя4' in g['what'], 'в вопросе — её зоны и обязанности')
check(('new', 'Новиков Пётр Отчество48') in kinds, 'новый в списке — «какой функционал»')
check(('new', 'Игорь Смирнов') in kinds and not any('Имя27' in n for _, n in kinds), 'новый участник MAX — вопрос; Имя27 (не работает) — нет')
check([x['name'] for x in q] == ['Сотрудник48 Имя16 Отчество5'], 'нет активности 45+ дней — Сотрудник48; Сотрудник18 писала — нет')
check(SW._match('Сотрудник47 Сотрудник82', ko['people'])['name'].startswith('Сотрудник18') and SW._match('Имя5', ko['people'])['name'].startswith('Сотрудник15'), 'имена из MAX сопоставляются (ё, только имя)')
# 3) run: письма руководителям, один раз, раз в неделю, запреты
L = tempfile.mkdtemp(); M = os.path.join(os.path.dirname(L), '.fabrika_max')
SW.HERE = tempfile.mkdtemp(); json.dump(ko2, open(os.path.join(SW.HERE, 'ko_staff.json'), 'w'), ensure_ascii=False)
json.dump({'ban': [{'surname': 'Сотрудник6', 'until': '2026-11-30'}]}, open(os.path.join(SW.HERE, 'mx_poll_cfg.json'), 'w'), ensure_ascii=False)
store = {'staff_watch.json': {'snap': snap, 'week': '2026-W44'}}; pub = {}; sent = []
class FakeDT(datetime.datetime):
    @classmethod
    def now(cls, tz=None): return now
SW.datetime.datetime = FakeDT
r = SW.run(L, lambda *a: None, lambda n, d: store.get(n, d), lambda n, v: store.__setitem__(n, v), lambda n, o: pub.__setitem__(n, o), lambda *a, **k: sent.append(a) or 'ok (очередь)')
to = sorted(a[2][0] for a in sent)
check(r['changes'] == 2 and to == ['user16@example.org', 'user16@example.org'], 'письма — Сотрудник24 (ОП Рязань): уволенная и новый')
check(any('куда передан функционал' in a[0] for a in sent) and any('функционал нового' in a[0] for a in sent) and all(a[6] == 'user5@example.org' for a in sent), 'темы писем, ответ — на itm@')
check('staff.bin' in pub and len(pub['staff.bin']['changes']) == 2, 'итог — st/staff.bin для портала')
n0 = len(sent); r2 = SW.run(L, lambda *a: None, lambda n, d: store.get(n, d), lambda n, v: store.__setitem__(n, v), lambda n, o: pub.__setitem__(n, o), lambda *a, **k: sent.append(a) or 'ok')
check(len(sent) == n0 and r2.get('next'), 'в ту же неделю повторно не проверяет и не пишет')
check(SW._banned({'ban': [{'surname': 'Сотрудник6', 'until': '2026-11-30'}]}, 'user9@example.org', 'Сотрудник6 М. И.'), 'запрет — Сотрудник6 не писать')
print('ALL OK', ok)
