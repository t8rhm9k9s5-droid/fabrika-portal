/* Existing webhook only. Owner action-time approval obtained for six event types. */
function rexgi_enableGroupUpdates() {
  if (Session.getActiveUser().getEmail() !== 'user@example.org' ||
      Session.getEffectiveUser().getEmail() !== 'user@example.org') throw Error('Owner required');
  var p = PropertiesService.getScriptProperties(), token = p.getProperty('TG_TOKEN'), sec = p.getProperty('tg_hook');
  var allowed = ['message','callback_query','edited_message','my_chat_member'];
  if (typeof token !== 'string' || !/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token) ||
      typeof sec !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(sec) ||
      typeof SELF_URL !== 'string' || !/^https:\/\/script\.google\.com\/macros\/s\/[^/?#]+\/exec$/.test(SELF_URL))
    throw Error('Existing webhook configuration unavailable');
  function call(method, data) {
    var response;
    try { response = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method:data ? 'post':'get', contentType:'application/json',
      payload:data ? JSON.stringify(data):undefined, muteHttpExceptions:true,
      followRedirects:false, validateHttpsCertificates:true
    }); } catch (ignored) { throw Error('Telegram outcome uncertain; inspect before retry'); }
    var raw = response.getContentText();
    if (response.getResponseCode() !== 200 || raw.length > 32768) throw Error('Telegram response unavailable; inspect before retry');
    var result; try { result = JSON.parse(raw); } catch (ignored) { throw Error('Telegram response invalid; inspect before retry'); }
    if (!result || result.ok !== true) throw Error('Telegram rejected operation');
    return result.result;
  }
  var me = call('getMe');
  if (!me || me.is_bot !== true || me.username !== 'fabrika_t14_bot') throw Error('Bot identity mismatch');
  var before = call('getWebhookInfo'), expected = SELF_URL + '?tg=' + sec;
  if (!before || before.url !== expected || before.has_custom_certificate === true ||
      !Number.isSafeInteger(before.max_connections) || before.max_connections < 1 || before.max_connections > 100 ||
      !Array.isArray(before.allowed_updates) || before.allowed_updates.some(function(v){return allowed.indexOf(v)<0;}))
    throw Error('Webhook settings require review');
  var same = allowed.length === before.allowed_updates.length && allowed.every(function(v){return before.allowed_updates.indexOf(v)>=0;});
  if (!same) call('setWebhook', {url:expected, allowed_updates:allowed, drop_pending_updates:false, max_connections:before.max_connections});
  var after = call('getWebhookInfo');
  var ok = after.url === expected && Array.isArray(after.allowed_updates) && after.allowed_updates.length === allowed.length &&
    allowed.every(function(v){return after.allowed_updates.indexOf(v)>=0;}) && after.max_connections === before.max_connections;
  var receipt = {ok:ok, changed:!same, expected_bot:true, webhook_unchanged:after.url===expected,
    allowed_updates:ok ? allowed : [], pending_updates:Number.isSafeInteger(after.pending_update_count)?after.pending_update_count:null,
    messages_sent:0, credentials_changed:false, automatic_retry:false};
  console.log(JSON.stringify(receipt)); return receipt;
}

function rexgi_readCoverageStatus() {
  if (Session.getActiveUser().getEmail() !== 'user@example.org' ||
      Session.getEffectiveUser().getEmail() !== 'user@example.org') throw Error('Owner required');
  var p=PropertiesService.getScriptProperties(),token=p.getProperty('TG_TOKEN');
  if(typeof token!=='string'||!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token)) throw Error('Existing token unavailable');
  function read(method) {
    try {
      var r=UrlFetchApp.fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'get',
        followRedirects:false,validateHttpsCertificates:true,muteHttpExceptions:true});
      var raw=r.getContentText();if(r.getResponseCode()!==200||raw.length>32768)return null;
      var j=JSON.parse(raw);return j&&j.ok===true?j.result:null;
    } catch(ignored){return null;}
  }
  var me=read('getMe'),hook=me&&me.is_bot===true&&me.username==='fabrika_t14_bot'?read('getWebhookInfo'):null;
  var known=['message','callback_query','edited_message','my_chat_member','channel_post','edited_channel_post'];
  var result={ok:!!hook,expected_bot:!!(me&&me.is_bot===true&&me.username==='fabrika_t14_bot'),
    can_join_groups:me&&typeof me.can_join_groups==='boolean'?me.can_join_groups:null,
    privacy_disabled:me&&typeof me.can_read_all_group_messages==='boolean'?me.can_read_all_group_messages:null,
    allowed_updates:hook&&Array.isArray(hook.allowed_updates)?hook.allowed_updates.filter(function(v){return known.indexOf(v)>=0;}):null,
    unrecognized_update_types:hook&&Array.isArray(hook.allowed_updates)?hook.allowed_updates.filter(function(v){return known.indexOf(v)<0;}).length:null,
    pending_updates:hook&&Number.isSafeInteger(hook.pending_update_count)?hook.pending_update_count:null,
    webhook_present:!!(hook&&hook.url),messages_sent:0};
  console.log(JSON.stringify(result));return result;
}
