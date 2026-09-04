import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isKimiVisionEnabled,
  kimiBaseUrl,
  kimiVisionTimeoutMs,
} from "@/lib/kimi";
import { analyzeChatImage, KIMI_PERCEPTION_SYSTEM } from "@/lib/vision/kimi-client";
import {
  dtcTextFromAnalysis,
  formatImageAnalysisBlock,
  formatPerceptionFailedBlock,
  imageSceneConflictsWithUserText,
  mergeDtcAnchors,
  toClientImageSummary,
} from "@/lib/vision/format-analysis";
import { parseImageAnalysis } from "@/lib/vision/parse-analysis";
import { isLowTrustAnalysis } from "@/lib/vision/types";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import type { VehicleInfo } from "@/lib/types/chat";
import { AI_CONSENT_COPY } from "@/lib/ai-consent";

const camry: VehicleInfo = {
  id: "v1",
  name: "Camry",
  year: 2021,
  make: "Toyota",
  model: "Camry",
  market: "US",
  mileage: 40000,
  engine: "2.5L",
};

const CLEAR_JSON = {
  condition: "clear",
  confidence: 0.86,
  scene: "obd_screen",
  ocr_text: ["P0420 Catalyst"],
  dtc_codes: ["p0420", "not-a-code"],
  readings: [{ name: "mil", value: "on", unit: null }],
  objects: ["scan tool"],
  safety_flags: ["none"],
  notes: "OBD screen shows P0420.",
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Kimi vision flags", () => {
  it("is off without an API key", () => {
    vi.stubEnv("KIMI_API_KEY", "");
    vi.stubEnv("MOONSHOT_API_KEY", "");
    expect(isKimiVisionEnabled()).toBe(false);
  });

  it("respects KIMI_VISION_ENABLED=false even with a key", () => {
    vi.stubEnv("KIMI_API_KEY", "sk-test");
    vi.stubEnv("KIMI_VISION_ENABLED", "false");
    expect(isKimiVisionEnabled()).toBe(false);
  });

  it("accepts MOONSHOT_BASE_URL as an alias", () => {
    vi.stubEnv("KIMI_BASE_URL", "");
    vi.stubEnv("MOONSHOT_BASE_URL", "https://api.moonshot.ai/v1/");
    expect(kimiBaseUrl()).toBe("https://api.moonshot.ai/v1");
  });

  it("defaults timeout to 20–30s", () => {
    expect(kimiVisionTimeoutMs()).toBeGreaterThanOrEqual(20_000);
    expect(kimiVisionTimeoutMs()).toBeLessThanOrEqual(30_000);
  });
});

