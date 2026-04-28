#!/usr/bin/env node
/**
 * Kling AI Batch Video Generator
 *
 * Connects to Chrome via CDP (must be running with --remote-debugging-port=9222)
 * and submits video generation tasks to Kling AI one after another.
 *
 * Selectors recorded via Playwright Codegen (April 2026).
 *
 * Two modes:
 *
 * MODE A — Saved cookies (recommended):
 *   Step 1: Sign into kling.ai in Chrome manually (one time)
 *   Step 2: Export cookies from that Chrome session:
 *           Launch Chrome with: --remote-debugging-port=9222
 *           node -e "const{chromium}=require('playwright');(async()=>{
 *             const b=await chromium.connectOverCDP('http://127.0.0.1:9222');
 *             const s=await b.contexts()[0].storageState();
 *             require('fs').writeFileSync('/tmp/kling-storage.json',JSON.stringify(s));
 *           })()"
 *   Step 3: Run clips (launches its own Chrome with your cookies):
 *           node content/kling-batch-generate.mjs <clips.json> --load-storage /tmp/kling-storage.json
 *
 * MODE B — CDP (connect to running Chrome):
 *   Step 1: Chrome running with: --remote-debugging-port=9222
 *   Step 2: Sign into kling.ai in that Chrome
 *   Step 3: node content/kling-batch-generate.mjs <clips.json>
 *
 * Usage:
 *   node content/kling-batch-generate.mjs <clips.json> --load-storage /tmp/kling-storage.json
 *   node content/kling-batch-generate.mjs <clips.json>                 # CDP mode (default)
 *   node content/kling-batch-generate.mjs <clips.json> --start 5       # start from clip 5
 *   node content/kling-batch-generate.mjs <clips.json> --dry-run        # preview only
 *
 * Re-record selectors (when Kling UI changes):
 *   npx playwright codegen --load-storage=/tmp/kling-storage.json --channel chrome "https://kling.ai/app/video/new?ac=1"
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const clipsFile = args.find(a => !a.startsWith('--'));
const startFrom = args.includes('--start') ? parseInt(args[args.indexOf('--start') + 1]) : 0;
const onlyIdx = args.indexOf('--only');
const onlyClips = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',').map(Number)) : null;
const dryRun = args.includes('--dry-run');
const outDirIdx = args.indexOf('--out-dir');
const outDir = outDirIdx >= 0 ? args[outDirIdx + 1] : null;
if (outDir) fs.mkdirSync(outDir, { recursive: true });
const storageIdx = args.indexOf('--load-storage');
const storagePath = storageIdx >= 0 ? args[storageIdx + 1] : '/tmp/kling-storage.json';
const useCDP = !args.includes('--no-cdp') && !args.includes('--load-storage');

if (!clipsFile || !fs.existsSync(clipsFile)) {
  console.error('Usage: node content/kling-batch-generate.mjs <clips.json> [--start N] [--only 11,25] [--dry-run]');
  process.exit(1);
}

const clips = JSON.parse(fs.readFileSync(clipsFile, 'utf8'));
console.log(`📋 Loaded ${clips.length} clips from ${clipsFile}`);
if (startFrom > 0) console.log(`⏩ Starting from clip ${startFrom}`);
if (onlyClips) console.log(`🎯 Only submitting clips: ${[...onlyClips].join(', ')}`);

const KLING_URL = 'https://kling.ai/app/video/new?ac=1';
const DELAY_BETWEEN_CLIPS = 5000;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitForPageReady(page) {
  await page.waitForSelector('text=Add start and end frames', { timeout: 15000 }).catch(() => {});
  await sleep(1000);
}

async function uploadFrames(page, startFrame, endFrame) {
  // Target the hidden file input directly inside .el-upload
  await page.locator('.el-upload__input').first().setInputFiles(startFrame);
  console.log(`      📷 Start frame: ${path.basename(startFrame)}`);
  await sleep(4000);

  // Second file input appears dynamically after first upload
  for (let attempt = 0; attempt < 5; attempt++) {
    const inputs = page.locator('.el-upload__input');
    const count = await inputs.count();
    if (count >= 2) {
      await inputs.nth(1).setInputFiles(endFrame);
      console.log(`      📷 End frame: ${path.basename(endFrame)}`);
      await sleep(3000);
      return;
    }
    // Try clicking the end frame area
    try {
      await page.getByText('Add an end frame').click({ timeout: 2000 });
    } catch {}
    await sleep(2000);
  }
  console.log('      ⚠️ Could not upload end frame, continuing with start frame only');
}

async function typePrompt(page, prompt) {
  // Codegen pattern: click textbox in #design-view-container, then fill
  const editor = page.locator('#design-view-container').getByRole('textbox');
  await editor.click();
  await page.keyboard.press('Meta+a');
  await sleep(100);
  await editor.fill(prompt);
  console.log(`      📝 Prompt: ${prompt.slice(0, 80)}...`);
}

async function set720p(page) {
  // The settings panel has a "Mode" section with segmented tab buttons:
  //   div.option-tab-item.model_mode — each has a div.inner with "720p" or "1080p"
  // Click settings bar to open panel, then click the 720p tab button
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      // Open settings panel by clicking the bar
      const settingsBar = page.locator('text=/\\d+p\\s*·\\s*\\d+s/').first();
      if (await settingsBar.count() > 0) {
        await settingsBar.click();
        await sleep(1500);

        // Click the 720p button inside the Mode section
        await page.locator("xpath=//div[@class='inner'][normalize-space()='720p']").click();
        await sleep(800);

        // Close settings panel
        await page.keyboard.press('Escape');
        await sleep(300);
        await page.mouse.click(300, 300);
        await sleep(500);
      }

      // Verify it stuck
      const barText = await page.evaluate(() => {
        for (const el of document.querySelectorAll('*')) {
          const t = el.textContent.trim();
          if (/^\d+p\s*·\s*\d+s/.test(t) && el.children.length < 3) return t;
        }
        return '';
      });
      if (barText.includes('720p')) {
        console.log('      🎥 Set 720p ✅');
        return;
      }
      console.log(`      ⚠️ 720p attempt ${attempt}/5 failed — bar shows: ${barText}, retrying...`);
      await sleep(1000);
    } catch (e) {
      console.log(`      ⚠️ set720p error (attempt ${attempt}/5): ${e.message}`);
      await sleep(1000);
    }
  }
  throw new Error('Failed to set 720p after 5 attempts');
}

async function disableNativeAudio(page) {
  // Native Audio is a checkbox-style toggle: div.setting-switch with SVG icon.
  // The icon href contains "checked" when ON. Click the text to toggle OFF.
  try {
    // Check if Native Audio is currently ON by looking at the SVG icon
    const isOn = await page.evaluate(() => {
      const sw = document.querySelector('div.setting-switch');
      if (!sw) return null;
      const svg = sw.querySelector('use');
      return svg ? svg.getAttribute('xlink:href')?.includes('checked') : null;
    });

    if (isOn === null) {
      console.log('      ⚠️ Native Audio switch not found');
      return;
    }

    if (!isOn) {
      console.log('      🔇 Native Audio already OFF ✅');
      return;
    }

    // Click "Native Audio" text to toggle it off
    await page.getByText('Native Audio', { exact: true }).click();
    await sleep(500);
    console.log('      🔇 Native Audio disabled ✅');
  } catch (e) {
    console.log(`      ⚠️ disableNativeAudio error: ${e.message}`);
  }
}

async function validateCreditsAndGenerate(page, expectedCredits = 30) {
  // Read the Generate button text — it shows the credit cost like "30Generate" or "60Generate"
  const buttonText = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if (b.textContent.includes('Generate')) return b.textContent.trim();
    }
    return '';
  });

  // Extract the number from button text (e.g. "30Generate" → 30)
  const match = buttonText.match(/(\d+)/);
  const creditCost = match ? parseInt(match[1]) : null;

  if (creditCost === null) {
    throw new Error(`❌ Cannot read credit cost from button: "${buttonText}". ABORTING — will not submit blind.`);
  }

  if (creditCost !== expectedCredits) {
    throw new Error(`❌ WRONG COST! Button shows ${creditCost} credits (expected ${expectedCredits}). Settings did not apply. ABORTING.`);
  }

  console.log(`      💰 Confirmed: ${creditCost} credits ✅`);
  await page.getByRole('button', { name: 'Generate' }).click();
  console.log('      ✅ Generate clicked!');
  await sleep(2000);
}

async function clickGenerate(page) {
  await validateCreditsAndGenerate(page, 30);
}

// Wait for clip to finish generating, toggle watermark off, then download
async function waitAndDownload(page, outputPath, timeoutMs = 10 * 60 * 1000) {
  console.log(`      ⏳ Waiting for generation to complete...`);
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    await sleep(5000);
    const elapsed = Math.round((Date.now() - start) / 1000);

    // The download button is an icon-only button inside the result panel.
    // It appears once generation is complete.
    const dlBtn = page.locator('[id^="el-id-"]').getByRole('button').filter({ hasText: /^$/ }).first();
    const isVisible = await dlBtn.isVisible().catch(() => false);

    if (!isVisible) {
      process.stdout.write(`      ⏳ Generating... (${elapsed}s)\r`);
      continue;
    }

    try {
      // First click opens the download panel / triggers initial download
      // Then toggle the watermark switch OFF, then download again
      let downloadPromise = page.waitForEvent('download', { timeout: 8000 });
      await dlBtn.click();
      let download = await downloadPromise.catch(() => null);

      // Toggle watermark switch off (if visible)
      const switchEl = page.locator('.el-switch__core').first();
      if (await switchEl.isVisible().catch(() => false)) {
        await switchEl.click();
        await sleep(500);
        console.log(`\n      🔕 Watermark toggled off`);
        // Download again watermark-free
        downloadPromise = page.waitForEvent('download', { timeout: 8000 });
        await dlBtn.click();
        download = await downloadPromise.catch(() => null);
      }

      if (download) {
        await download.saveAs(outputPath);
        const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(1);
        console.log(`\n      💾 Downloaded watermark-free (${size} MB) → ${path.basename(outputPath)}`);
        return true;
      }
    } catch (e) {
      process.stdout.write(`      ⏳ Waiting for download... (${elapsed}s)\r`);
    }
  }

  console.log(`\n      ⏰ Timed out waiting for generation`);
  return false;
}

async function main() {
  let browser, page;

  if (useCDP) {
    console.log('🔌 Connecting to Chrome via CDP...');
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const pages = browser.contexts()[0].pages();
    page = pages.find(p => p.url().includes('kling')) || pages[0];
  } else {
    console.log(`🚀 Launching Chrome with saved cookies from ${storagePath}...`);
    if (!fs.existsSync(storagePath)) {
      console.error(`❌ Storage file not found: ${storagePath}`);
      console.error('   Export cookies first: connect to logged-in Chrome via CDP, then context.storageState()');
      process.exit(1);
    }
    browser = await chromium.launch({ channel: 'chrome', headless: false });
    const context = await browser.newContext({ storageState: storagePath });
    page = await context.newPage();
    await page.goto(KLING_URL, { waitUntil: 'load', timeout: 30000 });
    await sleep(3000);
  }

  console.log(`🌐 Connected to: ${page.url()}`);

  let submitted = 0;
  let failed = 0;
  let isFirstClip = true;

  for (let i = startFrom; i < clips.length; i++) {
    const clip = clips[i];
    console.log(`\n🎬 Clip ${i}/${clips.length - 1} — ${path.basename(clip.startFrame)} → ${path.basename(clip.endFrame)}`);

    if (onlyClips && !onlyClips.has(i)) {
      console.log(`      ⏩ Skipping`);
      continue;
    }

    if (dryRun) {
      console.log(`      [DRY RUN] Would submit: ${clip.prompt.slice(0, 60)}...`);
      continue;
    }

    // Verify files exist
    if (!fs.existsSync(clip.startFrame)) {
      console.log(`      ❌ Start frame not found: ${clip.startFrame}`);
      failed++;
      continue;
    }
    if (!fs.existsSync(clip.endFrame)) {
      console.log(`      ❌ End frame not found: ${clip.endFrame}`);
      failed++;
      continue;
    }

    try {
      // Navigate fresh for each clip to get a clean form
      await page.goto(KLING_URL, { waitUntil: 'load', timeout: 15000 });
      await sleep(3000);
      await waitForPageReady(page);

      // Upload both frames FIRST (settings bar may not be fully active until frames are loaded)
      await uploadFrames(page, clip.startFrame, clip.endFrame);

      // Type the prompt
      await typePrompt(page, clip.prompt);

      // Set 720p EVERY clip (does not persist across page loads)
      await set720p(page);

      // Disable Native Audio EVERY clip (resets on each page load)
      await disableNativeAudio(page);

      // Click generate
      await clickGenerate(page);

      // If out-dir specified, wait for generation and download watermark-free immediately
      if (outDir) {
        const outputPath = path.join(outDir, `anim_${String(i).padStart(3, '0')}.mp4`);
        if (fs.existsSync(outputPath)) {
          console.log(`      ⏩ Already downloaded: ${path.basename(outputPath)}`);
        } else {
          await waitAndDownload(page, outputPath);
        }
      }

      submitted++;
      console.log(`      📊 ${submitted} submitted, ${clips.length - startFrom - submitted - failed} remaining`);

      // Brief delay before next clip
      if (i < clips.length - 1) {
        await sleep(outDir ? 2000 : DELAY_BETWEEN_CLIPS);
      }
    } catch (err) {
      console.error(`      ❌ Failed: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Done! ${submitted} submitted, ${failed} failed`);
  console.log(`💰 Credits used: ~${submitted * 30} (${submitted} × 30)`);
  console.log(`${'═'.repeat(50)}`);
}

main().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
