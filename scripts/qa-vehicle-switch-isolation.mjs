/**
 * Hand-test: vehicle switch hard isolation (real user + real /api/chat).
 *
 *   node --env-file=.env.e2e.local scripts/qa-vehicle-switch-isolation.mjs
 *
 * Defaults to local Next (PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000).
 * Captures POST /api/chat bodies to prove pre-switch turns never leave the client.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3000";
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
if (!email || !password) {
  console.error("Need E2E_EMAIL / E2E_PASSWORD");
  process.exit(1);
}

const outDir = path.join(process.cwd(), "tmp/vehicle-switch-qa");
fs.mkdirSync(outDir, { recursive: true });

/** @type {Array<{ url: string; body: any; at: string }>} */
const chatPosts = [];

async function dismissOverlays(page) {
  const agree = page.getByRole("button", { name: /Agree|I agree|Accept/i });
  if (await agree.count()) await agree.first().click().catch(() => {});
  const close = page.getByRole("button", { name: /^Close$|^Dismiss$/i });
  if (await close.count()) await close.first().click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function waitGarageReady(page) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (!/Loading your garage/i.test(text) && (await page.locator("textarea").count()) > 0) {
      return;
    }
    if (!/Loading your garage/i.test(text) && /Tap to switch vehicle|Chat/i.test(text)) {
      return;
    }
    await page.waitForTimeout(800);
  }
}

async function openChat(page) {
  await page.goto(`${BASE}/app?tab=chat`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await waitGarageReady(page);
  await dismissOverlays(page);
  const chatTab = page
    .locator('[role="tab"], a, button')
    .filter({ hasText: /^Chat$/i });
  if (await chatTab.count()) await chatTab.first().click().catch(() => {});
  await dismissOverlays(page);
  // Close vehicle sheet if still covering composer
  if (await page.getByText(/Archive|Delete profile|Edit profile/i).count()) {
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(400);
  }
  const ta = page.locator("textarea").first();
  await ta.waitFor({ state: "attached", timeout: 90_000 });
  await ta
    .evaluate((el) => el.scrollIntoView({ block: "center" }))
    .catch(() => {});
  await page.waitForFunction(
    () => {
      const el = document.querySelector("textarea");
      if (!el || el.disabled) return false;
      const r = el.getBoundingClientRect();
      return r.width > 40 && r.height > 16;
    },
    null,
    { timeout: 90_000 },
  );
}

async function login(page) {
  await page.goto(`${BASE}/login?next=/app%3Ftab%3Dchat`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(800);
  const emailInput = page.getByTestId("login-email");
  await emailInput.waitFor({ state: "visible", timeout: 60_000 });
  await emailInput.fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  // Auth may briefly stay on /login while "Loading your garage…"
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText || "";
      return (
        location.pathname.startsWith("/app") ||
        /Loading your garage|Tap to switch vehicle|Unlimited/i.test(t)
      );
    },
    null,
    { timeout: 90_000 },
  );
  await waitGarageReady(page);
  if (!page.url().includes("/app")) {
    await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  }
  await openChat(page);
}

async function switchVehicle(page, re) {
  const dialog = page.getByRole("dialog", { name: /Switch vehicle/i });
  const dialogOpen = await dialog.isVisible().catch(() => false);
  if (!dialogOpen) {
    await dismissOverlays(page);
    const open = page.getByTestId("chat-vehicle-switcher-open");
    await open.click({ timeout: 20_000 });
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
  }
  await page.waitForTimeout(400);
  // Garage row inside the sheet — exclude Edit/Archive/Delete.
  const target = dialog
    .locator("button")
    .filter({ hasText: re })
    .filter({ hasNotText: /Edit profile|Archive|Delete/i })
    .first();
  await target.waitFor({ state: "visible", timeout: 20_000 });
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const label = ((await target.innerText()) || "").replace(/\s+/g, " ").slice(0, 80);
  console.log("  selecting:", label);
  await target.click();
  // Do NOT full-reload /app here — that can race is_current and undo the switch.
  await page.waitForFunction(
    (needle) => {
      const open = document.querySelector(
        '[data-testid="chat-vehicle-switcher-open"]',
      );
      const t = (open?.textContent || "") + "\n" + (document.body?.innerText || "");
      return new RegExp(needle, "i").test(t);
    },
    // Use a simple token from the regex source when possible
    typeof re === "string" ? re : re.source.replace(/^\^|\$$/g, "").split("|")[0],
    { timeout: 30_000 },
  );
  await page.waitForTimeout(1200);
  const toast = page.getByTestId("chat-vehicle-isolated-toast");
  const toastVisible = await toast.isVisible().catch(() => false);
  await dismissOverlays(page);
  await waitComposerReady(page);
  const header = await page
    .getByTestId("chat-vehicle-switcher-open")
    .innerText()
    .catch(() => "");
  console.log("  header now:", header.replace(/\s+/g, " ").slice(0, 80));
  return { toastVisible, header };
}

