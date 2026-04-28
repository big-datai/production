// Captured 2026-04-23 via `npx playwright codegen --load-storage /tmp/kling-storage.json`
// This is the CANONICAL selector reference for submitting a Kling Custom Multi-Shot clip.
// All subsequent automation derives selectors from this file.
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: '/tmp/kling-storage.json',
    viewport: { height: 900, width: 1400 }
  });
  const page = await context.newPage();
  await page.goto('https://kling.ai/app/video/new');

  // 1. Dismiss welcome / popup
  await page.locator('.close > svg').click();

  // 2. Scene frame picker: History → Uploads → pick image → Confirm
  await page.getByText('History').click();
  await page.getByText('Uploads').click();
  await page.locator('#panel-reference-upload-container > .container > .virtual-list-container > .virtual-list-content > div:nth-child(2) > .items-row > div > .image-item > .image-item-source').first().click();
  await page.getByRole('button', { name: 'Confirm' }).click();

  // 3. Bind subjects: open gear → tick checkboxes → close
  await page.locator('.svg-icon.bind-subject__options-setting').click();
  await page.locator('div:nth-child(3) > .bind-subject-dialog__item-checkbox > svg > .svg-icon').click();
  await page.locator('div:nth-child(8) > .bind-subject-dialog__item-checkbox > svg > .svg-icon').click();
  await page.locator('.bind-subject-dialog__title > svg').click();

  // 4. Enter Custom Multi-Shot mode
  await page.getByText('Custom Multi-Shot').click();

  // 5. Shot prompts — use getByRole('textbox')
  await page.getByRole('textbox').first().click();
  await page.getByRole('textbox').first().fill('shot 1');
  await page.locator('#design-view-container').getByRole('textbox').filter({ hasText: /^$/ }).fill('shot 2');

  // 6. Shot duration — dynamic ID #el-id-XXXX-YYY
  await page.locator('#el-id-2025-282').fill('3');

  // 7. Resolution: 1080p → 720p
  await page.getByText('720p · 5s ·').click();
  await page.locator('#el-id-2025-67').getByText('720p').click();

  // 8. Slider adjust (duration bar?)
  await page.locator('.el-slider__runway').click();

  // 9. Click shot 1 tab to focus it
  await page.getByText('shot 1', { exact: true }).click();

  await context.close();
  await browser.close();
})();
