import { describe, expect, it, beforeEach } from "vitest";
import {
  clearWelcomeNoteSeenLocal,
  readWelcomeNoteSeenLocal,
  writeWelcomeNoteSeenLocal,
  welcomeNoteLocalKey,
} from "@/lib/welcome-note";

describe("welcome note local mark", () => {
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

  it("stores per-user seen flag", () => {
    expect(readWelcomeNoteSeenLocal("u1")).toBe(false);
    writeWelcomeNoteSeenLocal("u1");
    expect(readWelcomeNoteSeenLocal("u1")).toBe(true);
    expect(readWelcomeNoteSeenLocal("u2")).toBe(false);
    expect(mem[welcomeNoteLocalKey("u1")]).toBe("1");
    clearWelcomeNoteSeenLocal("u1");
    expect(readWelcomeNoteSeenLocal("u1")).toBe(false);
  });
});
