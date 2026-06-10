const { chromium } = require('playwright');
const B = process.argv[2] || 'http://127.0.0.1:8095';
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox','--use-gl=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(B + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900); await page.mouse.click(720,450); await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const labels = bodies.map(b => ({name:b.userData.name, labelText:b.userData.labelText}));
    // direct match test for 'Correlation'
    const lo='correlation';
    const hit = bodies.find(b=>b.userData.name.toLowerCase().includes(lo)||(b.userData.labelText||'').toLowerCase().includes(lo));
    return { labels, corrHit: hit?hit.userData.name:null };
  });
  console.log(JSON.stringify(r,null,2));
  await browser.close();
})();
