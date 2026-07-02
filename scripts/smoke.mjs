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
const store = (fn, ...args) => page.evaluate(fn, ...args);
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

// closing a Nexus chat returns to the Network panel — NOT to Jova
await wait(300);
check(await clickByText("Talk to Nexus"), "Talk to Nexus opens a chat");
await wait(500);
check(await store(() => !!document.querySelector("[data-network-sidebar] [data-conversation]")), "Nexus chat docks in the sidebar");
check(await clickByTitle("Close this chat"), "Nexus chat close button clickable");
await wait(500);
check(
  await store(() => window.__jovaStore.getState().chatOpen === false && !document.querySelector("[data-conversation]")),
  "closing Nexus returns to the Network panel (not Jova)",
);

// dreams feed in the sidebar
await clickByTitle("Dreams");
await wait(400);
check(await store(() => [...document.querySelectorAll("button")].some((b) => b.textContent.includes("Run today"))), "dreams feed docks in the sidebar");
await clickByTitle("Close dreams");

// ---- 2b. The Team Room (gamified office) -------------------------------------
await store(() => window.__networkStore.getState().focusTeam("forge"));
await wait(700);
check(await store(() => !!document.querySelector("[data-team-room]")), "focusing a team enters its office");
check(await store(() => !!document.querySelector("[data-office-backdrop]")), "office backdrop renders");
check(
  await store(() => {
    const team = window.__networkStore.getState().teams.find((t) => t.id === "forge");
    return document.querySelectorAll("[data-agent-desk]").length === team.agents.length;
  }),
  "one desk per agent",
);
check(await store(() => !!document.querySelector("[data-initiative-board]")), "initiatives board on the wall");
check(await store(() => !!document.querySelector("[data-demo-board]")), "demo board on the wall");

// idle vs active + the work pile: drive a task on a known agent
const dev = await store(() => {
  const t = window.__networkStore.getState().teams.find((x) => x.id === "forge");
  const a = t.agents.find((x) => x.role === "developer") ?? t.agents[1];
  // clear existing tasks so the assertions are deterministic
  for (const task of [...a.tasks]) window.__networkStore.getState().completeTask(t.id, a.id, task.id);
  return a.id;
});
await wait(900); // let fly-off ghosts clear
check(
  await store((id) => document.querySelector(`[data-agent-desk][data-agent-id="${id}"]`)?.dataset.active === "false", dev),
  "agent with no tasks reads idle",
);
const taskId = await store((id) => window.__networkStore.getState().startTask("forge", id, "Smoke the room", null), dev);
await wait(500);
check(
  await store(
    (a) => {
      const desk = document.querySelector(`[data-agent-desk][data-agent-id="${a.dev}"]`);
      return desk?.dataset.active === "true" && !!desk.querySelector(`[data-sheet][data-task-id="${a.taskId}"]`);
    },
    { dev, taskId },
  ),
  "starting a task pops a sheet + agent goes active",
);
await store((a) => window.__networkStore.getState().completeTask("forge", a.dev, a.taskId), { dev, taskId });
await wait(900);
// assert THIS task's sheet is gone (the live driver may have assigned fresh work meanwhile)
check(
  await store((id) => !document.querySelector(`[data-sheet][data-task-id="${id}"]`), taskId),
  "completing the task removes its sheet",
);

// initiative board: PM task pops on, then strikes through on completion
const pmTask = await store(() => {
  const t = window.__networkStore.getState().teams.find((x) => x.id === "forge");
  const pm = t.agents.find((x) => x.role === "pm");
  return { pm: pm.id, task: window.__networkStore.getState().startTask("forge", pm.id, "Ship the smoke feature", null) };
});
await wait(400);
check(
  await store(() => [...document.querySelectorAll('[data-initiative="open"]')].some((r) => r.textContent.includes("Ship the smoke feature"))),
  "new initiative pops onto the board",
);
await store((a) => window.__networkStore.getState().completeTask("forge", a.pm, a.task), pmTask);
await wait(400);
check(
  await store(() => [...document.querySelectorAll('[data-initiative="done"]')].some((r) => r.textContent.includes("Ship the smoke feature"))),
  "completed initiative is crossed out before dropping off",
);
check(await store(() => !!document.querySelector("[data-confetti-bomb]")), "shipping an initiative fires the PM's confetti bomb");

