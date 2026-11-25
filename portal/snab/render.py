import sys, json, importlib
M=importlib.import_module(sys.argv[1] if len(sys.argv)>1 else 'data_0611')
D,PLAN,DATE=M.D,M.PLAN,M.DATE
TOT=sum(d[2] for d in D)
def m(x,dec=2):
    s=f"{x:,.{dec}f}".replace(',', ' ').replace('.', ',')
    return s
def q(x): return m(x,0) if float(x).is_integer() else m(x,1)
def text(bold):
    b=(lambda s:'<b>'+s+'</b>') if bold else (lambda s:s)
    head=[f"📦 "+b(f"Реестр поставки за {DATE}: {len(D)} УПД, {m(TOT)} ₽ без НДС"),'',b(f"План машин на {DATE}")+" (М. В. Сотрудник10):"]+[('✅ ' if ok else '❌ ')+n+' — '+c for n,ok,c in PLAN]
    blocks=[]
    for i,(s,doc,t,L,need) in enumerate(D,1):
        lines=[f"{i}. "+b(f"{s} — {doc}")]
        lines+=[f"• {n}: {q(qq)} {u} × {m(p)} = {m(sm)}" for n,qq,u,p,sm in L]
        lines.append(b(f"Итого по документу: {m(t)} ₽")+(f" (нужен {need})" if need else ''))
        blocks.append('\n'.join(lines))
    tail=["Цены и суммы — без НДС, как в УПД.","Сотрудник60, пришлите, пожалуйста, недостающие листы — отмечены «нужен …».","Коллеги, по тесу и шпону — подскажите, пожалуйста, пришли ли машины.","","Спасибо!","Т. В. Сотрудник1"]
    out=[]; cur='\n'.join(head)
    for bl in blocks:
        if len(cur)+len(bl)+2>3600: out.append(cur); cur=bl
        else: cur+='\n\n'+bl
    t='\n'.join(tail)
    if len(cur)+len(t)+2>3600: out.append(cur); cur=t
    else: cur+='\n\n'+t
    out.append(cur)
    return out
if __name__=='__main__':
    print(json.dumps(text('--html' in sys.argv),ensure_ascii=False))
