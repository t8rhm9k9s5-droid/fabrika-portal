/* OFFLINE CANDIDATE. Only scheduled MAX handler entry gates; no global bot stop.
 * A single bounded property commits pause state and operation receipt together.
 * Private helpers end in _. Existing rxb_owner_ must check active AND effective owner.
 */
var RCOT_KEY_ = 'REX_TIMER_OWNER_V1';
function rcot_fail_() { throw new Error('Timer control rejected'); }
function rcot_exact_(o, keys) { return o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).sort().join('|')===keys.slice().sort().join('|'); }
function rcot_id_(s) { return typeof s==='string' && /^[a-f0-9-]{36}$/.test(s); }
function rcot_int_(n) { return Number.isSafeInteger(n) && n>=0; }
function rcot_preview_(o) { return JSON.stringify({version:1,id:o.id,expected_revision:o.base,paused:o.paused,issued_at:o.at,expires_at:o.until,scope:'tm_tick + tm_tickMinute; только новые запуски',consequence:o.paused?'Сотрудник6 плановые запуски пропускаются; вебхуки и начатые процессы продолжаются.':'Очередь может продолжить отправки; возможна накопившаяся работа, пропущенные запуски и дубли не исключены.'}); }
function rcot_validOp_(o) {
  return rcot_exact_(o,['id','base','paused','at','until','approved']) && rcot_id_(o.id) && rcot_int_(o.base) &&
    typeof o.paused==='boolean' && typeof o.approved==='boolean' && rcot_int_(o.at) && rcot_int_(o.until) && o.until-o.at===120000;
}
function rcot_read_() {
  var raw=PropertiesService.getScriptProperties().getProperty(RCOT_KEY_);
  if (raw===null) return {v:1,revision:0,paused:false,pending:null,ledger:[]};
  if (typeof raw!=='string'||raw.length>7500) rcot_fail_();
  var s; try { s=JSON.parse(raw); } catch(e) { rcot_fail_(); }
  if (!rcot_exact_(s,['v','revision','paused','pending','ledger'])||s.v!==1||!rcot_int_(s.revision)||typeof s.paused!=='boolean'||
      !Array.isArray(s.ledger)||s.ledger.length>8|| (s.pending!==null&&!rcot_validOp_(s.pending))) rcot_fail_();
  var ids={},last=0;
  s.ledger.forEach(function(x){
    if (!rcot_exact_(x,['op','revision'])||!rcot_validOp_(x.op)||x.op.approved!==true||!rcot_int_(x.revision)||x.revision!==x.op.base+1||
        x.revision<=last||x.revision>s.revision||ids[x.op.id]) rcot_fail_();
    ids[x.op.id]=true;last=x.revision;
  });
  if ((s.revision===0&&(s.paused!==false||s.ledger.length!==0))||
      (s.revision>0&&(!s.ledger.length||last!==s.revision||s.ledger[s.ledger.length-1].op.paused!==s.paused))||
      (s.pending&&(ids[s.pending.id]||s.pending.base!==s.revision||s.pending.paused===s.paused))) rcot_fail_();
  return s;
}
function rcot_locked_(f) { var lock=LockService.getScriptLock(); if(!lock.tryLock(5000)) rcot_fail_(); try{return f();}finally{lock.releaseLock();} }
function rcot_write_(s) {
  var raw=JSON.stringify(s); if(raw.length>7500) rcot_fail_();
  // Never retry a write with unknown outcome. Caller must read status.
  try { PropertiesService.getScriptProperties().setProperty(RCOT_KEY_,raw); }
  catch(e) { return {state:'unknown',automatic_retry:false}; }
  try { if(PropertiesService.getScriptProperties().getProperty(RCOT_KEY_)===raw) return {state:'confirmed'}; }catch(e){}
  return {state:'unknown',automatic_retry:false};
}
function rcot_status() {
  rxb_owner_();
  try {var s=rcot_read_();return {valid:true,paused:s.paused,revision:s.revision,pending:s.pending?{id:s.pending.id,preview:rcot_preview_(s.pending),approved:s.pending.approved,expires_at:s.pending.until}:null};}
  catch(e) {return {valid:false,paused:true,state:'invalid_or_unavailable'};}
}
function rcot_prepare(paused) {
  rxb_owner_(); if(typeof paused!=='boolean')rcot_fail_();
  return rcot_locked_(function(){
    var s=rcot_read_(),now=Date.now(); if(s.paused===paused||s.revision>=Number.MAX_SAFE_INTEGER)rcot_fail_();
    if(s.pending&&s.pending.until>now) {
      if(s.pending.paused!==paused)rcot_fail_();
      return {state:'prepared',id:s.pending.id,preview:rcot_preview_(s.pending),approved:s.pending.approved};
    }
    s.pending={id:Utilities.getUuid(),base:s.revision,paused:paused,at:now,until:now+120000,approved:false};
    if(!rcot_validOp_(s.pending))rcot_fail_();
    var result=rcot_write_(s); return {state:result.state==='confirmed'?'prepared':'unknown',id:s.pending.id,preview:rcot_preview_(s.pending),approved:false,automatic_retry:false};
  });
}
function rcot_match_(s,id,preview) {
  var o=s.pending;
  if(!rcot_id_(id)||typeof preview!=='string'||preview.length>900||!o||o.id!==id||rcot_preview_(o)!==preview||o.until<=Date.now()||o.at>Date.now()||o.base!==s.revision)rcot_fail_();
  return o;
}
function rcot_approve(id,preview) {
  rxb_owner_();return rcot_locked_(function(){var s=rcot_read_(),o=rcot_match_(s,id,preview);if(o.approved)return {state:'approved',id:id};
    o.approved=true;var r=rcot_write_(s);return {state:r.state==='confirmed'?'approved':'unknown',id:id,automatic_retry:false};});
}
function rcot_apply(id,preview) {
  rxb_owner_(); if(!rcot_id_(id)||typeof preview!=='string'||preview.length>900)rcot_fail_();
  return rcot_locked_(function(){
    var s=rcot_read_(),receipt=s.ledger.filter(function(x){return x.op.id===id;})[0];
    if(receipt){if(rcot_preview_(receipt.op)!==preview)rcot_fail_();return {state:'applied',id:id,revision:receipt.revision,duplicate:true};}
    var o=rcot_match_(s,id,preview);if(o.approved!==true)rcot_fail_();
    s.paused=o.paused;s.revision++;s.ledger.push({op:o,revision:s.revision});s.ledger=s.ledger.slice(-8);s.pending=null;
    var r=rcot_write_(s);return {state:r.state==='confirmed'?'applied':'unknown',id:id,revision:r.state==='confirmed'?s.revision:null,duplicate:false,automatic_retry:false};
  });
}
function rcot_operationStatus(id) {
  rxb_owner_();if(!rcot_id_(id))rcot_fail_();
  try {var s=rcot_read_(),x=s.ledger.filter(function(x){return x.op.id===id;})[0];
    if(x)return {state:'applied',id:id,revision:x.revision,paused:x.op.paused};
    if(s.pending&&s.pending.id===id)return {state:s.pending.until<=Date.now()?'expired':s.pending.approved?'approved':'prepared',id:id,preview:rcot_preview_(s.pending)};
    return {state:'unknown_or_evicted',id:id,automatic_retry:false};
  }catch(e){return {state:'unknown',id:id,automatic_retry:false};}
}
// FIRST executable statement in both timer handlers. Missing state retains behavior.
// Does not require a browser session. Corrupt/unreadable state stops new ticks safely.
function rcot_timersPaused_(){try{return rcot_read_().paused;}catch(e){return true;}}
function rcot_render_(){
  rxb_owner_();
  return HtmlService.createHtmlOutput(rcot_html_()).setTitle('Плановые процессы MAX');
}
function rcot_html_(){return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Плановые процессы MAX</title>
<style>body{font:17px system-ui;max-width:780px;margin:30px auto;padding:18px}button{font:inherit;padding:12px;margin:6px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:14px}#warning{border:2px solid #a60;padding:15px}</style>
<h1>Плановые процессы MAX</h1><p id="warning">Пауза новых запусков tm_tick и tm_tickMinute: опросы, напоминания, продажи, анкеты, персонал, экспорт, обслуживание, почтовые команды, отправка опросов, резервная очередь, push, timerOutbox и старый HTTP-вход внутри минутного таймера. Независимые вебхуки и уже начатые запуски продолжаются. Это не полная остановка бота и не очередь помощников. MODE и расписание триггеров не меняются. После возобновления может выполниться накопившаяся работа. Пропущенные запуски и отсутствие дублей не гарантируются.</p>
<button id="refresh">Обновить статус</button><button id="pause">Подготовить паузу</button><button id="resume">Подготовить возобновление</button><pre id="status">Загрузка…</pre>
<h2>Проверка изменения</h2><pre id="preview">Изменение не подготовлено</pre><button id="approve" disabled>Одобрить именно это изменение</button><button id="apply" disabled>Применить одобренное изменение</button><button id="check" disabled>Проверить исход операции</button><p id="result" role="status"></p>
<script>
let op=null,busy=false;const el=id=>document.getElementById(id);
function controls(){['refresh','pause','resume'].forEach(id=>el(id).disabled=busy);el('approve').disabled=busy||!op||op.state!=='prepared';el('apply').disabled=busy||!op||op.state!=='approved';el('check').disabled=busy||!op;}
function call(name,args,done){if(busy)return;busy=true;controls();google.script.run.withSuccessHandler(r=>{busy=false;done(r);controls();}).withFailureHandler(()=>{busy=false;if(op)op.state='unknown';el('result').textContent='Исход неизвестен или запрос отклонён. Автоповтора нет. Проверьте исход операции и статус.';controls();})[name](...args);}
function status(){call('rcot_status',[],r=>{el('status').textContent=r.valid?('Сохранённая настройка новых плановых запусков: '+(r.paused?'ПАУЗА':'РАЗРЕШЕНЫ')+'; версия '+r.revision):'Состояние недоступно или повреждено. Сотрудник6 запуски блокируются.';if(!op&&r.pending){op={id:r.pending.id,preview:r.pending.preview,state:'unknown'};el('preview').textContent=op.preview;el('result').textContent='Найдена предыдущая операция. Проверьте её исход.';}});}
function prepare(paused){call('rcot_prepare',[paused],r=>{op=r;el('preview').textContent=r.preview;el('result').textContent=r.state==='prepared'?'Проверьте изменение и последствия выше. Затем отдельно одобрите и примените.':'Исход подготовки неизвестен. Проверьте операцию.';});}
el('refresh').onclick=status;el('pause').onclick=()=>prepare(true);el('resume').onclick=()=>prepare(false);
el('approve').onclick=()=>call('rcot_approve',[op.id,op.preview],r=>{op.state=r.state;el('result').textContent=r.state==='approved'?'Одобрено, но ещё не применено.':'Исход неизвестен. Проверьте операцию.';});
el('apply').onclick=()=>call('rcot_apply',[op.id,op.preview],r=>{op.state=r.state;el('result').textContent=r.state==='applied'?'Применено. Обновите статус.':'Исход неизвестен. Не повторяйте применение; проверьте операцию.';});
el('check').onclick=()=>call('rcot_operationStatus',[op.id],r=>{op.state=r.state;if(r.preview){op.preview=r.preview;el('preview').textContent=r.preview;}el('result').textContent='Исход операции: '+r.state+'; после applied обновите статус.';});status();
</script></html>`;}
