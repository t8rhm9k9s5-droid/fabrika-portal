/* Manual controls: local properties only; no fetch/poll/drain/mail or trigger. */
function lmhm_enableReadOnly(){return lmhm_control_(true);}
function lmhm_disableReadOnly(){return lmhm_control_(false);}
function lmhm_control_(enabled){
 var lock=LockService.getScriptLock();if(!lock.tryLock(1500))throw Error('monitor control busy');
 try{
  var p=PropertiesService.getScriptProperties();
  if(enabled){var c=lmhi_config_();if(!c||c.endpoint!=='https://max-durable-ingress-100000000001.us-central1.run.app'||c.namespace!=='legacy_prod_20261107'||c.receipt_kind!=='legacy_max_in_v1'||c.legacy_sheet_id!=='REDACTED_ID_2'||p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED')!=='1'||typeof lmhm_timer_!=='function'||mx_isGoogle()!==true)throw Error('monitor target');mhl_dependencies_(c).verifyRootSchema();
   var slot=p.getProperty('MAX_HTTP_MONITOR_SLOT_V1');if(slot!==null&&(!/^\d+$/.test(slot)||!Number.isSafeInteger(Number(slot))||Number(slot)>Math.floor(Date.now()/900000)))throw Error('monitor slot');
  }
  var raw=JSON.stringify({enabled:enabled,notify_enabled:false});p.setProperty('MAX_HTTP_MONITOR_V1',raw);
  if(p.getProperty('MAX_HTTP_MONITOR_V1')!==raw)throw Error('monitor control unknown');
  var out={state:enabled?'monitor_readonly_enabled_verified':'monitor_disabled_verified',enabled:enabled,notifications:false};console.log(JSON.stringify(out));return out;
 }catch(e){console.log('{"state":"monitor_control_failed_or_unknown"}');throw Error('monitor control failed or unknown');}finally{lock.releaseLock();}
}
function lmhm_readSample(){
 var out={state:'sample_unavailable'};
 try{var s=JSON.parse(PropertiesService.getScriptProperties().getProperty('MAX_HTTP_MONITOR_SAMPLE_V1')||'null');if(s&&Number.isSafeInteger(s.at)&&s.at>=0&&Number.isSafeInteger(s.rows)&&s.rows>=0&&Number.isSafeInteger(s.bytes)&&s.bytes>=0){out={state:'sample_present',at_seconds:s.at,rows:s.rows,bytes:s.bytes};if(s.warning===null||['capacity_urgent','integrity_review','backlog','capacity_warning'].indexOf(s.warning)>=0)out.warning=s.warning;}}catch(e){}
 console.log(JSON.stringify(out));return out;
}
