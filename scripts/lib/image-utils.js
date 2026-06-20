/** Client-side image compression before storing in listings.images (JSONB). */

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_EDGE_PX = 1200;
const JPEG_QUALITY = 0.82;

/**
 * Resize and compress an image file to a JPEG data URL.
 * Skips re-encoding for small JPEGs already under the size cap.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function compressImageToDataUrl(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Not an image file.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image is too large (max 8 MB).");
  }
  if (file.type === "image/jpeg" && file.size <= MAX_UPLOAD_BYTES) {
    return readFileAsDataUrl(file);
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    return readFileAsDataUrl(file);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let quality = JPEG_QUALITY;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);
  while (dataUrl.length > MAX_UPLOAD_BYTES * 1.37 && quality > 0.45) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }
  return dataUrl;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Keep only the first image URL for card/list payloads (avoids shipping multi-image JSON).
 * @param {import("../lib/transform.js").Listing | Record<string, unknown>} listing
 */
export function slimListingImages(listing) {
  if (!listing || !Array.isArray(listing.images) || listing.images.length <= 1) return listing;
  return { ...listing, images: [listing.images[0]] };
}
