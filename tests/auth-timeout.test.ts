import { describe, expect, it, vi } from "vitest";
import {
  TimeoutError,
  withTimeout,
} from "@/lib/auth-timeout";

describe("auth timeout helper", () => {
  it("resolves when promise finishes first", async () => {
    await expect(withTimeout(Promise.resolve(42), 200)).resolves.toBe(42);
  });

  it("rejects with TimeoutError when slow", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(
      new Promise((r) => setTimeout(() => r("late"), 5_000)),
      100,
      "too slow",
    );
    const assertion = expect(pending).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(150);
    await assertion;
    vi.useRealTimers();
  });
});
