export const MAX_SOURCE_FILE_BYTES = 1_000_000;
export const MAX_SOURCE_FILES = 500;
export const MAX_SOURCE_BYTES = 20_000_000;

export const SOURCE_EXCLUDED_SEGMENTS = [
  ".git",
  ".next",
  "node_modules",
  "coverage",
  ".cache",
  ".turbo",
  "dist",
  "build",
  "bloom-generated-assets",
] as const;
