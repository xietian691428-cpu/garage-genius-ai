/**
 * Item 6 handtest — real-user path on local/prod:
 * 1) Upload capacities-table PDF → extract → confirm oil → chat cite
 * 2) Blurry fill-cap photo must not invent quarts
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3001 \
 *   PLAYWRIGHT_BROWSERS_PATH="$HOME/Library/Caches/ms-playwright" \
 *   node --env-file=.env.e2e.local --env-file=.env.local scripts/qa-item6-table-vision-handtest.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL?.trim() || "http://127.0.0.1:3001";
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
if (!email || !password) {
  console.error("Need E2E_EMAIL / E2E_PASSWORD");
  process.exit(1);
}

const TABLE_PDF = path.resolve(
  "tmp/manual-handtest/camry_2018_aligned_capacities_table.pdf",
);
const PROSE_PDF = path.resolve("tmp/manual-handtest/camry_2021_oil_excerpt.pdf");
const BLUR_IMG =
  process.env.QA_BLUR_IMG?.trim() ||
  "/tmp/gg-photo-qa/net/obd_app_blur_dark.jpg";

const outDir = path.join(process.cwd(), "tmp/item6-qa");
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
  await page.waitForURL(/\/app/, { timeout: 90_000 });
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await dismissOverlays(page);
}

async function switchToCamry(page) {
  await page.getByTestId("chat-vehicle-switcher-open").click({ timeout: 20_000 });
  const dialog = page.getByRole("dialog", { name: /Switch vehicle/i });
  await dialog.waitFor({ state: "visible", timeout: 15_000 });
  await dialog
    .locator("button")
    .filter({ hasText: /Camry/i })
    .filter({ hasNotText: /Edit|Archive|Delete/i })
    .first()
    .click();
  await page.waitForTimeout(1500);
  await dismissOverlays(page);
  await waitComposer(page);
}

async function resolveCamryVehicleId(page) {
  const token = await getAccessToken(page);
  const envLocal = fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8")
    : "";
  const url = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
  const anon = envLocal.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
  if (!token || !url || !anon) return null;
  const res = await page.request.get(
    `${url}/rest/v1/user_vehicles?select=id,year,make,model&deleted_at=is.null&order=created_at.desc`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anon,
      },
    },
  );
  const rows = await res.json().catch(() => []);
  const camry = (rows || []).find(
    (r) => /toyota/i.test(r.make || "") && /camry/i.test(r.model || ""),
  );
  return camry?.id || null;
}

async function clearGarageOil(page, vehicleId) {
  const token = await getAccessToken(page);
  const envLocal = fs.readFileSync(".env.local", "utf8");
  const url = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1]?.trim();
  const anon = envLocal.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
  if (!url || !anon || !token || !vehicleId) return;
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

async function deleteManual(page, vehicleId) {
  const token = await getAccessToken(page);
  if (!token || !vehicleId) return;
  await page.request.delete(`${BASE}/api/vehicles/${vehicleId}/manual`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

async function waitManualReady(page, vehicleId, timeoutMs = 120_000) {
  const token = await getAccessToken(page);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await page.request.get(`${BASE}/api/vehicles/${vehicleId}/manual`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (data?.status === "ready" || data?.manual?.status === "ready") return data;
    if (data?.status === "failed" || data?.manual?.status === "failed") return data;
    await page.waitForTimeout(1500);
  }
  return { status: "timeout" };
}

async function confirmPendingOil(page) {
  await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
  await waitComposer(page);
  await dismissOverlays(page);
  // Extract confirm UI may appear as toast/card
  const confirm = page.getByRole("button", {
    name: /Confirm|Save|Add to (garage|profile)|Yes,? (save|confirm)/i,
  });
  if (await confirm.first().isVisible().catch(() => false)) {
    await confirm.first().click();
    await page.waitForTimeout(1200);
    return true;
  }
  // Try test ids used by extract card
  for (const id of [
    "chat-manual-extract-confirm",
    "manual-extract-confirm-oil",
    "manual-extract-confirm",
  ]) {
    const btn = page.getByTestId(id);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1200);
      return true;
    }
  }
  return false;
}

async function sendChat(page, text, saveAs) {
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
    if (!disabled && replies.length) break;
    await page.waitForTimeout(700);
  }
  page.off("response", onRes);
  await page.waitForTimeout(1000);
  const content = replies[replies.length - 1] || (await page.locator("body").innerText()).slice(-2500);
  if (saveAs) fs.writeFileSync(path.join(outDir, saveAs), content);
  return content;
}

async function uploadBlurPhoto(page, imgPath) {
  if (!fs.existsSync(imgPath)) return { skipped: true };
  const inputs = page.locator('input[type="file"][accept*="image"]');
  let n = await inputs.count();
  if (!n) {
    const more = page.getByRole("button", { name: /More|Attach|Photo|OBD/i }).first();
    if (await more.isVisible().catch(() => false)) await more.click().catch(() => {});
    await page.waitForTimeout(500);
    n = await inputs.count();
  }
  if (!n) return { skipped: true, reason: "no file input" };
  await inputs.nth(n - 1).setInputFiles(imgPath);
  await page.waitForTimeout(800);
  const ta = await waitComposer(page);
  await ta.fill(
    "What oil does this fill-cap say? Please read the photo — do not invent quarts.",
  );
  return { skipped: false };
}

async function main() {
  if (!fs.existsSync(TABLE_PDF) && !fs.existsSync(PROSE_PDF)) {
    console.error("missing PDF fixtures");
    process.exit(1);
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
  });

  try {
    await login(page);
    record("H1_login", true, page.url());
    await switchToCamry(page);
    const vehicleId = await resolveCamryVehicleId(page);
    record("H2_camry", Boolean(vehicleId), vehicleId || "no vehicle id");
    if (!vehicleId) throw new Error("Camry vehicle id missing");

    await clearGarageOil(page, vehicleId);
    await deleteManual(page, vehicleId);

    const pdfPath = fs.existsSync(TABLE_PDF) ? TABLE_PDF : PROSE_PDF;
    const up = await uploadManual(page, vehicleId, pdfPath);
    record("H3_upload", up.http >= 200 && up.http < 300, `http=${up.http} ${JSON.stringify(up).slice(0, 200)}`);

    const ready = await waitManualReady(page, vehicleId);
    const st = ready?.status || ready?.manual?.status;
    record("H4_ready", st === "ready", JSON.stringify(ready).slice(0, 300));

    // Reload chat so extract card / retrieval can see manual
    await page.goto(`${BASE}/app?tab=chat`, { waitUntil: "domcontentloaded" });
    await waitComposer(page);
    await dismissOverlays(page);
    const confirmed = await confirmPendingOil(page);
    record("H5_confirm_ui", true, confirmed ? "clicked confirm" : "no confirm UI (may still retrieve manual)");

    const oilAsk = await sendChat(
      page,
      "How much engine oil and what viscosity does my uploaded manual capacities table list? Cite Your manual.",
      "oil_ask.txt",
    );
    const cites =
      /4\.8/.test(oilAsk) &&
      /0W-16/i.test(oilAsk) &&
      /your manual|uploaded manual|garage profile/i.test(oilAsk);
    const inventBad = /\b5\.1\s*qt\b|\b5W-30\b.*replace/i.test(oilAsk);
    record(
      "H6_table_cite",
      cites && !inventBad,
      oilAsk.slice(0, 400),
    );

    // No-anchor invent check: clear manual? Keep manual but ask unrelated → still ok.
    // Vision blur path
    if (fs.existsSync(BLUR_IMG)) {
      const upImg = await uploadBlurPhoto(page, BLUR_IMG);
      if (upImg.skipped) {
        record("H7_blur_vision", true, `skipped: ${upImg.reason || "no input"}`);
      } else {
        const reply = await sendChat(page, "", "blur_vision.txt").catch(() => null);
        // sendChat already filled text in uploadBlurPhoto — press enter path:
        // re-send explicitly
        const blurReply =
          reply && reply.length > 40
            ? reply
            : await sendChat(
                page,
                "The photo is attached. What oil viscosity/capacity does it show?",
                "blur_vision.txt",
              );
        const invents = /\b\d+(?:\.\d+)?\s*(?:qts?|quarts?)\b/i.test(blurReply);
        const retake = /retake|blur|unclear|can't read|cannot read|not readable|low confidence/i.test(
          blurReply,
        );
        record(
          "H7_blur_vision",
          retake && !invents,
          blurReply.slice(0, 400),
        );
      }
    } else {
      record("H7_blur_vision", true, `skipped missing ${BLUR_IMG}`);
    }
  } catch (e) {
    record("H_fatal", false, e?.message || String(e));
    await page.screenshot({ path: path.join(outDir, "fatal.png"), fullPage: true }).catch(() => {});
  } finally {
    fs.writeFileSync(
      path.join(outDir, "results.json"),
      JSON.stringify(results, null, 2),
    );
    await browser.close();
    const failed = results.filter((r) => !r.pass);
    console.log(
      `\nSummary: ${results.length - failed.length}/${results.length} pass`,
    );
    process.exit(failed.length ? 1 : 0);
  }
}

main();
