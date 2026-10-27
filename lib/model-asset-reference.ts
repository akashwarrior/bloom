const MODEL_ASSET_PREFIX = "bloom-asset:";

export function modelAssetFilename(assetId: string, filename: string) {
  return `${MODEL_ASSET_PREFIX}${assetId}__${filename}`;
}

export function getAssetIdFromModelFilename(filename: unknown) {
  if (typeof filename !== "string" || !filename.startsWith(MODEL_ASSET_PREFIX)) {
    return null;
  }

  const separator = filename.indexOf("__", MODEL_ASSET_PREFIX.length);
  if (separator === -1) return null;

  const assetId = filename.slice(MODEL_ASSET_PREFIX.length, separator);
  return assetId || null;
}
