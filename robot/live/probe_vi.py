"""«Фабрика» — проба: открывается ли vseinstrumenti.ru с хостинга без Claude (12.11.2026).
Т. В. 12.11: «все сборщики отчётов на сайте должны быть автономны от тебя». Цены ВИ сейчас собирает Claude (Firecrawl). Прежде чем
переносить сбор на робота — проверить, отдаёт ли сайт страницы хостингу: раз в 6 ч одна карточка товара и одна страница каталога,
в статус — код ответа, размер, есть ли цена (JSON-LD / «₽») и признаки защиты (Qrator / «проверка браузера»). Ничего не сохраняет, кроме
итога в state/probe_vi.json. Python 3.6."""
import json, re, time, urllib.request, urllib.error, ssl

URLS = [('card', 'https://www.vseinstrumenti.REDACTED_B64'),
        ('list', 'https://www.vseinstrumenti.ru/category/ofisnye-stulya-4497/'),
        ('pas', 'https://pas.vseinstrumenti.ru/app/login')]   # 12.11: кабинет поставщика (ЛКП) — пускает ли хостинг; без входа, только страница логина
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
EVERY = 6 * 3600


def one(url):
    rq = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'ru-RU,ru;q=0.9'})
    t0 = time.time()
    try:
        with urllib.request.urlopen(rq, timeout=25, context=ssl.create_default_context()) as r:
            code, body = r.status, r.read(3 * 1024 * 1024)
    except urllib.error.HTTPError as e:
        code, body = e.code, (e.read(200000) if hasattr(e, 'read') else b'')
    except Exception as e:
        return {'err': '%s %s' % (e.__class__.__name__, str(e)[:100]), 's': round(time.time() - t0, 1)}
    s = body.decode('utf-8', 'replace')
    return {'code': code, 'kb': len(body) // 1024, 's': round(time.time() - t0, 1),
            'ld_price': bool(re.search(r'"price"\s*:\s*"?\d', s)), 'rub': s.count('₽'),
            'guard': bool(re.search(r'qrator|проверка браузера|captcha|are you a robot|js-challenge', s, re.I)),
            'title': (re.search(r'<title>([^<]{0,90})', s) or [None, ''])[1]}


def gql():
    """12.11: внутренний GraphQL кабинета без входа — JSON (пускает) или страница защиты (не пускает)"""
    rq = urllib.request.Request('https://pas.vseinstrumenti.ru/app/api/gql', data=b'{"query":"query loginForm { loginForm { isLoggedIn } }","variables":{}}',
                                headers={'User-Agent': UA, 'Content-Type': 'application/json', 'Accept': 'application/json', 'Origin': 'https://pas.vseinstrumenti.ru',
                                         'Referer': 'https://pas.vseinstrumenti.ru/app/login'})
    try:
        with urllib.request.urlopen(rq, timeout=25, context=ssl.create_default_context()) as r: code, body = r.status, r.read(20000)
    except urllib.error.HTTPError as e: code, body = e.code, (e.read(20000) if hasattr(e, 'read') else b'')
    except Exception as e: return {'err': '%s %s' % (e.__class__.__name__, str(e)[:100])}
    s = body.decode('utf-8', 'replace')
    return {'code': code, 'json': s.lstrip().startswith('{'), 'head': re.sub(r'\s+', ' ', s)[:140]}


def run(jload, jsave, iso, now):
    st = jload('probe_vi.json', {})
    if time.time() - float(st.get('ts') or 0) < EVERY and 'gql' in (st.get('r') or {}): return st.get('r')
    r = {'t': iso(now)}
    for k, u in URLS: r[k] = one(u)
    r['gql'] = gql()
    jsave('probe_vi.json', {'ts': time.time(), 'r': r})
    return r
