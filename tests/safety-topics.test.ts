import { describe, expect, it } from "vitest";
import { usTop10CoreUserQuestionFailures } from "@/lib/pilot/hard-validate-seed-answer";
import {
  DEFAULT_SAFETY_TOPICS,
  matchSafetyTopicIds,
  matchSafetyTopics,
  mergeSafetyTopics,
  parkingBrakeNegationMatches,
  resolveSafetyCallout,
  textNeedsHighRiskSafetyCallout,
  type SafetyTopic,
} from "@/lib/safety-topics";

describe("safety-topics catalog", () => {
  it("ships the expected initial topic ids", () => {
    expect(DEFAULT_SAFETY_TOPICS.map((t) => t.id)).toEqual([
      "brakes",
      "airbag_srs",
      "fuel_system",
      "high_voltage_ev",
      "lifting_under_car",
      "wheel_road",
      "cooling_hot",
      "exhaust_co",
    ]);
  });
});

describe("matchSafetyTopicIds", () => {
  it("matches English brake / ABS phrases", () => {
    expect(matchSafetyTopicIds("How do I replace brake pads?")).toContain(
      "brakes",
    );
    expect(matchSafetyTopicIds("ABS light came on")).toContain("brakes");
  });

  it("does not treat absolute as abs", () => {
    expect(matchSafetyTopicIds("The absolute best oil for commuting")).toEqual(
      [],
    );
  });

  it("suppresses soft brake mention in assistant-only oil DIY tips", () => {
    const ids = matchSafetyTopicIds("", {
      userText:
        "When should I do the next oil change and can I DIY in the driveway?",
      assistantText:
        "Use jack stands. Next: Brake inspection at 30k; pads typically last 40–60k.",
    });
    expect(ids).toContain("lifting_under_car");
    expect(ids).not.toContain("brakes");
  });

  it("does not treat set-the-parking-brake safety lines as brake work", () => {
    expect(
      matchSafetyTopicIds("", {
        userText: "P0300 random misfire, car shakes at idle",
        assistantText:
          "Park on level ground and set the parking brake. Then check spark plugs and coils.",
      }),
    ).not.toContain("brakes");
    expect(matchSafetyTopicIds("Step 1: Set the parking brake.")).not.toContain(
      "brakes",
    );
  });

  it.each([
    // EN DIY — shouldTrigger: false
    {
      shouldTrigger: false,
      text: "Before I jack it up I always set the parking brake and chock both rear wheels.",
    },
    {
      shouldTrigger: false,
      text: "Step 2: Engage the handbrake, then raise the front of the car.",
    },
    {
      shouldTrigger: false,
      text: "I put the parking brake on every time I park, even on flat ground.",
    },
    {
      shouldTrigger: false,
      text: "Make sure the parking brake is set before you crawl under.",
    },
    {
      shouldTrigger: false,
      text: "Just secure the vehicle with the parking brake and wheel chocks.",
    },
    {
      shouldTrigger: false,
      text: "I checked the parking brake cable while doing the oil change, everything looks fine.",
    },
    {
      shouldTrigger: false,
      text: "请先拉手刹再顶车。",
    },
    // EN faults — shouldTrigger: true
    {
      shouldTrigger: true,
      text: "Parking brake is not holding on any incline, car slowly rolls.",
    },
    {
      shouldTrigger: true,
      text: "During the oil change I noticed the parking brake shoes are worn, should I replace them too?",
    },
    {
      shouldTrigger: true,
      text: "换油时发现手刹蹄片磨损，要不要一起换",
    },
    {
      shouldTrigger: true,
      text: "Handbrake won't release, it's stuck on and I smell burning.",
    },
    {
      shouldTrigger: true,
      text: "EPB fault light came on and the parking brake doesn't engage at all.",
    },
    {
      shouldTrigger: true,
      text: "I set the parking brake but it failed and the car rolled into the street.",
    },
    {
      shouldTrigger: true,
      text: "Parking brake feels completely soft, no resistance after 2 clicks.",
    },
    {
      shouldTrigger: true,
      text: "The electronic parking brake stays engaged while driving.",
    },
    {
      shouldTrigger: true,
      text: "I set the parking brake like usual but it won't hold on a slope anymore.",
    },
    {
      shouldTrigger: true,
      text: "Applied the handbrake before jacking, but it still let the car roll a bit.",
    },
    // Warning light alone → true (safer than ignoring a brake-system lamp)
    {
      shouldTrigger: true,
      text: "The parking brake light is on but the car holds fine on hills.",
    },
    {
      shouldTrigger: true,
      text: "Parking brake warning light and the pedal goes almost to the floor.",
    },
    // ES DIY — false
    {
      shouldTrigger: false,
      text: "Antes de levantar el coche siempre pongo el freno de mano y calzo las ruedas.",
    },
    {
      shouldTrigger: false,
      text: "Paso 1: Acciona el freno de estacionamiento y luego sube el gato.",
    },
    {
      shouldTrigger: false,
      text: "Siempre dejo el freno de mano puesto cuando aparco.",
    },
    // ES faults — true
    {
      shouldTrigger: true,
      text: "El freno de mano no sujeta en las pendientes, el coche se va rodando.",
    },
    {
      shouldTrigger: true,
      text: "El freno de estacionamiento no se suelta, se queda enganchado.",
    },
    {
      shouldTrigger: true,
      text: "Luz de fallo del freno de mano y no agarra nada.",
    },
    {
      shouldTrigger: true,
      text: "Puse el freno de mano pero falló y el coche se desplazó.",
    },
    {
      shouldTrigger: true,
      text: "El freno de mano está muy blando, no tiene resistencia.",
    },
    // Mixed language — true
    {
      shouldTrigger: true,
      text: "Parking brake 不持力，坡上会溜车。",
    },
    {
      shouldTrigger: true,
      text: "Freno de mano no holds on hills, car rolls.",
    },
    {
      shouldTrigger: true,
      text: "Set the parking brake but 还是会动。",
    },
    {
      shouldTrigger: true,
      text: "EPB fault, freno de mano no engagé.",
    },
    // Bald "failed" must not fire (phrase is "failed to hold" / "motor failed")
    {
      shouldTrigger: false,
      text: "I failed to set the parking brake before crawling under.",
    },
    {
      shouldTrigger: true,
      text: "The parking brake cable is stretched and it slips on any incline.",
    },
    {
      shouldTrigger: true,
      text: "EPB motor failed, the parking brake won't stay on.",
    },
    {
      shouldTrigger: true,
      text: "手刹拉不起，仪表有故障灯。",
    },
    {
      shouldTrigger: true,
      text: "El freno de mano no aguanta y no retiene en la cuesta.",
    },
    // Service-brake keywords still win after parking-brake masking
    {
      shouldTrigger: true,
      text: "While replacing the brake pads I also inspected the parking brake shoes.",
    },
    // Real DIY prompts (Camry-style) — callout on user text
    {
      shouldTrigger: false,
      text: "I'm doing an oil change on my 2021 Camry. Should I set the parking brake before I jack it up?",
    },
    {
      shouldTrigger: false,
      text: "Step-by-step for rotating tires – do I need the parking brake on?",
    },
    {
      shouldTrigger: false,
      text: "Changing the cabin filter, any safety stuff I should do first?",
    },
    {
      shouldTrigger: true,
      text: "Parking brake won't hold on a driveway incline. Car creeps forward even when it's fully set.",
    },
    {
      shouldTrigger: true,
      text: "EPB light on, parking brake doesn't engage. Can I still drive it to the shop?",
    },
    {
      shouldTrigger: true,
      text: "Handbrake lever goes up with almost no resistance and the car rolls. Is the cable shot?",
    },
    {
      shouldTrigger: true,
      text: "I always set the parking brake when I park. Lately it feels softer and on hills it doesn't hold as well. Still safe to DIY the rear pads?",
    },
    {
      shouldTrigger: true,
      text: "While doing the oil change I noticed the parking brake shoes look worn. Should I replace them at the same time?",
    },
    {
      shouldTrigger: true,
      text: "Parking brake is fine, but the regular brakes feel spongy after the car sat for a month.",
    },
    {
      shouldTrigger: true,
      text: "El freno de mano no sujeta bien en las pendientes. ¿Puedo seguir usándolo o es peligroso?",
    },
    {
      shouldTrigger: false,
      text: "Voy a cambiar el aceite, ¿pongo el freno de mano antes de levantar el coche?",
    },
    {
      shouldTrigger: true,
      text: "Luz del freno de mano encendida y no agarra. ¿Puedo manejar al taller?",
    },
    {
      shouldTrigger: true,
      text: "I need to replace the rear brake pads. Parking brake is also not holding well. Can I do both myself with jack stands?",
    },
    {
      shouldTrigger: true,
      text: "Car rolled a little while it was on jack stands because the parking brake didn't hold. What should I check first?",
    },
  ])("parking-brake shouldTrigger=$shouldTrigger: $text", ({ text, shouldTrigger }) => {
    const ids = matchSafetyTopicIds(text);
    if (shouldTrigger) {
      expect(ids, text).toContain("brakes");
    } else {
      expect(ids, text).not.toContain("brakes");
    }
  });

  it("treats assistant parking-brake faults as a strong brakes hit", () => {
    expect(
      matchSafetyTopicIds("", {
        userText: "The car smells hot after a drive",
        assistantText:
          "Parking brake dragging while driving can overheat the rear brakes.",
      }),
    ).toContain("brakes");
  });

  it("matches Chinese brake aliases", () => {
    expect(matchSafetyTopicIds("怎么换刹车片？")).toEqual(["brakes"]);
  });

  it("matches airbag / SRS and prefers critical when capping", () => {
    const ids = matchSafetyTopicIds(
      "I need to disconnect the battery near the airbag SRS clock spring and also change brake pads",
      { max: 2 },
    );
    expect(ids[0]).toBe("airbag_srs");
    expect(ids).toContain("brakes");
    expect(ids.length).toBeLessThanOrEqual(2);
  });

  it("matches fuel, HV, lifting, roadside, cooling, CO", () => {
    expect(matchSafetyTopicIds("fuel pump replacement")).toContain(
      "fuel_system",
    );
    expect(matchSafetyTopicIds("orange cables on the traction battery")).toContain(
      "high_voltage_ev",
    );
    expect(matchSafetyTopicIds("Use jack stands under the vehicle")).toContain(
      "lifting_under_car",
    );
    expect(matchSafetyTopicIds("路边换胎要注意什么")).toContain("wheel_road");
    expect(matchSafetyTopicIds("Can I open radiator when hot?")).toContain(
      "cooling_hot",
    );
    expect(
      matchSafetyTopicIds("Is it ok to run engine in garage with door closed?"),
    ).toContain("exhaust_co");
  });

  it("skips ordinary low-risk chat", () => {
    expect(
      matchSafetyTopicIds("What oil viscosity for my sedan highway commute?"),
    ).toEqual([]);
    expect(matchSafetyTopicIds("Cabin air filter location")).toEqual([]);
  });

  it("respects enabled=false via merge", () => {
    const topics = mergeSafetyTopics(DEFAULT_SAFETY_TOPICS, [
      { id: "brakes", severity: "high", keywords: ["brake"], calloutEn: "x", enabled: false },
    ]);
    expect(matchSafetyTopicIds("replace brake pads", { topics })).toEqual([]);
  });
});

