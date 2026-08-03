import type { ShopReportChatMessage } from "@/lib/types/shop-report";
import { compressImageDataUrl } from "@/lib/image";

const MAX_IMAGES = 3;
/** Skip tiny icons / huge originals before compress. */
const MIN_RAW_CHARS = 2_000;
const MAX_RAW_CHARS = 2_500_000;

/** Collect unique image data URLs from chat messages (newest last). */
export function collectMessageImages(
  messages: ShopReportChatMessage[],
  limit = MAX_IMAGES,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of messages) {
    const imgs = [
      ...(m.images?.length ? m.images : []),
      ...(m.image ? [m.image] : []),
    ].filter(Boolean);
    for (const img of imgs) {
      const key = img.slice(0, 80);
      if (seen.has(key)) continue;
      if (!img.startsWith("data:image/") && !img.startsWith("http")) continue;
      if (img.length < MIN_RAW_CHARS || img.length > MAX_RAW_CHARS) continue;
      seen.add(key);
      out.push(img);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Compress for PDF / archive — keep payload small. */
export async function prepareShopReportImages(
  raw: string[],
  limit = MAX_IMAGES,
): Promise<string[]> {
  const prepared: string[] = [];
  for (const src of raw.slice(0, limit)) {
    try {
      const compressed = await compressImageDataUrl(src, {
        maxWidth: 900,
        maxHeight: 900,
        quality: 0.62,
      });
      if (compressed.length > 450_000) continue;
      prepared.push(compressed);
    } catch {
      /* skip bad image */
    }
  }
  return prepared;
}
