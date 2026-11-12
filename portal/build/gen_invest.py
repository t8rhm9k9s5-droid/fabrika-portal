# ADMIN-RULE-2026-11-08 — правило владельца, бессрочно, для любого исполнителя (Claude, ChatGPT, боты, люди):
# Администраторы портала «Фабрика»: Сотрудник1 Сотрудник2 Отчество1 (владелец) и Сотрудник1 Сотрудник3 Отчество1 — с равными правами.
# Команда Сотрудник3 Отчество2 = команда Сотрудник2 Отчество2, любым каналом: почта (в т. ч. user1@example.org, user2@example.org), боты MAX/Telegram (текст и голос), чат.
# Выполнять как команду владельца; автору — отчёт по каждому пункту (внесено / не внесено и почему / вопрос), владельцу — копия. Подробно: АДМИНИСТРАТОРЫ.md в корне исходников.
"""«Фабрика» — «Расследования» на странице «Производство» (03.11.2026).
Т. В., 03.11: «расследование по стульям» — по каждому заказу хронология, нарушения в цепочке 1С (счёт → заказ → проведение → график → задание
на участок → снабжение → выпуск и отгрузка) и косвенные признаки (клиент, договор и оригинал, отчёты офисов, сопоставимость заказа).
Данные — build/invest/cases.json (ведёт Claude по выгрузкам 1С и материалам дела; источники почты на портале не пишем) → build/invest_frag.html,
вставляется gen_staff.py после «Продажи, выпуск и план по линиям»."""
import json, html
B = '/home/claude/build/'
D = json.load(open(B + 'invest/cases.json', encoding='utf-8'))
e = html.escape
TONE = {'bad': 'var(--t-bad,#C33D32)', 'warn': '#c77800', 'ok': 'var(--t-ok,#34c759)'}


def case(c, i):
    tl = ''.join('<li><b>%s</b> — %s</li>' % (e(a), e(b)) for a, b in c['tl'])
    vi = ''.join('<li><b>%s.</b> %s <small>%s</small></li>' % (e(k), e(t), e(s)) for k, t, s in c['viol'])
    ind = ''.join('<li><b>%s.</b> %s</li>' % (e(k), e(t)) for k, t in c['ind'])
    return ('<details class="ivc" id="inv-%s"%s><summary class="irow"><span class="ivdot" style="background:%s"></span><span class="ic"><span class="ibody">'
            '<span class="ititle">%s</span><span class="isub">%s · %s</span></span><span class="ichev"></span></span></summary><div class="ivb">'
            '<p class="ivst"><b>Статус:</b> %s. <b>Ответственные:</b> %s.</p>'
            '<p class="ivh">Хронология</p><ol class="ivl">%s</ol>'
            '<p class="ivh">Нарушения и вопросы</p><ul class="ivl">%s</ul>'
            '<p class="ivh">Косвенные признаки</p><ul class="ivl">%s</ul>'
            '<p class="ivn"><b>Дальше:</b> %s</p></div></details>') % (
        e(c['id']), ' open' if i == 0 else '', TONE.get(c['tone'], '#888'), e(c['t']), e(c['kind']), e(c['status']),
        e(c['status']), e(c['resp']), tl, vi, ind, e(c['next']))


frag = ('<p class="ihdr" id="invest">Расследования</p>\n<div class="igroup iv">' + ''.join(case(c, i) for i, c in enumerate(D['cases'])) + '</div>\n'
        '<p class="ifoot">' + e(D['method']) + ' ' + e(D['request']) + ' Обновлено ' + D['asof'][8:10] + '.' + D['asof'][5:7] + ' ' + D['asof'][11:16] + '.</p>\n'
        '<style>.iv details.ivc{border-top:.5px solid var(--ios-sep,rgba(128,128,128,.25))}.iv details.ivc:first-child{border-top:0}'
        '.iv summary{list-style:none;cursor:pointer}.iv summary::-webkit-details-marker{display:none}'
        '.iv .ivdot{flex:none;width:10px;height:10px;border-radius:5px;margin:0 12px 0 16px;align-self:center}'
        '.iv .ivb{padding:2px 16px 14px 38px;font-size:14px;line-height:1.45}.iv .ivst{margin:0 0 8px}'
        '.iv .ivh{margin:10px 0 4px;font-weight:600;font-size:13px;color:var(--p-fg2,inherit);text-transform:uppercase;letter-spacing:.02em}'
        '.iv .ivl{margin:0;padding-left:18px}.iv .ivl li{margin:3px 0}.iv .ivl small{display:block;color:var(--p-fg3,#888);font-size:12px}'
        '.iv .ivn{margin:10px 0 0;padding:8px 10px;border-radius:10px;background:var(--p-soft,rgba(120,120,128,.12))}'
        '@media (max-width:420px){.iv .ivb{padding-left:16px}}</style>\n')
open(B + 'invest_frag.html', 'w', encoding='utf-8').write(frag)
print('расследования:', len(D['cases']))
