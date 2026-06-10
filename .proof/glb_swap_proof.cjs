const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport:{width:1280,height:800} })).newPage();
  const glb200=[]; const errs=[];
  page.on('pageerror',e=>errs.push(String(e)));
  page.on('response',r=>{ if(/\/asset\/.*\.glb/.test(r.url())) glb200.push(r.status()); });
  await page.goto(B+'/', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(700); await page.mouse.click(640,400);
  await page.waitForTimeout(13000);
  const res = await page.evaluate(()=>({
    bodies: (typeof bodies!=='undefined')?bodies.length:0,
    glbLoaded: (typeof bodies!=='undefined')?bodies.filter(b=>b.userData&&b.userData.glb).length:0,
    proxyHidden: (typeof bodies!=='undefined')?bodies.filter(b=>b.userData&&b.userData.glb&&b.material.opacity===0).length:0,
  }));
  console.log('glb responses (status codes):', glb200.length, 'all200:', glb200.every(s=>s===200));
  console.log('result:', JSON.stringify(res));
  console.log('pageErrors:', JSON.stringify(errs));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
