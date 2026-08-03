import { describe, expect, it } from "vitest";
import { toPublicShopReportPayload } from "@/lib/shop-report/public-view";
import type { ShopReportPayload } from "@/lib/types/shop-report";

/**
 * Documented security expectations for API / RLS paths.
 * Full RLS is enforced in Supabase; these unit checks lock public VIN stripping.
 */
describe("security expectations", () => {
  it("public shop report payload never includes full VIN", () => {
    const payload = {
      reportId: "GG-SEC",
      generatedAtIso: new Date().toISOString(),
      source: "chat" as const,
      vehicle: {
        year: 2020,
        make: "Honda",
        model: "Civic",
        mileage: 10,
        vinLast8: "ABCDEFGH",
        vinFull: "1HGBH41JXMN109186",
        plate: "TEST",
      },
      ownerObservations: { symptoms: "x", conditions: "", checksDone: [] },
      diagnosticData: {
        codes: [],
        liveDataSummary: null,
        dataSourceNote: null,
      },
      contributingFactors: [],
      checksCompleted: [],
      technicianNextSteps: [],
      ownerNotes: null,
      disclaimer: "Education only",
    } satisfies ShopReportPayload;

    const publicPayload = toPublicShopReportPayload(payload);
    expect(publicPayload.vehicle.vinFull).toBeNull();
    expect(JSON.stringify(publicPayload)).not.toContain("1HGBH41JXMN109186");
  });
});
