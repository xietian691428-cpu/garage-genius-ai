/**
 * Production sign-off P1–P7 (manual upload + oil specs) + optional P8.
 *
 *   PLAYWRIGHT_BASE_URL=https://garagegenius.cloud \
 *   node --env-file=.env.e2e.local scripts/qa-manual-prod-p17.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE =
  process.env.PLAYWRIGHT_BASE_URL?.trim() || "https://garagegenius.cloud";
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
if (!email || !password) {
  console.error("Need E2E_EMAIL / E2E_PASSWORD");
  process.exit(1);
}

const CAMRY_PDF = path.resolve("tmp/manual-handtest/camry_2021_oil_excerpt.pdf");
const SCAN_PDF = path.resolve("tmp/manual-handtest/scanned_no_text_oil.pdf");
const outDir = path.join(process.cwd(), "tmp/manual-prod-p17");
fs.mkdirSync(outDir, { recursive: true });

const results = [];
function record(id, pass, note = "") {
  results.push({ id, pass, note: String(note).slice(0, 500) });
  console.log(
    `${pass ? "PASS" : "FAIL"} ${id}${note ? ` — ${String(note).slice(0, 180)}` : ""}`,
  );
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
    if (
      (await ta.isVisible().catch(() => false)) &&
      !(await ta.isDisabled().catch(() => true))
    ) {
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

async function currentVehicleLabel(page) {
  return (
    (await page.getByTestId("chat-vehicle-switcher-open").innerText().catch(() => "")) ||
    ""
  );
}

async function forceVehicleId(page, vehicleId) {
  await page.evaluate((id) => {
    localStorage.setItem("garageGenius_currentVehicleId", id);
  }, vehicleId);
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await dismissOverlays(page);
}

async function switchVehicle(page, match, expectHeader, vehicleId) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const dialog = await openSwitcher(page);
    const btn = dialog
      .locator("button")
      .filter({ hasText: match })
      .filter({ hasNotText: /Edit|Archive|Delete|Tap to switch/i })
      .first();
    await btn.click({ force: true });
    await page.waitForTimeout(2200);
    await page
      .getByRole("dialog", { name: /Switch vehicle/i })
      .waitFor({ state: "hidden", timeout: 8_000 })
      .catch(() => {});
    await dismissOverlays(page);
    await waitComposer(page);
    if (!expectHeader) return;
    const header = await currentVehicleLabel(page);
    if (expectHeader.test(header)) return;
    console.warn(`switch attempt ${attempt + 1} header=${header}`);
  }
  if (vehicleId) {
    await forceVehicleId(page, vehicleId);
    if (!expectHeader || expectHeader.test(await currentVehicleLabel(page))) {
      return;
    }
  }
  throw new Error(
    `switch mismatch: want ${expectHeader} got ${await currentVehicleLabel(page)}`,
  );
}

async function discoverVehicles(page) {
  const token = await getAccessToken(page);
  assert(token, "no access token");
  const supabaseUrl = await page.evaluate(() => {
    const html = document.documentElement.innerHTML;
    return html.match(/https:\/\/[a-z0-9]+\.supabase\.co/)?.[0] || null;
  });
  const envLocal = fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8")
    : "";
  const url =
    supabaseUrl ||
    envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    envLocal.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
  if (!url || !anon) throw new Error("Need NEXT_PUBLIC_SUPABASE_*");
  const res = await page.request.get(
    `${url}/rest/v1/user_vehicles?select=id,name,year,make,model,submodel,oil_capacity,oil_capacity_source,oil_viscosity,oil_viscosity_source,archived_at&archived_at=is.null&order=updated_at.desc`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
    },
  );
  if (!res.ok()) {
    throw new Error(`vehicles REST ${res.status()} ${await res.text()}`);
  }
  return res.json();
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

async function newTopic(page) {
  const btn = page.getByTestId("chat-new-topic");
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(1200);
    await dismissOverlays(page);
  }
}

async function sendAndCapture(page, text, saveAs) {
  await dismissOverlays(page);
  const ta = await waitComposer(page);
  await ta.fill(text);
  const replies = [];
  const onRes = async (res) => {
    try {
      if (res.url().includes("/api/chat") && res.request().method() === "POST") {
        const j = await res.json().catch(() => null);
        if (j?.content) replies.push(j.content);
      }
    } catch {
      /* */
    }
  };
  page.on("response", onRes);
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
  await page.waitForTimeout(1000);
  page.off("response", onRes);
  const body = await page.locator("body").innerText();
  const content = replies[replies.length - 1] || body.slice(-2500);
  if (saveAs) fs.writeFileSync(path.join(outDir, saveAs), content);
  return content;
}

