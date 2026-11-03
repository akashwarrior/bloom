import sharp from "sharp";

export type ArtworkRegion = { left: number; top: number; right: number; bottom: number };

/** Coordinates are measured on the displayed image, including EXIF orientation. */
export async function cropArtwork(bytes: Uint8Array, region: ArtworkRegion) {
  const image = sharp(bytes).autoOrient();
  const { autoOrient: { width, height } } = await image.metadata();
  const left = Math.round(region.left * width / 1000);
  const top = Math.round(region.top * height / 1000);
  const right = Math.round(region.right * width / 1000);
  const bottom = Math.round(region.bottom * height / 1000);
  if (right <= left || bottom <= top) throw new Error("Artwork crop must have a positive width and height.");
  return image.extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer();
}
