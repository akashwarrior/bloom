import "server-only";

import Exa from "exa-js";

// Server-only Exa singleton. Reads EXA_API_KEY from the environment
// (exa-js default). Never expose to the client, never log the key.
let cached: Exa | null = null;

export function getExaClient(): Exa {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) {
    throw new Error(
      "EXA_API_KEY is not set. Get a key from https://dashboard.exa.ai/ and set EXA_API_KEY in .env.local.",
    );
  }
  cached ??= new Exa(apiKey);
  return cached;
}
