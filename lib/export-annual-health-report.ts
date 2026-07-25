/**
 * Pro+ Annual Vehicle Health Report (jsPDF).
 * Richer than the free DIY snapshot: 12-month services, coach next steps, scorecard.
 */

import { jsPDF } from "jspdf";
import type { VehicleInfo } from "@/lib/types/chat";
import type { MaintenanceRecord } from "@/lib/types/maintenance";
import type { VehicleVitals } from "@/lib/vehicle-vitals";
import type { ObdLiveSensors } from "@/lib/obd";
import { LIVE_SENSOR_PIDS, formatLiveSensorValue } from "@/lib/obd";
import { formatVehicleYmmMarket } from "@/lib/types/vehicle-market";
import type { CoachRecommendedPlaybook } from "@/lib/coach-scenarios/catalog";

export type AnnualHealthReportInput = {
  vehicle: VehicleInfo;
  vitals: VehicleVitals | null;
  health: number | null;
  liveSensors?: ObdLiveSensors | null;
  /** Prefer last 12 months; exporter will filter if needed */
  maintenanceRecords?: MaintenanceRecord[];
  recommendedGuides?: CoachRecommendedPlaybook[];
  reportYear?: number;
};

function withinLastYear(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const cutoff = new Date(now);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return d.getTime() >= cutoff.getTime();
}

function money(cents: number | undefined): string {
  if (cents == null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function exportAnnualHealthReportPdf(
  input: AnnualHealthReportInput,
): void {
  const {
    vehicle,
    vitals,
    health,
    liveSensors,
    maintenanceRecords = [],
    recommendedGuides = [],
    reportYear = new Date().getFullYear(),
  } = input;

  const doc = new jsPDF();
  const ymm = formatVehicleYmmMarket(vehicle);
  let y = 20;

  const line = (text: string, size = 11, style: "normal" | "bold" = "normal") => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, 20, y);
    y += lines.length * (size * 0.45) + 4;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  };

  line("Garage Genius — Annual Vehicle Health Report", 16, "bold");
  line(`Report year: ${reportYear} · Generated ${new Date().toLocaleString()}`, 10);
  line(ymm, 13, "bold");
  line(
    `Mileage: ${
      vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : "—"
    } · Last service note: ${vehicle.lastMaintenance || "—"}`,
  );
  if (vehicle.engine) line(`Powertrain / engine: ${vehicle.engine}`, 10);
  if (vehicle.vin) line(`VIN: ${vehicle.vin}`, 10);

  line("1. Health scorecard", 13, "bold");
  line(
    `Overall health index: ${health != null ? `${health}%` : "Not scored yet — run Dashboard inspection"}`,
    12,
  );
  const highCodes =
    vitals?.codes?.filter((c) => c.severity === "High" || c.severity === "Moderate")
      .length ?? 0;
  line(
    `Active concern codes (High/Moderate): ${highCodes} · Total DTCs on file: ${vitals?.codes?.length ?? 0}`,
  );

  line("2. Fluids & tires", 13, "bold");
  if (vitals?.fluids?.length) {
    for (const f of vitals.fluids) {
      line(`• ${f.label}: ${f.value} (${f.level})`);
    }
  } else {
    line("• No fluid checks recorded — complete a Dashboard vitals pass.");
  }

  line("3. Diagnostic codes", 13, "bold");
  if (vitals?.codes?.length) {
    for (const c of vitals.codes.slice(0, 16)) {
      line(`• ${c.code} [${c.severity}] — ${c.desc}`);
    }
  } else {
    line("• No DTCs on file — good sign if OBD was recently scanned.");
  }

  line("4. Live OBD snapshot", 13, "bold");
  if (liveSensors) {
    for (const { key, label, unit } of LIVE_SENSOR_PIDS) {
      line(
        `• ${label}: ${formatLiveSensorValue(liveSensors[key] ?? null, unit)}`,
      );
    }
  } else {
    line("• No live sensor snapshot — connect OBD Diagnose before next report.");
  }

  const yearRecords = maintenanceRecords.filter((r) =>
    withinLastYear(r.performedAt),
  );
  line("5. Service history (last 12 months)", 13, "bold");
  if (yearRecords.length === 0) {
    line(
      "• No logged services in the past year. Log oil, brakes, and filters in Maintenance History so next year’s report is richer.",
    );
  } else {
    let totalCents = 0;
    for (const r of yearRecords.slice(0, 20)) {
      if (r.costCents) totalCents += r.costCents;
      const when = r.performedAt.slice(0, 10);
      const mi = r.mileage != null ? `${r.mileage.toLocaleString()} mi` : "— mi";
      line(
        `• ${when} · ${r.title} (${r.category}) · ${mi} · ${money(r.costCents)}`,
      );
    }
    if (yearRecords.length > 20) {
      line(`• …and ${yearRecords.length - 20} more entries`);
    }
    line(
      `Services logged: ${yearRecords.length} · Spend tracked: ${money(totalCents)}`,
      11,
      "bold",
    );
  }

  line("6. Recommended coach guides", 13, "bold");
  if (recommendedGuides.length === 0) {
    line("• Open Coach Guides for vehicle-matched DIY playbooks.");
  } else {
    for (const g of recommendedGuides) {
      line(`• ${g.title} — ${g.reason}`);
    }
  }

  line("7. Next 12 months — suggested focus", 13, "bold");
  const focus: string[] = [];
  if ((vehicle.mileage ?? 0) >= 100000) {
    focus.push("High-mileage inspection: cooling, suspension bushings, transmission fluid.");
  }
  if (highCodes > 0) {
    focus.push("Clear or diagnose remaining DTCs before emissions / long trips.");
  }
  if (!vehicle.lastMaintenance) {
    focus.push("Record your next service date so reminders stay accurate.");
  }
  focus.push("Re-run this annual report after major services to track trend.");
  for (const f of focus) line(`• ${f}`);

  line(
    "Disclaimer: DIY coaching only — not a certified inspection or legal emissions certificate. Always follow your owner's manual and a licensed technician for safety-critical work.",
    9,
  );
  line("Garage Genius Pro · Annual Health Report", 9);

  const safeName = `${vehicle.year}-${vehicle.make}-${vehicle.model}`
    .replace(/[^\w.-]+/g, "-")
    .slice(0, 50);
  doc.save(`${safeName}-annual-health-${reportYear}.pdf`);
}
