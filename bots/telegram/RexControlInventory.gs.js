/* Owner-only, read-only inventory. No bot calls, queue reads or token output. */
function rexctl_telegramInventory() {
  var owner = 'user@example.org';
  if (Session.getActiveUser().getEmail() !== owner ||
      Session.getEffectiveUser().getEmail() !== owner) throw Error('owner required');
  var p = PropertiesService.getScriptProperties();
  var users = JSON.parse(p.getProperty('tg_users') || '{}');
  var items = [], seen = {}, mirrored = 0;
  Object.keys(users).forEach(function(key) {
    var u = users[key], id = u && String(u.chat || '');
    if (!/^-?[1-9][0-9]{0,19}$/.test(id) || seen[id]) return;
    seen[id] = true;
    if (typeof maxChat_ !== 'function') throw Error('registry classifier missing');
    if (maxChat_({chat_id:id})) { mirrored++; return; }
    items.push({id: id, title: String(u.name || u.first_name || u.username || '').slice(0,200)});
  });
  items.sort(function(a,b) { return a.id.localeCompare(b.id); });
  var token = p.getProperty('TG_TOKEN');
  var result = {owner_verified: true,
    direct_token_present: typeof token === 'string' && /^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token),
    native_registry_count: items.length, max_mirror_records_excluded: mirrored, registry: items};
  console.log(JSON.stringify(result));
  return result;
}
