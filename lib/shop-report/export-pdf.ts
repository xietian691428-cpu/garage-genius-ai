/**
 * Shop Handoff Report PDF (jsPDF) — Letter, education-only tone.
 * Client-side download, same stack as annual health report.
 */

import { jsPDF } from "jspdf";
import type { ShopReportPayload } from "@/lib/types/shop-report";
import { SHOP_REPORT_DISCLAIMER } from "@/lib/types/shop-report";

const MARGIN = 54; // ~0.75"
const PAGE_W = 612; // Letter
const PAGE_H = 792;
const CONTENT_W = PAGE_W - MARGIN * 2;

export function exportShopReportPdf(
  payload: ShopReportPayload,
  opts?: { fileName?: string },
): Blob {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  let y = MARGIN;
  const accent: [number, number, number] = [8, 145, 178]; // cyan-600-ish

  const ensureSpace = (need: number) => {
    if (y + need > PAGE_H - MARGIN - 48) {
      doc.addPage();
      y = MARGIN;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...accent);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 6;
    doc.setDrawColor(200, 200, 200);
    doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
    y += 14;
    doc.setTextColor(20, 20, 20);
  };

  const para = (
    text: string,
    size = 10,
    style: "normal" | "bold" = "normal",
  ) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, CONTENT_W) as string[];
    for (const line of lines) {
      ensureSpace(14);
      doc.text(line, MARGIN, y);
      y += size + 3;
    }
    y += 4;
  };

  const bullets = (items: string[]) => {
    for (const item of items) {
      const lines = doc.splitTextToSize(`• ${item}`, CONTENT_W) as string[];
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      for (const line of lines) {
        ensureSpace(14);
        doc.text(line, MARGIN, y);
        y += 13;
      }
      y += 2;
    }
    y += 4;
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...accent);
  doc.text("Garage Genius AI", MARGIN, y);
  y += 18;
  doc.setTextColor(20, 20, 20);
  doc.setFontSize(14);
  doc.text("Owner Diagnostic Summary", MARGIN, y);
  y += 16;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  const local = new Date(payload.generatedAtIso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const utc = new Date(payload.generatedAtIso).toISOString().replace("T", " ").slice(0, 19);
  para(
    `${utc} UTC  ·  Local: ${local}  ·  Report #${payload.reportId}`,
    9,
  );

  const v = payload.vehicle;
  const ymm = [v.year, v.make, v.model, v.submodel].filter(Boolean).join(" ");
  const metaBits = [
    ymm,
    v.mileage != null ? `${v.mileage.toLocaleString()} mi` : null,
    v.vinFull
      ? `VIN ${v.vinFull}`
      : v.vinLast8
        ? `VIN …${v.vinLast8}`
        : null,
    v.plate ? `Plate ${v.plate}` : null,
  ].filter(Boolean);
  para(metaBits.join("  ·  "), 11, "bold");

  // A/B sections
  sectionTitle("Owner Observations");
  para(payload.ownerObservations.symptoms || "—");
  if (payload.ownerObservations.conditions) {
    para(`Conditions: ${payload.ownerObservations.conditions}`, 10);
  }
  if (payload.ownerObservations.checksDone.length) {
    para("Owner-reported checks:", 10, "bold");
    bullets(payload.ownerObservations.checksDone);
  }

  sectionTitle("Diagnostic Data Retrieved");
  if (payload.diagnosticData.codes.length === 0) {
    para("No fault codes were captured in this session.");
  } else {
    for (const c of payload.diagnosticData.codes) {
      para(
        `${c.code} — ${c.definition}${c.severity ? ` (${c.severity})` : ""}`,
        10,
      );
    }
  }
  if (payload.diagnosticData.liveDataSummary) {
    para(`Live / freeze-frame notes: ${payload.diagnosticData.liveDataSummary}`);
  }
  if (payload.diagnosticData.dataSourceNote) {
    para(`Data source: ${payload.diagnosticData.dataSourceNote}`, 9);
  }

  sectionTitle("Checks Already Completed by Owner");
  if (payload.checksCompleted.length === 0) {
    para("None clearly confirmed in this session.");
  } else {
    bullets(payload.checksCompleted);
  }

  sectionTitle("Possible Contributing Factors");
  para(
    "Common causes reported for this combination include the items below. These are for professional verification only.",
    9,
  );
  payload.contributingFactors.forEach((f, i) => {
    para(`${i + 1}. ${f.title}`, 10, "bold");
    para(f.explanation, 10);
    para(`Verification idea: ${f.howToVerify}`, 9);
  });

  sectionTitle("Suggested Next Steps for Technician");
  if (payload.technicianNextSteps.length === 0) {
    para("Verify codes, freeze frame, and basic power/grounds before further tests.");
  } else {
    bullets(payload.technicianNextSteps);
  }

  if (payload.ownerNotes?.trim()) {
    sectionTitle("Owner Notes");
    para(payload.ownerNotes.trim());
  }

  // Disclaimer box
  ensureSpace(90);
  y += 8;
  doc.setDrawColor(160, 160, 160);
  doc.setFillColor(248, 248, 248);
  const discLines = doc.splitTextToSize(
    payload.disclaimer || SHOP_REPORT_DISCLAIMER,
    CONTENT_W - 16,
  ) as string[];
  const boxH = discLines.length * 11 + 16;
  doc.rect(MARGIN, y, CONTENT_W, boxH, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  let dy = y + 12;
  for (const line of discLines) {
    doc.text(line, MARGIN + 8, dy);
    dy += 11;
  }
  y = dy + 10;

  // Appendix: diagnostic screenshots (separate page when present)
  const images = (payload.images || []).filter(Boolean).slice(0, 3);
  if (images.length > 0) {
    doc.addPage();
    y = MARGIN;
    sectionTitle("Appendix — Diagnostic Screenshots");
    para(
      "Owner-provided photos / OBD screenshots for technician reference only.",
      9,
    );
    for (let i = 0; i < images.length; i++) {
      const dataUrl = images[i];
      const format = dataUrl.includes("image/png") ? "PNG" : "JPEG";
      const maxW = CONTENT_W;
      const maxH = 220;
      try {
        ensureSpace(maxH + 28);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(`Figure ${i + 1}`, MARGIN, y);
        y += 12;
        doc.addImage(dataUrl, format, MARGIN, y, maxW, maxH, undefined, "FAST");
        y += maxH + 16;
      } catch {
        para(`(Figure ${i + 1} could not be embedded)`);
      }
    }
  }

  // Footer on each page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `Report #${payload.reportId}  ·  Page ${i} of ${pageCount}  ·  Education aid only`,
      MARGIN,
      PAGE_H - 28,
    );
  }

  const blob = doc.output("blob");
  if (opts?.fileName && typeof window !== "undefined") {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = opts.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
  return blob;
}

export function defaultShopReportFileName(payload: ShopReportPayload): string {
  const base = `${payload.vehicle.year}-${payload.vehicle.make}-${payload.vehicle.model}`
    .replace(/[^\w.-]+/g, "-")
    .slice(0, 40);
  return `${base}-shop-report-${payload.reportId}.pdf`;
}
