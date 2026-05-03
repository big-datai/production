const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.close();

  // ---------------------
  await context.storageState({ path: '/tmp/kling-storage.json' });
  await context.close();
  await browser.close();
})();