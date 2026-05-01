import { chromium } from "playwright";
const browser = await chromium.connectOverCDP("http://127.0.0.1:9222", { timeout: 30000 });
const ctx = browser.contexts()[0];
const page = ctx.pages().find(p => p.url().includes("kling.ai")) || ctx.pages()[0];
await page.bringToFront();
const tasks = await page.evaluate(async () => {
  const data = await new Promise((resolve, reject) => {
    const req = indexedDB.open('request_data_cache');
    req.onsuccess = () => {
      const tx = req.result.transaction('task-feeds', 'readonly');
      const all = tx.objectStore('task-feeds').getAll();
      all.onsuccess = () => resolve(all.result);
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  });
  const all = [];
  for (const item of data) if (Array.isArray(item.data)) for (const t of item.data) all.push(t);
  const seen = new Set();
  const unique = [];
  for (const t of all) if (t?.task?.id && !seen.has(t.task.id)) { seen.add(t.task.id); unique.push(t); }
  unique.sort((a, b) => (b.task.createTime || 0) - (a.task.createTime || 0));
  return unique
    .filter(t => t.task.type === 'm2v_omni_video')
    .slice(0, 8)
    .map(t => {
      const args = t.task.taskInfo?.arguments || [];
      const promptArg = args.find(a => a.name === 'prompt');
      return {
        taskId: t.task.id,
        createTime: t.task.createTime,
        status: t.task.status,
        hasOutput: !!(t.works?.length && t.works[0].resource?.resource),
        prompt: (promptArg?.value || "").replace(/\s+/g, ' ').trim().slice(0, 200),
      };
    });
});
await browser.close();
for (const t of tasks) {
  const ts = new Date(t.createTime).toISOString().slice(11, 19);
  console.log(`[${ts}] status=${t.status} output=${t.hasOutput ? 'YES' : 'no '} ${t.taskId}`);
  console.log(`  ${t.prompt.slice(0, 180)}`);
}
