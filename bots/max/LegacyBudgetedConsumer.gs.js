/* OFFLINE disabled production candidate. Soft budget only; GAS network/storage calls cannot be cancelled. */
function lmhi_timerJob_(ctx) {
  if(typeof lmhm_timer_==='function'){var monitor=lmhm_timer_(ctx);if(monitor.consumed)return monitor.state;}
  var t0=Date.now(),metrics={},state;
  try{state=lmhi_realTimerJob_(ctx,metrics);}catch(e){state='unavailable';}
  var allowed=['disabled','namespace_blocked','mode_disabled','budget_deferred','config_invalid','lock_busy','pull_unknown','invalid_batch','invalid_cursor','empty','held','held_large_body','enqueue_unknown','ack_unknown','imported','minute_already_used','minute_fence_invalid','unavailable','unexpected_state'];
  if(allowed.indexOf(state)<0)state='unexpected_state';
  try{var log={event:'legacy_ingress_tick',state:state,elapsed_ms:Math.max(0,Date.now()-t0)};if(Number.isSafeInteger(metrics.pending_age_seconds))log.pending_age_seconds=metrics.pending_age_seconds;console.log(JSON.stringify(log));}catch(e){}
  return state;
}
function lmhi_realTimerJob_(ctx,metrics) {
  var p=PropertiesService.getScriptProperties();
  if(p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED')!=='1')return 'disabled';
  var deferred=false,inserted=false,dirty=false;
  function need(ms){var n=ctx&&typeof ctx.left==='function'?ctx.left():NaN;if(!Number.isFinite(n)||n<ms){deferred=true;throw Error('budget');}}
  var c;
  try{c=lmhi_config_();if(!c)return 'disabled';if(c.endpoint!=='https://max-durable-ingress-100000000000.us-central1.run.app'||c.namespace!=='legacy_prod_20261107'||c.receipt_kind!=='legacy_max_in_v1'||c.legacy_sheet_id!=='REDACTED_ID')return 'namespace_blocked';if(typeof mx_isGoogle!=='function'||mx_isGoogle()!==true)return 'mode_disabled';need(35000);}
  catch(e){return deferred?'budget_deferred':'config_invalid';}
  var binding=lmhi_sha_(JSON.stringify([c.endpoint,c.namespace,c.receipt_kind,c.legacy_sheet_id])),cursor=null;
  try{cursor=JSON.parse(p.getProperty('MAX_HTTP_LEGACY_INGRESS_CURSOR_V1')||'null');}catch(e){}
  var after=cursor&&cursor.binding===binding&&lmhi_cursor_(cursor.after)?cursor.after:null;
  var deps,batch,lock=null;
  try{
    deps=mhl_dependencies_(c);
    need(3000);lock=deps.acquireLock();if(!lock)return 'lock_busy';
    try{deps.verifyRootSchema();}finally{deps.releaseLock(lock);lock=null;}
    need(35000);
    // Reserve this namespace+UTC minute BEFORE network, even on uncertain write.
    lock=deps.acquireLock();if(!lock)return 'lock_busy';
    try{
      var name='MAX_HTTP_LEGACY_LAST_POLL_V1',rawFence=p.getProperty(name),fence=null,minute=Math.floor(Date.now()/60000);
      if(rawFence){try{fence=JSON.parse(rawFence);}catch(e){return 'minute_fence_invalid';}
        if(!fence||fence.namespace!==c.namespace||!Number.isSafeInteger(fence.minute)||fence.minute<0)return 'minute_fence_invalid';
        if(fence.minute>=minute)return 'minute_already_used';
      }
      p.setProperty(name,JSON.stringify({namespace:c.namespace,minute:minute}));
      var saved=JSON.parse(p.getProperty(name)||'null');
      if(!saved||saved.namespace!==c.namespace||saved.minute!==minute)return 'minute_fence_invalid';
    }finally{deps.releaseLock(lock);lock=null;}
    need(35000);
    batch=lmhi_request_(c,'/consumer/pull',after?{after:after}:{},'MAX_HTTP_INGRESS_READ_KEY');
  }catch(e){return deferred?'budget_deferred':'pull_unknown';}
  if(!batch||!Array.isArray(batch.items)||batch.items.length>1)return 'invalid_batch';
  if(batch.items.length===0)return 'empty';
  var item=batch.items[0];
  if(!item||!lmhi_cursor_(batch.after)||batch.after.id!==item.id||batch.after.received_at!==item.received_at)return 'invalid_cursor';
  if(Number.isSafeInteger(item.received_at)&&item.received_at>=0)metrics.pending_age_seconds=Math.max(0,Math.floor(Date.now()/1000)-item.received_at);
  // Gate every potentially blocking store step, preserving the existing importer.
  ['verifyRootSchema','flush','readRow','readBody'].forEach(function(k){var fn=deps[k];deps[k]=function(){need(3000);return fn.apply(deps,arguments);};});
  var acquire=deps.acquireLock;deps.acquireLock=function(){need(3000);return acquire();};
  var put=deps.inPut;deps.inPut=function(){need(25000);var r=put.apply(deps,arguments);inserted=!!(r&&r.ok===true&&!r.dup);return r;};
  var ack=deps.ackImported;deps.ackImported=function(proof){
    // Importer calls here only AFTER successful exact-row verification and unlock.
    if(inserted&&typeof mx_inDirty==='function'){
      need(1000);mx_inDirty(true,false);dirty=true;
    }
    need(8000);return ack(proof);
  };
  var out;
  try{need(3000);out=mhl_importOne_(item,deps);}catch(e){out={state:'held'};}
  var allowed=['imported','held','held_large_body','enqueue_unknown','ack_unknown'];
  var state=deferred?'budget_deferred':out&&allowed.indexOf(out.state)>=0?out.state:'unexpected_state';
  try{need(1000);p.setProperty('MAX_HTTP_LEGACY_INGRESS_CURSOR_V1',JSON.stringify({binding:binding,after:batch.after}));}catch(e){}
  return state;
}
