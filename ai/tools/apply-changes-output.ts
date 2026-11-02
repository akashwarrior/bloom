import {
  parseTypeScriptErrorLocations,
  typeScriptErrorTextFor,
  type TypeScriptValidationDiagnostic,
  type TypeScriptValidationReport,
} from "../../lib/runtime/typecheck-diagnostics.ts";

type AppliedFile = {
  path: string;
  operation: "created" | "edited" | "deleted" | "moved";
  addedLines: number;
  deletedLines: number;
};

type AppliedContent = {
  path: string;
  after: string | null;
};

type ApplyChangesFile = {
  path: string;
  status: "success" | "error";
  addedLines?: number;
  deletedLines?: number;
  totalLines?: number;
  validation?: TypeScriptValidationReport;
  tscError?: string;
};

/**
 * One result per changed file. Validation and diagnostics are attached only
 * where they help the model repair the change: per file when tsc named that
 * file, on the first file when the failure has no usable location.
 */
export function buildApplyChangesFiles(
  applied: AppliedFile[],
  contents: AppliedContent[],
  diagnostic: TypeScriptValidationDiagnostic,
): ApplyChangesFile[] {
  const { validation, tscError: fullTscError } = diagnostic;
  const showValidation =
    validation.status !== "passed" && validation.status !== "skipped";
  const afterByPath = new Map(
    contents.map((content) => [content.path, content.after]),
  );
  const errorLinesByPath = new Map<string, number[]>();
  for (const location of parseTypeScriptErrorLocations(fullTscError)) {
    const lines = errorLinesByPath.get(location.path) ?? [];
    lines.push(location.line);
    errorLinesByPath.set(location.path, lines);
  }

  const files: ApplyChangesFile[] = applied.map((file) => {
    const after = afterByPath.get(file.path) ?? null;
    const output: ApplyChangesFile = {
      path: file.path,
      status: "success",
      ...(file.operation === "created"
        ? { addedLines: file.addedLines }
        : file.operation === "deleted"
          ? { deletedLines: file.deletedLines }
          : {
            addedLines: file.addedLines,
            deletedLines: file.deletedLines,
          }),
      ...(after === null
        ? {}
        : { totalLines: after.split("\n").length }),
    };
    if (!showValidation) return output;

    const errorLines = errorLinesByPath.get(file.path) ?? [];
    if (validation.status === "failed" && errorLines.length > 0) {
      const tscError = typeScriptErrorTextFor(fullTscError, file.path);
      return {
        ...output,
        validation,
        ...(tscError ? { tscError } : {}),
      };
    }
    return output;
  });

  const changedFileHasErrors = files.some(
    (file) => (errorLinesByPath.get(file.path)?.length ?? 0) > 0,
  );
  if (
    showValidation &&
    (validation.status !== "failed" || !changedFileHasErrors)
  ) {
    const first = files[0];
    if (first) {
      first.validation = validation;
      if (fullTscError) first.tscError = fullTscError;
    }
  }

  return files;
}
