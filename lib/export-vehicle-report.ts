/**
 * Client-side Garage Genius PDF report (jsPDF).
 * Keeps DIY snapshot: health, fluids, codes, sensors, market.
 */

import { jsPDF } from "jspdf";
import type { VehicleInfo } from "@/lib/types/chat";
import type { VehicleVitals } from "@/lib/vehicle-vitals";
import type { ObdLiveSensors } from "@/lib/obd";
import { LIVE_SENSOR_PIDS, formatLiveSensorValue } from "@/lib/obd";
import { formatVehicleYmmMarket } from "@/lib/types/vehicle-market";

export type ExportReportInput = {
  vehicle: VehicleInfo;
  vitals: VehicleVitals | null;
  health: number | null;
  liveSensors?: ObdLiveSensors | null;
};

export function exportVehicleReportPdf(input: ExportReportInput): void {
  const { vehicle, vitals, health, liveSensors } = input;
  const doc = new jsPDF();
  const ymm = formatVehicleYmmMarket(vehicle);
  let y = 20;

  const line = (text: string, size = 11) => {
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 170);
    doc.text(lines, 20, y);
    y += lines.length * (size * 0.45) + 4;
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  };

  doc.setFont("helvetica", "bold");
  line("Garage Genius — Vehicle Report", 16);
  doc.setFont("helvetica", "normal");
  line(ymm, 12);
  line(`Generated: ${new Date().toLocaleString()}`);
  line(
    `Mileage: ${
      vehicle.mileage ? `${vehicle.mileage.toLocaleString()} mi` : "—"
    } · Last service: ${vehicle.lastMaintenance || "—"}`,
  );
  line(`Overall health: ${health != null ? `${health}%` : "—"}`, 12);

  line("Fluids & tire pressure", 13);
  if (vitals?.fluids?.length) {
    for (const f of vitals.fluids) {
      line(`• ${f.label}: ${f.value} (${f.level})`);
    }
  } else {
    line("• No fluid checks recorded yet");
  }

  line("Diagnostic codes", 13);
  if (vitals?.codes?.length) {
    for (const c of vitals.codes.slice(0, 12)) {
      line(`• ${c.code} [${c.severity}] — ${c.desc}`);
    }
  } else {
    line("• No DTCs on file");
  }

  line("Live OBD sensors (last read)", 13);
  if (liveSensors) {
    for (const { key, label, unit } of LIVE_SENSOR_PIDS) {
      line(
        `• ${label}: ${formatLiveSensorValue(liveSensors[key] ?? null, unit)}`,
      );
    }
  } else {
    line("• No live sensor snapshot — run OBD Diagnose first");
  }

  line(
    "Disclaimer: DIY coaching only — not professional mechanic advice. Verify fitment and torque specs in your market-specific manual.",
    9,
  );

  const safeName = `${vehicle.year}-${vehicle.make}-${vehicle.model}`
    .replace(/[^\w.-]+/g, "-")
    .slice(0, 60);
  doc.save(`${safeName}-garage-genius-report.pdf`);
}