describe("parseImageAnalysis", () => {
  it("fills defaults, cleans DTC codes, and keeps trusted readings", () => {
    const parsed = parseImageAnalysis(JSON.stringify(CLEAR_JSON));
    expect(parsed?.scene).toBe("obd_screen");
    expect(parsed?.dtc_codes).toEqual(["P0420"]);
    expect(parsed?.readings).toHaveLength(1);
    expect(isLowTrustAnalysis(parsed!)).toBe(false);
  });

  it("extracts DTCs from OCR when dtc_codes is missing", () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({
        condition: "clear",
        confidence: 0.7,
        ocr_text: ["Code P0171 System Too Lean"],
      }),
    );
    expect(parsed?.dtc_codes).toContain("P0171");
  });

  it("strips guessed readings when blurry / low confidence", () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({
        condition: "blurry",
        confidence: 0.2,
        readings: [{ name: "oil_level", value: "low", unit: null }],
        notes: "maybe low oil",
      }),
    );
    expect(parsed?.readings).toEqual([]);
    expect(isLowTrustAnalysis(parsed!)).toBe(true);
    expect(parsed?.notes).toMatch(/retake/i);
  });

  it("does not inject DTC codes or OCR as facts when confidence is below 0.5", () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({
        condition: "clear",
        confidence: 0.4,
        scene: "obd_screen",
        ocr_text: ["P0420"],
        dtc_codes: ["P0420"],
        readings: [{ name: "mil", value: "on", unit: null }],
      }),
    )!;
    expect(isLowTrustAnalysis(parsed)).toBe(true);
    expect(parsed.dtc_codes).toEqual([]);
    expect(parsed.ocr_text).toEqual([]);
    expect(parsed.readings).toEqual([]);
    expect(dtcTextFromAnalysis(parsed)).toBe("");
    const block = formatImageAnalysisBlock(parsed, "kimi-k3");
    expect(block).toMatch(/source=kimi-k3 confidence=0\.4/);
    expect(block).not.toMatch(/P0420/);
    expect(toClientImageSummary(parsed).dtc_codes).toEqual([]);
    expect(mergeDtcAnchors("", parsed)).toBeNull();
    expect(mergeDtcAnchors("Check engine P0420", parsed)).toMatch(/P0420/);
  });

  it("treats dark photos as low-trust and strips guessed P-codes", () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({
        condition: "dark",
        confidence: 0.8,
        dtc_codes: ["P0300"],
        ocr_text: ["P0300"],
      }),
    )!;
    expect(parsed.dtc_codes).toEqual([]);
    expect(parsed.ocr_text).toEqual([]);
  });

  it("ignores OCR that is not an OBD-II code", () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({
        condition: "clear",
        confidence: 0.9,
        ocr_text: ["FAULT", "READY"],
        dtc_codes: ["not-a-code", "catalyst"],
      }),
    );
    expect(parsed?.dtc_codes).toEqual([]);
  });

  it("returns null for non-JSON model output", () => {
    expect(parseImageAnalysis("I think this is a brake caliper.")).toBeNull();
    expect(parseImageAnalysis("")).toBeNull();
  });

  it("parses JSON inside markdown fences", () => {
    const parsed = parseImageAnalysis(
      "```json\n" + JSON.stringify(CLEAR_JSON) + "\n```",
    );
    expect(parsed?.dtc_codes).toEqual(["P0420"]);
  });
});

describe("Kimi US scene prompt", () => {
  it("ships OBD, dipstick, and tire-sidewall examples without a repair plan", () => {
    expect(KIMI_PERCEPTION_SYSTEM).toMatch(/obd_screen/);
    expect(KIMI_PERCEPTION_SYSTEM).toMatch(/dipstick/i);
    expect(KIMI_PERCEPTION_SYSTEM).toMatch(/tire sidewall/i);
    expect(KIMI_PERCEPTION_SYSTEM).toMatch(/blurry OBD/i);
    expect(KIMI_PERCEPTION_SYSTEM).not.toMatch(/Replace X now|guaranteed fix/i);
  });
});

describe("IMAGE_ANALYSIS prompt blocks", () => {
  it("marks perception-only and never includes image bytes", () => {
    const parsed = parseImageAnalysis(JSON.stringify(CLEAR_JSON))!;
    const block = formatImageAnalysisBlock(parsed, "kimi-k3");
    expect(block).toMatch(/\[IMAGE_ANALYSIS source=kimi-k3 confidence=0\.86\]/);
    expect(block).toMatch(/perception only/i);
    expect(block).not.toMatch(/data:image|base64,/i);
    expect(toClientImageSummary(parsed).askRetake).toBe(false);
  });

  it("asks for a retake when the photo is unreadable", () => {
    const parsed = parseImageAnalysis(
      JSON.stringify({ condition: "unreadable", confidence: 0.1 }),
    )!;
    const block = formatImageAnalysisBlock(parsed, "kimi-k3");
    expect(block).toMatch(/clearer/i);
    expect(block).toMatch(/retake/i);
    expect(block).toMatch(/Do not write a repair plan/i);
    expect(toClientImageSummary(parsed).askRetake).toBe(true);
  });

  it("clear OBD photos stay educational for DeepSeek (no retake)", () => {
    const parsed = parseImageAnalysis(JSON.stringify(CLEAR_JSON))!;
    const block = formatImageAnalysisBlock(parsed, "kimi-k3");
    expect(block).toMatch(/short educational summary/i);
    expect(block).not.toMatch(/insufficient/i);
    expect(toClientImageSummary(parsed).askRetake).toBe(false);
    expect(toClientImageSummary(parsed).dtc_codes).toEqual(["P0420"]);
  });

  it("fail-open block does not invent a scene", () => {
    expect(formatPerceptionFailedBlock()).toContain("unreadable");
    expect(formatPerceptionFailedBlock()).toMatch(/retake/i);
  });

  it("asks to confirm when rear-brake text does not match an OBD/engine photo", () => {
    const parsed = parseImageAnalysis(JSON.stringify(CLEAR_JSON))!;
    expect(
      imageSceneConflictsWithUserText("rear brake pads are thin", parsed),
    ).toBe(true);
    const block = formatImageAnalysisBlock(
      parsed,
      "kimi-k3",
      "Please check my rear brake pads",
    );
    expect(block).toContain("[IMAGE_SCENE_CONFLICT]");
    expect(block).toMatch(/confirm the photo/i);
  });
});

