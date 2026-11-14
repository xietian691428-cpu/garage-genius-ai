/**
 * Static “Example” proof content for the landing / pricing trust area.
 *
 * Everything here is fictional: no real VIN, name, email, user manual text,
 * or customer data. Figures are placeholders and say so on screen.
 * Never written to a garage profile or Chat history.
 */

export const EXAMPLE_BADGE = "Example";
export const EXAMPLE_FICTIONAL_NOTE =
  "Fictional example — your car's numbers come only from your own confirmed manual.";

/** Must match garageFluidCiteLabel("user_manual_confirmed") in the app. */
export const EXAMPLE_CITE_MANUAL =
  "Garage profile (from your manual) / Your confirmed manual spec";
export const EXAMPLE_NOT_OEM = "Not OEM-certified by Garage Genius";

export const EXAMPLE_VEHICLE = "2020 Honda Civic";

export const SOURCED_ANSWER_EXAMPLE = {
  label: "Example — sourced answer",
  vehicle: EXAMPLE_VEHICLE,
  question:
    "Temp gauge crept up in traffic and the coolant looked low. What should I check?",
  steps: [
    "If the gauge is climbing, pull over safely and switch the engine off. Never open a hot radiator or reservoir cap.",
    "Once the engine is fully cold, compare the reservoir level with the MIN/MAX marks.",
    "Look for drips or dried residue around hoses and the cap.",
    "If you top up, use only the coolant type saved in your garage profile.",
  ],
  specLine: "Coolant spec: 50/50 ethylene glycol premix",
  sourceLabel: EXAMPLE_CITE_MANUAL,
  verifyLine: "Verify on the reservoir cap label.",
  stopLine:
    "Stop if the gauge climbs again or you see steam or a sweet smell — don't keep driving; a shop can pressure-test the system.",
} as const;

export const MANUAL_CITATION_EXAMPLE = {
  vehicle: EXAMPLE_VEHICLE,
  question: "How much oil does my Civic take?",
  before: {
    title: "Before you confirm a manual",
    answer:
      "I don't have a confirmed oil capacity for your car yet, so I won't guess a number. Check the owner's manual or the fill-cap label, or upload your manual and confirm the figure to save it to your garage. In the meantime: engine off, level ground, and read the dipstick.",
    sourceLabel: "No confirmed spec on file",
  },
  after: {
    title: "After you confirm it",
    answer:
      "Per your garage profile: 4.8 qt with filter · 0W-16. Still verify on the under-hood fill cap or label before you pour.",
    figures: "4.8 qt · 0W-16",
    sourceLabel: EXAMPLE_CITE_MANUAL,
  },
} as const;

export const SHOP_HANDOFF_EXAMPLE = {
  label: "Example — sample shop handoff",
  reportId: "EXAMPLE",
  vehicleLine: `${EXAMPLE_VEHICLE} · 41,000 mi`,
  symptoms:
    "Temperature gauge climbed on a hot day in stop-and-go traffic. Coolant reservoir looked low once the engine was cold.",
  checks: [
    "Waited for a fully cold engine before opening anything",
    "Read reservoir level against MIN/MAX when cold",
    "Looked under the car and around hoses — no drips seen",
  ],
  factors: [
    {
      title: "Slow external coolant loss (hose, clamp, or cap)",
      howToVerify: "Cooling-system pressure test",
    },
    {
      title: "Cooling fan not engaging at the right time",
      howToVerify: "Observe fan operation and scan data with the engine warm",
    },
  ],
  nextSteps: [
    "Pressure-test the cooling system and inspect hoses and cap",
    "Confirm fan operation and read any stored codes",
  ],
  footer:
    "Educational summary to help you talk with a qualified technician — not a diagnosis or repair recommendation.",
} as const;

/** All user-visible example strings, for tests. */
export function proofExampleText(): string {
  return [
    SOURCED_ANSWER_EXAMPLE.label,
    SOURCED_ANSWER_EXAMPLE.question,
    ...SOURCED_ANSWER_EXAMPLE.steps,
    SOURCED_ANSWER_EXAMPLE.specLine,
    SOURCED_ANSWER_EXAMPLE.sourceLabel,
    SOURCED_ANSWER_EXAMPLE.verifyLine,
    SOURCED_ANSWER_EXAMPLE.stopLine,
    MANUAL_CITATION_EXAMPLE.question,
    MANUAL_CITATION_EXAMPLE.before.answer,
    MANUAL_CITATION_EXAMPLE.before.sourceLabel,
    MANUAL_CITATION_EXAMPLE.after.answer,
    MANUAL_CITATION_EXAMPLE.after.sourceLabel,
    SHOP_HANDOFF_EXAMPLE.label,
    SHOP_HANDOFF_EXAMPLE.symptoms,
    ...SHOP_HANDOFF_EXAMPLE.checks,
    ...SHOP_HANDOFF_EXAMPLE.factors.flatMap((f) => [f.title, f.howToVerify]),
    ...SHOP_HANDOFF_EXAMPLE.nextSteps,
    SHOP_HANDOFF_EXAMPLE.footer,
    EXAMPLE_FICTIONAL_NOTE,
    EXAMPLE_NOT_OEM,
  ].join("\n");
}
