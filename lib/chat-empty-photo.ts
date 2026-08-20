/**
 * Photo-diagnose prompts that imply an attached image.
 * Shared by Chat composer + empty-bubble collapse. Not knowledge_base.
 */

export const DEFAULT_PHOTO_PROMPT =
  "Please analyze this vehicle photo from my garage. Describe what you see, diagnose the likely issue, and highlight the primary area in Focus Mode.";

export function isPhotoPromptWithoutImages(
  content: string,
  images?: Array<string | null | undefined> | null,
): boolean {
  const photos = (images ?? []).filter(Boolean);
  if (photos.length > 0) return false;
  const text = (content || "").trim();
  if (!text) return false;
  if (/^please analyze this vehicle photo/i.test(text)) return true;
  if (/^photo diagnosis for my /i.test(text) && /photographed/i.test(text)) {
    return true;
  }
  return false;
}
