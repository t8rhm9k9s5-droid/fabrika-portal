#!/usr/bin/env python3
"""Чёткие предметные фото для презентаций вместо мелких и мутных (Т. В. 25.11.2026: «сгенери новые из плохого качества… через API GPT»).
  python3 hq_gen.py код[=код-образец для деталей] …   → hq/<код>.png (1024×1024, белый фон). В презентации — подпись «визуализация по фото изделия»."""
import os, sys, json, time, base64
sys.path.insert(0, '/home/claude/fabrika/work/fsu'); sys.path.insert(0, '/home/claude/fabrika/work/prez')
import api_int as A, prez as P
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); TMP = os.path.join(H, 'hq', '_src'); os.makedirs(TMP, exist_ok=True)
def src(code, up=True):
    c = P.card(code); k = next((p['k'] for p in c['ph'] if not p.get('ai')), c['ph'][0]['k']); p = P.img(k, '') or P.img(k, 'm')
    im = Image.open(p).convert('RGB')
    if up and max(im.size) < 700: im = im.resize((im.width * 4, im.height * 4), Image.LANCZOS)
    o = os.path.join(TMP, code + '.png'); im.save(o); return o, c
def gen(code, ref=None):
    out = os.path.join(H, 'hq', code + '.png')
    if os.path.exists(out): return 'есть'
    p, c = src(code); imgs = [A.du(p)]; extra = ''
    if ref:
        rp, rc = src(ref); imgs.append(A.du(rp))
        extra = ('Второе фото — похожее изделие того же завода («%s») в хорошем качестве: возьми с него только фактуру материалов и то, как выглядят ролики, металл и обивка вблизи. '
                 'Форма, состав деталей и цвета — строго с ПЕРВОГО фото. ' % rc['n'])
    prompt = ('Первое фото — заводской снимок изделия «%s» в очень низком качестве (мелкий, размытый, с артефактами сжатия и мусором на фоне). '
              'Сделай чистую студийную предметную фотографию ЭТОГО ЖЕ изделия в высоком разрешении. Строго сохрани: ракурс, форму и пропорции, число лучей опоры, '
              'ролики или глайдеры, кольцо или проножку для ног, рычаги, спинку и подлокотники (если они есть на фото — оставь, если нет — не добавляй), цвет обивки и цвет каркаса. %s'
              'Фон — чисто белый бесшовный, под изделием мягкая контактная тень. Резкая детализация обивки, швов, металла и пластика. '
              'Ничего не добавляй и не убирай; без текста, логотипов и людей. Квадратный кадр, изделие целиком по центру, занимает около 80 %% высоты кадра.' % (c['n'], extra))
    if A.spent() + A.PRICE > A.CAP: return 'лимит'
    for att in range(2):
        r = A.G.call('gptask', {'img': {'prompt': prompt, 'images': imgs, 'size': '1024x1024', 'quality': 'high'}})
        if not r.get('ok'): time.sleep(15); continue
        g = {}
        for i in range(120):
            time.sleep(8); g = A.G.call('gptget', {'id': r['id']})
            if g.get('status') in ('completed', 'failed', 'cancelled', 'incomplete'): break
        if g.get('images'):
            open(out, 'wb').write(base64.b64decode(g['images'][0]))
            open(A.SPEND, 'a', encoding='utf-8').write(json.dumps({'t': time.strftime('%d.%m %H:%M'), 'usd': A.PRICE, 'what': 'prez hq ' + code}) + '\n'); return 'готово'
    return 'не вышло: ' + str(g.get('err') or g.get('status'))[:120]
if __name__ == '__main__':
    import concurrent.futures as CF
    jobs = [a.split('=') + [None] for a in sys.argv[1:]]
    with CF.ThreadPoolExecutor(4) as ex:
        for j, s in zip(jobs, ex.map(lambda j: gen(j[0], j[1]), jobs)): print(j[0], s, flush=True)
