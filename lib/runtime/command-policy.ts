export function assertForegroundCommand(executable: string, args: string[]) {
  // Only the words that name the command count; the body of an inline script (`node -e "..."`) is data.
  const inlineScript = executable === "node" && /^(?:-e|--eval|-p|--print)$/.test(args[0] ?? "");
  const command = inlineScript ? [] : args.filter((arg) => !arg.startsWith("-") && !/\s/.test(arg)).slice(0, 4);
  if (
    command.some((word) => /^(?:dev|start|serve)$/i.test(word)) ||
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
}
