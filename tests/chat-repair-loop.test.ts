import { describe, expect, it } from "vitest";
import { CHAT_API_MESSAGE_WINDOW } from "@/lib/chat-repair-loop";
import { usTop10CoreUserQuestionFailures } from "@/lib/pilot/hard-validate-seed-answer";

describe("chat repair loop", () => {
  it("keeps a bounded API history window", () => {
    expect(CHAT_API_MESSAGE_WINDOW).toBeGreaterThan(0);
  });
});

describe("US top-10 safety seed CI gate", () => {
  it("user-question matchers still pass on the 10 core seeds", () => {
    expect(usTop10CoreUserQuestionFailures()).toEqual([]);
  });
});
