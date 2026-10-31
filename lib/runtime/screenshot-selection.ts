export type ScreenshotCapture = {
  bytes: Uint8Array;
};

export function selectScreenshots<T extends ScreenshotCapture>(
  screenshots: readonly T[],
  maxScreenshots: number,
): T[] {
  if (maxScreenshots <= 0 || screenshots.length === 0) {
    return [];
  }

  const unique: T[] = [];

  for (const screenshot of screenshots) {
    const duplicate = unique.some((candidate) => {
      if (candidate.bytes.byteLength !== screenshot.bytes.byteLength) {
        return false;
      }

      for (let i = 0; i < screenshot.bytes.byteLength; i++) {
        if (candidate.bytes[i] !== screenshot.bytes[i]) {
          return false;
        }
      }

      return true;
    });

    if (!duplicate) {
      unique.push(screenshot);
    }
  }

  if (unique.length <= maxScreenshots) {
    return unique;
  }

  if (maxScreenshots === 1) {
    return [unique[0]];
  }

  const lastIndex = unique.length - 1;

  return Array.from({ length: maxScreenshots }, (_, i) => {
    const index = Math.round((i * lastIndex) / (maxScreenshots - 1));
    return unique[index];
  });
}
