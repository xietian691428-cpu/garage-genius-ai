import { describe, expect, it } from "vitest";
import {
  getUnlimitedTokenEmails,
  isLongLivedQaTrialEmail,
  isUnlimitedTokenEmail,
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
});
