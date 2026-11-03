/**
 * Server Chat vehicle identity: ownership, header/request match, focus bind,
 * and vehicle-switch hard isolation (no pre-switch user/assistant to the model).
 * Does not change CoachScenarioPlayer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VehicleInfo } from "@/lib/types/chat";
import type { TurnFocus } from "@/lib/chat-intent-drift";
import {
  rowToVehicleInfo,
  type UserVehicleRow,
} from "@/lib/user-vehicles";

export const VEHICLE_NOT_OWNED_CODE = "VEHICLE_NOT_OWNED";
export const VEHICLE_SELECTION_MISMATCH_CODE = "VEHICLE_SELECTION_MISMATCH";

export type ConversationFocusPayload = {
  previous?: TurnFocus | null;
  abandoned?: TurnFocus | null;
  vehicleId?: string;
  apiHistoryFromId?: string | null;
};

export type VehicleThreadIsolationReason =
  | "flag"
  | "previous_id"
  | "dirty_history"
  | null;

export type VehicleThreadIsolation = {
  reset: boolean;
  reason: VehicleThreadIsolationReason;
};

export function vehicleSelectionMismatch(
  selectedVehicleId: string | undefined | null,
  requestVehicleId: string | undefined | null,
): boolean {
  if (!selectedVehicleId?.trim() || !requestVehicleId?.trim()) return false;
  return selectedVehicleId.trim() !== requestVehicleId.trim();
}

/**
 * After selectedVehicleId changes, never send pre-switch user/assistant turns.
 * Keep only the latest user message (system / VEHICLE_ANCHOR are added server-side).
 */
export function isolateMessagesForVehicleThreadReset<
  T extends { role?: string },
>(messages: T[], vehicleThreadReset: boolean | undefined): T[] {
  if (!vehicleThreadReset) return messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") return [messages[i]!];
  }
  return [];
}

/** True when the client is starting a new API epoch after a garage vehicle switch. */
export function isVehicleThreadReset(body: {
  vehicleThreadReset?: unknown;
  vehicleChanged?: unknown;
}): boolean {
  return body.vehicleThreadReset === true || body.vehicleChanged === true;
}

