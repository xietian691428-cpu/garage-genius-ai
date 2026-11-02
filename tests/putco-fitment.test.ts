import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheClearForTests } from "@/lib/vehicle-data/cache";
import {
  PUTCO_SOURCE_LINE,
  fetchPutcoFitment,
  formatPutcoFitmentBlock,
  normalizePutcoProduct,
  parsePutcoFitmentPayload,
  putcoCountryForMarket,
  shouldQueryPutco,
} from "@/lib/putco";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import type { VehicleInfo } from "@/lib/types/chat";

afterEach(() => {
  cacheClearForTests();
  vi.unstubAllGlobals();
});

const baseVehicle: VehicleInfo = {
  id: "v1",
  name: "Test",
  year: 2024,
  make: "Ford",
  model: "F-150",
  market: "US",
  mileage: 12000,
  engine: "2.7L",
};

describe("shouldQueryPutco", () => {
  it("triggers on Putco / fitment / light fit questions", () => {
    expect(
      shouldQueryPutco("will Putco lights fit my truck?", { market: "US" }),
    ).toBe(true);
    expect(shouldQueryPutco("Putco fog lights for F-150")).toBe(true);
    expect(shouldQueryPutco("fitment for my grille lights")).toBe(true);
    expect(
      shouldQueryPutco("Does this LED light bar fit my Tacoma?"),
    ).toBe(true);
  });

  it("does not trigger on oil / DTC-only or bare bulb-size ask", () => {
    expect(shouldQueryPutco("P0420 catalyst efficiency")).toBe(false);
    expect(shouldQueryPutco("How do I change my oil and filter?")).toBe(false);
    expect(
      shouldQueryPutco("My Camry low beam is out — what bulb size?"),
    ).toBe(false);
  });
});

describe("putcoCountryForMarket", () => {
  it("maps US/CA and skips EU/GB", () => {
    expect(putcoCountryForMarket("US")).toBe("us");
    expect(putcoCountryForMarket("CA")).toBe("ca");
    expect(putcoCountryForMarket("EU")).toBe("skip_eu_uk");
    expect(putcoCountryForMarket("GB")).toBe("skip_eu_uk");
  });
});

describe("parsePutcoFitmentPayload", () => {
  it("normalizes products[] brief rows", () => {
    const products = parsePutcoFitmentPayload({
      products: [
        {
          sku: "90001",
          title: "Putco Blade LED Tailgate",
          price: "199.99",
          url: "https://www.putco.com/p/90001",
          category: "Lighting",
        },
        { title: "skip-no-sku-ok", sku: "90002" },
      ],
    });
    expect(products).toHaveLength(2);
    expect(products[0].sku).toBe("90001");
    expect(normalizePutcoProduct({ item_id: "X", name: "Alt" })?.sku).toBe(
      "X",
    );
  });
});

describe("fetchPutcoFitment", () => {
  it("returns ok products and caches by YMM|country", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return new Response(
        JSON.stringify({
          products: [
            {
              sku: "111",
              title: "Putco Dayliner",
              url: "https://www.putco.com/p/111",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const a = await fetchPutcoFitment({
      year: 2024,
      make: "Ford",
      model: "F150",
      country: "us",
      fetchImpl,
    });
    const b = await fetchPutcoFitment({
      year: 2024,
      make: "Ford",
      model: "F150",
      country: "us",
      fetchImpl,
    });
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.products[0].title).toContain("Dayliner");
      expect(a.fromCache).toBe(false);
    }
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.fromCache).toBe(true);
    expect(calls).toBe(1);

    const block = formatPutcoFitmentBlock(a);
    expect(block).toContain("[PUTCO_FITMENT]");
    expect(block).toContain("Putco Dayliner");
    expect(block).toContain(PUTCO_SOURCE_LINE);
  });

  it("timeout degrades without throwing", async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const signal = init?.signal;
      await new Promise<void>((_, reject) => {
        signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      return new Response("{}");
    }) as unknown as typeof fetch;

    const r = await fetchPutcoFitment({
      year: 2024,
      make: "Ford",
      model: "F150",
      fetchImpl,
      timeoutMs: 30,
      bypassCache: true,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("timeout");
    const block = formatPutcoFitmentBlock(r);
    expect(block).toMatch(/unavailable|timeout/i);
    expect(block).not.toMatch(/SKU 111|Dayliner/);
  });
});

describe("formatPutcoFitmentBlock gates", () => {
  it("structure-unconfirmed warns against H-numbers", () => {
    const block = formatPutcoFitmentBlock(
      {
        ok: true,
        year: 2020,
        make: "Toyota",
        model: "Camry",
        country: "us",
        fromCache: false,
        fetchedAt: new Date().toISOString(),
        products: [{ sku: "1", title: "Putco accessory" }],
      },
      { structureUnconfirmed: true },
    );
    expect(block).toMatch(/unconfirmed|dust-cap|H11/i);
    expect(block).toContain(PUTCO_SOURCE_LINE);
  });

  it("EU skip notes US catalog only", () => {
    const block = formatPutcoFitmentBlock({
      ok: false,
      reason: "eu_uk_catalog",
      usCatalogOnlyNote: true,
    });
    expect(block).toMatch(/US\/CA|ECE|type approval/i);
    expect(block).toContain(PUTCO_SOURCE_LINE);
  });
});

describe("system prompt Putco rules", () => {
  it("mentions PUTCO_FITMENT brand-catalog boundaries", () => {
    const prompt = buildChatSystemPrompt(
      baseVehicle,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      "[PUTCO_FITMENT]\nstatus: ok\n" + PUTCO_SOURCE_LINE,
    );
    expect(prompt.content).toMatch(/PUTCO_FITMENT/);
    expect(prompt.content).toMatch(/brand catalog|Putco/i);
    expect(prompt.content).toMatch(/OEM requires|dust-cap|H11/i);
  });
});
