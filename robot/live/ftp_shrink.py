# «Фабрика» — FTP fabrikant.su: тяжёлые файлы → ужатые копии на месте, оригиналы в «/Большие файлы» (26.11.2026, Т. В.:
#   «файлы больше 3 мегабайт ужмёшь до 3 мегабайт… оригиналы перенесёшь в отдельную папку „Большие файлы“, Сотрудник53 заберёт»;
#   опрос: JPG до 3 МБ, длинная сторона 2400 px; NEF/PSD/TIFF — JPG на место, оригинал в «Большие файлы»;
#   ZIP и .tmp — в «Большие файлы», видео пережать).
# Вызывается из ftp_sync.run() после обхода (то же соединение, та же опись). Python 3.6, Pillow (если нет — только перенос).
# Порядок для картинки: скачать во временный файл → ужать в памяти → ПЕРЕНЕСТИ оригинал → залить JPG. Не ужалось — файл не трогается
#   (ошибка в отчёте). Чужие файлы не перезаписываются: занято имя — « (сжато).jpg». Удалять робот ничего не удаляет.
# Бережём процессор тарифа (reg.ru): за прогон не больше SHR_PER_RUN картинок и SHR_BUDGET секунд.
import os, io, json, time, shutil, subprocess, tempfile, posixpath

BIG = 3 * 1024 * 1024
DEST = '/Большие файлы'
SIDE = 2400
IMG_MAX = 150 * 1024 * 1024                                      # крупнее — только перенос (память тарифа)
IMG = {'.png', '.jpg', '.jpeg', '.tif', '.tiff', '.psd', '.nef', '.webp', '.bmp'}
MOVE = {'.zip', '.tmp', '.rar', '.7z', '.eps', '.ai'}   # 28.11.2026, Т. В.: тяжёлые исходники (архивы, вектор) — тоже в «Большие файлы»
VIDEO = {'.mp4', '.mov', '.avi', '.m4v'}
SHR_PER_RUN = 30   # 27.11.2026 Т. В. «Выкладывай»: ускорить перенос (было 12)
SHR_BUDGET = 300   # было 150 с


def _ensure_dir(F, path, made):
    parts = [p for p in path.split('/') if p]; cur = ''
    for p in parts:
        cur += '/' + p
        if cur in made: continue
        try: F.mkd(cur)
        except Exception: pass                                   # уже есть
        made.add(cur)


def _exists(F, path):
    try: F.size(path); return True
    except Exception: return False


def _free(F, path):
    """свободное имя: занято — « (2)», « (3)» … перед расширением"""
    if not _exists(F, path): return path
    b, e = posixpath.splitext(path)
    for i in range(2, 1000):
        q = '%s (%d)%s' % (b, i, e)
        if not _exists(F, q): return q
    raise RuntimeError('нет свободного имени')


def _nef_jpeg(raw):
    """NEF (Nikon RAW): Pillow сам не читает — берём вложенный JPEG с самым большим кадром (полноразмерное превью камеры)"""
    from PIL import Image
    best, bs, i = None, 0, 0
    while True:
        s = raw.find(b'\xff\xd8\xff', i)
        if s < 0: break
        try:
            w, h = Image.open(io.BytesIO(raw[s:])).size                # читается только заголовок
            if w * h > bs: best, bs = s, w * h
        except Exception: pass
        i = s + 3
    return raw[best:] if best is not None else None


