// Visual smoke for the 5 Jova hero forms: cycles jovaStyle through each, mounting (and thus
// compiling the shaders of) every form, exercises the "Speak" amplitude path, asserts WebGL is
// live and NO console/page errors fired (a GLSL compile error logs console.error), screenshots each.
// Usage: npm run dev (other shell), then: node scripts/smoke-forms.mjs  [HEADLESS=1] [CHROME_PATH=...]
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
].filter(Boolean);
const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) { console.error("No Chrome/Edge found. Set CHROME_PATH."); process.exit(2); }

const URL = process.env.SMOKE_URL || "http://localhost:3000/";
const STYLES = [
  "mycelium", "glyph", "medusa", "cocoon", "resonance", "mothership", "corona", "plasma", "singularity",
];
const errors = [];
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: process.env.HEADLESS === "1",
  defaultViewport: { width: 1280, height: 800 },
  args: ["--no-sandbox", "--window-size=1300,860", "--ignore-gpu-blocklist", "--enable-webgl"],
});
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && errors.push("console.error: " + m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

await page.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });
await page.waitForSelector("canvas", { timeout: 20000 });
const info = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  let gl = null;
  try { gl = c.getContext("webgl2") || c.getContext("webgl"); } catch {}
  return { hasCanvas: !!c, glOk: !!gl, hasStore: !!window.__jovaStore };
});

const perStyle = [];
for (const s of STYLES) {
  const before = errors.length;
  await page.evaluate((st) => window.__jovaStore.getState().setJovaStyle(st), s);
  await wait(700);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Speak");
    if (b) b.click();
  });
  await wait(1000);
  await page.screenshot({ path: `form-${s}.png` });
  const added = errors.slice(before);
  perStyle.push(`${s}: ${added.length ? "ERROR -> " + added.join(" | ") : "ok"}`);
}

// verify the Expand-Network view (Jova is now a compact Mycelium in the corner) renders cleanly
const beforeFull = errors.length;
await page.evaluate(() => window.__jovaStore.getState().setFullMode(true));
await wait(2000);
await page.screenshot({ path: "full-corner.png" });
perStyle.push(`full-mode (corner Mycelium): ${errors.slice(beforeFull).length ? "ERROR -> " + errors.slice(beforeFull).join(" | ") : "ok"}`);

console.log("INFO:", JSON.stringify(info));
console.log("PER-STYLE:\n" + perStyle.join("\n"));
console.log("TOTAL ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
await browser.close();
process.exit(info.glOk && info.hasStore && errors.length === 0 ? 0 : 1);
