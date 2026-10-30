export type RuntimeFile = {
  path: string;
  content: string;
};

export type RuntimeBinaryFile = RuntimeFile & {
  encoding: "base64";
};

export const RUNTIME_EXECUTABLES = ["pnpm", "node"] as const;

export type RuntimeCommandInput = {
  executable: (typeof RUNTIME_EXECUTABLES)[number];
  args: string[];
  cwd: string;
  timeoutMs: number;
};

export type RuntimeDiagnostic = {
  source: "runtime" | "preview";
  level: "error" | "warning" | "info";
  message: string;
  timestamp: number;
};

type RuntimeStatus =
  | "idle"
  | "preparing"
  | "installing"
  | "starting"
  | "ready"
  | "error";

export type RuntimeState = {
  status: RuntimeStatus;
  previewUrl: string | null;
  revisionId: string | null;
  logs: string[];
  diagnostics: RuntimeDiagnostic[];
  error: string | null;
};

export type RuntimeWorkspace = {
  projectId: string;
  revisionId: string | null;
  files: RuntimeFile[];
  assets?: RuntimeBinaryFile[];
};
