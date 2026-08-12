export type IssueSeverity = "low" | "medium" | "high";
export type RepairDifficulty = "Easy" | "Medium" | "Hard";

export interface RegionPart {
  name: string;
  role: string;
  lifespan: string;
}

export interface RegionIssue {
  issue: string;
  severity: IssueSeverity;
  probability: number;
}

export interface RegionRepairStep {
  step: number;
  title: string;
  description: string;
  tools: string[];
  time: string;
  difficulty: RepairDifficulty;
}

export interface RegionVisualGuide {
  title: string;
  youtubeQuery: string;
  photoPrompt: string;
}

export interface RegionPartsRow {
  part: string;
  oem: string;
  aftermarket: string;
  price: string;
}

/** AI 生成的可购买配件详情（用于跨渠道采购 + 入库） */
export interface RegionPurchasePart {
  name: string;
  category: "replacement" | "consumable";
  oemPartNumber: string;
  aftermarketBrand: string;
  aftermarketPartNumber: string;
  fitment: string;
  quantityNeeded: number;
  unit: string;
  estimatedPrice: string;
  installDifficulty: "Easy" | "Medium" | "Hard";
  purchaseChannels: { store: string; searchQuery: string; searchUrl: string }[];
  notes?: string;
}

export interface RegionInspection {
  title: string;
  summary: string;
  parts: RegionPart[];
  commonIssues: RegionIssue[];
  repairSteps: RegionRepairStep[];
  visualGuides: RegionVisualGuide[];
  partsTable: RegionPartsRow[];
  purchaseParts: RegionPurchasePart[];
  safetyNotes: string[];
}

export interface DashboardRegion {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  color: string;
  /** SVG path in viewBox 760×360 for large tap target */
  hitPath: string;
  center: { x: number; y: number };
  /** Leader-line label position (outside the car silhouette) */
  callout?: { x: number; y: number };
  /** 即时展示的检查清单（区域级，非零件目录） */
  quickChecklist: string[];
  /** 可点选的症状快捷标签，引导用户描述后再调 AI */
  symptomHints: string[];
}
