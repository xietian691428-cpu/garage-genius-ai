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
  classifyTransmissionKind,
  extractAtfGuessesFromText,
  extractBrakeFluidGuessesFromText,
  extractCoolantGuessesFromText,
  extractOilGuessesFromText,
  garagePatchForExtractConfirm,
  pickBestAtfGuesses,
  pickBestBrakeFluidGuesses,
  pickBestCoolantGuesses,
  pickBestGuesses,
  pickBestOilGuesses,
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

  it("coolant capacity → fluids_coolant with mixture/reservoir terms", () => {
    const q = buildManualRetrievalQuery({
      userText: "what coolant mixture and capacity?",
    });
    expect(q.intent).toBe("fluids_coolant");
    expect(q.query).toMatch(/coolant|antifreeze|mixture|reservoir/i);
  });

  it("overheating steam → overheat intent (before plain coolant)", () => {
    const q = buildManualRetrievalQuery({
      userText: "overheating with steam from the hood",
    });
    expect(q.intent).toBe("overheat");
    expect(q.query).toMatch(/coolant|steam|cold check/i);
  });

  it("brake fluid / DOT → fluids_brake", () => {
    const q = buildManualRetrievalQuery({
      userText: "what brake fluid DOT does this car take?",
    });
    expect(q.intent).toBe("fluids_brake");
    expect(q.query).toMatch(/brake fluid|DOT/i);
  });

  it("soft brake pedal → brake_warning before lighting", () => {
    const q = buildManualRetrievalQuery({
      userText: "soft brake pedal and brake warning light on",
    });
    expect(q.intent).toBe("brake_warning");
    expect(q.query).toMatch(/do not drive|professional|DOT/i);
  });

  it("ATF / transmission fluid → fluids_atf (not fluids_oil)", () => {
    const q = buildManualRetrievalQuery({
      userText: "what ATF does this car take?",
    });
    expect(q.intent).toBe("fluids_atf");
    expect(q.query).toMatch(/ATF|transmission fluid|Mercon|Dexron/i);
  });

  it("oil change quarts stays fluids_oil (does not steal ATF)", () => {
    const q = buildManualRetrievalQuery({
      userText: "oil change quarts",
    });
    expect(q.intent).toBe("fluids_oil");
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
      intent: "overheat",
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
    expect(block).toMatch(/Never open a hot|hot coolant|Stop if.*before/i);
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

  it("E7: ATF liters are not engine oil capacity", () => {
    const guesses = extractOilGuessesFromText(
      "ATF capacity 9.0 liters. Transmission fluid refill.",
      { heading: "Transmission", pageFrom: 30, pageTo: 30 },
    );
    expect(guesses.filter((g) => g.field === "capacity")).toEqual([]);
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

  it("user_entered oil is injected with Garage profile (you entered) cite", () => {
    const block = formatGarageProfileFluidsForPrompt({
      oilCapacity: "4.4 qt with filter",
      oilCapacitySource: "user_entered",
      oilViscosity: "0W-20",
      oilViscositySource: "user_entered",
    });
    expect(block).toMatch(/\[GARAGE_PROFILE_FLUIDS\]/);
    expect(block).toMatch(/oil_capacity: 4\.4 qt with filter/);
    expect(block).toMatch(/Garage profile \(you entered\)/);
    expect(block).toMatch(/MUST USE/);
    expect(block).not.toMatch(/source=user_manual_confirmed$/m);
  });

  it("vcdb oil does not unlock buildManualSpecAnchors", () => {
    const ctx = buildManualSpecAnchors({
      retrievedHits: [],
      garage: {
        oilCapacity: "4.8 qt",
        oilCapacitySource: "vcdb",
      },
    });
    expect(ctx.oilCapacity).toBeFalsy();
  });
});

describe("coolant extract → confirm contract", () => {
  it("1. extracts coolant capacity + spec + mix from coolant context", () => {
    const guesses = extractCoolantGuessesFromText(
      "Engine coolant capacity 7.1 liters. Use ethylene glycol coolant. Mixture 50/50.",
      { heading: "Coolant", pageFrom: 22, pageTo: 22 },
    );
    const best = pickBestCoolantGuesses(guesses);
    expect(
      best.some((g) => g.field === "coolant_capacity_text" && /7\.1/.test(g.value)),
    ).toBe(true);
    expect(
      best.some(
        (g) =>
          g.field === "coolant_spec_text" && /ethylene glycol/i.test(g.value),
      ),
    ).toBe(true);
    expect(
      best.some((g) => g.field === "coolant_mix" && g.value === "50/50"),
    ).toBe(true);
  });

  it("2. washer fluid only → no engine coolant capacity", () => {
    const guesses = extractCoolantGuessesFromText(
      "Windshield washer fluid capacity 4.5 liters. Fill washer reservoir.",
      { heading: "Washer", pageFrom: 40, pageTo: 40 },
    );
    expect(guesses).toEqual([]);
  });

  it("confirm patch writes coolant garage columns (never silent)", () => {
    const patch = garagePatchForExtractConfirm({
      field: "coolant_capacity_text",
      kind: "coolant",
      value: "7.1 L",
      source: "user_manual_confirmed",
      now: "2026-11-04T00:00:00.000Z",
    });
    expect(patch.coolant_capacity_text).toBe("7.1 L");
    expect(patch.coolant_capacity_source).toBe("user_manual_confirmed");
    expect(patch.coolant_specs_confirmed_at).toBeTruthy();
    expect(patch).not.toHaveProperty("oil_capacity");
  });

  it("6. confirmed coolant cites Garage profile (from your manual)", () => {
    const block = formatGarageProfileFluidsForPrompt({
      coolantCapacityText: "7.1 L",
      coolantSpecText: "ethylene glycol",
      coolantCapacitySource: "user_manual_confirmed",
      coolantSpecSource: "user_manual_confirmed",
      coolantSpecsConfirmedAt: "2026-11-04T00:00:00.000Z",
    });
    expect(block).toMatch(/\[GARAGE_PROFILE_FLUIDS\]/);
    expect(block).toMatch(/coolant_capacity: 7\.1 L/);
    expect(block).toContain(GARAGE_PROFILE_MANUAL_SOURCE_LINE);
    expect(block).toMatch(/Never open a hot coolant reservoir/i);
  });

  it("7. no manual no garage → do not invent coolant liters", () => {
    const ctx = buildManualSpecAnchors({ retrievedHits: [], garage: {} });
    expect(applySpecOutputGate("Add 7.1 liters of coolant.", ctx)).not.toMatch(
      /7\.1/,
    );
  });
});

describe("brake fluid extract → confirm contract", () => {
  it("1. extracts DOT-4 from brake fluid context", () => {
    const guesses = extractBrakeFluidGuessesFromText(
      "Use only brake fluid DOT-4 from a sealed container. Check the brake reservoir level.",
      { heading: "Brake fluid", pageFrom: 50, pageTo: 50 },
    );
    const best = pickBestBrakeFluidGuesses(guesses);
    expect(
      best.some(
        (g) => g.field === "brake_fluid_spec_text" && g.value === "DOT-4",
      ),
    ).toBe(true);
  });

  it("2. engine oil only PDF → no brake fluid extract", () => {
    const guesses = extractBrakeFluidGuessesFromText(
      "Engine oil capacity with filter is 4.8 quarts. Use 0W-16 SAE.",
      { heading: "Capacities", pageFrom: 10, pageTo: 10 },
    );
    expect(guesses).toEqual([]);
  });

  it("clutch fluid without shared reservoir → skip", () => {
    const guesses = extractBrakeFluidGuessesFromText(
      "Clutch fluid: use DOT-4 hydraulic clutch fluid only.",
      { heading: "Clutch", pageFrom: 60, pageTo: 60 },
    );
    expect(guesses).toEqual([]);
  });

  it("confirm patch writes brake_fluid garage columns", () => {
    const patch = garagePatchForExtractConfirm({
      field: "brake_fluid_spec_text",
      kind: "brake_fluid",
      value: "DOT-4",
      source: "user_manual_confirmed",
      now: "2026-11-04T00:00:00.000Z",
    });
    expect(patch.brake_fluid_spec_text).toBe("DOT-4");
    expect(patch.brake_fluid_spec_source).toBe("user_manual_confirmed");
    expect(patch).not.toHaveProperty("oil_capacity");
    expect(patch).not.toHaveProperty("coolant_spec_text");
  });

  it("3. brake_warning frame forbids bleed / open lines", () => {
    const block = assembleManualSameFrame({
      intent: "brake_warning",
      userText: "soft brake pedal",
      obd: resolveObdStateForPrompt({
        userText: "soft brake pedal",
        hasLiveAdapter: false,
      }),
      manualHits: [],
      garageFluids: {
        brakeFluidSpecText: "DOT-4",
        brakeFluidSpecSource: "user_manual_confirmed",
      },
    });
    expect(block).toMatch(/soft pedal|STOP|do not drive|never instruct brake bleeding|Never instruct brake bleeding/i);
    expect(block).toMatch(/brake_fluid_spec: DOT-4/);
    expect(block).toMatch(/bleeding|hydraulic lines/i);
  });

  it("no inject → do not invent DOT grade", () => {
    const ctx = buildManualSpecAnchors({ retrievedHits: [], garage: {} });
    expect(applySpecOutputGate("Use DOT-4 brake fluid.", ctx)).not.toMatch(
      /DOT-4/i,
    );
  });

  it("confirmed DOT unlocks allowlist", () => {
    const ctx = buildManualSpecAnchors({
      retrievedHits: [],
      garage: {
        brakeFluidSpecText: "DOT-4",
        brakeFluidSpecSource: "user_manual_confirmed",
      },
    });
    expect(applySpecOutputGate("Your manual lists DOT-4.", ctx)).toMatch(
      /DOT-4/i,
    );
  });
});

describe("ATF extract → confirm contract", () => {
  it("1. Toyota ATF WS → kind=atf candidate", () => {
    const guesses = extractAtfGuessesFromText(
      "Use Toyota ATF WS. Automatic transmission fluid type.",
      { heading: "Automatic transmission", pageFrom: 70, pageTo: 70 },
    );
    const best = pickBestAtfGuesses(guesses);
    expect(
      best.some(
        (g) =>
          g.kind === "atf" &&
          g.field === "atf_spec_text" &&
          /ATF\s*WS/i.test(g.value),
      ),
    ).toBe(true);
    expect(best.every((g) => g.transmissionKind === "atf")).toBe(true);
  });

  it("1b. CVT fluid only → transmission_kind=cvt", () => {
    expect(
      classifyTransmissionKind("Use Nissan NS-2 CVT fluid only."),
    ).toBe("cvt");
    const guesses = extractAtfGuessesFromText(
      "Use Nissan NS-2 CVT fluid only. Continuously variable transmission.",
      { heading: "CVT fluid", pageFrom: 80, pageTo: 80 },
    );
    const best = pickBestAtfGuesses(guesses);
    expect(best.length).toBeGreaterThan(0);
    expect(best.every((g) => g.transmissionKind === "cvt")).toBe(true);
    expect(
      best.some(
        (g) =>
          g.field === "atf_spec_text" &&
          (/CVT|NS-?2/i.test(g.value)),
      ),
    ).toBe(true);
  });

  it("2b. Dexron only → transmission_kind=atf (not CVT)", () => {
    expect(
      classifyTransmissionKind("Use Dexron VI automatic transmission fluid."),
    ).toBe("atf");
    const guesses = extractAtfGuessesFromText(
      "Use Dexron VI automatic transmission fluid.",
      { heading: "Automatic transmission", pageFrom: 71, pageTo: 71 },
    );
    const best = pickBestAtfGuesses(guesses);
    expect(best.every((g) => g.transmissionKind === "atf")).toBe(true);
    expect(best.every((g) => g.transmissionKind !== "cvt")).toBe(true);
  });

  it("2. same page 0W-16 oil + ATF → oil and atf stay separate fields", () => {
    const oilPage =
      "Engine oil capacity with filter is 4.8 quarts. Recommended viscosity 0W-16.";
    const atfPage =
      "Automatic transmission fluid: Toyota ATF WS. ATF capacity 9.0 liters.";
    const oil = pickBestOilGuesses(
      extractOilGuessesFromText(oilPage, {
        heading: "Engine oil",
        pageFrom: 10,
        pageTo: 10,
      }),
    );
    const atf = pickBestAtfGuesses(
      extractAtfGuessesFromText(atfPage, {
        heading: "Transmission",
        pageFrom: 70,
        pageTo: 70,
      }),
    );
    expect(oil.some((g) => g.field === "viscosity" && /0W-16/.test(g.value))).toBe(
      true,
    );
    expect(oil.some((g) => g.field === "capacity" && /4\.8/.test(g.value))).toBe(
      true,
    );
    expect(
      atf.some((g) => g.field === "atf_spec_text" && /ATF\s*WS/i.test(g.value)),
    ).toBe(true);
    expect(
      atf.some((g) => g.field === "atf_capacity_text" && /\b9(?:\.0)?\b/.test(g.value)),
    ).toBe(true);
    expect(oil.every((g) => g.kind === "oil")).toBe(true);
    expect(atf.every((g) => g.kind === "atf")).toBe(true);
  });

  it("3. engine oil table only → no atf extract", () => {
    const guesses = extractAtfGuessesFromText(
      "Engine oil capacity with filter is 4.8 quarts. Use 0W-16 SAE.",
      { heading: "Capacities", pageFrom: 10, pageTo: 10 },
    );
    expect(guesses).toEqual([]);
  });

  it("4. oil-change allowlist does not unlock ATF liters as oil", () => {
    const ctx = buildManualSpecAnchors({
      intent: "fluids_oil",
      retrievedHits: [],
      garage: {
        oilCapacity: "4.8 qt",
        oilCapacitySource: "user_manual_confirmed",
        atfCapacityText: "9.0 L",
        atfCapacitySource: "user_manual_confirmed",
        atfSpecText: "Toyota ATF WS",
        atfSpecSource: "user_manual_confirmed",
      },
    });
    expect(ctx.oilCapacity).toMatch(/4\.8/);
    expect(ctx.atfCapacity).toBeFalsy();
    expect(applySpecOutputGate("Fill with 9.0 liters of oil.", ctx)).not.toMatch(
      /9\.0/,
    );
    expect(applySpecOutputGate("Use 4.8 qt.", ctx)).toMatch(/4\.8/);
  });

  it("confirm patch writes atf_* never oil_*", () => {
    const patch = garagePatchForExtractConfirm({
      field: "atf_spec_text",
      kind: "atf",
      value: "Toyota ATF WS",
      source: "user_manual_confirmed",
      now: "2026-11-04T00:00:00.000Z",
      transmissionKind: "atf",
    });
    expect(patch.atf_spec_text).toBe("Toyota ATF WS");
    expect(patch.atf_spec_source).toBe("user_manual_confirmed");
    expect(patch.transmission_kind).toBe("atf");
    expect(patch.atf_specs_confirmed_at).toBeTruthy();
    expect(patch).not.toHaveProperty("oil_capacity");
    expect(patch).not.toHaveProperty("oil_viscosity");
  });

  it("confirm CVT patch keeps verbatim spec + transmission_kind=cvt", () => {
    const patch = garagePatchForExtractConfirm({
      field: "atf_spec_text",
      kind: "atf",
      value: "NS-2 CVT fluid",
      source: "user_manual_confirmed",
      now: "2026-11-04T00:00:00.000Z",
      transmissionKind: "cvt",
    });
    expect(patch.atf_spec_text).toBe("NS-2 CVT fluid");
    expect(patch.transmission_kind).toBe("cvt");
    expect(patch).not.toHaveProperty("oil_capacity");
  });

  it("confirmed ATF cites Garage profile (from your manual)", () => {
    const block = formatGarageProfileFluidsForPrompt({
      atfSpecText: "Toyota ATF WS",
      atfCapacityText: "9.0 L",
      atfSpecSource: "user_manual_confirmed",
      atfCapacitySource: "user_manual_confirmed",
      atfSpecsConfirmedAt: "2026-11-04T00:00:00.000Z",
      transmissionKind: "atf",
    });
    expect(block).toMatch(/\[GARAGE_PROFILE_FLUIDS\]/);
    expect(block).toMatch(/transmission_kind: atf/);
    expect(block).toMatch(/atf_spec: Toyota ATF WS/);
    expect(block).toContain(GARAGE_PROFILE_MANUAL_SOURCE_LINE);
    expect(block).toMatch(/never treat as engine oil/i);
  });

  it("5. saved CVT garage emphasizes CVT-specific; forbids Dexron substitute", () => {
    const block = formatGarageProfileFluidsForPrompt({
      atfSpecText: "NS-2 CVT fluid",
      atfSpecSource: "user_manual_confirmed",
      transmissionKind: "cvt",
      atfSpecsConfirmedAt: "2026-11-04T00:00:00.000Z",
    });
    expect(block).toMatch(/transmission_kind: cvt/);
    expect(block).toMatch(/CVT-specific|CVT fluid/i);
    expect(block).toMatch(/Never recommend substituting conventional ATF/i);
    expect(block).toMatch(/Dexron\/Mercon/i);
    const frame = assembleManualSameFrame({
      intent: "fluids_atf",
      userText: "what ATF for my CVT car?",
      obd: resolveObdStateForPrompt({
        userText: "what ATF for my CVT car?",
        hasLiveAdapter: false,
      }),
      manualHits: [],
      garageFluids: {
        atfSpecText: "NS-2 CVT fluid",
        atfSpecSource: "user_manual_confirmed",
        transmissionKind: "cvt",
      },
    });
    expect(frame).toMatch(/transmission_kind: cvt/);
    expect(frame).toMatch(/CVT fluid|CVT-specific/i);
    expect(frame).toMatch(/never recommend Dexron|Never recommend substituting/i);
  });

  it("fluids_atf frame binds ATF not oil quarts", () => {
    const block = assembleManualSameFrame({
      intent: "fluids_atf",
      userText: "what ATF?",
      obd: resolveObdStateForPrompt({
        userText: "what ATF?",
        hasLiveAdapter: false,
      }),
      manualHits: [],
      garageFluids: {
        atfSpecText: "Toyota ATF WS",
        atfSpecSource: "user_manual_confirmed",
        transmissionKind: "atf",
        oilCapacity: "4.8 qt",
        oilCapacitySource: "user_manual_confirmed",
      },
    });
    expect(block).toMatch(/atf_spec: Toyota ATF WS/);
    expect(block).toMatch(/Never treat ATF as engine oil|never treat as engine oil|never treat transmission fluid as engine oil/i);
  });

  it("6. no inject → do not invent ATF type/liters", () => {
    const ctx = buildManualSpecAnchors({
      intent: "fluids_atf",
      retrievedHits: [],
      garage: {},
    });
    expect(
      applySpecOutputGate("Use Toyota ATF WS and add 9.0 liters.", ctx),
    ).not.toMatch(/9\.0/);
  });

  it("3. same manual 0W-16 + CVT fluid → oil and transmission stay separate", () => {
    const oil = pickBestOilGuesses(
      extractOilGuessesFromText(
        "Engine oil capacity with filter is 4.8 quarts. Recommended viscosity 0W-16.",
        { heading: "Engine oil", pageFrom: 10, pageTo: 10 },
      ),
    );
    const atf = pickBestAtfGuesses(
      extractAtfGuessesFromText(
        "CVT fluid capacity 4.5 liters. Use NS-2 CVT fluid.",
        { heading: "CVT", pageFrom: 80, pageTo: 80 },
      ),
    );
    expect(oil.some((g) => g.field === "capacity" && /4\.8/.test(g.value))).toBe(
      true,
    );
    expect(atf.every((g) => g.transmissionKind === "cvt")).toBe(true);
    expect(
      atf.some((g) => g.field === "atf_capacity_text" && /\b4(?:\.5)?\b/.test(g.value)),
    ).toBe(true);
    const oilCtx = buildManualSpecAnchors({
      intent: "fluids_oil",
      retrievedHits: [],
      garage: {
        oilCapacity: "4.8 qt",
        oilCapacitySource: "user_manual_confirmed",
        atfCapacityText: "4.5 L",
        atfCapacitySource: "user_manual_confirmed",
        transmissionKind: "cvt",
      },
    });
    expect(oilCtx.atfCapacity).toBeFalsy();
    expect(
      applySpecOutputGate("Fill with 4.5 liters of oil.", oilCtx),
    ).not.toMatch(/4\.5/);
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