// handoff flight: the sender walks first, then the packet carries its sender, then clears
await store((id) => {
  const t = window.__networkStore.getState().teams.find((x) => x.id === "forge");
  const pm = t.agents.find((x) => x.role === "pm");
  window.__networkStore.getState().emitFlow({ teamId: "forge", fromAgentId: pm.id, toAgentId: id, taskId: "smoke-flight", taskTitle: "Flight test", kind: "assign" });
}, dev);
await wait(1150); // the sender walks ~920ms before the toss
check(
  await store(() => {
    const p = document.querySelector("[data-flow-packet]");
    return !!p && !!p.dataset.from && p.textContent.includes("from ");
  }),
  "handoff packet flies with a readable sender",
);
await page.screenshot({ path: "demo-team-room.png" });
await wait(1500);
// OUR flight must be gone (the live driver keeps emitting flows of its own)
check(
  await store(() => !window.__networkStore.getState().flows.some((f) => f.taskId === "smoke-flight")),
  "flight clears after landing",
);

// demo board: the TV turns on with a demo, opens the modal, dismiss clears OUR demo
await store(() => window.__networkStore.getState().addDemo("forge", "Smoke demo", "A demo produced by the smoke test.", "https://example.com/demo"));
await wait(300);
check(
  await store(() => {
    const tv = document.querySelector('[data-demo-board][data-on="true"]');
    if (!tv) return false;
    tv.click();
    return true;
  }),
  "demo TV turns on and is clickable",
);
await wait(300);
check(await store(() => !!document.querySelector("[data-demo-modal]") && document.body.textContent.includes("Smoke demo")), "demo modal opens with the demo");
await clickByText("Dismiss");
await wait(400);
check(
  await store(() => !window.__networkStore.getState().demos.some((d) => d.title === "Smoke demo")),
  "dismissing the demo clears it",
);
// the live driver may have readied its own demo meanwhile — close the modal + clear forge's list
await store(() => {
  document.querySelector("[data-demo-modal] button[title='Close']")?.click();
  const ns = window.__networkStore.getState();
  for (const d of ns.demos.filter((x) => x.teamId === "forge")) ns.resolveDemo(d.id);
});
await wait(300);

// character picker: choose a different crewmate through the real settings UI
await store((id) => window.__settingsStore.getState().openAgent("forge", id), dev);
await wait(500);
check(await store(() => !!document.querySelector("[data-character-picker]")), "character picker in the agent editor");
await store(() => [...document.querySelectorAll("[data-character-picker] button")].find((b) => b.textContent.includes("Umbra"))?.click());
await wait(200);
await clickByText("Save");
await wait(300);
await store(() => window.__settingsStore.getState().closeSettings());
await wait(400);
check(
  await store((id) => {
    const t = window.__networkStore.getState().teams.find((x) => x.id === "forge");
    return t.agents.find((a) => a.id === id)?.character === "umbra";
  }, dev),
  "picked character saves to the agent",
);

// the room is a setting: toggle off via the real Display screen -> map returns while focused
await store(() => window.__settingsStore.getState().openSettings("display"));
await wait(400);
await store(() => document.querySelector('[data-team-room-toggle] input')?.click());
await store(() => window.__settingsStore.getState().closeSettings());
await wait(400);
check(
  await store(() => !document.querySelector("[data-team-room]") && !!document.querySelector("[data-network-map]")),
  "toggle off returns the constellation while focused",
);
await store(() => window.__settingsStore.getState().openSettings("display"));
await wait(300);
await store(() => document.querySelector('[data-team-room-toggle] input')?.click());
await store(() => window.__settingsStore.getState().closeSettings());
await wait(400);
check(await store(() => !!document.querySelector("[data-team-room]")), "toggle back on restores the office");

// the glassboard zooms to a readable overlay
check(await clickByTitle("Initiatives — tap to read the board"), "glassboard tappable");
await wait(300);
check(await store(() => !!document.querySelector("[data-initiative-overlay]")), "glassboard zooms to a readable overlay");
await store(() => document.querySelector("[data-initiative-overlay] button[title='Close']")?.click());
await wait(300);
check(await store(() => !document.querySelector("[data-initiative-overlay]")), "board overlay closes");

// the demo TV is OFF with nothing to show (the earlier demo was dismissed)
check(await store(() => document.querySelector("[data-demo-board]")?.dataset.on === "false"), "demo TV is off when idle");

