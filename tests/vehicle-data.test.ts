import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import { cacheClearForTests } from "@/lib/vehicle-data/cache";
import {
  formatDtcRefBlock,
  lookupLocalDtc,
} from "@/lib/vehicle-data/dtc-local";
import { fetchJsonWithTimeout } from "@/lib/vehicle-data/fetch";
import {
  formatRecallHintsBlock,
  formatRecallUnavailableBlock,
  formatRegionalRecallBlock,
  formatVehicleAnchorBlock,
  gatherVehicleFactAnchors,
} from "@/lib/vehicle-data/anchors";
import { fetchRecallsByYmm } from "@/lib/vehicle-data/nhtsa-recalls";
import {
  NHTSA_RECALLS_URL,
  NHTSA_RECALL_EMPTY,
  NHTSA_RECALL_FOOTNOTE,
  NHTSA_RECALL_UNAVAILABLE,
  isNhtsaRecallMarket,
  isRecallQuestion,
  regionalRecallBody,
} from "@/lib/vehicle-data/recall-copy";
import { fetchSafetyHintsClient } from "@/lib/vehicle-data/safety-hints-client";
import {
  decodeVinValues,
  snapshotFromVpicRow,
} from "@/lib/vehicle-data/nhtsa-vpic";
import type { FetchLike } from "@/lib/vehicle-data/types";
import { maskVin, normalizeVin, vinCheckDigit, vinCheckDigitOk, describeVinClientIssue } from "@/lib/vehicle-data/vin";
import type { VehicleInfo } from "@/lib/types/chat";

const CAMRY_VIN = "4T1C11AK8MU123456";

const camry: VehicleInfo = {
  id: "v-camry",
  name: "Test Camry",
  year: 2021,
  make: "Toyota",
  model: "Camry",
  market: "US",
  mileage: 42000,
  engine: "2.5L I4",
  vin: CAMRY_VIN,
};

function jsonFetch(handler: (url: string) => unknown, status = 200): FetchLike {
  return async (input) => {
    const url = String(input);
    const body = handler(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}

function abortingFetch(): FetchLike {
  return (_input, init) =>
    new Promise((_, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing signal"));
        return;
      }
      const fail = () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      };
      if (signal.aborted) fail();
      else signal.addEventListener("abort", fail, { once: true });
    });
}

const VPIC_OK = {
  Count: 1,
  Results: [
    {
      VIN: CAMRY_VIN,
      Make: "TOYOTA",
      Model: "Camry",
      ModelYear: "2021",
      DisplacementL: "2.5",
      EngineCylinders: "4",
      FuelTypePrimary: "Gasoline",
      DriveType: "4x2",
      Trim: "LE",
      ErrorText: "0 - VIN decoded clean.",
    },
  ],
};

const RECALL_OK = {
  Count: 2,
  results: [
    {
      NHTSACampaignNumber: "21V123000",
      Component: "FUEL SYSTEM, GASOLINE",
      Summary:
        "A fuel pump impeller may crack and fail, which can cause an engine stall.",
      Consequence: "An engine stall can increase the risk of a crash.",
      Remedy: "Dealers will replace the fuel pump, free of charge.",
      ReportReceivedDate: "15/03/2021",
    },
    {
      NHTSACampaignNumber: "22V456000",
      Component: "AIR BAGS",
      Summary: "The air bag warning light may illuminate incorrectly.",
      Consequence: "The driver may not know if the air bags are functional.",
      Remedy: "Dealers will update software or inspect as needed.",
    },
  ],
};

