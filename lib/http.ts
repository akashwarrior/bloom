export async function ensureResponseOk(response: Response, fallback: string) {
  if (response.ok) return;

  const body: unknown = await response.json().catch(() => null);
  const message =
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof body.error === "string" &&
    body.error.trim()
      ? body.error
      : fallback;

  throw Object.assign(new Error(message), { status: response.status });
}

export async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  await ensureResponseOk(response, fallback);
  return response.json() as Promise<T>;
}
