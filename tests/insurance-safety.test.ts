import { describe, expect, it } from "vitest";
import {
  applyInsuranceSafetyGuards,
  rewriteInsuranceCoverageClaims,
} from "@/lib/insurance-coverage-rewrite";
import { safetyTierForPlaybook, inferSafetyTierFromText } from "@/lib/safety-tier";
import { SHOP_REPORT_DISCLAIMER } from "@/lib/types/shop-report";
import {
  formatInsuranceEducationBlock,
  INSURANCE_SAFETY_COPY,
  isInsuranceOrModQuestion,
} from "@/lib/insurance-safety-copy";

describe("insurance coverage rewrite", () => {
  it("rewrites will be covered assertions", () => {
    const out = rewriteInsuranceCoverageClaims(
      "Your insurance will be covered for this DIY brake job.",
    );
    expect(out.toLowerCase()).not.toMatch(/will be covered/);
    expect(out).toMatch(/may affect coverage|depends on your policy/i);
  });

  it("rewrites void / won't pay / guaranteed coverage claims", () => {
    const samples = [
      "This will void your insurance.",
      "Insurance won't pay for this DIY repair.",
      "This is insurance-approved and guaranteed coverage.",
    ];
    for (const sample of samples) {
      const out = rewriteInsuranceCoverageClaims(sample);
      expect(out.toLowerCase()).not.toMatch(
        /void your insurance|won't pay|guaranteed coverage|insurance-approved/,
      );
      expect(out).toMatch(/may affect coverage|depends on your policy|check your policy/i);
    }
  });

  it("rewrites will not be covered / insurance will pay / definitely covered", () => {
    const samples = [
      "This will not be covered by insurance.",
      "Insurance will pay for the catalytic converter.",
      "The claim is definitely covered.",
    ];
    for (const sample of samples) {
      const out = rewriteInsuranceCoverageClaims(sample);
      expect(out.toLowerCase()).not.toMatch(
        /will not be covered|insurance will pay|definitely covered/,
      );
      expect(out).toMatch(/may affect|depends on your policy|carrier and applicable law/i);
    }
  });

  it("injects a fixed education block for insurance / mod questions", () => {
    expect(isInsuranceOrModQuestion("will it void my insurance if I install a catless downpipe?")).toBe(
      true,
    );
    const block = formatInsuranceEducationBlock();
    expect(block).toContain("[INSURANCE_EDU]");
    expect(block).toMatch(/check your carrier and applicable law/i);
    expect(block.toLowerCase()).not.toMatch(
      /\bwill not be covered\b|\binsurance will pay\b|\bdefinitely covered\b/,
    );
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
