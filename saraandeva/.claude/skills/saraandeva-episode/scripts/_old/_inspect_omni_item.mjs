import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

// Get the HTML of the topmost stream item
const topItem = page.locator('[class*="omni-stream-item"]').first();
const exists = await topItem.count();
console.log(`omni-stream-item count: ${exists}`);

if (exists) {
  // Get the inner HTML, truncated
  const html = await topItem.innerHTML();
  console.log("\nFirst 4000 chars of top-item HTML:");
  console.log(html.slice(0, 4000));
  console.log("\n--- All button text/class within ---");
  const buttons = await topItem.locator('button').all();
  for (let i = 0; i < buttons.length; i++) {
    const text = await buttons[i].innerText().catch(() => "");
    const cls = await buttons[i].getAttribute("class").catch(() => "");
    console.log(`btn[${i}] cls="${cls}" text="${text.slice(0, 30)}"`);
  }
}
await browser.close();
