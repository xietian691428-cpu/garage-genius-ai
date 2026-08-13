import { describe, expect, it } from "vitest";
import { resolveLoadedChat } from "@/lib/chat-cloud";
import type { ChatMessage } from "@/lib/types/chat";
import {
  createEmptyVitals,
  shouldKeepLocalVitals,
  vitalsHasUserContent,
} from "@/lib/vehicle-vitals";

function msg(id: string, content = "hi"): ChatMessage {
  return {
    id,
    role: id === "welcome" ? "assistant" : "user",
    content,
    timestamp: new Date("2026-01-01T00:00:00Z"),
  };
}

const welcome = msg("welcome", "Hello");

describe("chat load vs OS/WebView wipe", () => {
  it("uses cloud history when the server returns turns", () => {
    const cloud = [welcome, msg("u1")];
    const resolved = resolveLoadedChat({
      cloud,
      local: [msg("stale")],
      cloudFailed: false,
      welcome,
    });
    expect(resolved.source).toBe("cloud");
    expect(resolved.skipPersist).toBe(true);
    expect(resolved.messages).toBe(cloud);
  });

  it("falls back to local cache when cloud fetch fails", () => {
    const local = [welcome, msg("u1", "P0171")];
    const resolved = resolveLoadedChat({
      cloud: null,
      local,
      cloudFailed: true,
      welcome,
    });
    expect(resolved.source).toBe("local");
    expect(resolved.skipPersist).toBe(false);
    expect(resolved.messages).toBe(local);
  });

  it("uploads unsynced local turns when cloud is empty but reachable", () => {
    const local = [msg("u1")];
    const resolved = resolveLoadedChat({
      cloud: null,
      local,
      cloudFailed: false,
      welcome,
    });
    expect(resolved.source).toBe("local");
    expect(resolved.skipPersist).toBe(false);
  });

  it("does not treat a welcome-only blob as user history", () => {
    const resolved = resolveLoadedChat({
      cloud: null,
      local: [welcome],
      cloudFailed: true,
      welcome,
    });
    expect(resolved.source).toBe("welcome");
    expect(resolved.skipPersist).toBe(true);
  });
});

describe("vitals local vs cloud after WebView wipe", () => {
  it("ignores a blank local template even if updatedAt is newer", () => {
    const empty = createEmptyVitals("veh-1");
    expect(vitalsHasUserContent(empty)).toBe(false);
    expect(
      shouldKeepLocalVitals(empty, "2020-01-01T00:00:00.000Z"),
    ).toBe(false);
  });

  it("keeps unsynced local fluid edits that are newer than cloud", () => {
    const local = {
      ...createEmptyVitals("veh-1"),
      updatedAt: "2026-08-13T12:00:00.000Z",
      fluids: createEmptyVitals("veh-1").fluids.map((f) =>
        f.key === "engineOil"
          ? { ...f, value: "Low", level: "low" as const }
          : f,
      ),
    };
    expect(vitalsHasUserContent(local)).toBe(true);
    expect(
      shouldKeepLocalVitals(local, "2026-08-13T11:00:00.000Z"),
    ).toBe(true);
    expect(
      shouldKeepLocalVitals(local, "2026-08-13T13:00:00.000Z"),
    ).toBe(false);
  });
});
