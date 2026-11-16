export const BRANDING_LOGO_MAX_BYTES = 750 * 1024;
export const BRANDING_LOGO_ACCEPT = "image/png,image/jpeg,image/webp";
const BRANDING_LOGO_ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export function isAcceptedBrandingLogoFile(file: {
  type: string;
  size: number;
}): boolean {
  return (
    BRANDING_LOGO_ACCEPTED_TYPES.has(file.type) &&
    file.size > 0 &&
    file.size <= BRANDING_LOGO_MAX_BYTES
  );
}

function readDataUrl(file: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * The server only takes PNG and JPEG, so anything else is drawn to a canvas
 * first. JPEG goes this way too, so photo rotation is applied.
 */
export async function brandingLogoDataUrl(file: File): Promise<string | null> {
  if (file.type === "image/png") return readDataUrl(file);
  try {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}
