import { describe, expect, it } from "vitest";
import {
  applyDiagnosticToneGuards,
  diagnosticToneFailures,
} from "@/lib/diagnostic-tone";

describe("diagnostic tone (separate from safety callouts)", () => {
  it("flags root-cause assertion phrases", () => {
    expect(diagnosticToneFailures("Replace it now and drive.")).toContain(
      "diagnostic_tone:replace_x_now",
    );
    expect(diagnosticToneFailures("It's definitely the catalytic converter.")).toEqual(
      expect.arrayContaining([
        "diagnostic_tone:its_definitely",
        "diagnostic_tone:definitely_the",
      ]),
    );
    expect(diagnosticToneFailures("Must be the O2 sensor.")).toContain(
      "diagnostic_tone:must_be_the",
    );
    expect(diagnosticToneFailures("Replace the converter and you are done.")).toContain(
      "diagnostic_tone:replace_the_converter",
    );
  });

  it("does not flag educational negation", () => {
    expect(
      diagnosticToneFailures(
        "Do not replace the converter from this code alone. Record P0420 and inspect exhaust leaks.",
      ),
    ).toEqual([]);
  });

  it("rewrites P0420-style root-cause orders without leftover Replace-now wording", () => {
    const out = applyDiagnosticToneGuards(
      "P0420: Replace the converter. It's definitely the cat. Must be the downstream O2.",
    );
    expect(out.toLowerCase()).not.toMatch(/replace the converter/);
    expect(out.toLowerCase()).not.toMatch(/it's definitely/);
    expect(out.toLowerCase()).not.toMatch(/must be the/);
    expect(diagnosticToneFailures(out)).toEqual([]);
  });

  it("rewrites Replace the X now", () => {
    const out = applyDiagnosticToneGuards("Replace the sensor now.");
    expect(out.toLowerCase()).not.toMatch(/replace the sensor now/);
    expect(diagnosticToneFailures("Replace the sensor now.")).toContain(
      "diagnostic_tone:replace_the_x_now",
    );
    expect(diagnosticToneFailures(out)).toEqual([]);
  });
});
