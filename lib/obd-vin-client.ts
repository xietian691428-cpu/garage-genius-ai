import { supabase } from "@/lib/supabase";
import type { ObdVinResponse } from "@/app/api/obd/vin/route";

export type { ObdVinResponse };

/** Compare (and optionally save) the OBD-reported VIN for a garage vehicle. Null on any failure. */
export async function checkObdVin(input: {
  vehicleId: string;
  vin: string;
  save?: boolean;
}): Promise<ObdVinResponse | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;
    const res = await fetch("/api/obd/vin", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    return (await res.json()) as ObdVinResponse;
  } catch (err) {
    console.warn("[obd-vin]", err instanceof Error ? err.message : err);
    return null;
  }
}
