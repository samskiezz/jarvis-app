const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({viewport:{width:1440,height:900}})).newPage();
  await page.goto(B+'/', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(900); await page.mouse.click(720,450); await page.waitForTimeout(2500);
  const r = await page.evaluate(()=>{
    try {
      const s = new THREE.SMAAPass(1440,900);
      return { constructed:true, type:s.constructor.name };
    } catch(e){ return { constructed:false, error:String(e&&e.message||e), stack:String(e&&e.stack||'').split('\n').slice(0,3).join(' | ') }; }
  });
  console.log(JSON.stringify(r,null,2));
  await browser.close();
})().catch(e=>{console.error('ERR',e);process.exit(1);});
