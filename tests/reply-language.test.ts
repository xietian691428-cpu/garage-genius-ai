import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import { GARAGE_GENIUS_SYSTEM_PROMPT } from "@/lib/prompts/garage-genius";
import {
  detectReplyLanguageHint,
  disclaimerForReplyLanguage,
  latestUserPlainText,
  REPLY_LANGUAGE_PROMPT,
  turnReplyLanguageLock,
} from "@/lib/reply-language";
import {
  ensureLegalDisclaimer,
  LEGAL_DISCLAIMER_EN,
  LEGAL_DISCLAIMER_ES,
  LEGAL_DISCLAIMER_ZH,
} from "@/lib/legal-disclaimer";
import { sanitizeFocusCommand } from "@/lib/parse-ai-focus";
import type { VehicleInfo } from "@/lib/types/chat";

const vehicle: VehicleInfo = {
  id: "v1",
  name: "Test",
  year: 2018,
  make: "Toyota",
  model: "Camry",
  market: "US",
  mileage: 80000,
  engine: "2.5L",
};

describe("reply language follows user message", () => {
  it("detects zh / es / en hints", () => {
    expect(detectReplyLanguageHint("刹车异响怎么办")).toBe("zh");
    expect(
      detectReplyLanguageHint("¿Cómo reviso los frenos de mi coche?"),
    ).toBe("es");
    expect(detectReplyLanguageHint("My brakes squeal when stopping")).toBe(
      "en",
    );
    expect(detectReplyLanguageHint("Cabin air barely blows, worse at idle")).toBe(
      "en",
    );
  });

  it("builds a hard turn language lock from the detected hint", () => {
    expect(turnReplyLanguageLock("en")).toMatch(/HARD LANGUAGE LOCK/i);
    expect(turnReplyLanguageLock("en")).toMatch(/entire.*reply in English/i);
    expect(turnReplyLanguageLock("zh")).toMatch(/Chinese/i);
    expect(turnReplyLanguageLock("es")).toMatch(/Spanish/i);
  });

  it("picks disclaimer language for append fallback", () => {
    expect(disclaimerForReplyLanguage("zh")).toBe(LEGAL_DISCLAIMER_ZH);
    expect(disclaimerForReplyLanguage("es")).toBe(LEGAL_DISCLAIMER_ES);
    expect(disclaimerForReplyLanguage("en")).toBe(LEGAL_DISCLAIMER_EN);
    expect(ensureLegalDisclaimer("Hello diagnosis.", "zh")).toContain(
      "概不负责",
    );
    expect(ensureLegalDisclaimer("Hola.", "es")).toContain("no se responsabiliza");
  });

  it("reads latest user plain text from multimodal messages", () => {
    expect(
      latestUserPlainText([
        { role: "assistant", content: "Hi" },
        {
          role: "user",
          content: [
            { type: "text", text: "看看这个漏油" },
            { type: "image_url", image_url: { url: "data:image/png;base64,xx" } },
          ],
        },
      ]),
    ).toBe("看看这个漏油");
  });

  it("system prompts no longer force English-only replies", () => {
    expect(GARAGE_GENIUS_SYSTEM_PROMPT).not.toMatch(
      /Always reply in clear US English/i,
    );
    expect(REPLY_LANGUAGE_PROMPT).toMatch(/same language as the user's latest message/i);
    const prompt = buildChatSystemPrompt(vehicle, false);
    expect(prompt.content).toMatch(/Reply language/i);
    expect(prompt.content).not.toMatch(
      /Always respond in English — even if the user writes/i,
    );
    expect(prompt.content).toMatch(/UI language settings do \*\*not\*\* force/i);
  });

  it("keeps focus-data user strings in Chinese (part id stays English)", () => {
    const cmd = sanitizeFocusCommand({
      type: "focus",
      part: "brakes",
      message: "主要问题可能在刹车系统。",
      steps: ["安全停稳车辆", "目视检查刹车液液位"],
      tools: ["手电筒"],
      safetyNotes: ["发动机冷却后再检查"],
    });
    expect(cmd?.part).toBe("brakes");
    expect(cmd?.message).toContain("刹车");
    expect(cmd?.steps?.[0]).toContain("停稳");
  });
});
