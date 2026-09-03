import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  attachKimiVisionNoteToMessages,
  KIMI_VISION_MODELS,
  normalizeKimiMessages,
} from "@/lib/kimi";
import type { DeepSeekMessage } from "@/lib/deepseek";

describe("Kimi vision helpers", () => {
  it("exposes a non-empty vision model cascade starting with kimi-k3 by default", () => {
    expect(KIMI_VISION_MODELS.length).toBeGreaterThanOrEqual(1);
    expect(KIMI_VISION_MODELS[0]).toMatch(/kimi|moonshot|vision/i);
  });

  it("normalizes bare base64 images to data URLs", () => {
    const messages: DeepSeekMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "what is this?" },
          {
            type: "image_url",
            image_url: { url: "abc123raw" },
          },
        ],
      },
    ];
    const normalized = normalizeKimiMessages(messages);
    const part = Array.isArray(normalized[0].content)
      ? normalized[0].content.find((p) => p.type === "image_url")
      : null;
    expect(part?.type).toBe("image_url");
    if (part?.type === "image_url") {
      expect(part.image_url.url).toBe("data:image/jpeg;base64,abc123raw");
    }
  });

  it("attaches a Kimi note and strips image parts for DeepSeek coaching", () => {
    const messages: DeepSeekMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "Brake fluid low?" },
          {
            type: "image_url",
            image_url: { url: "data:image/jpeg;base64,xx" },
          },
        ],
      },
    ];
    const next = attachKimiVisionNoteToMessages(
      messages,
      "Reservoir mark is below MIN; fluid looks dark.",
    );
    expect(typeof next[0].content).toBe("string");
    expect(String(next[0].content)).toContain("Brake fluid low?");
    expect(String(next[0].content)).toContain("Photo analysis from Kimi");
    expect(String(next[0].content)).toContain("below MIN");
  });
});

describe("vision pipeline wiring", () => {
  it("routes vision APIs through callVisionJson / chat through callChatWithOptionalVision", () => {
    for (const file of [
      "app/api/vision/analyze-vehicle/route.ts",
      "app/api/vision/analyze-obd/route.ts",
      "app/api/vision/analyze-receipt/route.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("callVisionJson");
      expect(src, file).not.toContain("callDeepSeekVisionJson");
    }
    const chat = readFileSync("app/api/chat/route.ts", "utf8");
    expect(chat).toContain("callChatWithOptionalVision");
  });
});
