const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext({
    storageState: '/Volumes/Samsung500/goreadling-production/saraandeva/.auth/kling-storage.json'
  });
  await page.goto('https://kling.ai/app/user-assets/principal/elements');
  await page1.goto('https://suno.com/create');
  await page1.getByRole('textbox', { name: 'Punchy samba song about' }).click();
  await page1.getByRole('button', { name: 'Add Voice' }).click();
  await page1.locator('.absolute.inset-0.flex').first().click();
  await page1.getByRole('button', { name: 'Play' }).first().click();
  await page1.locator('.absolute.inset-0.flex').first().click();
  await page1.locator('.absolute.inset-0.flex').first().click();
  await page1.getByRole('textbox', { name: 'Punchy samba song about' }).click();
  await page1.getByRole('textbox', { name: 'Punchy samba song about' }).fill('this is son gescription');
  await page1.getByRole('button', { name: 'Add your own lyrics' }).click();
  await page1.getByTestId('lyrics-textarea').click();
  await page1.getByTestId('lyrics-textarea').fill('here are the lyrics');
  await page1.getByRole('textbox', { name: 'shimmering synths, afrobeats' }).click();
  await page1.getByRole('textbox', { name: 'shimmering synths, afrobeats' }).click();
  await page1.getByRole('textbox', { name: 'shimmering synths, afrobeats' }).fill('this is son gescription aka styles');
  await page1.getByRole('button', { name: 'Create song' }).click();
  await page1.locator('iframe[title="hCaptcha challenge"]').contentFrame().getByRole('button', { name: 'Skip Challenge' }).click();
  await page1.getByRole('group', { name: 'Can\'t Catch Us' }).getByLabel('More options').click();
  const download1Promise = page1.waitForEvent('download');
  await page1.getByRole('button', { name: 'MP3 Audio' }).click();
  const download1 = await download1Promise;

  // ---------------------
  await context.storageState({ path: '/Volumes/Samsung500/goreadling-production/saraandeva/.auth/kling-storage.json' });
  await context.close();
  await browser.close();
})();