/**
 * Light table structure retention for private manuals (text-layer PDF).
 * Converts space/tab-aligned fluid & torque rows into Markdown tables so
 * extractors and [USER_MANUAL] retrieval keep label↔value adjacency.
 * Low-confidence / non-tabular text is left unchanged (no invention).
 */

const FLUID_TORQUE_ROW_RE =
  /\b(engine oil|motor oil|oil capacity|oil viscosity|coolant|antifreeze|brake fluid|ATF|CVT|transmission fluid|drain plug|torque|ft-?lb|N[·.\s-]*m|viscosity|0W-|5W-|DOT[\s-]?[345])\b/i;

/** Two+ columns separated by 2+ spaces or tabs. */
const ALIGNED_COLS_RE = /^(.{2,40}?)\s{2,}(.{1,48}?)(?:\s{2,}(.{1,48}?))?$/;

/** Spec value token (capacity / viscosity / DOT / torque). */
const SPEC_VALUE_RE =
  /\b(?:\d+(?:\.\d+)?\s*(?:qts?|quarts?|liters?|litres|L)\b|\d+\s*w\s*-?\s*\d+\b|DOT[\s-]?[345](?:\.1)?|\d+(?:\.\d+)?\s*(?:ft-?lbs?|foot[-\s]?pounds?|n[·.\s-]*m)\b)/i;

/**
 * Split a table-ish fluid/torque row into cells.
 * Prefer 2+ space / tab columns (true alignment). Fallback: pdf-parse often
 * collapses column gaps to a single space — recover label|value when the line
 * is short, fluid-keyed, and ends with an explicit spec token (not prose).
 */
function splitAlignedRow(line: string): string[] | null {
  const t = line.replace(/\t+/g, "  ").trim();
  if (!t || t.length < 6 || t.length > 100) return null;
  // Already markdown
  if (/^\|/.test(t) && /\|$/.test(t)) return null;
  // Prose sentences / procedures
  if (/[.]{1}\s+[A-Z]/.test(t) || /\b(when|after|before|check the|use the)\b/i.test(t)) {
    return null;
  }

  const multi = t.split(/\s{2,}|\t+/).map((p) => p.trim()).filter(Boolean);
  if (multi.length >= 2 && multi.length <= 4) {
    if (multi[0]!.split(/\s+/).length <= 6 && ALIGNED_COLS_RE.test(t)) {
      return multi;
    }
    if (multi.length >= 2 && multi[0]!.split(/\s+/).length <= 6) {
      return multi;
    }
  }

  // Single-space collapsed table row (common after pdf.js text extract)
  if (!FLUID_TORQUE_ROW_RE.test(t) || !SPEC_VALUE_RE.test(t)) return null;
  if (t.split(/\s+/).length > 12) return null;
  const valueHit = t.match(SPEC_VALUE_RE);
  if (!valueHit || valueHit.index == null) return null;
  const label = t.slice(0, valueHit.index).trim();
  const rest = t.slice(valueHit.index).trim();
  if (!label || label.split(/\s+/).length > 6) return null;
  // Prefer 2 cells; if rest has viscosity after capacity, keep as notes
  const visc = rest.match(/\b\d+\s*w\s*-?\s*\d+\b/i);
  if (visc && /qt|quart|liter|litre|\bL\b/i.test(rest) && visc.index && visc.index > 0) {
    const capacity = rest.slice(0, visc.index).trim();
    const notes = rest.slice(visc.index).trim();
    if (capacity) return [label, capacity, notes];
  }
  return [label, rest];
}

function looksLikeTableCluster(lines: string[]): boolean {
  let hits = 0;
  let fluidHits = 0;
  for (const line of lines) {
    const cols = splitAlignedRow(line);
    if (!cols) continue;
    hits += 1;
    if (FLUID_TORQUE_ROW_RE.test(line)) fluidHits += 1;
  }
  return hits >= 2 && fluidHits >= 1;
}

function toMarkdownTable(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length), 2);
  const normalized = rows.map((r) => {
    const cells = [...r];
    while (cells.length < width) cells.push("");
    return cells.slice(0, width);
  });
  const header =
    width >= 3
      ? ["Item", "Spec", "Notes"].slice(0, width)
      : ["Item", "Spec"];
  while (header.length < width) header.push(`Col${header.length + 1}`);
  const sep = header.map(() => "---");
  const lines = [
    `| ${header.join(" | ")} |`,
    `| ${sep.join(" | ")} |`,
    ...normalized.map((r) => `| ${r.join(" | ")} |`),
  ];
  return lines.join("\n");
}

/**
 * Detect consecutive aligned rows and rewrite as Markdown tables.
 * Non-table regions pass through unchanged.
 */
export function preserveManualTablesAsMarkdown(text: string): {
  text: string;
  tablesFound: number;
  lowConfidence: boolean;
} {
  const raw = text || "";
  if (!raw.trim()) {
    return { text: raw, tablesFound: 0, lowConfidence: true };
  }

  const lines = raw.split(/\r?\n/);
  const out: string[] = [];
  let i = 0;
  let tablesFound = 0;

  while (i < lines.length) {
    const cluster: { line: string; cols: string[] }[] = [];
    let j = i;
    while (j < lines.length) {
      const line = lines[j]!;
      if (!line.trim()) {
        if (cluster.length >= 2) break;
        j += 1;
        continue;
      }
      const cols = splitAlignedRow(line);
      if (!cols) {
        if (cluster.length >= 2) break;
        break;
      }
      cluster.push({ line, cols });
      j += 1;
      if (cluster.length >= 12) break;
    }

    if (
      cluster.length >= 2 &&
      looksLikeTableCluster(cluster.map((c) => c.line))
    ) {
      out.push(toMarkdownTable(cluster.map((c) => c.cols)));
      tablesFound += 1;
      i = j;
      // skip following blank
      while (i < lines.length && !lines[i]!.trim()) {
        out.push("");
        i += 1;
      }
      continue;
    }

    out.push(lines[i]!);
    i += 1;
  }

  return {
    text: out.join("\n"),
    tablesFound,
    lowConfidence: tablesFound === 0,
  };
}

/**
 * Flatten markdown table rows into "label: value" lines so existing
 * regex extractors see adjacent context (engine oil … 4.8 qt).
 */
export function flattenMarkdownTablesForExtract(text: string): string {
  const raw = text || "";
  if (!/\|/.test(raw)) return raw;
  const lines = raw.split(/\r?\n/);
  const extras: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!/^\|/.test(t) || !/\|$/.test(t)) continue;
    if (/^\|\s*---/.test(t)) continue;
    const cells = t
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    // Skip header-ish
    if (/^(item|spec|notes|col\d+)$/i.test(cells[0]!)) continue;
    const label = cells[0]!;
    const values = cells.slice(1).filter(Boolean).join(" ");
    if (FLUID_TORQUE_ROW_RE.test(`${label} ${values}`)) {
      extras.push(`${label}: ${values}`);
    }
  }
  if (!extras.length) return raw;
  return `${raw}\n\n[TABLE_ROWS]\n${extras.join("\n")}`;
}

/** Preprocess one manual page before chunking. */
export function preprocessManualPageText(pageText: string): string {
  const { text } = preserveManualTablesAsMarkdown(pageText);
  return flattenMarkdownTablesForExtract(text);
}
