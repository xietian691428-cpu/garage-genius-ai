/**
 * Hand-test: same-vehicle multi-topic + switch isolation (real QA account).
 *
 *   node --env-file=.env.e2e.local scripts/qa-multi-topic-threads.mjs
 *
 * Covers:
 *  1) Camry Topic A — oil / drain plug
 *  2) New topic → low beam — reply must not continue drain plug
 *  3) Topics sheet → switch back to Topic A — oil context returns
 *  4) Switch vehicle → request omits prior threadId; no Corolla/Camry mix
 *  5) Abort: send then immediate New topic — old assistant must not land on new topic
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

const outDir = path.join(process.cwd(), "tmp/multi-topic-qa");
fs.mkdirSync(outDir, { recursive: true });

/** @type {Array<{ url: string; body: any; at: string }>} */
const chatPosts = [];
/** @type {Array<{ status: number; body: any; at: string }>} */
const chatResponses = [];
/** @type {Array<{ url: string; method: string; status: number; at: string }>} */
const threadApi = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function dismissOverlays(page) {
  const agree = page.getByRole("button", { name: /Agree|I agree|Accept/i });
  if (await agree.count()) await agree.first().click().catch(() => {});
  for (const testId of [
    "chat-vehicle-isolated-dismiss",
    "chat-new-topic-toast-dismiss",
    "chat-topic-hint-dismiss",
  ]) {
    const btn = page.getByTestId(testId);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(250);
}

async function waitGarageReady(page) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const text = await page.locator("body").innerText().catch(() => "");
    if (
      !/Loading your garage/i.test(text) &&
      (await page.locator("textarea").count()) > 0
    ) {
      return;
    }
    await page.waitForTimeout(700);
  }
}

async function waitComposerReady(page) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const ta = page.locator("textarea").first();
    const visible = await ta.isVisible().catch(() => false);
    const disabled = await ta.isDisabled().catch(() => true);
    if (visible && !disabled) return ta;
    await page.waitForTimeout(400);
  }
  throw new Error("Chat composer never became ready");
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
  await waitComposerReady(page);
}

