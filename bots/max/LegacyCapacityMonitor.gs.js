/* OFFLINE opt-in monitor. Existing minute-tail wrapper calls this BEFORE importer;
 * if consumed=true, return state and do NOT import in the same invocation.
 * No trigger installation, queue writes, cleanup or subscriptions. */
function lmhm_timer_(ctx) {
  var out={consumed:false,state:'monitor_disabled'},p,c,m,lock;
  function left(n){return ctx&&typeof ctx.left==='function'&&Number.isFinite(ctx.left())&&ctx.left()>=n;}
  function emit(){try{console.log(JSON.stringify({event:'legacy_capacity',state:out.state}));}catch(e){}return out;}
  try{
    p=PropertiesService.getScriptProperties();m=JSON.parse(p.getProperty('MAX_HTTP_MONITOR_V1')||'null');
    if(!m||m.enabled!==true)return out;
    c=lmhi_config_();
    if(!c||c.endpoint!=='https://max-durable-ingress-100000000000.us-central1.run.app'||c.namespace!=='legacy_prod_20261107'||c.receipt_kind!=='legacy_max_in_v1'||c.legacy_sheet_id!=='REDACTED_ID'||typeof mx_isGoogle!=='function'||mx_isGoogle()!==true){out.state='monitor_target_blocked';return emit();}
    var now=Math.floor(Date.now()/1000),slot=Math.floor(now/900),key='MAX_HTTP_MONITOR_SLOT_V1';
    if(!left(35000)){out.state='monitor_deferred';return emit();}
    lock=LockService.getScriptLock();if(!lock.tryLock(500)){lock=null;out.state='monitor_busy';return emit();}
    try{
      var old=p.getProperty(key);if(old!==null&&(!/^\d+$/.test(old)||Number(old)>slot))throw Error('fence');
      if(old!==null&&Number(old)===slot)return out;
      out.consumed=true;p.setProperty(key,String(slot));if(p.getProperty(key)!==String(slot))throw Error('fence');
    }finally{lock.releaseLock();lock=null;}
    if(!left(35000)){out.state='monitor_deferred';return emit();}
    var s;
    try{s=lmhi_request_(c,'/consumer/status',{},'MAX_HTTP_INGRESS_READ_KEY');lmhm_validate_(s,c,now);}
    catch(e){out.state='monitor_unavailable';return emit();}
    var warning=lmhm_warning_(s),sample={at:s.server_time,rows:s.rows,bytes:s.bytes,warning:warning};
    if(!left(3000)){out.state='monitor_deferred';return emit();}
    p.setProperty('MAX_HTTP_MONITOR_SAMPLE_V1',JSON.stringify(sample));
    out.state=warning||'monitor_ok';
    // Read-only monitoring build: no notification sender or recipient logic.

    return emit();
  }catch(e){out.state='monitor_unavailable';return emit();}
  finally{if(lock){try{lock.releaseLock();}catch(e){}}}
}
function lmhm_validate_(s,c,now){
  if(!s||s.namespace!==c.namespace||s.receipt_kind!==c.receipt_kind||s.gas_root!==c.legacy_sheet_id||s.snapshot_atomic!==false)throw Error('binding');
  ['rows','bytes','max_rows','max_bytes','server_time'].forEach(function(k){if(!Number.isSafeInteger(s[k])||s[k]<0)throw Error('counter');});
  if(!s.max_rows||!s.max_bytes||Math.abs(s.server_time-now)>120||typeof s.integrity_hold_present!=='boolean'||typeof s.status_integrity_warning!=='boolean')throw Error('shape');
  if(s.oldest_pending_at!==null&&(!Number.isSafeInteger(s.oldest_pending_at)||s.oldest_pending_at<0||s.oldest_pending_at>s.server_time))throw Error('time');
}
function lmhm_warning_(s){
  var ratio=Math.max(s.rows/s.max_rows,s.bytes/s.max_bytes);
  if(ratio>=.9)return 'capacity_urgent';
  if(s.integrity_hold_present||s.status_integrity_warning)return 'integrity_review';
  if(s.oldest_pending_at!==null&&s.server_time-s.oldest_pending_at>600)return 'backlog';
  if(ratio>=.7)return 'capacity_warning';
  return null;
}
