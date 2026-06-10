const { chromium } = require('playwright');
(async () => {
  const room='pwcam', B='http://127.0.0.1:8095';
  const br = await chromium.launch({ args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const cP = await br.newContext({permissions:['camera','microphone']});
  const cG = await br.newContext({permissions:['camera','microphone']});
  const pP = await cP.newPage(), pG = await cG.newPage();
  const errs=[]; pP.on('pageerror',e=>errs.push('P:'+e.message)); pG.on('pageerror',e=>errs.push('G:'+e.message));
  await pP.goto(B+'/talk?room='+room,{waitUntil:'domcontentloaded'});
  await pG.goto(B+'/guardian?room='+room,{waitUntil:'domcontentloaded'});
  await pP.waitForTimeout(500);
  await pP.click('#go',{force:true}).catch(e=>errs.push('Pclick:'+e.message));
  await pG.waitForTimeout(800);
  await pG.getByText('CONNECT NOW').click({force:true}).catch(e=>errs.push('Gclick:'+e.message));
  let r={};
  for(let i=0;i<18;i++){ await pP.waitForTimeout(1500);
    r={pConn:await pP.evaluate(()=>window.pc&&pc.connectionState), gConn:await pG.evaluate(()=>window.pc&&pc.connectionState),
       pRemote:await pP.evaluate(()=>{const e=document.getElementById('remote');return !!(e&&e.srcObject&&e.srcObject.getTracks().length)}),
       gRemote:await pG.evaluate(()=>{const e=document.getElementById('remote');return !!(e&&e.srcObject&&e.srcObject.getTracks().length)})};
    if(r.pConn==='connected'&&r.gConn==='connected'&&r.pRemote&&r.gRemote) break; }
  console.log('patient pc:',r.pConn,'| guardian pc:',r.gConn);
  console.log('mum sees son (patient remote stream):',r.pRemote);
  console.log('son sees mum (guardian remote stream):',r.gRemote);
  console.log('errors:',errs.slice(0,6).join(' | ')||'none');
  console.log('\n>>> TWO-WAY VIDEO:', (r.pConn==='connected'&&r.gConn==='connected'&&r.pRemote&&r.gRemote)?'WORKS ✅':'NOT FULLY ❌');
  await br.close();
})().catch(e=>{console.error('ERR',e);process.exit(1)});