async function waitComposerReady(page) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const ta = page.locator("textarea").first();
    const visible = await ta.isVisible().catch(() => false);
    const disabled = await ta.isDisabled().catch(() => true);
    if (visible && !disabled) return ta;
    await page.waitForTimeout(500);
  }
  throw new Error("Chat composer never became ready");
}

async function sendChat(page, text) {
  await dismissOverlays(page);
  const ta = await waitComposerReady(page);
  await ta.click();
  await ta.fill("");
  await ta.fill(text);
  const before = chatPosts.length;
  // Mobile composer: Enter submits when enabled.
  await ta.press("Enter");
  await page.waitForTimeout(400);
  if (chatPosts.length <= before) {
    const sendBtn = page.getByRole("button", { name: /^Send$/i });
    if (await sendBtn.count()) await sendBtn.first().click().catch(() => {});
    else {
      // Fallback: click first enabled button after the textarea.
      const near = page
        .locator("textarea")
        .locator("xpath=following::button[not(@disabled)][1]");
      if (await near.count()) await near.first().click({ force: true }).catch(() => {});
    }
  }

  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline && chatPosts.length <= before) {
    await page.waitForTimeout(400);
  }
  if (chatPosts.length <= before) {
    throw new Error(`No /api/chat POST captured for: ${text.slice(0, 60)}`);
  }
  const post = chatPosts[chatPosts.length - 1];

  const start = Date.now();
  let reply = "";
  const needle = text.slice(0, 36);
  while (Date.now() - start < 150_000) {
    const body = await page.locator("body").innerText();
    const idx = body.lastIndexOf(needle);
    const after = idx >= 0 ? body.slice(idx + needle.length) : "";
    const taDisabled = await page
      .locator("textarea")
      .first()
      .isDisabled()
      .catch(() => true);
    const stopVisible = await page
      .getByRole("button", { name: /Stop generating/i })
      .isVisible()
      .catch(() => false);
    if (after.length > 280 && !taDisabled && !stopVisible) {
      await page.waitForTimeout(2500);
      const body2 = await page.locator("body").innerText();
      const idx2 = body2.lastIndexOf(needle);
      reply = idx2 >= 0 ? body2.slice(idx2).slice(0, 4000) : after.slice(0, 4000);
      break;
    }
    await page.waitForTimeout(1000);
  }
  return { post, reply };
}

