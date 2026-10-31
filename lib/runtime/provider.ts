export const usesVercelSandbox =
  process.env.BLOOM_RUNTIME === "vercel" ||
  (process.env.BLOOM_RUNTIME !== "docker" && process.env.VERCEL === "1");
