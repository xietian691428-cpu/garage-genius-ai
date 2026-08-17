/**
 * Detect whether a chat question names a vehicle that matches (or conflicts with)
 * the user's garage. AI chat is limited to vehicles already in the garage.
 */

import type { VehicleInfo } from "@/lib/types/chat";

/** Common owner nicknames / CN market names → English model tokens. */
const MODEL_ALIASES: Record<string, string[]> = {
  corolla: ["卡罗拉", "corolla"],
  camry: ["凯美瑞", "camry"],
  highlander: ["汉兰达", "highlander"],
  rav4: ["荣放", "rav4", "rav 4"],
  prius: ["普锐斯", "prius"],
  tacoma: ["tacoma"],
  tundra: ["tundra"],
  sienna: ["塞纳", "sienna"],
  "4runner": ["4runner", "4 runner"],
  avalon: ["亚洲龙", "avalon"],
  sequoia: ["红杉", "sequoia"],
  landcruiser: ["兰德酷路泽", "陆地巡洋舰", "land cruiser", "landcruiser"],
  civic: ["思域", "civic"],
  accord: ["雅阁", "accord"],
  crv: ["本田crv", "cr-v", "crv"],
  pilot: ["pilot"],
  odyssey: ["奥德赛", "odyssey"],
  "320i": ["320i", "3系", "3 series"],
  "330i": ["330i"],
  "x3": ["x3"],
  "x5": ["x5"],
  f150: ["f-150", "f150", "f 150"],
  escape: ["翼虎", "escape", "kuga"],
  silverado: ["silverado"],
  equinox: ["equinox"],
  "model y": ["model y", "modely"],
  "model 3": ["model 3", "model3"],
  "cx-5": ["cx-5", "cx5"],
  "cx-50": ["cx-50", "cx50"],
  altima: ["天籁", "altima"],
  rogue: ["奇骏", "rogue"],
  elantra: ["伊兰特", "elantra"],
  tucson: ["途胜", "tucson"],
  outback: ["傲虎", "outback"],
  forester: ["森林人", "forester"],
};

const MAKE_ALIASES: Record<string, string[]> = {
  toyota: ["丰田", "toyota"],
  honda: ["本田", "honda"],
  bmw: ["宝马", "bmw"],
  ford: ["福特", "ford"],
  chevrolet: ["雪佛兰", "雪弗兰", "chevy", "chevrolet"],
  tesla: ["特斯拉", "tesla"],
  nissan: ["日产", "尼桑", "nissan"],
  hyundai: ["现代", "hyundai"],
  kia: ["起亚", "kia"],
  mazda: ["马自达", "mazda"],
  volkswagen: ["大众", "vw", "volkswagen"],
  audi: ["奥迪", "audi"],
  mercedes: ["奔驰", "mercedes", "benz", "mb"],
  lexus: ["雷克萨斯", "凌志", "lexus"],
  subaru: ["斯巴鲁", "subaru"],
  jeep: ["吉普", "jeep"],
  gmc: ["gmc"],
  dodge: ["道奇", "dodge"],
  ram: ["ram"],
};

/** Extensible alias tables (tests / future admin seed can import). */
export function getVehicleAliasCatalog() {
  return {
    models: { ...MODEL_ALIASES },
    makes: { ...MAKE_ALIASES },
  };
}

export type GarageVehicleMatchKind =
  | "ok"
  | "switch_candidate"
  | "not_in_garage"
  | "ambiguous";

export type GarageVehicleMatchResult =
  | { kind: "ok"; reason: "no_vehicle_mention" | "matches_current" }
  | {
      kind: "switch_candidate";
      vehicle: VehicleInfo;
      mentionLabel: string;
    }
  | {
      kind: "not_in_garage";
      mentionLabel: string;
      makeHint?: string;
      modelHint?: string;
    }
  | {
      kind: "ambiguous";
      candidates: VehicleInfo[];
      mentionLabel: string;
    };

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\-_.]+/g, "")
    .trim();
}

function compact(s: string): string {
  return s.toLowerCase().normalize("NFKC");
}

function modelAliasHits(text: string): string[] {
  const c = compact(text);
  const n = norm(text);
  const hits: string[] = [];
  for (const [canonical, aliases] of Object.entries(MODEL_ALIASES)) {
    for (const a of aliases) {
      const ca = compact(a);
      const na = norm(a);
      if ((ca && c.includes(ca)) || (na && n.includes(na))) {
        hits.push(canonical);
        break;
      }
    }
  }
  return hits;
}

