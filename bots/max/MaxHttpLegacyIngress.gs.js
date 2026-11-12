/* OFFLINE legacy MAX import candidate. No hooks, triggers, initialization or sends. */
function mhl_importOne_(item,d) {
  if(!item||item.namespace!==d.namespace||!/^[a-f0-9]{64}$/.test(item.id)||!/^[a-f0-9]{64}$/.test(item.sha256))throw Error('envelope');
  var raw=d.decodeStrictUtf8Base64(item.raw_b64);
  if(!raw||d.byteLength(raw)>524288||d.sha256(raw)!==item.sha256||d.sha256(d.namespace+'\0'+item.sha256)!==item.id)throw Error('integrity');
  var u;try{u=JSON.parse(raw);}catch(e){throw Error('JSON held');}
  if(!u||typeof u!=='object'||Array.isArray(u)||typeof u.update_type!=='string'||!u.update_type||u.update_type.length>100)throw Error('event held');
  var key=d.mx_updKey(u);if(!/^e[a-f0-9]{40}$/.test(key))throw Error('source key');
  function verify(optional) {
    var lock=d.acquireLock();if(!lock)throw Error('lock');
    try{
      d.verifyRootSchema();
      d.flush();
      var r=d.readRow(key);
      if(!r){if(optional)return false;throw Error('missing row');}
      if(String(r[0])!==key||String(r[2])!==u.update_type||['new','work','fail','dead','done'].indexOf(String(r[3]))<0)throw Error('row binding');
      var stored=String(r[7]);
      if(stored.indexOf('file:')===0&&stored!=='file:'+key)throw Error('body reference');
      var body=d.readBody(stored);
      if(typeof body!=='string'||body!==raw||d.sha256(body)!==item.sha256)throw Error('raw mismatch');
      d.verifyRootSchema();
      return true;
    }finally{d.releaseLock(lock);}
  }
  if(!verify(true)){
    // Legacy st_bodyStore can overwrite orphan originals. Do not invoke it.
    if(raw.length>49000)return {state:'held_large_body'};
    // inPut_ owns its own ScriptLock. NEVER call it under our lock.
    var put=d.inPut(key,u.update_type,raw);
    if(!put||put.ok!==true)return {state:'enqueue_unknown'};
    verify(false);
  }
  var proof={id:item.id,sha256:item.sha256,gas_root:d.root,gas_landing_id:'maxin1:'+key,durably_received:true};
  try{var ack=d.ackImported(proof);return {state:ack&&ack.imported===true?'imported':'ack_unknown'};}
  catch(e){return {state:'ack_unknown'};}
}
function mhl_dependencies_(c) {
  var root=c.legacy_sheet_id;
  if(typeof root!=='string'||!/^[A-Za-z0-9_-]{20,120}$/.test(root))throw Error('legacy root');
  function sheet(){
    if(typeof mx_isGoogle!=='function'||mx_isGoogle()!==true)throw Error('legacy mode');
    if(st_ssId()!==root)throw Error('legacy root changed');
    var book=SpreadsheetApp.openById(root),sh=book.getSheetByName('max_in');
    if(book.getId()!==root||!sh||sh.getLastRow()<1)throw Error('legacy sheet missing');
    var expected=['key','t','type','status','tries','err','done_t','body'];
    if(JSON.stringify(sh.getRange(1,1,1,8).getValues()[0])!==JSON.stringify(expected))throw Error('legacy schema');
    return sh;
  }
  return {
    namespace:c.namespace,root:root,decodeStrictUtf8Base64:lmhi_utf8Strict_,
    byteLength:function(s){return Utilities.newBlob(s).getBytes().length;},sha256:lmhi_sha_,mx_updKey:mx_updKey,
    acquireLock:function(){var l=LockService.getScriptLock();return l.tryLock(1500)?l:null;},
    releaseLock:function(l){l.releaseLock();},
    verifyRootSchema:function(){sheet();},
    flush:function(){SpreadsheetApp.flush();},
    readRow:function(key){
      var sh=sheet(),hits=sh.getRange(1,1,sh.getLastRow(),1).createTextFinder(key).matchEntireCell(true).findAll();
      if(hits.length>1)throw Error('duplicate source rows');
      return hits.length?sh.getRange(hits[0].getRow(),1,1,8).getValues()[0]:null;
    },
    readBody:function(ref){
      if(ref.indexOf('file:')!==0)return ref;
      var it=maxDir_('inbox').getFilesByName(ref.slice(5)+'.json');
      if(!it.hasNext())throw Error('original missing');
      var f=it.next();if(it.hasNext())throw Error('ambiguous original');
      return f.getBlob().getDataAsString('UTF-8');
    },
    inPut:function(key,type,raw){sheet();return inPut_(key,type,raw);},
    ackImported:function(proof){return lmhi_request_(c,'/consumer/imported',proof,'MAX_HTTP_INGRESS_ACK_KEY');}
  };
}