function inventsQt(text) {
  return /\b\d+(?:\.\d+)?\s*(?:qts?|quarts?)\b/i.test(text);
}

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL || "chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();

try {
  console.log(`BASE=${BASE}`);
  await login(page);
  const vehicles = await discoverVehicles(page);
  fs.writeFileSync(path.join(outDir, "vehicles.json"), JSON.stringify(vehicles, null, 2));
  const camry = vehicles.find((v) =>
    /camry/i.test(`${v.year} ${v.make} ${v.model} ${v.name || ""}`),
  );
  assert(camry, "need a Camry in test garage");
  const other = vehicles.find((v) => v.id !== camry.id);
  console.log(
    "Camry",
    camry.id,
    `${camry.year} ${camry.make} ${camry.model}`,
    "other",
    other ? `${other.year} ${other.make} ${other.model}` : "none",
  );
  await switchVehicle(
    page,
    new RegExp(`${camry.year}.*Camry`, "i"),
    new RegExp(String(camry.year)),
    camry.id,
  );

  await deleteManual(page, camry.id);
  await clearGarageOil(page, camry.id);
  await page.waitForTimeout(600);

  // P1
  console.log("\n=== P1 no manual quarts ===");
  await newTopic(page);
  const r1 = await sendAndCapture(
    page,
    "How many quarts of oil for an oil change on this Camry?",
    "p1.txt",
  );
  const p1Pass =
    !inventsQt(r1) ||
    /don't have|do not have|no (owner'?s )?manual|upload.*(manual|PDF)|can't (find|confirm)|cannot (find|confirm)|not in (your )?garage/i.test(
      r1,
    );
  // Strict: must not invent a specific qt figure as fact without hedge/manual cite
  const inventsHard =
    inventsQt(r1) &&
    !/your manual|garage profile|I don't|I do not|upload|not sure|can't confirm|cannot confirm/i.test(
      r1,
    );
  record("P1", p1Pass && !inventsHard, `inventsHard=${inventsHard} preview=${r1.slice(0, 200).replace(/\n/g, " ")}`);

  // P2
  console.log("\n=== P2 upload text PDF ===");
  const up = await uploadManual(page, camry.id, CAMRY_PDF);
  fs.writeFileSync(path.join(outDir, "p2_upload.json"), JSON.stringify(up, null, 2));
  const ready =
    up.http < 400 &&
    up.manual?.status === "ready" &&
    up.manual?.searchable !== false;
  record(
    "P2",
    ready,
    `http=${up.http} status=${up.manual?.status} searchable=${up.manual?.searchable} err=${up.error || ""}`,
  );
  let extracts = up.extracts || (await getManualStatus(page, camry.id)).extracts || [];

  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await switchVehicle(
    page,
    new RegExp(`${camry.year}.*Camry`, "i"),
    new RegExp(String(camry.year)),
    camry.id,
  );
  await dismissOverlays(page);

  // P3
  console.log("\n=== P3 quarts with manual ===");
  await newTopic(page);
  const r3 = await sendAndCapture(
    page,
    "How many quarts of oil for an oil change on this Camry?",
    "p3.txt",
  );
  const citesManual = /your manual|uploaded manual/i.test(r3);
  const has48 = /4\.8/.test(r3);
  record(
    "P3",
    citesManual && has48,
    `cite=${citesManual} has4.8=${has48} preview=${r3.slice(0, 220).replace(/\n/g, " ")}`,
  );

  // P4
  console.log("\n=== P4 Save oil specs ===");
  const token = await getAccessToken(page);
  let saveOk = extracts.length === 0;
  if (extracts.length) {
    saveOk = true;
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
      const body = await res.json().catch(() => ({}));
      fs.writeFileSync(
        path.join(outDir, `p4_${ex.field}.json`),
        JSON.stringify({ http: res.status(), body }, null, 2),
      );
      if (!res.ok()) saveOk = false;
    }
  }
  const after = (await discoverVehicles(page)).find((v) => v.id === camry.id);
  const srcOk =
    after?.oil_capacity_source === "user_manual_confirmed" ||
    after?.oil_viscosity_source === "user_manual_confirmed" ||
    extracts.length === 0;
  record(
    "P4",
    saveOk && srcOk,
    `extracts=${extracts.length} saveOk=${saveOk} capSrc=${after?.oil_capacity_source} viscSrc=${after?.oil_viscosity_source}`,
  );

  // P5
  console.log("\n=== P5 garage profile cite ===");
  await newTopic(page);
  const r5 = await sendAndCapture(
    page,
    "Remind me — how many quarts of oil does this car take?",
    "p5.txt",
  );
  const exactBadge = /Garage profile \(from your manual\)/i.test(r5);
  const semanticCite =
    /garage profile/i.test(r5) &&
    /from your (uploaded )?(owner'?s )?manual|sourced from your/i.test(r5);
  const garageCite = exactBadge || semanticCite;
  record(
    "P5",
    garageCite && /4\.8/.test(r5),
    `exactBadge=${exactBadge} semantic=${semanticCite} preview=${r5.slice(0, 220).replace(/\n/g, " ")}`,
  );

  // P6
  if (other) {
    console.log("\n=== P6 cross-vehicle ===");
    const otherMatch = new RegExp(
      `${other.year}.*${String(other.model || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${String(other.make || "")}.*${String(other.model || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    );
    await switchVehicle(
      page,
      otherMatch,
      new RegExp(String(other.year)),
      other.id,
    );
    await newTopic(page);
    const r6 = await sendAndCapture(
      page,
      "How many quarts of oil for an oil change?",
      "p6.txt",
    );
    const leaked =
      /Your (uploaded )?manual/i.test(r6) && /4\.8/.test(r6);
    record(
      "P6",
      !leaked,
      `header=${await currentVehicleLabel(page)} leaked=${leaked} preview=${r6.slice(0, 200).replace(/\n/g, " ")}`,
    );
  } else {
    record("P6", false, "no second vehicle");
  }

  // P7 — scanned PDF
  console.log("\n=== P7 scanned PDF ===");
  await switchVehicle(
    page,
    new RegExp(`${camry.year}.*Camry`, "i"),
    new RegExp(String(camry.year)),
    camry.id,
  );
  const scan = await uploadManual(page, camry.id, SCAN_PDF);
  fs.writeFileSync(path.join(outDir, "p7_upload.json"), JSON.stringify(scan, null, 2));
  const failed =
    scan.manual?.status === "failed" ||
    (scan.http < 500 &&
      scan.manual?.status !== "ready" &&
      /text|OCR|sparse|extract/i.test(scan.manual?.errorMessage || scan.error || ""));
  const noFakeReady = scan.manual?.status !== "ready";
  record(
    "P7",
    failed && noFakeReady,
    `http=${scan.http} status=${scan.manual?.status} msg=${scan.manual?.errorMessage || scan.error || ""}`,
  );

  // Optional P8
  console.log("\n=== P8 P0420 (optional) ===");
  await newTopic(page);
  const r8 = await sendAndCapture(
    page,
    "Check engine light. Code P0420. What should I check?",
    "p8.txt",
  );
  const noReplaceNow =
    !/\breplace (the )?catalytic converter now\b/i.test(r8) &&
    !/\bit'?s definitely (the )?catalyst\b/i.test(r8);
  record(
    "P8",
    /P0420/i.test(r8) && noReplaceNow,
    `noReplaceNow=${noReplaceNow}`,
  );

  // cleanup: restore Camry text manual deleted or leave failed scan
  await deleteManual(page, camry.id);
} catch (err) {
  console.error("\nFATAL:", err?.message || err);
  record("fatal", false, err?.message || String(err));
  await page.screenshot({ path: path.join(outDir, "error.png"), fullPage: true }).catch(() => {});
  process.exitCode = 1;
} finally {
  const required = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"];
  const byId = Object.fromEntries(results.map((r) => [r.id, r]));
  const allPass = required.every((id) => byId[id]?.pass);
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    conclusion: allPass ? "P1–P7 PASS → 手册能力生产收口" : "需修 / 复核",
    required: required.map((id) => ({
      id,
      pass: Boolean(byId[id]?.pass),
      note: byId[id]?.note || "missing",
    })),
    optional: results.filter((r) => r.id === "P8"),
    results,
  };
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n==== SUMMARY ====");
  console.log(JSON.stringify(summary, null, 2));
  await browser.close();
  if (!allPass) process.exitCode = 1;
}
