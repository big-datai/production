#!/usr/bin/env node
/**
 * Export cookies + localStorage from the debug-port Chrome's Kling tab
 * to /tmp/kling-storage.json using raw CDP (no Playwright attach) so we
 * dodge the "Browser.setDownloadBehavior not supported" error.
 */
import fs from "node:fs";
import WebSocket from "ws";

const LIST = await fetch("http://127.0.0.1:9222/json").then((r) => r.json());
const kling = LIST.find((t) => t.type === "page" && t.url.includes("kling.ai"));
if (!kling) { console.error("No Kling tab"); process.exit(1); }
console.log(`📄 ${kling.url}`);

const ws = new WebSocket(kling.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.once("open", resolve);
  ws.once("error", reject);
});

let seq = 0;
const pending = new Map();
ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

// Get all cookies
const { cookies: raw } = await send("Network.getAllCookies");
// Playwright storage state format requires specific cookie shape
const cookies = raw.map((c) => ({
  name: c.name,
  value: c.value,
  domain: c.domain,
  path: c.path,
  expires: c.expires === -1 ? -1 : Math.floor(c.expires),
  httpOnly: c.httpOnly,
  secure: c.secure,
  sameSite: c.sameSite === "None" ? "None" : c.sameSite === "Lax" ? "Lax" : c.sameSite === "Strict" ? "Strict" : "Lax",
}));

// Get localStorage via Runtime.evaluate
const { result: lsResult } = await send("Runtime.evaluate", {
  expression: `
    (() => {
      const out = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        out.push({ name: k, value: localStorage.getItem(k) });
      }
      return JSON.stringify(out);
    })()
  `,
  returnByValue: true,
});
const ls = JSON.parse(lsResult.value);

const origin = new URL(kling.url).origin;
const state = {
  cookies,
  origins: [{ origin, localStorage: ls }],
};

fs.writeFileSync("/tmp/kling-storage.json", JSON.stringify(state, null, 2));
console.log(`✓ ${cookies.length} cookies + ${ls.length} localStorage entries → /tmp/kling-storage.json`);

ws.close();
