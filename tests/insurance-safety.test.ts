import { describe, expect, it } from "vitest";
import {
  applyInsuranceSafetyGuards,
  rewriteInsuranceCoverageClaims,
} from "@/lib/insurance-coverage-rewrite";
import { safetyTierForPlaybook, inferSafetyTierFromText } from "@/lib/safety-tier";
import { SHOP_REPORT_DISCLAIMER } from "@/lib/types/shop-report";
import { INSURANCE_SAFETY_COPY } from "@/lib/insurance-safety-copy";

describe("insurance coverage rewrite", () => {
  it("rewrites will be covered assertions", () => {
    const out = rewriteInsuranceCoverageClaims(
      "Your insurance will be covered for this DIY brake job.",
    );
    expect(out.toLowerCase()).not.toMatch(/will be covered/);
    expect(out).toMatch(/may affect coverage|depends on your policy/i);
  });

  it("appends mod reminder when aftermarket mentioned", () => {
    const out = applyInsuranceSafetyGuards(
      "Consider an aftermarket intake for more airflow.",
      { userContext: "aftermarket intake" },
    );
    expect(out).toContain("may affect");
    expect(out).toMatch(/check your policy/i);
  });
});

describe("safety tier", () => {
  it("marks brakes playbook high", () => {
    expect(safetyTierForPlaybook("maintenance_brakes")).toBe("high");
    expect(safetyTierForPlaybook("maintenance_oil")).toBe("low");
  });

  it("infers high from brake text", () => {
    expect(inferSafetyTierFromText("My brakes are squealing")).toBe("high");
  });
});

describe("shop report disclaimer", () => {
  it("includes insurance addendum", () => {
    expect(SHOP_REPORT_DISCLAIMER).toContain(
      INSURANCE_SAFETY_COPY.shopReportInsuranceAddendum,
    );
  });
});
