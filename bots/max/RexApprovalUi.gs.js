/* Owner-only approval of an already prepared command. This page never sends. */
function rxap_validate_(actor,text){
 rxb_owner_();
 if(['rex','claude'].indexOf(actor)<0||typeof text!=='string'||!text||text.length>30000)rxb_fail_();
 var q;try{q=JSON.parse(text);}catch(ignore){rxb_fail_();}
 var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,true),policy=rxb_policy_(p,c,actor),now=Date.now();
 if(c.effects_enabled!==true||policy.role!=='operator'||!rxb_exact_(q,['version','command_id','action','bot','target_id','payload','issued_at','expires_at','authorization_ref','expected_revision'])||q.version!=='rexctl-v1'||!rxb_id_(q.command_id)||['message.send','message.reply'].indexOf(q.action)<0||['max','telegram'].indexOf(q.bot)<0||!rxb_target_(q.target_id)||c.allowed_targets[q.bot].indexOf(q.target_id)<0||!rxb_scope_(policy,q)||!rxb_id_(q.authorization_ref)||q.authorization_ref.indexOf('read:')===0||!Number.isSafeInteger(q.expected_revision)||q.expected_revision<0||!Number.isSafeInteger(q.issued_at)||!Number.isSafeInteger(q.expires_at)||q.issued_at<0||q.issued_at>now||q.expires_at<=now||q.expires_at<=q.issued_at||q.expires_at-q.issued_at>300000)rxb_fail_();
 if(!rxb_exact_(q.payload,q.action==='message.reply'?['text','reply_to_id']:['text'])||typeof q.payload.text!=='string'||!q.payload.text.trim()||q.payload.text.length>4000)rxb_fail_();
 if(q.action==='message.reply'&&(!rxb_id_(q.payload.reply_to_id)||(q.bot==='telegram'&&!/^[1-9][0-9]{0,19}$/.test(q.payload.reply_to_id))))rxb_fail_();
 if(q.bot==='telegram'&&c.telegram_mode!=='direct')rxb_fail_();
 if(p.getProperty('REXCTL_APPROVAL_'+q.authorization_ref)!==null)rxb_fail_();
 var gate=rcj_withLock_(c.journal,function(s){return rcq_read_(s,q.bot,q.target_id);});
 if(gate.paused!==false||gate.revision!==q.expected_revision||q.expires_at<=Date.now())rxb_fail_();
 return {command:q,binding_hash:RexControl.binding(q,actor,{sha256:rcj_hash_})};
}

function rxap_previewCommand(actor,text){
 var v=rxap_validate_(actor,text),q=v.command;
 return {ok:true,actor_id:actor,action:q.action,bot:q.bot,target_id:q.target_id,text:q.payload.text,reply_to_id:q.action==='message.reply'?q.payload.reply_to_id:null,issued_at:q.issued_at,expires_at:q.expires_at,expected_revision:q.expected_revision,command_id:q.command_id,authorization_ref:q.authorization_ref,binding_hash:v.binding_hash,sent:false};
}

function rxap_approveExactCommand(actor,text,previewBinding){
 rxb_owner_();
 if(typeof previewBinding!=='string'||!/^[a-f0-9]{64}$/.test(previewBinding))rxb_fail_();
 var v=rxap_validate_(actor,text);
 if(!rxb_equal_(v.binding_hash,previewBinding))rxb_fail_();
 var r=rexctl_approveExactCommand(actor,v.command);
 if(!r||r.ok!==true||r.binding_hash!==previewBinding)rxb_fail_();
 return {ok:true,approved:true,actor_id:actor,command_id:v.command.command_id,authorization_ref:v.command.authorization_ref,binding_hash:r.binding_hash,expires_at:r.expires_at,sent:false};
}

