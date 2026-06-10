const { chromium } = require('playwright');
(async () => {
  const room='pwcam2', B='http://127.0.0.1:8095';
  const br = await chromium.launch({ args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const cP=await br.newContext({permissions:['camera','microphone']}), cG=await br.newContext({permissions:['camera','microphone']});
  const pP=await cP.newPage(), pG=await cG.newPage();
  await pP.goto(B+'/talk?room='+room,{waitUntil:'domcontentloaded'});
  await pG.goto(B+'/guardian?room='+room,{waitUntil:'domcontentloaded'});
  await pP.waitForTimeout(500); await pP.click('#go',{force:true}).catch(()=>{});
  await pG.waitForTimeout(800); await pG.getByText('CONNECT NOW').click({force:true}).catch(()=>{});
  let r={};
  for(let i=0;i<16;i++){ await pP.waitForTimeout(1500);
    const vw=async(pg)=>pg.evaluate(()=>{const e=document.getElementById('remote');return e&&e.videoWidth||0});
    const at=async(pg)=>pg.evaluate(()=>{const e=document.getElementById('remote');return !!(e&&e.srcObject&&e.srcObject.getVideoTracks().length)});
    r={pVW:await vw(pP),gVW:await vw(pG),pT:await at(pP),gT:await at(pG)};
    if(r.pVW>0&&r.gVW>0) break; }
  console.log('mum sees son: track='+r.pT+' liveFrames='+(r.pVW>0)+' ('+r.pVW+'px)');
  console.log('son sees mum: track='+r.gT+' liveFrames='+(r.gVW>0)+' ('+r.gVW+'px)');
  console.log('\n>>> TWO-WAY LIVE VIDEO:', (r.pVW>0&&r.gVW>0)?'WORKS ✅':'partial');
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