beforeEach(() => {
  cacheClearForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("VIN helpers", () => {
  it("normalizes and rejects short / I-O-Q VINs", () => {
    expect(normalizeVin(" 4t1c11ak8mu123456 ")).toBe(CAMRY_VIN);
    expect(normalizeVin("SHORT")).toBeNull();
    expect(normalizeVin("4T1C11AK8MU12345I")).toBeNull();
  });

  it("masks VIN to last 8 only", () => {
    expect(maskVin(CAMRY_VIN)).toBe("*********MU123456");
    expect(maskVin(CAMRY_VIN)).not.toContain("4T1C11AK");
  });

  it("explains check-digit failure without blocking hand-fill", () => {
    const expected = vinCheckDigit(CAMRY_VIN);
    expect(expected).toMatch(/^[0-9X]$/);
    const wrong = expected === "0" ? "1" : "0";
    const broken = `${CAMRY_VIN.slice(0, 8)}${wrong}${CAMRY_VIN.slice(9)}`;
    expect(vinCheckDigitOk(broken)).toBe(false);
    expect(describeVinClientIssue(broken)?.code).toBe("check_digit");
    expect(describeVinClientIssue(broken)?.message).toMatch(/hand/i);
    expect(describeVinClientIssue("ABCDEFG123")?.code).toBe("length");
    expect(describeVinClientIssue("4T1C11AKIMU123456")?.code).toBe("ioq");
  });
});

describe("fetchJsonWithTimeout", () => {
  it("throws timeout when the upstream never responds", async () => {
    await expect(
      fetchJsonWithTimeout("https://example.test/slow", {
        fetchImpl: abortingFetch(),
        timeoutMs: 40,
      }),
    ).rejects.toMatchObject({ code: "timeout" });
  });
});

describe("NHTSA vPIC", () => {
  it("parses DecodeVinValues and strips VIN from raw backup", () => {
    const snap = snapshotFromVpicRow(VPIC_OK.Results[0]);
    expect(snap?.year).toBe(2021);
    expect(snap?.make).toBe("TOYOTA");
    expect(snap?.model).toBe("Camry");
    expect(snap?.engine).toMatch(/2\.5L/);
    expect(snap?.raw.VIN).toBeUndefined();
    expect(JSON.stringify(snap)).not.toContain(CAMRY_VIN);
  });

  it("returns a decode on success and caches by VIN", async () => {
    const fetchImpl = jsonFetch((url) => {
      expect(url).toContain("DecodeVinValues");
      return VPIC_OK;
    });
    const first = await decodeVinValues(CAMRY_VIN, { fetchImpl });
    expect(first?.make).toBe("TOYOTA");
    expect(first?.cached).toBe(false);
    const second = await decodeVinValues(CAMRY_VIN, {
      fetchImpl: jsonFetch(() => {
        throw new Error("should not hit network");
      }),
    });
    expect(second?.cached).toBe(true);
    expect(second?.model).toBe("Camry");
  });

  it("returns null on timeout (fail-open)", async () => {
    const result = await decodeVinValues(CAMRY_VIN, {
      fetchImpl: abortingFetch(),
      timeoutMs: 40,
    });
    expect(result).toBeNull();
  });

  it("skips the network when NHTSA_ENABLED=false", async () => {
    vi.stubEnv("NHTSA_ENABLED", "false");
    const result = await decodeVinValues(CAMRY_VIN, {
      fetchImpl: jsonFetch(() => {
        throw new Error("network should be skipped");
      }),
    });
    expect(result).toBeNull();
  });
});

describe("NHTSA recalls", () => {
  it("maps campaign summaries and caches by YMM", async () => {
    const fetchImpl = jsonFetch(() => RECALL_OK);
    const first = await fetchRecallsByYmm(2021, "Toyota", "Camry", {
      fetchImpl,
      limit: 3,
    });
    expect(first?.total).toBe(2);
    expect(first?.hints[0]?.campaignNumber).toBe("21V123000");
    expect(first?.cached).toBe(false);
    const second = await fetchRecallsByYmm(2021, "Toyota", "Camry", {
      fetchImpl: jsonFetch(() => {
        throw new Error("should not hit network");
      }),
    });
    expect(second?.cached).toBe(true);
  });

  it("returns empty hints without claiming the car is unrepaired", async () => {
    const result = await fetchRecallsByYmm(2021, "Toyota", "Camry", {
      fetchImpl: jsonFetch(() => ({ Count: 0, results: [] })),
    });
    expect(result?.hints).toEqual([]);
    const block = formatRecallHintsBlock(result!);
    expect(block).toMatch(/\[RECALL_HINTS\]/);
    expect(block).toContain(NHTSA_RECALL_EMPTY);
    expect(block).toMatch(/returned for this YMM/i);
    expect(block).toContain(NHTSA_RECALLS_URL);
    expect(block).toContain(NHTSA_RECALL_FOOTNOTE);
    expect(block).toMatch(/not proof/i);
    expect(block).toMatch(/education only/i);
    expect(block).toMatch(/Never say a recall is "already done"/);
  });

  it("returns null on timeout", async () => {
    const result = await fetchRecallsByYmm(2021, "Toyota", "Camry", {
      fetchImpl: abortingFetch(),
      timeoutMs: 40,
    });
    expect(result).toBeNull();
  });
});

describe("local DTC + chat anchors", () => {
  it("hits P0420 in the local catalog", () => {
    const hit = lookupLocalDtc("p0420");
    expect(hit.catalogHit).toBe(true);
    expect(hit.title).toMatch(/Catalyst/i);
    const block = formatDtcRefBlock("Check engine with P0420 and P0171");
    expect(block).toMatch(/\[DTC_REF\]/);
    expect(block).toMatch(/P0420/);
    expect(block).toMatch(/P0171/);
    expect(block).toMatch(/not OEM/);
  });

  it("never puts a full VIN in fact blocks", async () => {
    const vpic = snapshotFromVpicRow(VPIC_OK.Results[0])!;
    const recalls = await fetchRecallsByYmm(2021, "Toyota", "Camry", {
      fetchImpl: jsonFetch(() => RECALL_OK),
    });
    const block = await gatherVehicleFactAnchors(camry, "My P0420 light is on", {
      vpic,
      recalls,
      epa: null,
    });
    expect(block).toContain("[VEHICLE_ANCHOR]");
    expect(block).toContain("[RECALL_HINTS]");
    expect(block).toContain("[DTC_REF]");
    expect(block).toMatch(/education only/i);
    expect(block).toContain('Never say a recall is "already done"');
    expect(block).toContain("…MU123456");
    expect(block).not.toContain(CAMRY_VIN);
    expect(formatVehicleAnchorBlock(camry, vpic)).toMatch(/NHTSA vPIC/);
  });

  it("still returns garage context when NHTSA times out (chat fail-open)", async () => {
    const block = await gatherVehicleFactAnchors(
      camry,
      "Why is my fuel economy worse than sticker MPG?",
      { fetchImpl: abortingFetch(), timeoutMs: 40 },
    );
    expect(block).toBeTruthy();
    expect(block).toMatch(/garage profile|NHTSA vPIC unavailable/i);
    expect(block).toContain("[EPA_MPG]");
    expect(block).toMatch(/unavailable this turn/i);
    expect(block).toMatch(/window sticker|fueleconomy\.gov/i);
    expect(block).not.toMatch(/city \d+/i);
    expect(block).not.toContain("[RECALL_HINTS]");
    expect(block).not.toContain(CAMRY_VIN);
  });

  it("injects read-only anchors into the chat system prompt", async () => {
    const facts = await gatherVehicleFactAnchors(camry, "P0420", {
      vpic: snapshotFromVpicRow(VPIC_OK.Results[0]),
      recalls: {
        source: "nhtsa-recalls",
        year: 2021,
        make: "Toyota",
        model: "Camry",
        total: 1,
        cached: false,
        hints: [
          {
            campaignNumber: "21V123000",
            component: "FUEL SYSTEM, GASOLINE",
            summary: "Fuel pump impeller may crack.",
            consequence: "Stall risk.",
            remedy: "Dealer replaces the pump.",
            reportReceivedDate: null,
          },
        ],
      },
      epa: null,
    });
    const prompt = buildChatSystemPrompt(
      camry,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      facts,
    );
    expect(prompt.content).toContain("[VEHICLE_ANCHOR]");
    expect(prompt.content).toContain("[RECALL_HINTS]");
    expect(prompt.content).toContain("[DTC_REF]");
    expect(prompt.content).toMatch(/do not invent different NHTSA/i);
  });
});

describe("recall market branches", () => {
  it("keeps en-US card footnotes in lockstep with Chat copy", async () => {
    const en = (await import("@/locales/en-US/common.json")).default as {
      recalls: {
        usFootnote: string;
        usEmpty: string;
        usUnavailable: string;
        regionalBody: string;
      };
    };
    expect(en.recalls.usFootnote).toBe(NHTSA_RECALL_FOOTNOTE);
    expect(en.recalls.usEmpty).toBe(NHTSA_RECALL_EMPTY);
    expect(en.recalls.usUnavailable).toBe(NHTSA_RECALL_UNAVAILABLE);
    expect(en.recalls.regionalBody).toBe(regionalRecallBody("EU"));
  });
  it("treats only US as an NHTSA recall market", () => {
    expect(isNhtsaRecallMarket("US")).toBe(true);
    expect(isNhtsaRecallMarket("EU")).toBe(false);
    expect(isNhtsaRecallMarket("GB")).toBe(false);
    expect(isNhtsaRecallMarket("CA")).toBe(false);
    expect(isRecallQuestion("any recalls?")).toBe(true);
  });

  it("injects US NHTSA campaigns with educational tone and VIN self-check link", async () => {
    const facts = await gatherVehicleFactAnchors(
      camry,
      "any recalls?",
      {
        vpic: snapshotFromVpicRow(VPIC_OK.Results[0]),
        recalls: {
          source: "nhtsa-recalls",
          year: 2021,
          make: "Toyota",
          model: "Camry",
          total: 2,
          cached: false,
          hints: [
            {
              campaignNumber: "21V123000",
              component: "FUEL SYSTEM, GASOLINE",
              summary: "Fuel pump impeller may crack.",
              consequence: "Stall risk.",
              remedy: "Dealer inspects or replaces the pump.",
              reportReceivedDate: "15/03/2021",
            },
          ],
        },
        epa: null,
      },
    );
    expect(facts).toContain("[RECALL_HINTS]");
    expect(facts).toContain("[ANCHOR_STATUS]");
    expect(facts).toMatch(/recalls=listed/);
    expect(facts).toContain("21V123000");
    expect(facts).toContain("FUEL SYSTEM");
    expect(facts).toContain("15/03/2021");
    expect(facts).toContain(NHTSA_RECALLS_URL);
    expect(facts).toContain(NHTSA_RECALL_FOOTNOTE);
    expect(facts).toMatch(/may apply/i);
    expect(facts).not.toContain(CAMRY_VIN);
    const prompt = buildChatSystemPrompt(
      camry,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      facts,
    );
    expect(prompt.content).toMatch(/regional \(UK\/EU\/other\)/i);
    expect(prompt.content).toMatch(/any recalls/i);
    expect(prompt.content).toMatch(/according to NHTSA there are no recalls/i);
    expect(prompt.content).toMatch(/Spec hard rules still apply when official sources are degraded/i);
  });

  it("does not call NHTSA recalls for an EU market Camry and does not reuse US campaigns", async () => {
    const euCamry: VehicleInfo = { ...camry, market: "EU" };
    let recallCalls = 0;
    const fetchImpl = jsonFetch((url) => {
      if (url.includes("recallsByVehicle")) {
        recallCalls += 1;
        return RECALL_OK;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const block = await gatherVehicleFactAnchors(euCamry, "any recalls?", {
      vpic: null,
      epa: null,
      fetchImpl,
    });
    expect(recallCalls).toBe(0);
    expect(block).toContain("[RECALL_HINTS]");
    expect(block).toMatch(/recalls=regional/);
    expect(block).toMatch(/regional guidance/i);
    expect(block).toContain(regionalRecallBody("EU"));
    expect(block).not.toContain("21V123000");
    expect(block).not.toContain("recallsByVehicle");
    expect(formatRegionalRecallBlock("EU")).not.toMatch(/21V/);
  });

  it("ignores leaked NHTSA campaign lists when market is EU", async () => {
    const euCamry: VehicleInfo = { ...camry, market: "EU" };
    const block = await gatherVehicleFactAnchors(euCamry, "any recalls?", {
      vpic: null,
      epa: null,
      recalls: {
        source: "nhtsa-recalls",
        year: 2021,
        make: "Toyota",
        model: "Camry",
        total: 1,
        cached: false,
        hints: [
          {
            campaignNumber: "21V123000",
            component: "FUEL SYSTEM, GASOLINE",
            summary: "Should not appear for EU market.",
            consequence: "",
            remedy: "",
            reportReceivedDate: null,
          },
        ],
      },
    });
    expect(block).not.toContain("21V123000");
    expect(block).toMatch(/We don’t list a full local recall database/i);
  });

  it("does not attach NHTSA campaigns to a non-US car on a DTC question", async () => {
    const euCamry: VehicleInfo = { ...camry, market: "EU" };
    const block = await gatherVehicleFactAnchors(euCamry, "Check engine P0420", {
      vpic: null,
      epa: null,
      recalls: {
        source: "nhtsa-recalls",
        year: 2021,
        make: "Toyota",
        model: "Camry",
        total: 1,
        cached: false,
        hints: [
          {
            campaignNumber: "21V123000",
            component: "FUEL SYSTEM, GASOLINE",
            summary: "Should not appear for EU market.",
            consequence: "",
            remedy: "",
            reportReceivedDate: null,
          },
        ],
      },
    });
    expect(block).toContain("[DTC_REF]");
    expect(block).not.toContain("21V123000");
    expect(block).not.toContain("[RECALL_HINTS]");
  });

  it("on NHTSA timeout + recall question, does not claim there are no campaigns", async () => {
    const block = await gatherVehicleFactAnchors(camry, "any recalls?", {
      vpic: null,
      epa: null,
      fetchImpl: abortingFetch(),
      timeoutMs: 40,
    });
    expect(block).toContain("[RECALL_HINTS]");
    expect(block).toContain("[ANCHOR_STATUS]");
    expect(block).toMatch(/recalls=unavailable/);
    expect(block).toMatch(/unavailable this turn/i);
    expect(block).toContain(NHTSA_RECALL_UNAVAILABLE);
    expect(block).not.toContain(NHTSA_RECALL_EMPTY);
    expect(block).toContain(NHTSA_RECALLS_URL);
    expect(block).toContain("[RECALL_ANSWER_RULES]");
    expect(block!.toLowerCase()).not.toMatch(/\bno recalls\b/);
    expect(formatRecallUnavailableBlock().toLowerCase()).not.toMatch(
      /\bno recalls\b/,
    );
  });

  it("US listed recalls + recall question include answer rules for D1", async () => {
    const block = await gatherVehicleFactAnchors(camry, "Are there any recalls?", {
      vpic: null,
      epa: null,
      recalls: {
        source: "nhtsa-recalls",
        year: 2021,
        make: "Toyota",
        model: "Camry",
        total: 1,
        cached: false,
        fetchedAt: new Date().toISOString(),
        hints: [
          {
            campaignNumber: "21V-001",
            component: "FUEL SYSTEM",
            summary: "Fuel pump may fail.",
            consequence: null,
            remedy: null,
            reportReceivedDate: null,
          },
        ],
      },
    });
    expect(block).toContain("[RECALL_HINTS]");
    expect(block).toContain("[RECALL_ANSWER_RULES]");
    expect(block).toContain("21V-001");
    expect(block).toMatch(/Do not digress into an unrelated prior job/i);
  });

  it("US empty NHTSA return is not a timeout and still asks for VIN check", async () => {
    const block = await gatherVehicleFactAnchors(camry, "any recalls?", {
      vpic: null,
      epa: null,
      recalls: {
        source: "nhtsa-recalls",
        year: 2021,
        make: "Toyota",
        model: "Camry",
        total: 0,
        cached: false,
        hints: [],
      },
    });
    expect(block).toMatch(/recalls=empty/);
    expect(block).toContain(NHTSA_RECALL_EMPTY);
    expect(block).not.toContain(NHTSA_RECALL_UNAVAILABLE);
  });

  it("does not call the safety-hints API for an EU market vehicle", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchSafetyHintsClient({
      year: 2021,
      make: "Toyota",
      model: "Camry",
      market: "EU",
      accessToken: "t",
    });
    expect(out.skipped).toBe(true);
    expect(out.hints).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks vPIC/EPA as none/unavailable so Chat cannot invent official numbers", async () => {
    const block = await gatherVehicleFactAnchors(camry, "what's the highway MPG?", {
      vpic: null,
      recalls: null,
      epa: null,
    });
    expect(block).toMatch(/vpic=none/);
    expect(block).toMatch(/epa=unavailable/);
    expect(block).toMatch(/recalls=unavailable/);
    expect(block).toMatch(/Do not invent city, highway, or combined MPG/i);
    expect(block).not.toMatch(/Official MPG \(US\)/);
    const prompt = buildChatSystemPrompt(
      camry,
      false,
      null,
      null,
      null,
      null,
      null,
      null,
      block,
    );
    expect(prompt.content).toMatch(/according to NHTSA there are no recalls/i);
    expect(prompt.content).toMatch(/do not invent EPA/i);
  });
});
