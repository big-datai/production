const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext({
    storageState: '/Volumes/Samsung500/goreadling-production/saraandeva/.auth/kling-storage.json'
  });
  await page.goto('https://kling.ai/app/user-assets/materials?ac=1');
  await page1.goto('https://suno.com/create');
  await page.getByText('Principal Assets').click();
  await page.locator('use').nth(5).click();
  await page.locator('._kwai-player-video-interactive_5ef20_11').click();
  await page.getByRole('menuitem', { name: 'Add Image' }).click();
  await page.getByText('Create Element00:05 / 00:').setInputFiles('empty_coffee_bag.png');
  await page.getByRole('textbox', { name: 'Enter Name' }).click();
  await page.getByRole('textbox', { name: 'Enter Name' }).fill('empty-foffee-bag1');
  await page.locator('.secondary-reference > .upload > div > .el-upload > .el-upload-dragger > .upload-content > svg > .svg-icon').click();
  await page.getByRole('textbox', { name: 'Enter Name' }).fill('empty-coffee-bag1');
  await page.locator('.secondary-reference > .upload > div > .el-upload > .el-upload-dragger > .upload-content > svg').click();
  await page.locator('.secondary-reference > .upload > div > .el-upload').setInputFiles('empty_coffee_bag.png');
  await page.getByRole('button', { name: 'Auto' }).click();
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.locator('.upload-icon > svg').click();
  await page.locator('._kwai-player-video-interactive_5ef20_11').click();
  await page.getByRole('menuitem', { name: 'Add Image' }).click();
  await page.getByText('Create Element00:04 / 00:').setInputFiles('eva_heart_mug.png');
  await page.getByRole('textbox', { name: 'Enter Name' }).click();
  await page.getByRole('textbox', { name: 'Enter Name' }).fill('eva-heart-mug');
  await page.locator('.secondary-reference > .upload > div > .el-upload > .el-upload-dragger > .upload-content > svg').click();
  await page.locator('.secondary-reference > .upload > div > .el-upload').setInputFiles('eva_heart_mug.png');
  await page.getByRole('button', { name: 'Generate' }).click();

  // ---------------------
  await context.storageState({ path: '/Volumes/Samsung500/goreadling-production/saraandeva/.auth/kling-storage.json' });
  await context.close();
  await browser.close();
})();