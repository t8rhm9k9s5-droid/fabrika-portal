/* Owner-only one-off pinning. No triggers/subscriptions. Run the shape probe first.
 * Exact {} or {message:null} is empty; other unknown shapes remain blocked.
 * A durable reservation is verified before one PUT. Existing reservations never retry.
 * MAX documents no compare-and-swap: an external administrator can race GET/PUT.
 */
var RPFIN_BOT_='539375202',RPFIN_PREFIX_='REX_PIN_ONCE_20261108_';
var RPFIN_TARGETS_=[
  ['-100000000004','mid.ffffbe7b4ab8222b01a1afc366235dc9'],
  ['-100000000005','mid.ffffbe7b3f3c222b01a1afc395485dc9'],
  ['-100000000003','mid.ffffbe751df8222b01a1b043cd895dc9'],
  ['-100000000001','mid.ffffbe7462e4222b01a1afc3acac5dc9'],
  ['-100000000007','mid.ffffbe68c7a6222b01a1afc3cad85dc9'],
  ['-100000000006','mid.ffffbe686738222b01a1afc37d5c5dc9'],
  ['-100000000008','mid.ffffb7f0c9ae222b01a1afc3eb735dc9']
];
function rpfin_context_(effects){
  var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,effects===true);
  if(c.bot_ids.max!==RPFIN_BOT_||['https://platform-api.max.ru','https://platform-api2.max.ru'].indexOf(c.max_origin)<0||(effects&&c.effects_enabled!==true))throw Error('Pin configuration unavailable');
  return {props:p,origin:c.max_origin,token:tok_()};
}
function rpfin_http_(ctx,method,path,body){
  var allowedGet=method==='get'&&(/^\/(?:me|messages\/mid\.[A-Za-z0-9_.:%-]+|chats\/-\d+\/pin)$/.test(path));
  var target=RPFIN_TARGETS_.filter(function(t){return path==='/chats/'+t[0]+'/pin';});
  var allowedPut=method==='put'&&target.length===1&&body&&Object.keys(body).sort().join(',')==='message_id,notify'&&body.message_id===target[0][1]&&body.notify===false;
  if(!allowedGet&&!allowedPut)throw Error('Pin route rejected');
  var options={method:method,headers:{Authorization:ctx.token,Accept:'application/json'},muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true};
  if(allowedPut){options.contentType='application/json';options.payload=JSON.stringify(body);}
  try{
    var r=UrlFetchApp.fetch(ctx.origin+path,options),raw=r.getContentText(),value=null,parsed=false;
    try{value=JSON.parse(raw);parsed=true;}catch(ignore){}
    return {http:r.getResponseCode(),value:value,parsed:parsed,chars:raw.length};
  }catch(ignore){return {http:0,value:null,parsed:false,chars:0};}
}
function rpfin_identity_(ctx){
  var r=rpfin_http_(ctx,'get','/me');
  if(r.http!==200||!r.value||r.value.is_bot!==true||String(r.value.user_id)!==RPFIN_BOT_)throw Error('Pin bot identity unverified');
}
function rpfin_pinState_(r){
  var d=r.value;
  if(r.http!==200||!r.parsed||d===null||typeof d!=='object'||Array.isArray(d))return {state:'unknown',mid:null};
  // MAX live GET returned exact {}. Its optional nullable message field permits this empty result.
  // This normalization never treats an arbitrary success/error object as absence.
  if(Object.keys(d).length===0)return {state:'empty',mid:null};
  if(Object.keys(d).length!==1||!Object.prototype.hasOwnProperty.call(d,'message'))return {state:'unknown',mid:null};
  if(d.message===null)return {state:'empty',mid:null};
  var m=d.message,mid=m&&m.body&&m.body.mid;
  if(typeof mid==='string'&&/^mid\.[A-Za-z0-9_.:-]{1,195}$/.test(mid))return {state:'present',mid:mid};
  return {state:'unknown',mid:null};
}
function rpfin_candidate_(r,cid,mid){
  var m=r.value,b=m&&m.body,s=m&&m.sender,to=m&&m.recipient;
  return !!(r.http===200&&r.parsed&&b&&b.mid===mid&&s&&s.is_bot===true&&String(s.user_id)===RPFIN_BOT_&&to&&String(to.chat_id)===cid&&typeof b.text==='string'&&b.text.replace(/\s+/g,' ').trim().indexOf('Коллеги, добрый день! Чтобы не засорять корпоративную электронную почту')===0&&Number.isSafeInteger(m.timestamp)&&m.timestamp>0&&Utilities.formatDate(new Date(m.timestamp),'Europe/Moscow','yyyy-MM-dd')==='2026-11-06');
}
function rpfin_journal_(ctx,key,cid,mid){
  var raw=ctx.props.getProperty(key);if(raw===null)return null;
  var v;try{v=JSON.parse(raw);}catch(ignore){return {state:'journal_invalid'};}
  if(!v||v.v!==1||v.cid!==cid||v.mid!==mid||typeof v.state!=='string')return {state:'journal_conflict'};
  return v;
}
function rpfin_one_(ctx,target){
  var cid=target[0],mid=target[1],key=RPFIN_PREFIX_+cid.slice(-5),lock=LockService.getScriptLock(),out={cid:cid,mid:mid};
  if(!lock.tryLock(5000)){out.state='busy_no_write';return out;}
  try{
    var previous=rpfin_journal_(ctx,key,cid,mid);
    if(previous){out.state='reserved_no_retry';out.previous=previous.state;return out;}
    var candidate=rpfin_http_(ctx,'get','/messages/'+encodeURIComponent(mid));
    if(!rpfin_candidate_(candidate,cid,mid)){out.state='candidate_unverified';out.message_http=candidate.http;return out;}
    var beforeReply=rpfin_http_(ctx,'get','/chats/'+cid+'/pin'),before=rpfin_pinState_(beforeReply);
    out.before=before.state;out.before_http=beforeReply.http;
    if(before.state==='unknown'){out.state='unknown_pin_no_write';return out;}
    if(before.state==='present'){out.state=before.mid===mid?'already_done':'existing_pin_skipped';out.current_mid=before.mid;return out;}
    var claim={v:1,cid:cid,mid:mid,state:'executing',claimed_at:new Date().toISOString()};
    var raw=JSON.stringify(claim);
    // A failed or ambiguous property write blocks the network call.
    try{ctx.props.setProperty(key,raw);if(ctx.props.getProperty(key)!==raw){out.state='claim_unverified_no_write';return out;}}
    catch(ignore){out.state='claim_failed_no_write';return out;}
    var reply=rpfin_http_(ctx,'put','/chats/'+cid+'/pin',{message_id:mid,notify:false});
    var ack=reply.http===200&&reply.parsed&&reply.value&&reply.value.success===true;
    var afterReply=rpfin_http_(ctx,'get','/chats/'+cid+'/pin'),after=rpfin_pinState_(afterReply),same=after.state==='present'&&after.mid===mid;
    var state=ack&&same?'succeeded':same?'observed_pinned_unconfirmed_ack':'uncertain';
    if(!ack&&!same&&after.state==='empty'&&((reply.http===200&&reply.parsed&&reply.value&&reply.value.success===false)||(reply.http>=400&&reply.http<500&&reply.http!==408&&reply.http!==429)))state='failed_certain';
    var receipt={v:1,cid:cid,mid:mid,state:state,claimed_at:claim.claimed_at,finished_at:new Date().toISOString(),put_http:reply.http,ack:!!ack,after_http:afterReply.http,after_state:after.state,after_mid:after.mid};
    var saved=false;
    try{var finalRaw=JSON.stringify(receipt);ctx.props.setProperty(key,finalRaw);saved=ctx.props.getProperty(key)===finalRaw;}catch(ignore){}
    out.state=state;out.put_http=reply.http;out.ack=!!ack;out.after=after.state;out.after_http=afterReply.http;out.same=same;out.receipt_saved=saved;out.no_retry=true;
    return out;
  }finally{lock.releaseLock();}
}
function rexPinAnnouncementsOnce20261108(){
  rxb_owner_();var ctx=rpfin_context_(true);rpfin_identity_(ctx);var results=[];
  RPFIN_TARGETS_.forEach(function(target){
    var out;
    try{out=rpfin_one_(ctx,target);}catch(ignore){out={cid:target[0],mid:target[1],state:'blocked_exception_no_retry'};}
    results.push(out);
    console.log(JSON.stringify({pin_once:out.cid,state:out.state,previous:out.previous||null,http:out.put_http||null,ack:out.ack===true,same:out.same===true,saved:out.receipt_saved===true}));
  });
  var counts={};results.forEach(function(r){counts[r.state]=(counts[r.state]||0)+1;});
  console.log(JSON.stringify({pin_once_summary:true,groups:results.length,states:counts,no_auto_retry:true}));
  return {results:results,counts:counts,no_auto_retry:true};
}
function rexPinFinalShape20261108(){
  rxb_owner_();var ctx=rpfin_context_(false);rpfin_identity_(ctx);
  var cid=RPFIN_TARGETS_[0][0],pin=rpfin_http_(ctx,'get','/chats/'+cid+'/pin'),count=0,types=[];
  console.log(JSON.stringify({pin_shape:cid,http:pin.http,json:pin.parsed,response_chars:pin.chars,read_only:true}));
  function inspect(v,path,depth){
    if(count>=40)return;count++;
    var kind=v===null?'null':Array.isArray(v)?'array':typeof v,row={path:path,type:kind};
    if(kind==='array')row.length=v.length;if(kind==='object')row.keys=Object.keys(v).length;
    types.push(row);console.log(JSON.stringify(row));
    if(kind==='object'&&depth<3)Object.keys(v).slice(0,16).forEach(function(k){inspect(v[k],path+'.'+k.slice(0,60),depth+1);});
  }
  if(pin.parsed)inspect(pin.value,'$',0);
  var state=rpfin_pinState_(pin).state;
  console.log(JSON.stringify({pin_shape_done:cid,state:state,nodes:count,values_printed:false}));
  return {chat_id:cid,http:pin.http,json:pin.parsed,state:state,structure:types};
}


