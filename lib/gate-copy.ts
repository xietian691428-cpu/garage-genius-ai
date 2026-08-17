/**
 * Garage gate / switch-confirm copy follows the **user's question language**,
 * then falls back to UI locale. Independent of Settings i18n so zh questions
 * get Chinese banners even when the chrome is English.
 */

import {
  detectReplyLanguageHint,
  type ReplyLanguageHint,
} from "@/lib/reply-language";

export type GateCopyKey =
  | "switchConfirm"
  | "switchConfirmYes"
  | "switchConfirmNo"
  | "ambiguousGarage"
  | "gateEmptyGarage"
  | "gateNoVehicle"
  | "gateNotInGarageAdd"
  | "gateNotInGarageLimit"
  | "gateNotInGarageLimitStore"
  | "gateAddVehicle"
  | "gateUpgrade"
  | "gateManageGarage"
  | "gatePickVehicle"
  | "retry";

type GateCopyTable = Record<GateCopyKey, string>;

const EN: GateCopyTable = {
  switchConfirm:
    "Your question looks like it’s about {{mention}} ({{vehicle}}), not the currently selected {{current}}. Switch to that vehicle’s chat and ask there? Your question will not be saved on the current vehicle.",
  switchConfirmYes: "Switch & ask",
  switchConfirmNo: "Cancel",
  ambiguousGarage:
    "Your question mentions {{mention}}, which matches more than one garage vehicle. Select the exact vehicle below — AI will not guess.",
  gateEmptyGarage:
    "Add a vehicle to your garage before using AI, OBD, or Shop Report. Coaching is limited to vehicles you save.",
  gateNoVehicle:
    "Select a vehicle from your garage to continue. Chat history, OBD, and Shop Report all use the selected vehicle.",
  gateNotInGarageAdd:
    "\"{{mention}}\" isn’t in your garage yet. AI only coaches vehicles you’ve added. Add it now, then we’ll ask on that vehicle’s chat.",
  gateNotInGarageLimit:
    "\"{{mention}}\" isn’t in your garage, and you’ve reached your plan limit ({{count}} vehicle(s)). Upgrade for more slots, or remove/archive a vehicle first.",
  gateNotInGarageLimitStore:
    "\"{{mention}}\" isn’t in your garage, and this account has reached its vehicle limit ({{count}}). Remove or archive a vehicle before adding another.",
  gateAddVehicle: "Add vehicle",
  gateUpgrade: "Upgrade for more vehicles",
  gateManageGarage: "Manage garage",
  gatePickVehicle: "Pick vehicle",
  retry: "Retry",
};

const ZH: GateCopyTable = {
  switchConfirm:
    "你的问题看起来是在说「{{mention}}」（{{vehicle}}），而不是当前选中的「{{current}}」。要切换到那辆车的会话再提问吗？这句话不会写入当前车辆的聊天记录。",
  switchConfirmYes: "切换并提问",
  switchConfirmNo: "取消",
  ambiguousGarage:
    "你的问题提到「{{mention}}」，车库里有多台匹配车辆。请点选确切的一台——AI 不会自动猜测。",
  gateEmptyGarage:
    "请先添加车辆到车库，再使用 AI、OBD 或 Shop Report。诊断仅针对你已保存的车辆。",
  gateNoVehicle:
    "请先从车库选择一辆车。聊天历史、OBD 与 Shop Report 都基于当前选中车辆。",
  gateNotInGarageAdd:
    "「{{mention}}」还不在你的车库。AI 只辅导已添加的车辆。现在添加后，我们会在该车会话中提问。",
  gateNotInGarageLimit:
    "「{{mention}}」不在车库，且已达到套餐上限（{{count}} 台）。请升级名额，或先删除/归档一辆车。",
  gateNotInGarageLimitStore:
    "「{{mention}}」不在车库，且本账号已达车辆上限（{{count}}）。请先删除或归档一辆车再添加。",
  gateAddVehicle: "添加车辆",
  gateUpgrade: "升级以增加车位",
  gateManageGarage: "管理车库",
  gatePickVehicle: "选择车辆",
  retry: "重试",
};

const ES: GateCopyTable = {
  switchConfirm:
    "Tu pregunta parece referirse a {{mention}} ({{vehicle}}), no al vehículo seleccionado {{current}}. ¿Cambiar al chat de ese vehículo y preguntar allí? Tu pregunta no se guardará en el vehículo actual.",
  switchConfirmYes: "Cambiar y preguntar",
  switchConfirmNo: "Cancelar",
  ambiguousGarage:
    "Tu pregunta menciona {{mention}}, que coincide con más de un vehículo del garaje. Selecciona el vehículo exacto abajo — la IA no adivinará.",
  gateEmptyGarage:
    "Añade un vehículo a tu garaje antes de usar la IA, OBD o el informe de taller. Solo se atienden vehículos guardados.",
  gateNoVehicle:
    "Selecciona un vehículo de tu garaje para continuar. El historial del chat, OBD y el informe de taller usan el vehículo seleccionado.",
  gateNotInGarageAdd:
    "\"{{mention}}\" aún no está en tu garaje. La IA solo ayuda con vehículos que hayas añadido. Añádelo ahora y preguntaremos en el chat de ese vehículo.",
  gateNotInGarageLimit:
    "\"{{mention}}\" no está en tu garaje y has alcanzado el límite del plan ({{count}} vehículo(s)). Mejora el plan o elimina/archiva un vehículo primero.",
  gateNotInGarageLimitStore:
    "\"{{mention}}\" no está en tu garaje y esta cuenta alcanzó el límite de vehículos ({{count}}). Elimina o archiva un vehículo antes de añadir otro.",
  gateAddVehicle: "Añadir vehículo",
  gateUpgrade: "Mejorar plan",
  gateManageGarage: "Gestionar garaje",
  gatePickVehicle: "Elegir vehículo",
  retry: "Reintentar",
};

const TABLES: Record<ReplyLanguageHint, GateCopyTable> = {
  en: EN,
  zh: ZH,
  es: ES,
};

export function fillGateTemplate(
  template: string,
  vars: Record<string, string | number | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v == null ? "" : String(v);
  });
}

/** Map UI i18n language (en-US / es / …) to a reply-language hint. */
export function uiLocaleToGateHint(
  uiLanguage: string | undefined | null,
): ReplyLanguageHint {
  const raw = (uiLanguage || "").toLowerCase();
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("zh")) return "zh";
  return "en";
}

/**
 * Prefer the question's detected language; if the question is empty / English
 * with no signal, fall back to the UI chrome language.
 */
export function resolveGateLanguage(
  questionText: string | null | undefined,
  uiLanguage?: string | null,
): ReplyLanguageHint {
  const trimmed = (questionText || "").trim();
  if (!trimmed) return uiLocaleToGateHint(uiLanguage);
  const fromQuestion = detectReplyLanguageHint(trimmed);
  // English is the default detector result for Latin text; if UI is Spanish
  // and the question has no Spanish signal, still follow the question (en).
  return fromQuestion;
}

export function gateCopy(
  lang: ReplyLanguageHint,
  key: GateCopyKey,
  vars: Record<string, string | number | undefined> = {},
): string {
  const table = TABLES[lang] ?? EN;
  return fillGateTemplate(table[key] ?? EN[key], vars);
}

export function gateCopyBundle(lang: ReplyLanguageHint): GateCopyTable {
  return TABLES[lang] ?? EN;
}
