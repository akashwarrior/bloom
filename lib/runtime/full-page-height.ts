type FullPageBoundsInput = {
  /** Height measured after scrolling back to the top. */
  measuredPageHeight: number;
  /** Height observed after the full scroll pass, when known. */
  minimumPageHeight?: number;
  viewportHeight: number;
  maxViewports: number;
};

/**
 * Resolves the page height used for a full-page capture. Scrolling back to the
 * top can collapse lazy content, so a shorter top measurement must not replace
 * the taller height observed at the end of the scroll pass.
 */
export function resolveFullPageBounds({
  measuredPageHeight,
  minimumPageHeight = 0,
  viewportHeight,
  maxViewports,
}: FullPageBoundsInput) {
  const pageHeight = Math.max(measuredPageHeight, minimumPageHeight);
  return {
    pageHeight,
    height: Math.min(pageHeight, viewportHeight * maxViewports),
  };
}