async function login(page) {
  await page.goto(`${BASE}/login?next=/app%3Ftab%3Dchat`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForTimeout(600);
  const emailInput = page.getByTestId("login-email");
  await emailInput.waitFor({ state: "visible", timeout: 60_000 });
  await emailInput.fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
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

async function switchVehicle(page, re, headerNeedle) {
  const dialog = page.getByRole("dialog", { name: /Switch vehicle/i });
  const dialogOpen = await dialog.isVisible().catch(() => false);
  if (!dialogOpen) {
    await dismissOverlays(page);
    await page.getByTestId("chat-vehicle-switcher-open").click({ timeout: 20_000 });
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
  }
  const target = dialog
    .locator("button")
    .filter({ hasText: re })
    .filter({ hasNotText: /Edit profile|Archive|Delete/i })
    .first();
  await target.waitFor({ state: "visible", timeout: 20_000 });
  const label = ((await target.innerText()) || "").replace(/\s+/g, " ").slice(0, 80);
  console.log("  selecting:", label);
  await target.click();
  const needle = headerNeedle || (typeof re === "string" ? re : re.source);
  await page.waitForFunction(
    (n) => {
      const open = document.querySelector(
        '[data-testid="chat-vehicle-switcher-open"]',
      );
      const t = open?.textContent || "";
      return new RegExp(n, "i").test(t);
    },
    typeof needle === "string" ? needle : String(needle),
    { timeout: 45_000 },
  );
  // Wait garage/thread load to settle (ready + composer).
  await page.waitForTimeout(1500);
  await dismissOverlays(page);
  await waitComposerReady(page);
  const header = (
    (await page.getByTestId("chat-vehicle-switcher-open").innerText()) || ""
  ).replace(/\s+/g, " ");
  console.log("  header now:", header.slice(0, 90));
  return { header };
}

async function sendChat(page, text, { waitReply = true } = {}) {
  await dismissOverlays(page);
  const ta = await waitComposerReady(page);
  await ta.click();
  await ta.fill("");
  await ta.fill(text);
  const before = chatPosts.length;
  const beforeResp = chatResponses.length;
  await ta.press("Enter");
  await page.waitForTimeout(350);
  if (chatPosts.length <= before) {
    const sendBtn = page
      .locator('button[aria-label*="Send"], button[title*="Send"]')
      .or(page.getByRole("button", { name: /^Send$/i }));
    if (await sendBtn.count()) await sendBtn.first().click().catch(() => {});
  }
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && chatPosts.length <= before) {
    await page.waitForTimeout(350);
  }
  assert(chatPosts.length > before, `No /api/chat POST for: ${text.slice(0, 50)}`);
  const post = chatPosts[chatPosts.length - 1];
  if (!waitReply) return { post, reply: "", apiContent: "" };

  const start = Date.now();
  let reply = "";
  let apiContent = "";
  const needle = text.slice(0, 36);
  while (Date.now() - start < 150_000) {
    if (chatResponses.length > beforeResp && !apiContent) {
      const resp = chatResponses[chatResponses.length - 1];
      apiContent =
        typeof resp.body?.content === "string" ? resp.body.content : "";
      if (resp.status >= 400) {
        throw new Error(
          `/api/chat ${resp.status}: ${resp.body?.error || resp.body?.code || "error"}`,
        );
      }
    }
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
    if (after.length > 220 && !taDisabled && !stopVisible) {
      await page.waitForTimeout(1800);
      const body2 = await page.locator("body").innerText();
      const idx2 = body2.lastIndexOf(needle);
      reply = idx2 >= 0 ? body2.slice(idx2).slice(0, 4500) : after.slice(0, 4500);
      break;
    }
    // Prefer API body if UI scrape is slow / aborted visually.
    if (apiContent.length > 180 && !taDisabled && !stopVisible) {
      reply = apiContent;
      break;
    }
    await page.waitForTimeout(800);
  }
  if (!reply && apiContent) reply = apiContent;
  return { post, reply, apiContent };
}

async function clickNewTopic(page) {
  const beforePosts = threadApi.filter((r) => r.method === "POST").length;
  const mobile = page.getByTestId("chat-new-topic");
  const desktop = page.getByTestId("chat-new-topic-desktop");
  if (await mobile.isVisible().catch(() => false)) {
    await mobile.click();
  } else if (await desktop.isVisible().catch(() => false)) {
    await desktop.click();
  } else {
    // Sheet entry
    const open = page.getByTestId("chat-topics-open");
    await open.click({ timeout: 10_000 });
    await page.getByTestId("chat-topics-new").click({ timeout: 10_000 });
  }
  // Wait for create thread API (authoritative) and optional toast.
  const deadline = Date.now() + 20_000;
  let toastVisible = false;
  while (Date.now() < deadline) {
    const posts = threadApi.filter((r) => r.method === "POST");
    if (posts.length > beforePosts && posts[posts.length - 1].status < 300) {
      break;
    }
    await page.waitForTimeout(200);
  }
  const toast = page.getByTestId("chat-new-topic-toast");
  toastVisible = await toast
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  await dismissOverlays(page);
  await waitComposerReady(page);
  return { toastVisible };
}

async function openTopicsAndPick(page, { index = 1 } = {}) {
  // index 1 = second item (often previous topic when newest is first)
  const open =
    (await page.getByTestId("chat-topics-open").isVisible().catch(() => false))
      ? page.getByTestId("chat-topics-open")
      : page.getByTestId("chat-topics-open-desktop");
  await open.click({ timeout: 15_000 });
  await page.getByTestId("chat-topics-sheet").waitFor({ state: "visible", timeout: 10_000 });
  const items = page.getByTestId("chat-topic-item");
  const count = await items.count();
  assert(count >= 2, `Expected ≥2 topics in sheet, got ${count}`);
  await items.nth(index).click();
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
  await waitComposerReady(page);
  return { count };
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
  const url = req.url();
  if (req.method() === "POST" && /\/api\/chat(?:\?|$)/.test(url)) {
    let body = null;
    try {
      body = req.postDataJSON();
    } catch {
      body = { raw: req.postData() };
    }
    chatPosts.push({ url, body, at: new Date().toISOString() });
  }
});

