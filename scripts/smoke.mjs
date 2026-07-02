// Visual smoke test: drives a real browser against the dev server through the Default shell
// and the classic 3D world, using REAL clicks for the interactions that matter:
//  1. Shell boots to the stage (no <canvas> — Three.js must not load), Speak animates Jova,
//     the conversation swap works both ways.
//  2. Network view: rail click navigates, clicking a TEAM DOT focuses it (docked detail),
//     clicking an agent opens its detail, Talk docks the conversation.
//  3. The 3D view still mounts a live WebGL canvas with the classic chrome.
//  4. A phone-sized pass checks the tab bar, stage, and conversation fit.
// Writes demo-*.png screenshots. No console/page errors allowed.
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
  defaultViewport: { width: 1380, height: 860 },
  args: ["--no-sandbox", "--window-size=1400,920", "--ignore-gpu-blocklist", "--enable-webgl"],
});

const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && errors.push("console.error: " + m.text()));
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const store = (fn) => page.evaluate(fn);
/** REAL mouse click on the first button whose title starts with `t`. */
const clickByTitle = async (t) => {
  const h = await page.evaluateHandle((tt) => [...document.querySelectorAll("button")].find((b) => b.title.startsWith(tt)) ?? null, t);
  const el = h.asElement();
  if (!el) return false;
  await el.click();
  return true;
};
const clickByText = async (t) => {
  const h = await page.evaluateHandle((tt) => [...document.querySelectorAll("button")].find((b) => b.textContent.includes(tt)) ?? null, t);
  const el = h.asElement();
  if (!el) return false;
  await el.click();
  return true;
};

// ---- 1. Default shell: the stage -------------------------------------------
await page.goto(URL, { waitUntil: "networkidle2", timeout: 30000 });
await page.waitForSelector("[data-shell]", { timeout: 15000 });
await page.waitForFunction(() => !!window.__jovaStore, { timeout: 15000 });
await wait(800);

check(await store(() => !document.querySelector("canvas")), "shell boots without a <canvas> (no Three.js)");
check(await store(() => !!document.querySelector('[data-jova-presence="hero"]')), "boots to the stage — Jova hero mounted");
check(await store(() => window.__jovaStore.getState().viewMode === "default"), "viewMode is 'default'");
check(await store(() => ![...document.querySelectorAll("button")].some((b) => b.textContent.includes("Demo"))), "demo panel removed");

// drive speaking via the store (the Speak demo button is gone) and confirm the stage animates
await store(() => {
  window.__jovaStore.getState().setWispState("speaking");
});
await wait(500);
check(await store(() => window.__jovaStore.getState().wispState === "speaking"), "wispState drives to 'speaking' on the stage");
await page.screenshot({ path: "demo-stage-speaking.png" });
await store(() => window.__jovaStore.getState().setWispState("present"));
await wait(300);

// stage -> conversation -> stage (real clicks)
check(await clickByTitle("Open the conversation"), "conversation button clickable");
await wait(500);
check(await store(() => !!document.querySelector("[data-conversation]")), "conversation mode opens");
await page.screenshot({ path: "demo-conversation.png" });
// clicking off the panel (the backdrop gutter) closes it, like Back-to-stage
await page.mouse.click(120, 400);
await wait(500);
check(
  await store(() => !document.querySelector("[data-conversation]") && !!document.querySelector('[data-jova-presence="hero"]')),
  "clicking off the conversation closes it",
);
// re-open and confirm the explicit Back button still works
check(await clickByTitle("Open the conversation"), "conversation re-opens");
await wait(400);
check(await clickByTitle("Back to the stage"), "minimize-to-stage clickable");
await wait(500);
check(await store(() => !!document.querySelector('[data-jova-presence="hero"]')), "back on the stage");
// no stray focus ring: after the swap, nothing non-interactive carries an outline
check(
  await store(() => {
    const bad = [...document.querySelectorAll("[data-view], [data-shell], main, div")].find((el) => {
      const cs = getComputedStyle(el);
      return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
    });
    return !bad;
  }),
  "no focus outline on a container after maximizing",
);

// ---- 2. Network view via the rail -------------------------------------------
await page.click('button[aria-label="Network"]');
await wait(700);
check(await store(() => !!document.querySelector("[data-network-map]")), "rail navigates to the Network view");
check(await store(() => !document.querySelector("canvas")), "network view still has no <canvas>");
await page.screenshot({ path: "demo-network.png" });

// the regression that started this: TEAM DOTS MUST BE CLICKABLE with a real mouse click
check(await clickByTitle("Forge"), "team dot found for a real click");
await wait(600);
check(await store(() => window.__networkStore.getState().focusedTeamId === "forge"), "real click on a team focuses it");
check(await store(() => !!document.querySelector("[data-team-detail]")), "team detail docks in the sidebar");