// walking handoff: the sender slides toward the receiver before the toss
const walkPair = await store(() => {
  const t = window.__networkStore.getState().teams.find((x) => x.id === "forge");
  const a = t.agents.find((x) => x.role === "developer") ?? t.agents[1];
  const b = t.agents.find((x) => x.role === "qa") ?? t.agents[2];
  window.__networkStore.getState().emitFlow({ teamId: "forge", fromAgentId: a.id, toAgentId: b.id, taskId: "walk-test", taskTitle: "Walk test", kind: "handoff" });
  return a.id;
});
await wait(300);
check(
  await store((id) => document.querySelector(`[data-agent-desk][data-agent-id="${id}"]`)?.dataset.walking === "true", walkPair),
  "handoff sender walks toward the receiver",
);
await wait(1500);
check(
  await store((id) => document.querySelector(`[data-agent-desk][data-agent-id="${id}"]`)?.dataset.walking === "false", walkPair),
  "sender walks back after the toss",
);

// Nexus tosses work in from OUTSIDE the window
await store((id) => {
  window.__networkStore.getState().emitFlow({ teamId: "forge", fromAgentId: null, toAgentId: id, taskId: "nexus-toss", taskTitle: "Nexus toss", kind: "assign" });
}, walkPair);
await wait(280);
check(await store(() => !!document.querySelector("[data-nexus-visitor]")), "Nexus orb appears at the window for its toss");
await wait(2100);
// assert OUR toss finished (the live driver may legitimately have Nexus visiting again already)
check(
  await store(() => !window.__networkStore.getState().flows.some((f) => f.taskId === "nexus-toss")),
  "Nexus toss completes and clears",
);

// the back chip returns to the map
check(await clickByTitle("Back to the network map"), "back chip clickable");
await wait(400);
check(
  await store(() => window.__networkStore.getState().focusedTeamId === null && !!document.querySelector("[data-network-map]")),
  "back chip returns to the network map",
);

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

// the Team Room on a phone: fills the map area, desks fit, back chip works
check(
  await store(() => {
    const room = document.querySelector("[data-team-room]");
    if (!room) return false;
    const r = room.getBoundingClientRect();
    return r.width <= window.innerWidth + 1 && document.querySelectorAll("[data-agent-desk]").length > 0;
  }),
  "mobile: team room fits the phone with desks laid out",
);
await page.screenshot({ path: "demo-mobile-team-room.png" });

// big roster on a phone: the room goes pannable with a Fit toggle instead of shrinking forever
await store(() => {
  const ns = window.__networkStore.getState();
  for (let i = 0; i < 5; i++) ns.addAgent("halo", "developer", `Crew ${i + 1}`);
  ns.focusTeam("halo");
});
await wait(700);
check(
  await store(() => document.querySelector("[data-team-room]")?.dataset.pannable === "true" && !!document.querySelector("[data-room-fit]")),
  "mobile: big roster makes the room pannable with a Fit toggle",
);
// drag the floor — the room pans (find a real patch of empty floor first; desks refuse to pan)
const floorSpot = await store(() => {
  const room = document.querySelector("[data-team-room]");
  const r = room.getBoundingClientRect();
  for (let y = r.top + 70; y < r.bottom - 24; y += 22) {
    for (let x = r.left + 12; x < r.right - 12; x += 22) {
      const el = document.elementFromPoint(x, y);
      if (el && el.closest("[data-team-room]") && !el.closest("[data-agent-desk],button")) return { x, y };
    }
  }
  return null;
});
check(!!floorSpot, "mobile: found empty floor to grab");
const panBefore = await store(() => window.getComputedStyle(document.querySelector("[data-team-room] > div:last-child")).transform);
if (floorSpot) {
  await page.mouse.move(floorSpot.x, floorSpot.y);
  await page.mouse.down();
  await page.mouse.move(floorSpot.x - 70, floorSpot.y - 50, { steps: 6 });
  await page.mouse.up();
}
await wait(300);
const panAfter = await store(() => window.getComputedStyle(document.querySelector("[data-team-room] > div:last-child")).transform);
check(panBefore !== panAfter, "mobile: dragging the floor pans the room");
await store(() => document.querySelector("[data-room-fit]")?.click());
await wait(400);
check(
  await store(() => {
    const t = window.__networkStore.getState().teams.find((x) => x.id === "halo");
    return document.querySelectorAll("[data-agent-desk]").length === t.agents.length;
  }),
  "mobile: Fit shows the whole big roster",
);
await page.screenshot({ path: "demo-mobile-team-room-big.png" });
await store(() => window.__networkStore.getState().focusTeam("halo"));
await wait(300);
check(await clickByTitle("Back to the network map"), "mobile: back chip returns to the map");

console.log("ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
await browser.close();
process.exit(failures.length === 0 && errors.length === 0 ? 0 : 1);
