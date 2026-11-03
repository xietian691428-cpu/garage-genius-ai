/**
 * Prudent spot-check A–F (multi-brand / PDF variety) on E2E test account.
 *
 *   node --env-file=.env.local --env-file=.env.e2e.local scripts/qa-manual-spotcheck-brands.mjs
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

const PDF = {
  f150: path.resolve("tmp/manual-handtest/f150_2018_oil_excerpt.pdf"),
  civic: path.resolve("tmp/manual-handtest/civic_2020_oil_excerpt.pdf"),
  bmw: path.resolve("tmp/manual-handtest/bmw_320i_2019_fluids.pdf"),
  scan: path.resolve("tmp/manual-handtest/scanned_no_text_oil.pdf"),
  long: path.resolve("tmp/manual-handtest/camry_long_partial_oil.pdf"),
  mismatch: path.resolve("tmp/manual-handtest/f150_2018_mismatch.pdf"),
};
for (const [k, p] of Object.entries(PDF)) {
  if (!fs.existsSync(p)) {
    console.error("missing PDF", k, p);
    process.exit(1);
  }
}

const outDir = path.join(process.cwd(), "tmp/manual-spotcheck-qa");
fs.mkdirSync(outDir, { recursive: true });
const results = [];

function record(id, pass, note = "") {
  results.push({ id, pass, note: String(note).slice(0, 500) });
  console.log(
    `${pass ? "PASS" : "FAIL"} ${id}${note ? ` — ${String(note).slice(0, 180)}` : ""}`,
  );
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
  await page.waitForTimeout(200);
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

function envPair(key) {
  const envLocal = fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8")
    : "";
  return envLocal.match(new RegExp(`${key}=(.+)`))?.[1]?.trim();
}

async function login(page) {
  await page.goto(`${BASE}/login?next=/app%3Ftab%3Dchat`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.getByTestId("login-email").fill(email);
  await page.getByTestId("login-password").fill(password);
  await page.getByTestId("login-submit").click();
  await page.waitForFunction(
    () => location.pathname.startsWith("/app"),
    null,
    { timeout: 90_000 },
  );
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await dismissOverlays(page);
}

async function openSwitcher(page) {
  const dialog = page.getByRole("dialog", { name: /Switch vehicle/i });
  if (!(await dialog.isVisible().catch(() => false))) {
    await dismissOverlays(page);
    await page.getByTestId("chat-vehicle-switcher-open").click({ timeout: 20_000 });
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
  }
  return dialog;
}

async function switchVehicle(page, re, headerNeedle) {
  let dialog = await openSwitcher(page);
  let target = dialog
    .locator("button")
    .filter({ hasText: re })
    .filter({ hasNotText: /Edit profile|Archive|Delete/i })
    .first();
  if (!(await target.isVisible().catch(() => false))) {
    const labels = await dialog.locator("button").allInnerTexts().catch(() => []);
    console.log(
      "  switcher buttons:",
      labels.map((t) => t.replace(/\s+/g, " ").slice(0, 70)),
    );
    await page.keyboard.press("Escape").catch(() => {});
    await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
    await waitComposer(page);
    await dismissOverlays(page);
    dialog = await openSwitcher(page);
    target = dialog
      .locator("button")
      .filter({ hasText: re })
      .filter({ hasNotText: /Edit profile|Archive|Delete/i })
      .first();
  }
  await target.waitFor({ state: "visible", timeout: 20_000 });
  console.log(
    "  select:",
    ((await target.innerText()) || "").replace(/\s+/g, " ").slice(0, 90),
  );
  await target.click();
  await page.waitForFunction(
    (n) => {
      const open = document.querySelector(
        '[data-testid="chat-vehicle-switcher-open"]',
      );
      return new RegExp(n, "i").test(open?.textContent || "");
    },
    headerNeedle,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(1200);
  await dismissOverlays(page);
  await waitComposer(page);
}

async function newTopic(page) {
  const nt = page.getByTestId("chat-new-topic");
  if (await nt.isVisible().catch(() => false)) {
    await nt.click();
    await page.waitForTimeout(1400);
    await dismissOverlays(page);
    await waitComposer(page);
  }
}

async function sendChat(page, text, fileStem) {
  await dismissOverlays(page);
  const ta = await waitComposer(page);
  await ta.fill(text);
  let reply = "";
  let postBody = null;
  const onRes = async (res) => {
    if (!/\/api\/chat(?:\?|$)/.test(res.url())) return;
    if (res.request().method() !== "POST") return;
    const j = await res.json().catch(() => null);
    if (j?.content) reply = j.content;
  };
  const onReq = (req) => {
    if (req.method() === "POST" && /\/api\/chat(?:\?|$)/.test(req.url())) {
      try {
        postBody = req.postDataJSON();
      } catch {
        postBody = null;
      }
    }
  };
  page.on("response", onRes);
  page.on("request", onReq);
  await ta.press("Enter");
  const start = Date.now();
  while (Date.now() - start < 180_000) {
    if (
      reply &&
      !(await page.locator("textarea").first().isDisabled().catch(() => true))
    ) {
      break;
    }
    await page.waitForTimeout(600);
  }
  page.off("response", onRes);
  page.off("request", onReq);
  fs.writeFileSync(path.join(outDir, `${fileStem}.txt`), reply || "");
  return { reply: reply || "", postBody };
}

async function authHeaders(page) {
  const token = await getAccessToken(page);
  if (!token) throw new Error("no token");
  return { Authorization: `Bearer ${token}` };
}

async function listVehicles(page) {
  const token = await getAccessToken(page);
  const url = envPair("NEXT_PUBLIC_SUPABASE_URL");
  const anon = envPair("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anon || !token) throw new Error("missing supabase env for vehicle list");
  const res = await page.request.get(
    `${url}/rest/v1/user_vehicles?select=id,name,year,make,model,submodel,archived_at,oil_capacity,oil_viscosity,oil_capacity_source,oil_viscosity_source&order=created_at.desc`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
    },
  );
  const list = await res.json().catch(() => null);
  if (!Array.isArray(list)) {
    throw new Error(`vehicle list failed ${res.status()} ${JSON.stringify(list)}`);
  }
  return list;
}

async function clearOil(page, vehicleId) {
  const token = await getAccessToken(page);
  const url = envPair("NEXT_PUBLIC_SUPABASE_URL");
  const anon = envPair("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anon || !token) return;
  await page.request.patch(`${url}/rest/v1/user_vehicles?id=eq.${vehicleId}`, {
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
  });
}

async function archiveVehicle(page, vehicleId) {
  const token = await getAccessToken(page);
  const url = envPair("NEXT_PUBLIC_SUPABASE_URL");
  const anon = envPair("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!url || !anon || !token) return false;
  const res = await page.request.patch(
    `${url}/rest/v1/user_vehicles?id=eq.${vehicleId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      data: { archived_at: new Date().toISOString(), is_current: false },
    },
  );
  return res.ok();
}

async function deleteManual(page, vehicleId) {
  const res = await page.request.delete(
    `${BASE}/api/vehicles/${vehicleId}/manual`,
    { headers: await authHeaders(page) },
  );
  return res.status();
}

async function uploadManual(page, vehicleId, pdfPath) {
  const res = await page.request.post(
    `${BASE}/api/vehicles/${vehicleId}/manual`,
    {
      headers: await authHeaders(page),
      multipart: {
        file: {
          name: path.basename(pdfPath),
          mimeType: "application/pdf",
          buffer: fs.readFileSync(pdfPath),
        },
      },
      timeout: 180_000,
    },
  );
  const body = await res.json().catch(() => ({}));
  fs.writeFileSync(
    path.join(outDir, `upload_${vehicleId.slice(0, 8)}.json`),
    JSON.stringify({ status: res.status(), body }, null, 2),
  );
  return { status: res.status(), body };
}

async function waitReady(page, vehicleId, timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await page.request.get(
      `${BASE}/api/vehicles/${vehicleId}/manual`,
      { headers: await authHeaders(page) },
    );
    const j = await res.json().catch(() => null);
    const m = j?.manual || j;
    if (m?.status === "ready" || m?.status === "failed") return m;
    await page.waitForTimeout(1200);
  }
  return null;
}

async function getExtracts(page, vehicleId) {
  const res = await page.request.get(
    `${BASE}/api/vehicles/${vehicleId}/manual/extracts`,
    { headers: await authHeaders(page) },
  );
  return res.json().catch(() => null);
}

async function confirmAllPending(page, vehicleId) {
  const ex = await getExtracts(page, vehicleId);
  const pending = (ex?.extracts || ex || []).filter(
    (e) => e.status === "pending" || !e.status,
  );
  const confirmed = [];
  for (const e of pending) {
    const res = await page.request.post(
      `${BASE}/api/vehicles/${vehicleId}/manual/extracts`,
      {
        headers: {
          ...(await authHeaders(page)),
          "Content-Type": "application/json",
        },
        data: { candidateId: e.id, action: "confirm" },
      },
    );
    const j = await res.json().catch(() => null);
    confirmed.push({ field: e.field, value: e.value, http: res.status(), j });
  }
  return confirmed;
}

async function ensureF150(page, vehicles) {
  let f150 = vehicles.find(
    (v) =>
      /ford/i.test(v.make || "") &&
      /f-?150/i.test(v.model || "") &&
      !v.archived_at,
  );
  if (f150) return f150;

  const active = vehicles.filter((v) => !v.archived_at);
  // Free a slot if at plan limit: archive Camry 2021 seed (keep 2019 Camry for E/F)
  const camry2021 = active.find(
    (v) => /Camry/i.test(v.model || "") && Number(v.year) === 2021,
  );
  if (active.length >= 5) {
    const victim = camry2021 || active.find((v) => /Corolla/i.test(v.model || ""));
    if (!victim) throw new Error("at vehicle limit and no safe vehicle to archive");
    console.log(`  archiving ${victim.year} ${victim.model} (${victim.id}) for F-150 slot`);
    const ok = await archiveVehicle(page, victim.id);
    if (!ok) throw new Error(`archive failed for ${victim.id}`);
    await page.waitForTimeout(500);
  }

  const res = await page.request.post(`${BASE}/api/vehicles`, {
    headers: {
      ...(await authHeaders(page)),
      "Content-Type": "application/json",
    },
    data: {
      makeCurrent: false,
      vehicle: {
        name: "Test F-150 US",
        year: 2018,
        make: "Ford",
        model: "F-150",
        submodel: "XLT",
        mileage: 78000,
        mileageUnit: "miles",
        engine: "5.0L V8",
        transmission: "Automatic",
        driveType: "4WD",
        market: "US",
        tags: ["QA Spotcheck"],
      },
    },
  });
  const j = await res.json().catch(() => null);
  if (!res.ok()) {
    throw new Error(`create F-150 failed ${res.status()} ${JSON.stringify(j)}`);
  }
  f150 = j?.vehicle || j;
  console.log("  created F-150", f150?.id);
  // Garage UI may still cache the old list — force reload.
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await dismissOverlays(page);
  return f150;
}

function inventsQt(text, forbiddenNumbers) {
  // invent = states a concrete capacity matching our PDF secrets without proper cite context
  // For baseline (no manual): any specific X.X qt/L claim is bad unless clearly "garage profile" pre-seeded
  const m = text.match(
    /(\d+(?:\.\d+)?)\s*(?:US\s*)?(?:qt|quarts?|L|liters?|litres?)\b/gi,
  );
  if (!m) return false;
  return m.some((hit) =>
    forbiddenNumbers.some((n) => hit.toLowerCase().includes(String(n))),
  );
}

async function shortestPath(page, opts) {
  const {
    caseId,
    vehicle,
    switchRe,
    headerNeedle,
    pdf,
    expectCapacityRe,
    inventBaselineForbidden,
    otherSwitchRe,
    otherHeader,
  } = opts;

  console.log(`\n=== ${caseId} ${vehicle.year} ${vehicle.make} ${vehicle.model} ===`);
  await switchVehicle(page, switchRe, headerNeedle);
  await clearOil(page, vehicle.id);
  await deleteManual(page, vehicle.id);
  await page.waitForTimeout(800);

  // baseline no numbers
  await newTopic(page);
  const b = await sendChat(
    page,
    "How many quarts of oil does it take for an oil change?",
    `${caseId}_baseline`,
  );
  const baseBad =
    inventsQt(b.reply, inventBaselineForbidden) &&
    !/don't have|do not have|won't invent|will not invent|no verified|not (?:have|got) a verified|upload (?:your )?manual|owner.?s manual|under-hood|filler cap/i.test(
      b.reply,
    );
  // softer: fail only if asserts a forbidden number as fact without hedging
  const assertsNum = inventBaselineForbidden.some((n) => {
    const re = new RegExp(
      `(?:takes|needs|capacity(?: is)?|use|fill(?: with)?)[^.]{0,40}${n}\\s*(?:qt|quart|L|liter)`,
      "i",
    );
    return re.test(b.reply);
  });
  record(`${caseId}.baseline`, !assertsNum, b.reply.slice(0, 220).replace(/\n/g, " "));

  // upload
  const up = await uploadManual(page, vehicle.id, pdf);
  const manual = await waitReady(page, vehicle.id);
  const readyOk =
    up.status === 200 &&
    manual?.status === "ready" &&
    (manual?.searchable === true || manual?.ymmMatch !== "mismatch");
  record(
    `${caseId}.upload`,
    !!readyOk,
    `http=${up.status} status=${manual?.status} match=${manual?.ymmMatch} searchable=${manual?.searchable}`,
  );

  await newTopic(page);
  const q = await sendChat(
    page,
    "How many quarts of oil for an oil change on this vehicle?",
    `${caseId}_quarts`,
  );
  const cites =
    /Your (?:uploaded )?manual|Per your manual|from your manual|Source/i.test(
      q.reply,
    );
  const hasCap = expectCapacityRe.test(q.reply);
  record(
    `${caseId}.quarts`,
    cites && hasCap,
    `cite=${cites} cap=${hasCap} ${q.reply.slice(0, 200).replace(/\n/g, " ")}`,
  );

  // confirm extracts → garage
  const conf = await confirmAllPending(page, vehicle.id);
  fs.writeFileSync(
    path.join(outDir, `${caseId}_confirm.json`),
    JSON.stringify(conf, null, 2),
  );
  const confOk = conf.length > 0 && conf.every((c) => c.http < 300);
  record(`${caseId}.confirm`, confOk, JSON.stringify(conf.map((c) => ({ f: c.field, v: c.value, http: c.http }))));

  await newTopic(page);
  const g = await sendChat(
    page,
    "How many quarts of oil does this car need?",
    `${caseId}_garage`,
  );
  const garageCite =
    /Garage profile|from your manual|Per your manual|garage profile/i.test(
      g.reply,
    ) && expectCapacityRe.test(g.reply);
  record(
    `${caseId}.garage`,
    garageCite,
    g.reply.slice(0, 220).replace(/\n/g, " "),
  );

  // isolation to other vehicle
  if (otherSwitchRe && otherHeader) {
    await switchVehicle(page, otherSwitchRe, otherHeader);
    await newTopic(page);
    const iso = await sendChat(
      page,
      "How many quarts of oil for an oil change?",
      `${caseId}_iso`,
    );
    const leaked =
      expectCapacityRe.test(iso.reply) &&
      /Your (?:uploaded )?manual/i.test(iso.reply) &&
      new RegExp(vehicle.model, "i").test(iso.reply);
    // also leak if unique capacity from THIS case appears with Your manual while answering wrong car
    const uniqueLeak =
      inventBaselineForbidden.some((n) =>
        new RegExp(`${n}\\s*(?:qt|quart)`, "i").test(iso.reply),
      ) && /Your (?:uploaded )?manual/i.test(iso.reply);
    record(
      `${caseId}.isolation`,
      !leaked && !uniqueLeak,
      iso.reply.slice(0, 220).replace(/\n/g, " "),
    );
    // switch back
    await switchVehicle(page, switchRe, headerNeedle);
  }

  // delete recovery
  await deleteManual(page, vehicle.id);
  await clearOil(page, vehicle.id);
  await newTopic(page);
  const del = await sendChat(
    page,
    "How many quarts of oil does this vehicle need?",
    `${caseId}_after_delete`,
  );
  const stillCitesManual = /Your uploaded manual/i.test(del.reply);
  const reAsserts = inventBaselineForbidden.some((n) => {
    const re = new RegExp(
      `(?:takes|needs|capacity(?: is)?|use)\\s[^.]{0,40}${n}\\s*(?:qt|quart|L|liter)`,
      "i",
    );
    return re.test(del.reply) && /Your uploaded manual|Garage profile \(from your manual\)/i.test(del.reply);
  });
  record(
    `${caseId}.after_delete`,
    !stillCitesManual && !reAsserts,
    del.reply.slice(0, 220).replace(/\n/g, " "),
  );
}

const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL || "chrome",
});
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();

try {
  await login(page);
  let vehicles = await listVehicles(page);
  fs.writeFileSync(
    path.join(outDir, "vehicles_before.json"),
    JSON.stringify(vehicles, null, 2),
  );

  const f150 = await ensureF150(page, vehicles);
  vehicles = await listVehicles(page);
  const civic = vehicles.find(
    (v) => /Honda/i.test(v.make) && /Civic/i.test(v.model) && !v.archived_at,
  );
  const bmw = vehicles.find(
    (v) => /BMW/i.test(v.make) && /320i/i.test(v.model) && !v.archived_at,
  );
  const camry = vehicles.find(
    (v) =>
      /Toyota/i.test(v.make) &&
      /Camry/i.test(v.model) &&
      Number(v.year) === 2019 &&
      !v.archived_at,
  );
  const corolla = vehicles.find(
    (v) => /Corolla/i.test(v.model) && !v.archived_at,
  );
  if (!civic || !bmw || !camry) {
    throw new Error(
      `missing seed vehicles civic=${!!civic} bmw=${!!bmw} camry=${!!camry}`,
    );
  }

  // ── A F-150 ──
  await shortestPath(page, {
    caseId: "A",
    vehicle: f150,
    switchRe: /F-150|Ford F/i,
    headerNeedle: "F-150",
    pdf: PDF.f150,
    expectCapacityRe: /6(?:\.0)?\s*(?:qt|quarts)/i,
    inventBaselineForbidden: ["6.0", "6", "5.7"],
    otherSwitchRe: corolla ? /Corolla/i : /Civic/i,
    otherHeader: corolla ? "2018" : "2020",
  });

  // ── B Civic ──
  await shortestPath(page, {
    caseId: "B",
    vehicle: civic,
    switchRe: /Civic/i,
    headerNeedle: "Civic",
    pdf: PDF.civic,
    expectCapacityRe: /3\.7\s*(?:US\s*)?(?:qt|quarts)/i,
    inventBaselineForbidden: ["3.7", "3.5"],
    otherSwitchRe: /Camry/i,
    otherHeader: "2019",
  });

  // ── C BMW 320i liters ──
  await shortestPath(page, {
    caseId: "C",
    vehicle: bmw,
    switchRe: /320i|BMW/i,
    headerNeedle: "320i",
    pdf: PDF.bmw,
    expectCapacityRe: /5\.2\s*(?:L|liters?|litres?)|5\.5\s*(?:US\s*)?(?:qt|quarts)/i,
    inventBaselineForbidden: ["5.2", "5.5", "8.5"],
    otherSwitchRe: /Civic/i,
    otherHeader: "Civic",
  });

  // ── D scanned / no text layer on Camry ──
  console.log("\n=== D scanned PDF ===");
  await switchVehicle(page, /2019 Toyota Camry|Camry LE/i, "2019");
  await clearOil(page, camry.id);
  await deleteManual(page, camry.id);
  const upD = await uploadManual(page, camry.id, PDF.scan);
  const manD = await waitReady(page, camry.id);
  fs.writeFileSync(
    path.join(outDir, "D_manual.json"),
    JSON.stringify({ up: upD.status, manD }, null, 2),
  );
  await newTopic(page);
  const dQ = await sendChat(
    page,
    "How many quarts of oil does this Camry need?",
    "D_quarts",
  );
  const inventedScan =
    /4\.9/.test(dQ.reply) &&
    /Your (?:uploaded )?manual|Garage profile/i.test(dQ.reply);
  const graceful =
    manD?.status === "failed" ||
    manD?.searchable === false ||
    !/Your uploaded manual/i.test(dQ.reply) ||
    /couldn't (?:read|extract)|no text|scan|upload a text|not (?:able|enough)/i.test(
      dQ.reply,
    );
  record(
    "D.scan_graceful",
    !inventedScan && (graceful || !/4\.9/.test(dQ.reply)),
    `status=${manD?.status} searchable=${manD?.searchable} inventedScan=${inventedScan} ${dQ.reply.slice(0, 180).replace(/\n/g, " ")}`,
  );
  await deleteManual(page, camry.id);

  // ── E long partial — cite oil, no invent torque ──
  console.log("\n=== E long partial oil ===");
  await clearOil(page, camry.id);
  const upE = await uploadManual(page, camry.id, PDF.long);
  const manE = await waitReady(page, camry.id);
  record(
    "E.upload",
    upE.status === 200 && manE?.status === "ready",
    `status=${manE?.status} searchable=${manE?.searchable}`,
  );
  await newTopic(page);
  const eOil = await sendChat(
    page,
    "How many quarts of oil for an oil change?",
    "E_oil",
  );
  record(
    "E.oil_cite",
    /4\.8/.test(eOil.reply) &&
      /Your (?:uploaded )?manual|Per your manual|from your manual/i.test(
        eOil.reply,
      ),
    eOil.reply.slice(0, 200).replace(/\n/g, " "),
  );
  await newTopic(page);
  const eTorq = await sendChat(
    page,
    "What is the drain plug torque?",
    "E_torque",
  );
  const inventTorque =
    /\d+\s*(?:ft-?lb|ft·lb|N·m|Nm|N\.m)/i.test(eTorq.reply) &&
    !/not (?:listed|in|found)|don't have|do not have|won't invent|will not invent|no (?:torque|spec)/i.test(
      eTorq.reply,
    );
  record(
    "E.no_invent_torque",
    !inventTorque,
    eTorq.reply.slice(0, 220).replace(/\n/g, " "),
  );
  await deleteManual(page, camry.id);
  await clearOil(page, camry.id);

  // ── F mismatch wrong-car PDF ──
  console.log("\n=== F mismatch ===");
  const upF = await uploadManual(page, camry.id, PDF.mismatch);
  const manF = await waitReady(page, camry.id);
  const mismatchOk =
    manF?.ymmMatch === "mismatch" && manF?.searchable === false;
  record(
    "F.mismatch_blocked",
    mismatchOk,
    `match=${manF?.ymmMatch} searchable=${manF?.searchable} confirmed=${manF?.userConfirmedMatch}`,
  );
  await newTopic(page);
  const fQ = await sendChat(
    page,
    "How many quarts of oil according to my uploaded manual?",
    "F_quarts",
  );
  const usedMismatch =
    /6(?:\.0)?\s*(?:qt|quarts)/i.test(fQ.reply) &&
    /Your (?:uploaded )?manual/i.test(fQ.reply);
  record(
    "F.no_search_until_confirm",
    !usedMismatch,
    fQ.reply.slice(0, 220).replace(/\n/g, " "),
  );
  await deleteManual(page, camry.id);

  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    email,
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    results,
  };
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(
    `\nDone: ${summary.pass} PASS / ${summary.fail} FAIL → ${outDir}/summary.json`,
  );
  process.exitCode = summary.fail ? 1 : 0;
} catch (err) {
  console.error(err);
  fs.writeFileSync(
    path.join(outDir, "error.txt"),
    String(err?.stack || err),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