function messagesBlob(body) {
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  return msgs
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n---\n");
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL || "chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

page.on("request", (req) => {
  if (req.method() !== "POST") return;
  if (!/\/api\/chat(?:\?|$)/.test(req.url())) return;
  let body = null;
  try {
    body = req.postDataJSON();
  } catch {
    body = { raw: req.postData() };
  }
  chatPosts.push({ url: req.url(), body, at: new Date().toISOString() });
});

try {
  console.log("Login", email, "→", BASE);
  await login(page);

  // --- 1) Corolla oil / drain plug ---
  console.log("\n[1] Switch to Corolla…");
  await switchVehicle(page, /Corolla/i);
  const oilQ =
    "I need an oil change on this Corolla — walk me through the drain plug and oil filter steps.";
  console.log("[1] Send oil/drain plug…");
  const oil = await sendChat(page, oilQ);
  fs.writeFileSync(path.join(outDir, "01_corolla_oil_reply.txt"), oil.reply);
  fs.writeFileSync(
    path.join(outDir, "01_corolla_oil_request.json"),
    JSON.stringify(oil.post.body, null, 2),
  );
  assert(
    /drain|filter|oil/i.test(oil.reply),
    "Corolla oil reply should mention drain/filter/oil",
  );
  results.push({ id: "corolla_oil", pass: true });

  // --- 2) Same-car follow-up must KEEP history (no false isolation) ---
  console.log("\n[2] Same-car follow-up (must not wipe history)…");
  const followQ = "What torque should I use on the drain plug if the manual lists it?";
  const follow = await sendChat(page, followQ);
  fs.writeFileSync(
    path.join(outDir, "02_same_car_request.json"),
    JSON.stringify(follow.post.body, null, 2),
  );
  const followBlob = messagesBlob(follow.post.body);
  const sameCarOk =
    follow.post.body?.vehicleThreadReset !== true &&
    follow.post.body?.vehicleChanged !== true &&
    (followBlob.includes("oil change") ||
      followBlob.includes("drain plug") ||
      (Array.isArray(follow.post.body?.messages) &&
        follow.post.body.messages.length >= 2));
  assert(sameCarOk, "Same-car turn incorrectly isolated or dropped prior turns");
  results.push({ id: "same_car_keeps_history", pass: true });

  // --- 3) Switch to Camry LE + Putco / quarts ---
  console.log("\n[3] Switch to 2019 Camry LE…");
  const sw = await switchVehicle(page, /2019 Toyota Camry|Camry LE/i);
  fs.writeFileSync(
    path.join(outDir, "03_toast.json"),
    JSON.stringify({ toastVisible: sw.toastVisible }, null, 2),
  );

  const putcoQ = "Will Putco lights fit? Also how many quarts of oil do I need?";
  console.log("[3] Send Putco/quarts on Camry…");
  const putco = await sendChat(page, putcoQ);
  fs.writeFileSync(path.join(outDir, "03_camry_reply.txt"), putco.reply);
  fs.writeFileSync(
    path.join(outDir, "03_camry_request.json"),
    JSON.stringify(putco.post.body, null, 2),
  );

  const b = putco.post.body || {};
  const blob = messagesBlob(b);
  const isolatedFlag =
    b.vehicleThreadReset === true ||
    b.vehicleChanged === true ||
    (b.previousVehicleId &&
      b.selectedVehicleId &&
      b.previousVehicleId !== b.selectedVehicleId);

  assert(
    /Camry/i.test(b.currentVehicle?.model || ""),
    `Expected Camry after switch, got ${b.currentVehicle?.make} ${b.currentVehicle?.model}`,
  );
  assert(isolatedFlag, "Camry turn missing vehicleThreadReset / previousVehicleId");
  assert(
    !/Corolla/i.test(blob),
    "Camry /api/chat messages still contain Corolla",
  );
  assert(
    !/drain plug/i.test(blob),
    "Camry /api/chat messages still contain drain plug narrative",
  );
  assert(
    !/oil filter steps/i.test(blob),
    "Camry /api/chat messages still contain oil filter steps",
  );
  assert(
    Array.isArray(b.messages) && b.messages.length === 1,
    `Expected exactly 1 history message after switch, got ${b.messages?.length}`,
  );
  assert(
    b.conversationFocus?.previous == null,
    "conversationFocus.previous must be null after switch",
  );
  assert(
    !b.maintenanceSummary,
    "maintenanceSummary must not ride along on switch turn",
  );

  const replyLeak =
    /on the Corolla|Corolla drain|for your Corolla/i.test(putco.reply) ||
    (/drain plug/i.test(putco.reply) &&
      /oil filter/i.test(putco.reply) &&
      /step\s*1/i.test(putco.reply) &&
      !/Camry/i.test(putco.reply));
  assert(!replyLeak, "Assistant reply continued Corolla oil DIY after switch");

  assert(
    /Camry|oil|quart|Putco|light|bulb|manual|garage|fit/i.test(putco.reply),
    "Camry reply looked empty/unrelated",
  );

  results.push({
    id: "switch_isolation_request",
    pass: true,
    toastVisible: sw.toastVisible,
    msgCount: b.messages.length,
    vehicleThreadReset: b.vehicleThreadReset,
    previousVehicleId: b.previousVehicleId,
  });
  results.push({ id: "switch_isolation_reply", pass: true });

  // --- 4) Twin Camrys: switch to the other Camry — mileage must not carry ---
  console.log("\n[4] Twin Camry switch (2019 LE → 2021 SE)…");
  const twin = await switchVehicle(page, /2021 Toyota Camry|Camry SE/i);
  const milesQ = "Based only on this car, what mileage should I use for service intervals?";
  const twinTurn = await sendChat(page, milesQ);
  fs.writeFileSync(
    path.join(outDir, "04_twin_camry_request.json"),
    JSON.stringify(twinTurn.post.body, null, 2),
  );
  fs.writeFileSync(path.join(outDir, "04_twin_camry_reply.txt"), twinTurn.reply);
  const tb = twinTurn.post.body || {};
  const tblob = messagesBlob(tb);
  assert(
    tb.vehicleThreadReset === true ||
      (tb.previousVehicleId &&
        tb.selectedVehicleId &&
        tb.previousVehicleId !== tb.selectedVehicleId),
    "Twin Camry switch missing isolation flags",
  );
  assert(
    Array.isArray(tb.messages) && tb.messages.length === 1,
    "Twin Camry switch must send only latest user turn",
  );
  assert(
    !/62,?400|95,?000|Corolla|drain plug/i.test(tblob),
    "Twin Camry request still carries other vehicle mileage/narrative",
  );
  results.push({
    id: "twin_camry_isolation",
    pass: true,
    toastVisible: twin.toastVisible,
    previousVehicleId: tb.previousVehicleId,
    selectedVehicleId: tb.selectedVehicleId,
  });

  console.log("\nALL CHECKS PASSED");
} catch (err) {
  console.error("\nQA FAILED:", err?.message || err);
  await page
    .screenshot({
      path: path.join(outDir, "error.png"),
      fullPage: true,
    })
    .catch(() => {});
  results.push({
    id: "fatal",
    pass: false,
    error: String(err?.message || err),
  });
  process.exitCode = 1;
} finally {
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    email,
    results,
    chatPostCount: chatPosts.length,
  };
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}
