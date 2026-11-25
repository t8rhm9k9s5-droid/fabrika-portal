/* Manual setup only. No fetch, poll, drain, triggers, subscriptions or keys returned. */
function lmhs_prepareProduction(){return lmhs_locked_(function(p){
  var c=lmhs_read_(p);lmhs_keys_(p);
  if(p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED')==='1'||c.enabled!==false||['legacy_canary_20261106','legacy_prod_20261107'].indexOf(c.namespace)<0)throw Error('setup state');
  lmhs_target_(c);lmhs_schema_(c);
  c.namespace='legacy_prod_20261107';c.enabled=false;
  p.setProperty('MAX_HTTP_LEGACY_AUTO_ENABLED','0');
  p.setProperty('MAX_HTTP_LEGACY_INGRESS_V1',JSON.stringify(c));
  if(p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED')!=='0'||JSON.stringify(lmhs_read_(p))!==JSON.stringify(c))throw Error('setup unknown');
  return {state:'production_config_disabled_verified',previous_canary_preserved:true};
});}
function lmhs_preflightProduction(){return lmhs_locked_(function(p){var c=lmhs_read_(p);lmhs_keys_(p);lmhs_target_(c);if(c.namespace!=='legacy_prod_20261107'||c.enabled!==false||p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED')!=='0')throw Error('preflight state');lmhs_schema_(c);var d=mhl_dependencies_(c),r=d.readRow('REDACTED_HEX_14');var marker=!!(r&&String(r[2])==='ingress_probe_noop_v1'&&d.readBody(String(r[7]))==='{'+'"update_type":"ingress_probe_noop_v1","timestamp":1794000000000}');return {state:'production_preflight_ok',enabled:false,root_schema_verified:true,source_canary_key:'REDACTED_HEX_14',canary_marker_checked:true,canary_marker_present:marker};});}
function lmhs_locked_(fn){var l=LockService.getScriptLock();if(!l.tryLock(1500))throw Error('setup busy');try{return fn(PropertiesService.getScriptProperties());}finally{l.releaseLock();}}
function lmhs_read_(p){var c;try{c=JSON.parse(p.getProperty('MAX_HTTP_LEGACY_INGRESS_V1')||'null');}catch(e){throw Error('setup config');}if(!c||typeof c!=='object'||Array.isArray(c))throw Error('setup config');return c;}
function lmhs_keys_(p){['MAX_HTTP_INGRESS_READ_KEY','MAX_HTTP_INGRESS_ACK_KEY'].forEach(function(k){if(!/^[A-Za-z0-9_-]{32,256}$/.test(p.getProperty(k)||''))throw Error('setup key unavailable');});}
function lmhs_target_(c){if(c.v!==1||c.endpoint!=='https://max-durable-ingress-100000000002.us-central1.run.app'||c.receipt_kind!=='legacy_max_in_v1'||c.legacy_sheet_id!=='REDACTED_ID_4')throw Error('setup target');}
function lmhs_schema_(c){if(typeof mx_isGoogle!=='function'||mx_isGoogle()!==true)throw Error('setup mode');mhl_dependencies_(c).verifyRootSchema();}
/* Activation requires operator-confirmed live server namespace/root/kind and health.
 * No server call here; these guards cannot attest remote state. */
function lmhs_enableProduction(){return lmhs_locked_(function(p){
  var c=lmhs_read_(p);lmhs_keys_(p);lmhs_target_(c);
  if(c.namespace!=='legacy_prod_20261107'||typeof c.enabled!=='boolean'||['0','1'].indexOf(p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED'))<0||typeof lmhi_timerJob_!=='function'||typeof lmhi_realTimerJob_!=='function')throw Error('activation state');
  lmhs_schema_(c);
  var raw=p.getProperty('MAX_HTTP_LEGACY_LAST_POLL_V1');
  if(raw){var f;try{f=JSON.parse(raw);}catch(e){throw Error('activation fence');}
    if(!f||f.namespace!==c.namespace||!Number.isSafeInteger(f.minute)||f.minute<0||f.minute>Math.floor(Date.now()/60000))throw Error('activation fence');}
  try{
    c.enabled=true;p.setProperty('MAX_HTTP_LEGACY_INGRESS_V1',JSON.stringify(c));
    if(JSON.stringify(lmhs_read_(p))!==JSON.stringify(c))throw Error('activation readback');
    p.setProperty('MAX_HTTP_LEGACY_AUTO_ENABLED','1');
    if(p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED')!=='1'||JSON.stringify(lmhs_read_(p))!==JSON.stringify(c))throw Error('activation readback');
  }catch(e){try{p.setProperty('MAX_HTTP_LEGACY_AUTO_ENABLED','0');c.enabled=false;p.setProperty('MAX_HTTP_LEGACY_INGRESS_V1',JSON.stringify(c));}catch(ignore){}throw Error('activation unknown; inspect disabled state');}
  return {state:'production_enabled_verified',enabled:true};
});}
function lmhs_disableProduction(){return lmhs_locked_(function(p){
  // Auto flag first, even when config is malformed. No schema/key dependency.
  p.setProperty('MAX_HTTP_LEGACY_AUTO_ENABLED','0');
  if(p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED')!=='0')throw Error('disable unknown');
  var c=lmhs_read_(p);c.enabled=false;p.setProperty('MAX_HTTP_LEGACY_INGRESS_V1',JSON.stringify(c));
  if(p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED')!=='0'||lmhs_read_(p).enabled!==false)throw Error('disable unknown');
  return {state:'production_disabled_verified',enabled:false};
});}
function lmhs_boundedLog_(fn){
  try{var r=fn(),o={state:r.state};['enabled','root_schema_verified','canary_marker_checked','canary_marker_present'].forEach(function(k){if(typeof r[k]==='boolean')o[k]=r[k];});console.log(JSON.stringify(o));return o;}
  catch(e){console.log(JSON.stringify({state:'control_failed_or_unknown'}));throw Error('control failed or unknown; inspect state before retry');}
}
function lmhs_runPrepare(){return lmhs_boundedLog_(lmhs_prepareProduction);}
function lmhs_runPreflight(){return lmhs_boundedLog_(lmhs_preflightProduction);}
function lmhs_runEnable(){return lmhs_boundedLog_(lmhs_enableProduction);}
function lmhs_runDisable(){return lmhs_boundedLog_(lmhs_disableProduction);}

function lws_owner_(){var e='user1@example.org';if(String(Session.getActiveUser().getEmail()).toLowerCase()!==e||String(Session.getEffectiveUser().getEmail()).toLowerCase()!==e)throw Error('Unavailable');}
function lws_types_(){return ['bot_added','bot_removed','bot_started','chat_title_changed','message_callback','message_created','message_edited','message_removed','user_added','user_removed'];}
function lws_target_(){return 'https://max-durable-ingress-100000000002.us-central1.run.app/max';}
function lws_req_(method,path,body){
 var token=tok_();if(typeof token!=='string'||!token)throw Error('Unavailable');
 var opt={method:method.toLowerCase(),muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true,headers:{Authorization:token,Accept:'application/json'}};
 if(body!==undefined){opt.contentType='application/json';opt.payload=JSON.stringify(body);}
 var r=UrlFetchApp.fetch('https://platform-api.max.ru'+path,opt),j;
 try{j=JSON.parse(r.getContentText());}catch(e){throw Error('Unavailable');}
 return {code:r.getResponseCode(),body:j};
}
function lws_identity_(){var r=lws_req_('GET','/me');if(r.code!==200||!r.body||r.body.is_bot!==true||String(r.body.user_id)!=='539375202'||r.body.username!=='id6215018827_bot')throw Error('Identity mismatch');}
function lws_get_(){var r=lws_req_('GET','/subscriptions');if(r.code!==200||!r.body||!Array.isArray(r.body.subscriptions))throw Error('Read unavailable');return r.body.subscriptions;}
function lws_sameTypes_(a){return Array.isArray(a)&&JSON.stringify(a.slice().sort())===JSON.stringify(lws_types_());}
function lws_expectedOld_(){
 var base=String(webappUrl_()||''),secret=PropertiesService.getScriptProperties().getProperty('HOOK_SECRET');
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(base)||typeof secret!=='string'||!/^[A-Za-z0-9_-]{5,256}$/.test(secret))throw Error('Legacy binding');
 return base+'?s='+secret;
}
function lws_load_(){var s=JSON.parse(PropertiesService.getScriptProperties().getProperty('MAX_HTTP_SUB_SWITCH_V1')||'null');
 if(!s||s.v!==1||s.bot_id!=='539375202'||s.target!==lws_target_()||s.old_url!==lws_expectedOld_()||!lws_sameTypes_(s.types)||!s.attempts||typeof s.attempts!=='object'||Array.isArray(s.attempts))throw Error('Snapshot unavailable');return s;
}
function lws_save_(s){var p=PropertiesService.getScriptProperties(),raw=JSON.stringify(s);if(Utilities.newBlob(raw).getBytes().length>8000)throw Error('Snapshot size');p.setProperty('MAX_HTTP_SUB_SWITCH_V1',raw);if(p.getProperty('MAX_HTTP_SUB_SWITCH_V1')!==raw)throw Error('Snapshot readback');}
function lws_presence_(s,rows){
 var out={old:false,new:false};
 rows.forEach(function(r){if(!r||typeof r.url!=='string'||!lws_sameTypes_(r.update_types))throw Error('Unexpected subscription');
  if(r.url===s.old_url){if(out.old)throw Error('Duplicate');out.old=true;}
  else if(r.url===s.target){if(out.new)throw Error('Duplicate');out.new=true;}
  else throw Error('Unexpected destination');
 });return out;
}
function lws_prepare(){
 try{
  lws_owner_();lws_identity_();
  var old=lws_expectedOld_(),rows=lws_get_();
  if(rows.length!==1||rows[0].url!==old||!lws_sameTypes_(rows[0].update_types))throw Error('Initial subscriptions mismatch');
  var s={v:1,bot_id:'539375202',old_url:old,target:lws_target_(),types:rows[0].update_types.slice(),prepared_at:Date.now(),attempts:{}};
  var lock=LockService.getScriptLock();if(!lock.tryLock(1500))throw Error('Busy');
  try{if(PropertiesService.getScriptProperties().getProperty('MAX_HTTP_SUB_SWITCH_V1')!==null)throw Error('Snapshot already exists');lws_save_(s);}finally{lock.releaseLock();}
  return {ok:true,state:'snapshot_saved'};
 }catch(e){return {ok:false,state:'prepare_not_confirmed'};}
}
function lws_inspect(){
 try{lws_owner_();lws_identity_();var s=lws_load_(),v=lws_presence_(s,lws_get_()),a={};
 ['add','remove_old','restore_old','remove_new'].forEach(function(k){if(s.attempts[k])a[k]=s.attempts[k].state;});
 return {ok:true,old_present:v.old,new_present:v.new,attempts:a};
 }catch(e){return {ok:false,state:'inspection_unavailable'};}
}
function lws_step_(op){
 try{
  lws_owner_();if(['add','remove_old','restore_old','remove_new'].indexOf(op)<0)throw Error('Operation');
  lws_identity_();var s=lws_load_(),before=JSON.stringify(s),v=lws_presence_(s,lws_get_()),method,path='/subscriptions',body;
  if(s.attempts[op])return {ok:false,state:'attempt_already_recorded',operation:op};
  if(op==='add'){
   if(!v.old||v.new)throw Error('Add precondition');
   var key=PropertiesService.getScriptProperties().getProperty('MAX_HTTP_INGRESS_WEBHOOK_KEY');
   if(typeof key!=='string'||!/^[A-Za-z0-9_-]{32,256}$/.test(key))throw Error('Key unavailable');
   method='POST';body={url:s.target,update_types:s.types.slice(),secret:key};
  }else if(op==='remove_old'){
   if(!s.attempts.add||s.attempts.add.state!=='verified'||!v.new)throw Error('New subscription not verified');
   if(!v.old)return {ok:true,state:'already_absent',operation:op};
   method='DELETE';path+='?url='+encodeURIComponent(s.old_url);
  }else if(op==='restore_old'){
   if(v.old)return {ok:true,state:'already_present',operation:op};
   method='POST';body={url:s.old_url,update_types:s.types.slice()};
  }else{
   if(!v.old)throw Error('Legacy not verified');
   if(!v.new)return {ok:true,state:'already_absent',operation:op};
   method='DELETE';path+='?url='+encodeURIComponent(s.target);
  }
  var lock=LockService.getScriptLock();if(!lock.tryLock(1500))throw Error('Busy');
  try{
   if(JSON.stringify(lws_load_())!==before)throw Error('Snapshot changed');
   if(Object.keys(s.attempts).some(function(k){return s.attempts[k].state==='started'||s.attempts[k].state==='unknown';}))throw Error('Unresolved attempt');
   s.attempts[op]={state:'started',at:Date.now()};lws_save_(s);
  }finally{lock.releaseLock();}
  var r,after,good=false;
  try{
   r=lws_req_(method,path,body);
   if(r.code===200&&r.body&&r.body.success===true){
    after=lws_presence_(s,lws_get_());
    good=op==='add'?after.new:op==='remove_old'?after.new&&!after.old:op==='restore_old'?after.old:after.old&&!after.new;
   }
  }catch(e){}
  lock=LockService.getScriptLock();if(!lock.tryLock(1500))return {ok:false,state:'unknown',operation:op};
  try{
   var current=lws_load_();
   if(!current.attempts[op]||current.attempts[op].state!=='started')throw Error('State changed');
   current.attempts[op].state=good?'verified':'unknown';lws_save_(current);
  }finally{lock.releaseLock();}
  return {ok:good,state:good?'verified':'unknown',operation:op};
 }catch(e){return {ok:false,state:'not_confirmed',operation:op};}
}
function lws_addOnce(){return lws_step_('add');}
function lws_removeOldOnce(){return lws_step_('remove_old');}
function lws_restoreOldOnce(){return lws_step_('restore_old');}
function lws_removeNewOnce(){return lws_step_('remove_new');}
function lws_log_(fn){var r;try{r=fn();}catch(e){r={ok:false,state:'not_confirmed'};}var o={ok:r.ok===true};if(['snapshot_saved','prepare_not_confirmed','inspection_unavailable','attempt_already_recorded','already_absent','already_present','unknown','not_confirmed','verified'].indexOf(r.state)>=0)o.state=r.state;if(['add','remove_old','restore_old','remove_new'].indexOf(r.operation)>=0)o.operation=r.operation;['old_present','new_present'].forEach(function(k){if(typeof r[k]==='boolean')o[k]=r[k];});if(r.attempts){o.attempts={};['add','remove_old','restore_old','remove_new'].forEach(function(k){if(['started','unknown','verified'].indexOf(r.attempts[k])>=0)o.attempts[k]=r.attempts[k];});}console.log(JSON.stringify(o));return o;}
function lws_runPrepare(){return lws_log_(lws_prepare);}
function lws_runInspect(){return lws_log_(lws_inspect);}
function lws_runAddOnce(){return lws_log_(lws_addOnce);}
function lws_runRemoveOldOnce(){return lws_log_(lws_removeOldOnce);}
function lws_runRestoreOldOnce(){return lws_log_(lws_restoreOldOnce);}
function lws_runRemoveNewOnce(){return lws_log_(lws_removeNewOnce);}
