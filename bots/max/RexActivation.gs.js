/* Owner-only activation UI. Secrets are form inputs, never source literals. */
function rxa_fail_(){throw Error('activation unavailable; owner inspection required');}
function rxa_targets_(){return {max:['-100000000003','-100000000005','-100000000004','-100000000002'],telegram:['188811460','202625208','2058291998']};}
function rxa_sameSet_(a,b){return Array.isArray(a)&&a.length===b.length&&a.every(function(v,i){return typeof v==='string'&&a.indexOf(v)===i&&b.indexOf(v)>=0;});}
function rxa_actions_(bot){return bot==='max'?['status.read','chats.list','messages.read','message.send','message.reply','queue.pause','queue.resume']:['status.read','chats.list','message.send','message.reply','queue.pause','queue.resume'];}
function rxa_approvedConfig_(p,c){
 var targets=rxa_targets_(),prepared=rxb_json_(p,'REXCTL_PREPARED_JOURNAL_V1');
 if(!rxb_exact_(c.allowed_targets,['max','telegram'])||!rxb_exact_(c.bot_ids,['max','telegram'])||c.bot_ids.max!=='539375202'||c.bot_ids.telegram!=='8743932140'||c.telegram_mode!=='direct'||c.max_origin!=='https://platform-api.max.ru'||c.owner_email!=='user1@example.org')rxa_fail_();
 if(!rxb_exact_(c.journal,['root','generation'])||!rxb_exact_(prepared,['root','generation'])||prepared.root!=='REDACTED_ID_3'||prepared.generation!=='rexctl-20261108'||RexControl.canonical(c.journal)!==RexControl.canonical(prepared))rxa_fail_();
 ['max','telegram'].forEach(function(bot){if(!rxa_sameSet_(c.allowed_targets[bot],targets[bot]))rxa_fail_();});
 ['rex','claude'].forEach(function(actor){if(!c.principals.some(function(v){return v.actor_id===actor&&v.issuer_id==='fabrika-mcp-gateway-v1';}))rxa_fail_();});
}
function rxa_validateSetup_(p,v){
 if(!rxb_exact_(v,['config','keys','policies'])||!rxb_exact_(v.keys,['rex','claude'])||!rxb_exact_(v.policies,['rex','claude']))rxa_fail_();
 var values={REXCTL_CONFIG_V1:JSON.stringify(v.config),REXCTL_GATEWAY_KEYS_V1:JSON.stringify(v.keys),REXCTL_POLICIES_V1:JSON.stringify(v.policies)};
 Object.keys(values).forEach(function(k){if(values[k].length>8000)rxa_fail_();});
 var shadow={getProperty:function(k){return Object.prototype.hasOwnProperty.call(values,k)?values[k]:p.getProperty(k);}},c=rxb_config_(shadow,false);
 rxa_approvedConfig_(p,c);
 ['rex','claude'].forEach(function(actor){
  var key=v.keys[actor],policy=rxb_policy_(shadow,c,actor);
  if(!rxb_exact_(key,['issuer_id','secret_hex'])||key.issuer_id!=='fabrika-mcp-gateway-v1'||typeof key.secret_hex!=='string'||!/^[a-f0-9]{64}$/.test(key.secret_hex)||policy.enabled!==true||policy.role!=='operator'||policy.revision!==1||policy.scopes.length!==7)rxa_fail_();
  ['max','telegram'].forEach(function(bot){c.allowed_targets[bot].forEach(function(target){var scope=policy.scopes.filter(function(s){return s.bot===bot&&s.target_id===target;});if(scope.length!==1||!rxa_sameSet_(scope[0].actions,rxa_actions_(bot)))rxa_fail_();});});
 });
 if(v.keys.rex.secret_hex===v.keys.claude.secret_hex)rxa_fail_();
 return c;
}
function rxa_mark_(p,key,value){var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxa_fail_();try{var s=JSON.stringify(value);p.setProperty(key,s);if(p.getProperty(key)!==s)rxa_fail_();}finally{lock.releaseLock();}}
function rxa_renderSetup_(){
 rxb_owner_();
 var html='<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;max-width:760px;margin:40px auto;padding:0 20px}label{display:block;margin-top:22px}input{display:block;box-sizing:border-box;width:100%;padding:12px;margin-top:8px}button{margin-top:24px;padding:12px 18px}pre{white-space:pre-wrap}</style></head><body><h1>Фабрика — подключение ботов</h1><p>Установка доступна только владельцу. Она сохраняет параметры и включает чтение. Сообщения не отправляются.</p><form id="setup" autocomplete="off"><label for="setupJson">JSON подготовленных настроек</label><input id="setupJson" type="password" autocomplete="new-password" spellcheck="false" maxlength="24000" required><label for="tgToken">Токен Telegram для исполнителя Google</label><input id="tgToken" type="password" autocomplete="new-password" spellcheck="false" maxlength="250" required><button id="submit" type="submit">Установить и включить чтение</button></form><pre id="status" role="status"></pre><script>document.getElementById("setup").addEventListener("submit",function(e){e.preventDefault();var b=document.getElementById("submit"),j=document.getElementById("setupJson"),t=document.getElementById("tgToken"),s=document.getElementById("status");b.disabled=true;s.textContent="Установка…";google.script.run.withSuccessHandler(function(r){j.value="";t.value="";s.textContent=JSON.stringify(r,null,2);}).withFailureHandler(function(){j.value="";t.value="";s.textContent="Установка остановлена. Не повторяйте запуск: требуется проверка владельцем.";}).rxa_installApprovedSetup(j.value,t.value);});</script></body></html>';
 return HtmlService.createHtmlOutput(html).setTitle('Фабрика — подключение ботов');
}
function rxa_installApprovedSetup(text,token){
 rxb_owner_();
 if(typeof text!=='string'||!text||text.length>24000||typeof token!=='string'||!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token))rxa_fail_();
 var v;try{v=JSON.parse(text);}catch(ignore){rxa_fail_();}
 var p=PropertiesService.getScriptProperties(),c=rxa_validateSetup_(p,v),stage='preflight';
 if(c.enabled!==false||c.effects_enabled!==false||p.getProperty('REXCTL_CONFIG_V1')!==null||p.getProperty('REXCTL_ACTIVATION_STAGE_V1')!==null)rxa_fail_();
 var existing=p.getProperty('TG_TOKEN');if(existing!==null&&existing!==token)rxa_fail_();
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxa_fail_();
 try{
  if(p.getProperty('REXCTL_CONFIG_V1')!==null||p.getProperty('REXCTL_ACTIVATION_STAGE_V1')!==null)rxa_fail_();
  existing=p.getProperty('TG_TOKEN');if(existing!==null&&existing!==token)rxa_fail_();
  p.setProperty('REXCTL_ACTIVATION_STAGE_V1',JSON.stringify({state:'installing',started_at:Date.now()}));
  if(existing===null)p.setProperty('TG_TOKEN',token);
  if(p.getProperty('TG_TOKEN')!==token)rxa_fail_();
 }finally{lock.releaseLock();}
 try{
  stage='prepare_disabled';rexctl_prepareDisabled(v.config,v.keys,v.policies);
  stage='initialize_gates';var gates=rexctl_initializeGates();if(gates.ok!==true||gates.gates.length!==7||gates.gates.some(function(g){return g.paused!==true||g.revision!==0;}))rxa_fail_();
  stage='enable_read';rexctl_setEnabled(true,false);
  stage='read_ready';rxa_mark_(p,'REXCTL_ACTIVATION_STAGE_V1',{state:stage,completed_at:Date.now(),gate_count:7});
  var out={ok:true,state:stage,enabled:true,effects_enabled:false,max_chats:4,telegram_chats:3,paused_gates:7};console.log(JSON.stringify(out));return out;
 }catch(ignore){
  try{rxa_mark_(p,'REXCTL_ACTIVATION_STAGE_V1',{state:'stopped',stage:stage,at:Date.now()});}catch(ignored){}
  var out={ok:false,state:'stopped',stage:stage,manual_inspection_required:true};console.log(JSON.stringify(out));return out;
 }
}
function rxa_enableApprovedEffectsAndResume(){
 rxb_owner_();var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,true),stage='preflight',completed=0;
 rxa_validateSetup_(p,{config:c,keys:rxb_json_(p,'REXCTL_GATEWAY_KEYS_V1'),policies:rxb_json_(p,'REXCTL_POLICIES_V1')});
 var ready=rxb_json_(p,'REXCTL_ACTIVATION_STAGE_V1');
 if(c.effects_enabled!==false||ready.state!=='read_ready'||p.getProperty('REXCTL_EFFECTS_RESUME_V1')!==null)rxa_fail_();
 rcj_withLock_(c.journal,function(s){['max','telegram'].forEach(function(bot){c.allowed_targets[bot].forEach(function(target){var gate=rcq_read_(s,bot,target);if(gate.paused!==true||gate.revision!==0)rxa_fail_();});});});
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxa_fail_();
 try{if(p.getProperty('REXCTL_EFFECTS_RESUME_V1')!==null||RexControl.canonical(c)!==RexControl.canonical(rxb_config_(p,true)))rxa_fail_();p.setProperty('REXCTL_EFFECTS_RESUME_V1',JSON.stringify({state:'starting',at:Date.now(),completed_gates:0}));}finally{lock.releaseLock();}
 try{
  stage='enable_effects';rexctl_setEnabled(true,true);
  ['max','telegram'].forEach(function(bot){c.allowed_targets[bot].forEach(function(target){
   stage='resume_gate';var now=Date.now(),unique=Utilities.getUuid();
   var q={version:'rexctl-v1',command_id:'activation-resume-'+unique,action:'queue.resume',bot:bot,target_id:target,payload:{},issued_at:now,expires_at:now+120000,authorization_ref:'activation-approval-'+unique,expected_revision:0};
   rexctl_approveExactCommand('rex',q);
   var envelope={op:'rexctl',version:'rex-gateway-v1',actor_id:'rex',issuer_id:'fabrika-mcp-gateway-v1',issued_at:now,expires_at:now+60000,nonce:'activation-nonce-'+unique,request:q};
   envelope.signature=rxb_hmac_(envelope,rxb_json_(p,'REXCTL_GATEWAY_KEYS_V1').rex.secret_hex);
   var result=rexctl_handleEnvelope_(envelope);
   if(!result||result.ok!==true||result.state!=='succeeded'||result.revision!==1||result.duplicate!==false)rxa_fail_();
   completed++;rxa_mark_(p,'REXCTL_EFFECTS_RESUME_V1',{state:'resuming',at:Date.now(),completed_gates:completed});
  });});
  stage='effects_ready';rxa_mark_(p,'REXCTL_EFFECTS_RESUME_V1',{state:stage,at:Date.now(),completed_gates:completed});
  var out={ok:true,state:stage,effects_enabled:true,resumed_gates:completed,messages_sent:0};console.log(JSON.stringify(out));return out;
 }catch(ignore){
  var disabled=false;try{rexctl_setEnabled(true,false);disabled=true;}catch(ignored){}
  try{rxa_mark_(p,'REXCTL_EFFECTS_RESUME_V1',{state:'stopped',stage:stage,at:Date.now(),completed_gates:completed,effects_disabled:disabled});}catch(ignored){}
  var out={ok:false,state:'stopped',stage:stage,completed_gates:completed,effects_disabled:disabled,manual_inspection_required:true};console.log(JSON.stringify(out));return out;
 }
}
