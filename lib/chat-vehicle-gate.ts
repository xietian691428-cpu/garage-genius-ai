/**
 * Chat send gate — ordered: parse mention → garage / quota / selection → vehicle_id.
 * Keeps AI calls off until a concrete garage vehicle is chosen.
 */

import type { VehicleInfo } from "@/lib/types/chat";
import {
  matchGarageVehicleMention,
  type GarageVehicleMatchResult,
} from "@/lib/garage-vehicle-match";

export type ChatGateCode =
  | "empty_garage"
  | "no_vehicle_selected"
  | "not_in_garage_can_add"
  | "not_in_garage_limit"
  | "ambiguous"
  | "switch_confirm"
  | "ok";

export type ChatGateDecision =
  | { code: "empty_garage" }
  | { code: "no_vehicle_selected" }
  | {
      code: "not_in_garage_can_add";
      mentionLabel: string;
      makeHint?: string;
      modelHint?: string;
    }
  | {
      code: "not_in_garage_limit";
      mentionLabel: string;
      maxVehicles: number;
    }
  | {
      code: "ambiguous";
      mentionLabel: string;
      candidates: VehicleInfo[];
    }
  | {
      code: "switch_confirm";
      mentionLabel: string;
      vehicle: VehicleInfo;
    }
  | {
      code: "ok";
      vehicle: VehicleInfo;
      match: GarageVehicleMatchResult;
    };

export type ChatGateInput = {
  text: string;
  garage: VehicleInfo[];
  current: VehicleInfo | null;
  canAddVehicle: boolean;
  maxVehicles: number;
};

function titleCaseToken(k: string): string {
  return k
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Fixed order for every Chat send (and seed prompts):
 * 1) empty garage / no selection
 * 2) parse mention vs garage
 * 3) quota branch for unknown vehicles
 * 4) ambiguous / switch / ok with concrete vehicle_id
 */
export function resolveChatVehicleGate(input: ChatGateInput): ChatGateDecision {
  const { text, garage, current, canAddVehicle, maxVehicles } = input;

  if (!garage.length) {
    return { code: "empty_garage" };
  }

  if (!current) {
    return { code: "no_vehicle_selected" };
  }

  const match = matchGarageVehicleMention(text, garage, current);

  if (match.kind === "not_in_garage") {
    if (canAddVehicle) {
      return {
        code: "not_in_garage_can_add",
        mentionLabel: match.mentionLabel,
        makeHint: match.makeHint,
        modelHint: match.modelHint,
      };
    }
    return {
      code: "not_in_garage_limit",
      mentionLabel: match.mentionLabel,
      maxVehicles,
    };
  }

  if (match.kind === "ambiguous") {
    return {
      code: "ambiguous",
      mentionLabel: match.mentionLabel,
      candidates: match.candidates,
    };
  }

  if (match.kind === "switch_candidate") {
    return {
      code: "switch_confirm",
      mentionLabel: match.mentionLabel,
      vehicle: match.vehicle,
    };
  }

  return { code: "ok", vehicle: current, match };
}

/** Prefer English title-case hints for Add Vehicle prefill. */
export function mentionHintsFromLabel(mentionLabel: string): {
  makeHint?: string;
  modelHint?: string;
} {
  const parts = mentionLabel.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return {
      makeHint: titleCaseToken(parts[0].toLowerCase()),
      modelHint: titleCaseToken(parts.slice(1).join(" ").toLowerCase()),
    };
  }
  if (parts.length === 1) {
    return { modelHint: titleCaseToken(parts[0].toLowerCase()) };
  }
  return {};
}
