// Targeted proof of the 4 FINDINGS fixes in server/jarvis_live.html:
//  (1) search-to-fly matches the VISIBLE label (not just internal id)
//  (2) constellation graph stars are click-to-select + closeCard flies home for them
//  (3) drill (/detail) survives a live /metrics refresh (no wipe)
//  (4) base href makes paths mount-agnostic
const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args: [
    '--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist',
    '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required' ] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e.message)));
  await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.mouse.click(720, 450);
  await page.waitForTimeout(3500);
  // ensure a metrics tick has populated the bodies (the periodic interval may not have fired in-window)
  await page.evaluate(async () => {
    if ((typeof bodies==='undefined' || !bodies.length) && typeof tick==='function') {
      const m = await (await fetch('metrics?_='+Date.now())).json(); layoutFromMetrics(m);
    }
  });
  await page.waitForTimeout(300);

  // (1) search by the VISIBLE label text, not the id. 'Correlation' is shown for body id 'sys:corr',
  //     'Docs' for 'kpi:Document', 'VPS' for 'infra:vps'. The OLD code only matched ids → these failed.
  const search = await page.evaluate(() => {
    const trial = (q) => { closeCard(); flyToQuery(q);
      const el = document.getElementById('card');
      return { q, open: el.classList.contains('open'), title: (el.querySelector('.t')||{}).textContent,
               selectedName: (typeof _selected!=='undefined' && _selected) ? _selected.userData.name : null }; };
    return ['Correlation','Docs','VPS','Build'].map(trial);
  });

  // (2) constellation graph star is clickable AND closeCard returns the camera home
  const node = await page.evaluate(async () => {
    if (typeof _constellation==='undefined' || !_constellation) return { ok:false, why:'no constellation' };
    closeCard(); await new Promise(r=>setTimeout(r,400));
    const homeBefore = camera.position.clone();
    const ok = selectNode(0);               // select first graph star directly
    const el = document.getElementById('card');
    const cardOpen = el.classList.contains('open');
    await new Promise(r=>setTimeout(r,1000)); // let the tween fly to the node
    const atNode = camera.position.clone();
    const moved = atNode.distanceTo(homeBefore) > 1;
    // now close → must fly home (the bug: graph cards did NOT, because _selected was null)
    closeCard();
    await new Promise(r=>setTimeout(r,1100)); // let fly-home tween finish
    const afterClose = camera.position.clone();
    const camReturnedHome = afterClose.distanceTo(homeBefore) < atNode.distanceTo(homeBefore) - 1;
    // raycast a real click onto the instanced graph star (geometry-accurate)
    closeCard(); await new Promise(r=>setTimeout(r,1100));
    let rayHitGraph=false, rayTitle='';
    const i = 0; const p = _constellation.pos[i].clone().project(camera);
    const sx=(p.x*0.5+0.5)*window.innerWidth, sy=(-p.y*0.5+0.5)*window.innerHeight;
    onCanvasClick({clientX:sx, clientY:sy});
    const el2 = document.getElementById('card');
    rayHitGraph = el2.classList.contains('open');
    rayTitle = (el2.querySelector('.t')||{}).textContent;
    return { ok, cardOpen, moved, camReturnedHome, rayHitGraph, rayTitle };
  });

  // (3) drill survives a live refresh: select a KPI body, run its drill action, simulate two /metrics ticks
  const drill = await page.evaluate(async () => {
    closeCard(); await new Promise(r=>setTimeout(r,300));
    const b = bodyMap.get('kpi:Topic'); if(!b) return { ok:false, why:'no kpi:Topic' };
    selectBody(b);
    // openDetail fills the SAME card with a /detail drill
    await openDetail('type','Topic');
    const drilledTitle = (document.getElementById('card').querySelector('.t')||{}).textContent;
    // simulate the live refresh that previously WIPED the drill
    if (b.userData.refresh) { b.userData.refresh(); b.userData.refresh(); }
    const afterTitle = (document.getElementById('card').querySelector('.t')||{}).textContent;
    const drilledHasContent = (document.getElementById('card').querySelector('.props').innerHTML.length
                               + document.getElementById('card').querySelector('.lines').innerHTML.length) > 0;
    return { ok:true, drilledTitle, afterTitle, survived: drilledTitle===afterTitle && drilledHasContent, _cardDrilled:_cardDrilled };
  });

  // (4) base href resolves all relative requests to /
  const base = await page.evaluate(() => {
    const r = new URL('asset/x.glb', document.baseURI).href;
    const r2 = new URL('metrics?_=1', document.baseURI).href;
    return { baseURI: document.baseURI, assetResolves: r, metricsResolves: r2 };
  });

  await page.close(); await ctx.close(); await browser.close();
  console.log(JSON.stringify({ search, node, drill, base, pageErrors }, null, 2));
})().catch(e => { console.error('PROOF_ERROR', e); process.exit(1); });
