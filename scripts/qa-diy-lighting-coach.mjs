/**
 * DIY lighting coach QA: login as E2E user, send 10 web photos with
 * realistic DIY prompts, score whether replies give usable coach steps.
 *
 *   node --env-file=.env.e2e.local scripts/qa-diy-lighting-coach.mjs
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

const netDir = path.join(process.cwd(), "tmp/photo-qa/net");
const outDir = path.join(process.cwd(), "tmp/photo-qa/diy-coach");
fs.mkdirSync(outDir, { recursive: true });

/** @type {{ id: string; file: string; note: string; expect: Record<string, (r: string, raw: string) => boolean> }[]} */
const CASES = [
  {
    id: "01_detect_headlamp",
    file: "01_headlamp_front.jpg",
    note: "I took this photo of my front headlight. Low beam is out — can you tell what kind of light this is and what I should check first?",
    expect: {
      identifiesLighting: (r) =>
        /headlight|headlamp|low.?beam|bulb|led|halogen|housing|lamp/i.test(r),
      nextAction: (r) =>
        /check|open|dust.?cap|replace|verify|confirm|photo|look|access|owner.?manual|step/i.test(
          r,
        ),
      notFakeCertainty: (r) =>
        !/photo (proves|confirms) (h\d{1,2}|900[56])/i.test(r),
    },
  },
  {
    id: "02_night_beam_aim",
    file: "02_car_night_lights.jpg",
    note: "Night photo of my car lights. One side looks dimmer — how do I diagnose which bulb failed and what DIY steps to replace it safely?",
    expect: {
      diagnosePath: (r) =>
        /dim|bulb|side|compare|low.?beam|high.?beam|parking|turn|replace|check/i.test(
          r,
        ),
      safetyOrSteps: (r) =>
        /cool|battery|disconnect|gloves|step|first|then|warn|safety|do not|don't touch/i.test(
          r,
        ),
    },
  },
  {
    id: "03_identify_assembly",
    file: "03_sports_car_light.jpg",
    note: "Is this a sealed LED assembly or a replaceable bulb housing? I want to DIY — walk me through how to tell from the photo and what tools I need.",
    expect: {
      sealedVsBulb: (r) =>
        /sealed|replaceable|dust.?cap|module|assembly|bulb|led|housing|cannot tell|hard to tell|retake|confirm/i.test(
          r,
        ),
      toolsOrAccess: (r) =>
        /tool|screwdriver|wrench|access|hood|wheel.?well|fender|trim|socket/i.test(
          r,
        ),
    },
  },
  {
    id: "04_install_steps",
    file: "04_classic_headlamp.jpg",
    note: "Please give me coach-style install steps to replace the low-beam bulb on this headlight: access path, remove old bulb, install new one, test, aim check. Number the steps.",
    expect: {
      numberedSteps: (r) =>
        /(^|\n)\s*1[\).\]]|step\s*1|first[,:]/im.test(r) &&
        /(^|\n)\s*2[\).\]]|step\s*2|then/im.test(r),
      installActions: (r) =>
        /remove|twist|unplug|socket|install|insert|test|aim|reassemble/i.test(r),
      noBareHandsHalogen: (r) =>
        !/touch the glass with bare (hands|fingers)/i.test(r) ||
        /avoid|do not|don't|gloves|clean|oil/i.test(r),
    },
  },
  {
    id: "05_taillight_diy",
    file: "05_rear_taillight.jpg",
    note: "Rear light looks cracked / weak. Can I DIY replace the taillight bulb or whole assembly? Give me a practical coach plan.",
    expect: {
      rearLighting: (r) =>
        /tail|brake|rear|lens|assembly|bulb|housing/i.test(r),
      diyPlan: (r) =>
        /trunk|hatch|screw|access|replace|step|check|part|oem|aftermarket/i.test(
          r,
        ),
    },
  },
  {
    id: "06_garage_workflow",
    file: "06_garage_work.jpg",
    note: "I'm in my garage ready to work. For a dead headlight DIY, what's the safe order of operations before I start removing parts?",
    expect: {
      prepOrder: (r) =>
        /park|level|cool|battery|ignition|off|jack|chock|manual|parts|confirm/i.test(
          r,
        ),
      coachTone: (r) =>
        /first|then|next|step|before|after/i.test(r),
    },
  },
  {
    id: "07_hands_on_replace",
    file: "07_mechanic_hands.jpg",
    note: "I'm about to pull the bulb by hand. Coach me through the exact hand motions and mistakes to avoid so I don't break the connector.",
    expect: {
      handTechnique: (r) =>
        /twist|quarter|lock|tab|connector|harness|pull|push|seat|click/i.test(r),
      avoidMistakes: (r) =>
        /force|break|oil|skin|glass|alignment|wrong.?bulb|orientation|don't|do not|avoid/i.test(
          r,
        ),
    },
  },
  {
    id: "08_underhood_access",
    file: "08_underhood.jpg",
    note: "Photo under the hood — where should I look for the headlight dust cap / bulb access on a typical sedan, and what if I can't reach it?",
    expect: {
      accessGuidance: (r) =>
        /dust.?cap|behind|wheel.?well|liner|battery|air.?box|remove|access|reach/i.test(
          r,
        ),
      fallback: (r) =>
        /manual|year|make|model|shop|limited|alternative|fender|liner/i.test(r),
    },
  },
  {
    id: "09_dash_warning",
    file: "09_dashboard_cluster.jpg",
    note: "Dashboard photo — if a bulb-out / lighting warning is related, how do I use this with a headlight photo to decide DIY vs shop?",
    expect: {
      warningContext: (r) =>
        /warning|bulb|light|dash|indicator|cluster|message|fault|circuit/i.test(
          r,
        ),
      diyVsShop: (r) =>
        /diy|shop|dealer|if|when|simple|wiring|module|fused|fuse/i.test(r),
    },
  },
  {
    id: "10_closeup_verify",
    file: "10_car_detail_light.jpg",
    note: "Close-up of the light area. Tell me what I should photograph next so you can confirm bulb type and give precise install steps for my car.",
    expect: {
      asksBetterPhoto: (r) =>
        /photo|picture|show|dust.?cap|label|part.?number|back of|housing|socket|base|marking/i.test(
          r,
        ),
      continuesCoach: (r) =>
        /then|after|once|step|replace|install|confirm|identify/i.test(r),
    },
  },
];

