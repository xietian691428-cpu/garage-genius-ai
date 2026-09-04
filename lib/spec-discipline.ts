/**
 * Hard spec patterns for Chat when no garage/EPA/affiliate fluid-torque-part
 * anchor is in context. Vitest fixtures + production post-check rewrite.
 * Does not scrape OEM portals.
 *
 * FREEZE: changing invented-spec regexes or applySpecOutputGate behavior
 * requires updating tests/spec-discipline.test.ts and tests/README.md (S4).
 */

export const INVENTED_QT_RE = /\b\d+(?:\.\d+)?\s*(?:qts?|quarts?)\b/gi;

export const INVENTED_FTLB_RE =
  /\b\d+(?:\.\d+)?\s*(?:ft-?lbs?|foot[-\s]?pounds?)\b/gi;

export const INVENTED_NM_RE =
  /\b\d+(?:\.\d+)?\s*(?:n[·.\s-]*m|newton[-\s]?metres?)\b/gi;

/** "4.5 liters" — not bare "2.5L" engine displacement. */
export const INVENTED_LITER_RE = /\b\d+(?:\.\d+)?\s*(?:liters?|litres)\b/gi;

/** 0W-16 as “this vehicle must use” — quoting a garage grade without “required” is ok. */
export const INVENTED_VISC_REQUIRED_RE =
  /\b\d+\s*w\s*-?\s*\d+\s+(?:required|only)\b|\b(?:must use|required viscosity(?:\s+is)?|only use)\s+\d+\s*w\s*-?\s*\d+\b/gi;

/** Toyota-style OEM tokens (15400-PLM-A02). Skip VIN / campaign-looking blobs in rewrite. */
export const INVENTED_OEM_RE =
  /\b\d{4,5}-[A-Z0-9]{3,}(?:-[A-Z0-9]{2,})?\b/g;

export const SPEC_MANUAL_REWRITE =
  "the figure in the owner's manual, fill cap, under-hood label, or door sticker";

export const SPEC_TORQUE_REWRITE =
  "the torque spec in the owner's manual (do not guess ft-lb or N·m)";

export const SPEC_OEM_REWRITE =
  "an OEM number verified with your VIN / dealer EPC";

export type SpecAnchorContext = {
  oilCapacity?: string | null;
  oilViscosity?: string | null;
  /** Explicit torque anchors only — oil capacity must never unlock ft-lb / N·m. */
  torqueSpec?: string | null;
  oemNumbers?: Array<string | null | undefined>;
};

/** Fluid / viscosity / OEM allowlist (not torque). */
export function specFluidAllowlistBlob(ctx?: SpecAnchorContext | null): string {
  if (!ctx) return "";
  const oems = (ctx.oemNumbers ?? []).map((n) => String(n || "").trim());
  return [ctx.oilCapacity, ctx.oilViscosity, ...oems]
    .filter((s) => s && String(s).trim())
    .join("\n")
    .toLowerCase();
}

/** Torque-only allowlist — empty unless garage/anchors store a torque figure. */
export function specTorqueAllowlistBlob(ctx?: SpecAnchorContext | null): string {
  if (!ctx?.torqueSpec?.trim()) return "";
  return ctx.torqueSpec.trim().toLowerCase();
}

/** @deprecated Prefer specFluidAllowlistBlob — kept for call-site compatibility. */
export function specAllowlistBlob(ctx?: SpecAnchorContext | null): string {
  return specFluidAllowlistBlob(ctx);
}

/**
 * Exact token match (case-insensitive). Avoids "4.8 qt…" substring-allowing "8 qt".
 */
function spanAllowed(span: string, allowLower: string): boolean {
  const token = span.trim().toLowerCase().replace(/\s+/g, " ");
  if (!token || !allowLower) return false;
  const parts = allowLower
    .split(/\n+/)
    .map((p) => p.trim().replace(/\s+/g, " "))
    .filter(Boolean);
  if (parts.some((p) => p === token)) return true;
  // Also allow when the allowlist line contains the figure as a whole word-ish unit.
  for (const p of parts) {
    if (p === token) return true;
    // "4.8 qt with filter" may list "4.8 qt" — require token to appear bounded.
    const re = new RegExp(
      `(?:^|[^a-z0-9.])${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9.]|$)`,
      "i",
    );
    if (re.test(p)) return true;
  }
  return false;
}

