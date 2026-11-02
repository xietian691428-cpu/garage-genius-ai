/**
 * Extended prod QA: image recognition, OBD screenshots, common DIY coach + UI smoke.
 *
 *   node --env-file=.env.e2e.local scripts/qa-extended-diy.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "https://garagegenius.cloud";
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
if (!email || !password) {
  console.error("Need E2E_EMAIL / E2E_PASSWORD");
  process.exit(1);
}

const root = process.cwd();
const net = path.join(root, "tmp/photo-qa/net");
const outDir = path.join(root, "tmp/photo-qa/extended");
fs.mkdirSync(outDir, { recursive: true });

const IMG = {
  obdClear: [
    path.join(net, "obd_clear_codes.jpg"),
    path.join(root, "tmp/photo-qa/obd_clear_p0420.png"),
  ],
  obdBlur: [
    path.join(net, "obd_blur_codes.jpg"),
    path.join(root, "tmp/photo-qa/obd_blurry_dark.png"),
  ],
  oil: path.join(net, "12_oil_dipstick.jpg"),
  battery: path.join(net, "13_battery.jpg"),
  tire: path.join(net, "15_tire.jpg"),
  lamp: path.join(net, "01_headlamp_front.jpg"),
  hands: path.join(net, "07_mechanic_hands.jpg"),
};

function resolveImg(keyOrPath) {
  if (Array.isArray(keyOrPath)) {
    const hit = keyOrPath.find((p) => fs.existsSync(p));
    if (!hit) throw new Error(`missing images: ${keyOrPath.join(", ")}`);
    return hit;
  }
  if (!fs.existsSync(keyOrPath)) throw new Error(`missing ${keyOrPath}`);
  return keyOrPath;
}

async function dismissOverlays(page) {
  for (const name of [/Agree|I agree|Accept/i, /^Close$/i, /^Not now$/i]) {
    const b = page.getByRole("button", { name });
    if (await b.count()) await b.first().click().catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

async function openChat(page) {
  await page.goto(`${BASE}/app?tab=chat`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2000);
  await dismissOverlays(page);
  const chatTab = page
    .locator('[role="tab"], a, button')
    .filter({ hasText: /^Chat$/i });
  if (await chatTab.count()) await chatTab.first().click().catch(() => {});
  await dismissOverlays(page);
  const ta = page.locator("textarea").first();
  await ta.waitFor({ state: "attached", timeout: 90_000 });
  await ta.evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
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
  await page.goto(`${BASE}/login?next=/app`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Sign in with email/i }).click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  await page.waitForTimeout(2000);
  await openChat(page);
}

async function switchVehicle(page, re) {
  const open = page.getByRole("button", { name: /Tap to switch vehicle/i });
  if (!(await open.count())) return false;
  await open.click();
  const btn = page.getByRole("button", { name: re }).first();
  if (!(await btn.count())) {
    await dismissOverlays(page);
    return false;
  }
  await btn.click();
  await dismissOverlays(page);
  await page.waitForTimeout(1000);
  await openChat(page);
  return true;
}

async function waitReply(page, needle, timeoutMs = 150_000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const text = await page.locator("body").innerText();
    const idx = text.lastIndexOf(needle);
    if (idx >= 0) {
      const after = text.slice(idx + needle.length);
      const taDisabled = await page
        .locator("textarea")
        .first()
        .isDisabled()
        .catch(() => true);
      if (after.length > 320 && !taDisabled) {
        await page.waitForTimeout(2500);
        const text2 = await page.locator("body").innerText();
        const idx2 = text2.lastIndexOf(needle);
        last = text2.slice(idx2).slice(0, 4000);
        return last;
      }
    }
    await page.waitForTimeout(1200);
  }
  return last || (await page.locator("body").innerText()).slice(-2200);
}

async function ensureFileInput(page) {
  const inputs = page.locator('input[type="file"][accept*="image"]');
  let n = await inputs.count();
  if (n === 0) {
    const more = page.getByRole("button", { name: /More actions|Hide extra/i });
    if (await more.count()) await more.first().click().catch(() => {});
    await page.getByRole("button", { name: /^Photo$/i }).click().catch(() => {});
    n = await inputs.count();
  }
  if (n === 0) throw new Error("No image file input");
  return inputs;
}

async function sendWithPhoto(page, filePath, note) {
  const inputs = await ensureFileInput(page);
  const n = await inputs.count();
  await inputs.nth(n - 1).setInputFiles(filePath);
  await page.waitForTimeout(1000);
  const ta = page.locator("textarea").first();
  await ta.fill(note);
  const send = page
    .locator("textarea")
    .locator(
      "xpath=ancestor::*[self::form or self::div][1]//button[not(@disabled)]",
    )
    .last();
  if (await send.count()) await send.click();
  else await ta.press("Enter");
  return waitReply(page, note.slice(0, 44));
}

async function sendObdScreenshot(page, filePath, note) {
  const more = page.getByRole("button", { name: /More actions|Hide extra/i });
  if (await more.count()) {
    const expanded = await more.first().getAttribute("aria-expanded");
    if (expanded !== "true") await more.first().click().catch(() => {});
  }
  await page.waitForTimeout(400);
  const inputs = await ensureFileInput(page);
  await inputs.first().setInputFiles(filePath);
  await page.waitForTimeout(900);
  const ta = page.locator("textarea").first();
  if (!(await ta.isDisabled()) && note) {
    await ta.fill(note);
    const send = page
      .locator("textarea")
      .locator(
        "xpath=ancestor::*[self::form or self::div][1]//button[not(@disabled)]",
      )
      .last();
    if (await send.count()) await send.click();
    else await ta.press("Enter");
  }
  return waitReply(page, (note || "P0420").slice(0, 44));
}

async function sendText(page, note) {
  const ta = page.locator("textarea").first();
  await ta.fill(note);
  const send = page
    .locator("textarea")
    .locator(
      "xpath=ancestor::*[self::form or self::div][1]//button[not(@disabled)]",
    )
    .last();
  if (await send.count()) await send.click();
  else await ta.press("Enter");
  return waitReply(page, note.slice(0, 44));
}

function score(id, reply, rules) {
  const r = (reply || "").toLowerCase();
  const checks = {};
  for (const [k, fn] of Object.entries(rules)) checks[k] = !!fn(r, reply || "");
  const pass = Object.values(checks).every(Boolean);
  const unavailable =
    /vision.?unavailable|image analysis (failed|unavailable)|couldn't analyze/i.test(
      reply || "",
    );
  console.log(
    `\n=== ${id}: ${pass ? "PASS" : "FAIL"}${unavailable ? " (vision soft-fail)" : ""} ===`,
  );
  console.log(checks);
  console.log((reply || "").slice(0, 750).replace(/\n{3,}/g, "\n\n"));
  fs.writeFileSync(path.join(outDir, `${id}.txt`), reply || "");
  return {
    id,
    pass,
    unavailable,
    checks,
    replyPreview: (reply || "").slice(0, 1400),
  };
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

try {
  console.log("Login", email, "→", BASE);
  await login(page);

  // Prefer Camry 2021 for OBD / Civic for lighting-ish DIY
  await switchVehicle(page, /2021 Toyota Camry SE|Camry SE.*2021/i).catch(
    () => {},
  );

  // --- 1 OBD clear screenshot ---
  {
    await openChat(page);
    const note =
      "OBD scanner screenshot — please read the fault codes and coach me on safe DIY checks for the top code.";
    const reply = await sendObdScreenshot(
      page,
      resolveImg(IMG.obdClear),
      note,
    );
    results.push(
      score("obd_clear_read", reply, {
        seesCode: (r) => /p0420|catalyst|p0171|lean/i.test(r),
        educational: (r) =>
          /possible|check|educat|not a (final )?diagnos|verify|may|could/i.test(
            r,
          ),
        diyNext: (r) =>
          /inspect|check|sensor|o2|exhaust|step|diy|shop|test/i.test(r),
      }),
    );
    await page.screenshot({ path: path.join(outDir, "obd_clear_read.png") });
  }

  // --- 2 OBD blur ---
  {
    await openChat(page);
    const note =
      "This OBD screen photo is dark/blurry — can you still read codes? What should I do?";
    const reply = await sendWithPhoto(page, resolveImg(IMG.obdBlur), note);
    results.push(
      score("obd_blur_honest", reply, {
        lowTrust: (r) =>
          /retake|unclear|blur|can't read|cannot read|hard to read|not clear|dark|low.?conf/i.test(
            r,
          ),
        noFakeCertain: (_r, raw) =>
          !/definitely (p\d{4})|the (only )?code is p\d{4}/i.test(raw),
      }),
    );
  }

  // --- 3 Photo: oil / underhood DIY ---
  await switchVehicle(page, /Honda Civic Sport|2020 Honda Civic|Civic/i).catch(
    () => {},
  );
  {
    await openChat(page);
    const note =
      "Photo while checking fluids — coach me through a DIY oil level check and what looks wrong, step by step.";
    const reply = await sendWithPhoto(page, resolveImg(IMG.oil), note);
    results.push(
      score("photo_oil_diy", reply, {
        oilTopic: (r) => /oil|dipstick|level|fluid|filter|drain/i.test(r),
        steps: (r) => /step|first|then|park|level|wait|wipe|reinsert/i.test(r),
      }),
    );
  }

  // --- 4 Photo: battery ---
  {
    await openChat(page);
    const note =
      "Battery area photo — how do I DIY test/replace a weak battery safely?";
    const reply = await sendWithPhoto(page, resolveImg(IMG.battery), note);
    results.push(
      score("photo_battery_diy", reply, {
        battery: (r) => /battery|terminal|volt|charge|alternator|cable/i.test(r),
        safety: (r) =>
          /negative|positive|first|last|spark|eye|glove|safety|disconnect/i.test(
            r,
          ),
      }),
    );
  }

  // --- 5 Photo: lighting ---
  {
    await openChat(page);
    const note =
      "Headlight photo — low beam out. Identify what you can and give DIY next photo / next step.";
    const reply = await sendWithPhoto(page, resolveImg(IMG.lamp), note);
    results.push(
      score("photo_lamp_detect", reply, {
        lighting: (r) => /headlight|headlamp|bulb|beam|housing|lamp|led/i.test(r),
        next: (r) => /retake|dust.?cap|photo|check|replace|hood|step/i.test(r),
        noFakeH: (r) =>
          !/photo (proves|confirms).{0,24}h\d{1,2}/i.test(r),
      }),
    );
  }

  // --- 6 Photo: tire / hands work ---
  {
    await openChat(page);
    const note =
      "I'm doing DIY work — from this photo, what maintenance or tire/brake checks should I prioritize and how?";
    const reply = await sendWithPhoto(page, resolveImg(IMG.tire), note);
    results.push(
      score("photo_tire_or_work", reply, {
        relevant: (r) =>
          /tire|tread|pressure|brake|wear|rotate|inspect|photo|maintenance/i.test(
            r,
          ),
        actionable: (r) => /check|measure|replace|step|look|diy|shop/i.test(r),
      }),
    );
  }

  // --- 7 Text: misfire code DIY ---
  {
    await openChat(page);
    const note =
      "My car has code P0300 random misfire. Walk me through safe DIY checks before I go to a shop.";
    const reply = await sendText(page, note);
    results.push(
      score("text_p0300_diy", reply, {
        code: (r) => /p0300|misfire/i.test(r),
        diyChecks: (r) =>
          /spark|coil|plug|vacuum|fuel|step|check|inspect/i.test(r),
        safety: (r) =>
          /cool|engine off|safety|do not|don't|careful|running/i.test(r) ||
          /step|first/i.test(r),
      }),
    );
  }

  // --- 8 Text: oil change DIY ---
  {
    await openChat(page);
    const note =
      "Coach me through a DIY oil and filter change for my current vehicle — tools, steps, torque/fill notes, disposal.";
    const reply = await sendText(page, note);
    results.push(
      score("text_oil_change", reply, {
        oilChange: (r) => /oil|filter|drain|pan|washer|fill/i.test(r),
        steps: (r) => /step|first|then|jack|drain|install|refill/i.test(r),
        caution: (r) =>
          /hot|cool|disposal|recycle|torque|spec|manual|capacity/i.test(r),
      }),
    );
  }

  // --- 9 Text: brake squeal ---
  {
    await openChat(page);
    const note =
      "Front brakes squeal when stopping. DIY inspection plan — what to look for and when to stop and use a shop.";
    const reply = await sendText(page, note);
    results.push(
      score("text_brake_squeal", reply, {
        brakes: (r) => /brake|pad|rotor|caliper|squeal/i.test(r),
        plan: (r) => /inspect|thickness|wear|dust|step|look|listen/i.test(r),
        shopGate: (r) =>
          /shop|professional|soft|pedal|pull|grinding|metal|unsafe|stop/i.test(
            r,
          ),
      }),
    );
  }

  // --- 10 UI smoke: Home Code chip, Connect OBD, Guides, Photo ---
  {
    const ui = {
      homeLoads: false,
      codeChip: false,
      connectObd: false,
      guidesTab: false,
      photoControl: false,
      chatComposer: false,
    };
    await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await dismissOverlays(page);
    ui.homeLoads = /Garage Genius|Current vehicle|HOME/i.test(
      await page.locator("body").innerText(),
    );

    const code = page.getByRole("button", { name: /P0420|P0300|Code/i }).first();
    if (await code.count()) {
      await code.click().catch(() => {});
      await page.waitForTimeout(2000);
      ui.codeChip =
        /P0420|catalyst|code|coach|diagnos|Chat/i.test(
          await page.locator("body").innerText(),
        ) || page.url().includes("tab=chat");
    }

    await page.goto(`${BASE}/app`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await dismissOverlays(page);
    const obd = page.getByRole("button", { name: /Connect OBD/i }).first();
    if (await obd.count()) {
      await obd.click();
      await page.waitForTimeout(1500);
      const body = await page.locator("body").innerText();
      ui.connectObd =
        /Bluetooth|ELM327|adapter|scan|permission|simulator|pair|OBD/i.test(
          body,
        );
      await dismissOverlays(page);
      await page.keyboard.press("Escape").catch(() => {});
    }

    const guides = page
      .locator('[role="tab"], a, button')
      .filter({ hasText: /^Guides$/i });
    if (await guides.count()) {
      await guides.first().click();
      await page.waitForTimeout(2000);
      ui.guidesTab = /guide|coach|P0|maintenance|DIY|How to/i.test(
        await page.locator("body").innerText(),
      );
    }

    await openChat(page);
    ui.chatComposer = await page.locator("textarea").first().isVisible();
    const more = page.getByRole("button", { name: /More actions|Hide extra/i });
    if (await more.count()) await more.first().click().catch(() => {});
    ui.photoControl =
      (await page.getByRole("button", { name: /^Photo$/i }).count()) > 0 ||
      (await page.locator('input[type="file"][accept*="image"]').count()) > 0;

    await page.screenshot({ path: path.join(outDir, "ui_smoke.png") });
    const pass = Object.values(ui).every(Boolean);
    console.log("\n=== ui_smoke:", pass ? "PASS" : "FAIL", ui);
    results.push({ id: "ui_smoke", pass, checks: ui });
    fs.writeFileSync(
      path.join(outDir, "ui_smoke.json"),
      JSON.stringify(ui, null, 2),
    );
  }
} catch (err) {
  console.error("QA failed:", err);
  await page
    .screenshot({ path: path.join(outDir, "fatal.png"), fullPage: true })
    .catch(() => {});
  process.exitCode = 1;
} finally {
  const passed = results.filter((r) => r.pass).length;
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    passed,
    total: results.length,
    results: results.map(
      ({ id, pass, unavailable, checks, error, replyPreview }) => ({
        id,
        pass,
        unavailable: !!unavailable,
        checks,
        error,
        replyPreview,
      }),
    ),
  };
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log("\n==== SUMMARY ====");
  console.log(`${passed}/${results.length} PASS`);
  for (const r of results) {
    console.log(`- ${r.id}: ${r.pass ? "PASS" : "FAIL"}${r.error ? ` (${r.error})` : ""}`);
  }
  await browser.close();
  if (passed < results.length) process.exitCode = 1;
}
