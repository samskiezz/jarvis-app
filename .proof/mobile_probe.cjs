const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader'] });
  const p = await br.newPage({ viewport:{width:390,height:844}, isMobile:true });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,140)));
  await p.goto('http://127.0.0.1:8095/',{waitUntil:'domcontentloaded'}).catch(e=>errs.push('goto:'+e.message));
  await p.waitForTimeout(9000); // let GLBs stream + swap
  const r = await p.evaluate(()=>{
    const out={errs:0, bodies:0, withGLB:0, proxyHidden:0, glbMeshes:0, sample:[]};
    const B=window.__bodies||[];
    out.bodies=B.length;
    B.forEach(m=>{
      const hasG=!!(m.userData&&m.userData.glb);
      if(hasG)out.withGLB++;
      const op=m.material&&m.material.opacity;
      if(op===0)out.proxyHidden++;
      let gm=0; if(hasG)m.userData.glb.traverse(c=>{if(c.isMesh)gm++;});
      out.glbMeshes+=gm;
      if(out.sample.length<6)out.sample.push({name:m.userData&&m.userData.name, hasGLB:hasG, proxyOpacity:op, glbMeshes:gm});
    });
    // responsive: are side panels visible at mobile width? is dock in viewport?
    const panels=[...document.querySelectorAll('[class*=panel],[id*=panel],.glass,#infra,#pipe,#know,#infer')];
    out.panelsVisible=panels.filter(e=>e.offsetParent!==null).length;
    const dock=document.querySelector('#dock,[id*=dock],.dock');
    if(dock){const rc=dock.getBoundingClientRect();out.dockRight=Math.round(rc.right);out.dockOverflowsX=rc.right>window.innerWidth+2;}
    out.vw=window.innerWidth;
    return out;
  });
  r.errs=errs.slice(0,4);
  console.log(JSON.stringify(r,null,1));
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
