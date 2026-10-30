import { LINK_RESET, STYLESHEET_IMPORTS } from "../../ai/design/ui-sdk-theme.ts";

/** What a new project is made of: plain Next.js with Tailwind, and ui-sdk for controls. */
export const UI_SDK_VERSION = "0.1.0-beta.13";
/** The Tailwind release create-next-app installs; its PostCSS plugin has to match it. */
const TAILWIND_VERSION = "4.3.3";

export const CREATE_PROJECT_ARGS = (name: string) => [
  "dlx", "create-next-app@16.4.6", name,
  "--ts", "--tailwind", "--eslint", "--app", "--no-src-dir", "--import-alias", "@/*", "--use-pnpm", "--disable-git", "--yes",
];

/**
 * pnpm commands run in the fresh scaffold, in order. Tailwind runs as the
 * PostCSS plugin Next.js documents: with create-next-app's Turbopack loader the
 * dev server keeps serving the previous `app/globals.css` after it is rewritten,
 * so a redesign rendered in the old design's tokens.
 */
export const PROJECT_DEPENDENCY_STEPS = [
  ["remove", "@tailwindcss/turbopack"],
  ["add", "-D", `@tailwindcss/postcss@${TAILWIND_VERSION}`],
  ["add", `@ui-sdk/react@${UI_SDK_VERSION}`, `@ui-sdk/core@${UI_SDK_VERSION}`, "clsx", "tailwind-merge", "lucide-react"],
];

const NEXT_CONFIG = `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
`;

const POSTCSS_CONFIG = `const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
`;

const GLOBALS_CSS = `${[
  ...STYLESHEET_IMPORTS,
  "",
  ":root {",
  "  color-scheme: light;",
  "  --background: #FFFFFF;",
  "  --foreground: #171717;",
  "}",
  "",
  "@theme inline {",
  "  --color-background: var(--background);",
  "  --color-foreground: var(--foreground);",
  "}",
  "",
  "body {",
  "  background: var(--background);",
  "  color: var(--foreground);",
  "}",
  "",
  ...LINK_RESET,
].join("\n")}\n`;

const LAYOUT = `import "./globals.css"

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="antialiased">
      <body>{children}</body>
    </html>
  )
}
`;

/** Shown until the first build replaces it, so an empty project does not look like a broken preview. */
const PAGE = `export default function Page() {
  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, font: "14px/1.5 system-ui, sans-serif", color: "#737373" }}>
      <p>This project is empty. Its first page will appear here.</p>
    </main>
  )
}
`;

const UTILS = `import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
`;

/** Files written over create-next-app's output, so a project starts empty instead of with the starter page. */
export const PROJECT_TEMPLATE_FILES = [
  { path: "next.config.ts", content: NEXT_CONFIG },
  { path: "postcss.config.mjs", content: POSTCSS_CONFIG },
  { path: "app/globals.css", content: GLOBALS_CSS },
  { path: "app/layout.tsx", content: LAYOUT },
  { path: "app/page.tsx", content: PAGE },
  { path: "lib/utils.ts", content: UTILS },
];

/** Starter files create-next-app adds that a project never uses. */
export const PROJECT_TEMPLATE_REMOVED = ["app/favicon.ico", "public/file.svg", "public/globe.svg", "public/next.svg", "public/vercel.svg", "public/window.svg"];

/** Everything that decides what the scaffold contains; a prepared runtime image is only valid for the same value. */
export const PROJECT_TEMPLATE_SIGNATURE = JSON.stringify([CREATE_PROJECT_ARGS(""), PROJECT_DEPENDENCY_STEPS, PROJECT_TEMPLATE_FILES, PROJECT_TEMPLATE_REMOVED]);
