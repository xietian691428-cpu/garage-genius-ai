import { afterEach, describe, expect, it, vi } from "vitest";
import { logManualObserve } from "@/lib/manual-observe";

describe("logManualObserve", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs a compact [manual-observe] line without path/content keys", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    logManualObserve(
      "process_ready",
      {
        chunkCount: 12,
        storagePath: "/secret/path.pdf",
        content: "should never appear",
        ymmMatch: "match",
      },
      { userId: "user-abc" },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const [tag, payload] = spy.mock.calls[0]!;
    expect(tag).toBe("[manual-observe]");
    expect(payload).toMatchObject({
      event: "process_ready",
      chunkCount: 12,
      ymmMatch: "match",
    });
    expect(payload).not.toHaveProperty("storagePath");
    expect(payload).not.toHaveProperty("content");
    expect(payload).toHaveProperty("userHash");
  });
});
