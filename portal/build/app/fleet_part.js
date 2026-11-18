/* ADMIN-RULE-2026-11-08 — правило владельца: команды Т. В. и А. В. Сотрудник1 равноправны (подробно — АДМИНИСТРАТОРЫ.md). */
/* ---------- автопарк на парковках (17.11.2026, Т. В.: «грузовые — у гаража в фирменных ливреях, легковые — на размеченной парковке у АБК,
   у каждой машины ТТХ») — данные S.fleet (build/fleet/fleet.py): форма, габарит, цвет, место и направление; ливрея — белый кузов,
   красная полоса RAL 3020 (как на складе № 1 и швейном цехе) и знак «Фабрикант» на бортах. Госномера не показываются. ---------- */
const gFleet = G('fleet');
const FLEET_LOGO = '/*__FLEET_LOGO__*/';
const FL = {};
function flMat(c, extra){ const k = 'm' + c + (extra ? JSON.stringify(extra) : ''); return FL[k] || (FL[k] = new THREE.MeshLambertMaterial(Object.assign({color:c}, extra || {}))); }
function flLiveryTex(){
  if (FL.tex) return FL.tex;
  const c = document.createElement('canvas'); c.width = 1024; c.height = 440; const g = c.getContext('2d');
  const paint = img => {
    g.fillStyle = '#f4f5f4'; g.fillRect(0, 0, 1024, 440);
    g.fillStyle = '#c1121c'; g.fillRect(0, 330, 1024, 70);            // красная полоса внизу борта
    g.fillStyle = '#c1121c'; g.fillRect(0, 410, 1024, 14);
    if (img){ const w = 760, h = w * 125 / 550; g.drawImage(img, (1024 - w) / 2, 70, w, h); }
    else { g.fillStyle = '#111'; g.font = '700 120px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('ФАБРИКАНТ', 512, 220); }
  };
  paint(null);
  const t = new THREE.CanvasTexture(c); try { t.anisotropy = renderer.capabilities.getMaxAnisotropy(); } catch (e) {}
  if (FLEET_LOGO.indexOf('<svg') === 0){
    const im = new Image(); im.onload = () => { paint(im); t.needsUpdate = true; };
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(FLEET_LOGO);
  }
  return (FL.tex = t);
}
function flBox(grp, w, h, d, x, y, z, mat){ const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); grp.add(m); return m; }
function flWheel(grp, x, z, r, wd){
  const m = new THREE.Mesh(FL.wg || (FL.wg = new THREE.CylinderGeometry(1, 1, 1, 14)), flMat(0x18191b)); m.scale.set(r, wd, r); m.rotation.x = Math.PI / 2; m.position.set(x, r, z); grp.add(m);
  const hub = new THREE.Mesh(FL.wg, flMat(0x9ea3a7)); hub.scale.set(r * .55, wd + .02, r * .55); hub.rotation.x = Math.PI / 2; hub.position.set(x, r, z); grp.add(hub);
}
function flSide(grp, L, H, x, y, W){   // фирменный борт: две плоскости по бокам грузового отсека
  const tex = flLiveryTex(), mat = FL.lv || (FL.lv = new THREE.MeshLambertMaterial({map:tex}));
  for (const s of [1, -1]){ const p = new THREE.Mesh(new THREE.PlaneGeometry(L, H), mat); p.position.set(x, y, s * (W / 2 + .012)); if (s < 0) p.rotation.y = Math.PI; grp.add(p); }
}
const FL_GLASS = 0x4f6779;
function flCar(c){
  const g = new THREE.Group(), L = c.L, W = c.W, H = c.H, body = flMat(c.color != null ? c.color : 0xf2f3f2), gl = flMat(FL_GLASS), dark = flMat(0x2a2c2e);
  const r = c.kind === 'forklift' ? .3 : c.kind === 'farm' ? .55 : L > 5.6 ? .47 : .36;
  const wx = c.kind === 'forklift' ? [L * .22, -L * .22] : [L * .33, -L * .33];
  const white = flMat(0xf1f2f1), red = flMat(0xc1121c);
  if (c.kind === 'sedan' || c.kind === 'suv' || c.kind === 'suvbox' || c.kind === 'mpv'){
    // боковой профиль: кузов до линии окон и «стекло» с наклонными стойками, выдавлены на ширину (вперёд — +x)
    const h = L / 2, belt = c.kind === 'sedan' ? .86 : c.kind === 'suvbox' ? 1.18 : 1.02, sill = c.kind === 'suvbox' ? .42 : .3;
    const low = c.kind === 'sedan' ? [[-h, sill], [h - .05, sill], [h, .55], [h - .08, .74], [h * .45, belt - .02], [-h + .12, belt], [-h, .74]]
              : c.kind === 'suvbox' ? [[-h, sill], [h, sill], [h, belt - .12], [h - .2, belt], [-h, belt]]
              : [[-h, sill], [h - .05, sill], [h, .6], [h - .12, .88], [h * .52, belt], [-h + .05, belt], [-h, .8]];
    const top = c.kind === 'sedan' ? [[h * .42, belt - .02], [-h * .62, belt], [-h * .36, H - .02], [h * .05, H]]
              : c.kind === 'suvbox' ? [[h * .5, belt], [-h + .05, belt], [-h + .1, H], [h * .44, H]]
              : c.kind === 'mpv' ? [[h * .5, belt], [-h + .1, belt], [-h + .25, H], [h * .05, H]]
              : [[h * .5, belt], [-h + .08, belt], [-h + .2, H], [h * .08, H]];
    const ext = (pts, w, m) => { const s = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
      const geo = new THREE.ExtrudeGeometry(s, {depth:w, bevelEnabled:false}); geo.translate(0, 0, -w / 2); const me = new THREE.Mesh(geo, m); g.add(me); return me; };
    ext(low, W, body); ext(top, W * .86, gl);
    const tp = top.slice().sort((a, b) => b[1] - a[1]).slice(0, 2), rx0 = Math.min(tp[0][0], tp[1][0]), rx1 = Math.max(tp[0][0], tp[1][0]);
    flBox(g, rx1 - rx0 + .06, .07, W * .88, (rx0 + rx1) / 2, H + .02, 0, body);                             // крыша цветом кузова
    for (const s of [1, -1]) flBox(g, .09, belt > 1 ? H - belt : H - belt, .02, (top[0][0] + top[3][0]) / 2 - .05, (belt + H) / 2, s * (W * .43 + .012), body);   // средняя стойка
    flBox(g, .06, .16, W * .8, h + .01, .62, 0, flMat(0x3a3d40));                                          // решётка
    if (c.kind === 'suvbox') flBox(g, .3, .62, .62, -h - .14, .95, 0, dark);                              // запаска на двери
  } else if (c.kind === 'van' || c.kind === 'bus'){
    flBox(g, L - .9, H - .35, W, -.35, .35 + (H - .35) / 2, 0, white);
    flBox(g, 1.1, 1.0, W, L / 2 - .55, .35 + .5, 0, white);                                                // капот
    flBox(g, .9, .8, W * .96, L / 2 - 1.2, 1.6, 0, gl);                                                     // лобовое
    if (c.kind === 'bus') flBox(g, L - 2.4, .55, W + .02, -.6, 1.75, 0, gl);                              // окна салона
    flBox(g, L - .9, .16, W + .02, -.35, .62, 0, red);
    flSide(g, Math.min(3.6, L - 2.6), 1.3, -1.0, c.kind === 'bus' ? 1.05 : 1.45, W);
  } else if (c.kind === 'boxtruck' || c.kind === 'lighttruck'){
    const cabL = c.kind === 'lighttruck' ? 1.9 : 2.0, cabH = c.kind === 'lighttruck' ? 2.3 : 2.6, boxL = L - cabL - .25, boxH = H - 1.05;
    flBox(g, cabL, cabH, W * .96, L / 2 - cabL / 2, .45 + cabH / 2, 0, white);
    flBox(g, .08, cabH * .38, W * .86, L / 2 + .01, .45 + cabH * .66, 0, gl);
    flBox(g, cabL + .01, .12, W * .97, L / 2 - cabL / 2, .45 + cabH * .32, 0, red);
    flBox(g, boxL, .22, W * .5, -L / 2 + boxL / 2, .72, 0, dark);                                          // рама
    flBox(g, boxL, boxH, W, -L / 2 + boxL / 2, 1.05 + boxH / 2, 0, white);
    flSide(g, boxL - .2, boxH - .2, -L / 2 + boxL / 2, 1.05 + boxH / 2, W);
  } else if (c.kind === 'tractor'){
    flBox(g, 2.3, 2.9, W, L / 2 - 1.15, .55 + 1.45, 0, white);
    flBox(g, .08, 1.0, W * .9, L / 2 + .01, 2.6, 0, gl);
    flBox(g, 2.31, .2, W + .02, L / 2 - 1.15, 1.25, 0, red);
    flBox(g, 1.6, .9, W * .9, L / 2 - 1.15, H - .45, 0, white);                                            // спойлер на крыше
    flBox(g, L - 2.3, .35, W * .7, -1.15, .95, 0, dark);                                                   // рама
    flBox(g, 1.4, .18, 1.6, -L / 2 + 1.2, 1.2, 0, flMat(0x3a3c3e));                                        // седло
    const ls = new THREE.Mesh(new THREE.PlaneGeometry(1.7, .9), FL.lv || (FL.lv = new THREE.MeshLambertMaterial({map:flLiveryTex()})));
    for (const s of [1, -1]){ const p = ls.clone(); p.position.set(L / 2 - 1.15, 1.95, s * (W / 2 + .012)); if (s < 0) p.rotation.y = Math.PI; g.add(p); }
  } else if (c.kind === 'tanker'){
    flBox(g, 2.0, 2.4, W * .96, L / 2 - 1.0, .45 + 1.2, 0, white);
    flBox(g, .08, .9, W * .86, L / 2 + .01, 2.2, 0, gl);
    flBox(g, 2.01, .12, W * .97, L / 2 - 1.0, 1.3, 0, red);
    const tk = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, L - 2.6, 20), white); tk.rotation.z = Math.PI / 2; tk.position.set(-1.1, 1.85, 0); g.add(tk);
    const bd = new THREE.Mesh(new THREE.CylinderGeometry(1.01, 1.01, L - 2.7, 20, 1, true, Math.PI * .1, Math.PI * .3), red); bd.rotation.z = Math.PI / 2; bd.position.copy(tk.position); g.add(bd);
    flBox(g, L - 2.3, .3, W * .5, -1.1, .75, 0, dark);
  } else if (c.kind === 'crane'){
    flBox(g, 2.0, 2.4, W * .96, L / 2 - 1.0, .45 + 1.2, 0, white);
    flBox(g, 2.01, .12, W * .97, L / 2 - 1.0, 1.3, 0, red);
    flBox(g, L - 2.0, .9, W, -1.0, 1.0, 0, flMat(0xe2b23a));                                               // платформа
    flBox(g, 1.8, 1.0, 1.8, -L / 2 + 2.4, 1.95, 0, flMat(0xe2b23a));                                       // поворотная часть
    const bm = flBox(g, L - 1.2, .5, .55, .3, 2.7, 0, flMat(0xd9a52f)); bm.rotation.z = .05;                // стрела в транспортном положении
  } else if (c.kind === 'farm'){
    flBox(g, 2.0, 1.0, .9, .8, 1.15, 0, flMat(0x2f6fb5));                                                  // капот
    flBox(g, 1.4, 1.5, 1.3, -.7, 1.9, 0, flMat(0x2f6fb5)); flBox(g, 1.3, 1.0, 1.32, -.7, 2.1, 0, gl);
    flWheel(g, -1.0, W / 2 - .2, .75, .45); flWheel(g, -1.0, -W / 2 + .2, .75, .45); flWheel(g, 1.2, W / 2 - .15, .45, .3); flWheel(g, 1.2, -W / 2 + .15, .45, .3);
  } else if (c.kind === 'forklift'){
    const y = flMat(0xf2b705);
    flBox(g, 2.1, 1.0, W, -.35, .75, 0, y); flBox(g, .9, .6, W * .9, -1.1, 1.35, 0, flMat(0x2b2d2f));      // корпус и противовес
    for (const s of [1, -1]) flBox(g, .08, H - .1, .08, -.6, H / 2, s * W * .42, dark);                    // стойки кабины
    flBox(g, 1.3, .06, W, -.6, H, 0, dark);
    flBox(g, .12, H + .2, W * .55, .78, (H + .2) / 2, 0, dark);                                            // мачта
    for (const s of [1, -1]) flBox(g, 1.1, .05, .12, 1.4, .12, s * .3, flMat(0x55585b));                    // вилы
  }
  if (c.kind !== 'farm'){
    const car = /^(sedan|suv|suvbox|mpv)$/.test(c.kind);
    for (const x of wx) for (const s of [1, -1]) flWheel(g, x, s * (W / 2 - (c.kind === 'forklift' ? .15 : car ? .1 : .22)), r, c.kind === 'forklift' ? .25 : .26);
    if (L > 7 && c.kind !== 'bus') for (const s of [1, -1]) flWheel(g, -L * .33 + 1.15, s * (W / 2 - .22), r, .26);
  }
  g.traverse(o => { if (o.isMesh) o.userData = {kind:'car', car:c}; });
  return g;
}
function buildFleet(){
  gFleet.children.slice().forEach(o => { gFleet.remove(o); o.traverse(m => { if (m.isMesh && m.geometry && m.geometry !== FL.wg && !m.geometry.parameters) m.geometry.dispose(); }); });
  for (const c of (S.fleet || [])){
    const g = flCar(c); g.position.copy(V(c.x, c.y, gy(zat(c.x, c.y)) + .02)); g.rotation.y = c.hd * Math.PI / 180;
    gFleet.add(g); g.traverse(o => { if (o.isMesh) pickables.push(o); });
  }
}
// проверка снимками (как __t14): взгляд из точки на точку, местные метры и высота над землёй
window.__t14look = (ex, ey, eh, tx, ty, th) => flyTo(V(ex, ey, gy(zat(ex, ey)) + eh), V(tx, ty, gy(zat(tx, ty)) + th), 10);
// проверка места камеры по кадру (17.11.2026): после enterCamView ставит взгляд в точку x, y на высоте h, азимут az (по компасу), наклон tilt вниз
window.__t14pose = (x, y, h, az, tilt) => { const C = V(x, y, gy(zat(x, y)) + h), a = (90 - az) * Math.PI / 180, t = tilt * Math.PI / 180; tween = null; camera.position.copy(C); camera.up.set(0, 1, 0); camera.lookAt(C.clone().add(new THREE.Vector3(Math.cos(a) * Math.cos(t), -Math.sin(t), -Math.sin(a) * Math.cos(t)))); };