function rxap_renderApproval_(){
 rxb_owner_();
 return HtmlService.createHtmlOutput(`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Точное одобрение команды</title>
<style>body{font:16px system-ui,sans-serif;max-width:820px;margin:32px auto;padding:0 18px;color:#17212b}label{display:block;margin:16px 0 6px}select,textarea,button{font:inherit}textarea{box-sizing:border-box;width:100%;min-height:220px}button{padding:10px 16px;margin:14px 8px 8px 0}dt{font-weight:600;margin-top:12px}dd{margin:3px 0;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #bbb;padding:14px;font:inherit}#status{white-space:pre-wrap}small{display:block;color:#444}</style></head>
<body><h1>Одобрение одной команды</h1><p>Вставьте уже подготовленный JSON rexctl-v1. Сверьте получателя и полный текст, затем одобрите. Эта страница сохраняет разрешение и не отправляет сообщение.</p>
<label for="actor">Исполнитель</label><select id="actor"><option value="rex">Rex</option><option value="claude">Claude</option></select>
<label for="command">Точный JSON команды</label><textarea id="command" autocomplete="off" spellcheck="false"></textarea>
<small>Срок и поля команды не изменяются. Если срок истёк, исполнитель должен подготовить новую команду.</small>
<button id="preview" type="button">1. Проверить команду</button><button id="approve" type="button" disabled>2. Одобрить именно эту команду</button>
<p id="status" role="status" aria-live="polite"></p><section id="review" hidden><h2>Проверьте перед одобрением</h2><dl>
<dt>Исполнитель</dt><dd id="v-actor"></dd><dt>Действие</dt><dd id="v-action"></dd><dt>Бот</dt><dd id="v-bot"></dd><dt>Получатель — точный ID</dt><dd id="v-target"></dd>
<dt>Точный текст</dt><dd><pre id="v-text"></pre></dd><dt>ID сообщения для ответа</dt><dd id="v-reply"></dd><dt>Действует до</dt><dd id="v-expiry"></dd><dt>Ревизия очереди</dt><dd id="v-revision"></dd><dt>ID команды</dt><dd id="v-command"></dd><dt>Ссылка одобрения</dt><dd id="v-reference"></dd><dt>Контрольная сумма команды</dt><dd id="v-hash"></dd></dl></section>
<script>
(function(){
 'use strict';
 var byId=function(id){return document.getElementById(id);},actor=byId('actor'),command=byId('command'),preview=byId('preview'),approve=byId('approve'),status=byId('status'),review=byId('review'),candidate=null,stopped=false;
 function put(id,value){byId(id).textContent=String(value);}
 function invalidate(){candidate=null;approve.disabled=true;review.hidden=true;status.textContent='';}
 function busy(value){actor.disabled=value;command.disabled=value;preview.disabled=value;approve.disabled=true;}
 actor.addEventListener('change',invalidate);command.addEventListener('input',invalidate);
 preview.addEventListener('click',function(){
  if(stopped)return;invalidate();var a=actor.value,t=command.value;busy(true);status.textContent='Проверяется команда и текущая очередь…';
  google.script.run.withSuccessHandler(function(r){
   busy(false);if(!r||r.ok!==true||actor.value!==a||command.value!==t){invalidate();return;}
   candidate={actor:a,text:t,hash:r.binding_hash,expiry:r.expires_at};
   put('v-actor',r.actor_id);put('v-action',r.action);put('v-bot',r.bot);put('v-target',r.target_id);put('v-text',r.text);put('v-reply',r.reply_to_id===null?'—':r.reply_to_id);
   put('v-expiry',new Date(r.expires_at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК ('+r.expires_at+')');put('v-revision',r.expected_revision);put('v-command',r.command_id);put('v-reference',r.authorization_ref);put('v-hash',r.binding_hash);
   review.hidden=false;approve.disabled=false;status.textContent='Проверьте все поля. Нажатие второй кнопки разрешит только эту команду до указанного срока.';
  }).withFailureHandler(function(){busy(false);invalidate();status.textContent='Команда не прошла проверку. Проверьте JSON, исполнителя, срок и текущую ревизию очереди.';}).rxap_previewCommand(a,t);
 });
 approve.addEventListener('click',function(){
  if(stopped||!candidate)return;
  if(candidate.actor!==actor.value||candidate.text!==command.value||Date.now()>=candidate.expiry){invalidate();status.textContent='Команда изменилась или срок истёк. Нужна новая проверка.';return;}
  var c=candidate;candidate=null;stopped=true;busy(true);status.textContent='Сохраняется точное одобрение…';
  google.script.run.withSuccessHandler(function(r){
   if(!r||r.ok!==true||r.approved!==true||r.sent!==false){status.textContent='Одобрение не подтверждено. Повтор не выполнен; проверьте состояние команды.';return;}
   status.textContent='Одобрение сохранено. Сообщение не отправлено. Исполнитель может выполнить этот неизменённый JSON до указанного срока. Для следующей команды откройте страницу заново.';
  }).withFailureHandler(function(){status.textContent='Одобрение не подтверждено. Повтор не выполнен; проверьте состояние команды.';}).rxap_approveExactCommand(c.actor,c.text,c.hash);
 });
})();
</script></body></html>`).setTitle('Точное одобрение команды');
}