function collectMatches(re: RegExp, text: string): string[] {
  const out: string[] = [];
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(copy)) {
    if (m[0]) out.push(m[0]);
  }
  return out;
}

export function inventedSpecFailures(
  text: string,
  ctx?: SpecAnchorContext | null,
): string[] {
  const errors: string[] = [];
  const sample = text || "";
  const fluidAllow = specFluidAllowlistBlob(ctx);
  const torqueAllow = specTorqueAllowlistBlob(ctx);

  const pushIfUnallowed = (
    re: RegExp,
    code: string,
    allowLower: string,
    alwaysReject?: boolean,
  ) => {
    for (const span of collectMatches(re, sample)) {
      if (alwaysReject || !spanAllowed(span, allowLower)) {
        errors.push(code);
        return;
      }
    }
  };

  pushIfUnallowed(INVENTED_QT_RE, "invented_spec:qt", fluidAllow);
  pushIfUnallowed(INVENTED_LITER_RE, "invented_spec:liter", fluidAllow);
  // Torque never inherits oil capacity / viscosity allowlist.
  pushIfUnallowed(INVENTED_FTLB_RE, "invented_spec:ft-lb", torqueAllow);
  pushIfUnallowed(INVENTED_NM_RE, "invented_spec:n-m", torqueAllow);
  pushIfUnallowed(
    INVENTED_VISC_REQUIRED_RE,
    "invented_spec:visc_required",
    fluidAllow,
    true,
  );

  for (const span of collectMatches(INVENTED_OEM_RE, sample)) {
    if (!spanAllowed(span, fluidAllow)) {
      errors.push("invented_spec:oem");
      break;
    }
  }

  return errors;
}

export function answerHasInventedCapacityOrTorque(
  text: string,
  ctx?: SpecAnchorContext | null,
): boolean {
  return inventedSpecFailures(text, ctx).length > 0;
}

function splitPartsData(text: string): Array<{ kind: "prose" | "parts"; value: string }> {
  const chunks: Array<{ kind: "prose" | "parts"; value: string }> = [];
  const re = /<parts-data>[\s\S]*?<\/parts-data>/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) {
      chunks.push({ kind: "prose", value: text.slice(last, start) });
    }
    chunks.push({ kind: "parts", value: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) chunks.push({ kind: "prose", value: text.slice(last) });
  return chunks;
}

function replaceUnallowed(
  prose: string,
  re: RegExp,
  replacement: string,
  allowLower: string,
  always?: boolean,
): string {
  const copy = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  return prose.replace(copy, (span) => {
    if (!always && spanAllowed(span, allowLower)) return span;
    return replacement;
  });
}

/**
 * Deterministic post-check: strip invented qt/L, torque, “0W-xx required”,
 * and unaffiliated OEM tokens. Does not call another model (cost cap).
 */
export function rewriteInventedSpecs(
  text: string,
  ctx?: SpecAnchorContext | null,
): string {
  if (!text?.trim()) return text;
  const fluidAllow = specFluidAllowlistBlob(ctx);
  const torqueAllow = specTorqueAllowlistBlob(ctx);
  return splitPartsData(text)
    .map((chunk) => {
      if (chunk.kind === "parts") return chunk.value;
      let out = chunk.value;
      out = replaceUnallowed(out, INVENTED_QT_RE, SPEC_MANUAL_REWRITE, fluidAllow);
      out = replaceUnallowed(out, INVENTED_LITER_RE, SPEC_MANUAL_REWRITE, fluidAllow);
      out = replaceUnallowed(out, INVENTED_FTLB_RE, SPEC_TORQUE_REWRITE, torqueAllow);
      out = replaceUnallowed(out, INVENTED_NM_RE, SPEC_TORQUE_REWRITE, torqueAllow);
      out = replaceUnallowed(
        out,
        INVENTED_VISC_REQUIRED_RE,
        "the viscosity printed on the under-hood fill cap (confirm in the owner's manual)",
        fluidAllow,
        true,
      );
      out = replaceUnallowed(out, INVENTED_OEM_RE, SPEC_OEM_REWRITE, fluidAllow);
      return out;
    })
    .join("");
}

export function applySpecOutputGate(
  text: string,
  ctx?: SpecAnchorContext | null,
): string {
  return rewriteInventedSpecs(text, ctx);
}