function makeAliasHits(text: string): string[] {
  const c = compact(text);
  const n = norm(text);
  const hits: string[] = [];
  for (const [canonical, aliases] of Object.entries(MAKE_ALIASES)) {
    for (const a of aliases) {
      const ca = compact(a);
      const na = norm(a);
      if ((ca && c.includes(ca)) || (na && n.includes(na))) {
        hits.push(canonical);
        break;
      }
    }
  }
  return hits;
}

function vehicleModelKey(v: VehicleInfo): string {
  const m = norm(v.model);
  for (const [canonical, aliases] of Object.entries(MODEL_ALIASES)) {
    if (m.includes(norm(canonical))) return canonical;
    for (const a of aliases) {
      if (m.includes(norm(a))) return canonical;
    }
  }
  return m;
}

function vehicleMakeKey(v: VehicleInfo): string {
  const m = norm(v.make);
  for (const [canonical, aliases] of Object.entries(MAKE_ALIASES)) {
    if (m.includes(norm(canonical))) return canonical;
    for (const a of aliases) {
      if (m.includes(norm(a))) return canonical;
    }
  }
  return m;
}

function labelForMention(modelKeys: string[], makeKeys: string[]): string {
  const parts = [
    ...makeKeys.map((k) => k.replace(/\b\w/g, (c) => c.toUpperCase())),
    ...modelKeys.map((k) =>
      k
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    ),
  ];
  return parts.join(" ") || "that vehicle";
}

function sameVehicle(a: VehicleInfo, b: VehicleInfo): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  return (
    vehicleMakeKey(a) === vehicleMakeKey(b) &&
    vehicleModelKey(a) === vehicleModelKey(b) &&
    Number(a.year) === Number(b.year)
  );
}

/**
 * Analyze user text against garage vehicles + the currently selected vehicle.
 * When the question names no vehicle, treat as OK for the current profile.
 */
export function matchGarageVehicleMention(
  text: string,
  garage: VehicleInfo[],
  current: VehicleInfo | null,
): GarageVehicleMatchResult {
  const raw = (text || "").trim();
  if (!raw) {
    return { kind: "ok", reason: "no_vehicle_mention" };
  }

  const modelKeys = modelAliasHits(raw);
  const makeKeys = makeAliasHits(raw);

  // Also catch plain English make/model tokens present in garage rows
  const c = compact(raw);
  const n = norm(raw);
  for (const v of garage) {
    const mk = vehicleModelKey(v);
    const make = vehicleMakeKey(v);
    if (mk && (c.includes(compact(v.model)) || n.includes(norm(v.model)))) {
      if (!modelKeys.includes(mk)) modelKeys.push(mk);
    }
    if (
      make &&
      (c.includes(compact(v.make)) || n.includes(norm(v.make))) &&
      !makeKeys.includes(make)
    ) {
      makeKeys.push(make);
    }
  }

  if (modelKeys.length === 0 && makeKeys.length === 0) {
    return { kind: "ok", reason: "no_vehicle_mention" };
  }

  const mentionLabel = labelForMention(modelKeys, makeKeys);

  const candidates = garage.filter((v) => {
    const vm = vehicleModelKey(v);
    const vk = vehicleMakeKey(v);
    const modelOk =
      modelKeys.length === 0 || modelKeys.some((k) => vm.includes(k) || k.includes(vm));
    const makeOk =
      makeKeys.length === 0 || makeKeys.some((k) => vk.includes(k) || k.includes(vk));
    // Prefer model when present; make-only is weaker and only used if model absent
    if (modelKeys.length > 0) return modelOk && (makeKeys.length === 0 || makeOk);
    return makeOk;
  });

  if (candidates.length === 0) {
    return {
      kind: "not_in_garage",
      mentionLabel,
      makeHint: makeKeys[0]
        ? makeKeys[0].replace(/\b\w/g, (c) => c.toUpperCase())
        : undefined,
      modelHint: modelKeys[0]
        ? modelKeys[0]
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
        : undefined,
    };
  }

  if (current && candidates.some((v) => sameVehicle(v, current))) {
    return { kind: "ok", reason: "matches_current" };
  }

  // Deduplicate by id
  const unique = Array.from(
    new Map(candidates.map((v) => [v.id || `${v.year}-${v.make}-${v.model}`, v])).values(),
  );

  if (unique.length === 1) {
    return {
      kind: "switch_candidate",
      vehicle: unique[0],
      mentionLabel,
    };
  }

  return { kind: "ambiguous", candidates: unique, mentionLabel };
}

export function formatVehicleShort(v: VehicleInfo): string {
  const name = v.name?.trim();
  const ymm = `${v.year} ${v.make} ${v.model}`.trim();
  return name ? `${name} · ${ymm}` : ymm;
}
