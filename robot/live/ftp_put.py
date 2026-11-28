# -*- coding: utf-8 -*-
"""«Фабрика» — файлы из пакета кода → FTP сайта fabrikant.su (28.11.2026, Т. В.: «у Рекса фотки забрал, на FTP положил?»; «с FTP всё
везде отобразить — и в каталоге, и на сайте»). Claude паролей FTP не знает — кладёт робот, тем же соединением, что ftp_sync.
Задание — code/ftp_put_<id>.json: {"id": "...", "files": [{"p": "/visual/Модель/файл.jpg", "s": байт, "sha": sha256hex, "b64": "..."}]}.
Файл, который уже лежит на FTP с тем же размером, не перезаливается; чужой файл с тем же именем и другим размером не трогается
(ошибка в отчёте). Загрузка — во временное имя «.part», проверка размера, потом имя. Задание целиком выполнено — его JSON удаляется
из code/ (место на хостинге), итог — в state ftp_put.json. За прогон не больше PUT_BUDGET секунд."""
import base64, glob, hashlib, io, json, os, posixpath, time

PUT_BUDGET = 120


def _mkdirs(F, path, made):
    cur = ''
    for p in [x for x in path.split('/') if x]:
        cur += '/' + p
        if cur in made: continue
        try: F.mkd(cur)
        except Exception: pass
        made.add(cur)


def _size(F, p):
    try: return F.size(p)
    except Exception: return None


def run(F, L, log, jload, jsave, t):
    code = os.path.join(L, 'code')
    jobs = sorted(glob.glob(os.path.join(code, 'ftp_put_*.json')))
    st = jload('ftp_put.json', {}) or {}; done = st.setdefault('done', {}); err = st.setdefault('err', {})
    if not jobs: return {'state': 'нет заданий', 'done': len(done)}
    t0, n_up, n_skip, made = time.time(), 0, 0, set()
    for jp in jobs:
        try:
            with open(jp, encoding='utf-8') as f: job = json.load(f)
        except Exception as e:
            err[os.path.basename(jp)] = 'задание не читается: %s' % str(e)[:80]; continue
        jid = str(job.get('id') or os.path.basename(jp)); left = 0
        for i, x in enumerate(job.get('files') or []):
            p, s = str(x.get('p') or ''), int(x.get('s') or 0)
            if not p.startswith('/') or '..' in p or not s: err[p or '%s#%d' % (jid, i)] = 'плохой путь или размер'; continue   # навсегда: задание не держит
            cur = _size(F, p)
            if cur == s: n_skip += 1; continue
            if cur is not None: err[p] = 'на FTP другой файл с тем же именем (%d байт) — не трогаю' % cur; continue
            if time.time() - t0 > PUT_BUDGET: left += 1; continue
            try:
                raw = base64.b64decode(x.get('b64') or ''); x['b64'] = None   # 28.11 (Рекс r015): строку base64 сразу отпустить
                if len(raw) != s or (x.get('sha') and hashlib.sha256(raw).hexdigest() != x['sha']): raise IOError('файл в задании повреждён')
                _mkdirs(F, posixpath.dirname(p), made)
                tp = p + '.part'
                F.storbinary('STOR ' + tp, io.BytesIO(raw))
                if _size(F, tp) != s:
                    try: F.delete(tp)
                    except Exception: pass
                    raise IOError('загрузилось не целиком')
                F.rename(tp, p); n_up += 1; err.pop(p, None)
            except Exception as e:
                err[p] = '%s: %s' % (e.__class__.__name__, str(e)[:80]); left += 1
                log('  FTP загрузка:', p[-70:], err[p])
        if not left:                                             # 28.11 (Рекс r015): чужой файл с тем же именем и плохой путь — ошибка в отчёте,
                                                                 #   задание не держат (иначе 24 МБ JSON читается каждый прогон); сбой загрузки — повтор
            done[jid] = {'t': t, 'n': len(job.get('files') or [])}
            try: os.remove(jp)                                   # задание выполнено — тяжёлый JSON с хостинга убрать
            except Exception: pass
    if len(err) > 500: st['err'] = dict(list(err.items())[-500:])
    st['t'] = t; jsave('ftp_put.json', st)
    return {'state': 'ok', 'up': n_up, 'skip': n_skip, 'jobs': len(jobs), 'done': len(done), 'errors': len(st['err']),
            'err_list': [[k[-80:], v] for k, v in list(st['err'].items())[:10]]}
