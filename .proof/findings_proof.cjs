// Proof for the three FINDINGS fixes in server/jarvis_live.html (run against the live server, no restart).
//  F1: jarvisSpeak() raises the crystal caption for JARVIS's OWN spoken lines (greeting/status/etc),
//      not only chat replies — and speakEnd() fades it.
//  F2: the dock no longer overlaps the centred talk bar / coreSay (no DOM-rect collision), and it hides
//      while a fullscreen overlay is open.
//  F3: functional/runner bodies (pipelines/infra/sys/tiers) are now LARGER than KPI minor datapoints and
//      GROW when their underlying data changes (resizeBody rebuilds the geometry).
const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport:{width:1440,height:900} })).newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(B+'/', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(900);
  await page.mouse.click(720,450);            // engage
  await page.waitForTimeout(3800);            // render loop + bodies + constellation

  // ---- F1: jarvisSpeak raises the crystal with the spoken text ----
  const f1 = await page.evaluate(async () => {
    const c = document.getElementById('crystal');
    c.classList.remove('show'); c.textContent='';
    jarvisSpeak('Systems nominal, sir.');                 // a JARVIS-own line (NOT chat/mic)
    await new Promise(r=>setTimeout(r,120));
    const shownDuringSpeech = c.classList.contains('show') && (c.textContent||'').includes('Systems nominal');
    // speakEnd should schedule the fade
    if (typeof speakEnd==='function') speakEnd();
    await new Promise(r=>setTimeout(r,1100));
    const hiddenAfter = !c.classList.contains('show');
    return { shownDuringSpeech, hiddenAfter, text:c.textContent };
  });

  // ---- F2: dock does not overlap the talk bar / coreSay; hides on overlay ----
  const f2 = await page.evaluate(async () => {
    const rect = id => { const e=document.getElementById(id); if(!e) return null; const r=e.getBoundingClientRect(); return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height}; };
    const overlap = (a,b)=> a&&b && a.l<b.r && a.r>b.l && a.t<b.b && a.b>b.t;
    const dock=rect('dock'), cmd=rect('cmd'), core=rect('coreSay');
    const before = { dockVsCmd: overlap(dock,cmd), dockVsCore: overlap(dock,core), dock, cmd };
    // open an overlay and confirm the dock hides
    setMode('library');
    await new Promise(r=>setTimeout(r,360));
    const hiddenOnOverlay = document.getElementById('dock').classList.contains('hidden');
    setMode('live');
    await new Promise(r=>setTimeout(r,360));
    const restoredOnLive = !document.getElementById('dock').classList.contains('hidden');
    return Object.assign(before, { hiddenOnOverlay, restoredOnLive });
  });

  // ---- F3: functions are bigger than KPI minor datapoints + GROW on data change ----
  const f3 = await page.evaluate(async () => {
    const r = (n)=>{ const b=bodyMap.get(n); return b? b.userData.baseScale : null; };
    // a representative online pipeline (function/runner)
    const pipeNames = [...bodyMap.keys()].filter(k=>k.startsWith('pipe:'));
    const onlinePipe = pipeNames.find(n=>{ const b=bodyMap.get(n); return b && b.material.color.getHex()===0x34d399; }) || pipeNames[0];
    const kpiMinor = ['kpi:Measurement','kpi:Document','kpi:Note'].map(r).filter(v=>v!=null);
    const out = {
      pipeBase: r(onlinePipe),
      vastBase: r('infra:vast'), vpsBase: r('infra:vps'),
      corrBase: r('sys:corr'), routerBase: r('sys:router'),
      kpiMinorMax: kpiMinor.length? Math.max(...kpiMinor) : null,
      onlinePipe,
    };
    out.functionsBiggerThanKpiMinor = (out.pipeBase!=null && out.kpiMinorMax!=null) ? out.pipeBase > out.kpiMinorMax : null;

    // GROWTH proof: feed a metrics object where one pipeline's CPU jumped, confirm the body geometry grows.
    const m = JSON.parse(JSON.stringify(_m||{}));
    const target = (m.workers||[]).find(w=>w.toggleable && w.status==='online') || (m.workers||[]).find(w=>w.toggleable);
    let grew=null;
    if (target) {
      const name='pipe:'+target.name;
      const b=bodyMap.get(name); const sz0=b? b.userData.baseScale:0;
      // simulate a busy spike
      m.workers = m.workers.map(w=> w.name===target.name ? Object.assign({},w,{status:'online',cpu:95,mem_mb:1800}) : w);
      layoutFromMetrics(m);
      const sz1=bodyMap.get(name).userData.baseScale;
      grew = { name, sz0, sz1, grew: sz1>sz0 };
    }
    out.growth = grew;
    return out;
  });

  await browser.close();
  const F1_PASS = f1.shownDuringSpeech && f1.hiddenAfter;
  const F2_PASS = f2.dockVsCmd===false && f2.dockVsCore===false && f2.hiddenOnOverlay && f2.restoredOnLive;
  const F3_PASS = f3.functionsBiggerThanKpiMinor===true && f3.growth && f3.growth.grew===true;
  console.log(JSON.stringify({ F1:f1, F2:f2, F3:f3, verdict:{F1_PASS,F2_PASS,F3_PASS}, pageErrors:errs }, null, 2));
})().catch(e=>{console.error('ERR',e);process.exit(1);});
