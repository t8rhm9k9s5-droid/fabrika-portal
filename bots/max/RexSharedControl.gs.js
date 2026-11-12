/* Shared bot control. Disabled until explicit owner configuration. */

/* === PartitionedFeedStore.gs === */
/* OFFLINE CANDIDATE ONLY. All APIs require caller-held ScriptLock, including reads.
 * No cache, deletion, root replacement, network delivery, or runtime initialization.
 */
function pfs_fail_(s){throw new Error('partitioned feed: '+s);}
function pfs_assertLock_(lock){if(!lock||typeof lock.hasLock!=='function'||!lock.hasLock())pfs_fail_('ScriptLock required');}
function pfs_config_(names,cap){
  if(!Array.isArray(names)||!names.length||names.length>16||names.some(function(n,i){return typeof n!=='string'||!(/^[a-z][a-z0-9]{0,15}$/).test(n)||names.indexOf(n)!==i;})||[128,256].indexOf(cap)<0)pfs_fail_('configuration');
  return {names:names.slice().sort(),cap:cap};
}
function pfs_key_(s,key){
  if(typeof key!=='string')pfs_fail_('key');
  var x=key.split(':');if(x.length!==2||s.names.indexOf(x[0])<0||!(/^[0-9a-f]{64}$/).test(x[1]))pfs_fail_('key');
  return x[1].split('').map(function(c){return ('000'+parseInt(c,16).toString(2)).slice(-4);}).join('');
}
function pfs_json_(record){var j=JSON.stringify(record);if(typeof j!=='string'||j.length>45000)pfs_fail_('record must be JSON <=45000 characters');return j;}
function pfs_meta_(s,id,prefix,type,children){return {v:2,root:s.root,id:id,prefix:prefix,depth:prefix.length,type:type,names:s.names,cap:s.cap,children:children||null};}
function pfs_node_(s,id,prefix){
  if(typeof id!=='string'||!id)pfs_fail_('missing node id');
  var book=SpreadsheetApp.openById(id),sh=book.getSheetByName('ledger');if(!sh)pfs_fail_('missing ledger');
  var raw=sh.getRange(1,1).getValue(),m;try{m=JSON.parse(raw);}catch(e){pfs_fail_('metadata JSON');}
  if(!m||m.v!==2||m.root!==s.root||m.id!==id||m.prefix!==prefix||m.depth!==prefix.length||prefix.length>256||!(/^[01]*$/).test(prefix)||m.cap!==s.cap||JSON.stringify(m.names)!==JSON.stringify(s.names)||['leaf','branch'].indexOf(m.type)<0)pfs_fail_('node identity');
  if(m.type==='branch'&&(prefix.length===256||!Array.isArray(m.children)||m.children.length!==2||m.children.some(function(c){return typeof c!=='string'||!c||c===id||c===s.root;})||m.children[0]===m.children[1]))pfs_fail_('branch children');
  if(m.type==='leaf'&&m.children!==null)pfs_fail_('leaf children');
  return {id:id,sh:sh,m:m};
}
function pfs_rows_(s,n){
  var count=n.sh.getLastRow()-1;if(count<0||count>s.cap)pfs_fail_('leaf bounds');
  var rows=count?n.sh.getRange(2,1,count,2).getValues():[],seen={};
  rows.forEach(function(r){var bits=pfs_key_(s,r[0]);if(bits.slice(0,n.m.depth)!==n.m.prefix||seen[r[0]]||typeof r[1]!=='string'||r[1].length>45000)pfs_fail_('leaf row');seen[r[0]]=true;try{JSON.parse(r[1]);}catch(e){pfs_fail_('record JSON');}});return rows;
}
function pfs_open_(rootId,names,capacity,lock){
  pfs_assertLock_(lock);if(typeof rootId!=='string'||!rootId)pfs_fail_('root configuration missing');
  var c=pfs_config_(names,capacity),s={root:rootId,names:c.names,cap:c.cap,lock:lock};pfs_node_(s,rootId,'');return s;
}
function pfs_leaf_(s,key){
  var bits=pfs_key_(s,key),id=s.root,prefix='';
  for(var depth=0;depth<=256;depth++) {var n=pfs_node_(s,id,prefix);if(n.m.type==='leaf')return n;var b=bits.charAt(depth);id=n.m.children[Number(b)];prefix+=b;}
  pfs_fail_('depth overflow');
}
function pfs_get_(s,key){pfs_assertLock_(s.lock);var n=pfs_leaf_(s,key),rs=pfs_rows_(s,n);for(var i=0;i<rs.length;i++)if(rs[i][0]===key)return {key:key,record:JSON.parse(rs[i][1])};return null;}
function pfs_createNode_(s,prefix,rows){
  var b=SpreadsheetApp.create('Feed v2 node '+(prefix||'root')),id=b.getId(),sh=b.getSheets()[0];sh.setName('ledger');
  if(!s.root)s.root=id;
  sh.getRange(1,1).setValue(JSON.stringify(pfs_meta_(s,id,prefix,'leaf')));
  if(rows.length)sh.getRange(2,1,rows.length,2).setValues(rows);
  SpreadsheetApp.flush();var n=pfs_node_(s,id,prefix);if(JSON.stringify(pfs_rows_(s,n))!==JSON.stringify(rows))pfs_fail_('child verification');return n;
}
/* Explicit provisioning only. Returns root ID; caller must save/verify it separately.
 * A provisioning error can leave an orphan. Never automatically rerun or adopt it.
 */
function pfs_initializeExplicit_(names,capacity,lock){pfs_assertLock_(lock);var c=pfs_config_(names,capacity),s={root:'',names:c.names,cap:c.cap,lock:lock};return pfs_createNode_(s,'',[]).id;}
function pfs_split_(s,n,rows){
  if(n.m.depth>=256)pfs_fail_('hash collision bucket exhausted');
  var buckets=[[],[]];rows.forEach(function(r){buckets[Number(pfs_key_(s,r[0]).charAt(n.m.depth))].push(r);});
  var a=pfs_createNode_(s,n.m.prefix+'0',buckets[0]),b=pfs_createNode_(s,n.m.prefix+'1',buckets[1]);
  // Verify parent has not changed. This is not a distributed compare-and-swap.
  var current=pfs_node_(s,n.id,n.m.prefix);if(JSON.stringify(current.m)!==JSON.stringify(n.m)||JSON.stringify(pfs_rows_(s,current))!==JSON.stringify(rows))pfs_fail_('split parent changed');
  var published=pfs_meta_(s,n.id,n.m.prefix,'branch',[a.id,b.id]);
  // NEVER catch/revert/retry this write: an exception can mean it committed.
  n.sh.getRange(1,1).setValue(JSON.stringify(published));SpreadsheetApp.flush();
  if(JSON.stringify(pfs_node_(s,n.id,n.m.prefix).m)!==JSON.stringify(published))pfs_fail_('ambiguous split publication');
  // Parent rows are retained forever, immutable and ignored once branch published.
}
function pfs_put_(s,key,record){
  pfs_assertLock_(s.lock);var j=pfs_json_(record);
  for(var step=0;step<=256;step++){
    var n=pfs_leaf_(s,key),rs=pfs_rows_(s,n);
    for(var i=0;i<rs.length;i++)if(rs[i][0]===key)return {inserted:false,key:key,record:JSON.parse(rs[i][1])};
    if(rs.length<s.cap){n.sh.getRange(rs.length+2,1,1,2).setValues([[key,j]]);SpreadsheetApp.flush();var got=pfs_get_(s,key);if(!got||JSON.stringify(got.record)!==j)pfs_fail_('ambiguous insert');return {inserted:true,key:key,record:got.record};}
    pfs_split_(s,n,rs);
  }pfs_fail_('split bound');
}
function pfs_update_(s,key,mutator){
  pfs_assertLock_(s.lock);if(typeof mutator!=='function')pfs_fail_('mutator');
  var before=pfs_get_(s,key);if(!before)pfs_fail_('update missing key');
  var original=pfs_json_(before.record);var next=mutator(before.record);if(next===undefined)return before;var j=pfs_json_(next);
  // Re-resolve after callback too. Callback must not write store or release lock.
  var n=pfs_leaf_(s,key),rs=pfs_rows_(s,n);
  for(var i=0;i<rs.length;i++)if(rs[i][0]===key){if(rs[i][1]!==original)pfs_fail_('update changed');n.sh.getRange(i+2,2).setValue(j);SpreadsheetApp.flush();var got=pfs_get_(s,key);if(!got||JSON.stringify(got.record)!==j)pfs_fail_('ambiguous update');return got;}
  pfs_fail_('update disappeared');
}
function pfs_successor_(prefix){var i=prefix.lastIndexOf('0');return i<0?null:prefix.slice(0,i)+'1';}
/* Find lexicographically first leaf at/after boundary, or containing boundary. */
function pfs_seek_(s,boundary){
  function walk(id,prefix){
    if(prefix<boundary&&boundary.indexOf(prefix)!==0)return null;
    var n=pfs_node_(s,id,prefix);if(n.m.type==='leaf')return n;
    return walk(n.m.children[0],prefix+'0')||walk(n.m.children[1],prefix+'1');
  }return walk(s.root,'');
}
function pfs_scan_(s,cursor,maxRecords,maxLeaves){
  pfs_assertLock_(s.lock);if(!Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>256||!Number.isSafeInteger(maxLeaves)||maxLeaves<1||maxLeaves>16)pfs_fail_('scan budget');
  if(cursor!==null&&cursor!==undefined&&(!cursor||cursor.v!==2||cursor.root!==s.root||typeof cursor.prefix!=='string'||!(/^[01]{0,256}$/).test(cursor.prefix)||!Number.isSafeInteger(cursor.position)||cursor.position<0||cursor.position>s.cap||typeof cursor.nodeId!=='string'))pfs_fail_('scan cursor');
  var boundary=cursor?cursor.prefix:'',out=[],leaves=0,c=cursor||null;
  while(leaves<maxLeaves&&out.length<maxRecords){
    var n=pfs_seek_(s,boundary);if(!n)return {records:out,cursor:null,done:true};
    var rs=pfs_rows_(s,n),pos=c&&c.prefix===n.m.prefix&&c.nodeId===n.id?c.position:0;
    if(pos>rs.length)pfs_fail_('scan position');
    leaves++;
    while(pos<rs.length&&out.length<maxRecords){out.push({key:rs[pos][0],record:JSON.parse(rs[pos][1]),cursor_after:{v:2,root:s.root,prefix:n.m.prefix,nodeId:n.id,position:pos+1}});pos++;}
    if(pos<rs.length)return {records:out,cursor:{v:2,root:s.root,prefix:n.m.prefix,nodeId:n.id,position:pos},done:false};
    boundary=pfs_successor_(n.m.prefix);if(boundary===null)return {records:out,cursor:null,done:true};
    c={v:2,root:s.root,prefix:boundary,nodeId:'',position:0};
  }return {records:out,cursor:c,done:false};
}


/* === RexControl.gs === */
/* OFFLINE CANDIDATE. No entrypoint, credentials, storage or network provisioned.
 * Trust boundary: dependencies and context MUST be supplied by authenticated
 * server code, never deserialized from the client request. See INSTALL_RU.md.
 */