def shrink_image(raw, ext, side=SIDE, limit=BIG):
    """байты картинки → JPEG ≤ limit, длинная сторона ≤ side (прозрачное — на белом). None — не вышло."""
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    if ext == '.nef':
        j = _nef_jpeg(raw)
        if not j: return None
        raw = j
    im = Image.open(raw if hasattr(raw, 'read') else io.BytesIO(raw))
    try: im.draft('RGB', (side, side))                            # JPEG: декодировать сразу уменьшенным — меньше памяти и процессора
    except Exception: pass
    im.load()
    if im.mode in ('RGBA', 'LA', 'P', 'PA'):
        im = im.convert('RGBA'); bg = Image.new('RGB', im.size, (255, 255, 255)); bg.paste(im, mask=im.split()[-1]); im = bg
    elif im.mode != 'RGB':
        im = im.convert('RGB')
    im.thumbnail((side, side), Image.LANCZOS)
    for q in (88, 84, 80, 75, 70):
        b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, progressive=True)
        if b.tell() <= limit: return b.getvalue()
    im.thumbnail((side * 3 // 4, side * 3 // 4), Image.LANCZOS)
    b = io.BytesIO(); im.save(b, 'JPEG', quality=80, optimize=True, progressive=True)
    return b.getvalue() if b.tell() <= limit else None


def shrink_image_file(path, ext, side=SIDE, limit=BIG):
    """то же, что shrink_image, но с диска: PNG/TIFF/PSD открываются из файла (без второй копии в памяти), NEF читается целиком (~25 МБ)"""
    if ext == '.nef':
        with open(path, 'rb') as f: return shrink_image(f.read(), ext, side, limit)
    with open(path, 'rb') as f: return shrink_image(f, ext, side, limit)


def _video(src, dst):
    """видео → Full HD H.264 (ffmpeg хостинга); нет ffmpeg — False"""
    ff = shutil.which('ffmpeg')
    if not ff: return False
    r = subprocess.run([ff, '-y', '-i', src, '-vf', "scale='min(1920,iw)':-2", '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
                        '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', dst], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL, timeout=600)
    return r.returncode == 0 and os.path.exists(dst) and 0 < os.path.getsize(dst) < os.path.getsize(src)


def _pil(st, log):
    """Pillow: есть — True. Нет — раз в 6 ч пробуем поставить себе (pip --user, Pillow<9 для Python 3.6) и подключить папку пользователя
    (робот запускается с -I, своя папка пакетов в sys.path не попадает)."""
    import sys, site, importlib
    try:
        up = site.getusersitepackages()
        if up not in sys.path and os.path.isdir(up): sys.path.append(up)
    except Exception: pass
    try:
        import PIL  # noqa
        return True
    except Exception: pass
    if time.time() - float(st.get('pip2_t') or 0) < 6 * 3600: return False
    st['pip2_t'] = time.time()
    # 26.11.2026: сборка из исходников на хостинге не идёт (нет заголовков zlib/jpeg) — только готовые колёса: старый pip знает manylinux1
    #   (Pillow 7.2.0 для Python 3.6), новый — manylinux2014 (8.4.0). Сначала обновить pip у себя, потом колесо.
    tries = [['install', '--user', '--quiet', '--disable-pip-version-check', '--only-binary=:all:', 'Pillow==7.2.0'],
             ['install', '--user', '--quiet', '--disable-pip-version-check', '--upgrade', 'pip<22'],
             ['install', '--user', '--quiet', '--disable-pip-version-check', '--only-binary=:all:', 'Pillow==8.4.0']]
    st['pip'] = ''
    for a in tries:
        try:
            r = subprocess.run([sys.executable, '-m', 'pip'] + a, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=600)
            st['pip'] += '%s: %s; ' % (a[-1], 'ok' if r.returncode == 0 else 'код %d %s' % (r.returncode, (r.stderr or b'').decode('utf-8', 'replace').strip().splitlines()[-1:][0][:120] if (r.stderr or b'').strip() else ''))
            if r.returncode == 0 and a[-1].startswith('Pillow'): break
        except Exception as e:
            st['pip'] += '%s: ошибка %s; ' % (a[-1], str(e)[:80])
    log('  FTP ужатие: установка Pillow —', st['pip'][:120])
    try:
        up = site.getusersitepackages()
        if up not in sys.path: sys.path.append(up)
        importlib.invalidate_caches()
        import PIL  # noqa
        return True
    except Exception:
        return False


def _skip(e):
    """ошибка навсегда: «не трогаю» или 3 сбоя подряд; старые записи-строки (до 26.11) — повторить"""
    return isinstance(e, dict) and (e.get('perm') or e.get('n', 0) >= 3)


def run(F, items, L, log, jload, jsave, t):
    st = jload('ftp_shrink.json', {}) or {}
    done = st.get('done') or {}; err = st.get('err') or {}
    if st.get('off'): return {'state': 'выключено'}
    pil = _pil(st, log)
    todo = [i for i in items if not i.get('d') and i.get('s', 0) > BIG and not i['p'].startswith(DEST + '/') and i['p'] not in done
            and os.path.splitext(i['p'])[1].lower() in IMG | MOVE | VIDEO and not _skip(err.get(i['p']))]
    t0, n_img, n_mv, made = time.time(), 0, 0, set()
    tmpd = os.path.join(L, 'tmp_shrink'); os.makedirs(tmpd, exist_ok=True)
    # 28.11.2026, Т. В.: «если там то, что уже есть на портале — убери в „Большие файлы“». Картинка, которая не ужимается (PSD/TIF без
    #   совместимого слоя, крупнее IMG_MAX), переносится без копии, только если в той же папке уже есть выложенная картинка (JPG/PNG/WEBP ≤ 3 МБ)
    shown = set()
    for i in items:
        if not i.get('d') and i.get('s', 0) <= BIG and os.path.splitext(i['p'])[1].lower() in ('.jpg', '.jpeg', '.png', '.webp'): shown.add(posixpath.dirname(i['p']))
    for i in items:
        e0 = err.get(i['p'])
        if isinstance(e0, dict) and e0.get('perm') and not e0.get('mv') and posixpath.dirname(i['p']) in shown and not i['p'].startswith(DEST + '/'):
            e0['mv'] = 1; e0['perm'] = False; e0['n'] = 0; todo.append(i)
    for it in sorted(todo, key=lambda x: (os.path.splitext(x['p'])[1].lower() in IMG | VIDEO, x['p'])):   # сначала быстрые переносы
        if time.time() - t0 > SHR_BUDGET: break
        p = it['p']; ext = os.path.splitext(p)[1].lower(); dst = DEST + p
        if ext not in IMG | MOVE | VIDEO: continue                # PDF, EPS, 7z и пр. — не трогаем (решение Т. В.)
        if ext in IMG | VIDEO and (n_img >= SHR_PER_RUN or (ext in IMG and not pil)): continue
        try:
            out = None
            mv_only = isinstance(err.get(p), dict) and err[p].get('mv')
            if ext in IMG and it['s'] > IMG_MAX and not mv_only: raise RuntimeError('крупнее %d МБ — не трогаю (память тарифа)' % (IMG_MAX // 2 ** 20))
            if ext in IMG | VIDEO and not mv_only:
                tf = os.path.join(tmpd, 'src' + ext)
                with open(tf, 'wb') as f: F.retrbinary('RETR ' + p, f.write)
                try:
                    if ext in IMG:
                        out = shrink_image_file(tf, ext)
                        if out is None: raise RuntimeError('не ужалось до 3 МБ')
                    else:
                        vo = os.path.join(tmpd, 'out.mp4')
                        if _video(tf, vo):
                            with open(vo, 'rb') as f: out = f.read()
                        try: os.remove(vo)
                        except Exception: pass
                        if out is None: raise RuntimeError('видео не пережато (нет ffmpeg или не стало меньше) — не трогаю')
                        if len(out) > 3 * 2 ** 20: raise RuntimeError('видео после пережатия больше 3 МБ — не трогаю')   # 27.11.2026, Рекс CG-69 п.3
                finally:
                    try: os.remove(tf)
                    except Exception: pass
                n_img += 1
            _ensure_dir(F, posixpath.dirname(dst), made)
            dst = _free(F, dst)
            rec = {'to': dst, 's': it['s'], 't': t}
            if out is not None:
                newp = posixpath.splitext(p)[0] + ('.mp4' if ext in VIDEO else '.jpg')
                if newp != p and _exists(F, newp): newp = _free(F, posixpath.splitext(p)[0] + ' (сжато)' + ('.mp4' if ext in VIDEO else '.jpg'))
                if newp == p:                                     # то же имя (тяжёлый .jpg): копия под временным именем → оригинал в «Большие файлы» → копию на место
                    tp = p + '.shrinkpart'
                    F.storbinary('STOR ' + tp, io.BytesIO(out))
                    F.rename(p, dst)
                    try: F.rename(tp, p)
                    except Exception:
                        try: F.rename(dst, p)
                        except Exception: pass
                        raise
                else:                                             # 26.11.2026 (ревью GPT): сначала копия на месте, потом перенос оригинала
                    tp = newp + '.shrinkpart'                     # 27.11.2026 (Рекс CG-69/r003): копия под временным именем, проверка размера, потом имя
                    F.storbinary('STOR ' + tp, io.BytesIO(out))
                    try: ok = F.size(tp) == len(out)
                    except Exception: ok = True
                    if not ok:
                        try: F.delete(tp)
                        except Exception: pass
                        raise IOError('копия загрузилась не целиком')
                    if _exists(F, newp): newp = _free(F, posixpath.splitext(p)[0] + ' (сжато)' + ('.mp4' if ext in VIDEO else '.jpg'))
                    F.rename(tp, newp)
                    F.rename(p, dst)
                rec.update({'new': newp, 'ns': len(out)})
            else:
                F.rename(p, dst); n_mv += 1                       # ZIP, .tmp, 7z, EPS — переносом; неужимаемая картинка рядом с выложенными — тоже
                if mv_only: rec['mv'] = 1
            done[p] = rec; err.pop(p, None)
        except Exception as e:                                    # RuntimeError — решение «не трогаю»; сбой связи — повтор, не больше 3 раз
            o = err.get(p) if isinstance(err.get(p), dict) else {}
            err[p] = {'e': '%s: %s' % (e.__class__.__name__, str(e)[:100]), 'n': o.get('n', 0) + 1, 'perm': isinstance(e, RuntimeError), 't': t}
            log('  FTP ужатие:', p[-70:], err[p]['e'])
    try: shutil.rmtree(tmpd)
    except Exception: pass
    left = len([i for i in todo if i['p'] not in done and not _skip(err.get(i['p'])) and os.path.splitext(i['p'])[1].lower() in IMG | MOVE | VIDEO])
    if len(done) > 4000: done = dict(sorted(done.items(), key=lambda kv: kv[1].get('t') or '')[-4000:])
    if len(err) > 2000: err = dict(list(err.items())[-2000:])
    st.update({'done': done, 'err': err, 't': t, 'left': left, 'pil': pil, 'ffmpeg': bool(shutil.which('ffmpeg'))})
    if not left and not st.get('fin'): st['fin'] = t
    jsave('ftp_shrink.json', st)
    saved = sum(r['s'] - r.get('ns', 0) for r in done.values() if r.get('new'))
    errs = sorted(((k, v.get('e', '')) for k, v in err.items() if isinstance(v, dict) and _skip(v)), key=lambda x: x[0])
    return {'state': 'готово' if not left else 'идёт', 'done': len(done), 'left': left, 'errors': len(errs), 'pil': pil,
            'err_list': [[k[-90:], e[:80]] for k, e in errs[:30]],
            'pip': (st.get('pip') or '')[:160], 'moved_gb': round(sum(r['s'] for r in done.values()) / 2 ** 30, 2), 'saved_gb': round(saved / 2 ** 30, 2), 'fin': st.get('fin')}
