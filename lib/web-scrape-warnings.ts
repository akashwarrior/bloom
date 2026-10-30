export function buildNoVisualEvidenceWarning(targetUrl: string) {
  return (
    `This capture returned zero screenshots (${targetUrl}), so there is no ` +
    `visual evidence to design from — likely a JS-heavy page, a bot wall, ` +
    `or a render failure. Do not treat the manifest text as the design; ` +
    `either re-scrape once with a different theme or viewport, or pick a ` +
    `different reference whose screenshots actually rendered.`
  );
}
