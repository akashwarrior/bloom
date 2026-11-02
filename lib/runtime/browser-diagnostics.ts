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
