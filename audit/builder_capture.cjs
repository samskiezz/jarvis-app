const { chromium } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:8095/jarvis/predictions', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2500);
  const el = await page.locator('#builder');
  await el.screenshot({ path: 'audit/builder_desktop.png' });
  await browser.close();
})();
