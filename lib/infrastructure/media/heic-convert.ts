/**
 * Client-side HEIC/HEIF → JPEG conversion.
 *
 * Apple's HEIC only renders natively in Safari and is rejected by vision
 * models, so we convert before upload. Server-side sharp/libheif can't
 * reliably decode real iPhone HEICs ("bad seek" errors), so this uses
 * heic2any (a full libheif wasm build), dynamically imported only when a
 * HEIC is actually attached. Non-HEIC files pass through untouched; on any
 * failure we return the original so the caller can still try the upload.
 */

export function isHeicFile(file: File): boolean {
  return (
    /image\/(heic|heif)/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
  );
}

export async function convertHeicToJpegFile(file: File): Promise<File> {
  if (!isHeicFile(file) || typeof window === "undefined") return file;
  try {
    const heic2any = (await import("heic2any")).default;
    const result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality: 0.9,
    });
    const blob = Array.isArray(result) ? result[0] : result;
    const name = file.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
