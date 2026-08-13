import { describe, expect, it } from "vitest";
import {
  getUnlimitedTokenEmails,
  isLongLivedQaTrialEmail,
  isUnlimitedTokenEmail,
  shouldBypassAiMetering,
} from "@/lib/test-token-bypass";

describe("test-token-bypass", () => {
  it("includes the primary smoke-test email by default", () => {
    expect(isUnlimitedTokenEmail("18565006079@163.com")).toBe(true);
    expect(isUnlimitedTokenEmail("18565006079@163.COM")).toBe(true);
    expect(getUnlimitedTokenEmails().has("18565006079@163.com")).toBe(true);
  });

  it("does not unlock arbitrary accounts", () => {
    expect(isUnlimitedTokenEmail("random@example.com")).toBe(false);
    expect(isUnlimitedTokenEmail(null)).toBe(false);
    expect(isUnlimitedTokenEmail("")).toBe(false);
  });

  it("holds Pro Trial only for the primary QA email", () => {
    expect(isLongLivedQaTrialEmail("18565006079@163.com")).toBe(true);
    expect(isLongLivedQaTrialEmail("18565006079@163.COM")).toBe(true);
    expect(isLongLivedQaTrialEmail("random@example.com")).toBe(false);
  });

  it("bypasses metering for allowlisted JWT email, not for strangers", () => {
    expect(
      shouldBypassAiMetering({ email: "18565006079@163.com" }),
    ).toBe(true);
    expect(shouldBypassAiMetering({ email: "random@example.com" })).toBe(
      false,
    );
    expect(shouldBypassAiMetering({ email: null })).toBe(false);
    expect(
      shouldBypassAiMetering({ email: "random@example.com", qaUnlock: true }),
    ).toBe(true);
  });

  it("merges TEST_UNLIMITED_TOKEN_EMAILS without dropping the default", () => {
    const prev = process.env.TEST_UNLIMITED_TOKEN_EMAILS;
    process.env.TEST_UNLIMITED_TOKEN_EMAILS = "extra@qa.example, Other@QA.example";
    try {
      expect(isUnlimitedTokenEmail("extra@qa.example")).toBe(true);
      expect(isUnlimitedTokenEmail("other@qa.example")).toBe(true);
      expect(isUnlimitedTokenEmail("18565006079@163.com")).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.TEST_UNLIMITED_TOKEN_EMAILS;
      else process.env.TEST_UNLIMITED_TOKEN_EMAILS = prev;
    }
  });
});
