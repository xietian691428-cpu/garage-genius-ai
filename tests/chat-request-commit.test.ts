import { describe, expect, it } from "vitest";
import {
  isContextSwitchAbort,
  shouldCommitChatResponse,
} from "@/lib/chat-request-commit";

describe("shouldCommitChatResponse (in-flight abort / late 200)", () => {
  it("discards when epoch bumped (New topic / 切车 / Topics)", () => {
    expect(
      shouldCommitChatResponse({
        requestEpoch: 3,
        currentEpoch: 4,
        abortReason: "context_switch",
        requestVehicleId: "camry",
        activeVehicleId: "camry",
        requestThreadId: "thread-oil",
        activeThreadId: "thread-beam",
      }),
    ).toBe(false);
  });

  it("discards context_switch even if epoch somehow matches", () => {
    expect(
      shouldCommitChatResponse({
        requestEpoch: 1,
        currentEpoch: 1,
        abortReason: "context_switch",
      }),
    ).toBe(false);
    expect(isContextSwitchAbort("vehicle_switch")).toBe(true);
  });

  it("discards same-vehicle thread switch when both thread ids known", () => {
    expect(
      shouldCommitChatResponse({
        requestEpoch: 2,
        currentEpoch: 2,
        abortReason: "none",
        requestVehicleId: "camry",
        activeVehicleId: "camry",
        requestThreadId: "thread-a",
        activeThreadId: "thread-b",
      }),
    ).toBe(false);
  });

  it("discards cross-vehicle late resolve", () => {
    expect(
      shouldCommitChatResponse({
        requestEpoch: 1,
        currentEpoch: 1,
        abortReason: "none",
        requestVehicleId: "camry",
        activeVehicleId: "f150",
        requestThreadId: "t1",
        activeThreadId: "t1",
      }),
    ).toBe(false);
  });

  it("commits when vehicle + thread + epoch still match", () => {
    expect(
      shouldCommitChatResponse({
        requestEpoch: 5,
        currentEpoch: 5,
        abortReason: "none",
        requestVehicleId: "camry",
        activeVehicleId: "camry",
        requestThreadId: "thread-oil",
        activeThreadId: "thread-oil",
      }),
    ).toBe(true);
  });
});
