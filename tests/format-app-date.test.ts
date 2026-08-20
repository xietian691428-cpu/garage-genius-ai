import { describe, expect, it } from "vitest";
import {
  appDateLocale,
  formatAppDate,
  formatAppDateOnly,
  formatAppNumber,
  formatAppTime,
} from "@/lib/format-app-date";

describe("format-app-date", () => {
  it("maps language to product locales", () => {
    expect(appDateLocale("en-US")).toBe("en-US");
    expect(appDateLocale("es")).toBe("es");
    expect(appDateLocale("es-MX")).toBe("es");
    expect(appDateLocale("zh-CN")).toBe("en-US");
    expect(appDateLocale(undefined)).toBe("en-US");
  });

  it("formats calendar dates the US/EU way, not ISO or zh-CN", () => {
    expect(formatAppDateOnly("2026-08-18", "en-US")).toBe("Aug 18, 2026");
    expect(formatAppDateOnly("2026-08-18", "es")).toMatch(/18/);
    expect(formatAppDateOnly("2026-08-18", "zh-CN")).toBe("Aug 18, 2026");
  });

  it("formats Date objects in en-US", () => {
    const d = new Date(2026, 7, 19);
    expect(formatAppDate(d, "en-US")).toBe("Aug 19, 2026");
  });

  it("formats 12-hour time in en-US", () => {
    const d = new Date(2026, 7, 19, 15, 4);
    expect(formatAppTime(d, "en-US")).toMatch(/3:04/);
    expect(formatAppTime(d, "en-US")).toMatch(/PM/i);
  });

  it("groups thousands with commas in en-US", () => {
    expect(formatAppNumber(28100, "en-US")).toBe("28,100");
  });
});
