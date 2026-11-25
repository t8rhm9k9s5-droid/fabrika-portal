import json,shutil,os,sys,time
R=json.load(open('ai/_reject.json')); O=json.load(open('assort/oknight.json'))
for c in sys.argv[2:]:
    for v in ('day','night'):
        d=f'ai/{c}/{v}.png'; os.makedirs(f'ai/{c}',exist_ok=True)
        if os.path.exists(d): os.makedirs(f'_удалить/ai_tpl_2311/{c}',exist_ok=True); shutil.move(d,f'_удалить/ai_tpl_2311/{c}/{v}.png')
        shutil.copy(f'review/api/{c}_{v}.png',d)
        if v in R.get(c,[]): R[c].remove(v)
    if c in R and not R[c]: R.pop(c)
    if c not in O: O.append(c)
    open('ai/_log.jsonl','a').write(json.dumps({'code':c,'kind':'day+night','src':['api:openai '+sys.argv[1]],'t':time.strftime('%d.%m'),'ok':'Т. В. '+time.strftime('%d.%m')},ensure_ascii=False)+'\n')
json.dump(R,open('ai/_reject.json','w'),ensure_ascii=False,indent=1); json.dump(O,open('assort/oknight.json','w'),ensure_ascii=False); print('ok',len(sys.argv)-2)
