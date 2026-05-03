const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false
  });
  const context = await browser.newContext({
    storageState: '/Volumes/Samsung500/goreadling-production/saraandeva/.auth/kling-storage.json'
  });
  await page.locator('.svg-icon.header-close').click();
  await page.locator('a').filter({ hasText: 'Image/Video' }).click();
  await page.getByText('Image-Upload').click();
  await page.getByRole('button', { name: 'Image/Video' }).setInputFiles('pool.png');
  await page.locator('.subject-item').first().click();
  await page.getByRole('button', { name: 'History' }).click();
  await page.getByLabel('History').getByText('Add Image').click();
  await page.getByText('CreativesUploadsImages|').click();
  await page.getByText('Uploads').click();
  await page.locator('.image-item-mask').first().click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await page.getByRole('textbox', { name: 'Enter Name' }).click();
  await page.getByRole('textbox', { name: 'Enter Name' }).fill('pool');
  await page.locator('.secondary-reference > .upload > div > .el-upload > .el-upload-dragger > .upload-content > svg').click();
  await page.locator('.secondary-reference > .upload > div > .el-upload').setInputFiles('pool.png');
  await page.getByRole('button', { name: 'Auto' }).click();
  await page.getByRole('button', { name: 'Auto' }).click();
  await page.getByRole('contentinfo').getByRole('button', { name: 'Generate' }).click();
  const page1 = await context.newPage();
  await page1.goto('https://suno.com/discover');
  await page1.getByRole('link', { name: 'Home' }).click();
  await page1.getByRole('link', { name: 'Create' }).first().click();
  await page1.getByRole('button', { name: 'Add Voice' }).click();
  await page1.getByRole('img', { name: 'Voice image for Sara' }).click();
  await page1.getByRole('textbox', { name: '120 bpm ghazal song about' }).click();
  await page1.getByRole('textbox', { name: '120 bpm ghazal song about' }).fill('create a song where Sara is dancing and singing about trip to costco because she likes eating hot dogs with eva also thinging and mom thinging she loves her favorit coffed');
  await page1.getByRole('textbox', { name: '120 bpm ghazal song about' }).press('ControlOrMeta+a');
  await page1.getByRole('textbox', { name: '120 bpm ghazal song about' }).press('ControlOrMeta+x');
  await page1.getByRole('textbox', { name: '120 bpm ghazal song about' }).fill('');
  await page1.getByRole('textbox', { name: '120 bpm ghazal song about' }).click();
  await page1.getByRole('textbox', { name: '120 bpm ghazal song about' }).fill('[Intro — claps + ooohs]\nOooh-oh, oh-oh-oh!\n(clap-clap, clap-clap-clap)\nOooh-oh, oh-oh-oh!\n\n[Verse 1]\nTwo little sisters with smiles so bright,\nHeaded to the dentist — everything\'s alright!\nSara takes my hand and we hop down the street,\nEva does a twirl, dancing to the beat.\n\n[Pre-chorus]\nOne, two, three, four — open up our jaws!\nFive, six, seven, eight — heroes, just because!\n\n[Chorus]\nWe\'re the tooth-brave sisters, oh-oh-oh!\nHand in hand together, never alone, no-no-no!\nSpinning, bopping, side by side,\nSara, Eva — what a sparkly ride!\nTwo little sisters, two big grins,\nDancing where the brave-tooth fun begins!\n\n[Verse 2]\nGiant white chairs and a sea-turtle floor,\nGiggling as the door swings open once more,\nThe dentist counts our shiny pearly rows,\nTwo little sisters in their bravest pose!\n\n[Pre-chorus]\nOne, two, three, four — open up our jaws!\nFive, six, seven, eight — sparkle without a pause!\n\n[Chorus]\nWe\'re the tooth-brave sisters, oh-oh-oh!\nHand in hand together, never alone, no-no-no!\nSpinning, bopping, side by side,\nSara, Eva — what a sparkly ride!\nTwo little sisters, two big grins,\nDancing where the brave-tooth fun begins!\n\n[Bridge — softer, hand-in-hand]\nIf the chair feels a little high,\nWe hold hands and we touch the sky.\nIf the buzzing makes us shy,\nWe just dance — we just fly!\n\n[Final chorus — bigger, key up]\nWe\'re the tooth-brave sisters, oh-oh-oh!\nHand in hand together, never alone, no-no-no!\nSpinning, bopping, side by side,\nSara, Eva — what a sparkly ride!\nTwo little sisters, two big grins,\nDancing where the brave-tooth fun begins!\n\n[Outro — fade with claps]\nTwo little sisters... (clap-clap)\nDancing all the way... (clap-clap)\nTwo little tooth-brave sisters,\nBrushing every day!\n(Oooh-oh, oh-oh-oh — fade)\n');
  await page1.getByRole('button', { name: 'Create song' }).click();
  await page1.getByRole('button', { name: 'Close onboarding challenges' }).click();
  await page1.getByRole('button', { name: 'Play Tooth-Brave Sisters' }).nth(1).click();
  await page1.getByRole('button', { name: 'Pause Tooth-Brave Sisters' }).click();
  await page1.getByRole('button', { name: 'Play Tooth-Brave Sisters' }).first().click();
  await page1.getByRole('button', { name: 'Pause Tooth-Brave Sisters' }).click();
  await page1.getByRole('button', { name: 'More options' }).first().click();
  await page1.getByRole('button', { name: 'Add to Queue' }).click();
  await page1.getByRole('button', { name: 'More options' }).nth(1).click();
  await page1.locator('#base-ui-_r_ei_').click();
  await page1.locator('#base-ui-_r_ei_').click();
  await page1.locator('#base-ui-_r_ei_').click();
  await page1.locator('.css-muq0gz').click();
  await page1.getByRole('button', { name: 'More options' }).nth(1).click();
  await page1.locator('.css-muq0gz').click();
  await page1.getByRole('button', { name: 'Playbar: Play button' }).click();
  await page1.locator('.absolute.inset-y-0.right-0').click();
  await page1.getByRole('button', { name: 'Play Tooth-Brave Sisters' }).first().click();
  await page1.locator('.absolute.inset-0.before\\:absolute').click();
  await page1.getByRole('button', { name: 'More options' }).nth(1).click();
  const downloadPromise = page1.waitForEvent('download');
  await page1.getByRole('button', { name: 'MP3 Audio' }).click();
  const download = await downloadPromise;
  await page1.getByRole('button', { name: 'Playbar: Pause button' }).click();

  // ---------------------
  await context.storageState({ path: '/Volumes/Samsung500/goreadling-production/saraandeva/.auth/kling-storage.json' });
  await context.close();
  await browser.close();
})();