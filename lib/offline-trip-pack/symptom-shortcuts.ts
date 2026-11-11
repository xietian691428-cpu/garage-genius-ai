/**
 * Offline assist symptom chips — educational queries only (no AI).
 */

export type OfflineSymptomShortcut = {
  id: string;
  /** i18n key under offlineTripPack.shortcut.* */
  labelKey: string;
  /** Query text fed into matchOfflineAssistQuery */
  query: string;
};

export const OFFLINE_SYMPTOM_SHORTCUTS: OfflineSymptomShortcut[] = [
  {
    id: "overheat_steam",
    labelKey: "shortcutOverheat",
    query: "overheating with steam from the hood",
  },
  {
    id: "soft_brake",
    labelKey: "shortcutSoftBrake",
    query: "soft spongy brake pedal and brake warning light",
  },
  {
    id: "p0420",
    labelKey: "shortcutP0420",
    query: "P0420",
  },
  {
    id: "flat_tire",
    labelKey: "shortcutFlatTire",
    query: "flat tire on the roadside",
  },
  {
    id: "battery",
    labelKey: "shortcutBattery",
    query: "battery no crank click only",
  },
];