describe("analyzeChatImage (mocked Kimi)", () => {
  const tiny = "data:image/jpeg;base64,QQ==";

  it("does not call fetch when vision is disabled", async () => {
    vi.stubEnv("KIMI_API_KEY", "");
    vi.stubEnv("MOONSHOT_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await analyzeChatImage(tiny, "what is this?");
    expect(result.disabled).toBe(true);
    expect(result.analysis).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses a successful JSON completion", async () => {
    vi.stubEnv("KIMI_API_KEY", "sk-test");
    vi.stubEnv("KIMI_VISION_ENABLED", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(CLEAR_JSON) } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const result = await analyzeChatImage(tiny, "OBD screen");
    expect(result.failed).toBe(false);
    expect(result.analysis?.dtc_codes).toEqual(["P0420"]);
    expect(result.requestId).toBeTruthy();
  });

  it("does not keep fake P-codes from a low-confidence Kimi mock", async () => {
    vi.stubEnv("KIMI_API_KEY", "sk-test");
    vi.stubEnv("KIMI_VISION_ENABLED", "true");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    condition: "blurry",
                    confidence: 0.2,
                    scene: "obd_screen",
                    ocr_text: ["P0420"],
                    dtc_codes: ["P0420"],
                    readings: [{ name: "mil", value: "on", unit: null }],
                    objects: ["phone"],
                    safety_flags: ["none"],
                    notes: "guessing P0420",
                  }),
                },
              },
            ],
            usage: { prompt_tokens: 8, completion_tokens: 12, total_tokens: 20 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const result = await analyzeChatImage(tiny, "what code is this?");
    expect(result.failed).toBe(false);
    expect(result.analysis?.dtc_codes).toEqual([]);
    expect(result.analysis?.readings).toEqual([]);
    expect(result.analysis?.notes).not.toMatch(/P0420/);
    const injected = formatImageAnalysisBlock(result.analysis!, result.model);
    expect(injected).not.toMatch(/\bP[0-9A-F]{4}\b/);
    expect(injected).toMatch(/retake/i);
  });

  it("fail-opens on timeout / abort", async () => {
    vi.stubEnv("KIMI_API_KEY", "sk-test");
    vi.stubGlobal("fetch", () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const result = await analyzeChatImage(tiny, "blurry photo");
    expect(result.failed).toBe(true);
    expect(result.analysis).toBeNull();
  });
});

describe("chat prompt + consent", () => {
  it("tells DeepSeek to treat IMAGE_ANALYSIS as perception only", () => {
    const prompt = buildChatSystemPrompt(camry, true);
    expect(prompt.content).toMatch(/perception only/i);
    expect(prompt.content).toMatch(/clearer photo/i);
    expect(prompt.content).toMatch(/no root-cause assertion/i);
    expect(prompt.content).toMatch(/confidence is below 0\.5/i);
  });

  it("consent copy names Kimi for photos and DeepSeek for text", () => {
    expect(AI_CONSENT_COPY.recipient).toMatch(/DeepSeek/i);
    expect(AI_CONSENT_COPY.recipient).toMatch(/Kimi/i);
    expect(AI_CONSENT_COPY.dataCategories.join(" ")).toMatch(/Moonshot\/Kimi/i);
    expect(AI_CONSENT_COPY.refuse).toMatch(/upload photos/i);
  });
});