var RexControl = (function () {
  'use strict';
  var ACTIONS = {
    'status.read': false, 'chats.list': false, 'messages.read': false, 'groups.list': false,
    'message.send': true, 'message.reply': true,
    'queue.pause': true, 'queue.resume': true
  };
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function obj(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null); }
  function fields(o, allowed) { return obj(o) && Object.keys(o).every(function (k) { return allowed.indexOf(k) !== -1; }); }
  function str(x, n) { return typeof x === 'string' && x.length > 0 && x.length <= n; }
  function ident(x) { return str(x, 100) && /^[A-Za-z0-9_.:-]+$/.test(x); }
  function integer(x) { return typeof x === 'number' && Number.isSafeInteger(x); }
  function canon(v) {
    if (v === null || typeof v === 'boolean' || typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (!obj(v)) throw new Error('unsupported canonical value');
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}';
  }
  function reject(code) { return { ok: false, state: 'rejected', code: code }; }
  function hash(d, v) {
    var h = d.sha256(canon(v));
    if (typeof h !== 'string' || !/^[a-f0-9]{64}$/.test(h)) throw new Error('invalid hash adapter');
    return h;
  }
  function validate(q, now) {
    if (!fields(q, ['version','command_id','action','bot','target_id','payload','issued_at','expires_at','authorization_ref','expected_revision'])) return 'schema';
    if (q.version !== 'rexctl-v1' || !ident(q.command_id) || !own(ACTIONS,q.action) || ['max','telegram'].indexOf(q.bot) === -1 || !ident(q.target_id)) return 'schema';
    if (!integer(now) || now < 0 || !integer(q.issued_at) || !integer(q.expires_at) || q.issued_at > now || q.expires_at <= now || q.expires_at <= q.issued_at || q.expires_at - q.issued_at > 300000) return 'expired';
    if (!ident(q.authorization_ref) || !integer(q.expected_revision) || q.expected_revision < 0) return 'schema';
    var p=q.payload;
    if (q.action === 'message.send' || q.action === 'message.reply') {
      if (!fields(p, q.action === 'message.reply' ? ['text','reply_to_id'] : ['text']) || !str(p.text,4000) || !p.text.trim()) return 'payload';
      if (q.action === 'message.reply' && !ident(p.reply_to_id)) return 'payload';
    } else if (q.action === 'messages.read') {
      if (!fields(p,['limit','from','to']) || !integer(p.limit) || p.limit < 1 || p.limit > 100 || ['from','to'].some(function(k){return own(p,k)&&(!integer(p[k])||p[k]<0);})) return 'payload';
    } else if (q.action === 'groups.list') {
      if(q.bot!=='max'||q.target_id!=='max-groups'||!fields(p,['limit','after_id'])||!integer(p.limit)||p.limit<1||p.limit>10||(own(p,'after_id')&&!/^-?[1-9][0-9]{0,19}$/.test(p.after_id)))return 'payload';
    } else if (q.action === 'chats.list') {
      if (!fields(p,['limit']) || !integer(p.limit) || p.limit < 1 || p.limit > 100) return 'payload';
    } else if (!fields(p,[]) || Object.keys(p).length) return 'payload';
    return null;
  }
  function buildBinding(q, actor, d) { return hash(d,{ actor_id:actor, request:q }); }
  function summary(r, duplicate) {
    if (!r || ['executing','succeeded','failed_certain','uncertain'].indexOf(r.state) === -1) return reject('journal_invalid');
    var s=r.state === 'executing' ? 'uncertain' : r.state;
    var out={ok:s==='succeeded',state:s,command_id:r.command_id,duplicate:!!duplicate};
    if (r.result && ident(r.result.platform_message_id)) out.platform_message_id=r.result.platform_message_id;
    if (r.result && integer(r.result.revision)) out.revision=r.result.revision;
    return out;
  }
  function resultProjection(action, r) {
    if (!obj(r)) throw new Error('adapter result');
    if (r.state === 'failed_certain' && r.no_effect_proven === true) return {state:'failed_certain',result:{}};
    if (r.state !== 'succeeded') return {state:'uncertain',result:{}};
    if (action === 'message.send' || action === 'message.reply') {
      if (!ident(r.platform_message_id)) return {state:'uncertain',result:{}};
      return {state:'succeeded',result:{platform_message_id:r.platform_message_id}};
    }
    if (!integer(r.revision) || r.revision < 0) return {state:'uncertain',result:{}};
    return {state:'succeeded',result:{revision:r.revision}};
  }
  function readProjection(q,r) {
    if (!obj(r)) return reject('read_unavailable');
    // Never pass through unknown adapter fields, API errors, URLs or credentials.
    if (q.action === 'status.read') {
      if (!integer(r.observed_at) || typeof r.stale !== 'boolean' || !obj(r.counts) || !Array.isArray(r.held_reasons)) return reject('read_unavailable');
      var counts={};
      ['pending','uncertain','quarantined','held'].forEach(function(k){if(integer(r.counts[k]) && r.counts[k]>=0) counts[k]=r.counts[k];});
      var reasonAllow=['historical','coverage_unknown','cutover_unknown','schema_mismatch','identity_conflict','outcome_unknown','paused','storage_unavailable'];
      var status={ok:true,state:'observed',observed_at:r.observed_at,stale:r.stale,counts:counts,held_reasons:r.held_reasons.filter(function(x){return reasonAllow.indexOf(x)!==-1;}).slice(0,20)};
      if(own(r,'operator_revision')||own(r,'operator_paused')){if(!integer(r.operator_revision)||r.operator_revision<0||typeof r.operator_paused!=='boolean')return reject('read_unavailable');status.operator_revision=r.operator_revision;status.operator_paused=r.operator_paused;}
      return status;
    }
    if (!Array.isArray(r.items) || r.items.length > q.payload.limit) return reject('read_unavailable');
    var items=[];
    for(var i=0;i<r.items.length;i++) {
      var v=r.items[i];
      if(!obj(v)) return reject('read_unavailable');
      if(q.action==='groups.list') {
        if(typeof v.id!=='string'||!/^\-?[1-9][0-9]{0,19}$/.test(v.id)||!str(v.title,200)||typeof v.is_admin!=='boolean'||typeof v.read_all_messages!=='boolean')return reject('read_unavailable');
        items.push({id:v.id,title:v.title,is_admin:v.is_admin,read_all_messages:v.read_all_messages});
      } else if(q.action==='chats.list') {
        if(!ident(v.id) || !str(v.title,200)) return reject('read_unavailable');
        items.push({id:v.id,title:v.title});
      } else {
        if(v.target_id!==q.target_id || !ident(v.id) || typeof v.text!=='string' || v.text.length>16000) return reject('read_unavailable');
        items.push(projectMessage(v));
      }
    }
    if(q.action==='groups.list'){
      if((r.next_after!==null&&(typeof r.next_after!=='string'||!/^\-?[1-9][0-9]{0,19}$/.test(r.next_after)))||r.inventory_source!=='event_registry'||r.complete_inventory!==false)return reject('read_unavailable');
      return {ok:true,state:'observed',items:items,next_after:r.next_after,inventory_source:'event_registry',complete_inventory:false};
    }
    return {ok:true,state:'observed',items:items};
  }
  // Explicit message fields only. Attachment access tokens and signed URLs are
  // deliberately not exposed as generic message metadata.
  function projectMessage(v) {
    var out={id:v.id,target_id:v.target_id,text:v.text};
    if(own(v,'timestamp')){if(!integer(v.timestamp)||v.timestamp<0)throw Error('timestamp');out.timestamp=v.timestamp;}
    if(own(v,'sender')){
      if(!obj(v.sender)||!ident(v.sender.id)||typeof v.sender.is_bot!=='boolean')throw Error('sender');
      var sender={id:v.sender.id,is_bot:v.sender.is_bot};
      ['first_name','last_name','username'].forEach(function(k){if(own(v.sender,k)){if(typeof v.sender[k]!=='string'||v.sender[k].length>200)throw Error('sender');sender[k]=v.sender[k];}});out.sender=sender;
    }
    if(own(v,'attachments')){
      if(!Array.isArray(v.attachments)||v.attachments.length>50)throw Error('attachments');
      out.attachments=v.attachments.map(function(a){
        if(!obj(a)||!ident(a.type))throw Error('attachment');var item={type:a.type};
        ['filename','title','description','transcription'].forEach(function(k){if(own(a,k)){if(typeof a[k]!=='string'||a[k].length>(k==='transcription'?16000:2000))throw Error('attachment');item[k]=a[k];}});
        ['size','width','height','duration'].forEach(function(k){if(own(a,k)){if(!integer(a[k])||a[k]<0)throw Error('attachment');item[k]=a[k];}});return item;
      });
    }
    if(own(v,'link')){if(!obj(v.link)||['reply','forward'].indexOf(v.link.type)<0||!ident(v.link.message_id))throw Error('link');out.link={type:v.link.type,message_id:v.link.message_id};}
    return out;
  }
  function execute(q,context,d) {
    try {
      if(!obj(context) || context.authenticated!==true || !ident(context.actor_id)) return reject('authentication');
      var now=d.now(), bad=validate(q,now); if(bad) return reject(bad);
      // Load fresh server-side policy for every call. Client cannot name its role.
      var policy=d.policy.get(context.actor_id);
      if(!obj(policy) || policy.enabled!==true || ['observer','operator'].indexOf(policy.role)===-1 || !Array.isArray(policy.scopes)) return reject('authorization');
      var policySnapshot=canon(policy);
      var mutation=ACTIONS[q.action];
      if(mutation && (policy.role!=='operator' || d.policy.effectsEnabled()!==true)) return reject('effects_disabled');
      var allowed=policy.scopes.some(function(s){return obj(s) && s.bot===q.bot && s.target_id===q.target_id && Array.isArray(s.actions) && s.actions.indexOf(q.action)!==-1;});
      if(!allowed) return reject('scope');
      var digest=buildBinding(q,context.actor_id,d);
      // Resolver must verify authenticated owner approval or a precisely scoped
      // read grant. A caller-supplied authorization object is never accepted.
      var a=d.authorizations.getVerified(q.authorization_ref,context.actor_id);
      if(!obj(a) || a.active!==true || a.binding_hash!==digest || a.actor_id!==context.actor_id || !integer(a.expires_at) || a.expires_at<=now || (mutation && a.kind!=='owner_action_approval') || (!mutation && ['owner_action_approval','read_grant'].indexOf(a.kind)===-1)) return reject('approval');
      if(!mutation) {
        var observed=readProjection(q,d.readOnly.read(q));
        if(!observed.ok) return observed;
        // Read results are withheld until slow storage/provider work has finished.
        // Authentication itself belongs to the trusted server composition.
        var readPolicy=d.policy.get(context.actor_id);
        var readApproval=d.authorizations.getVerified(q.authorization_ref,context.actor_id);
        var readNow=d.now();
        if(!integer(readNow) || readNow<now || validate(q,readNow)) return reject('expired');
        if(!obj(readPolicy) || canon(readPolicy)!==policySnapshot) return reject('authorization');
        if(!obj(readApproval) || readApproval.active!==true || readApproval.binding_hash!==digest || readApproval.actor_id!==context.actor_id || !integer(readApproval.expires_at) || readApproval.expires_at<=readNow || ['owner_action_approval','read_grant'].indexOf(readApproval.kind)===-1) return reject('approval');
        if(q.action==='chats.list') observed.items=observed.items.filter(function(v){return policy.scopes.some(function(s){return v.id===q.target_id && s.bot===q.bot && s.target_id===v.id && Array.isArray(s.actions) && s.actions.indexOf('chats.list')!==-1;});});
        return observed;
      }
      // This adapter MUST atomically reserve the ID globally and durably verify
      // the claim before created=true. It is not provided by this module.
      var claim=d.journal.claim({command_id:q.command_id,actor_id:context.actor_id,binding_hash:digest,state:'executing',issued_at:now,authorization_ref:q.authorization_ref,action:q.action,bot:q.bot,target_id:q.target_id});
      if(!obj(claim) || typeof claim.created!=='boolean' || !obj(claim.record) || claim.record.command_id!==q.command_id || claim.record.binding_hash!==digest || claim.record.actor_id!==context.actor_id) return reject('journal_conflict');
      if(!claim.created) return summary(claim.record,true);
      if(claim.record.state!=='executing') return reject('journal_invalid');
      // Recheck revocation/expiry after claim and BEFORE the external effect.
      var again=d.authorizations.getVerified(q.authorization_ref,context.actor_id), fresh=d.policy.get(context.actor_id), effectNow=d.now();
      if(!integer(effectNow) || effectNow<now || effectNow>=q.expires_at || !again || again.active!==true || again.binding_hash!==digest || again.actor_id!==context.actor_id || again.kind!=='owner_action_approval' || !integer(again.expires_at) || again.expires_at<=effectNow || !fresh || canon(fresh)!==policySnapshot || d.policy.effectsEnabled()!==true) {
        d.journal.finish(q.command_id,digest,{state:'failed_certain',result:{}});
        return {ok:false,state:'failed_certain',command_id:q.command_id};
      }
      var outcome;
      try { outcome=resultProjection(q.action,d.effects.execute(q)); }
      catch(ignore) { outcome={state:'uncertain',result:{}}; }
      try {
        var saved=d.journal.finish(q.command_id,digest,outcome);
        if(!obj(saved) || saved.binding_hash!==digest || saved.command_id!==q.command_id || saved.state!==outcome.state || canon(saved.result)!==canon(outcome.result)) throw new Error('finish not verified');
        return summary(saved,false);
      } catch(ignoreFinish) { return {ok:false,state:'uncertain',command_id:q.command_id}; }
    } catch(ignoreAll) { return reject('dependency_unavailable'); }
  }
  return {execute:execute,canonical:canon,binding:buildBinding};
})();
if (typeof module !== 'undefined') module.exports=RexControl;


