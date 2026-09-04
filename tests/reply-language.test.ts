import { describe, expect, it } from "vitest";
import { buildChatSystemPrompt } from "@/lib/chat-system-prompt";
import { GARAGE_GENIUS_SYSTEM_PROMPT } from "@/lib/prompts/garage-genius";
import {
  containsCjkChars,
  countCjkChars,
  detectReplyLanguageHint,
  disclaimerForReplyLanguage,
  enforceNoCjkAssistantReply,
  latestUserPlainText,
  productAssistantLanguage,
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
import {
  budgetExceededMessage,
  visionQuotaMessage,
} from "@/lib/ai-cost/gate";
import {
  NHTSA_RECALL_EMPTY,
  NHTSA_RECALL_UNAVAILABLE,
} from "@/lib/vehicle-data/recall-copy";

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

describe("reply language follows user message (en/es product)", () => {
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

  it("maps Chinese user hints to English assistant language", () => {
    expect(productAssistantLanguage("zh")).toBe("en");
    expect(productAssistantLanguage("en")).toBe("en");
    expect(productAssistantLanguage("es")).toBe("es");
  });

  it("builds a hard turn language lock from the detected hint", () => {
    expect(turnReplyLanguageLock("en")).toMatch(/HARD LANGUAGE LOCK/i);
    expect(turnReplyLanguageLock("en")).toMatch(/entire.*reply in English/i);
    expect(turnReplyLanguageLock("en")).toMatch(/Never use Chinese characters/i);
    expect(turnReplyLanguageLock("zh")).toMatch(/entire.*reply in English/i);
    expect(turnReplyLanguageLock("zh")).toMatch(/must \*\*not\*\* reply in Chinese/i);
    expect(turnReplyLanguageLock("zh")).not.toMatch(/Write the \*\*entire\*\* reply in Chinese/i);
    expect(turnReplyLanguageLock("es")).toMatch(/Spanish/i);
    expect(turnReplyLanguageLock("es")).toMatch(/Never use Chinese characters/i);
  });

  it("locks English questions to an English reply including disclaimers", () => {
    expect(detectReplyLanguageHint("Any recalls on this Camry?")).toBe("en");
    expect(detectReplyLanguageHint("My brakes failed, can I drive to the shop?")).toBe(
      "en",
    );
    const lock = turnReplyLanguageLock("en");
    expect(lock).toMatch(/entire.*reply in English/i);
    expect(lock).not.toMatch(/[\u4e00-\u9fff]/);
    expect(disclaimerForReplyLanguage("es")).toMatch(/no se responsabiliza/i);
  });

  it("keeps EN product path errors in English (no CJK)", () => {
    const cjk = /[\u4e00-\u9fff]/;
    expect(LEGAL_DISCLAIMER_EN).not.toMatch(cjk);
    expect(turnReplyLanguageLock("en")).not.toMatch(cjk);
    expect(budgetExceededMessage("free", 0.25)).not.toMatch(cjk);
    expect(visionQuotaMessage("free", 3)).not.toMatch(cjk);
    expect(NHTSA_RECALL_EMPTY).not.toMatch(cjk);
    expect(NHTSA_RECALL_UNAVAILABLE).not.toMatch(cjk);
    expect(
      "This vehicle is not in your garage. Refresh and select a saved vehicle.",
    ).not.toMatch(cjk);
  });

  it("picks en/es disclaimer only (Chinese hint → English disclaimer)", () => {
    expect(disclaimerForReplyLanguage("zh")).toBe(LEGAL_DISCLAIMER_EN);
    expect(disclaimerForReplyLanguage("es")).toBe(LEGAL_DISCLAIMER_ES);
    expect(disclaimerForReplyLanguage("en")).toBe(LEGAL_DISCLAIMER_EN);
    expect(ensureLegalDisclaimer("Hello diagnosis.", "zh")).toContain(
      LEGAL_DISCLAIMER_EN.slice(0, 40),
    );
    expect(ensureLegalDisclaimer("Hello diagnosis.", "zh")).not.toContain("概不负责");
    expect(ensureLegalDisclaimer("Hola.", "es")).toContain("no se responsabiliza");
    // Legacy ZH constant remains for offline/corpus, but is not appended on chat path.
    expect(LEGAL_DISCLAIMER_ZH).toMatch(/概不负责/);
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

  it("system prompts require en/es and forbid Chinese characters", () => {
    expect(GARAGE_GENIUS_SYSTEM_PROMPT).toMatch(/Never use Chinese characters/i);
    expect(REPLY_LANGUAGE_PROMPT).toMatch(/Never use Chinese characters/i);
    expect(REPLY_LANGUAGE_PROMPT).toMatch(/English or Spanish/i);
    expect(REPLY_LANGUAGE_PROMPT).not.toMatch(/Chinese question → Chinese answer/i);
    const prompt = buildChatSystemPrompt(vehicle, false);
    expect(prompt.content).toMatch(/Reply language/i);
    expect(prompt.content).toMatch(/never use Chinese characters/i);
    expect(prompt.content).toMatch(/UI language settings do \*\*not\*\* force/i);
  });

  it("still parses focus-data fields (CJK stripped later by reply gate)", () => {
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
  });
});

describe("enforceNoCjkAssistantReply gate", () => {
  it("leaves English DIY oil + parking brake drafts unchanged", () => {
    const draft =
      "DIY oil change on this Camry: set the parking brake, chock the rear wheels, then jack the front and support with stands before you open the drain plug.";
    expect(enforceNoCjkAssistantReply(draft, "en")).toBe(draft);
    expect(countCjkChars(enforceNoCjkAssistantReply(draft, "en"))).toBe(0);
  });

  it("forces CJK count to 0 when a Chinese draft is gated (English session)", () => {
    const draft = `你好！看到你准备给这台 2021 Camry SE 做 DIY 换油，很好。

Set the parking brake before you jack the front. Use rated jack stands on solid ground.

机油规格：用 0W-16，容量约 4.8 夸脱。`;
    expect(containsCjkChars(draft)).toBe(true);
    const gated = enforceNoCjkAssistantReply(draft, "en");
    expect(countCjkChars(gated)).toBe(0);
    expect(containsCjkChars(gated)).toBe(false);
    expect(gated).toMatch(/parking brake|jack stands/i);
    expect(gated).not.toMatch(/你好|机油|夸脱/);
  });

  it("falls back to English when the entire draft is Chinese", () => {
    const gated = enforceNoCjkAssistantReply(
      "请先拉手刹，再用千斤顶顶起车辆前部，并用支架支撑后再放油。",
      "en",
    );
    expect(countCjkChars(gated)).toBe(0);
    expect(gated).toMatch(/English|Spanish/i);
  });

  it("does not leave CJK paragraphs for Spanish sessions either", () => {
    const draft =
      "Revisa el freno de mano. 然后继续换机油并拧紧放油螺丝。";
    const gated = enforceNoCjkAssistantReply(draft, "es");
    expect(countCjkChars(gated)).toBe(0);
    expect(gated).not.toMatch(/换机油|放油/);
  });
});
