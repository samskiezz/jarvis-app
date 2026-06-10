const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader'] });
  const p = await br.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:8095/', {waitUntil:'domcontentloaded'}).catch(e=>errs.push('goto:'+e.message));
  // wait for THREE + a GLTF loader global to exist (the page loads three@0.136 + examples/js)
  const env = await p.evaluate(async () => {
    for (let i=0;i<60 && typeof window.THREE==='undefined';i++) await new Promise(r=>setTimeout(r,100));
    const T = window.THREE;
    const LoaderCls = T && (T.GLTFLoader || (window.GLTFLoader));
    return { hasTHREE: !!T, threeRev: T && T.REVISION, hasGLTFLoader: !!LoaderCls };
  });
  let load = {};
  if (env.hasTHREE && env.hasGLTFLoader) {
    load = await p.evaluate(async () => {
      const T = window.THREE;
      const tryOne = (url) => new Promise(res => {
        try { new T.GLTFLoader().load(url,
          (g)=>{ let meshes=0,tris=0; g.scene.traverse(o=>{ if(o.isMesh){meshes++; const ix=o.geometry&&o.geometry.index; const pos=o.geometry&&o.geometry.attributes&&o.geometry.attributes.position; tris += ix?ix.count/3:(pos?pos.count/3:0);} }); res({url,ok:true,meshes,tris:Math.round(tris)}); },
          undefined,
          (err)=>res({url,ok:false,err:String(err&&err.message||err).slice(0,120)})); }
        catch(e){ res({url,ok:false,err:'throw '+e.message}); }
      });
      const a = await tryOne('asset/jarvis_iron_man_helmet.glb');
      const b = await tryOne('asset/jarvis_kit_data_orb.glb');
      return { helmet:a, dataorb:b };
    });
  }
  console.log('ENV:', JSON.stringify(env));
  console.log('LOAD:', JSON.stringify(load,null,1));
  console.log('pageErrors:', errs.slice(0,5).join(' | ')||'none');
  await br.close();
})().catch(e=>{console.error('TESTERR',e);process.exit(1)});