/* === RexControlStorage.gs === */
/* OFFLINE: actual PFS journal/status adapter. No runtime initialization or hooks.
 * Requires unchanged PartitionedFeedStore.gs and ALL writers in one GAS project.
 * Sheets readback/ScriptLock assumptions remain platform release gates.
 */
function rcj_fail_(m){throw new Error('rex control storage: '+m);}
function rcj_hash_(s){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(s),Utilities.Charset.UTF_8).map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function rcj_id_(v){return typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v);}
function rcj_hashOk_(v){return typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);}
function rcj_same_(a,b){return RexControl.canonical(a)===RexControl.canonical(b);}
function rcj_key_(ns,id){return ns+':'+rcj_hash_(id);}
function rcj_metaKey_(){return rcj_key_('rm1','binding');}
function rcj_cfg_(cfg){if(!cfg||!rcj_id_(cfg.root)||!rcj_id_(cfg.generation))rcj_fail_('configuration');}
function rcj_initExplicit_(generation,lock){
 if(!rcj_id_(generation))rcj_fail_('generation');
 pfs_assertLock_(lock);
 var root=pfs_initializeExplicit_(['rc1','rm1','rs1'],128,lock),cfg={root:root,generation:generation};
 var p=pfs_open_(root,['rc1','rm1','rs1'],128,lock);
 pfs_put_(p,rcj_metaKey_(),{v:1,root:root,generation:generation});
 rcj_open_(cfg,lock);return cfg;
}
function rcj_open_(cfg,lock){
 rcj_cfg_(cfg);var p=pfs_open_(cfg.root,['rc1','rm1','rs1'],128,lock),m=pfs_get_(p,rcj_metaKey_());
 if(!m||!rcj_same_(m.record,{v:1,root:cfg.root,generation:cfg.generation}))rcj_fail_('root binding');
 return {cfg:{root:cfg.root,generation:cfg.generation},pfs:p};
}
function rcj_record_(s,r,id){
 if(!r||r.v!==1||r.root!==s.cfg.root||r.generation!==s.cfg.generation||r.command_id!==id||!rcj_id_(id)||!rcj_id_(r.actor_id)||!rcj_hashOk_(r.binding_hash)||!rcj_id_(r.authorization_ref)||!Number.isSafeInteger(r.issued_at)||r.issued_at<0||['executing','succeeded','failed_certain','uncertain'].indexOf(r.state)<0)rcj_fail_('record identity/state');
 if(['message.send','message.reply','queue.pause','queue.resume'].indexOf(r.action)<0||['max','telegram'].indexOf(r.bot)<0||!rcj_id_(r.target_id))rcj_fail_('record scope');
 if(r.state==='executing'){if(r.result!==undefined)rcj_fail_('executing result');}
 else rcj_outcome_(r.action,{state:r.state,result:r.result});
 return r;
}
function rcj_outcome_(action,o){
 if(!o||['succeeded','failed_certain','uncertain'].indexOf(o.state)<0||!o.result||typeof o.result!=='object'||Array.isArray(o.result))rcj_fail_('outcome');
 var keys=Object.keys(o.result);
 if(o.state!=='succeeded'){if(keys.length)rcj_fail_('non-success result');return;}
 if(action==='message.send'||action==='message.reply'){
  if(keys.length!==1||keys[0]!=='platform_message_id'||!rcj_id_(o.result.platform_message_id))rcj_fail_('message result');
 }else if(keys.length!==1||keys[0]!=='revision'||!Number.isSafeInteger(o.result.revision)||o.result.revision<0)rcj_fail_('revision result');
}
function rcj_claim_(s,input){
 if(!input||input.state!=='executing'||!rcj_id_(input.command_id))rcj_fail_('claim input');
 // Build only the allowed fields; no arbitrary client data or secrets retained.
 var r={v:1,root:s.cfg.root,generation:s.cfg.generation,command_id:input.command_id,actor_id:input.actor_id,binding_hash:input.binding_hash,state:'executing',issued_at:input.issued_at,authorization_ref:input.authorization_ref,action:input.action,bot:input.bot,target_id:input.target_id};
 rcj_record_(s,r,r.command_id);
 var key=rcj_key_('rc1',r.command_id),old=pfs_get_(s.pfs,key);
 if(old)return {created:false,record:rcj_record_(s,old.record,r.command_id)};
 // Failure after publication propagates. A later lookup sees executing and MUST
 // NOT resume sending. No claim lease expiry or reset-to-new exists.
 var saved=pfs_put_(s.pfs,key,r),read=pfs_get_(s.pfs,key);
 if(!read||!rcj_same_(saved.record,read.record))rcj_fail_('claim readback');
 rcj_record_(s,read.record,r.command_id);
 if(saved.inserted&&!rcj_same_(read.record,r))rcj_fail_('claim changed');
 return {created:saved.inserted===true,record:read.record};
}
function rcj_finish_(s,id,binding,outcome){
 if(!rcj_id_(id)||!rcj_hashOk_(binding))rcj_fail_('finish identity');
 var key=rcj_key_('rc1',id),before=pfs_get_(s.pfs,key);if(!before)rcj_fail_('missing claim');
 var old=rcj_record_(s,before.record,id);if(old.binding_hash!==binding)rcj_fail_('binding conflict');
 rcj_outcome_(old.action,outcome);
 if(old.state!=='executing'){
  if(old.state===outcome.state&&rcj_same_(old.result,outcome.result))return old;
  rcj_fail_('terminal conflict');
 }
 var out=pfs_update_(s.pfs,key,function(r){
  rcj_record_(s,r,id);if(r.binding_hash!==binding||r.state!=='executing'||!rcj_same_(r,old))rcj_fail_('stale finish');
  r.state=outcome.state;r.result=JSON.parse(JSON.stringify(outcome.result));return r;
 });
 var read=pfs_get_(s.pfs,key);if(!read||!rcj_same_(out.record,read.record)||read.record.state!==outcome.state||!rcj_same_(read.record.result,outcome.result))rcj_fail_('finish readback');
 return rcj_record_(s,read.record,id);
}
function rcj_withLock_(cfg,fn){
 var l=LockService.getScriptLock();if(!l.tryLock(2000))rcj_fail_('busy');
 try{return fn(rcj_open_(cfg,l));}finally{l.releaseLock();}
}
function rcj_adapter_(cfg){
 rcj_cfg_(cfg);cfg={root:cfg.root,generation:cfg.generation};
 return {
  claim:function(r){return rcj_withLock_(cfg,function(s){return rcj_claim_(s,r);});},
  finish:function(id,h,o){return rcj_withLock_(cfg,function(s){return rcj_finish_(s,id,h,o);});}
 };
}
/* Status snapshots are separate immutable-to-reader values. Producer publishing
 * is explicit, reviewed work; this file never scans, repairs, or opens SWQ. */
function rcr_validate_(s,r,bot,target){
 if(!r||r.v!==1||r.root!==s.cfg.root||r.generation!==s.cfg.generation||r.bot!==bot||r.target_id!==target||!Number.isSafeInteger(r.revision)||r.revision<1||!Number.isSafeInteger(r.observed_at)||r.observed_at<0||typeof r.stale!=='boolean'||!r.counts||typeof r.counts!=='object'||Array.isArray(r.counts)||!Array.isArray(r.held_reasons))rcj_fail_('snapshot');
 var ck=Object.keys(r.counts),allowed=['pending','uncertain','quarantined','held'];
 if(ck.some(function(k){return allowed.indexOf(k)<0||!Number.isSafeInteger(r.counts[k])||r.counts[k]<0;}))rcj_fail_('snapshot counts');
 var reasons=['historical','coverage_unknown','cutover_unknown','schema_mismatch','identity_conflict','outcome_unknown','paused','storage_unavailable'];
 if(r.held_reasons.length>20||r.held_reasons.some(function(k){return reasons.indexOf(k)<0;}))rcj_fail_('snapshot reasons');
 return r;
}
function rcr_publish_(s,bot,target,body,expectedRevision){
 if(['max','telegram'].indexOf(bot)<0||!rcj_id_(target)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||!body)rcj_fail_('snapshot identity');
 var key=rcj_key_('rs1',bot+':'+target),found=pfs_get_(s.pfs,key);
 if(found)rcr_validate_(s,found.record,bot,target);
 if((found?found.record.revision:0)!==expectedRevision)rcj_fail_('snapshot revision conflict');
 var r={v:1,root:s.cfg.root,generation:s.cfg.generation,bot:bot,target_id:target,revision:expectedRevision+1,observed_at:body.observed_at,stale:body.stale,counts:body.counts,held_reasons:body.held_reasons};
 rcr_validate_(s,r,bot,target);
 if(found&&r.observed_at<found.record.observed_at)rcj_fail_('snapshot time regression');
 if(found)pfs_update_(s.pfs,key,function(old){if(!rcj_same_(old,found.record))rcj_fail_('snapshot changed');return r;});
 else pfs_put_(s.pfs,key,r);
 var read=pfs_get_(s.pfs,key);if(!read||!rcj_same_(read.record,r))rcj_fail_('snapshot publish readback');
 return read.record;
}
function rcr_statusAdapter_(cfg,now,maxAgeMs){
 rcj_cfg_(cfg);cfg={root:cfg.root,generation:cfg.generation};
 if(typeof now!=='function'||!Number.isSafeInteger(maxAgeMs)||maxAgeMs<1||maxAgeMs>300000)rcj_fail_('snapshot clock');
 return {read:function(q){
  if(!q||q.action!=='status.read'||['max','telegram'].indexOf(q.bot)<0||!rcj_id_(q.target_id))rcj_fail_('unsupported read');
  return rcj_withLock_(cfg,function(s){
   var got=pfs_get_(s.pfs,rcj_key_('rs1',q.bot+':'+q.target_id));if(!got)rcj_fail_('snapshot missing');
   var r=rcr_validate_(s,got.record,q.bot,q.target_id),t=now();
   if(!Number.isSafeInteger(t)||t<r.observed_at)rcj_fail_('snapshot clock');
   return {observed_at:r.observed_at,stale:r.stale||t-r.observed_at>maxAgeMs,counts:JSON.parse(JSON.stringify(r.counts)),held_reasons:r.held_reasons.slice()};
  });
 }};
}


/* === RexControlTrust.gs === */
/* OFFLINE contract-enforcing wrappers. NOT an authentication implementation.
 * Providers must be trusted server objects and must verify external identity /
 * approval cryptographically or via an authorized platform. No client objects.
 */
function rct_resolvers_(providers,now){
 if(!providers||typeof providers.verifyIdentity!=='function'||typeof providers.readPolicy!=='function'||typeof providers.readApproval!=='function'||typeof providers.readEffectsEnabled!=='function'||typeof now!=='function')throw Error('rex trust providers missing');
 function copy(v){return JSON.parse(JSON.stringify(v));}
 function id(v){return typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v);}
 function validTime(t){var clock=now();return Number.isSafeInteger(clock)&&clock>=0&&Number.isSafeInteger(t)&&t>clock;}
 var actions=['status.read','chats.list','messages.read','groups.list','message.send','message.reply','queue.pause','queue.resume'];
 return {
  authenticate:function(transport){
   var v=providers.verifyIdentity(transport);
   if(!v||v.verified!==true||!id(v.actor_id)||!id(v.issuer_id)||!validTime(v.expires_at))throw Error('rex identity unverified');
   return {authenticated:true,actor_id:v.actor_id};
  },
  policy:{
   get:function(actor){
    if(!id(actor))throw Error('rex actor');var p=providers.readPolicy(actor);
    if(!p||p.actor_id!==actor||typeof p.enabled!=='boolean'||['observer','operator'].indexOf(p.role)<0||!Array.isArray(p.scopes)||p.scopes.length>101||!Number.isSafeInteger(p.revision)||p.revision<0)throw Error('rex policy invalid');
    if(p.scopes.some(function(s){return !s||['max','telegram'].indexOf(s.bot)<0||!id(s.target_id)||!Array.isArray(s.actions)||s.actions.length>actions.length||s.actions.some(function(a){return actions.indexOf(a)<0;});}))throw Error('rex policy scope');
    return copy({enabled:p.enabled,role:p.role,scopes:p.scopes,revision:p.revision});
   },
   effectsEnabled:function(){return providers.readEffectsEnabled()===true;}
  },
  authorizations:{getVerified:function(reference,actor){
   if(!id(reference)||!id(actor))throw Error('rex approval identity');var a=providers.readApproval(reference,actor);
   if(!a||a.verified!==true||a.reference!==reference||a.actor_id!==actor||typeof a.active!=='boolean'||typeof a.binding_hash!=='string'||!/^[a-f0-9]{64}$/.test(a.binding_hash)||!Number.isSafeInteger(a.expires_at)||['owner_action_approval','read_grant'].indexOf(a.kind)<0)throw Error('rex approval unverified');
   // `verified` is an attestation from the trusted provider, not a JSON claim
   // accepted from callers. These wrappers themselves prove no authenticity.
   return copy({active:a.active,actor_id:actor,binding_hash:a.binding_hash,expires_at:a.expires_at,kind:a.kind});
  }}
 };
}