/* Owner-only observation. No network, setters, sheet creation, polling or queue drains. */
function rex_healthProbe20261108() {
  if (Session.getActiveUser().getEmail() !== 'user1@example.org' || Session.getEffectiveUser().getEmail() !== 'user1@example.org') throw Error('owner only');
  var p = PropertiesService.getScriptProperties(), now = Date.now();
  var out = { observed_at: new Date(now).toISOString(), read_only: true, snapshot_atomic: false, mode_google: p.getProperty('MODE') === 'google', triggers: [], queues: {} };
  try { out.triggers = ScriptApp.getProjectTriggers().map(function (t) { var n = String(t.getHandlerFunction()); return /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(n) ? n : '[invalid_handler]'; }).sort(); } catch (e) { out.triggers_unavailable = true; }
  var config = rhp_json_(p.getProperty('MAX_HTTP_LEGACY_INGRESS_V1')), monitorConfig = rhp_json_(p.getProperty('MAX_HTTP_MONITOR_V1'));
  var fence = rhp_json_(p.getProperty('MAX_HTTP_LEGACY_LAST_POLL_V1')), cursor = rhp_json_(p.getProperty('MAX_HTTP_LEGACY_INGRESS_CURSOR_V1'));
  out.ingress = { auto_enabled: p.getProperty('MAX_HTTP_LEGACY_AUTO_ENABLED') === '1', config_enabled: config.enabled === true,
    monitor_enabled: monitorConfig.enabled === true, last_poll_reservation_at: rhp_iso_(rhp_int_(fence.minute) === null ? null : fence.minute * 60000),
    last_cursor_source_received_at: rhp_iso_(cursor.after && rhp_int_(cursor.after.received_at) !== null ? cursor.after.received_at * 1000 : null),
    consumer_completion_receipt: 'not_persisted_by_current_consumer_code', reservation_and_cursor_are_not_completion: true };
  var sample;
  try { sample = typeof lmhm_readSample === 'function' ? lmhm_readSample() : null; } catch (e1) { sample = null; }
  out.monitor_sample = { state: 'sample_unavailable' };
  if (sample && sample.state === 'sample_present' && rhp_int_(sample.at_seconds) !== null) {
    out.monitor_sample = { state: 'sample_present', at: rhp_iso_(sample.at_seconds * 1000), age_seconds: Math.max(0, Math.floor(now / 1000) - sample.at_seconds), rows: rhp_int_(sample.rows), bytes: rhp_int_(sample.bytes), warning: ['capacity_urgent', 'integrity_review', 'backlog', 'capacity_warning'].indexOf(sample.warning) >= 0 ? sample.warning : null };
  }
  out.claude = { fire_url_present: !!p.getProperty('CLAUDE_FIRE_URL'), fire_token_present: !!p.getProperty('CLAUDE_FIRE_TOKEN'), actor_completion_ack_verified_by_probe: false };
  var id = String(p.getProperty('SVC_SHEET_ID') || (typeof SS_ID === 'string' ? SS_ID : ''));
  var ss;
  try { if (!/^[A-Za-z0-9_-]{20,120}$/.test(id)) throw Error('storage'); ss = SpreadsheetApp.openById(id); }
  catch (e2) { out.storage_unavailable = true; }
  if (ss) {
    var specs = [
      ['max_in', 'status', 't', 'done_t', '', ['new','work','fail','dead','done'], ['new','work','fail']],
      ['ob_out', 'status', 'created', 'updated', 'next_at', ['pending','sent','failed','dead','uncertain'], ['pending','failed']],
      ['cp_buf', '', 't', '', 'not_before', [], []],
      ['cp_dead', '', 't', '', '', [], []],
      ['mx_defer', '', 'ts', '', '', [], []],
      ['mx_questions', 'status', 'ts', 't', '', ['open','open1','answered','pushed','expired'], ['open','open1']]
    ];
    specs.forEach(function (s) { try { out.queues[s[0]] = rhp_queue_(ss, s, now); } catch (e3) { out.queues[s[0]] = { state: 'read_unavailable' }; } });
    try { out.claude.recent_launches = rhp_history_(ss, 'cp_runs', ['t','events','http','ms'], 8, function (v) { return { at: rhp_iso_(v.t), events: rhp_int_(v.events), http: rhp_int_(v.http), duration_ms: rhp_int_(v.ms) }; }); } catch (e4) { out.claude.recent_launches = { state: 'read_unavailable' }; }
    try { out.claude.recent_event_statuses = rhp_history_(ss, 'cp_log', ['t','status'], 8, function (v) { return { at: rhp_iso_(v.t), state: ['buf','buf-off','sent','dispatched','uncertain','fail','dead','err','dup','bad'].indexOf(String(v.status)) >= 0 ? String(v.status) : 'other' }; }); } catch (e5) { out.claude.recent_event_statuses = { state: 'read_unavailable' }; }
    try { out.timer_receipts = rhp_history_(ss, 'tm_runs', ['job','t','res'], 30, function (v) {
      var name = String(v.job), known = ['quota','unans','sales','survey','recl','nightly','poll_send','mail_cmd','queue','push','outbox','http_ingress','ingest','poll','ctl','remind','staff','export'].indexOf(name) >= 0;
      if (!known) return null;
      var r = rhp_json_(String(v.res)), item = { job: name, at: rhp_iso_(v.t), result_present: v.res !== '' && v.res != null };
      if (name === 'quota') item.quota = { minute_ms: rhp_int_(r.minute), five_ms: rhp_int_(r.five), minute_ticks: rhp_int_(r.n_minute), five_ticks: rhp_int_(r.n_five) };
      else { if (typeof r.ok === 'boolean') item.ok = r.ok; if (['ok','empty','imported','held','disabled','unavailable','failed','succeeded'].indexOf(r.state) >= 0) item.state = r.state; }
      return item;
    }); } catch (e6) { out.timer_receipts = { state: 'read_unavailable' }; }
  }
  try {
    var ca = CacheService.getScriptCache(), day = Utilities.formatDate(new Date(now), 'Europe/Moscow', 'yyyy-MM-dd');
    var q = rhp_json_(ca.get('tm_q_' + day));
    out.timer_cache = { day_msk: day, minute_ms: rhp_int_(q.minute), five_ms: rhp_int_(q.five), minute_ticks: rhp_int_(q.n_minute), five_ticks: rhp_int_(q.n_five), error_streaks: {} };
    ['http_ingress','queue','push','outbox','poll_send','mail_cmd'].forEach(function (k) { var raw = ca.get('tm_err_' + k); out.timer_cache.error_streaks[k] = raw === null ? null : rhp_int_(Number(raw)); });
    out.timer_cache.minute_lease_started_at = rhp_iso_(Number(ca.get('tm_run_minute')) || null);
    out.timer_cache.five_lease_started_at = rhp_iso_(Number(ca.get('tm_run_five')) || null);
  } catch (e7) { out.timer_cache = { state: 'unavailable' }; }
  Object.keys(out).forEach(function (k) { rhp_logPiece_(k, out[k]); }); return out;
}
function rhp_json_(raw) { try { var x = JSON.parse(raw || 'null'); return x && typeof x === 'object' && !Array.isArray(x) ? x : {}; } catch (e) { return {}; } }
function rhp_int_(n) { return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 ? n : null; }
function rhp_ms_(v) { if (v === null || v === undefined || v === '') return null; var n = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(String(v)); return Number.isFinite(n) && n > 0 && n <= 8640000000000000 ? n : null; }
function rhp_iso_(v) { var n = rhp_ms_(v); return n === null ? null : new Date(n).toISOString(); }
function rhp_cols_(sh, fields, start, count) {
  var n = sh.getLastColumn(); if (n > 40) throw Error('schema');
  var h = sh.getRange(1, 1, 1, n).getValues()[0], out = {};
  fields.filter(function (f, i, a) { return f && a.indexOf(f) === i; }).forEach(function (f) {
    var i = h.indexOf(f); if (i < 0 || h.lastIndexOf(f) !== i) throw Error('schema');
    out[f] = count ? sh.getRange(start, i + 1, count, 1).getValues().map(function (r) { return r[0]; }) : [];
  }); return out;
}
function rhp_queue_(ss, s, now) {
  var sh = ss.getSheetByName(s[0]); if (!sh) return { state: 'missing' };
  var n = Math.max(0, sh.getLastRow() - 1), count = Math.min(n, 10000), start = n - count + 2;
  if (!n) return { state: 'observed', total_rows: 0, scanned_rows: 0, complete: true, counts: {} };
  var v = rhp_cols_(sh, [s[1],s[2],s[3],s[4]], start, count), out = { state: 'observed', total_rows: n, scanned_rows: count, complete: count === n, counts: {}, due_in_scanned_rows: 0, oldest_pending_age_seconds_in_scanned_rows: null, latest_completed_at_in_scanned_rows: null };
  var oldest = null, latest = null;
  for (var i = 0; i < count; i++) {
    var st = s[1] ? String(v[s[1]][i]) : 'buffered'; if (s[1] && s[5].indexOf(st) < 0) st = 'other';
    out.counts[st] = (out.counts[st] || 0) + 1;
    var pending = !s[1] || s[6].indexOf(st) >= 0, t = rhp_ms_(v[s[2]][i]);
    if (pending && t !== null && t <= now && (oldest === null || t < oldest)) oldest = t;
    if (pending && s[4] && rhp_int_(v[s[4]][i]) !== null && v[s[4]][i] <= now) out.due_in_scanned_rows++;
    if (s[3] && ['done','sent','answered'].indexOf(st) >= 0) { var done = rhp_ms_(v[s[3]][i]); if (done !== null && (latest === null || done > latest)) latest = done; }
  }
  out.oldest_pending_age_seconds_in_scanned_rows = oldest === null ? null : Math.floor((now - oldest) / 1000);
  out.latest_completed_at_in_scanned_rows = rhp_iso_(latest); return out;
}
function rhp_history_(ss, name, fields, limit, project) {
  var sh = ss.getSheetByName(name); if (!sh) return { state: 'missing' };
  var n = Math.max(0, sh.getLastRow() - 1), count = Math.min(n, limit);
  if (!count) return { state: 'observed', total_rows: n, rows: [] };
  var cols = rhp_cols_(sh, fields, n - count + 2, count), rows = [];
  for (var i = 0; i < count; i++) { var v = {}; fields.forEach(function (f) { v[f] = cols[f][i]; }); var r = project(v); if (r !== null) rows.push(r); }
  return { state: 'observed', total_rows: n, inspected_last_rows: count, rows: rows };
}

/* AX readers truncate long log lines; keep each record <=380 characters. */
function rhp_logPiece_(path, value) {
  var raw = JSON.stringify({ health: path, value: value });
  if (raw.length <= 380) { console.log(raw); return; }
  if (value && typeof value === 'object') {
    Object.keys(value).forEach(function (k) { rhp_logPiece_(path + '.' + k, value[k]); }); return;
  }
  var text = String(value), n = Math.ceil(text.length / 40);
  for (var i = 0; i < n; i++) console.log(JSON.stringify({ health: path.slice(0, 80), part: i + 1, of: n, value: text.slice(i * 40, (i + 1) * 40) }));
}
