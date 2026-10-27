const ASSET_ID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ASSET_URL_PATTERN = new RegExp(`^/api/assets/(${ASSET_ID_PATTERN})$`, "i");

export const IMAGE_FILE_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
} as const;

export function getAssetUrl(assetId: string) {
  return `/api/assets/${assetId}`;
}

export function getAssetIdFromUrl(url: string) {
  return ASSET_URL_PATTERN.exec(url)?.[1] ?? null;
}