/* === RexControlAdapters.gs === */
/* OFFLINE / UNBOUND / DISABLED. Additive to RexControl, RexControlStorage,
 * RexControlTrust and unchanged PartitionedFeedStore. No entrypoint or transport.
 * ALL command / queue writers MUST execute in ONE GAS project. See ADDENDUM_RU.md.
 */
function rca_obj_(v){return !!v&&typeof v==='object'&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);}
function rca_copy_(v){return JSON.parse(RexControl.canonical(v));}
function rca_fields_(v,keys){return rca_obj_(v)&&Object.keys(v).every(function(k){return keys.indexOf(k)>=0;});}
function rca_noEffect_(){return {state:'failed_certain',no_effect_proven:true};}
function rca_unknown_(){return {state:'uncertain'};}
function rca_decimal_(v,positive){
 if(typeof v==='number'){if(!Number.isSafeInteger(v))return null;v=String(v);}
 return typeof v==='string'&&v.length<=100&&(positive?/^[1-9][0-9]*$/:/^-?[1-9][0-9]*$/).test(v)?v:null;
}
function rcq_key_(bot,target){return rcj_key_('rm1',RexControl.canonical(['operator-queue-v1',bot,target]));}
function rcq_record_(s,r,bot,target){
 if(!rca_fields_(r,['v','kind','root','generation','bot','target_id','revision','paused','last_command_id'])||r.v!==1||r.kind!=='operator-queue-v1'||r.root!==s.cfg.root||r.generation!==s.cfg.generation||r.bot!==bot||r.target_id!==target||!Number.isSafeInteger(r.revision)||r.revision<0||typeof r.paused!=='boolean'||!(r.last_command_id===null||rcj_id_(r.last_command_id)))throw Error('operator queue invalid');
 if((r.revision===0&&(r.paused!==true||r.last_command_id!==null))||(r.revision>0&&!rcj_id_(r.last_command_id)))throw Error('operator queue initialization');
 return r;
}
function rcq_read_(s,bot,target){
 if(['max','telegram'].indexOf(bot)<0||!rca_decimal_(target,false))throw Error('operator queue target');
 var found=pfs_get_(s.pfs,rcq_key_(bot,target));if(!found)throw Error('operator queue missing');
 return rcq_record_(s,found.record,bot,target);
}
/* Explicit OFFLINE provisioning helper. Never called by create/handle/effects.
 * Initial pause is mandatory. Failure can mean the row exists: do not auto-retry.
 */
function rcq_initExplicit_(cfg,bot,target,lock){
 var s=rcj_open_(cfg,lock);if(['max','telegram'].indexOf(bot)<0||!rca_decimal_(target,false))throw Error('operator queue target');
 var key=rcq_key_(bot,target);if(pfs_get_(s.pfs,key))throw Error('operator queue already exists');
 var record={v:1,kind:'operator-queue-v1',root:cfg.root,generation:cfg.generation,bot:bot,target_id:target,revision:0,paused:true,last_command_id:null};
 var saved=pfs_put_(s.pfs,key,record),read=rcq_read_(s,bot,target);
 if(saved.inserted!==true||!rcj_same_(read,record))throw Error('operator queue provision uncertain');return read;
}
function rca_claim_(s,q){
 var found=pfs_get_(s.pfs,rcj_key_('rc1',q.command_id));if(!found)throw Error('operator claim missing');
 var r=rcj_record_(s,found.record,q.command_id);
 if(r.state!=='executing'||r.action!==q.action||r.bot!==q.bot||r.target_id!==q.target_id||r.authorization_ref!==q.authorization_ref||r.binding_hash!==RexControl.binding(q,r.actor_id,{sha256:rcj_hash_}))throw Error('operator claim mismatch');
 return r;
}
function rcq_change_(cfg,q,recheck){
 // Only this operator gate changes. Legacy consumers, group.on/appr, timers,
 // SSI/SWQ/Feed roots, pending rows and uncertain commands are never touched.
 return rcj_withLock_(cfg,function(s){
  rca_claim_(s,q);var old=rcq_read_(s,q.bot,q.target_id);
  if(old.revision!==q.expected_revision||old.revision===Number.MAX_SAFE_INTEGER)return rca_noEffect_();
  // Storage reads may consume the approval lifetime. Revalidate immediately
  // before the CAS write, without acquiring another lock or changing state.
  if(typeof recheck!=='function'||recheck()!==true)return rca_noEffect_();
  var next=rca_copy_(old);next.revision++;next.paused=q.action==='queue.pause';next.last_command_id=q.command_id;
  var saved=pfs_update_(s.pfs,rcq_key_(q.bot,q.target_id),function(current){if(!rcj_same_(current,old))throw Error('operator queue CAS conflict');return next;});
  var read=rcq_read_(s,q.bot,q.target_id);if(!rcj_same_(saved.record,next)||!rcj_same_(read,next))throw Error('operator queue CAS uncertain');
  return {state:'succeeded',revision:read.revision};
 });
}
function rca_receipt_(q,response,botId){
 // The port returns raw platform response {status, body}. 200/accepted alone is
 // NOT a receipt. Any ambiguity AFTER calling it remains uncertain, including
 // rate limits and 4xx. No HTTP failure or exception triggers another send.
 if(!rca_obj_(response)||response.status!==200||!rca_obj_(response.body))return rca_unknown_();
 var body=response.body,m,id,target,sender,reply;
 if(q.bot==='telegram'){
  if(body.ok!==true||!rca_obj_(body.result))return rca_unknown_();m=body.result;
  id=rca_decimal_(m.message_id,true);target=rca_obj_(m.chat)?rca_decimal_(m.chat.id,false):null;
  sender=rca_obj_(m.from)&&m.from.is_bot===true?rca_decimal_(m.from.id,true):null;
  reply=rca_obj_(m.reply_to_message)?rca_decimal_(m.reply_to_message.message_id,true):null;
  if(m.text!==q.payload.text)return rca_unknown_();
 }else{
  m=body.message;if(!rca_obj_(m)||!rca_obj_(m.body))return rca_unknown_();
  id=rcj_id_(m.body.mid)?m.body.mid:null;target=rca_obj_(m.recipient)?rca_decimal_(m.recipient.chat_id,false):null;
  sender=rca_obj_(m.sender)&&m.sender.is_bot===true?rca_decimal_(m.sender.user_id,true):null;
  reply=null;
  if(rca_obj_(m.link)&&m.link.type==='reply'&&rca_obj_(m.link.message)){
   var linked=m.link.message,flat=linked.mid,nested=rca_obj_(linked.body)?linked.body.mid:undefined;
   // MAX documents LinkedMessage.message as MessageBody (flat mid). Retain
   // the previously accepted shape, but reject contradictory receipts.
   if(flat!==undefined&&nested!==undefined&&flat!==nested)return rca_unknown_();
   reply=flat!==undefined?flat:nested;
  }
  if(m.body.text!==q.payload.text)return rca_unknown_();
 }
 if(!id||target!==q.target_id||sender!==botId||(q.action==='message.reply'&&reply!==q.payload.reply_to_id))return rca_unknown_();
 return {state:'succeeded',platform_message_id:id};
}
function rca_effects_(cfg,ports,botIds,recheckIdentity){
 cfg=rca_copy_(cfg);botIds=rca_copy_(botIds);
 return {execute:function(q){
  // Core validates complete command schema and exact approval first. Repeat the
  // small effect allowlist so direct/accidental use cannot dispatch arbitrary APIs.
  if(!q||['message.send','message.reply','queue.pause','queue.resume'].indexOf(q.action)<0||['max','telegram'].indexOf(q.bot)<0||!rca_decimal_(q.target_id,false)||!Number.isSafeInteger(q.expected_revision)||q.expected_revision<0)return rca_noEffect_();
  if(q.action==='queue.pause'||q.action==='queue.resume'){
   if(!rca_fields_(q.payload,[])||Object.keys(q.payload).length)return rca_noEffect_();
   if(recheckIdentity()!==true)return rca_noEffect_();
   // Exceptions after entering CAS are deliberately NOT converted to no-effect.
   return rcq_change_(cfg,q,recheckIdentity);
  }
  if(!rca_fields_(q.payload,q.action==='message.reply'?['text','reply_to_id']:['text'])||typeof q.payload.text!=='string'||!q.payload.text.trim()||q.payload.text.length>4000)return rca_noEffect_();
  if(q.action==='message.reply'&&(!rcj_id_(q.payload.reply_to_id)||(q.bot==='telegram'&&(!rca_decimal_(q.payload.reply_to_id,true)||!Number.isSafeInteger(Number(q.payload.reply_to_id))))))return rca_noEffect_();
  var port=ports[q.bot],botId=botIds[q.bot];
  if(!port||!rca_decimal_(botId,true)||(q.bot==='telegram'?typeof port.sendMessage!=='function':typeof port.postMessage!=='function'))return rca_noEffect_();
  // expected_revision is the operator dispatch gate revision for this exact bot
  // and target. Missing state fails closed; a pause never revokes an in-flight call.
  var admitted=rcj_withLock_(cfg,function(s){rca_claim_(s,q);var gate=rcq_read_(s,q.bot,q.target_id);return !gate.paused&&gate.revision===q.expected_revision;});
  if(!admitted||recheckIdentity()!==true)return rca_noEffect_();
  var request,response;
  try{
   if(q.bot==='telegram'){
    request={chat_id:q.target_id,text:q.payload.text,link_preview_options:{is_disabled:true}};
    if(q.action==='message.reply')request.reply_parameters={message_id:Number(q.payload.reply_to_id),allow_sending_without_reply:false};
    response=port.sendMessage(request); // ONE call; no parse_mode, trim or fallback.
   }else{
    request={query:{chat_id:q.target_id,disable_link_preview:'true'},body:{text:q.payload.text}};
    if(q.action==='message.reply')request.body.link={type:'reply',mid:q.payload.reply_to_id};
    response=port.postMessage(request); // ONE call; no format/default HTML or fallback.
   }
   return rca_receipt_(q,response,botId);
  }catch(ignore){return rca_unknown_();}
 }};
}
function rca_create_(config,providers,ports,now,readOnly){
 // These arguments are SERVER composition, never deserialized from HTTP input.
 // This package does not supply an HTTP route, credentials, verifier or grant store.
 if(!rca_obj_(config)||typeof now!=='function')throw Error('operator composition');
 var cfg=rca_copy_(config),enabled=cfg.enabled===true;
 if(!enabled)return {handle:function(){return {ok:false,state:'rejected',code:'service_disabled'};}};
 rcj_cfg_(cfg.journal);
 if(!rca_obj_(providers)||!rca_obj_(ports)||!rca_obj_(cfg.bot_ids)||!Array.isArray(cfg.principals)||!cfg.principals.length||cfg.principals.length>2||cfg.principals.some(function(p,i){return !rca_fields_(p,['actor_id','issuer_id'])||['rex','claude'].indexOf(p.actor_id)<0||!rcj_id_(p.issuer_id)||cfg.principals.some(function(other,j){return i!==j&&p.actor_id===other.actor_id;});}))throw Error('operator principals');
  var journal=rcj_adapter_(cfg.journal),status=readOnly||rcr_statusAdapter_(cfg.journal,now,cfg.status_max_age_ms);
  if(!status||typeof status.read!=='function')throw Error('operator read composition');
 return {handle:function(request,transport){
  try{
   // Resolver state belongs to this invocation, including its identity expiry.
   var identityExpiresAt=null,lastTime=null;
   function checkedNow(){var at=now();if(!Number.isSafeInteger(at)||at<0||(lastTime!==null&&at<lastTime))throw Error('operator clock regression');lastTime=at;return at;}
   var trusted={verifyIdentity:function(incoming){
    var identity=providers.verifyIdentity(incoming);
    if(!identity||!cfg.principals.some(function(p){return p.actor_id===identity.actor_id&&p.issuer_id===identity.issuer_id;}))throw Error('operator issuer');
    identityExpiresAt=identity.expires_at;return identity;
   },readPolicy:providers.readPolicy,readApproval:providers.readApproval,readEffectsEnabled:providers.readEffectsEnabled};
   var trust=rct_resolvers_(trusted,checkedNow);
   // Stable copy prevents caller-owned input changing after approval calculation.
   var q=rca_copy_(request),context=trust.authenticate(transport),started=checkedNow();
   if(!Number.isSafeInteger(started)||started<0)throw Error('operator clock');
   var originalPolicy=RexControl.canonical(trust.policy.get(context.actor_id));
   var binding=RexControl.binding(q,context.actor_id,{sha256:rcj_hash_});
   function recheck(){
    try{
     var before=checkedNow();if(!Number.isSafeInteger(before)||before<started)return false;
     var freshIdentity=trust.authenticate(transport),freshPolicy=trust.policy.get(context.actor_id);
     var approval=trust.authorizations.getVerified(q.authorization_ref,context.actor_id),enabled=trust.policy.effectsEnabled(),at=checkedNow();
     // All potentially slow provider reads happen BEFORE the final timestamp.
     return Number.isSafeInteger(at)&&at>=before&&at>=started&&at>=q.issued_at&&at<q.expires_at&&Number.isSafeInteger(identityExpiresAt)&&identityExpiresAt>at&&freshIdentity.actor_id===context.actor_id&&RexControl.canonical(freshPolicy)===originalPolicy&&enabled===true&&approval.active===true&&approval.kind==='owner_action_approval'&&approval.actor_id===context.actor_id&&approval.binding_hash===binding&&approval.expires_at>at;
    }catch(ignore){return false;}
   }
   function recheckRead(){
    try{
     var before=checkedNow();if(!Number.isSafeInteger(before)||before<started)return false;
     var freshIdentity=trust.authenticate(transport),freshPolicy=trust.policy.get(context.actor_id);
     var approval=trust.authorizations.getVerified(q.authorization_ref,context.actor_id),at=checkedNow();
     // One bounded final pass after storage and ALL slow provider reads. Reads
     // accept read grants and deliberately do not depend on the effects switch.
     return Number.isSafeInteger(at)&&at>=before&&at>=started&&at>=q.issued_at&&at<q.expires_at&&Number.isSafeInteger(identityExpiresAt)&&identityExpiresAt>at&&freshIdentity.actor_id===context.actor_id&&RexControl.canonical(freshPolicy)===originalPolicy&&approval.active===true&&['owner_action_approval','read_grant'].indexOf(approval.kind)>=0&&approval.actor_id===context.actor_id&&approval.binding_hash===binding&&approval.expires_at>at;
    }catch(ignore){return false;}
   }
   var effects=rca_effects_(cfg.journal,ports,cfg.bot_ids,recheck);
   var result=RexControl.execute(q,context,{now:checkedNow,sha256:rcj_hash_,policy:trust.policy,authorizations:trust.authorizations,journal:journal,readOnly:status,effects:effects});
   if(result&&result.ok===true&&result.state==='observed'&&!recheckRead())return {ok:false,state:'rejected',code:'authorization'};
   return result;
  }catch(ignore){return {ok:false,state:'rejected',code:'dependency_unavailable'};}
 }};
}


