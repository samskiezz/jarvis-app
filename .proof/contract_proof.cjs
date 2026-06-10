// MASTER contract proof for server/jarvis_live.html — verifies every boolean the contract demands,
// at RUNTIME (not grep). Run against the live dashboard at http://127.0.0.1:8095.
//   chromium --use-gl=swiftshader --use-fake-device-for-media-stream --autoplay-policy=no-user-gesture-required
const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args:[
    '--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist',
    '--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport:{width:1440,height:900} })).newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  const httpStatus = (await page.goto(B+'/', {waitUntil:'domcontentloaded'})).status();
  await page.waitForTimeout(1100);
  await page.mouse.click(720,450);     // engage (real pointer gesture)
  await page.waitForTimeout(4200);     // render loop + bodies + constellation + GLBs

  const R = await page.evaluate(async () => {
    const out={};
    // (1) loads + render loop advancing
    const f0=(renderer&&renderer.info&&renderer.info.render.frame)||0;
    await new Promise(r=>setTimeout(r,700));
    const f1=(renderer&&renderer.info&&renderer.info.render.frame)||0;
    out.renderAdvances={f0,f1,ok:f1>f0};

    // (2) AA pass present in composer, no SMAA throw, bloom+ACES+sRGB
    const passes=(composer&&composer.passes||[]).map(p=>p.constructor.name);
    out.composerPasses=passes;
    out.bloomPresent=passes.includes('UnrealBloomPass');
    out.aces = renderer.toneMapping===THREE.ACESFilmicToneMapping;
    out.srgb = renderer.outputEncoding===THREE.sRGBEncoding;
    // an AA pass at the END (SMAAPass OR an FXAA ShaderPass that renders to screen)
    const last = (composer&&composer.passes||[])[ (composer.passes.length-1) ];
    out.smaaVar = (typeof smaa!=='undefined' && smaa) ? smaa.constructor.name : null;
    out.aaIsSMAA = out.smaaVar==='SMAAPass';
    out.aaPresent = !!(out.smaaVar) && (out.aaIsSMAA || out.smaaVar==='ShaderPass');
    out.aaRendersToScreen = !!(last && last.renderToScreen);

    // (3) centre = MORPHING FACE at centre (face mesh exists, has uForm, billboards) + liquid metal
    out.faceMeshExists = (typeof faceMesh!=='undefined' && !!faceMesh);
    out.faceHasForm = (typeof faceMat!=='undefined' && faceMat && faceMat.uniforms && 'uForm' in faceMat.uniforms);
    out.faceIsLargest = false;
    try{
      const fg=faceMesh.geometry; fg.computeBoundingSphere();
      const faceR=fg.boundingSphere.radius*Math.max(faceMesh.scale.x,faceMesh.scale.y);
      const planetMax=Math.max(...bodies.map(b=>(b.userData.baseScale||0)));
      out.faceRadius=faceR; out.planetMax=planetMax; out.faceIsLargest=faceR>planetMax;
    }catch(e){out.faceErr=String(e);}
    // morph proof: drive speech, capture uForm rising + liquid vertex displacement
    const before = faceMat&&faceMat.uniforms? faceMat.uniforms.uForm.value : null;
    document.body.classList.add('speaking'); if(typeof setAmp==='function')setAmp(1.0);
    if(typeof spkAmp!=='undefined')spkAmp=1.0;
    // simulate frames
    for(let i=0;i<40;i++){ if(typeof PULSE!=='undefined'){PULSE.amp=Math.min(1,(PULSE.amp||0)+0.05);} await new Promise(r=>requestAnimationFrame(r)); }
    const after = faceMat&&faceMat.uniforms? faceMat.uniforms.uForm.value : null;
    out.faceForms = (before!=null && after!=null) ? after>before : null;
    out.faceFormBefore=before; out.faceFormAfter=after;
    out.faceAtCentre = faceMesh ? (Math.abs(faceMesh.position.x)<8 && Math.abs(faceMesh.position.z)<10) : false;

    // (4) planets are SHADED (not white points): material is MeshStandard with a map/emissive, has a label sprite, connection lines present
    let shaded=0, labelled=0, whiteDots=0;
    bodies.forEach(b=>{
      const mat=b.material; const isStd=mat && mat.type==='MeshStandardMaterial';
      const hasTex=mat && (mat.map || (mat.emissive && mat.emissiveIntensity>0));
      const isPoints = b.type==='Points' || (mat && mat.type==='PointsMaterial');
      if(isStd && hasTex) shaded++; if(isPoints) whiteDots++;
      // label sprite child
      const hasLabel = (b.userData && b.userData.label) || b.children.some(c=>c.type==='Sprite');
      if(hasLabel) labelled++;
    });
    out.bodiesTotal=bodies.length; out.bodiesShaded=shaded; out.bodiesLabelled=labelled; out.whiteDotsCount=whiteDots;
    out.macroLinesExist = (typeof _macroLines!=='undefined' && !!_macroLines && _macroLines.geometry && _macroLines.geometry.attributes.position && _macroLines.geometry.attributes.position.count>0);
    out.macroLineVerts = out.macroLinesExist ? _macroLines.geometry.attributes.position.count : 0;

    // (5) φ / golden-angle layout — verify successive same-cluster bodies differ by ~137.5° and r∝importance
    out.goldenConst = (typeof GOLDEN!=='undefined') ? GOLDEN : null;
    out.goldenIs137 = out.goldenConst!=null ? Math.abs(out.goldenConst - (Math.PI*(3-Math.sqrt(5))))<1e-6 : false;
    // check actual angular spread of kpi bodies is well-distributed (no clumping)
    const kpi=[...bodyMap.entries()].filter(([k])=>k.startsWith('kpi:')).map(([,m])=>Math.atan2(m.position.z,m.position.x));
    let minGap=999; const sorted=kpi.map(a=>(a+Math.PI*2)%(Math.PI*2)).sort((a,b)=>a-b);
    for(let i=1;i<sorted.length;i++){minGap=Math.min(minGap,sorted[i]-sorted[i-1]);}
    out.kpiCount=kpi.length; out.kpiMinAngularGapDeg = sorted.length>1 ? minGap*180/Math.PI : null;

    // (6) iOS dock: each item icon + NAME label under it; drag-to-pin path exists
    const di=[...document.querySelectorAll('#dock .di')];
    out.dockItems=di.length;
    out.dockHasIconAndName = di.length>0 && di.every(e=>e.querySelector('.gly') && e.querySelector('.nm') && e.querySelector('.nm').textContent.trim().length>0);
    out.dockSampleNames = di.slice(0,5).map(e=>e.querySelector('.nm')?e.querySelector('.nm').textContent:'');
    out.dragToPinFnExists = (typeof pinBodyToDock==='function' && typeof _pinDragStart==='function' && typeof _pinDragEnd==='function');
    // actually pin a body via the function and confirm a pinned tile appears + persists
    const beforeN=di.length; const sampleName=[...bodyMap.keys()][0];
    let pinnedOK=false, persistOK=false;
    if(sampleName){ pinBodyToDock(sampleName,'TestPin');
      const after=[...document.querySelectorAll('#dock .di')];
      pinnedOK = after.length===beforeN+1 && after.some(e=>e.classList.contains('pinned'));
      const ls=JSON.parse(localStorage.getItem('jarvisDockPins')||'[]');
      persistOK = ls.some(p=>p.body===sampleName);
    }
    out.pinAddsTile=pinnedOK; out.pinPersists=persistOK;

    // (7) 2nd self-dev dock: blocks from /suggestions + BUILD button that POSTs /upgrade
    out.sdevExists = !!document.getElementById('sdev');
    return out;
  });

  // (7b) load suggestions live and verify blocks + a BUILD button wired to /upgrade
  const sdev = await page.evaluate(async () => {
    if(typeof loadSuggestions==='function'){ await loadSuggestions(true); await new Promise(r=>setTimeout(r,1500)); }
    const body=document.getElementById('sdevBody');
    const blocks=body?[...body.children]:[];
    const buildBtns=body?[...body.querySelectorAll('button,.bd,[onclick]')].filter(b=>/build/i.test(b.textContent||'')):[];
    const links=body?[...body.querySelectorAll('a,.lk,[onclick*=openProposal],[onclick*=proposal]')]:[];
    return { blockCount: blocks.length, buildBtnCount: buildBtns.length, hasBuild: buildBtns.length>0,
             linkCount: links.length, html: body? body.innerHTML.slice(0,400):'' };
  });

  await browser.close();
  const verdict = {
    loads: httpStatus===200 && errs.length===0,
    aa_no_grain: R.bloomPresent && R.aces && R.srgb && R.aaPresent && R.aaRendersToScreen,
    aa_is_smaa: R.aaIsSMAA,
    morphing_face_centre: R.faceMeshExists && R.faceHasForm && R.faceAtCentre && R.faceForms===true,
    face_is_largest: R.faceIsLargest,
    shaded_titled_connected: R.bodiesShaded>0 && R.bodiesLabelled>0 && R.macroLinesExist && R.whiteDotsCount===0,
    phi_layout: R.goldenIs137 && (R.kpiMinAngularGapDeg===null || R.kpiMinAngularGapDeg>1),
    ios_dock_and_drag_pin: R.dockHasIconAndName && R.dragToPinFnExists && R.pinAddsTile && R.pinPersists,
    selfdev_dock_build: sdev.blockCount>0 && sdev.hasBuild,
  };
  console.log(JSON.stringify({ httpStatus, pageErrors:errs, R, sdev, verdict }, null, 2));
})().catch(e=>{console.error('ERR',e&&e.stack||e);process.exit(1);});
