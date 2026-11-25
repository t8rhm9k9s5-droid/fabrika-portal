# Текст реестра 11.11 в формате реестра 10.11 (расшифровки уже выложены днём — здесь сводный список)
import data_1111 as M
m2=lambda x: f"{x:,.2f}".replace(',', ' ').replace('.', ',')
D=M.D; E=D[:M.EVENING]; T=D[M.EVENING:]
INPLAN={('ТД «Русский крепёж»',None),('ВЕК','УПД 4759 от 11.11'),('РИФ «Аметист»',None),('Профиль Имя6',None)}
def mark(s,doc):
    if (s,None) in INPLAN or (s,doc) in INPLAN: return ''
    if s.startswith('ИП Каган'): return ' · швейная фурнитура?'
    return ' · вне плана'
tot=sum(d[2] for d in D)
out=[f"📦 Реестр поставки за 11.11: {len(D)} документов, {m2(tot)} ₽ без НДС",
     f"(за день {len(T)} док. на {m2(sum(d[2] for d in T))} ₽ + {len(E)} док. на {m2(sum(d[2] for d in E))} ₽, выложенные вечером 10.11 после реестра)",'',
     f"План машин {M.PLAN_SRC}:"]
out+=[('❔ ' if ok is None else '✅ ' if ok else '❌ ')+n+' — '+c for n,ok,c in M.PLAN]
out+=['','Документы за 11.11 (расшифровки — выше в группе):']
out+=[f"{i}. {s} — {doc}: {m2(t)} ₽{mark(s,doc)}" for i,(s,doc,t,L,n) in enumerate(T,1)]
out+=['','Вечером 10.11, после реестра:']
out+=[f"{i}. {s} — {doc.replace(' · вечер 10.11','')}: {m2(t)} ₽" for i,(s,doc,t,L,n) in enumerate(E,len(T)+1)]
need=[d for d in D if d[4]]
out+=['',('⚠️ Не хватает: '+'; '.join(f"{d[0]} {d[1]} — {d[4]}" for d in need)) if need else 'Все суммы строк сходятся с итогами документов. Цены и суммы — без НДС.']
out+=['','Коллеги, подскажите, пожалуйста: «швейная фурнитура (0,2 т)» из плана на среду — это иглы ИП Каган или машина ещё в пути?','','Спасибо!','Т. В. Сотрудник1']
txt='\n'.join(out)
if __name__=='__main__': print(txt); print(len(txt))
