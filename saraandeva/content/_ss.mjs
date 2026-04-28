import { chromium } from "playwright";
const b = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 300_000 });
const p = b.contexts()[0].pages().find(x => x.url().includes("kling.ai"));
await p.bringToFront();
await p.screenshot({ path: "/tmp/kling-now.png", fullPage: true });
console.log("saved /tmp/kling-now.png url=" + p.url());
await b.close();
