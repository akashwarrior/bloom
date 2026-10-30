export function assertForegroundCommand(executable: string, args: string[]) {
  const normalized = [executable, ...args].join(" ").toLowerCase();
  if (
    /(?:^|\s)(?:dev|start|serve)(?:\s|$)/.test(normalized) ||
    args.some((arg) => /^(?:--watch|--watchall|--ui)$/i.test(arg))
  ) {
    throw new Error(
      "Persistent development servers and watch modes are not allowed; webScrape owns preview startup",
    );
  }

  if (
    executable === "pnpm" &&
    ["install", "i"].includes(args[0] ?? "") &&
    typeof args[1] === "string" &&
    !args[1].startsWith("-")
  ) {
    throw new Error(
      "Use `pnpm add <package>` to add dependencies; `pnpm install` accepts no package names",
    );
  }

  const isShadcnAdd =
    executable === "pnpm" &&
    args.some((arg) => arg.includes("shadcn")) &&
    args.includes("add");
  if (!isShadcnAdd) return;

  const hasYes = args.some((arg) => arg === "--yes" || arg === "-y");
  if (!hasYes) {
    throw new Error(
      "shadcn add requires `--yes` in this non-interactive runtime (e.g. `pnpm exec shadcn add button --yes`); without it the command hangs on a confirmation prompt until timeout",
    );
  }

  const hasAll = args.some((arg) => arg === "--all" || arg === "-a");
  if (hasAll && !args.includes("--dry-run")) {
    throw new Error(
      "shadcn add --all without `--overwrite` hangs on per-file overwrite prompts for existing components; use `pnpm exec shadcn add --all --yes --overwrite` only for a fresh scaffold, or add missing components by name",
    );
  }
}
