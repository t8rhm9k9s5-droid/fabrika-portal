/* ---- 3D: свет и материалы как в жизни (16.11.2026, Т. В.: «подними уровень детализации 3D-карты до того же уровня, что и в модели дома,
   можно даже немножко лучше, чтобы все нюансы было видно») — этап 1 из 4.
   • цвет как у фотоаппарата: свет считается в линейных единицах → плёночная кривая ACES → sRGB (все цвета модели переводятся из sRGB один раз);
   • физические материалы (MeshStandardMaterial) вместо матовых Ламберта: шероховатость, блики, стекло;
   • освещение от неба: карта окружения (PMREM) из цвета неба и земли, обновляется вместе со временем суток и погодой;
   • резкие тени у камеры: теневая камера солнца — вокруг точки, куда смотрим (чем ближе, тем резче), а не на всю площадку.
   Только на качестве «Высокое» (T14Perf); на слабых устройствах модель — как раньше. */
;(function(){
  // 16.11.2026, Т. В.: «давай на портал сразу» — включено у всех (только «Высокое» качество); ?pbr=0 в адресе — выключить на этом устройстве, ?pbr=1 — включить.
  let on = false;
  try {
    const q = new URLSearchParams(location.search).get('pbr'); if (q === '1' || q === '0') localStorage.setItem('t14.pbr', q);
    const st = localStorage.getItem('t14.pbr');
    on = st !== '0';   // 16.11.2026, Т. В.: «давай на портал сразу» — у всех на «Высоком» качестве; ?pbr=0 — выключить на устройстве
  } catch (e) { }
  if (!on) return;
  const PF = window.T14Perf; if (PF && PF.level && PF.level() !== 'high') return;
  if (!THREE.PMREMGenerator || !THREE.MeshStandardMaterial || !THREE.sRGBEncoding) return;
  const hemi = scene.children.find(o => o.isHemisphereLight), sunL = scene.children.find(o => o.isDirectionalLight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = .8;
  window.__t14pbr = true;

  // ---------- цвета: sRGB → линейные, один раз на каждый объект ----------
  const doneM = new WeakSet(), doneA = new WeakSet(), doneT = new WeakSet();
  const lin = c => { if (c && c.isColor) c.convertSRGBToLinear(); };
  function texIn(t){ if (t && t.isTexture && !doneT.has(t)) { doneT.add(t); t.encoding = THREE.sRGBEncoding; t.needsUpdate = true; } }
  // 16.11.2026 (Т. В.: «почему линии коммуникаций… прерываются»): прежний код и после замены материалов меняет их сам —
  // прозрачная земля, стены цеха, подсветка выбранного, «рельеф цветом». Всё это переносится сюда каждый кадр (watch ниже).
  const syncs = [], crec = [], vrec = [];
  function vconv(a){
    const arr = a.array, n = arr.length, k = a.normalized || arr instanceof Uint8Array ? 255 : 1;
    for (let i = 0; i < n; i++) { const v = arr[i] / k; const l = v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); arr[i] = k === 1 ? l : Math.round(l * k); }
    a.needsUpdate = true;
  }
  function vcolIn(g){
    const a = g && g.attributes && g.attributes.color; if (!a || doneA.has(a)) return; doneA.add(a);
    vconv(a); vrec.push({ a, ver: a.version });
  }
  function remember(m){ const r = { m, c: m.color && m.color.isColor ? m.color.clone() : null, e: m.emissive && m.emissive.isColor ? m.emissive.clone() : null }; m.__t14c = r; crec.push(r); }
  const GLASS = m => m.transparent && m.opacity < .7;
  function upgrade(m){
    if (m.isMeshLambertMaterial || m.isMeshPhongMaterial) {
      const s = new THREE.MeshStandardMaterial({ color: m.color, map: m.map || null, vertexColors: m.vertexColors, transparent: m.transparent, opacity: m.opacity,
        side: m.side, depthWrite: m.depthWrite, depthTest: m.depthTest, alphaTest: m.alphaTest, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor,
        polygonOffsetUnits: m.polygonOffsetUnits, emissive: m.emissive || new THREE.Color(0), emissiveMap: m.emissiveMap || null, visible: m.visible, fog: m.fog });
      s.name = m.name; s.userData = m.userData;
      if (GLASS(m)) { s.roughness = .12; s.metalness = 0; s.envMapIntensity = 1; }       // стекло, прозрачные кровли — блик неба
      else { s.roughness = .82; s.metalness = 0; s.envMapIntensity = .45; }                  // стены, кровли, асфальт — матовые
      return s;
    }
    return m;
  }
  function prep(o, terr){
    if (!o.material) return;
    if (o.userData && o.userData.__batch) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m && doneM.add(m)); if (o.geometry && o.geometry.attributes.color) doneA.add(o.geometry.attributes.color); return; }   // склейка (batch_part): цвета уже линейные
    const many = Array.isArray(o.material), list = many ? o.material : [o.material];
    let out = list;
    if (o.isMesh) out = list.map(m => { if (!m || doneM.has(m)) return m; const u = upgrade(m); if (terr && u.isMeshStandardMaterial) { u.roughness = 1; u.envMapIntensity = .3; } return u; });
    out.forEach(m => { if (!m || doneM.has(m)) return; doneM.add(m); lin(m.color); lin(m.emissive); texIn(m.map); texIn(m.emissiveMap); m.needsUpdate = true; remember(m); });
    if (o.isMesh || o.isLine || o.isPoints) vcolIn(o.geometry);
    if (o.isMesh && out !== list) o.material = many ? out : out[0];
  }
  // общий материал разделяют сотни сеток: новый — один на старый
  const swap = new Map(), upgrade0 = upgrade;
  upgrade = function (m) { if (swap.has(m)) return swap.get(m); const u = upgrade0(m); swap.set(m, u);
    if (u !== m) syncs.push({ o: m, n: u, op: m.opacity, tr: m.transparent, dw: m.depthWrite, dt: m.depthTest, vis: m.visible, side: m.side, ver: m.version,
      c: m.color ? m.color.getHex() : -1, e: m.emissive ? m.emissive.getHex() : -1 });
    return u; };
  let lastN = -1, scanT = 0;
  window.__t14pbrPrep = function (top) { const ter = scene.getObjectByName('terrain'), terSet = new Set(); if (ter) ter.traverse(o => terSet.add(o)); top.traverse(o => prep(o, terSet.has(o))); };
  function scan(now){
    if (now - scanT < 900) return; scanT = now;
    let n = 0; scene.traverse(() => { n++; }); if (n === lastN) return; lastN = n;
    const ter = scene.getObjectByName('terrain'), terSet = new Set(); if (ter) ter.traverse(o => terSet.add(o));
    scene.traverse(o => prep(o, terSet.has(o)));
    // что ушло из сцены при перестройке — больше не отслеживаем
    const usedM = new Set(), usedA = new Set();
    scene.traverse(o => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach(x => x && usedM.add(x)); const a = o.geometry && o.geometry.attributes && o.geometry.attributes.color; if (a) usedA.add(a); });
    const keep = (arr, f) => { let j = 0; for (let i = 0; i < arr.length; i++) if (f(arr[i])) arr[j++] = arr[i]; arr.length = j; };
    keep(syncs, s => usedM.has(s.n)); keep(crec, r => usedM.has(r.m)); keep(vrec, r => usedA.has(r.a));
    swap.forEach((u, m) => { if (!usedM.has(u)) swap.delete(m); });
    renderer.shadowMap.needsUpdate = true;
  }
  // перенос изменений: прежний материал → физический; цвет, заданный кодом в sRGB, → в линейный
  function watch(){
    for (let i = 0; i < syncs.length; i++) { const s = syncs[i], o = s.o, n = s.n;
      if (o.opacity !== s.op) { s.op = o.opacity; n.opacity = o.opacity; }
      if (o.transparent !== s.tr) { s.tr = o.transparent; n.transparent = o.transparent; n.needsUpdate = true; }
      if (o.depthWrite !== s.dw) { s.dw = o.depthWrite; n.depthWrite = o.depthWrite; }
      if (o.depthTest !== s.dt) { s.dt = o.depthTest; n.depthTest = o.depthTest; }
      if (o.visible !== s.vis) { s.vis = o.visible; n.visible = o.visible; }
      if (o.side !== s.side) { s.side = o.side; n.side = o.side; n.needsUpdate = true; }
      if (o.version !== s.ver) { s.ver = o.version; n.needsUpdate = true; }
      if (o.color && o.color.getHex() !== s.c) { s.c = o.color.getHex(); n.color.copy(o.color).convertSRGBToLinear(); if (n.__t14c && n.__t14c.c) n.__t14c.c.copy(n.color); }
      if (o.emissive && n.emissive && o.emissive.getHex() !== s.e) { s.e = o.emissive.getHex(); n.emissive.copy(o.emissive).convertSRGBToLinear(); if (n.__t14c && n.__t14c.e) n.__t14c.e.copy(n.emissive); }
    }
    for (let i = 0; i < crec.length; i++) { const r = crec[i], m = r.m;
      if (r.c && !m.color.equals(r.c)) { m.color.convertSRGBToLinear(); r.c.copy(m.color); }
      if (r.e && m.emissive && !m.emissive.equals(r.e)) { m.emissive.convertSRGBToLinear(); r.e.copy(m.emissive); }
    }
    for (let i = 0; i < vrec.length; i++) { const r = vrec[i]; if (r.a.version !== r.ver) { vconv(r.a); r.ver = r.a.version; } }   // «рельеф цветом», слои: цвета земли записаны заново
  }

  // ---------- свет неба: цвета, которые меняет время суток (sky_part), — в линейные, когда они сменились ----------
  const seen = new Map();   // объект Color → последнее записанное нами линейное значение
  function liveColor(c){ if (!c || !c.isColor) return; const s = seen.get(c); if (s && s.equals(c)) return; c.convertSRGBToLinear(); seen.set(c, c.clone()); }
  let hiSet = -1;
  function liveLights(){
    if (hemi) { liveColor(hemi.color); liveColor(hemi.groundColor); if (hemi.intensity !== hiSet) { hemi.intensity *= .55; hiSet = hemi.intensity; } }   // небо светит картой окружения — заливка слабее
    if (sunL) liveColor(sunL.color);
    if (scene.background && scene.background.isColor) liveColor(scene.background);
    if (scene.fog && scene.fog.color) liveColor(scene.fog.color);
  }

  // ---------- окружение: полусфера «небо — горизонт — земля» в карту отражений (PMREM) ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envGeo = new THREE.SphereGeometry(100, 32, 16), envCol = new Float32Array(envGeo.attributes.position.count * 3);
  envGeo.setAttribute('color', new THREE.BufferAttribute(envCol, 3));
  const envMesh = new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false }));
  const envScene = new THREE.Scene(); envScene.add(envMesh);
  let envRT = null, envSig = '', envT = 0;
  function envUpdate(now){
    if (now - envT < 4000) return; envT = now;
    const top = scene.background && scene.background.isColor ? scene.background : new THREE.Color(.6, .7, .8);
    const gnd = hemi ? hemi.groundColor : new THREE.Color(.2, .2, .18), sky = hemi ? hemi.color : top;
    const sig = top.getHexString() + gnd.getHexString() + sky.getHexString(); if (sig === envSig) return; envSig = sig;
    const p = envGeo.attributes.position, c = new THREE.Color(), hz = top.clone().lerp(new THREE.Color(1, 1, 1), .25);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 100;
      if (y >= 0) c.copy(hz).lerp(sky.clone().lerp(top, .5), Math.pow(y, .6)); else c.copy(hz).lerp(gnd, Math.min(1, -y * 3));
      envCol[i * 3] = c.r; envCol[i * 3 + 1] = c.g; envCol[i * 3 + 2] = c.b;
    }
    envGeo.attributes.color.needsUpdate = true;
    const rt = pmrem.fromScene(envScene, .04);
    scene.environment = rt.texture; if (envRT) envRT.dispose(); envRT = rt;
  }

  // ---------- тени у камеры: теневая камера солнца — вокруг точки, куда смотрим ----------
  const R0 = (function () { try { const hx = (S.extent.x1 - S.extent.x0) / 2, hy = (S.extent.y1 - S.extent.y0) / 2; return Math.hypot(hx, hy) + 40; } catch (e) { return 600; } })();
  let sunDir = sunL ? sunL.position.clone().normalize() : null, lastPos = null, fitR = 0, fitC = new THREE.Vector3(1e9, 0, 0);
  if (sunL) { scene.add(sunL.target); }
  function shadowFit(){
    if (!sunL || !sunL.castShadow || !renderer.shadowMap.enabled) return;
    if (!lastPos || !lastPos.equals(sunL.position)) sunDir = sunL.position.clone().normalize();   // солнце передвинул sky_part — новое направление
    const tg = controls.target, d = camera.position.distanceTo(tg), R = Math.min(R0, Math.max(45, d * .95 + 25));
    const moved = fitC.distanceTo(tg) > R * .12 || Math.abs(R - fitR) > fitR * .15;
    if (moved) {
      fitR = R; fitC.copy(tg);
      const sc = sunL.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 1; sc.far = 3000; sc.updateProjectionMatrix();
      const tex = 2 * R / (sunL.shadow.mapSize.x || 2048);
      sunL.shadow.bias = -0.0004; if ('normalBias' in sunL.shadow) sunL.shadow.normalBias = Math.max(.02, tex * 1.6);
      renderer.shadowMap.needsUpdate = true;
    }
    sunL.target.position.copy(fitC); sunL.target.updateMatrixWorld();
    sunL.position.copy(fitC).addScaledVector(sunDir, 1200); lastPos = sunL.position.clone();
  }

  // ---------- перед каждым кадром ----------
  const _render = renderer.render.bind(renderer);
  renderer.render = function (sc, cam) {
    if (sc === scene) { const now = performance.now(); try { scan(now); watch(); liveLights(); envUpdate(now); shadowFit(); } catch (e) { console.warn('pbr', e); } }
    return _render(sc, cam);
  };
})();
