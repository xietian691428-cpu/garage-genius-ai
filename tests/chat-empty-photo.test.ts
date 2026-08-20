import { describe, expect, it } from "vitest";
import {
  isPhotoPromptWithoutImages,
  DEFAULT_PHOTO_PROMPT,
} from "@/lib/chat-empty-photo";
import { appTabHref, parseAppTab } from "@/lib/app-tab";
import { replyEncouragesStayUnder } from "@/lib/pilot/safety-observe-phrases";

describe("isPhotoPromptWithoutImages", () => {
  it("blocks the default photo prompt when no image is attached", () => {
    expect(isPhotoPromptWithoutImages(DEFAULT_PHOTO_PROMPT, [])).toBe(true);
    expect(isPhotoPromptWithoutImages(DEFAULT_PHOTO_PROMPT, undefined)).toBe(
      true,
    );
  });

  it("allows the same prompt when a photo is attached", () => {
    expect(
      isPhotoPromptWithoutImages(DEFAULT_PHOTO_PROMPT, ["data:image/jpeg;base64,xx"]),
    ).toBe(false);
  });

  it("does not treat a normal DIY question as an empty photo prompt", () => {
    expect(
      isPhotoPromptWithoutImages("What oil should I use on the Camry?"),
    ).toBe(false);
  });
});

describe("appTabHref / parseAppTab", () => {
  it("round-trips coach as the URL source of truth", () => {
    expect(parseAppTab("coach")).toBe("coach");
    expect(appTabHref("coach")).toBe("/app?tab=coach");
    expect(appTabHref("dashboard")).toBe("/app");
  });

  it("keeps other query params when switching tabs", () => {
    expect(appTabHref("chat", "foo=1")).toBe("/app?foo=1&tab=chat");
    expect(appTabHref("dashboard", "tab=coach&foo=1")).toBe("/app?foo=1");
  });
});

describe("replyEncouragesStayUnder negation window", () => {
  it("ignores Do not stay under / Do not continue the oil", () => {
    expect(
      replyEncouragesStayUnder(
        "Get clear from under the truck. Do not stay under the vehicle and do not continue the oil change.",
      ),
    ).toBe(false);
  });

  it("still flags unnegated stay under", () => {
    expect(
      replyEncouragesStayUnder(
        "You can stay under the truck and finish the oil filter.",
      ),
    ).toBe(true);
  });
});
