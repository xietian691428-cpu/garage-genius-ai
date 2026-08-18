import { describe, expect, it, beforeEach } from "vitest";
import {
  CHAT_DISCLAIMER_REPROMPT_ASSISTANT_COUNT,
  CHAT_DISCLAIMER_REPROMPT_DAYS,
  chatDisclaimerLocalKey,
  readChatDisclaimerLocal,
  shouldShowChatDisclaimerBanner,
  writeChatDisclaimerLocal,
} from "@/lib/chat-disclaimer";

describe("chat disclaimer cadence", () => {
  const mem: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(mem)) delete mem[k];
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => mem[k] ?? null,
        setItem: (k: string, v: string) => {
          mem[k] = v;
        },
        removeItem: (k: string) => {
          delete mem[k];
        },
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis,
    });
  });

  it("shows first-time banner when never acknowledged", () => {
    expect(
      shouldShowChatDisclaimerBanner({
        ackAt: null,
        assistantCountAtAck: 0,
        assistantCountNow: 0,
      }),
    ).toEqual({ show: true, mode: "first" });
  });

  it("hides banner shortly after ack", () => {
    expect(
      shouldShowChatDisclaimerBanner({
        ackAt: new Date().toISOString(),
        assistantCountAtAck: 2,
        assistantCountNow: 5,
      }),
    ).toEqual({ show: false, mode: "first" });
  });

  it("re-prompts after N assistant replies since ack", () => {
    expect(
      shouldShowChatDisclaimerBanner({
        ackAt: new Date().toISOString(),
        assistantCountAtAck: 1,
        assistantCountNow: 1 + CHAT_DISCLAIMER_REPROMPT_ASSISTANT_COUNT,
      }),
    ).toEqual({ show: true, mode: "interval" });
  });

  it("re-prompts after 30 days", () => {
    const now = new Date("2026-08-17T12:00:00.000Z");
    const ack = new Date(now);
    ack.setUTCDate(ack.getUTCDate() - CHAT_DISCLAIMER_REPROMPT_DAYS);
    expect(
      shouldShowChatDisclaimerBanner({
        ackAt: ack.toISOString(),
        assistantCountAtAck: 10,
        assistantCountNow: 12,
        now,
      }),
    ).toEqual({ show: true, mode: "interval" });
  });

  it("persists per-user local ack state", () => {
    writeChatDisclaimerLocal("u1", {
      ackAt: "2026-01-01T00:00:00.000Z",
      assistantCountAtAck: 3,
    });
    expect(readChatDisclaimerLocal("u1")).toEqual({
      ackAt: "2026-01-01T00:00:00.000Z",
      assistantCountAtAck: 3,
    });
    expect(readChatDisclaimerLocal("u2").ackAt).toBeNull();
    expect(mem[chatDisclaimerLocalKey("u1")]).toContain("assistantCountAtAck");
  });
});
