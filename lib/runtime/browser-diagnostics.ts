export type BrowserDiagnostic = {
  kind: "console" | "runtime" | "request-failed" | "http";
  severity: "error";
  message: string;
  url?: string;
  status?: number;
};

export function compactDiagnosticMessage(value: string, limit = 800) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

export function sanitizeDiagnosticUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().slice(0, 500);
  } catch {
    return value.split(/[?#]/, 1)[0]!.slice(0, 500);
  }
}

export function browserDiagnosticKey(diagnostic: BrowserDiagnostic) {
  return [
    diagnostic.kind,
    diagnostic.status ?? "",
    diagnostic.url ?? "",
    diagnostic.message,
  ].join(":");
}

/**
 * HMR transport noise is specific to the development preview: the generated
 * project runs behind a published Docker port, so Next.js can reject the
 * websocket handshake even though the rendered page is healthy. It says
 * nothing about the design and must not block a build.
 */
export function isDevHmrDiagnostic(
  diagnostic: Pick<BrowserDiagnostic, "message" | "url">,
) {
  return /\/_next\/(?:webpack-)?hmr\b/.test(
    `${diagnostic.url ?? ""} ${diagnostic.message}`,
  );
}
