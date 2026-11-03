/**
 * Error / pressure pack E1–E15 (priority E1,E3,E6,E7,E10,E11,E14).
 *
 *   node --env-file=.env.local --env-file=.env.e2e.local scripts/qa-manual-pressure.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://localhost:3000";
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
if (!email || !password) {
  console.error("Need E2E_EMAIL / E2E_PASSWORD");
  process.exit(1);
}

const FIX = path.resolve("tmp/manual-pressure");
const outDir = path.resolve("tmp/manual-pressure-qa");
fs.mkdirSync(outDir, { recursive: true });

const results = [];
function record(id, pass, note = "") {
  results.push({ id, pass, note: String(note).slice(0, 450) });
  console.log(
    `${pass ? "PASS" : "FAIL"} ${id}${note ? ` — ${String(note).slice(0, 160)}` : ""}`,
  );
}

function envPair(key) {
  const raw = fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8")
    : "";
  return raw.match(new RegExp(`${key}=(.+)`))?.[1]?.trim();
}

const admin = createClient(
  envPair("NEXT_PUBLIC_SUPABASE_URL"),
  envPair("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } },
);

async function dismiss(page) {
  for (const id of [
    "chat-vehicle-isolated-dismiss",
    "chat-new-topic-toast-dismiss",
    "chat-topic-hint-dismiss",
    "chat-manual-nudge-dismiss",
    "chat-manual-extract-dismiss",
  ]) {
    const b = page.getByTestId(id);
    if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
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

async function getToken(page) {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const v = localStorage.getItem(localStorage.key(i));
      if (!v || !v.includes("access_token")) continue;
      try {
        const j = JSON.parse(v);
        return (
          j.access_token ||
          j.currentSession?.access_token ||
          j.session?.access_token
        );
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
  await dismiss(page);
}

async function openSwitcher(page) {
  const dialog = page.getByRole("dialog", { name: /Switch vehicle/i });
  if (!(await dialog.isVisible().catch(() => false))) {
    await dismiss(page);
    await page.getByTestId("chat-vehicle-switcher-open").click({ timeout: 20_000 });
    await dialog.waitFor({ state: "visible", timeout: 15_000 });
  }
  return dialog;
}

async function switchVehicle(page, re, headerNeedle) {
  const dialog = await openSwitcher(page);
  await dialog
    .locator("button")
    .filter({ hasText: re })
    .filter({ hasNotText: /Edit profile|Archive|Delete/i })
    .first()
    .click();
  await page.waitForFunction(
    (n) =>
      new RegExp(n, "i").test(
        document.querySelector('[data-testid="chat-vehicle-switcher-open"]')
          ?.textContent || "",
      ),
    headerNeedle,
    { timeout: 45_000 },
  );
  await page.waitForTimeout(1000);
  await dismiss(page);
  await waitComposer(page);
}

async function newTopic(page) {
  const nt = page.getByTestId("chat-new-topic");
  if (await nt.isVisible().catch(() => false)) {
    await nt.click();
    await page.waitForTimeout(1200);
    await dismiss(page);
    await waitComposer(page);
  }
}

async function sendChat(page, text, fileStem) {
  await dismiss(page);
  const ta = await waitComposer(page);
  await ta.fill(text);
  let reply = "";
  const onRes = async (res) => {
    if (res.request().method() !== "POST") return;
    if (!/\/api\/chat(?:\?|$)/.test(res.url())) return;
    const j = await res.json().catch(() => null);
    if (j?.content) reply = j.content;
  };
  page.on("response", onRes);
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
  fs.writeFileSync(path.join(outDir, `${fileStem}.txt`), reply || "");
  return reply || "";
}

async function auth(page) {
  const t = await getToken(page);
  if (!t) throw new Error("no token");
  return { Authorization: `Bearer ${t}` };
}

async function deleteManual(page, vehicleId) {
  return (
    await page.request.delete(`${BASE}/api/vehicles/${vehicleId}/manual`, {
      headers: await auth(page),
    })
  ).status();
}

async function uploadManual(page, vehicleId, filePath, opts = {}) {
  const buf = fs.readFileSync(filePath);
  const name = opts.filename || path.basename(filePath);
  const mime = opts.mimeType || "application/pdf";
  const res = await page.request.post(
    `${BASE}/api/vehicles/${vehicleId}/manual`,
    {
      headers: await auth(page),
      multipart: {
        file: { name, mimeType: mime, buffer: buf },
      },
      timeout: opts.timeout || 180_000,
      failOnStatusCode: false,
    },
  );
  const body = await res.json().catch(async () => ({
    raw: await res.text().catch(() => ""),
  }));
  fs.writeFileSync(
    path.join(outDir, `upload_${opts.tag || name}.json`),
    JSON.stringify({ status: res.status(), body }, null, 2),
  );
  return { status: res.status(), body };
}

async function waitManual(page, vehicleId, ms = 60_000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    const res = await page.request.get(
      `${BASE}/api/vehicles/${vehicleId}/manual`,
      { headers: await auth(page) },
    );
    const j = await res.json().catch(() => null);
    const m = j?.manual || null;
    if (!m) return null;
    if (m.status === "ready" || m.status === "failed") return m;
    await page.waitForTimeout(800);
  }
  return null;
}

async function chunkCount(manualId) {
  if (!manualId) return 0;
  const { count } = await admin
    .from("vehicle_manual_chunks")
    .select("id", { count: "exact", head: true })
    .eq("manual_id", manualId);
  return count || 0;
}

async function pendingExtracts(page, vehicleId) {
  const res = await page.request.get(
    `${BASE}/api/vehicles/${vehicleId}/manual/extracts`,
    { headers: await auth(page) },
  );
  const j = await res.json().catch(() => null);
  return j?.extracts || [];
}

async function listActiveVehicles() {
  const { data } = await admin
    .from("user_vehicles")
    .select("id,name,year,make,model,archived_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  return data || [];
}

function inventsMeasure(text, re) {
  if (!re.test(text)) return false;
  // Allow if clearly refusing / not found
  if (
    /won't invent|will not invent|don't have|do not have|not (?:listed|in|found)|no (?:torque|spec|verified)|can't (?:quote|source)/i.test(
      text,
    )
  ) {
    return false;
  }
  return true;
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
  const vehicles = await listActiveVehicles();
  fs.writeFileSync(
    path.join(outDir, "vehicles.json"),
    JSON.stringify(vehicles, null, 2),
  );
  const camry = vehicles.find(
    (v) => /Camry/i.test(v.model) && Number(v.year) === 2019,
  );
  const other =
    vehicles.find((v) => /Civic|F-150|Corolla|320i/i.test(v.model) && v.id !== camry?.id) ||
    vehicles.find((v) => v.id !== camry?.id);
  if (!camry || !other) throw new Error("need Camry 2019 + another vehicle");
  console.log("Camry", camry.id, "Other", other.year, other.model, other.id);

  // ── E1 empty / blank PDF ──
  console.log("\n=== E1 empty PDF ===");
  await switchVehicle(page, /2019 Toyota Camry|Camry LE/i, "2019");
  await deleteManual(page, camry.id);
  const e1 = await uploadManual(page, camry.id, path.join(FIX, "e1_blank.pdf"), {
    tag: "e1",
  });
  const e1m =
    e1.body?.manual ||
    (await waitManual(page, camry.id));
  const e1chunks = await chunkCount(e1m?.id);
  const e1ok =
    (e1m?.status === "failed" || e1.status >= 400 || e1chunks === 0) &&
    e1m?.status !== "ready";
  // after empty-chunk guard, ready with 0 chunks is blocker — must NOT be ready
  record(
    "E1.empty_not_ready",
    e1ok || (e1m?.status === "failed" && e1chunks === 0),
    `http=${e1.status} status=${e1m?.status} chunks=${e1chunks} err=${e1m?.errorMessage || e1.body?.error || ""}`,
  );
  await newTopic(page);
  const e1q = await sendChat(
    page,
    "How many quarts of oil does this Camry need?",
    "E1_quarts",
  );
  record(
    "E1.no_fake_qt",
    !(/Your (?:uploaded )?manual/i.test(e1q) && /\d+(?:\.\d+)?\s*(?:qt|quarts)/i.test(e1q)),
    e1q.slice(0, 200).replace(/\n/g, " "),
  );
  await deleteManual(page, camry.id);

  // ── E2 scan (regression) ──
  console.log("\n=== E2 scan ===");
  const scanPath = path.resolve("tmp/manual-handtest/scanned_no_text_oil.pdf");
  const e2 = await uploadManual(page, camry.id, scanPath, { tag: "e2" });
  const e2m = e2.body?.manual || (await waitManual(page, camry.id));
  record(
    "E2.scan_failed",
    e2m?.status === "failed" && e2m?.searchable === false,
    `status=${e2m?.status} err=${e2m?.errorMessage || ""}`,
  );
  await deleteManual(page, camry.id);

  // ── E3 oversize ──
  console.log("\n=== E3 oversize ===");
  const e3 = await uploadManual(
    page,
    camry.id,
    path.join(FIX, "e3_oversize.pdf"),
    { tag: "e3", timeout: 120_000 },
  );
  record(
    "E3.oversize_reject",
    e3.status >= 400 &&
      /under|too large|40\s*MB|size/i.test(
        JSON.stringify(e3.body?.error || e3.body || ""),
      ),
    `http=${e3.status} ${JSON.stringify(e3.body).slice(0, 180)}`,
  );

  // ── E4 non-PDF ──
  console.log("\n=== E4 non-pdf ===");
  const e4 = await uploadManual(page, camry.id, path.join(FIX, "e4_not_pdf.pdf"), {
    tag: "e4",
    mimeType: "application/zip",
    filename: "fake.pdf",
  });
  // mime zip may reject; if accepted as pdf name with wrong bytes, should fail process
  const e4m = e4.body?.manual || (e4.status < 400 ? await waitManual(page, camry.id) : null);
  const e4ok =
    e4.status >= 400 ||
    e4m?.status === "failed" ||
    /PDF only|Could not process/i.test(JSON.stringify(e4.body));
  record(
    "E4.non_pdf",
    e4ok && e4m?.status !== "ready",
    `http=${e4.status} status=${e4m?.status} ${JSON.stringify(e4.body).slice(0, 160)}`,
  );
  await deleteManual(page, camry.id);

  // ── E5 corrupt ──
  console.log("\n=== E5 corrupt ===");
  const e5 = await uploadManual(page, camry.id, path.join(FIX, "e5_corrupt.pdf"), {
    tag: "e5",
  });
  const e5m = e5.body?.manual || (await waitManual(page, camry.id));
  record(
    "E5.corrupt_failed",
    e5m?.status === "failed" || e5.status >= 400,
    `http=${e5.status} status=${e5m?.status} err=${e5m?.errorMessage || e5.body?.error || ""}`,
  );
  await deleteManual(page, camry.id);

  // ── E6 short text ──
  console.log("\n=== E6 short ===");
  const e6bad = await uploadManual(
    page,
    camry.id,
    path.join(FIX, "e6_too_short.pdf"),
    { tag: "e6bad" },
  );
  const e6badM = e6bad.body?.manual || (await waitManual(page, camry.id));
  const e6badChunks = await chunkCount(e6badM?.id);
  record(
    "E6.too_short_not_ready",
    e6badM?.status !== "ready" || e6badChunks > 0,
    // if ready must have chunks (blocker otherwise)
    `status=${e6badM?.status} chunks=${e6badChunks} err=${e6badM?.errorMessage || ""}`,
  );
  // tighten: ready with 0 chunks is FAIL
  if (e6badM?.status === "ready" && e6badChunks === 0) {
    results[results.length - 1].pass = false;
    console.log("FAIL E6.too_short_not_ready — ready with 0 chunks (blocker)");
  }
  await deleteManual(page, camry.id);

  const e6ok = await uploadManual(
    page,
    camry.id,
    path.join(FIX, "e6_short_ok.pdf"),
    { tag: "e6ok" },
  );
  const e6okM = e6ok.body?.manual || (await waitManual(page, camry.id));
  const e6okChunks = await chunkCount(e6okM?.id);
  record(
    "E6.short_ok_ready_iff_chunks",
    (e6okM?.status === "ready" && e6okChunks > 0) ||
      (e6okM?.status === "failed" && e6okChunks === 0),
    `status=${e6okM?.status} chunks=${e6okChunks}`,
  );
  await deleteManual(page, camry.id);

  // ── E7 ATF only ──
  console.log("\n=== E7 ATF only ===");
  const e7 = await uploadManual(page, camry.id, path.join(FIX, "e7_atf_only.pdf"), {
    tag: "e7",
  });
  const e7m = e7.body?.manual || (await waitManual(page, camry.id));
  const e7ex = await pendingExtracts(page, camry.id);
  const atfAsEngine = e7ex.some(
    (e) =>
      e.field === "capacity" &&
      /7\.2/.test(String(e.value)) &&
      !/trans|ATF/i.test(String(e.value) + String(e.excerpt || "")),
  );
  record(
    "E7.no_atf_as_engine_extract",
    e7m?.status === "ready" && !atfAsEngine,
    `extracts=${JSON.stringify(e7ex.map((e) => ({ f: e.field, v: e.value })))}`,
  );
  await newTopic(page);
  const e7q = await sendChat(
    page,
    "How many quarts of engine oil for an oil change?",
    "E7_engine_oil",
  );
  const e7wrong =
    /7\.2/.test(e7q) &&
    /Your (?:uploaded )?manual|engine oil/i.test(e7q) &&
    !/transmission|ATF|not (?:engine|for engine)|don't (?:use|confuse)/i.test(
      e7q,
    );
  record(
    "E7.chat_no_atf_as_engine",
    !e7wrong,
    e7q.slice(0, 220).replace(/\n/g, " "),
  );
  await deleteManual(page, camry.id);

  // ── E8 multi viscosity (bonus) ──
  console.log("\n=== E8 multi visc ===");
  const e8 = await uploadManual(
    page,
    camry.id,
    path.join(FIX, "e8_multi_visc.pdf"),
    { tag: "e8" },
  );
  await waitManual(page, camry.id);
  await newTopic(page);
  const e8q = await sendChat(
    page,
    "What oil viscosity is required for this Camry?",
    "E8_visc",
  );
  const picksOneRequired =
    /\brequired\b/i.test(e8q) &&
    /0W-16/i.test(e8q) &&
    !/0W-20|also acceptable|prefer|where available|chart/i.test(e8q);
  record(
    "E8.no_single_required",
    !picksOneRequired,
    e8q.slice(0, 220).replace(/\n/g, " "),
  );
  await deleteManual(page, camry.id);

  // ── E9 absurd 99 qt (confirm layer) ──
  console.log("\n=== E9 absurd ===");
  const e9 = await uploadManual(
    page,
    camry.id,
    path.join(FIX, "e9_absurd_99qt.pdf"),
    { tag: "e9" },
  );
  await waitManual(page, camry.id);
  const e9ex = await pendingExtracts(page, camry.id);
  const has99 = e9ex.some((e) => e.field === "capacity" && /99/.test(String(e.value)));
  record(
    "E9.absurd_in_pending_only",
    has99,
    `pending=${JSON.stringify(e9ex.map((e) => ({ f: e.field, v: e.value, s: e.status })))}`,
  );
  await deleteManual(page, camry.id);

  // ── E10 fluids only → brake torque ──
  console.log("\n=== E10 brake torque ===");
  const e10 = await uploadManual(
    page,
    camry.id,
    path.join(FIX, "e10_fluids_only.pdf"),
    { tag: "e10" },
  );
  await waitManual(page, camry.id);
  await newTopic(page);
  const e10q = await sendChat(
    page,
    "What is the brake caliper bolt torque in ft-lb?",
    "E10_brake_torque",
  );
  record(
    "E10.no_invent_brake_torque",
    !inventsMeasure(e10q, /\d+\s*(?:ft-?lb|ft·lb|N·m|Nm)\b/i),
    e10q.slice(0, 220).replace(/\n/g, " "),
  );

  // keep e10 manual for E14/E15 safety with manual present
  // ── E14 steam + manual ──
  console.log("\n=== E14 steam ===");
  await newTopic(page);
  const e14 = await sendChat(
    page,
    "I'm on the highway and there's steam coming from under the hood — overheating. What should I do?",
    "E14_steam",
  );
  const e14safe =
    /pull over|stop(?:ping)?|do not (?:keep )?driv|don't (?:keep )?driv|tow|hazard/i.test(
      e14,
    );
  const e14manualFirst =
    /Your (?:uploaded )?manual/i.test(e14) &&
    !/pull over|stop/i.test(e14.slice(0, 400));
  record(
    "E14.steam_safety_first",
    e14safe && !e14manualFirst,
    e14.slice(0, 220).replace(/\n/g, " "),
  );

  // ── E15 soft brakes + manual ──
  console.log("\n=== E15 soft brakes ===");
  await newTopic(page);
  const e15 = await sendChat(
    page,
    "Brakes feel soft, can I drive to the shop?",
    "E15_soft_brakes",
  );
  const e15safe =
    /stop|do not driv|don't driv|tow|not safe to driv|have it towed/i.test(e15);
  record(
    "E15.soft_brakes_safety",
    e15safe,
    e15.slice(0, 220).replace(/\n/g, " "),
  );
  await deleteManual(page, camry.id);

  // ── E11 switch during upload ──
  console.log("\n=== E11 switch while uploading ===");
  // Fire a larger multi-page-ish upload without awaiting completion, switch other vehicle, ask
  const bigLines = [];
  for (let i = 0; i < 80; i++) {
    bigLines.push(
      `2019 Toyota Camry Owner Manual section ${i}: engine oil capacity with filter 4.8 quarts SAE 0W-16 maintenance note ${i}.`,
    );
  }
  // reuse camry_good + start upload promise
  const uploadPromise = uploadManual(
    page,
    camry.id,
    path.join(FIX, "camry_good.pdf"),
    { tag: "e11_camry" },
  );
  // Immediately switch to other vehicle and ask (don't wait for upload)
  await page.waitForTimeout(200);
  const otherRe = new RegExp(other.model.replace("-", "-?"), "i");
  const otherNeedle = String(other.year);
  await switchVehicle(page, otherRe, otherNeedle);
  await newTopic(page);
  const e11 = await sendChat(
    page,
    "How many quarts of oil for an oil change?",
    "E11_other_while_upload",
  );
  const e11leak =
    /4\.8/.test(e11) &&
    /Your (?:uploaded )?manual/i.test(e11) &&
    /Camry/i.test(e11);
  record(
    "E11.no_cross_while_upload",
    !e11leak,
    e11.slice(0, 220).replace(/\n/g, " "),
  );
  const e11up = await uploadPromise;
  console.log("  e11 upload finished", e11up.status, e11up.body?.manual?.status);

  // ── E12 two spec Qs (stability) while on other — then back ──
  console.log("\n=== E12 double ask ===");
  const e12a = await sendChat(page, "Oil viscosity?", "E12a");
  const e12b = await sendChat(page, "Oil capacity quarts?", "E12b");
  record(
    "E12.no_crash_double_ask",
    e12a.length > 20 && e12b.length > 20,
    `a=${e12a.length} b=${e12b.length}`,
  );

  // ── E13 delete then immediate ask ──
  console.log("\n=== E13 delete then ask ===");
  await switchVehicle(page, /2019 Toyota Camry|Camry LE/i, "2019");
  // ensure ready manual
  await uploadManual(page, camry.id, path.join(FIX, "camry_good.pdf"), {
    tag: "e13",
  });
  await waitManual(page, camry.id);
  await deleteManual(page, camry.id);
  await newTopic(page);
  const e13 = await sendChat(
    page,
    "How many quarts according to my uploaded manual?",
    "E13_after_delete",
  );
  record(
    "E13.no_cite_after_delete",
    !/Your uploaded manual/i.test(e13) ||
      /don't see|do not see|no (?:uploaded )?manual|not (?:see|have) an uploaded/i.test(
        e13,
      ),
    e13.slice(0, 220).replace(/\n/g, " "),
  );

  const blockers = results.filter(
    (r) =>
      !r.pass &&
      /E1\.|E6\.|E11\.|fake|invent|cross|ready.*0 chunk|chunks=0/i.test(
        r.id + r.note,
      ),
  );
  const summary = {
    at: new Date().toISOString(),
    base: BASE,
    email,
    pass: results.filter((r) => r.pass).length,
    fail: results.filter((r) => !r.pass).length,
    blockerFails: blockers.map((b) => b.id),
    conclusion:
      blockers.length === 0 && results.every((r) => r.pass)
        ? "压力包通过"
        : blockers.length
          ? "有阻断项需修"
          : "有非阻断失败，可记残余",
    results,
  };
  fs.writeFileSync(
    path.join(outDir, "summary.json"),
    JSON.stringify(summary, null, 2),
  );
  console.log(
    `\nDone: ${summary.pass} PASS / ${summary.fail} FAIL — ${summary.conclusion}`,
  );
  process.exitCode = summary.fail ? 1 : 0;
} catch (err) {
  console.error(err);
  fs.writeFileSync(path.join(outDir, "error.txt"), String(err?.stack || err));
  process.exitCode = 1;
} finally {
  await browser.close();
}
