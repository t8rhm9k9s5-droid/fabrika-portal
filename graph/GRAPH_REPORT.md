# Graph Report - code  (2026-11-14)

## Corpus Check
- 207 files · ~520,961 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .css 6, (none) 1)

## Summary
- 3408 nodes · 9781 edges · 129 communities (110 shown, 19 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 377 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- sales_day.py
- site.js
- maxPost_
- banned
- max/Autonomy.gs.js
- telegram/Autonomy.gs.js
- MaxCore.gs.js
- sky.js
- acct.js
- hub.js
- itm.py
- test_pulse_live.js
- sales_ctl.py
- TimersCtl.gs.js
- remind.py
- deploy.py
- run
- telegram/Код.gs.js
- mail_q.py
- tgMsg_
- metrics.js
- max/ClaudePush.gs.js
- Relay.gs.js
- telegram/ClaudePush.gs.js
- kb_build.py
- _pt
- Store.gs.js
- jload
- TimersPolls.gs.js
- motion.js
- mx_ctl.py
- device_day
- track_parse
- bots_drive.py
- stock_mv.py
- utf8_
- live.js
- datetime
- MaxCoreOps.gs.js
- itm_ytd.py
- re
- sky0.js
- sales_section.py
- MaxCoreGroups.gs.js
- Timers.gs.js
- perf.js
- lib.php
- mail_cmd.py
- TimersMail.gs.js
- pos_check
- stock_mail.py
- glonass.py
- wx_f.php
- props
- json
- ozon.py
- tgUpdate0_
- tgUsers_
- acctPost_
- build_sales_scheme.py
- _num
- TimersWatch.gs.js
- tracker_rows
- test_tracks.py
- Gm
- evUnans_
- FakeSMTP
- glPick_
- json
- live.py
- build_requests.py
- FakeM
- predeploy_check.sh
- test_audit_deploy.py
- Session
- test_pulse_live.sh script
- max_hist.py
- build_site.py
- tm_tick
- lane_reports
- sys
- tm_msk_
- fav.js
- build_sales_duties.py
- blind.js
- run
- tm_log_
- now
- ingest_message
- pulse.js
- staff_watch.py
- ux.js
- test_poll_remind.py
- scan
- alert
- st_so.php
- mx_poll.py
- drive_pack.py
- leaders.py
- q_digest
- alert_flush
- send
- tm_preflight
- rec
- _smtp_send
- build_ko_pdf.py
- check_evening
- tm_importState
- fresh.js
- Rec
- Resp
- LD
- LD
- test_mail_q.py
- tm_alert_
- SecPortal.gs.js
- ClaudeMail.gs.js
- build_host.sh
- publish_pages.sh

## God Nodes (most connected - your core abstractions)
1. `props()` - 134 edges
2. `tgMsg_()` - 97 edges
3. `h_()` - 87 edges
4. `fail_()` - 63 edges
5. `pj_()` - 52 edges
6. `mountNav()` - 44 edges
7. `b2Button_()` - 44 edges
8. `b2Msk_()` - 43 edges
9. `tgUpdate0_()` - 40 edges
10. `tgUsers_()` - 39 edges

## Surprising Connections (you probably didn't know these)
- `add()` --indirect_call--> `rows()`  [INFERRED]
  struktura/src/build_requests.py → robot/live/sales_day.py
- `tm_tick()` --indirect_call--> `tm_export_()`  [INFERRED]
  bots/max/Timers.gs.js → bots/max/TimersWatch.gs.js
- `tm_tick()` --indirect_call--> `tm_reclWatch_()`  [INFERRED]
  bots/max/Timers.gs.js → bots/max/TimersWatch.gs.js
- `call()` --calls--> `iso()`  [INFERRED]
  robot/live/test/test_tracks.py → robot/live/live.py
- `fail()` --calls--> `log()`  [INFERRED]
  robot/live/deploy.py → robot/live/live.py

## Import Cycles
- None detected.

## Communities (129 total, 19 thin omitted)

### Community 0 - "sales_day.py"
Cohesion: 0.15
Nodes (11): _col(), lock(), _locked(), main(), merge(), merge_month(), month_total(), _month_total_raw() (+3 more)

### Community 1 - "site.js"
Cohesion: 0.05
Nodes (78): alts(), apply(), applyLook(), arm(), auto(), choice(), confirmInline(), describe() (+70 more)

### Community 2 - "maxPost_"
Cohesion: 0.13
Nodes (29): ask_(), fxBegin_(), fxDrop_(), fxEnd_(), g4_askOrder_(), g4_cmdDefer_(), g4_cmdFlush_(), g4_cmdMask_() (+21 more)

### Community 3 - "banned"
Cohesion: 0.13
Nodes (11): ans_key(), banned(), executors(), has_client(), match_entry(), person(), add(), q_marked() (+3 more)

### Community 4 - "max/Autonomy.gs.js"
Cohesion: 0.09
Nodes (70): au_addDays_(), au_address_(), au_addWorkdays_(), au_append_(), au_basis_(), au_basisCities_(), au_bot_(), au_cell_() (+62 more)

### Community 5 - "telegram/Autonomy.gs.js"
Cohesion: 0.09
Nodes (70): au_addDays_(), au_address_(), au_addWorkdays_(), au_append_(), au_basis_(), au_basisCities_(), au_bot_(), au_cell_() (+62 more)

### Community 6 - "MaxCore.gs.js"
Cohesion: 0.08
Nodes (62): mx_appendObj(), mx_botUid(), mx_count(), mx_countersTrim(), mx_dayKey(), mx_defaults(), mx_deferAdd(), mx_deferFlush() (+54 more)

### Community 7 - "sky.js"
Cohesion: 0.15
Nodes (33): alerts(), alOf(), banner(), close(), deg(), dmhm(), emit(), fc24() (+25 more)

### Community 8 - "acct.js"
Cohesion: 0.06
Nodes (107): account(), addUser(), aes(), api(), assistant(), bubble(), send(), b64() (+99 more)

### Community 9 - "hub.js"
Cohesion: 0.07
Nodes (51): apply(), build(), cell(), cellDays(), cellMonth(), dd(), dplan(), endv() (+43 more)

### Community 10 - "itm.py"
Cohesion: 0.06
Nodes (35): addr(), att_names(), authentic(), body_text(), card(), cfg_off(), clean(), copy_sent() (+27 more)

### Community 11 - "test_pulse_live.js"
Cohesion: 0.09
Nodes (19): dir, fs, path, vm, asJson, asked, bin(), ctx (+11 more)

### Community 12 - "sales_ctl.py"
Cohesion: 0.17
Nodes (19): cc_owner(), ddmm(), digest(), due_at(), hm(), hrs(), iso_(), line() (+11 more)

### Community 13 - "TimersCtl.gs.js"
Cohesion: 0.10
Nodes (50): tm_mask_(), tm_addressee_(), tm_checkpoints_(), tm_clauses_(), tm_ctl_(), tm_ctlAnswer_(), tm_ctlDmAnswer_(), tm_ctlDue_() (+42 more)

### Community 14 - "remind.py"
Cohesion: 0.09
Nodes (31): addressee(), answers(), days_gen(), days_ru(), dmy(), esc_text_dm(), escalate(), fetch() (+23 more)

### Community 15 - "deploy.py"
Cohesion: 0.08
Nodes (27): _bak_root(), check(), DeployError, DeployRetry, download(), g1c_download(), g1c_listing(), _get() (+19 more)

### Community 16 - "run"
Cohesion: 0.12
Nodes (11): creds(), _due(), file_token(), key_hint(), key_path(), _rd(), refresh_ref(), run() (+3 more)

### Community 17 - "telegram/Код.gs.js"
Cohesion: 0.04
Nodes (113): adminMav(), aiCall_(), aiCallRaw_(), aiPing(), aiProvs_(), allSubs_(), b2CfAll_(), b2Cur_() (+105 more)

### Community 18 - "mail_q.py"
Cohesion: 0.10
Nodes (30): _acks(), _archive_ack(), att_bytes(), _b64_len(), big_pending(), bot_work(), enqueue(), is_big() (+22 more)

### Community 19 - "tgMsg_"
Cohesion: 0.09
Nodes (86): b2App_(), b2Ask_(), b2Blobs_(), b2Button_(), b2CfFix_(), b2CfList_(), b2CfNew_(), b2CfOpen_() (+78 more)

### Community 20 - "metrics.js"
Cohesion: 0.11
Nodes (40): card(), close(), ctx(), dd(), emit(), gEnd(), get(), gN() (+32 more)

### Community 21 - "max/ClaudePush.gs.js"
Cohesion: 0.15
Nodes (41): cp_alert_(), cp_backoff_(), cp_backoffUntil_(), cp_batchText_(), cp_botName_(), cp_bufAdd_(), cp_bufDel_(), cp_bufDelRows_() (+33 more)

### Community 22 - "Relay.gs.js"
Cohesion: 0.09
Nodes (54): checkRelay(), cmd_(), connectWebhook(), disconnectWebhook(), doGet(), doPost(), dropGroup_(), findGroup_() (+46 more)

### Community 23 - "telegram/ClaudePush.gs.js"
Cohesion: 0.15
Nodes (41): cp_alert_(), cp_backoff_(), cp_backoffUntil_(), cp_batchText_(), cp_botName_(), cp_bufAdd_(), cp_bufDel_(), cp_bufDelRows_() (+33 more)

### Community 24 - "kb_build.py"
Cohesion: 0.08
Nodes (21): canon(), chunk(), clean(), crawl_step(), fetch(), frag(), frags(), keys() (+13 more)

### Community 25 - "_pt"
Cohesion: 0.17
Nodes (8): dp_keep(), _edge_m(), _find_pts(), geom(), _in_poly(), _pt(), _xy(), zone_of()

### Community 26 - "Store.gs.js"
Cohesion: 0.13
Nodes (38): cell_(), findRow_(), folder_(), inDone_(), inFail_(), inPending_(), inPut_(), int4_() (+30 more)

### Community 27 - "jload"
Cohesion: 0.21
Nodes (21): gas_inbox(), gas_raw(), iso(), jload(), jsave(), lane_bots(), lane_docs(), lane_glm() (+13 more)

### Community 29 - "TimersPolls.gs.js"
Cohesion: 0.15
Nodes (37): tm_ansKey_(), tm_banned_(), tm_checkEvening_(), tm_checkMorning_(), tm_datesOf_(), tm_escRe_(), tm_executors_(), tm_firstName_() (+29 more)

### Community 30 - "motion.js"
Cohesion: 0.17
Nodes (15): count(), frame(), dayOpen(), esc(), fmt(), liveBin(), mln(), mskToday() (+7 more)

### Community 31 - "mx_ctl.py"
Cohesion: 0.08
Nodes (23): api(), checkpoints(), clauses(), dates_in(), ddmm(), find_mark(), group_members(), LD (+15 more)

### Community 32 - "device_day"
Cohesion: 0.11
Nodes (12): _addr(), day_data(), device_day(), _intervals(), _items(), _kind(), _kv(), _rides() (+4 more)

### Community 33 - "track_parse"
Cohesion: 0.29
Nodes (4): _arr(), track_parse(), track_resp(), _tval()

### Community 34 - "bots_drive.py"
Cohesion: 0.11
Nodes (24): _atomic_write(), _download(), _drafts(), _folder_id(), _gd(), install(), mail_send(), max_send() (+16 more)

### Community 35 - "stock_mv.py"
Cohesion: 0.12
Nodes (13): bins(), branch(), clean(), fix_xlsx(), ingest(), is_mv(), kind(), _num() (+5 more)

### Community 36 - "utf8_"
Cohesion: 0.07
Nodes (79): add_(), aesBlock_(), aesKey_(), approvePage_(), b2Board_(), b2ClAnswer_(), b2CmdKey_(), b2Key_() (+71 more)

### Community 37 - "live.js"
Cohesion: 0.25
Nodes (15): b64(), cget(), comp(), cput(), get(), hex(), net(), open() (+7 more)

### Community 38 - "datetime"
Cohesion: 0.13
Nodes (10): _dt(), _fmt(), _hm(), _iso(), _iv_dt(), _naive_shift(), online(), track_day() (+2 more)

### Community 39 - "MaxCoreOps.gs.js"
Cohesion: 0.14
Nodes (31): mx_cmd(), mx_grpKey(), mx_histImport(), mx_importState(), mx_opDelete(), mx_opDm(), mx_opGroup(), mx_opPoll() (+23 more)

### Community 40 - "itm_ytd.py"
Cohesion: 0.09
Nodes (19): _body_text(), _cell(), _day_rec(), _doc_kind(), _fetch_headers(), _fnum(), _hdr_row(), _iso_date() (+11 more)

### Community 41 - "re"
Cohesion: 0.06
Nodes (39): _ext(), prune(), pw_1c(), _rd(), run(), run_1c(), run_box(), _skey() (+31 more)

### Community 42 - "sky0.js"
Cohesion: 0.15
Nodes (33): alerts(), alOf(), banner(), close(), deg(), dmhm(), emit(), fc24() (+25 more)

### Community 43 - "sales_section.py"
Cohesion: 0.10
Nodes (22): build_xlsx(), sheet(), sheet_head(), align(), _chg_li(), contacts_html(), D(), duty_items() (+14 more)

### Community 44 - "MaxCoreGroups.gs.js"
Cohesion: 0.14
Nodes (30): mx_addressed(), mx_aiCheck(), mx_aiReview(), mx_attText(), mx_autoDispute(), mx_autoPrice(), mx_autoRecl(), mx_bool() (+22 more)

### Community 45 - "Timers.gs.js"
Cohesion: 0.12
Nodes (18): tm_bool_(), tm_cellMs_(), tm_h_(), tm_hmMin_(), tm_inBody_(), tm_isLeader_(), tm_isoMs_(), tm_leaderMails_() (+10 more)

### Community 46 - "perf.js"
Cohesion: 0.13
Nodes (24): addCSS(), attach3D(), probe(), decide(), done(), one(), foot(), judge() (+16 more)

### Community 47 - "lib.php"
Cohesion: 0.05
Nodes (74): {closure#14}(), {closure#3}(), mx_addressed(), mx_as_comment(), mx_att_note(), mx_chat_title(), mx_chat_title_fetch(), mx_comment() (+66 more)

### Community 48 - "mail_cmd.py"
Cohesion: 0.16
Nodes (17): _addr(), _att_save(), authentic(), body_text(), _cfg(), classify(), _dom(), _gas() (+9 more)

### Community 49 - "TimersMail.gs.js"
Cohesion: 0.17
Nodes (26): tm_addr_(), tm_addrs_(), tm_authentic_(), tm_colSet_(), tm_dom_(), tm_headers_(), tm_label_(), tm_mailBody_() (+18 more)

### Community 50 - "pos_check"
Cohesion: 0.13
Nodes (9): _dec(), _enc(), _pl(), pos_check(), row_check(), tracks_out(), tracks_pub(), _trk_pub() (+1 more)

### Community 52 - "stock_mail.py"
Cohesion: 0.18
Nodes (10): compose(), _d(), _d1(), _movers(), mv_last(), _n(), _n1(), _ru() (+2 more)

### Community 54 - "glonass.py"
Cohesion: 0.17
Nodes (14): _ago(), _back(), clean_track(), dev_bad(), dev_report(), dev_text(), _dist_m(), _dm() (+6 more)

### Community 55 - "wx_f.php"
Cohesion: 0.11
Nodes (4): msk_dm(), msk_hm(), span_txt(), wx_alerts()

### Community 56 - "props"
Cohesion: 0.08
Nodes (76): b2Clean_(), b2Gm_(), b2Hb_(), b2HostWatch_(), critClear_(), critList_(), critMap_(), critSet_() (+68 more)

### Community 57 - "json"
Cohesion: 0.08
Nodes (21): call(), get_file(), iso_now(), _key(), put_file(), _rd(), run(), _url() (+13 more)

### Community 58 - "ozon.py"
Cohesion: 0.11
Nodes (11): call(), creds(), first(), OzonError, postings(), _rd(), reviews(), run() (+3 more)

### Community 59 - "tgUpdate0_"
Cohesion: 0.07
Nodes (64): botMenu(), fx_(), fxTgPack_(), jAdd_(), jAddRaw_(), jAll_(), jAp_(), jButton_() (+56 more)

### Community 60 - "tgUsers_"
Cohesion: 0.10
Nodes (48): b2Chunks_(), b2Deliver_(), b2Dm_(), b2DmWho_(), b2Get_(), b2News_(), b2Posts_(), b2Set_() (+40 more)

### Community 61 - "acctPost_"
Cohesion: 0.12
Nodes (42): acctPost_(), acctShared_(), approveFromMail(), bumpRev_(), chatDel_(), chatList_(), chatSend_(), chatSheet_() (+34 more)

### Community 62 - "build_sales_scheme.py"
Cohesion: 0.16
Nodes (6): box(), height(), lines_of(), ln(), subtree(), wrap()

### Community 64 - "_num"
Cohesion: 0.15
Nodes (9): _by(), _hours(), near_fill(), _num(), _silent_why(), stage_intervals(), total_h(), total_km() (+1 more)

### Community 65 - "TimersWatch.gs.js"
Cohesion: 0.17
Nodes (20): tm_nightly_(), tm_chunks_(), tm_export_(), tm_isoWeek_(), tm_pollAnswers_(), tm_pollsAll_(), tm_prHas_(), tm_prKeys_() (+12 more)

### Community 66 - "tracker_rows"
Cohesion: 0.09
Nodes (16): _car_title(), _dm_hm(), _f1(), _h1(), _hrs_word(), _mark(), _mins(), _pkey() (+8 more)

### Community 67 - "test_tracks.py"
Cohesion: 0.22
Nodes (5): call(), fake_track(), move(), off(), park()

### Community 69 - "evUnans_"
Cohesion: 0.23
Nodes (16): evAskTxt_(), evDay_(), evDone_(), evDueTxt_(), evIn_(), evLock_(), evQ_(), evQSave_() (+8 more)

### Community 71 - "glPick_"
Cohesion: 0.73
Nodes (6): glN_(), glPick_(), glS_(), glTrackers_(), glTrk_(), glTrkSum_()

### Community 72 - "json"
Cohesion: 0.09
Nodes (13): mime(), ku_of(), main(), send_file(), sign(), _groups(), _rd(), run() (+5 more)

### Community 74 - "live.py"
Cohesion: 0.13
Nodes (13): _alert_outcome(), _alert_send(), all_mail(), app_password(), build_all(), _fail_read(), fetch_mail(), _key_file() (+5 more)

### Community 75 - "build_requests.py"
Cohesion: 0.16
Nodes (5): build_html(), form_card(), add(), city(), op_of()

### Community 77 - "predeploy_check.sh"
Cohesion: 0.83
Nodes (3): bad(), predeploy_check.sh script, step()

### Community 78 - "test_audit_deploy.py"
Cohesion: 0.12
Nodes (6): FakeIMAP, LaneTimeout, letter(), put(), rep2(), zbytes()

### Community 79 - "Session"
Cohesion: 0.18
Nodes (5): call(), GlonassError, LoginError, _mask(), Session

### Community 81 - "max_hist.py"
Cohesion: 0.16
Nodes (11): _addwd(), groups_pull(), _has(), _keys(), LD, mask(), promises(), _rd() (+3 more)

### Community 82 - "build_site.py"
Cohesion: 0.23
Nodes (5): area_card(), card(), contact_btn(), dept_block(), section_css()

### Community 83 - "tm_tick"
Cohesion: 0.24
Nodes (16): tm_begin_(), tm_coreTrigger_(), tm_ctx_(), tm_daily_(), tm_end_(), tm_every_(), tm_job_(), tm_memReset_() (+8 more)

### Community 84 - "lane_reports"
Cohesion: 0.15
Nodes (13): _auth_gate(), check(), expected(), expected_x(), is_workday(), lane_reports(), _crit(), lanes_status() (+5 more)

### Community 85 - "sys"
Cohesion: 0.05
Nodes (6): check_code(), code_map(), load_live(), make(), unseal(), FakeDT

### Community 86 - "tm_msk_"
Cohesion: 0.36
Nodes (9): tm_addDays_(), tm_dateMs_(), tm_dateOf_(), tm_isHoliday_(), tm_nextWorkday_(), tm_wd_(), tm_wdBetween_(), tm_workday_() (+1 more)

### Community 87 - "fav.js"
Cohesion: 0.15
Nodes (27): card(), day(), esc(), forHere(), hidden(), hide(), host(), mount() (+19 more)

### Community 88 - "build_sales_duties.py"
Cohesion: 0.21
Nodes (6): build(), by_name(), contractors_table(), on_page(), person_block(), summary_table()

### Community 89 - "blind.js"
Cohesion: 0.32
Nodes (13): compute(), draw(), init(), mk(), nfmt(), obstacles(), outdoor(), pd() (+5 more)

### Community 90 - "run"
Cohesion: 0.13
Nodes (12): fwd_digest(), hm(), iso_(), jl(), jsave0600(), MC_mask(), members(), now() (+4 more)

### Community 91 - "tm_log_"
Cohesion: 0.34
Nodes (14): tm_chatOk_(), tm_err_(), tm_groups_(), tm_histGroups_(), tm_histGroupsAll_(), tm_log_(), tm_mail_(), tm_obClose_() (+6 more)

### Community 92 - "now"
Cohesion: 0.17
Nodes (9): lane_due(), lane_every(), lanes_watch(), LaneTimeout, main(), now(), old_run_busy(), run_lane() (+1 more)

### Community 93 - "ingest_message"
Cohesion: 0.12
Nodes (8): _body_text(), decode_name(), galv_none(), galv_none_since(), ingest_message(), IngestRetry, rep_1c_backfill(), StateCorrupt

### Community 94 - "pulse.js"
Cohesion: 0.20
Nodes (11): again(), bars(), bin(), d1(), draw(), esc(), glData(), glOk() (+3 more)

### Community 96 - "staff_watch.py"
Cohesion: 0.22
Nodes (10): _banned(), check(), _gone(), _jl(), LD, letter(), _match(), _new() (+2 more)

### Community 98 - "ux.js"
Cohesion: 0.27
Nodes (8): flush(), hist(), leave(), now(), pg(), push(), usr(), view()

### Community 99 - "test_poll_remind.py"
Cohesion: 0.25
Nodes (8): Api, at(), ms(), ok(), run_all(), scenario(), setup(), units()

### Community 100 - "scan"
Cohesion: 0.14
Nodes (8): box(), hdr_fetch(), ids(), judge(), robot(), scan(), search(), snippet()

### Community 101 - "alert"
Cohesion: 0.15
Nodes (7): fail(), alert(), _block_bad(), _lane_alerts(), _mail_alerts(), _report_alerts(), _warn_alert()

### Community 102 - "st_so.php"
Cohesion: 0.21
Nodes (4): clean(), sheet_rows(), xml_safe(), zip_entry()

### Community 103 - "mx_poll.py"
Cohesion: 0.27
Nodes (7): cfg_path(), load_cfg(), mention(), pend_line(), poll_text(), publish_poll(), q_on()

### Community 104 - "drive_pack.py"
Cohesion: 0.32
Nodes (8): main(), pack(), sig_v1(), sig_v2(), _stream(), unpack(), write_pkg(), xor()

### Community 105 - "leaders.py"
Cohesion: 0.29
Nodes (7): is_lead(), load(), mails(), _n(), _name_hit(), _owner_fio(), _stem()

### Community 106 - "q_digest"
Cohesion: 0.22
Nodes (5): first_name(), head_of(), q_digest(), q_morning(), questions()

### Community 107 - "alert_flush"
Cohesion: 0.22
Nodes (6): alert_flush(), step(), _alerts_io(), _jread(), _jwrite(), _quiet()

### Community 108 - "send"
Cohesion: 0.22
Nodes (6): _send_limited(), run(), dry(), q_send(), quiet(), send()

### Community 109 - "tm_preflight"
Cohesion: 0.24
Nodes (14): tm_botUid_(), tm_cfgGet_(), tm_cfgJson_(), tm_core_(), tm_global_(), tm_holidays_(), tm_keyFor_(), tm_komCid_() (+6 more)

### Community 110 - "rec"
Cohesion: 0.29
Nodes (5): fn(), h16(), own(), rec(), tkey()

### Community 111 - "_smtp_send"
Cohesion: 0.33
Nodes (3): _smtp_send(), msg(), via()

### Community 112 - "build_ko_pdf.py"
Cohesion: 0.15
Nodes (7): build(), fit(), on_page(), person_block(), table(), F_(), new_fn()

### Community 113 - "check_evening"
Cohesion: 0.29
Nodes (4): check_evening(), check_morning(), dates_of(), has_sum()

### Community 114 - "tm_importState"
Cohesion: 0.39
Nodes (9): tm_groupTitle_(), tm_hist_(), tm_histName_(), tm_importState(), tm_ingest_(), tm_load_(), tm_save_(), tm_saveSub_() (+1 more)

### Community 115 - "fresh.js"
Cohesion: 0.38
Nodes (8): commit(), id(), live(), mark(), norm(), save(), soon(), visit()

### Community 117 - "Resp"
Cohesion: 0.33
Nodes (3): mk(), urlopen(), Resp

### Community 121 - "test_mail_q.py"
Cohesion: 0.08
Nodes (5): gql(), one(), run(), Net, _net()

### Community 124 - "tm_alert_"
Cohesion: 0.21
Nodes (14): ob_alert_(), tm_alert_(), tm_cell_(), tm_cfg_(), tm_cfgSet_(), tm_findRow_(), tm_meter_(), tm_removeTriggers() (+6 more)

### Community 132 - "SecPortal.gs.js"
Cohesion: 0.60
Nodes (3): secAclGate_(), secBin_(), secPortal_()

### Community 135 - "ClaudeMail.gs.js"
Cohesion: 0.83
Nodes (3): cm_addrOk_(), cm_post_(), cm_send_()

## Knowledge Gaps
- **3 isolated node(s):** `RFC-6979`, `RFC-8291`, `RFC-8292`
  These have ≤1 connection - possible missing edges. (Counts symbols only; 715 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Rec` connect `Rec` to `sys`?**
  _High betweenness centrality (0.009) - this node is a cross-community bridge._
- **What connects `RFC-6979`, `RFC-8291`, `RFC-8292` to the rest of the system?**
  _3 weakly-connected nodes found - possible missing edges._
- **Should `site.js` be split into smaller, more focused modules?**
  _Cohesion score 0.05093632958801498 - nodes in this community are weakly interconnected._
- **Why does `toAffine_()` connect `utf8_` to `telegram/Код.gs.js`, `Relay.gs.js`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Should `maxPost_` be split into smaller, more focused modules?**
  _Cohesion score 0.12561576354679804 - nodes in this community are weakly interconnected._
- **Why does `P_()` connect `Relay.gs.js` to `utf8_`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Should `banned` be split into smaller, more focused modules?**
  _Cohesion score 0.13157894736842105 - nodes in this community are weakly interconnected._