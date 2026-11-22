#!/usr/bin/env python3
"""22.11.2026, Т. В.: «цвета не меняются» — фото исполнения по цвету обивки: перекраска утверждённой заглавной (sun/moon) через OpenAI.
Только перекраска обивки, всё остальное — без изменений. Кадры → review/<код>/col/<слаг>_l.png и _d.png — на сайт после ✅ Т. В.
  python3 fsu_recolor.py код:Материал:цвет[,код:Материал:цвет…]"""
import sys, os, re, time, base64, concurrent.futures as CF
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fsu_ai_batch as B
H = os.path.dirname(os.path.abspath(__file__))
KIND = {'ECO': 'гладкая экокожа', 'DO': 'гладкая экокожа', 'PV': 'гладкая экокожа', 'Nappa': 'мягкая экокожа', 'Hugo': 'мебельная ткань рогожка', 'Alliance': 'мебельная ткань',
        'Крафт': 'мебельная ткань', 'SC': 'экокожа', 'Teddy': 'плюшевая ткань'}


def slug(m, c):
    return re.sub(r'[^0-9a-zа-я]+', '-', (m + '-' + c).lower()).strip('-')


def one(job):
    code, mat, col, side = job
    src = os.path.join(H, 'ai', code, 'sun.png' if side == 'l' else 'moon.png')
    dst = os.path.join(H, 'review', code, 'col', slug(mat, col) + '_' + side + '.png')
    if os.path.exists(dst): return 'есть'
    name = re.sub(r'^[№\d\-\sA-Za-zН]+\(?', '', col).strip(' ()') or col
    pr = ('Это фото реального предмета мебели. Перекрась ТОЛЬКО обивку (сиденье, спинку, мягкие части) в цвет «%s» — материал %s (%s), цвет натуральный, как у образца ткани, '
          'фактура материала сохраняется. Всё остальное оставь пиксель в пиксель: форму, пропорции, каркас, опоры, подлокотники, строчку, ракурс, свет, тени и фон. '
          'Ничего не добавляй и не убирай. Без текста и логотипов.') % (name, mat, KIND.get(mat, 'обивочный материал'))
    for att in range(2):
        r = B.G.call('gptask', {'img': {'prompt': pr, 'images': [B.du(src)], 'size': '1024x1024', 'quality': 'high'}})
        if not r.get('ok'): time.sleep(15); continue
        for i in range(130):
            time.sleep(8); g = B.G.call('gptget', {'id': r['id']})
            if g.get('status') in ('completed', 'failed', 'cancelled', 'incomplete'): break
        if 'credits' in str(g.get('err') or '') or 'billing' in str(g.get('err') or ''): return 'нет денег'
        if g.get('images'):
            os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst, 'wb').write(base64.b64decode(g['images'][0])); return 'готово'
    return 'сбой'


if __name__ == '__main__':
    jobs = []
    for t in sys.argv[1].split(','):
        c, m, col = t.split(':', 2)
        jobs += [(c, m, col, 'l'), (c, m, col, 'd')]
    with CF.ThreadPoolExecutor(4) as ex:
        for j, r in zip(jobs, ex.map(one, jobs)): print(j, r, flush=True)
