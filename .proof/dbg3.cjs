const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900); await page.mouse.click(720,450); await page.waitForTimeout(3500);
  const r = await page.evaluate(async () => {
    const before = bodies.length;
    const m = await (await fetch('metrics?_='+Date.now())).json();
    let err=null;
    try { layoutFromMetrics(m); } catch(e){ err=String(e&&e.message); }
    return { before, after: bodies.length, err, hasScene: !!scene, workers:(m.workers||[]).length };
  });
  console.log(JSON.stringify(r,null,2));
  await browser.close();
})();
