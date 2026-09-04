import { describe, expect, it } from "vitest";
import {
  isProtectedSystemMessage,
  trimDeepSeekConversation,
  type DeepSeekMessage,
} from "@/lib/deepseek";
import { CRITICAL_RAISED_STATE_PROMPT } from "@/lib/chat-intent-drift";

describe("trimDeepSeekConversation keeps CRITICAL state", () => {
  it("never drops or truncates CRITICAL STATE / vehicleRaised system lines", () => {
    const critical: DeepSeekMessage = {
      role: "system",
      content: `${CRITICAL_RAISED_STATE_PROMPT}\nvehicleRaised=true parkingBrakeState=not_holding`,
    };
    expect(isProtectedSystemMessage(critical)).toBe(true);

    const history: DeepSeekMessage[] = [
      { role: "system", content: "You are a coach." },
      critical,
      ...Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as const,
        content: `filler turn ${i} ${"x".repeat(200)}`,
      })),
      { role: "user", content: "What oil filter?" },
    ];

    const trimmed = trimDeepSeekConversation(history, {
      windowSize: 2,
      maxContentChars: 40,
    });
    const systemText = trimmed
      .filter((m) => m.role === "system")
      .map((m) => String(m.content))
      .join("\n");
    expect(systemText).toMatch(/CRITICAL STATE/);
    expect(systemText).toMatch(/vehicleRaised=true/);
    expect(systemText).toMatch(/parkingBrakeState=not_holding/);
    expect(trimmed.filter((m) => m.role !== "system")).toHaveLength(2);
  });
});
