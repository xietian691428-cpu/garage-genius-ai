import { describe, expect, it } from "vitest";
import { applySpecOutputGate, inventedSpecFailures } from "@/lib/spec-discipline";
import {
  assembleManualSameFrame,
  buildManualSpecAnchors,
  formatGarageProfileFluidsForPrompt,
  formatObdStateForPrompt,
  GARAGE_PROFILE_MANUAL_SOURCE_LINE,
  resolveObdStateForPrompt,
} from "@/lib/vehicle-manual-frame";
import {
  extractOilGuessesFromText,
  pickBestGuesses,
} from "@/lib/vehicle-manual-extract";
import {
  buildManualRetrievalQuery,
  classifyManualIntent,
  headingRetrievalBoost,
  rerankManualHitsByHeading,
} from "@/lib/vehicle-manual-intent";
import {
  formatUserManualForPrompt,
  type ManualChunkHit,
} from "@/lib/vehicle-manuals";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import type { VehicleInfo } from "@/lib/types/chat";

const camry: VehicleInfo = {
  id: "veh-camry",
  name: "Camry",
  year: 2019,
  make: "Toyota",
  model: "Camry",
  mileage: 62400,
  engine: "2.5L I4",
};

const oilHit: ManualChunkHit = {
  id: "c1",
  manualId: "m-camry",
  pageFrom: 452,
  pageTo: 452,
  heading: "Specifications — Capacities",
  content:
    "Engine oil capacity with filter is 4.8 quarts. Recommended viscosity 0W-16.",
  rank: 1,
};

describe("intent retrieval query", () => {
  it("oil change → fluids_oil with viscosity/capacity terms", () => {
    const q = buildManualRetrievalQuery({
      userText: "how much oil for an oil change?",
    });
    expect(q.intent).toBe("fluids_oil");
    expect(q.query).toMatch(/viscosit|quarts|0W/i);
    expect(q.query).not.toMatch(/[A-HJ-NPR-Z0-9]{17}/);
  });

  it("P0420 maps catalyst terms without inventing a diagnosis", () => {
    const q = buildManualRetrievalQuery({
      userText: "Check engine P0420 on my Camry",
    });
    expect(q.intent).toBe("dtc_related");
    expect(q.query).toMatch(/P0420/);
    expect(q.query).toMatch(/catalyst/i);
  });

  it("prefers Specifications / Capacities headings", () => {
    const ranked = rerankManualHitsByHeading(
      [
        { heading: "Warranty", rank: 1.2, id: "a" },
        { heading: "Specifications — Capacities", rank: 1.0, id: "b" },
      ],
      2,
    );
    expect(ranked[0]?.id).toBe("b");
    expect(headingRetrievalBoost("Maintenance schedule")).toBeGreaterThan(0);
  });

  it("lighting intent stays weak (does not become fluids)", () => {
    expect(classifyManualIntent("low beam out, dust cap?")).toBe("lighting");
  });
});

