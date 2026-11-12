/* Read-only bounded diagnostic. Never exposes URL, token, key or error text. */
function lws_diagnosePrepare(){
 var o={active_owner:false,effective_owner:false,stage:'owner'};
 function req(path){var token=tok_();if(typeof token!=='string'||!token)throw Error('unavailable');var r=UrlFetchApp.fetch('https://platform-api.max.ru'+path,{method:'get',muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true,headers:{Authorization:token,Accept:'application/json'}}),code=r.getResponseCode(),body=null;try{body=JSON.parse(r.getContentText());}catch(e){}return {code:code,body:body};}
 function done(){console.log(JSON.stringify(o));return o;}
 try{
  var owner='user@example.org';o.active_owner=String(Session.getActiveUser().getEmail()).toLowerCase()===owner;o.effective_owner=String(Session.getEffectiveUser().getEmail()).toLowerCase()===owner;
  if(!o.active_owner||!o.effective_owner)return done();
  o.stage='properties';var p=PropertiesService.getScriptProperties();o.snapshot_present=p.getProperty('MAX_HTTP_SUB_SWITCH_V1')!==null;
  var base=String(webappUrl_()||''),secret=p.getProperty('HOOK_SECRET');
  o.base_valid=/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(base);o.legacy_secret_valid=typeof secret==='string'&&/^[A-Za-z0-9_-]{5,256}$/.test(secret);
  o.stage='identity_request';var r=req('/me');o.identity_http=Number.isInteger(r.code)&&r.code>=100&&r.code<=599?r.code:0;o.identity_match=r.code===200&&!!r.body&&r.body.is_bot===true&&String(r.body.user_id)==='539375202'&&r.body.username==='id6215018827_bot';
  o.stage='subscriptions_request';r=req('/subscriptions');o.subscriptions_http=Number.isInteger(r.code)&&r.code>=100&&r.code<=599?r.code:0;o.subscriptions_shape=r.code===200&&!!r.body&&Array.isArray(r.body.subscriptions);
  if(o.subscriptions_shape){var rows=r.body.subscriptions;o.subscription_count=rows.length;o.single_types_match=rows.length===1&&!!rows[0]&&lws_sameTypes_(rows[0].update_types);o.exact_old_match=rows.length===1&&!!rows[0]&&o.base_valid&&o.legacy_secret_valid&&rows[0].url===base+'?s='+secret;o.base_match=rows.length===1&&!!rows[0]&&typeof rows[0].url==='string'&&rows[0].url.split(/[?#]/)[0]===base;}
  o.stage='complete';return done();
 }catch(e){o.unavailable=true;return done();}
}
