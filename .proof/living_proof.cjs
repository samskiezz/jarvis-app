// Living-organism proof for server/jarvis_live.html — adapted from universe_proof.cjs.
// Verifies the 10 task claims HONESTLY against the running server at :8095 (no restart).
// Chromium + SwiftShader so WebGL actually runs headless.
const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';

(async () => {
  const browser = await chromium.launch({
    args: [
      '--no-sandbox',
      '--use-gl=swiftshader',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [], ttsNet = [];
  page.on('pageerror', e => pageErrors.push(String(e.message)));
  page.on('requestfinished', async req => {
    try { if (req.url().includes('/tts')) { const r = await req.response(); ttsNet.push('/tts -> ' + (r && r.status())); } } catch (e) {}
  });

  // (1) GET / loads
  const resp = await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
  const httpStatus = resp ? resp.status() : 0;

  // engage: a real pointerdown triggers initUniverse() under the autoplay gesture
  await page.waitForTimeout(900);
  await page.mouse.click(720, 450);
  await page.waitForTimeout(3800); // let render loop + graphdata constellation build

  // (2) WebGL render loop advances (renderer.info.render.frame climbs across a real interval)
  const renderAdvances = await page.evaluate(async () => {
    if (typeof renderer === 'undefined' || !renderer) return { ok: false, f0: -1, f1: -1 };
    const f0 = renderer.info.render.frame;
    await new Promise(r => setTimeout(r, 800));
    const f1 = renderer.info.render.frame;
    return { ok: f1 > f0, f0, f1 };
  });

  // (3) centre = beam-tube (cylinder mesh) + liquid-metal (chrome metalness=1 displaced icosphere),
  //     NOT just a static GLB orb. Inspect the actual scene graph objects.
  const centre = await page.evaluate(() => {
    const r = { beamGlowIsCylinder: false, beamCoreIsCylinder: false, liquidIsChrome: false,
                liquidDisplaces: false, fellBack: (typeof fellBack !== 'undefined') ? !!fellBack : null };
    try {
      // beam tube: beamGlow + beamCore are CylinderGeometry meshes
      if (typeof beamGlow !== 'undefined' && beamGlow && beamGlow.geometry)
        r.beamGlowIsCylinder = beamGlow.geometry.type === 'CylinderGeometry';
      if (typeof beamCore !== 'undefined' && beamCore && beamCore.geometry)
        r.beamCoreIsCylinder = beamCore.geometry.type === 'CylinderGeometry';
      // liquid metal: chrome PBR (metalness ~1, low roughness) on a dense icosphere
      if (typeof liquid !== 'undefined' && liquid && liquid.material) {
        const mm = liquid.material;
        r.liquidIsChrome = (mm.metalness >= 0.9 && mm.roughness <= 0.2);
        r.liquidGeoType = liquid.geometry && liquid.geometry.type;
        r.liquidVerts = liquid.geometry && liquid.geometry.attributes.position.count;
        r.liquidMetalness = mm.metalness; r.liquidRoughness = mm.roughness;
      }
      // displacement proof: morph once and confirm a vertex actually moves from rest pose
      if (typeof morphLiquid === 'function' && typeof liquid !== 'undefined' && liquid &&
          typeof liquidGeoBase !== 'undefined' && liquidGeoBase && liquidGeoBase.userData.orig) {
        const pos = liquid.geometry.attributes.position, orig = liquidGeoBase.userData.orig;
        const i = 30;
        const before = [pos.getX(i), pos.getY(i), pos.getZ(i)];
        // force a churn so displacement is non-trivial
        if (typeof PULSE !== 'undefined') { PULSE.flow += 1.7; PULSE.speak = 0.8; PULSE.spike = 0.6; PULSE.amp = 0.9; }
        morphLiquid(0.016);
        const after = [pos.getX(i), pos.getY(i), pos.getZ(i)];
        const restMoved = Math.hypot(after[0]-orig[i*3], after[1]-orig[i*3+1], after[2]-orig[i*3+2]);
        r.liquidDisplaces = restMoved > 0.01;
        r.vertexDelta = +restMoved.toFixed(3);
      }
    } catch (e) { r.err = String(e); }
    return r;
  });

  // (4) ONE shared pulse drives MULTIPLE elements together: capture quiet baselines, then simulate
  //     speaking (drive the speaking state + amp), and confirm centre (beam uAmp / liquid scale),
  //     planet scale, grid intensity, and bloom strength all move from the SAME pulse.
  const pulse = await page.evaluate(async () => {
    const out = { ok: false };
    try {
      // QUIET frame: zero out external amp + speaking, let one frame settle
      window.setAmp && window.setAmp(0);
      document.body.classList.remove('speaking');
      if (typeof spkAmp !== 'undefined') spkAmp = 0;
      await new Promise(r => requestAnimationFrame(r));
      await new Promise(r => requestAnimationFrame(r));
      const b0 = bodies[0];
      const quiet = {
        bodyScale: b0 ? b0.scale.x : 0,
        gridAmp: (typeof gridMat !== 'undefined' && gridMat) ? gridMat.uniforms.uAmp.value : 0,
        beamAmp: (typeof beamMat !== 'undefined' && beamMat) ? beamMat.uniforms.uAmp.value : 0,
        bloom: (typeof bloom !== 'undefined' && bloom) ? bloom.strength : 0,
        pulseAmp: (typeof PULSE !== 'undefined') ? PULSE.amp : 0,
      };
      // SPEAK: drive the ONE input the whole organism reads (preferred public hook = setAmp,
      // plus set the real speaking state so currentAmp's TTS branch + spkAmp engage)
      document.body.classList.add('speaking');
      if (typeof speakStart === 'function') speakStart();
      window.setAmp && window.setAmp(1.0);
      if (typeof spkAmp !== 'undefined') spkAmp = 1.0;
      window.firePulseSpike && window.firePulseSpike(1.0);
      // run several frames so updatePulse + all subscribers integrate the new amp
      for (let k = 0; k < 8; k++) { await new Promise(r => requestAnimationFrame(r)); }
      const b1 = bodies[0];
      const loud = {
        bodyScale: b1 ? b1.scale.x : 0,
        gridAmp: (typeof gridMat !== 'undefined' && gridMat) ? gridMat.uniforms.uAmp.value : 0,
        beamAmp: (typeof beamMat !== 'undefined' && beamMat) ? beamMat.uniforms.uAmp.value : 0,
        bloom: (typeof bloom !== 'undefined' && bloom) ? bloom.strength : 0,
        pulseAmp: (typeof PULSE !== 'undefined') ? PULSE.amp : 0,
      };
      // clean up so we don't leave the page "speaking"
      document.body.classList.remove('speaking');
      window.setAmp && window.setAmp(0);
      if (typeof spkAmp !== 'undefined') spkAmp = 0;

      const d = {
        body:  loud.bodyScale - quiet.bodyScale,
        grid:  loud.gridAmp   - quiet.gridAmp,
        beam:  loud.beamAmp   - quiet.beamAmp,
        bloom: loud.bloom     - quiet.bloom,
        pulse: loud.pulseAmp  - quiet.pulseAmp,
      };
      out.quiet = quiet; out.loud = loud; out.delta = d;
      out.bodyUp = d.body > 0.001; out.gridUp = d.grid > 0.001;
      out.beamUp = d.beam > 0.001; out.bloomUp = d.bloom > 0.001;
      // "together" = at least 3 distinct subscribers (centre + planet + grid/bloom) all rose from one input
      const movers = [out.bodyUp, out.gridUp, out.beamUp, out.bloomUp].filter(Boolean).length;
      out.moversUp = movers;
      out.ok = out.bodyUp && (out.beamUp || out.gridUp) && out.bloomUp && movers >= 3;
    } catch (e) { out.err = String(e); }
    return out;
  });

  // (5) dock present in DOM with items
  const dock = await page.evaluate(() => {
    const d = document.getElementById('dock');
    return { present: !!d, items: d ? d.querySelectorAll('.di').length : 0 };
  });

  // (6) caption bubble appears on speech: invoke the real showCrystal path (what speakStart/bubble call)
  const caption = await page.evaluate(async () => {
    const c = document.getElementById('crystal');
    if (!c || typeof showCrystal !== 'function') return { present: !!c, shows: false };
    showCrystal('Systems nominal, sir.');
    await new Promise(r => setTimeout(r, 80));
    const shown = c.classList.contains('show') && (c.textContent || '').length > 0;
    return { present: true, shows: shown, text: c.textContent };
  });

  // (7) composer chain: RenderPass + UnrealBloomPass + SMAAPass present, ACES tone-mapping on renderer
  const composerInfo = await page.evaluate(() => {
    const r = { passes: [], hasBloom: false, hasSMAA: false, hasRenderPass: false, aces: false, srgb: false };
    try {
      if (typeof composer !== 'undefined' && composer && composer.passes) {
        r.passes = composer.passes.map(p => p.constructor && p.constructor.name);
        r.hasBloom = !!(typeof bloom !== 'undefined' && bloom);
        r.hasSMAA = !!(typeof smaa !== 'undefined' && smaa);
        r.hasRenderPass = r.passes.some(n => /RenderPass/.test(n));
      }
      if (typeof renderer !== 'undefined' && renderer && typeof THREE !== 'undefined') {
        r.aces = renderer.toneMapping === THREE.ACESFilmicToneMapping;
        r.toneMapping = renderer.toneMapping;
        r.srgb = renderer.outputEncoding === THREE.sRGBEncoding;
      }
    } catch (e) { r.err = String(e); }
    return r;
  });

  // (8) a control is callable: hit /control_all?action=pause (real server route) and read the JSON
  const control = await page.evaluate(async () => {
    try {
      const tok = (typeof CT !== 'undefined') ? CT : '';
      const r = await fetch('control_all?action=pause&token=' + encodeURIComponent(tok), { method: 'POST' });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      return { status: r.status, ok: r.ok, body: (j != null) ? j : txt.slice(0, 200),
               fnExists: typeof cmdAll === 'function' };
    } catch (e) { return { status: 0, ok: false, err: String(e) }; }
  });

  await page.close(); await ctx.close(); await browser.close();

  const out = { httpStatus, pageErrors, renderAdvances, centre, pulse, dock, caption, composer: composerInfo, control, ttsNet };
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('PROOF_ERROR', e); process.exit(1); });
