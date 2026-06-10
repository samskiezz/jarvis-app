const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader'] });
  const p = await br.newPage({ viewport:{width:1280,height:800} });
  const errs=[], glb=[];
  p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  p.on('requestfinished',async r=>{ if(r.url().includes('.glb')){ try{const rsp=await r.response(); glb.push((r.url().split('/').pop())+'->'+(rsp&&rsp.status()));}catch(e){} } });
  await p.goto('http://127.0.0.1:8095/',{waitUntil:'domcontentloaded'}).catch(e=>errs.push('goto:'+e.message));
  await p.waitForTimeout(8000);
  await p.screenshot({ path:'.proof/live_state.png' });
  const info = await p.evaluate(()=>{
    // find every THREE scene/renderer reachable via globals
    const out={meshes:0,points:0,lines:0,glbNodes:0,domains:0,topics:0,sceneFound:false,canvas:!!document.querySelector('canvas')};
    const T=window.THREE; if(!T) return {noTHREE:true};
    const scenes=[];
    for(const k of Object.keys(window)){ try{const v=window[k]; if(v&&v.isScene)scenes.push(v);}catch(e){} }
    // also common names
    ['scene','__scene','SCENE','world','universe'].forEach(n=>{try{if(window[n]&&window[n].isScene&&!scenes.includes(window[n]))scenes.push(window[n]);}catch(e){}});
    out.sceneCount=scenes.length;
    scenes.forEach(s=>{ out.sceneFound=true; s.traverse(o=>{ if(o.isMesh)out.meshes++; if(o.isPoints)out.points++; if(o.isLine||o.isLineSegments)out.lines++; if(o.userData&&(o.userData.glb||o.userData.topic))out.glbNodes++; }); });
    // count visible canvases drawing
    return out;
  });
  // sample center pixels for non-blackness
  const px = await p.evaluate(()=>{
    const c=document.querySelector('canvas'); if(!c) return {none:true};
    return {w:c.width,h:c.height,client:c.clientWidth+'x'+c.clientHeight};
  });
  console.log('GLB requested:', glb.join(', ')||'NONE');
  console.log('scene info:', JSON.stringify(info));
  console.log('canvas:', JSON.stringify(px));
  console.log('errors:', errs.slice(0,5).join(' | ')||'none');
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
