import { describe, expect, it } from "vitest";
import {
  fillGateTemplate,
  gateCopy,
  resolveGateLanguage,
  uiLocaleToGateHint,
} from "@/lib/gate-copy";

describe("gate-copy follows question language", () => {
  it("maps UI locales", () => {
    expect(uiLocaleToGateHint("es")).toBe("es");
    expect(uiLocaleToGateHint("en-US")).toBe("en");
    expect(uiLocaleToGateHint("zh-CN")).toBe("zh");
  });

  it("prefers Chinese question over English UI", () => {
    expect(resolveGateLanguage("汉兰达空调不出风", "en-US")).toBe("zh");
    expect(gateCopy("zh", "gateNotInGarageLimit", { mention: "Highlander", count: 5 })).toMatch(
      /汉兰达|Highlander|升级/,
    );
    expect(gateCopy("zh", "switchConfirmYes")).toBe("切换并提问");
  });

  it("keeps English question English even when UI is Spanish", () => {
    expect(resolveGateLanguage("Highlander AC has no airflow", "es")).toBe(
      "en",
    );
    expect(gateCopy("en", "gateUpgrade")).toMatch(/Upgrade/i);
  });

  it("detects Spanish questions", () => {
    expect(
      resolveGateLanguage("¿Cómo reviso los frenos de mi coche?", "en-US"),
    ).toBe("es");
    expect(gateCopy("es", "switchConfirmYes")).toMatch(/Cambiar/i);
  });

  it("falls back to UI language when question is empty", () => {
    expect(resolveGateLanguage("", "es")).toBe("es");
    expect(resolveGateLanguage("   ", "en-US")).toBe("en");
  });

  it("interpolates templates", () => {
    expect(
      fillGateTemplate("Hello {{mention}} x{{count}}", {
        mention: "Camry",
        count: 2,
      }),
    ).toBe("Hello Camry x2");
  });
});