/* OFFLINE ONLY. Standalone legacy consumer, disabled without explicit config.
 * Install only after global symbol review. No CGI dependency.
 * Secret properties are set outside code via an approved secure setup.
 */
function lmhi_hex_(bytes) { return bytes.map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join(''); }
function lmhi_sha_(text) { return lmhi_hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8)); }
function lmhi_utf8Strict_(b64) {
  if(typeof b64!=='string'||b64.length>699052||b64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(b64))throw Error('ingress encoding');
  var bytes=Utilities.base64Decode(b64);
  if(bytes.length<1||bytes.length>524288||Utilities.base64Encode(bytes)!==b64)throw Error('ingress encoding');
  var text=Utilities.newBlob(bytes).getDataAsString('UTF-8'),back=Utilities.newBlob(text).getBytes();
  if(bytes.length!==back.length||bytes.some(function(b,i){return (b&255)!==(back[i]&255);}))throw Error('ingress utf8');
  return text;
}
function lmhi_config_() {
  var p=PropertiesService.getScriptProperties(),raw=p.getProperty('MAX_HTTP_LEGACY_INGRESS_V1'),c;
  try{c=JSON.parse(raw||'null');}catch(e){throw Error('ingress config');}
  if(!c||c.enabled!==true)return null;
  if(c.v!==1||c.receipt_kind!=='legacy_max_in_v1'||typeof c.endpoint!=='string'||!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.run\.app$/.test(c.endpoint)||
     !/^[A-Za-z0-9_-]{3,80}$/.test(c.namespace||'')||typeof c.legacy_sheet_id!=='string'||!/^[A-Za-z0-9_-]{20,120}$/.test(c.legacy_sheet_id))throw Error('ingress config');
  return c;
}
function lmhi_request_(c,path,body,keyName) {
  if(['/consumer/pull','/consumer/imported','/consumer/status'].indexOf(path)<0)throw Error('ingress path');
  var key=PropertiesService.getScriptProperties().getProperty(keyName);
  if(typeof key!=='string'||! /^[A-Za-z0-9_-]{32,256}$/.test(key))throw Error('ingress key unavailable');
  var raw=JSON.stringify(body),ts=String(Math.floor(Date.now()/1000));
  var signature=lmhi_hex_(Utilities.computeHmacSha256Signature('POST\n'+path+'\n'+ts+'\n'+lmhi_sha_(raw),key,Utilities.Charset.UTF_8));
  // Never retry internally, never follow redirects or log response/error/URL/key.
  var response=UrlFetchApp.fetch(c.endpoint+path,{method:'post',contentType:'application/json',payload:raw,
    followRedirects:false,muteHttpExceptions:true,validateHttpsCertificates:true,
    headers:{'X-Ingress-Time':ts,'X-Ingress-Signature':signature}});
  if(response.getResponseCode()!==200)throw Error('ingress response unavailable');
  var text=response.getContentText();if(text.length>725000)throw Error('ingress response size');
  var out;try{out=JSON.parse(text);}catch(e){throw Error('ingress response shape');}
  if(!out||typeof out!=='object'||Array.isArray(out))throw Error('ingress response shape');
  return out;
}
function lmhi_cursor_(x) {
  return x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===2&&
    Number.isSafeInteger(x.received_at)&&x.received_at>=0&&/^[a-f0-9]{64}$/.test(x.id||'');
}
function lmhi_pollOnce() {
  var c=lmhi_config_();if(!c)return {state:'disabled'};
  if(typeof mx_isGoogle!=='function'||mx_isGoogle()!==true)return {state:'mode_disabled'};
  var p=PropertiesService.getScriptProperties(),cursor=null;
  try{cursor=JSON.parse(p.getProperty('MAX_HTTP_LEGACY_INGRESS_CURSOR_V1')||'null');}catch(e){}
  var binding=lmhi_sha_(JSON.stringify([c.endpoint,c.namespace,c.receipt_kind,c.legacy_sheet_id]));
  var after=cursor&&cursor.binding===binding&&lmhi_cursor_(cursor.after)?cursor.after:null;
  var batch;
  try{batch=lmhi_request_(c,'/consumer/pull',after?{after:after}:{},'MAX_HTTP_INGRESS_READ_KEY');}
  catch(e){return {state:'pull_unknown'};}
  if(!Array.isArray(batch.items)||batch.items.length>1)return {state:'invalid_batch'};
  if(batch.items.length===0)return {state:'empty'};
  var item=batch.items[0];
  if(!item||!lmhi_cursor_(batch.after)||batch.after.id!==item.id||batch.after.received_at!==item.received_at)return {state:'invalid_cursor'};
  var out;
  try{out=mhl_importOne_(item,mhl_dependencies_(c));}catch(e){out={state:'held'};}
  try{p.setProperty('MAX_HTTP_LEGACY_INGRESS_CURSOR_V1',JSON.stringify({binding:binding,after:batch.after}));}
  catch(e){return {state:out.state,cursor_saved:false};}
  return {state:out.state,cursor_saved:true};
}