/* === RexControlHttpPorts.gs === */
/* CANDIDATE, NOT WIRED. Server-only composition for RexControlAdapters.
 * No endpoint, no authentication/approval provider, no init, no retry.
 * Creating this object performs no network requests or credential reads.
 * Call only from the verified single executor AFTER RexControl authorization.
 */
function rch_createPorts_(config,fetchOnce,readToken) {
 function fail(){throw Error('operator transport unavailable');}
 function object(v){return v&&typeof v==='object'&&!Array.isArray(v);}
 function keys(v,n){return object(v)&&Object.keys(v).every(function(k){return n.indexOf(k)>=0;});}
 function id(v){return typeof v==='string'&&/^-?[1-9][0-9]{0,19}$/.test(v);}
 function text(v){return typeof v==='string'&&v.trim().length>0&&v.length<=4000;}
 if(!object(config)||typeof fetchOnce!=='function'||typeof readToken!=='function')fail();
 var c=JSON.parse(JSON.stringify(config));
 if(c.enabled!==true) return {telegram:{sendMessage:fail},max:{postMessage:fail}};
 if(['https://platform-api.max.ru','https://platform-api2.max.ru'].indexOf(c.max_origin)<0||!object(c.allowed_targets)||!['telegram','max'].every(function(k){return Array.isArray(c.allowed_targets[k])&&c.allowed_targets[k].length<=100&&c.allowed_targets[k].every(id);}))fail();
 if(c.max_owner_dialog!==undefined&&(!keys(c.max_owner_dialog,['chat_id','user_id'])||Object.keys(c.max_owner_dialog).length!==2||c.max_owner_dialog.chat_id!=='678987782'||c.max_owner_dialog.user_id!=='140426852'||c.allowed_targets.max.indexOf(c.max_owner_dialog.chat_id)<0))fail();
 function allowed(bot,target){return id(target)&&c.allowed_targets[bot].indexOf(target)>=0;}
 function post(bot,url,body,headers){
  var response,raw;
  try{
   response=fetchOnce(url,{method:'post',contentType:'application/json',payload:JSON.stringify(body),headers:headers,followRedirects:false,muteHttpExceptions:true,validateHttpsCertificates:true});
   var status=response.getResponseCode();
   if(status!==200)return {status:status,body:null};
   raw=response.getContentText();if(typeof raw!=='string'||raw.length>131072)fail();
   var parsed=JSON.parse(raw);if(!object(parsed))fail();
   return {status:status,body:parsed};
  }catch(ignore){fail();}
 }
 return {
  telegram:{sendMessage:function(input){
   if(!keys(input,['chat_id','text','link_preview_options','reply_parameters'])||!allowed('telegram',input.chat_id)||!text(input.text)||!keys(input.link_preview_options,['is_disabled'])||input.link_preview_options.is_disabled!==true)fail();
   var body={chat_id:input.chat_id,text:input.text,link_preview_options:{is_disabled:true}};
   if(input.reply_parameters!==undefined){var r=input.reply_parameters;if(!keys(r,['message_id','allow_sending_without_reply'])||!Number.isSafeInteger(r.message_id)||r.message_id<=0||r.allow_sending_without_reply!==false)fail();body.reply_parameters={message_id:r.message_id,allow_sending_without_reply:false};}
   var token;try{token=readToken('telegram');}catch(ignore){fail();}
   if(typeof token!=='string'||!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token))fail();
   return post('telegram','https://api.telegram.org/bot'+token+'/sendMessage',body,{});
  }},
  max:{postMessage:function(input){
   if(!keys(input,['query','body'])||!keys(input.query,['chat_id','disable_link_preview'])||!allowed('max',input.query.chat_id)||input.query.disable_link_preview!=='true'||!keys(input.body,['text','link'])||!text(input.body.text))fail();
   var body={text:input.body.text};
   if(input.body.link!==undefined){var l=input.body.link;if(!keys(l,['type','mid'])||l.type!=='reply'||typeof l.mid!=='string'||!/^[A-Za-z0-9_.:-]{1,100}$/.test(l.mid))fail();body.link={type:'reply',mid:l.mid};}
   var token;try{token=readToken('max');}catch(ignore){fail();}
   if(typeof token!=='string'||!token||token.length>4096||/[\x00-\x20\x7f]/.test(token))fail();
   var personal=c.max_owner_dialog&&input.query.chat_id===c.max_owner_dialog.chat_id;
   var query=personal?'user_id='+encodeURIComponent(c.max_owner_dialog.user_id):'chat_id='+encodeURIComponent(input.query.chat_id);
   var result=post('max',c.max_origin+'/messages?'+query+'&disable_link_preview=true',body,{Authorization:token});
   if(personal&&result.status===200){var m=result.body&&result.body.message,recipient=m&&m.recipient;if(!object(recipient)||String(recipient.user_id)!==c.max_owner_dialog.user_id||String(recipient.chat_id)!==c.max_owner_dialog.chat_id||recipient.chat_type!=='dialog')fail();}
   return result;
  }}
 };
}


/* === RexControlBridge.gs === */
/* Additive single-project bridge. No doPost override and no auto-enable.
 * Dispatch only op=rexctl to rexctl_handleEnvelope_(parsedBody).
 * Gateway authenticates the assistant and signs with its actor-specific key.
 * All state and gateway keys remain in Script Properties; no secrets in output.
 */
