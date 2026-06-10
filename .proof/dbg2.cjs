const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(String(e.message)));
  await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900); await page.mouse.click(720,450); await page.waitForTimeout(6500);
  const r = await page.evaluate(() => ({
    uniReady: typeof uniReady!=='undefined'?uniReady:'undef',
    n: (typeof bodies!=='undefined'?bodies:[]).length,
    labels: (typeof bodies!=='undefined'?bodies:[]).map(b=>({name:b.userData.name,labelText:b.userData.labelText})),
  }));
  console.log('errs',JSON.stringify(errs));
  console.log(JSON.stringify(r,null,2));
  await browser.close();
})();
