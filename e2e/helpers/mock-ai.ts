import type { Page } from "@playwright/test";
import { FIXTURE, vinLast8 } from "../fixtures/test-data";

/**
 * Intercept LLM-backed APIs so P0 UI flows stay deterministic in CI.
 * Set E2E_MOCK_AI=0 to hit real DeepSeek (slow, flaky, costs tokens).
 */
export async function mockAiRoutes(page: Page): Promise<void> {
  await page.route("**/api/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const body = [
      "E2E_MOCK_CHAT_OK",
      "Education-only DIY guidance for your symptoms and DTC.",
      `Code ${FIXTURE.dtc} often relates to catalyst efficiency — verify freeze-frame data and inspect for exhaust leaks before any parts decision.`,
      "This is not a certified diagnosis. Confirm with a professional technician.",
    ].join("\n\n");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content: body,
      }),
    });
  });

  await page.route("**/api/shop-report/generate", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const req = route.request().postDataJSON() as {
      vehicle?: { vin?: string; year?: number; make?: string; model?: string };
      options?: { includeFullVin?: boolean };
    };
    const vin = (req.vehicle?.vin || FIXTURE.vehicle.vin).toUpperCase();
    const includeFull = Boolean(req.options?.includeFullVin);
    const token = `e2e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const payload = {
      reportId: "GG-E2E1",
      generatedAtIso: new Date().toISOString(),
      source: "chat",
      vehicle: {
        year: req.vehicle?.year ?? 2019,
        make: req.vehicle?.make ?? FIXTURE.vehicle.make,
        model: req.vehicle?.model ?? FIXTURE.vehicle.model,
        mileage: 87500,
        vinLast8: vinLast8(vin),
        vinFull: includeFull ? vin : null,
        plate: FIXTURE.vehicle.plate,
      },
      ownerObservations: {
        symptoms: FIXTURE.symptom,
        conditions: "After warm-up",
        checksDone: ["Visual under-hood check"],
      },
      diagnosticData: {
        codes: [
          {
            code: FIXTURE.dtc,
            definition: "Catalyst System Efficiency Below Threshold (Bank 1)",
            severity: "moderate",
          },
        ],
        liveDataSummary: null,
        dataSourceNote: "Chat / manual DTC entry",
      },
      contributingFactors: [
        {
          title: "Catalyst efficiency / exhaust integrity",
          explanation:
            "Common causes reported for this combination include considerations around exhaust leaks and sensor aging. These are for professional verification only.",
          howToVerify: "Compare OEM flowcharts and freeze-frame data.",
        },
      ],
      checksCompleted: ["Entered fault code in app"],
      technicianNextSteps: [
        "Inspect / verify condition related to: catalyst efficiency monitors",
      ],
      ownerNotes: null,
      disclaimer: "Education only — not a certified diagnosis.",
    };

    // Archive is skipped in mock — still return a public_token shape the UI expects.
    // Public /r page needs a real archive; copy-link flow still shows buttons.
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        payload,
        preview: {
          ymm: `${payload.vehicle.year} ${payload.vehicle.make} ${payload.vehicle.model}`,
          hasEnoughData: true,
          codes: [FIXTURE.dtc],
        },
        archived: true,
        public_token: token,
        public_url: `${new URL(route.request().url()).origin}/r/${token}`,
        expires_at: new Date(Date.now() + 30 * 864e5).toISOString(),
      }),
    });
  });
}
