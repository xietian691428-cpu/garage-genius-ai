/**
 * Which VL provider runs first for chat photos + structured vision JSON.
 * Default: deepseek (unified with text coaching). Set VISION_PRIMARY=kimi to revert.
 */

export type VisionPrimaryProvider = "deepseek" | "kimi";

export function getVisionPrimary(): VisionPrimaryProvider {
  const raw = (process.env.VISION_PRIMARY || "deepseek").trim().toLowerCase();
  return raw === "kimi" ? "kimi" : "deepseek";
}