describe("callout language", () => {
  it("uses calloutZh for Chinese questions", () => {
    const hits = matchSafetyTopics("怎么换刹车片", { lang: "zh" });
    expect(hits[0]?.topic.id).toBe("brakes");
    expect(hits[0]?.callout).toMatch(/安全提示/);
  });

  it("falls back to English when zh missing", () => {
    const topic: SafetyTopic = {
      id: "tmp",
      severity: "high",
      keywords: ["widget"],
      calloutEn: "Safety: English only.",
    };
    expect(resolveSafetyCallout(topic, "zh")).toBe("Safety: English only.");
  });
});

describe("textNeedsHighRiskSafetyCallout", () => {
  it("is true when any topic matches across parts", () => {
    expect(
      textNeedsHighRiskSafetyCallout(
        "My car squeals",
        "Likely worn brake pads — inspect before long trips.",
      ),
    ).toBe(true);
    expect(textNeedsHighRiskSafetyCallout("Cabin filter")).toBe(false);
  });
});

describe("parkingBrakeNegationMatches", () => {
  it.each([
    "Parking brake is fine.",
    "parking brake is OK",
    "The handbrake works, but the pedal feels spongy.",
    "No issue with the parking brake",
    "EPB is fine",
    "El freno de mano está bien",
    "freno de mano no tiene problema",
    "手刹没事，行车制动绵",
    "驻车制动正常，脚刹发软",
  ])("matches %s", (text) => {
    expect(parkingBrakeNegationMatches(text)).toBe(true);
  });

  it.each([
    "ok thanks, go ahead",
    "Set the parking brake before you jack it up.",
    "Parking brake won't hold on a slope.",
    "请先拉手刹再顶车。",
  ])("does not match %s", (text) => {
    expect(parkingBrakeNegationMatches(text)).toBe(false);
  });
});

describe("US top-10 safety seed CI gate", () => {
  it("user-question matchers still pass on the 10 core seeds", () => {
    expect(usTop10CoreUserQuestionFailures()).toEqual([]);
  });
});
