// Visual smoke test: drives a real browser against the dev server, asserts the scene mounts
// with WebGL and no console errors, walks the wisp through its states, and writes demo-*.png.
// Usage: npm run dev (in another shell), then `npm run smoke`.
// Env: CHROME_PATH (browser exe), SMOKE_URL (default http://localhost:3000/), HEADLESS=1.
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const exe = CANDIDATES.find((p) => existsSync(p));
if (!exe) {
  console.error("No Chrome/Edge found. Set CHROME_PATH to a browser executable.");
  process.exit(2);
}

const URL = process.env.SMOKE_URL || "http://localhost:3000/";
const errors = [];
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: process.env.HEADLESS === "1",
  defaultViewport: { width: 1280, height: 800 },
  args: ["--no-sandbox", "--window-size=1300,860"],
});

const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && errors.push("console.error: " + m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getState = () =>
  page.evaluate(() => window.__jovaStore?.getState?.().wispState ?? null);
const clickByText = (txt) =>
  page.evaluate((t) => {
    const el = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
    if (el) el.click();
    return !!el;
  }, txt);

await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForSelector("canvas", { timeout: 15000 });

const info = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  let gl = null;
  try {
    gl = c.getContext("webgl2") || c.getContext("webgl");
  } catch {}
  return { hasCanvas: !!c, glOk: !!gl };
});

const timeline = [];
for (let i = 0; i < 8; i++) {
  await wait(500);
  timeline.push(`${((i + 1) * 0.5).toFixed(1)}s: ${await getState()}`);
}
await page.screenshot({ path: "demo-present.png" });

await clickByText("Light orb");
await wait(1600);
await page.screenshot({ path: "demo-orb.png" });

await clickByText("Blue flame");
await clickByText("Recede");
await wait(3200);
const recedeState = await getState();
await page.screenshot({ path: "demo-recede.png" });

await clickByText("Approach");
await wait(2800);
await clickByText("Speak");
await wait(900);
await page.screenshot({ path: "demo-speaking.png" });

console.log("INFO:", JSON.stringify(info));
console.log("recede state:", recedeState);
console.log("TIMELINE:\n" + timeline.join("\n"));
console.log("ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
await browser.close();
process.exit(info.glOk && errors.length === 0 ? 0 : 1);