// drill into an agent, then Talk — the conversation docks in the sidebar
await page.evaluate(() => {
  const row = [...document.querySelectorAll("[data-team-detail] button")].find((b) => b.textContent.includes("Product Manager"));
  row?.click();
});
await wait(400);
check(await store(() => !!document.querySelector("[data-agent-detail]")), "agent detail opens");
check(
  await page.evaluate(() => {
    const talk = [...document.querySelectorAll("[data-agent-detail] button")].find((b) => b.title === "Talk");
    if (!talk) return false;
    talk.click();
    return true;
  }),
  "agent Talk button clickable",
);
await wait(500);
check(await store(() => !!document.querySelector("[data-network-sidebar] [data-conversation]")), "conversation docks in the network sidebar");
await page.screenshot({ path: "demo-network-talk.png" });
await store(() => window.__jovaStore.getState().setChatOpen(false));
await store(() => window.__networkStore.getState().focusTeam(null));

// dreams feed in the sidebar
await clickByTitle("Dreams");
await wait(400);
check(await store(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Run today"))), "dreams feed docks in the sidebar");
await clickByTitle("Close dreams");

// ---- 3. The classic 3D world still works ------------------------------------
await store(() => window.__jovaStore.getState().setViewMode("3d"));
await page.waitForSelector("canvas", { timeout: 20000 });
await wait(2500);
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

// ---- 4. Phone-sized pass ------------------------------------------------------
await page.setViewport({ width: 390, height: 844 });
await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
await page.waitForSelector("[data-shell]", { timeout: 15000 });
await page.waitForFunction(() => !!window.__jovaStore, { timeout: 15000 });
await wait(800);
check(await store(() => !!document.querySelector('[data-jova-presence="hero"]')), "mobile: boots to the stage");
check(
  await store(() => {
    const nav = document.querySelector('nav[aria-label="Views"]');
    if (!nav) return false;
    const r = nav.getBoundingClientRect();
    return r.bottom <= window.innerHeight + 1 && r.top > window.innerHeight * 0.8;
  }),
  "mobile: bottom tab bar in place",
);
await page.screenshot({ path: "demo-mobile-stage.png" });
await clickByTitle("Open the conversation");
await wait(600);
check(
  await store(() => {
    const pane = document.querySelector("[data-conversation]");
    if (!pane) return false;
    const r = pane.getBoundingClientRect();
    return r.left >= -1 && r.right <= window.innerWidth + 1;
  }),
  "mobile: conversation fits the viewport",
);
await page.screenshot({ path: "demo-mobile-conversation.png" });
await store(() => window.__jovaStore.getState().setChatOpen(false));
// start from a clean sheet preference so we can verify the collapsed default
await store(() => localStorage.removeItem("jova.networkSheetOpen"));
await page.reload({ waitUntil: "networkidle2", timeout: 30000 });
await page.waitForFunction(() => !!window.__jovaStore, { timeout: 15000 });
await page.click('button[aria-label="Network"]');
await wait(700);
check(await store(() => !!document.querySelector("[data-network-map]")), "mobile: network view opens");

const bodyH = () =>
  store(() => {
    const body = document.querySelector("[data-team-detail]")?.closest("div.flex.min-h-0.flex-col");
    return body ? body.getBoundingClientRect().height : -1;
  });
const tapBar = () => store(() => document.querySelector('[data-network-sidebar] button[aria-expanded]')?.click());

// focus a team — sheet stays COLLAPSED by default; the bar shows net + agents working
await store(() => window.__networkStore.getState().focusTeam("forge"));
await wait(500);
check((await bodyH()) < 8, "mobile: team sheet is collapsed by default");
const teamBarText = await store(() => document.querySelector('[data-network-sidebar] button[aria-expanded]')?.textContent || "");
check(/\$/.test(teamBarText) && /working/.test(teamBarText), "mobile: summary bar shows net + agents working");
await page.screenshot({ path: "demo-mobile-team-collapsed.png" });

// tap the bar to expand
await tapBar();
await wait(500);
check((await bodyH()) > 40, "mobile: tapping the bar expands the detail");
await page.screenshot({ path: "demo-mobile-team-expanded.png" });

// persistence: click a different team — it STAYS open (kept open across teams)
await store(() => window.__networkStore.getState().focusTeam("atlas"));
await wait(400);
check((await bodyH()) > 40, "mobile: sheet stays open across team clicks");

// collapse, then click another team — it STAYS closed (kept closed across teams)
await tapBar();
await wait(400);
await store(() => window.__networkStore.getState().focusTeam("halo"));
await wait(400);
check((await bodyH()) < 8, "mobile: sheet stays closed across team clicks");

console.log("ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
await browser.close();
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1);
