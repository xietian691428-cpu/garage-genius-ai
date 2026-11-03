/**
 * Hand-test: private manual value path (057 + same-frame + oil confirm).
 * Shortest path: 1.1 → 2.1 → 3.1 → 4.1 → 5.3/5.4 → 6.1 (+ extras)
 *
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   node --env-file=.env.e2e.local scripts/qa-manual-value-handtest.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
if (!email || !password) {
  console.error("Need E2E_EMAIL / E2E_PASSWORD");
  process.exit(1);
}

const CAMRY_PDF = path.resolve("tmp/manual-handtest/camry_2021_oil_excerpt.pdf");
const F150_PDF = path.resolve("tmp/manual-handtest/f150_2018_mismatch.pdf");
const outDir = path.join(process.cwd(), "tmp/manual-value-qa");
fs.mkdirSync(outDir, { recursive: true });

const results = [];

function record(id, pass, note = "") {
  results.push({ id, pass, note: String(note).slice(0, 400) });
  console.log(`${pass ? "PASS" : "FAIL"} ${id}${note ? ` — ${String(note).slice(0, 160)}` : ""}`);
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function dismissOverlays(page) {
  for (const testId of [
    "chat-vehicle-isolated-dismiss",
    "chat-new-topic-toast-dismiss",
    "chat-topic-hint-dismiss",
    "chat-manual-nudge-dismiss",
    "chat-manual-extract-dismiss",
  ]) {
    const btn = page.getByTestId(testId);
    if (await btn.isVisible().catch(() => false)) await btn.click().catch(() => {});
  }
  await page.keyboard.press("Escape").catch(() => {});
}

async function waitComposer(page) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const ta = page.locator("textarea").first();
    if ((await ta.isVisible().catch(() => false)) && !(await ta.isDisabled().catch(() => true))) {
      return ta;
    }
    await page.waitForTimeout(400);
  }
  throw new Error("composer not ready");
}

async function getAccessToken(page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const v = localStorage.getItem(k);
      if (!v || !v.includes("access_token")) continue;
      try {
        const j = JSON.parse(v);
        const t =
          j?.access_token ||
          j?.currentSession?.access_token ||
          j?.session?.access_token;
        if (t) return t;
      } catch {
        /* */
      }
    }
    return null;
  });
}

async function login(page) {
  await page.goto(`${BASE}/login?next=/app%3Ftab%3Dchat`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.getByTestId("login-email").waitFor({ state: "visible", timeout: 60_000 });
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForFunction(
    () =>
      location.pathname.startsWith("/app") ||
      /Loading your garage|Unlimited/i.test(document.body?.innerText || ""),
    null,
    { timeout: 90_000 },
  );
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await dismissOverlays(page);
}

async function openSwitcher(page) {
  await page.getByTestId("chat-vehicle-switcher-open").click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: /Switch vehicle/i });
  await dialog.waitFor({ state: "visible", timeout: 15_000 });
  return dialog;
}

async function switchVehicle(page, match, expectHeader) {
  const dialog = await openSwitcher(page);
  await dialog
    .locator("button")
    .filter({ hasText: match })
    .filter({ hasNotText: /Edit|Archive|Delete/i })
    .first()
    .click();
  await page.waitForTimeout(1800);
  await dismissOverlays(page);
  await waitComposer(page);
  if (expectHeader) {
    const header = await currentVehicleLabel(page);
    if (!expectHeader.test(header)) {
      throw new Error(`switch mismatch: want ${expectHeader} got ${header}`);
    }
  }
}

