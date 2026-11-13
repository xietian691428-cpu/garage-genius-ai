import { describe, expect, it } from "vitest";
import {
  rewriteDiagnosticQuery,
  rerankDiyCheckPaths,
  rerankManualHitsForIntent,
  intentHintFromRewrite,
} from "@/lib/diagnostic-query-rewrite";
import { matchDiyCheckPath } from "@/lib/diy-check-paths";
import {
  buildManualRetrievalQuery,
  classifyManualIntent,
} from "@/lib/vehicle-manual-intent";
import { DIY_CHECK_PATHS } from "@/lib/diy-check-paths";

describe("diagnostic query rewrite", () => {
  it("normalizes mushy brakes → soft_brake family + match tokens", () => {
    const r = rewriteDiagnosticQuery("brakes feel mushy when I press them");
    expect(r.rewritten).toBe(true);
    expect(r.families).toContain("soft_brake");
    expect(r.matchText).toMatch(/soft brake pedal/i);
    expect(intentHintFromRewrite(r)).toBe("brake_warning");
  });

  it("normalizes car shaking → misfire tokens", () => {
    const r = rewriteDiagnosticQuery("car is shaking a lot at idle");
    expect(r.families).toContain("misfire");
    expect(r.matchText).toMatch(/engine shaking hard|misfire/i);
  });

  it("normalizes AC-on heat → overheat tokens", () => {
    const r = rewriteDiagnosticQuery(
      "AC on and the car gets too hot on the highway",
    );
    expect(r.families).toContain("overheat");
    expect(r.matchText).toMatch(/overheating|running hot/i);
  });

  it("normalizes just clicking → hard_start", () => {
    const r = rewriteDiagnosticQuery("just clicks when I try to start");
    expect(r.families).toContain("hard_start");
    expect(r.matchText).toMatch(/no crank|won't start/i);
  });

  it("no-op on empty / unrelated text", () => {
    expect(rewriteDiagnosticQuery("").rewritten).toBe(false);
    expect(rewriteDiagnosticQuery("where is the cup holder?").rewritten).toBe(
      false,
    );
  });
});

describe("fuzzy asks hit DIY paths via rewrite", () => {
  it.each([
    ["brakes feel mushy when I press them", "soft_brake"],
    ["car is shaking a lot at idle", "misfire_random"],
    ["AC on and the car gets too hot", "overheat_steam"],
    ["just clicks when I try to start", "hard_start"],
  ] as const)("%s → %s", (q, id) => {
    expect(matchDiyCheckPath(q)?.id).toBe(id);
  });
});

describe("DIY re-rank prefers safety path", () => {
  it("soft_brake beats brake_pads when both match", () => {
    const soft = DIY_CHECK_PATHS.find((p) => p.id === "soft_brake")!;
    const pads = DIY_CHECK_PATHS.find((p) => p.id === "brake_pads")!;
    const rewrite = rewriteDiagnosticQuery("soft mushy brakes");
    const winner = rerankDiyCheckPaths([pads, soft], rewrite);
    expect(winner?.id).toBe("soft_brake");
  });
});

describe("manual intent + retrieval query use rewrite", () => {
  it("mushy brakes → brake_warning intent", () => {
    expect(classifyManualIntent("brakes feel mushy")).toBe("brake_warning");
    const q = buildManualRetrievalQuery({
      userText: "brakes feel mushy when I press them",
    });
    expect(q.intent).toBe("brake_warning");
    expect(q.query).toMatch(/do not drive|soft|DOT|brake/i);
  });

  it("car shaking → dtc_related with misfire expand terms", () => {
    const q = buildManualRetrievalQuery({
      userText: "car is shaking a lot at idle",
    });
    expect(q.intent).toBe("dtc_related");
    expect(q.query).toMatch(/misfire|shak|check engine/i);
  });

  it("intent re-rank boosts coolant safety heading for overheat", () => {
    const ranked = rerankManualHitsForIntent(
      [
        { heading: "Warranty", content: "warranty terms", rank: 2 },
        {
          heading: "Coolant",
          content: "Do not open when hot. Reservoir level.",
          rank: 1,
        },
      ],
      { intent: "overheat", limit: 2 },
    );
    expect(ranked[0]?.heading).toMatch(/Coolant/i);
  });
});