describe("same-frame injection", () => {
  it("1. capacity hit → USER_MANUAL digits + Now/Do next frame", () => {
    const block = assembleManualSameFrame({
      intent: "fluids_oil",
      userText: "how many quarts for an oil change?",
      obd: resolveObdStateForPrompt({
        userText: "how many quarts for an oil change?",
        hasLiveAdapter: false,
      }),
      manualHits: [oilHit],
      garageFluids: {},
    });
    expect(block).toMatch(/\[OBD_STATE\]/);
    expect(block).toMatch(/source=none/);
    expect(block).toMatch(/\[USER_MANUAL/);
    expect(block).toMatch(/4\.8 quarts/);
    expect(block).toMatch(/Your uploaded manual/);
    expect(block).toMatch(/\[MANUAL_REPLY_FRAME\]/);
    expect(block).toMatch(/Now:/);
    expect(block).toMatch(/Do next/);
    expect(block).not.toMatch(/knowledge_base/);
  });

  it("2. live OBD P0420 + manual → same frame, no Replace converter now", () => {
    const block = assembleManualSameFrame({
      intent: "dtc_related",
      userText: "P0420 catalyst",
      obd: resolveObdStateForPrompt({
        vitals: {
          dtc_codes: [{ code: "P0420" }],
          source: "obd",
          snapshot_at: "2026-11-03T00:00:00.000Z",
        },
        userText: "P0420 catalyst",
        hasLiveAdapter: true,
      }),
      manualHits: [oilHit],
      garageFluids: {},
    });
    expect(block).toMatch(/source=live/);
    expect(block).toMatch(/P0420/);
    expect(block).toMatch(/\[USER_MANUAL/);
    expect(block).toMatch(/Never .*Replace converter now/i);
  });

  it("2b. pasted code without adapter is user_provided, not live", () => {
    const state = resolveObdStateForPrompt({
      userText: "I scanned P0420",
      hasLiveAdapter: false,
    });
    expect(state.source).toBe("user_provided");
    expect(formatObdStateForPrompt(state)).not.toMatch(/source=live/);
    expect(formatObdStateForPrompt(state)).toMatch(/Do not write "based on live OBD"/);
  });

  it("4. hits stay bound to the given vehicle's manual id (caller passes vehicle_id)", () => {
    const camryBlock = formatUserManualForPrompt([oilHit]);
    const otherHit: ManualChunkHit = {
      ...oilHit,
      id: "f150",
      manualId: "m-f150",
      content: "Engine oil 6.0 quarts 5W-30",
    };
    const f150Block = formatUserManualForPrompt([otherHit]);
    expect(camryBlock).toMatch(/4\.8/);
    expect(f150Block).toMatch(/6\.0/);
    expect(camryBlock).not.toMatch(/6\.0 quarts 5W-30/);
  });

  it("7. steam / stop-if outranks retrieved manual chunk", () => {
    const block = assembleManualSameFrame({
      intent: "fluids_coolant",
      userText: "steam from the hood, overheating",
      obd: resolveObdStateForPrompt({
        userText: "steam from the hood",
        hasLiveAdapter: false,
      }),
      manualHits: [oilHit],
      garageFluids: {},
    });
    expect(block).toMatch(/STOP_RULE|stop-rules still win|Stop if/i);
    expect(block).toMatch(/even if a manual chunk was retrieved/i);
  });
});

describe("oil extract → confirm contract", () => {
  it("extracts viscosity + capacity from oil context", () => {
    const guesses = extractOilGuessesFromText(
      "Engine oil capacity with filter is 4.8 quarts. Use 0W-16 SAE.",
      { heading: "Capacities", pageFrom: 10, pageTo: 10 },
    );
    const best = pickBestGuesses(guesses);
    expect(best.some((g) => g.field === "viscosity" && g.value === "0W-16")).toBe(
      true,
    );
    expect(best.some((g) => g.field === "capacity" && /4\.8/.test(g.value))).toBe(
      true,
    );
  });

  it("does not treat coolant liters as engine oil", () => {
    const guesses = extractOilGuessesFromText(
      "Coolant capacity 7.1 liters. Antifreeze 50/50.",
      { heading: "Coolant", pageFrom: 20, pageTo: 20 },
    );
    expect(guesses).toEqual([]);
  });

  it("5. pending extracts do not unlock spec allowlist", () => {
    const ctx = buildManualSpecAnchors({
      retrievedHits: [],
      garage: {},
      pendingExtracts: [{ field: "capacity", value: "4.8 qt" }],
    });
    expect(ctx.oilCapacity).toBeFalsy();
    const reply = applySpecOutputGate("Fill with 4.8 qt of oil.", ctx);
    expect(reply).not.toMatch(/4\.8\s*qt/i);
    expect(inventedSpecFailures("Fill with 4.8 qt of oil.", ctx).length).toBeGreaterThan(
      0,
    );
  });

  it("3. no manual no garage → do not invent qt", () => {
    const ctx = buildManualSpecAnchors({ retrievedHits: [], garage: {} });
    expect(applySpecOutputGate("Use 4.8 qt.", ctx)).not.toMatch(/4\.8/);
  });

  it("1b. retrieved hit this turn may unlock the figure as Your manual", () => {
    const ctx = buildManualSpecAnchors({
      retrievedHits: [oilHit],
      garage: {},
    });
    expect(ctx.oilCapacity).toMatch(/4\.8/);
    expect(applySpecOutputGate("Per your manual, 4.8 quarts.", ctx)).toMatch(
      /4\.8/,
    );
  });

  it("6. confirmed garage fluids cite Garage profile (from your manual)", () => {
    const block = formatGarageProfileFluidsForPrompt({
      oilCapacity: "4.8 qt with filter",
      oilViscosity: "0W-16",
      oilCapacitySource: "user_manual_confirmed",
      oilViscositySource: "user_manual_confirmed",
      oilSpecsConfirmedAt: "2026-11-03T00:00:00.000Z",
    });
    expect(block).toMatch(/\[GARAGE_PROFILE_FLUIDS\]/);
    expect(block).toContain(GARAGE_PROFILE_MANUAL_SOURCE_LINE);
    const ctx = buildManualSpecAnchors({
      retrievedHits: [],
      garage: {
        oilCapacity: "4.8 qt with filter",
        oilViscosity: "0W-16",
        oilCapacitySource: "user_manual_confirmed",
      },
    });
    expect(applySpecOutputGate("Use 4.8 qt with filter.", ctx)).toMatch(/4\.8/);
  });

  it("unconfirmed garage source is not injected as GARAGE_PROFILE_FLUIDS", () => {
    expect(
      formatGarageProfileFluidsForPrompt({
        oilCapacity: "4.8 qt",
        oilCapacitySource: "vcdb",
      }),
    ).toBe("");
  });
});

describe("system prompt evidence order", () => {
  it("lists safety > OBD > manual > garage", () => {
    const prompt = buildChatSystemPrompt(camry, false);
    expect(prompt.content).toMatch(/\[STOP_RULE\].*\[OBD_STATE\].*\[USER_MANUAL\].*\[GARAGE_PROFILE_FLUIDS\]/s);
    expect(prompt.content).toMatch(/Garage profile \(from your manual\)/);
    expect(prompt.content).toMatch(/dust-cap vs sealed|structure confirm/i);
  });
});