var RXB_ACTIONS_=['status.read','chats.list','messages.read','groups.list','message.send','message.reply','queue.pause','queue.resume'];
var RXB_OWNER_='user@example.org';
function rxb_fail_(){throw Error('control unavailable');}
function rxb_obj_(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function rxb_exact_(v,keys){return rxb_obj_(v)&&Object.keys(v).length===keys.length&&keys.every(function(k){return Object.prototype.hasOwnProperty.call(v,k);});}
function rxb_id_(v){return typeof v==='string'&&/^[A-Za-z0-9_.:-]{1,100}$/.test(v);}
function rxb_target_(v){return typeof v==='string'&&/^-?[1-9][0-9]{0,19}$/.test(v);}
function rxb_clone_(v){return JSON.parse(RexControl.canonical(v));}
function rxb_json_(p,key){var s=p.getProperty(key);if(typeof s!=='string'||!s||s.length>9000)rxb_fail_();try{return JSON.parse(s);}catch(ignore){rxb_fail_();}}
function rxb_hex_(a){return a.map(function(b){return ('0'+((b+256)%256).toString(16)).slice(-2);}).join('');}
function rxb_equal_(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;var x=0;for(var i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0;}
function rxb_hmac_(body,key){return rxb_hex_(Utilities.computeHmacSha256Signature(RexControl.canonical(body),key,Utilities.Charset.UTF_8));}
function rxb_config_(p,requireEnabled){
 var c=rxb_json_(p,'REXCTL_CONFIG_V1');
 if(!rxb_exact_(c,['version','enabled','effects_enabled','owner_email','journal','bot_ids','principals','allowed_targets','max_origin','telegram_mode'].concat(Object.prototype.hasOwnProperty.call(c,'max_read_all_groups')?['max_read_all_groups']:[]))||c.version!=='rex-bridge-v1'||typeof c.enabled!=='boolean'||typeof c.effects_enabled!=='boolean'||c.owner_email!==RXB_OWNER_||(requireEnabled&&c.enabled!==true)||!rxb_obj_(c.bot_ids)||!rxb_obj_(c.allowed_targets)||!Array.isArray(c.principals)||c.principals.length!==2||['direct','legacy_bridge'].indexOf(c.telegram_mode)<0||['https://platform-api.max.ru','https://platform-api2.max.ru'].indexOf(c.max_origin)<0)rxb_fail_();
 if(c.max_read_all_groups!==undefined&&typeof c.max_read_all_groups!=='boolean')rxb_fail_();
 rcj_cfg_(c.journal);
 ['max','telegram'].forEach(function(bot){if(typeof c.bot_ids[bot]!=='string'||!/^[1-9][0-9]{0,19}$/.test(c.bot_ids[bot])||!Array.isArray(c.allowed_targets[bot])||c.allowed_targets[bot].length>100||c.allowed_targets[bot].some(function(x,i,a){return !rxb_target_(x)||a.indexOf(x)!==i;}))rxb_fail_();});
 ['rex','claude'].forEach(function(actor){var a=c.principals.filter(function(x){return x.actor_id===actor;});if(a.length!==1||!rxb_exact_(a[0],['actor_id','issuer_id'])||!rxb_id_(a[0].issuer_id))rxb_fail_();});
 return c;
}
function rxb_policy_(p,c,actor,q){
 var all=rxb_json_(p,'REXCTL_POLICIES_V1'),v=all[actor];
 if(!rxb_exact_(v,['actor_id','enabled','role','scopes','revision'])||v.actor_id!==actor||typeof v.enabled!=='boolean'||['observer','operator'].indexOf(v.role)<0||!Number.isSafeInteger(v.revision)||v.revision<0||!Array.isArray(v.scopes)||v.scopes.length>100)rxb_fail_();
 v.scopes.forEach(function(s){if(!rxb_exact_(s,['bot','target_id','actions'])||['max','telegram'].indexOf(s.bot)<0||c.allowed_targets[s.bot].indexOf(s.target_id)<0||!Array.isArray(s.actions)||s.actions.some(function(a){return RXB_ACTIONS_.indexOf(a)<0;}))rxb_fail_();});
 v=rxb_clone_(v);
 if(c.max_read_all_groups===true&&q&&q.bot==='max'){
  if(q.action==='groups.list'&&q.target_id==='max-groups')v.scopes.push({bot:'max',target_id:'max-groups',actions:['groups.list']});
  else if(['chats.list','messages.read'].indexOf(q.action)>=0&&q.target_id!=='678987782'&&rxb_maxKnown_(q.target_id))v.scopes.push({bot:'max',target_id:q.target_id,actions:[q.action]});
 }
 return v;
}
function rxb_token_(p,bot){
 var value=p.getProperty(bot==='telegram'?'TG_TOKEN':'MAX_TOKEN');
 if(typeof value!=='string'||(bot==='telegram'?!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(value):(!value||value.length>4096||/[\x00-\x20\x7f]/.test(value))))rxb_fail_();
 return value;
}
function rxb_scope_(policy,q){return policy.enabled===true&&policy.scopes.some(function(s){return s.bot===q.bot&&s.target_id===q.target_id&&s.actions.indexOf(q.action)>=0;});}
function rxb_credentials_(p,c,bot){
 if(bot==='telegram'&&c.telegram_mode==='legacy_bridge'){
  if(typeof mx_tgCall!=='function'||typeof kcmd_!=='function'||!/^[a-f0-9]{64}$/.test(kcmd_())||!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(p.getProperty('TG_APP_URL')||''))rxb_fail_();
 }else rxb_token_(p,bot);
}
function rxb_telegramOnce_(){rxb_fail_();}

function rxb_envelope_(e,c,keys,now){
 if(!rxb_exact_(e,['op','version','actor_id','issuer_id','issued_at','expires_at','nonce','request','signature'])||e.op!=='rexctl'||e.version!=='rex-gateway-v1'||['rex','claude'].indexOf(e.actor_id)<0||!rxb_id_(e.issuer_id)||!rxb_id_(e.nonce)||!Number.isSafeInteger(e.issued_at)||!Number.isSafeInteger(e.expires_at)||e.issued_at>now+5000||e.expires_at<=now||e.expires_at<=e.issued_at||e.expires_at-e.issued_at>60000)rxb_fail_();
 if(!c.principals.some(function(x){return x.actor_id===e.actor_id&&x.issuer_id===e.issuer_id;}))rxb_fail_();
 var key=keys[e.actor_id];if(!rxb_exact_(key,['issuer_id','secret_hex'])||key.issuer_id!==e.issuer_id||typeof key.secret_hex!=='string'||!/^[0-9a-f]{64}$/.test(key.secret_hex)||typeof e.signature!=='string'||!/^[0-9a-f]{64}$/.test(e.signature))rxb_fail_();
 var unsigned={};Object.keys(e).forEach(function(k){if(k!=='signature')unsigned[k]=e[k];});
 if(!rxb_equal_(rxb_hmac_(unsigned,key.secret_hex),e.signature))rxb_fail_();
 var q=e.request;
 if(!rxb_exact_(q,['version','command_id','action','bot','target_id','payload','issued_at','expires_at','authorization_ref','expected_revision'])||q.version!=='rexctl-v1'||!rxb_id_(q.command_id)||RXB_ACTIONS_.indexOf(q.action)<0||['max','telegram'].indexOf(q.bot)<0||!rxb_requestTarget_(c,q)||!rxb_obj_(q.payload)||!Number.isSafeInteger(q.issued_at)||!Number.isSafeInteger(q.expires_at)||q.issued_at>now||q.expires_at<=now||q.expires_at<=q.issued_at||q.expires_at-q.issued_at>300000||!rxb_id_(q.authorization_ref)||!Number.isSafeInteger(q.expected_revision)||q.expected_revision<0)rxb_fail_();
 return RexControl.canonical(unsigned);
}
function rxb_claimNonce_(p,e,clock){
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{
  var now=clock();if(now>=e.expires_at||now<e.issued_at-5000)rxb_fail_();
  var raw=p.getProperty('REXCTL_NONCES_V1'),old=raw===null?{}:JSON.parse(raw),next={};if(!rxb_obj_(old)||Object.keys(old).length>64)rxb_fail_();
  Object.keys(old).forEach(function(k){if(!/^[a-f0-9]{64}$/.test(k)||!Number.isSafeInteger(old[k]))rxb_fail_();if(old[k]>now)next[k]=old[k];});
  var key=rcj_hash_(e.actor_id+':'+e.nonce);if(next[key]!==undefined||Object.keys(next).length>=64)rxb_fail_();
  next[key]=e.expires_at;var serialized=JSON.stringify(next);if(serialized.length>8000)rxb_fail_();
  p.setProperty('REXCTL_NONCES_V1',serialized);if(p.getProperty('REXCTL_NONCES_V1')!==serialized)rxb_fail_();
 }finally{lock.releaseLock();}
}
function rxb_providers_(p,c,e,clock){
 var initial=RexControl.canonical(c),signed=RexControl.canonical(e),q=e.request,binding=RexControl.binding(q,e.actor_id,{sha256:rcj_hash_});
 function liveConfig(){var fresh=rxb_config_(p,true);if(RexControl.canonical(fresh)!==initial)rxb_fail_();return fresh;}
 return {
  verifyIdentity:function(incoming){if(RexControl.canonical(incoming)!==signed)rxb_fail_();var fresh=liveConfig();rxb_envelope_(e,fresh,rxb_json_(p,'REXCTL_GATEWAY_KEYS_V1'),clock());return {verified:true,actor_id:e.actor_id,issuer_id:e.issuer_id,expires_at:e.expires_at};},
  readPolicy:function(actor){if(actor!==e.actor_id)rxb_fail_();return rxb_policy_(p,liveConfig(),actor,q);},
  readEffectsEnabled:function(){return liveConfig().effects_enabled===true;},
  readApproval:function(reference,actor){
   if(actor!==e.actor_id||reference!==q.authorization_ref)rxb_fail_();var fresh=liveConfig(),policy=rxb_policy_(p,fresh,actor,q),now=clock();if(!rxb_scope_(policy,q))rxb_fail_();
   if(['status.read','chats.list','messages.read','groups.list'].indexOf(q.action)>=0){
    if(reference!=='read:'+e.nonce)rxb_fail_();return {verified:true,reference:reference,active:true,actor_id:actor,binding_hash:binding,expires_at:Math.min(q.expires_at,e.expires_at),kind:'read_grant'};
   }
   var a=rxb_json_(p,'REXCTL_APPROVAL_'+reference);
   if(!rxb_exact_(a,['reference','actor_id','active','binding_hash','kind','created_at','expires_at','approved_by'])||a.reference!==reference||a.actor_id!==actor||a.active!==true||a.binding_hash!==binding||a.kind!=='owner_action_approval'||a.approved_by!==RXB_OWNER_||!Number.isSafeInteger(a.created_at)||!Number.isSafeInteger(a.expires_at)||a.created_at>now||a.expires_at<=now||a.expires_at-a.created_at>300000||a.expires_at>q.expires_at)rxb_fail_();
   a.verified=true;return a;
  }
 };
}
function rexctl_handleEnvelope_(envelope){
 try{
  if(RexControl.canonical(envelope).length>30000)rxb_fail_();var e=rxb_clone_(envelope),p=PropertiesService.getScriptProperties(),clock=function(){return Date.now();},c=rxb_config_(p,true);
  rxb_envelope_(e,c,rxb_json_(p,'REXCTL_GATEWAY_KEYS_V1'),clock());
  var policy=rxb_policy_(p,c,e.actor_id,e.request);if(!rxb_scope_(policy,e.request))rxb_fail_();
  if(e.request.bot==='telegram'&&c.telegram_mode==='legacy_bridge'&&['message.send','message.reply'].indexOf(e.request.action)>=0)rxb_fail_();
  // Validate live credentials before the durable nonce reservation; never print them.
  rxb_credentials_(p,c,e.request.bot);
  var providers=rxb_providers_(p,c,e,clock);
  providers.readApproval(e.request.authorization_ref,e.actor_id);
  var ports=rch_createPorts_({enabled:true,max_origin:c.max_origin,allowed_targets:c.allowed_targets,max_owner_dialog:e.request.bot==='max'&&e.request.target_id==='678987782'?rxb_ownerMaxDialog_(p,c):undefined},function(url,options){return UrlFetchApp.fetch(url,options);},function(bot){return rxb_token_(p,bot);});
  if(c.telegram_mode==='legacy_bridge')ports.telegram={sendMessage:function(input){return rxb_telegramOnce_(c,e.request,input);}};
  var reads=rxb_reads_(c,p,clock,function(url,options){return UrlFetchApp.fetch(url,options);});
  var server=rca_create_({enabled:true,journal:c.journal,bot_ids:c.bot_ids,principals:c.principals,status_max_age_ms:60000},providers,ports,clock,reads);
  rxb_claimNonce_(p,e,clock);
  return server.handle(e.request,e);
 }catch(ignore){return {ok:false,state:'rejected',code:'control_unavailable'};}
}


/* === RexControlMaxGroups.gs === */
/* MAX read scope follows the event-derived registry plus live membership.
 * The registry is not proof of current membership and on/appr govern forwarding,
 * not permission to read. Never infer membership from those automation flags.
 * This module does not alter groups, subscriptions, operator gates or sends.
 */
function rxb_maxRegistry_(){
 if(typeof mx_groups!=='function')rxb_fail_();
 var groups=mx_groups();if(!rxb_obj_(groups)||Object.keys(groups).length>10000)rxb_fail_();
 return groups;
}
function rxb_maxKnown_(target){
 if(!rxb_target_(target))return false;
 return Object.prototype.hasOwnProperty.call(rxb_maxRegistry_(),target);
}
function rxb_requestTarget_(c,q){
 if(!q||['max','telegram'].indexOf(q.bot)<0)return false;
 if(q.action==='groups.list')return c.max_read_all_groups===true&&q.bot==='max'&&q.target_id==='max-groups';
 if(!rxb_target_(q.target_id))return false;
 if(c.allowed_targets[q.bot].indexOf(q.target_id)>=0)return true;
 return c.max_read_all_groups===true&&q.bot==='max'&&['chats.list','messages.read'].indexOf(q.action)>=0&&q.target_id!=='678987782'&&rxb_maxKnown_(q.target_id);
}
function rxb_maxMembership_(c,p,target,fetchOnce){
 if(!rxb_target_(target))rxb_fail_();
 var r=fetchOnce(c.max_origin+'/chats/'+encodeURIComponent(target)+'/members/me',{method:'get',headers:{Authorization:rxb_token_(p,'max')},followRedirects:false,muteHttpExceptions:true,validateHttpsCertificates:true});
 var status=r.getResponseCode();
 if(status===403||status===404)return null;
 if(status!==200)rxb_fail_();
 var text=r.getContentText();if(typeof text!=='string'||text.length>32768)rxb_fail_();
 var m=JSON.parse(text);
 if(!rxb_obj_(m)||m.is_bot!==true||((typeof m.user_id==='number'&&!Number.isSafeInteger(m.user_id))||String(m.user_id)!==c.bot_ids.max)||typeof m.is_admin!=='boolean')rxb_fail_();
 if(m.permissions!==null&&m.permissions!==undefined&&(!Array.isArray(m.permissions)||m.permissions.length>30||m.permissions.some(function(v){return typeof v!=='string'||v.length>80;})))rxb_fail_();
 return {is_admin:m.is_admin,read_all_messages:Array.isArray(m.permissions)&&m.permissions.indexOf('read_all_messages')>=0};
}
function rxb_maxGroupPage_(c,p,q,fetchOnce){
 if(c.max_read_all_groups!==true||q.bot!=='max'||q.target_id!=='max-groups'||!rxb_obj_(q.payload)||!Number.isSafeInteger(q.payload.limit)||q.payload.limit<1||q.payload.limit>10||(q.payload.after_id!==undefined&&!rxb_target_(q.payload.after_id)))rxb_fail_();
 var groups=rxb_maxRegistry_(),ids=Object.keys(groups).filter(function(id){return rxb_target_(id)&&id!=='678987782';}).sort();
 var remaining=ids.filter(function(id){return q.payload.after_id===undefined||id>q.payload.after_id;}),page=remaining.slice(0,q.payload.limit),items=[];
 page.forEach(function(id){
  var member=rxb_maxMembership_(c,p,id,fetchOnce);if(!member)return;
  var title=String(groups[id]&&groups[id].title||('Группа '+id)).slice(0,200);
  items.push({id:id,title:title,is_admin:member.is_admin,read_all_messages:member.read_all_messages});
 });
 return {items:items,next_after:remaining.length>page.length?page[page.length-1]:null,inventory_source:'event_registry',complete_inventory:false};
}


/* === RexControlReadPorts.gs === */
/* Only owner-configured exact targets. No portal reads and no Telegram history. */
function rxb_reads_(c,p,clock,fetchOnce){
 function id(v){if(typeof v==='number'&&!Number.isSafeInteger(v))rxb_fail_();var s=String(v);if(!rxb_target_(s))rxb_fail_();return s;}
 function get(url,headers){var r=fetchOnce(url,{method:'get',headers:headers,followRedirects:false,muteHttpExceptions:true,validateHttpsCertificates:true});if(r.getResponseCode()!==200)rxb_fail_();var s=r.getContentText();if(typeof s!=='string'||s.length>262144)rxb_fail_();var v=JSON.parse(s);if(!rxb_obj_(v))rxb_fail_();return v;}
 return {read:function(q){
  if(!q||['max','telegram'].indexOf(q.bot)<0||!rxb_requestTarget_(c,q))rxb_fail_();
  if(q.action==='status.read')return rcj_withLock_(c.journal,function(s){var gate=rcq_read_(s,q.bot,q.target_id);return {observed_at:clock(),stale:false,counts:{held:gate.paused?1:0},held_reasons:gate.paused?['paused']:[],operator_revision:gate.revision,operator_paused:gate.paused};});
  if(q.action==='groups.list')return rxb_maxGroupPage_(c,p,q,fetchOnce);
  var checkMembership=c.max_read_all_groups===true&&q.bot==='max'&&['chats.list','messages.read'].indexOf(q.action)>=0;
  if(checkMembership&&!rxb_maxMembership_(c,p,q.target_id,fetchOnce))rxb_fail_();
  var data,title;
  if(q.action==='chats.list'&&q.bot==='telegram'&&c.telegram_mode==='legacy_bridge'){
   var registry=rxb_json_(p,'REXCTL_TELEGRAM_CHATS_V1');
   if(!rxb_exact_(registry,['verified_by','verified_at','items'])||registry.verified_by!==RXB_OWNER_||!Number.isSafeInteger(registry.verified_at)||registry.verified_at>clock()||!Array.isArray(registry.items)||registry.items.length>100)rxb_fail_();
   var found=registry.items.filter(function(v){return rxb_exact_(v,['id','title'])&&v.id===q.target_id;});
   if(found.length!==1||typeof found[0].title!=='string'||!found[0].title||found[0].title.length>200)rxb_fail_();
   return {items:[{id:q.target_id,title:found[0].title}]};
  }
  var token=rxb_token_(p,q.bot);
  if(q.action==='chats.list'){
   if(q.bot==='telegram'){data=get('https://api.telegram.org/bot'+token+'/getChat?chat_id='+encodeURIComponent(q.target_id),{});if(data.ok!==true||!rxb_obj_(data.result)||id(data.result.id)!==q.target_id)rxb_fail_();title=data.result.title||data.result.username||[data.result.first_name,data.result.last_name].filter(Boolean).join(' ');}
   else{data=get(c.max_origin+'/chats/'+encodeURIComponent(q.target_id),{Authorization:token});if(id(data.chat_id)!==q.target_id||data.status!=='active')rxb_fail_();title=data.title;}
   if(typeof title!=='string'||!title||title.length>200)rxb_fail_();if(checkMembership&&!rxb_maxMembership_(c,p,q.target_id,fetchOnce))rxb_fail_();return {items:[{id:q.target_id,title:title}]};
  }
  if(q.action==='messages.read'&&q.bot==='max'){
   // Raw documented MAX millisecond bounds; this is not a lossless cursor.
   // Same-timestamp boundaries can overlap: consumers must deduplicate by mid.
   if(q.payload.before_id!==undefined)rxb_fail_();
   var query='';['from','to'].forEach(function(k){if(q.payload[k]!==undefined){if(!Number.isSafeInteger(q.payload[k])||q.payload[k]<0)rxb_fail_();query+='&'+k+'='+q.payload[k];}});
   data=get(c.max_origin+'/messages?chat_id='+encodeURIComponent(q.target_id)+'&count='+q.payload.limit+query,{Authorization:token});
   if(!Array.isArray(data.messages)||data.messages.length>q.payload.limit)rxb_fail_();
   if(checkMembership&&!rxb_maxMembership_(c,p,q.target_id,fetchOnce))rxb_fail_();
   return {items:data.messages.map(function(m){
    if(!rxb_obj_(m)||!rxb_obj_(m.body)||!rxb_id_(m.body.mid)||!rxb_obj_(m.recipient)||id(m.recipient.chat_id)!==q.target_id)rxb_fail_();
    var text=m.body.text==null?'':m.body.text;if(typeof text!=='string'||text.length>16000)rxb_fail_();
    var item={id:m.body.mid,target_id:q.target_id,text:text};
    if(m.timestamp!==undefined){if(!Number.isSafeInteger(m.timestamp)||m.timestamp<0)rxb_fail_();item.timestamp=m.timestamp;}
    if(m.sender!=null){if(!rxb_obj_(m.sender)||typeof m.sender.is_bot!=='boolean')rxb_fail_();item.sender={id:id(m.sender.user_id),is_bot:m.sender.is_bot};['first_name','last_name','username'].forEach(function(k){if(m.sender[k]!=null){if(typeof m.sender[k]!=='string'||m.sender[k].length>200)rxb_fail_();item.sender[k]=m.sender[k];}});}
    if(m.body.attachments!=null){
     if(!Array.isArray(m.body.attachments)||m.body.attachments.length>50)rxb_fail_();
     item.attachments=m.body.attachments.map(function(a){
      if(!rxb_obj_(a)||!rxb_id_(a.type))rxb_fail_();var out={type:a.type},payload=rxb_obj_(a.payload)?a.payload:{};
      ['filename','size','width','height','duration','title','description','transcription'].forEach(function(k){var value=a[k]!==undefined?a[k]:payload[k];if(value!=null)out[k]=value;});return out;
     });
    }
    if(m.link!=null){if(!rxb_obj_(m.link)||['reply','forward'].indexOf(m.link.type)<0||!rxb_obj_(m.link.message)||!rxb_id_(m.link.message.mid))rxb_fail_();item.link={type:m.link.type,message_id:m.link.message.mid};}
    return item;
   })};
  }
  rxb_fail_();
 }};
}


/* === RexControlOwner.gs === */
/* Editor-only operations. No remotely dispatched approval or enable route. */
function rxb_owner_(){if(Session.getActiveUser().getEmail()!==RXB_OWNER_||Session.getEffectiveUser().getEmail()!==RXB_OWNER_)rxb_fail_();}
function rexctl_inspectSetup(){
 rxb_owner_();var p=PropertiesService.getScriptProperties(),groups=[],tg=[],maxToken=false,tgToken=false,legacy=false,configured=false;
 try{rxb_token_(p,'max');maxToken=true;}catch(ignore){}
 try{rxb_token_(p,'telegram');tgToken=true;}catch(ignore){}
 try{rxb_credentials_(p,{telegram_mode:'legacy_bridge'},'telegram');legacy=true;}catch(ignore){}
 if(typeof mx_groups==='function'){var source=mx_groups();Object.keys(source).forEach(function(id){var g=source[id];if(rxb_target_(id)&&g)groups.push({id:id,title:String(g.title||'').slice(0,200)});});}
 // Read raw existing registry only; never call tgUsers_(), which can repair state.
 try{var users=JSON.parse(p.getProperty('tg_users')||'{}');Object.keys(users).forEach(function(k){var u=users[k];if(u&&rxb_target_(String(u.chat||''))&&!tg.some(function(v){return v.id===String(u.chat);}))tg.push({id:String(u.chat),title:String(u.name||u.first_name||u.username||'').slice(0,200)});});}catch(ignore){}
 try{rxb_config_(p,false);configured=true;}catch(ignore){}
 var out={owner_verified:true,configured:configured,max_token_present:maxToken,telegram_token_present:tgToken,telegram_legacy_bridge_ready:legacy,max_eligible_targets:groups,max_inventory_source:'event_registry',max_membership_verified:false,telegram_local_known_targets:tg,shared_control_enabled:false};
 if(configured)out.shared_control_enabled=rxb_config_(p,false).enabled;
 console.log(JSON.stringify(out));return out;
}
function rexctl_prepareDisabled(config,keys,policies,telegramRegistry){
 rxb_owner_();var p=PropertiesService.getScriptProperties();
 if(p.getProperty('REXCTL_CONFIG_V1')!==null)rxb_fail_();
 if(!config||config.enabled!==false||config.effects_enabled!==false)rxb_fail_();
 var values={REXCTL_CONFIG_V1:JSON.stringify(config),REXCTL_GATEWAY_KEYS_V1:JSON.stringify(keys),REXCTL_POLICIES_V1:JSON.stringify(policies)};
 if(telegramRegistry)values.REXCTL_TELEGRAM_CHATS_V1=JSON.stringify(telegramRegistry);
 var shadow={getProperty:function(k){return Object.prototype.hasOwnProperty.call(values,k)?values[k]:p.getProperty(k);}};
 var c=rxb_config_(shadow,false);
 ['rex','claude'].forEach(function(a){rxb_policy_(shadow,c,a);var k=keys[a];if(!rxb_exact_(k,['issuer_id','secret_hex'])||!c.principals.some(function(v){return v.actor_id===a&&v.issuer_id===k.issuer_id;})||!/^[a-f0-9]{64}$/.test(k.secret_hex))rxb_fail_();});
 if(keys.rex.secret_hex===keys.claude.secret_hex)rxb_fail_();
 ['max','telegram'].forEach(function(bot){if(c.allowed_targets[bot].length)rxb_credentials_(p,c,bot);});
 Object.keys(values).forEach(function(k){if(values[k].length>8000)rxb_fail_();});
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{if(p.getProperty('REXCTL_CONFIG_V1')!==null)rxb_fail_();p.setProperties(values,false);Object.keys(values).forEach(function(k){if(p.getProperty(k)!==values[k])rxb_fail_();});}finally{lock.releaseLock();}
 return {ok:true,enabled:false,effects_enabled:false};
}
function rexctl_createJournal(generation){
 rxb_owner_();var p=PropertiesService.getScriptProperties();if(p.getProperty('REXCTL_CONFIG_V1')!==null||p.getProperty('REXCTL_PREPARED_JOURNAL_V1')!==null)rxb_fail_();
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{if(p.getProperty('REXCTL_PREPARED_JOURNAL_V1')!==null)rxb_fail_();var cfg=rcj_initExplicit_(generation,lock);p.setProperty('REXCTL_PREPARED_JOURNAL_V1',JSON.stringify(cfg));if(p.getProperty('REXCTL_PREPARED_JOURNAL_V1')!==JSON.stringify(cfg))rxb_fail_();return cfg;}finally{lock.releaseLock();}
}
function rexctl_initializeGates(){
 rxb_owner_();var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,false);if(c.enabled||c.effects_enabled)rxb_fail_();
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{var out=[];['max','telegram'].forEach(function(bot){c.allowed_targets[bot].forEach(function(target){out.push(rcq_initExplicit_(c.journal,bot,target,lock));});});return {ok:true,gates:out};}finally{lock.releaseLock();}
}
function rexctl_approveExactCommand(actor,command){
 rxb_owner_();if(['rex','claude'].indexOf(actor)<0||!command||['message.send','message.reply','queue.pause','queue.resume'].indexOf(command.action)<0)rxb_fail_();
 var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,false),policy=rxb_policy_(p,c,actor),q=rxb_clone_(command),now=Date.now();
 if(!rxb_scope_(policy,q)||!rxb_id_(q.authorization_ref)||q.authorization_ref.indexOf('read:')===0||!Number.isSafeInteger(q.issued_at)||!Number.isSafeInteger(q.expires_at)||q.issued_at>now||q.expires_at<=now||q.expires_at-q.issued_at>300000)rxb_fail_();
 var hash=RexControl.binding(q,actor,{sha256:rcj_hash_}),a={reference:q.authorization_ref,actor_id:actor,active:true,binding_hash:hash,kind:'owner_action_approval',created_at:now,expires_at:q.expires_at,approved_by:RXB_OWNER_},key='REXCTL_APPROVAL_'+q.authorization_ref;
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{if(p.getProperty(key)!==null)rxb_fail_();var all=p.getProperties(),count=0;var expired=[];Object.keys(all).forEach(function(k){if(k.indexOf('REXCTL_APPROVAL_')===0){var prior;try{prior=JSON.parse(all[k]);}catch(ignore){rxb_fail_();}if(!rxb_obj_(prior)||!Number.isSafeInteger(prior.expires_at)||prior.expires_at<0)rxb_fail_();if(prior.expires_at<=now)expired.push(k);else count++;}});if(count>=32)rxb_fail_();expired.forEach(function(k){p.deleteProperty(k);if(p.getProperty(k)!==null)rxb_fail_();});p.setProperty(key,JSON.stringify(a));if(p.getProperty(key)!==JSON.stringify(a))rxb_fail_();}finally{lock.releaseLock();}
 // This exact command/hash is reviewable; no bot token or gateway key is exposed.
 return {ok:true,actor_id:actor,command:q,binding_hash:hash,expires_at:a.expires_at};
}
function rexctl_setEnabled(enabled,effects){
 rxb_owner_();if(typeof enabled!=='boolean'||typeof effects!=='boolean'||(!enabled&&effects))rxb_fail_();var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,false);
 if(enabled){['rex','claude'].forEach(function(a){rxb_policy_(p,c,a);});['max','telegram'].forEach(function(bot){if(c.allowed_targets[bot].length)rxb_credentials_(p,c,bot);});}
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{if(RexControl.canonical(c)!==RexControl.canonical(rxb_config_(p,false)))rxb_fail_();if(enabled){var s=rcj_open_(c.journal,lock);['max','telegram'].forEach(function(bot){c.allowed_targets[bot].forEach(function(target){rcq_read_(s,bot,target);});});}c.enabled=enabled;c.effects_enabled=effects;p.setProperty('REXCTL_CONFIG_V1',JSON.stringify(c));if(p.getProperty('REXCTL_CONFIG_V1')!==JSON.stringify(c))rxb_fail_();}finally{lock.releaseLock();}
 return {ok:true,enabled:enabled,effects_enabled:effects};
}