async function dismissOverlays(page) {
  const agree = page.getByRole("button", { name: /Agree|I agree|Accept/i });
  if (await agree.count()) await agree.first().click().catch(() => {});
  const close = page.getByRole("button", { name: /^Close$/i });
  if (await close.count()) await close.first().click().catch(() => {});
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
}

async function openChat(page) {
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
  // Bottom / top tab bar Chat (mobile shell)
  const chatTab = page.locator('[role="tab"], a, button').filter({ hasText: /^Chat$/i });
  if (await chatTab.count()) await chatTab.first().click().catch(() => {});
  await dismissOverlays(page);
  // If garage manager sheet is open, leave it
  const homeHint = page.getByText(/Current vehicle|VEHICLE HEALTH/i);
  if (await homeHint.count()) {
    await chatTab.first().click().catch(() => {});
    await page.waitForTimeout(1000);
  }
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
  await page.waitForTimeout(2500);
  await openChat(page);
}

async function dismissConsentIfAny(page) {
  await dismissOverlays(page);
}

async function switchVehicle(page, re) {
  const open = page.getByRole("button", { name: /Tap to switch vehicle/i });
  if (!(await open.count())) return;
  await open.click();
  await page.getByRole("button", { name: re }).first().click();
  await dismissOverlays(page);
  await page.waitForTimeout(1200);
  await openChat(page);
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
      if (after.length > 350 && !taDisabled) {
        await page.waitForTimeout(2800);
        const text2 = await page.locator("body").innerText();
        const idx2 = text2.lastIndexOf(needle);
        last = text2.slice(idx2).slice(0, 3500);
        return last;
      }
    }
    await page.waitForTimeout(1200);
  }
  return last || (await page.locator("body").innerText()).slice(-2000);
}

async function uploadViaHiddenInput(page, filePath) {
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
  await page.waitForTimeout(1200);
}

async function sendWithPhoto(page, filePath, note) {
  await uploadViaHiddenInput(page, filePath);
  const ta = page.locator("textarea").first();
  await ta.fill(note);
  const send = page
    .locator("textarea")
    .locator("xpath=ancestor::*[self::form or self::div][1]//button[not(@disabled)]")
    .last();
  if (await send.count()) await send.click();
  else await ta.press("Enter");
  return waitReply(page, note.slice(0, 48));
}

function score(id, reply, rules) {
  const r = (reply || "").toLowerCase();
  const checks = {};
  for (const [k, fn] of Object.entries(rules)) checks[k] = !!fn(r, reply || "");
  const pass = Object.values(checks).every(Boolean);
  const unavailable = /vision.?unavailable|couldn.?t (analyze|see)|image analysis (failed|unavailable)|try again later/i.test(
    reply || "",
  );
  console.log(`\n=== ${id}: ${pass ? "PASS" : "FAIL"}${unavailable ? " (vision soft-fail)" : ""} ===`);
  console.log(checks);
  console.log((reply || "").slice(0, 900).replace(/\n{3,}/g, "\n\n"));
  fs.writeFileSync(path.join(outDir, `${id}.txt`), reply || "");
  return { id, pass, unavailable, checks, replyPreview: (reply || "").slice(0, 1200) };
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
  console.log("Logging in as", email, "→", BASE);
  await login(page);

  await switchVehicle(page, /Honda Civic Sport|2020 Honda Civic|Civic/i).catch(
    async () => {
      await switchVehicle(page, /Camry|Toyota/i).catch(() => {});
    },
  );

  for (const c of CASES) {
    const filePath = path.join(netDir, c.file);
    if (!fs.existsSync(filePath)) {
      results.push({ id: c.id, pass: false, error: `missing ${c.file}` });
      console.error("missing", c.file);
      continue;
    }
    console.log("\nSending", c.id, c.file);
    try {
      await openChat(page);
      const reply = await sendWithPhoto(page, filePath, c.note);
      results.push(score(c.id, reply, c.expect));
      await page.screenshot({
        path: path.join(outDir, `${c.id}.png`),
        fullPage: false,
      });
    } catch (err) {
      console.error(c.id, "failed", err);
      await page.screenshot({
        path: path.join(outDir, `${c.id}-error.png`),
        fullPage: true,
      });
      results.push({ id: c.id, pass: false, error: String(err) });
    }
  }
} catch (err) {
  console.error("QA failed:", err);
  await page.screenshot({ path: path.join(outDir, "fatal.png"), fullPage: true });
  process.exitCode = 1;
} finally {
  const passed = results.filter((r) => r.pass).length;
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    passed,
    total: results.length,
    results: results.map(({ id, pass, unavailable, checks, error, replyPreview }) => ({
      id,
      pass,
      unavailable: !!unavailable,
      checks,
      error,
      replyPreview,
    })),
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n==== SUMMARY ====");
  console.log(`${passed}/${results.length} PASS`);
  for (const r of results) {
    console.log(`- ${r.id}: ${r.pass ? "PASS" : "FAIL"}${r.error ? ` (${r.error})` : ""}`);
  }
  await browser.close();
  if (passed < results.length) process.exitCode = 1;
}
