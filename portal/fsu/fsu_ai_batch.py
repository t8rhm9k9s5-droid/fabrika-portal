#!/usr/bin/env python3
"""21.11.2026, Т. В.: «в каждой карточке 5–7 фото минимум + 1–2 в интерьере»; недостающее — ИИ по реальным фото («без ограничения, как можно быстрее»).
По assort/photo_gap.json: недостающие ракурсы (до 5) и 1 интерьер на карточку → work/fsu/ai/<код>/<вид>.png.
GPT-картинки через мост ClaudeGpt бота (ключ OpenAI остаётся в боте; свой счётчик, предохранитель 3000/сутки). Готовые не повторяются.
  python3 fsu_ai_batch.py [--only код,код] [--n 6] [--limit N] [--quality medium]"""
import sys, os, json, time, base64, io, argparse, threading, concurrent.futures as CF
sys.path.insert(0, '/home/claude/fabrika/tools'); import gpt as G
from PIL import Image
H = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(H, 'ai'); os.makedirs(OUT, exist_ok=True)
GAP = json.load(open(os.path.join(H, 'assort', 'photo_gap.json'), encoding='utf-8'))
VIEW = {'side': 'строго сбоку, профиль', 'back': 'строго сзади (вид со спины)', 'rear34': 'три четверти сзади-слева',
        'front34r': 'три четверти спереди-справа, чуть сверху', 'detail': 'крупный план характерной детали (подлокотник, механизм, опора или фактура обивки), предмет узнаваем'}
ORDER = ['side', 'back', 'rear34', 'front34r', 'detail']
SCENE = {'Кресла': 'современный светлый офис или кабинет руководителя', 'Стулья': 'светлая переговорная, кафе или столовая',
         'Столы': 'современный офис или учебная аудитория', 'Мягкая мебель': 'зона ожидания или лаунж современного офиса',
         'Вешалки': 'светлая прихожая офиса', 'Детская мебель': 'светлая детская игровая или класс детского сада', 'Урны': 'холл общественного здания',
         'Банкетки и\xa0кушетки': 'холл или коридор общественного здания', 'Школьная мебель': 'светлый школьный класс',
         'Мебель для театров и\xa0залов ожидания': 'зал ожидания вокзала или аэропорта, либо фойе театра', 'Медицинская мебель': 'светлый кабинет поликлиники',
         'Мебель на\xa0деревянной основе': 'уютный интерьер кафе или гостиной'}
STOP = threading.Event(); LOCK = threading.Lock(); LOG = os.path.join(OUT, '_log.jsonl')


def du(p, cap=85000):   # бот принимает запрос до 200 000 знаков: на 2 фото — не больше ~85 000 знаков каждое
    im = Image.open(p).convert('RGBA'); bg = Image.new('RGB', im.size, 'white'); bg.paste(im, mask=im.split()[3])
    for side, q in ((1024, 88), (900, 82), (768, 78), (640, 72), (512, 68)):
        t = bg.copy(); t.thumbnail((side, side)); b = io.BytesIO(); t.save(b, 'JPEG', quality=q)
        u = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
        if len(u) <= cap: return u
    return u


def prompt(kind, x):
    keep = ('Сохрани точно: форму, пропорции, цвет и фактуру обивки, строчку, каркас, опору, колёса, механизм, подлокотники. '
            'Ничего не добавляй и не убирай; невидимые на фото части делай самыми простыми и логичными продолжениями видимых. ')
    if kind == 'interior':
        return ('Фотореалистичный снимок для карточки товара, вертикальный 2:3. На приложенных фото — один и тот же реальный предмет мебели «%s». '
                'Помести ЭТОТ ЖЕ предмет без изменений в интерьер: %s. %sПредмет целиком, крупно, в центре кадра, естественный свет и тени. '
                'Можно 2–4 таких же предмета, если это естественно для помещения. Без текста, логотипов, людей и мебели других моделей на первом плане.') % (
                    x['name'], SCENE.get(x['section'], 'светлый современный общественный интерьер'), keep)
    return ('Студийный предметный снимок для карточки товара, чистый белый фон, мягкая тень под предметом, вертикальный 2:3. '
            'На приложенных фото — один и тот же реальный предмет мебели «%s» с разных сторон. Покажи ЭТОТ ЖЕ предмет: %s. %s'
            'Предмет целиком в кадре, по центру. Без текста, логотипов, людей и других предметов.') % (x['name'], VIEW[kind], keep)


