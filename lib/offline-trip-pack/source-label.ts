import type { TripPackFluidSource } from "@/lib/offline-trip-pack/types";

export function tripPackFluidSourceLabel(source: TripPackFluidSource): string {
  if (source === "user_manual_confirmed") {
    return "Garage profile (from your manual)";
  }
  return "Garage profile (you entered)";
}