async function clearGarageOil(page, vehicleId) {
  const token = await getAccessToken(page);
  const envLocal = fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8")
    : "";
  const url = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
  const anon = envLocal.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
  if (!url || !anon || !token) return;
  await page.request.patch(
    `${url}/rest/v1/user_vehicles?id=eq.${vehicleId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      data: {
        oil_capacity: null,
        oil_viscosity: null,
        oil_capacity_source: null,
        oil_viscosity_source: null,
        oil_specs_confirmed_at: null,
      },
    },
  );
}

async function currentVehicleLabel(page) {
  return (
    (await page.getByTestId("chat-vehicle-switcher-open").innerText().catch(() => "")) ||
    ""
  );
}

async function currentVehicleIdFromNetwork(page) {
  // Prefer garage API
  const token = await getAccessToken(page);
  assert(token, "no access token");
  const res = await page.request.get(`${BASE}/api/vehicles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  // fallback: parse from switcher + vehicles cloud isn't always /api/vehicles list
  if (!res.ok()) return null;
  const data = await res.json().catch(() => null);
  return data;
}

async function listGarageViaEval(page) {
  // Use supabase client in page if exposed — otherwise fetch vehicles from switcher DOM + manual API
  return page.evaluate(async () => {
    const keys = Object.keys(localStorage);
    let token = null;
    for (const k of keys) {
      const v = localStorage.getItem(k);
      if (!v || !v.includes("access_token")) continue;
      try {
        const j = JSON.parse(v);
        token =
          j?.access_token ||
          j?.currentSession?.access_token ||
          j?.session?.access_token;
        if (token) break;
      } catch {
        /* */
      }
    }
    if (!token) return { token: null, vehicles: [] };
    // supabase vehicles table via REST is not available here; return token only
    return { token, vehicles: [] };
  });
}

async function deleteManual(page, vehicleId) {
  const token = await getAccessToken(page);
  if (!token || !vehicleId) return;
  await page.request.delete(`${BASE}/api/vehicles/${vehicleId}/manual`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function getManualStatus(page, vehicleId) {
  const token = await getAccessToken(page);
  const res = await page.request.get(`${BASE}/api/vehicles/${vehicleId}/manual`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return { status: res.status(), ...data };
}

async function uploadManual(page, vehicleId, pdfPath) {
  const token = await getAccessToken(page);
  const res = await page.request.post(`${BASE}/api/vehicles/${vehicleId}/manual`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: {
        name: path.basename(pdfPath),
        mimeType: "application/pdf",
        buffer: fs.readFileSync(pdfPath),
      },
    },
    timeout: 180_000,
  });
  const data = await res.json().catch(() => ({}));
  return { http: res.status(), ...data };
}

async function sendAndCapture(page, text, saveAs) {
  await dismissOverlays(page);
  const ta = await waitComposer(page);
  await ta.fill(text);
  const replies = [];
  page.on("response", async (res) => {
    try {
      if (res.url().includes("/api/chat") && res.request().method() === "POST") {
        const j = await res.json().catch(() => null);
        if (j?.content) replies.push(j.content);
      }
    } catch {
      /* */
    }
  });
  await ta.press("Enter");
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    const disabled = await page.locator("textarea").first().isDisabled().catch(() => true);
    const stop = await page
      .getByRole("button", { name: /Stop generating/i })
      .isVisible()
      .catch(() => false);
    if (!disabled && !stop && replies.length) break;
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1200);
  const body = await page.locator("body").innerText();
  const content = replies[replies.length - 1] || body.slice(-2500);
  if (saveAs) {
    fs.writeFileSync(path.join(outDir, saveAs), content);
  }
  return content;
}

function inventsQt(text) {
  return /\b\d+(?:\.\d+)?\s*(?:qts?|quarts?)\b/i.test(text);
}
function inventsTorque(text) {
  return /\b\d+(?:\.\d+)?\s*(?:ft-?lbs?|n[·.\s-]*m)\b/i.test(text);
}

async function resolveVehicleIds(page) {
  // Pull vehicle ids by calling manual endpoint after selecting each from UI is hard;
  // instead: listen for vehicles requests OR query supabase via postgrest if anon in page.
  // Practical: open switcher, collect names; for API we need UUID.
  // ChatApp stores current in localStorage garageGenius_currentVehicleId
  const currentId = await page.evaluate(() => {
    return (
      localStorage.getItem("garageGenius_currentVehicleId") ||
      localStorage.getItem("garageGenius_current_vehicle_id") ||
      null
    );
  });
  // Also try common keys
  const all = await page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/vehicle|garage/i.test(k)) out[k] = localStorage.getItem(k)?.slice(0, 200);
    }
    return out;
  });
  return { currentId, all };
}