def one(job):
    code, kind, q = job; x = GAP[code]; dst = os.path.join(OUT, code, kind + '.png')
    if os.path.exists(dst): return 'есть'
    if STOP.is_set(): return 'остановлено'
    src = [p for p in ([x.get('best_source_photo')] + x.get('studio', [])) if p and os.path.exists(p)]
    src = list(dict.fromkeys(src))[:2]
    if not src: return 'нет исходника'
    for att in range(3):
        try:
            r = G.call('gptask', {'img': {'prompt': prompt(kind, x), 'images': [du(p) for p in src], 'size': '1024x1536', 'quality': q}})
            if not r.get('ok'):
                if 'предохранитель' in str(r.get('error')): STOP.set(); return 'предохранитель'
                time.sleep(20); continue
            for i in range(120):
                time.sleep(8); g = G.call('gptget', {'id': r['id']})
                if g.get('status') in ('completed', 'failed', 'cancelled', 'incomplete'): break
            if 'credits' in str(g.get('err') or '') or 'billing' in str(g.get('err') or ''): STOP.set(); return 'нет денег'
            if g.get('images'):
                os.makedirs(os.path.dirname(dst), exist_ok=True); open(dst + '.tmp', 'wb').write(base64.b64decode(g['images'][0])); os.replace(dst + '.tmp', dst)
                with LOCK: open(LOG, 'a', encoding='utf-8').write(json.dumps({'code': code, 'kind': kind, 'src': src, 't': time.strftime('%d.%m %H:%M')}, ensure_ascii=False) + '\n')
                return 'готово'
            time.sleep(10)
        except Exception as e:
            time.sleep(15)
    return 'сбой'


if __name__ == '__main__':
    a = argparse.ArgumentParser(); a.add_argument('--only'); a.add_argument('--n', type=int, default=6); a.add_argument('--limit', type=int, default=0); a.add_argument('--quality', default='medium')
    o = a.parse_args(); only = set(o.only.split(',')) if o.only else None
    # порядок: сначала карточки с 1–2 фото (их больше всего видно пустыми), внутри раздела — как в каталоге
    codes = sorted([c for c in GAP if (not only or c in only)], key=lambda c: (GAP[c]['real_studio'] == 0, GAP[c]['real_studio'], GAP[c]['section']))
    jobs = []
    for c in codes:
        x = GAP[c]
        if x.get('need_interior') and not x.get('no_interior_section'): jobs.append((c, 'interior', o.quality))
        jobs += [(c, k, o.quality) for k in ORDER[:x.get('need_angles', 0)]]
    jobs = [j for j in jobs if not os.path.exists(os.path.join(OUT, j[0], j[1] + '.png'))]   # готовые не берём (и проба --limit 1 — по-настоящему новая картинка)
    if o.limit: jobs = jobs[:o.limit]
    from collections import Counter
    res = Counter(); t0 = time.time()
    with CF.ThreadPoolExecutor(o.n) as ex:
        for i, r in enumerate(ex.map(one, jobs)):
            res[r] += 1
            if i % 25 == 0: print(i, len(jobs), dict(res), '%.0f мин' % ((time.time() - t0) / 60), flush=True)
            if res['предохранитель'] or res['нет денег']: break
    print(json.dumps({'заданий': len(jobs), **res}, ensure_ascii=False))
