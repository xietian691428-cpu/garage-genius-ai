import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_BADGE,
  EXAMPLE_CITE_MANUAL,
  MANUAL_CITATION_EXAMPLE,
  SHOP_HANDOFF_EXAMPLE,
  SOURCED_ANSWER_EXAMPLE,
  proofExampleText,
} from "@/content/examples/proof-examples";
import { garageFluidCiteLabel } from "@/lib/vehicle-manual-extract";

const text = proofExampleText();

describe("proof examples (static, fictional)", () => {
  it("manual cite label matches the live product citation label", () => {
    expect(EXAMPLE_CITE_MANUAL).toBe(
      garageFluidCiteLabel("user_manual_confirmed"),
    );
    expect(SOURCED_ANSWER_EXAMPLE.sourceLabel).toBe(EXAMPLE_CITE_MANUAL);
    expect(MANUAL_CITATION_EXAMPLE.after.sourceLabel).toBe(EXAMPLE_CITE_MANUAL);
  });

  it("is clearly marked Example, fictional, and not OEM-certified", () => {
    expect(EXAMPLE_BADGE).toBe("Example");
    expect(SHOP_HANDOFF_EXAMPLE.label).toMatch(/Example — sample shop handoff/);
    expect(SOURCED_ANSWER_EXAMPLE.label).toMatch(/^Example/);
    expect(text).toMatch(/Fictional example/);
    expect(text).toMatch(/Not OEM-certified/i);
  });

  it("contains no VIN, email, phone, or plate-like personal data", () => {
    expect(text).not.toMatch(/\b[A-HJ-NPR-Z0-9]{17}\b/);
    expect(text).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
    expect(text).not.toMatch(/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
    expect(text).not.toMatch(/\bplate\b/i);
  });

  it("stays educational: no deterministic diagnosis or 'replace now'", () => {
    expect(text).not.toMatch(/\breplace\b[^.\n]{0,40}\bnow\b/i);
    expect(text).not.toMatch(/\byou (need|must) (to )?replace\b/i);
    expect(text).not.toMatch(/\bdefinitely\b|\bguaranteed?\b|\bthe problem is\b/i);
    expect(text).toMatch(/professional verification|qualified technician|shop/i);
  });

  it("before-confirm answer refuses to invent a number; after cites one", () => {
    expect(MANUAL_CITATION_EXAMPLE.before.answer).toMatch(/won't guess/i);
    expect(MANUAL_CITATION_EXAMPLE.before.answer).not.toMatch(/\d+(\.\d+)?\s*(qt|quarts?|L)\b/i);
    expect(MANUAL_CITATION_EXAMPLE.after.figures).toBe("4.8 qt · 0W-16");
    expect(MANUAL_CITATION_EXAMPLE.after.sourceLabel).toMatch(
      /^Garage profile \(from your manual\)/,
    );
  });

  it("is hosted on landing, pricing and linked from Home; never touches user data paths", () => {
    const landing = readFileSync("components/landing/LandingPage.tsx", "utf8");
    const pricing = readFileSync("app/pricing/PricingPageClient.tsx", "utf8");
    const strip = readFileSync("components/home/HomeTrustStrip.tsx", "utf8");
    expect(landing).toMatch(/<ProofExamples\s*\/>/);
    expect(pricing).toMatch(/<ProofExamples variant="compact"/);
    expect(strip).toMatch(/\/#proof/);

    const comp = readFileSync("components/landing/ProofExamples.tsx", "utf8");
    expect(comp).not.toMatch(/supabase|fetch\(|localStorage|useChat|saveGarage/i);
    expect(comp).toMatch(/proof-example-badge/);
    expect(comp).toMatch(/gg-paper/);
  });
});
