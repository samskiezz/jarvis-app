const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader'] });
  const p = await br.newPage({ viewport:{width:1280,height:720} });
  const errs=[]; let glbReq=0, glb200=0, glb404=0;
  p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  p.on('requestfinished',async r=>{ if(r.url().includes('.glb')){ glbReq++; try{const rsp=await r.response(); const s=rsp&&rsp.status(); if(s===200)glb200++; else glb404++;}catch(e){} } });
  await p.goto('http://127.0.0.1:8095/',{waitUntil:'domcontentloaded'}).catch(e=>errs.push('goto:'+e.message));
  await p.waitForTimeout(20000); // long wait to let the capped queue drain
  const info = await p.evaluate(()=>{
    const out={bodies:0, withGLB:0, proxyVisible:0, manifest:0, manifestWithGLB:0, glbsOk:(window.glbsOk||null), glbsTried:(window.glbsTried||null)};
    const bodies=window.__bodies||window.bodies||[];
    out.bodies=bodies.length;
    bodies.forEach(m=>{
      if(m.userData&&m.userData.glb)out.withGLB++;
      if(m.material&&m.material.opacity>0.01 && !(m.userData&&m.userData.glb))out.proxyVisible++;
      if(m.userData&&m.userData.manifest){out.manifest++; if(m.userData.glb)out.manifestWithGLB++;}
    });
    return out;
  });
  console.log('errors:', errs.slice(0,4).join(' | ')||'NONE');
  console.log('glb net req/200/404:', glbReq, glb200, glb404);
  console.log('bodyInfo:', JSON.stringify(info));
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
