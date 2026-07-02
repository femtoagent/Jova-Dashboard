// Visual smoke test: drives a real browser against the dev server and walks BOTH renderers.
//  1. Default (2D) view boots with no <canvas> (Three.js must not load), Jova's presence mounts,
//     Speak animates her, the network board appears in full mode and team focus works.
//  2. Switching the view toggle to 3D mounts the WebGL scene (canvas + live GL context).
//  3. A phone-sized pass asserts the default view + chat chrome fit a small viewport.
// Writes demo-*.png screenshots. No console/page errors allowed anywhere.
// Usage: npm run dev (in another shell), then `npm run smoke`.
// Env: CHROME_PATH (browser exe), SMOKE_URL (default http://localhost:3000/), HEADLESS=1.
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
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
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  if (!ok) failures.push(label);
};

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
const store = (fn) => page.evaluate(fn);

// ---- 1. Default (2D) view --------------------------------------------------
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForSelector('[data-stage="default"]', { timeout: 15000 });
await page.waitForFunction(() => !!window.__jovaStore, { timeout: 15000 });

check(await store(() => !document.querySelector("canvas")), "default view boots without a <canvas> (no Three.js)");
check(await store(() => !!document.querySelector('[data-jova-presence="hero"]')), "Jova presence (hero) mounted");
check(await store(() => window.__jovaStore.getState().viewMode === "default"), "viewMode is 'default'");

// walk her through speaking via the Demo panel
await store(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "Speak");
  if (b) b.click();
});
await wait(800);
check(await store(() => window.__jovaStore.getState().wispState === "speaking"), "Speak drives wispState to 'speaking'");
await page.screenshot({ path: "demo-default-speaking.png" });
await wait(3200); // Speak test settles back to present

// ---- 2. Network (full mode) on the 2D board --------------------------------
await store(() => window.__jovaStore.getState().setFullMode(true));
await wait(600);
check(await store(() => !!document.querySelector("[data-network-board]")), "network board mounted in full mode");
check(await store(() => !document.querySelector("canvas")), "full mode in default view still has no <canvas>");
check(await store(() => !!document.querySelector('[data-jova-presence="docked"]')), "Jova docked in the corner");
await page.screenshot({ path: "demo-network-2d.png" });

// focus a team through the board and confirm the shared selection state + panel follows
await store(() => window.__networkStore.getState().focusTeam("forge"));
await wait(700);
check(await store(() => window.__networkStore.getState().focusedTeamId === "forge"), "team focus lands in the network store");
check(
  await store(() => [...document.querySelectorAll("div")].some((d) => d.textContent === "Forge")),
  "focused team close-up renders",
);
await page.screenshot({ path: "demo-team-focus-2d.png" });
await store(() => window.__networkStore.getState().focusTeam(null));

// ---- 3. The 3D view still works --------------------------------------------
await store(() => window.__jovaStore.getState().setViewMode("3d"));
await page.waitForSelector("canvas", { timeout: 20000 });
await wait(2500); // let the scene compile/settle
const gl = await store(() => {
  const c = document.querySelector("canvas");
  let ok = false;
  try {
    ok = !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {}
  return ok;
});
check(gl, "3D view mounts a live WebGL canvas");
await page.screenshot({ path: "demo-3d.png" });
await store(() => window.__jovaStore.getState().setViewMode("default"));
await wait(400);

// ---- 4. Phone-sized pass ----------------------------------------------------
await page.setViewport({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
await page.waitForSelector('[data-stage="default"]', { timeout: 15000 });
await page.waitForFunction(() => !!window.__jovaStore, { timeout: 15000 });
await wait(600);
check(await store(() => !!document.querySelector('[data-jova-presence="hero"]')), "mobile: presence mounted");
// a fresh load opens the chat (createSession does) — the pane must fit the phone viewport
check(
  await store(() => {
    const pane = document.querySelector("[data-chat-pane]");
    if (!pane) return false;
    const r = pane.getBoundingClientRect();
    return r.left >= 0 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
  }),
  "mobile: chat pane fits the viewport",
);
await page.screenshot({ path: "demo-mobile-chat.png" });
// collapsed, the pill must sit inside the viewport
await store(() => window.__jovaStore.getState().setChatOpen(false));
await wait(400);
check(
  await store(() => {
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Chat"));
    if (!btn) return false;
    const r = btn.getBoundingClientRect();
    return r.bottom <= window.innerHeight && r.width > 0;
  }),
  "mobile: chat button visible inside the viewport",
);
await page.screenshot({ path: "demo-mobile.png" });

console.log("ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
await browser.close();
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1);
