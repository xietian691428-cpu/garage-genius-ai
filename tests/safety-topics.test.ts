import { describe, expect, it } from "vitest";
import {
  DEFAULT_SAFETY_TOPICS,
  matchSafetyTopicIds,
  matchSafetyTopics,
  mergeSafetyTopics,
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
