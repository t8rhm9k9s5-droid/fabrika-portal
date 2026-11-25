import sys, json, importlib, html
from short_0611 import short, UNIT
M=importlib.import_module(sys.argv[1] if len(sys.argv)>1 else 'data_0611')
import short_0611 as _S; _S.SHORT.update(getattr(M,'SHORT',{}))
D,PLAN,DATE=M.D,M.PLAN,M.DATE; TOT=sum(d[2] for d in D)
def m2(x): return f"{x:,.2f}".replace(',', ' ').replace('.', ',')
def r0(x): return f"{x:,.0f}".replace(',', ' ')
def qf(x): return (f"{x:,.0f}".replace(',', '') if float(x).is_integer() else f"{x:.1f}".replace('.', ','))
def pf(x): return f"{x:.2f}".replace('.', ',')
TW=31  # ширина строки таблицы: в MAX на телефоне влезает ~32-36 моноширинных знаков
def wrap(t,w):
    out=[];cur=''
    for wd in t.split():
        while len(wd)>w: 
            if cur: out.append(cur); cur=''
            out.append(wd[:w]); wd=wd[w:]
        if not cur: cur=wd
        elif len(cur)+1+len(wd)<=w: cur+=' '+wd
        else: out.append(cur); cur=wd
    if cur: out.append(cur)
    return out or ['']
def table(rows,tot):
    H=('Товар','Кол','Цена','Сумма'); R=rows+[('ИТОГО','','',tot)]
    wq,wp,ws=(max(len(H[k]),*(len(r[k]) for r in R)) for k in (1,2,3))
    wn=max(5,TW-wq-wp-ws-3)
    out=[]
    for r in [H]+R:
        ws_=r[0].split(); first=''
        while ws_ and len((first+' '+ws_[0]).strip())<=wn: first=(first+' '+ws_.pop(0)).strip()
        if not first:  # первое слово длиннее колонки — название отдельной строкой, цифры под ним
            out+=wrap(r[0],TW); first=''; ws_=[]
        out.append(first.ljust(wn)+' '+r[1].rjust(wq)+' '+r[2].rjust(wp)+' '+r[3].rjust(ws))
        if ws_: out+=[' '+x for x in wrap(' '.join(ws_),TW-1)]  # продолжение названия — на всю ширину
    return '\n'.join(x.rstrip() for x in out)
def text(lim=3600):
    head=["📦 <b>Реестр поставки за "+DATE+f": {len(D)} УПД, {m2(TOT)} ₽ без НДС</b>","",("<b>План машин "+M.PLAN_SRC+"</b>:" if hasattr(M,'PLAN_SRC') else "<b>План машин на "+DATE+"</b> (М. В. Сотрудник10):")]+[('❔ ' if ok is None else '✅ ' if ok else '❌ ')+n+' — '+c for n,ok,c in PLAN]
    blocks=[]
    for i,(s,doc,t,L,need) in enumerate(D,1):
        us={u for *_,u,p,sm in [(x[0],x[1],x[2],x[3],x[4]) for x in L]}
        from collections import Counter
        maj=Counter(x[2] for x in L).most_common(1)[0][0]; one=True; un=UNIT.get(maj,maj)+('' if len(us)==1 else ', кроме указанных')
        sn=[short(x[0]) for x in L]; pre=''
        if len(L)>1 and len({x.split()[0] for x in sn})==1 and all(len(x.split())>1 for x in sn) and len({x[0].split()[0] for x in L})==1:
            pre=L[0][0].split()[0]; cut=len(sn[0].split()[0])+1
        short_=lambda n: short(n)[cut:] if pre else short(n)
        nm=lambda n,u: short_(n) if u==maj else (short_(n)+' '+UNIT.get(u,u))
        tb=table([(nm(n,u),qf(q),pf(p),r0(sm)) for n,q,u,p,sm in L],r0(t))
        blocks.append(f"<b>{i}. {html.escape(s)} — {html.escape(doc)}</b>"+(' ('+', '.join(x for x in (pre, f"ед.: {un}" if one else '') if x)+')' if (pre or one) else '')+(f"\n⚠️ нужен {need}" if need else '')+"\n<pre>"+html.escape(tb)+"</pre>")
    tail=("Цены и суммы — без НДС, как в УПД.\nСотрудник60, пришлите, пожалуйста, недостающие листы — отмечены ⚠️.\n\nСпасибо!\nТ. В. Сотрудник1" if any(d[4] for d in D) else "Цены и суммы — без НДС, как в УПД. Все листы на месте.\n\nСпасибо!\nТ. В. Сотрудник1")
    out=[]; cur='\n'.join(head)
    for bl in blocks:
        if len(cur)+len(bl)+2>lim: out.append(cur); cur=bl
        else: cur+='\n\n'+bl
    if len(cur)+len(tail)+2>lim: out.append(cur); cur=tail
    else: cur+='\n\n'+tail
    out.append(cur); return out
if __name__=='__main__':
    n=int(sys.argv[2]) if len(sys.argv)>2 else 0; lim=3600
    while n and len(text(lim))<n and lim>800: lim-=50
    print(json.dumps(text(lim),ensure_ascii=False))
