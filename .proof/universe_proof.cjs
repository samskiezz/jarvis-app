// Headless proof of the ONE immersive WebGL universe (NASA-Eyes concept) for JARVIS.
// Launches chromium with SwiftShader so WebGL actually runs headless.
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

  // engage: dispatch a real pointerdown to trigger initUniverse() under the autoplay gesture
  await page.waitForTimeout(900);
  await page.mouse.click(720, 450); // empty-space click also acts as the boot gesture
  // wait for the render loop + graphdata constellation to build
  await page.waitForTimeout(3500);

  // (2) WebGL canvas exists + render loop runs (no throw)
  // NOTE: scene/bodies/camera/_constellation are top-level `let` in the page realm — readable by
  // bare identifier inside page.evaluate (NOT via window.). uniReady/renderer likewise.
  const gl = await page.evaluate(() => {
    const c = document.getElementById('uni');
    const hasCanvas = !!c && c.tagName === 'CANVAS';
    let ctxOk = false, glVendor = '';
    try {
      const g = c.getContext('webgl2') || c.getContext('webgl');
      ctxOk = !!g;
      if (g) { const dbg = g.getExtension('WEBGL_debug_renderer_info'); glVendor = dbg ? g.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : (g.getParameter(g.VERSION) || ''); }
    } catch (e) {}
    return {
      hasCanvas, ctxOk, glVendor,
      uniReady: (typeof uniReady !== 'undefined') ? !!uniReady : false,
      hasRenderer: (typeof renderer !== 'undefined') ? !!renderer : false,
      bodyCount: (typeof bodies !== 'undefined' ? bodies : []).length,
      sceneChildren: (typeof scene !== 'undefined' && scene) ? scene.children.length : 0,
      canvasW: c ? c.width : 0, canvasH: c ? c.height : 0,
    };
  });

  // render loop is genuinely advancing: read renderer.info.render.frame across a real interval
  const renderAdvances = await page.evaluate(async () => {
    if (typeof renderer === 'undefined' || !renderer) return false;
    const f0 = renderer.info.render.frame;
    await new Promise(r => setTimeout(r, 700));
    const f1 = renderer.info.render.frame;
    return f1 > f0; // frames keep rendering => render loop is live and not throwing
  });

  // (3) data bodies/nodes bound to live endpoints
  const data = await page.evaluate(async () => {
    const m = await (await fetch('metrics?_=' + Date.now())).json();
    const g = await (await fetch('graphdata')).json();
    const B = (typeof bodies !== 'undefined') ? bodies : [];
    return {
      bodyCount: B.length,
      bodyNames: B.map(b => b.userData.name).slice(0, 40),
      constellationNodes: (typeof _constellation !== 'undefined' && _constellation) ? _constellation.nodes.length : 0,
      metricsPct: (m.completion || {}).pct,
      metricsWorkers: (m.workers || []).length,
      graphNodes: (g.nodes || []).length,
      graphEdges: (g.edges || []).length,
    };
  });

  // (4) clicking a body opens ONE contextual info card — invoke the real select path on a known body
  const card = await page.evaluate(() => {
    // pick a deterministic always-present body (Guardian) and run the real selectBody()
    const BM = (typeof bodyMap !== 'undefined') ? bodyMap : null;
    const B = (typeof bodies !== 'undefined') ? bodies : [];
    const target = BM && (BM.get('guardian') || B[0]);
    if (!target) return { ok: false, why: 'no body to select' };
    selectBody(target);
    const el = document.getElementById('card');
    return {
      ok: !!el && el.classList.contains('open'),
      title: el ? (el.querySelector('.t') || {}).textContent : '',
      // how many card-like panels are open simultaneously (should be exactly 1)
      openCards: document.querySelectorAll('#card.open').length,
    };
  });

  // also prove a genuine canvas raycast click resolves to a body (geometry-accurate)
  const rayClick = await page.evaluate(() => {
    if (typeof camera === 'undefined' || !camera || typeof bodyMap === 'undefined') return { hit: false };
    const b = bodyMap.get('guardian') || bodies[0];
    // project body world pos to screen, synth a click there
    const v = b.position.clone().project(camera);
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    closeCard();
    onCanvasClick({ clientX: x, clientY: y });
    const el = document.getElementById('card');
    return { hit: !!el && el.classList.contains('open'), x: Math.round(x), y: Math.round(y), title: el ? (el.querySelector('.t') || {}).textContent : '' };
  });

  // (5) minimal HUD — no permanent multi-tab side columns
  const hud = await page.evaluate(() => {
    // count fixed-position elements that look like permanent side rails
    const all = [...document.querySelectorAll('body *')];
    const sideRails = all.filter(e => {
      const s = getComputedStyle(e);
      if (s.position !== 'fixed') return false;
      const r = e.getBoundingClientRect();
      const tall = r.height > window.innerHeight * 0.6;
      const narrowSide = r.width < window.innerWidth * 0.35 && (r.left < 8 || r.right > window.innerWidth - 8);
      const visible = s.display !== 'none' && s.opacity !== '0' && r.width > 40;
      return tall && narrowSide && visible && e.id !== 'card';
    }).map(e => e.id || e.className);
    return {
      topBar: !!document.getElementById('top'),
      cmdBar: !!document.getElementById('cmd'),
      permanentSideRails: sideRails,
      // tab-like nav clusters
      navTabs: document.querySelectorAll('nav,[role=tablist]').length,
    };
  });

  await page.close(); await ctx.close(); await browser.close();

  const out = { httpStatus, gl, renderAdvances, data, card, rayClick, hud, ttsNet, pageErrors };
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('PROOF_ERROR', e); process.exit(1); });
