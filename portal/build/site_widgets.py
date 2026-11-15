"""Render plan metrics and clean transport report captions for the static portal."""
from html import escape, unescape
import json
import re


def build_minimap(fragment):
    plan = json.JSONDecoder().raw_decode(fragment.split('const DATA=', 1)[1])[0]
    names = {key: obj['name'] for key, obj in (plan.get('b') or {}).items() if obj.get('name')}
    for match in re.finditer(r'<text[^>]*data-[a-z]+="(b[\w]+)"[^>]*>([^<]{2,80})</text>', fragment):
        names.setdefault(match.group(1), unescape(re.sub(r'\s+', ' ', match.group(2)).strip()))
    def rounded(d): return re.sub(r'-?\d+\.\d+', lambda m: ('%.1f' % float(m.group(0))).rstrip('0').rstrip('.'), d)
    buildings = re.findall(r'<path class="bld[^"]*" data-b="(\w+)" d="([^"]+)"', fragment)
    # 02.11.2026, Т. В.: «карта бесцветная» — здания на главной в цвете по назначению (производство, склады, офис и быт, инженерные, стройка)
    classes = {b: c for c, b in re.findall(r'<path class="(bld[^"]*)" data-b="(\w+)"', fragment)}
    def kind_for(b, c):
        nm = names.get(b, '').lower()
        if re.search(r'bld-(new|stage2|proj|plan|gp)', c): return 'new'
        if re.search(r'склад', nm) or b in ('nSklad', 'b45', 'b37n'): return 'wh'
        if re.search(r'bld-(tp|dg|chim)', c) or re.match(r'(tp|tr|kot|knTP|dg)', b) or nm == 'тп': return 'eng'
        if re.search(r'кпп|админ|раздевал|гараж|переход', nm) or re.match(r'(byt|mKpp|nKpp|chapel)', b): return 'adm'
        if re.search(r'цех|гальван|покраск|мебел|металл|стан|поролон|промзон', nm) or b == 'bProd': return 'prod'
        return 'oth'
    yard = re.search(r'<path class="yard" d="([^"]+)"', fragment)
    cameras = plan.get('cams') or []
    def building_link(key, path):
        name = escape(names.get(key) or 'Объект ' + key, quote=True)
        kind = kind_for(key, classes.get(key, ''))
        return '<a href="plan.html#%s" aria-label="%s"><title>%s</title><path class="mb k-%s" d="%s"/></a>' % (key, name, name, kind, rounded(path))
    svg = ('<svg viewBox="6 8 430 272" role="group" aria-label="Схема территории: здания">' + ('<path class="mp" d="%s"/>' % rounded(yard.group(1)) if yard else '') +
            ''.join(building_link(b, d) for b, d in buildings) + '</svg>')
    svg += ('<p class="fm-lg">' + ''.join('<span><i class="k-%s"></i>%s</span>' % kv for kv in (('prod', 'производство'), ('wh', 'склады'), ('adm', 'офис и быт'), ('eng', 'инженерные'), ('new', 'стройка и проект'))) + '</p>')
    return svg, {'b': len(set(b for b, _ in buildings)), 'c': len(cameras)}


def repair_note(note):
    """Remove a private recipient and its preposition as one phrase."""
    note = re.sub(r'\s+на\s+[\w.+-]+@[\w.-]*[\w-]', '', note, flags=re.I)
    return re.sub(r'\s+на\s*(?=[;,.]|$)', '', note, flags=re.I)
