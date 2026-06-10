const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  const pageErrors = [], consoleErrors = [], failed = [];
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('console', m => { if (m.type()==='error') consoleErrors.push(m.text()); });
  page.on('requestfailed', r => { const u=r.url(); if(!/favicon/.test(u)) failed.push(u+' :: '+(r.failure()&&r.failure().errorText)); });

  await page.goto(B+'/', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(800);
  await page.mouse.click(720,450);            // engage the universe (user gesture)
  await page.waitForTimeout(4500);            // let GLBs load + a few frames render + metrics tick

  const probe = await page.evaluate(()=>{
    const passes = (typeof composer!=='undefined'&&composer)?composer.passes.map(p=>p.constructor.name):[];
    const bodyNames = (typeof bodies!=='undefined')?bodies.map(b=>b.userData&&b.userData.name):[];
    const glbLoaded = (typeof bodies!=='undefined')?bodies.filter(b=>b.userData&&b.userData.glb).length:0;
    return {
      THREE_present: !!window.THREE,
      // (a) post stack
      composerPasses: passes,
      bloom: typeof bloom!=='undefined'&&!!bloom,
      godrays: typeof godrays!=='undefined'&&!!godrays,
      bokeh_dof: typeof bokeh!=='undefined'&&!!bokeh,
      filmPass: typeof filmPass!=='undefined'&&!!filmPass,
      smaaOrFxaa: (typeof smaa!=='undefined'&&smaa)?smaa.constructor.name:'null',
      // (b) face
      faceMesh: typeof faceMesh!=='undefined'&&!!faceMesh,
      faceMat: typeof faceMat!=='undefined'&&!!faceMat,
      faceForm: (typeof faceMat!=='undefined'&&faceMat&&faceMat.uniforms)?+faceMat.uniforms.uForm.value.toFixed(3):null,
      faceWidth: (typeof faceMesh!=='undefined'&&faceMesh&&faceMesh.geometry&&faceMesh.geometry.parameters)?faceMesh.geometry.parameters.width:null,
      // (c) no white dots — GLB/PBR + connections
      bodyCount: bodyNames.length,
      glbLoadedCount: glbLoaded,
      macroLines: typeof _macroLines!=='undefined'&&!!_macroLines,
      hasClimate: bodyNames.includes('climate'),
      hasAgentOS: bodyNames.includes('agentos'),
      // (d) phyllo layout — sample a few radii (distance from origin)
      sampleRadii: (typeof bodies!=='undefined')?bodies.slice(0,6).map(b=>({n:b.userData.name,r:Math.round(Math.hypot(b.position.x,b.position.z))})):[],
      // proven foundation preserved
      liquidPresent: typeof liquid!=='undefined'&&!!liquid,
      beamPresent: typeof beamMat!=='undefined'&&!!beamMat,
      gridPresent: typeof gridMat!=='undefined'&&!!gridMat,
      pulsePresent: typeof PULSE!=='undefined'&&typeof PULSE.amp==='number',
      // docks + crystal
      iosDockItems: document.querySelectorAll('#dock .di').length,
      selfdevPresent: !!document.getElementById('sdev'),
      crystalPresent: !!document.getElementById('crystal'),
      uniReady: typeof uniReady!=='undefined'&&uniReady,
    };
  });

  // simulate JARVIS speaking → face should assemble (uForm rises) + crystal shows
  await page.evaluate(()=>{ try{ document.body.classList.add('speaking'); if(window.setAmp)window.setAmp(0.9); if(window.showCrystal)window.showCrystal('Testing the visage.'); }catch(e){} });
  await page.waitForTimeout(1500);
  const speaking = await page.evaluate(()=>({
    faceFormWhileSpeaking: (typeof faceMat!=='undefined'&&faceMat&&faceMat.uniforms)?+faceMat.uniforms.uForm.value.toFixed(3):null,
    crystalShown: !!(document.getElementById('crystal')&&document.getElementById('crystal').classList.contains('show')),
    pulseAmp: (typeof PULSE!=='undefined')?+PULSE.amp.toFixed(3):null,
  }));

  console.log('=== PROBE ==='); console.log(JSON.stringify(probe,null,2));
  console.log('=== WHILE SPEAKING ==='); console.log(JSON.stringify(speaking,null,2));
  console.log('=== pageErrors ===', JSON.stringify(pageErrors));
  console.log('=== consoleErrors ===', JSON.stringify(consoleErrors.slice(0,20)));
  console.log('=== requestFailed (non-favicon) ===', JSON.stringify(failed.slice(0,20)));
  await browser.close();
})().catch(e=>{console.error('ERR',e);process.exit(1);});
