import sys,json,re,time,hashlib,secrets,base64,ssl,urllib.request
sys.path.insert(0,'/home/claude/fabrika/work/selfdeploy'); import dep
def post(url, body):
    ctx = ssl.create_default_context(cafile='/root/.ccr/ca-bundle.crt')
    with urllib.request.urlopen(urllib.request.Request(url, data=json.dumps(body).encode(), headers={'Content-Type': 'text/plain;charset=utf-8'}), context=ctx, timeout=90) as r: return json.loads(r.read().decode())
C=json.load(open('tg_dep.json')); did=C['tg_dep']; V=int(sys.argv[1])
url=re.search(r'"url":\s*"([^"]+)"',open('REDACTED_B64_32.html',encoding='utf-8').read()).group(1)
print('promote', dep.call({'op':'promote','s':'tg','v':V,'dep':did,'desc':'25.11: вход на портал по MAX ID (MxLogin)'}).get('version'))
ok=False; rid=secrets.token_hex(24); r={}
for i in range(12):
    time.sleep(6)
    try:
        r=post(url,{'op':'mxreq','ridh':hashlib.sha256(rid.encode()).hexdigest(),'pub':base64.b64encode(b'\x04'+secrets.token_bytes(64)).decode()})
        if r.get('ok') and re.fullmatch(r'\d{6}',str(r.get('code'))): print('новая версия отвечает через',(i+1)*6,'с'); break
    except Exception as e: r={'error':repr(e)[:120]}
try:
    assert r.get('ok'), r
    a=post(url,{'op':'salt','id':'0'*24}); assert a.get('ok') and a.get('salt'),a
    s1=post(url,{'op':'mxget','code':r['code'],'rid':rid}); assert s1.get('st')=='new',s1
    s2=post(url,{'op':'mxget','code':r['code'],'rid':secrets.token_hex(24)}); assert s2.get('st')=='none',s2
    s3=post(url,{'op':'mxlist','tok':'0'*48}); assert s3.get('ok') is False,s3
    s4=post(url,{'op':'mxbot','code':r['code'],'uid':'1','name':'x'}); assert s4.get('ok') is False,s4
    s5=post(url,{'op':'mxgive','tok':'0'*48,'code':r['code'],'box':'A'*200,'login':'x'}); assert s5.get('ok') is False,s5
    print('проверка: salt; mxreq — код выдан; mxget new/none; без прав — mxlist «%s», mxbot «%s», mxgive «%s»'%(s3.get('error'),s4.get('error'),s5.get('error'))); ok=True
except Exception as e: print('ПРОВЕРКА НЕ ПРОШЛА:',repr(e)[:300])
if not ok: print('возврат на', C['prev'], dep.call({'op':'promote','s':'tg','v':C['prev'],'dep':did,'desc':'автовозврат'}).get('version')); sys.exit(1)