/* Explicit owner-only switch. Does not enable sends or change forwarding flags. */
function rexctl_setMaxGroupReadEnabled(enabled){
 rxb_owner_();if(typeof enabled!=='boolean')rxb_fail_();var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,false),snapshot=RexControl.canonical(c);
 if(enabled){rxb_maxRegistry_();rxb_credentials_(p,c,'max');}
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{if(RexControl.canonical(rxb_config_(p,false))!==snapshot)rxb_fail_();c.max_read_all_groups=enabled;p.setProperty('REXCTL_CONFIG_V1',JSON.stringify(c));if(p.getProperty('REXCTL_CONFIG_V1')!==JSON.stringify(c))rxb_fail_();}finally{lock.releaseLock();}
 return {ok:true,max_read_all_groups:enabled,outbound_targets_unchanged:true};
}


/* === RexOwnerMaxDialog.gs === */
/* Exact owner dialog provisioning. No messages, schedules, group changes or
 * existing gate resets. Route is a separate property so published webhook v10
 * keeps its existing strict REXCTL_CONFIG_V1 schema. */
var RXOM_CHAT_='678987782',RXOM_USER_='140426852',RXOM_BOT_='539375202';
var RXOM_ROUTE_='REXCTL_OWNER_MAX_DIALOG_ROUTE_V1',RXOM_STAGE_='REXCTL_OWNER_MAX_DIALOG_STAGE_V1';
function rxb_ownerMaxDialog_(p,c){
 var v=rxb_json_(p,RXOM_ROUTE_);
 if(!rxb_exact_(v,['version','chat_id','user_id','bot_id','verified_from_message_id','configured_by','configured_at'])||v.version!=='owner-max-dialog-v1'||v.chat_id!==RXOM_CHAT_||v.user_id!==RXOM_USER_||v.bot_id!==RXOM_BOT_||c.bot_ids.max!==RXOM_BOT_||c.allowed_targets.max.indexOf(RXOM_CHAT_)<0||v.configured_by!==RXB_OWNER_||!Number.isSafeInteger(v.configured_at)||!rxb_id_(v.verified_from_message_id)||p.getProperty('OWNER_UID')!==RXOM_USER_)rxb_fail_();
 return {chat_id:v.chat_id,user_id:v.user_id};
}
function rxom_evidence_(p,c){
 var r=rxb_json_(p,'REX_REPORT_COMMERCIAL_MAX_20261108');
 if(p.getProperty('OWNER_UID')!==RXOM_USER_||c.bot_ids.max!==RXOM_BOT_||r.kind!=='owner_exact_report_v1'||r.command_id!=='report-commercial-max-20261108-timur'||r.state!=='succeeded'||r.target_user_id!==RXOM_USER_||r.bot_id!==RXOM_BOT_||r.recipient_chat_id!==RXOM_CHAT_||r.recipient_user_id!==RXOM_USER_||!rxb_id_(r.platform_message_id))rxb_fail_();
 return r;
}
function rxom_gateSnapshot_(store,targets){
 var records=[];['max','telegram'].forEach(function(bot){targets[bot].forEach(function(target){records.push(rcq_read_(store,bot,target));});});return RexControl.canonical(records);
}
function rexctl_ownerMaxDialogStatus(){
 rxb_owner_();var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,true),raw=p.getProperty(RXOM_STAGE_);
 var out={state:raw===null?'not_configured':JSON.parse(raw).state,bot:'max',target_id:RXOM_CHAT_,recipient_user_id:RXOM_USER_,messages_sent:0};
 if(c.allowed_targets.max.indexOf(RXOM_CHAT_)>=0){rxb_ownerMaxDialog_(p,c);out.operator_gate=rcj_withLock_(c.journal,function(s){var g=rcq_read_(s,'max',RXOM_CHAT_);return {revision:g.revision,paused:g.paused};});out.actor_scopes={};['rex','claude'].forEach(function(actor){var v=rxb_policy_(p,c,actor);out.actor_scopes[actor]=v.scopes.filter(function(s){return s.bot==='max'&&s.target_id===RXOM_CHAT_;});});}
 console.log(JSON.stringify(out));return out;
}
function rexctl_enableOwnerMaxDialog(){
 rxb_owner_();var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,true),existing=p.getProperty(RXOM_STAGE_);
 if(existing!==null){if(JSON.parse(existing).state==='ready')return rexctl_ownerMaxDialogStatus();rxb_fail_();}
 var proof=rxom_evidence_(p,c),beforeConfig=RexControl.canonical(c),beforePolicies=p.getProperty('REXCTL_POLICIES_V1');
 if(c.effects_enabled!==true||c.allowed_targets.max.indexOf(RXOM_CHAT_)>=0||c.allowed_targets.max.length>=100||p.getProperty(RXOM_ROUTE_)!==null)rxb_fail_();
 var next=rxb_clone_(c),policies=rxb_json_(p,'REXCTL_POLICIES_V1');next.allowed_targets.max.push(RXOM_CHAT_);
 ['rex','claude'].forEach(function(actor){var policy=rxb_policy_(p,c,actor);if(policy.role!=='operator'||policy.enabled!==true||policy.revision>=Number.MAX_SAFE_INTEGER||policy.scopes.length>=100||policy.scopes.some(function(s){return s.bot==='max'&&s.target_id===RXOM_CHAT_;}))rxb_fail_();policy.revision++;policy.scopes.push({bot:'max',target_id:RXOM_CHAT_,actions:['status.read','message.send','message.reply','queue.pause','queue.resume']});policies[actor]=policy;});
 var route={version:'owner-max-dialog-v1',chat_id:RXOM_CHAT_,user_id:RXOM_USER_,bot_id:RXOM_BOT_,verified_from_message_id:proof.platform_message_id,configured_by:RXB_OWNER_,configured_at:Date.now()};
 var values={REXCTL_CONFIG_V1:JSON.stringify(next),REXCTL_POLICIES_V1:JSON.stringify(policies)};values[RXOM_ROUTE_]=JSON.stringify(route);
 var shadow={getProperty:function(k){return Object.prototype.hasOwnProperty.call(values,k)?values[k]:p.getProperty(k);}};
 var checked=rxb_config_(shadow,true);['rex','claude'].forEach(function(actor){rxb_policy_(shadow,checked,actor);});rxb_ownerMaxDialog_(shadow,checked);
 Object.keys(values).forEach(function(k){if(values[k].length>8000)rxb_fail_();});
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{
  if(p.getProperty(RXOM_STAGE_)!==null||p.getProperty(RXOM_ROUTE_)!==null||beforeConfig!==RexControl.canonical(rxb_config_(p,true))||beforePolicies!==p.getProperty('REXCTL_POLICIES_V1'))rxb_fail_();
  var store=rcj_open_(c.journal,lock);if(pfs_get_(store.pfs,rcq_key_('max',RXOM_CHAT_)))rxb_fail_();
  var oldGates=rxom_gateSnapshot_(store,c.allowed_targets),stage={state:'starting',at:Date.now(),target_id:RXOM_CHAT_,messages_sent:0};
  p.setProperty(RXOM_STAGE_,JSON.stringify(stage));if(p.getProperty(RXOM_STAGE_)!==JSON.stringify(stage))rxb_fail_();
  rcq_initExplicit_(c.journal,'max',RXOM_CHAT_,lock);
  p.setProperties(values,false);Object.keys(values).forEach(function(k){if(p.getProperty(k)!==values[k])rxb_fail_();});
  if(oldGates!==rxom_gateSnapshot_(store,c.allowed_targets))rxb_fail_();
  stage.state='configured';p.setProperty(RXOM_STAGE_,JSON.stringify(stage));if(p.getProperty(RXOM_STAGE_)!==JSON.stringify(stage))rxb_fail_();
 }finally{lock.releaseLock();}
 return rxom_resumeNewGate_();
}
function rxom_resumeNewGate_(){
 rxb_owner_();var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,true),stage=rxb_json_(p,RXOM_STAGE_);
 rxom_evidence_(p,c);rxb_ownerMaxDialog_(p,c);
 if(stage.state!=='configured'||c.effects_enabled!==true)rxb_fail_();
 var lock=LockService.getScriptLock();if(!lock.tryLock(2000))rxb_fail_();
 try{if(RexControl.canonical(rxb_json_(p,RXOM_STAGE_))!==RexControl.canonical(stage))rxb_fail_();var s=rcj_open_(c.journal,lock),g=rcq_read_(s,'max',RXOM_CHAT_);if(g.revision!==0||g.paused!==true)rxb_fail_();stage.state='resuming';p.setProperty(RXOM_STAGE_,JSON.stringify(stage));if(p.getProperty(RXOM_STAGE_)!==JSON.stringify(stage))rxb_fail_();}finally{lock.releaseLock();}
 var now=Date.now(),unique=Utilities.getUuid();
 var q={version:'rexctl-v1',command_id:'owner-dialog-resume-'+unique,action:'queue.resume',bot:'max',target_id:RXOM_CHAT_,payload:{},issued_at:now,expires_at:now+120000,authorization_ref:'owner-dialog-approval-'+unique,expected_revision:0};
 rexctl_approveExactCommand('rex',q);
 var envelope={op:'rexctl',version:'rex-gateway-v1',actor_id:'rex',issuer_id:'fabrika-mcp-gateway-v1',issued_at:now,expires_at:now+60000,nonce:'owner-dialog-nonce-'+unique,request:q};
 envelope.signature=rxb_hmac_(envelope,rxb_json_(p,'REXCTL_GATEWAY_KEYS_V1').rex.secret_hex);
 var result=rexctl_handleEnvelope_(envelope);
 if(!result||result.ok!==true||result.state!=='succeeded'||result.revision!==1||result.duplicate!==false)rxb_fail_();
 stage.state='ready';stage.at=Date.now();p.setProperty(RXOM_STAGE_,JSON.stringify(stage));if(p.getProperty(RXOM_STAGE_)!==JSON.stringify(stage))rxb_fail_();
 return rexctl_ownerMaxDialogStatus();
}


/* Manual editor helpers. The underlying operation verifies the real owner.
 * No group forwarding/autonomy, outbound target, token or trigger is changed.
 */
function rexctl_enableAllMaxGroupReads(){
 var result=rexctl_setMaxGroupReadEnabled(true);console.log(JSON.stringify(result));return result;
}
function rexctl_disableAllMaxGroupReads(){
 var result=rexctl_setMaxGroupReadEnabled(false);console.log(JSON.stringify(result));return result;
}
