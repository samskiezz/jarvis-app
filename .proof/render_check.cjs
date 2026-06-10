const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader'] });
  const p = await br.newPage();
  const errs=[], glb=[];
  p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
  p.on('requestfinished',async r=>{ if(r.url().includes('.glb')){ try{const rsp=await r.response(); glb.push((r.url().split('/').pop())+'->'+(rsp&&rsp.status()));}catch(e){} } });
  await p.goto('http://127.0.0.1:8095/',{waitUntil:'domcontentloaded'}).catch(e=>errs.push('goto:'+e.message));
  await p.waitForTimeout(6000); // let GLBs load
  const scene = await p.evaluate(()=>{
    const T=window.THREE; if(!T) return {noTHREE:true};
    // find a renderer/scene by scanning common globals
    let meshes=0, lines=0, points=0, glbMeshes=0;
    try{ (window.__scene||window.scene)&&(window.__scene||window.scene).traverse(o=>{ if(o.isMesh)meshes++; if(o.isLine||o.isLineSegments)lines++; if(o.isPoints)points++; }); }catch(e){}
    return { rev:T.REVISION, meshes, lines, points, hasCanvas: !!document.querySelector('canvas') };
  });
  console.log('pageErrors:', errs.slice(0,6).join(' | ')||'NONE');
  console.log('GLB network:', glb.slice(0,8).join(', ')||'NO .glb requested');
  console.log('scene:', JSON.stringify(scene));
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
