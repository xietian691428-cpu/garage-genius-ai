/**
 * Prod photo QA: login as E2E user, upload synthetic OBD + headlamp images,
 * capture assistant replies. Uses .env.e2e.local credentials.
 *
 *   node --env-file=.env.e2e.local scripts/qa-photo-handtest.mjs
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

const IMG = {
  obdClear: "/tmp/gg-photo-qa/net/obd_app_clear.jpg",
  obdBlur: "/tmp/gg-photo-qa/net/obd_app_blur_dark.jpg",
  lampClear: "/tmp/gg-photo-qa/net/headlamp_unsplash.jpg",
  lampDark: "/tmp/gg-photo-qa/net/lamp_housing_dark.png",
};
for (const [k, p] of Object.entries(IMG)) {
  if (!fs.existsSync(p)) {
    console.error("missing image", k, p);
    process.exit(1);
  }
}

const outDir = path.join(process.cwd(), "tmp/photo-qa");
fs.mkdirSync(outDir, { recursive: true });

async function login(page) {
  await page.goto(`${BASE}/login?next=/app`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /Sign in with email/i }).click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea:not([disabled])", { timeout: 90_000 });
}

async function switchVehicle(page, re) {
  const open = page.getByRole("button", { name: /Tap to switch vehicle/i });
  await open.click();
  await page.getByRole("button", { name: re }).first().click();
  const close = page.getByRole("button", { name: /^Close$/i });
  if (await close.count()) await close.click().catch(() => {});
  await page.waitForTimeout(1200);
  await page.waitForSelector("textarea:not([disabled])", { timeout: 60_000 });
}

async function waitReply(page, needle, timeoutMs = 120_000) {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    const text = await page.locator("body").innerText();
    const idx = text.lastIndexOf(needle);
    if (idx >= 0) {
      const after = text.slice(idx + needle.length);
      const taDisabled = await page.locator("textarea").isDisabled().catch(() => true);
      if (after.length > 400 && !taDisabled) {
        await page.waitForTimeout(2500);
        const text2 = await page.locator("body").innerText();
        const idx2 = text2.lastIndexOf(needle);
        last = text2.slice(idx2).slice(0, 2200);
        return last;
      }
    }
    await page.waitForTimeout(1000);
  }
  return last || (await page.locator("body").innerText()).slice(-1500);
}

async function uploadViaHiddenInput(page, filePath) {
  // Ensure a file input exists (More actions → Photo / OBD screenshot creates/uses hidden input)
  const inputs = page.locator('input[type="file"][accept*="image"]');
  let n = await inputs.count();
  if (n === 0) {
    const more = page.getByRole("button", { name: /More actions|Hide extra/i });
    if (await more.count()) await more.first().click().catch(() => {});
    await page.getByRole("button", { name: /^Photo$/i }).click().catch(() => {});
    n = await inputs.count();
  }
  if (n === 0) throw new Error("No image file input found");
  await inputs.nth(n - 1).setInputFiles(filePath);
  await page.waitForTimeout(1000);
}

async function sendWithPhoto(page, filePath, note) {
  await uploadViaHiddenInput(page, filePath);
  const ta = page.locator("textarea").first();
  await ta.fill(note);
  // send button next to composer (enabled when text or image present)
  const send = page.locator("textarea").locator("xpath=ancestor::*[self::form or self::div][1]//button[not(@disabled)]").last();
  if (await send.count()) {
    await send.click();
  } else {
    await ta.press("Enter");
  }
  return waitReply(page, note.slice(0, 40));
}

async function sendObdScreenshot(page, filePath, note) {
  const more = page.getByRole("button", { name: /More actions|Hide extra/i });
  if (await more.count()) {
    const expanded = await more.first().getAttribute("aria-expanded");
    if (expanded !== "true") await more.first().click().catch(() => {});
  }
  const obdBtn = page.getByRole("button", { name: /OBD screenshot/i });
  if (await obdBtn.count()) {
    // Clicking opens file picker — set files on the dtc file input instead
    const dtcInput = page.locator('input[type="file"][accept*="image"]').first();
    await dtcInput.setInputFiles(filePath);
    await page.waitForTimeout(800);
    if (note) {
      const ta = page.locator("textarea").first();
      if (!(await ta.isDisabled())) {
        await ta.fill(note);
        await page.locator("textarea").locator("xpath=ancestor::*[self::form or self::div][1]//button[not(@disabled)]").last().click().catch(async () => {
          await ta.press("Enter");
        });
      }
    }
    return waitReply(page, note?.slice(0, 40) || "P0420");
  }
  return sendWithPhoto(page, filePath, note || "OBD screenshot — what codes?");
}

function score(label, reply, rules) {
  const r = (reply || "").toLowerCase();
  const checks = {};
  for (const [k, fn] of Object.entries(rules)) checks[k] = !!fn(r, reply || "");
  const pass = Object.values(checks).every(Boolean);
  console.log(`\n=== ${label}: ${pass ? "PASS" : "FAIL"} ===`);
  console.log(checks);
  console.log((reply || "").slice(0, 700).replace(/\n+/g, "\n"));
  fs.writeFileSync(path.join(outDir, `${label}.txt`), reply || "");
  return { label, pass, checks, reply };
}

const results = [];

const browser = await chromium.launch({
  headless: true,
  // Prefer system Chrome if Playwright's bundled browser isn't installed yet.
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
  console.log("Logging in…");
  await login(page);
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("textarea:not([disabled])", { timeout: 90_000 });

  // Prefer Civic for lighting + Camry 2021 for OBD to reduce cross-talk
  await switchVehicle(page, /Camry SE.*2021|2021 Toyota Camry SE/i).catch(async () => {
    await switchVehicle(page, /2021 Toyota Camry/i);
  });

  // --- OBD clear ---
  {
    const note = "Here's my OBD scan screenshot — what do these codes mean?";
    const reply = await sendObdScreenshot(page, IMG.obdClear, note);
    results.push(
      score("obd_clear", reply, {
        mentionsP0420: (r) => /p0420|catalyst/i.test(r),
        notInventLive: (r) => !/based on live (obd|pid|data)/i.test(r),
        educational: (r) => /possible|check|educat|not a diagnosis|verify/i.test(r),
      }),
    );
  }

  // --- OBD blurry ---
  await switchVehicle(page, /Honda Civic Sport|2020 Honda Civic/i).catch(() => {});
  {
    const note = "Blurry OBD photo — can you read the codes?";
    const reply = await sendWithPhoto(page, IMG.obdBlur, note);
    results.push(
      score("obd_blur", reply, {
        lowTrustOrRetake: (r) =>
          /retake|unclear|blurry|can't read|cannot read|low.?confidence|hard to read|not clear/i.test(
            r,
          ),
        noFakeCode: (r, raw) => {
          // Should not invent a confident P-code from blur alone as fact
          const claims = /definitely (p\d{4})|the code is p\d{4}/i.test(raw);
          return !claims;
        },
      }),
    );
  }

  // --- Lighting clear dust-cap ---
  {
    const note =
      "Photo of the back of my headlight — low beam out, what bulb?";
    const reply = await sendWithPhoto(page, IMG.lampClear, note);
    results.push(
      score("lamp_clear", reply, {
        noPhotoProvesH: (r) =>
          !/photo (shows|proves|confirms).{0,20}h11|according to the photo.{0,20}h11/i.test(
            r,
          ),
        structurePath: (r) =>
          /dust.?cap|replaceable|sealed|confirm|housing|verify/i.test(r),
      }),
    );
  }

  // --- Lighting dark ---
  {
    const note = "Dark photo of the lamp housing — is it sealed LED?";
    const reply = await sendWithPhoto(page, IMG.lampDark, note);
    results.push(
      score("lamp_dark", reply, {
        retakeOrAsk: (r) =>
          /retake|unclear|dark|can't tell|cannot tell|dust cap|ask|confirm/i.test(
            r,
          ),
        noAutoSealed: (r) =>
          !/definitely sealed|photo (proves|shows) (it'?s|is) sealed/i.test(r),
        noHFromPhoto: (r) => !/according to the photo.{0,30}h\d{1,2}/i.test(r),
      }),
    );
  }
} catch (err) {
  console.error("QA failed:", err);
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true });
  process.exitCode = 1;
} finally {
  const summary = {
    at: new Date().toISOString(),
    results: results.map(({ label, pass, checks }) => ({ label, pass, checks })),
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\nSummary:", summary);
  await browser.close();
}