function messagePlain(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const p = part as { type?: string; text?: string };
      return p.type === "text" && typeof p.text === "string" ? p.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function compactToken(value: string | number | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/g, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Prior user/assistant turns that name a different make/model than this turn's
 * garage anchor → treat as dirty cross-vehicle history (conservative truncate).
 * Same YMM / two Camrys are NOT caught here — rely on vehicle_id flags.
 */
export function historyConflictsWithVehicleAnchor(
  messages: Array<{ role?: string; content?: unknown }> | undefined,
  vehicle: Pick<VehicleInfo, "make" | "model"> | null | undefined,
): boolean {
  if (!messages?.length || !vehicle?.make?.trim() || !vehicle?.model?.trim()) {
    return false;
  }
  const currentMake = compactToken(vehicle.make);
  const currentModel = compactToken(vehicle.model);
  if (!currentMake || !currentModel) return false;

  let sawLatestUser = false;
  const priors: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    const role = msg?.role;
    if (role !== "user" && role !== "assistant") continue;
    const text = messagePlain(msg?.content).trim();
    if (!text) continue;
    if (role === "user" && !sawLatestUser) {
      sawLatestUser = true;
      continue; // current turn may name another car (spoken conflict path)
    }
    priors.push(text);
  }
  if (!priors.length) return false;

  const blob = priors.join("\n");
  // Year + foreign model (e.g. "2019 Corolla") while current is Camry
  const yearModel = blob.match(
    /\b((?:19|20)\d{2})\s+([A-Za-z][A-Za-z0-9-]{1,20})\b/g,
  );
  if (yearModel) {
    for (const hit of yearModel) {
      const m = hit.match(/\b(?:19|20)\d{2}\s+([A-Za-z][A-Za-z0-9-]{1,20})\b/i);
      const modelTok = compactToken(m?.[1]);
      if (modelTok && modelTok !== currentModel && modelTok.length >= 3) {
        return true;
      }
    }
  }

  // Make + model pair that is not this vehicle (e.g. "Toyota Corolla" on Camry turn)
  const makeRe = new RegExp(
    `\\b${escapeRegExp(vehicle.make.trim())}\\s+([A-Za-z][A-Za-z0-9-]{1,20})\\b`,
    "gi",
  );
  let makeHit: RegExpExecArray | null;
  while ((makeHit = makeRe.exec(blob)) !== null) {
    const modelTok = compactToken(makeHit[1]);
    if (modelTok && modelTok !== currentModel && modelTok.length >= 3) {
      return true;
    }
  }

  // Standalone foreign model tokens commonly left in oil/lights narratives
  // when make is omitted ("on the Corolla", "Camry drain plug").
  const foreignModelAlone = new RegExp(
    `\\b(?!${escapeRegExp(vehicle.model.trim())}\\b)(corolla|camry|civic|accord|f-?150|silverado|tundra|tacoma|rav4|cr-?v|mustang|outback|forester|altima|sentra|mazda3|cx-5|wrangler|cherokee|equinox|malibu|focus|fiesta|golf|jetta|passat|prius|sienna|highlander|4runner|pilot|odyssey|cr-v)\\b`,
    "i",
  );
  if (foreignModelAlone.test(blob)) {
    const hit = blob.match(foreignModelAlone)?.[0];
    if (hit && compactToken(hit) !== currentModel) return true;
  }

  return false;
}

/**
 * Dual-insurance: client flag / previousVehicleId / dirty history → hard isolate.
 * Same vehicle_id consecutive turns do not reset.
 */
export function resolveVehicleThreadIsolation(input: {
  vehicleThreadReset?: unknown;
  vehicleChanged?: unknown;
  previousVehicleId?: string | null;
  currentVehicleId?: string | null;
  messages?: Array<{ role?: string; content?: unknown }>;
  currentVehicle?: Pick<VehicleInfo, "make" | "model"> | null;
}): VehicleThreadIsolation {
  if (isVehicleThreadReset(input)) {
    return { reset: true, reason: "flag" };
  }
  const prev = input.previousVehicleId?.trim() || "";
  const cur = input.currentVehicleId?.trim() || "";
  if (prev && cur && prev !== cur) {
    return { reset: true, reason: "previous_id" };
  }
  if (
    historyConflictsWithVehicleAnchor(input.messages, input.currentVehicle)
  ) {
    return { reset: true, reason: "dirty_history" };
  }
  return { reset: false, reason: null };
}

/**
 * Drop previous/abandoned focus when the payload was saved for another vehicle
 * or when vehicleId is missing (untrusted / legacy). Prevents old-car raised /
 * parkingBrake / apiHistoryFromId from entering a new-car request.
 */
export function bindConversationFocusToVehicle(
  focus: ConversationFocusPayload | null | undefined,
  vehicleId: string | undefined,
): ConversationFocusPayload | null {
  if (!vehicleId) return null;
  if (!focus) {
    return {
      vehicleId,
      previous: null,
      abandoned: null,
      apiHistoryFromId: null,
    };
  }
  // Missing vehicleId on the payload is treated as a mismatch — never inherit
  // raised / PB / history cursor from an unlabeled blob.
  if (!focus.vehicleId?.trim() || focus.vehicleId !== vehicleId) {
    return {
      vehicleId,
      previous: null,
      abandoned: null,
      apiHistoryFromId: null,
    };
  }
  return { ...focus, vehicleId };
}

/** Garage row wins for identity (YMM, mileage, VIN, vPIC). Client may carry unsaved notes. */
export function bindChatVehicleIdentity(
  client: VehicleInfo,
  owned: VehicleInfo,
): VehicleInfo {
  return {
    ...client,
    id: owned.id,
    name: owned.name,
    year: owned.year,
    make: owned.make,
    model: owned.model,
    submodel: owned.submodel,
    market: owned.market,
    mileage: owned.mileage,
    mileageUnit: owned.mileageUnit,
    engine: owned.engine,
    transmission: owned.transmission,
    driveType: owned.driveType,
    brakes: owned.brakes,
    fuelGrade: owned.fuelGrade,
    oilCapacity: owned.oilCapacity,
    oilViscosity: owned.oilViscosity,
    oilCapacitySource: owned.oilCapacitySource,
    oilViscositySource: owned.oilViscositySource,
    oilSpecsConfirmedAt: owned.oilSpecsConfirmedAt,
    vin: owned.vin,
    licensePlate: owned.licensePlate,
    lastMaintenance: owned.lastMaintenance,
    notes: owned.notes ?? client.notes,
    tags: owned.tags,
    ymmUnverified: owned.ymmUnverified,
    vcdb: owned.vcdb ?? client.vcdb,
    vpicDecode: owned.vpicDecode ?? client.vpicDecode,
    vpicDecodedAt: owned.vpicDecodedAt ?? client.vpicDecodedAt,
    countryRegion: owned.countryRegion ?? client.countryRegion,
    countryState: owned.countryState ?? client.countryState,
    insuranceProvider: owned.insuranceProvider ?? client.insuranceProvider,
  };
}

export async function loadOwnedGarageVehicle(
  userClient: SupabaseClient,
  userId: string,
  vehicleId: string | undefined,
): Promise<VehicleInfo | null> {
  const id = vehicleId?.trim();
  if (!id) return null;

  let { data, error } = await userClient
    .from("user_vehicles")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error && /archived_at/i.test(error.message)) {
    const retry = await userClient
      .from("user_vehicles")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw error;
  if (!data) return null;
  return rowToVehicleInfo(data as UserVehicleRow);
}
