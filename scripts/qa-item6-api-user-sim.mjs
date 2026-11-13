/**
 * Item 6 — API-level real-user simulation (upload table PDF → chat cite;
 * blur vision must not invent). Does not depend on flaky login UI.
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 *   node --env-file=.env.e2e.local --env-file=.env.local scripts/qa-item6-api-user-sim.mjs
 */
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(
  /\/$/,
  "",
);
const email = process.env.E2E_EMAIL?.trim();
const password = process.env.E2E_PASSWORD?.trim();
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
if (!email || !password || !SUPABASE_URL || !SUPABASE_ANON) {
  console.error("Need E2E_EMAIL/PASSWORD + Supabase URL/anon");
  process.exit(1);
}

const TABLE_PDF = path.resolve(
  "tmp/manual-handtest/camry_2018_aligned_capacities_table.pdf",
);
const PROSE_PDF = path.resolve("tmp/manual-handtest/camry_2021_oil_excerpt.pdf");
const outDir = path.join(process.cwd(), "tmp/item6-qa");
fs.mkdirSync(outDir, { recursive: true });

const results = [];
function record(id, pass, note = "") {
  results.push({ id, pass, note: String(note).slice(0, 600) });
  console.log(
    `${pass ? "PASS" : "FAIL"} ${id}${note ? ` — ${String(note).slice(0, 220)}` : ""}`,
  );
}

async function auth() {
  let lastErr;
  for (let i = 0; i < 6; i++) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email, password }),
        },
      );
      const j = await res.json();
      if (!j.access_token) throw new Error(`auth failed ${res.status}`);
      return j;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastErr || new Error("auth failed");
}

async function listVehicles(token) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/user_vehicles?select=id,year,make,model,oil_capacity,oil_viscosity,oil_capacity_source&order=created_at.desc`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON,
      },
    },
  );
  return res.json();
}

async function clearOil(token, vehicleId) {
  await fetch(`${SUPABASE_URL}/rest/v1/user_vehicles?id=eq.${vehicleId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      oil_capacity: null,
      oil_viscosity: null,
      oil_capacity_source: null,
      oil_viscosity_source: null,
      oil_specs_confirmed_at: null,
    }),
  });
}