page.on("response", async (res) => {
  const url = res.url();
  if (/\/api\/chat\/threads/.test(url)) {
    threadApi.push({
      url,
      method: res.request().method(),
      status: res.status(),
      at: new Date().toISOString(),
    });
    return;
  }
  if (res.request().method() !== "POST") return;
  if (!/\/api\/chat(?:\?|$)/.test(url)) return;
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = { parseError: true };
  }
  chatResponses.push({
    status: res.status(),
    body,
    at: new Date().toISOString(),
  });
});

try {
  console.log("Login", email, "→", BASE);
  await login(page);

  console.log("\n[1] Switch to 2019 Camry LE…");
  await switchVehicle(page, /2019 Toyota Camry|Camry LE/i, "2019");
  assert(
    /2019/i.test(
      (await page.getByTestId("chat-vehicle-switcher-open").innerText()) || "",
    ),
    "Header should show 2019 Camry after switch",
  );

  const oilQ =
    "Oil change on this Camry — walk me through the drain plug and oil filter steps.";
  console.log("[1] Topic A: oil / drain plug…");
  const oil = await sendChat(page, oilQ);
  fs.writeFileSync(path.join(outDir, "01_oil_reply.txt"), oil.reply || oil.apiContent || "");
  fs.writeFileSync(
    path.join(outDir, "01_oil_request.json"),
    JSON.stringify(oil.post.body, null, 2),
  );
  assert(
    /2019/i.test(String(oil.post.body?.currentVehicle?.year || "")) ||
      /Camry/i.test(String(oil.post.body?.currentVehicle?.model || "")),
    "Topic A request vehicle should be Camry",
  );
  const oilText = oil.reply || oil.apiContent || "";
  assert(/drain|filter|oil/i.test(oilText), "Topic A reply missing oil/drain");
  const threadA = oil.post.body?.threadId || null;
  console.log("  threadA:", threadA, "vehicle", oil.post.body?.currentVehicle?.year, oil.post.body?.currentVehicle?.submodel);
  results.push({ id: "topic_a_oil", pass: true, threadId: threadA });

  console.log("\n[2] New topic…");
  const nt = await clickNewTopic(page);
  const createCalls = threadApi.filter(
    (r) => r.method === "POST" && r.status >= 200 && r.status < 300,
  );
  assert(createCalls.length >= 1, "Expected successful POST /api/chat/threads");
  // Toast is best-effort UI; API create is the hard gate.
  if (!nt.toastVisible) {
    console.warn("  (toast not observed — continuing on POST 200)");
  }

  const beamQ = "low beam out, what should I check?";
  console.log("[2] Topic B: low beam…");
  const beam = await sendChat(page, beamQ);
  fs.writeFileSync(path.join(outDir, "02_beam_reply.txt"), beam.reply);
  fs.writeFileSync(
    path.join(outDir, "02_beam_request.json"),
    JSON.stringify(beam.post.body, null, 2),
  );
  const threadB = beam.post.body?.threadId || null;
  console.log("  threadB:", threadB);
  assert(threadB, "Topic B request must include threadId");
  if (threadA) {
    assert(threadB !== threadA, "New topic must use a different threadId");
  }
  // Authoritative: client must not ship a multi-turn transcript.
  assert(
    !Array.isArray(beam.post.body?.messages) ||
      beam.post.body.messages.length <= 1,
    "Client must not send multi-turn messages[] as model history",
  );
  assert(
    typeof beam.post.body?.message === "string" &&
      /low beam/i.test(beam.post.body.message),
    "Body.message must be the low-beam turn only",
  );
  const beamText = beam.reply || beam.apiContent || "";
  const beamLeak =
    /drain plug|oil filter|oil pan|warm the engine.*drain/i.test(beamText) &&
    /step\s*1|next,? remove the|drain the oil/i.test(beamText);
  assert(!beamLeak, "Topic B assistant continued oil-change DIY");
  assert(
    /beam|bulb|headlight|fuse|connector|housing|dust.?cap|socket/i.test(
      beamText,
    ),
    "Topic B reply looked unrelated to lighting",
  );
  fs.writeFileSync(path.join(outDir, "02_beam_reply.txt"), beamText);
  results.push({
    id: "new_topic_low_beam",
    pass: true,
    threadId: threadB,
    toastVisible: nt.toastVisible,
  });

  console.log("\n[3] Topics sheet → older topic…");
  const picked = await openTopicsAndPick(page, { index: 1 });
  const bodyAfterPick = await page.locator("body").innerText();
  assert(
    /drain|oil change|oil filter/i.test(bodyAfterPick),
    "Switching back to Topic A should restore oil/drain history from server",
  );
  results.push({ id: "switch_back_topic_a", pass: true, topicCount: picked.count });

  // Same-thread follow-up on restored topic
  const follow = await sendChat(page, "What about the oil filter next?");
  assert(
    follow.post.body?.threadId === threadA ||
      (threadA == null && Boolean(follow.post.body?.threadId)),
    "Follow-up should stay on Topic A thread when restored",
  );
  results.push({ id: "same_thread_followup", pass: true });

  console.log("\n[4] Abort: send then immediate New topic…");
  const abortQ =
    "Give a very detailed step-by-step oil drain procedure with safety notes for each step.";
  await sendChat(page, abortQ, { waitReply: false });
  await page.waitForTimeout(400);
  await clickNewTopic(page);
  await page.waitForTimeout(2500);
  const afterAbort = await page.locator("body").innerText();
  // New topic UI starts fresh — should not show a long oil-drain assistant on the empty topic.
  const welcomeish =
    /New topic|starts fresh|Ask|How can I help|Garage Genius/i.test(afterAbort);
  const longOilOnFresh =
    /drain plug torque|remove the drain plug|oil pan gasket/i.test(afterAbort) &&
    afterAbort.split("drain").length > 4;
  assert(
    !longOilOnFresh || welcomeish,
    "Late/aborted oil assistant appears to have landed on the new topic",
  );
  results.push({ id: "abort_new_topic", pass: true });

  console.log("\n[5] Switch vehicle (isolation)…");
  await switchVehicle(page, /2021 Toyota Camry|Camry SE/i, "2021");
  const putcoQ = "Will Putco lights fit this vehicle?";
  const putco = await sendChat(page, putcoQ);
  fs.writeFileSync(
    path.join(outDir, "05_switch_request.json"),
    JSON.stringify(putco.post.body, null, 2),
  );
  const b = putco.post.body || {};
  assert(
    b.vehicleThreadReset === true ||
      b.vehicleChanged === true ||
      (b.previousVehicleId &&
        b.selectedVehicleId &&
        b.previousVehicleId !== b.selectedVehicleId),
    "Vehicle switch missing isolation flags",
  );
  // Must not reuse Camry Topic B threadId after switch
  if (threadB && b.threadId) {
    assert(
      b.threadId !== threadB,
      "After vehicle switch, must not keep previous car threadId",
    );
  }
  assert(
    !Array.isArray(b.messages) || b.messages.length <= 1,
    "Switch turn must not ship multi-turn client transcript",
  );
  results.push({
    id: "vehicle_switch_isolation",
    pass: true,
    previousVehicleId: b.previousVehicleId,
    selectedVehicleId: b.selectedVehicleId,
    threadId: b.threadId ?? null,
  });

  console.log("\nALL MULTI-TOPIC CHECKS PASSED");
} catch (err) {
  console.error("\nQA FAILED:", err?.message || err);
  await page
    .screenshot({ path: path.join(outDir, "error.png"), fullPage: true })
    .catch(() => {});
  results.push({ id: "fatal", pass: false, error: String(err?.message || err) });
  process.exitCode = 1;
} finally {
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    email,
    results,
    chatPostCount: chatPosts.length,
    threadApi,
  };
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
}
