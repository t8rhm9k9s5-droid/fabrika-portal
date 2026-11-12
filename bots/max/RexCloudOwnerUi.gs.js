/* OFFLINE CANDIDATE. Owner Google session only. No new keys, scopes or schedulers.
 * This page controls only the Rex/Claude operator gate, not business automation.
 * Add one doGet branch on a NEW owner-only deployment of this same GAS project.
 */
function rcow_gate_(c, bot, target) {
  return rcj_withLock_(c.journal, function(s) { return rcq_read_(s, bot, target); });
}
function rcow_validate_(actor, text, existingApproval) {
  rxb_owner_();
  if (['rex','claude'].indexOf(actor)<0 || typeof text!=='string' || !text || text.length>30000) rxb_fail_();
  var q; try { q=JSON.parse(text); } catch(ignore) { rxb_fail_(); }
  var p=PropertiesService.getScriptProperties(), c=rxb_config_(p,true), policy=rxb_policy_(p,c,actor), now=Date.now();
  var actions=['queue.pause','queue.resume'];
  if (c.effects_enabled!==true || policy.role!=='operator' ||
      !rxb_exact_(q,['version','command_id','action','bot','target_id','payload','issued_at','expires_at','authorization_ref','expected_revision']) ||
      q.version!=='rexctl-v1' || !rxb_id_(q.command_id) || actions.indexOf(q.action)<0 ||
      ['max','telegram'].indexOf(q.bot)<0 || !rxb_target_(q.target_id) || c.allowed_targets[q.bot].indexOf(q.target_id)<0 ||
      !rxb_scope_(policy,q) || !rxb_id_(q.authorization_ref) || q.authorization_ref.indexOf('read:')===0 ||
      !Number.isSafeInteger(q.expected_revision) || q.expected_revision<0 ||
      !Number.isSafeInteger(q.issued_at) || !Number.isSafeInteger(q.expires_at) || q.issued_at<0 ||
      q.issued_at>now || q.expires_at<=now || q.expires_at<=q.issued_at || q.expires_at-q.issued_at>300000) rxb_fail_();
  if (!rxb_exact_(q.payload,[])) rxb_fail_();
  if (!existingApproval && p.getProperty('REXCTL_APPROVAL_'+q.authorization_ref)!==null) rxb_fail_();
  var gate=rcow_gate_(c,q.bot,q.target_id);
  var expectedPaused=q.action==='queue.resume';
  if (gate.revision!==q.expected_revision || gate.paused!==expectedPaused || q.expires_at<=Date.now()) rxb_fail_();
  return {command:q, binding_hash:RexControl.binding(q,actor,{sha256:rcj_hash_}), gate_action:true};
}
function rcow_prepareGate(actor, bot, target, action) {
  rxb_owner_();
  if (['rex','claude'].indexOf(actor)<0 || ['max','telegram'].indexOf(bot)<0 ||
      !rxb_target_(target) || ['queue.pause','queue.resume'].indexOf(action)<0) rxb_fail_();
  var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,true);
  if (c.allowed_targets[bot].indexOf(target)<0) rxb_fail_();
  var gate=rcow_gate_(c,bot,target), now=Date.now(), id=Utilities.getUuid();
  var q={version:'rexctl-v1',command_id:'owner-ui-'+id,action:action,bot:bot,target_id:target,payload:{},
         issued_at:now,expires_at:now+120000,authorization_ref:'owner-ui-approval-'+id,expected_revision:gate.revision};
  var text=JSON.stringify(q),v=rcow_validate_(actor,text,false);
  return {ok:true,command_json:text,binding_hash:v.binding_hash,review:rcow_preview_(actor,text),approved:false,gate_changed:false,messages_sent:0};
}
function rcow_preview_(actor, text) {
  var v=rcow_validate_(actor,text,false),q=v.command;
  return {ok:true,actor_id:actor,action:q.action,bot:q.bot,target_id:q.target_id,
          issued_at:q.issued_at,expires_at:q.expires_at,expected_revision:q.expected_revision,
          command_id:q.command_id,authorization_ref:q.authorization_ref,binding_hash:v.binding_hash,
          gate_action:v.gate_action,approved:false,gate_changed:false,messages_sent:0};
}
function rcow_approve(actor, text, previewBinding) {
  rxb_owner_();
  if (typeof previewBinding!=='string'||!/^[a-f0-9]{64}$/.test(previewBinding)) rxb_fail_();
  var v=rcow_validate_(actor,text,false);
  if (!rxb_equal_(v.binding_hash,previewBinding)) rxb_fail_();
  var r=rexctl_approveExactCommand(actor,v.command);
  if (!r||r.ok!==true||r.binding_hash!==previewBinding) rxb_fail_();
  return {ok:true,approved:true,actor_id:actor,command_id:v.command.command_id,
          authorization_ref:v.command.authorization_ref,binding_hash:r.binding_hash,
          expires_at:r.expires_at,gate_changed:false,messages_sent:0};
}
function rcow_executeGate(actor, text, previewBinding) {
  rxb_owner_();
  if (typeof previewBinding!=='string'||!/^[a-f0-9]{64}$/.test(previewBinding)) rxb_fail_();
  var v=rcow_validate_(actor,text,true);
  if (!v.gate_action||!rxb_equal_(v.binding_hash,previewBinding)) rxb_fail_();
  var p=PropertiesService.getScriptProperties(), now=Date.now(),q=v.command;
  var e={op:'rexctl',version:'rex-gateway-v1',actor_id:actor,issuer_id:'fabrika-mcp-gateway-v1',
         issued_at:now,expires_at:Math.min(now+60000,q.expires_at),nonce:'owner-ui-'+Utilities.getUuid(),request:q};
  e.signature=rxb_hmac_(e,rxb_json_(p,'REXCTL_GATEWAY_KEYS_V1')[actor].secret_hex);
  var r=rexctl_handleEnvelope_(e);
  if (!r || typeof r.ok!=='boolean' || ['rejected','succeeded','failed_certain','uncertain'].indexOf(r.state)<0 ||
      r.ok!==(r.state==='succeeded') || (r.command_id!==undefined&&r.command_id!==q.command_id) ||
      (r.duplicate!==undefined&&typeof r.duplicate!=='boolean')) rxb_fail_();
  if (r.state==='succeeded' && (r.command_id!==q.command_id || r.duplicate!==false ||
      !Number.isSafeInteger(r.revision) || r.revision!==q.expected_revision+1)) rxb_fail_();
  if (r.state!=='rejected' && r.command_id!==q.command_id) rxb_fail_();
  var out={ok:r.ok,state:r.state,command_id:q.command_id,action:q.action,bot:q.bot,target_id:q.target_id,
           messages_sent:0,automatic_retry:false};
  if (Number.isSafeInteger(r.revision)&&r.revision>=0) out.revision=r.revision;
  if (typeof r.duplicate==='boolean') out.duplicate=r.duplicate;
  return out;
}
function rcow_status(bot,target) {
  rxb_owner_();
  var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,true);
  if (['max','telegram'].indexOf(bot)<0||!rxb_target_(target)||c.allowed_targets[bot].indexOf(target)<0) rxb_fail_();
  var g=rcow_gate_(c,bot,target);
  return {ok:true,bot:bot,target_id:target,operator_revision:g.revision,operator_paused:g.paused,
          business_automation_checked:false,messages_sent:0};
}
function rcow_routeGet_(e) {
  if (!e||!e.parameter||e.parameter.page!=='owner-control') return null;
  rxb_owner_();
  if (e.parameters&&e.parameters.page&&e.parameters.page.length!==1) rxb_fail_();
  return rcow_render_();
}
function rcow_render_() {
  rxb_owner_();
  return HtmlService.createHtmlOutput(`<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Фабрика: команды помощника</title>
<style>body{font:16px system-ui;max-width:720px;margin:24px auto;padding:0 16px;color:#17212b}label{display:block;margin:16px 0 5px}input,select,button{font:inherit;box-sizing:border-box}input{max-width:100%}button{padding:12px;margin:12px 5px 5px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f2f4f6;padding:12px}#status{white-space:pre-wrap}</style></head><body>
<h1>Команды помощника</h1>
<p><b>Пауза новых отправок и ответов Рекса и Claude в выбранном чате.</b> Чтение и проверка состояния остаются доступны. Она не выключает бизнес-бота, расписания, пересылки или обработку групп. Уже начатые операции могут завершиться. Эта страница не отправляет сообщения и не выкладывает код.</p>
<label>Исполнитель <select id="actor"><option value="rex">Рекс</option><option value="claude">Claude</option></select></label>
<label>Бот <select id="bot"><option value="max">MAX</option><option value="telegram">Telegram</option></select></label>
<label>ID разрешённого чата <input id="target" value="678987782" inputmode="numeric" autocomplete="off"></label>
<button id="statusBtn">Проверить состояние команд помощника</button>
<label>Изменение <select id="action"><option value="queue.pause">Приостановить команды помощника</option><option value="queue.resume">Разрешить команды помощника</option></select></label>
<button id="prepare">1. Проверить изменение</button><button id="approve" disabled>2. Одобрить изменение</button><button id="execute" disabled>3. Выполнить изменение</button>
<p id="status" role="status" aria-live="polite"></p><pre id="review" hidden></pre>
<script>(function(){'use strict';
var el=function(id){return document.getElementById(id);},candidate=null,approved=null,locked=false,pending=false;
var inputs=['actor','bot','target','action'],buttons=['statusBtn','prepare','approve','execute'];
function message(s){el('status').textContent=s;}
function invalidate(){candidate=null;approved=null;el('approve').disabled=true;el('execute').disabled=true;el('review').hidden=true;}
function busy(v){pending=v;inputs.concat(buttons).forEach(function(id){el(id).disabled=v;});if(!v){el('approve').disabled=!candidate;el('execute').disabled=!approved;}}
function selection(){return inputs.map(function(id){return el(id).value;}).join('|');}
function same(c){return c&&c.selection===selection()&&Date.now()<c.expiry;}
inputs.forEach(function(id){el(id).addEventListener('input',invalidate);el(id).addEventListener('change',invalidate);});
function failed(){locked=true;busy(true);message('Исход не подтверждён. Автоматического повтора нет. Откройте страницу заново и сначала проверьте состояние команд помощника.');}
el('statusBtn').addEventListener('click',function(){if(locked||pending)return;invalidate();busy(true);google.script.run.withSuccessHandler(function(r){busy(false);message(JSON.stringify(r,null,2));}).withFailureHandler(function(){busy(false);message('Не удалось прочитать состояние. Изменений нет.');}).rcow_status(el('bot').value,el('target').value);});
el('prepare').addEventListener('click',function(){if(locked||pending)return;invalidate();var choice=selection(),actor=el('actor').value;busy(true);google.script.run.withSuccessHandler(function(r){busy(false);if(!r||!r.ok||!r.review||selection()!==choice){message('Команда не подготовлена.');return;}candidate={actor:actor,text:r.command_json,hash:r.binding_hash,expiry:r.review.expires_at,selection:choice};el('review').textContent=JSON.stringify(r.review,null,2);el('review').hidden=false;el('approve').disabled=false;message('Сверьте действие, чат, исполнителя и ревизию. Срок две минуты. Пока ничего не изменено.');}).withFailureHandler(function(){busy(false);invalidate();message('Подготовка отклонена. Проверьте адресат, права и текущее состояние.');}).rcow_prepareGate(actor,el('bot').value,el('target').value,el('action').value);});
el('approve').addEventListener('click',function(){if(locked||pending)return;if(!same(candidate)){invalidate();message('Проверка устарела. Подготовьте изменение заново.');return;}var c=candidate;candidate=null;locked=true;busy(true);google.script.run.withSuccessHandler(function(r){if(!r||!r.ok||!r.approved||r.binding_hash!==c.hash){failed();return;}approved=c;locked=false;busy(false);message('Одобрение сохранено. Изменение ещё не выполнено. Кнопка 3 исполнит только показанную команду.');}).withFailureHandler(failed).rcow_approve(c.actor,c.text,c.hash);});
el('execute').addEventListener('click',function(){if(locked||pending)return;if(!same(approved)){invalidate();message('Одобрение устарело. Подготовьте изменение заново.');return;}var c=approved;approved=null;locked=true;busy(true);google.script.run.withSuccessHandler(function(r){var q=JSON.parse(c.text);if(!r||typeof r.ok!=='boolean'||['rejected','succeeded','failed_certain','uncertain'].indexOf(r.state)<0||r.ok!==(r.state==='succeeded')||r.command_id!==q.command_id||r.action!==q.action||r.bot!==q.bot||r.target_id!==q.target_id||r.messages_sent!==0||r.automatic_retry!==false||(r.ok&&(r.revision!==q.expected_revision+1||r.duplicate!==false))){failed();return;}message(JSON.stringify(r,null,2)+'\\nПовтора нет. Для новой команды откройте страницу заново.');}).withFailureHandler(failed).rcow_executeGate(c.actor,c.text,c.hash);});
})();</script></body></html>`).setTitle('Фабрика: команды помощника');
}
