const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const viewports = [
    { name: 'iphone', width: 390, height: 844 },
    { name: 'android', width: 412, height: 915 },
    { name: 'ipad_portrait', width: 768, height: 1024 },
    { name: 'ipad_landscape', width: 1024, height: 768 },
    { name: 'desktop', width: 1440, height: 900 }
  ];
  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: vp });
    await page.goto('http://127.0.0.1:8095/jarvis/predictions', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `audit/responsive_${vp.name}.png`, fullPage: true });
    await page.close();
  }
  await browser.close();
})();
