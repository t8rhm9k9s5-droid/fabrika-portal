/* OFFLINE CANDIDATE. Only b2News_, tgDone_, b2LiveAlert_ entry gates; no global Telegram stop.
 * A single bounded property commits pause state and operation receipt together.
 * Private helpers end in _. Own rctg_owner_ checks exact active AND effective owner.
 */
function rctg_owner_() {
  var active=Session.getActiveUser().getEmail(),effective=Session.getEffectiveUser().getEmail();
  if(active!=='user1@example.org'||effective!=='user1@example.org') rctg_fail_();
}
var RCTG_KEY_ = 'REX_TELEGRAM_JOBS_OWNER_V1';
function rctg_fail_() { throw new Error('Telegram jobs control rejected'); }
function rctg_exact_(o, keys) { return o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).sort().join('|')===keys.slice().sort().join('|'); }
function rctg_id_(s) { return typeof s==='string' && /^[a-f0-9-]{36}$/.test(s); }
function rctg_int_(n) { return Number.isSafeInteger(n) && n>=0; }
function rctg_preview_(o) { return JSON.stringify({version:1,id:o.id,expected_revision:o.base,paused:o.paused,issued_at:o.at,expires_at:o.until,scope:'b2News_ + tgDone_ + b2LiveAlert_; только новые вызовы',consequence:o.paused?'Новые вызовы трёх процессов пропускаются целиком, включая чтение, отправки и отметки; начатые процессы продолжаются.':'Обработка и отправки возобновятся; возможна накопившаяся работа, пропущенные запуски и дубли не исключены.'}); }
function rctg_validOp_(o) {
  return rctg_exact_(o,['id','base','paused','at','until','approved']) && rctg_id_(o.id) && rctg_int_(o.base) &&
    typeof o.paused==='boolean' && typeof o.approved==='boolean' && rctg_int_(o.at) && rctg_int_(o.until) && o.until-o.at===120000;
}
function rctg_read_() {
  var raw=PropertiesService.getScriptProperties().getProperty(RCTG_KEY_);
  if (raw===null) return {v:1,revision:0,paused:false,pending:null,ledger:[]};
  if (typeof raw!=='string'||raw.length>7500) rctg_fail_();
  var s; try { s=JSON.parse(raw); } catch(e) { rctg_fail_(); }
  if (!rctg_exact_(s,['v','revision','paused','pending','ledger'])||s.v!==1||!rctg_int_(s.revision)||typeof s.paused!=='boolean'||
      !Array.isArray(s.ledger)||s.ledger.length>8|| (s.pending!==null&&!rctg_validOp_(s.pending))) rctg_fail_();
  var ids={},last=0;
  s.ledger.forEach(function(x){
    if (!rctg_exact_(x,['op','revision'])||!rctg_validOp_(x.op)||x.op.approved!==true||!rctg_int_(x.revision)||x.revision!==x.op.base+1||
        x.revision<=last||x.revision>s.revision||ids[x.op.id]) rctg_fail_();
    ids[x.op.id]=true;last=x.revision;
  });
  if ((s.revision===0&&(s.paused!==false||s.ledger.length!==0))||
      (s.revision>0&&(!s.ledger.length||last!==s.revision||s.ledger[s.ledger.length-1].op.paused!==s.paused))||
      (s.pending&&(ids[s.pending.id]||s.pending.base!==s.revision||s.pending.paused===s.paused))) rctg_fail_();
  return s;
}
function rctg_locked_(f) { var lock=LockService.getScriptLock(); if(!lock.tryLock(5000)) rctg_fail_(); try{return f();}finally{lock.releaseLock();} }
function rctg_write_(s) {
  var raw=JSON.stringify(s); if(raw.length>7500) rctg_fail_();
  // Never retry a write with unknown outcome. Caller must read status.
  try { PropertiesService.getScriptProperties().setProperty(RCTG_KEY_,raw); }
  catch(e) { return {state:'unknown',automatic_retry:false}; }
  try { if(PropertiesService.getScriptProperties().getProperty(RCTG_KEY_)===raw) return {state:'confirmed'}; }catch(e){}
  return {state:'unknown',automatic_retry:false};
}
function rctg_status() {
  rctg_owner_();
  try {var s=rctg_read_();return {valid:true,paused:s.paused,revision:s.revision,pending:s.pending?{id:s.pending.id,preview:rctg_preview_(s.pending),approved:s.pending.approved,expires_at:s.pending.until}:null};}
  catch(e) {return {valid:false,paused:true,state:'invalid_or_unavailable'};}
}
function rctg_prepare(paused) {
  rctg_owner_(); if(typeof paused!=='boolean')rctg_fail_();
  return rctg_locked_(function(){
    var s=rctg_read_(),now=Date.now(); if(s.paused===paused||s.revision>=Number.MAX_SAFE_INTEGER)rctg_fail_();
    if(s.pending&&s.pending.until>now) {
      if(s.pending.paused!==paused)rctg_fail_();
      return {state:'prepared',id:s.pending.id,preview:rctg_preview_(s.pending),approved:s.pending.approved};
    }
    s.pending={id:Utilities.getUuid(),base:s.revision,paused:paused,at:now,until:now+120000,approved:false};
    if(!rctg_validOp_(s.pending))rctg_fail_();
    var result=rctg_write_(s); return {state:result.state==='confirmed'?'prepared':'unknown',id:s.pending.id,preview:rctg_preview_(s.pending),approved:false,automatic_retry:false};
  });
}
function rctg_match_(s,id,preview) {
  var o=s.pending;
  if(!rctg_id_(id)||typeof preview!=='string'||preview.length>900||!o||o.id!==id||rctg_preview_(o)!==preview||o.until<=Date.now()||o.at>Date.now()||o.base!==s.revision)rctg_fail_();
  return o;
}
function rctg_approve(id,preview) {
  rctg_owner_();return rctg_locked_(function(){var s=rctg_read_(),o=rctg_match_(s,id,preview);if(o.approved)return {state:'approved',id:id};
    o.approved=true;var r=rctg_write_(s);return {state:r.state==='confirmed'?'approved':'unknown',id:id,automatic_retry:false};});
}
function rctg_apply(id,preview) {
  rctg_owner_(); if(!rctg_id_(id)||typeof preview!=='string'||preview.length>900)rctg_fail_();
  return rctg_locked_(function(){
    var s=rctg_read_(),receipt=s.ledger.filter(function(x){return x.op.id===id;})[0];
    if(receipt){if(rctg_preview_(receipt.op)!==preview)rctg_fail_();return {state:'applied',id:id,revision:receipt.revision,duplicate:true};}
    var o=rctg_match_(s,id,preview);if(o.approved!==true)rctg_fail_();
    s.paused=o.paused;s.revision++;s.ledger.push({op:o,revision:s.revision});s.ledger=s.ledger.slice(-8);s.pending=null;
    var r=rctg_write_(s);return {state:r.state==='confirmed'?'applied':'unknown',id:id,revision:r.state==='confirmed'?s.revision:null,duplicate:false,automatic_retry:false};
  });
}
function rctg_operationStatus(id) {
  rctg_owner_();if(!rctg_id_(id))rctg_fail_();
  try {var s=rctg_read_(),x=s.ledger.filter(function(x){return x.op.id===id;})[0];
    if(x)return {state:'applied',id:id,revision:x.revision,paused:x.op.paused};
    if(s.pending&&s.pending.id===id)return {state:s.pending.until<=Date.now()?'expired':s.pending.approved?'approved':'prepared',id:id,preview:rctg_preview_(s.pending)};
    return {state:'unknown_or_evicted',id:id,automatic_retry:false};
  }catch(e){return {state:'unknown',id:id,automatic_retry:false};}
}
// FIRST executable statement in b2News_, tgDone_, b2LiveAlert_. Missing state retains behavior.
// Does not require a browser session. Corrupt/unreadable state stops new calls safely.
function rctg_jobsPaused_(){try{return rctg_read_().paused;}catch(e){return true;}}
function rctg_render_(){
  rctg_owner_();
  return HtmlService.createHtmlOutput(rctg_html_()).setTitle('Новости и отчёты Telegram');
}
function rctg_html_(){return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Новости и отчёты Telegram</title>
<style>body{font:17px system-ui;max-width:780px;margin:30px auto;padding:18px}button{font:inherit;padding:12px;margin:6px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#eee;padding:14px}#warning{border:2px solid #a60;padding:15px}</style>
<h1>Новости и отчёты Telegram</h1><p id="warning">Пауза новых вызовов трёх функций целиком: b2News_ — обработка новостей, посты и личные сообщения, синхронизация голосовых, данные вопросов и отметки новостей; tgDone_ — получение ленты завершений, jDone_, сообщения о завершении и очистка команд; b2LiveAlert_ — получение и отправка live-уведомления и отметка live_alert. Это не полная остановка Telegram и не только отключение отправок. Общий poll и WebPush, остальные напоминания, погода и siteping в bot2Tick_, входящий вебхук и очередь, heartbeat и tracking g4, cp_flush продолжаются. Уже начатые вызовы могут завершиться. Расписание не меняется. После возобновления может выполниться накопившаяся работа. Восстановление пропущенных запусков и отсутствие дублей не гарантируются.</p>
<button id="refresh">Обновить статус</button><button id="pause">Подготовить паузу</button><button id="resume">Подготовить возобновление</button><pre id="status">Загрузка…</pre>
<h2>Проверка изменения</h2><pre id="preview">Изменение не подготовлено</pre><button id="approve" disabled>Одобрить именно это изменение</button><button id="apply" disabled>Применить одобренное изменение</button><button id="check" disabled>Проверить исход операции</button><p id="result" role="status"></p>
<script>
let op=null,busy=false;const el=id=>document.getElementById(id);
function controls(){['refresh','pause','resume'].forEach(id=>el(id).disabled=busy);el('approve').disabled=busy||!op||op.state!=='prepared';el('apply').disabled=busy||!op||op.state!=='approved';el('check').disabled=busy||!op;}
function call(name,args,done){if(busy)return;busy=true;controls();google.script.run.withSuccessHandler(r=>{busy=false;done(r);controls();}).withFailureHandler(()=>{busy=false;if(op)op.state='unknown';el('result').textContent='Исход неизвестен или запрос отклонён. Автоповтора нет. Проверьте исход операции и статус.';controls();})[name](...args);}
function status(){call('rctg_status',[],r=>{el('status').textContent=r.valid?('Сохранённая настройка новых вызовов трёх процессов: '+(r.paused?'ПАУЗА':'РАЗРЕШЕНЫ')+'; версия '+r.revision):'Состояние недоступно или повреждено. Новые запуски блокируются.';if(!op&&r.pending){op={id:r.pending.id,preview:r.pending.preview,state:'unknown'};el('preview').textContent=op.preview;el('result').textContent='Найдена предыдущая операция. Проверьте её исход.';}});}
function prepare(paused){call('rctg_prepare',[paused],r=>{op=r;el('preview').textContent=r.preview;el('result').textContent=r.state==='prepared'?'Проверьте изменение и последствия выше. Затем отдельно одобрите и примените.':'Исход подготовки неизвестен. Проверьте операцию.';});}
el('refresh').onclick=status;el('pause').onclick=()=>prepare(true);el('resume').onclick=()=>prepare(false);
el('approve').onclick=()=>call('rctg_approve',[op.id,op.preview],r=>{op.state=r.state;el('result').textContent=r.state==='approved'?'Одобрено, но ещё не применено.':'Исход неизвестен. Проверьте операцию.';});
el('apply').onclick=()=>call('rctg_apply',[op.id,op.preview],r=>{op.state=r.state;el('result').textContent=r.state==='applied'?'Применено. Обновите статус.':'Исход неизвестен. Не повторяйте применение; проверьте операцию.';});
el('check').onclick=()=>call('rctg_operationStatus',[op.id],r=>{op.state=r.state;if(r.preview){op.preview=r.preview;el('preview').textContent=r.preview;}el('result').textContent='Исход операции: '+r.state+'; после applied обновите статус.';});status();
</script></html>`;}
