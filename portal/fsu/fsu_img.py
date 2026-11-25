"""Фото раздела «Сайт» под любой экран (Т. В. 20.11.2026: «HD, 4K, 8K… смотреться без зернистости, сайт максимально лёгкий»).
Для каждой картинки зеркала:
  • основной файл (тот же путь, что на сайте) — WebP до 1280 px по длинной стороне (формат WebP браузер распознаёт по содержимому);
  • <путь>.640.webp — для телефона и списков, если основной крупнее 800 px;
  • <путь>.2560.webp — для экранов 2K/4K/8K: из оригинала, если он ≥ 1700 px, иначе для фото товаров —
    увеличение ×2 нейросетью FSRCNN (OpenCV dnn_superres), а не простым растяжением — меньше «ступенек» и мыла.
Карта вариантов {путь: [ширина основного, ширина 640-варианта или 0, ширина крупного или 0]} подключается в fsu_shim.js: картинка получает srcset,
и браузер сам берёт файл под размер на экране × плотность пикселей. Медленная сеть не страдает: телефон тянет 640/1280."""
import io, os, re
from PIL import Image, ImageOps
try:
    import cv2, numpy as np
    _SR = cv2.dnn_superres.DnnSuperResImpl_create()
    _SR.readModel(os.environ.get('FSU_SR_MODEL', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'FSRCNN_x2.pb'))); _SR.setModel('fsrcnn', 2)
except Exception:
    _SR = None
BASE, SMALL, BIG = 1280, 640, 2560
SR_DIRS = re.compile(r'upload/(als-1c/catalog/(products|offers)|iblock|uf)/')   # фото товаров и крупные иллюстрации — им нужен вариант 2560


def _fit(im, side):
    if max(im.size) <= side: return im
    im = im.copy(); im.thumbnail((side, side), Image.LANCZOS); return im


def _webp(im, q=82):
    b = io.BytesIO()
    if im.mode in ('RGBA', 'LA', 'P'):
        im.convert('RGBA').save(b, 'WEBP', quality=q, alpha_quality=90, method=4)
    else:
        im.convert('RGB').save(b, 'WEBP', quality=q, method=4)
    return b.getvalue()


def _upscale(im):
    """×2 нейросетью; прозрачность — отдельным каналом простым увеличением"""
    if _SR is None: return im.resize((im.width * 2, im.height * 2), Image.LANCZOS)
    rgba = im.convert('RGBA'); a = rgba.split()[3]
    rgb = np.array(rgba.convert('RGB'))[:, :, ::-1]
    up = _SR.upsample(np.ascontiguousarray(rgb))[:, :, ::-1]
    out = Image.fromarray(np.ascontiguousarray(up)).convert('RGBA')
    if a.getextrema() != (255, 255): out.putalpha(a.resize(out.size, Image.LANCZOS))
    else: out = out.convert('RGB')
    return out


def process(src, dst, rel):
    """→ (байт до, байт после, запись карты или None)"""
    n = os.path.getsize(src)
    im = Image.open(src); im.draft('RGB', (BIG * 2, BIG * 2)); im.load()
    im = ImageOps.exif_transpose(im)   # 21.11.2026 (аудит): поворот по EXIF
    _icc = im.info.get('icc_profile')
    if _icc and im.mode in ('RGB', 'RGBA'):   # профиль AdobeRGB/P3 → sRGB, иначе оттенок обивки сдвигается
        try:
            from PIL import ImageCms
            _m = im.mode; im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(_icc)), ImageCms.createProfile('sRGB'), outputMode=_m)
        except Exception: pass
    if im.mode == 'P': im = im.convert('RGBA')
    W = max(im.size)
    if W < 64 or rel.endswith('.svg'):
        with open(src, 'rb') as f: raw = f.read()
        with open(dst, 'wb') as f: f.write(raw)
        return n, n, None
    want_big = bool(SR_DIRS.search(rel)) and W >= 300
    base = _fit(im, BASE)
    raw = _webp(base)
    if len(raw) > n and W <= BASE and not want_big:   # уже лёгкая — не трогаем
        with open(src, 'rb') as f: raw = f.read()
    with open(dst, 'wb') as f: f.write(raw)
    tot = len(raw); has_s = 0; gw = 0
    if max(base.size) > 800:
        sm = _fit(base, SMALL); s = _webp(sm, 80)
        with open(dst + '.640.webp', 'wb') as f: f.write(s)
        tot += len(s); has_s = sm.size[0]
    if want_big:
        if W >= 1700: big = _fit(im, BIG)
        elif W < 1000: big = _fit(_upscale(im), BIG)   # маленькие фото — ×2 нейросетью
        else: big = base                                 # 1000–1700 px: свой оригинал уже близок к экрану 2K, вариант не нужен
        if max(big.size) > max(base.size) * 1.25:
            g = _webp(big, 80)
            with open(dst + '.2560.webp', 'wb') as f: f.write(g)
            tot += len(g); gw = big.size[0]
    return n, tot, [base.size[0], has_s, gw]
