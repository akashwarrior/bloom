const SOURCE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?|css|scss|html|mdx)$/i;

function malformedEscapingReason(source: string) {
  if (/^\s*\\["']use (?:client|server)\\["'];?/m.test(source)) {
    return "a source directive has literal backslashes before its quotes";
  }

  if (/\b(?:from|import)\s+\\["']/.test(source)) {
    return "an import has literal backslashes before its quotes";
  }

  // Catch an import statement wrapped in literal quotes, e.g.
  //   "import React, { useState } from 'react'";
  // The model emitted the source as a JSON string literal rather than raw
  // source text. This turns the import into a no-op expression, producing
  // confusing "Cannot find name" errors downstream.
  if (/^\s*["']import\s/m.test(source)) {
    return "an import statement is wrapped in literal quotes";
  }

  const escapedJsxAttributes = source.match(
    /\b(?:className|href|src|id|type|role|aria-[a-z-]+)=\\["']/g,
  )?.length ?? 0;
  if (escapedJsxAttributes >= 2) {
    return `${escapedJsxAttributes} JSX attributes have literal backslashes before their quotes`;
  }

  return null;
}

export type SourceTextCandidate = {
  path: string;
  text: string;
};

export function validateSourceTextEscaping(
  candidates: readonly SourceTextCandidate[],
) {
  const failures = candidates.flatMap(({ path, text }) => {
    if (!SOURCE_FILE_PATTERN.test(path)) return [];
    const reason = malformedEscapingReason(text);
    return reason ? [`${path}: ${reason}`] : [];
  });

  if (failures.length > 0) {
    throw new Error(
      `Malformed source escaping detected. ${failures.join("; ")}. Tool strings are already JSON-decoded; use normal source quotes and real newlines.`,
    );
  }
}
