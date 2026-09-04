/**
 * 将图片规范化为 API 可用的 base64 data URL
 * ChatInput 通过 FileReader.readAsDataURL 已生成 data URL，
 * 此函数用于兜底处理纯 base64 字符串
 */
export function toBase64DataUrl(image: string): string {
  if (image.startsWith("data:image/")) {
    return image;
  }
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }
  return `data:image/jpeg;base64,${image}`;
}

/** 从 data URL 中提取纯 base64 字符串（可选，用于日志或压缩） */
export function extractBase64Payload(image: string): string {
  const commaIndex = image.indexOf(",");
  if (image.startsWith("data:") && commaIndex !== -1) {
    return image.slice(commaIndex + 1);
  }
  return image;
}

export const CHAT_PHOTO_MAX_EDGE = 1600;
export const CHAT_PHOTO_JPEG_QUALITY = 0.72;

/**
 * Downscale garage phone photos before Vision API (token + payload size).
 * Keeps aspect ratio; returns JPEG data URL.
 */
export async function compressImageDataUrl(
  dataUrl: string,
  options?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<string> {
  const maxWidth = options?.maxWidth ?? CHAT_PHOTO_MAX_EDGE;
  const maxHeight = options?.maxHeight ?? CHAT_PHOTO_MAX_EDGE;
  const quality = options?.quality ?? CHAT_PHOTO_JPEG_QUALITY;

  if (typeof window === "undefined") return dataUrl;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxWidth / width, maxHeight / height);
      if (scale >= 1 && dataUrl.length < 400_000) {
        resolve(dataUrl);
        return;
      }
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
