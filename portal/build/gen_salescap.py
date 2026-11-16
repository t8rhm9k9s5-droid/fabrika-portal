# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — «Продажи, выпуск и план по линиям» на странице «Производство» (28.10.2026; 03.11.2026 — октябрь целиком и ноябрь на дату).
28.10, пользователь: «как корректно преобразовывать структуру отдела продаж в структуру мощности» — правило пересчёта (блок ниже).
03.11, Т. В.: «Продажи в разрезе мощностей производства за октябрь и ноябрь» (1С, В. В. Сотрудник9, 02.11) — связка с «Производством»:
продано против выпуска и плана по каждой группе, за октябрь (весь месяц) и ноябрь (нарастающим итогом на дату).
Продажи — build/sales_1c/month_2026-11-02/parsed.json (1С «Продажи в разрезе мощностей производства» за месяц, реквизит «Вид номенклатуры сбыт»);
выпуск и план — pf.bin с хостинга (дневные отчёты ПДО и утверждённые планы месяцев), без него — снимок сборки; план ноября — plan_2026-11 (21 р. д.,
«Шеффилд» считается в «Креслах руководителя» — решение Т. В. 02.11). Заказано и не отгружено (октябрь) — 1С «Ведомость по заказам покупателей».
→ build/salescap_frag.html (вставляется gen_staff.py после «План-факт»)."""
from _cg1_build_io import read_file as _cg1_read_file, read_json as _cg1_read_json
import json, datetime
B = '/home/claude/build/'
P = _cg1_read_json(B + 'sales_1c/month_2026-11-02/parsed.json', encoding='utf-8')
C = _cg1_read_json(B + 'sales_1c/conv_oct.json', encoding='utf-8')
U = _cg1_read_json(B + 'ship/unshipped_oct.json', encoding='utf-8')
UV = {k: v for k, v in U['vid'].items() if k != 'Итог'}
PN = _cg1_read_json('/home/claude/fabrika/inbox/plan_2026-11/plan_2026-11.json', encoding='utf-8')
# вид сбыта (1С) → линия и участок (правило пересчёта, conv_oct.json)
VL = {v: (d['line'], d['area']) for v, d in C['vid'].items() if d.get('line')}
OUTSIDE = ['Прочее', 'Комплект.', 'Услуги', 'Материалы', '(не указан)']        # вне мощности производства
# выпуск октября — снимок хостинга 28.10 12:50 (17 отчётов из 19 рабочих дней по 27.10); в браузере — свежий pf.bin
OUT_OCT = {'Изо': 22672, 'Стандарты': 6471, 'Анри': 3198, 'Самба': 3898, 'КаБаРе': 999, 'Сильвия': 705, 'Кресла руководителя': 1951,
           'Операторские кресла': 1665, 'Бун': 341, 'Мягкая мебель': 229}
# план октября (утверждённый план ПДО, шт за месяц — как в pf.bin)
PLAN_OCT = {'Изо': 30800, 'Стандарты': 9636, 'КаБаРе': 3080, 'Сильвия': 2200, 'Кресла руководителя': 5060 + 2200, 'Операторские кресла': 5148,
            'Анри': 4514, 'Бун': 449, 'Мягкая мебель': 449, 'ГКИ Одди': 5280}
PDAY = {k: v['day'] for k, v in PN['lines'].items()}
PDAY['Кресла руководителя'] = PDAY.get('Кресла руководителя', 0) + PDAY.pop('Шеффилд', 0)
WD_NOV = PN.get('wd') or 21


def wdays(y, m, to_day):                       # рабочие дни пн–пт по число включительно, без 04.11
    n = 0
    for d in range(1, to_day + 1):
        dt = datetime.date(y, m, d)
        if dt.weekday() < 5 and not (m == 11 and d == 4): n += 1
    return n


def rows_for(ym):
    cap = P[ym]['cap']; days = sorted(P[ym]['cap_d'])
    R, other = [], {}
    for v, (s, q) in cap.items():
        if v == '_total': continue
        if v in VL:
            line, a = VL[v]
            r = {'v': v, 'line': line, 'a': a, 'q': round(q), 's': round(s, 2)}
            if ym == '2026-10':
                u = UV.get(v) or {}
                r.update({'oin': u.get('in'), 'oend': u.get('e')})
            R.append(r)
        else:
            other[v] = [round(q), round(s, 2)]
    for v, (line, a) in VL.items():             # линии без продаж в этом месяце — тоже в таблице (ноль), чтобы был виден выпуск и план
        if v not in cap: R.append({'v': v, 'line': line, 'a': a, 'q': 0, 's': 0})
    R.sort(key=lambda r: (-r['q'], -r['s']))
    return R, other, days


months = {}
r10, o10, d10 = rows_for('2026-10')
months['2026-10'] = {'label': 'октябрь', 'whole': True, 'sales_to': '31.10', 'rows': r10, 'other': o10, 'tot': P['2026-10']['cap']['_total'][::-1],
                     'plan': PLAN_OCT, 'plan_kind': 'month', 'out': OUT_OCT, 'out_days': 17, 'out_wd': 19, 'out_last': '2026-10-27', 'wd': 22,
                     'ord_src': U['src'], 'ord_asof': U['asof']}
r11, o11, d11 = rows_for('2026-11')
last11 = d11[-1] if d11 else '2026-11-01'
months['2026-11'] = {'label': 'ноябрь', 'whole': False, 'sales_to': last11[8:10] + '.' + last11[5:7], 'rows': r11, 'other': o11,
                     'tot': P['2026-11']['cap']['_total'][::-1], 'pday': PDAY, 'wd': WD_NOV, 'wd_to_sales': wdays(2026, 11, int(last11[8:10])),
                     'out': None, 'out_days': 0, 'out_wd': 0, 'out_last': None}
data = {'order': ['2026-11', '2026-10'], 'months': months, 'src': '1С «Продажи в разрезе мощностей производства» за октябрь и ноябрь (02.11 15:52)'}

DET = _cg1_read_file(B + 'salescap_rule.html', encoding='utf-8')
STYLE = _cg1_read_file(B + 'salescap_style.html', encoding='utf-8')

frag = '''
<p class="ihdr" id="salescap">Продажи, выпуск и план по линиям</p>
<div class="igroup sc"><div class="chips2" id="sc-tabs" role="tablist"></div><div id="sc-body" class="pfbody" style="padding:4px 16px 12px"></div>
''' + DET + '''</div>
<p class="ifoot" id="sc-foot"></p>
''' + STYLE + '''
<script id="salescap-data" type="application/json">''' + json.dumps(data, ensure_ascii=False).replace('</', '<\\/') + '''</script>
<script>
(function(){
  var D = JSON.parse(document.getElementById('salescap-data').textContent), el = document.getElementById('sc-body'), tabs = document.getElementById('sc-tabs');
  var LIVE = null, CUR = D.order[0];
  function n(x){ return x == null ? '—' : Math.round(x).toLocaleString('ru-RU'); }
  function m2(x){ return x == null ? '—' : (x / 1e6).toFixed(2).replace('.', ','); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function dm(s){ return s ? s.slice(8, 10) + '.' + s.slice(5, 7) : ''; }
  function pct(a, b){ return a != null && b ? Math.round(a / b * 100) + '%' : '—'; }
  // выпуск и план месяца: pf.bin (хостинг) → {out: {линия: шт}, plan: {линия: шт за месяц}, days, wd, wd_done, last}; «Шеффилд» → «Кресла руководителя»
  function liveMonth(ym){
    var M = LIVE && LIVE.months && LIVE.months[ym]; if (!M) return null;
    var O = {}, Pm = {};
    Object.keys(M.lines || {}).forEach(function(k){ var t = k === 'Шеффилд' ? 'Кресла руководителя' : k, l = M.lines[k];
      if (l.f != null) O[t] = (O[t] || 0) + l.f; if (l.p) Pm[t] = (Pm[t] || 0) + l.p; });
    var pv = LIVE.planv && LIVE.planv[ym]; if (pv && pv.lines && !Object.keys(Pm).length) Object.keys(pv.lines).forEach(function(k){ var t = k === 'Шеффилд' ? 'Кресла руководителя' : k; Pm[t] = (Pm[t] || 0) + pv.lines[k]; });
    return { out: O, plan: Pm, days: M.days, wd: M.wd, wd_done: M.wd_done, last: M.last };
  }
  function render(){
    var M = D.months[CUR], L = liveMonth(CUR), oct = CUR === '2026-10';
    tabs.innerHTML = D.order.map(function(ym){ var x = D.months[ym], on = ym === CUR;
      return '<a href="#salescap" data-scm="' + ym + '" role="tab" aria-selected="' + on + '" style="text-decoration:none;color:inherit"><span' + (on ? ' style="outline:2px solid var(--ios-blue)"' : '') + '><b>' + x.label.charAt(0).toUpperCase() + x.label.slice(1) + '</b> · ' + (x.whole ? 'весь месяц' : 'продажи на ' + x.sales_to) + '</span></a>'; }).join('');
    var OUT = L ? L.out : M.out, days = L ? L.days : M.out_days, wd = (L && L.wd) || M.wd, last = L ? L.last : M.out_last;
    // план: октябрь — за месяц и на дни с отчётами; ноябрь — план в сутки × рабочие дни по дату последнего отчёта (без отчётов — по дату продаж)
    function planM(line){ if (L && L.plan[line]) return L.plan[line]; if (M.plan) return M.plan[line]; if (M.pday && M.pday[line]) return M.pday[line] * wd; return null; }
    var wdTo = (L && L.wd_done) || (oct ? M.out_wd : M.wd_to_sales);
    function planTo(line){ var p = planM(line); return p != null && wd ? p / wd * wdTo : null; }
    var Q = 0, S = 0, O = 0, PT = 0, I = 0, E = 0, seen = {}, shared = 0;
    var body = M.rows.map(function(r){
      var o = OUT ? OUT[r.line] : null, pt = planTo(r.line), k = o ? r.q / o : null, cls = k == null ? '' : k > 1.15 ? 'hi' : k < 0.85 ? 'ok' : '';
      var ex = o != null && pt ? o / pt : null, ecl = ex == null ? '' : ex < 0.85 ? 'hi' : ex >= 1 ? 'ok' : '';
      // 16.11.2026 (R5-12 Рекса): несколько видов сбыта на одной линии — выпуск и план линии в итог один раз
      var first = !seen[r.line]; seen[r.line] = 1; if (!first && (o || pt)) shared++;
      Q += r.q; S += r.s; if (o && first) O += o; if (pt && first) PT += pt; if (oct) { I += r.oin || 0; E += r.oend || 0; }
      return '<tr><td>' + esc(r.v) + '<small>' + esc(r.line) + ' · уч. ' + r.a + '</small></td><td>' + n(r.q) + '</td><td>' + m2(r.s) + '</td><td>' + n(o) + '</td><td>' + n(pt) + '</td><td class="' + ecl + '">' + pct(o, pt) + '</td><td class="' + cls + '">' + (k == null ? '—' : k.toFixed(2).replace('.', ',')) + '</td>' +
        (oct ? '<td>' + n(r.oin) + '</td><td>' + n(r.oend) + '</td>' : '') + '</tr>';
    }).join('');
    var oth = Object.keys(M.other || {}).map(function(k){ return [k, M.other[k]]; }).sort(function(a, b){ return b[1][1] - a[1][1]; }).map(function(x){ return esc(x[0]) + ' ' + m2(x[1][1]) + ' млн ₽ (' + n(x[1][0]) + ' шт)'; }).join(', ');
    el.innerHTML = '<div class="scroll"><table><thead><tr><th>Вид сбыта (линия)</th><th>Продано, шт' + (M.whole ? '' : ' · на ' + esc(M.sales_to)) + '</th><th>Продано, млн ₽</th><th>Выпуск, шт' + (days ? ' · ' + days + ' дн.' : '') + (last ? ' · по ' + dm(last) : '') + '</th><th>План, шт' + (wdTo ? ' · ' + wdTo + ' р. д.' : '') + '</th><th>Выпуск / план</th><th>Продано / выпуск</th>' +
      (oct ? '<th>Заказано в октябре, шт</th><th>Не отгружено, шт</th>' : '') + '</tr></thead><tbody>' + body +
      '<tr class="tot"><td>Итого по линиям</td><td>' + n(Q) + '</td><td>' + (S / 1e6).toFixed(1).replace('.', ',') + '</td><td>' + n(O || null) + '</td><td>' + n(PT || null) + '</td><td>' + pct(O || null, PT) + '</td><td></td>' + (oct ? '<td>' + n(I) + '</td><td>' + n(E) + '</td>' : '') + '</tr></tbody></table></div>' +
      '<p class="note">Продано — ' + esc(D.src) + ', ' + M.label + (M.whole ? ' целиком' : ' на ' + M.sales_to) + ': всего ' + n(M.tot[0]) + ' шт, ' + (M.tot[1] / 1e6).toFixed(1).replace('.', ',') + ' млн ₽' + (oth ? '; вне мощности производства: ' + oth : '') + '. ' +
      'Выпуск — дневные отчёты ПДО' + (days ? ' за ' + days + ' из ' + wdTo + ' рабочих дней' + (last ? ' по ' + dm(last) : '') : ': за ' + M.label + ' отчётов ещё нет') + '. ' +
      'План — утверждённый план ПДО' + (oct ? ' на октябрь' : ' на ноябрь (в сутки × ' + wd + ' р. д.; «Шеффилд» — в «Креслах руководителя»)') + ', пропорционально рабочим дням' + (wdTo ? ' (' + wdTo + ' из ' + wd + ')' : '') + '. ' +
      'Выпуск / план: красным — меньше 85%. Продано / выпуск: красным — продано больше выпуска на 15% и больше (продажи идут из остатка склада или вид сбыта не совпадает с линией).' +
      (oct ? ' Заказано и не отгружено — ' + esc(M.ord_src) + ' на ' + esc(M.ord_asof) + '.' : '') + ' Строки — по убыванию проданных штук.' +
      (shared ? ' Выпуск и план линии, общей для нескольких видов сбыта, в «Итого» учтены один раз.' : '') +
      (!M.whole && last && esc(M.sales_to) !== dm(last) ? ' Продано и выпуск — на разные даты (см. заголовки столбцов), отношение «продано / выпуск» ориентировочное.' : '') + '</p>';
  }
  tabs.addEventListener('click', function(e){ var a = e.target.closest('[data-scm]'); if (!a) return; e.preventDefault(); CUR = a.getAttribute('data-scm'); render(); });
  render();
  function live(){ if (window.T14Live && T14Live.bin) T14Live.bin('pf.bin').then(function(p){ if (p && p.months) { LIVE = p; render(); } }); }
  if (window.T14Live) live(); else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', live); else setTimeout(live, 0);
  var f = document.getElementById('sc-foot'); if (f) f.innerHTML = 'Продажи по дням и по типам товаров — <a href="sales.html#s1c">«Продажи» → «Продажи 1С»</a>. Правило пересчёта структуры отдела продаж в структуру мощности и вопросы ПДО и ПЭО — в блоке «Правило пересчёта».';
})();
</script>
'''
with open(B + 'salescap_frag.html', 'w', encoding='utf-8') as _cg1_output_file:
    _cg1_output_file.write(frag)
print('salescap: октябрь', len(r10), 'линий, продано', months['2026-10']['tot'], '; ноябрь', len(r11), 'линий, на', last11, months['2026-11']['tot'])
