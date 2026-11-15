"""«Фабрика»: доступ к порталу по группам (15.11.2026; tasks/access_launch.md).
   Страницы групп шифруются ключом набора групп (a «set»: «sales», «prod+sales», …) вместо ключа сайта.
   Ключ набора = HMAC-SHA256(gsec, «set:<набор>:<эпоха>»); gsec живёт только в enc_secret.json (наружу не уходит).
   Человек получает в k/<id>.bin ключ сайта и ключи всех наборов, где есть хоть одна его группа (с учётом implies).
   Уволенного блокируют: эпоха наборов его групп растёт → новые ключи → остальным они приходят в k/*.bin при следующей выкладке.
   Группы человека: keyring (поле g у пользователя, когда его заведёт «Управление») или access_people.json (id → группы) рядом."""
import os, json, hmac, hashlib, secrets, pathlib

MAP = os.environ.get('T14_ACCESS_MAP') or '/home/claude/build/access_map.json'
PEOPLE = os.environ.get('T14_ACCESS_PEOPLE') or '/home/claude/app_build/access_people.json'


def load_map():
    return json.loads(pathlib.Path(MAP).read_text(encoding='utf-8'))


def is_on(amap=None):
    if os.environ.get('T14_ACCESS') in ('0', '1'): return os.environ['T14_ACCESS'] == '1'
    return bool((amap or load_map()).get('on'))


def set_id(groups): return '+'.join(sorted(set(groups)))


def set_of(rel, amap):
    """набор групп для пути сайта или None (общий раздел — ключ сайта)"""
    g = amap.get('pages', {}).get(rel)
    if g: return set_id(g)
    for pre, g in amap.get('prefixes', {}).items():
        if rel.startswith(pre): return set_id(g)
    return None


def expand(groups, amap):
    out, todo = set(), list(groups or [])
    while todo:
        g = todo.pop()
        if g in out: continue
        out.add(g); todo.extend(amap.get('implies', {}).get(g, []))
    return out


def ensure_secret(S):
    """gsec и эпохи наборов в enc_secret.json; True — если S поменялся (вызывающий сохраняет)"""
    ch = False
    if not S.get('gsec_hex'): S['gsec_hex'] = secrets.token_hex(32); ch = True
    if not isinstance(S.get('gepoch'), dict): S['gepoch'] = {}; ch = True
    return ch


def set_key(S, sid):
    ep = int(S.get('gepoch', {}).get(sid, 0))
    return hmac.new(bytes.fromhex(S['gsec_hex']), ('set:%s:%d' % (sid, ep)).encode(), hashlib.sha256).digest()


def people_groups(kr):
    """id → группы: поле g из keyring, иначе access_people.json"""
    local = {}
    if os.path.exists(PEOPLE):
        try: local = json.loads(pathlib.Path(PEOPLE).read_text(encoding='utf-8'))
        except Exception as e: print('access_people.json:', e)
    out = {}
    for u in (kr or {}).get('users', []):
        g = u.get('g') if isinstance(u.get('g'), list) else local.get(u.get('id'))
        if isinstance(g, list): out[u['id']] = [x for x in g if isinstance(x, str)]
    return out


def person_sets(groups, all_sets, amap):
    mine = expand(groups, amap)
    return sorted(s for s in all_sets if mine & set(s.split('+')))


def payload(M, groups, all_sets, S, amap):
    """содержимое k/<id>.bin: 32 байта ключа сайта, дальше JSON {набор: ключ hex} (старый формат — только 32 байта)"""
    if not groups: return M
    sets = {s: set_key(S, s).hex() for s in person_sets(groups, all_sets, amap)}
    return M + json.dumps(sets, separators=(',', ':')).encode() if sets else M


def block(S, groups_of_person, amap):
    """блокировка уволенного: новые эпохи всех наборов, которые он открывал"""
    mine = expand(groups_of_person, amap)
    for sid in {set_id(g) for g in list(amap.get('pages', {}).values()) + list(amap.get('prefixes', {}).values())}:
        if mine & set(sid.split('+')): S.setdefault('gepoch', {})[sid] = int(S['gepoch'].get(sid, 0)) + 1
