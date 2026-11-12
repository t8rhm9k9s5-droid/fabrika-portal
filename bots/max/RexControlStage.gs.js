/* One-time owner-only preparation. Creates no credentials or external access. */
function rexctl_stageJournal20261108() {
  var journal = rexctl_createJournal('rexctl-20261108');
  var result = {ok:true, journal:journal, access_enabled:false, credentials_created:false};
  console.log(JSON.stringify(result));
  return result;
}