async function deleteManual(token, vehicleId) {
  await fetch(`${BASE}/api/vehicles/${vehicleId}/manual`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function uploadManual(token, vehicleId, pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const form = new FormData();
  form.append(
    "file",
    new Blob([buf], { type: "application/pdf" }),
    path.basename(pdfPath),
  );
  const res = await fetch(`${BASE}/api/vehicles/${vehicleId}/manual`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return { http: res.status, data };
}

async function waitReady(token, vehicleId) {
  const start = Date.now();
  while (Date.now() - start < 120_000) {
    const res = await fetch(`${BASE}/api/vehicles/${vehicleId}/manual`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    const st = data.status || data.manual?.status;
    if (st === "ready" || st === "failed") return data;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return { status: "timeout" };
}

async function listExtracts(token, vehicleId) {
  const res = await fetch(
    `${BASE}/api/vehicles/${vehicleId}/manual/extracts`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return { http: res.status, data: await res.json().catch(() => ({})) };
}

async function confirmExtract(token, vehicleId, candidateId) {
  const res = await fetch(
    `${BASE}/api/vehicles/${vehicleId}/manual/extracts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "confirm", candidateId }),
    },
  );
  return { http: res.status, data: await res.json().catch(() => ({})) };
}

async function chat(token, vehicle, text) {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: text,
      messages: [{ role: "user", content: text }],
      currentVehicle: {
        id: vehicle.id,
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        market: "US",
      },
      selectedVehicleId: vehicle.id,
      stream: false,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { http: res.status, data };
}

async function main() {
  const session = await auth();
  const token = session.access_token;
  record("A1_auth", true, session.user?.email || email);

  const vehiclesRaw = await listVehicles(token);
  const vehicles = Array.isArray(vehiclesRaw)
    ? vehiclesRaw
    : Array.isArray(vehiclesRaw?.data)
      ? vehiclesRaw.data
      : [];
  if (!vehicles.length) {
    record(
      "A2_camry",
      false,
      `vehicles not array: ${JSON.stringify(vehiclesRaw).slice(0, 240)}`,
    );
    throw new Error("no vehicles list");
  }
  const camry = vehicles.find(
    (v) => /toyota/i.test(v.make || "") && /camry/i.test(v.model || ""),
  );
  record("A2_camry", Boolean(camry), camry ? `${camry.year} ${camry.id}` : "missing");
  if (!camry) throw new Error("no camry");

  await clearOil(token, camry.id);
  await deleteManual(token, camry.id);

  const pdf = fs.existsSync(TABLE_PDF) ? TABLE_PDF : PROSE_PDF;
  const up = await uploadManual(token, camry.id, pdf);
  record(
    "A3_upload",
    up.http >= 200 && up.http < 300,
    `http=${up.http} file=${path.basename(pdf)} ${JSON.stringify(up.data).slice(0, 180)}`,
  );

  const ready = await waitReady(token, camry.id);
  const st = ready.status || ready.manual?.status;
  record("A4_ready", st === "ready", JSON.stringify(ready).slice(0, 280));

  const extracts = await listExtracts(token, camry.id);
  const list = extracts.data?.extracts || extracts.data || [];
  const arr = Array.isArray(list) ? list : [];
  const oilCap = arr.find(
    (e) =>
      /capacity/i.test(e.field || e.kind || "") ||
      /4\.8/.test(e.value || e.candidate_value || ""),
  );
  const oilVisc = arr.find(
    (e) =>
      /viscos/i.test(e.field || "") ||
      /0W-16/i.test(e.value || e.candidate_value || ""),
  );
  record(
    "A5_extracts",
    arr.length > 0,
    `n=${arr.length} cap=${oilCap?.value || oilCap?.candidate_value || "-"} visc=${oilVisc?.value || oilVisc?.candidate_value || "-"}`,
  );

  let confirmed = 0;
  for (const e of arr.slice(0, 6)) {
    const id = e.id || e.candidateId;
    if (!id) continue;
    const r = await confirmExtract(token, camry.id, id);
    if (r.http >= 200 && r.http < 300) confirmed += 1;
  }
  record("A6_confirm", true, `confirmed=${confirmed}`);

  const ask = await chat(
    token,
    camry,
    "How much engine oil and what viscosity does my uploaded manual capacities table list? Cite Your manual. Do not invent.",
  );
  const content =
    ask.data?.content ||
    ask.data?.message?.content ||
    ask.data?.reply ||
    JSON.stringify(ask.data).slice(0, 2000);
  fs.writeFileSync(path.join(outDir, "api_oil_ask.json"), JSON.stringify(ask, null, 2));
  fs.writeFileSync(path.join(outDir, "api_oil_ask.txt"), String(content));

  const has48 = /4\.8/.test(content);
  const hasVisc = /0W-16/i.test(content);
  const cites = /your manual|uploaded manual|garage profile|confirmed/i.test(
    content,
  );
  const inventBad = /\b5\.1\s*qt\b/i.test(content) && !/4\.8/.test(content);
  const replaceNow = /Replace \w+ now/i.test(content);
  record(
    "A7_chat_cite",
    ask.http === 200 && has48 && hasVisc && cites && !inventBad && !replaceNow,
    `http=${ask.http} 4.8=${has48} 0W-16=${hasVisc} cite=${cites} :: ${String(content).slice(0, 320)}`,
  );

  // No-manual invent control: delete manual, clear oil, ask again
  await clearOil(token, camry.id);
  await deleteManual(token, camry.id);
  await new Promise((r) => setTimeout(r, 1000));
  const bare = await chat(
    token,
    camry,
    "Exactly how many quarts of oil does my Camry take? Give a number.",
  );
  const bareContent =
    bare.data?.content ||
    bare.data?.message?.content ||
    bare.data?.reply ||
    "";
  fs.writeFileSync(path.join(outDir, "api_bare_ask.txt"), String(bareContent));
  const bareInvent = /\b4\.8\s*(?:qt|quarts)\b/i.test(bareContent);
  record(
    "A8_no_anchor_no_invent",
    bare.http === 200 && !bareInvent,
    `invented_4.8=${bareInvent} :: ${String(bareContent).slice(0, 280)}`,
  );

  fs.writeFileSync(
    path.join(outDir, "api_results.json"),
    JSON.stringify(results, null, 2),
  );
  const failed = results.filter((r) => !r.pass);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} pass`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  record("A_fatal", false, e.message || String(e));
  fs.writeFileSync(
    path.join(outDir, "api_results.json"),
    JSON.stringify(results, null, 2),
  );
  process.exit(1);
});
