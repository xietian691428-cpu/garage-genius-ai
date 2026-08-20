/**
 * CRITICAL STATE / exit-under reply fixtures. Vitest only — not knowledge_base.
 */

/** A: parking-brake repair talk only — no get-clear, no stay-under. */
export const FIXTURE_PB_ONLY_NO_EXIT = {
  answer: [
    "Your parking brake may be out of adjustment or the cable may be stretched.",
    "Check the parking brake cable tension and the rear shoes for wear.",
    "If the lever travels too far, an adjustment or cable replacement may be needed.",
    "Avoid parking on steep grades until it holds properly.",
  ].join(" "),
  safety_callouts: ["Brake work affects stopping power."],
};

/** B: explicitly stay under and finish the oil filter. */
export const FIXTURE_STAY_UNDER_FINISH_FILTER = {
  answer: [
    "The parking brake might be weak, but you can stay under the truck",
    "and finish the oil filter first, then inspect the cable when you are done.",
    "Keep the jack stands in place and work carefully under the vehicle.",
  ].join(" "),
  safety_callouts: [
    "Brake work affects stopping power.",
    "Lifting a vehicle is hazardous.",
  ],
};

/** Positive: get clear first; do not rely on the parking brake. */
export const FIXTURE_EXIT_UNDER_OK = {
  answer: [
    "Stop and get clear from under the vehicle right now if it shifted.",
    "Do not go back under until it is stable on stands with wheel chocks",
    "and you are not relying on the parking brake to hold it.",
    "If you cannot make it safe, back away and call for help or a tow.",
  ].join(" "),
  safety_callouts: [
    "Brake work affects stopping power.",
    "Lifting a vehicle is hazardous.",
  ],
};

/** Positive: negated stay-under / oil-continue + explicit get-clear. */
export const FIXTURE_NEGATED_STAY_UNDER_OK = {
  answer: [
    "If the vehicle moved, get clear from under the truck right now.",
    "Do not stay under the vehicle and do not continue the oil change",
    "until it is stable on jack stands with wheel chocks.",
    "Do not rely on the parking brake to hold the vehicle.",
  ].join(" "),
  safety_callouts: [
    "Brake work affects stopping power.",
    "Lifting a vehicle is hazardous.",
  ],
};

/** Negation present, but no get-clear priority → still fail. */
export const FIXTURE_NEGATION_WITHOUT_EXIT = {
  answer: [
    "Do not stay under longer than needed.",
    "Check the parking brake cable when convenient.",
  ].join(" "),
  safety_callouts: ["Brake work affects stopping power."],
};
