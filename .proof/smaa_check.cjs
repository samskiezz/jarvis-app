const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args:['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport:{width:1440,height:900} });
  const page = await ctx.newPage();
  const failed = [];
  page.on('requestfailed', r => failed.push(r.url()+' :: '+(r.failure()&&r.failure().errorText)));
  page.on('response', r => { if(/SMAAPass|UnrealBloom|EffectComposer/.test(r.url())) failed.push('RESP '+r.status()+' '+r.url()); });
  await page.goto(B+'/', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(900); await page.mouse.click(720,450); await page.waitForTimeout(3000);
  const probe = await page.evaluate(()=>({
    SMAAPassDefined: !!(window.THREE && window.THREE.SMAAPass),
    UnrealBloomDefined: !!(window.THREE && window.THREE.UnrealBloomPass),
    EffectComposerDefined: !!(window.THREE && window.THREE.EffectComposer),
    smaaVar: (typeof smaa!=='undefined')?(smaa?'object':'null'):'undef',
    passes: (typeof composer!=='undefined'&&composer)?composer.passes.map(p=>p.constructor.name):[],
  }));
  console.log('PROBE', JSON.stringify(probe,null,2));
  console.log('NET (SMAA/Bloom/Composer + failures):'); console.log(failed.join('\n')||'(none)');
  await browser.close();
})().catch(e=>{console.error('ERR',e);process.exit(1);});
