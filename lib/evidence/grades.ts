/**
 * Evidence grades for Chat — never promote UNVERIFIED to fact.
 */

export type EvidenceGrade =
  | "OBSERVED"
  | "REPORTED"
  | "INFERRED"
  | "UNVERIFIED";

export type EvidenceItem = {
  grade: EvidenceGrade;
  text: string;
};

export const EVIDENCE_GRADE_HELP: Record<EvidenceGrade, string> = {
  OBSERVED:
    "Owner-stated clearly, OBD snapshot, confirmed lighting housing, or local [DTC_REF] — treat as known for this turn.",
  REPORTED:
    "Owner estimate/hearsay (“I think after the car wash”) — label as reported, not proven.",
  INFERRED:
    "Common-pattern possibilities — must use possible/likely language; never a root-cause verdict.",
  UNVERIFIED:
    "No anchor (bulb size, OEM part #, unconfirmed housing) — do not state as fact.",
};

export function formatEvidenceBlock(items: EvidenceItem[]): string | null {
  if (!items.length) return null;
  const by = (g: EvidenceGrade) =>
    items.filter((i) => i.grade === g).map((i) => `- ${i.text}`);
  const sections: string[] = [
    "[EVIDENCE]",
    "Reply preference: (1) What we know OBSERVED (2) What we still need (3) Likely directions INFERRED — non-root-cause (4) Next safest checks (5) Stop / see a pro when [STOP_RULE] hits.",
    `Grade meanings: OBSERVED=${EVIDENCE_GRADE_HELP.OBSERVED} REPORTED=${EVIDENCE_GRADE_HELP.REPORTED} INFERRED=${EVIDENCE_GRADE_HELP.INFERRED} UNVERIFIED=${EVIDENCE_GRADE_HELP.UNVERIFIED}`,
  ];
  for (const g of [
    "OBSERVED",
    "REPORTED",
    "INFERRED",
    "UNVERIFIED",
  ] as EvidenceGrade[]) {
    const lines = by(g);
    if (lines.length) sections.push(`${g}:\n${lines.join("\n")}`);
  }
  return sections.join("\n");
}
