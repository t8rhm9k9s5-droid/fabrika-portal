#!/usr/bin/env python3
"""«Фабрика» — пуш о новых критичных тревогах портала на iPhone/Android (14.11.2026, Т. В., опрос «приложение для iPhone без затрат»:
«Пуши о тревогах»; «для iPhone пусть сайт пока остаётся с пушами и с Face ID»).
После сборки берёт site/assets/alerts_data.js (gen_alerts.py) и шлёт ТОЛЬКО НОВЫЕ «Критично» администраторам, у которых на портале включены
уведомления (подписка Web Push хранится в боте «Фабрика — уведомления», op claude → do:'push', бот v41+). В пуше — только заголовок тревоги,
без сумм и клиентов; по нажатию открывается портал.
  Тихие часы 22:00–07:00 МСК: ночью не шлём — тревога ждёт первой сборки после 07:00 (на портале она горит сразу).
  Состояние — build/alerts_pushed.json {id тревоги: когда ушла}; одна тревога — один пуш.
  python3 push_alerts.py            — обычный запуск (из build_site.py)
  python3 push_alerts.py --dry      — показать, кому ушло бы, ничего не отправляя
  python3 push_alerts.py --test     — проверочный пуш только владельцу (id в build/push_owner.txt)"""
import hashlib, hmac, json, os, re, ssl, sys, time, datetime, urllib.request

B = '/home/claude/build'
SITE = '/home/claude/site'
STATE = B + '/alerts_pushed.json'
KEYF = '/home/claude/fabrika/src/Исходники/bot/bot_key.txt'
PUSHJ = '/home/claude/fabrika/src/Исходники/app_build/pwa/terekhina14/push.json'
CA = '/root/.ccr/ca-bundle.crt'


def post(items):
    k = hmac.new(bytes.fromhex(open(KEYF).read().strip()), b'fabrika-cmd-v1', hashlib.sha256).hexdigest()
    body = json.dumps({'items': items}, ensure_ascii=False, separators=(',', ':'))
    t = int(time.time())
    sig = hmac.new(k.encode('utf-8'), ('claude:%d:%s' % (t, body)).encode('utf-8'), hashlib.sha256).hexdigest()
    url = json.load(open(PUSHJ))['url']
    data = json.dumps({'op': 'claude', 't': t, 'body': body, 'sig': sig}, ensure_ascii=False).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'text/plain;charset=utf-8'})
    ctx = ssl.create_default_context(cafile=CA) if os.path.exists(CA) else None
    return urllib.request.urlopen(req, context=ctx, timeout=90).read().decode('utf-8', 'replace')


def alerts():
    try:
        s = open(SITE + '/assets/alerts_data.js', encoding='utf-8').read()
        return json.loads(re.search(r'=\s*(\{.*\})\s*;?\s*$', s, re.S).group(1)).get('items') or []
    except Exception:
        return []


def main():
    a = sys.argv[1:]
    if '--test' in a:
        who = open(B + '/push_owner.txt').read().strip() if os.path.exists(B + '/push_owner.txt') else ''
        if not who: sys.exit('нет build/push_owner.txt — сначала --dry, чтобы увидеть id подписки владельца')
        print(post([{'do': 'push', 'who': [who], 'text': 'Проверка: так будут приходить критичные тревоги портала', 'f': 'Фабрика'}]))
        return
    if '--dry' in a:
        print(post([{'do': 'push', 'dry': 1, 'text': '-'}]))
        return
    try: st = json.load(open(STATE, encoding='utf-8'))
    except Exception: st = {}
    msk = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=3)
    crit = [x for x in alerts() if x.get('lvl') == 'crit' and x.get('id') and x['id'] not in st]
    if not crit: print('пуш тревог: новых критичных нет'); return
    if not (7 <= msk.hour < 22): print('пуш тревог: тихие часы, ждут утра:', ', '.join(x['id'] for x in crit)); return
    for x in crit[:3]:
        txt = '%s: %s' % (x.get('cat') or 'Тревога', x.get('t') or x.get('short') or '')
        try:
            r = post([{'do': 'push', 'text': txt[:200], 'f': 'Фабрика — критично'}])
            ok = '"push:' in r
        except Exception as e:
            r, ok = str(e)[:200], False
        print('пуш тревоги', x['id'], '→', r[:160])
        if ok: st[x['id']] = msk.strftime('%Y-%m-%d %H:%M')
    json.dump(st, open(STATE, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
