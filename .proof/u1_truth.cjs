const { chromium } = require('playwright');
(async () => {
  const br = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader'] });
  const p = await br.newPage({ viewport:{width:1280,height:720}, deviceScaleFactor:2 });
  const errs=[];
  p.on('pageerror',e=>errs.push(e.message.slice(0,160)));
  await p.goto('http://127.0.0.1:8095/',{waitUntil:'domcontentloaded'}).catch(e=>errs.push('goto:'+e.message));
  await p.waitForTimeout(9000);
  await p.screenshot({ path:'.proof/u1_state.png' });
  // Read center-region pixels from the canvas to detect blown-out white
  const lum = await p.evaluate(()=>{
    const c=document.querySelector('canvas'); if(!c) return {none:true};
    // create offscreen 2d to read - draw the canvas
    const t=document.createElement('canvas'); t.width=c.width; t.height=c.height;
    const ctx=t.getContext('2d');
    try{ ctx.drawImage(c,0,0); }catch(e){ return {drawErr:e.message, w:c.width, h:c.height}; }
    const cx=Math.floor(c.width/2), cy=Math.floor(c.height/2);
    const R=Math.floor(Math.min(c.width,c.height)*0.18); // sample center ~18% box
    let n=0, blown=0, sumL=0, maxL=0;
    const img=ctx.getImageData(cx-R,cy-R,R*2,R*2).data;
    for(let i=0;i<img.length;i+=4){
      const r=img[i],g=img[i+1],b=img[i+2];
      const L=0.2126*r+0.7152*g+0.0722*b;
      sumL+=L; n++; if(L>maxL)maxL=L;
      if(r>=250&&g>=250&&b>=250) blown++;
    }
    return {w:c.width,h:c.height,client:c.clientWidth+'x'+c.clientHeight,
            avgL:Math.round(sumL/n), maxL:Math.round(maxL),
            pctBlownWhite:+(100*blown/n).toFixed(1), samples:n};
  });
  console.log('errors:', errs.slice(0,4).join(' | ')||'NONE');
  console.log('centerLuma:', JSON.stringify(lum));
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
