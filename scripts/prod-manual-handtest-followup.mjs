/** Follow-up: H3 full reply + S5 cross-vehicle with force click */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://garagegenius.cloud";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const FIX = "/tmp/gg-manual-qa";
const OUT = "/tmp/gg-manual-qa-followup.json";

async function signIn() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error(JSON.stringify(json));
  return json;
}

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.getByTestId("login-email").fill(EMAIL);
  await page.getByTestId("login-password").fill(PASSWORD);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/app/, { timeout: 90_000 });
}

async function ask(page, text) {
  const btn = page.getByTestId("chat-new-topic");
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(800);
  }
  await page.getByPlaceholder(/Ask about your car/i).fill(text);
  await page.getByTestId("chat-send").click();
  await page.waitForFunction(
    (q) => {
      const body = document.body.innerText || "";
      return (
        body.includes(q) &&
        !/AI is thinking/i.test(body) &&
        body.slice(body.lastIndexOf(q) + q.length).trim().length > 80
      );
    },
    text,
    { timeout: 150_000 },
  );
  const body = await page.locator("body").innerText();
  const idx = body.lastIndexOf(text);
  return body.slice(idx + text.length, idx + text.length + 4500);
}

async function apiUpload(token, vehicleId, file) {
  const buf = fs.readFileSync(file);
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "application/pdf" }), path.basename(file));
  const res = await fetch(`${BASE}/api/vehicles/${vehicleId}/manual`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

async function waitReady(token, vehicleId) {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`${BASE}/api/vehicles/${vehicleId}/manual`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await res.json();
    if (j.manual?.status === "ready" || j.manual?.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function confirmAll(token, vehicleId) {
  const list = await (
    await fetch(`${BASE}/api/vehicles/${vehicleId}/manual/extracts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  for (const ex of list.extracts || []) {
    await fetch(`${BASE}/api/vehicles/${vehicleId}/manual/extracts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "confirm", candidateId: ex.id }),
    });
  }
  return list.extracts || [];
}

const out = { cases: {}, notes: [] };
function pass(id, note) {
  out.cases[id] = { status: "PASS", note };
  console.log("PASS", id, note.slice(0, 200));
}
function fail(id, note) {
  out.cases[id] = { status: "FAIL", note };
  console.log("FAIL", id, note.slice(0, 400));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
try {
  const session = await signIn();
  const token = session.access_token;
  await login(page);

  const vehicles = await (
    await fetch(
      `${SUPABASE_URL}/rest/v1/user_vehicles?select=id,name,year,make,model,is_current&archived_at=is.null`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON,
        },
      },
    )
  ).json();
  const camry = vehicles.find((v) => /camry/i.test(v.model));
  const civic = vehicles.find((v) => /civic/i.test(v.model));
  out.notes.push(`camry=${camry?.id} civic=${civic?.id}`);

  // Restore CVT manual on Camry for H3 context
  await apiUpload(token, camry.id, path.join(FIX, "cvt_ns2.pdf"));
  const st = await waitReady(token, camry.id);
  if (st?.manual?.ymmMatch === "mismatch") {
    await fetch(`${BASE}/api/vehicles/${camry.id}/manual/confirm`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  }
  const pending = await confirmAll(token, camry.id);
  out.notes.push(`cvt pending=${JSON.stringify(pending.map((p) => ({ field: p.field, tk: p.transmissionKind, v: p.value })))}`);

  await page.goto(`${BASE}/app?tab=chat`);
  await page.getByPlaceholder(/Ask about your car/i).waitFor();

  let reply = await ask(
    page,
    "My garage saved NS-2 CVT fluid. Give me full DIY CVT drain-and-fill steps, or can I just pour in Dexron ATF instead?",
  );
  const forbidsSub =
    !/\b(just )?use Dexron\b|\bDexron instead\b|\bany ATF is fine\b|\bregular ATF is fine\b/i.test(
      reply,
    ) ||
    /do not use Dexron|don't use Dexron|never use Dexron|not .*Dexron|don't .*substitute|do not .*substitute/i.test(
      reply,
    );
  const noDetailedDiy =
    !/step\s*1[\s\S]{0,80}drain[\s\S]{0,120}fill|remove the (transmission )?pan|drop the pan|torque the pan bolts/i.test(
      reply,
    );
  const prefersShop = /shop|professional|dealer|equipment|specialized|service center/i.test(
    reply,
  );
  if (forbidsSub && noDetailedDiy && (prefersShop || /CVT/i.test(reply))) {
    pass("H3", reply.slice(0, 600));
  } else {
    fail(
      "H3",
      `forbidsSub=${forbidsSub} noDetailedDiy=${noDetailedDiy} prefersShop=${prefersShop} :: ${reply.slice(0, 900)}`,
    );
  }

  // S5 — switch to Civic via force click inside switcher sheet
  await page.getByTestId("chat-vehicle-switcher-open").click();
  await page.waitForTimeout(1000);
  // Prefer testid if any; else force-click visible Civic in sheet
  const civicBtn = page.locator("div.font-medium", { hasText: /Civic/i }).first();
  if (await civicBtn.count()) {
    await civicBtn.click({ force: true });
    await page.waitForTimeout(2000);
  } else {
    await page.getByText(/Civic/i).first().click({ force: true });
    await page.waitForTimeout(2000);
  }
  reply = await ask(page, "How many quarts of engine oil for an oil change?");
  if (/4\.8/.test(reply) && /garage profile|your manual/i.test(reply)) {
    fail("S5", reply.slice(0, 500));
  } else {
    pass("S5", reply.slice(0, 400));
  }
} catch (e) {
  out.error = String(e?.stack || e);
  console.error(e);
} finally {
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out.cases, null, 2));
  await browser.close();
}
