// Diagnostic: list ALL Kling completed Omni tasks where the prompt
// references both Papa+Joe and the bushes corner — i.e. clip-14 candidates.
// Prints prompt excerpts so we can see whether the calmer-prompt re-render
// actually exists on Kling, or only the original rage-prompt one.
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();

console.log(`🧹 Clearing IndexedDB task-feeds cache + reload to get fresh data...`);
await page.evaluate(async () => {
  await new Promise(r => {
    const req = indexedDB.open("request_data_cache");
    req.onsuccess = () => {
      const tx = req.result.transaction("task-feeds", "readwrite");
      tx.objectStore("task-feeds").clear();
      tx.oncomplete = () => r();
    };
    req.onerror = () => r();
  });
});
await page.reload({ waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
await page.waitForTimeout(5000);

console.log(`📜 Scrolling to load all paginated tasks...`);
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel(0, 1000).catch(() => {});
  await page.evaluate(() => {
    document.querySelectorAll('[class*="stream"],[class*="task"],aside,[class*="material"],[class*="feed"]').forEach(el => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = el.scrollHeight;
    });
  });
  await page.waitForTimeout(1500);
}

const tasks = await page.evaluate(async () => {
  const data = await new Promise((resolve, reject) => {
    const req = indexedDB.open("request_data_cache");
    req.onsuccess = () => {
      const tx = req.result.transaction("task-feeds", "readonly");
      const all = tx.objectStore("task-feeds").getAll();
      all.onsuccess = () => resolve(all.result);
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  });
  const all = [];
  for (const item of data) if (Array.isArray(item.data)) for (const t of item.data) all.push(t);
  const seen = new Set();
  const uniq = [];
  for (const t of all) if (t?.task?.id && !seen.has(t.task.id)) { seen.add(t.task.id); uniq.push(t); }
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  return uniq
    .filter(t => t.task.type === "m2v_omni_video" && t.task.createTime > cutoff)
    .map(t => {
      const args = t.task.taskInfo?.arguments || [];
      const prompt = args.find(a => a.name === "prompt")?.value || "";
      const url = t.works?.[0]?.resource?.resource || null;
      return { taskId: t.task.id, createTime: t.task.createTime, status: t.task.status, prompt, url };
    })
    .filter(t => t.url);
});

await browser.close();

// Filter: clip 14 mentions Papa + Joe + bushes/grill, and is roughly clip-14-length prompt.
// Be permissive — show anything that looks like a clip-14 candidate.
const clip14Candidates = tasks.filter(t => {
  const p = t.prompt.toLowerCase();
  const hasPapa = p.includes("papa") || p.includes("element1") || p.includes("element2");
  const hasJoe = p.includes("joe") || p.includes("pomeranian") || p.includes("hot dog");
  const hasContext = p.includes("bush") || p.includes("apron") || p.includes("grill");
  return hasPapa && hasJoe && hasContext;
});

console.log(`📦 ${tasks.length} total completed Omni tasks (last 48h)`);
console.log(`🎯 ${clip14Candidates.length} clip-14 candidates (Papa + Joe + bush/apron/grill):\n`);

clip14Candidates.sort((a, b) => b.createTime - a.createTime);
for (const t of clip14Candidates) {
  const ts = new Date(t.createTime).toLocaleString();
  const isRage = /thunder|apoplectic|JOOOOO|trembl|outrage|rage/i.test(t.prompt);
  const isCalm = /calm exasperated|comic-dad GASP|FIRMLY ON ALL FOUR PAWS|Oh JOOOE|reluctant grin/i.test(t.prompt);
  const flag = isCalm ? "✅ CALMER" : isRage ? "❌ RAGE" : "❓ unclear";
  console.log(`  ${flag}  taskId=${t.taskId}  ${ts}`);
  console.log(`         ${t.prompt.slice(0, 200)}...`);
  console.log(`         ${t.url}`);
  console.log();
}