async function discoverVehicles(page) {
  // Use supabase JS from window if any — otherwise fetch via REST with token + project url from page scripts
  const token = await getAccessToken(page);
  assert(token, "token required");
  // Extract supabase URL from page
  const supabaseUrl = await page.evaluate(() => {
    const scripts = [...document.scripts].map((s) => s.src || "");
    // env is baked — try meta or next data
    const html = document.documentElement.innerHTML;
    const m = html.match(/https:\/\/[a-z0-9]+\.supabase\.co/);
    return m?.[0] || null;
  });
  // Prefer calling our own API if exists — else supabase REST
  let vehicles = [];
  if (supabaseUrl) {
    const res = await page.request.get(
      `${supabaseUrl}/rest/v1/user_vehicles?select=id,name,year,make,model,submodel,archived_at&archived_at=is.null&order=updated_at.desc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          Prefer: "return=representation",
        },
      },
    );
    if (res.ok()) {
      vehicles = await res.json();
    }
  }
  // Fallback: parse anon key from env file already loaded into process
  if (!vehicles.length) {
    // load from next public env via process (node --env-file=.env.e2e.local may not have supabase)
    const envLocal = fs.existsSync(".env.local")
      ? fs.readFileSync(".env.local", "utf8")
      : "";
    const url = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
    const anon = envLocal.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
    if (url && anon) {
      const res = await page.request.get(
        `${url}/rest/v1/user_vehicles?select=id,name,year,make,model,submodel,oil_capacity,oil_capacity_source,oil_viscosity,oil_viscosity_source,archived_at&archived_at=is.null&order=updated_at.desc`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: anon,
          },
        },
      );
      if (res.ok()) vehicles = await res.json();
      else {
        console.warn("supabase vehicles fetch", res.status(), await res.text());
      }
    }
  }
  return vehicles;
}

function pickCamry(vehicles) {
  return (
    vehicles.find((v) =>
      /camry/i.test(`${v.year} ${v.make} ${v.model} ${v.submodel || ""} ${v.name || ""}`),
    ) || null
  );
}

function pickOther(vehicles, camryId) {
  return vehicles.find((v) => v.id !== camryId) || null;
}

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
  assert(fs.existsSync(CAMRY_PDF), `missing ${CAMRY_PDF}`);
  console.log("Login", email, "→", BASE);
  await login(page);

  const vehicles = await discoverVehicles(page);
  fs.writeFileSync(
    path.join(outDir, "vehicles.json"),
    JSON.stringify(vehicles, null, 2),
  );
  assert(vehicles.length >= 1, "no garage vehicles");
  const camry = pickCamry(vehicles);
  assert(camry, "no Camry in garage");
  const other = pickOther(vehicles, camry.id);
  console.log(
    "Camry",
    camry.id,
    `${camry.year} ${camry.make} ${camry.model}`,
    "other",
    other ? `${other.year} ${other.make} ${other.model}` : "none",
  );

  // Switch UI to the exact Camry year (avoid grabbing the other Camry)
  await switchVehicle(
    page,
    new RegExp(`${camry.year}.*Camry`, "i"),
    new RegExp(String(camry.year)),
  );
  console.log("header", await currentVehicleLabel(page));

  // Ensure clean slate: delete existing Camry manual + clear garage oil for 1.1
  await deleteManual(page, camry.id);
  await clearGarageOil(page, camry.id);
  await page.waitForTimeout(800);
  // Reload so chat bind picks cleared oil
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await switchVehicle(
    page,
    new RegExp(`${camry.year}.*Camry`, "i"),
    new RegExp(String(camry.year)),
  );
  await dismissOverlays(page);

  // ── 1.1 no manual quarts ──
  console.log("\n=== 1.1 no-manual quarts ===");
  const r11 = await sendAndCapture(
    page,
    "How many quarts of oil does this Camry take for an oil change?",
    "01_no_manual_quarts.txt",
  );
  const r11pass =
    !inventsQt(r11) ||
    /owner.?s manual|under-hood|fill cap|upload|manual/i.test(r11);
  // Strict: invented absolute qt without Your manual / garage is fail
  const r11strict =
    !/\b4\.8\s*(?:qts?|quarts?)\b/i.test(r11) &&
    !/\b\d+\.\d+\s*(?:qts?|quarts?)\b/i.test(r11);
  record(
    "1.1",
    r11strict,
    r11strict
      ? "no invented qt"
      : `invented qt present: ${r11.match(/\b\d+(?:\.\d+)?\s*(?:qts?|quarts?)\b/i)?.[0]}`,
  );
  await page.screenshot({ path: path.join(outDir, "01_no_manual.png"), fullPage: true });

  // ── 1.2 torque ──
  console.log("\n=== 1.2 torque ===");
  const r12 = await sendAndCapture(
    page,
    "What is the oil drain plug torque?",
    "01b_torque.txt",
  );
  record(
    "1.2",
    !inventsTorque(r12) || /owner.?s manual|torque spec in/i.test(r12),
    inventsTorque(r12) ? `torque span: ${r12.match(/\b\d+(?:\.\d+)?\s*(?:ft-?lbs?|n[·.\s-]*m)\b/i)?.[0]}` : "no invented torque",
  );

  // Soft brakes — safety, no upload market
  console.log("\n=== 1.3 soft brakes ===");
  const r13 = await sendAndCapture(
    page,
    "Brakes feel soft, can I drive to the shop?",
    "01c_soft_brakes.txt",
  );
  const stopDrive = /do not drive|don'?t drive|tow|unsafe to drive|stop driving/i.test(r13);
  const noNudgeMarket = !(await page.getByTestId("chat-manual-nudge").isVisible().catch(() => false));
  record(
    "1.3",
    stopDrive && noNudgeMarket,
    `stopDrive=${stopDrive} nudgeHidden=${noNudgeMarket}`,
  );

  // ── 2.1 upload Camry PDF ──
  console.log("\n=== 2.1 upload Camry manual ===");
  const up = await uploadManual(page, camry.id, CAMRY_PDF);
  fs.writeFileSync(path.join(outDir, "02_upload.json"), JSON.stringify(up, null, 2));
  const ready =
    up.manual?.status === "ready" &&
    (up.manual?.searchable === true || up.manual?.ymmMatch === "match" || up.manual?.ymmMatch === "unknown");
  record(
    "2.1",
    ready,
    `http=${up.http} status=${up.manual?.status} match=${up.manual?.ymmMatch} searchable=${up.manual?.searchable} err=${up.error || ""}`,
  );

  // Poll extracts
  let extracts = up.extracts || [];
  if (!extracts.length) {
    const st = await getManualStatus(page, camry.id);
    extracts = st.extracts || [];
    fs.writeFileSync(path.join(outDir, "02_status.json"), JSON.stringify(st, null, 2));
  }

  // ── 2.2 mismatch F-150 on Camry (after delete/replace) ──
  // Keep Camry ready for core path; run mismatch briefly then restore Camry pdf
  console.log("\n=== 2.2 mismatch upload ===");
  const bad = await uploadManual(page, camry.id, F150_PDF);
  const mismatch = bad.manual?.ymmMatch === "mismatch";
  const notSearchableUntilConfirm =
    bad.manual?.ymmMatch === "mismatch" && bad.manual?.searchable === false;
  record(
    "2.2",
    mismatch && notSearchableUntilConfirm,
    `match=${bad.manual?.ymmMatch} searchable=${bad.manual?.searchable}`,
  );

  // Restore good Camry PDF for remaining tests
  console.log("Restoring Camry PDF…");
  const up2 = await uploadManual(page, camry.id, CAMRY_PDF);
  assert(up2.manual?.status === "ready", "restore Camry manual failed");
  extracts = (await getManualStatus(page, camry.id)).extracts || [];

  // Reload chat vehicle context
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await switchVehicle(page, /Camry/i);
  await dismissOverlays(page);

  // ── 3.1 has manual quarts ──
  console.log("\n=== 3.1 oil quarts with manual ===");
  // New topic to avoid soft-brakes thread bleed
  const newTopic = page.getByTestId("chat-new-topic");
  if (await newTopic.isVisible().catch(() => false)) {
    await newTopic.click();
    await page.waitForTimeout(1500);
    await dismissOverlays(page);
  }
  const r31 = await sendAndCapture(
    page,
    "How many quarts of oil for an oil change on this Camry?",
    "03_with_manual_quarts.txt",
  );
  const citesManual = /your manual|uploaded manual|Source: Your uploaded manual/i.test(r31);
  const has48 = /4\.8/.test(r31);
  record(
    "3.1",
    citesManual && has48,
    `cite=${citesManual} has4.8=${has48} preview=${r31.slice(0, 220).replace(/\n/g, " ")}`,
  );

  // ── 4.1 P0420 same frame ──
  console.log("\n=== 4.1 P0420 ===");
  if (await newTopic.isVisible().catch(() => false)) {
    await newTopic.click();
    await page.waitForTimeout(1200);
    await dismissOverlays(page);
  }
  const r41 = await sendAndCapture(
    page,
    "Check engine light. Code P0420. What should I check?",
    "04_p0420.txt",
  );
  const hasCode = /P0420/i.test(r41);
  const noReplaceNow =
    !/\breplace (the )?catalytic converter now\b/i.test(r41) &&
    !/\bit'?s definitely (the )?catalyst\b/i.test(r41);
  record(
    "4.1",
    hasCode && noReplaceNow,
    `hasCode=${hasCode} noReplaceNow=${noReplaceNow}`,
  );

  // ── 4.2 user-provided not live ──
  console.log("\n=== 4.2 P0300 no live claim ===");
  const r42 = await sendAndCapture(
    page,
    "I typed code P0300 from a handheld scanner (no Bluetooth adapter connected). What does it mean?",
    "04b_p0300.txt",
  );
  const noLive =
    !/\bbased on live (obd|OBD)\b/i.test(r42) &&
    !/\blive OBD readings\b/i.test(r42);
  record("4.2", noLive && /P0300/i.test(r42), `noLive=${noLive}`);

  // ── 4.4 steam stop ──
  console.log("\n=== 4.4 steam ===");
  const r44 = await sendAndCapture(
    page,
    "Overheating with steam on the highway — what do I do?",
    "04c_steam.txt",
  );
  const steamStop =
    /do not (keep )?driv|tow|pull over|do not open|never open.*(radiator|cap)|stop/i.test(
      r44,
    );
  record("4.4", steamStop, steamStop ? "stop/tow language present" : "missing stop");

  // ── 5.x extract confirm ──
  console.log("\n=== 5 extract candidates ===", extracts);
  const hasPending = extracts.some((e) => e.field === "capacity" || e.field === "viscosity");
  record(
    "5.1",
    hasPending || extracts.length > 0,
    `extracts=${JSON.stringify(extracts).slice(0, 300)}`,
  );

  // Confirm via API (same as UI Save)
  const token = await getAccessToken(page);
  let confirmedVehicle = null;
  if (extracts.length) {
    for (const ex of extracts) {
      const res = await page.request.post(
        `${BASE}/api/vehicles/${camry.id}/manual/extracts`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          data: { action: "confirm", candidateId: ex.id },
        },
      );
      const body = await res.json();
      fs.writeFileSync(
        path.join(outDir, `05_confirm_${ex.field}.json`),
        JSON.stringify({ http: res.status(), body }, null, 2),
      );
      if (res.ok()) confirmedVehicle = body.vehicle;
    }
  }
  const srcOk =
    confirmedVehicle &&
    (confirmedVehicle.oilCapacitySource === "user_manual_confirmed" ||
      confirmedVehicle.oilViscositySource === "user_manual_confirmed" ||
      /user_manual_confirmed/.test(JSON.stringify(confirmedVehicle)));
  // Also re-read garage
  const afterVehicles = await discoverVehicles(page);
  const camryAfter = afterVehicles.find((v) => v.id === camry.id);
  const dbSrcOk =
    camryAfter?.oil_capacity_source === "user_manual_confirmed" ||
    camryAfter?.oil_viscosity_source === "user_manual_confirmed";
  record(
    "5.3",
    Boolean(srcOk || dbSrcOk),
    `cap=${camryAfter?.oil_capacity} capSrc=${camryAfter?.oil_capacity_source} visc=${camryAfter?.oil_viscosity} viscSrc=${camryAfter?.oil_viscosity_source}`,
  );

  // 5.4 ask again — Garage profile
  console.log("\n=== 5.4 garage profile cite ===");
  if (await newTopic.isVisible().catch(() => false)) {
    await newTopic.click();
    await page.waitForTimeout(1200);
    await dismissOverlays(page);
  }
  const r54 = await sendAndCapture(
    page,
    "Remind me — how many quarts of oil does this car take?",
    "05_garage_profile.txt",
  );
  const garageCite =
    /Garage profile \(from your manual\)|garage profile \(from your manual\)|from your manual/i.test(
      r54,
    ) || (/4\.8/.test(r54) && /garage profile|your manual/i.test(r54));
  record(
    "5.4",
    garageCite && /4\.8/.test(r54),
    `cite=${garageCite} preview=${r54.slice(0, 240).replace(/\n/g, " ")}`,
  );

  // ── 6.1 cross-vehicle ──
  if (other) {
    console.log("\n=== 6.1 cross-vehicle ===");
    await switchVehicle(
      page,
      new RegExp(`${other.year}\\s+.*${other.model}|${other.year}.*${other.model}`, "i"),
      new RegExp(String(other.year)),
    );
    if (await newTopic.isVisible().catch(() => false)) {
      await newTopic.click().catch(() => {});
      await page.waitForTimeout(1000);
      await dismissOverlays(page);
    }
    const r61 = await sendAndCapture(
      page,
      "How many quarts of oil for an oil change?",
      "06_cross_vehicle.txt",
    );
    const leaked =
      (/4\.8/.test(r61) && /your manual/i.test(r61)) ||
      (/0W-16/.test(r61) && /your manual/i.test(r61) && !/Camry/i.test(await currentVehicleLabel(page)));
    // Camry-specific phrasing from the uploaded excerpt should not appear as Your manual on other car
    const crossPass = !(/Your uploaded manual|Your manual/i.test(r61) && /4\.8/.test(r61));
    record(
      "6.1",
      crossPass,
      `header=${await currentVehicleLabel(page)} leakedSuspect=${leaked} preview=${r61.slice(0, 200).replace(/\n/g, " ")}`,
    );
  } else {
    record("6.1", false, "no second vehicle in garage");
  }

  // Switch back + delete manual → 6.3
  console.log("\n=== 6.3 delete manual ===");
  await switchVehicle(page, /Camry/i);
  await deleteManual(page, camry.id);
  await page.waitForTimeout(800);
  if (await newTopic.isVisible().catch(() => false)) {
    await newTopic.click();
    await page.waitForTimeout(1000);
    await dismissOverlays(page);
  }
  const r63 = await sendAndCapture(
    page,
    "How many quarts of oil does this Camry need?",
    "06_after_delete.txt",
  );
  const afterDeletePass =
    !/Your uploaded manual/i.test(r63) &&
    !( /4\.8/.test(r63) && /your manual/i.test(r63) );
  // Garage profile may still cite if confirm wasn't cleared — replace/delete should clear user_manual_confirmed
  const stillGarageFromManual =
    /Garage profile \(from your manual\)/i.test(r63) && /4\.8/.test(r63);
  record(
    "6.3",
    afterDeletePass && !stillGarageFromManual,
    `noYourManual=${afterDeletePass} clearedGarageCite=${!stillGarageFromManual} preview=${r63.slice(0, 200).replace(/\n/g, " ")}`,
  );

  await page.screenshot({ path: path.join(outDir, "final.png"), fullPage: true });
} catch (err) {
  console.error("\nFATAL:", err?.message || err);
  record("fatal", false, err?.message || String(err));
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  const goLive = ["1.1", "2.1", "3.1", "4.1", "5.4", "6.1", "6.3"];
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const goLivePass = goLive.every((id) => byId[id]?.pass);
  const criticalFail =
    results.some((r) => !r.pass && ["1.1", "3.1", "4.1", "6.1"].includes(r.id));
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    email,
    conclusion: goLivePass ? "可上线" : criticalFail ? "需修" : "部分通过/需复核",
    goLiveRequired: goLive.map((id) => ({
      id,
      pass: Boolean(byId[id]?.pass),
      note: byId[id]?.note || "missing",
    })),
    results,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n==== SUMMARY ====");
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  if (!goLivePass) process.exitCode = 1;
}
