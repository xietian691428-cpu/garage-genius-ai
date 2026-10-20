import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  OBD_PROTOCOL_CHOICES,
  runObdSelfCheck,
} from "@/lib/obd-self-check";
import { ElmSession } from "@/lib/obd-elm";
import type { ObdTransport } from "@/lib/obd-transport";
import { isGoogleOAuthButtonVisible } from "@/lib/native-apple-auth";

/** Minimal scripted ELM over the ObdTransport pipe (mirrors FakeElm style). */
function scriptedTransport(replies: Record<string, string>): ObdTransport {
  const data = new Set<(c: string) => void>();
  return {
    kind: "mock",
    deviceName: "FakeClassic",
    connected: true,
    async write(text: string) {
      const cmd = text.replace(/\r/g, "").trim().toUpperCase();
      const key =
        Object.keys(replies).find((k) => cmd.startsWith(k)) ?? "DEFAULT";
      const body = replies[key] ?? replies.DEFAULT ?? "OK\r>";
      queueMicrotask(() => {
        for (const l of data) l(body);
      });
    },
    onData(listener) {
      data.add(listener);
      return () => data.delete(listener);
    },
    onDisconnect() {
      return () => undefined;
    },
    disconnect() {},
  };
}

describe("OBD M2 classic helpers", () => {
  it("exposes ATSP choices 0–9 and A–C with auto + CAN presets", () => {
    const ids = OBD_PROTOCOL_CHOICES.map((p) => p.id);
    expect(ids).toContain("0");
    expect(ids).toContain("6");
    expect(ids).toContain("C");
    expect(OBD_PROTOCOL_CHOICES.filter((p) => p.preset).length).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("initialize honors manual ATSP6 before 0100", async () => {
    const sent: string[] = [];
    const base = scriptedTransport({
      ATZ: "ELM327 v1.5\r>",
      ATI: "ELM327 v1.5\r>",
      ATE0: "OK\r>",
      ATL0: "OK\r>",
      ATS1: "OK\r>",
      ATH1: "OK\r>",
      ATAT1: "OK\r>",
      ATSP: "OK\r>",
      ATRV: "12.6V\r>",
      "0100": "41 00 BE 3E A8 13\r>",
      ATDPN: "A6\r>",
      DEFAULT: "OK\r>",
    });
    const transport: ObdTransport = {
      ...base,
      async write(text: string) {
        sent.push(text.replace(/\r/g, "").trim().toUpperCase());
        return base.write(text);
      },
    };
    const session = new ElmSession(transport);
    await session.initialize(undefined, {
      protocol: "6",
      skipSupportedPidWalk: true,
    });
    expect(sent.some((c) => c === "ATSP6")).toBe(true);
    expect(session.info.protocol?.id).toBe("6");
    session.dispose();
  });

  it("self-check produces a shareable report on success", async () => {
    const transport = scriptedTransport({
      ATZ: "ELM327 v2.1\r>",
      ATI: "ELM327 v2.1\r>",
      ATE0: "OK\r>",
      ATL0: "OK\r>",
      ATS1: "OK\r>",
      ATH1: "OK\r>",
      ATAT1: "OK\r>",
      ATSP0: "OK\r>",
      ATRV: "13.1V\r>",
      "0100": "41 00 BE 3E A8 13\r>",
      ATDPN: "A6\r>",
      DEFAULT: "OK\r>",
    });
    const result = await runObdSelfCheck({
      transport,
      platform: "android",
    });
    expect(result.ok).toBe(true);
    expect(result.reportText).toMatch(/Garage Genius OBD self-check/);
    expect(result.reportText).toMatch(/Transport: mock/);
    expect(result.reportText).toMatch(/0100 ECU reply: OK/);
  });

  it("keeps Classic UI gated to Android in the modal source", () => {
    const modal = readFileSync("components/obd/ObdConnectModal.tsx", "utf8");
    expect(modal).toContain("isNativeAndroid()");
    expect(modal).toContain('linkMode === "classic"');
    expect(modal).toContain("modeClassic");
    // iOS must not get a Classic-only forced path
    expect(modal).not.toMatch(/isNativeIos\(\)\s*&&\s*linkMode/);
  });

  it("does not regress Google-on-iOS hide policy (unrelated guard)", () => {
    expect(
      isGoogleOAuthButtonVisible({ googleEnabled: true, nativeIos: true }),
    ).toBe(false);
  });
});
