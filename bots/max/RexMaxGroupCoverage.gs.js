/* Owner-only read-only MAX membership audit; no sends or configuration changes. */
function rexgiMaxCoverage() {
  if (Session.getActiveUser().getEmail() !== 'user1@example.org' ||
      Session.getEffectiveUser().getEmail() !== 'user1@example.org') throw Error('Owner required');
  var p=PropertiesService.getScriptProperties(),c=rxb_config_(p,false);
  var page=rxb_maxGroupPage_(c,p,{bot:'max',target_id:'max-groups',payload:{limit:10}},
    function(url,options){return UrlFetchApp.fetch(url,options);});
  var result={ok:true,checked_at:new Date().toISOString(),complete_inventory:false,
    items:page.items,next_after:page.next_after,messages_sent:0,settings_changed:false};
  console.log(JSON.stringify(result));return result;
}
